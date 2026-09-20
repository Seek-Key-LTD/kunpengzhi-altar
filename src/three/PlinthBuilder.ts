import * as THREE from 'three';
import { PLINTH_HALF, PLINTH_THICKNESS, PYRAMID_HALF } from '../data/altarGeometry';

/**
 * 基座：石台 + 坛基线铜线。
 * 独立 builder，从 AltarScene 拆出。
 */
export function buildPlinth(outerShellGroup: THREE.Group): void {
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x0b1220,
    roughness: 0.75,
    metalness: 0.25
  });
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.85,
    roughness: 0.3,
    emissive: 0x78350f,
    emissiveIntensity: 0.35
  });

  const plinthDepth = PLINTH_HALF * 2;
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(PLINTH_HALF * 2, PLINTH_THICKNESS, plinthDepth),
    stoneMat
  );
  plinth.position.y = -PLINTH_THICKNESS / 2;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  outerShellGroup.add(plinth);

  // 坛基线：金字塔脚下的铜线
  const footLine = new THREE.Mesh(
    new THREE.BoxGeometry(PYRAMID_HALF * 2 + 0.8, 0.16, PYRAMID_HALF * 2 + 0.8),
    bronzeMat
  );
  footLine.position.y = 0.04;
  outerShellGroup.add(footLine);
}
