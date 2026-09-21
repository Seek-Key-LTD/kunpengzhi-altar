import * as THREE from 'three';
import { BRICK, CELL } from '../data/altarGeometry';
import { RABBIT_HOLE_SEATS } from '../data/altarGeometry';
import { brickLevels } from '../data/brickLevels';
import { isSeatId } from '../types/altar';

/**
 * 阳坛七层中空方锥：49 根砖柱，每席一根，从地面砌到该席台面高程。
 * 只做一件事：砌砖柱。不建席位、不建水道、不建莲花。
 */
export function buildBrickColumns(
  events: readonly any[],
  outerShellGroup: THREE.Group
): void {
  const brickMat = new THREE.MeshStandardMaterial({
    color: 0x263247,
    roughness: 0.54,
    metalness: 0.16
  });

  const bricks: Array<{ x: number; y: number; z: number }> = [];
  const rabbitHoleSeats = new Set<number>(RABBIT_HOLE_SEATS);
  const seatEvents = events.filter((ev) => isSeatId(ev.seat_id));

  seatEvents.forEach((ev) => {
    const levels = brickLevels(ev.elevation, BRICK);
    for (let i = 0; i < levels; i++) {
      if (rabbitHoleSeats.has(ev.seat_id) && i === 1) continue;
      bricks.push({
        x: ev.grid_x * CELL,
        y: (i + 0.5) * BRICK,
        z: ev.grid_z * CELL
      });
    }
  });

  const brickGeo = new THREE.BoxGeometry(BRICK, BRICK, BRICK);
  const blocks = new THREE.InstancedMesh(brickGeo, brickMat, bricks.length);
  blocks.castShadow = true;
  blocks.receiveShadow = true;

  const mat4 = new THREE.Matrix4();
  bricks.forEach((b, i) => {
    mat4.makeTranslation(b.x, b.y, b.z);
    blocks.setMatrixAt(i, mat4);
  });
  blocks.instanceMatrix.needsUpdate = true;
  outerShellGroup.add(blocks);
}
