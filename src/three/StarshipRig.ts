import * as THREE from 'three';

/**
 * 悬浮飞碟（starship）视觉总管：只持有节点引用与每帧浮动/旋转。
 * 几何仍由 AltarScene.buildStarships 构造后 register 进来。
 */
export class StarshipRig {
  private ships = new Map<number, THREE.Group>();
  // register 时快照基准高度：浮动改为绝对定位（baseY + 正弦），原 `position.y +=` 是帧率相关积分
  private baseYs = new Map<number, number>();

  register(id: number, group: THREE.Group): void {
    this.ships.set(id, group);
    this.baseYs.set(id, group.position.y);
  }

  hideAll(): void {
    this.ships.forEach((ship) => { ship.visible = false; });
  }

  /** 每帧：上下浮动 + 绕 y 轴缓旋。 */
  update(elapsed: number): void {
    this.ships.forEach((ship, id) => {
      // 隐藏的飞碟跳过写入：两处均为 elapsed 绝对值，恢复可见的下一帧即自动对齐
      if (!ship.visible) return;
      const baseY = this.baseYs.get(id);
      // 60fps 下原积分观感振幅 ≈ 0.002*60/2 = 0.06，改绝对定位后帧率无关
      if (baseY !== undefined) ship.position.y = baseY + Math.sin(elapsed * 2 + id) * 0.06;
      ship.rotation.y = elapsed * 0.2 + id;
    });
  }

  clear(): void {
    this.ships.clear();
    this.baseYs.clear();
  }
}
