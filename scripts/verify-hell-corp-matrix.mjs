/**
 * 阴司重工央企矩阵 · 数据契约验收
 *
 * 对 HELL_CORP_MATRIX 做结构断言：
 *   1. 每条都有 code / name / business / slogan 四字段
 *   2. code 格式正确（00行 / 01局 / 02所 / 03厂 …）
 *   3. 无重复 code
 *   4. slogan 非空、不含空串
 *   5. 总数 ≥ 10（六道轮回 × 重工谱系）
 *
 * 运行：node scripts/verify-hell-corp-matrix.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, `✗ ${msg}`); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, `✗ ${msg}`); checks++; };

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild');

const tmp = mkdtempSync(resolve(tmpdir(), 'hellcorp-'));
let T;
try {
  execFileSync(esbuildBin, [
    resolve(ROOT, 'src/data/hellCorpMatrix.ts'),
    '--bundle', '--format=esm',
    `--outfile=${resolve(tmp, 'hellcorp.mjs')}`
  ], { stdio: 'pipe' });
  T = await import(`${tmp}/hellcorp.mjs`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const matrix = T.HELL_CORP_MATRIX;
ok(Array.isArray(matrix), 'HELL_CORP_MATRIX 是数组');
ok(matrix.length >= 10, `矩阵总数 ≥ 10（实际 ${matrix.length}）`);

const codes = new Set();
for (const item of matrix) {
  // 四字段齐全
  ok(typeof item.code === 'string' && item.code.length > 0, `${item.code ?? '?'} 有 code`);
  ok(typeof item.name === 'string' && item.name.length > 0, `${item.code} 有 name`);
  ok(typeof item.business === 'string' && item.business.length > 0, `${item.code} 有 business`);
  ok(typeof item.slogan === 'string' && item.slogan.length > 0, `${item.code} 有 slogan`);

  // code 格式：两位数字 + 中文后缀（行/局/所/厂/舶/港/重/精/院/保）
  ok(/^\d{2}[行局所厂舶港重精院保]$/.test(item.code), `${item.code} code 格式正确`);

  // 无重复
  ok(!codes.has(item.code), `${item.code} 无重复`);
  codes.add(item.code);
}

// 首条必须是 00行（天地银行总行）
eq(matrix[0].code, '00行', '首条是 00行 天地银行总行');
ok(matrix[0].name.includes('天地银行'), '00行 是中国天地银行');

// slogan 必须有诗意或机关术感
for (const item of matrix) {
  ok(item.slogan.length >= 8, `${item.code} slogan 长度 ≥ 8（实际 ${item.slogan.length}）`);
}

console.log(`✓ hellCorpMatrix · ${checks} 断言通过 · 矩阵 ${matrix.length} 条`);
