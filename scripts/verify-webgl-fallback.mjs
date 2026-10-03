// #7 WebGL 静默降级单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleTs } from './lib/bundle-ts.mjs';

const [{ isWebGLAvailable, renderSilentFallback }] = await bundleTs([
  'src/webgl-fallback.ts'
]);

test('#7 静默降级页不含工程字样', () => {
  const html = renderSilentFallback();
  assert.ok(!html.includes('Rapier'));
  assert.ok(!html.includes('error'));
  assert.ok(!html.includes('debug'));
  assert.ok(!html.includes('WebGL'));
});

test('#7 静默降级页含中文文案', () => {
  const html = renderSilentFallback();
  assert.ok(html.includes('静默'));
});

test('#7 isWebGLAvailable 是函数', () => {
  assert.equal(typeof isWebGLAvailable, 'function');
});
