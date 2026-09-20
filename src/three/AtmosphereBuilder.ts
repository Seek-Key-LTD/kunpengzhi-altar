import * as THREE from 'three';

/**
 * 星空氛围：1500 颗白色粒子散布在 300×150×300 的空间里。
 * 独立 builder，从 AltarScene 拆出。
 */
export function buildSurroundingAtmosphere(scene: THREE.Scene): THREE.Points {
  const starCount = 1500;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 300;
    starPos[i * 3 + 1] = Math.random() * 150;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 300;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ size: 0.6, color: 0xffffff, transparent: true, opacity: 0.7 });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  return stars;
}
