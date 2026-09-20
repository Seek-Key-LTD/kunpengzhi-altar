/**
 * 席位光迹 · 对数螺线点 纯函数验收
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(resolve(tmpdir(), 'trail-'));
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/seatTrail.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'trail.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const T = await import(pathToFileURL(resolve(tmp, 'trail.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

// 49 条光迹
assert.equal(T.TRAIL_COUNT, 49, '49 条光迹');

// 每席 49 个点（0..48）
const p1 = T.seatTrailPoints(1);
assert.equal(p1.length, 49, '每席 49 个点');

// 起点 = 音龙节点

// 终点比起点高（rise 0.45）
assert.ok(p1[48].y > p1[0].y, '终点比起点高');

// 高音乐席 b 更小 → 螺线更紧 → 终点半径更小
const p49 = T.seatTrailPoints(49);
const r1 = Math.hypot(p1[48].x, p1[48].z);
const r49 = Math.hypot(p49[48].x, p49[48].z);
assert.ok(r49 < r1, '高音席螺线更紧（终点半径更小）');

console.log(`seat-trail: 49 条光迹，每席 49 点，高音更紧`);
