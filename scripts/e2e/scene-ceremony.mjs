#!/usr/bin/env node
/**
 * 场景级 E2E —— ceremony 契约升维（w2/scene-e2e）
 *
 * 把三份单元契约搬进真浏览器场景（真实点击 / 换席 / 销毁-重建链路）：
 *   S1 换席刷新   —— canvas 真点击（Playwright mouse → pointer 事件 → EventHandlers
 *                    raycast → onSeatSelect/setActiveSeat）→ activeSeat 实读刷新 + 截图
 *   S2 silence 幂等 —— seek(1760) → seek(1780) → seek(1760)（重入）→ seek(1760)（重复）
 *                    状态快照逐字段相等 + 双访截图结构一致
 *   S3 销毁-重建  —— destroyAndRebuild()（真 destroy 幂等闸 + 同参重建）→ 换席再次可用
 *                    → 重建后截图与 S1 基线结构一致
 *   S4 honor 三态 —— 页面上下文跑真 aggregateHonor + toPublicView，喂 up/down/same/new
 *                    各一条，两套口径对拍（honor 未接 UI，无截图，基线为 JSON 口径）
 *
 * 截图基线：artifacts/e2e-baselines/（PNG 入仓 + manifest.json 存 24×14 网格亮度签名）。
 *   复跑对比：node scripts/e2e/scene-ceremony.mjs
 *   重建基线：node scripts/e2e/scene-ceremony.mjs --update-baselines
 *
 * ⚠️ 浏览器夹具：playwright chromium-headless-shell 在 luban 下载不到，走
 *    ALTAR_CHROME_PATH（scripts/lib/chromium-launch.mjs），与 audit:entry 同一夹具。
 * ⚠️ 软栅格串行铁律：与其他浏览器取证脚本不并行（并发 OOM/SIGKILL）。
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { chromiumLaunchOptions } from '../lib/chromium-launch.mjs';
import { decodePng, analyze } from '../../tools/capture/lib/png-probe.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_DIR = join(ROOT, 'artifacts', 'e2e-baselines');
const RUN_DIR = join(ROOT, 'artifacts', 'e2e');
const URL_ = 'http://127.0.0.1:3102/tools/capture/capture.html';
const PORT = 3102;
const UPDATE = process.argv.includes('--update-baselines');
const CHROME = process.env.ALTAR_CHROME_PATH
  ?? '/home/ben/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome';
process.env.ALTAR_CHROME_PATH ??= CHROME; // 夹具缺省：luban 上 playwright 二进制下载不可达

const ARGS_SOFTWARE = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'
];

// ── 基线签名：24×14 网格平均亮度（Rec.709）+ 整图非黑/发光比 ──────────────────
const GRID_X = 24;
const GRID_Y = 14;
const TOL_CELL = 12;      // 每格平均亮度容差（0-255）；覆盖墙钟动画相位差
const TOL_RATIO = 0.08;   // 整图非黑/发光比容差

function gridSignature(buf) {
  const png = decodePng(buf);
  const { width, height, channels, data } = png;
  const stride = channels; // 3=RGB / 4=RGBA（decodePng 输出字段：width/height/channels/data）
  const cellW = width / GRID_X;
  const cellH = height / GRID_Y;
  const sig = [];
  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      let sum = 0, n = 0;
      const x0 = Math.floor(gx * cellW), x1 = Math.floor((gx + 1) * cellW);
      const y0 = Math.floor(gy * cellH), y1 = Math.floor((gy + 1) * cellH);
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * width + x) * stride;
          const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          sum += lum; n++;
        }
      }
      sig.push(Math.round((sum / Math.max(1, n)) * 10) / 10);
    }
  }
  const overall = analyze(buf);
  return {
    grid: sig,
    nonBlack: overall.nonBlackRatio,
    bright: overall.brightPixels / Math.max(1, overall.totalPixels),
    width, height
  };
}

function compareSig(name, base, now) {
  const problems = [];
  if (base.width !== now.width || base.height !== now.height) {
    problems.push(`${name}: 尺寸 ${base.width}x${base.height} → ${now.width}x${now.height}`);
    return problems;
  }
  let maxDiff = 0, worst = -1;
  for (let i = 0; i < base.grid.length; i++) {
    const d = Math.abs(base.grid[i] - now.grid[i]);
    if (d > maxDiff) { maxDiff = d; worst = i; }
  }
  if (maxDiff > TOL_CELL) {
    problems.push(`${name}: 网格亮度最大差 ${maxDiff}（格 ${worst}，容差 ${TOL_CELL}）`);
  }
  for (const k of ['nonBlack', 'bright']) {
    if (Math.abs(base[k] - now[k]) > TOL_RATIO) {
      problems.push(`${name}: ${k} ${base[k].toFixed(3)} → ${now[k].toFixed(3)}（容差 ${TOL_RATIO}）`);
    }
  }
  return problems;
}

// ── 微型断言器 ────────────────────────────────────────────────────────────────
const failures = [];
const notes = [];
let passCount = 0;
function ok(cond, msg) {
  if (cond) { passCount++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── dev server ───────────────────────────────────────────────────────────────
async function startServer() {
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: 'ignore', detached: true
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/tools/capture/capture.html`);
      if (res.ok) return child;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('vite dev server 10s 内未就绪');
}

// ── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(BASELINE_DIR, { recursive: true });
  mkdirSync(RUN_DIR, { recursive: true });
  console.log(`\n══ 场景级 E2E · ceremony 三契约（${UPDATE ? '重建基线' : '对比基线'}）══`);

  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch(chromiumLaunchOptions(ARGS_SOFTWARE));
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(URL_, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__altarReady === true, null, { timeout: 30000 });
    await sleep(800); // 首批帧 + applyCeremonyView 整写落位

    const shot = async (name) => {
      const p = join(RUN_DIR, `${name}.png`);
      await page.screenshot({ path: p });
      return gridSignature(readFileSync(p));
    };
    
    // ══ S1 换席刷新：真点击 → activeSeat 刷新 ═══════════════════════════════
    console.log('\n── S1 换席刷新（canvas 真点击 → raycast → setActiveSeat）──');
    await page.evaluate(() => window.__capture.seek(600)); // naming 中段，席 1..24 已触发
    await sleep(500);
    ok(await page.evaluate(() => window.__capture.e2e.activeSeat()) === 1, '起坛默认活跃席 = 1');

    const shots = {};
    for (const seatId of [5, 24]) {
      const pos = await page.evaluate((s) => window.__capture.e2e.screenPosOf(s), seatId);
      ok(pos.visible, `席位 ${seatId} 投影可见（屏幕 ${(pos.x | 0)},${pos.y | 0}）`);
      await page.mouse.click(pos.x, pos.y); // 真实输入：pointer 事件链 → raycast → 换席
      await sleep(400);
      const got = await page.evaluate(() => window.__capture.e2e.activeSeat());
      ok(got === seatId, `真点击席位 ${seatId} → activeSeat 刷新为 ${got}`);
      shots[`s1-seat${String(seatId).padStart(2, '0')}`] = await shot(`s1-seat${String(seatId).padStart(2, '0')}`);
    }

    // ══ S2 silence 幂等：重入 + 重复 seek 状态逐字段相等 ════════════════════
    console.log('\n── S2 silence 幂等（1760 → 1780 → 1760 → 1760）──');
    // 幂等的正确量法：seek 后**立读**（时钟自走是 #4 不变量，读数漂移是 harness 延迟而非状态分歧）。
    // 落位精度 |elapsed-1760| ≤ 0.5s；派生状态（phase/lit/activeSeat/fog/相机）三访逐字段相等。
    await page.evaluate(() => window.__capture.seek(1760));
    const snapA = await page.evaluate(() => window.__capture.e2e.snapshot());
    await sleep(500);
    shots['s2-silence-a'] = await shot('s2-silence-a');

    await page.evaluate(() => window.__capture.seek(1780));
    await sleep(300);
    await page.evaluate(() => window.__capture.seek(1760)); // 重入
    const snapB = await page.evaluate(() => window.__capture.e2e.snapshot());
    await sleep(500);
    await page.evaluate(() => window.__capture.seek(1760)); // 重复 seek（幂等的关键一枪）
    const snapC = await page.evaluate(() => window.__capture.e2e.snapshot());
    shots['s2-silence-b'] = await shot('s2-silence-b');

    for (const [tag, snap] of [['A', snapA], ['B', snapB], ['C', snapC]]) {
      ok(Math.abs(snap.elapsed - 1760) <= 0.5, `seek(1760) 落位精确（${tag}：${snap.elapsed.toFixed(2)}）`);
    }
    for (const k of ['phase', 'litSeats', 'activeSeat', 'canvasCount', 'fogDensity']) {
      ok(JSON.stringify(snapA[k]) === JSON.stringify(snapB[k]) && JSON.stringify(snapA[k]) === JSON.stringify(snapC[k]),
        `幂等：snapshot.${k} 三访一致（${JSON.stringify(snapA[k])}）`);
    }
    ok(JSON.stringify(snapA.camera) === JSON.stringify(snapB.camera) && JSON.stringify(snapA.camera) === JSON.stringify(snapC.camera),
      '幂等：相机位姿三访一致（applyCeremonyView 整写幂等）');

    // ══ S3 销毁-重建链路 ════════════════════════════════════════════════════
    console.log('\n── S3 销毁-重建（真 destroy 幂等闸 → 同参重建 → 换席复活）──');
    ok(await page.evaluate(() => window.__capture.e2e.canvasCount()) === 1, '销毁前 canvas ×1');
    const rb = await page.evaluate(() => window.__capture.e2e.destroyAndRebuild());
    await sleep(800);
    ok(rb.canvasCount === 1 && (await page.evaluate(() => window.__capture.e2e.canvasCount())) === 1, '重建后 canvas 恰 ×1（旧画布已移除）');
    ok(await page.evaluate(() => window.__capture.e2e.activeSeat()) === 1, '重建后活跃席复位为 1（新实例初始态）');
    await page.evaluate(() => window.__capture.seek(600));
    await sleep(500);
    const pos5 = await page.evaluate((s) => window.__capture.e2e.screenPosOf(s), 5);
    await page.mouse.click(pos5.x, pos5.y);
    await sleep(400);
    ok(await page.evaluate(() => window.__capture.e2e.activeSeat()) === 5, '重建后真点击席位 5 → 换席链路复活');
    shots['s3-rebuilt-seat05'] = await shot('s3-rebuilt-seat05');

    // ══ S4 honor 三态：真 aggregateHonor × toPublicView 对拍 ════════════════
    console.log('\n── S4 honor 三态（up/down/same/new 四态喂入，管理面×公共面对拍）──');
    const ranking = {
      epoch: '2026-10',
      frozenSnapshotId: 'snap-e2e-scene',
      entries: [
        { seatId: 3, node: '青圭', rank: 1, delta: 'up', credits: 500, creditsPrev: 300 },
        { seatId: 4, node: '玄石', rank: 2, delta: 'down', credits: 100, creditsPrev: 400 },
        { seatId: 5, node: '素问', rank: 3, delta: 'same', credits: 200, creditsPrev: 200 },
        { seatId: 6, node: '白露', rank: 4, delta: 'new', credits: 50, creditsPrev: null }
      ],
      diffReasons: []
    };
    const honor = await page.evaluate(
      (r) => window.__capture.e2e.honorRun(r), // anchors 缺省走 harness 内建派生（spiral_events 权威）
      ranking
    );
    ok(honor.epochTag === '2026-10' && honor.seatCount === 4 && honor.excludedCount === 0,
      `聚合口径：epoch/席位 4/排除 0（实际 ${honor.epochTag}/${honor.seatCount}/${honor.excludedCount}）`);
    const adminSet = new Set(honor.adminDeltas.map((d) => d.changed));
    const pubSet = new Set(honor.publicDeltas.map((d) => d.changed));
    for (const st of ['up', 'down', 'same', 'new']) {
      ok(adminSet.has(st), `管理面三态含 ${st}`);
      ok(pubSet.has(st), `公共面三态含 ${st}`);
    }
    ok(JSON.stringify(honor.adminDeltas) === JSON.stringify(honor.publicDeltas),
      '管理面×公共面 changed 逐席一致');
    ok(honor.publicFields.includes('periodTag') && honor.publicFields.includes('badges')
      && honor.publicFields.includes('vacantApex') && honor.publicFields.includes('seatDomainSize'),
      '公共视图字段集穷举（periodTag/badges/vacantApex/seatDomainSize）');

    // ══ 收尾：无未捕获异常 ══════════════════════════════════════════════════
    ok(pageErrors.length === 0, `全程无未捕获异常（${pageErrors.length}）`);
    if (pageErrors.length) notes.push(`pageErrors: ${pageErrors.slice(0, 3).join(' | ')}`);

    // ══ 基线对比 / 重建 ═════════════════════════════════════════════════════
    const manifestPath = join(BASELINE_DIR, 'manifest.json');
    const manifest = UPDATE
      ? { updatedAt: new Date().toISOString(), scenes: {} }
      : (existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : null);
    if (!UPDATE && !manifest) {
      failures.push('基线不存在——先跑 --update-baselines 建立基线');
    } else {
      console.log('\n── 基线对比（24×14 网格亮度签名）──');
      for (const [name, sig] of Object.entries(shots)) {
        if (UPDATE) {
          manifest.scenes[name] = sig;
          writeFileSync(join(BASELINE_DIR, `${name}.png`), readFileSync(join(RUN_DIR, `${name}.png`)));
          console.log(`  ↻ ${name} 基线已重建`);
        } else {
          const base = manifest.scenes[name];
          if (!base) { failures.push(`${name}: 基线缺失`); continue; }
          const problems = compareSig(name, base, sig);
          if (problems.length) failures.push(...problems);
          else console.log(`  ✓ ${name} 与基线结构一致`);
        }
      }
      // honor 三态基线（JSON 口径，可对比）
      const honorSig = { epochTag: honor.epochTag, seatCount: honor.seatCount, excludedCount: honor.excludedCount, deltas: honor.adminDeltas };
      if (UPDATE) {
        manifest.scenes['s4-honor-deltas'] = honorSig;
      } else {
        const base = manifest.scenes['s4-honor-deltas'];
        ok(base && JSON.stringify(base) === JSON.stringify(honorSig), 's4-honor-deltas 与基线一致');
      }
      if (UPDATE) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    }

    // ══ 总 verdict ══════════════════════════════════════════════════════════
    writeFileSync(join(RUN_DIR, 'last-run.json'), JSON.stringify({
      at: new Date().toISOString(), update: UPDATE, pass: passCount,
      failures, notes, scenes: Object.keys(shots)
    }, null, 2) + '\n');
    console.log(`\n${'═'.repeat(24)} 总账 ${'═'.repeat(24)}`);
    console.log(`PASS ${passCount} · FAIL ${failures.length}${notes.length ? ` · notes: ${notes.join('; ')}` : ''}`);
    if (failures.length) {
      for (const f of failures) console.log(`  ✗ ${f}`);
      process.exitCode = 1;
    } else {
      console.log(UPDATE ? '✅ 全部通过，基线已重建（提交 artifacts/e2e-baselines/）' : '✅ 全部通过：场景可复跑，基线对比一致');
    }
  } finally {
    if (browser) await browser.close();
    try { process.kill(-server.pid); } catch { /* already gone */ }
  }
}

main().catch((e) => { console.error(`E2E 崩溃: ${e}`); process.exit(1); });
