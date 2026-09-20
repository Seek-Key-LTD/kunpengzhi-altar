#!/usr/bin/env node
/**
 * #7 T9 · 全程录屏 + 黑场清单 —— 设计说明书 docs/design/007-webgl-degradation.md §4.4。
 *
 * 在真浏览器（无头 Chromium，WebGL2 经 ANGLE/SwiftShader）里加载 tools/capture/
 * capture.html —— 实例化**真** AltarScene，startRitual + setPlaybackRate(64) 真跑
 * 1800s 全程（#10 幕次运镜生效，画面即最终形态），同时：
 *   · **录屏**：recordVideo 全程落盘（webm 不入库，PNG 同口径）；
 *   · **黑场清单**：每 15 仪式秒采样一帧 → png-probe（nonBlack/meanLum/bright）+
 *     幕次 + 字幕 → 逐段分类「有内容黑 / 纯黑 / 亮场」，落 manifest 入库；
 *   · **pose 对拍**：5 个关键秒（90/600/1200/1600/1780）原子读 (t, pose)，
 *     对拍 Node 侧真模块 ceremonyPoseAt(t)（容差 = C7 的 1.2/s × Δt）；
 *   · **B 路径短证据**：另开一页真跑中触发 WEBGL_lose_context，
 *     证 B4 draw-frozen（draw call 计数冻结）+ B5 clock-alive（rAF 仍在涨）。
 *
 * 判黑口径（沿用 capture.mjs / png-probe 现状，一个数字不改）：
 *   · 纯黑（死黑，嫌疑帧）= nonBlackRatio < 1e-4 且无字幕；
 *   · 有内容黑 = abyss/silence 两暗幕且非死黑（字幕在场 / 可测非黑像素）；
 *   · 亮场 = naming / lanterns / extinguishing。
 * 预期吻合：90s 与 1780s 两点均为「有内容黑」（#7 T1–T8 已验）。
 *
 * ⚠️ 与 capture / verify:degrade / capture:ceremony **串行**（软栅格并发会 OOM）。
 * ⚠️ webm/PNG 不入库；blackframe-manifest.txt / probe.json 入库。
 *    移动端（--mobile）：blackframe-manifest-mobile.txt / probe-mobile.json 落 record-mobile/。
 * ⚠️ 只增不改：本脚本为新增文件，不触碰 src/、docs/、既有断言脚本。
 *
 * 运行：node tools/capture/record-full.mjs   （别名 npm run record:full）
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, renameSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { analyze } from './lib/png-probe.mjs';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// #7 闸门 B 项 · 移动端等效口径：--mobile 切换 390×844@2x + 触控 UA + isMobile，
// 产物落 record-mobile/（判定口径与桌面版完全一致）；不带 flag 时桌面路径默认行为零变化。
const MOBILE = process.argv.includes('--mobile');
const OUT_DIR = resolve(ROOT, MOBILE ? 'artifacts/capture/record-mobile' : 'artifacts/capture/record');
const MANIFEST_NAME = MOBILE ? 'blackframe-manifest-mobile.txt' : 'blackframe-manifest.txt';
const PROBE_NAME = MOBILE ? 'probe-mobile.json' : 'probe.json';
const PROFILE_LABEL = MOBILE
  ? 'mobile(390×844 @2x, isMobile+hasTouch+移动 UA, SwiftShader 软栅格)'
  : 'desktop(1280×720 @1x, SwiftShader 软栅格)';
const PORT = Number(process.env.VERIFY_PORT || (4900 + Math.floor(Math.random() * 100)));
const URL = `http://127.0.0.1:${PORT}/tools/capture/capture.html`;

const RUN_RATE = 64;
/** 采样步长（仪式秒）：桌面 15s（121 点）；移动端截屏 ~5.4s/张（780×1688@2x），按票面放宽 30s。 */
const SAMPLE_STEP = MOBILE ? 30 : 15;
/** 降速点：桌面 1500s（敛光幕起）→ 2x；移动端截屏更贵（64x 每张冲 ~346 仪式秒，实测 344），提前到 1050s → 2x。 */
const SLOWDOWN_AT = MOBILE ? 1050 : 1500;
/** pose 对拍关键秒：桌面 5 点；移动端按票面抽 3 点（90 abyss / 1200 敛光前 / 1770 终寂幕内）。 */
const POSE_SECS = MOBILE ? [90, 1200, 1770] : [90, 600, 1200, 1600, 1780];
/** 实测单张截屏墙钟（秒）：桌面 1280×720@1x ~2s；移动 780×1688@2x ~5.4s（两轮实测回显）。 */
const SHOT_WALL_SEC = MOBILE ? 5.4 : 2;
/** 64x 下每张截屏冲掉的仪式秒 = 64 × 单张墙钟秒（桌面 128 / 移动 346，实测 344——差为轮询粒度）—— manifest 描述由此拼装，不硬编码。 */
const DRIFT_PER_SHOT = Math.round(RUN_RATE * SHOT_WALL_SEC);

