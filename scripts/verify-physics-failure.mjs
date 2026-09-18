/**
 * #5 · 受控物理失败日志样例（离线，node 可跑）。
 *
 * 用**真模块** `src/three/AltarWaterLiftEngine.ts` 现场 esbuild 打包后 import：
 *   1. 先证默认参数（H=7 / m0=5 / m_water=10）**全部合格**、能正常建场；
 *   2. 再把「水梯质量 / 全高 / 反冲」推到**越界**，捕获引擎抛出的**明确日志**
 *      （哪一环 · 期望 vs 实际 · 判定），证明失败被精确归因、且**拒绝建场**。
 *
 * 日志格式（构造函数的 console.error）：
 *   [物理自检] 环节=<stage> 期望=<expected> 实际=<actual> 判定=失败
 *
 * 运行：node scripts/verify-physics-failure.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const log = (m) => console.log(`   · ${m}`);

const esbuild = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuild), '缺少 esbuild（vite 内置依赖）');
const tmp = mkdtempSync(resolve(tmpdir(), 'physfail-'));
let mod;
try {
  execFileSync(esbuild, [
    resolve(ROOT, 'src/three/AltarWaterLiftEngine.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'engine.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  mod = await import(pathToFileURL(resolve(tmp, 'engine.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const { AltarWaterLiftEngine, checkWaterLiftParams } = mod;
ok(typeof AltarWaterLiftEngine === 'function', '真模块必须导出 AltarWaterLiftEngine');
ok(typeof checkWaterLiftParams === 'function', '真模块必须导出 checkWaterLiftParams');

// ── 1. 默认参数：全部合格、可建场 ─────────────────────────────────────────
const defaults = checkWaterLiftParams();
ok(defaults.every((c) => c.ok), '默认水梯参数必须全部合格');
const good = new AltarWaterLiftEngine({ height: 7.0, bucketMass: 5.0, initialWater: 10.0 });
ok(good.state.mA === 10.0 && good.H === 7.0, '默认参数应能正常建场（mA=10, H=7）');
log(`默认参数合格：${defaults.map((c) => c.stage).join(' / ')} ✓`);

// ── 2. 受控失败：把参数推到越界 ────────────────────────────────────────────
const bad = { height: 140.0, bucketMass: -3.0, initialWater: -1.0, recoilSpeed: 999.0 };
const badChecks = checkWaterLiftParams(bad);
const failedStages = badChecks.filter((c) => !c.ok);
ok(failedStages.length >= 3, `越界参数必须被检出 ≥3 项（实测 ${failedStages.length}）`);

// 捕获构造期间的 console.error 日志 + 抛出
const captured = [];
const origError = console.error;
console.error = (...args) => { captured.push(args.join(' ')); };
let thrown = null;
try {
  // eslint-disable-next-line no-new
  new AltarWaterLiftEngine(bad);
} catch (e) {
  thrown = e;
} finally {
  console.error = origError;
}

ok(thrown instanceof Error, '越界参数必须抛错（拒绝建场）');
const selfCheckLines = captured.filter((l) => l.startsWith('[物理自检]'));
ok(selfCheckLines.length === failedStages.length, '每条越界项都要有一条 [物理自检] 日志');
for (const c of failedStages) {
  ok(
    selfCheckLines.some((l) => l.includes(`环节=${c.stage}`) && l.includes(`期望=${c.expected}`) && l.includes(`实际=${c.actual}`)),
    `日志必须含「环节/期望/实际」三要素：${c.stage}`
  );
}
log(`越界检出 ${failedStages.length} 项，抛出：${thrown.message}`);

console.log('\n──── 受控失败日志样例（stdout 回放）────');
for (const l of selfCheckLines) console.log(l);
console.log('─────────────────────────────────────────\n');

ok(/参数越界/.test(thrown.message), '错误信息必须点明「参数越界」并列出环节');
console.log(`physics-failure: 受控失败被精确归因（${failedStages.length} 环节）· ${checks} 项断言通过`);
