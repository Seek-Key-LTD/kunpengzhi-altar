/**
 * 无极泉 · 粒子回收带与生成带同源 · 源码级验收（ea29d5a 防回漂）
 *
 * 背景：AltarScene.ts 的 fountain 粒子回收带曾硬编码 `if (y < 7.2) y = 11.2` ——
 * 那是七级方坛重建前的旧竖井几何残留，粒子会落进坛体中部变成无源悬雨。
 * ea29d5a 改为按 PYRAMID_TOP 推导（+0.5 / +4.5），与 WujiFountainBuilder 的
 * 生成带 [PYRAMID_TOP+0.5, PYRAMID_TOP+0.5+4.0] 同源。
 *
 * 为什么是**源码级**断言（先例：scripts/verify-camera-modes.mjs 对 CAMERA_SAFETY 的处理）：
 * AltarScene 是 three 场景类，回收带常量是 update 循环里的方法内局部量，既不导出
 * 也不宜为测试导出；为防 7.2/11.2 类魔数回漂，在源码文本层面锁三件事：
 *   ① 回收带必须由 PYRAMID_TOP 推导（写死 21.5/25.5 或旧 7.2/11.2 都算回漂——
 *      坛高 LAYERS×BRICK 改动时推导值自动跟随，写死值不会）；
 *   ② 生成带（WujiFountainBuilder）同样必须由 PYRAMID_TOP 推导；
 *   ③ 两条带偏移口径一致：回收 floor ≡ 生成带下沿，回收 respawn ≡ 生成带上沿
 *      （下沿 + 跨度）——改生成带跨度而忘改回收 respawn 会在此判红。
 *
 * 运行：node scripts/verify-fountain-band.mjs（已挂入 npm test）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sceneSrc = readFileSync(resolve(ROOT, 'src/three/AltarScene.ts'), 'utf8');
const builderSrc = readFileSync(resolve(ROOT, 'src/three/WujiFountainBuilder.ts'), 'utf8');

// ── 单一来源：两个文件都必须从 altarGeometry 引入 PYRAMID_TOP ──
assert.match(
  sceneSrc,
  /import\s*\{[^}]*PYRAMID_TOP[^}]*\}\s*from\s*'\.\.\/data\/altarGeometry'/,
  'AltarScene.ts 必须从 data/altarGeometry 引入 PYRAMID_TOP（坛高唯一权威）'
);
assert.match(
  builderSrc,
  /import\s*\{[^}]*PYRAMID_TOP[^}]*\}\s*from\s*'\.\.\/data\/altarGeometry'/,
  'WujiFountainBuilder.ts 必须从 data/altarGeometry 引入 PYRAMID_TOP（坛高唯一权威）'
);

// ── ① 回收带（AltarScene）：必须由 PYRAMID_TOP 推导，比较处只用推导常量 ──
const FLOOR = sceneSrc.match(/const\s+fountainFloorY\s*=\s*PYRAMID_TOP\s*\+\s*([\d.]+)\s*;/);
const RESPAWN = sceneSrc.match(/const\s+fountainRespawnY\s*=\s*PYRAMID_TOP\s*\+\s*([\d.]+)\s*;/);
assert.ok(FLOOR, 'fountainFloorY 必须存在且由 PYRAMID_TOP 推导（禁止写死坛面绝对高度）');
assert.ok(RESPAWN, 'fountainRespawnY 必须存在且由 PYRAMID_TOP 推导（禁止写死生成带绝对高度）');
assert.match(
  sceneSrc,
  /if\s*\(\s*y\s*<\s*fountainFloorY\s*\)\s*y\s*=\s*fountainRespawnY\s*;/,
  '回收判定必须引用 fountainFloorY/fountainRespawnY 常量'
);
// 旧竖井魔数回漂：回收行内不得再出现 y<7.2 / y=11.2 形态的写死比较
assert.doesNotMatch(sceneSrc, /y\s*<\s*7\.2/, '禁止回漂：回收比较不得写死 y<7.2');
assert.doesNotMatch(sceneSrc, /y\s*=\s*11\.2/, '禁止回漂：回收重生不得写死 y=11.2');

// ── ② 生成带（WujiFountainBuilder）：必须由 PYRAMID_TOP 推导 ──
const SPAWN = builderSrc.match(/PYRAMID_TOP\s*\+\s*([\d.]+)\s*\+\s*Math\.random\(\)\s*\*\s*([\d.]+)/);
assert.ok(SPAWN, '生成带必须是 PYRAMID_TOP + 下沿偏移 + Math.random()*跨度（禁止写死绝对高度）');
const spawnFloor = Number(SPAWN[1]);
const spawnSpan = Number(SPAWN[2]);

// ── ③ 两条带同源：回收 floor ≡ 生成带下沿；回收 respawn ≡ 下沿 + 跨度 ──
const floorOffset = Number(FLOOR[1]);
const respawnOffset = Number(RESPAWN[1]);
assert.equal(
  floorOffset, spawnFloor,
  `回收带下沿（PYRAMID_TOP+${floorOffset}）必须等于生成带下沿（PYRAMID_TOP+${spawnFloor}）`
);
assert.equal(
  respawnOffset, Number((spawnFloor + spawnSpan).toFixed(6)),
  `回收带重生高度（PYRAMID_TOP+${respawnOffset}）必须等于生成带上沿（下沿${spawnFloor}+跨度${spawnSpan}）——改生成带跨度须同步回收 respawn`
);

console.log(`fountain-band: 回收带 [PYRAMID_TOP+${floorOffset}, PYRAMID_TOP+${respawnOffset}] 与生成带（下沿+${spawnFloor} 跨度${spawnSpan}）同源 ✓`);
