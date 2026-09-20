// 走马灯章节 → 世界机位 纯几何
//
// 输入章节序号与当前环体转角，输出灯屏目标点与相机点。
// 不碰 three.js，可被单元测试断言。

export const LANTERN_RADIUS = 23.5;
export const LANTERN_HEIGHT = 2.6;
export const LANTERN_CAM_DIST = 6.2;
export const LANTERN_COUNT = 16;

export interface LanternCameraPose {
  /** 灯屏目标点（镜头 lookAt） */
  targetX: number;
  targetY: number;
  targetZ: number;
  /** 相机落点 */
  camX: number;
  camY: number;
  camZ: number;
}

/**
 * chapterIndex 1..16，currentGroupAngle 为灯环当前转角（rad）。
 */
export function lanternCameraPose(
  chapterIndex: number,
  currentGroupAngle: number = 0
): LanternCameraPose {
  const angle = ((chapterIndex - 1) / LANTERN_COUNT) * Math.PI * 2;
  const effectiveAngle = angle + currentGroupAngle;

  const targetX = Math.sin(effectiveAngle) * LANTERN_RADIUS;
  const targetZ = Math.cos(effectiveAngle) * LANTERN_RADIUS;
  const targetY = LANTERN_HEIGHT;

  const camRadius = LANTERN_RADIUS + LANTERN_CAM_DIST;
  const camX = Math.sin(effectiveAngle) * camRadius;
  const camZ = Math.cos(effectiveAngle) * camRadius;
  const camY = LANTERN_HEIGHT + 0.5;

  return { targetX, targetY, targetZ, camX, camY, camZ };
}
