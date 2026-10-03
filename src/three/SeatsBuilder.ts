import * as THREE from 'three';

/**
 * 49 席：托座 / 质数环 / 莲花。
 * 只做一件事：建席位。不建砖柱、不建水道、不建素数线。
 */
export function buildSeats(
  seatEvents: readonly any[],
  getSeatWorldPos: (ev: any) => THREE.Vector3,
  seatPads: Map<number, THREE.Mesh>,
  lotus: { register: (id: number, g: THREE.Group) => void },
  outerShellGroup: THREE.Group
): void {
  // 几何全部循环外共享：49 席 × (托座+8瓣+花芯) 原本要 new 500+ 份全同几何，GPU 缓冲一份就够。
  const padGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.14, 8);
  const petalGeo = new THREE.ConeGeometry(0.28, 0.75, 5);
  petalGeo.rotateX(Math.PI / 3); // 花瓣倾角烘进共享几何一次，免去每瓣重复烘焙
  const coreGeo = new THREE.SphereGeometry(0.18, 12, 12);
  const ringGeo = new THREE.RingGeometry(0.85, 1.05, 16);

  // 材质按参数组合缓存（组合数是个位数），不再逐席 new：
  // 托座色只随 (reserved, is_prime) 组合变化；花色只随 (flower_color, is_prime) 组合变化。
  const padMats = new Map<string, THREE.MeshStandardMaterial>();
  const getPadMat = (reserved: boolean, prime: boolean): THREE.MeshStandardMaterial => {
    const key = `${reserved ? 1 : 0}-${prime ? 1 : 0}`;
    let mat = padMats.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: reserved ? 0xd97706 : (prime ? 0x0284c7 : 0x1e293b),
        metalness: 0.75,
        roughness: 0.25,
        emissive: reserved ? 0x78350f : (prime ? 0x0369a1 : 0x0f172a),
        emissiveIntensity: 0.4
      });
      padMats.set(key, mat);
    }
    return mat;
  };

  const flowerMats = new Map<string, THREE.MeshStandardMaterial>();
  const getFlowerMat = (color: string, prime: boolean): THREE.MeshStandardMaterial => {
    const key = `${color}-${prime ? 1 : 0}`;
    let mat = flowerMats.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color),
        emissiveIntensity: prime ? 0.9 : 0.6,
        roughness: 0.2,
        metalness: 0.3,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      });
      flowerMats.set(key, mat);
    }
    return mat;
  };

  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const primeRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });

  // 实例变换复用同一组临时对象：49 席 × 8 瓣不再各自分配 Matrix/Quaternion
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _yAxis = new THREE.Vector3(0, 1, 0);

  seatEvents.forEach((ev) => {
    const seatPos = getSeatWorldPos(ev);
    const seatGroup = new THREE.Group();
    seatGroup.position.copy(seatPos);

    // 质数席：脚下刻一圈青金环
    if (ev.is_prime) {
      const primeRing = new THREE.Mesh(ringGeo, primeRingMat);
      primeRing.rotation.x = -Math.PI / 2;
      primeRing.position.y = 0.06;
      seatGroup.add(primeRing);
    }

    // 青铜莲花托座：保持逐席独立 Mesh——EventHandlers 按 userData.seatId 逐席拾取，
    // 单实例化会丢掉逐席 raycast 语义；这里只共享几何与组合材质。
    const padMesh = new THREE.Mesh(padGeo, getPadMat(ev.seat_status === 'reserved', ev.is_prime));
    padMesh.position.y = 0.18;
    padMesh.receiveShadow = true;
    padMesh.userData = { type: 'seat_pad', seatId: ev.seat_id };
    seatGroup.add(padMesh);
    seatPads.set(ev.seat_id, padMesh);

    // 莲花
    const flowerGroup = new THREE.Group();
    const petalCount = 8;
    const flowerMat = getFlowerMat(ev.flower_color, ev.is_prime);

    // 每席 8 瓣并为 1 个 InstancedMesh（49 席共 392 实例，绘制 392→49）：
    // SeatLotusRig 按席驱动 Group 缩放/自转，花瓣必须留在席内 Group 里；
    // 花色走组合材质而非 instanceColor——instanceColor 只乘 diffuse，承载不了逐席自发光色。
    const petals = new THREE.InstancedMesh(petalGeo, flowerMat, petalCount);
    petals.userData = { type: 'seat_petals', seatId: ev.seat_id };
    for (let p = 0; p < petalCount; p++) {
      const angle = (p / petalCount) * Math.PI * 2;
      _q.setFromAxisAngle(_yAxis, angle);
      _p.set(Math.sin(angle) * 0.32, 0.22, Math.cos(angle) * 0.32);
      _m.compose(_p, _q, _s);
      petals.setMatrixAt(p, _m);
    }
    petals.instanceMatrix.needsUpdate = true;
    flowerGroup.add(petals);

    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.y = 0.25;
    flowerGroup.add(coreMesh);

    flowerGroup.position.y = 0.22;
    flowerGroup.scale.set(0.65, 0.65, 0.65);
    seatGroup.add(flowerGroup);
    lotus.register(ev.seat_id, flowerGroup);

    outerShellGroup.add(seatGroup);
  });
}
