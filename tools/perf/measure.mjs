#!/usr/bin/env node
/**
 * 华夏祭坛 · 性能预算四探针（外部观察者 · 零应用代码改动）
 * ============================================================================
 *
 * 与 tools/capture/capture.mjs 同一取证思路：在**真浏览器**（无头 Chromium，
 * WebGL2 经 ANGLE/SwiftShader 软栅格）里加载 `vite preview` 产出的 dist，
 * 从**页面外部**注入采样脚本量取四项指标 —— 不碰 src/ 任何一行：
 *
 *   · frame   公共入口 `/`      收集 sample_seconds 内所有 rAF 相邻间隔
 *                              （performance.now 差值数组），算 P50/P99。
 *   · render  导演台 `#/director` 预置一次性确认（localStorage）后挂
 *                              MutationObserver(childList+attributes+subtree)，
 *                              空闲态计 sample_seconds 内的**变更批次数**
 *                              （observer 回调次数 ≈ DOM 更新批次），算 updates/sec
 *                              —— 这是「导演台 10Hz 轮询重渲染修复」的回归门禁。
 *   · bundle  纯文件侧          遍历 dist/assets/*.js，gzipSync 后算总 gzip 与
 *                              最大单 chunk gzip（当前即公共入口 index-*.js）。
 *   · memory  公共入口 `/`      浏览器启动带 --js-flags=--expose-gc；cycles 个循环 =
 *                              reload → 等挂载 → window.gc() 两次 → 读
 *                              performance.memory.usedJSHeapSize，看 (末-首) 增量。
 *
 * 产物：人读表格（stdout）+ tools/perf/report.json（实测值/预算/pass/时间戳/
 * hostname）。每个探针独立 try/catch：一个测不了只标 FAIL/SKIP，不拖垮其余；
 * **整体门禁裁决不在本脚本** —— exit code 由 check-budget.mjs 对照 budget.json 决定。
 *
 * 运行：
 *   npm run build && npm run perf:measure    # 先有 dist（preview 需要），再量
 *   npm run perf:budget                      # 量完 + 对照预算裁决（CI 用这条）
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { hostname, platform, cpus } from 'node:os';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { chromiumLaunchOptions } from '../../scripts/lib/chromium-launch.mjs';

// ── 常量 ────────────────────────────────────────────────────────────────────
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = resolve(ROOT, 'tools/perf/report.json');
const BUDGET_PATH = resolve(ROOT, 'tools/perf/budget.json');
const DIST_DIR = resolve(ROOT, 'dist');
// 并发防护：同一 runner 上两个门禁同时触发（如 stage+w1 各一份）会撞固定端口
// —— run 349 绿/350 红同 sha 实证。改为每次抢一个空闲端口。
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}
const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;

/** hash 路由 → 路径映射（与 src/main.tsx 的 currentRoute 口径一致）。 */
const ROUTES = { public: '/', director: '/#/director' };
/** 导演台一次性确认的落点（与 DirectorApp 的 CONFIRM_KEY 同值，仅写本浏览器实例）。 */
const DIRECTOR_CONFIRM_SCRIPT = () => {
  try {
    window.localStorage.setItem('altar.director.confirmed', '1');
  } catch {
    /* 隐私模式等拿不到 localStorage 就按未进入态量，不致命 */
  }
};
/**
 * Chromium 无头启动参数 —— 抄 tools/capture/capture.mjs（SwiftShader 软栅格 +
 * 关后台/遮挡节流，否则无头页 rAF 被压到 ~10fps，帧间隔探针全是废数据），
 * 追加 --js-flags=--expose-gc 供 memory 探针手动 GC。
 */
const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion',
  '--js-flags=--expose-gc'
];

// ── 工具 ────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fm2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n));
const kb = (bytes) => bytes / 1024;

