import * as THREE from 'three';
import { PYRAMID_TOP } from '../data/altarGeometry';

/**
 * 无极泉：#00 无极点吸光体 + 光柱 + 光环 + 粒子喷泉。
 * 只做一件事：建无极泉。不建双龙、不建水道。
 */
export function buildWujiFountain(
  scene: THREE.Scene,
  fountainGroup: THREE.Group
): { absorber: THREE.Mesh; fountainParticles: THREE.Points } {
  // #00 无极点 · 吸光体
  const absorber = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.82, 0.18, 48),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.95,
      metalness: 0.1,
      emissive: 0x000000,
      emissiveIntensity: 0
    })
  );
  absorber.position.set(0, PYRAMID_TOP + 0.14, 0);
  absorber.name = 'wuji_absorber_#00';
  absorber.userData = { ritual_anchor: 'wuji', seatId: null, claimable: false, tokenizable: false };
  scene.add(absorber);

  // 光柱
  const beamGeo = new THREE.CylinderGeometry(0.3, 1.2, 20, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, PYRAMID_TOP + 9.75, 0);
  fountainGroup.add(beam);

  // 光环
  const ringGeo = new THREE.TorusGeometry(1.8, 0.08, 16, 64);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.9,
    roughness: 0.1,
    emissive: 0xd97706,
    emissiveIntensity: 0.8
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, PYRAMID_TOP + 4, 0);
  fountainGroup.add(ring);

  // 粒子喷泉
  const fountainPCount = 300;
  const fGeo = new THREE.BufferGeometry();
  const fPos = new Float32Array(fountainPCount * 3);
  for (let i = 0; i < fountainPCount; i++) {
    fPos[i * 3] = (Math.random() - 0.5) * 1.5;
    fPos[i * 3 + 1] = PYRAMID_TOP + 0.5 + Math.random() * 4.0;
    fPos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
  }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const fMat = new THREE.PointsMaterial({
    size: 0.22,
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending
  });
  const fountainParticles = new THREE.Points(fGeo, fMat);
  fountainGroup.add(fountainParticles);

  return { absorber, fountainParticles };
}
