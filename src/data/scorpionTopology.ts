// 蝎子楔水道 · 拓扑校验 纯函数
//
// 相邻两席必须：曼哈顿距离=1（上下左右相邻）且降势（from.y > to.y）。
// 不碰 three.js，可被单元测试断言。

export interface GridPoint {
  grid_x: number;
  grid_z: number;
  y: number;
}

/** 两点是否曼哈顿相邻（距离=1）。 */
export function isAdjacent(a: GridPoint, b: GridPoint): boolean {
  return Math.abs(a.grid_x - b.grid_x) + Math.abs(a.grid_z - b.grid_z) === 1;
}

/** 蝎子楔拓扑是否合法：相邻且降势。 */
export function validWedge(a: GridPoint, b: GridPoint): boolean {
  return isAdjacent(a, b) && a.y > b.y;
}
