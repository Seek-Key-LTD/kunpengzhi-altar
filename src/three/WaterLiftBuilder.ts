import * as THREE from 'three';
import {
  WATER_LIFT_SEP,
  WATER_LIFT_BASE_Y,
  WATER_LIFT_PULLEY_Y,
  WATER_LIFT_Z
} from "./MechanicsRig";

/**
 * RFC-007 双体水梯建模：台座+立柱+滑轮+双桶+神索+神簧。
 * 独立 builder，从 AltarScene 拆出。
 */
export function buildWaterLift(): {
  group: THREE.Group;
  bucketA: THREE.Group;
  bucketB: THREE.Group;
  waterA: THREE.Mesh;
  waterB: THREE.Mesh;
  ropeA: THREE.Mesh;
  ropeB: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.name = 'rfc007-water-lift';
  group.position.set(0, 0, WATER_LIFT_Z);

  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0x5c3216,
    emissive: 0x251006,
    emissiveIntensity: 0.34,
    roughness: 0.29,
    metalness: 0.84
  });
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a0e,
    emissive: 0x150c05,
    emissiveIntensity: 0.3,
    roughness: 0.55,
    metalness: 0.7
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

  const base = new THREE.Mesh(new THREE.BoxGeometry(WATER_LIFT_SEP * 2 + 1.4, 0.28, 1.2), bronzeMat);
  base.position.set(0, WATER_LIFT_BASE_Y - 1.15, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const railHeight = WATER_LIFT_PULLEY_Y - (WATER_LIFT_BASE_Y - 1.0);
  [-1, 1].forEach((sx) => {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, railHeight, 8), bronzeMat);
    rail.position.set(sx * WATER_LIFT_SEP, WATER_LIFT_BASE_Y - 1.0 + railHeight / 2, 0);
    group.add(rail);
  });

  const pulley = new THREE.Mesh(new THREE.TorusGeometry(WATER_LIFT_SEP, 0.16, 12, 40), bronzeMat);
  pulley.position.set(0, WATER_LIFT_PULLEY_Y, 0);
  group.add(pulley);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), bronzeMat);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, WATER_LIFT_PULLEY_Y, 0);
  group.add(hub);

  const makeBucket = (side: -1 | 1): { bucket: THREE.Group; water: THREE.Mesh } => {
    const bucket = new THREE.Group();
    bucket.position.set(side * WATER_LIFT_SEP, WATER_LIFT_BASE_Y, 0);

    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.58, 1.0, 14, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x5c3216,
        emissive: 0x251006,
        emissiveIntensity: 0.34,
        roughness: 0.29,
        metalness: 0.84,
        side: THREE.DoubleSide
      })
    );
    wall.castShadow = true;
    bucket.add(wall);

    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 14), bronzeMat);
    bottom.position.y = -0.5;
    bucket.add(bottom);

    const waterGeo = new THREE.CylinderGeometry(0.55, 0.5, 1.0, 14, 1, false);
    waterGeo.translate(0, 0.5, 0);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -0.46;
    water.scale.y = 0.5;
    bucket.add(water);

    group.add(bucket);
    return { bucket, water };
  };

  const a = makeBucket(-1);
  const b = makeBucket(1);

  const ropeGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 6);
  const ropeA = new THREE.Mesh(ropeGeo, ropeMat);
  const ropeB = new THREE.Mesh(ropeGeo, ropeMat);
  group.add(ropeA, ropeB);

  [-1, 1].forEach((sx) => {
    for (let k = 0; k < 4; k++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 6, 18), bronzeMat);
      coil.position.set(sx * WATER_LIFT_SEP, WATER_LIFT_BASE_Y - 1.05 + k * 0.13, 0);
      coil.rotation.x = Math.PI / 2;
      group.add(coil);
    }
  });

  return {
    group,
    bucketA: a.bucket,
    bucketB: b.bucket,
    waterA: a.water,
    waterB: b.water,
    ropeA,
    ropeB
  };
}
