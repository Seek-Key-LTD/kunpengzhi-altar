#!/usr/bin/env node
/**
 * 华夏祭坛 · 无头视觉取证驱动（#7 前置 / 补 #2 挂起条）
 * ============================================================================
 *
 * 在**真浏览器**（无头 Chromium，WebGL2 经 ANGLE/SwiftShader 软栅格）里加载
 * tools/capture/capture.html —— 它实例化的是**真** AltarScene（非替身），随后本脚本
 * 通过 window.__capture 摆位 / 起播 / 截图，把「五幕画面对不对」变成可复算的客观清单。
 *
 * 两种取样语义（对应两处验收诉求）：
 *   · --seek   对给定 t **一次性对齐**内部时钟与派生状态（AltarScene.seekTo），渲染数帧后截图
 *              → 用于 #2 首/中/末席的**快速静态取证**（不等待 30 分钟真跑）
 *   · --run    以 setPlaybackRate(64) **真跑**全程（1800/64 ≈ 28s），按 currentRitualTime 采样
 *              → 用于 #7 的**全程序列取证**（证明确实在推进，而非静态摆拍）
 *
 * 黑场清单客观化：对**落盘的每一张 PNG** 逐像素计算
 *   · nonBlackRatio —— 非黑像素占比（max(r,g,b) ≥ NONBLACK_LEVEL）
 *   · meanLum        —— 平均亮度（Rec.709 加权，0..255）
 *   · brightPixels   —— 明显发光像素数（lum ≥ BRIGHT_LEVEL）
 * 并把雾中字幕（.ritual-caption 文本）一并记录。深渊(abyss)/静默(silence)两幕**天生是黑的**
 * —— 判据不是「够不够亮」，而是**「有内容黑」**：字幕在场 + 可测的非黑像素，即证明它们不是死黑。
 *
 * 运行：
 *   npm run capture                 # 默认 --seek，五幕 t≈90/600/1200/1600/1780
 *   npm run capture -- --run        # 全程真跑序列（rate=64）
 *   npm run capture -- --targets=90,600,1200,1600,1780 --out=artifacts/capture
 *
 * ⚠️ 产物 PNG 是二进制，不进版本库（见 .gitignore）；只提交本脚本 + 文本 manifest。
 * ⚠️ 本脚本不属 npm test 门禁（需浏览器）；是独立取证工具。
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, NONBLACK_LEVEL, BRIGHT_LEVEL } from './lib/png-probe.mjs';
import { chromium } from 'playwright';

// ── 常量 ────────────────────────────────────────────────────────────────────
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3000;
const CAPTURE_PATH = '/tools/capture/capture.html';
const URL = `http://127.0.0.1:${PORT}${CAPTURE_PATH}`;

/** 默认五幕探针：取各幕**中段**，远离 180/1020/1440/1751 转场边界，避免 ±1s 漂移跨幕。 */
const DEFAULT_TARGETS = [90, 600, 1200, 1600, 1780];
/** 真跑速率：1800 / 64 ≈ 28.1s。 */
const DEFAULT_RATE = 64;
/** #5 · 正交取证默认时刻：走马灯幕满席（lit=49），7×7 格点最完整。 */
const ORTHO_TARGET_SEC = 1200;
/**
 * Chromium 无头启动参数：
 *   · WebGL2 软栅格（本机 Intel Iris Plus 645 / SwiftShader 实测可用）
 *   · 关闭后台/遮挡节流 —— 否则无头页 rAF 被压到 ~10fps，--run 真跑会慢数十倍（实测踩过）
 */
const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion'
];

const PHASE_LABEL = {
  abyss: '深渊',
  naming: '命名',
  lanterns: '走马灯',
  extinguishing: '敛光',
  silence: '静默'
};

// ── 命令行 ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.some((a) => a === name || a.startsWith(`${name}=`));
const readArg = (name, fallback) => {
  const hit = argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (!hit) return fallback;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const idx = argv.indexOf(hit);
  return argv[idx + 1] ?? fallback;
};

const mode = hasFlag('--ortho') ? 'ortho' : hasFlag('--run') ? 'run' : 'seek';
const targets = (readArg('--targets', '') || DEFAULT_TARGETS.join(','))
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 0);
const rate = Number(readArg('--rate', String(DEFAULT_RATE)));
// 产物按模式隔离（seek/ 与 run/），避免两模式文件互相覆写。
const outDir = resolve(ROOT, readArg('--out', 'artifacts/capture'), mode);
const [vw, vh] = (readArg('--viewport', '1280x720') || '1280x720')
  .split('x')
  .map((n) => Number(n.trim()));
const viewport = {
  width: Number.isFinite(vw) && vw > 0 ? vw : 1280,
  height: Number.isFinite(vh) && vh > 0 ? vh : 720
};

// ── 工具 ────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');


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

