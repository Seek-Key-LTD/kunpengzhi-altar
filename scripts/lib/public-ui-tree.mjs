/**
 * #7 · 公共 UI 树「判定为本」审计库。
 *
 * ## 为什么存在
 *
 * #4 时代留下三条**代理规则**（点名式）：
 *   `App.tsx` 不得出现 `from './components/'`
 * 它想守的是「**倍速入口无处可挂**」，但用的判据是「组件**名字/目录**」——
 * 而 #7 的静默层恰恰是**公共侧**的纯展示组件，必须进 App ⇒ 代理失真。
 *
 * 名字这条路两头都不通（禁，则误伤合法组件；放白名单，则任何人把带交互的组件
 * 改名成白名单里的名字就绕过去了，且每加一个组件就要回来改一次正则、漏改无从察觉）。
 * 于是改为**判定为本**：不认名字，只认**源码内容** ——
 *
 *   App.tsx 引入的每一个 components/* 文件（连同它在 src/ 内的本地 import 传递闭包），
 *   源码被**真实读取**后逐行扫描；命中交互标记 / 词表即判 fail，并给出 file:line。
 *
 * 这样它是**通用不变量**：将来新增组件**零维护**自动被覆盖，改名也绕不过去。
 *
 * ## 词表不复制
 *
 * 词表从**声明处原文件**解析出来（`qa-audit-public-entry.mjs` 的 `SCAN_WORDS`、
 * `verify-entry-isolation.mjs` 的 `ADMIN_WORDS` / `CONSOLE_MARKERS`），不抄一份 ——
 * 抄一份就等于埋下一份会各自漂移的副本。提取失败直接抛错（fail-closed）。
 *
 * 运行方式：被 `verify-audio-envelope.mjs` / `qa-verify-audio-envelope.mjs`（均在 npm test 内）调用。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const SRC_ROOT = resolve(ROOT, 'src');

/** 词表真源（file → const 名）。改这里等于改判据来源，需极其慎重。 */
const WORD_LIST_SOURCES = [
  { from: 'scripts/qa-audit-public-entry.mjs', name: 'SCAN_WORDS', label: 'SCAN_WORDS' },
  { from: 'scripts/verify-entry-isolation.mjs', name: 'ADMIN_WORDS', label: 'ADMIN_WORDS' },
  { from: 'scripts/verify-entry-isolation.mjs', name: 'CONSOLE_MARKERS', label: 'CONSOLE_MARKERS' }
];

/**
 * 交互标记 —— 「倍速入口」在 React 里能挂上去的一切洞口。
 *
 * 口径：既认 JSX 标签（`<input` …），也认回调属性（`onClick` …）与 `type="range"`，
 * 大小写不敏感（`<Input` / `onclick` 一样是真洞口）。
 */
const INTERACTION_MARKERS = [
  ['<button', /<button/i],
  ['<input', /<input/i],
  ['<select', /<select/i],
  ['<textarea', /<textarea/i],
  ['<form', /<form/i],
  ['onClick', /onClick\b/i],
  ['onChange', /onChange\b/i],
  ['onSubmit', /onSubmit\b/i],
  ['onPointerDown', /onPointerDown\b/i],
  ['onKeyDown', /onKeyDown\b/i],
  ['slider', /slider/i],
  ['type="range"', /type\s*=\s*["']range["']/i]
];

export const readRaw = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

/**
 * 去注释但**保留行号**（注释原地替换为空格，换行一个不丢）。
 *
 * ⚠️ 仓库既有的 `stripComments` 会把注释行整个 `filter` 掉 ⇒ 行号错位，
 *    没法做 file:line 定位（而本审计的核心价值就是「命中在哪一行」），故另写这份。
 * ⚠️ **字符串与 JSX 文本一律保留** —— 上屏文案就住在那儿，正是要扫的东西。
 */
export function stripKeepLines(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let mode = 'code'; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i];
    const d = src[i + 1] ?? '';
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") { mode = 'sq'; out += c; i += 1; continue; }
      if (c === '"') { mode = 'dq'; out += c; i += 1; continue; }
      if (c === '`') { mode = 'tpl'; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += '\n'; i += 1; continue; }
      out += ' '; i += 1; continue;
    }
    if (mode === 'block') {
      if (c === '*' && d === '/') { mode = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' '; i += 1; continue;
    }
    if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
    const closer = mode === 'sq' ? "'" : mode === 'dq' ? '"' : '`';
    if (c === closer) { mode = 'code'; out += c; i += 1; continue; }
    out += c; i += 1;
  }
  return out;
}