const ARGS_SOFTWARE = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'
];

const PHASE_LABEL = { abyss: '深渊', naming: '命名', lanterns: '走马灯', extinguishing: '敛光', silence: '静默' };
const DARK_PHASES = new Set(['abyss', 'silence']);
/** 死黑判据：沿用 capture.mjs 的 1e-4 阈值。 */
const DEAD_BLACK_RATIO = 1e-4;

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
  if (await reachable(URL)) return null;
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

/** 页面侧探针：draw call 计数 + rAF 计数（只数次数，不改行为）—— 同 verify-webgl-degradation。 */
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

/** Node 侧期望值源：esbuild 打真 ceremonyView 模块。 */
async function loadExpectedPose() {
  const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
  const tmp = mkdtempSync(resolve(tmpdir(), 'record-full-'));
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

async function main() {
  const { spawnSync } = await import('node:child_process');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  console.log(`\n══ #7 T9 全程录屏 + 黑场清单（${MOBILE ? '移动端' : '桌面'}）· HEAD ${head.slice(0, 7)} ══`);
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(resolve(OUT_DIR, 'video'), { recursive: true });
  mkdirSync(resolve(OUT_DIR, 'frames'), { recursive: true });

  const ceremonyPoseAt = await loadExpectedPose();

  const server = await ensureServer();
  console.log(`[1] dev server ${server ? '已拉起' : '复用现存'}：${URL}`);
  const { chromium } = loadPlaywright();

  const rows = [];
  const poseChecks = [];
  let videoFile = null;
  let degrade = null;
  let mainPathErrors = 0;

  const browser = await chromium.launch({ args: ARGS_SOFTWARE });
  try {
    // ── 主路径：1800s 全程真跑 + 录屏 + 采样 ─────────────────────────
    console.log(`[2] 主路径（${PROFILE_LABEL}）：seek(0) + start(${RUN_RATE}x) 真跑全程 + recordVideo …`);
    const context = await browser.newContext({
      viewport: MOBILE ? { width: 390, height: 844 } : { width: 1280, height: 720 },
      deviceScaleFactor: MOBILE ? 2 : 1,
      isMobile: MOBILE,
      hasTouch: MOBILE,
      userAgent: MOBILE
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
      recordVideo: MOBILE
        ? { dir: resolve(OUT_DIR, 'video'), size: { width: 390, height: 844 } }
        : { dir: resolve(OUT_DIR, 'video'), size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => { mainPathErrors++; console.error(`[pageerror] ${e.message}`); });
    await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__altarReady === true, null, { timeout: 30000 });
    await page.addStyleTag({ content: '.ritual-caption{animation:none !important;}' });
    await settleFrames(page, 3);

    await page.evaluate(() => window.__capture.seek(0));
    await page.evaluate((r) => window.__capture.start(r), RUN_RATE);
    const hardCapMs = (1800 / RUN_RATE) * 1000 * 10 + 60000;

    const targets = [];
    for (let t = 0; t <= 1800; t += SAMPLE_STEP) targets.push(t);
    if (targets[targets.length - 1] !== 1800) targets.push(1800);

    for (const target of targets) {
      // 速率受控（见 SLOWDOWN_AT 注释）：时间轴仍是真跑推进（不 seek），只是回放速率按
      // #4 受控口径收慢 —— 桌面 1500s 起 2x；移动端 1050s 起 2x。
      if (target === SLOWDOWN_AT) {
        await page.evaluate((r) => window.__capture.start(r), 2);
      }
      const actual = await waitUntilTime(page, target, hardCapMs);
      const isPoseKey = POSE_SECS.some((k) => Math.abs(target - k) < SAMPLE_STEP / 2);
      // pose 对拍：与采样同拍做原子读（t1 → pose → t2）
      if (isPoseKey) {
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
        const ok = dPos <= tol && dFov <= 0.05 * dt + 1e-9;
        poseChecks.push({ target, t1: s.t1, dt, dPos, dFov, tol, ok });
        console.log(`  [pose] 目标 ${target}s → t=${s.t1.toFixed(2)} Δpos=${dPos.toExponential(1)} ≤ ${tol.toExponential(1)} ${ok ? '✓' : '✗'}`);
      }
      const buf = await page.screenshot({ type: 'png' });
      const m = analyze(buf);
      const phase = await page.evaluate((t) => window.__capture.phaseAt(t), actual);
      const caption = await page.evaluate(() => (document.querySelector('.ritual-caption')?.textContent || '').trim());
      const deadBlack = m.nonBlackRatio < DEAD_BLACK_RATIO && caption.length === 0;
      // 终局归零（actualSec 恰为 1800 = 总时长）：字幕窗口按 sec<1800 收口、全坛寂灭
      // 是 #7/#4 的正典终态 —— 单列 end-black，不算死黑嫌疑帧。
      const atTotalEnd = typeof actual === 'number' && actual >= 1800;
      const verdict = deadBlack ? (atTotalEnd ? 'end-black' : 'pure-black')
        : DARK_PHASES.has(phase) ? 'content-black' : 'lit';
      rows.push({
        targetSec: target,
        actualSec: typeof actual === 'number' ? Number(actual.toFixed(2)) : null,
        phase,
        phaseLabel: PHASE_LABEL[phase] ?? phase,
        nonBlackRatio: Number(m.nonBlackRatio.toFixed(5)),
        meanLum: Number(m.meanLum.toFixed(2)),
        brightPixels: m.brightPixels,
        caption,
        verdict
      });
      writeFileSync(resolve(OUT_DIR, 'frames', `f${String(target).padStart(4, '0')}.png`), buf);
      if (target % 300 === 0) {
        console.log(`  · t=${String(target).padStart(4, '0')}s ${phase}(${PHASE_LABEL[phase]}) nonBlack=${m.nonBlackRatio.toFixed(5)} meanLum=${m.meanLum.toFixed(2)} ${verdict}`);
      }
    }
    await page.evaluate(() => window.__capture.start(1));
    await context.close(); // 落盘 video
    // recordVideo 产出带随机名的 webm —— 归位为 full-run.webm
    const vids = readdirSync(resolve(OUT_DIR, 'video')).filter((f) => f.endsWith('.webm'));
    if (vids.length > 0) {
      videoFile = resolve(OUT_DIR, 'video', 'full-run.webm');
      renameSync(resolve(OUT_DIR, 'video', vids[vids.length - 1]), videoFile);
    }
    console.log(`[3] 主路径完成：${rows.length} 个采样点，pageerror=${mainPathErrors}，录像=${videoFile ? 'full-run.webm' : '（缺）'}`);

    // ── B 路径短证据：真跑中丢上下文 → B4 draw-frozen + B5 clock-alive ──
    console.log('[4] B 路径短证据：startRitual 真跑中 WEBGL_lose_context …');
    const ctx2 = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: resolve(OUT_DIR, 'video'), size: { width: 1280, height: 720 } }
    });
    const page2 = await ctx2.newPage();
    let degradeErrors = 0;
    page2.on('pageerror', () => { degradeErrors++; });
    await page2.addInitScript(installProbes);
    await page2.goto(URL, { waitUntil: 'load', timeout: 30000 });
    await page2.waitForFunction(() => window.__altarReady === true, null, { timeout: 30000 });
    await page2.evaluate(() => window.__capture.seek(0));
    await page2.evaluate((r) => window.__capture.start(r), RUN_RATE);
    await waitUntilTime(page2, 120, 60000); // 走到 naming 幕内（正常出画中）
    const atLoss = await page2.evaluate(() => ({ ...window.__veilProbe, time: window.__capture.time() }));
    const lost = await page2.evaluate(() => {
      const canvas = document.querySelector('#capture-root canvas');
      if (!canvas) return { ok: false, why: '无 canvas' };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { ok: false, why: '拿不到 GL 上下文' };
      const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return { ok: false, why: '无 WEBGL_lose_context' };
      ext.loseContext();
      return { ok: true };
    });
    // 沉降双读：loseContext 是异步事件，致盲瞬间允许在途的最后 1 帧 draw 滑过
    // （首测 1267→1268 恰一帧竞态）。B4 判据 = 沉降后两个区间 draw 计数**逐位相等**。
    await page2.waitForTimeout(1500);
    const settle1 = await page2.evaluate(() => ({ ...window.__veilProbe, time: window.__capture.time() }));
    await page2.waitForTimeout(1500);
    const settle2 = await page2.evaluate(() => ({ ...window.__veilProbe, time: window.__capture.time() }));
    const shotAfter = await page2.screenshot({ type: 'png' });
    writeFileSync(resolve(OUT_DIR, 'degrade-contextlost.png'), shotAfter);
    const b4 = settle2.draw === settle1.draw;
    const b5 = settle2.raf > settle1.raf && settle2.time > settle1.time;
    degrade = { lost: lost.ok, why: lost.why ?? '', atLoss, settle1, settle2, b4, b5, degradeErrors };
    console.log(`  致盲=${lost.ok}${lost.why ? '(' + lost.why + ')' : ''} draw 丢时=${atLoss.draw} 沉降1=${settle1.draw} 沉降2=${settle2.draw}（${b4 ? '冻结 ✓' : '未冻结 ✗'}）` +
      ` raf ${settle1.raf}→${settle2.raf} time ${settle1.time.toFixed(1)}→${settle2.time.toFixed(1)}（${b5 ? '时钟存活 ✓' : '✗'}）pageerror=${degradeErrors}`);
    await ctx2.close();
  } finally {
    await browser.close().catch(() => {});
    if (server) { try { server.kill('SIGTERM'); } catch { /* noop */ } }
  }

  // ── 黑场清单聚合：连续同判定 → 段 ─────────────────────────────────
  const segments = [];
  for (const r of rows) {
    const last = segments[segments.length - 1];
    if (last && last.verdict === r.verdict && last.phase === r.phase) {
      last.endSec = r.targetSec;
      last.samples++;
    } else {
      segments.push({ verdict: r.verdict, phase: r.phase, phaseLabel: r.phaseLabel, startSec: r.targetSec, endSec: r.targetSec, samples: 1 });
    }
  }
  const pureBlack = rows.filter((r) => r.verdict === 'pure-black');
  const endBlack = rows.filter((r) => r.verdict === 'end-black');
  const contentBlack = rows.filter((r) => r.verdict === 'content-black');
  const lit = rows.filter((r) => r.verdict === 'lit');
  const poseAllOk = poseChecks.length > 0 && poseChecks.every((p) => p.ok);

  // ── manifest（沿用既有格式）───────────────────────────────────────
  const fm = (n, d) => Number(n.toFixed(d));
  const lines = [];
  lines.push('# 华夏祭坛 · #7 T9 全程录屏黑场清单');
  lines.push(`生成时间(UTC): ${new Date().toISOString()}`);
  lines.push(`HEAD: ${head}`);
  lines.push(`模式: run(rate=${RUN_RATE}x, 1800s 全程真跑, #10 幕次运镜生效) · 采样步长: ${SAMPLE_STEP}s（${rows.length} 点）`);
  lines.push('视口: ' + PROFILE_LABEL);
  lines.push('采样步长: ' + SAMPLE_STEP + 's' + (MOBILE ? '（移动端按票面允许放宽，墙钟成本：截屏 ~5.4s/张 @780×1688）' : '') +
    ' · 非黑判据: 任一分量 ≥ 8（png-probe 现口径）· 死黑判据: nonBlackRatio < 1e-4 且无字幕');
  lines.push(`速率受控口径: 0–${SLOWDOWN_AT}s @${RUN_RATE}x 真跑，${SLOWDOWN_AT}s 起受控降速 2x 至终 —— ${RUN_RATE}x 下每张截屏约 ${SHOT_WALL_SEC}s 墙钟会冲掉 ~${DRIFT_PER_SHOT} 仪式秒，降速后末段采样落在真实秒位`);
  lines.push('录像: artifacts/capture/' + (MOBILE ? 'record-mobile' : 'record') + '/video/full-run.webm（不入库）· 帧样张: 同目录 frames/（不入库）');
  lines.push('');
  lines.push('## 黑场分段（连续同判定聚合）');
  for (const s of segments) {
    lines.push(`- [${String(s.startSec).padStart(4, '0')}–${String(s.endSec).padStart(4, '0')}s] ${s.phase}(${s.phaseLabel}) → ${s.verdict}（${s.samples} 样点）`);
  }
  lines.push('');
  lines.push('## 判定汇总');
  lines.push(`- 有内容黑样点: ${contentBlack.length}（abyss/silence 全部非死黑即预期）`);
  lines.push(`- 终局归零样点: ${endBlack.length}（恰 t=1800：字幕窗口按 sec<1800 收口、全坛寂灭 —— 正典终态，非死黑嫌疑）`);
  lines.push(`- 纯黑（死黑嫌疑）样点: ${pureBlack.length}${pureBlack.length === 0 ? ' —— 无死黑帧' : ' ←←← 需人工复核: ' + pureBlack.slice(0, 5).map((r) => r.targetSec + 's').join(',')}`);
  lines.push(`- 亮场样点: ${lit.length}`);
  const anchor90 = rows.find((r) => r.targetSec === 90);
  // silence 锚点：取「幕次=终寂且实际秒 < 1800」的末样（桌面 15s 步长落在 1785s；
  // 移动端 30s 步长落在 1770s —— 按实测落点取，不硬编码目标秒）。
  const silenceAnchor = rows.filter((r) => r.phase === 'silence' && r.actualSec < 1800).pop();
  lines.push(`- 锚点吻合: 90s=${anchor90?.verdict}（预期 content-black）· silence 末样 target=${silenceAnchor?.targetSec}s actual=${silenceAnchor?.actualSec}s=${silenceAnchor?.verdict}（预期 content-black）`);
  lines.push('');
  lines.push(`## pose 对拍（${POSE_SECS.length} 关键秒，ceremonyPoseAt 真模块）`);
  for (const p of poseChecks) {
    lines.push(`- 目标 ${p.target}s → t=${fm(p.t1, 2)} Δpos=${p.dPos.toExponential(2)} ≤ ${p.tol.toExponential(2)} Δfov=${p.dFov.toExponential(2)} ${p.ok ? '✓' : '✗'}`);
  }
  lines.push(`- 结论: ${poseAllOk ? '录像轨迹与五幕取景一致 ✓' : '存在偏差 ✗'}`);
  lines.push('');
  lines.push('## B 路径短证据（007 §4.3 新口径：draw 冻结 + 时钟存活）');
  lines.push(`- 致盲: ${degrade?.lost} ${degrade?.why}`);
  lines.push(`- B4 draw-frozen: ${degrade?.b4 ? '✓' : '✗'}（丢时 draw=${degrade?.atLoss?.draw}，沉降后 ${degrade?.settle1?.draw} → ${degrade?.settle2?.draw} 逐位相等）`);
  lines.push(`- B5 clock-alive: ${degrade?.b5 ? '✓' : '✗'}（raf ${degrade?.settle1?.raf}→${degrade?.settle2?.raf}，time ${fm(degrade?.settle1?.time ?? 0, 1)}→${fm(degrade?.settle2?.time ?? 0, 1)}）`);
  lines.push(`- B 路径 pageerror: ${degrade?.degradeErrors}`);
  lines.push('');
  lines.push('## 逐点明细');
  lines.push('targetSec | actualSec | phase | nonBlack | meanLum | bright | caption | verdict');
  for (const r of rows) {
    lines.push(`${r.targetSec} | ${r.actualSec} | ${r.phase} | ${r.nonBlackRatio} | ${r.meanLum} | ${r.brightPixels} | ${r.caption} | ${r.verdict}`);
  }
  writeFileSync(resolve(OUT_DIR, MANIFEST_NAME), lines.join('\n'));

  const probe = { head, rate: RUN_RATE, sampleStep: SAMPLE_STEP, rows, segments, poseChecks, poseAllOk, degrade, videoFile };
  writeFileSync(resolve(OUT_DIR, PROBE_NAME), JSON.stringify(probe, null, 2));

  const gateOk = pureBlack.length === 0 && poseAllOk && degrade?.b4 && degrade?.b5 && degrade?.degradeErrors === 0 && mainPathErrors === 0;
  console.log(`\n──── 黑场清单要点 ────`);
  console.log(`  分段 ${segments.length} 段：有内容黑 ${contentBlack.length} · 终局归零 ${endBlack.length} · 纯黑（嫌疑）${pureBlack.length} · 亮场 ${lit.length}`);
  console.log(`  锚点：90s=${anchor90?.verdict} · silence 末样 target=${silenceAnchor?.targetSec}s actual=${silenceAnchor?.actualSec}s=${silenceAnchor?.verdict}`);
  console.log(`  pose 对拍：${poseChecks.length}/${POSE_SECS.length} ${poseAllOk ? '全过 ✓' : '存在偏差 ✗'}`);
  console.log(`  B 路径：B4=${degrade?.b4} B5=${degrade?.b5} pageerror=${degrade?.degradeErrors}`);
  console.log(`证据写入: ${OUT_DIR}/${MANIFEST_NAME} · ${PROBE_NAME} · video/full-run.webm（不入库）`);
  if (!gateOk) {
    console.error('\n❌ T9 取证判红 → process.exit(1)');
    process.exit(1);
  }
  console.log('\n✅ #7 T9 全程录屏 + 黑场清单 PASS');
}

main().catch((e) => { console.error('RECORD_FAIL:', e?.stack ?? e); process.exit(1); });
