/**
 * Ulam 素数对角线 · 纯函数验收
 * 运行：node scripts/verify-prime-diagonal.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild');

const tmp = mkdtempSync(resolve(tmpdir(), 'prime-'));
try {
  execFileSync(esbuildBin, [resolve(ROOT, 'src/data/primeDiagonal.ts'), '--bundle', '--format=esm', `--outfile=${resolve(tmp, 'prime.mjs')}`], { stdio: 'pipe' });
  const T = await import(`${tmp}/prime.mjs`);
  // |dx|===|dz| 且距离<=3
  ok(T.isPrimeDiagonal({grid_x:0,grid_z:0},{grid_x:1,grid_z:1}), '1,1 是对角线');
  ok(T.isPrimeDiagonal({grid_x:0,grid_z:0},{grid_x:-2,grid_z:2}), '-2,2 是对角线');
  ok(T.isPrimeDiagonal({grid_x:0,grid_z:0},{grid_x:3,grid_z:-3}), '3,-3 是对角线');
  ok(!T.isPrimeDiagonal({grid_x:0,grid_z:0},{grid_x:1,grid_z:0}), '1,0 不是对角线');
  ok(!T.isPrimeDiagonal({grid_x:0,grid_z:0},{grid_x:2,grid_z:1}), '2,1 不是对角线');
  ok(!T.isPrimeDiagonal({grid_x:0,grid_z:0},{grid_x:4,grid_z:4}), '4,4 超距不是对角线');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`✓ primeDiagonal · ${checks} 断言通过`);
