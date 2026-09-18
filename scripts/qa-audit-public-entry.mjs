// 与 npm run capture 必须串行执行（并发软光栅会 OOM/SIGKILL）；本脚本已支持 AUDIT_PORT 固定端口
/**
 * · QA 独立浏览器审查（严过关）· Gitea #5 公共/工程入口隔离 —— 只读，不改 src
 *
 * 用途：#5「入口隔离」的**前后对比**工具。本脚本本轮先跑出「现状基线」，
 * 工程师 #5 落地后用**同一条命令**复跑，前后差异本身即 #5 证据。
 *
 * 做的事：
 *   1. `npm run build` → `vite preview` 指**本地产物**（不测线上，避免 CDN 缓存干扰）
 *   2. Playwright 无头（SwiftShader）打开公共页 `#/`：dump outerHTML / innerText /
 *      Object.keys(window)，对工程词逐词给出**命中定位**（tag#id.class + 片段）
 *   3. 公共页 window 污染检查：不得定义 window.__altar / window.__capture
 *   4. `#/director` 门禁：无 localStorage `altar.director.confirmed` **不得进入**导演台；
 *      写入后**可达**。给出两态 DOM 差异
 *   5. 落盘 artifacts/audit/audit-public-entry.{json,txt}（文本/json；不产 png）
 *
 * 运行：node scripts/qa-audit-public-entry.mjs            （含 build）
 *      node scripts/qa-audit-public-entry.mjs --skip-build （复用现有 dist）
 */
import { createRequire } from 'node:module';
import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'artifacts/audit');
const PORT = Number(process.env.AUDIT_PORT || (4200 + Math.floor(Math.random() * 500)));
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.argv.includes('--skip-build');
const LABEL = (() => { const i = process.argv.indexOf('--label'); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : ''; })();
const SUFFIX = LABEL ? `-${LABEL}` : '';
const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

// 工程泄露扫描词（#5 验收口径）—— DOM/文本/window 面
const SCAN_WORDS = ['topology', 'ulam', '49', '91', 'rapier', 'camera', 'debug', 'speed', '倍速', 'playback'];

// bundle 面：公共页**实际下发**的 JS 里是否夹带「导演 / 工程入口」代码。
// 用精确工程标记（避免 three.js 通用词 noise）；`rapier` 作为阴性对照（死依赖，应 0）。
const BUNDLE_MARKERS = [
  'altar.director.confirmed', '我已知晓，进入', '导演 / 认证台', '前端伪认证',
  '12-TET', 'chromatic_descent', '大衍之数五十', 'DirectorApp', '断代', 'rapier'
];

function loadPlaywright() {
  const dirs = [process.env.PW_NODE_MODULES, '/Users/ben/.workbuddy/binaries/node/workspace/node_modules'].filter(Boolean);
  for (const d of dirs) {
    try { return require(join(d, 'playwright')); } catch { /* try next */ }
  }
  try { return require('playwright'); } catch { /* fallthrough */ }
  throw new Error('未找到 playwright：设 PW_NODE_MODULES=<dir with node_modules/playwright>');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// 在页面里运行的扫描器（序列化进 evaluate）
function pageScanner(words) {
  const pathOf = (el) => {
    let p = el.tagName.toLowerCase();
    if (el.id) p += '#' + el.id;
    if (el.classList && el.classList.length) p += '.' + Array.from(el.classList).join('.');
    return p;
  };
  const all = Array.from(document.querySelectorAll('*'));
  const scan = {};
  for (const w of words) {
    const lw = w.toLowerCase();
    const textHits = [], attrHits = [];
    for (const el of all) {
      for (const a of Array.from(el.attributes)) {
        if (a.value && a.value.toLowerCase().includes(lw) && attrHits.length < 10) {
          attrHits.push({ path: pathOf(el), attr: a.name, snippet: String(a.value).slice(0, 90) });
        }
      }
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3) {
          const txt = node.textContent || '';
          if (txt.toLowerCase().includes(lw) && textHits.length < 10) {
            textHits.push({ path: pathOf(el), snippet: txt.trim().slice(0, 110) });
          }
        }
      }
    }
    const windowHits = Object.keys(window).filter((k) => k.toLowerCase().includes(lw));
    scan[w] = { textHits, attrHits, windowHits, count: textHits.length + attrHits.length + windowHits.length };
  }
  return {
    scan,
    windowKeys: Object.keys(window),
    pollution: {
      __altar: typeof window.__altar !== 'undefined',
      __capture: typeof window.__capture !== 'undefined',
      __altarKey: Object.prototype.hasOwnProperty.call(window, '__altar'),
      __captureKey: Object.prototype.hasOwnProperty.call(window, '__capture')
    },
    outerHTML: document.documentElement.outerHTML,
    innerText: document.body ? document.body.innerText : '',
    markers: {
      hasRitualRoot: !!document.querySelector('.ritual-root'),
      hasRitualCanvas: !!document.querySelector('.ritual-canvas'),
      hasSceneCanvas: !!document.querySelector('.ritual-canvas canvas') || !!document.querySelector('canvas'),
      hasCaption: !!document.querySelector('.ritual-caption'),
      hasGateButton: /我已知晓，进入/.test(document.body ? document.body.innerText : ''),
      hasGateHeading: /导演\s*\/\s*认证台/.test(document.body ? document.body.innerText : '')
    }
  };
}

