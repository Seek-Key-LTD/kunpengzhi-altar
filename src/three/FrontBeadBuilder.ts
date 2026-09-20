import * as THREE from 'three';

/**
 * 前锋珠：发光球体 + 跟随点光源。
 * 独立 builder，从 AltarScene 拆出。
 */
export function buildFrontBead(
  color: number,
  radius: number,
  emissive: number,
  lightIntensity: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'front-bead';
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 2.6,
    roughness: 0.3,
    metalness: 0.1
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 18), mat);
  group.add(mesh);
  const light = new THREE.PointLight(color, lightIntensity, 14, 1.7);
  group.add(light);
  return group;
}