/** 预算读取（带兜底缺省：budget.json 缺失时按初始宽口径量，绝不静默崩）。 */
function loadBudget() {
  const fallback = {
    frame: { sample_seconds: 30, p50_ms_max: 34, p99_ms_max: 100, page: 'public' },
    render: { sample_seconds: 15, updates_per_sec_max: 3, page: 'director' },
    bundle: { total_gzip_kb_max: 420, main_chunk_gzip_kb_max: 380 },
    memory: { cycles: 6, growth_mb_max: 25, growth_ratio_max: 0.35, page: 'public' }
  };
  try {
    const raw = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
    // 逐节合并，允许只覆写部分预算
    return {
      frame: { ...fallback.frame, ...raw.frame },
      render: { ...fallback.render, ...raw.render },
      bundle: { ...fallback.bundle, ...raw.bundle },
      memory: { ...fallback.memory, ...raw.memory }
    };
  } catch {
    return fallback;
  }
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

/** 拉起 vite preview（需要 dist）；已在跑则复用并返回 null。 */
async function ensurePreviewServer() {
  if (await reachable(BASE)) return null;
  const viteBin = resolve(ROOT, 'node_modules/.bin/vite');
  const proc = spawn(viteBin, ['preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore'
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await reachable(BASE)) return proc;
    await sleep(200);
  }
  proc.kill('SIGTERM');
  throw new Error(`vite preview 未就绪（30s 超时）：${BASE} —— 确认已 npm run build 产出 dist/`);
}

/**
 * 等待「场景挂载标记」：优先 `.ritual-canvas canvas`（3D 场景真挂上了，frame/memory
 * 探针的有效负载），超时回落 `main.ritual-root`（React 树在场但 3D 没起）。
 * 返回实际命中的标记；两个都没等到则抛错（调用方标 SKIP）。
 */
async function waitMounted(page, timeoutMs = 30000) {
  try {
    await page.waitForFunction(() => !!document.querySelector('main.ritual-root .ritual-canvas canvas'), null, {
      timeout: timeoutMs
    });
    return '.ritual-canvas canvas';
  } catch {
    // 回落等待也要扛得住软栅格的慢建场（实测有 >5s 的挂死式构造）
    await page.waitForFunction(() => !!document.querySelector('main.ritual-root'), null, { timeout: 15000 });
    return 'main.ritual-root(回落)';
  }
}

/** 探针结果骨架 */
const probe = (status, metrics, extra = {}) => ({ status, metrics, ...extra });

/** goto 带一次重试（外接盘 I/O 楔死 / 首次 DNS-style 卡顿会偶发超时，重试能救回来）。 */
async function gotoWithRetry(page, url, timeoutMs = 30000) {
  try {
    return await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
  } catch (e) {
    await sleep(2000);
    return page.goto(url, { waitUntil: 'load', timeout: timeoutMs }).catch((e2) => {
      throw new Error(`goto 两次均失败：${String(e?.message || e).slice(0, 80)} / ${String(e2?.message || e2).slice(0, 80)}`);
    });
  }
}

/** 浏览器探针级重试：偶发楔死重跑一次；再失败才把异常抛给上层标 SKIP。 */
async function withProbeRetry(fn) {
  try {
    return await fn();
  } catch (e) {
    await sleep(2000);
    return fn();
  }
}

// ── 探针 1 · frame：公共入口 rAF 帧间隔 P50/P99 ─────────────────────────────
async function probeFrame(browser, budget) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    await gotoWithRetry(page, `${BASE}${ROUTES[budget.frame.page] ?? '/'}`);
    const marker = await waitMounted(page);
    await sleep(2000); // 让首屏构造/编译着色器的高峰过去，量的是**稳态**帧间隔

    const sampleMs = budget.frame.sample_seconds * 1000;
    const deltas = await page.evaluate(
      (ms) =>
        new Promise((ok) => {
          const deltas = [];
          let last = performance.now();
          const t0 = last;
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              ok(deltas);
            }
          };
          const tick = () => {
            const now = performance.now();
            deltas.push(now - last);
            last = now;
            if (now - t0 >= ms) finish();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          setTimeout(finish, ms + 5000); // 无头 rAF 可能停摆（capture.mjs 已实测），兜底放行
        }),
      sampleMs
    );

    if (!deltas.length) throw new Error('rAF 一帧都没采到（无头环境帧循环停摆？）');
    const sorted = [...deltas].sort((a, b) => a - b);
    const pct = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((q / 100) * sorted.length) - 1))];
    const p50 = pct(50);
    const p99 = pct(99);
    const pass = p50 <= budget.frame.p50_ms_max && p99 <= budget.frame.p99_ms_max;
    return probe(pass ? 'pass' : 'fail', {
      p50_ms: Number(fm2(p50)),
      p99_ms: Number(fm2(p99)),
      samples: deltas.length,
      fps_est_from_p50: Number(fm2(1000 / p50)),
      sample_seconds: budget.frame.sample_seconds,
      mount_marker: marker
    });
  } finally {
    await page.close().catch(() => {});
  }
}

