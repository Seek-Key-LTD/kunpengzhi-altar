// 五阶段音频包络 —— Gitea #4
//
// ── 设计契约（纯函数，唯一权威；供 altarAudio 与 npm test 共用）────────
// · 三类声音：水声(water) / 翻斗链条(bucket) / 低频空间混响(reverb)。
// · 包络**只由** #8 的单一时间轴 `ritualPhaseAt(sec)`（src/types/altar.ts）驱动，
//   **禁止复制第二套时间轴** —— 本模块不新造任何相位阈值，全部来自 types/altar 常量。
// · 五幕：abyss(0–180) / naming(180–1020) / lanterns(1020–1440)
//   / extinguishing(1440–1751) / silence(1751–1800)。
// · silence 幕 1751→1800 **恰 49s**，三层增益恒为 0（完全归零，不灰不响）。

import {
  RitualPhase,
  ritualPhaseAt,
  RITUAL_ABYSS_END_SEC,
  RITUAL_NAMING_END_SEC,
  RITUAL_LANTERNS_END_SEC,
  WUJI_SILENCE_SEC,
  RITUAL_TOTAL_SEC
} from '../types/altar';

/** 三条被包络调制的声链。 */
export type AudioLayer = 'water' | 'bucket' | 'reverb';
export const AUDIO_LAYERS: readonly AudioLayer[] = ['water', 'bucket', 'reverb'];

/** 三层目标增益（线性 [0,1]）。 */
export interface LayerGains {
  water: number;
  bucket: number;
  reverb: number;
}

export interface PhaseWindow {
  phase: RitualPhase;
  /** 闭区间起点（含）。 */
  start: number;
  /** 开区间终点（不含）。 */
  end: number;
}

/**
 * 五幕时间窗（秒）。**唯一真源**：全部取自 types/altar 的既有阈值常量，
 * 本表不含任何自造数字 —— 这就是“不复制第二套时间轴”的代码级保证。
 */
export const PHASE_WINDOWS: readonly PhaseWindow[] = [
  { phase: 'abyss',         start: 0,                       end: RITUAL_ABYSS_END_SEC },
  { phase: 'naming',        start: RITUAL_ABYSS_END_SEC,    end: RITUAL_NAMING_END_SEC },
  { phase: 'lanterns',      start: RITUAL_NAMING_END_SEC,   end: RITUAL_LANTERNS_END_SEC },
  { phase: 'extinguishing', start: RITUAL_LANTERNS_END_SEC, end: WUJI_SILENCE_SEC },
  { phase: 'silence',       start: WUJI_SILENCE_SEC,        end: RITUAL_TOTAL_SEC }
];

export function phaseWindow(phase: RitualPhase): PhaseWindow {
  const w = PHASE_WINDOWS.find((x) => x.phase === phase);
  if (!w) throw new Error(`applyPhaseEnvelope: 未知幕次 ${phase}`);
  return w;
}

/** 幕内进度 [0,1]：由 ritualPhaseAt(sec) 定位幕次后线性归一到 [0,1]。纯函数。 */
export function phaseProgress(sec: number): number {
  const s = Number.isFinite(sec) ? sec : 0;
  const w = phaseWindow(ritualPhaseAt(s));
  const span = w.end - w.start;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (s - w.start) / span));
}

/**
 * 每幕三层的 [起点增益, 终点增益]，幕内按 secProgress 线性插值。
 *
 * 语义：
 *   · abyss —— 深渊黑场：机器独鸣（链条 0.45→0.6），水尚未发（0），低频垫底(0.3→0.4)。
 *   · naming —— 命名幕：水随 49 席逐一点亮而涨（0→0.7），链条渐强(0.6→0.9)，混响垫高(0.4→0.6)。
 *   · lanterns —— 走马灯幕：水满(0.7→1.0)，链条回落(0.9→0.75)，空间最开(0.6→0.8)。
 *   · extinguishing —— 收束幕：水、链条衰减到 0，混响拖尾(0.8→0.12)。
 *   · silence —— 终寂：三层**恒 0**（1751→1800 恰 49s 完全归零）。
 */
const ENVELOPE_TARGETS: Record<
  RitualPhase,
  { water: [number, number]; bucket: [number, number]; reverb: [number, number] }
> = {
  abyss:         { water: [0.0, 0.0],   bucket: [0.45, 0.6], reverb: [0.3, 0.4] },
  naming:        { water: [0.0, 0.7],   bucket: [0.6, 0.9],  reverb: [0.4, 0.6] },
  lanterns:      { water: [0.7, 1.0],   bucket: [0.9, 0.75], reverb: [0.6, 0.8] },
  extinguishing: { water: [1.0, 0.0],   bucket: [0.75, 0.0], reverb: [0.8, 0.12] },
  silence:       { water: [0.0, 0.0],   bucket: [0.0, 0.0],  reverb: [0.0, 0.0] }
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 五阶段包络：给定幕次与幕内进度，返回三条声链的目标增益。
 * 纯函数，无副作用 —— 断言与场景共用。
 */
export function applyPhaseEnvelope(phase: RitualPhase, secProgress: number): LayerGains {
  const e = ENVELOPE_TARGETS[phase];
  if (!e) throw new Error(`applyPhaseEnvelope: 未知幕次 ${phase}`);
  const t = Math.min(1, Math.max(0, Number.isFinite(secProgress) ? secProgress : 0));
  return {
    water: lerp(e.water[0], e.water[1], t),
    bucket: lerp(e.bucket[0], e.bucket[1], t),
    reverb: lerp(e.reverb[0], e.reverb[1], t)
  };
}

/**
 * 单一时间轴取用：给定仪式时间（秒）→ 三层增益。
 * 完全由 `ritualPhaseAt(sec)` + `phaseProgress(sec)` 决定，不引入任何旁路时间源。
 */
export function envelopeAt(sec: number): LayerGains {
  const s = Number.isFinite(sec) ? sec : 0;
  return applyPhaseEnvelope(ritualPhaseAt(s), phaseProgress(s));
}

/** silence 幕时长（秒）—— 1751→1800 恰 49s。 */
export const SILENCE_SPAN_SEC = WUJI_SILENCE_SEC <= RITUAL_TOTAL_SEC
  ? RITUAL_TOTAL_SEC - WUJI_SILENCE_SEC
  : 0;
