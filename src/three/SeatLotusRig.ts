import * as THREE from 'three';

/**
 * 席位繁花（seat lotus）视觉总管：49 席莲花的显隐、缩放、呼吸动画。
 * 几何仍由 AltarScene 构造后 register；这里只管每帧显隐/缩放/呼吸。
 */
export class SeatLotusRig {
  private flowers = new Map<number, THREE.Group>();

  register(id: number, group: THREE.Group): void {
    this.flowers.set(id, group);
  }

  /** 仪式档：已点席显形，未点席隐藏；活动席放大。 */
  setRitual(lit: number, isDark: boolean, activeId: number | null): void {
    this.flowers.forEach((flower, id) => {
      flower.visible = id <= lit && !isDark;
      flower.scale.setScalar(id === activeId ? 1.12 : 0.7);
    });
  }

  /** 演示档：按 lit 显形。 */
  setDemo(lit: number): void {
    this.flowers.forEach((flower, id) => { flower.visible = id <= lit; });
  }

  /** 直入版：全显。 */
  presentAll(): void {
    this.flowers.forEach((flower) => { flower.visible = true; });
  }

  /** 焦点席：活动席 1.1，其余 0.65。 */
  setFocus(activeId: number | null): void {
    this.flowers.forEach((group, id) => {
      const isActive = id === activeId;
      group.scale.setScalar(isActive ? 1.1 : 0.65);
    });
  }

  /** 每帧：呼吸缩放 + 绕 y 轴缓旋（活动席不压 scale，保留其静态尺寸）。 */
  update(elapsed: number, activeId: number | null): void {
    this.flowers.forEach((flower, id) => {
      const pulse = 1.0 + Math.sin(elapsed * 2.5 + id) * 0.04;
      flower.rotation.y = elapsed * 0.2 + id;
      if (id !== activeId) {
        flower.scale.set(0.65 * pulse, 0.65 * pulse, 0.65 * pulse);
      }
    });
  }

  clear(): void {
    this.flowers.clear();
  }
}
