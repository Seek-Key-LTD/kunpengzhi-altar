/**
 * RFC-008: 华夏祭坛“外环超导磁通钉扎悬浮走马灯动力系统”物理动力学模型
 *
 * 核心力学与拓扑：
 * 1. 几何拓扑: 外径 D = 48.0m (R = 24.0m), 64 标准开间, 16 面招魂大茶灯 (1/4 实位, 3/4 虚位透光)
 * 2. 磁通钉扎 (西南交大高温超导解耦):
 *    - 垂直与横向自稳定: 零外电功耗 (YBCO 77K 液氮内生超导环流与 NdFeB 永磁轨道磁通钉扎)
 *    - 驱动前进: 地下暗槽分段长定子直线感应电机 (LIM) 沿切向拖曳感应铝板
 * 3. 冷冻声学共鸣 (MTV Unplugged 1993 × Kurt Cobain 1959 Martin D-18E):
 *    - 1 号领航旗舰供奉，极低温干燥氮气淬火红云杉木质共鸣箱，北坡地脉震颤机械击发 Drop-Eb 凄厉扫弦
 */

export interface MaglevLanternState {
  theta: number;          // 环形回转角 [0, 2π) (rad)
  omega: number;          // 角速度 (rad/s)
  z: number;              // 磁浮垂直间隙 [m], 基准标高 0.02m (20mm)
  vz: number;             // 垂直微振速度 (m/s)
  radialOffset: number;   // 径向偏移 (m), 磁通钉扎约束在 ±0.002m 内
  temperature: number;    // 超导杜瓦罐内部温度 (K), 临界温度 Tc = 93K, 工作稳态 77K
  liquidN2Mass: number;   // 液氮剩余工质 (kg), 用于漫天冷雾相变
  currentBay: number;     // 当前对齐的 64 卦开间索引 [0, 63]
  currentChapter: number; // 当前正对朝圣者的《茶史五绝赋》卷章 [0, 15]
  isAcousticStrumTriggered: boolean; // 是否处于柯本吉他共鸣击发瞬态
}

export type AcousticStrumCallback = (
  chord: 'DROP_EB' | 'SEVENTH_SUS4' | 'BHE_BILL_COUNTER',
  bay: number,
  chapter: number,
  intensity: number
) => void;

export class AltarMaglevLanternEngine {
  // 几何与机械参数
  readonly R: number = 24.0;             // 回转半径 (m)
  readonly totalBays: number = 64;       // 64 卦总开间
  readonly lanternCount: number = 16;    // 16 幕巨幅走马灯
  readonly totalMass: number = 10000.0;  // 10 吨复合结构
  readonly I_rot: number;                // 转动惯量 M * R^2 (kg·m²)

  // 磁通钉扎悬浮刚度参数 (西南交大高丰度 YBCO 模块)
  readonly baseLevitationHeight: number = 0.02; // 20mm 基准气隙
  readonly K_z: number = 2.5e6;          // 垂直钉扎刚度 (N/m)
  readonly D_z: number = 1.2e4;          // 垂直磁通阻尼 (N·s/m)
  readonly K_r: number = 1.8e6;          // 径向自导向钉扎刚度 (N/m)
  readonly D_r: number = 8.0e3;          // 径向磁阻尼 (N·s/m)

  // 地下长定子直线电机参数 (幽冥牵引所)
  readonly F_drive: number = 1200.0;     // 定子行波切向推力 (N)
  readonly gamma_air: number = 38.0;     // 低速空气粘滞阻尼 (N·s/m)

  public state: MaglevLanternState;
  public onAcousticStrum?: AcousticStrumCallback;

  // 触发防重锁
  private lastTriggeredBay: number = -1;

  constructor(options?: {
    radius?: number;
    initialTheta?: number;
    initialOmega?: number;
  }) {
    this.R = options?.radius ?? 24.0;
    this.I_rot = this.totalMass * this.R * this.R; // 5.76e6 kg·m²

    // 默认角速度：约 16 分钟巡礼一整周 (2π / 960s ≈ 0.006545 rad/s)
    const defaultOmega = (2 * Math.PI) / 960.0;

    this.state = {
      theta: options?.initialTheta ?? 0.0,
      omega: options?.initialOmega ?? defaultOmega,
      z: this.baseLevitationHeight,
      vz: 0.0,
      radialOffset: 0.0,
      temperature: 77.0, // 77K 液氮沸点
      liquidN2Mass: 800.0, // 800kg 深冷初充
      currentBay: 0,
      currentChapter: 0,
      isAcousticStrumTriggered: false,
    };
  }

