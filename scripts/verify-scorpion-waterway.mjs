/**
 * 蝎子楔水路的纯几何验收。
 * 不依赖 WebGL/Rapier：常量**一律**从真模块 `src/data/altarGeometry.ts` 现场打包取值，
 * 杜绝「脚本自抄一份 BRICK/CELL/PYRAMID_TOP → 与源码漂移」。CI 先把错误拓扑、
 * 反坡和露天水路挡在合并前。
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

const tmp = mkdtempSync(resolve(tmpdir(), 'waterway-'));
let geo;
try {
  execFileSync(esbuild, [
    resolve(ROOT, 'src/data/altarGeometry.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'geo.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  geo = await import(pathToFileURL(resolve(tmp, 'geo.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// —— 全部取自真模块，脚本不再自持任何几何常量 ——
const { BRICK, CELL, PYRAMID_TOP, SEATS_PER_LEVEL, DROP_PER_SEAT, SCORPION_EMBED_DEPTH, ulamCoords } = geo;

const path = ulamCoords(SEATS_PER_LEVEL * 7).map((point, index) => ({
  seat: index + 1,
  ...point,
  y: PYRAMID_TOP - index * DROP_PER_SEAT - SCORPION_EMBED_DEPTH
}));

assert.equal(path.length, 49, '水龙必须恰有 49 个席位节点');
for (let i = 0; i < path.length - 1; i++) {
  const a = path[i];
  const b = path[i + 1];
  assert.equal(Math.abs(a.x - b.x) + Math.abs(a.z - b.z), 1, `${a.seat}→${b.seat} 必须是相邻 Cube 接口`);
  assert.ok(a.y > b.y, `${a.seat}→${b.seat} 必须严格降势`);
  assert.equal(Number((a.y - b.y).toFixed(8)), Number(DROP_PER_SEAT.toFixed(8)), `${a.seat}→${b.seat} 的势差必须恒定`);
}

// 阳 Cube 边长不许为水路让步；水芯必须在 Cube 内部而非外露顶面。
assert.equal(CELL, BRICK, '一个格只能是一枚等边阳 Cube');
for (const point of path) {
  const top = PYRAMID_TOP - (point.seat - 1) * DROP_PER_SEAT;
  assert.ok(point.y < top && point.y > top - BRICK, `第 ${point.seat} 席水芯必须埋在其顶层 Cube 内`);
}

console.log(`scorpion-waterway: 49 nodes, 48 sealed interfaces, Δh=${DROP_PER_SEAT}（常量取自真模块）`);
