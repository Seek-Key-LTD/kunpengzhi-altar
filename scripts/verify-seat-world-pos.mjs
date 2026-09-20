import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(resolve(tmpdir(), 'swp-'));
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/seatWorldPos.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'swp.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const W = await import(pathToFileURL(resolve(tmp, 'swp.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

const p = W.seatWorldPos({ grid_x: 2, grid_z: -3, elevation: 4.5 }, 3);
assert.deepEqual(p, { x: 6, y: 4.62, z: -9 }, '世界坐标正确');
console.log(`seat-world-pos: grid→世界坐标正确`);
