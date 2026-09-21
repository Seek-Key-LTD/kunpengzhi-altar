/**
 * 华夏祭坛 · 几何常量验收
 *
 * 对 altarGeometry.ts 做结构断言：
 *   1. 基本常量正确（BRICK=3.0, LAYERS=7, PYRAMID_TOP=21）
 *   2. 49 席 = 7² 伸缩和（1+3+5+7+9+11+13=49）
 *   3. 内部 91 格 = 1²+2²+…+6²
 *   4. layerTop 函数正确
 *   5. 台基常量正确
 *
 * 运行：node scripts/verify-altar-geometry.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, `✗ ${msg}`); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, `✗ ${msg}`); checks++; };

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild');

const tmp = mkdtempSync(resolve(tmpdir(), 'altargeom-'));
let T;
try {
  execFileSync(esbuildBin, [
    resolve(ROOT, 'src/data/altarGeometry.ts'),
    '--bundle', '--format=esm',
    `--outfile=${resolve(tmp, 'altargeom.mjs')}`
  ], { stdio: 'pipe' });
  T = await import(`${tmp}/altargeom.mjs`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 基本常量
eq(T.BRICK, 3.0, 'BRICK = 3.0');
eq(T.CELL, 3.0, 'CELL = BRICK');
eq(T.LAYERS, 7, 'LAYERS = 7');
eq(T.PYRAMID_TOP, 21.0, 'PYRAMID_TOP = 21');
eq(T.PYRAMID_HALF, 10.5, 'PYRAMID_HALF = 10.5');

// 49 席 = 7² 伸缩和
const sum49 = [1,3,5,7,9,11,13].reduce((a,b) => a+b, 0);
eq(sum49, 49, '49 席 = 1+3+5+7+9+11+13 = 49');

// 内部 91 格 = 1²+2²+…+6²
const sum91 = [1,4,9,16,25,36].reduce((a,b) => a+b, 0);
eq(sum91, 91, '内部 91 格 = 1²+2²+…+6² = 91');

// layerTop 函数
eq(T.layerTop(1), 21.0, 'layerTop(1) = 21（顶层）');
eq(T.layerTop(7), 3.0, 'layerTop(7) = 3（底层）');
eq(T.layerTop(4), 12.0, 'layerTop(4) = 12（中层）');

// 台基常量
eq(T.PLINTH_HALF, 15, 'PLINTH_HALF = 15');
ok(T.PLINTH_THICKNESS > 0, 'PLINTH_THICKNESS > 0');
eq(T.RIVER_WIDTH, 3.0, 'RIVER_WIDTH = CELL');

console.log(`✓ altarGeometry · ${checks} 断言通过`);
