import * as THREE from 'three';
import { PYRAMID_HALF } from '../data/altarGeometry';

// RFC-007 水梯世界常数（北坡整机定位）。
export const WATER_LIFT_Z = -(PYRAMID_HALF + 1.7);
export const WATER_LIFT_BASE_Y = 2.4;
export const WATER_LIFT_SCALE = 6.0 / 7.0;
export const WATER_LIFT_PULLEY_Y = 9.6;
export const WATER_LIFT_SEP = 1.6;

interface LiftState {
  yA: number;
  yB: number;
  mA: number;
  mB: number;
  z: number;
}

interface MaglevState {
  theta: number;
  z: number;
}

/**
 * 机械视觉总管：RFC-007 水梯（双桶/水柱/神索）+ RFC-008 走马灯磁浮的每帧视觉映射。
 * 只持有节点引用，纯视觉；物理引擎（AltarWaterLiftEngine / AltarMaglevLanternEngine）仍在场景侧驱动。
 */
export class MechanicsRig {
  waterLiftGroup: THREE.Group | null = null;
  private bucketA: THREE.Group | null = null;
  private bucketB: THREE.Group | null = null;
  private waterA: THREE.Mesh | null = null;
  private waterB: THREE.Mesh | null = null;
  private ropeA: THREE.Mesh | null = null;
  private ropeB: THREE.Mesh | null = null;
  private lanterns: THREE.Group | null = null;

  private waterAnnounced = false;
  private maglevAnnounced = false;

  registerWaterLift(
    group: THREE.Group,
    bucketA: THREE.Group,
    bucketB: THREE.Group,
    waterA: THREE.Mesh,
    waterB: THREE.Mesh,
    ropeA: THREE.Mesh,
    ropeB: THREE.Mesh
  ): void {
    this.waterLiftGroup = group;
    this.bucketA = bucketA;
    this.bucketB = bucketB;
    this.waterA = waterA;
    this.waterB = waterB;
    this.ropeA = ropeA;
    this.ropeB = ropeB;
  }

  registerLanterns(group: THREE.Group): void {
    this.lanterns = group;
  }

  /** 双桶标高 + 水位 + 神索逐帧映射。 */
  syncWaterLift(state: LiftState): void {
    if (!this.waterLiftGroup) return;
    const centerA = WATER_LIFT_BASE_Y + state.yA * WATER_LIFT_SCALE;
    const centerB = WATER_LIFT_BASE_Y + state.yB * WATER_LIFT_SCALE;

    if (this.bucketA) this.bucketA.position.y = centerA;
    if (this.bucketB) this.bucketB.position.y = centerB;

    if (this.waterA) this.waterA.scale.y = THREE.MathUtils.clamp(state.mA / 15, 0.02, 1);
    if (this.waterB) this.waterB.scale.y = THREE.MathUtils.clamp(state.mB / 15, 0.02, 1);

    const ropeLenA = Math.max(0.05, WATER_LIFT_PULLEY_Y - (centerA + 0.5));
    const ropeLenB = Math.max(0.05, WATER_LIFT_PULLEY_Y - (centerB + 0.5));
    if (this.ropeA) {
      this.ropeA.scale.y = ropeLenA;
      this.ropeA.position.set(-WATER_LIFT_SEP, WATER_LIFT_PULLEY_Y - ropeLenA / 2, 0);
    }
    if (this.ropeB) {
      this.ropeB.scale.y = ropeLenB;
      this.ropeB.position.set(WATER_LIFT_SEP, WATER_LIFT_PULLEY_Y - ropeLenB / 2, 0);
    }

    if (!this.waterAnnounced) {
      this.waterAnnounced = true;
      console.log(`[水梯] RFC-007 引擎接管 z=${state.z.toFixed(3)}`);
    }
  }

  /** 走马灯回转角 + 磁浮气隙高度逐帧映射；门控只遮转角，不碰动力学。 */
  syncMaglev(state: MaglevState, gateOpen: boolean, theta0: number): void {
    if (!this.lanterns) return;
    this.lanterns.rotation.y = gateOpen ? state.theta - theta0 : 0;
    this.lanterns.position.y = state.z;

    if (!this.maglevAnnounced) {
      this.maglevAnnounced = true;
      console.log(`[走马灯] RFC-008 引擎接管 theta=${state.theta.toFixed(4)}`);
    }
  }
}
