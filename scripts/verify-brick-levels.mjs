import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(resolve(tmpdir(), 'brick-'));
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/brickLevels.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'brick.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const B = await import(pathToFileURL(resolve(tmp, 'brick.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

assert.equal(B.brickLevels(0, 1), 1, '至少 1 层');
assert.equal(B.brickLevels(1.4, 1), 1, '1.4 层砖');
assert.equal(B.brickLevels(1.6, 1), 2, '1.6 层砖');
console.log(`brick-levels: 砖层数计算正确`);
