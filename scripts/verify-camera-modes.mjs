/**
 * 导演台机位模式 纯数据验收
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(resolve(tmpdir(), 'cam-'));
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/cameraModes.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'cam.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const C = await import(pathToFileURL(resolve(tmp, 'cam.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

// 9 个 mode 都有
const modes = Object.keys(C.CAMERA_MODE_POSES);
assert.equal(modes.length, 9, '9 个机位模式');
for (const m of modes) {
  assert.ok(C.poseWithinSafety(C.CAMERA_MODE_POSES[m]), `${m} 在安全边界内`);
}

// 具体值抽查
assert.deepEqual(C.CAMERA_MODE_POSES.topdown.pos, [0, 78, 0.1], 'topdown 俯视');
assert.deepEqual(C.CAMERA_MODE_POSES.cinematic.pos, [52, 26, 52], 'cinematic');

console.log(`camera-modes: ${modes.length} 个机位模式全在安全边界内`);
