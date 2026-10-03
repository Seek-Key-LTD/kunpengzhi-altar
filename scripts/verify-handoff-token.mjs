// #22 handoff token 单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleTs } from './lib/bundle-ts.mjs';

const [{ isHandoffSessionValid, handoffUrl, HANDOFF_TOKEN_TTL_MS }] = await bundleTs([
  'src/data/handoffSession.ts'
]);

const now = Date.now();

test('#22 有效 token 通过验证', () => {
  const t = {
    token: 'a'.repeat(32),
    issuedAt: now,
    layer: 3,
    yaw: 1.5,
    mode: 'single',
  };
  assert.ok(isHandoffSessionValid(t, now));
});

test('#22 过期 token 拒绝', () => {
  const t = {
    token: 'a'.repeat(32),
    issuedAt: now - HANDOFF_TOKEN_TTL_MS - 1000,
    layer: 3,
    yaw: 1.5,
    mode: 'single',
  };
  assert.ok(!isHandoffSessionValid(t, now));
});

test('#22 短 token 拒绝', () => {
  const t = {
    token: 'short',
    issuedAt: now,
    layer: 3,
    yaw: 1.5,
    mode: 'single',
  };
  assert.ok(!isHandoffSessionValid(t, now));
});

test('#22 handoff URL 构造', () => {
  const t = {
    token: 'abc123',
    issuedAt: now,
    layer: 3,
    yaw: 1.5,
    mode: 'cardboard',
  };
  const url = handoffUrl(t);
  assert.ok(url.startsWith('/handoff?'));
  assert.ok(url.includes('token=abc123'));
  assert.ok(url.includes('layer=3'));
  assert.ok(url.includes('mode=cardboard'));
});

// ── 健壮性加固回归（五道闸）──────────────────────────────────────────

test('#22 加固：未来签发时间拒收（旧实现永不过期漏洞）', () => {
  const t = {
    token: 'a'.repeat(32),
    issuedAt: now + 60 * 60 * 1000, // 比现在晚一小时
    layer: 3,
    yaw: 1.5,
    mode: 'single',
  };
  assert.ok(!isHandoffSessionValid(t, now));
});

test('#22 加固：yaw/layer 为 NaN 或 Infinity 拒收', () => {
  const base = { token: 'a'.repeat(32), issuedAt: now, mode: 'single' };
  assert.ok(!isHandoffSessionValid({ ...base, layer: NaN, yaw: 1.5 }));
  assert.ok(!isHandoffSessionValid({ ...base, layer: 3, yaw: Infinity }));
  assert.ok(!isHandoffSessionValid({ ...base, layer: 3, yaw: NaN }));
});

test('#22 加固：layer 负数或非整数拒收', () => {
  const base = { token: 'a'.repeat(32), issuedAt: now, yaw: 1.5, mode: 'single' };
  assert.ok(!isHandoffSessionValid({ ...base, layer: -1 }));
  assert.ok(!isHandoffSessionValid({ ...base, layer: 1.5 }));
});

test('#22 加固：mode 非法值拒收', () => {
  const base = { token: 'a'.repeat(32), issuedAt: now, layer: 3, yaw: 1.5 };
  assert.ok(!isHandoffSessionValid({ ...base, mode: 'vr' }));
  assert.ok(!isHandoffSessionValid({ ...base, mode: undefined }));
});

test('#22 加固：非对象/缺字段载荷拒收，不抛错', () => {
  assert.ok(!isHandoffSessionValid(null, now));
  assert.ok(!isHandoffSessionValid('token-string', now));
  assert.ok(!isHandoffSessionValid({}, now));
  assert.ok(!isHandoffSessionValid({ token: 'a'.repeat(32), issuedAt: now, layer: 3, yaw: 1.5 }, now));
});

// ── 构造侧闸门（第六道）：handoffUrl 拒绝几何字段脏值 ───────────────────

test('#22 加固：handoffUrl 对 NaN/Infinity 几何字段抛 RangeError，不产出脏 URL', () => {
  const base = { token: 'a'.repeat(32), issuedAt: now, mode: 'single' };
  assert.throws(() => handoffUrl({ ...base, layer: NaN, yaw: 1.5 }), RangeError);
  assert.throws(() => handoffUrl({ ...base, layer: 3, yaw: Infinity }), RangeError);
  assert.throws(() => handoffUrl({ ...base, layer: 3, yaw: NaN }), RangeError);
  assert.throws(() => handoffUrl({ ...base, layer: -Infinity, yaw: 1.5 }), RangeError);
});

test('#22 加固：handoffUrl 对非对象载荷抛 TypeError', () => {
  assert.throws(() => handoffUrl(null), TypeError);
  assert.throws(() => handoffUrl('junk'), TypeError);
  assert.throws(() => handoffUrl(undefined), TypeError);
});

test('#22 加固：handoffUrl 合法几何字段（含 0 层、负 yaw）照常构造', () => {
  const url = handoffUrl({ token: 'a'.repeat(32), issuedAt: now, layer: 0, yaw: -0.5, mode: 'cardboard' });
  assert.ok(url.startsWith('/handoff?'));
  assert.ok(url.includes('layer=0'));
  assert.ok(url.includes('mode=cardboard'));
});
