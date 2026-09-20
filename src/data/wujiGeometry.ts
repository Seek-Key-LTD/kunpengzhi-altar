// 无极天听 · 布置几何纯函数
//
// 把 AltarScene 里焊死的"飞碟悬高 / 光柱长度 / 抛物面焦距"收成可断言的纯函数。
// 常数不重复定义：抛物面系数从 dualDragon.ts 取（单一数据源），玉玺高度从 sealSpec 取。

import { SOUND_PARABOLIC_C, SOUND_OUTER_RADIUS, SOUND_HEIGHT_START } from './dualDragon';
import { SEAL_HOVER_Y } from './sealSpec';

/** 飞碟悬高增量：玉玺印面上方多少单位 */
export const WUJI_SAUCER_LIFT = 4.3;

/** 旋转抛物面 z = z0 − c·r² 的焦距 f = 1/(4c)。
 *  c=0.01 时 f=25 —— 这就是"为什么是抛物面"：焦点收在坛底。 */
export function paraboloidFocalLength(c: number): number {
  return 1 / (4 * c);
}

/** 抛物面顶点（r=0 处的 y）= 外圈起点 + c·R²。 */
export function paraboloidVertexY(startY: number, c: number, outerR: number): number {
  return startY + c * outerR * outerR;
}

/** 焦点 z：顶点下方一个焦距处。 */
export function paraboloidFocusZ(startY: number, c: number, outerR: number): number {
  return paraboloidVertexY(startY, c, outerR) - paraboloidFocalLength(c);
}

/** 音龙抛物面的焦距（用 dualDragon 的实际常数）。 */
export const SOUND_PARABOLIC_F = paraboloidFocalLength(SOUND_PARABOLIC_C);

/** 音龙抛物面顶点 y（r=0 收向无极处）。 */
export const SOUND_PARABOLIC_VERTEX_Y = paraboloidVertexY(
  SOUND_HEIGHT_START, SOUND_PARABOLIC_C, SOUND_OUTER_RADIUS
);

/** 音龙抛物面焦点 z（顶点下方 f 处）。 */
export const SOUND_PARABOLIC_FOCUS_Z = paraboloidFocusZ(
  SOUND_HEIGHT_START, SOUND_PARABOLIC_C, SOUND_OUTER_RADIUS
);

/** 飞碟布置：输入玉玺高度，输出飞碟/光柱三段几何。 */
export function saucerLayout(sealHoverY: number = SEAL_HOVER_Y, lift: number = WUJI_SAUCER_LIFT) {
  const saucerY = sealHoverY + lift;
  const beamLen = saucerY - sealHoverY;
  const beamCenterY = (saucerY + sealHoverY) / 2;
  return { saucerY, beamLen, beamCenterY };
}
