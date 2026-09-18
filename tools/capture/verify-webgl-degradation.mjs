#!/usr/bin/env node
/**
 * #7 · WebGL 静默降级 · 取证驱动（T6 + T7）—— 设计说明书 `docs/design/007-webgl-degradation.md` §4。
 *
 * **这台 lens 要证明的四件事**（§4.1）：
 *   ① 降级确实生效；② **不依赖公共页调试开关**；③ 无未捕获异常；
 *   ④ 降级页是「**有内容地暗**」—— 非死黑、非白屏报错页。
 *
 * 两条路径（§4.2 选定 A 主 + B 辅，均**零应用钩子**）：
 *   · **A · 真能力剥夺**：启动参数 `--disable-webgl --disable-webgl2 --disable-3d-apis`
 *     （不给 SwiftShader 兜底）⇒ 公共页**真**的没有 WebGL ⇒ 该走静默层。
 *   · **B · 运行中丢失**：正常加载后，`page.evaluate` 取 canvas 调标准扩展
 *     `WEBGL_lose_context.loseContext()` ⇒ 覆盖 `webglcontextlost` 分支。
 *
 * 关于 §4.3 第 7 条的字面口径 —— 设计写的是「触发丢失后渲染循环停止（cancelAnimationFrame）」。
 * 但我们**没有** cancelAnimationFrame：#4 单一包络不变量（§2.2，硬约束）要求降级只**停画**、
 * **不停时钟**（时间轴 / 字幕 / 音频必须继续）。故本取证把该条落成可机械判据的**两个计数**：
 *   · GL draw call 计数 **冻结** ⇒ 渲染（出画）确实停了；
 *   · rAF 计数 **仍在涨**      ⇒ 时钟未停（#4 不变量成立）。
 * 二者同时成立，才是本仓要的降级语义。此偏差已在回报中明示。
 *
 * ⚠️ 与 `npm run capture` 必须**串行**（并发软栅格会 OOM/SIGKILL）。
 * ⚠️ **不入 `npm test`**（需浏览器），是独立取证工具，别名 `npm run verify:degrade`。
 * ⚠️ PNG 不进版本库（见 .gitignore）；probe.json / console 日志进。
 *
 * 运行：
 *   node tools/capture/verify-webgl-degradation.mjs
 *   node tools/capture/verify-webgl-degradation.mjs --skip-build   （复用现有 dist）
 *   node tools/capture/verify-webgl-degradation.mjs --self-test    （注入违规，证明门禁会判红）
 *   PW_NODE_MODULES=<dir with node_modules/playwright> 可换 playwright 来源
 *   VERIFY_PORT=4400 可固定端口
 */
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { analyze } from './lib/png-probe.mjs';
import { loadWordLists } from '../../scripts/lib/public-ui-tree.mjs';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(ROOT, 'artifacts/capture/degraded');
const PORT = Number(process.env.VERIFY_PORT || (4400 + Math.floor(Math.random() * 300)));
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.argv.includes('--skip-build');
const SELF_TEST = process.argv.includes('--self-test');

/** A 路径：真的不给 WebGL（连软栅格兜底也不给）。 */
const ARGS_NO_WEBGL = ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'];
/** B 路径：正常软栅格（⇒ degraded 档，仍出画），用于随后触发运行时上下文丢失。 */
const ARGS_SOFTWARE = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/** §2.3 文案三联（主理人裁定）—— 降级页必须在场的锚点。 */
const VEIL_LINES = ['坛不设形，声自往还。', '此刻唯余字与音。', '静听即可。'];

/** 暗场区间上限（Rec.709 平均亮度 0..255）。 */
const DARK_MEAN_LUM_MAX = 40;
/** 白屏判据：亮像素占比超过该值即视为「整屏白」（报错页/白屏）。 */
const WHITE_RATIO_MAX = 0.5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function loadPlaywright() {
  const dirs = [process.env.PW_NODE_MODULES, '/Users/ben/.workbuddy/binaries/node/workspace/node_modules'].filter(Boolean);
  for (const d of dirs) {
    try { return require(join(d, 'playwright')); } catch { /* try next */ }
  }
  try { return require('playwright'); } catch { /* fallthrough */ }
  throw new Error('未找到 playwright：设 PW_NODE_MODULES=<dir with node_modules/playwright>');
}

async function waitForServer(url, timeoutMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status >= 200 && res.status < 500) return true;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  return false;
}

/**
 * 页面侧探针计数器（**测试侧**注入，绝不进产物）。
 * 只数**调用次数**，不改任何行为 —— 用来把「停画 / 不停时钟」变成可判据的整数。
 */
