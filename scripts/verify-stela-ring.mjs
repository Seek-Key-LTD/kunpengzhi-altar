/**
 * 内环壁碑 纯函数验收
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(resolve(tmpdir(), 'stela-'));
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/stelaRing.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'stela.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const S = await import(pathToFileURL(resolve(tmp, 'stela.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

// 构造一圈外圈事件（max(|x|,|z|)==3）
const events = [];
for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
  if (Math.max(Math.abs(x), Math.abs(z)) === 3) events.push({ grid_x: x, grid_z: z, elevation: 0 });
}
const picked = S.pickStelaEvents(events, 16);
assert.ok(picked.length <= 16, '隔一选一不超过 16');
assert.ok(picked.length > 0, '挑到碑位点');

// 碑位：外圈点贴内壁
const pose = S.stelaPose({ grid_x: 3, grid_z: 0, elevation: 0 }, 3, 1, 0.9);
assert.ok(pose.x > 3 * 3, 'x 在格点外侧（贴内壁）');
assert.ok(pose.nx === 1 && pose.nz === 0, '朝内（朝 -x）');

console.log(`stela-ring: 挑到 ${picked.length} 个碑位点，碑位计算正确`);
