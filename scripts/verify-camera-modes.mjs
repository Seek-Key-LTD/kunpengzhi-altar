/**
 * 导演台机位模式 纯数据验收
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

// ── 单一来源：CAMERA_SAFETY 必须就是 altar.ts 的 guest 档（防第二口径回漂）──
const { execFileSync: exec2 } = await import('node:child_process');
const tmp2 = mkdtempSync(resolve(tmpdir(), 'cam-altar-'));
exec2(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/types/altar.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp2, 'altar.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const A = await import(pathToFileURL(resolve(tmp2, 'altar.mjs')).href);
rmSync(tmp2, { recursive: true, force: true });

// 跨 bundle 是两个模块实例，比对象身份不成立；值必须逐字段相等
assert.deepEqual(C.CAMERA_SAFETY, A.CAMERA_SAFETY_BY_ROLE.guest,
  'CAMERA_SAFETY 必须与 altar.ts 的 guest 档逐字段一致');
assert.equal(C.CAMERA_SAFETY.minY, A.CAMERA_SAFETY_BY_ROLE.guest.minY, 'guest minY 同源');
assert.equal(C.CAMERA_SAFETY.maxRadius, A.CAMERA_SAFETY_BY_ROLE.guest.maxRadius, 'guest maxRadius 同源');
// 源码级同源：cameraModes.ts 不得再手抄 minY/maxRadius 字面量（防回漂成第二口径）
const camSrc = readFileSync(resolve(ROOT, 'src/data/cameraModes.ts'), 'utf8');
assert.ok(/CAMERA_SAFETY_BY_ROLE\.guest/.test(camSrc), 'cameraModes.ts 必须引用 CAMERA_SAFETY_BY_ROLE.guest');
assert.ok(!/minY:\s*0\.3/.test(camSrc), 'cameraModes.ts 不得手抄 minY 字面量（唯一权威在 altar.ts）');

console.log(`camera-modes: ${modes.length} 个机位模式全在安全边界内`);
