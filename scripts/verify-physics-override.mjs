/**
 * 物理引擎调速/子步回归（RFC-007 双桶水梯 · RFC-008 磁浮走马灯）——W3 缺口补测。
 *
 * 覆盖两个此前无门禁的物理契约：
 * 1. 磁浮引擎调速 override 语义（d79c0cf 引入）：默认路径驱动拉回 maxOmega；
 *    setOmegaOverride 期间驱动关闭、双向锁速；clearOmegaOverride 恢复驱动。
 * 2. 水梯引擎子步确定性（a28a295 引入）：相同总时长的「小步多帧」与「大步少帧」
 *    必须收敛到同一状态——帧率无关性回归锚。
 * 两引擎均为纯力学模块（零 import），node 可直接打包断言。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const esbuild = resolve(ROOT, 'node_modules/.bin/esbuild');
assert.ok(existsSync(esbuild), '缺少 esbuild（vite 内置依赖）');

const tmp = mkdtempSync(resolve(tmpdir(), 'physics-'));
let maglevMod, liftMod;
try {
  execFileSync(esbuild, [
    resolve(ROOT, 'src/three/AltarMaglevLanternEngine.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'maglev.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  maglevMod = await import(pathToFileURL(resolve(tmp, 'maglev.mjs')).href);

  execFileSync(esbuild, [
    resolve(ROOT, 'src/three/AltarWaterLiftEngine.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'lift.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  liftMod = await import(pathToFileURL(resolve(tmp, 'lift.mjs')).href);
} finally {
  rmSync(resolve(tmp, 'maglev.mjs'), { recursive: true, force: true });
  rmSync(resolve(tmp, 'lift.mjs'), { recursive: true, force: true });
}

let passed = 0;
function ok(cond, message) {
  assert.ok(cond, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

// ── 套件4 · 磁浮调速 override 语义（RFC-008） ─────────────────────────
console.log('  [4·磁浮 override]');
{
  const { AltarMaglevLanternEngine } = maglevMod;

  // 4.1 默认路径：驱动把 omega 拉回 maxOmega
  const e1 = new AltarMaglevLanternEngine();
  for (let i = 0; i < 600; i++) e1.update(1 / 60);
  ok(Math.abs(e1.state.omega - e1.maxOmega) < 1e-6,
    `默认路径 600 帧后 omega=${e1.state.omega.toFixed(6)} 收敛 maxOmega=${e1.maxOmega.toFixed(6)}`);

  // 4.2 override：驱动关闭，噪声 dt 下双向锁速（含 target=0 完全静止）
  const e2 = new AltarMaglevLanternEngine();
  e2.setOmegaOverride(0.0);
  for (let i = 0; i < 300; i++) e2.update(i % 2 === 0 ? 1 / 60 : 1 / 45, 0.5);
  ok(e2.state.omega === 0.0, 'override(0) 300 帧噪声 dt 后 omega 恒 0（暂停语义）');

  const e3 = new AltarMaglevLanternEngine();
  e3.setOmegaOverride(0.002);
  for (let i = 0; i < 300; i++) e3.update(1 / 60, (i % 7) * 0.1);
  ok(Math.abs(e3.state.omega - 0.002) < 1e-9,
    'override(0.002) 300 帧地脉脉冲下仍锁速（ultra_slow 语义）');

  // 4.3 clear：恢复驱动，omega 回升
  e3.clearOmegaOverride();
  for (let i = 0; i < 600; i++) e3.update(1 / 60);
  ok(e3.state.omega > 0.01,
    `clear 后驱动恢复：600 帧内 omega 从 0.002 回升至 ${e3.state.omega.toFixed(4)}`);
}

// ── 套件5 · 水梯子步确定性（RFC-007） ─────────────────────────────────
console.log('  [5·水梯确定性]');
{
  const { AltarWaterLiftEngine } = liftMod;

  // 同总时长 1.0s：A 走 60×(1/60)，B 走 5×0.2（各自经 accDt 按 1/60 子步消费）
  const a = new AltarWaterLiftEngine();
  const b = new AltarWaterLiftEngine();
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  for (let i = 0; i < 5; i++) b.update(0.2);

  ok(Math.abs(a.state.z - b.state.z) < 1e-9,
    `位移 z 帧率无关：小步 ${a.state.z.toFixed(9)} ≈ 大步 ${b.state.z.toFixed(9)}`);
  ok(Math.abs(a.state.v - b.state.v) < 1e-9,
    `速度 v 帧率无关：${a.state.v.toFixed(9)} ≈ ${b.state.v.toFixed(9)}`);
  ok(Math.abs(a.state.mA - b.state.mA) < 1e-9
    && Math.abs(a.state.mB - b.state.mB) < 1e-9,
    '双桶质量 mA/mB 一致（相变与补水路径同步）');

  // 掉帧不丢时间：一次 0.25s 大 dt 与 0.25s 累计小 dt 等价（残差累积上界 0.25）
  const c = new AltarWaterLiftEngine();
  for (let i = 0; i < 15; i++) c.update(1 / 60);
  const d = new AltarWaterLiftEngine();
  d.update(0.25);
  ok(Math.abs(c.state.z - d.state.z) < 1e-9,
    '一次 0.25s 掉帧 ≡ 15×1/60s 正常帧（残差累积语义）');

  // reset 幂等：同扰动复位后状态逐位一致
  a.reset(0.08);
  b.reset(0.08);
  ok(a.state.z === b.state.z && a.state.v === b.state.v,
    'reset(0.08) 后双实例状态逐位一致');
}

console.log(`\n物理调速/子步回归：${passed} 条断言通过（RFC-007/008）`);
