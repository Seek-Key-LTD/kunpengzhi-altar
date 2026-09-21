/**
 * #19 公共正典广播时钟
 *
 * 每晚 23:00–01:00 连播四场 1800 秒正典：
 *   场 1: 23:00:00 – 23:30:00
 *   场 2: 23:30:00 – 24:00:00 (= 00:00:00)
 *   场 3: 00:00:00 – 00:30:00
 *   场 4: 00:30:00 – 01:00:00
 *
 * 输入：可信 Asia/Shanghai 时间（Date 或 unix ms）
 * 输出：off-air / live + 场次索引（0..3）+ 场内秒数（0..1800）
 *
 * 纯函数：不碰 three.js，不碰 DOM，可直接单元测试。
 */

export const BROADCAST_START_HOUR = 23; // 23:00
export const BROADCAST_END_HOUR = 1; // 01:00（次日）
export const SHOW_DURATION_SEC = 1800; // 30 分钟
export const SHOW_COUNT = 4;

export interface BroadcastState {
  /** off-air = 非广播时段；live = 广播时段 */
  mode: 'off-air' | 'live';
  /** 场次索引（0..3），off-air 时为 null */
  showIndex: number | null;
  /** 场内秒数（0..1800），off-air 时为 null */
  showSec: number | null;
}

/**
 * 把任意时刻映射到广播状态。
 * @param now Date（Asia/Shanghai 时区）
 */
export function broadcastStateAt(now: Date): BroadcastState {
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();

  // 当日从 0 点起的秒数
  const secOfDay = hour * 3600 + minute * 60 + second;

  // 广播时段：23:00:00 – 01:00:00
  //   当日 23:00:00 = 82800
  //   次日 01:00:00 = 90000（= 25:00:00）
  // 我们把"当日 23:00 到次日 01:00"映射到 secOfDay ∈ [82800, 90000]
  // 但 secOfDay 最大 86399，所以次日 00:00–01:00 是 secOfDay ∈ [0, 3600]

  // 判断是否在广播时段
  let broadcastStartSec: number; // 当日 23:00 的 secOfDay

  // 如果现在是 23:00–23:59，广播时段从当日 23:00 到次日 01:00
  // 如果现在是 00:00–00:59，广播时段从昨日 23:00 到今日 01:00
  // 其他时间 off-air

  if (hour >= BROADCAST_START_HOUR) {
    // 当日 23:00 开始
    broadcastStartSec = BROADCAST_START_HOUR * 3600; // 82800
  } else if (hour < BROADCAST_END_HOUR) {
    // 次日 01:00 结束（即今日 00:00–00:59 仍在广播）
    broadcastStartSec = -3600; // 昨日 23:00 = 86400 - 3600 = 82800，但我们用相对值
  } else {
    // 1:00–22:59 off-air
    return { mode: 'off-air', showIndex: null, showSec: null };
  }

  // 计算从广播开始到现在的偏移秒数
  let offsetSec: number;
  if (hour >= BROADCAST_START_HOUR) {
    offsetSec = secOfDay - broadcastStartSec;
  } else {
    // 次日：从昨日 23:00 到现在 = 昨日剩余时间 + 今日已过时间
    offsetSec = (86400 - broadcastStartSec) + secOfDay;
    // broadcastStartSec = -3600，所以 86400 - (-3600) = 90000
    // 不对，让我重新算
    offsetSec = (86400 - 82800) + secOfDay; // 昨日剩余 3600 秒 + 今日已过 secOfDay
  }

  // 判断是否在广播时段内
  if (offsetSec < 0 || offsetSec > SHOW_COUNT * SHOW_DURATION_SEC) {
    return { mode: 'off-air', showIndex: null, showSec: null };
  }

  // 计算场次索引和场内秒数
  const showIndex = Math.floor(offsetSec / SHOW_DURATION_SEC);
  const showSec = offsetSec % SHOW_DURATION_SEC;

  return { mode: 'live', showIndex, showSec };
}

/**
 * 便捷函数：从 unix ms 取广播状态
 */
export function broadcastStateAtMs(nowMs: number): BroadcastState {
  return broadcastStateAt(new Date(nowMs));
}
