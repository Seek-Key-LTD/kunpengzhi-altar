// 导演台机位模式 → 世界坐标 纯数据表
//
// 每个 mode 对应一个机位（pos + lookAt）。
// 不碰 three.js，可被单元测试断言安全边界（不穿墙、不飞出 120 半径）。

import { CAMERA_SAFETY_BY_ROLE } from '../types/altar';

export interface CameraPose {
  pos: [number, number, number];
  lookAt: [number, number, number];
}

export const CAMERA_MODE_POSES: Record<string, CameraPose> = {
  rabbit_hole: { pos: [-11.2, 4.5, 0], lookAt: [-9, 4.5, 0] },
  yin: { pos: [0, 1.8, 2.5], lookAt: [0, 2.6, -7.5] },
  interior: { pos: [0, 16, 18], lookAt: [0, 6, 0] },
  outer_lanterns: { pos: [0, 6.5, 30.5], lookAt: [0, 3.5, 23.5] },
  topdown: { pos: [0, 78, 0.1], lookAt: [0, 0, 0] },
  fountain: { pos: [0, 26, 20], lookAt: [0, 14, 0] },
  cinematic: { pos: [52, 26, 52], lookAt: [0, 5, 0] },
  orbit: { pos: [48, 40, 58], lookAt: [0, 6, 0] },
  patrol: { pos: [46, 24, 46], lookAt: [0, 5, 0] }
} as const;

/**
 * 安全边界：直接引用 types/altar.ts 的 guest 档（0.3 / 120）。
 * 游客档是「一个数字都不能动」的公共入口红线，唯一权威在 altar.ts ——
 * 这里原先手抄一份字面量，权威表一旦调整就会静默漂移成第二口径。
 */
export const CAMERA_SAFETY = CAMERA_SAFETY_BY_ROLE.guest;

/** 机位是否在安全边界内 */
export function poseWithinSafety(pose: CameraPose): boolean {
  const [x, y, z] = pose.pos;
  if (y < CAMERA_SAFETY.minY) return false;
  const r = Math.sqrt(x * x + y * y + z * z);
  return r <= CAMERA_SAFETY.maxRadius;
}
