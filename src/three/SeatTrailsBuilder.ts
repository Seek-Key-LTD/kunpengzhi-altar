import * as THREE from 'three';
import { seatTrailPoints } from '../data/seatTrail';
import { DRAGON_SEAT_COUNT } from '../data/dualDragon';

/**
 * 席位光迹：49 条对数螺线，共用一份材质。
 * 独立 builder，从 AltarScene 拆出。
 *
 * 合并进单个 LineSegments（49 draw call → 1）已被接口依赖阻塞：
 * AltarScene / RitualTimelineController / DemoController 均持有 `THREE.Line[]`
 * 并按席序逐条写 `line.visible` 做门控，返回结构一变即破坏三处编译，
 * 故保守保留 49 条 Line；材质共享（全 49 条共用一个 LineBasicMaterial 实例）已就位。
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
