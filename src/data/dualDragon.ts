// 水龙（阳龙）× 音龙（阴龙）· 49 席双向同源可视化 —— Gitea #2
//
// ── 设计契约（唯一权威来源，供 AltarScene 与 npm test 共用）────────────
// 1. 逐席触发：`dualDragonActiveSeats(elapsed)` 是唯一的触发驱动源，
//    它**直接**转调 `ritualLitSeatsAt`。任何一帧，两龙显形的席数都等于它，
//    因此绝不可能预演未来席位（未触发的席既不画线、也不落珠）。
// 2. 方向可读（静音也能读）：水龙沿 Ulam 方形螺旋**向外**（方环号 ring ↑）、
//    **向下**（y ↓）；音龙**向内**（到坛心的欧氏半径 radius ↓）、**向上**（y ↑）。
//    两者逐段**互为反向** —— 同一条仪式能量的“分发”与“回收”。
// 3. 对数螺线光迹：每个已触发席位保留一条对数螺线 r(θ)=r0·e^{bθ} 光迹；
//    收紧系数 b 由该席音高决定 —— **音越高 b 越小、螺线越紧**（单调）。
// 4. 同源反向、不设第三条龙：本模块只定义水/音两龙，几何上互为反向，
//    并被同一条 `ritualLitSeatsAt` 驱动（同源）。
// 5. 茶灯门控：16 盏茶灯仅 ≥1020s(17:00) 后转动，沿用引擎既有 maxOmega（120s/圈）；
//    本模块只给出**判据**，不改 RFC-008 的地脉耦合。
// 6. 雾中一句：`fogCaptionsAt` 的窗口两两不重叠 ⟹ 任何时刻至多一句。

import {
  ritualLitSeatsAt,
  SEAT_ID_MAX,
  RITUAL_NAMING_END_SEC,
  isSeatId
} from '../types/altar';
import {
  CELL,
  PYRAMID_TOP,
  scorpionWaterElevation,
  ulamCoords
} from './altarGeometry';
import { seatMidi, SEAT_BOTTOM_MIDI, SEAT_TOP_MIDI } from './spiral_events';

/** 双龙共用同一套 49 席触发序（= 席位域 1..49）。 */
export const DRAGON_SEAT_COUNT = SEAT_ID_MAX; // 49

export interface DragonNode {
  /** 该节点对应的席位号（1..49）。 */
  seatId: number;
  x: number;
  y: number;
  z: number;
  /** 到坛心的水平欧氏半径 —— 音龙“向内”的判据（逐席严格收紧）。 */
  radius: number;
  /** 到坛心的切比雪夫（方环）半径 = Ulam 方阵圈号 —— 水龙“向外”的判据。 */
  ring: number;
}

function makeNode(seatId: number, x: number, y: number, z: number): DragonNode {
  return {
    seatId,
    x,
    y,
    z,
    radius: Math.hypot(x, z),
    ring: Math.max(Math.abs(x), Math.abs(z))
  };
}

function assertSeat(seatId: number, label: string): void {
  if (!isSeatId(seatId)) {
    throw new RangeError(`${label}: 席位号必须是 1..49 的整数，收到 ${seatId}`);
  }
}

// ── 阳龙（水龙）节点：沿阴蝎子楔水芯，向外、向下 ────────────────────────
//
// 与水路 `waterSpiralPath` 同源同点（同一套 Ulam 坐标 × CELL、同一套
// scorpionWaterElevation 高程），保证“水龙沿真实水路显形”，不是另画一条。
const WATER_NODES: DragonNode[] = ulamCoords(DRAGON_SEAT_COUNT).map((p, idx) => {
  const seatId = idx + 1;
  return makeNode(seatId, p.x * CELL, scorpionWaterElevation(seatId), p.z * CELL);
});

export function waterDragonNodes(): readonly DragonNode[] {
  return WATER_NODES;
}

export function waterDragonNode(seatId: number): DragonNode {
  assertSeat(seatId, 'waterDragonNode');
  return WATER_NODES[seatId - 1];
}

// ── 阴龙（音龙）节点：底数 2 的等比螺线 × 旋转抛物面（与阳龙互为反向）────
//
// 几何意图（项目主理人定案）：
//   · 俯视（无限远、无 Z）⟹ 纯等比螺线：r = R_out · 2^(−半音/12)，
//     每 12 席（一个八度）半径减半 ⟹ 4 个八度后 r = 9.6/16 = 0.6（16 倍，对上“四次轮回”）；
//   · 近距离看 Z 轴 ⟹ 贴旋转抛物面 z = start + c·(R_out² − r²)，
//     r 越小 z 越高：音龙在玉玺之上，从外圈低处盘旋上升，收向坛心；
//   · 中心是 #00 无极（r=0）：无中心点、不可占有、永不收至 r=0（绝无第 50 席）。
export const SOUND_OUTER_RADIUS = 9.6;
const SOUND_SEMITONES_PER_OCTAVE = 12;
const SOUND_RISE_BASE = 2; // 增长率底数 = 八度：12-TET 公比 2^(1/12)，整圈频率 ×2
const SOUND_HEIGHT_START = PYRAMID_TOP + 0.45; // 外圈起点：玉玺之上
// 旋转抛物面常数：使终点（r=0.6）落在玉玺上方合理高度（视觉范围 21.45 → ~22.37）。
const SOUND_PARABOLIC_C = 0.0100;

