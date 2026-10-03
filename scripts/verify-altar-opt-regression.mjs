/**
 * src/three 优化回归门禁 · 三套件（分支 mini/altar-opt）：
 *
 *   1. 蝎子楔实例化 —— buildScorpionWaterway 把 48 段全同楔收编为 3 个 InstancedMesh
 *      （144 draw calls → 3），拓扑错误必须整体拒绝（不得留半套网格、不得注入水路）。
 *   2. 素数线材质独立 —— buildPrimeDiagonalLines 逐线 clone 材质：渲染循环逐线写
 *      material.opacity 做相位脉冲，共享材质会让 N 次写只剩最后一次；且不再携带
 *      linewidth 死参数（WebGL 恒 1px）。
 *   3. 席位构建收编 —— buildSeats 几何全部共享 + 材质按组合缓存 + 每席花瓣 8→1
 *      InstancedMesh，场景对象总量显著低于"每席独立 mesh"旧口径；同时 pad 的
 *      userData.seatId raycast 语义（EventHandlers: hit.userData?.seatId）原样保留，
 *      逐席 pad 不得被实例化吞掉。
 *
 * 零 WebGL 依赖：three 的场景图 / 几何在 node 纯 JS 可跑（绝不 new WebGLRenderer）。
 * 沿用仓库既有模式：esbuild 把**真模块**打进临时 mjs 再 import。three 保持 external ——
 * 临时目录放在 node_modules/ 下让 bare import 解析到仓库运行时同款 three，
 * 门禁与被测 builder 共享同一模块实例（instanceof 语义成立），node_modules 不入 git。
 *
 * 运行：node scripts/verify-altar-opt-regression.mjs
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// —— 三套件各自的断言计数 ——
const suite = (name) => {
  const s = { name, n: 0 };
  return {
    ok(cond, msg) { assert.ok(cond, `✗ [${name}] ${msg}`); s.n++; },
    eq(actual, expected, msg) { assert.strictEqual(actual, expected, `✗ [${name}] ${msg}`); s.n++; },
    deep(actual, expected, msg) { assert.deepStrictEqual(actual, expected, `✗ [${name}] ${msg}`); s.n++; },
    throws(fn, re, msg) { assert.throws(fn, re, `✗ [${name}] ${msg}`); s.n++; },
    get count() { return s.n; }
  };
};
const s1 = suite('1·蝎子楔实例化');
const s2 = suite('2·素数线材质独立');
const s3 = suite('3·席位构建收编');

// —— esbuild 打包真模块（与 verify-scorpion-waterway / verify-dual-dragon 同款）——
const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
s1.ok(existsSync(esbuildBin), '缺少 esbuild（vite 内置依赖）——无法对真模块断言');

const ENTRIES = [
  'src/three/ScorpionWaterwayBuilder.ts',
  'src/three/PrimeDiagonalBuilder.ts',
  'src/three/SeatsBuilder.ts',
  'src/three/SeatLotusRig.ts',
  'src/data/altarGeometry.ts',
  'src/data/spiral_events.ts',
  'src/data/seatWorldPos.ts',
  'src/data/primeDiagonal.ts'
];

// 临时目录必须落在 node_modules/ 内：three 保持 external，bundle 里的 bare
// import "three" 要能向上解析到仓库依赖（且崩溃残留也不脏 git 工作区）。
const tmp = mkdtempSync(resolve(ROOT, 'node_modules', 'altar-opt-verify-'));
const M = {};
try {
  // 逐入口打包（verify-dual-dragon.mjs 同款）：--outfile 落到 tmp/<名>.mjs，
  // three 保持 external —— 直接用仓库运行时 three，类身份与生产一致。
  for (const rel of ENTRIES) {
    const key = basename(rel, '.ts');
    const outfile = resolve(tmp, `${key}.mjs`);
    execFileSync(esbuildBin, [
      resolve(ROOT, rel),
      '--bundle', '--platform=node', '--format=esm',
      '--external:three',
      '--log-level=warning',
      `--outfile=${outfile}`
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    M[key] = await import(pathToFileURL(outfile).href);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const { buildScorpionWaterway } = M.ScorpionWaterwayBuilder;
const { buildPrimeDiagonalLines } = M.PrimeDiagonalBuilder;
const { buildSeats } = M.SeatsBuilder;
const { SeatLotusRig } = M.SeatLotusRig;
const { CELL, SEATS_PER_LEVEL, ulamCoords, scorpionWaterElevation } = M.altarGeometry;
const { INITIAL_SPIRAL_EVENTS } = M.spiral_events;
const { isPrimeDiagonal } = M.primeDiagonal;

// ══════════════════════════════════════════════════════════════════════
// 1 · 蝎子楔实例化：buildScorpionWaterway → 3 个 InstancedMesh（各 48 实例）
// ══════════════════════════════════════════════════════════════════════
// events 用真实数据源：INITIAL_SPIRAL_EVENTS 由 src/data/spiral_events.ts 内的
// 真 ulamCoords 生成（同 verify-scorpion-waterway.mjs 的 49 节点口径），此处再审计同源性。
const events = INITIAL_SPIRAL_EVENTS;
s1.eq(events.length, 49, '水路事件恰 49 席（INITIAL_SPIRAL_EVENTS）');
const ulam = ulamCoords(SEATS_PER_LEVEL * 7);
const offGrid = events.findIndex((ev, i) => ev.grid_x !== ulam[i].x || ev.grid_z !== ulam[i].z);
s1.eq(offGrid, -1, `事件 grid 坐标与真 ulamCoords 逐一同源（首个偏离在第 ${offGrid + 1} 席）`);

const waterworksGroup = new THREE.Group();
const waterPaths = [];
buildScorpionWaterway(events, waterworksGroup, (pts) => waterPaths.push(pts));

s1.eq(waterPaths.length, 1, 'setWaterPath 恰被回调一次（水路整体注入水龙）');
s1.eq(waterPaths[0].length, 49, '注入水龙的水路恰 49 个点');
const badPt = events.findIndex((ev, i) =>
  waterPaths[0][i].x !== ev.grid_x * CELL ||
  Math.abs(waterPaths[0][i].y - scorpionWaterElevation(ev.seat_id)) > 1e-9 ||
  waterPaths[0][i].z !== ev.grid_z * CELL
);
s1.eq(badPt, -1, `水路点 = (grid_x·CELL, scorpionWaterElevation(seat_id), grid_z·CELL)（第 ${badPt + 1} 席不符）`);
const notDesc = waterPaths[0].findIndex((p, i) => i > 0 && p.y >= waterPaths[0][i - 1].y);
s1.eq(notDesc, -1, `水路沿螺旋严格降势（第 ${notDesc + 1} 点未降）`);

s1.eq(waterworksGroup.children.length, 3, '水路组恰 3 个子节点（套管/水芯/蝎节）');
const nonInstanced = waterworksGroup.children.findIndex((c) => !c.isInstancedMesh);
s1.eq(nonInstanced, -1, '3 个子节点全部是 THREE.InstancedMesh（144 draw calls → 3）');
const [casing, bore, joint] = waterworksGroup.children;

s1.eq(casing.count, 48, '套管实例数 = 48 段楔');
s1.eq(bore.count, 48, '水芯实例数 = 48 段楔');
s1.eq(joint.count, 48, '蝎节实例数 = 48 段楔');

for (const [label, mesh] of [['套管', casing], ['水芯', bore], ['蝎节', joint]]) {
  s1.ok(
    mesh.boundingSphere !== null &&
    Number.isFinite(mesh.boundingSphere.radius) &&
    mesh.boundingSphere.radius > 0,
    `${label} 已按实例矩阵 computeBoundingSphere（包围球非空、半径有限为正）`
  );
}

s1.deep(
  waterworksGroup.children.map((c) => c.userData?.type),
  ['scorpion_wedge_instanced', 'scorpion_water_core_instanced', 'scorpion_joint_instanced'],
  '三个实例化网格的 userData.type 依序为 套管/水芯/蝎节'
);
s1.deep(
  casing.userData.wedges.map((w) => [w.fromSeat, w.toSeat]),
  events.slice(0, 48).map((ev, i) => [ev.seat_id, events[i + 1].seat_id]),
  '套管实例 wedges 逐段对齐真实席号（fromSeat→toSeat）'
);
s1.deep(
  joint.userData.seats,
  events.slice(0, 48).map((ev) => ev.seat_id),
  '蝎节实例逐段落位真实席号（每楔起点，末点无节）'
);

// 拓扑错误路径：两个不相邻的 grid 点（曼哈顿距离 2）必须 throw，且零残留。
const badGroup = new THREE.Group();
let badPathCalls = 0;
const nonAdjacent = [
  { seat_id: 1, grid_x: 0, grid_z: 0 },
  { seat_id: 2, grid_x: 2, grid_z: 0 } // 曼哈顿距离 2：不相邻
];
s1.throws(
  () => buildScorpionWaterway(nonAdjacent, badGroup, () => { badPathCalls++; }),
  /蝎子楔拓扑错误：1→2/,
  '两个不相邻的 grid 点必须 throw（拓扑全校验先行）'
);
s1.eq(badGroup.children.length, 0, '拓扑错误不得留下半套网格');
s1.eq(badPathCalls, 0, '拓扑错误不得把路径注入 rig（setWaterPath 未被调用）');

// 补充：相邻但升势同样非法（validWedge = 相邻 ∧ 降势）。
const uphill = [
  { seat_id: 2, grid_x: 0, grid_z: 1 },
  { seat_id: 1, grid_x: 0, grid_z: 0 } // 相邻，但 scorpionWaterElevation(2) < (1)：升势
];
s1.throws(
  () => buildScorpionWaterway(uphill, new THREE.Group(), () => {}),
  /蝎子楔拓扑错误：2→1/,
  '相邻但升势同样必须 throw'
);

// ══════════════════════════════════════════════════════════════════════
// 2 · 素数线材质独立：逐线 clone 材质，互不相同；linewidth 死参数已删
// ══════════════════════════════════════════════════════════════════════
// getSeatWorldPos 与生产接线同款：真 seatWorldPos(ev, CELL) → THREE.Vector3。
const worldPos = (ev) => {
  const p = M.seatWorldPos.seatWorldPos(ev, CELL);
  return new THREE.Vector3(p.x, p.y, p.z);
};

const primeGroup = new THREE.Group();
buildPrimeDiagonalLines(events, worldPos, primeGroup);
const lines = primeGroup.children;

const allLines = lines.findIndex((c) => !c.isLine);
s2.eq(allLines, -1, '组内全部子节点都是 THREE.Line');
s2.ok(lines.length > 1, `素数线必须多于一条（实际 ${lines.length} 条）`);

// 线数必须与真 isPrimeDiagonal 在真实 49 席上的配对结果一致（数据驱动，不抄数）。
const primes = events.filter((ev) => ev.is_prime);
let expectedLines = 0;
for (let i = 0; i < primes.length; i++) {
  for (let j = i + 1; j < primes.length; j++) {
    if (isPrimeDiagonal(primes[i], primes[j])) expectedLines++;
  }
}
s2.eq(lines.length, expectedLines, `线数 = 真 isPrimeDiagonal 配对数（${primes.length} 个素数席 → ${expectedLines} 条）`);

const mats = lines.map((l) => l.material);
s2.eq(new Set(mats).size, lines.length, '所有 line 的 material 互不相同（Set size === 线数）——逐线 opacity 相位脉冲的前提');
const badMat = mats.findIndex((m) => !(m?.isLineBasicMaterial === true && m.transparent === true));
s2.eq(badMat, -1, '每条线材质都是 transparent 的 LineBasicMaterial（渲染循环逐线写 opacity）');

// linewidth 死参数：three 0.174 的 LineBasicMaterial 构造器固有 this.linewidth = 1
// （own property，clone 后仍为 1）——"材质无 linewidth 属性（undefined）"在本仓库
// three 版本下不可满足；死参数删除的可观测口径 = 无人覆盖默认值 1 + 源码无该 token。
const lwBad = mats.find((m) => m.linewidth !== 1);
s2.eq(lwBad, undefined, '材质 linewidth 保持 three 默认 1（无任何自定义覆盖 —— 死参数已删）');

const builderSrc = readFileSync(resolve(ROOT, 'src/three/PrimeDiagonalBuilder.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
s2.ok(!/linewidth/.test(builderSrc), 'PrimeDiagonalBuilder 去注释源码不再出现 linewidth 死参数');

const badGeo = lines.findIndex((l) => l.geometry.getAttribute('position').count !== 2);
s2.eq(badGeo, -1, `每条线 geometry 恰 2 个端点（第 ${badGeo + 1} 条不符）`);

// ══════════════════════════════════════════════════════════════════════
// 3 · 席位构建收编：共享几何/组合材质 + 花瓣 8→1 InstancedMesh，raycast 语义保留
// ══════════════════════════════════════════════════════════════════════
const seatEvents = INITIAL_SPIRAL_EVENTS;
const seatPads = new Map();
const lotusRig = new SeatLotusRig(); // 真实 lotus 接线（AltarScene 同款）
const registered = [];
const lotus = {
  register: (id, group) => { registered.push([id, group]); lotusRig.register(id, group); }
};
const outerShellGroup = new THREE.Group();
buildSeats(seatEvents, worldPos, seatPads, lotus, outerShellGroup);

const uniqueIds = new Set(registered.map(([id]) => id));
s3.ok(registered.length === seatEvents.length && uniqueIds.size === seatEvents.length,
  `lotus.register 每席恰一次且席号唯一（${registered.length} 次注册）`);
s3.eq(seatPads.size, seatEvents.length, `seatPads 恰注册 ${seatEvents.length} 个 pad`);

let instancedCount = 0;
let drawableCount = 0; // Mesh ∪ InstancedMesh 并集（InstancedMesh extends Mesh，不重复计）
outerShellGroup.traverse((obj) => {
  if (obj.isInstancedMesh) instancedCount++;
  if (obj.isMesh || obj.isInstancedMesh) drawableCount++;
});
s3.ok(instancedCount > 0, `组内 InstancedMesh 数量 > 0（实际 ${instancedCount}：每席花瓣 8 瓣 → 1 实例）`);

// 旧口径 = 每席独立 mesh：49 × (托座1 + 花瓣8 + 花芯1) + 素数环 15 = 505 个对象。
// 收编后：49 pad + 49 花芯 + 49 花瓣实例 + 15 素数环 = 162 << 200。
const OLD_BASELINE = seatEvents.length * 10 + primes.length;
s3.ok(drawableCount < 200,
  `Mesh+InstancedMesh 总量 ${drawableCount} << 200（旧"每席独立 mesh"口径 ≈ ${OLD_BASELINE}）`);
s3.ok(drawableCount >= seatEvents.length * 3,
  `总量 ${drawableCount} ≥ 3×49 —— 计数健全（每席至少 托座/花芯/花瓣实例）`);

// 每席 pad 的 userData 结构 = EventHandlers raycast 语义（hit.userData?.seatId）。
let padBad = null;
for (const ev of seatEvents) {
  const pad = seatPads.get(ev.seat_id);
  if (!pad || pad.userData?.type !== 'seat_pad' || pad.userData?.seatId !== ev.seat_id) {
    padBad = ev.seat_id; break;
  }
}
s3.eq(padBad, null, `每席 pad 均注册 seatPads 且 userData = { type: "seat_pad", seatId }（raycast 拾取语义；首违席 #${padBad}）`);

// pad 必须保持逐席独立 Mesh——单实例化会丢掉逐席 raycast 语义（builder 注释承诺）。
const instancedPad = [...seatPads.values()].findIndex((pad) => pad.isInstancedMesh || !pad.isMesh);
s3.eq(instancedPad, -1, `所有 pad 仍是独立 Mesh 而非实例（首违索引 ${instancedPad}）`);

// 花瓣实例挂每席 flowerGroup 内、userData.seatId 对齐席号；且 lotus 注册的正是该 flowerGroup。
let flowerBad = null;
for (const ev of seatEvents) {
  const seatGroup = seatPads.get(ev.seat_id).parent;
  const flowerGroup = seatGroup.children.find((c) => c.isGroup);
  const petals = flowerGroup?.children.find((c) => c.isInstancedMesh);
  const registeredGroup = registered.find(([id]) => id === ev.seat_id)?.[1];
  if (
    !petals ||
    petals.userData?.type !== 'seat_petals' ||
    petals.userData?.seatId !== ev.seat_id ||
    registeredGroup !== flowerGroup
  ) { flowerBad = ev.seat_id; break; }
}
s3.eq(flowerBad, null, `每席花瓣 InstancedMesh 的 userData.seatId 对齐，且 lotus 注册该 flowerGroup（首违席 #${flowerBad}）`);

// pad 世界坐标 = 真 seatWorldPos + 托座抬起 0.18（builder 常量）——raycast 落点即席位。
let worldBad = null;
for (const ev of seatEvents) {
  const pad = seatPads.get(ev.seat_id);
  const v = pad.position.clone(); // 同源 three 的 Vector3
  pad.getWorldPosition(v);
  const expect = M.seatWorldPos.seatWorldPos(ev, CELL);
  if (
    Math.abs(v.x - expect.x) > 1e-9 ||
    Math.abs(v.z - expect.z) > 1e-9 ||
    Math.abs(v.y - (expect.y + 0.18)) > 1e-9
  ) { worldBad = ev.seat_id; break; }
}
s3.eq(worldBad, null, `每席 pad 世界坐标 = seatWorldPos + 0.18 抬起（raycast 落点即席位；首违席 #${worldBad}）`);

// ══════════════════════════════════════════════════════════════════════
console.log(
  `altar-opt 回归：三套件全绿\n` +
  `  1·蝎子楔实例化：49 席水路 → 3 个 InstancedMesh × 48 实例，包围球已按实例重算；拓扑错误（不相邻/升势）均整体拒绝\n` +
  `  2·素数线材质独立：${primes.length} 个素数席 → ${lines.length} 条线，材质两两互不相同，linewidth 死参数已删（源码审计 + 运行时默认值）\n` +
  `  3·席位构建收编：Mesh+InstancedMesh 总量 ${drawableCount}（旧口径 ≈ ${OLD_BASELINE}），花瓣 8→1 实例 ×49，pad 逐席独立且 userData.seatId raycast 语义保留\n` +
  `  断言：套件1 ${s1.count} + 套件2 ${s2.count} + 套件3 ${s3.count} = ${s1.count + s2.count + s3.count} 条全部通过\n` +
  `  数据源：src/three/{ScorpionWaterway,PrimeDiagonal,Seats}Builder.ts · src/data/{altarGeometry,spiral_events,seatWorldPos}.ts（esbuild 现场打包，three external）`
);
