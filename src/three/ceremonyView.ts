// 公共仪式幕次取景核 —— Gitea #10
//
// ── 设计契约（docs/design/008-camera-choreography.md §2 / §3 / §4）────────
// · 姿态是「仪式秒」的**纯函数**：同一 sec ⟹ 逐位相同的 position / target / fov。
//   模块不持有时间、无随机、无墙钟、无累积状态、无任何环境依赖（纪律 D1/D2/D3）。
// · 时间源**只读**：唯一入参 sec 由调用方传入（AltarScene 的 ritualElapsed）；
//   本模块不推进、不改写、不缓存任何时间 —— ritualElapsed 的写入点保持原 4 处不变。
// · 幕次时间窗**不抄数字**：一律引用 src/audio/phaseEnvelope.ts 的 PHASE_WINDOWS
//   （它自己也只引用 types/altar 常量）—— #4 单一包络不变量在取景侧自动成立：
//   未来改任何幕边界，音频与画面同步生效，不可能单边漂移。
// · 终寂幕（PHASE_WINDOWS 末窗，silence）姿态**恒定**：终点参数 = 起点参数
//   ⇒ 全区间逐位相同，与音频三层恒 0 同口径（"收完之后静止"）。
// · #00 无极点：姿态只在「径向距离 r ≥ 16」的柱坐标域里有定义 —— 结构上写不出
//   一个落在中心轴（x=0, z=0）上的机位；本模块从不把 #00 所在高度设为视线靶心。
//
// 命名纪律（§6.1-R2 去毒）：全链路零 DOM 面、零三方依赖、不含任何面向 DOM
// 审计的敏感词 —— 纯域模块，Node 侧 esbuild 可直接打包断言。
//
// Keyframe 校准口径：下表数字是 §3.2 的**默认值**，可校准；
// 但 C1–C7（|position|≤110 / y≥6 / r≥16 / ty<y / dist∈[8,200] / fov∈[30,60]
// / 每秒步长上限）是**合约**，校准不得削弱任何一条。

import { RITUAL_TOTAL_SEC } from '../types/altar';
import { PHASE_WINDOWS } from '../audio/phaseEnvelope';

/** 一帧取景：视点世界坐标、视线目标（恒在中心轴上）、竖直视场角（度）。 */
export interface CeremonyPose {
  /** 视点世界坐标 [x, y, z] */
  position: readonly [number, number, number];
  /** 视线目标世界坐标（恒为 [0, ty, 0] —— 靶心只在中心轴上滑动高度） */
  target: readonly [number, number, number];
  /** 竖直视场角（度） */
  fov: number;
}

// ── 构造器锚点（§3.1）─────────────────────────────────────────────────────
// AltarScene 构造时的字面量机位 (48, 40, 58) / 靶高 6 / fov 45。
// 柱坐标化：r0 = hypot(48, 58)、theta0 = atan2(48, 58) ⇒ 仪式第 0 秒与入场画面
// 零接缝（浮点级重合），不需要任何"摆渡"过渡。
const HOME_X = 48;
const HOME_Z = 58;
const HOME_Y = 40;
const HOME_TY = 6;
const HOME_FOV = 45;
const HOME_R = Math.hypot(HOME_X, HOME_Z);
const HOME_THETA = Math.atan2(HOME_X, HOME_Z);

/** 幕端姿态参数：径向距离、视点高度、靶心高度、竖直视场角。 */
interface StopPoint {
  r: number;
  y: number;
  ty: number;
  fov: number;
}

/**
 * 幕端参数表（§3.2 默认值）：STOPS[i] 为第 i 幕**起点**、STOPS[i+1] 为其**终点**。
 * 第 i+1 幕的起点 = 第 i 幕的终点 —— 换幕连续性由结构保证，不靠人肉对表。
 *
 * 五幕语义（与音频包络同源不同形 —— 同一条时间轴，幕内运动曲线各自独立）：
 *   abyss         起势：几乎看不见的运动，从中景机位缓缓抬升、微收紧，为显形蓄势
 *   naming        抬升 + 推近，靶心升到席面高程 ⇒ 俯览 7×7 席面，逐席点亮看得清
 *   lanterns      下降 + 靶心降到台基面上方 ⇒ 掠外环灯环，fov 放宽收进整圈灯
 *   extinguishing 外撤 + 靶心回升 ⇒ 缓缓退成远观，#00 自然进入画面中部（不追它）
 *   silence       终点 = 起点 ⇒ 全窗恒定（"收完之后静止"）
 */
