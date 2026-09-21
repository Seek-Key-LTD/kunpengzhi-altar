/**
 * 席位世界坐标 · 纯函数验收
 * 运行：node scripts/verify-seat-world-pos.mjs
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

const tmp = mkdtempSync(resolve(tmpdir(), 'seatpos-'));
try {
  execFileSync(esbuildBin, [resolve(ROOT, 'src/data/seatWorldPos.ts'), '--bundle', '--format=esm', `--outfile=${resolve(tmp, 'seatpos.mjs')}`], { stdio: 'pipe' });
  const T = await import(`${tmp}/seatpos.mjs`);
  const p = T.seatWorldPos({grid_x:0, grid_z:0, elevation:10}, 3);
  eq(p.x, 0, 'x=0');
  eq(p.z, 0, 'z=0');
  eq(p.y, 10 + T.SEAT_OFFSET_Y, `y=elevation+offset（${p.y}）`);
  const p2 = T.seatWorldPos({grid_x:3, grid_z:-2, elevation:7}, 3);
  eq(p2.x, 9, 'x=3*3=9');
  eq(p2.z, -6, 'z=-2*3=-6');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`✓ seatWorldPos · ${checks} 断言通过`);