// ── 探针 2 · render：导演台空闲态 DOM 变更批次/秒（10Hz 重渲染回归门禁）──────
async function probeRender(browser, budget) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    await page.addInitScript(DIRECTOR_CONFIRM_SCRIPT); // 预置一次性确认 → 直入导演台工作台
    await gotoWithRetry(page, `${BASE}${ROUTES[budget.render.page] ?? '/#/director'}`);
    const marker = await waitMounted(page);
    await sleep(3000); // 等懒加载 chunk + 建场风暴过去，量的是**空闲态**

    const sampleMs = budget.render.sample_seconds * 1000;
    const counts = await page.evaluate(
      (ms) =>
        new Promise((ok) => {
          const root = document.getElementById('root');
          if (!root) return ok({ batches: 0, mutations: 0, note: 'no #root' });
          let batches = 0;
          let mutations = 0;
          const obs = new MutationObserver((records) => {
            batches += 1; // 一次回调 = 一个变更批次（同一轮任务里的变更被浏览器合并）
            mutations += records.length;
          });
          obs.observe(root, { childList: true, attributes: true, subtree: true });
          const t0 = performance.now();
          setTimeout(() => {
            obs.disconnect();
            ok({ batches, mutations, sampled_ms: performance.now() - t0 });
          }, ms);
        }),
      sampleMs
    );

    const seconds = (counts.sampled_ms ?? sampleMs) / 1000;
    const updatesPerSec = counts.batches / seconds;
    const pass = updatesPerSec <= budget.render.updates_per_sec_max;
    return probe(pass ? 'pass' : 'fail', {
      updates_per_sec: Number(fm2(updatesPerSec)),
      batches: counts.batches,
      mutations: counts.mutations,
      sample_seconds: Number(fm2(seconds)),
      mount_marker: marker
    });
  } finally {
    await page.close().catch(() => {});
  }
}

// ── 探针 3 · bundle：dist 产物 gzip 体积 ────────────────────────────────────
function probeBundle(budget) {
  const assetsDir = resolve(DIST_DIR, 'assets');
  if (!existsSync(assetsDir)) throw new Error('dist/assets 不存在 —— 先 npm run build');
  const files = readdirSync(assetsDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => {
      const raw = readFileSync(resolve(assetsDir, f));
      return { file: f, gzip_kb: Number(fm2(kb(gzipSync(raw).length))), raw_kb: Number(fm2(kb(raw.length))) };
    })
    .sort((a, b) => b.gzip_kb - a.gzip_kb);
  if (!files.length) throw new Error('dist/assets 里没有 .js 产物');

  const totalGzipKb = Number(fm2(files.reduce((s, f) => s + f.gzip_kb, 0)));
  // 「主 chunk」口径：gzip 最大的那个 JS chunk —— 当前即公共入口 index-*.js
  //（导演台/玉玺查看器走懒加载拆分，天然小于入口 chunk）。
  const mainChunk = files[0];
  const pass =
    totalGzipKb <= budget.bundle.total_gzip_kb_max && mainChunk.gzip_kb <= budget.bundle.main_chunk_gzip_kb_max;
  return probe(pass ? 'pass' : 'fail', {
    total_gzip_kb: totalGzipKb,
    main_chunk_gzip_kb: mainChunk.gzip_kb,
    main_chunk_file: mainChunk.file,
    js_chunks: files.length,
    top_chunks: files.slice(0, 5)
  });
}

