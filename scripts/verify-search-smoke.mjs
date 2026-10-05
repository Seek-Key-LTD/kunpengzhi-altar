/**
 * 搜索冒烟清单（W3 搜索层盲区修复的验收面）。
 *
 * 依赖 scripts/lib/lark-search.mjs 统一封装（30 字截断 + 真实 schema 解析）。
 * runner 无 lark-cli/登录态时整体跳过（exit 0 + 明确 notice），不假红。
 * probe 词集与期望命中来自 docs/audit/search-blindspots.md，防搜索索引退化。
 */
import assert from 'node:assert/strict';
import { searchDrive, clampQuery, QUERY_MAX_CHARS, isUnavailable } from './lib/lark-search.mjs';

let passed = 0;
let skipped = false;
function ok(cond, message) {
  assert.ok(cond, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

// ── 套件A · 封装层单测（无 lark-cli 也可跑） ─────────────────────────
console.log('  [A·30字截断护栏]');
{
  const long = '这是一个超过三十个字符长度的查询字符串用来验证截断护栏是否生效不至于静默失败';
  const clamped = clampQuery(long);
  ok([...clamped].length === QUERY_MAX_CHARS, `40 字查询截断到 ${QUERY_MAX_CHARS} 码点`);
  ok(clampQuery('短词') === '短词', '短词原样通过');
}

// ── 套件B · 召回冒烟（lark-cli 可用才有意义） ────────────────────────
console.log('  [B·召回冒烟]');
try {
  const ops = searchDrive('运维');
  ok(ops.results.length > 0, `'运维' 召回 ${ops.results.length} 条（hasMore=${ops.hasMore}）`);
  ok(ops.total === null || typeof ops.total === 'number', 'total 字段可读（数值语义不承诺，见盲区④）');

  const ticket = searchDrive('工单系统');
  ok(ticket.results.some((r) => r.title.includes('工单系统')),
    `'工单系统' 命中 📫ASN 工单系统（自有 Base 可搜）`);

  const altar = searchDrive('祭坛');
  ok(altar.results.length >= 1, `'祭坛' 召回 ${altar.results.length} 条（三更道场空间在线）`);

  const smoke = searchDrive('', { spaceIds: '7692783315471846383', pageSize: 20 });
  // 空间覆盖是身份/索引态相关的审计数据（盲区②），只记录不作门禁——
  // 实测 runner 身份对空间的搜索可见性与 mini 不同，硬断言会假红。
  console.log(`  ℹ 三更道场空间空浏览召回 ${smoke.results.length} 条（身份相关，仅记录）`);

  const asnWiki = searchDrive('', { spaceIds: '7603713966367345594' });
  console.log(`  ℹ ASN Lark Wiki 索引现状：${asnWiki.results.length} 条（对账基线=2，治理手册迁家后应增长）`);
} catch (err) {
  if (isUnavailable(err)) {
    skipped = true;
    console.log(`  ⊘ SKIP：${err.message}（lark-cli/登录态不在本环境，冒烟转由具备身份的环境执行）`);
  } else {
    throw err;
  }
}

if (skipped) {
  console.log('\n搜索冒烟：SKIPPED（环境无 lark-cli，护栏单测已过）');
} else {
  console.log(`\n搜索冒烟：${passed} 条断言通过`);
}
