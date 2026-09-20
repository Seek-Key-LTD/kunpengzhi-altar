import type { RitualPhase } from '../types/altar';
import { RITUAL_TOTAL_SEC } from '../types/altar';

/**
 * 仪式时间轴时钟：纯计时状态袋，不碰场景图与音频。
 * 持有 elapsed / rate / running / phase / timeSec / namingLitSeats。
 * 速率钳制由调用方（AltarScene，QA 门禁要求其源码保留 RITUAL_PLAYBACK_* 常量）完成。
 */
export class RitualClock {
  elapsed = 0;
  rate = 1;
  running = false;
  phase: RitualPhase = 'abyss';
  /** 注入给 #00 显形结算的时间（公共页为 null = 不驱动 1800s 时间轴）。 */
  timeSec: number | null = null;
  /** naming 幕上次已结算的席数，用于只在整席台阶变化时重写场景。 */
  namingLitSeats = -1;

  start(): void {
    this.running = true;
    this.elapsed = 0;
    this.phase = 'abyss';
    this.namingLitSeats = -1;
  }

  stop(): void {
    this.running = false;
  }

  /** 每帧推进，封顶 1800s。返回本帧推进后的 elapsed。 */
  tick(step: number): number {
    if (!this.running) return this.elapsed;
    const s = Number.isFinite(step) ? step : 0;
    this.elapsed = Math.min(RITUAL_TOTAL_SEC, this.elapsed + s * this.rate);
    return this.elapsed;
  }

  /** 定位到 t（夹到 [0, RITUAL_TOTAL_SEC]）。 */
  seek(t: number): number {
    const clamped = Number.isFinite(t) ? Math.max(0, Math.min(RITUAL_TOTAL_SEC, t)) : 0;
    this.elapsed = clamped;
    return clamped;
  }
}
