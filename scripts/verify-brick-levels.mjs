/**
 * 砖层数 · 纯函数验收
 * 运行：node scripts/verify-brick-levels.mjs
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

const tmp = mkdtempSync(resolve(tmpdir(), 'brick-'));
try {
  execFileSync(esbuildBin, [resolve(ROOT, 'src/data/brickLevels.ts'), '--bundle', '--format=esm', `--outfile=${resolve(tmp, 'brick.mjs')}`], { stdio: 'pipe' });
  const T = await import(`${tmp}/brick.mjs`);
  eq(T.brickLevels(0, 3), 1, 'elevation=0 → 至少 1 层');
  eq(T.brickLevels(3, 3), 1, 'elevation=3 → 1 层');
  eq(T.brickLevels(6, 3), 2, 'elevation=6 → 2 层');
  eq(T.brickLevels(10.5, 3), 4, 'elevation=10.5 → 4 层');
  eq(T.brickLevels(21, 3), 7, 'elevation=21 → 7 层');
  eq(T.brickLevels(-5, 3), 1, 'elevation=-5 → 至少 1 层');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`✓ brickLevels · ${checks} 断言通过`);