// ── 探针 4 · memory：公共入口 reload 循环堆增量 ─────────────────────────────
async function probeMemory(browser, budget) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    await gotoWithRetry(page, `${BASE}${ROUTES[budget.memory.page] ?? '/'}`);
    const supported = await page.evaluate(
      () =>
        typeof window.gc === 'function' && !!performance.memory && Number.isFinite(performance.memory.usedJSHeapSize)
    );
    if (!supported) {
      return probe('skip', {}, {
        reason:
          'window.gc / performance.memory 不可用（需 Chromium + --js-flags=--expose-gc 启动）；本探针在当前浏览器下测不了，如实跳过'
      });
    }

    const samples = [];
    for (let i = 0; i < budget.memory.cycles; i++) {
      await page.reload({ waitUntil: 'load', timeout: 30000 });
      await waitMounted(page, 30000);
      await sleep(1500); // 让首帧构造稳定再 GC，避免把建场临时对象算进稳态
      const heap = await page.evaluate(() => {
        window.gc();
        window.gc(); // 两次：第一次标记收走大部分，第二次兜住收尾引用
        return performance.memory.usedJSHeapSize;
      });
      samples.push(heap);
    }

    const firstBytes = samples[0];
    const lastBytes = samples[samples.length - 1];
    const growthBytes = lastBytes - firstBytes;
    const firstMb = kb(firstBytes) / 1024;
    const growthMb = kb(growthBytes) / 1024;
    const growthRatio = firstBytes > 0 ? growthBytes / firstBytes : 0;
    // 断言口径：(末-首) ≤ max(growth_mb_max, growth_ratio_max × 首值) —— 绝对与相对两闸取宽
    const allowanceMb = Math.max(budget.memory.growth_mb_max, budget.memory.growth_ratio_max * firstMb);
    const pass = growthMb <= allowanceMb;
    return probe(pass ? 'pass' : 'fail', {
      first_mb: Number(fm2(firstMb)),
      last_mb: Number(fm2(kb(lastBytes) / 1024)),
      growth_mb: Number(fm2(growthMb)),
      growth_ratio: Number(fm2(growthRatio)),
      allowance_mb: Number(fm2(allowanceMb)),
      cycles: budget.memory.cycles,
      samples_mb: samples.map((s) => Number(fm2(kb(s) / 1024)))
    });
  } finally {
    await page.close().catch(() => {});
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
export async function runMeasure({ writeReport = true, log = (...a) => console.log(...a) } = {}) {
  if (!existsSync(resolve(DIST_DIR, 'index.html'))) {
    throw new Error('dist/ 不存在 —— vite preview 需要 dist，请先 `npm run build`');
  }
  const budget = loadBudget();
  const report = {
    tool: 'altar-perf-budget',
    timestamp: new Date().toISOString(),
    machine: {
      hostname: hostname(),
      platform: platform(),
      cpu: cpus()[0]?.model ?? 'unknown',
      node: process.version
    },
    base_url: BASE,
    budget_path: 'tools/perf/budget.json',
    probes: {}
  };

  const server = await ensurePreviewServer();
  log(`[perf] vite preview ${server ? '已拉起' : '复用现存'}：${BASE}`);
  let browser;
  try {
    browser = await chromium.launch(chromiumLaunchOptions(CHROMIUM_ARGS));
    log('[perf] 无头 Chromium 已起（SwiftShader 软栅格 + expose-gc）');

    // 四探针独立容错：一个测不了只记 FAIL/SKIP，不拖垮其余
    try {
      report.probes.frame = { ...(await withProbeRetry(() => probeFrame(browser, budget))), budget: budget.frame };
    } catch (e) {
      report.probes.frame = probe('skip', {}, { reason: String(e?.message || e), budget: budget.frame });
    }
    try {
      report.probes.render = { ...(await withProbeRetry(() => probeRender(browser, budget))), budget: budget.render };
    } catch (e) {
      report.probes.render = probe('skip', {}, { reason: String(e?.message || e), budget: budget.render });
    }
    try {
      report.probes.bundle = { ...probeBundle(budget), budget: budget.bundle };
    } catch (e) {
      report.probes.bundle = probe('skip', {}, { reason: String(e?.message || e), budget: budget.bundle });
    }
    try {
      report.probes.memory = { ...(await withProbeRetry(() => probeMemory(browser, budget))), budget: budget.memory };
    } catch (e) {
      report.probes.memory = probe('skip', {}, { reason: String(e?.message || e), budget: budget.memory });
    }
  } finally {
    await browser?.close().catch(() => {});
    if (server) server.kill('SIGTERM');
  }

  // ── 人读表格 ──────────────────────────────────────────────────────────────
  const { frame: f, render: r, bundle: b, memory: m } = report.probes;
  const tag = (p) => (p?.status === 'pass' ? 'PASS' : p?.status === 'fail' ? 'FAIL' : 'SKIP');
  log('\n[perf] ── 性能预算实测（对照 tools/perf/budget.json）────────────────');
  log(`[perf] 机器: ${report.machine.hostname} · ${report.machine.platform} · ${report.machine.cpu}`);
  if (f) {
    log(
      f.status === 'skip'
        ? `[perf] frame   SKIP  ${f.reason}`
        : `[perf] frame   ${tag(f)}  p50=${f.metrics.p50_ms}ms (≤${budget.frame.p50_ms_max})  p99=${f.metrics.p99_ms}ms (≤${budget.frame.p99_ms_max})  采样=${f.metrics.samples}帧/${budget.frame.sample_seconds}s  ≈${f.metrics.fps_est_from_p50}fps`
    );
  }
  if (r) {
    log(
      r.status === 'skip'
        ? `[perf] render  SKIP  ${r.reason}`
        : `[perf] render  ${tag(r)}  空闲更新=${r.metrics.updates_per_sec}批/s (≤${budget.render.updates_per_sec_max})  批次=${r.metrics.batches}  变更=${r.metrics.mutations}/${budget.render.sample_seconds}s`
    );
  }
  if (b) {
    log(
      b.status === 'skip'
        ? `[perf] bundle  SKIP  ${b.reason}`
        : `[perf] bundle  ${tag(b)}  总gzip=${b.metrics.total_gzip_kb}KB (≤${budget.bundle.total_gzip_kb_max})  主chunk=${b.metrics.main_chunk_gzip_kb}KB (≤${budget.bundle.main_chunk_gzip_kb_max} · ${b.metrics.main_chunk_file})  chunks=${b.metrics.js_chunks}`
    );
  }
  if (m) {
    log(
      m.status === 'skip'
        ? `[perf] memory  SKIP  ${m.reason}`
        : `[perf] memory  ${tag(m)}  堆增量=${m.metrics.growth_mb}MB (≤${m.metrics.allowance_mb})  首=${m.metrics.first_mb}MB→末=${m.metrics.last_mb}MB  比率=${m.metrics.growth_ratio}  循环=${m.metrics.cycles}`
    );
  }
  log('[perf] ────────────────────────────────────────────────────────────────');

  if (writeReport) {
    // 外接盘 I/O 偶发楔死：带超时写一次，失败重试一次，再失败就如实报错
    await withRetry(() => mkdirSync(dirname(REPORT_PATH), { recursive: true }));
    await withRetry(() => writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8'));
    log(`[perf] 报告已写：${REPORT_PATH}`);
  }
  return report;
}

/** 外接盘单文件操作 >10s 视为楔死：重试/换一次，不死等。 */
async function withRetry(fn, attempts = 2) {
  for (let i = 1; ; i++) {
    try {
      return await Promise.race([
        fn(),
        sleep(10000).then(() => {
          throw new Error('文件操作超 10s（外接盘楔死？）');
        })
      ]);
    } catch (e) {
      if (i >= attempts) throw e;
      await sleep(1000);
    }
  }
}

// ── 直接运行（npm run perf:measure）─────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runMeasure().catch((err) => {
    console.error(`[perf] 失败：${err?.stack || err}`);
    process.exitCode = 1;
  });
}