function installProbes() {
  const st = { draw: 0, raf: 0 };
  window.__veilProbe = st;
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const orig = proto[fn];
      if (typeof orig !== 'function') continue;
      proto[fn] = function patched(...args) { window.__veilProbe.draw++; return orig.apply(this, args); };
    }
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function patched(cb) { window.__veilProbe.raf++; return raf(cb); };
}

/** DOM / 文本 / window 面的主扫描（词义同 `qa-audit-public-entry.mjs` 的 pageScanner）。 */
function domScan(words) {
  const pathOf = (el) => {
    let p = el.tagName.toLowerCase();
    if (el.id) p += '#' + el.id;
    if (el.classList && el.classList.length) p += '.' + Array.from(el.classList).join('.');
    return p;
  };
  const all = Array.from(document.querySelectorAll('*'));
  const hits = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    for (const el of all) {
      for (const a of Array.from(el.attributes)) {
        if (a.value && String(a.value).toLowerCase().includes(lw)) {
          hits.push({ word: w, where: `[属性] ${pathOf(el)}[${a.name}]`, snippet: String(a.value).slice(0, 90) });
        }
      }
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3) {
          const txt = node.textContent || '';
          if (txt.toLowerCase().includes(lw)) {
            hits.push({ word: w, where: `[文本] ${pathOf(el)}`, snippet: txt.trim().slice(0, 90) });
          }
        }
      }
    }
    hits.push(...Object.keys(window).filter((k) => k.toLowerCase().includes(lw))
      .map((k) => ({ word: w, where: '[window]', snippet: k })));
  }
  return hits;
}

