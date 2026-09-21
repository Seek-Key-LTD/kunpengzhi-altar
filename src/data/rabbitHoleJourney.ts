/**
 * #21 Rabbit Hole 正典：递归等比门槛
 *
 * 沿 40→19→6→1→2→11→28 轴，经过七层递归门槛，
 * 节点尺度 s_n = s_0 * q^n，形成等比收束的观看体验。
 *
 * 纯函数：不碰 three.js，可直接单元测试。
 */

export const RABBIT_HOLE_NODE_COUNT = 7;

/** 节点轴序列（grid 坐标索引） */
export const RABBIT_HOLE_AXIS: readonly number[] = [40, 19, 6, 1, 2, 11, 28];

/** 等比收束公比 q */
export const RABBIT_HOLE_Q = 0.7;

/** 入口尺度（第 0 层） */
export const RABBIT_HOLE_S0 = 2.0;

/** 节点尺度 */
export interface RabbitHoleNode {
  /** 层索引 0..6 */
  readonly layer: number;
  /** grid 坐标索引 */
  readonly seatIndex: number;
  /** 节点尺度 s_n = s_0 * q^n */
  readonly scale: number;
}

/** 计算七层节点尺度（纯函数） */
export function rabbitHoleJourney(
  axis: readonly number[] = RABBIT_HOLE_AXIS,
  s0: number = RABBIT_HOLE_S0,
  q: number = RABBIT_HOLE_Q
): readonly RabbitHoleNode[] {
  return axis.map((seatIndex, layer) => ({
    layer,
    seatIndex,
    scale: s0 * Math.pow(q, layer),
  }));
}

/** 验证尺度单调性（纯函数） */
export function isMonotonicDecreasing(nodes: readonly RabbitHoleNode[]): boolean {
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].scale >= nodes[i - 1].scale) return false;
  }
  return true;
}
