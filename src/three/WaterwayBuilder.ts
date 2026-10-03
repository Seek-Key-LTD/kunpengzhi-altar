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
    // 不设 linewidth：WebGL 下恒为 1px，改它只会误导读者
    transparent: true,
    opacity: 0.85,
  });
  const waterLine = new THREE.Line(lineGeo, lineMat);
  waterLine.geometry.setDrawRange(0, 0);
  waterworksGroup.add(waterLine);

  // 按席位上限分配：DualDragonRig.animateParticles 只写/画前 min(lit, 49) 个槽，
  // 原 280 槽有 ≥231 个永久闲置；留 8% 余量防后续实现越界。
  const particleCount = Math.ceil(DRAGON_SEAT_COUNT * 1.08);
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
  // 同水路：只消费 DRAGON_SEAT_COUNT 个槽（原 96 槽闲置 47 个），留 8% 余量防越界。
  const soundParticlePositions = new Float32Array(Math.ceil(DRAGON_SEAT_COUNT * 1.08) * 3);
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
