/**
 * RFC-007: 华夏祭坛“中空神索·双体变质量阿特伍德振子”物理动力学模型
 *
 * 核心力学：
 * 1. 约束方程: yA(t) + yB(t) = H, z(t) ∈ [-H/2, H/2]
 * 2. 状态向量: X(t) = [z(t), v(t), mA(t), mB(t)]^T
 * 3. 索内闭环虹吸连通器流动: Q_pipe = sgn(z) * CdAp * sqrt(2g|z|)
 * 4. 离散相变: 顶死点挑舌掠水 5% (入乌兰 2 号位) + 底死点神簧反冲与暗河补水
 */

export interface WaterLadderState {
  z: number;            // 广义位移 [-strokeLimit, strokeLimit]
  v: number;            // 广义速度 (m/s)
  mA: number;           // 桶 A 储水量 (kg)
  mB: number;           // 桶 B 储水量 (kg)
  yA: number;           // 桶 A 实际标高 [0, H]
  yB: number;           // 桶 B 实际标高 [0, H]
  flowRate: number;     // 当前索内虹吸流率 Q (kg/s, 正向为 A->B)
  lastSkimmed: number;  // 最近一次挑舌掠水量 (kg)
}

export type WaterLiftPhaseCallback = (
  highBucket: 'A' | 'B',
  massSkimmed: number,
  tone: 'HUANG_ZHONG' | 'LIN_ZHONG'
) => void;

export class AltarWaterLiftEngine {
  // 几何与物理常量
  readonly H: number;           // 基准全高 (m)
  readonly m0: number;          // 空桶净重 (kg)
  readonly mRope: number;       // 中空神索质量 (kg)
  readonly g: number;           // 重力加速度 (m/s^2)
  readonly K_spring: number;    // 底端神簧刚度 (N/m)
  readonly D_spring: number;    // 弹簧阻尼 (N·s/m)
  readonly strokeLimit: number; // 半行程极限 (m)
  readonly CdAp: number;        // 索内通量节流常数
  readonly gammaAir: number;    // 微小气阻 (N·s/m)

  public state: WaterLadderState;
  public onPhaseTransition?: WaterLiftPhaseCallback;

  // 状态防重触发锁
  private topTriggeredA = false;
  private topTriggeredB = false;

  constructor(options?: {
    height?: number;
    bucketMass?: number;
    initialWater?: number;
  }) {
    this.H = options?.height ?? 7.0;
    this.m0 = options?.bucketMass ?? 5.0;
    this.mRope = 1.2;
    this.g = 9.80665;
    this.K_spring = 15000.0;
    this.D_spring = 200.0;
    this.strokeLimit = this.H / 2.0; // 3.5m
    this.CdAp = 0.00045;
    this.gammaAir = 0.05;

    const initWater = options?.initialWater ?? 10.0;
    const initialZ = 0.05; // 引入微扰打破死点随遇平衡

    this.state = {
      z: initialZ,
      v: 0.0,
      mA: initWater,
      mB: initWater,
      yA: this.strokeLimit + initialZ,
      yB: this.strokeLimit - initialZ,
      flowRate: 0.0,
      lastSkimmed: 0.0,
    };
  }

  /**
   * 离散物理步推进（半隐式欧拉积分）
   */
  public update(dt: number): void {
    // 限制单步最大时间步长以保证弹簧碰撞稳定性
    const clampedDt = Math.min(dt, 0.033);
    const subSteps = clampedDt > 0.016 ? 2 : 1;
    const subDt = clampedDt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      this.subStep(subDt);
    }

