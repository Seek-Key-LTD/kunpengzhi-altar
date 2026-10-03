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
  // 逐线独立材质：AltarScene 渲染循环对每条线写 material.opacity 做相位脉冲
  // （sin(elapsed*3 + idx)），共享单材质时 N 次写入只剩最后一次生效、脉冲意图失效。
  // 线本身仍是逐条 draw call，材质开销可忽略；WebGL 下 linewidth 恒 1px，删除死参数。
  const baseMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
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
        const line = new THREE.Line(geo, baseMat.clone());
        primeLinesGroup.add(line);
      }
    }
  }
}
