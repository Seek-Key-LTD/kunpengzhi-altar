/**
 * #7 · T1 能力三态判别 —— 对**真模块** `src/three/webglCapability.ts` 的代码级断言。
 *
 * 用 esbuild 把纯域模块打到临时 JS 后 import（与 `verify-ritual-timeline.mjs` 同手法），
 * 断言的是**真源码**而非抄一份常量：
 *   · 三态真值表（§1.3 边界）：无上下文 → none；软栅格 → degraded；
 *     无 WebGL2 有 WebGL1 → degraded（**不是** none）；WebGL2 非软栅格 → full。
 *   · 判别联合的字面量形状（tier / reason 字段逐字一致）。
 *   · 软栅格名识别（SwiftShader / llvmpipe / softpipe …）与真机阴性对照。
 *   · 无 DOM（Node）时探测退到 none，且**不抛错**。
 *
 * ⚠️ 独立命令，**不在** `npm test` 的 13 套里（同 `capture.mjs` 之训：只在需要时单独跑）。
 *
 * 运行：node scripts/assert-webgl-capability.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, `✗ ${msg}`); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, `✗ ${msg}`); checks++; };

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild（vite 内置依赖）——无法对真模块断言');

const tmp = mkdtempSync(resolve(tmpdir(), 'webglcap-'));
let M;
try {
  execFileSync(esbuildBin, [
    resolve(ROOT, 'src/three/webglCapability.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'webglCapability.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  M = await import(pathToFileURL(resolve(tmp, 'webglCapability.mjs')).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const { classifyWebglCapability, isSoftwareRenderer, probeWebglCapability, detectWebglTier } = M;

// ── 1. 导出面：三态判别所需函数必须在（缺一个即实现不完整）────────────
for (const fn of ['classifyWebglCapability', 'isSoftwareRenderer', 'probeWebglCapability', 'detectWebglTier']) {
  eq(typeof M[fn], 'function', `必须导出 ${fn}()`);
}

// ── 2. 三态真值表（§1.3 边界）───────────────────────────────────────
const table = [
  [{ webgl2: true,  webgl1: true,  software: false }, { tier: 'full' },                        'WebGL2 + 非软栅格 ⇒ full'],
  [{ webgl2: true,  webgl1: false, software: false }, { tier: 'full' },                        'WebGL2 在 ⇒ full（webgl1 读数不参与）'],
  [{ webgl2: false, webgl1: true,  software: false }, { tier: 'degraded', reason: 'no-webgl2' }, '无 WebGL2 有 WebGL1 ⇒ degraded/no-webgl2（不是 none）'],
  [{ webgl2: true,  webgl1: true,  software: true  }, { tier: 'degraded', reason: 'software' },  '软栅格 ⇒ degraded/software（仍渲染）'],
  [{ webgl2: false, webgl1: true,  software: true  }, { tier: 'degraded', reason: 'software' },  '软栅格 + 仅 WebGL1 ⇒ degraded'],
  [{ webgl2: false, webgl1: false, software: false }, { tier: 'none', reason: 'no-context' },   '一个上下文都没有 ⇒ none/no-context'],
  [{ webgl2: false, webgl1: false, software: true  }, { tier: 'none', reason: 'no-context' },   '无上下文优先于软栅格 ⇒ none']
];
for (const [probe, want, msg] of table) {
  eq(JSON.stringify(classifyWebglCapability(probe)), JSON.stringify(want), msg);
}

// ── 3. 判别联合形状：任何输出都必须是三态之一，且字段不多不少 ──────────
const shapes = table.map(([p]) => classifyWebglCapability(p));
for (const t of shapes) {
  ok(['full', 'degraded', 'none'].includes(t.tier), `tier 必须是三态之一（实测 ${t.tier}）`);
  if (t.tier === 'full') {
    eq(Object.keys(t).length, 1, 'full 档只带 tier 字段（不得夹带 reason）');
  } else {
    eq(Object.keys(t).sort().join(','), 'reason,tier', `${t.tier} 档必须恰带 tier + reason`);
  }
}
for (const t of shapes.filter((s) => s.tier === 'degraded')) {
  ok(['no-webgl2', 'software'].includes(t.reason), `degraded.reason 必须在枚举内（实测 ${t.reason}）`);
}
for (const t of shapes.filter((s) => s.tier === 'none')) {
  ok(['no-context', 'context-lost'].includes(t.reason), `none.reason 必须在枚举内（实测 ${t.reason}）`);
}
// 'context-lost' 只由运行时事件给出 —— 探测路径**永不**产出它（否则会误换页）。
ok(
  shapes.every((s) => !(s.tier === 'none' && s.reason === 'context-lost')),
  '静态探测不得产出 context-lost（该档只由 webglcontextlost 事件给出）'
);

// ── 4. 软栅格名识别 ─────────────────────────────────────────────────
const softwareNames = [
  'Google SwiftShader',
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
  'llvmpipe (LLVM 15.0.7, 256 bits)',
  'softpipe',
  'Microsoft Basic Render Driver'
];
const hardwareNames = [
  'Apple M2',
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
  'AMD Radeon Pro 5500M OpenGL Engine',
  'NVIDIA GeForce RTX 3060/PCIe/SSE2'
];
for (const n of softwareNames) ok(isSoftwareRenderer(n), `软栅格名必须判为 software：「${n.slice(0, 48)}」`);
for (const n of hardwareNames) ok(!isSoftwareRenderer(n), `真机渲染器不得判为 software：「${n.slice(0, 48)}」`);
ok(!isSoftwareRenderer(''), '空渲染器名不得判为 software（未知 ≠ 软栅格）');
ok(!isSoftwareRenderer(null), '非字串渲染器名不得抛错，且判为非软栅格');
ok(!isSoftwareRenderer(undefined), 'undefined 渲染器名不得抛错，且判为非软栅格');

// ── 5. 无 DOM 时：探测退到 none 且**不抛错**（SSR / Node 侧安全）───────
let probeNoDom = null;
let threw = false;
try {
  probeNoDom = probeWebglCapability(null);
} catch {
  threw = true;
}
ok(!threw, '无 DOM 探测不得抛错');
eq(JSON.stringify(probeNoDom), JSON.stringify({ webgl2: false, webgl1: false, software: false }), '无 DOM 探测读数必须全 false');
eq(detectWebglTier(null).tier, 'none', '无 DOM 时 detectWebglTier() 必须落到 none（换静默层）');
eq(detectWebglTier(null).reason, 'no-context', '无 DOM 时 reason 必须是 no-context');

console.log(
  `webgl-capability: 3-tier discrimination verified on real module (${table.length} truth-table rows, ` +
    `${softwareNames.length + hardwareNames.length + 3} renderer names, no-DOM fallback); ${checks} assertions passed.`
);
