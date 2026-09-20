// 席位光迹 · 对数螺线点 纯函数
//
// 每席一条光迹：从音龙节点出发，沿对数螺线 r = 0.06·e^(b·θ) 展开，
// b 越小螺线越紧（音越高越紧，见 dualDragon.seatTrailTightnessB）。
// 不碰 three.js，可被单元测试断言。

import { soundDragonNode, seatTrailTightnessB, DRAGON_SEAT_COUNT } from './dualDragon';

export const TRAIL_STEPS = 48;
export const TRAIL_TURNS = 2.4;
export const TRAIL_BASE_RADIUS = 0.06;
export const TRAIL_RISE = 0.45;

export interface TrailPoint {
  x: number;
  y: number;
  z: number;
}

/** 计算某席位光迹的全部螺线点（含起点）。 */
export function seatTrailPoints(seatId: number): readonly TrailPoint[] {
  const node = soundDragonNode(seatId);
  const b = seatTrailTightnessB(seatId);
  const pts: TrailPoint[] = [];
  for (let s = 0; s <= TRAIL_STEPS; s++) {
    const theta = (s / TRAIL_STEPS) * TRAIL_TURNS * Math.PI * 2;
    const r = TRAIL_BASE_RADIUS * Math.exp(b * theta);
    pts.push({
      x: node.x + Math.cos(theta) * r,
      y: node.y + (s / TRAIL_STEPS) * TRAIL_RISE,
      z: node.z + Math.sin(theta) * r
    });
  }
  return pts;
}

/** 光迹终点（螺线末端）——用于前锋珠或焦点。 */
export function seatTrailEnd(seatId: number): TrailPoint {
  const pts = seatTrailPoints(seatId);
  return pts[pts.length - 1];
}

/** 光迹总数（=席位总数）。 */
export const TRAIL_COUNT = DRAGON_SEAT_COUNT;
