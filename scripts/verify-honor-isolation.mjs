/**
 * 荣誉层隔离验收 —— Gitea #6 · T9。
 *
 * 静态 import-graph 断言（只读文件系统，无浏览器）：
 *   ① 公共入口（`src/App.tsx` / `src/three/**` / `src/audio/**`）**运行时不可达**
 *      `src/honor/aggregate.ts`、`src/honor/fixture.ts`、`src/director/honorAdmin.ts`；
 *   ② 公共入口**不 import 任何 `src/honor/**`**（更严：连 `import type` 也不许）；
 *   ③ `src/director/honorAdmin.ts` **仅被 `src/director/**` 引用**；
 *   ④ `src/honor/types.ts` **零运行时导出**（打包后命名空间为空）；
 *   ⑤ 字面量类型锁死：`transferable: false`、`vacantApex: true`、`seatDomainSize: 49`；
 *   ⑥ `aggregate.ts` 不 import `three` / 浏览器 API；与 #5 lazy 隔离一致。
 *
 * 运行：node scripts/verify-honor-isolation.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, relative, dirname as pdir } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };
const log = (m) => console.log(`   · ${m}`);

const rel = (abs) => relative(ROOT, abs).split('\\').join('/');

function walk(dirAbs) {
  const out = [];
  for (const name of readdirSync(dirAbs)) {
    const abs = resolve(dirAbs, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs));
    else if (/\.(ts|tsx)$/.test(name)) out.push(abs);
  }
  return out;
}

const SRC = resolve(ROOT, 'src');
const ALL = walk(SRC);

// ── import 抽取 ────────────────────────────────────────────────────────
const RE_FROM = /(^|\n)[\t ]*(import|export)\b([ \t]+type\b)?[\s\S]*?\bfrom[ \t]*['"]([^'"]+)['"]/g;
const RE_SIDE = /(^|\n)[\t ]*import[ \t]*['"]([^'"]+)['"]/g;
const RE_DYN = /\bimport[ \t]*\([ \t]*['"]([^'"]+)['"]/g;
function extractImports(src) {
  const out = [];
  let m;
  RE_FROM.lastIndex = 0;
  while ((m = RE_FROM.exec(src))) out.push({ spec: m[4], typeOnly: Boolean(m[3]) });
  RE_SIDE.lastIndex = 0;
  while ((m = RE_SIDE.exec(src))) out.push({ spec: m[2], typeOnly: false });
  RE_DYN.lastIndex = 0;
  while ((m = RE_DYN.exec(src))) out.push({ spec: m[1], typeOnly: false });
  return out;
}

function resolveSpec(fromAbs, spec) {
  if (!spec.startsWith('.')) return null; // 裸模块（three/react…）不入图
  const base = resolve(pdir(fromAbs), spec);
  const cands = [base, base + '.ts', base + '.tsx', resolve(base, 'index.ts'), resolve(base, 'index.tsx')];
  for (const c of cands) { try { if (statSync(c).isFile()) return c; } catch { /* next */ } }
  return null;
}

// fileAbs -> [{spec,typeOnly}]
const importsOf = new Map();
for (const abs of ALL) importsOf.set(abs, extractImports(readFileSync(abs, 'utf8')));

const FORBIDDEN = [
  resolve(ROOT, 'src/honor/aggregate.ts'),
  resolve(ROOT, 'src/honor/fixture.ts'),
  resolve(ROOT, 'src/director/honorAdmin.ts')
];

// ── 公共入口根 ──────────────────────────────────────────────────────────
const PUBLIC_ROOTS = [
  resolve(ROOT, 'src/App.tsx'),
  ...walk(resolve(ROOT, 'src/three')),
  ...walk(resolve(ROOT, 'src/audio'))
].filter((p) => ALL.includes(p));

console.log('\n══ #6 荣誉层隔离 · 静态取证 ══\n');
ok(PUBLIC_ROOTS.length >= 3, `公共入口根已解析（${PUBLIC_ROOTS.length} 个：App.tsx + three/** + audio/**）`);

// ── ① 运行时可达集（只跟非 type-only 的相对 import）───────────────────────
console.log('[①] 公共入口运行时不可达管理面模块');
const reachable = new Set();
const stack = [...PUBLIC_ROOTS];
while (stack.length) {
  const cur = stack.pop();
  if (reachable.has(cur)) continue;
  reachable.add(cur);
  for (const imp of importsOf.get(cur) ?? []) {
    if (imp.typeOnly) continue; // import type 编译期擦除，不算运行时可达
    const to = resolveSpec(cur, imp.spec);
    if (to && !reachable.has(to)) stack.push(to);
  }
}
const reachedForbidden = FORBIDDEN.filter((f) => reachable.has(f)).map(rel);
eq(reachedForbidden.length, 0, `公共入口运行时不可达 ${FORBIDDEN.map(rel).join(' / ')}（实测：${reachedForbidden.length ? reachedForbidden.join(',') : '无'}）`);