    // 更新绝对坐标投影
    this.state.yA = this.strokeLimit + this.state.z;
    this.state.yB = this.strokeLimit - this.state.z;
  }

  private subStep(dt: number): void {
    const s = this.state;
    const M_sys = 2 * this.m0 + this.mRope + s.mA + s.mB;

    // 1. 中空索内虹吸流率 Q (A -> B 为正，由高度势差驱动)
    let Q = 0;
    if (s.z > 0 && s.mA > 0) {
      Q = this.CdAp * Math.sqrt(2 * this.g * s.z);
      Q = Math.min(Q, s.mA / dt); // 不能抽干超流
    } else if (s.z < 0 && s.mB > 0) {
      Q = -this.CdAp * Math.sqrt(2 * this.g * (-s.z));
      Q = Math.max(Q, -s.mB / dt);
    }
    s.flowRate = Q;

    // 2. 底端神簧接触判定 (两端弹簧对偶对称)
    let F_spring = 0;
    const compressionA = s.z + this.strokeLimit; // 桶 A 触底判定 (z -> -3.5)
    const compressionB = this.strokeLimit - s.z; // 桶 B 触底判定 (z -> +3.5)

    if (compressionB < 0) {
      // 桶 B 压入底簧 (z > 3.5)
      const penetration = -compressionB;
      F_spring -= this.K_spring * penetration + this.D_spring * s.v;
    } else if (compressionA < 0) {
      // 桶 A 压入底簧 (z < -3.5)
      const penetration = -compressionA;
      F_spring += this.K_spring * penetration - this.D_spring * s.v;
    }

    // 3. 动力学合外力与加速度求解 (Newton-Euler)
    // 广义自由度 z: 向上为 A 升 B 降。若 mB > mA，则 B 下沉驱动 A 上升 (即加速方向为 +z)
    const F_gravity = (s.mB - s.mA) * this.g;
    const F_damping = -this.gammaAir * s.v;
    const a = (F_gravity + F_spring + F_damping) / Math.max(1.0, M_sys);

    // 4. 半隐式欧拉积分 (Semi-implicit Euler)
    s.v += a * dt;
    s.z += s.v * dt;

    // 约束防止弹簧过冲穿透发散
    const maxZ = this.strokeLimit * 1.05;
    if (s.z > maxZ) {
      s.z = maxZ;
      if (s.v > 0) s.v = 0;
    } else if (s.z < -maxZ) {
      s.z = -maxZ;
      if (s.v < 0) s.v = 0;
    }

    // 5. 质量交换积分
    s.mA -= Q * dt;
    s.mB += Q * dt;

    // 6. 极限死点相变检测 (挑舌截留与暗河注水)
    this.handleDiscretePhaseTransitions(s);
  }

  private handleDiscretePhaseTransitions(s: WaterLadderState): void {
    const deadPointThreshold = this.strokeLimit - 0.02;

    // 桶 A 达顶点 (z >= 3.48), 桶 B 扎入暗河
    if (s.z >= deadPointThreshold) {
      if (!this.topTriggeredA && s.v <= 0.2) {
        const skimmed = s.mA * 0.05; // 挑舌截流 5%
        s.mA -= skimmed;
        s.mB += skimmed;             // 底桶自暗河吞入对等补液
        s.lastSkimmed = skimmed;
        this.topTriggeredA = true;
        this.topTriggeredB = false;

        if (this.onPhaseTransition) {
          this.onPhaseTransition('A', skimmed, 'HUANG_ZHONG');
        }
      }
    }
    // 桶 B 达顶点 (z <= -3.48), 桶 A 扎入暗河
    else if (s.z <= -deadPointThreshold) {
      if (!this.topTriggeredB && s.v >= -0.2) {
        const skimmed = s.mB * 0.05; // 挑舌截流 5%
        s.mB -= skimmed;
        s.mA += skimmed;             // 底桶自暗河吞入对等补液
        s.lastSkimmed = skimmed;
        this.topTriggeredB = true;
        this.topTriggeredA = false;

        if (this.onPhaseTransition) {
          this.onPhaseTransition('B', skimmed, 'LIN_ZHONG');
        }
      }
    } else {
      // 离开死点区间重置触发锁
      if (Math.abs(s.z) < this.strokeLimit * 0.8) {
        this.topTriggeredA = false;
        this.topTriggeredB = false;
      }
    }
  }

  /**
   * 重置振子初值
   */
  public reset(perturbation = 0.08): void {
    this.state.z = perturbation;
    this.state.v = 0.0;
    this.state.mA = 10.0;
    this.state.mB = 10.0;
    this.state.yA = this.strokeLimit + perturbation;
    this.state.yB = this.strokeLimit - perturbation;
    this.topTriggeredA = false;
    this.topTriggeredB = false;
  }
}
