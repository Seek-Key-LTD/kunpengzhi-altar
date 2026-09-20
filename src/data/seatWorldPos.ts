// 席位世界坐标 纯函数
//
// grid 坐标 → 世界坐标：x = grid_x * CELL, z = grid_z * CELL, y = elevation + 0.12。
// 不碰 three.js，可被单元测试断言。

export const SEAT_OFFSET_Y = 0.12;

export interface SeatGrid {
  grid_x: number;
  grid_z: number;
  elevation: number;
}

/** grid 坐标 → 世界坐标。 */
export function seatWorldPos(ev: SeatGrid, cell: number): { x: number; y: number; z: number } {
  return {
    x: ev.grid_x * cell,
    y: ev.elevation + SEAT_OFFSET_Y,
    z: ev.grid_z * cell
  };
}