const decodeLiteral = (s) => s.replace(/\\(['"`\\nrt])/g, (_m, ch) => (
  ch === 'n' ? '\n' : ch === 'r' ? '\r' : ch === 't' ? '\t' : ch
));

/**
 * 从源文件里**解析**出一个顶层字符串数组常量（如 `const SCAN_WORDS = [ … ]`）。
 *
 * 按「声明」而非「首次出现」定位（`\bconst\s+NAME\s*=\s*\[`），避免被注释/使用处带偏；
 * 括号配对时感知引号与转义。解析不到就抛错 —— 门禁宁可炸，不可静默失守。
 */
export function extractConstArray(fileRel, name) {
  const src = readRaw(fileRel);
  const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*\\[`).exec(src);
  if (!m) throw new Error(`未在 ${fileRel} 中找到 const ${name} 声明 —— 词表真源已移位，门禁无法取证`);
  const open = src.indexOf('[', m.index);
  let depth = 0;
  let i = open;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i += 1; continue;
    }
    if (c === "'" || c === '"') { quote = c; i += 1; continue; }
    if (c === '[') depth += 1;
    else if (c === ']') { depth -= 1; if (depth === 0) break; }
    i += 1;
  }
  if (depth !== 0) throw new Error(`${fileRel} 的 const ${name} 数组未闭合 —— 词表真源破损`);
  const body = stripKeepLines(src.slice(open, i + 1));
  const items = [...body.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)]
    .map((mm) => decodeLiteral(mm[1] ?? mm[2]))
    .filter((s) => s.length > 0);
  if (items.length === 0) throw new Error(`${fileRel} 的 const ${name} 解析出 0 个词 —— 门禁无法取证`);
  return items;
}

/** 从三处真源加载全部敏感词（带来源标签，便于失败时指认）。 */
export function loadWordLists() {
  return WORD_LIST_SOURCES.map((s) => ({ ...s, words: extractConstArray(s.from, s.name) }));
}

const EXT_CANDIDATES = ['', '.tsx', '.ts', '.mjs', '.js', '/index.tsx', '/index.ts'];

/** 把相对 specifier 解析成仓库内 rel 路径；不在 src/ 内或解析不到则返回 null。 */
function resolveLocal(absFile, spec) {
  const base = resolve(dirname(absFile), spec);
  for (const ext of EXT_CANDIDATES) {
    const cand = base + ext;
    if (existsSync(cand) && cand.startsWith(SRC_ROOT + sep)) return relative(ROOT, cand);
  }
  return null;
}

/** 取一份源码里的**本地相对** import（含 `from './x'` / `import './x'` / `import('./x')`）。 */
function localImportsOf(absFile, src) {
  const specs = new Set();
  const re = /(?:from|import)\s*\(?\s*['"](\.[^'"\n]*)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) specs.add(m[1]);
  return [...specs]
    .map((s) => resolveLocal(absFile, s))
    .filter((rel) => rel !== null);
}

/**
 * entry 源码里出现的所有 `./components/…` specifier 原文（去重）。
 *
 * 用途：`roots.length` 应与它的长度相等 —— 一旦不等，说明有一个 components 引用
 * **没能被解析进扫描闭包**（改名、路径写错、新写法未覆盖），门禁必须 fail-closed。
 */
export function componentSpecifiers(entryRel) {
  const src = stripKeepLines(readRaw(entryRel));
  const specs = new Set();
  const re = /(?:from|import)\s*\(?\s*['"](\.\/components\/[^'"\n]*)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) specs.add(m[1]);
  return [...specs];
}

/**
 * 传递闭包：从 entry 出发递归本地 import（只收 src/ 内的文件）。
 * `roots` = entry 直接引入的 `components/*` 文件 —— #7 的静默层落在这一层。
 */
export function collectPublicUiTree(entryRel) {
  const entryAbs = resolve(ROOT, entryRel);
  const direct = localImportsOf(entryAbs, stripKeepLines(readRaw(entryRel)));
  const roots = direct.filter((rel) => rel.startsWith(`src${sep}components${sep}`));
  const closure = new Set([entryRel]);
  const queue = [...roots];
  while (queue.length > 0) {
    const rel = queue.shift();
    if (closure.has(rel)) continue;
    closure.add(rel);
    for (const next of localImportsOf(resolve(ROOT, rel), stripKeepLines(readRaw(rel)))) {
      if (!closure.has(next)) queue.push(next);
    }
  }
  return { entry: entryRel, roots, closure: [...closure] };
}

const lineAt = (src, idx) => src.slice(0, idx).split('\n').length;

const snippetAt = (src, idx, len) => {
  const lineStart = src.lastIndexOf('\n', idx) + 1;
  let lineEnd = src.indexOf('\n', idx);
  if (lineEnd < 0) lineEnd = src.length;
  const raw = src.slice(lineStart, lineEnd).trim();
  return raw.length > 110 ? `${raw.slice(0, 107)}…` : raw;
};

/**
 * 命中扫描。`patterns` 的元素要么是 `[label, RegExp]`，要么是**普通词字符串**
 * （大小写不敏感，与 `qa-audit-public-entry.mjs` 的 `includes(lw)` 口径一致）。
 */
function hitsOf(src, patterns) {
  const hits = [];
  const lower = src.toLowerCase();
  for (const pat of patterns) {
    if (Array.isArray(pat)) {
      const [label, re] = pat;
      const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
      const global = new RegExp(re.source, flags);
      let m;
      while ((m = global.exec(src)) !== null) {
        hits.push({ marker: label, line: lineAt(src, m.index), snippet: snippetAt(src, m.index, m[0].length) });
        if (m.index === global.lastIndex) global.lastIndex += 1;
      }
    } else {
      const needle = pat.toLowerCase();
      let from = 0;
      for (;;) {
        const idx = lower.indexOf(needle, from);
        if (idx < 0) break;
        hits.push({ marker: pat, line: lineAt(src, idx), snippet: snippetAt(src, idx, pat.length) });
        from = idx + pat.length;
      }
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

/**
 * 主入口：对公共 UI 树做「判定为本」审计。
 *
 * @returns {{entry:string, roots:string[], files:string[], wordCount:number,
 *            interactions:Map<string,Array>, words:Map<string,Array>}}
 *          `interactions` / `words` 是 file → 命中数组；**调用方**决定怎么用 ok() 判红。
 */
export function auditPublicUiTree(entryRel = 'src/App.tsx') {
  const tree = collectPublicUiTree(entryRel);
  const wordLists = loadWordLists();
  const interactions = new Map();
  const words = new Map();
  for (const rel of tree.closure) {
    const src = stripKeepLines(readRaw(rel));
    interactions.set(rel, hitsOf(src, INTERACTION_MARKERS));
    const wHits = [];
    for (const list of wordLists) {
      for (const h of hitsOf(src, list.words)) wHits.push({ ...h, source: list.label });
    }
    words.set(rel, wHits);
  }
  return {
    entry: tree.entry,
    roots: tree.roots,
    files: tree.closure,
    wordCount: wordLists.reduce((n, l) => n + l.words.length, 0),
    interactions,
    words
  };
}

/** 把命中数组格式化成给人看的一行（含 file:line）。 */
export function formatHits(rel, hits) {
  if (hits.length === 0) return '（无）';
  const head = hits.slice(0, 4).map((h) => `\`${h.marker}\`@${rel}:${h.line}`);
  const more = hits.length > 4 ? ` …另 ${hits.length - 4} 处` : '';
  const srcLabel = hits[0].source ? `（词表 ${hits[0].source}）` : '';
  return `${head.join(', ')}${more} 首处 "${hits[0].snippet}"${srcLabel}`;
}
