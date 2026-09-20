import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(resolve(tmpdir(), 'prime-'));
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/primeDiagonal.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'prime.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const P = await import(pathToFileURL(resolve(tmp, 'prime.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

assert.ok(P.isPrimeDiagonal({grid_x:0,grid_z:0},{grid_x:2,grid_z:2}), '对角线');
assert.ok(!P.isPrimeDiagonal({grid_x:0,grid_z:0},{grid_x:2,grid_z:3}), '非对角线');
assert.ok(!P.isPrimeDiagonal({grid_x:0,grid_z:0},{grid_x:5,grid_z:5}), '距离过远');
console.log(`prime-diagonal: 对角线检测正确`);
