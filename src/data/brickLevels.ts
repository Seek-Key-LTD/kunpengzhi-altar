// 砖层数 纯函数
//
// elevation → 砖层数：round(elevation / BRICK)，至少 1 层。
// 不碰 three.js，可被单元测试断言。

/** 砖层数：至少 1 层，向上取整到 BRICK 的倍数。 */
export function brickLevels(elevation: number, brick: number): number {
  return Math.max(1, Math.round(elevation / brick));
}
