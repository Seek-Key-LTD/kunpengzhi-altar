/**
 * 内环壁碑 · 纯函数验收
 * 运行：node scripts/verify-stela-ring.mjs
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

const tmp = mkdtempSync(resolve(tmpdir(), 'stela-'));
try {
  execFileSync(esbuildBin, [resolve(ROOT, 'src/data/stelaRing.ts'), '--bundle', '--format=esm', `--outfile=${resolve(tmp, 'stela.mjs')}`], { stdio: 'pipe' });
  const T = await import(`${tmp}/stela.mjs`);
  ok(typeof T.pickStelaEvents === 'function', '有 pickStelaEvents');
  ok(typeof T.stelaPose === 'function', '有 stelaPose');
  const evs = Array.from({length: 16}, (_, i) => ({grid_x: 3, grid_z: i - 8, elevation: 1, seat_id: i+1}));
  const picked = T.pickStelaEvents(evs, 16);
  ok(picked.length > 0 && picked.length < 16, `隔一选一数量合理（实际 ${picked.length}）`);
  const pose = T.stelaPose({grid_x: 3, grid_z: 0, elevation: 10}, 3, 3, 2);
  ok(typeof pose.x === 'number', '有 x');
  ok(typeof pose.y === 'number', '有 y');
  ok(typeof pose.z === 'number', '有 z');
  ok(typeof pose.nx === 'number', '有 nx');
  ok(typeof pose.nz === 'number', '有 nz');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`✓ stelaRing · ${checks} 断言通过`);
