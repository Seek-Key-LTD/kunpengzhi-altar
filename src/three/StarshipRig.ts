import * as THREE from 'three';

/**
 * 悬浮飞碟（starship）视觉总管：只持有节点引用与每帧浮动/旋转。
 * 几何仍由 AltarScene.buildStarships 构造后 register 进来。
 */
export class StarshipRig {
  private ships = new Map<number, THREE.Group>();
  /** 注册时的基准标高：浮动只在此之上做偏移，绝不累积污染基础位置。 */
  private baseYs = new Map<number, number>();
  /** 浮动幅度：与旧实现 60fps 下的累计振幅（0.002×60/2）等价。 */
  private static readonly FLOAT_AMPLITUDE = 0.06;

  register(id: number, group: THREE.Group): void {
    this.ships.set(id, group);
    this.baseYs.set(id, group.position.y);
  }

  hideAll(): void {
    this.ships.forEach((ship) => { ship.visible = false; });
  }

  /** 每帧：上下浮动 + 绕 y 轴缓旋（绝对量写入，帧率无关）。 */
  update(elapsed: number): void {
    this.ships.forEach((ship, id) => {
      const baseY = this.baseYs.get(id) ?? ship.position.y;
      ship.position.y = baseY + Math.sin(elapsed * 2 + id) * StarshipRig.FLOAT_AMPLITUDE;
      ship.rotation.y = elapsed * 0.2 + id;
    });
  }

  clear(): void {
    this.ships.clear();
    this.baseYs.clear();
  }
}
