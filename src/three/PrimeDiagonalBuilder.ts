import * as THREE from 'three';
import { isPrimeDiagonal } from '../data/primeDiagonal';

/**
 * Ulam 素数对角线：把素数席两两连成对角线。
 * 只做一件事：连素数线。不建砖柱、不建席位。
 */
export function buildPrimeDiagonalLines(
  seatEvents: readonly any[],
  getSeatWorldPos: (ev: any) => THREE.Vector3,
  primeLinesGroup: THREE.Group
): void {
  const primes = seatEvents.filter((e) => e.is_prime);
  const diagLineMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    linewidth: 2,
    transparent: true,
    opacity: 0.55
  });

  for (let i = 0; i < primes.length; i++) {
    for (let j = i + 1; j < primes.length; j++) {
      const p1 = primes[i];
      const p2 = primes[j];
      if (isPrimeDiagonal(p1, p2)) {
        const v1 = getSeatWorldPos(p1);
        const v2 = getSeatWorldPos(p2);
        const geo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
        const line = new THREE.Line(geo, diagLineMat);
        primeLinesGroup.add(line);
      }
    }
  }
}
