import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraMode, AltarRole, AltarCapabilities } from '../types/altar';
import {
  GUEST_ROUTINES,
  GUEST_ROUTINE_SECONDS,
  CAMERA_SAFETY_BY_ROLE,
  CAMERA_DISTANCE_BY_ROLE,
  ROLE_CAPABILITIES,
} from '../types/altar';
import { PYRAMID_HALF, CELL, BRICK } from '../data/altarGeometry';
import { SEAL_HOVER_Y } from '../data/sealSpec';

/**
 * 相机总管：把原先焊在 AltarScene 里的相机子系统收进来。
 * 职责：相机+控制器、固定黄金机位、平滑过渡、安全边界、游客机位轮换、WASD 自由飞行、正交取证。
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  readonly targetPos = new THREE.Vector3(48, 40, 58);
  readonly targetLookAt = new THREE.Vector3(0, 6, 0);
  transitioning = false;
  cameraMode: CameraMode = 'orbit';

  role: AltarRole = 'guest';
  private capabilities: AltarCapabilities = ROLE_CAPABILITIES.guest;
  private safety = CAMERA_SAFETY_BY_ROLE.guest;
  get caps(): AltarCapabilities {
    return this.capabilities;
  }
  get safetyThreshold() {
    return this.safety;
  }

  guestIndex = 0;
  guestTimer = 0;
  guestPlaying = false;
  rabbitActive = false;
  readonly pressedKeys = new Set<string>();
  readonly lastSafe = new THREE.Vector3(48, 40, 58);

  orthoTopdownCamera: THREE.OrthographicCamera | null = null;

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
    this.applyRole();
  }

  setRole(role: AltarRole): void {
    this.role = role;
    this.applyRole();
  }

  private applyRole(): void {
    const caps = ROLE_CAPABILITIES[this.role];
    this.capabilities = caps;
    this.safety = CAMERA_SAFETY_BY_ROLE[this.role];
    this.controls.enabled = caps.freeCamera;
    this.controls.enableRotate = caps.freeCamera;
    this.controls.enableZoom = caps.freeCamera;
    this.controls.enablePan = caps.freeCamera;
    const distance = CAMERA_DISTANCE_BY_ROLE[this.role];
    this.controls.minDistance = distance.min;
    this.controls.maxDistance = distance.max;
    if (this.role === 'guest') {
      this.guestIndex = 0;
      this.guestTimer = 0;
      this.guestPlaying = false;
      this.rabbitActive = false;
    }
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.transitioning = true;
    if (mode === 'rabbit_hole') {
      this.targetPos.set(-CELL * 3 - 2.2, BRICK * 1.5, 0);
      this.targetLookAt.set(-CELL * 3, BRICK * 1.5, 0);
    } else if (mode === 'yin') {
      this.targetPos.set(0, 1.8, 2.5);
      this.targetLookAt.set(0, 2.6, -7.5);
    } else if (mode === 'interior') {
      this.targetPos.set(0, 16, 18);
      this.targetLookAt.set(0, 6, 0);
    } else if (mode === 'outer_lanterns') {
      this.targetPos.set(0, 6.5, 30.5);
      this.targetLookAt.set(0, 3.5, 23.5);
    } else if (mode === 'topdown') {
      this.targetPos.set(0, 78, 0.1);
      this.targetLookAt.set(0, 0, 0);
    } else if (mode === 'fountain') {
      this.targetPos.set(0, 26, 20);
      this.targetLookAt.set(0, 14, 0);
    } else if (mode === 'cinematic') {
      this.targetPos.set(52, 26, 52);
      this.targetLookAt.set(0, 5, 0);
    } else if (mode === 'orbit') {
      this.targetPos.set(48, 40, 58);
      this.targetLookAt.set(0, 6, 0);
    } else if (mode === 'patrol') {
      this.targetPos.set(46, 24, 46);
      this.targetLookAt.set(0, 5, 0);
    } else if (mode === 'relic') {
      this.targetPos.set(6.2, SEAL_HOVER_Y + 3.4, 8.6);
      this.targetLookAt.set(0, SEAL_HOVER_Y, 0);
    }
  }

  adoptRelicPose(pos: THREE.Vector3, target: THREE.Vector3): void {
    this.targetPos.copy(pos);
    this.targetLookAt.copy(target);
    this.transitioning = true;
  }

  reset(): void {
    const position = new THREE.Vector3(48, 40, 58);
    const target = new THREE.Vector3(0, 6, 0);
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.targetPos.copy(position);
    this.targetLookAt.copy(target);
    this.lastSafe.copy(position);
    this.cameraMode = 'orbit';
    this.transitioning = false;
    this.pressedKeys.clear();
    this.controls.update();
  }

  activateGuestRoutine(): void {
    const routine = GUEST_ROUTINES[this.guestIndex];
    this.guestIndex = (this.guestIndex + 1) % GUEST_ROUTINES.length;
    this.guestTimer = 0;
    // 为什么：此前两标志只复位、全仓无处置 true，updateRabbitHoleTour 因此不可达，
    // 游客 rabbit_hole 路线静默失效 —— 轮到 rabbit_hole 时必须置 true 才会播放；
    // 其他 routine（静态黄金机位）维持复位语义不变。
    this.guestPlaying = routine === 'rabbit_hole';
    this.rabbitActive = routine === 'rabbit_hole';
    this.setCameraMode(routine);
  }

  update(dt: number): void {
    if (this.role === 'guest' && this.guestPlaying) {
      this.guestTimer += dt;
      if (this.rabbitActive) this.updateRabbitHoleTour(this.guestTimer / GUEST_ROUTINE_SECONDS);
      if (this.guestTimer >= GUEST_ROUTINE_SECONDS) {
        this.guestPlaying = false;
        this.rabbitActive = false;
      }
    }
    if (this.transitioning) {
      // 固定时长过渡（≈1.2s），用 easeInOut 曲线，到了就停死。
      // 为什么：固定 k=0.085 是帧率相关的（144Hz 下收敛快 ~2.4 倍），
      // 改为指数衰减的帧率无关形式后，任意刷新率下过渡节奏一致。
      const k = 1 - Math.exp(-7 * dt);
      this.camera.position.lerp(this.targetPos, k);
      this.controls.target.lerp(this.targetLookAt, k);
      // 距离阈值放大到 0.4：早停，不做无限指数衰减（消除"吸附感"）
      if (this.camera.position.distanceTo(this.targetPos) < 0.4) {
        this.camera.position.copy(this.targetPos);
        this.controls.target.copy(this.targetLookAt);
        this.transitioning = false;
      }
    }
    const p = this.camera.position;
    const finite = Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
    const tooLow = p.y < this.safety.minY;
    const tooFar = p.length() > this.safety.maxRadius;
    if (!finite || tooLow || tooFar) {
      this.camera.position.copy(this.lastSafe);
      this.transitioning = false;
    } else {
      this.lastSafe.copy(p);
    }
    this.updateFreeFlight(dt);
    this.controls.update();
  }

  // 自由飞行每帧临时向量：预分配复用，避免每帧 new 3 个 Vector3 产生 GC 抖动
  private readonly ffForward = new THREE.Vector3();
  private readonly ffRight = new THREE.Vector3();
  private readonly ffDelta = new THREE.Vector3();

  private updateFreeFlight(dt: number): void {
    if (!this.capabilities.freeCamera || this.pressedKeys.size === 0) return;
    const forward = this.ffForward;
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    const right = this.ffRight.crossVectors(forward, this.camera.up).normalize();
    const delta = this.ffDelta.set(0, 0, 0);
    if (this.pressedKeys.has('w')) delta.add(forward);
    if (this.pressedKeys.has('s')) delta.sub(forward);
    if (this.pressedKeys.has('d')) delta.add(right);
    if (this.pressedKeys.has('a')) delta.sub(right);
    if (this.pressedKeys.has('e')) delta.y += 1;
    if (this.pressedKeys.has('q')) delta.y -= 1;
    if (delta.lengthSq() === 0) return;
    const speed = this.pressedKeys.has('shift') ? 24 : 8;
    delta.normalize().multiplyScalar(speed * dt);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.transitioning = false;
  }

  private updateRabbitHoleTour(progress: number): void {
    const startX = -CELL * 3 - 1.7;
    const endX = CELL * 3 + 1.7;
    const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
    const x = THREE.MathUtils.lerp(startX, endX, eased);
    const y = BRICK * 1.5;
    this.camera.position.set(x, y, 0);
    this.controls.target.set(Math.min(x + 2.1, endX), y, 0);
    this.transitioning = false;
  }

  onKeyDown(key: string): void {
    if (!this.capabilities.freeCamera) return;
    if (key === 'r') { this.reset(); return; }
    if (!['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(key)) return;
    this.pressedKeys.add(key);
  }

  onKeyUp(key: string): void {
    this.pressedKeys.delete(key);
  }

  onBlur(): void {
    this.pressedKeys.clear();
  }

  setOrthoTopdown(halfWidth: number = PYRAMID_HALF): THREE.OrthographicCamera {
    const cam = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfWidth, -halfWidth, 0.1, 1000);
    cam.position.set(0, 200, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.orthoTopdownCamera = cam;
    return cam;
  }

  clearOrthoTopdown(): void {
    this.orthoTopdownCamera = null;
  }

  syncLanternRail(lookAt: THREE.Vector3, camPos: THREE.Vector3): void {
    this.targetPos.copy(camPos);
    this.targetLookAt.copy(lookAt);
    this.transitioning = true;
  }
}
