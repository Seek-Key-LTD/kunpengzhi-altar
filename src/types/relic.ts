// 传国玉玺 · 类型契约（器物层）
//
// ── 法统红线（写死在类型里，不是写在注释里）──────────────────────────
// 玉玺是**器物**，不是席位。
// 49 席是封闭集合：第 n 层暴露带 2n−1 席，七层求和 1+3+5+7+9+11+13 = 49。
// 玉玺不占格、不发音、不可认领、不进座次表、不参与 Ulam 螺旋与 MIDI 映射。
// 因此本文件内的任何类型**禁止**出现席位语义字段：
//     seat_id / midi_note / midi_note_name / seat_status / spiral_index / grid_x / grid_z
// 一旦某天有人往 ImperialSealState 里塞了 seat_id，
// 下面那行 __sealStateHasNoSeatSemantics 会直接编译不过 —— 这是故意的。

/** 席位语义黑名单：玉玺类型里出现这些 key 即为破戒 */
export type SeatSemanticsKey =
  | 'seat_id'
  | 'seat_status'
  | 'midi_note'
  | 'midi_note_name'
  | 'midi_velocity'
  | 'spiral_index'
  | 'grid_x'
  | 'grid_z'
  | 'elevation';

/**
 * 编译期断言：T 的键若与席位语义黑名单有交集，求值结果为 never，
 * 于是在 `= true` 处报类型错误。
 */
export type AssertNoSeatSemantics<T> = (keyof T & SeatSemanticsKey) extends never ? true : never;

/**
 * 断代。玉玺的"层"是**时间层**，不是祭坛的七层空间层 —— 别混。
 * 顺序即时间轴顺序（秦 → 汉新 → 魏晋十六国 → 辽金）。
 */
export type SealEra = 'qin' | 'xin' | 'weijin' | 'liaojin';

/** 玉玺的三种形态 */
export type SealMode = 'normal' | 'exploded' | 'stamping';

/** 三级 LOD（≤150K tris 预算下的取舍档位） */
export type SealLod = 'high' | 'medium' | 'low';

/** 可独立拆解的部件（供导演台本逐件讲） */
export type SealPartId = 'jade_body' | 'dragon_knob' | 'gold_corner' | 'dovetail_tenon' | 'engraving';

/** 玉玺运行时状态。**无席位语义**，可安全序列化后上报。 */
export interface ImperialSealState {
  /** 器物唯一标识（非席位号） */
  relic_id: 'imperial_seal';
  /** 当前形态 */
  mode: SealMode;
  /** 当前断代时间层 */
  era: SealEra;
  /** 拆解进度 0（合）→ 1（全拆） */
  exploded_progress: number;
  /** 拓印动画进度 0 → 1（1 = 已按下并出印） */
  stamp_progress: number;
  /** 累计拓印次数（器物自身的计数，不落座次表） */
  stamp_count: number;
  /** 悬浮中心高程（世界坐标 Y） */
  hover_y: number;
  /** 自转速度（转/分） */
  spin_rpm: number;
  /** 当前 LOD 档位 */
  lod: SealLod;
  /** 高质档开关：MeshPhysicalMaterial.transmission（开则吃性能） */
  transmission_enabled: boolean;
  /** 是否已由 GLB 高精资产接管（false = 程序化占位几何） */
  glb_loaded: boolean;
  /** 是否已被选中（选中只高亮，不改形态） */
  selected: boolean;
  /** 是否可见 */
  visible: boolean;
}

/** 刻痕层：一个断代 = 一层，按层过滤可见性 */
export interface SealEraLayer {
  era: SealEra;
  /** 朝代名（用于 UI 文案） */
  dynasty: string;
  /** 书体 */
  script: string;
  /** 刻法：阴刻（凹）/ 阳刻（凸）/ 补铸 / 水蚀 */
  technique: string;
  /** 该层刻痕正文（可能为空，如水蚀层无字） */
  text: string;
  /** 史事注脚 */
  note: string;
}

/** 拓印印记 */
export interface SealStampRecord {
  /** 印记唯一序号（器物内自增，与席号无关） */
  stamp_index: number;
  /** 落下时的世界坐标 */
  x: number;
  y: number;
  z: number;
  /** 落下时玉玺所处的断代层 */
  era: SealEra;
  /** 落下时刻（秒，performance.now()/1000） */
  at: number;
}

// ── 红线自检：改坏了这里会编译失败 ──────────────────────────────────
export const __sealStateHasNoSeatSemantics: AssertNoSeatSemantics<ImperialSealState> = true;
export const __sealEraLayerHasNoSeatSemantics: AssertNoSeatSemantics<SealEraLayer> = true;
export const __sealStampRecordHasNoSeatSemantics: AssertNoSeatSemantics<SealStampRecord> = true;
