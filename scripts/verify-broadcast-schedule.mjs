// #19 回归断言：公共正典广播时钟
// 固定时钟断言：22:59:59 / 23:00:00 / 23:17:00 / 23:30:00 / 00:59:59 / 01:00:00

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleTs } from './lib/bundle-ts.mjs';

const [{ broadcastStateAt }] = await bundleTs(['src/data/broadcastSchedule.ts']);

// 构造指定时分秒的 Date（Asia/Shanghai 时区）
// 注意：node 的 Date 用本地时区，这里我们假设本地就是 Asia/Shanghai
function makeDate(hour, minute, second) {
  const d = new Date();
  d.setHours(hour, minute, second, 0);
  return d;
}

test('#19 广播时段：22:59:59 off-air', () => {
  const s = broadcastStateAt(makeDate(22, 59, 59));
  assert.equal(s.mode, 'off-air');
  assert.equal(s.showIndex, null);
  assert.equal(s.showSec, null);
});

test('#19 广播时段：23:00:00 live，场 0，sec=0', () => {
  const s = broadcastStateAt(makeDate(23, 0, 0));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 0);
  assert.equal(s.showSec, 0);
});

test('#19 广播时段：23:17:00 live，场 0，sec=1020', () => {
  const s = broadcastStateAt(makeDate(23, 17, 0));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 0);
  assert.equal(s.showSec, 17 * 60); // 1020
});

test('#19 广播时段：23:30:00 live，场 1，sec=0', () => {
  const s = broadcastStateAt(makeDate(23, 30, 0));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 1);
  assert.equal(s.showSec, 0);
});

test('#19 广播时段：00:59:59 live，场 3，sec=1799', () => {
  const s = broadcastStateAt(makeDate(0, 59, 59));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 3);
  assert.equal(s.showSec, 1799);
});

test('#19 广播时段：01:00:00 off-air', () => {
  const s = broadcastStateAt(makeDate(1, 0, 0));
  assert.equal(s.mode, 'off-air');
  assert.equal(s.showIndex, null);
  assert.equal(s.showSec, null);
});
