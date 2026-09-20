import * as THREE from 'three';
import { CELL, scorpionWaterElevation, SCORPION_CASING_RADIUS, SCORPION_BORE_RADIUS } from '../data/altarGeometry';
import { validWedge } from '../data/scorpionTopology';

/**
 * 蝎子楔水道：49 席水线 + 拓扑校验 + 套管/水芯/蝎节。
 * 独立 builder，从 AltarScene 拆出。
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

  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];
    const event = events[index];
    const next = events[index + 1];
    if (!validWedge({grid_x: event.grid_x, grid_z: event.grid_z, y: from.y}, {grid_x: next.grid_x, grid_z: next.grid_z, y: to.y})) {
      throw new Error(`蝎子楔拓扑错误：${event.seat_id}→${next.seat_id} 必须相邻且降势`);
    }

    const centerline = new THREE.LineCurve3(from, to);
    const casing = new THREE.Mesh(
      new THREE.TubeGeometry(centerline, 12, SCORPION_CASING_RADIUS, 12, false),
      casingMat
    );
    casing.userData = {
      type: 'scorpion_wedge',
      fromSeat: event.seat_id,
      toSeat: next.seat_id,
      sealed: true,
      exposedOnYangCube: false
    };
    waterworksGroup.add(casing);

    const waterCore = new THREE.Mesh(
      new THREE.TubeGeometry(centerline, 12, SCORPION_BORE_RADIUS, 10, false),
      waterMat
    );
    waterCore.userData = {
      type: 'scorpion_water_core',
      fromSeat: event.seat_id,
      toSeat: next.seat_id,
      sealed: true,
      exposedOnYangCube: false
    };
    waterworksGroup.add(waterCore);

    const joint = new THREE.Mesh(
      new THREE.SphereGeometry(SCORPION_CASING_RADIUS * 1.08, 12, 10),
      casingMat
    );
    joint.position.copy(from);
    joint.userData = { type: 'scorpion_joint', seatId: event.seat_id, exposedOnYangCube: false };
    waterworksGroup.add(joint);
  }
}
