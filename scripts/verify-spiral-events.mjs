/**
 * 螺旋事件 · 数据契约验收
 *
 * 对 spiral_events.ts 做结构断言：
 *   1. 49 席事件齐全
 *   2. 每席有 seat_id / layer / spiral_index / grid_x / grid_z / elevation / midi_note
 *   3. seat_id 范围 1–49
 *   4. midi_note 在 C2–C6 范围内（36–84）
 *   5. 无重复 seat_id
 *
 * 运行：node scripts/verify-spiral-events.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, `✗ ${msg}`); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, `✗ ${msg}`); checks++; };

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild');

const tmp = mkdtempSync(resolve(tmpdir(), 'spiral-'));
let T;
try {
  execFileSync(esbuildBin, [
    resolve(ROOT, 'src/data/spiral_events.ts'),
    '--bundle', '--format=esm',
    `--outfile=${resolve(tmp, 'spiral.mjs')}`
  ], { stdio: 'pipe' });
  T = await import(`${tmp}/spiral.mjs`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const events = T.INITIAL_SPIRAL_EVENTS;
ok(Array.isArray(events), 'INITIAL_SPIRAL_EVENTS 是数组');
eq(events.length, 49, '49 席事件齐全');

const seatIds = new Set();
for (const ev of events) {
  // 核心字段齐全
  ok(typeof ev.seat_id === 'number', `席 ${ev.seat_id} 有 seat_id`);
  ok(typeof ev.layer === 'number', `席 ${ev.seat_id} 有 layer`);
  ok(typeof ev.spiral_index === 'number', `席 ${ev.seat_id} 有 spiral_index`);
  ok(typeof ev.grid_x === 'number', `席 ${ev.seat_id} 有 grid_x`);
  ok(typeof ev.grid_z === 'number', `席 ${ev.seat_id} 有 grid_z`);
  ok(typeof ev.elevation === 'number', `席 ${ev.seat_id} 有 elevation`);
  ok(typeof ev.midi_note === 'number', `席 ${ev.seat_id} 有 midi_note`);

  // seat_id 范围 1–49
  ok(ev.seat_id >= 1 && ev.seat_id <= 49, `席 ${ev.seat_id} seat_id 在 1–49`);

  // layer 范围 1–7
  ok(ev.layer >= 1 && ev.layer <= 7, `席 ${ev.seat_id} layer 在 1–7（实际 ${ev.layer}）`);

  // grid 范围 -3–3
  ok(ev.grid_x >= -3 && ev.grid_x <= 3, `席 ${ev.seat_id} grid_x 在 -3–3`);
  ok(ev.grid_z >= -3 && ev.grid_z <= 3, `席 ${ev.seat_id} grid_z 在 -3–3`);

  // midi_note 范围 C2–C6（36–84）
  ok(ev.midi_note >= 36 && ev.midi_note <= 84, `席 ${ev.seat_id} midi_note 在 C2–C6（实际 ${ev.midi_note}）`);

  // 无重复
  ok(!seatIds.has(ev.seat_id), `席 ${ev.seat_id} 无重复`);
  seatIds.add(ev.seat_id);
}

console.log(`✓ spiral_events · ${checks} 断言通过 · ${events.length} 席`);
