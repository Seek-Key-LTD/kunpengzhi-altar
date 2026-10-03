/**
 * 公共入口 1800s 五幕时间轴验收 —— Gitea #8。
 *
 * 用 esbuild 把纯域模块 `src/types/altar.ts` 打到临时 JS 后 import，
 * 对**真实的**幕次映射与 litSeats 爬升做代码级断言：
 *   abyss 0–180(黑场)｜naming 180–1020(litSeats 0→49)｜lanterns 1020–1440(litSeats=49)
 *   ｜extinguishing 1440–1751｜silence 1751–1800。合计 1800s。
 * 并证明：幕次边界恰好落在 {180, 1020, 1440, 1751}，其余区间内稳定（不抖动）。
 *
 * 运行：node scripts/verify-ritual-timeline.mjs   （或 npm run test:ritual）
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, `✗ ${msg}`); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, `✗ ${msg}`); checks++; };

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild（vite 内置依赖）——无法对真数据断言');

const tmp = mkdtempSync(resolve(tmpdir(), 'ritual-'));
let T;
try {
  execFileSync(esbuildBin, [
    resolve(ROOT, 'src/types/altar.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'altar.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  T = await import(pathToFileURL(resolve(tmp, 'altar.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const {
  RITUAL_TOTAL_SEC, RITUAL_ABYSS_END_SEC, RITUAL_NAMING_END_SEC, RITUAL_LANTERNS_END_SEC,
  WUJI_REVEAL_SEC, WUJI_SILENCE_SEC, SEAT_ID_MAX,
  ritualPhaseAt, ritualLitSeatsAt, isTimelineDrivenPhase, wujiRevealStateAt
} = T;

// ── 1. 时长与阈值常量 ───────────────────────────────────────────────
eq(RITUAL_TOTAL_SEC, 1800, '一轮仪式必须恰为 1800s（30 分钟）');
eq(RITUAL_ABYSS_END_SEC, 180, 'abyss 结束必须是 180s');
eq(RITUAL_NAMING_END_SEC, 1020, 'naming 结束必须是 1020s');
eq(RITUAL_LANTERNS_END_SEC, 1440, 'lanterns 结束必须是 1440s（= 24:00）');
eq(WUJI_REVEAL_SEC, 1440, '24:00 阈值必须是 1440s');
eq(WUJI_SILENCE_SEC, 1751, '29:11 阈值必须是 1751s');
ok(RITUAL_LANTERNS_END_SEC === WUJI_REVEAL_SEC, 'lanterns 幕结束必须与 #00 显形阈值同点（1440）');
ok(WUJI_SILENCE_SEC < RITUAL_TOTAL_SEC, '静默点必须早于总时长');

// ── 2. 幕次映射（边界逐点）─────────────────────────────────────────
const cases = [
  [0, 'abyss'], [1, 'abyss'], [179, 'abyss'],
  [180, 'naming'], [600, 'naming'], [1019, 'naming'],
  [1020, 'lanterns'], [1200, 'lanterns'], [1439, 'lanterns'],
  [1440, 'extinguishing'], [1600, 'extinguishing'], [1750, 'extinguishing'],
  [1751, 'silence'], [1799, 'silence'], [1800, 'silence']
];
for (const [sec, phase] of cases) {
  eq(ritualPhaseAt(sec), phase, `t=${sec}s 必须落在 ${phase}`);
}

// ── 3. 五分钟幕次恰好覆盖 [0,1800)，且边界恰为 {180,1020,1440,1751} ──
const phases = ['abyss', 'naming', 'lanterns', 'extinguishing', 'silence'];
const span = {};
let allValid = true;
for (let s = 0; s < RITUAL_TOTAL_SEC; s++) {
  const p = ritualPhaseAt(s);
  if (!phases.includes(p)) allValid = false;
  span[p] = (span[p] || 0) + 1;
}
ok(allValid, '每个整秒的幕次都必须是五幕之一');
eq(span.abyss, 180, 'abyss 必须占 0–180（180s）');
eq(span.naming, 840, 'naming 必须占 180–1020（840s）');
eq(span.lanterns, 420, 'lanterns 必须占 1020–1440（420s）');
eq(span.extinguishing, 311, 'extinguishing 必须占 1440–1751（311s）');
eq(span.silence, 49, 'silence 必须占 1751–1800（49s）');
eq(span.abyss + span.naming + span.lanterns + span.extinguishing + span.silence, 1800, '五幕时长之和必须 = 1800s');

const boundaries = [];
for (let s = 1; s < RITUAL_TOTAL_SEC; s++) {
  if (ritualPhaseAt(s) !== ritualPhaseAt(s - 1)) boundaries.push(s);
}
eq(JSON.stringify(boundaries), JSON.stringify([180, 1020, 1440, 1751]), '幕次切换边界必须恰为 [180,1020,1440,1751]');

// ── 3.5 防双写契约：时间轴 ↔ #00 阈值两侧互斥且覆盖五幕 ─────────────
const timelineSet = phases.filter(isTimelineDrivenPhase);
const wujiSet = phases.filter((p) => !isTimelineDrivenPhase(p));
eq(JSON.stringify(timelineSet), JSON.stringify(['abyss', 'naming', 'lanterns']), '时间轴只驱动早段三幕');
eq(JSON.stringify(wujiSet), JSON.stringify(['extinguishing', 'silence']), 'extinguishing/silence 由 #00 阈值驱动');
eq(timelineSet.filter((p) => wujiSet.includes(p)).length, 0, '两侧幕次集合必须互斥（1440/1751 永不双写）');
eq(timelineSet.length + wujiSet.length, phases.length, '两侧并集必须覆盖全部五幕');

// 各幕首次进入时刻（证明迁移点）——
const firstEnter = {};
for (let s = 0; s < RITUAL_TOTAL_SEC; s++) {
  const p = ritualPhaseAt(s);
  if (!(p in firstEnter)) firstEnter[p] = s;
}
eq(firstEnter.abyss, 0, 'abyss 于 0s 进入');
eq(firstEnter.naming, 180, 'naming 于 180s 进入');
eq(firstEnter.lanterns, 1020, 'lanterns 于 1020s 进入');
eq(firstEnter.extinguishing, 1440, 'extinguishing 于 1440s 进入（由 setRitualTime 结算）');
eq(firstEnter.silence, 1751, 'silence 于 1751s 进入（由 setRitualTime 结算）');
ok(isTimelineDrivenPhase('abyss') && isTimelineDrivenPhase('naming') && isTimelineDrivenPhase('lanterns'),
  '0 / 180 / 1020 三幕由时间轴推进器改写');
ok(!isTimelineDrivenPhase('extinguishing') && !isTimelineDrivenPhase('silence'),
  '1440 / 1751 两幕由 setRitualTime(#00) 改写 —— 唯一写入方，绝无双写');

// ── 4. naming 幕 litSeats 线性爬升 0→49 ────────────────────────────
eq(ritualLitSeatsAt(0), 0, 'abyss litSeats 必须为 0');
eq(ritualLitSeatsAt(180), 0, 'naming 起点 litSeats 必须为 0');
eq(ritualLitSeatsAt(1020), SEAT_ID_MAX, 'naming 终点 litSeats 必须为 49');
eq(ritualLitSeatsAt(1440), 49, 'lanterns litSeats 必须为 49');
eq(ritualLitSeatsAt(1751), 49, 'silence litSeats 必须为 49');
eq(ritualLitSeatsAt(1800), 49, '终幕 litSeats 必须为 49');
eq(ritualLitSeatsAt(600), 25, 'naming 中点(600s) litSeats = round(0.5×49) = 25');

let prev = -1, monotonic = true, inRange = true;
for (let s = 0; s <= RITUAL_TOTAL_SEC; s++) {
  const v = ritualLitSeatsAt(s);
  if (v < prev) monotonic = false;
  if (v < 0 || v > 49) inRange = false;
  prev = v;
}
ok(monotonic, 'litSeats 必须随仪式时间单调不减');
ok(inRange, 'litSeats 必须恒在 [0, 49]');

// ── 5. 非有限时间钝化：三个权威映射对同一脏输入必须给出同一套 0s 稳态 ──
// 修复前：ritualPhaseAt(NaN) 落 'silence' 而 ritualLitSeatsAt(NaN) 返回 NaN —— 两映射互相矛盾，
// 且 NaN litSeats 会漏进逐席触发驱动源（dualDragonActiveSeats）。现一律按 0s 处理。
for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  eq(ritualPhaseAt(bad), 'abyss', `非有限时间 ${String(bad)} → abyss（0s 稳态）`);
  eq(ritualLitSeatsAt(bad), 0, `非有限时间 ${String(bad)} → litSeats 0（NaN 不外漏）`);
  eq(wujiRevealStateAt(bad), 'hidden', `非有限时间 ${String(bad)} → #00 hidden（0s 稳态）`);
}
// 与同仓库 fogCaptionsAt / broadcastStateAtMs 的"脏输入走 0s/off-air"先例同口径：
eq(ritualPhaseAt(0), ritualPhaseAt(Number.NaN), 'NaN 行为必须与 0s 完全一致');
eq(ritualLitSeatsAt(0), ritualLitSeatsAt(Number.NaN), 'NaN litSeats 必须与 0s 完全一致');

console.log(
  `ritual-timeline: 1800s / 5 acts (boundaries 180/1020/1440/1751) verified on real module; ` +
    `${checks} assertions passed.`
);
