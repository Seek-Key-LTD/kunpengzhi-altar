/**
 * #23 Discord 坛外回廊：外链入口工具
 *
 * 纯函数：不碰 DOM、不碰 three.js，可直接单元测试。
 * Discord Bot 由服务端维护，前端只提供克制的外链入口。
 */

/** Discord 邀请链接（唯一入口） */
export const DISCORD_INVITE_URL = 'https://discord.gg/altar';

/** 频道定义（纯数据） */
export const DISCORD_CHANNELS = {
  /** 公告 */
  announcements: 'announcements',
  /** 共观 */
  watch: 'watch',
  /** 仪式后回廊 */
  after: 'after-ritual',
  /** 投稿/策展 */
  submit: 'submit',
  /** 导演运维 */
  ops: 'ops',
} as const;

/** 构造频道链接（纯函数） */
export function discordChannelUrl(channel: keyof typeof DISCORD_CHANNELS): string {
  return `${DISCORD_INVITE_URL}/${DISCORD_CHANNELS[channel]}`;
}
