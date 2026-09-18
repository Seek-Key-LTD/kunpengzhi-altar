/**
 * #9 · 7×7 正交投影断言（离线，node 可跑）。
 *
 * 把 49 席按**俯视正交投影**（相机沿 -Y 看，视口半宽 = PYRAMID_HALF，丢弃 y）
 * 投到俯视平面，断言投影点精确落在均匀格点上，且恰好铺满 7×7：
 *   · 每点与最近格点的边界误差 e ≤ 1e-4（NDC 单位）；
 *   · 49 点一一落在 7×7 的 49 个格点上（无缝、无叠、全覆盖）；
 *   · 投影包围盒边界 = ±(3×CELL)；
 *   · 渲染数据（INITIAL_SPIRAL_EVENTS 的 grid_x/z）与几何模块 ulamCoords(49) 一致。
 * 常量全部取自真模块，脚本不自持任何几何数字。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EPS = 1e-4;

let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };
const le = (a, b, m) => { assert.ok(a <= b, `✗ ${m}（${a} > ${b}）`); checks++; };

// esbuild 现场打包真模块
const esbuild = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuild), '缺少 esbuild（vite 内置依赖）');
const tmp = mkdtempSync(resolve(tmpdir(), 'ulam-'));
const bundle = (entry, name) => {
  const out = resolve(tmp, name);
  execFileSync(esbuild, [
    resolve(ROOT, entry),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${out}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return pathToFileURL(out).href;
};

let geo, spiral;
try {
  geo = await import(bundle('src/data/altarGeometry.ts', 'geo.mjs'));
  spiral = await import(bundle('src/data/spiral_events.ts', 'spiral.mjs'));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const { CELL, LAYERS, PYRAMID_HALF, SEATS_PER_LEVEL, ulamCoords } = geo;
const EVENTS = spiral.INITIAL_SPIRAL_EVENTS;

eq(EVENTS.length, 49, 'events 必须恰 49 席');
const half = (LAYERS - 1) / 2; // 3（7×7 的格点半宽）
eq(half, 3, '七层方阵的格点半宽必须为 3');

// 俯视正交投影：世界 (x,z) = (grid*CELL, grid*CELL)；相机沿 -Y 看，视口半宽 = PYRAMID_HALF
const project = (gx, gz) => ({ nx: (gx * CELL) / PYRAMID_HALF, nz: (gz * CELL) / PYRAMID_HALF });
const step = CELL / PYRAMID_HALF; // NDC 中相邻席位的格距

let maxErr = 0;
const snapped = new Set();
const rawProjections = new Set();
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
let gridInRange = true;

for (const ev of EVENTS) {
  const { nx, nz } = project(ev.grid_x, ev.grid_z);
  rawProjections.add(`${nx},${nz}`);
  // 与最近格点的边界误差（NDC 单位）
  maxErr = Math.max(maxErr, Math.abs(nx - Math.round(nx / step) * step));
  maxErr = Math.max(maxErr, Math.abs(nz - Math.round(nz / step) * step));
  minX = Math.min(minX, nx); maxX = Math.max(maxX, nx);
  minZ = Math.min(minZ, nz); maxZ = Math.max(maxZ, nz);
  if (Math.abs(ev.grid_x) > half || Math.abs(ev.grid_z) > half) gridInRange = false;
  snapped.add(`${Math.round(nx / step)},${Math.round(nz / step)}`);
}

// 1. 边界误差
le(maxErr, EPS, `正交投影边界误差 e 必须 ≤ ${EPS}（实测 ${maxErr}）`);
// 2. 投影为单射（49 席投出 49 个互异点）
eq(rawProjections.size, 49, '正交投影必须是单射（49 席 49 个互异投影点）');
// 3. 恰好铺满 7×7
eq(snapped.size, 49, '49 席必须落在 49 个互异格点上（无缝无叠）');
ok(gridInRange, '所有席位格点必须落在 ±3 之内');
for (let gx = -half; gx <= half; gx++) {
  for (let gz = -half; gz <= half; gz++) {
    ok(snapped.has(`${gx},${gz}`), `7×7 格点 (${gx},${gz}) 必须有且仅有一席`);
  }
}
// 4. 投影包围盒边界
le(Math.abs(minX - -half * step), EPS, `包围盒 X 下界必须 = ${-half * step}`);
le(Math.abs(maxX - half * step), EPS, `包围盒 X 上界必须 = ${half * step}`);
le(Math.abs(minZ - -half * step), EPS, `包围盒 Z 下界必须 = ${-half * step}`);
le(Math.abs(maxZ - half * step), EPS, `包围盒 Z 上界必须 = ${half * step}`);

// 5. 渲染数据 ↔ 几何模块一致（同一组 7×7 格点）
const eventCells = new Set(EVENTS.map((e) => `${e.grid_x},${e.grid_z}`));
const geomCells = new Set(ulamCoords(SEATS_PER_LEVEL * 7).map((p) => `${p.x},${p.z}`));
eq(eventCells.size, 49, 'events 的格点必须 49 个');
eq(geomCells.size, 49, 'ulamCoords(49) 的格点必须 49 个');
const sameSets = [...eventCells].every((k) => geomCells.has(k));
ok(sameSets, '渲染数据格点集必须与 ulamCoords(49) 完全一致（无漂移）');

console.log(`ulam-projection: 49 席正交投影铺满 7×7，边界误差 e=${maxErr} ≤ ${EPS}· ${checks} 项断言通过`);
