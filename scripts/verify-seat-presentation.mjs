/**
 * 导演台 · 席位讲解/汇报字段验收（seatPresentation）
 *
 * 对 src/director/seatPresentation.ts 做结构断言（全 49 席逐席）：
 *   1. 七个汇报字段全为非空字符串
 *   2. 前 8 席走保留名册（display_name 命中名册）
 *   3. 9..49 席由开放席名表覆盖（不落 `守坛人·N` 兜底）
 *   4. 巡天舟编号恒为两位数字（09..49）——回归「巡天舟·010号」三位脏号
 *   5. harmony_event 三态与 is_finale / is_prime 对位
 *
 * 运行：node scripts/verify-seat-presentation.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild');

const tmp = mkdtempSync(resolve(tmpdir(), 'seatpres-'));
let P, S;
try {
  execFileSync(esbuildBin, [resolve(ROOT, 'src/director/seatPresentation.ts'), '--bundle', '--format=esm', `--outfile=${resolve(tmp, 'pres.mjs')}`], { stdio: 'pipe' });
  execFileSync(esbuildBin, [resolve(ROOT, 'src/data/spiral_events.ts'), '--bundle', '--format=esm', `--outfile=${resolve(tmp, 'events.mjs')}`], { stdio: 'pipe' });
  P = await import(pathToFileURL(resolve(tmp, 'pres.mjs')).href);
  S = await import(pathToFileURL(resolve(tmp, 'events.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const RESERVED_ROSTER = new Set(['青衣', '峨眉', '乐山', '渔阳', '白鹤', '沧浪', '瑶琴', '后土']);
const events = S.INITIAL_SPIRAL_EVENTS;
eq(events.length, 49, '事件表 49 席');

const seenNames = new Set();
for (const ev of events) {
  const p = P.seatPresentation(ev);
  for (const key of ['display_name', 'role_title', 'message_excerpt', 'starship_id', 'starship_name', 'harmony_event', 'camera_target']) {
    ok(typeof p[key] === 'string' && p[key].length > 0, `第 ${ev.seat_id} 席 ${key} 非空字符串`);
  }

  if (ev.seat_id <= 8) {
    ok(RESERVED_ROSTER.has(p.display_name), `保留席 ${ev.seat_id} 命中名册（${p.display_name}）`);
  } else {
    ok(!p.display_name.startsWith('守坛人·'), `开放席 ${ev.seat_id} 应由席名表覆盖，不落兜底（${p.display_name}）`);
    ok(!seenNames.has(p.display_name), `开放席名不重复：${p.display_name}`);
    seenNames.add(p.display_name);
    // 编号恒两位：09..49。回归「巡天舟·010号」三位脏号。
    ok(/^巡天舟·\d{2}号$/.test(p.starship_name), `第 ${ev.seat_id} 席 巡天舟编号两位（${p.starship_name}）`);
  }
}
eq(seenNames.size, 41, '开放席名 41 个（9..49）全覆盖且无重复');

// harmony_event 三态对位
const finale = P.seatPresentation(events[48]);
eq(finale.harmony_event, 'cadence_finale', '第 49 席（终场）harmony_event = cadence_finale');
ok(finale.message_excerpt.includes('四十九席圆满'), '终场席寄语含「四十九席圆满」');
const prime = events.find((e) => e.seat_id > 8 && e.is_prime && !e.is_finale);
eq(P.seatPresentation(prime).harmony_event, 'prime_overtone_chime', `质数席（#${prime.seat_id}）harmony_event = prime_overtone_chime`);
const plain = events.find((e) => e.seat_id > 8 && !e.is_prime && !e.is_finale);
eq(P.seatPresentation(plain).harmony_event, 'chromatic_descent', `普通席（#${plain.seat_id}）harmony_event = chromatic_descent`);

console.log(`✓ seatPresentation · ${checks} 断言通过 · 49 席逐席`);
