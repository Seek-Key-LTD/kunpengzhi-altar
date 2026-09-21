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
  seatEvents.forEach((ev) => {
    const seatPos = getSeatWorldPos(ev);
    const seatGroup = new THREE.Group();
    seatGroup.position.copy(seatPos);

    // 质数席：脚下刻一圈青金环
    if (ev.is_prime) {
      const primeRing = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.05, 16),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8
        })
      );
      primeRing.rotation.x = -Math.PI / 2;
      primeRing.position.y = 0.06;
      seatGroup.add(primeRing);
    }

    // 青铜莲花托座
    const padMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.85, 0.14, 8),
      new THREE.MeshStandardMaterial({
        color: ev.seat_status === 'reserved' ? 0xd97706 : (ev.is_prime ? 0x0284c7 : 0x1e293b),
        metalness: 0.75,
        roughness: 0.25,
        emissive: ev.seat_status === 'reserved' ? 0x78350f : (ev.is_prime ? 0x0369a1 : 0x0f172a),
        emissiveIntensity: 0.4
      })
    );
    padMesh.position.y = 0.18;
    padMesh.receiveShadow = true;
    padMesh.userData = { type: 'seat_pad', seatId: ev.seat_id };
    seatGroup.add(padMesh);
    seatPads.set(ev.seat_id, padMesh);

    // 莲花
    const flowerGroup = new THREE.Group();
    const petalCount = 8;
    const flowerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(ev.flower_color),
      emissive: new THREE.Color(ev.flower_color),
      emissiveIntensity: ev.is_prime ? 0.9 : 0.6,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });

    for (let p = 0; p < petalCount; p++) {
      const angle = (p / petalCount) * Math.PI * 2;
      const petalGeo = new THREE.ConeGeometry(0.28, 0.75, 5);
      petalGeo.rotateX(Math.PI / 3);
      const petal = new THREE.Mesh(petalGeo, flowerMat);
      petal.position.set(Math.sin(angle) * 0.32, 0.22, Math.cos(angle) * 0.32);
      petal.rotation.y = angle;
      flowerGroup.add(petal);
    }

    const coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    coreMesh.position.y = 0.25;
    flowerGroup.add(coreMesh);

    flowerGroup.position.y = 0.22;
    flowerGroup.scale.set(0.65, 0.65, 0.65);
    seatGroup.add(flowerGroup);
    lotus.register(ev.seat_id, flowerGroup);

    outerShellGroup.add(seatGroup);
  });
}
