import * as THREE from 'three';

// 宽松类型：只要有 seat_id 和 seat_status 就行

interface StarshipRig {
  register(seatId: number, group: THREE.Group): void;
}

/**
 * 悬浮星舰（飞碟）：reserved 席位 + #49 席位各一枚。
 * 独立 builder，从 AltarScene 拆出。
 */
export function buildStarships(
  events: readonly any[],
  getSeatWorldPos: (ev: any) => { x: number; y: number; z: number },
  starship: StarshipRig,
  outerShellGroup: THREE.Group
): void {
  events.forEach((ev) => {
    if (ev.seat_status === 'reserved' || ev.seat_id === 49) {
      const shipGroup = new THREE.Group();
      const basePos = getSeatWorldPos(ev);
      shipGroup.position.set(basePos.x, basePos.y + 4.5, basePos.z);

      const hullGeo = new THREE.ConeGeometry(0.4, 2.2, 4);
      hullGeo.rotateX(Math.PI / 2);
      const hullMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.3
      });
      const hull = new THREE.Mesh(hullGeo, hullMat);
      shipGroup.add(hull);

      const wingGeo = new THREE.BoxGeometry(2.0, 0.05, 0.8);
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.8,
        roughness: 0.3
      });
      const wings = new THREE.Mesh(wingGeo, wingMat);
      wings.position.set(0, 0, 0.2);
      shipGroup.add(wings);

      shipGroup.scale.set(0.65, 0.65, 0.65);
      starship.register(ev.seat_id, shipGroup);
      outerShellGroup.add(shipGroup);
    }
  });
}
