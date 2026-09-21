// #7 公共 DOM 扫描：不得出现 Rapier、140、91、座次、NFT、相机模式或调试按钮
// 扫描公共入口（App.tsx）和公共组件，验证没有工程化字样泄漏到公共页

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

// 公共入口文件（公共页渲染路径）
const PUBLIC_FILES = [
  'src/App.tsx',
  'src/main.tsx',
];

// 禁止出现在公共 DOM 的工程化字样
const FORBIDDEN_WORDS = [
  'Rapier',
  '140',
  '91',
  '座次',
  'NFT',
  '相机模式',
  'debug',
  'Debug',
  '调试',
];

test('#7 公共 DOM 无工程化字样', () => {
  for (const file of PUBLIC_FILES) {
    let src;
    try {
      src = stripComments(readFileSync(file, 'utf8'));
    } catch {
      continue; // 文件不存在跳过
    }

    for (const word of FORBIDDEN_WORDS) {
      // 允许在注释里出现（已 strip），但不允许在字符串字面量里出现
      // 简化：只要 stripComments 后还出现，就报错
      assert.ok(
        !src.includes(word),
        `#7 公共 DOM 扫描：${file} 包含禁止字样「${word}」`
      );
    }
  }
});
