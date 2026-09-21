// #22 handoff token 单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHandoffTokenValid, handoffUrl, HANDOFF_TOKEN_TTL_MS } from '../src/data/handoffToken.ts';

const now = Date.now();

test('#22 有效 token 通过验证', () => {
  const t = {
    token: 'a'.repeat(32),
    issuedAt: now,
    layer: 3,
    yaw: 1.5,
    mode: 'single',
  };
  assert.ok(isHandoffTokenValid(t, now));
});

test('#22 过期 token 拒绝', () => {
  const t = {
    token: 'a'.repeat(32),
    issuedAt: now - HANDOFF_TOKEN_TTL_MS - 1000,
    layer: 3,
    yaw: 1.5,
    mode: 'single',
  };
  assert.ok(!isHandoffTokenValid(t, now));
});

test('#22 短 token 拒绝', () => {
  const t = {
    token: 'short',
    issuedAt: now,
    layer: 3,
    yaw: 1.5,
    mode: 'single',
  };
  assert.ok(!isHandoffTokenValid(t, now));
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
