/**
 * #19 公共正典广播时钟
 *
 * 每晚 23:00–01:00 连播四场 1800 秒正典：
 *   场 1: 23:00:00 – 23:30:00
 *   场 2: 23:30:00 – 24:00:00 (= 00:00:00)
 *   场 3: 00:00:00 – 00:30:00
 *   场 4: 00:30:00 – 01:00:00
 *
 * 输入：任意 Date / unix ms —— **一律按 Asia/Shanghai（UTC+8）挂钟解释**。
 * 中国无夏令时，固定 +8:00 偏移即可，与访客浏览器本地时区无关：
 * 海外观众与国内观众看到的是同一场直播（修复前实现读 `getHours()`，
 * 实际取的是浏览器本地时区，海外访客的广播窗口会整体错位）。
 *
 * 输出：off-air / live + 场次索引（0..3）+ 场内秒数（0..1800）
 *
 * 纯函数：不碰 three.js，不碰 DOM，可直接单元测试（测试用 UTC 锚点构造，
 * 在任何时区的机器上结果一致，见 scripts/verify-broadcast-schedule.mjs）。
 */

export const BROADCAST_START_HOUR = 23; // 23:00（Asia/Shanghai 挂钟）
export const BROADCAST_END_HOUR = 1; // 01:00（次日，Asia/Shanghai 挂钟）
export const SHOW_DURATION_SEC = 1800; // 30 分钟
export const SHOW_COUNT = 4;

/** Asia/Shanghai = UTC+8，全年恒定（中国无夏令时）。 */
export const SHANGHAI_UTC_OFFSET_SEC = 8 * 3600;

/** 当日 23:00:00（Asia/Shanghai）在"秒 of day"上的起点。 */
const BROADCAST_START_SEC_OF_DAY = BROADCAST_START_HOUR * 3600; // 82800
/** 广播窗总长：4 × 1800 = 7200 秒（23:00:00–01:00:00，跨零点）。 */
const BROADCAST_WINDOW_SEC = SHOW_COUNT * SHOW_DURATION_SEC;

export interface BroadcastState {
  /** off-air = 非广播时段；live = 广播时段 */
  mode: 'off-air' | 'live';
  /** 场次索引（0..3），off-air 时为 null */
  showIndex: number | null;
  /** 场内秒数（0..1800），off-air 时为 null */
  showSec: number | null;
}

/**
 * 把任意时刻映射到广播状态（Asia/Shanghai 挂钟）。
 * @param now 任意时区下的 Date；取其 unix 时间戳换算上海挂钟
 */
export function broadcastStateAt(now: Date): BroadcastState {
  return broadcastStateAtMs(now.getTime());
}

/**
 * 便捷函数：从 unix ms 取广播状态。
 *
 * 换算：上海挂钟秒 of day = (unix 秒 + 8h) mod 86400。
 * 次日 00:00–01:00 的 secOfDay ∈ [0, 3600) 落在广播窗尾部，
 * 故从广播起点起的偏移 = (secOfDay − 82800 + 86400) mod 86400。
 */
export function broadcastStateAtMs(nowMs: number): BroadcastState {
  if (!Number.isFinite(nowMs)) {
    return { mode: 'off-air', showIndex: null, showSec: null };
  }
  const secOfDay = ((Math.floor(nowMs / 1000) + SHANGHAI_UTC_OFFSET_SEC) % 86400 + 86400) % 86400;
  const offsetSec = (secOfDay - BROADCAST_START_SEC_OF_DAY + 86400) % 86400;

  // offsetSec ∈ [0, 7199] 即在 23:00–01:00 广播窗内；其余（01:00–23:00）off-air。
  if (offsetSec >= BROADCAST_WINDOW_SEC) {
    return { mode: 'off-air', showIndex: null, showSec: null };
  }

  return {
    mode: 'live',
    showIndex: Math.floor(offsetSec / SHOW_DURATION_SEC),
    showSec: offsetSec % SHOW_DURATION_SEC,
  };
}
