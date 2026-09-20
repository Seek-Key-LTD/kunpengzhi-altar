/**
 * 水龙 × 音龙 · 49 席双向同源可视化验收 —— Gitea #2。
 *
 * 无头环境出不了截图/录屏，故以**代码级机械断言**取证（录屏/截图序列归 #7）。
 * 用 esbuild 把**真模块**打进临时 JS 后 import，断言的每一条都指向真实数据源：
 *   · src/data/dualDragon.ts              —— 双龙节点 / 触发源 / 螺线收紧 / 茶灯判据 / 雾句
 *   · src/data/spiral_events.ts           —— seatMidi（C2→C6 半音）
 *   · src/types/altar.ts                  —— ritualLitSeatsAt / RITUAL_NAMING_END_SEC
 *   · src/three/AltarMaglevLanternEngine.ts —— 既有 maxOmega（RFC-008）
 * 并对 src/three/AltarScene.ts 做去注释后的接线审计（证明场景真的用了这些权威函数）。
 *
 * 运行：node scripts/verify-dual-dragon.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, `✗ ${msg}`); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, `✗ ${msg}`); checks++; };
const near = (a, b, eps, msg) => {
  assert.ok(Math.abs(a - b) <= eps, `✗ ${msg}（${a} vs ${b}，容差 ${eps}）`);
  checks++;
};

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild（vite 内置依赖）——无法对真数据断言');

const tmp = mkdtempSync(resolve(tmpdir(), 'dragon-'));
const bundle = (rel, out) => {
  execFileSync(esbuildBin, [
    resolve(ROOT, rel),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, out)}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return import(pathToFileURL(resolve(tmp, out)).href);
};

let D, S, A, E;
try {
  D = await bundle('src/data/dualDragon.ts', 'dualDragon.mjs');
  S = await bundle('src/data/spiral_events.ts', 'spiral.mjs');
  A = await bundle('src/types/altar.ts', 'altar.mjs');
  E = await bundle('src/three/AltarMaglevLanternEngine.ts', 'maglev.mjs');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const SEAT_MAX = 49;

// ══════════════════════════════════════════════════════════════════════
// 1. 49 席逐席触发序（首/中/末席索引 + 方向）—— ritualLitSeatsAt 是唯一驱动源
// ══════════════════════════════════════════════════════════════════════
eq(D.DRAGON_SEAT_COUNT, 49, '双龙共用 49 席触发序');
eq(A.SEAT_ID_MAX, 49, '席位域上界 = 49');

const W = D.waterDragonNodes();
const Sd = D.soundDragonNodes();
eq(W.length, 49, '水龙恰 49 节点');
eq(Sd.length, 49, '音龙恰 49 节点');

const first = D.waterDragonNode(1);
const mid = D.waterDragonNode(25);
const last = D.waterDragonNode(49);
eq(first.seatId, 1, '触发序首席 = #1');
eq(mid.seatId, 25, '触发序中席 = #25');
eq(last.seatId, 49, '触发序末席 = #49');

// 方向（水：向外、向下）
ok(W[0].ring < W[48].ring, '水龙 #1→#49 方环半径增大（向外）');
ok(W[0].y > W[48].y, '水龙 #1→#49 高度下降（向下）');
// 方向（音：向内、向上）
const sFirst = D.soundDragonNode(1);
const sLast = D.soundDragonNode(49);
ok(sFirst.radius > sLast.radius, '音龙 #1→#49 欧氏半径减小（向内）');
ok(sFirst.y < sLast.y, '音龙 #1→#49 高度上升（向上）');

// 逐段方向在全 49 席上成立
for (let i = 1; i < 49; i++) {
  ok(W[i].y < W[i - 1].y, `水龙逐段向下：#${i}→#${i + 1} y 必须下降`);
  ok(W[i].ring >= W[i - 1].ring, `水龙逐段向外：#${i}→#${i + 1} 方环号不得回缩`);
  ok(Sd[i].y > Sd[i - 1].y, `音龙逐段向上：#${i}→#${i + 1} y 必须上升`);
  ok(Sd[i].radius < Sd[i - 1].radius, `音龙逐段向内：#${i}→#${i + 1} 半径必须收窄`);
}

// 唯一驱动源 = ritualLitSeatsAt（禁预演未来席）
for (const sec of [0, 90, 180, 300, 600, 1020, 1200, 1440, 1800]) {
  eq(D.dualDragonActiveSeats(sec), A.ritualLitSeatsAt(sec),
    `双龙触发源唯一：dualDragonActiveSeats(${sec}) === ritualLitSeatsAt(${sec})`);
}
// 未到 naming / 已过 naming 的边界稳态
eq(D.dualDragonActiveSeats(0), 0, 'abyss(0s) 已触发 0 席');
eq(D.dualDragonActiveSeats(180), 0, 'naming 起点(180s) 已触发 0 席');
eq(D.dualDragonActiveSeats(1020), 49, 'naming 终点(1020s) 已触发 49 席');

// ══════════════════════════════════════════════════════════════════════
// 2. 两龙互为反向（同源反向）
// ══════════════════════════════════════════════════════════════════════
let verticalOpposite = true;
let lateralOpposite = true;
for (let i = 1; i < 49; i++) {
  // 垂直：水向下(−)、音向上(+) ⟹ 乘积 < 0（严格反向）
  if ((W[i].y - W[i - 1].y) * (Sd[i].y - Sd[i - 1].y) >= 0) verticalOpposite = false;
  // 水平：水向外(≥0)、音向内(≤0) ⟹ 乘积 ≤ 0（互为反向）
  if ((W[i].ring - W[i - 1].ring) * (Sd[i].radius - Sd[i - 1].radius) > 0) lateralOpposite = false;
}
ok(verticalOpposite, '两龙垂直方向逐段严格反向（水下 / 音上）');
ok(lateralOpposite, '两龙水平方向逐段互为反向（水外 / 音内）');

// 不新增第三条龙：模块只暴露 water / sound 两组节点，且无第三龙命名
const nodeFns = Object.keys(D).filter((k) => /DragonNode/.test(k));
eq(nodeFns.filter((k) => /water/i.test(k)).length, 2, '仅一对水龙节点接口');
eq(nodeFns.filter((k) => /sound/i.test(k)).length, 2, '仅一对音龙节点接口');
ok(!Object.keys(D).some((k) => /third|decor|dragon[bc]|dragon2/i.test(k)), '模块不暴露第三条（装饰）龙');

// ══════════════════════════════════════════════════════════════════════
// 3. 茶灯门控：1020s 前不转 / 后转（沿用既有 maxOmega）
// ══════════════════════════════════════════════════════════════════════
eq(A.RITUAL_NAMING_END_SEC, 1020, '门控阈值 = 17:00 = 1020s');
ok(D.teaLanternRotationEnabled(0) === false, '0s：茶灯不转');
ok(D.teaLanternRotationEnabled(1019) === false, '1019s：茶灯不转');
ok(D.teaLanternRotationEnabled(1020) === true, '1020s：茶灯始转');
ok(D.teaLanternRotationEnabled(1200) === true, '1200s：茶灯转');

eq(D.TEA_LANTERN_REV_SEC, 120, '沿用既有 maxOmega ⇒ 120s/圈');
const engine = new E.AltarMaglevLanternEngine();
near(engine.maxOmega, D.TEA_LANTERN_MAX_OMEGA, 1e-12, '引擎 maxOmega = 2π/120 rad/s');
near((2 * Math.PI) / engine.maxOmega, 120, 1e-9, 'maxOmega 对应周期恰 120s');
// 长时间积分：角速度被 maxOmega 钳住（“幽灵般缓慢巡礼”），绝不失控
for (let i = 0; i < 400000; i++) engine.update(0.05, 0); // 20000s
ok(engine.state.omega <= engine.maxOmega + 1e-9, '角速度恒不超过 maxOmega');
near(engine.state.omega, engine.maxOmega, 1e-6, '稳态角速度 = maxOmega（120s/圈，低速）');

// ══════════════════════════════════════════════════════════════════════
// 4. 对数螺线随音高单调收紧（音越高越紧）
// ══════════════════════════════════════════════════════════════════════
const bs = [];
for (let seatId = 1; seatId <= SEAT_MAX; seatId++) bs.push(D.seatTrailTightnessB(seatId));
for (let i = 1; i < SEAT_MAX; i++) {
  ok(bs[i] < bs[i - 1], `音越高螺线越紧：#${i + 1} 的 b 必须 < #${i}`);
}
near(bs[0], D.TRAIL_B_LOOSE, 1e-12, '最低音 C2 的 b = 最松');
near(bs[SEAT_MAX - 1], D.TRAIL_B_TIGHT, 1e-12, '最高音 C6 的 b = 最紧');
eq(D.seatTrailTightnessB(1), D.trailTightnessB(S.seatMidi(1)), '席 #1 b 由 seatMidi(1) 推出');
eq(D.seatTrailTightnessB(49), D.trailTightnessB(S.seatMidi(49)), '席 #49 b 由 seatMidi(49) 推出');
ok(S.seatMidi(49) > S.seatMidi(1), '席 #49 音高高于席 #1（C6 > C2）');

// ══════════════════════════════════════════════════════════════════════
// 5. 雾中一句：任何时刻同时展示句数 ≤ 1
// ══════════════════════════════════════════════════════════════════════
const wins = D.FOG_CAPTIONS;
for (let i = 1; i < wins.length; i++) {
  ok(wins[i].from >= wins[i - 1].to, `雾句窗口两两不重叠：#${i} 起点 >= 前窗终点`);
}
let maxLines = 0;
let covered = 0;
for (let sec = 0; sec < 1800; sec++) {
  const n = D.fogCaptionsAt(sec).length;
  if (n > maxLines) maxLines = n;
  if (n > 0) covered++;
}
ok(maxLines <= 1, '雾中同时展示句数恒 ≤ 1');
eq(covered, 1800, '雾句覆盖整轮 [0,1800) 每一秒（无空档）');
ok(D.fogCaptionAt(1800) === null, '1800s 起雾中无句（幕外）');
ok(typeof D.fogCaptionAt(1020) === 'string', '1020s 雾中恰有一句');

// ══════════════════════════════════════════════════════════════════════
// 6. 场景接线审计（去注释后）：证明 AltarScene 真的消费上述权威函数
// ══════════════════════════════════════════════════════════════════════
const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const scene = stripComments(readFileSync(resolve(ROOT, 'src/three/AltarScene.ts'), 'utf8'));
const rig = stripComments(readFileSync(resolve(ROOT, 'src/three/DualDragonRig.ts'), 'utf8'));

ok(/dualDragonLitSeats\s*\(/.test(scene), '场景以 dualDragonLitSeats 作双龙唯一触发源');
ok(/waterParticles\.geometry\.setDrawRange\s*\(\s*0\s*,\s*visible\s*\)/.test(rig), '水龙按已触发席数逐席 setDrawRange（DualDragonRig）');
ok(/soundParticles\.geometry\.setDrawRange\s*\(\s*0\s*,\s*visible\s*\)/.test(rig), '音龙按已触发席数逐席 setDrawRange（DualDragonRig）');
ok(/updateLanternGate\s*\(/.test(scene), '场景含茶灯门控 updateLanternGate');
ok(/teaLanternRotationEnabled\s*\(/.test(scene), '门控调用纯判据 teaLanternRotationEnabled');
ok(/fogCaptionAt\s*\(/.test(scene), '雾中一句调用 fogCaptionAt');
ok(/ritual-caption/.test(scene), '雾中字幕挂 ritual-caption 样式');
ok(!/elapsedTime\s*\*\s*2\.2/.test(scene), '已移除水的连续粒子流（elapsedTime*2.2）');
ok(!/elapsedTime\s*\*\s*1\.1/.test(scene), '已移除音的连续粒子流（elapsedTime*1.1）');
ok(!/(thirdDragon|decorativeDragon|dragonC)/i.test(scene), 'AltarScene 不新增第三条龙');

console.log(
  'dual-dragon #2: 49-seat per-seat trigger verified on real modules\n' +
  `  触发源：ritualLitSeatsAt(elapsed)（src/types/altar.ts）\n` +
  `  首/中/末席：#1 ring=${first.ring.toFixed(2)} y=${first.y.toFixed(2)} ｜ ` +
  `#25 ring=${mid.ring.toFixed(2)} y=${mid.y.toFixed(2)} ｜ ` +
  `#49 ring=${last.ring.toFixed(2)} y=${last.y.toFixed(2)}（水：向外向下）\n` +
  `  音龙首/末：#1 r=${sFirst.radius.toFixed(2)} y=${sFirst.y.toFixed(2)} ｜ ` +
  `#49 r=${sLast.radius.toFixed(2)} y=${sLast.y.toFixed(2)}（音：向内向上）⟹ 两龙互为反向\n` +
  `  茶灯门控：teaLanternRotationEnabled 阈值 ${A.RITUAL_NAMING_END_SEC}s(17:00)；` +
  `maxOmega=${engine.maxOmega.toFixed(6)}rad/s ⇒ ${(2 * Math.PI / engine.maxOmega).toFixed(0)}s/圈\n` +
  `  螺线收紧：b(C2)=${bs[0].toFixed(3)} > b(C6)=${bs[bs.length - 1].toFixed(3)}（音越高越紧，随 seatMidi 单调递减）\n` +
  `  雾中一句：窗口 ${wins.length} 段两两不重叠，全程同时展示句数 ≤ ${maxLines}\n` +
  `  数据源：src/data/dualDragon.ts · src/data/spiral_events.ts · src/types/altar.ts · src/three/AltarMaglevLanternEngine.ts\n` +
  `  ${checks} assertions passed.`
);
