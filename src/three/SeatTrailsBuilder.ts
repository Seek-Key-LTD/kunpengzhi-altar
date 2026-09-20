import * as THREE from 'three';
import { seatTrailPoints } from '../data/seatTrail';
import { DRAGON_SEAT_COUNT } from '../data/dualDragon';

/**
 * 席位光迹：49 条对数螺线，共用一份材质。
 * 独立 builder，从 AltarScene 拆出。
 */
export function buildSeatTrails(scene: THREE.Scene): {
  group: THREE.Group;
  lines: THREE.Line[];
} {
  const group = new THREE.Group();
  group.name = 'dual-dragon-seat-trails';
  const mat = new THREE.LineBasicMaterial({
    color: 0xe9d5ff,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const lines: THREE.Line[] = [];
  for (let seatId = 1; seatId <= DRAGON_SEAT_COUNT; seatId++) {
    const pts = seatTrailPoints(seatId).map(p => new THREE.Vector3(p.x, p.y, p.z));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    line.visible = false;
    line.userData = { type: 'seat_trail', seatId };
    lines.push(line);
    group.add(line);
  }
  scene.add(group);
  return { group, lines };
}
