import { SEAT_ID_MAX } from '../types/altar';

export const DEMO_KINDLE_SEC = 1.15; // 点名：每席间隔（秒）
export const DEMO_HOLD_SEC = 3.2; // 第 49 席定格（秒）
export const DEMO_EXTINGUISH_SEC = 0.42; // 逆熄：每席熄灭间隔（秒）
export const DEMO_REST_SEC = 4.0; // 全熄留白（秒）

type DemoPhase = 'kindle' | 'hold' | 'extinguish' | 'rest';

/**
 * 演示循环状态机：纯逻辑，不碰场景图。
 * 点名 kindle（每席发声一次）→ hold（第 49 席定格）→ extinguish（逆熄）→ rest（留白）→ 回到 kindle。
 * 场景侧只读 litSeats 落地视觉；新点亮一席时通过 onSeatLit 回调让场景去触发音频。
 */
export class DemoDirector {
  private active = false;
  private litSeats = 0;
  private nextSeat = 1;
  private phase: DemoPhase = 'kindle';
  private timer = 0;

  get isActive(): boolean {
    return this.active;
  }

  /** 当前应点亮的席数（0..SEAT_ID_MAX）。 */
  get lit(): number {
    return this.litSeats;
  }

  start(): void {
    this.active = true;
    this.litSeats = 0;
    this.nextSeat = 1;
    this.phase = 'kindle';
    this.timer = 0;
  }

  stop(): void {
    this.active = false;
  }

  /** 每帧推进；newlyLit 是本帧新点亮的席号（逆熄阶段为 -1 不回调）。 */
  update(dt: number, onSeatLit?: (seatId: number) => void): void {
    if (!this.active) return;
    this.timer += Number.isFinite(dt) ? dt : 0;

    if (this.phase === 'kindle') {
      if (this.timer >= DEMO_KINDLE_SEC) {
        this.timer -= DEMO_KINDLE_SEC;
        const next = Math.min(SEAT_ID_MAX, this.nextSeat);
        this.nextSeat = next + 1;
        this.litSeats = next;
        onSeatLit?.(next);
        if (next === SEAT_ID_MAX) {
          this.phase = 'hold';
          this.timer = 0;
        }
      }
    } else if (this.phase === 'hold') {
      if (this.timer >= DEMO_HOLD_SEC) {
        this.phase = 'extinguish';
        this.timer = 0;
        this.nextSeat = SEAT_ID_MAX;
      }
    } else if (this.phase === 'extinguish') {
      if (this.timer >= DEMO_EXTINGUISH_SEC) {
        this.timer -= DEMO_EXTINGUISH_SEC;
        this.litSeats = Math.max(0, this.nextSeat - 1);
        this.nextSeat = this.litSeats;
        if (this.litSeats <= 0) {
          this.phase = 'rest';
          this.timer = 0;
        }
      }
    } else {
      if (this.timer >= DEMO_REST_SEC) {
        this.phase = 'kindle';
        this.timer = 0;
        this.nextSeat = 1;
        this.litSeats = 0;
      }
    }
  }
}
