import * as THREE from 'three';
import { SEAT_ID_MAX } from '../types/altar';

/**
 * 双龙视觉总管：水龙（外旋下行）+ 音龙（内收上行）的线、粒子、前锋珠。
 * 只持有节点引用与每帧显隐/绘制区间/前锋珠定位；不建几何。
 *
 * 两种落地语义：
 *  · 仪式档 setRitual(lit, visible)：显隐由幕次决定，绘制区间按 lit/SEAT_ID_MAX。
 *  · 演示档 setDemo(lit)：线全段绘制（full），前锋珠沿路径随 lit 追席。
 */
export class DualDragonRig {
  private waterPathPoints: THREE.Vector3[] = [];
  private soundPath: THREE.Vector3[] = [];
  private waterParticles: THREE.Points | null = null;
  private waterLine: THREE.Line | null = null;
  private soundLine: THREE.Line | null = null;
  private soundParticles: THREE.Points | null = null;
  private waterBead: THREE.Group | null = null;
  private soundBead: THREE.Group | null = null;

  /**
   * 线体 drawRange 缓存：几何顶点数只读一次（拓扑不变），
   * lit/可见性/全段标记均未变化时跳过 setDrawRange——原实现每帧重读 attribute 并重算。
   */
  private waterDraw = { count: -1, lit: -1, visible: false, full: false };
  private soundDraw = { count: -1, lit: -1, visible: false, full: false };

  setWaterPath(path: THREE.Vector3[]): void {
    this.waterPathPoints = path;
  }

  get waterPath(): readonly THREE.Vector3[] {
    return this.waterPathPoints;
  }

  setSoundPath(path: THREE.Vector3[]): void {
    this.soundPath = path;
  }

  registerParticles(
    waterParticles: THREE.Points,
    waterLine: THREE.Line,
    soundLine: THREE.Line,
    soundParticles: THREE.Points
  ): void {
    this.waterParticles = waterParticles;
    this.waterLine = waterLine;
    this.soundLine = soundLine;
    this.soundParticles = soundParticles;
    // 防换几何后缓存失效：重置 drawRange 缓存
    this.waterDraw = { count: -1, lit: -1, visible: false, full: false };
    this.soundDraw = { count: -1, lit: -1, visible: false, full: false };
  }

  setFrontBeads(water: THREE.Group | null, sound: THREE.Group | null): void {
    // 退役旧前锋珠：登记方（DemoController.start）每次启动都会新建一对，
    // 若不回收，start/stop 循环会在场景里堆积孤儿 Group（几何+材质+点光源）。
    // 口径对齐 SceneDisposer：先摘出场景树，再按 Mesh 逐个 dispose 几何/材质。
    this.retireBead(this.waterBead, water);
    this.retireBead(this.soundBead, sound);
    this.waterBead = water;
    this.soundBead = sound;
  }

