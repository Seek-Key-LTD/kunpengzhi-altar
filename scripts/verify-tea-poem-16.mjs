/**
 * 茶史五绝赋 · 十六章数据契约验收
 * 运行：node scripts/verify-tea-poem-16.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild');

const tmp = mkdtempSync(resolve(tmpdir(), 'teapoem-'));
try {
  execFileSync(esbuildBin, [resolve(ROOT, 'src/data/tea_poem_16.ts'), '--bundle', '--format=esm', `--outfile=${resolve(tmp, 'teapoem.mjs')}`], { stdio: 'pipe' });
  const T = await import(`${tmp}/teapoem.mjs`);
  ok(T.TEA_POEM_16_CHAPTERS, '有 TEA_POEM_16_CHAPTERS');
  ok(Array.isArray(T.TEA_POEM_16_CHAPTERS), '是数组');
  eq(T.TEA_POEM_16_CHAPTERS.length, 16, '十六章齐全');
  ok(T.TEA_POEM_PREFACE, '有 TEA_POEM_PREFACE');
  ok(typeof T.TEA_POEM_PREFACE === 'string' && T.TEA_POEM_PREFACE.length > 100, '序足够长');
  for (const ch of T.TEA_POEM_16_CHAPTERS) {
    ok(ch.chapterIndex >= 1 && ch.chapterIndex <= 16, `第 ${ch.chapterIndex} 章 序号在 1–16`);
    ok(typeof ch.title === 'string' && ch.title.length > 0, `第 ${ch.chapterIndex} 章 有标题`);
    ok(Array.isArray(ch.leftColumn) && ch.leftColumn.length > 0, `第 ${ch.chapterIndex} 章 有左栏`);
    ok(Array.isArray(ch.rightColumn) && ch.rightColumn.length > 0, `第 ${ch.chapterIndex} 章 有右栏`);
    ok(typeof ch.rhymeWordLeft === 'string' && ch.rhymeWordLeft.length > 0, `第 ${ch.chapterIndex} 章 有左韵字`);
    ok(typeof ch.rhymeWordRight === 'string' && ch.rhymeWordRight.length > 0, `第 ${ch.chapterIndex} 章 有右韵字`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`✓ tea_poem_16 · ${checks} 断言通过`);