/** 结果 → 断言。**纯函数**：`--self-test` 用同一函数驱动注入违规，证明门禁有牙。 */
function evaluateGate(r) {
  const fmt = (arr) => (arr.length ? arr.join(', ') : '0');
  const checks = [
    { id: 'A1.pageerror-zero', desc: 'A 路径：无未捕获异常（pageerror = 0）',
      ok: r.a.errors.pageerror === 0, detail: `pageerror=${r.a.errors.pageerror}` },
    { id: 'A2.console-error-zero', desc: 'A 路径：console error = 0',
      ok: r.a.errors.consoleError === 0, detail: `console.error=${r.a.errors.consoleError}` },
    { id: 'A3.veil-present', desc: 'A 路径：静默层在场（三句锚文本齐全）',
      ok: r.a.missingLines.length === 0 && r.a.hasVeil,
      detail: `hasVeil=${r.a.hasVeil} 缺: ${r.a.missingLines.join('|') || '（无）'}` },
    { id: 'A4.no-canvas', desc: 'A 路径：无 WebGL 画布（不建 3D）',
      ok: r.a.hasCanvas === false, detail: `canvas=${r.a.hasCanvas}` },
    { id: 'A5.caption-kept', desc: 'A 路径：雾中字幕仍在（有字幕）',
      ok: r.a.hasCaption === true, detail: `caption=${r.a.hasCaption}` },
    { id: 'A6.no-interactive', desc: 'A 路径：零交互控件（无按钮/输入）',
      ok: r.a.interactive === 0, detail: `控件=${r.a.interactive}` },
    { id: 'A7.dom-words-zero', desc: 'A 路径：DOM/文本/window 敏感词命中 = 0（含静默层文案）',
      ok: r.a.wordHits.length === 0, detail: `命中: ${fmt([...new Set(r.a.wordHits.map((h) => h.word))])}` },
    { id: 'A8.window-clean', desc: 'A 路径：无公共句柄 __altar/__capture，且无降级调试开关 __degrade/__webglTier',
      ok: !r.a.pollution.__altar && !r.a.pollution.__capture && !r.a.pollution.__degrade && !r.a.pollution.__webglTier,
      detail: `__altar=${r.a.pollution.__altar} __capture=${r.a.pollution.__capture} __degrade=${r.a.pollution.__degrade} __webglTier=${r.a.pollution.__webglTier}` },
    { id: 'A9.no-url-switch', desc: 'A 路径：未使用任何 URL 开关（search/hash 皆非开关）',
      ok: r.a.search === '' && !/webgl|degrade/i.test(r.a.hash),
      detail: `search="${r.a.search}" hash="${r.a.hash}"` },
    { id: 'A10.dark-with-content', desc: 'A 路径：有内容地暗（nonBlack>0 且 meanLum<40 且非白屏）',
      ok: r.a.probe.nonBlackRatio > 0 && r.a.probe.meanLum < DARK_MEAN_LUM_MAX
        && r.a.probe.brightPixels > 0 && r.a.probe.brightPixels / r.a.probe.totalPixels < WHITE_RATIO_MAX,
      detail: `nonBlackRatio=${r.a.probe.nonBlackRatio.toFixed(5)} meanLum=${r.a.probe.meanLum.toFixed(2)} bright=${r.a.probe.brightPixels}` },
    { id: 'B1.before-has-canvas', desc: 'B 路径：丢失前正常出画（canvas 在场）',
      ok: r.b.beforeHasCanvas === true, detail: `canvas=${r.b.beforeHasCanvas}` },
    { id: 'B2.console-error-zero', desc: 'B 路径：console error = 0（含丢失瞬间）',
      ok: r.b.errors.consoleError === 0, detail: `console.error=${r.b.errors.consoleError}` },
    { id: 'B3.pageerror-zero', desc: 'B 路径：无未捕获异常（含丢失瞬间）',
      ok: r.b.errors.pageerror === 0, detail: `pageerror=${r.b.errors.pageerror}` },
    { id: 'B4.draw-frozen', desc: 'B 路径：丢失后**停画**（GL draw call 计数冻结）',
      ok: r.b.drawAfter === r.b.drawAtLoss, detail: `丢时=${r.b.drawAtLoss} 丢后=${r.b.drawAfter}` },
    { id: 'B5.clock-alive', desc: 'B 路径：丢失后**时钟未停**（rAF 仍在涨 ⇒ #4 单时间轴不变量）',
      ok: r.b.rafAfter > r.b.rafAtLoss, detail: `丢时=${r.b.rafAtLoss} 丢后=${r.b.rafAfter}` },
    { id: 'B6.veil-swapped', desc: 'B 路径：丢失后换静默层',
      ok: r.b.hasVeil === true, detail: `hasVeil=${r.b.hasVeil}` },
    { id: 'B7.caption-kept', desc: 'B 路径：丢失后雾中字幕仍在',
      ok: r.b.hasCaption === true, detail: `caption=${r.b.hasCaption}` },
    { id: 'B8.no-url-switch', desc: 'B 路径：靠标准扩展触发，未用任何 URL/页面开关',
      ok: r.b.search === '' && !/webgl|degrade/i.test(r.b.hash), detail: `search="${r.b.search}" hash="${r.b.hash}"` },
    { id: 'B9.dark-with-content', desc: 'B 路径：换层后仍「有内容地暗」',
      ok: r.b.probe.nonBlackRatio > 0 && r.b.probe.meanLum < DARK_MEAN_LUM_MAX
        && r.b.probe.brightPixels / r.b.probe.totalPixels < WHITE_RATIO_MAX,
      detail: `nonBlackRatio=${r.b.probe.nonBlackRatio.toFixed(5)} meanLum=${r.b.probe.meanLum.toFixed(2)}` }
  ];
  const failures = checks.filter((c) => !c.ok);
  return { pass: failures.length === 0, checks, failures };
}

const snapshot = (page) => page.evaluate(() => ({
  hasVeil: !!document.querySelector('.ritual-veil'),
  hasCanvas: !!document.querySelector('#root canvas'),
  hasCaption: !!document.querySelector('.ritual-caption'),
  interactive: document.querySelectorAll('button,input,select,textarea').length,
  innerText: document.body ? document.body.innerText : '',
  search: window.location.search,
  hash: window.location.hash,
  pollution: {
    __altar: typeof window.__altar !== 'undefined',
    __capture: typeof window.__capture !== 'undefined',
    __degrade: typeof window.__degrade !== 'undefined',
    __webglTier: typeof window.__webglTier !== 'undefined'
  },
  probe: window.__veilProbe ? { ...window.__veilProbe } : null
}));

async function shoot(page, file) {
  const buf = await page.screenshot({ type: 'png' });
  writeFileSync(resolve(OUT_DIR, file), buf);
  return { file, bytes: buf.length, sha256: sha256(buf), ...analyze(buf) };
}

