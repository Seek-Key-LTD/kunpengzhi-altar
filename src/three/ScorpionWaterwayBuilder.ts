import * as THREE from 'three';
import { CELL, scorpionWaterElevation, SCORPION_CASING_RADIUS, SCORPION_BORE_RADIUS } from '../data/altarGeometry';
import { validWedge } from '../data/scorpionTopology';

/**
 * 蝎子楔水道：49 席水线 + 拓扑校验 + 套管/水芯/蝎节。
 * 独立 builder，从 AltarScene 拆出。
 *
 * 性能口径：48 段楔全部是直线（LineCurve3），管/芯/节形状各自全同——
 * 用 3 个 InstancedMesh（套管/水芯/蝎节）替代逐段 Mesh，144 draw calls → 3。
 * 实例矩阵：单位管模板沿 +Y 长 1，旋转对齐 + 沿 Y 缩放长度（半径在 XZ，不受缩放影响）。
 */
export function buildScorpionWaterway(
  events: readonly any[],
  waterworksGroup: THREE.Group,
  setWaterPath: (points: THREE.Vector3[]) => void
): void {
  const points = events.map((event) => new THREE.Vector3(
    event.grid_x * CELL,
    scorpionWaterElevation(event.seat_id),
    event.grid_z * CELL
  ));

  // 拓扑全校验先行：出错时不得把路径注入 rig、不得留下半套网格。
  for (let index = 0; index < points.length - 1; index++) {
    const event = events[index];
    const next = events[index + 1];
    if (!validWedge({grid_x: event.grid_x, grid_z: event.grid_z, y: points[index].y}, {grid_x: next.grid_x, grid_z: next.grid_z, y: points[index + 1].y})) {
      throw new Error(`蝎子楔拓扑错误：${event.seat_id}→${next.seat_id} 必须相邻且降势`);
    }
  }
  setWaterPath(points);

  const casingMat = new THREE.MeshStandardMaterial({
    color: 0x5c3216,
    emissive: 0x251006,
    emissiveIntensity: 0.34,
    roughness: 0.29,
    metalness: 0.84
  });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0369a1,
    emissiveIntensity: 1.1,
    roughness: 0.04,
    metalness: 0.62,
    transparent: true,
    opacity: 0.88
  });

  const wedgeCount = points.length - 1;

  // 单位直管模板：沿 +Y、长 1、中点在原点。
  const axis = new THREE.LineCurve3(
    new THREE.Vector3(0, -0.5, 0),
    new THREE.Vector3(0, 0.5, 0)
  );
  const casingGeo = new THREE.TubeGeometry(axis, 12, SCORPION_CASING_RADIUS, 12, false);
  const boreGeo = new THREE.TubeGeometry(axis, 12, SCORPION_BORE_RADIUS, 10, false);
  const jointGeo = new THREE.SphereGeometry(SCORPION_CASING_RADIUS * 1.08, 12, 10);

  const casingMesh = new THREE.InstancedMesh(casingGeo, casingMat, wedgeCount);
  const boreMesh = new THREE.InstancedMesh(boreGeo, waterMat, wedgeCount);
  const jointMesh = new THREE.InstancedMesh(jointGeo, casingMat, wedgeCount);

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const wedges: Array<{ fromSeat: number; toSeat: number }> = [];

  for (let index = 0; index < wedgeCount; index++) {
    const from = points[index];
    const to = points[index + 1];
    const event = events[index];
    const next = events[index + 1];

    dir.subVectors(to, from);
    const length = dir.length();
    dir.normalize();
    quat.setFromUnitVectors(up, dir);
    mid.addVectors(from, to).multiplyScalar(0.5);
    scale.set(1, length, 1);
    matrix.compose(mid, quat, scale);
    casingMesh.setMatrixAt(index, matrix);
    boreMesh.setMatrixAt(index, matrix);

    // 蝎节仍按原语义只落在每楔起点（末点无节）。
    matrix.compose(from, quat.identity(), scale.set(1, 1, 1));
    jointMesh.setMatrixAt(index, matrix);

    wedges.push({ fromSeat: event.seat_id, toSeat: next.seat_id });
  }

  casingMesh.instanceMatrix.needsUpdate = true;
  boreMesh.instanceMatrix.needsUpdate = true;
  jointMesh.instanceMatrix.needsUpdate = true;
  // 实例化后包围球须按实例矩阵重算，否则视锥剔除会整组误裁。
  casingMesh.computeBoundingSphere();
  boreMesh.computeBoundingSphere();
  jointMesh.computeBoundingSphere();

  casingMesh.userData = { type: 'scorpion_wedge_instanced', count: wedgeCount, wedges };
  boreMesh.userData = { type: 'scorpion_water_core_instanced', count: wedgeCount };
  jointMesh.userData = {
    type: 'scorpion_joint_instanced',
    count: wedgeCount,
    seats: events.slice(0, wedgeCount).map((event) => event.seat_id)
  };

  waterworksGroup.add(casingMesh, boreMesh, jointMesh);
}