/** 等接下来 n 个动画帧渲染完（确保 seek 结果已上屏）；rAF 停摆时用 1.5s 兜底防挂死。 */
async function settleFrames(page, n = 3) {
  await page.evaluate(
    (count) =>
      new Promise((ok) => {
        let left = count;
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            ok();
          }
        };
        const step = () => (left-- <= 0 ? finish() : requestAnimationFrame(step));
        requestAnimationFrame(step);
        setTimeout(finish, 1500); // 无头 rAF 可能停摆（本仓 isolation 脚本已实测），兜底放行
      }),
    n
  );
}

/**
 * 轮询等待「仪式时间 ≥ target」。
 *
 * 用**自适应**截止：只要时钟还在往前走就继续等（无头软栅格帧率不稳，不能按 64x 的理想
 * 墙钟估算）；一旦时钟停滞 > STALL_MS 或超过硬上限才放弃，返回当前时间（诚实记录实到点）。
 */
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
    if (Date.now() - lastAdvance > 8000) return typeof t === 'number' ? t : 0; // 停滞 → 放弃本目标
    if (Date.now() - started > hardCapMs) return typeof t === 'number' ? t : 0; // 硬上限
    await sleep(30);
  }
}

const fm2 = (n) => n.toFixed(2);
const fm4 = (n) => n.toFixed(4);
const fmPct = (n) => `${(n * 100).toFixed(3)}%`;

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(outDir, { recursive: true });
  console.log(`\n[capture] 模式=${mode} 目标秒=[${targets.join(', ')}] 速率=${rate}x`);
  console.log(`[capture] 产物目录=${outDir}`);

  const server = await ensureServer();
  console.log(`[capture] dev server ${server ? '已拉起' : '复用现存'}：${URL}`);

  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const shots = [];
  let glInfo = 'unknown';
  let fps = null;
  let orthoHalf = null;
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(`[capture][pageerror] ${e.message}`));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__altarReady === true, null, { timeout: 30000 });

    // WebGL2 能力佐证（写进 manifest，证明真在软栅格上跑了 WebGL2）。
    glInfo = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) return 'no-webgl2';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return `webgl2 ✓ · ${renderer}`;
    });
    console.log(`[capture] GL: ${glInfo}`);
    console.log(`[capture] 视口: ${viewport.width}×${viewport.height}`);

    // 实测无头渲染帧率 —— 决定 --run 真实吞吐（animate 每帧 dt 上限 0.05s，故 fps 直接封顶推进速度）。
    fps = await page.evaluate(
      () =>
        new Promise((ok) => {
          let frames = 0;
          const t0 = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - t0 >= 1000) ok(Number((frames * 1000 / (performance.now() - t0)).toFixed(1)));
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        })
    );
    console.log(`[capture] 实测帧率: ${fps} fps（dt 上限 0.05s ⇒ rate=${rate} 时理论上限 ${(0.05 * rate * fps).toFixed(0)} ritual-s/s）`);

    // 让字幕立刻全不透明（生产里是 2s 淡入；取证要可读的文字像素）。
    await page.addStyleTag({ content: '.ritual-caption{animation:none !important;}' });
    await settleFrames(page, 3);

    const total = await page.evaluate(() => window.__capture.TOTAL);
    // 硬上限留足余量（无头软栅格实际帧率可能远低于理想值，实测约 6~10 倍余量）。
    const hardCapMs = (total / rate) * 1000 * 10 + 30000;
    if (mode === 'run') {
      await page.evaluate(() => window.__capture.seek(0));
      await page.evaluate((r) => window.__capture.start(r), rate);
      console.log(`[capture] 起播 rate=${rate}x（理想全程约 ${(total / rate).toFixed(1)}s；无头实时以实测为准）`);
    } else if (mode === 'ortho') {
      // #5 · 7×7 正交取证：默认摆到满席幕（lit=49）再切**俯视正交**相机，单帧取证。
      const t = hasFlag('--targets') ? (targets[0] ?? ORTHO_TARGET_SEC) : ORTHO_TARGET_SEC;
      await page.evaluate((sec) => window.__capture.seek(sec), t);
      orthoHalf = await page.evaluate(() => window.__capture.orthoTopdown());
      targets.length = 0;
      targets.push(t);
      console.log(`[capture] 正交取证：俯视正交相机 半宽=${orthoHalf}（世界单位），t=${t}s`);
    }

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (mode === 'run') {
        await waitUntilTime(page, target, hardCapMs);
        await settleFrames(page, 2);
      } else {
        // seek / ortho：一次性摆位
        if (mode === 'seek') await page.evaluate((t) => window.__capture.seek(t), target);
        await settleFrames(page, 3);
      }
      const actual = await page.evaluate(() => window.__capture.time());
      const phase = await page.evaluate((t) => window.__capture.phaseAt(t), actual);
      const litSeats = await page.evaluate((t) => window.__capture.litSeatsAt(t), actual);
      const caption = await page.evaluate(
        () => (document.querySelector('.ritual-caption')?.textContent || '').trim()
      );
      const tag = mode === 'ortho' ? 'ortho-topdown' : phase;
      const name = `${String(i + 1).padStart(2, '0')}-${tag}-t${String(Math.round(target)).padStart(4, '0')}.png`;
      const file = resolve(outDir, name);
      const buf = await page.screenshot({ path: file });
      const m = analyze(buf);
      shots.push({
        index: i + 1,
        file: name,
        targetSec: target,
        actualSec: typeof actual === 'number' ? Number(actual.toFixed(2)) : null,
        phase,
        phaseLabel: PHASE_LABEL[phase] ?? phase,
        litSeats,
        caption,
        nonBlackRatio: Number(fm4(m.nonBlackRatio)),
        meanLum: Number(fm2(m.meanLum)),
        brightPixels: m.brightPixels,
        totalPixels: m.totalPixels,
        sha256: sha256(buf)
      });
      console.log(
        `  · ${name}  ${phase}(${PHASE_LABEL[phase] ?? phase}) t=${target}s→${fm2(actual)}s  ` +
          `非黑=${fmPct(m.nonBlackRatio)} 均亮=${fm2(m.meanLum)} 发光像素=${m.brightPixels}` +
          (caption ? `  字幕「${caption}」` : '  字幕(空)')
      );
    }
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }

  // ── 黑场清单客观化：区分「死黑」与「有内容黑」 ──────────────────────────────
  const darkPhases = new Set(['abyss', 'silence']);
  const withVerdict = shots.map((s) => {
    const isDarkPhase = darkPhases.has(s.phase);
    // 死黑 = 几乎没有非黑像素、且无字幕 —— 那才是「漏渲染」的嫌疑帧。
    const hasCaption = s.caption.trim().length > 0;
    const deadBlack = s.nonBlackRatio < 1e-4 && !hasCaption;
    const contentBlack = isDarkPhase && !deadBlack;
    return { ...s, hasCaption, deadBlack, contentBlack };
  });
  const anyDeadBlack = withVerdict.some((s) => s.deadBlack);

  const manifestLines = [];
  manifestLines.push('# 华夏祭坛 · 无头视觉取证清单');
  manifestLines.push(`生成时间(UTC): ${new Date().toISOString()}`);
  manifestLines.push(`模式: ${mode}  · 速率: ${mode === 'run' ? `${rate}x` : 'N/A(seek)'}`);
  manifestLines.push(`视口: ${viewport.width}×${viewport.height}  · 实测帧率: ${fps ?? 'N/A'} fps`);
  if (orthoHalf != null) {
    manifestLines.push(`正交相机: 俯视(沿 -Y) 正交 · 视口半宽=${orthoHalf}（世界单位，= PYRAMID_HALF）`);
  }
  manifestLines.push(`GL: ${glInfo}`);
  manifestLines.push(`非黑判据: 任一分量 ≥ ${NONBLACK_LEVEL}  · 发光判据: 亮度 ≥ ${BRIGHT_LEVEL}`);
  manifestLines.push('');
  manifestLines.push('字段: 序号 | 幕 | 目标t | 实到t | 席数 | 非黑占比 | 均亮 | 发光像素 | 字幕');
  for (const s of withVerdict) {
    manifestLines.push(
      `${s.index} | ${s.phase}(${s.phaseLabel}) | ${s.targetSec}s | ${s.actualSec}s | lit=${s.litSeats} | ` +
        `nonBlack=${fmPct(s.nonBlackRatio)} | meanLum=${fm2(s.meanLum)} | bright=${s.brightPixels} | ` +
        `caption="${s.caption}" | sha256=${s.sha256.slice(0, 12)}`
    );
  }
  manifestLines.push('');
  manifestLines.push('## 深渊/静默幕 · 「有内容黑」论证');
  for (const s of withVerdict.filter((x) => darkPhases.has(x.phase))) {
    manifestLines.push(
      `- ${s.phase}(${s.phaseLabel}) t=${s.actualSec}s：` +
        `字幕=${s.hasCaption ? `「${s.caption}」` : '无'}，非黑像素=${Math.round(s.nonBlackRatio * s.totalPixels)} 个` +
        `（均亮 ${fm2(s.meanLum)}）。${s.contentBlack ? '→ 有内容黑（字幕在场，非死黑）' : ''}`
    );
  }
  manifestLines.push('');
  manifestLines.push(`## 结论：${anyDeadBlack ? '❌ 存在死黑帧（疑漏渲染）' : '✅ 无死黑帧 —— 各幕均有可测内容'}`);
  const manifest = manifestLines.join('\n') + '\n';

  writeFileSync(resolve(outDir, `manifest-${mode}.txt`), manifest, 'utf8');
  writeFileSync(
    resolve(outDir, `manifest-${mode}.json`),
    JSON.stringify(
      { mode, rate: mode === 'run' ? rate : null, viewport, fps, orthoHalf, gl: glInfo, shots: withVerdict },
      null,
      2
    ) + '\n',
    'utf8'
  );

  console.log(`\n[capture] 清单已写：${resolve(outDir, `manifest-${mode}.txt`)}（sha256 ${sha256(manifest).slice(0, 12)}）`);
  console.log(`[capture] ${anyDeadBlack ? '❌ 存在死黑帧' : '✅ 无死黑帧：各幕均有可测内容'}`);
  if (anyDeadBlack) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[capture] 失败：${err?.stack || err}`);
  process.exitCode = 1;
});