async function runPathA(chromium, words) {
  const errors = { pageerror: 0, consoleError: 0, samples: [] };
  const browser = await chromium.launch({ args: ARGS_NO_WEBGL });
  let probe;
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on('pageerror', (e) => { errors.pageerror++; errors.samples.push('pageerror: ' + String(e?.message ?? e)); });
    page.on('console', (m) => { if (m.type() === 'error') { errors.consoleError++; errors.samples.push('console.error: ' + m.text()); } });
    await page.addInitScript(installProbes);
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.waitForTimeout(2000); // 渐入动画走完再截图，避免抓到全透明帧
    const snap = await snapshot(page);
    const wordHits = await page.evaluate(domScan, words);

    // 时钟必须仍活着（无画档也不能停摆 —— #4 不变量）
    const clock0 = snap.probe?.raf ?? 0;
    await page.waitForTimeout(1500);
    const clock1 = (await snapshot(page)).probe?.raf ?? 0;

    probe = await shoot(page, 'degrade-01-nowebgl.png');
    return {
      ...snap,
      errors,
      wordHits,
      missingLines: VEIL_LINES.filter((line) => !snap.innerText.includes(line)),
      clockAdvanced: clock1 > clock0,
      clock0, clock1,
      probe
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runPathB(chromium) {
  const errors = { pageerror: 0, consoleError: 0, samples: [] };
  const browser = await chromium.launch({ args: ARGS_SOFTWARE });
  let probe;
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on('pageerror', (e) => { errors.pageerror++; errors.samples.push('pageerror: ' + String(e?.message ?? e)); });
    page.on('console', (m) => { if (m.type() === 'error') { errors.consoleError++; errors.samples.push('console.error: ' + m.text()); } });
    await page.addInitScript(installProbes);
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000); // 软栅格慢，给它把首帧渲出来

    const before = await snapshot(page);
    const beforeHasCanvas = before.hasCanvas;
    const beforeVeil = before.hasVeil;

    // 标准扩展致盲：**不需要**页面提供任何钩子。
    const lost = await page.evaluate(() => {
      const canvas = document.querySelector('#root canvas');
      if (!canvas) return { ok: false, why: '无 canvas 可致盲' };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { ok: false, why: '拿不到 GL 上下文' };
      const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return { ok: false, why: '无 WEBGL_lose_context 扩展' };
      ext.loseContext();
      return { ok: true };
    });
    await page.waitForTimeout(1500);
    const atLoss = await snapshot(page);
    await page.waitForTimeout(2500);
    const after = await snapshot(page);
    probe = await shoot(page, 'degrade-02-contextlost.png');
    return {
      beforeHasCanvas,
      beforeVeil,
      lost,
      hasVeil: after.hasVeil,
      hasCaption: after.hasCaption,
      interactive: after.interactive,
      drawAtLoss: atLoss.probe?.draw ?? 0,
      drawAfter: after.probe?.draw ?? 0,
      rafAtLoss: atLoss.probe?.raf ?? 0,
      rafAfter: after.probe?.raf ?? 0,
      search: after.search,
      hash: after.hash,
      pollution: after.pollution,
      innerText: after.innerText,
      errors,
      probe
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  console.log(`\n══ #7 WebGL 静默降级取证 · HEAD ${head.slice(0, 7)} ══`);
  mkdirSync(OUT_DIR, { recursive: true });

  if (!SKIP_BUILD) {
    console.log('[1] npm run build …');
    spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  } else if (!existsSync(resolve(ROOT, 'dist/index.html'))) {
    throw new Error('dist/index.html 不存在，且指定了 --skip-build');
  }

  const viteBin = resolve(ROOT, 'node_modules/.bin/vite');
  console.log(`[2] vite preview @ ${BASE}（指本地产物）…`);
  const server = spawn(viteBin, ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
  const killServer = () => { try { server.kill('SIGTERM'); } catch { /* noop */ } };
  process.on('exit', killServer);

  let gatePass = true;
  let selfTest = null;
  try {
    if (!await waitForServer(`${BASE}/`)) throw new Error('vite preview 未在超时内就绪');
    console.log('    server up ✓');

    const { chromium } = loadPlaywright();
    const words = loadWordLists().flatMap((l) => l.words);

    console.log(`[3] A 路径：真能力剥夺 ${ARGS_NO_WEBGL.join(' ')} …`);
    const a = await runPathA(chromium, words);
    console.log(`    canvas=${a.hasCanvas} veil=${a.hasVeil} caption=${a.hasCaption} 控件=${a.interactive} ` +
      `异常=${a.errors.pageerror}/${a.errors.consoleError} 时钟推进=${a.clockAdvanced}(${a.clock0}→${a.clock1})`);

    console.log('[4] B 路径：运行中上下文丢失（WEBGL_lose_context）…');
    const b = await runPathB(chromium);
    console.log(`    致盲=${b.lost.ok}${b.lost.why ? '(' + b.lost.why + ')' : ''} 丢前canvas=${b.beforeHasCanvas} ` +
      `丢后veil=${b.hasVeil} draw ${b.drawAtLoss}→${b.drawAfter} raf ${b.rafAtLoss}→${b.rafAfter}`);

    const results = { a, b };
    const gate = evaluateGate(results);
    gatePass = gate.pass;

    if (SELF_TEST) {
      // 注入违规 → 同一门禁函数必须判红（否则所谓「取证」只是一份漂亮的报告）
      const injected = {
        a: { ...a, hasCanvas: true, missingLines: [VEIL_LINES[0]], wordHits: [{ word: 'topology' }], pollution: { ...a.pollution, __degrade: true } },
        b: { ...b, drawAfter: b.drawAtLoss + 99, rafAfter: b.rafAtLoss, hasVeil: false }
      };
      const red = evaluateGate(injected);
      selfTest = { wentRed: !red.pass, failures: red.failures.map((f) => f.id) };
      writeFileSync(resolve(OUT_DIR, 'degrade-gate-selftest-red.txt'), [
        '# #7 降级取证 · 负样本自检（--self-test）：注入违规 → 门禁应判红',
        `- HEAD: ${head}`,
        `- 注入：A 恢复 canvas / 抽掉锚文本 / 注入词 topology / 注入 __degrade；B draw 未冻结 / raf 未涨 / 未换层`,
        `- 期望：门禁判红（exit 1）`,
        `- 实测：${red.pass ? '❌ 未判红（门禁无牙，FAIL）' : '✓ 已判红（PASS）'}`,
        `- 触发失败断言（${red.failures.length} 项）：`,
        ...red.failures.map((f) => `    ✗ [${f.id}] ${f.desc} — ${f.detail}`),
        ''
      ].join('\n'));
    }

    // 文本/JSON 证据（PNG 已被 .gitignore 排除）
    const report = {
      generatedAt: new Date().toISOString(),
      head,
      baseUrl: BASE,
      pathA: { launchArgs: ARGS_NO_WEBGL, ...a, wordHitCount: a.wordHits.length, wordHits: a.wordHits.slice(0, 20) },
      pathB: { launchArgs: ARGS_SOFTWARE, ...b },
      gate: { pass: gate.pass, checks: gate.checks, selfTest }
    };
    writeFileSync(resolve(OUT_DIR, 'probe.json'), JSON.stringify(report, null, 2));
    writeFileSync(resolve(OUT_DIR, 'console.log.txt'),
      ['# A 路径异常样本', ...a.errors.samples, '', '# B 路径异常样本', ...b.errors.samples, ''].join('\n'));

    console.log('\n──── 亮度探针（Rec.709； nonBlack=任一分量≥8, bright=lum≥32）────');
    for (const [name, p] of [['A · 无画', a.probe], ['B · 丢后', b.probe]]) {
      console.log(`  ${name}: nonBlackRatio=${p.nonBlackRatio.toFixed(5)} meanLum=${p.meanLum.toFixed(2)} ` +
        `brightPixels=${p.brightPixels}/${p.totalPixels} bytes=${p.bytes} sha256=${p.sha256.slice(0, 16)}…`);
    }

    console.log(`\n──── 硬断言（${gate.checks.length} 项）────`);
    for (const c of gate.checks) console.log(`  ${c.ok ? '✓' : '✗'} [${c.id}] ${c.desc} — ${c.detail}`);
    console.log(gate.pass ? '✅ 降级取证 PASS' : `❌ 降级取证 FAIL：${gate.failures.length} 项`);
    if (SELF_TEST) {
      console.log(`负样本自检：注入违规后 ${selfTest.wentRed ? '已判红 ✓（门禁有牙）' : '未判红 ❌'}；` +
        `红灯留档 artifacts/capture/degraded/degrade-gate-selftest-red.txt`);
    }
    console.log(`证据写入: ${OUT_DIR}/probe.json · console.log.txt · degrade-0{1,2}-*.png`);
  } finally {
    killServer();
  }

  if (SELF_TEST) {
    console.error(selfTest?.wentRed
      ? '\n【负样本自检】注入违规 → 门禁判红 → process.exit(1)  ← 期望红灯，非真实回归'
      : '\n【负样本自检】注入违规后门禁未判红 → 门禁无牙 → process.exit(1)');
    process.exit(1);
  }
  if (!gatePass) {
    console.error(`\n❌ 降级取证判红：${gate.checks.filter((c) => !c.ok).length} 项不满足 → process.exit(1)`);
    process.exit(1);
  }
  console.log('\n完成。');
}

main().catch((e) => { console.error('VERIFY_FAIL:', e?.stack ?? e); process.exit(1); });
