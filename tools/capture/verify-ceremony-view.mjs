#!/usr/bin/env node
/**
 * #10 · 公共仪式幕次取景 · 浏览器取证驱动（C 组）—— 设计说明书 §8.3。
 *
 * 在真浏览器（无头 Chromium，WebGL2 经 ANGLE/SwiftShader）里加载 tools/capture/
 * capture.html —— 实例化**真** AltarScene + 真实五幕运镜，随后经 window.__capture：
 *   · C-1  全程无未捕获异常（pageerror = 0、console error = 0）；
 *   · C-2  #7 相容：禁 WebGL 启动（tier='none' 无画档）下同一条时间轴空转不抛错；
 *   · C-3  历史无关：seek(600) → 1799 → 600，实拍位姿逐位相同（确定性最强实地证据）；
 *   · C-4  帧率无关：rate=64 真跑中 5 个幕内点的实拍位姿 ≈ ceremonyPoseAt(t)；
 *   · C-5  画面确实在动：关键秒 90/600/1200/1600 截图两两不同（「镜头静止」被证伪）；
 *   · C-6  silence 确实静止：s=1760 与 s=1799 截图相同（强口径，退化口径见下）；
 *   · C-7  隔离回归：连带跑 npm run audit:entry，要求门禁 PASS。
 *
 * ⚠️ 不入 `npm test`（需浏览器），独立命令：`npm run capture:ceremony`。
 * ⚠️ 与 `npm run capture` / `verify:degrade` **串行**（并发软栅格会 OOM/SIGKILL）。
 * ⚠️ PNG 不进版本库；manifest 文本落 artifacts/capture/ceremony/。
 * ⚠️ C-7 会覆写 #6 基线 artifacts/audit/ —— 跑完即 `git checkout -- artifacts/audit` 还原。
 *
 * 运行：node tools/capture/verify-ceremony-view.mjs [--skip-audit]
 */
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { analyze } from './lib/png-probe.mjs';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = resolve(ROOT, 'artifacts/capture/ceremony');
const PORT = Number(process.env.VERIFY_PORT || (4700 + Math.floor(Math.random() * 200)));
const URL = `http://127.0.0.1:${PORT}/tools/capture/capture.html`;
const SKIP_AUDIT = process.argv.includes('--skip-audit');

/** 软栅格主路径（出画）。 */
const ARGS_SOFTWARE = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'
];
/** C-2 路径：真的不给 WebGL（连软栅格兜底也不给）——同 verify-webgl-degradation.mjs A 路径。 */
const ARGS_NO_WEBGL = ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'];

const KEY_SECS = [90, 600, 1200, 1600];       // C-5 关键秒（四幕各一）
const RUN_SAMPLE_SECS = [90, 600, 1200, 1600, 1780]; // C-4 幕内采样点
const RUN_RATE = 64;                           // 1800/64 ≈ 28s 真跑
const SILENCE_A = 1760;
const SILENCE_B = 1799;

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

async function reachable(url, timeoutMs = 1000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable(URL)) return null; // 复用已在跑的 dev server
  const viteBin = resolve(ROOT, 'node_modules/.bin/vite');
  const proc = spawn(viteBin, ['--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore'
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await reachable(URL)) return proc;
    await sleep(200);
  }
  proc.kill('SIGTERM');
  throw new Error(`vite dev server 未就绪（30s 超时）：${URL}`);
}

/** 等接下来 n 个动画帧渲染完（rAF 停摆时 1.5s 兜底防挂死）—— 手法同 capture.mjs。 */
async function settleFrames(page, n = 3) {
  await page.evaluate(
    (count) =>
      new Promise((ok) => {
        let left = count;
        let done = false;
        const finish = () => { if (!done) { done = true; ok(); } };
        const step = () => (left-- <= 0 ? finish() : requestAnimationFrame(step));
        requestAnimationFrame(step);
        setTimeout(finish, 1500);
      }),
    n
  );
}

/** 自适应轮询「仪式时间 ≥ target」—— 手法同 capture.mjs waitUntilTime。 */
async function waitUntilTime(page, target, hardCapMs) {
  const started = Date.now();
  let last = -1;
  let lastAdvance = Date.now();
  for (;;) {
    const t = await page.evaluate(() => window.__capture.time());
    if (typeof t === 'number' && t >= target) return t;
    if (typeof t === 'number' && t > last + 1e-3) {
      last = t;
      lastAdvance = Date.now();
    }
    if (Date.now() - lastAdvance > 8000) return typeof t === 'number' ? t : 0;
    if (Date.now() - started > hardCapMs) return typeof t === 'number' ? t : 0;
    await sleep(30);
  }
}

