/**
 * #22 洞内手机会话交接：handoff session 前端工具
 *
 * 纯函数：不碰 DOM、不碰 three.js，可直接单元测试。
 * 服务端签发短时、一次性、不可猜测的 token；前端只消费。
 */

/** token 有效期：5 分钟 */
export const HANDOFF_TOKEN_TTL_MS = 5 * 60 * 1000;

/** handoff session 载荷（服务端签发，前端只读） */
export interface HandoffSession {
  /** token 字符串（不可猜测） */
  readonly token: string;
  /** 签发时间（unix ms） */
  readonly issuedAt: number;
  /** Rabbit Hole 层索引 */
  readonly layer: number;
  /** 朝向（yaw 弧度） */
  readonly yaw: number;
  /** 观测模式：单屏 / 双眼 */
  readonly mode: 'single' | 'cardboard';
}

/**
 * 验证 token 是否有效（纯函数）。
 *
 * 五道闸，任何一道不过即拒：
 *   1. 载荷形状完整（对象、字段类型齐全）—— handoff 载荷经 URL 传播，
 *      类型标注挡不住运行时脏数据；
 *   2. token 非空且 ≥ 16 字符；
 *   3. 未过期（now − issuedAt ≤ TTL）；
 *   4. **issuedAt 不得来自未来** —— 修复前 `now − issuedAt` 为负时直接放行，
 *      一枚未来时间戳的载荷可以绕过过期检查长期存活；
 *   5. layer / yaw 必须是有限数（NaN/Infinity 流进 `handoffUrl` 会变成
 *      `layer=NaN` / `yaw=NaN`，由消费端解析出脏状态）。
 */
export function isHandoffSessionValid(t: HandoffSession, now: number = Date.now()): boolean {
  // 1) 形状：载荷可能来自反序列化而非类型系统
  if (t === null || typeof t !== 'object') return false;
  if (typeof t.token !== 'string') return false;
  if (typeof t.issuedAt !== 'number' || typeof t.layer !== 'number' || typeof t.yaw !== 'number') {
    return false;
  }
  if (t.mode !== 'single' && t.mode !== 'cardboard') return false;
  // 2) token 非空且长度达标
  if (t.token.length < 16) return false;
  // 3) 过期检查
  if (now - t.issuedAt > HANDOFF_TOKEN_TTL_MS) return false;
  // 4) 未来时间戳拒收（时钟回拨的合法漂移以 TTL 量级兜不住的，一律当脏载荷）
  if (!Number.isFinite(t.issuedAt) || now < t.issuedAt) return false;
  // 5) 几何字段必须是有限数，layer 为非负整数
  if (!Number.isFinite(t.layer) || !Number.isFinite(t.yaw)) return false;
  if (!Number.isInteger(t.layer) || t.layer < 0) return false;
  return true;
}

/** 构造 handoff URL（纯函数） */
export function handoffUrl(t: HandoffSession): string {
  const params = new URLSearchParams({
    token: t.token,
    layer: String(t.layer),
    yaw: t.yaw.toFixed(4),
    mode: t.mode,
  });
  return `/handoff?${params.toString()}`;
}
