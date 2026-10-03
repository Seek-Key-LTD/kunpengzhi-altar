/**
 * WaterwayBuilder —— 水龙水路 + 音龙音路几何
 *
 * 职责：只负责搭建水龙/音龙的曲线和粒子。
 * 不做：仪式逻辑、动画、显隐——那些归 AltarScene。
 */

import * as THREE from 'three';
import { soundDragonNode, DRAGON_SEAT_COUNT } from '../data/dualDragon';

export interface WaterwayHandles {
  readonly waterLine: THREE.Line;
  readonly waterParticles: THREE.Points;
  readonly soundLine: THREE.Line;
  readonly soundParticles: THREE.Points;
}

/**
 * 搭建水龙水路（沿阴蝎子楔管芯）。
 * @param waterPath 水龙路径点（来自 DualDragonRig.waterPath）
 * @param waterworksGroup 水景区 group
 */
export function buildWaterWaterway(
  waterPath: readonly THREE.Vector3[],
  waterworksGroup: THREE.Group
): { waterLine: THREE.Line; waterParticles: THREE.Points } {
  const curve = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < waterPath.length - 1; i++) {
    curve.add(new THREE.LineCurve3(waterPath[i], waterPath[i + 1]));
  }
  const points = curve.getSpacedPoints(360);

  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    linewidth: 3,
    transparent: true,
    opacity: 0.85,
  });
  const waterLine = new THREE.Line(lineGeo, lineMat);
  waterLine.geometry.setDrawRange(0, 0);
  waterworksGroup.add(waterLine);

  // 槽位 = 49 席：DualDragonRig.animateParticles 每帧只定位/绘制
  // min(lit, pathLen, count) ≤ 49 枚水珠（每已触发席一枚），多出来的槽位
  // 永远进不了 drawRange，纯属死分配。
  const particleCount = DRAGON_SEAT_COUNT;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const p = points[Math.floor(Math.random() * points.length)];
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y + 0.08;
    positions[i * 3 + 2] = p.z;
    colors[i * 3] = 0.35;
    colors[i * 3 + 1] = 0.95;
    colors[i * 3 + 2] = 1.0;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.52,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });
  const waterParticles = new THREE.Points(particleGeo, particleMat);
  waterworksGroup.add(waterParticles);

  return { waterLine, waterParticles };
}

/**
 * 搭建音龙音路（绕过 #00，按半音向内收）。
 * @param scene 目标场景
 */
export function buildSoundWaterway(
  scene: THREE.Scene
): { soundPoints: THREE.Vector3[]; soundLine: THREE.Line; soundParticles: THREE.Points } {
  const soundPoints: THREE.Vector3[] = [];
  for (let i = 0; i < DRAGON_SEAT_COUNT; i++) {
    const node = soundDragonNode(i + 1);
    soundPoints.push(new THREE.Vector3(node.x, node.y, node.z));
  }

  const soundGeo = new THREE.BufferGeometry().setFromPoints(soundPoints);
  const soundMat = new THREE.LineBasicMaterial({
    color: 0xc4b5fd,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
  });
  const soundLine = new THREE.Line(soundGeo, soundMat);
  soundLine.geometry.setDrawRange(0, 0);
  soundLine.visible = false;
  scene.add(soundLine);

  const soundParticleGeo = new THREE.BufferGeometry();
  // 同上：音龙粒子每帧也只画 min(lit, 49) 枚，槽位按 49 席收敛。
  const soundParticlePositions = new Float32Array(DRAGON_SEAT_COUNT * 3);
  soundParticleGeo.setAttribute('position', new THREE.BufferAttribute(soundParticlePositions, 3));
  const soundParticleMat = new THREE.PointsMaterial({
    color: 0xe9d5ff,
    size: 0.32,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const soundParticles = new THREE.Points(soundParticleGeo, soundParticleMat);
  soundParticles.visible = false;
  scene.add(soundParticles);

  return { soundPoints, soundLine, soundParticles };
}
