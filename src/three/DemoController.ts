/**
 * DemoController —— 自运维演示循环子系统
 *
 * 职责：只负责演示循环的启动、停止、每帧推进、视觉落地。
 * 不做：仪式时间轴、相机切换、音频初始化——那些归 AltarScene / RitualTimelineController。
 */

import * as THREE from 'three';
import { DemoDirector } from './DemoDirector';
import { SeatLotusRig } from './SeatLotusRig';
import { DualDragonRig } from './DualDragonRig';
import type { SpiralEvent } from '../types/altar';
import { altarAudio } from '../audio/altarAudio';
import { buildFrontBead } from './FrontBeadBuilder';

export interface DemoControllerOptions {
  readonly demo: DemoDirector;
  readonly seatTrails: THREE.Line[];
  readonly seatTrailsGroup: THREE.Group | null;
  readonly lotus: SeatLotusRig;
  readonly dragon: DualDragonRig;
  readonly events: SpiralEvent[];
  readonly waterworksGroup: THREE.Group;
  readonly scene: THREE.Scene;
  readonly wujiLight: THREE.SpotLight | null;
  readonly wujiAbsorber: THREE.Object3D | null;
}

export class DemoController {
  private readonly demo: DemoDirector;
  private readonly seatTrails: THREE.Line[];
  private readonly seatTrailsGroup: THREE.Group | null;
  private readonly lotus: SeatLotusRig;
  private readonly dragon: DualDragonRig;
  private readonly events: SpiralEvent[];
  private readonly waterworksGroup: THREE.Group;
  private readonly scene: THREE.Scene;
  private readonly wujiLight: THREE.SpotLight | null;
  private readonly wujiAbsorber: THREE.Object3D | null;

  constructor(options: DemoControllerOptions) {
    this.demo = options.demo;
    this.seatTrails = options.seatTrails;
    this.seatTrailsGroup = options.seatTrailsGroup;
    this.lotus = options.lotus;
    this.dragon = options.dragon;
    this.events = options.events;
    this.waterworksGroup = options.waterworksGroup;
    this.scene = options.scene;
    this.wujiLight = options.wujiLight;
    this.wujiAbsorber = options.wujiAbsorber;
  }

  get isActive(): boolean {
    return this.demo.isActive;
  }

  /** 启动自运维演示循环。 */
  start(): void {
    if (this.demo.isActive) return;
    this.demo.start();

    const waterBead = buildFrontBead(0x38bdf8, 0.72, 0x0b7ab8, 3.2);
    this.waterworksGroup.add(waterBead);
    const soundBead = buildFrontBead(0xc4b5fd, 0.55, 0x7c5cbf, 2.6);
    this.scene.add(soundBead);
    this.dragon.setFrontBeads(waterBead, soundBead);

    // #00 无极点：演示循环中给一束常驻冷顶光
    if (this.wujiLight) this.wujiLight.intensity = 0.9;
    if (this.wujiAbsorber) this.wujiAbsorber.visible = true;

    this.applyVisuals();
  }

  /** 停掉演示循环。 */
  stop(): void {
    if (!this.demo.isActive) return;
    this.demo.stop();
    if (this.wujiLight) this.wujiLight.intensity = 0;
  }

  /** 每帧推进演示状态机。 */
  update(dt: number): void {
    if (!this.demo.isActive) return;
    this.demo.update(dt, (seatId) => {
      const ev = this.events.find((e) => e.seat_id === seatId);
      if (ev) altarAudio.triggerSeatEvent(ev);
    });
    this.applyVisuals();
  }

  /** 把 demoLitSeats 落到全部演示驱动的视觉上（每帧幂等）。 */
  private applyVisuals(): void {
    const lit = this.demo.lit;

    // 逐席光迹与繁花
    if (this.seatTrailsGroup) this.seatTrailsGroup.visible = lit > 0;
    this.seatTrails.forEach((trail, idx) => { trail.visible = idx + 1 <= lit; });
    this.lotus.setDemo(lit);

    // 双龙线/粒子/前锋珠
    this.dragon.setDemo(lit);
  }
}