const readPose = (page) => page.evaluate(() => window.__capture.pose());
const readTime = (page) => page.evaluate(() => window.__capture.time());
const poseJson = (p) => JSON.stringify(p);

/** Node 侧真模块：esbuild 打 src/three/ceremonyView.ts → ceremonyPoseAt（C-4 期望值）。 */
async function loadExpectedPose() {
  const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
  const tmp = mkdtempSync(resolve(tmpdir(), 'ceremony-expected-'));
  const out = resolve(tmp, 'ceremony-view.mjs');
  execFileSync(esbuildBin, [
    resolve(ROOT, 'src/three/ceremonyView.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${out}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  const mod = await import(pathToFileURL(out).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod.ceremonyPoseAt;
}

async function shoot(page, file) {
  const buf = await page.screenshot({ type: 'png' });
  writeFileSync(resolve(OUT_DIR, file), buf);
  return { file, bytes: buf.length, sha256: sha256(buf), ...analyze(buf) };
}

async function collectErrors(page) {
  const errors = { pageerror: 0, consoleError: 0, samples: [] };
  page.on('pageerror', (e) => { errors.pageerror++; errors.samples.push('pageerror: ' + String(e?.message ?? e)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.consoleError++; errors.samples.push('console.error: ' + m.text()); } });
  return errors;
}

async function main() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  console.log(`\n══ #10 幕次取景 · 浏览器取证（C 组）· HEAD ${head.slice(0, 7)} ══`);
  mkdirSync(OUT_DIR, { recursive: true });

  const ceremonyPoseAt = await loadExpectedPose();
  console.log('[0] Node 侧期望值源就绪（esbuild 真 ceremonyView 模块）');

  const server = await ensureServer();
  console.log(`[1] dev server ${server ? '已拉起' : '复用现存'}：${URL}`);

  const { chromium } = loadPlaywright();
  let gatePass = true;
  const checks = [];
  const check = (id, desc, cond, detail) => {
    checks.push({ id, desc, ok: !!cond, detail });
    console.log(`  ${cond ? '✓' : '✗'} [${id}] ${desc} — ${detail}`);
  };

  const manifestRows = [];
  let a = null;
  let b = null;

  try {
    // ── 主路径（软栅格，出画）─────────────────────────────────────────
    console.log('[2] 主路径：软栅格 + startRitual 真时间轴 …');
    const browser = await chromium.launch({ args: ARGS_SOFTWARE });
    try {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
      const errors = await collectErrors(page);
      await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => window.__altarReady === true, null, { timeout: 30000 });
      // 让字幕立刻全不透明（生产 2s 淡入；取证要稳定文字像素）—— 同 capture.mjs。
      await page.addStyleTag({ content: '.ritual-caption{animation:none !important;}' });
      await settleFrames(page, 3);

      const hasCanvas = await page.evaluate(() => !!document.querySelector('#capture-root canvas'));
      const rate = await page.evaluate(() => window.__capture.rate());

      // ── C-3 历史无关 ────────────────────────────────────────────────
      // 口径说明：seek 之后时间轴仍在推进（rate 最小 0.25，无法冻结时钟），
      // 两次到访的实际秒不可能逐位相同。故判据落成「实拍位姿 == ceremonyPoseAt(t)」：
      // 在两次到访各自的原子读数点 (t, pose) 上，位姿都必须逐位落在同一条确定性轨迹上 ——
      // 这正是「把 ritualElapsed 倒回同一值，画面必回同一构图」的可机械形态。
      console.log('[3] C-3 历史无关：seek(600) → 1799 → 600，两次到访各自对轨迹求证 …');
      const visit = async () => {
        await page.evaluate((t) => window.__capture.seek(t), 600);
        await settleFrames(page, 3);
        return await page.evaluate(() => {
          const t1 = window.__capture.time();
          const pose = window.__capture.pose();
          const t2 = window.__capture.time();
          return { t1, t2, pose };
        });
      };
      const v1 = await visit();
      await page.evaluate((t) => window.__capture.seek(t), 1799);
      await settleFrames(page, 3);
      const v2 = await visit();
      const devOf = (v) => {
        const e = ceremonyPoseAt(v.t1);
        return {
          dPos: Math.hypot(v.pose.x - e.position[0], v.pose.y - e.position[1], v.pose.z - e.position[2]),
          dFov: Math.abs(v.pose.fov - e.fov)
        };
      };
      const d1 = devOf(v1);
      const d2 = devOf(v2);
      const c3Ok = d1.dPos <= 1e-9 && d1.dFov <= 1e-9 && d2.dPos <= 1e-9 && d2.dFov <= 1e-9;
      check('C3.history-independent', '历史无关：两次到访（600 → 1799 → 600）实拍位姿均逐位落在同一条确定性轨迹',
        c3Ok,
        `到访1 t=${v1.t1.toFixed(3)} Δpos=${d1.dPos.toExponential(1)} Δfov=${d1.dFov.toExponential(1)}；` +
        `到访2 t=${v2.t1.toFixed(3)} Δpos=${d2.dPos.toExponential(1)} Δfov=${d2.dFov.toExponential(1)}`);

      // ── C-5 关键秒截图两两不同 ──────────────────────────────────────
      console.log(`[4] C-5 关键秒截图 ${KEY_SECS.join('/')} …`);
      const shots = [];
      for (const t of KEY_SECS) {
        await page.evaluate((s) => window.__capture.seek(s), t);
        await settleFrames(page, 3);
        const actual = await readTime(page);
        const pose = await readPose(page);
        const shot = await shoot(page, `ceremony-t${String(t).padStart(4, '0')}.png`);
        shots.push({ targetSec: t, actualSec: Number(actual.toFixed(2)), pose, ...shot });
        manifestRows.push({
          sec: t, actualSec: Number(actual.toFixed(2)), file: shot.file,
          sha256: shot.sha256, nonBlackRatio: shot.nonBlackRatio, meanLum: shot.meanLum,
          pose
        });
      }
      let distinctPairs = 0;
      let dupPair = null;
      for (let i = 0; i < shots.length; i++) {
        for (let j = i + 1; j < shots.length; j++) {
          if (shots[i].sha256 !== shots[j].sha256) distinctPairs++;
          else dupPair = `${shots[i].file} == ${shots[j].file}`;
        }
      }
      const totalPairs = (shots.length * (shots.length - 1)) / 2;
      check('C5.frames-differ', `画面确实在动：${KEY_SECS.length} 张关键秒截图两两不同（${distinctPairs}/${totalPairs} 对）`,
        distinctPairs === totalPairs, dupPair ? `重复对: ${dupPair}` : '无重复对');

      // ── C-6 silence 冻结（强口径 → 三探针退化口径）──────────────────
      console.log(`[5] C-6 silence 冻结：seek(${SILENCE_A}) vs seek(${SILENCE_B}) …`);
      await page.evaluate((t) => window.__capture.seek(t), SILENCE_A);
      await settleFrames(page, 3);
      const shotA = await shoot(page, `ceremony-silence-${SILENCE_A}.png`);
      const poseA = await readPose(page);
      await page.evaluate((t) => window.__capture.seek(t), SILENCE_B);
      await settleFrames(page, 3);
      const shotB = await shoot(page, `ceremony-silence-${SILENCE_B}.png`);
      const poseB = await readPose(page);
      const strongEqual = shotA.sha256 === shotB.sha256;
      const probeClose = Math.abs(shotA.nonBlackRatio - shotB.nonBlackRatio) <= 1e-3
        && Math.abs(shotA.meanLum - shotB.meanLum) <= 1e-3 * Math.max(1, shotA.meanLum)
        && Math.abs(shotA.brightPixels - shotB.brightPixels) <= Math.max(8, 1e-3 * shotA.totalPixels);
      manifestRows.push({ sec: SILENCE_A, file: shotA.file, sha256: shotA.sha256, nonBlackRatio: shotA.nonBlackRatio, meanLum: shotA.meanLum, pose: poseA });
      manifestRows.push({ sec: SILENCE_B, file: shotB.file, sha256: shotB.sha256, nonBlackRatio: shotB.nonBlackRatio, meanLum: shotB.meanLum, pose: poseB });
      const poseFrozen = poseJson(poseA) === poseJson(poseB);
      check('C6.silence-frozen', `silence 全窗静止：${SILENCE_A}s vs ${SILENCE_B}s`,
        strongEqual || (probeClose && poseFrozen),
        strongEqual
          ? '强口径：两帧 sha256 逐位相同'
          : (probeClose && poseFrozen
              ? `退化口径（已声明）：sha256 不同（UI 层非确定性），三探针 1e-3 内相等 + 位姿逐位相同 — nonBlack ${shotA.nonBlackRatio.toFixed(5)}/${shotB.nonBlackRatio.toFixed(5)} meanLum ${shotA.meanLum.toFixed(2)}/${shotB.meanLum.toFixed(2)}`
              : `两帧不同：nonBlack ${shotA.nonBlackRatio.toFixed(5)}/${shotB.nonBlackRatio.toFixed(5)} meanLum ${shotA.meanLum.toFixed(2)}/${shotB.meanLum.toFixed(2)}`));

      // ── C-4 帧率无关（rate=64 真跑采样）─────────────────────────────
      console.log(`[6] C-4 帧率无关：seek(0) + start(${RUN_RATE}x) 真跑采样 ${RUN_SAMPLE_SECS.join('/')} …`);
      await page.evaluate(() => window.__capture.seek(0));
      await page.evaluate((r) => window.__capture.start(r), RUN_RATE);
      const hardCapMs = (1800 / RUN_RATE) * 1000 * 10 + 30000;
      const runSamples = [];
      for (const target of RUN_SAMPLE_SECS) {
        await waitUntilTime(page, target, hardCapMs);
        // 原子读：t1 → pose → t2（同一主线程任务，帧间间隙即 Δt）
        const s = await page.evaluate(() => {
          const t1 = window.__capture.time();
          const pose = window.__capture.pose();
          const t2 = window.__capture.time();
          return { t1, t2, pose };
        });
        const dt = Math.max(0, s.t2 - s.t1);
        const expected = ceremonyPoseAt(s.t1);
        const dPos = Math.hypot(s.pose.x - expected.position[0], s.pose.y - expected.position[1], s.pose.z - expected.position[2]);
        const dFov = Math.abs(s.pose.fov - expected.fov);
        const tol = 1.2 * dt + 1e-6;
        runSamples.push({ target, t1: s.t1, t2: s.t2, dt, dPos, dFov, tol, ok: dPos <= tol && dFov <= 0.05 * dt + 1e-9 });
      }
      const runAllOk = runSamples.every((s) => s.ok);
      check('C4.frame-rate-independent', `帧率无关：rate=${RUN_RATE} 真跑 5 个幕内点实拍位姿 ≈ ceremonyPoseAt(t)`,
        runAllOk,
        runSamples.map((s) => `t=${s.t1.toFixed(1)} Δpos=${s.dPos.toExponential(1)}≤${s.tol.toExponential(1)}${s.ok ? '✓' : '✗'}`).join(' '));
      // 起播前后回归 rate=1，避免影响同 server 的其他取证
      await page.evaluate(() => window.__capture.start(1));

      a = {
        hasCanvas, rate, errors,
        c3: { v1, v2, d1, d2, ok: c3Ok },
        shots, runSamples,
        silence: { a: shotA, b: shotB, strongEqual, poseFrozen }
      };
    } finally {
      await browser.close().catch(() => {});
    }

    // ── C-2 #7 相容：禁 WebGL 启动（tier='none' 空转）────────────────
    console.log('[7] C-2 #7 相容：禁 WebGL 启动（同一条时间轴空转）…');
    const browser2 = await chromium.launch({ args: ARGS_NO_WEBGL });
    try {
      const page = await (await browser2.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      const errors = await collectErrors(page);
      await page.goto(URL, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
      let ready = false;
      try {
        await page.waitForFunction(() => window.__altarReady === true, null, { timeout: 15000 });
        ready = true;
      } catch { /* ready 保持假 */ }
      const noCanvas = await page.evaluate(() => !document.querySelector('#capture-root canvas'));
      const t0 = await page.evaluate(() => (window.__capture ? window.__capture.time() : null));
      await page.waitForTimeout(2000);
      const t1 = await page.evaluate(() => (window.__capture ? window.__capture.time() : null));
      let poseFinite = false;
      let poseVal = null;
      if (ready) {
        poseVal = await page.evaluate(() => window.__capture.pose());
        poseFinite = Object.values(poseVal).every((v) => Number.isFinite(v));
      }
      check('C2.no-webgl-ready', 'C-2 禁 WebGL：capture harness 就绪（tier=none 检测生效）', ready, `__altarReady=${ready}`);
      check('C2.no-canvas', 'C-2 禁 WebGL：无画布（不建 3D）', noCanvas, `canvas 在场=${!noCanvas}`);
      check('C2.pageerror-zero', 'C-2 禁 WebGL：无未捕获异常（取景空转不抛错）', errors.pageerror === 0, `pageerror=${errors.pageerror}`);
      check('C2.console-error-zero', 'C-2 禁 WebGL：console error = 0', errors.consoleError === 0, `console.error=${errors.consoleError}`);
      check('C2.clock-alive', 'C-2 禁 WebGL：时间轴仍在推进（#4 只停画不停时钟）',
        typeof t0 === 'number' && typeof t1 === 'number' && t1 > t0, `time ${t0?.toFixed?.(2)} → ${t1?.toFixed?.(2)}`);
      check('C2.pose-finite', 'C-2 禁 WebGL：实拍位姿全有限（空转写位姿安全）', poseFinite, poseVal ? JSON.stringify(poseVal).slice(0, 80) : 'null');
      b = { ready, noCanvas, errors, t0, t1, poseVal };
    } finally {
      await browser2.close().catch(() => {});
    }

    // ── C-1 汇总（主路径异常）────────────────────────────────────────
    check('C1.pageerror-zero', 'C-1 主路径：无未捕获异常', a.errors.pageerror === 0, `pageerror=${a.errors.pageerror}`);
    check('C1.console-error-zero', 'C-1 主路径：console error = 0', a.errors.consoleError === 0, `console.error=${a.errors.consoleError}`);

    // ── C-7 隔离回归：audit:entry ────────────────────────────────────
    if (!SKIP_AUDIT) {
      console.log('[8] C-7 隔离回归：npm run audit:entry …');
      const audit = spawnSync('npm', ['run', 'audit:entry'], { cwd: ROOT, encoding: 'utf8' });
      const out = (audit.stdout || '') + (audit.stderr || '');
      writeFileSync(resolve(OUT_DIR, 'audit-entry.txt'), out);
      check('C7.audit-entry-pass', 'C-7 公共入口审计门禁 PASS（camera 等暴露词命中 = 0）',
        audit.status === 0 && /PASS/i.test(out), `exit=${audit.status}`);
      // audit:entry 覆写 #6 基线 —— 立即还原（PNG 不入库的同一纪律：基线证据不被取证踩掉）
      spawnSync('git', ['checkout', '--', 'artifacts/audit'], { cwd: ROOT });
      console.log('    （artifacts/audit 基线已 git checkout 还原）');
    } else {
      console.log('[8] C-7 跳过（--skip-audit）');
    }
  } finally {
    if (server) { try { server.kill('SIGTERM'); } catch { /* noop */ } }
  }

  // ── 汇总判定 + manifest ───────────────────────────────────────────
  const failed = checks.filter((c) => !c.ok);
  gatePass = failed.length === 0;

  const lines = [];
  lines.push('# 华夏祭坛 · #10 幕次取景取证清单（C 组）');
  lines.push(`生成时间(UTC): ${new Date().toISOString()}`);
  lines.push(`HEAD: ${head}`);
  lines.push(`视口: 1280×800 · 采样速率: ${RUN_RATE}x · 主路径: SwiftShader 软栅格`);
  lines.push('');
  lines.push('## 关键秒截图（PNG 不入库，仅记录探针）');
  for (const r of manifestRows) {
    lines.push(`- t=${r.sec}s (actual ${r.actualSec ?? r.sec}s) ${r.file} sha256=${r.sha256.slice(0, 16)}… nonBlack=${r.nonBlackRatio.toFixed(5)} meanLum=${r.meanLum.toFixed(2)}`);
    lines.push(`  pose: ${JSON.stringify(r.pose)}`);
  }
  lines.push('');
  lines.push('## C-4 真跑采样（rate=64）');
  for (const s of (a?.runSamples ?? [])) {
    lines.push(`- 目标 ${s.target}s → t=${s.t1.toFixed(2)} Δpos=${s.dPos.toFixed(6)} 容差=${s.tol.toFixed(6)} ${s.ok ? '✓' : '✗'}`);
  }
  lines.push('');
  lines.push('## 硬断言');
  for (const c of checks) lines.push(`- [${c.ok ? '✓' : '✗'}] ${c.id} ${c.desc} — ${c.detail}`);
  lines.push('');
  lines.push(gatePass ? '结论: PASS' : `结论: FAIL（${failed.length} 项）`);
  writeFileSync(resolve(OUT_DIR, 'manifest.txt'), lines.join('\n'));
  writeFileSync(resolve(OUT_DIR, 'probe.json'), JSON.stringify({ head, checks, a, b, manifestRows }, null, 2));

  console.log(`\n证据写入: ${OUT_DIR}/manifest.txt · probe.json · *.png${SKIP_AUDIT ? '' : ' · audit-entry.txt'}`);
  if (!gatePass) {
    console.error(`\n❌ 取证判红：${failed.length} 项不满足 → process.exit(1)`);
    process.exit(1);
  }
  console.log('\n✅ #10 幕次取景取证 PASS');
}

main().catch((e) => { console.error('VERIFY_FAIL:', e?.stack ?? e); process.exit(1); });
