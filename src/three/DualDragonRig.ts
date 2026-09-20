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
  }

  setFrontBeads(water: THREE.Group | null, sound: THREE.Group | null): void {
    this.waterBead = water;
    this.soundBead = sound;
  }

  private applyVisibility(lit: number, visible: boolean, fullLine: boolean): void {
    if (this.waterParticles) this.waterParticles.visible = visible;
    if (this.waterLine) {
      const count = this.waterLine.geometry.attributes.position.count;
      this.waterLine.visible = visible;
      this.waterLine.geometry.setDrawRange(0, fullLine ? count : Math.round(count * (lit / SEAT_ID_MAX)));
    }
    if (this.soundLine) {
      const count = this.soundLine.geometry.attributes.position.count;
      this.soundLine.visible = visible;
      this.soundLine.geometry.setDrawRange(0, fullLine ? count : lit);
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
    if (this.waterParticles && this.waterPathPoints.length > 0) {
      const pAttr = this.waterParticles.geometry.attributes.position as THREE.BufferAttribute;
      const visible = Math.min(lit, this.waterPathPoints.length, pAttr.count);
      for (let i = 0; i < visible; i++) {
        const node = this.waterPathPoints[i];
        const drift = Math.sin(elapsed * 2.4 + i * 0.7) * 0.035;
        pAttr.setXYZ(i, node.x + drift, node.y + 0.08, node.z + drift * 0.6);
      }
      pAttr.needsUpdate = true;
      this.waterParticles.geometry.setDrawRange(0, visible);
    }
    if (this.soundParticles && this.soundPath.length > 0) {
      const pAttr = this.soundParticles.geometry.attributes.position as THREE.BufferAttribute;
      const visible = Math.min(lit, this.soundPath.length, pAttr.count);
      for (let i = 0; i < visible; i++) {
        const node = this.soundPath[i];
        const rise = Math.sin(elapsed * 1.8 + i * 0.5) * 0.02;
        pAttr.setXYZ(i, node.x, node.y + rise, node.z);
      }
      pAttr.needsUpdate = true;
      this.soundParticles.geometry.setDrawRange(0, visible);
    }
  }
}