const SOUND_NODES: DragonNode[] = Array.from({ length: DRAGON_SEAT_COUNT }, (_, i) => {
  const seatId = i + 1;
  const semitones = seatId - 1; // 0..48
  // 等比螺线（底 2）：r = 9.6 · 2^(−semitones/12)。
  const radius = SOUND_OUTER_RADIUS * Math.pow(SOUND_RISE_BASE, -semitones / SOUND_SEMITONES_PER_OCTAVE);
  // 角度：每 12 席（一个八度）转一整圈 ⟹ 4 个八度走 4 圈。
  const angle = -Math.PI / 2 + (semitones / SOUND_SEMITONES_PER_OCTAVE) * Math.PI * 2;
  // Z 轴贴旋转抛物面：r 越小 z 越高（从下往上走，收向无极）。
  const y = SOUND_HEIGHT_START + SOUND_PARABOLIC_C * (SOUND_OUTER_RADIUS * SOUND_OUTER_RADIUS - radius * radius);
  return makeNode(seatId, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
});

export function soundDragonNodes(): readonly DragonNode[] {
  return SOUND_NODES;
}

export function soundDragonNode(seatId: number): DragonNode {
  assertSeat(seatId, 'soundDragonNode');
  return SOUND_NODES[seatId - 1];
}

// ── 逐席触发的唯一驱动源 ────────────────────────────────────────────────
//
// 两龙共用同一个“已触发席数”。返回 `ritualLitSeatsAt` 的原值，
// 不做任何“提前量”——这就是“禁止预演未来席位”的代码级保证。
export function dualDragonActiveSeats(elapsedSec: number): number {
  return ritualLitSeatsAt(elapsedSec);
}

// ── 对数螺线光迹的收紧系数（#2 要求 3）───────────────────────────────
//
// 对数螺线 r(θ)=r0·e^{bθ}：b 越小，半径每圈增幅越小 → 螺线越“紧”。
// 音越高（midi ↑）→ b ↓ → 越紧；音越低 → b ↑ → 越松。b 随 midi 单调递减。
export const TRAIL_B_LOOSE = 0.3; // 最低音 C2 —— 最松
export const TRAIL_B_TIGHT = 0.1; // 最高音 C6 —— 最紧

export function trailTightnessB(midi: number): number {
  const span = SEAT_TOP_MIDI - SEAT_BOTTOM_MIDI; // 48 个半音
  const t = Math.min(1, Math.max(0, (midi - SEAT_BOTTOM_MIDI) / span));
  return TRAIL_B_LOOSE - (TRAIL_B_LOOSE - TRAIL_B_TIGHT) * t;
}

export function seatTrailTightnessB(seatId: number): number {
  return trailTightnessB(seatMidi(seatId));
}

// ── 茶灯旋转门控（#2 要求 5）──────────────────────────────────────────
//
// 17:00 = 1020s = RITUAL_NAMING_END_SEC：命名幕结束、走马灯幕开始。
// 沿用 RFC-008 引擎既有 maxOmega 的物理事实：120s / 圈 → ω = 2π/120 rad/s。
export const TEA_LANTERN_REV_SEC = 120;
export const TEA_LANTERN_MAX_OMEGA = (2 * Math.PI) / TEA_LANTERN_REV_SEC;

/** 茶灯是否允许转动：仅 ≥1020s(17:00) 之后。 */
export function teaLanternRotationEnabled(elapsedSec: number): boolean {
  return Number.isFinite(elapsedSec) && elapsedSec >= RITUAL_NAMING_END_SEC;
}

// ── 雾中一句（#2 要求 6）──────────────────────────────────────────────
//
// 五幕各一句，窗口两两**不重叠**、首尾相接覆盖 [0, 1800)。
// 因此 fogCaptionsAt 在任意时刻最多返回一句 —— “雾中每次只显示一句”。
export interface FogCaptionWindow {
  from: number;
  to: number;
  line: string;
}

export const FOG_CAPTIONS: readonly FogCaptionWindow[] = [
  { from: 0, to: 180, line: '天地未形，混沌如渊。' },
  { from: 180, to: 1020, line: '四十九席，逐一点亮；水向外行，音向内收。' },
  { from: 1020, to: 1440, line: '十七时整，茶灯始转；一周一百二十秒。' },
  { from: 1440, to: 1751, line: '水尽声收，唯余极点一束冷光。' },
  { from: 1751, to: 1800, line: '万籁俱寂，归于无极。' }
];

/** 当前时刻雾中应展示的句（至多一句；窗口之外为空）。 */
export function fogCaptionsAt(elapsedSec: number): string[] {
  const sec = Number.isFinite(elapsedSec) ? elapsedSec : 0;
  return FOG_CAPTIONS.filter((w) => sec >= w.from && sec < w.to).map((w) => w.line);
}

/** 至多一句的便捷取用（无则 null）。 */
export function fogCaptionAt(elapsedSec: number): string | null {
  const lines = fogCaptionsAt(elapsedSec);
  return lines.length > 0 ? lines[0] : null;
}
