// 内环壁碑 · 外圈事件筛选与碑位 纯函数
//
// 从黄道事件里挑出外圈（max(|x|,|z|)==3）的碑位点，隔一选一配诗，
// 再算碑心世界坐标（贴在阴锥内壁上）。
// 不碰 three.js，可被单元测试断言。

export interface StelaEvent {
  grid_x: number;
  grid_z: number;
  elevation: number;
  seat_id?: number;
}

export interface StelaPose {
  x: number;
  y: number;
  z: number;
  /** 碑面朝向（单位向量 xz 平面） */
  nx: number;
  nz: number;
}

/** 从全部事件里挑外圈碑位点（隔一选一，配 16 章诗）。 */
export function pickStelaEvents(events: readonly StelaEvent[], poemCount: number): StelaEvent[] {
  const outer = events.filter(ev => Math.max(Math.abs(ev.grid_x), Math.abs(ev.grid_z)) === 3)
    .sort((a, b) => (a.seat_id ?? 0) - (b.seat_id ?? 0));
  return outer.filter((_, i) => i % 2 === 0).slice(0, poemCount);
}

/** 计算某碑位点的碑心世界坐标与朝向。 */
export function stelaPose(ev: StelaEvent, cell: number, brick: number, stelaH: number): StelaPose {
  let nx = 0, nz = 0;
  if (Math.abs(ev.grid_x) === 3) nx = Math.sign(ev.grid_x);
  else nz = Math.sign(ev.grid_z);
  return {
    x: ev.grid_x * cell + nx * (cell / 2 + 0.08),
    y: ev.elevation + stelaH / 2 - brick * 0.1,
    z: ev.grid_z * cell + nz * (cell / 2 + 0.08),
    nx, nz
  };
}
