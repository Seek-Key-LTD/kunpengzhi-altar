// Ulam 素数对角线 纯函数
//
// 两素数格点是否构成对角线（|dx|===|dz| 且距离<=3）。
// 不碰 three.js，可被单元测试断言。

export interface GridPoint {
  grid_x: number;
  grid_z: number;
}

/** 两点是否构成 Ulam 对角线（|dx|===|dz| 且距离<=3）。 */
export function isPrimeDiagonal(a: GridPoint, b: GridPoint, maxDist = 3): boolean {
  const dx = Math.abs(a.grid_x - b.grid_x);
  const dz = Math.abs(a.grid_z - b.grid_z);
  return dx === dz && dx >= 1 && dx <= maxDist;
}
