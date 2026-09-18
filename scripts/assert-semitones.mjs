/**
 * #9 · 49 半音断言（离线，node 可跑，无需 AudioContext）。
 *
 * issue 明确要求用 **Tone** 求音高，而不是手算 MIDI 糊弄 —— 因为 altarAudio
 * 真正发声用的就是 `Tone.Frequency('C2').transpose(seat_id - 1)`。
 * 这里离线核对：n=0→C2、n=48→C6、相邻比值恒 2^(1/12)，并与渲染数据
 * （INITIAL_SPIRAL_EVENTS 的音名 / MIDI）逐一吻合。
 * 实测 Tone 的 Frequency 是纯数学，import 后即可用，**无需 AudioContext shim**。
 */
import assert from 'node:assert/strict';
import * as Tone from 'tone';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };
const close = (a, b, eps, m) => {
  assert.ok(Math.abs(a - b) <= eps, `✗ ${m}（|${a}-${b}|=${Math.abs(a - b)} > ${eps}）`);
  checks++;
};

// 真数据：49 席的音名 / MIDI（esbuild 现场打包，勿手抄）
const esbuild = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuild), '缺少 esbuild（vite 内置依赖）');
const tmp = mkdtempSync(resolve(tmpdir(), 'semi-'));
let spiral;
try {
  execFileSync(esbuild, [
    resolve(ROOT, 'src/data/spiral_events.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'spiral.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  spiral = await import(pathToFileURL(resolve(tmp, 'spiral.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const EVENTS = spiral.INITIAL_SPIRAL_EVENTS;

// ── 49 半音：Tone.Frequency('C2').transpose(n) ──────────────────────
const root = Tone.Frequency('C2');
const SEMI = Math.pow(2, 1 / 12);
const f0 = root.toFrequency();

eq(root.toNote(), 'C2', '根部必须是 C2');
eq(root.toMidi(), 36, 'C2 的 MIDI 必须是 36');
eq(root.transpose(0).toNote(), 'C2', 'transpose(0) 必须 = C2');
eq(root.transpose(48).toNote(), 'C6', 'C2 上移 48 半音必须 = C6');
eq(root.transpose(48).toMidi(), 84, 'C6 的 MIDI 必须是 84');
close(root.transpose(48).toFrequency() / f0, 16, 1e-9, 'C2→C6 必须正好 4 个八度（×16）');

for (let n = 0; n <= 48; n++) {
  const f = root.transpose(n);
  close(f.toFrequency(), f0 * Math.pow(2, n / 12), 1e-6, `第 ${n + 1} 席频率必须 = C2×2^(${n}/12)`);
  if (n > 0) {
    close(f.toFrequency() / root.transpose(n - 1).toFrequency(), SEMI, 1e-9,
      `第 ${n}→${n + 1} 席相邻比值必须 = 2^(1/12)`);
  }
  eq(f.toMidi(), 36 + n, `第 ${n + 1} 席 MIDI 必须 = ${36 + n}`);
}

// ── 与渲染数据逐一吻合（Tone 现场算 == INITIAL_SPIRAL_EVENTS）────────
eq(EVENTS.length, 49, 'events 必须恰 49 席');
for (const ev of EVENTS) {
  const n = ev.seat_id - 1;
  eq(root.transpose(n).toNote(), ev.midi_note_name, `第 ${ev.seat_id} 席音名必须与数据一致`);
  eq(root.transpose(n).toMidi(), ev.midi_note, `第 ${ev.seat_id} 席 MIDI 必须与数据一致`);
}

console.log(`semitones: C2→C6 全 49 半音离线核对（Tone.Frequency）· ${checks} 项断言通过`);
