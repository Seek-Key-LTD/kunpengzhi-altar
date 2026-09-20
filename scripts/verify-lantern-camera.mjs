/**
 * 走马灯章节→机位 纯几何验收
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(resolve(tmpdir(), 'lan-'));
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/lanternCamera.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'lan.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const L = await import(pathToFileURL(resolve(tmp, 'lan.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

// 第1章：angle=0 → 目标在 +Z 方向
const p1 = L.lanternCameraPose(1, 0);
assert.ok(Math.abs(p1.targetX) < 1e-9 && Math.abs(p1.targetZ - 23.5) < 1e-9, '第1章目标在+Z');
assert.ok(Math.abs(p1.camX) < 1e-9 && Math.abs(p1.camZ - 29.7) < 1e-9, '第1章相机在+Z 29.7');
assert.ok(Math.abs(p1.camY - 3.1) < 1e-9, '相机Y=3.1');

// 第5章：angle=4/16*2π=π/2 → 目标在+X
const p5 = L.lanternCameraPose(5, 0);
assert.ok(Math.abs(p5.targetX - 23.5) < 1e-9 && Math.abs(p5.targetZ) < 1e-9, '第5章目标在+X');

// 环体转角偏移：currentGroupAngle 叠加
const p1r = L.lanternCameraPose(1, Math.PI);
assert.ok(Math.abs(p1r.targetX) < 1e-9 && Math.abs(p1r.targetZ + 23.5) < 1e-9, '环体转π后目标在-Z');

// 16章一周
const p16 = L.lanternCameraPose(16, 0);

console.log('lantern-camera: 章节机位几何断言通过');