  /**
   * 离散物理步更新
   * @param dt 积分步长 (s)
   * @param seismicPulse 来自北坡阿特伍德双桶落地砸向忘忧重工 Duffing 神簧的地脉震颤冲击标量 [0.0, 1.0]
   */
  public update(dt: number, seismicPulse: number = 0.0): void {
    const s = this.state;

    // 1. 垂直磁通钉扎动力学 (受地脉次声波与神簧撞击扰动)
    const deltaZ = s.z - this.baseLevitationHeight;
    // 地脉冲击传入地下永磁基座，引起微米级高频振荡
    const seismicForce = seismicPulse * 4500.0 * Math.sin(s.theta * 16);
    const F_lev = -this.K_z * deltaZ - this.D_z * s.vz + seismicForce;
    const az = F_lev / this.totalMass;
    s.vz += az * dt;
    s.z += s.vz * dt;

    // 2. 切向圆周驱动 (地下分段长定子行波电磁推力 - 空气阻尼)
    const T_drive = this.F_drive * this.R;
    const v_tan = s.omega * this.R;
    const F_drag = this.gamma_air * v_tan;
    const T_drag = F_drag * this.R;

    const alpha = (T_drive - T_drag) / this.I_rot;
    s.omega += alpha * dt;
    s.theta = (s.theta + s.omega * dt) % (2 * Math.PI);
    if (s.theta < 0) s.theta += 2 * Math.PI;

    // 3. 计算当前对齐的 64 开间与 16 章《茶史五绝赋》
    const bayAngle = (2 * Math.PI) / this.totalBays;
    s.currentBay = Math.floor(s.theta / bayAngle) % this.totalBays;
    s.currentChapter = Math.floor(s.currentBay / 4) % this.lanternCount;

    // 4. 液氮相变冷却维持与漫天白雾释放
    s.liquidN2Mass = Math.max(0, s.liquidN2Mass - 0.008 * dt);
    if (s.liquidN2Mass <= 0) {
      // 液氮耗尽，超导体升温失超判定 (安全防线)
      s.temperature += 0.5 * dt;
    }

    // 5. 柯本 1959 Martin D-18E 冷冻声学共鸣击发检测
    // 当领航 1 号船跨越开间界限，且恰逢北坡水梯撞簧地脉脉冲时，击发凄厉扫弦
    if (s.currentBay !== this.lastTriggeredBay) {
      this.lastTriggeredBay = s.currentBay;
      
      // 每过 4 个开间（即一个完整茶灯屏风巡礼至观礼正位）或受强地脉脉冲冲击时
      const isLeadPosition = s.currentBay % 4 === 0;
      if (isLeadPosition || seismicPulse > 0.4) {
        s.isAcousticStrumTriggered = true;
        if (this.onAcousticStrum) {
          // 第 16 面压轴旗舰 (chapter 15)：天地银行一万贯兑换券，触发点钞机飞速过钞声
          let chord: 'DROP_EB' | 'SEVENTH_SUS4' | 'BHE_BILL_COUNTER' = isLeadPosition ? 'DROP_EB' : 'SEVENTH_SUS4';
          if (s.currentChapter === 15 && isLeadPosition) {
            chord = 'BHE_BILL_COUNTER';
          }
          const intensity = Math.min(1.0, 0.6 + seismicPulse * 0.4);
          this.onAcousticStrum(chord, s.currentBay, s.currentChapter, intensity);
        }
      } else {
        s.isAcousticStrumTriggered = false;
      }
    }
  }

  /**
   * 补充液氮工质 (广寒制冷重工深冷灌装)
   */
  public replenishLiquidNitrogen(amountKg: number = 800.0): void {
    this.state.liquidN2Mass += amountKg;
    this.state.temperature = 77.0;
  }
}
