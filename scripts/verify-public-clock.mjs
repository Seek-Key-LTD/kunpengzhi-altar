// #16 回归断言：公共页必须启动 1800s 五幕正典时间轴（免手势时钟自走）
// 证据：App.tsx 必须调用 altar.startRitual()，不得只调用 presentImmediately()

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

test('#16 公共页启动 startRitual（时钟自走，手势只影响音频）', () => {
  const appSrc = stripComments(readFileSync('src/App.tsx', 'utf8'));

  // 必须调用 startRitual
  assert.match(
    appSrc,
    /altar\.startRitual\(\)/,
    'App.tsx 必须调用 altar.startRitual() 启动 1800s 五幕时间轴'
  );

  // 不得只调用 presentImmediately（公共页不得用直入版跳过时间轴）
  assert.doesNotMatch(
    appSrc,
    /altar\.presentImmediately\(\)/,
    'App.tsx 不得调用 altar.presentImmediately()（公共页必须走 1800s 时间轴）'
  );

  // 不得调用 startDemo（自运维演示循环与公共正典互斥）
  assert.doesNotMatch(
    appSrc,
    /altar\.startDemo\(\)/,
    'App.tsx 不得调用 altar.startDemo()（公共页不走自运维演示循环）'
  );
});
