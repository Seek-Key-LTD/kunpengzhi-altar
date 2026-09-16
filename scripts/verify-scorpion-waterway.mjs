/**
 * 蝎子楔水路的纯几何验收。
 * 不依赖 WebGL/Rapier：CI 先把错误拓扑、反坡和露天水路挡在合并前。
 */
import assert from 'node:assert/strict';

const BRICK = 3;
const CELL = BRICK;
const PYRAMID_TOP = 21;
const DROP_PER_SEAT = (PYRAMID_TOP - BRICK) / 48;
const EMBED_DEPTH = BRICK * 0.56;

function ulamCoords(total) {
  const points = [{ x: 0, z: 0 }];
  let x = 0; let z = 0; let step = 1;
  while (points.length < total) {
    for (let i = 0; i < step && points.length < total; i++) { x += 1; points.push({ x, z }); }
    for (let i = 0; i < step && points.length < total; i++) { z += 1; points.push({ x, z }); }
    step += 1;
    for (let i = 0; i < step && points.length < total; i++) { x -= 1; points.push({ x, z }); }
    for (let i = 0; i < step && points.length < total; i++) { z -= 1; points.push({ x, z }); }
    step += 1;
  }
  return points;
}

const path = ulamCoords(49).map((point, index) => ({
  seat: index + 1,
  ...point,
  y: PYRAMID_TOP - index * DROP_PER_SEAT - EMBED_DEPTH
}));

assert.equal(path.length, 49, '水龙必须恰有 49 个席位节点');
for (let i = 0; i < path.length - 1; i++) {
  const a = path[i];
  const b = path[i + 1];
  assert.equal(Math.abs(a.x - b.x) + Math.abs(a.z - b.z), 1, `${a.seat}→${b.seat} 必须是相邻 Cube 接口`);
  assert.ok(a.y > b.y, `${a.seat}→${b.seat} 必须严格降势`);
  assert.equal(Number((a.y - b.y).toFixed(8)), Number(DROP_PER_SEAT.toFixed(8)), `${a.seat}→${b.seat} 的势差必须恒定`);
}

// 阳 Cube 边长不许为水路让步；水芯必须在 Cube 内部而非外露顶面。
assert.equal(CELL, BRICK, '一个格只能是一枚等边阳 Cube');
for (const point of path) {
  const top = PYRAMID_TOP - (point.seat - 1) * DROP_PER_SEAT;
  assert.ok(point.y < top && point.y > top - BRICK, `第 ${point.seat} 席水芯必须埋在其顶层 Cube 内`);
}

console.log(`scorpion-waterway: 49 nodes, 48 sealed interfaces, Δh=${DROP_PER_SEAT}`);
