#!/usr/bin/env node
/**
 * 华夏祭坛 · 性能预算门禁（CI 用）
 * ============================================================================
 *
 * 调 tools/perf/measure.mjs 真测四探针（这里直接 import runMeasure，一条命令
 * 量完即裁），对照 tools/perf/budget.json：
 *
 *   · 任一探针 FAIL（实测超预算）  → 打印红色摘要，exit 1（门禁咬合）
 *   · 探针 SKIP（环境确实测不了）  → 黄色警告，不算红（fail-open，但 CI 日志可见）
 *   · 全部 PASS                    → 绿色汇总，exit 0
 *
 * 运行：
 *   npm run perf:budget    # = node tools/perf/check-budget.mjs
 *   npm run build && npm run perf:budget   # 本地完整复测（build → 量 → 裁）
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMeasure } from './measure.mjs';

// ── 终端着色（CI 无 TTY 时降级为纯文本标记）──────────────────────────────────
const RED = process.stdout.isTTY ? '\x1b[31m' : '';
const YELLOW = process.stdout.isTTY ? '\x1b[33m' : '';
const GREEN = process.stdout.isTTY ? '\x1b[32m' : '';
const BOLD = process.stdout.isTTY ? '\x1b[1m' : '';
const OFF = process.stdout.isTTY ? '\x1b[0m' : '';

/** 预算行渲染：探针名 + 判据明细（pass/fail/skip 统一走这里，口径只有一份）。 */
function budgetLines(name, p) {
  if (!p) return [`  ${name}: 无结果`];
  if (p.status === 'skip') return [`  ${name}: SKIP —— ${p.reason}`];
  const { metrics: mt, budget: b, status } = p;
  switch (name) {
    case 'frame':
      return [
        `  frame: ${status.toUpperCase()}  p50=${mt.p50_ms}ms/≤${b.p50_ms_max}  p99=${mt.p99_ms}ms/≤${b.p99_ms_max}  (${mt.samples}帧/${b.sample_seconds}s)`
      ];
    case 'render':
      return [
        `  render: ${status.toUpperCase()}  空闲更新=${mt.updates_per_sec}批/s/≤${b.updates_per_sec_max}  (${mt.batches}批/${mt.sample_seconds}s)`
      ];
    case 'bundle':
      return [
        `  bundle: ${status.toUpperCase()}  总gzip=${mt.total_gzip_kb}KB/≤${b.total_gzip_kb_max}  主chunk=${mt.main_chunk_gzip_kb}KB/≤${b.main_chunk_gzip_kb_max} (${mt.main_chunk_file})`
      ];
    case 'memory':
      return [
        `  memory: ${status.toUpperCase()}  堆增量=${mt.growth_mb}MB/≤${mt.allowance_mb}  比率=${mt.growth_ratio}/≤${b.growth_ratio_max}  (${mt.cycles}循环)`
      ];
    default:
      return [`  ${name}: ${status}`];
  }
}

async function main() {
  console.log('[gate] 开始性能预算门禁：build 产物 → 四探针实测 → 对照 budget.json');
  const report = await runMeasure();
  const entries = Object.entries(report.probes);

  const fails = entries.filter(([, p]) => p?.status === 'fail');
  const skips = entries.filter(([, p]) => p?.status === 'skip');
  const passes = entries.filter(([, p]) => p?.status === 'pass');

  console.log('');
  for (const [name, p] of skips) {
    for (const line of budgetLines(name, p)) console.log(`${YELLOW}[gate] 警告${OFF} ${line}`);
  }

  // fail-closed：浏览器侧探针（frame/render/memory）一个都没真正测成 → 无从取证，
  // 不得装绿。SKIP 只允许作为「个别探针测不了」的局部豁免，不允许整机楔死时
  // 靠 fail-open 溜过去（实测踩过：外接盘楔死 → 三探针全 SKIP → 假绿）。
  const browserProbes = entries.filter(([n]) => ['frame', 'render', 'memory'].includes(n));
  const browserPassed = browserProbes.filter(([, p]) => p?.status === 'pass').length;
  if (fails.length === 0 && browserPassed === 0) {
    console.log('');
    console.log(`${RED}${BOLD}[gate] 取证失败 —— 浏览器侧探针无一实测成功（见上方 SKIP 原因），门禁 fail-closed：${OFF}`);
    console.log(`${RED}[gate] 先排查测量环境（vite preview / chromium / 磁盘 I/O），不得视为通过。${OFF}`);
    process.exitCode = 1;
    return;
  }

  if (fails.length > 0) {
    console.log('');
    console.log(`${RED}${BOLD}[gate] 性能预算超支 —— 以下探针越线，禁止合入：${OFF}`);
    for (const [name, p] of fails) {
      for (const line of budgetLines(name, p)) console.log(`${RED}[gate] 超支${OFF} ${line}`);
    }
    console.log(
      `${RED}[gate] 校准口径见 docs/perf-budget.md：换 GPU/机器后先按流程重新校准 budget.json，勿无脑放宽。${OFF}`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `${GREEN}[gate] 全部预算内：${passes.map(([n]) => n).join(' / ')}（${report.machine.hostname} · ${report.timestamp}）${OFF}`
  );
  if (skips.length > 0) {
    console.log(
      `${YELLOW}[gate] 注意：${skips.map(([n]) => n).join('、')} 探针被跳过（见上方原因），门禁对该项 fail-open。${OFF}`
    );
  }
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(`[gate] 门禁无法执行：${err?.stack || err}`);
  process.exitCode = 1;
});
