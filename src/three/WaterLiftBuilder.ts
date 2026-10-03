import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  // 桶壁是开口薄壳必须双面渲染：单独共享一份，替代原先每桶 new 的拷贝
  const bucketWallMat = new THREE.MeshStandardMaterial({
    color: 0x5c3216,
    emissive: 0x251006,
    emissiveIntensity: 0.34,
    roughness: 0.29,
    metalness: 0.84,
    side: THREE.DoubleSide
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

  // 台座保持独立 Mesh：它有专属的 cast/receiveShadow 标记，合并会让其余静态件凭空多出阴影。
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(WATER_LIFT_SEP * 2 + 1.4, 0.28, 1.2),
    bronzeMat
  );
  base.position.set(0, WATER_LIFT_BASE_Y - 1.15, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // —— 静态青铜件（导柱×2 / 滑轮 / 轮毂 / 神簧×8）合并为 1 个 Mesh ——
  // MechanicsRig 只逐帧驱动双桶/水位/神索，从不引用这些静态件；13 次 draw call 并成 1 次。
  const railHeight = WATER_LIFT_PULLEY_Y - (WATER_LIFT_BASE_Y - 1.0);
  const staticGeos: THREE.BufferGeometry[] = [];
  // merge 前把局部几何烘到世界位（绕 x 旋转 + 平移覆盖全部静态件的姿态）
  const bake = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rotX = 0): void => {
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(rotX).setPosition(x, y, z));
    staticGeos.push(geo);
  };

  [-1, 1].forEach((sx) => {
    bake(new THREE.CylinderGeometry(0.09, 0.09, railHeight, 8), sx * WATER_LIFT_SEP, WATER_LIFT_BASE_Y - 1.0 + railHeight / 2, 0);
  });
  bake(new THREE.TorusGeometry(WATER_LIFT_SEP, 0.16, 12, 40), 0, WATER_LIFT_PULLEY_Y, 0);
  bake(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), 0, WATER_LIFT_PULLEY_Y, 0, Math.PI / 2);
  [-1, 1].forEach((sx) => {
    for (let k = 0; k < 4; k++) {
      bake(new THREE.TorusGeometry(0.28, 0.045, 6, 18), sx * WATER_LIFT_SEP, WATER_LIFT_BASE_Y - 1.05 + k * 0.13, 0, Math.PI / 2);
    }
  });

  const staticBronze = new THREE.Mesh(mergeGeometries(staticGeos), bronzeMat);
  staticBronze.name = 'rfc007-static-bronze';
  group.add(staticBronze);

  // 双桶部件几何两桶全同 → 提到 makeBucket 外共享（水位动画是 mesh.scale，不碰几何）
  const bucketWallGeo = new THREE.CylinderGeometry(0.72, 0.58, 1.0, 14, 1, true);
  const bucketBottomGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.08, 14);
  const waterGeo = new THREE.CylinderGeometry(0.55, 0.5, 1.0, 14, 1, false);
  waterGeo.translate(0, 0.5, 0);

  const makeBucket = (side: -1 | 1): { bucket: THREE.Group; water: THREE.Mesh } => {
    const bucket = new THREE.Group();
    bucket.position.set(side * WATER_LIFT_SEP, WATER_LIFT_BASE_Y, 0);

    const wall = new THREE.Mesh(bucketWallGeo, bucketWallMat);
    wall.castShadow = true;
    bucket.add(wall);

    const bottom = new THREE.Mesh(bucketBottomGeo, bronzeMat);
    bottom.position.y = -0.5;
    bucket.add(bottom);

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
