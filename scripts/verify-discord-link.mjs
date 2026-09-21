// #23 Discord 外链入口单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discordChannelUrl, DISCORD_CHANNELS } from '../src/data/discordLink.ts';

test('#23 频道链接构造', () => {
  const url = discordChannelUrl('announcements');
  assert.equal(url, 'https://discord.gg/altar/announcements');
});

test('#23 频道定义完整', () => {
  assert.equal(Object.keys(DISCORD_CHANNELS).length, 5);
  assert.ok('announcements' in DISCORD_CHANNELS);
  assert.ok('watch' in DISCORD_CHANNELS);
  assert.ok('after' in DISCORD_CHANNELS);
  assert.ok('submit' in DISCORD_CHANNELS);
  assert.ok('ops' in DISCORD_CHANNELS);
});
