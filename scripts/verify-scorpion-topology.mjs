import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(resolve(tmpdir(), 'scorp-'));
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/scorpionTopology.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'scorp.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const S = await import(pathToFileURL(resolve(tmp, 'scorp.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

assert.ok(S.validWedge({grid_x:0,grid_z:0,y:5},{grid_x:1,grid_z:0,y:4}), '相邻降势合法');
assert.ok(!S.validWedge({grid_x:0,grid_z:0,y:5},{grid_x:2,grid_z:0,y:4}), '不相邻非法');
assert.ok(!S.validWedge({grid_x:0,grid_z:0,y:4},{grid_x:1,grid_z:0,y:5}), '不降势非法');
console.log(`scorpion-topology: 拓扑校验正确`);
