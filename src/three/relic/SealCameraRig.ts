// 传国玉玺 · 拆解特写机位
//
// ── 与祭坛相机安全边界的关系（重要）──────────────────────────────────
// AltarScene.animate() 第 1.5 步有一段硬编码的安全边界：
//      const tooLow  = p.y < 0.3;          // 判过低 → 拉回上一安全位
//      const tooFar  = p.length() > 120;   // 判过远 → 拉回上一安全位
// 且 OrbitControls.minDistance = 0.8。
//
// 玉玺悬浮在 y = PYRAMID_TOP + 2.2 = 12.7，机位都在它周围 3~11 个单位内，
// 世界半径约 13~22：**三条边界一条都不会撞上**。
// 所以这里**不改** AltarScene 的边界代码，只把同样的数值抽到
// sealSpec.SEAL_CAMERA_SAFETY 里作为唯一真源，
// 并在 clampToSafety() 里先自夹一遍 —— 将来边界一改，只改常量，
// 机位自己会跟着收敛，不会出现"玉玺特写被判非法拉回"的事故。

import * as THREE from 'three';
import type { SealMode } from '../../types/relic';
import {
  SEAL_CAMERA_LERP,
  SEAL_CAMERA_POSES,
  SEAL_CAMERA_SAFETY,
  SEAL_HOVER_Y
} from '../../data/sealSpec';

/** 机位名：与玉玺三种形态一一对应 */
export type SealCameraPoseName = 'overview' | 'exploded' | 'stamping';

/** 特写用的视场角（拆解要压一点，才有"凑近看"的压迫感） */
const FOV_BY_POSE: Record<SealCameraPoseName, number> = {
  overview: 45,
  exploded: 34,
  stamping: 42
};

export interface SealCameraRigOptions {
  /** 被驱动的相机 */
  camera: THREE.PerspectiveCamera;
  /**
   * OrbitControls.target。传入后机位会同步改写它，
   * 这样 controls.update() 算出来的朝向跟机位一致，不会打架。
   */
  controlsTarget?: THREE.Vector3;
  /** 安全边界：与 AltarScene 的硬编码值对齐，勿随手改 */
  minY?: number;
  maxRadius?: number;
  minDistance?: number;
}

/** 一个机位 = 相机位 + 注视点 + 视场角 */
export interface SealCameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export class SealCameraRig {
  private camera: THREE.PerspectiveCamera | null = null;
  private controlsTarget: THREE.Vector3 | null = null;

  /** 悬浮玺台中心（机位全部相对它取偏移） */
  private readonly anchor = new THREE.Vector3(0, SEAL_HOVER_Y, 0);

  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private desiredFov = 45;

  private engaged = false;
  private readonly minY: number;
  private readonly maxRadius: number;
  private readonly minDistance: number;

  constructor(options: SealCameraRigOptions) {
    this.camera = options.camera;
    this.controlsTarget = options.controlsTarget ?? null;
    this.minY = options.minY ?? SEAL_CAMERA_SAFETY.minY;
    this.maxRadius = options.maxRadius ?? SEAL_CAMERA_SAFETY.maxRadius;
    this.minDistance = options.minDistance ?? SEAL_CAMERA_SAFETY.minDistance;
  }

  /** 玉玺换了位置（比如将来改悬浮高度），机位锚点跟着走 */
  public setAnchor(x: number, y: number, z: number): void {
    this.anchor.set(x, y, z);
  }

  /**
   * 按安全边界夹一次。
   * 顺序：先抬到 minY 之上，再压进 maxRadius 球内，最后推出 minDistance 之外。
   */
  public clampToSafety(position: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const safe = position.clone();

    if (!Number.isFinite(safe.x) || !Number.isFinite(safe.y) || !Number.isFinite(safe.z)) {
      return new THREE.Vector3(0, SEAL_HOVER_Y + 4, 18);
    }
    if (safe.y < this.minY) safe.y = this.minY;

    const radius = safe.length();
    if (radius > this.maxRadius) safe.multiplyScalar(this.maxRadius / (radius || 1));

    const distance = safe.distanceTo(target);
    if (distance < this.minDistance) {
      const dir = safe.clone().sub(target);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(this.minDistance);
      safe.copy(target).add(dir);
    }
    return safe;
  }

  /** 该机位是否落在安全边界内（给外部做断言/自检用） */
  public isSafe(position: THREE.Vector3): boolean {
    return (
      Number.isFinite(position.x) &&
      Number.isFinite(position.y) &&
      Number.isFinite(position.z) &&
      position.y >= this.minY &&
      position.length() <= this.maxRadius
    );
  }

  /** 算出某个机位的完整姿态（不落地，纯计算，便于自检与复用） */
  public getPose(name: SealCameraPoseName): SealCameraPose {
    const preset = SEAL_CAMERA_POSES[name];
    const target = new THREE.Vector3(this.anchor.x, this.anchor.y + preset.lookAtY, this.anchor.z);
    const raw = new THREE.Vector3(
      this.anchor.x + preset.offset.x,
      this.anchor.y + preset.offset.y,
      this.anchor.z + preset.offset.z
    );
    return {
      position: this.clampToSafety(raw, target),
      target,
      fov: FOV_BY_POSE[name]
    };
  }

  /** 玉玺形态 → 对应机位（stamping 用 stamping，其余按形态名取） */
  public focusMode(mode: SealMode): SealCameraPose {
    const name: SealCameraPoseName = mode === 'normal' ? 'overview' : mode;
    return this.focus(name);
  }

  /** 切到某个机位（开始平滑过渡） */
  public focus(name: SealCameraPoseName): SealCameraPose {
    const pose = this.getPose(name);
    this.desiredPos.copy(pose.position);
    this.desiredTarget.copy(pose.target);
    this.desiredFov = pose.fov;
    this.engaged = true;
    return pose;
  }

  /** 交还控制权：停止驱动（用户自己拖相机时用） */
  public release(): void {
    this.engaged = false;
  }

  public isEngaged(): boolean {
    return this.engaged;
  }

  /** 每帧推进。AltarScene 在 controls.update() 之前调用即可。 */
  public update(dt: number): void {
    if (!this.engaged || !this.camera) return;
    const delta = Math.min(0.05, Math.max(0, dt));
    const k = 1 - Math.exp(-SEAL_CAMERA_LERP * delta); // 帧率无关的指数逼近

    this.camera.position.lerp(this.desiredPos, k);
    this.controlsTarget?.lerp(this.desiredTarget, k);

    if (Math.abs(this.camera.fov - this.desiredFov) > 0.01) {
      this.camera.fov += (this.desiredFov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }

    if (this.camera.position.distanceTo(this.desiredPos) < 0.02) {
      this.camera.position.copy(this.desiredPos);
      this.controlsTarget?.copy(this.desiredTarget);
      this.engaged = false;
    }
  }

  /** 解引用（本 rig 不持有 GPU 资源，只断开引用） */
  public dispose(): void {
    this.engaged = false;
    this.camera = null;
    this.controlsTarget = null;
  }
}