const lineDiff = (aText, bText) => {
  const A = new Set(aText.split('\n').map((s) => s.trim()).filter(Boolean));
  const B = new Set(bText.split('\n').map((s) => s.trim()).filter(Boolean));
  return {
    onlyInA: [...A].filter((x) => !B.has(x)),
    onlyInB: [...B].filter((x) => !A.has(x))
  };
};

// 产物侧：dist 下所有 js chunk，区分「index.html 静态引用」与「懒加载 chunk（不在 html 中）」。
// 懒加载 chunk = 只有运行时 `import()` 才会拉取 —— 判断「公共页是否实际下载导演代码」的依据。
function analyzeDistChunks() {
  const html = readFileSync(resolve(ROOT, 'dist/index.html'), 'utf8');
  const dir = resolve(ROOT, 'dist/assets');
  const allJs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.js')) : [];
  const staticallyReferenced = allJs.filter((f) => html.includes(f));
  const lazyChunks = allJs.filter((f) => !html.includes(f));
  return { allJs, staticallyReferenced, lazyChunks };
}

async function main() {
  const head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  console.log(`\n══ QA 公共入口审查 · HEAD ${head.slice(0, 7)} ══`);

  mkdirSync(OUT_DIR, { recursive: true });

  // 1. build
  if (!SKIP_BUILD) {
    console.log('[1] npm run build …');
    execSync('npm run build', { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  } else if (!existsSync(resolve(ROOT, 'dist/index.html'))) {
    throw new Error('dist/index.html 不存在，且指定了 --skip-build');
  }

  // 产物 chunk 分类（静态引用 vs 懒加载）
  const chunks = analyzeDistChunks();
  console.log(`[1b] dist chunk：静态引用 ${chunks.staticallyReferenced.length} 个 · 懒加载 ${chunks.lazyChunks.length} 个 → ${chunks.lazyChunks.join(', ') || '（无）'}`);
  const loadedLazy = (reqs) => chunks.lazyChunks.filter((f) => reqs.some((u) => u.endsWith('/assets/' + f)));

  // 2. preview server
  const viteBin = resolve(ROOT, 'node_modules/.bin/vite');
  console.log(`[2] vite preview @ ${BASE} （指本地产物，不测线上）…`);
  const server = spawn(viteBin, ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
  const killServer = () => { try { server.kill('SIGTERM'); } catch { /* noop */ } };
  process.on('exit', killServer);

  try {
    const up = await waitForServer(`${BASE}/`);
    if (!up) throw new Error('vite preview 未在超时内就绪');
    console.log('    server up ✓');

    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ args: LAUNCH_ARGS });
    // 诊断：捕获页面错误 / 控制台 error / 失败请求，避免「空白页」被误判为隔离成功
    const attachDiag = (page, errs) => {
      page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message ? e.message : e)));
      page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
      page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url() + ' :: ' + (r.failure() ? r.failure().errorText : '')));
    };
    try {
      // ── 公共页 #/ ─────────────────────────────────────────────────
      console.log('[3] 公共页 #/ 扫描 …');
      const pubCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const pub = await pubCtx.newPage();
      const pubReqs = []; pub.on('request', (r) => pubReqs.push(r.url()));
      await pub.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await pub.waitForTimeout(2500);
      const pubData = await pub.evaluate(pageScanner, SCAN_WORDS);
      const pubUrl = pub.url();

      // 公共页实际下发的脚本（bundle 面）：抓 script[src] + modulepreload，扫工程标记
      console.log('[3b] 公共页下发 bundle 扫描 …');
      const pubAssets = await pub.evaluate(() =>
        Array.from(document.querySelectorAll('script[src],link[rel=modulepreload]'))
          .map((e) => e.src || e.href).filter(Boolean));
      const bundleResults = [];
      let bundleBytes = 0;
      let bundleScanOk = true;
      for (const src of [...new Set(pubAssets)]) {
        const rel = src.replace(`${BASE}/`, '');
        let txt = '', via = 'disk';
        try {
          // 优先直接读 dist（确定性、免网络竞态）；读不到再回退 fetch
          txt = readFileSync(resolve(ROOT, 'dist', rel), 'utf8');
        } catch {
          via = 'fetch';
          try { const r = await fetch(src); txt = await r.text(); } catch { /* noop */ }
        }
        if (!txt) bundleScanOk = false;
        const hits = {};
        for (const m of BUNDLE_MARKERS) { const c = txt.split(m).length - 1; if (c > 0) hits[m] = c; }
        bundleResults.push({ src, bytes: txt.length, via, hits });
        bundleBytes += txt.length;
      }
      const bundleLeaked = [...new Set(bundleResults.flatMap((b) => Object.keys(b.hits)))];
      if (!bundleScanOk) console.warn('    ⚠ bundle 扫描读到 0 字节 —— 结果不可信（检查 dist/vite）');

      // ── 导演台：无确认 ────────────────────────────────────────────
      console.log('[4] #/director（无 altar.director.confirmed）…');
      const d1ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const d1 = await d1ctx.newPage();
      const d1errs = []; attachDiag(d1, d1errs);
      let d1nav = 'ok';
      await d1.goto(`${BASE}/#/director`, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => { d1nav = 'fail:' + e.message; });
      await d1.waitForTimeout(2000);
      const d1Data = await d1.evaluate(pageScanner, SCAN_WORDS);
      d1Data.diag = { nav: d1nav, url: d1.url(), htmlLen: d1Data.outerHTML.length, errors: d1errs.slice(0, 12) };

      // ── 导演台：写入确认 ──────────────────────────────────────────
      console.log('[5] #/director（写 altar.director.confirmed=1 后）…');
      const d2ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const d2 = await d2ctx.newPage();
      const d2errs = []; attachDiag(d2, d2errs);
      const d2Reqs = []; d2.on('request', (r) => d2Reqs.push(r.url()));
      let d2nav = 'ok';
      await d2.goto(`${BASE}/#/director`, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => { d2nav = 'fail:' + e.message; });
      await d2.evaluate(() => window.localStorage.setItem('altar.director.confirmed', '1'));
      await d2.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch((e) => { d2nav = 'reloadfail:' + e.message; });
      await d2.waitForTimeout(2500);
      const d2Data = await d2.evaluate(pageScanner, SCAN_WORDS);
      d2Data.diag = { nav: d2nav, url: d2.url(), htmlLen: d2Data.outerHTML.length, errors: d2errs.slice(0, 12) };

      // ── 汇总 ──────────────────────────────────────────────────────
      const pubHits = SCAN_WORDS.map((w) => ({
        word: w,
        count: pubData.scan[w].count,
        textHits: pubData.scan[w].textHits,
        attrHits: pubData.scan[w].attrHits,
        windowHits: pubData.scan[w].windowHits
      }));
      const dirDiff = lineDiff(d1Data.innerText, d2Data.innerText);

      const report = {
        generatedAt: new Date().toISOString(),
        head,
        label: LABEL || 'latest',
        baseUrl: BASE,
        launchArgs: LAUNCH_ARGS,
        scanWords: SCAN_WORDS,
        public: {
          url: pubUrl,
          pollution: pubData.pollution,
          windowKeyCount: pubData.windowKeys.length,
          outerHTMLBytes: pubData.outerHTML.length,
          innerText: pubData.innerText,
          markers: pubData.markers,
          scan: pubHits,
          exposedWords: pubHits.filter((h) => h.count > 0).map((h) => h.word),
          bundle: { assets: bundleResults, totalBytes: bundleBytes, leakedMarkers: bundleLeaked, scanOk: bundleScanOk },
          network: {
            assetsRequested: pubReqs.filter((u) => u.includes('/assets/')),
            lazyChunks: chunks.lazyChunks,
            loadedLazyChunks: loadedLazy(pubReqs)
          }
        },
        directorWithoutConfirm: {
          markers: d1Data.markers,
          innerText: d1Data.innerText,
          diag: d1Data.diag
        },
        directorWithConfirm: {
          markers: d2Data.markers,
          innerText: d2Data.innerText,
          diag: d2Data.diag,
          network: {
            assetsRequested: d2Reqs.filter((u) => u.includes('/assets/')),
            loadedLazyChunks: loadedLazy(d2Reqs)
          }
        },
        directorDiff: dirDiff
      };

      writeFileSync(resolve(OUT_DIR, `audit-public-entry${SUFFIX}.json`), JSON.stringify(report, null, 2));

      // 文本报告
      const L = [];
      const phaseNote = LABEL.startsWith('baseline') ? '前基线'
        : LABEL.startsWith('after') ? '后态（#5 落地后）'
          : '当前态';
      L.push(`# #5 公共/工程入口隔离 · QA 独立审查报告`);
      L.push(`（本轮为 #5【${phaseNote}】：同一条命令复跑，前/后 diff 即 #5 证据）`);
      L.push('');
      L.push(`- HEAD: ${head}`);
      L.push(`- 时间: ${report.generatedAt}`);
      L.push(`- 被测: ${BASE}（vite preview 本地产物，非线上）`);
      L.push(`- 复跑: \`node scripts/qa-audit-public-entry.mjs\`（或 \`--skip-build\` 复用 dist）`);
      L.push('');
      L.push(`## 1) 公共页 #/ 工程暴露逐词命中`);
      L.push(`outerHTML ${report.public.outerHTMLBytes} B；window 键 ${report.public.windowKeyCount} 个`);
      L.push('');
      L.push(`| 词 | 命中 | 文本命中 | 属性命中 | window 命中 |`);
      L.push(`|----|----|----|----|----|`);
      for (const h of pubHits) L.push(`| \`${h.word}\` | ${h.count} | ${h.textHits.length} | ${h.attrHits.length} | ${h.windowHits.length} |`);
      L.push('');
      for (const h of pubHits) {
        if (h.count === 0) continue;
        L.push(`### \`${h.word}\` 命中定位`);
        for (const t of h.textHits) L.push(`  - [文本] ${t.path} :: "${t.snippet}"`);
        for (const a of h.attrHits) L.push(`  - [属性] ${a.path} [${a.attr}]="${a.snippet}"`);
        if (h.windowHits.length) L.push(`  - [window] ${h.windowHits.join(', ')}`);
        L.push('');
      }
      L.push(`公共页暴露词清单: ${report.public.exposedWords.length ? report.public.exposedWords.map((w) => '`' + w + '`').join(', ') : '（无）'}`);
      L.push('');
      L.push(`## 1b) 公共页**下发 bundle** 的工程/导演代码夹带（DOM 之外的暴露面）`);
      L.push(`公共页共下发 ${bundleResults.length} 个脚本，合计 ${(bundleBytes / 1024).toFixed(0)} KB`);
      L.push('');
      L.push(`| 脚本 | 大小(KB) | 命中标记 |`);
      L.push(`|----|----|----|`);
      for (const b of bundleResults) {
        const hs = Object.entries(b.hits).map(([k, v]) => `${k}×${v}`).join(', ') || '—';
        L.push(`| ${b.src.replace(BASE, '')} | ${(b.bytes / 1024).toFixed(0)} | ${hs} |`);
      }
      L.push('');
      L.push(`bundle 夹带工程/导演标记: ${bundleLeaked.length ? bundleLeaked.map((m) => '`' + m + '`').join(', ') : '（无）'}`);
      L.push(`（阴性对照 \`rapier\`=${bundleResults.flatMap((b) => Object.keys(b.hits)).includes('rapier') ? '夹带(异常)' : '0 ✓ 死依赖确未打包'}）`);
      L.push('');
      const pubLazy = loadedLazy(pubReqs);
      const d2Lazy = loadedLazy(d2Reqs);
      L.push(`## 1c) 网络请求侧：公共页是否**实际下载**导演懒加载 chunk`);
      L.push(`dist chunk：静态引用 ${chunks.staticallyReferenced.length} 个 / 懒加载 ${chunks.lazyChunks.length} 个（${chunks.lazyChunks.join(', ') || '（无）'}）`);
      L.push(`- 公共页 \`#/\` 实际请求 assets：${pubReqs.filter((u) => u.includes('/assets/')).map((u) => u.split('/').pop()).join(', ') || '（无）'}`);
      L.push(`- 公共页命中懒加载 chunk：${pubLazy.length ? pubLazy.join(', ') + ' ⚠ 泄漏' : '无 ✓（公共页不下载导演代码）'}`);
      L.push(`- 导演页 \`#/director\`（已确认）命中懒加载 chunk：${d2Lazy.length ? d2Lazy.join(', ') + ' ✓ 正向对照' : '无（应至少 1，异常）'}`);
      L.push('');
      L.push(`## 2) 入口隔离（#/director）`);
      L.push(`| 标记 | 无确认 | 有确认 |`);
      L.push(`|----|----|----|`);
      const mk = (o, k) => (o ? '✔' : '✘');
      L.push(`| .ritual-canvas 挂载 | ${mk(d1Data.markers.hasRitualCanvas)} | ${mk(d2Data.markers.hasRitualCanvas)} |`);
      L.push(`| 场景 canvas | ${mk(d1Data.markers.hasSceneCanvas)} | ${mk(d2Data.markers.hasSceneCanvas)} |`);
      L.push(`| 确认闸门按钮「我已知晓，进入」 | ${mk(d1Data.markers.hasGateButton)} | ${mk(d2Data.markers.hasGateButton)} |`);
      L.push(`| 闸门标题「导演 / 认证台」 | ${mk(d1Data.markers.hasGateHeading)} | ${mk(d2Data.markers.hasGateHeading)} |`);
      L.push('');
      L.push(`**无确认态** 判定进入导演台: ${d1Data.markers.hasSceneCanvas && !d1Data.markers.hasGateButton ? '是（应否！）' : '否（闸门挡住）'}`);
      L.push(`**有确认态** 判定进入导演台: ${d2Data.markers.hasSceneCanvas && !d2Data.markers.hasGateButton ? '是（可达）' : '否（异常）'}`);
      L.push('');
      L.push(`DOM 文本差异（无确认→有确认）：`);
      L.push(`  - 仅无确认出现: ${dirDiff.onlyInA.length ? dirDiff.onlyInA.map((s) => '"' + s.slice(0, 60) + '"').join(' | ') : '（无）'}`);
      L.push(`  - 仅有确认出现: ${dirDiff.onlyInB.length ? dirDiff.onlyInB.map((s) => '"' + s.slice(0, 60) + '"').join(' | ') : '（无）'}`);
      L.push('');
      L.push(`## 3) 公共页 window 污染`);
      L.push(`- window.__altar 定义: ${mk(pubData.pollution.__altarKey)}（应 ✘）`);
      L.push(`- window.__capture 定义: ${mk(pubData.pollution.__captureKey)}（应 ✘）`);
      L.push('');
      L.push(`> 原始数据见 audit-public-entry.json`);
      writeFileSync(resolve(OUT_DIR, `audit-public-entry${SUFFIX}.txt`), L.join('\n'));
      writeFileSync(resolve(OUT_DIR, `audit-public-entry${SUFFIX}.html.txt`), pubData.outerHTML);
      // 同时写一份不带标签的「最新」，便于人读
      if (SUFFIX) {
        writeFileSync(resolve(OUT_DIR, 'audit-public-entry.json'), JSON.stringify(report, null, 2));
        writeFileSync(resolve(OUT_DIR, 'audit-public-entry.txt'), L.join('\n'));
      }

      // 控制台摘要
      console.log('\n──── 摘要 ────');
      console.log(`公共页暴露词: ${report.public.exposedWords.length ? report.public.exposedWords.join(', ') : '（无）'}`);
      console.log(`公共 bundle 夹带: ${bundleLeaked.length ? bundleLeaked.join(', ') : '（无）'}`);
      console.log(`window 污染: __altar=${pubData.pollution.__altarKey} __capture=${pubData.pollution.__captureKey}`);
      console.log(`#/director 无确认: hasCanvas=${d1Data.markers.hasRitualCanvas} gate=${d1Data.markers.hasGateButton} → ${d1Data.markers.hasSceneCanvas && !d1Data.markers.hasGateButton ? '进入(应否!)' : '挡住'}`);
      console.log(`#/director 有确认: hasCanvas=${d2Data.markers.hasRitualCanvas} gate=${d2Data.markers.hasGateButton} → ${d2Data.markers.hasSceneCanvas && !d2Data.markers.hasGateButton ? '进入(可达)' : '未进入(异常)'}`);
      console.log(`网络侧: 公共页加载懒加载chunk = ${pubLazy.length ? pubLazy.join(', ') + ' ⚠泄漏' : '无 ✓'}; 导演页加载 = ${d2Lazy.join(', ') || '无(异常)'}`);
      console.log(`报告写入: ${OUT_DIR}/audit-public-entry${SUFFIX}.{json,txt,html.txt}`);
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    killServer();
  }
  console.log('\n完成。');
}

main().catch((e) => { console.error('AUDIT_FAIL:', e && e.stack ? e.stack : e); process.exit(1); });
