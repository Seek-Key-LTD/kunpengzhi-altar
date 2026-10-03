/**
 * RelicController —— 传国玉玺子系统
 *
 * 职责：只负责玉玺的挂载、状态、交互、销毁。
 * 不做：仪式逻辑、相机切换、动画循环——那些归 AltarScene。
 */

import * as THREE from 'three';
import { ImperialSealObject } from './relic/ImperialSealObject';
import { SealStampDecal } from './relic/SealStampDecal';
import { SealCameraRig } from './relic/SealCameraRig';
import type { ImperialSealState, SealEra, SealMode } from '../types/relic';
import { SEAL_HOVER_Y, SEAL_STAMP } from '../data/sealSpec';

export interface RelicControllerOptions {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controlsTarget: THREE.Vector3;
}

export class RelicController {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controlsTarget: THREE.Vector3;

  relic: ImperialSealObject | null = null;
  relicDecal: SealStampDecal | null = null;
  relicRig: SealCameraRig | null = null;
  onRelicSelect?: (relicId: string) => void;

  constructor(options: RelicControllerOptions) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.controlsTarget = options.controlsTarget;
  }

  /** 挂载玉玺：悬浮于坛心正上方 SEAL_HOVER_Y 处。 */
  mount(): void {
    if (this.relic) return;

    const decal = new SealStampDecal();
    this.scene.add(decal.object3D);
    this.relicDecal = decal;

    const seal: ImperialSealObject = new ImperialSealObject({
      // 拓印触地：朱砂印痕落在坛体西侧台基（PYRAMID_HALF 之外，不被中空方锥遮挡）
      onStamp: () =>
        decal.stamp(
          new THREE.Vector3(SEAL_STAMP.home.x, SEAL_STAMP.home.y, SEAL_STAMP.home.z),
          seal.getEra()
        )
    });
    seal.object3D.position.set(0, SEAL_HOVER_Y, 0);
    this.scene.add(seal.object3D);
    this.relic = seal;

    // 用真实资产接管程序化占位几何（public/models/imperial_seal.glb）。
    // 为什么：异步完成回调必须确认挂载者仍是当前实例（dispose 后已完成加载
    // 会由 ImperialSealObject 自行回收并返回 false），避免对已销毁实例做日志/操作。
    void seal.loadSealFromGLB().then((ok) => {
      if (ok && this.relic === seal) {
        console.info('[玉玺] 高精 GLB 已接管，三角面 =', seal.countTriangles());
      }
    });

    this.relicRig = new SealCameraRig({
      camera: this.camera,
      controlsTarget: this.controlsTarget
    });
  }

  /** 玉玺形态：normal（合） / exploded（拆解） / stamping（拓印） */
  setMode(mode: SealMode): void {
    this.relic?.setMode(mode);
    this.relicRig?.focusMode(mode);
  }

  /** 断代层过滤：秦 → 汉新 → 魏晋十六国 → 辽金 */
  setEra(era: SealEra): void {
    this.relic?.setEra(era);
  }

  /** 推近到悬浮玺台 */
  focus(): void {
    this.relicRig?.focus('overview');
  }

  /** 玉玺选中：只高亮 + 推近，不改形态 */
  handlePick(): void {
    this.relic?.handlePick();
    this.focus();
    this.onRelicSelect?.('imperial_seal');
  }

  setSelected(v: boolean): void {
    this.relic?.setSelected(v);
  }

  /** 导演手动拖拆解进度（0 合 → 1 全拆） */
  setExplodedProgress(progress: number): void {
    this.relic?.setExplodedProgress(progress);
  }

  /** 玉玺运行时状态（无席位语义，可安全上报） */
  getState(): ImperialSealState | null {
    return this.relic?.getState() ?? null;
  }

  /** 相机机位（供 setCameraMode('relic') 使用） */
  getCameraPose(): { position: THREE.Vector3; target: THREE.Vector3 } | null {
    return this.relicRig?.getPose('overview') ?? null;
  }

  /** 拾取用对象列表 */
  pickables(): THREE.Object3D[] {
    return this.relic?.pickables() ?? [];
  }

  /** 每帧推进（自转 + 呼吸 + 形态状态机） */
  update(dt: number, elapsedTime: number): void {
    this.relic?.update(dt, elapsedTime);
    this.relicDecal?.update(dt);
    this.relicRig?.update(dt);
  }

  /** 销毁玉玺子系统 */
  dispose(): void {
    if (this.relic) {
      this.scene.remove(this.relic.object3D);
      this.relic.dispose();
      this.relic = null;
    }
    if (this.relicDecal) {
      this.scene.remove(this.relicDecal.object3D);
      this.relicDecal.dispose();
      this.relicDecal = null;
    }
    this.relicRig?.dispose();
    this.relicRig = null;
    this.onRelicSelect = undefined;
  }
}