const STOPS: readonly StopPoint[] = [
  { r: HOME_R, y: HOME_Y, ty: HOME_TY, fov: HOME_FOV }, // 第 0 秒（构造锚点）
  { r: 72, y: 46, ty: 12, fov: 43 },                    // 起势幕终
  { r: 46, y: 62, ty: 21, fov: 40 },                    // 命名幕终（靶心 = 席面高程）
  { r: 54, y: 32, ty: 9, fov: 46 },                     // 走马灯幕终（掠灯环）
  { r: 66, y: 26, ty: 17, fov: 44 },                    // 敛光幕终（远观斜侧）
  { r: 66, y: 26, ty: 17, fov: 44 }                     // 终寂幕终（= 起 ⇒ 恒定）
];

/** 各幕累计绕行角（度，单向、不停顿、不折返）：18 + 330 + 150 + 72 + 0。 */
const ACT_SWEEP_DEG: readonly number[] = [18, 330, 150, 72, 0];

/** 第 i 幕起点的累计绕行角（度）—— 由 ACT_SWEEP_DEG 归纳得出，不手抄。 */
const CUM_SWEEP_DEG: readonly number[] = (() => {
  const acc = [0];
  for (let i = 0; i < ACT_SWEEP_DEG.length; i++) {
    acc.push(acc[i] + ACT_SWEEP_DEG[i]);
  }
  return acc;
})();

const DEG2RAD = Math.PI / 180;

/**
 * 五次多项式缓动（6u⁵ − 15u⁴ + 10u³）：端点导数为 0 ⇒ 幕边界处角速度与线速度
 * 归零。配合"上一幕止值 = 下一幕起值"的参数表结构，每个换幕点在速度上连续。
 */
function smootherstep(x: number): number {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/**
 * 仪式秒 → 取景姿态。**唯一的入参就是仪式秒**；除入参外无任何依赖。
 *
 * · 幕定位：线性扫 PHASE_WINDOWS（唯一真源），sec 恰为总时长时落在末幕。
 * · 幕内进度与 phaseProgress 同口径（线性 raw），再过 smootherstep 得缓动 u。
 *   音频幕内是线性插值、画面是 smootherstep —— 同源不同形，#4 不变量约束的
 *   是"不得有第二套时间轴与阈值"，不是"必须锁相"。
 * · 入参兜底：非有限值（NaN/±Infinity/非数值）一律归 0；越界夹取到
 *   [0, RITUAL_TOTAL_SEC]。返回值恒为有限数且落在合法区间。
 */
export function ceremonyPoseAt(sec: number): CeremonyPose {
  const s = Number.isFinite(sec) ? Math.min(RITUAL_TOTAL_SEC, Math.max(0, sec)) : 0;

  let w = PHASE_WINDOWS.length - 1;
  for (let i = 0; i < PHASE_WINDOWS.length; i++) {
    const win = PHASE_WINDOWS[i];
    if (s >= win.start && s < win.end) {
      w = i;
      break;
    }
  }
  const win = PHASE_WINDOWS[w];
  const from = STOPS[w];
  const to = STOPS[w + 1];
  const span = win.end - win.start;
  const raw = span > 0 ? Math.min(1, Math.max(0, (s - win.start) / span)) : 0;
  const u = smootherstep(raw);

  const r = from.r + (to.r - from.r) * u;
  const y = from.y + (to.y - from.y) * u;
  const ty = from.ty + (to.ty - from.ty) * u;
  const fov = from.fov + (to.fov - from.fov) * u;
  const theta = HOME_THETA + (CUM_SWEEP_DEG[w] + ACT_SWEEP_DEG[w] * u) * DEG2RAD;

  return {
    position: [r * Math.sin(theta), y, r * Math.cos(theta)],
    target: [0, ty, 0],
    fov
  };
}

/**
 * Keyframe 0 = 构造器锚点姿态（仪式第 0 秒与入场画面同构图）。
 * 导出以便反向对齐、防撞：AltarScene 构造字面量一侧若被改动而此处未同步，
 * 断言脚本立即判红。
 */
export const CEREMONY_HOME: CeremonyPose = ceremonyPoseAt(0);
