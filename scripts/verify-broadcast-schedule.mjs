// #19 回归断言：公共正典广播时钟
//
// 全部用例以 **UTC 锚点** 构造时间戳（上海挂钟 = UTC + 8h），与执行机器的
// 本地时区无关 —— 在 UTC / UTC+8 / UTC-5 的机器上跑结果必须一致。
// 这组用例同时就是时区回归：修复前实现读 `getHours()`（本地时区），
// 在非 +0800 机器上下面一半以上的断言会翻红。
// 固定时钟断言：22:59:59 / 23:00:00 / 23:17:00 / 23:30:00 / 00:59:59 / 01:00:00（Asia/Shanghai）

import { test } from 'node:test';
import assert from 'node:assert/strict';
// 合并裁决：直导 .ts 在 Node<23.6 无默认类型剥离会 ERR_UNKNOWN_FILE_EXTENSION
// （raccoon 修复项），统一走共享 esbuild 打包；正文仍用 modern main 的断言集，
// 故 bundleTs 解构需同时取 broadcastStateAt 与 broadcastStateAtMs。
import { bundleTs } from './lib/bundle-ts.mjs';

const [{ broadcastStateAt, broadcastStateAtMs }] = await bundleTs(['src/data/broadcastSchedule.ts']);

/** 构造"Asia/Shanghai 挂钟为 hour:minute:second"的时刻（UTC 锚点，时区无关）。 */
function shanghaiDate(hour, minute, second) {
  // Date.UTC 的分量允许越界自动进位，hour-8 为负时自动借位到前一日。
  return new Date(Date.UTC(2026, 9, 3, hour - 8, minute, second, 0));
}

test('#19 广播时段：22:59:59 off-air', () => {
  const s = broadcastStateAt(shanghaiDate(22, 59, 59));
  assert.equal(s.mode, 'off-air');
  assert.equal(s.showIndex, null);
  assert.equal(s.showSec, null);
});

test('#19 广播时段：23:00:00 live，场 0，sec=0', () => {
  const s = broadcastStateAt(shanghaiDate(23, 0, 0));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 0);
  assert.equal(s.showSec, 0);
});

test('#19 广播时段：23:17:00 live，场 0，sec=1020', () => {
  const s = broadcastStateAt(shanghaiDate(23, 17, 0));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 0);
  assert.equal(s.showSec, 17 * 60); // 1020
});

test('#19 广播时段：23:30:00 live，场 1，sec=0', () => {
  const s = broadcastStateAt(shanghaiDate(23, 30, 0));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 1);
  assert.equal(s.showSec, 0);
});

test('#19 广播时段：00:59:59 live，场 3，sec=1799', () => {
  const s = broadcastStateAt(shanghaiDate(0, 59, 59));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 3);
  assert.equal(s.showSec, 1799);
});

test('#19 广播时段：01:00:00 off-air', () => {
  const s = broadcastStateAt(shanghaiDate(1, 0, 0));
  assert.equal(s.mode, 'off-air');
  assert.equal(s.showIndex, null);
  assert.equal(s.showSec, null);
});

test('#19 时区回归：同一 unix ms 与 Date 两条入口结果一致', () => {
  const d = shanghaiDate(23, 17, 0);
  const a = broadcastStateAt(d);
  const b = broadcastStateAtMs(d.getTime());
  assert.deepEqual(a, b);
});

test('#19 时区回归：UTC 挂钟 15:30 = 上海 23:30，非 +0800 机器不得误判 off-air', () => {
  // 修复前实现读浏览器本地时区：本用例在 UTC 机器上旧实现返回 off-air（错）。
  const s = broadcastStateAt(new Date(Date.UTC(2026, 9, 3, 15, 30, 0)));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 1);
  assert.equal(s.showSec, 0);
});

test('#19 时区回归：上海 00:30:00 恰在跨零点边界，场 3 sec=0', () => {
  const s = broadcastStateAt(shanghaiDate(0, 30, 0));
  assert.equal(s.mode, 'live');
  assert.equal(s.showIndex, 3);
  assert.equal(s.showSec, 0);
});

test('#19 健壮性：非有限时间戳回落 off-air，不抛错', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const s = broadcastStateAtMs(bad);
    assert.equal(s.mode, 'off-air');
    assert.equal(s.showIndex, null);
    assert.equal(s.showSec, null);
  }
});
