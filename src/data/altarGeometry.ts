// 华夏祭坛 · 几何常量（全坛唯一建材：立方砖）
//
// 设计约束：
//   1. 全部由立方砖砌成 —— 只有立方砖砌出来的阶梯，轮廓才读得出"正八面体砍掉一半"。
//   2. 七级正方形退台方坛，边长 7/6/5/4/3/2/1 格，居中。
//   3. 每级内收 1 砖、每级高 1 砖 ⟹ 坡度恒为 1:1 ⟹ 总高 = 半底 = 45°。
//   4. 每级暴露带 = 1 砖宽，正好是一条环形水槽的宽度。
//
// 49 席落在暴露带上，按平面切比雪夫半径 r 分四档，占据第 1/3/5/7 级：
//   r=0 → 1 席   第 1 级顶
//   r=1 → 8 席   第 3 级顶
//   r=2 → 16 席  第 5 级顶
//   r=3 → 24 席  第 7 级顶

export const BRICK = 1.5; // 立方砖边长
export const CELL = BRICK * 2; // 一个席位格 = 2 砖
export const LAYERS = 7; // 七级退台
export const PYRAMID_HALF = (LAYERS * CELL) / 2; // 底座半宽 = 10.5
export const PYRAMID_TOP = LAYERS * BRICK; // 总高 = 10.5（= 半底，故 45°）

export const PLINTH_HALF = 15; // 台基半宽
export const PLINTH_THICKNESS = 1.2;
export const RIVER_WIDTH = CELL; // 河宽 = 1 格
export const RIVER_HALF_LENGTH = PLINTH_HALF + 3; // 河南北各伸出台基 3

/** 第 k 级（1 = 顶，7 = 底）的层顶高程 */
export function layerTop(k: number): number {
  return (LAYERS - k + 1) * BRICK;
}

/** 平面切比雪夫半径 → 该席位所在台阶级号（1/3/5/7） */
export function ringToLayer(ring: number): number {
  return ring * 2 + 1;
}

/** 平面切比雪夫半径 → 该席位所在的暴露带高程 */
export function ringToElevation(ring: number): number {
  return layerTop(ringToLayer(ring));
}
