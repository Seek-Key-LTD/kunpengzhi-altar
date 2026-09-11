// 华夏祭坛 · 几何常量（全坛唯一建材：立方砖）
//
// 砌法（"从外面只能看到最外面那一层"）：
//   标称实心 7 级方锥 = 1²+2²+…+7² = 140 块砖。
//   但真正需要砌的只有**朝天暴露的那 49 块**（各层暴露带 1、3、5、7、9、11、13），
//   剩下 140−49 = 91 = 1²+…+6² 块全都不砌 —— 那就是中间的空腔。
//
//   这 49 块砖 = 49 席，每席一块，按平面切比雪夫半径分四圈同心环：
//     r=0 →  1 块   砖顶 4 格
//     r=1 →  8 块   砖顶 3 格
//     r=2 → 16 块   砖顶 2 格
//     r=3 → 24 块   砖顶 1 格
//   四圈在平面上正好铺满 7×7；每往里一圈平面收 1 格、高度抬 1 格 ⟹ 坡度恒为 1:1 = 45°。
//   每块都是真立方体 ⟹ "全立方体 + 45° 半八面体 + 49 席 + 顶面 7×7" 同时成立。
//
//   四圈围出的空腔是一座三层递收的"阴"锥：5×5 → 3×3 → 1×1（单位：格）。
//   顶端第 1 席留天井，镜头可由此降入阴锥。

export const BRICK = 3.0; // 立方砖边长 = 1 格
export const CELL = 3.0; // 一个席位格
export const LAYERS = 7; // 顶面 7×7
export const PYRAMID_HALF = (LAYERS * CELL) / 2; // 底座半宽 = 10.5
export const RING_TOP = 4; // 顶圈（r=0）砖顶 = 4 格
export const PYRAMID_TOP = RING_TOP * BRICK; // 总高 = 12

export const PLINTH_HALF = 15; // 台基半宽
export const PLINTH_THICKNESS = 1.2;
export const RIVER_WIDTH = CELL; // 河宽 = 1 格
export const RIVER_HALF_LENGTH = PLINTH_HALF + 3;

/** 平面切比雪夫半径 → 该席位所在砖块的顶面高程 */
export function ringToElevation(ring: number): number {
  return (RING_TOP - ring) * BRICK;
}

/** 平面切比雪夫半径 → 该砖块的底面高程 */
export function ringToBottom(ring: number): number {
  return (RING_TOP - ring - 1) * BRICK;
}

/** 平面切比雪夫半径 → 台阶级号（1/3/5/7） */
export function ringToLayer(ring: number): number {
  return ring * 2 + 1;
}

/** 该圈的砖块数（= 暴露带格数 = 该圈席位数） */
export function ringSeatCount(ring: number): number {
  return ring === 0 ? 1 : 8 * ring;
}
