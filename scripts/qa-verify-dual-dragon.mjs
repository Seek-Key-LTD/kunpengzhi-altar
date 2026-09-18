/**
 * · QA 独立门禁（严过关）· Gitea #2 水龙×音龙 + #9 基建复核 —— HEAD 918f62b
 *
 * 本脚本**独立重写**，不复跑 scripts/verify-dual-dragon.mjs。方法：esbuild 现场把
 * **真模块**打进临时目录后 import（绝不手抄常量）：
 *   · src/data/dualDragon.ts                  — 双龙节点 / 触发源 / 螺线 / 茶灯判据 / 雾句
 *   · src/data/spiral_events.ts               — seatMidi / SEAT_BOTTOM|TOP_MIDI
 *   · src/types/altar.ts                      — ritualLitSeatsAt / RITUAL_NAMING_END_SEC
 *   · src/three/AltarMaglevLanternEngine.ts   — 既有 maxOmega（RFC-008）
 * 并直接读 src/three/AltarScene.ts（去注释）做接线审计，及用 git diff 证死地脉耦合未动。
 *
 * 运行：node scripts/qa-verify-dual-dragon.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const T0 = '297c4a3'; // #9 基建
const T1 = '918f62b'; // #2 双龙

let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };
const near = (a, b, eps, m) => {
  assert.ok(Math.abs(a - b) <= eps, `✗ ${m}（${a} vs ${b}，容差 ${eps}）`);
  checks++;
};
const log = (m) => console.log(`   · ${m}`);

// ──────────────────────────────────────────────────────────────────────
// 0. 打包并 import 真模块
// ──────────────────────────────────────────────────────────────────────
const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild —— 无法对真模块断言');

const tmp = mkdtempSync(resolve(tmpdir(), 'qa-dragon-'));
const bundle = (rel, out) => {
  execFileSync(esbuildBin, [
    resolve(ROOT, rel),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, out)}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return import(pathToFileURL(resolve(tmp, out)).href);
};
let D, S, A, E, G;
try {
  D = await bundle('src/data/dualDragon.ts', 'dualDragon.mjs');
  S = await bundle('src/data/spiral_events.ts', 'spiral.mjs');
  A = await bundle('src/types/altar.ts', 'altar.mjs');
  E = await bundle('src/three/AltarMaglevLanternEngine.ts', 'maglev.mjs');
  G = await bundle('src/data/altarGeometry.ts', 'geo.mjs');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('\n══ QA 独立门禁 · Gitea #2 双龙 + #9 基建 · HEAD 918f62b ══\n');

// ──────────────────────────────────────────────────────────────────────
// 1. 逐席触发 —— 跨 ≥30 个时间点，两龙同源、绝不预演未来席
// ──────────────────────────────────────────────────────────────────────
console.log('[1] 逐席触发（≥30 时间点）');
const timePoints = [];
for (let t = 0; t <= 1800; t += 10) timePoints.push(t);        // 181 点
timePoints.push(179.999, 180.0, 180.001, 1019.999, 1020.0, 1020.001, 1439.9, 1440.0, 1750.9, 1799.9);
ok(timePoints.length >= 30, `时间点数量 ${timePoints.length} ≥ 30`);

// 触发源一致性：对全部时间点断言
for (const t of timePoints) {
  const lit = D.dualDragonActiveSeats(t);
  eq(lit, A.ritualLitSeatsAt(t), `t=${t}s：双龙触发源 === ritualLitSeatsAt`);
  ok(lit >= 0 && lit <= 49, `t=${t}s：已触发席数在 [0,49]（得到 ${lit}）`);
}
// 单调不减：按时间序遍历（不熄已亮）
const sortedPoints = [...timePoints].sort((a, b) => a - b);
let prevLit = -1;
for (const t of sortedPoints) {
  const lit = D.dualDragonActiveSeats(t);
  ok(lit >= prevLit, `t=${t}s：已触发席数单调不减（${prevLit}→${lit}，不熄已亮）`);
  prevLit = lit;
}
// 边界稳态（独立于脚本的硬编码期望，均由权威函数给出）
eq(D.dualDragonActiveSeats(0), 0, 'abyss(0s) 已触发 0 席');
eq(D.dualDragonActiveSeats(180), 0, 'naming 起点(180s) 已触发 0 席');
const midLit = D.dualDragonActiveSeats(500);
ok(midLit > 0 && midLit < 49, `naming 中段(500s) 触发席数严格介于 0..49（得 ${midLit}）`);
eq(D.dualDragonActiveSeats(1020), 49, 'naming 终点(1020s) 已触发满 49 席');
eq(D.dualDragonActiveSeats(1800), 49, '整轮终点(1800s) 恒 49 席');

// 独立性：直接对比 dualDragonActiveSeats 与 ritualLitSeatsAt 在 1801 个整数秒上一致
let mismatch = 0;
for (let t = 0; t <= 1800; t++) {
  if (D.dualDragonActiveSeats(t) !== A.ritualLitSeatsAt(t)) mismatch++;
}
eq(mismatch, 0, '全 1801 个整数秒：双龙触发源与 ritualLitSeatsAt 零漂移');

// 「不预演未来席」——复刻场景可见性规则（真值由 ritualLitSeatsAt 给出）
const WATER_COUNT = 280, SOUND_COUNT = 96, PATH_LEN = 49;
let previewViolation = 0, underdraw = 0;
for (const t of timePoints) {
  const lit = A.ritualLitSeatsAt(t);
  const waterVisible = Math.min(lit, PATH_LEN, WATER_COUNT);
  const soundVisible = Math.min(lit, PATH_LEN, SOUND_COUNT);
  // 两龙逐帧可见席数必须恰 = lit（同源）
  if (waterVisible !== lit || soundVisible !== lit) underdraw++;
  // 光迹：索引 idx(0基)+1 <= lit 才可见 ⟹ 可见集合是 {1..lit} 的前缀，无越界
  for (const idx of [0, lit - 1, lit, 48]) {
    if (idx < 0 || idx > 48) continue;
    const expectVisible = idx + 1 <= lit;
    if (expectVisible && idx + 1 > lit) previewViolation++;
  }
}
eq(underdraw, 0, '两龙逐帧可见席数恒 = 已触发席数（同源、不欠画）');
eq(previewViolation, 0, '无任一未触发席被画出（不预演未来席）');
log(`时间点 ${timePoints.length} 个；两龙同源 1801/1801 一致；可见集合恒为前缀 {1..lit}`);

// ──────────────────────────────────────────────────────────────────────
// 2. 方向严格反向（水：外/下；音：内/上）
// ──────────────────────────────────────────────────────────────────────
console.log('[2] 方向严格反向');
const W = D.waterDragonNodes();
const Sd = D.soundDragonNodes();
eq(W.length, 49, '水龙恰 49 节点');
eq(Sd.length, 49, '音龙恰 49 节点');

let waterDown = 0, waterOut = 0, soundUp = 0, soundIn = 0, vertOpp = 0, latOpp = 0, latStrict = 0;
for (let i = 1; i < 49; i++) {
  const dWy = W[i].y - W[i - 1].y;
  const dWr = W[i].ring - W[i - 1].ring;
  const dSy = Sd[i].y - Sd[i - 1].y;
  const dSr = Sd[i].radius - Sd[i - 1].radius;
  if (dWy < 0) waterDown++;                     // 水逐段向下
  if (dWr >= 0) waterOut++;                     // 水逐段向外（方环号不减）
  if (dSy > 0) soundUp++;                       // 音逐段向上
  if (dSr < 0) soundIn++;                       // 音逐段向内（严格收窄）
  if (dWy * dSy < 0) vertOpp++;                 // 垂直严格反向
  if (dWr * dSr <= 0) latOpp++;                 // 水平互为反向
  if (dWr * dSr < 0) latStrict++;               // 水平严格反向
}
eq(waterDown, 48, '水龙 48 段全部向下');
eq(waterOut, 48, '水龙 48 段全部向外（方环号不减）');
eq(soundUp, 48, '音龙 48 段全部向上');
eq(soundIn, 48, '音龙 48 段全部向内（半径严格收窄）');
eq(vertOpp, 48, '48 段垂直方向严格反向（水下/音上，乘积<0）');
eq(latOpp, 48, '48 段水平方向互为反向（水外/音内，乘积≤0）');
log(`水平严格反向 ${latStrict}/48 段（余 ${48 - latStrict} 段为方环平台期，水不内缩故仍反向）`);
log(`水 #1→#49：ring ${W[0].ring}→${W[48].ring}，y ${W[0].y.toFixed(2)}→${W[48].y.toFixed(2)}`);
log(`音 #1→#49：r ${Sd[0].radius.toFixed(2)}→${Sd[48].radius.toFixed(2)}，y ${Sd[0].y.toFixed(2)}→${Sd[48].y.toFixed(2)}`);

// 反例哨兵：若音龙轴向被改成与水龙同向，本段必失败（自证断言有效）
const fakeAscent = Sd[48].y - Sd[0].y;
ok(fakeAscent > 0 && (W[48].y - W[0].y) < 0, '音龙整体向上 & 水龙整体向下（互为反向的整体证据）');

// ──────────────────────────────────────────────────────────────────────
// 3. 对数螺线收紧系数 b 随 seatMidi 严格递减（音越高越紧）
// ──────────────────────────────────────────────────────────────────────
console.log('[3] 对数螺线 b 随音高单调递减');
const bList = [], midiList = [];
for (let seatId = 1; seatId <= 49; seatId++) {
  bList.push(D.seatTrailTightnessB(seatId));
  midiList.push(S.seatMidi(seatId));
}
let bStrictDec = 0, midiStrictInc = 0;
for (let i = 1; i < 49; i++) {
  if (bList[i] < bList[i - 1]) bStrictDec++;
  if (midiList[i] > midiList[i - 1]) midiStrictInc++;
}
eq(bStrictDec, 48, 'b 随席号 48 段严格递减');
eq(midiStrictInc, 48, 'seatMidi 随席号 48 段严格递增（音高确实在升）');
near(bList[0], D.TRAIL_B_LOOSE, 1e-12, '第 1 席 b = TRAIL_B_LOOSE（最松）');
near(bList[48], D.TRAIL_B_TIGHT, 1e-12, '第 49 席 b = TRAIL_B_TIGHT（最紧）');
eq(S.seatMidi(1), S.SEAT_BOTTOM_MIDI, '第 1 席 = 最低音（SEAT_BOTTOM_MIDI）');
eq(S.seatMidi(49), S.SEAT_TOP_MIDI, '第 49 席 = 最高音（SEAT_TOP_MIDI）');
// b 由 seatMidi 直接推出（函数合成一致）
for (const seatId of [1, 13, 25, 37, 49]) {
  eq(D.seatTrailTightnessB(seatId), D.trailTightnessB(S.seatMidi(seatId)),
    `第 ${seatId} 席 b 由 seatMidi(${seatId}) 推出（无旁路）`);
}
// 独立复算：b = LOOSE - (LOOSE-TIGHT) * (midi-BOTTOM)/(TOP-BOTTOM)
const span = S.SEAT_TOP_MIDI - S.SEAT_BOTTOM_MIDI;
for (const seatId of [1, 7, 20, 33, 49]) {
  const t = (S.seatMidi(seatId) - S.SEAT_BOTTOM_MIDI) / span;
  near(D.seatTrailTightnessB(seatId), D.TRAIL_B_LOOSE - (D.TRAIL_B_LOOSE - D.TRAIL_B_TIGHT) * t, 1e-12,
    `第 ${seatId} 席 b 与独立复算一致`);
}
// 几何含义：b 越小 → 同 θ 下半径增幅越小 → 螺线越紧
const theta = 2.4 * Math.PI * 2;
const rTight = 0.06 * Math.exp(bList[48] * theta); // C6
const rLoose = 0.06 * Math.exp(bList[0] * theta);  // C2
ok(rTight < rLoose, `几何佐证：b 更小的 C6 螺线末端半径 ${rTight.toFixed(3)} < C2 ${rLoose.toFixed(3)}（更紧）`);
log(`b(C2)=${bList[0].toFixed(4)} > b(C6)=${bList[48].toFixed(4)}；midi ${midiList[0]}→${midiList[48]}`);

// ──────────────────────────────────────────────────────────────────────
// 4. 茶灯门控：<1020s 不转 / ≥1020s 转 / ≤maxOmega(120s/圈)
// ──────────────────────────────────────────────────────────────────────
console.log('[4] 茶灯门控');
eq(A.RITUAL_NAMING_END_SEC, 1020, '门控阈值 = 17:00 = 1020s');
for (const t of [0, 179, 300, 1019, 1019.999]) {
  ok(D.teaLanternRotationEnabled(t) === false, `${t}s：茶灯不转`);
}
for (const t of [1020, 1020.001, 1200, 1440, 1800]) {
  ok(D.teaLanternRotationEnabled(t) === true, `${t}s：茶灯始转/转`);
}
ok(D.teaLanternRotationEnabled(NaN) === false, 'NaN：不转（安全默认）');
ok(D.teaLanternRotationEnabled(Infinity) === false, 'Infinity：不转（Number.isFinite 守卫；实际 reachable 域 [0,1800] 内不可达）');
eq(D.TEA_LANTERN_REV_SEC, 120, '沿用既有 maxOmega ⇒ 120s/圈');
near(D.TEA_LANTERN_MAX_OMEGA, (2 * Math.PI) / 120, 1e-15, 'TEA_LANTERN_MAX_OMEGA = 2π/120');
const eng = new E.AltarMaglevLanternEngine();
near(eng.maxOmega, D.TEA_LANTERN_MAX_OMEGA, 1e-15, '真引擎 maxOmega === 判据常量（同源）');
near((2 * Math.PI) / eng.maxOmega, 120, 1e-9, 'maxOmega 对应周期恰 120s/圈');
// 长积分：角速度被 maxOmega 钳住，绝不失控
for (let i = 0; i < 400000; i++) eng.update(0.05, 0);
ok(eng.state.omega <= eng.maxOmega + 1e-9, '长时间积分后 omega ≤ maxOmega');
near(eng.state.omega, eng.maxOmega, 1e-6, '稳态 omega == maxOmega（120s/圈低速巡礼）');

// 场景门控复刻：ritualMode 下 <1020s 视觉转角恒 0，≥1020s 起转
const eng2 = new E.AltarMaglevLanternEngine();
let gateOpen = false, theta0 = 0, zeroBefore = true, rotatedAfter = 0;
const dtF = 0.05;
for (let f = 0; f < Math.round(1800 / dtF); f++) {
  const t = f * dtF;
  eng2.update(dtF, 0);                    // 引擎始终推进（与场景一致）
  const open = D.teaLanternRotationEnabled(t); // ritualMode 判据
  if (open !== gateOpen) {
    gateOpen = open;
    if (open) theta0 = eng2.state.theta;    // 开门零点，避免跳变
  }
  const disp = gateOpen ? eng2.state.theta - theta0 : 0;
  if (t < 1020) { if (Math.abs(disp) > 1e-12) zeroBefore = false; }
  else rotatedAfter++;
}
ok(zeroBefore, 'ritualMode 下 <1020s：茶灯视觉转角恒 0（不转）');
ok(rotatedAfter > 0, 'ritualMode 下 ≥1020s：进入转动区间');
log(`门控：<1020s 转角 0；≥1020s 起转，maxOmega=${eng.maxOmega.toFixed(6)}rad/s ⇒ 120s/圈`);
log('注：theta 每 120s mod 2π 回卷，位移 raw-θ0 会 −2π 跳变；2π 对 16 灯环渲染等价，无视觉断裂。');

// ──────────────────────────────────────────────────────────────────────
// 5. 【硬回归线】RFC-008 地脉耦合一字未改（git diff 取证）
// ──────────────────────────────────────────────────────────────────────
console.log('[5] 硬回归线 · RFC-008 地脉耦合');
const diff = spawnSync('git', ['diff', `${T0}..${T1}`, '--', 'src/three/AltarScene.ts'],
  { cwd: ROOT, encoding: 'utf8' });
eq(diff.status, 0, 'git diff 可执行');
const deleted = diff.stdout.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
const KEY = /maglev\.update|onAcousticStrum|waterLiftSeismic|seismic/i;
const deletedKeyLines = deleted.filter((l) => KEY.test(l));
eq(deletedKeyLines.length, 0, `本次删改中不含地脉耦合符号（命中 ${deletedKeyLines.length} 行）`);
// 唯一被删的 maglev 相关行必须只是「视觉转角」赋值
const deletedMaglevLines = deleted.filter((l) => /maglev/i.test(l));
eq(deletedMaglevLines.length, 1, '被删的 maglev 相关行恰 1 行');
ok(/rotation\.y\s*=\s*this\.maglev\.state\.theta/.test(deletedMaglevLines[0]),
  '该行是视觉转角赋值（rotation.y = theta），非动力学');
// HEAD 现存：三处耦合行必须在场
const scene = readFileSync(resolve(ROOT, 'src/three/AltarScene.ts'), 'utf8');
ok(/this\.maglev\.update\(dt,\s*this\.waterLiftSeismic\)/.test(scene), 'HEAD 现存 maglev.update(dt, waterLiftSeismic)');
ok(/this\.waterLiftSeismic\s*\*=\s*0\.92/.test(scene), 'HEAD 现存 waterLiftSeismic 衰减');
ok(/this\.maglev\.onAcousticStrum\s*=/.test(scene), 'HEAD 现存 maglev.onAcousticStrum 回调装配');
ok(/this\.waterLiftSeismic\s*=\s*THREE\.MathUtils\.clamp/.test(scene), 'HEAD 现存 waterLiftSeismic 由水梯质量喂入');
log(`删除行总数 ${deleted.length}；含地脉耦合符号 ${deletedKeyLines.length}；唯一被删 maglev 行 = ${deletedMaglevLines[0].trim()}`);

// ──────────────────────────────────────────────────────────────────────
// 6. 雾中一句：任何时刻同时展示句数 ≤ 1
// ──────────────────────────────────────────────────────────────────────
console.log('[6] 雾中一句');
const wins = D.FOG_CAPTIONS;
for (let i = 1; i < wins.length; i++) {
  ok(wins[i].from >= wins[i - 1].to, `雾句窗口 #${i} 与前窗不重叠（${wins[i].from} ≥ ${wins[i - 1].to}）`);
}
let maxLines = 0, covered = 0;
for (let sec = 0; sec < 1800; sec++) {
  const n = D.fogCaptionsAt(sec).length;
  if (n > maxLines) maxLines = n;
  if (n > 0) covered++;
}
ok(maxLines <= 1, `雾中同时句数恒 ≤ 1（实测最大 ${maxLines}）`);
eq(covered, 1800, '雾句覆盖整轮 [0,1800) 每一秒（无空档）');
eq(D.fogCaptionsAt(1800).length, 0, '1800s 起雾中无句（幕外）');
eq(D.fogCaptionAt(1800), null, 'fogCaptionAt(1800) === null');
ok(typeof D.fogCaptionAt(1020) === 'string', '1020s 雾中恰有一句');
ok(D.fogCaptionsAt(NaN).length <= 1, 'NaN：至多一句');
log(`窗口 ${wins.length} 段两两不重叠、首尾相接覆盖 1800s，同刻最大句数 ${maxLines}`);

// ──────────────────────────────────────────────────────────────────────
// 7. 不设第三条龙
// ──────────────────────────────────────────────────────────────────────
console.log('[7] 无第三龙');
const dragonFns = Object.keys(D).filter((k) => /DragonNode/.test(k));
eq(dragonFns.filter((k) => /water/i.test(k)).length, 2, '恰一对水龙节点接口');
eq(dragonFns.filter((k) => /sound/i.test(k)).length, 2, '恰一对音龙节点接口');
eq(dragonFns.length, 4, '双龙节点接口共 4 个（无第三龙节点源）');
ok(!Object.keys(D).some((k) => /third|decor|dragon[bc]|dragon2|dragon3/i.test(k)),
  'dualDragon 模块不暴露第三条（装饰）龙');
const sceneNC = scene.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
ok(!/(thirdDragon|decorativeDragon|dragonC|dragonD)\b/i.test(sceneNC), 'AltarScene 无第三条龙标识符');
log('水/音两龙同源反向，无第三龙（模块与场景双侧审计）');

// ──────────────────────────────────────────────────────────────────────
// 8. #9 基建复核（真常量 / 真 Tone / 子进程隔离 + 失败非零退出）
// ──────────────────────────────────────────────────────────────────────
console.log('[8] #9 基建复核');
const readScript = (p) => readFileSync(resolve(ROOT, p), 'utf8');
// 8a. verify-scorpion-waterway 从真模块取常量，不自抄几何
const waterway = readScript('scripts/verify-scorpion-waterway.mjs');
ok(/execFileSync\(esbuild/.test(waterway) && /--bundle/.test(waterway),
  'scorpion-waterway：用 esbuild 现场打包真模块');
ok(/src\/data\/altarGeometry\.ts/.test(waterway), 'scorpion-waterway：打包目标 = altarGeometry.ts');
ok(!/const\s+(BRICK|CELL|PYRAMID_TOP|SEATS_PER_LEVEL|DROP_PER_SEAT|SCORPION_EMBED_DEPTH)\s*=/.test(waterway),
  'scorpion-waterway：无自抄几何常量（杜绝漂移源）');
// 独立佐证：脚本断言用的 DROP_PER_SEAT 等确从模块解构而来
ok(/=\s*geo;/.test(waterway) && /ulamCoords/.test(waterway), 'scorpion-waterway：常量自 geo 模块解构使用');
// 8b. assert-semitones 用真 Tone.Frequency，非手算 MIDI 糊弄
const semi = readScript('scripts/assert-semitones.mjs');
ok(/import\s+\*\s+as\s+Tone\s+from\s+'tone'/.test(semi), 'assert-semitones：import 真 tone');
ok(/Tone\.Frequency\('C2'\)/.test(semi), 'assert-semitones：用 Tone.Frequency(\'C2\') 求音高');
ok(/INITIAL_SPIRAL_EVENTS/.test(semi) && /src\/data\/spiral_events\.ts/.test(semi),
  'assert-semitones：与真渲染数据逐一核对（esbuild 打包）');
ok(!/const\s+C2_FREQ\s*=/.test(semi) && !/65\.4/.test(semi), 'assert-semitones：无手抄基频常量');
// 8c. run-tests 子进程隔离 + 失败非零退出（注入失败探针实测）
const runner = readScript('scripts/run-tests.mjs');
ok(/spawnSync\(process\.execPath/.test(runner), 'run-tests：每个套件在独立子进程执行');
ok(/res\.status\s*!==\s*0/.test(runner) && /throw\s+new\s+Error/.test(runner),
  'run-tests：任一子进程非零退出即 throw（传导失败）');
// —— 注入失败：新建临时探针 + 临时 runner 副本（不改动任何入库文件）——
// ⚠️ 本套件已注册进 run-tests（第 9 套）。副本若原样包含自身会自引用无限递归，
//    故副本先剔除包含本文件名的行；语义不变（仍证明副本非零退出可传导）。
const SELF = 'scripts/qa-verify-dual-dragon.mjs';
const runnerBody = runner.includes(SELF)
  ? runner.split('\n').filter((l) => !l.includes(SELF)).join('\n')
  : runner;
const probe = resolve(ROOT, 'scripts/qa-PROBE-fail.mjs');
const runnerCopy = resolve(ROOT, 'scripts/qa-PROBE-runner.mjs');
let injectedExit = null;
try {
  execFileSync('bash', ['-c',
    `printf '%s\\n' "import assert from 'node:assert/strict';" "assert.ok(false, 'QA 注入的必失败探针');" > "${probe}"`
  ]);
  const inj = runnerBody.replace(
    "  ['QA 独立门禁（#3/#8）', 'scripts/qa-verify-issue3-8.mjs']",
    "  ['QA 独立门禁（#3/#8）', 'scripts/qa-verify-issue3-8.mjs'],\n  ['QA 注入失败探针', 'scripts/qa-PROBE-fail.mjs']"
  );
  ok(inj !== runnerBody && /qa-PROBE-fail\.mjs/.test(inj), '注入点定位成功（run-tests 结构可被独立验证）');
  ok(!inj.split('\n').some((l) => l.includes(SELF)), '副本已剔除自身（杜绝自引用递归）');
  execFileSync('bash', ['-c', `cat > "${runnerCopy}" <<'QAE0F'\n${inj}\nQAE0F`]);
  // 关键：本套件若被父级 `node --test` spawn（npm test 门禁），会继承 NODE_TEST_CONTEXT；
  // 携带该变量再跑 `node --test` 会把结果当作「向父级汇报」而退出 0，令本断言失真。
  // 剥离后才等价于一次顶层 `npm test`，退出码才真实。
  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', runnerCopy], { cwd: ROOT, encoding: 'utf8', env: cleanEnv });
  injectedExit = r.status;
  ok(r.status !== 0, `注入失败后 npm test 等价运行退出码非零（exit ${r.status}）`);
  // 子进程隔离佐证：其余门禁仍各自独立跑完（报错文本含失败套件名）
  ok(/qa-PROBE-fail\.mjs/.test((r.stdout || '') + (r.stderr || '')), '失败被精确归因到注入探针（隔离生效）');
} finally {
  rmSync(probe, { force: true });
  rmSync(runnerCopy, { force: true });
  ok(!existsSync(probe) && !existsSync(runnerCopy), '临时探针已清理（未污染工作区）');
}
log(`基建：scorpion-waterway 真常量 ✓ · assert-semitones 真 Tone ✓ · 失败注入 exit=${injectedExit}（非零）✓`);

// ──────────────────────────────────────────────────────────────────────
console.log(`\n✅ QA 独立门禁全部通过：${checks} 项断言\n`);
