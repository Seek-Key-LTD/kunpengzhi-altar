// #7 WebGL 无 React 降级页单测
//
// 文案锚点 = 主理人裁定版声幕（src/components/WebglFallback.tsx）：
//   「坛不设形，声自往还。／此刻唯余字与音。／静听即可。」
// 本页与声幕两处必须逐字一致 —— 旧版自拟文案（"静默。此身未具观象之器。"）
// 与正典冲突，已收编；此断言防止回漂。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isWebGLAvailable, renderSilentFallback } from '../src/webgl-fallback.ts';

test('#7 降级页不含工程字样', () => {
  const html = renderSilentFallback();
  assert.ok(!html.includes('Rapier'));
  assert.ok(!html.includes('error'));
  assert.ok(!html.includes('debug'));
  assert.ok(!html.includes('WebGL'));
});

test('#7 降级页文案与声幕层逐字一致（主理人裁定版）', () => {
  const html = renderSilentFallback();
  for (const line of ['坛不设形，声自往还。', '此刻唯余字与音。', '静听即可。']) {
    assert.ok(html.includes(line), `缺正典文案行：「${line}」`);
  }
  // 旧自拟文案不得回漂
  assert.ok(!html.includes('此身未具观象之器'));
});

test('#7 降级页与声幕层文案同源（源码级对账）', () => {
  const tsx = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../src/components/WebglFallback.tsx'),
    'utf-8'
  );
  for (const line of ['坛不设形，声自往还。', '此刻唯余字与音。', '静听即可。']) {
    assert.ok(tsx.includes(line), `声幕层缺「${line}」——两处文案必须同步修改`);
  }
});

test('#7 isWebGLAvailable 是函数', () => {
  assert.equal(typeof isWebGLAvailable, 'function');
});
