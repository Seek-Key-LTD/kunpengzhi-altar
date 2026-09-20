import * as THREE from 'three';
import { CELL, scorpionWaterElevation } from '../data/altarGeometry';
import { RIVER_AXIS_SEATS, RIVER_GRAVITY_SEATS } from '../data/altarGeometry';

/**
 * 河轴：升降段（46→23→8→1）+ 重力段（1→4→15→34）。
 * 独立 builder，从 AltarScene 拆出。
 */
export function buildRiverAxis(
  events: readonly any[],
  waterworksGroup: THREE.Group
): void {
  const bySeat = new Map(events.map((event) => [event.seat_id, event]));
  const axis = RIVER_AXIS_SEATS.map((seatId) => bySeat.get(seatId)).filter(Boolean);
  if (axis.length !== RIVER_AXIS_SEATS.length) {
    throw new Error('Ulam 河轴缺席：46→23→8→1→4→15→34 必须完整存在');
  }

  const liftPoints = axis.slice(0, 4).map((event: any) => new THREE.Vector3(
    event.grid_x * CELL,
    scorpionWaterElevation(event.seat_id),
    event.grid_z * CELL
  ));
  const liftCurve = new THREE.CatmullRomCurve3(liftPoints, false, 'centripetal');
  const liftPipe = new THREE.Mesh(
    new THREE.TubeGeometry(liftCurve, 48, 0.16, 10, false),
    new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.34, metalness: 0.82 })
  );
  liftPipe.userData = { waterway: '46-23-8-1', mode: 'counterweight-lift' };
  waterworksGroup.add(liftPipe);

  const gravityPoints = RIVER_GRAVITY_SEATS.map((seatId) => {
    const event = bySeat.get(seatId)!;
    return new THREE.Vector3(event.grid_x * CELL, scorpionWaterElevation(event.seat_id), event.grid_z * CELL);
  });
  const gravityCurve = new THREE.CatmullRomCurve3(gravityPoints, false, 'centripetal');
  const bed = new THREE.Mesh(
    new THREE.TubeGeometry(gravityCurve, 36, CELL * 0.18, 10, false),
    new THREE.MeshStandardMaterial({ color: 0x0f3d56, roughness: 0.12, metalness: 0.72 })
  );
  bed.userData = { waterway: '1-4-15-34', mode: 'gravity' };
  waterworksGroup.add(bed);
}