  /** 摘除并释放一颗旧前锋珠；与新珠同一对象（或已不在场景树）时跳过。 */
  private retireBead(old: THREE.Group | null, next: THREE.Group | null): void {
    if (!old || old === next) return;
    old.removeFromParent();
    old.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material?.dispose();
      }
    });
  }

  private applyVisibility(lit: number, visible: boolean, fullLine: boolean): void {
    if (this.waterParticles) this.waterParticles.visible = visible;
    if (this.waterLine) {
      this.waterLine.visible = visible;
      const c = this.waterDraw;
      if (c.count < 0) c.count = this.waterLine.geometry.attributes.position.count; // 顶点数拓扑不变，只读一次
      if (c.lit !== lit || c.visible !== visible || c.full !== fullLine) {
        c.lit = lit; c.visible = visible; c.full = fullLine;
        this.waterLine.geometry.setDrawRange(0, fullLine ? c.count : Math.round(c.count * (lit / SEAT_ID_MAX)));
      }
    }
    if (this.soundLine) {
      this.soundLine.visible = visible;
      const c = this.soundDraw;
      if (c.count < 0) c.count = this.soundLine.geometry.attributes.position.count; // 顶点数拓扑不变，只读一次
      if (c.lit !== lit || c.visible !== visible || c.full !== fullLine) {
        c.lit = lit; c.visible = visible; c.full = fullLine;
        this.soundLine.geometry.setDrawRange(0, fullLine ? c.count : lit);
      }
    }
    if (this.soundParticles) this.soundParticles.visible = visible;
  }

  private moveBeads(lit: number): void {
    const waterNode =
      lit > 0 && this.waterPath.length > 0
        ? this.waterPath[Math.min(lit, this.waterPath.length) - 1]
        : null;
    const soundNode =
      lit > 0 && this.soundPath.length > 0
        ? this.soundPath[Math.min(lit, this.soundPath.length) - 1]
        : null;
    if (this.waterBead) {
      this.waterBead.visible = waterNode !== null;
      if (waterNode) this.waterBead.position.copy(waterNode);
    }
    if (this.soundBead) {
      this.soundBead.visible = soundNode !== null;
      if (soundNode) this.soundBead.position.copy(soundNode);
    }
  }

  /** 仪式档：幕次决定可见性，绘制区间按已点席比例。 */
  setRitual(lit: number, visible: boolean): void {
    this.applyVisibility(lit, visible, false);
  }

  /** 演示档：线全段绘制，前锋珠沿路径追席。 */
  setDemo(lit: number): void {
    this.applyVisibility(lit, lit > 0, true);
    this.moveBeads(lit);
  }

  /** 直入版：双龙全亮。 */
  presentAll(): void {
    this.applyVisibility(SEAT_ID_MAX, true, true);
  }

  /** 每帧沿路径逐席 animate 双龙粒子位置（水龙下潜 / 音龙上升）。 */
  animateParticles(elapsed: number, lit: number): void {
    // 幕间隐藏或 lit=0 时整体跳过：省 49 次 setXYZ 与 GPU 上传（visible 由 applyVisibility 按幕次写入）
    if (this.waterParticles && this.waterParticles.visible && lit > 0 && this.waterPathPoints.length > 0) {
      const pAttr = this.waterParticles.geometry.attributes.position as THREE.BufferAttribute;
      const visible = Math.min(lit, this.waterPathPoints.length, pAttr.count);
      for (let i = 0; i < visible; i++) {
        const node = this.waterPathPoints[i];
        const drift = Math.sin(elapsed * 2.4 + i * 0.7) * 0.035;
        pAttr.setXYZ(i, node.x + drift, node.y + 0.08, node.z + drift * 0.6);
      }
      // 只上传本帧实际写过的前 visible*3 个 float（r159+ 部分上传 API），不再整段上传
      pAttr.clearUpdateRanges();
      pAttr.addUpdateRange(0, visible * 3);
      pAttr.needsUpdate = true;
      this.waterParticles.geometry.setDrawRange(0, visible);
    }
    // sound 同理：隐藏 / lit=0 时跳过逐点写入与上传
    if (this.soundParticles && this.soundParticles.visible && lit > 0 && this.soundPath.length > 0) {
      const pAttr = this.soundParticles.geometry.attributes.position as THREE.BufferAttribute;
      const visible = Math.min(lit, this.soundPath.length, pAttr.count);
      for (let i = 0; i < visible; i++) {
        const node = this.soundPath[i];
        const rise = Math.sin(elapsed * 1.8 + i * 0.5) * 0.02;
        pAttr.setXYZ(i, node.x, node.y + rise, node.z);
      }
      // 只上传本帧实际写过的前 visible*3 个 float（r159+ 部分上传 API），不再整段上传
      pAttr.clearUpdateRanges();
      pAttr.addUpdateRange(0, visible * 3);
      pAttr.needsUpdate = true;
      this.soundParticles.geometry.setDrawRange(0, visible);
    }
  }
}
