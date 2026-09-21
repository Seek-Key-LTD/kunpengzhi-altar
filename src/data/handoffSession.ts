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

/** 验证 token 是否有效（纯函数） */
export function isHandoffSessionValid(t: HandoffSession, now: number = Date.now()): boolean {
  // 过期检查
  if (now - t.issuedAt > HANDOFF_TOKEN_TTL_MS) return false;
  // token 非空
  if (!t.token || t.token.length < 16) return false;
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