// ── ② 公共入口不 import 任何 honor（更严，含 import type）─────────────────
console.log('[②] 公共入口零 honor 依赖');
const honorImports = [];
for (const root of PUBLIC_ROOTS) {
  for (const imp of importsOf.get(root) ?? []) {
    if (imp.spec.includes('honor')) honorImports.push(`${rel(root)} → ${imp.spec}`);
  }
}
eq(honorImports.length, 0, `公共入口根不 import 任何 honor 路径（实测：${honorImports.length ? honorImports.join(', ') : '无'}）`);

// ── ③ honorAdmin 仅被 src/director/** 引用 ───────────────────────────────
console.log('[③] honorAdmin 归属 director');
const adminAbs = resolve(ROOT, 'src/director/honorAdmin.ts');
const adminImporters = [];
for (const [abs, imps] of importsOf) {
  for (const imp of imps) {
    const to = resolveSpec(abs, imp.spec);
    if (to === adminAbs) adminImporters.push(rel(abs));
  }
}
const badImporters = adminImporters.filter((f) => !f.startsWith('src/director/'));
eq(badImporters.length, 0, `honorAdmin 仅被 src/director/** 引用（越界引用：${badImporters.length ? badImporters.join(',') : '无'}）`);
ok(adminImporters.every((f) => f.startsWith('src/director/')), 'honorAdmin 引用方全部落在 src/director/**');
log(`honorAdmin 当前引用方：${adminImporters.length ? adminImporters.join(', ') : '（暂无，适配器待接线）'}`);

// ── ④ types.ts 零运行时导出 ──────────────────────────────────────────────
console.log('[④] types.ts 零运行时导出');
const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild —— 无法对真模块断言');
const tmp = mkdtempSync(resolve(tmpdir(), 'honor-iso-'));
let TYPES;
try {
  execFileSync(esbuildBin, [
    resolve(ROOT, 'src/honor/types.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'types.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  TYPES = await import(pathToFileURL(resolve(tmp, 'types.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
eq(Object.keys(TYPES).length, 0, `types.ts 打包后零运行时导出（实测导出键 ${Object.keys(TYPES).length} 个）`);

// ── ⑤ 字面量类型锁死 + 源码纪律 ───────────────────────────────────────────
console.log('[⑤] 字面量类型锁死');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const typesSrc = strip(readFileSync(resolve(ROOT, 'src/honor/types.ts'), 'utf8'));
const pvSrc = strip(readFileSync(resolve(ROOT, 'src/honor/publicView.ts'), 'utf8'));
ok(/readonly\s+transferable\s*:\s*false\s*;/.test(typesSrc), 'types.ts: `transferable: false` 为字面量类型');
ok(!/readonly\s+transferable\s*:\s*boolean/.test(typesSrc), 'types.ts: 不是 boolean');
ok(/readonly\s+vacantApex\s*:\s*true\s*;/.test(pvSrc), 'publicView.ts: `vacantApex: true` 为字面量类型');
ok(/readonly\s+seatDomainSize\s*:\s*49\s*;/.test(pvSrc), 'publicView.ts: `seatDomainSize: 49` 为字面量类型');
ok(!/export\s+(const|function|class|let|var|default)\b/.test(typesSrc), 'types.ts 无任何运行时导出语句');

// ── ⑥ aggregate 纯函数纪律 + 与 #5 lazy 隔离一致 ─────────────────────────
console.log('[⑥] 纯函数纪律 / #5 一致');
const aggSrc = strip(readFileSync(resolve(ROOT, 'src/honor/aggregate.ts'), 'utf8'));
const aggImports = [...aggSrc.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
ok(!aggImports.some((s) => s.startsWith('three')), 'aggregate.ts 不 import three');
ok(!/document\.|window\.|requestAnimationFrame|HTMLAudioElement/.test(aggSrc), 'aggregate.ts 不触浏览器 API（纯函数）');
const mainSrc = strip(readFileSync(resolve(ROOT, 'src/main.tsx'), 'utf8'));
ok(/lazy\s*\(\s*\(\)\s*=>\s*import\(\s*'\.\/director\/DirectorApp'\s*\)/.test(mainSrc), '#5 隔离仍在：DirectorApp 走 lazy 动态 import');

console.log(
  '\n#6 honor isolation verified (static import-graph)\n' +
  `  公共入口（App.tsx + three/** + audio/**，${PUBLIC_ROOTS.length} 根）运行时不可达 aggregate/fixture/honorAdmin\n` +
  `  公共入口零 honor import；honorAdmin 归属 src/director/**；types.ts 零运行时导出\n` +
  `  字面量锁死：transferable:false / vacantApex:true / seatDomainSize:49\n` +
  `  ${checks} assertions passed.`
);
