import * as THREE from 'three';
import { BRICK, CELL } from '../data/altarGeometry';
import { RABBIT_HOLE_SEATS } from '../data/altarGeometry';

/**
 * 兔子洞：横轴隧道 40→19→6→1→2→11→28（z=0）。
 * BackSide 只在镜头缩小进入洞内时显影；外部仍是严丝合缝的方坛。
 * 独立 builder，从 AltarScene 拆出。
 */
export function buildRabbitHole(
  events: readonly any[],
  hollowInteriorGroup: THREE.Group
): void {
  const bySeat = new Map(events.map((event) => [event.seat_id, event]));
  const axis = RABBIT_HOLE_SEATS.map((seatId) => bySeat.get(seatId));
  if (axis.some((event) => !event) || axis.some((event) => event!.grid_z !== 0)) {
    throw new Error('Rabbit Hole 必须是横轴 40→19→6→1→2→11→28（z=0）');
  }

  const group = new THREE.Group();
  group.name = 'rabbit-hole-40-19-6-1-2-11-28';
  const tunnelY = BRICK * 1.5;
  const tunnelLength = CELL * 7 - 0.12;

  const lining = new THREE.Mesh(
    new THREE.BoxGeometry(tunnelLength, BRICK - 0.16, BRICK - 0.16),
    new THREE.MeshStandardMaterial({
      color: 0x071827,
      emissive: 0x0b3150,
      emissiveIntensity: 0.48,
      roughness: 0.46,
      metalness: 0.38,
      side: THREE.BackSide
    })
  );
  lining.position.set(0, tunnelY, 0);
  lining.userData = { type: 'rabbit_hole_lining', axis: [...RABBIT_HOLE_SEATS] };
  group.add(lining);

  const portalMat = new THREE.MeshStandardMaterial({
    color: 0xd6a54a,
    emissive: 0x7c4b0e,
    emissiveIntensity: 0.7,
    roughness: 0.22,
    metalness: 0.84
  });
  [-1, 1].forEach((side) => {
    const portal = new THREE.Mesh(new THREE.TorusGeometry(BRICK * 0.37, 0.075, 10, 36), portalMat);
    portal.rotation.y = Math.PI / 2;
    portal.position.set(side * (CELL * 3 + 0.12), tunnelY, 0);
    portal.userData = { type: side < 0 ? 'rabbit_hole_entrance_40' : 'rabbit_hole_exit_28' };
    group.add(portal);
  });

  hollowInteriorGroup.add(group);
}
