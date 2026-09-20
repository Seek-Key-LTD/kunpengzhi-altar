import * as THREE from 'three';

/**
 * 悬浮飞碟（starship）视觉总管：只持有节点引用与每帧浮动/旋转。
 * 几何仍由 AltarScene.buildStarships 构造后 register 进来。
 */
export class StarshipRig {
  private ships = new Map<number, THREE.Group>();

  register(id: number, group: THREE.Group): void {
    this.ships.set(id, group);
  }

  hideAll(): void {
    this.ships.forEach((ship) => { ship.visible = false; });
  }

  /** 每帧：上下浮动 + 绕 y 轴缓旋。 */
  update(elapsed: number): void {
    this.ships.forEach((ship, id) => {
      ship.position.y += Math.sin(elapsed * 2 + id) * 0.002;
      ship.rotation.y = elapsed * 0.2 + id;
    });
  }

  clear(): void {
    this.ships.clear();
  }
}
