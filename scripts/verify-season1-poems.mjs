/**
 * 第一季十二期 · 诗词数据契约验收
 * 运行：node scripts/verify-season1-poems.mjs
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

const tmp = mkdtempSync(resolve(tmpdir(), 'season1-'));
try {
  execFileSync(esbuildBin, [resolve(ROOT, 'src/data/season1_poems.ts'), '--bundle', '--format=esm', `--outfile=${resolve(tmp, 'season1.mjs')}`], { stdio: 'pipe' });
  const T = await import(`${tmp}/season1.mjs`);
  ok(T.SEASON1_POEMS, '有 SEASON1_POEMS');
  ok(Array.isArray(T.SEASON1_POEMS), 'SEASON1_POEMS 是数组');
  ok(T.SEASON1_POEMS.length === 12, `十二期齐全（实际 ${T.SEASON1_POEMS.length}）`);
  const ids = new Set();
  for (const s of T.SEASON1_POEMS) {
    ok(typeof s.seasonId === 'string' && s.seasonId.length > 0, `${s.seasonId} 有 seasonId`);
    ok(typeof s.seasonName === 'string' && s.seasonName.length > 0, `${s.seasonId} 有 seasonName`);
    ok(!ids.has(s.seasonId), `${s.seasonId} 无重复`);
    ids.add(s.seasonId);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`✓ season1_poems · ${checks} 断言通过`);
