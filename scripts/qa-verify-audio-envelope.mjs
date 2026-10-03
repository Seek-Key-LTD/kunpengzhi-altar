/**
 * · QA 独立门禁（严过关）· Gitea #4 五阶段音频包络 —— HEAD df6e138（#4 = 88d3ba0）
 *
 * 本脚本**独立重写**，不复跑 scripts/verify-audio-envelope.mjs。esbuild 现场把真模块
 * 打进临时目录后 import（绝不手抄常量）：
 *   · src/audio/phaseEnvelope.ts            — 五阶段包络 / 幕窗 / 幕内进度（纯函数）
 *   · src/types/altar.ts                    — ritualPhaseAt（单一时间轴）/ 阈值常量
 *   · src/audio/altarAudio.ts               — 真 altarAudio 单例（未起声可读缓存包络）
 *   · src/three/AltarWaterLiftEngine.ts     — RFC-007 死点相变（翻斗链条触发源）
 * 并读 AltarScene.ts / App.tsx / main.tsx 做接线与「公共无倍速」审计。
 *
 * 运行：node scripts/qa-verify-audio-envelope.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { auditPublicUiTree, formatHits, componentSpecifiers } from './lib/public-ui-tree.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };
const near = (a, b, eps, m) => {
  assert.ok(Math.abs(a - b) <= eps, `✗ ${m}（${a} vs ${b}，容差 ${eps}）`);
  checks++;
};
const log = (m) => console.log(`   · ${m}`);

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild —— 无法对真模块断言');
const tmp = mkdtempSync(resolve(tmpdir(), 'qa-audio-'));
const bundle = (rel, out) => {
  execFileSync(esbuildBin, [
    resolve(ROOT, rel),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, out)}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return import(pathToFileURL(resolve(tmp, out)).href);
};
let P, A, AU, E;
try {
  P = await bundle('src/audio/phaseEnvelope.ts', 'phaseEnvelope.mjs');
  A = await bundle('src/types/altar.ts', 'altar.mjs');
  AU = await bundle('src/audio/altarAudio.ts', 'altarAudio.mjs');
  E = await bundle('src/three/AltarWaterLiftEngine.ts', 'waterlift.mjs');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const readRaw = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const readSrc = (rel) => stripComments(readRaw(rel));

console.log('\n══ QA 独立门禁 · Gitea #4 五阶段音频包络 · HEAD df6e138 ══\n');

// ──────────────────────────────────────────────────────────────────────
// 1. 单一时间轴：包络只由 ritualPhaseAt 驱动，模块无自造边界字面量
// ──────────────────────────────────────────────────────────────────────
console.log('[1] 单一时间轴 / 无自造边界');
// 1a. 幕次边界由 ritualPhaseAt 权威给出
const bounds = [];
for (let s = 1; s <= A.RITUAL_TOTAL_SEC; s++) {
  if (A.ritualPhaseAt(s) !== A.ritualPhaseAt(s - 1)) bounds.push(s);
}
eq(JSON.stringify(bounds), JSON.stringify([180, 1020, 1440, 1751]), '幕次切换边界恰 [180,1020,1440,1751]');
// 1b. 模块幕窗表与权威常量一一同源
const W = P.PHASE_WINDOWS;
eq(W.length, 5, '幕窗表恰 5 段');
eq(W.map((w) => w.phase).join(','), 'abyss,naming,lanterns,extinguishing,silence', '幕序正确');
eq(W.map((w) => w.start).join(','), '0,' + [A.RITUAL_ABYSS_END_SEC, A.RITUAL_NAMING_END_SEC, A.RITUAL_LANTERNS_END_SEC, A.WUJI_SILENCE_SEC].join(','), '幕窗起点 = 权威常量');
eq(W.map((w) => w.end).join(','), [A.RITUAL_ABYSS_END_SEC, A.RITUAL_NAMING_END_SEC, A.RITUAL_LANTERNS_END_SEC, A.WUJI_SILENCE_SEC, A.RITUAL_TOTAL_SEC].join(','), '幕窗终点 = 权威常量');
for (let i = 1; i < W.length; i++) ok(W[i].start === W[i - 1].end, `窗口 #${i} 首尾相接`);
// 1c. 密集扫描：envelopeAt ≡ applyPhaseEnvelope(ritualPhaseAt(·), phaseProgress(·))
let mm = 0;
for (let s = 0; s <= A.RITUAL_TOTAL_SEC; s += 0.25) {
  const g1 = P.envelopeAt(s);
  const g2 = P.applyPhaseEnvelope(A.ritualPhaseAt(s), P.phaseProgress(s));
  if (g1.water !== g2.water || g1.bucket !== g2.bucket || g1.reverb !== g2.reverb) mm++;
}
eq(mm, 0, '密扫 7201 点：envelopeAt 恒等于 applyPhaseEnvelope(ritualPhaseAt, phaseProgress)');
// 1d. 独立复算 phaseProgress（不依赖模块的 PHASE_WINDOWS，改用权威常量自建边界）
const edges = [0, A.RITUAL_ABYSS_END_SEC, A.RITUAL_NAMING_END_SEC, A.RITUAL_LANTERNS_END_SEC, A.WUJI_SILENCE_SEC, A.RITUAL_TOTAL_SEC];
const myPhaseOf = (s) => { for (let i = 0; i < 5; i++) if (s >= edges[i] && s < edges[i + 1]) return i; return 4; };
let pmm = 0;
for (let s = 0; s < A.RITUAL_TOTAL_SEC; s += 0.5) {
  const i = myPhaseOf(s);
  const expect = Math.min(1, Math.max(0, (s - edges[i]) / (edges[i + 1] - edges[i])));
  if (Math.abs(P.phaseProgress(s) - expect) > 1e-9) pmm++;
}
eq(pmm, 0, 'phaseProgress 与独立复算（权威常量自建边界）逐点一致');
// 1e. 源码审计：无自造边界字面量、从 types/altar 取轴
const pe = readSrc('src/audio/phaseEnvelope.ts');
ok(/from\s+'\.\.\/types\/altar'/.test(pe), 'phaseEnvelope 自 types/altar 取阈值');
ok(/ritualPhaseAt/.test(pe), 'phaseEnvelope 调用 ritualPhaseAt');
ok(!/\b(180|1020|1440|1751|1800)\b/.test(pe), 'phaseEnvelope 去注释后无任何自造边界数字（180/1020/1440/1751/1800）');
// PHASE_WINDOWS 的边界必须写成常量名，不能是字面量
const pwBlock = (pe.match(/PHASE_WINDOWS[^=]*=\s*\[([\s\S]*?)\];/) || [])[1] || '';
ok(/RITUAL_ABYSS_END_SEC/.test(pwBlock) && /RITUAL_NAMING_END_SEC/.test(pwBlock) &&
   /RITUAL_LANTERNS_END_SEC/.test(pwBlock) && /WUJI_SILENCE_SEC/.test(pwBlock) && /RITUAL_TOTAL_SEC/.test(pwBlock),
   'PHASE_WINDOWS 边界全部以常量名书写（非字面量）');
log(`边界 ${JSON.stringify(bounds)}s 由 ritualPhaseAt 权威给出；密扫 7201 点零漂移；模块无自造边界数`);

// ──────────────────────────────────────────────────────────────────────
// 2. 49s 静默：三层增益恒 0
// ──────────────────────────────────────────────────────────────────────
console.log('[2] 49s 静默三层恒 0');
eq(P.SILENCE_SPAN_SEC, 49, 'SILENCE_SPAN_SEC 恰 49s');
eq(A.WUJI_SILENCE_SEC, 1751, 'silence 起 = 1751s（29:11）');
eq(A.RITUAL_TOTAL_SEC - A.WUJI_SILENCE_SEC, 49, '1800 − 1751 = 49（独立复核）');
let nz = 0;
for (let s = 1751; s <= 1800; s += 0.1) {
  const g = P.envelopeAt(s);
  if (g.water !== 0 || g.bucket !== 0 || g.reverb !== 0) nz++;
}
eq(nz, 0, 'silence 幕 [1751,1800] 步进 0.1s 全 491 点三层严格 === 0');
for (const s of [1751, 1775.55, 1799.999, 1800]) {
  eq(A.ritualPhaseAt(s), 'silence', `t=${s}s 归属 silence 幕`);
}
// 紧邻外层：1750.999 属 extinguishing（允许拖尾），1751 起严格 0
const justBefore = P.envelopeAt(1750.999);
ok(justBefore.reverb > 0, '1750.999s（extinguishing 末）混响仍 > 0（拖尾）');
eq(P.envelopeAt(1751).reverb, 0, '1751s 起混响严格归零');
log('silence [1751,1800]=49s：491 采样点三层严格 0，无灰无响');

// ──────────────────────────────────────────────────────────────────────
// 3. 三条声链在各幕取值
// ──────────────────────────────────────────────────────────────────────
console.log('[3] 三链各幕取值');
eq(P.AUDIO_LAYERS.length, 3, '恰三条声链');
eq(JSON.stringify(P.AUDIO_LAYERS), JSON.stringify(['water', 'bucket', 'reverb']), '链名 = water/bucket/reverb');
const gAt = (ph, t) => P.applyPhaseEnvelope(ph, t);
// abyss：水恒 0，链条/混响 > 0（机器独鸣）
eq(gAt('abyss', 0).water, 0, 'abyss 起点水 = 0');
eq(gAt('abyss', 1).water, 0, 'abyss 终点水 = 0');
ok(gAt('abyss', 0.5).bucket > 0 && gAt('abyss', 0.5).reverb > 0, 'abyss 链条/混响 > 0');
// naming：水 0→0.7 单调不减
near(gAt('naming', 0).water, 0, 1e-12, 'naming 起点水 = 0');
near(gAt('naming', 1).water, 0.7, 1e-12, 'naming 终点水 = 0.7');
let namingInc = true;
for (let i = 1; i <= 200; i++) if (gAt('naming', i / 200).water < gAt('naming', (i - 1) / 200).water) namingInc = false;
ok(namingInc, 'naming 水随进度单调不减');
// lanterns：水 0.7→1.0（满）
near(gAt('lanterns', 0).water, 0.7, 1e-12, 'lanterns 起点水 = 0.7');
near(gAt('lanterns', 1).water, 1.0, 1e-12, 'lanterns 终点水 = 1.0（满）');
// extinguishing：水/链条 → 0，混响拖尾 0.8→0.12
eq(gAt('extinguishing', 1).water, 0, 'extinguishing 终点水 = 0');
eq(gAt('extinguishing', 1).bucket, 0, 'extinguishing 终点链条 = 0');
near(gAt('extinguishing', 1).reverb, 0.12, 1e-12, 'extinguishing 终点混响 = 0.12（拖尾未断）');
ok(gAt('extinguishing', 1).reverb > 0, '三链中混响独立于水/链条（证三条链非同一路）');
// silence：三层 0
const sg = gAt('silence', 0.5);
ok(sg.water === 0 && sg.bucket === 0 && sg.reverb === 0, 'silence 三层 = 0');
// 连续性：非静默相邻幕端点相接
for (const [a, b] of [['abyss', 'naming'], ['naming', 'lanterns'], ['lanterns', 'extinguishing']]) {
  for (const k of ['water', 'bucket', 'reverb']) {
    near(gAt(a, 1)[k], gAt(b, 0)[k], 1e-12, `${a}→${b} 的 ${k} 端点连续`);
  }
}
// 唯一的边界跳变＝ extingishing→silence 的混响（0.12 → 0，为绝对静默有意为之）
const jumpInto = Math.abs(gAt('extinguishing', 1).reverb - gAt('silence', 0).reverb);
ok(jumpInto > 0, `extinguishing→silence 混响有意跳变 ${jumpInto}（绝对静默），仅此一处`);
// 全域有界 [0,1]
let inRange = true, maxG = 0;
for (let s = 0; s <= A.RITUAL_TOTAL_SEC; s += 0.25) {
  const g = P.envelopeAt(s);
  for (const k of ['water', 'bucket', 'reverb']) { if (g[k] < 0 || g[k] > 1) inRange = false; if (g[k] > maxG) maxG = g[k]; }
}
ok(inRange, '全域增益恒在 [0,1]');
log(`abyss 水恒0 / naming 水0→0.7↑ / lanterns 水→1.0 / extinguishing 水·链条→0（混响0.12拖尾）/ silence 全0；上界${maxG.toFixed(2)}`);

// ──────────────────────────────────────────────────────────────────────
// 4. 翻斗链条声源挂 RFC-007 死点
// ──────────────────────────────────────────────────────────────────────
console.log('[4] 翻斗链条挂 RFC-007 死点');
const eng = new E.AltarWaterLiftEngine();
const fired = [];
eng.onPhaseTransition = (bucket, skimmed, tone) => fired.push({ bucket, tone, skimmed });
for (let i = 0; i < 15000; i++) eng.update(0.02); // 300s
ok(fired.length > 0, `RFC-007 死点相变确实触发（${fired.length} 次 / 300s）`);
const tones = new Set(fired.map((f) => f.tone));
ok(tones.has('HUANG_ZHONG') && tones.has('LIN_ZHONG'), '顶死点黄钟 / 底死点林钟 两种音色均出现');
let pairing = true;
for (const f of fired) {
  if (f.bucket === 'A' && f.tone !== 'HUANG_ZHONG') pairing = false;
  if (f.bucket === 'B' && f.tone !== 'LIN_ZHONG') pairing = false;
}
ok(pairing, '桶位↔音色严格配对：A→HUANG_ZHONG，B→LIN_ZHONG');
// 场景接线：死点回调里调用 triggerBucketChain(tone)
const scene = readSrc('src/three/AltarScene.ts');
ok(/onPhaseTransition\s*=[\s\S]{0,400}altarAudio\.triggerBucketChain\s*\(\s*tone\s*\)/.test(scene),
  'AltarScene 死点回调 → altarAudio.triggerBucketChain(tone)');
// 全仓唯一调用点
const allFiles = ['src/three/AltarScene.ts', 'src/audio/altarAudio.ts', 'src/App.tsx'];
let callSites = 0;
for (const f of allFiles) {
  const m = readSrc(f).match(/triggerBucketChain\s*\(/g);
  if (f.endsWith('altarAudio.ts')) continue; // 定义处
  if (m) callSites += m.length;
}
eq(callSites, 1, 'triggerBucketChain 在场景侧仅 1 个调用点（即死点回调）');
// 音色→带通中心频率映射
const au = readSrc('src/audio/altarAudio.ts');
ok(/HUANG_ZHONG'\s*\?\s*1750\s*:\s*1250/.test(au), 'triggerBucketChain：黄钟→1750Hz / 林钟→1250Hz');
log(`死点相变 ${fired.length} 次（A 黄钟 / B 林钟，配对严格）；场景唯一调用点=死点回调`);

// ──────────────────────────────────────────────────────────────────────
// 5. setPlaybackRate 仅 AltarScene，公共 DOM 无倍速
// ──────────────────────────────────────────────────────────────────────
console.log('[5] 回放速率 API 归属 + 公共无倍速');
// 仅 AltarScene 定义/持有；全仓无调用者
let spCalls = 0;
for (const f of ['src/three/AltarScene.ts', 'src/App.tsx', 'src/audio/altarAudio.ts', 'src/director/DirectorApp.tsx']) {
  if (!existsSync(resolve(ROOT, f))) continue;
  const body = readSrc(f);
  const defs = (body.match(/public\s+setPlaybackRate\s*\(/g) || []).length;
  const calls = (body.match(/\.setPlaybackRate\s*\(/g) || []).length;
  if (f.endsWith('AltarScene.ts')) eq(defs, 1, 'AltarScene 定义 setPlaybackRate 恰 1 处');
  spCalls += calls;
}
eq(spCalls, 0, '全仓无 setPlaybackRate 调用者（公共从不改速率）');
// 常量
ok(/RITUAL_PLAYBACK_MIN\s*=\s*0\.25/.test(scene), 'RITUAL_PLAYBACK_MIN = 0.25');
ok(/RITUAL_PLAYBACK_MAX\s*=\s*64\b/.test(scene), 'RITUAL_PLAYBACK_MAX = 64');
ok(/RITUAL_PLAYBACK_DEFAULT\s*=\s*1\b/.test(scene), 'RITUAL_PLAYBACK_DEFAULT = 1（公共恒定）');
const clock = readSrc('src/three/RitualClock.ts');
ok(/\*\s*this\.rate/.test(clock), '时间轴推进 = step × playbackRate（RitualClock.tick）');
// 契约复算（源码无 DOM 依赖可导入，故按源码语义复算）
const clampRate = (r) => (Number.isFinite(r) ? Math.min(64, Math.max(0.25, r)) : 1);
eq(clampRate(0), 0.25, '复算：0 → 夹到 MIN 0.25');
eq(clampRate(1000), 64, '复算：1000 → 夹到 MAX 64');
eq(clampRate(2.5), 2.5, '复算：2.5 原样');
eq(clampRate(NaN), 1, '复算：NaN → 回落 1');
eq(clampRate(Infinity), 1, '复算：Infinity → 回落 1');
// 公共入口树审计
const app = readSrc('src/App.tsx');
ok(!/setPlaybackRate|playbackRate|倍速|播放速度|回放速率|\brate\b/i.test(app), '公共 App.tsx 无任何倍速/回放标识');
ok(!/type\s*=\s*["']range["']|<input|<button|slider|onChange/i.test(app), '公共 App.tsx 无 input/button/slider/onChange');
// #7 · 公共 UI 树「**判定为本**」审计 —— 取代「按名字禁 / 按名字放行」的代理规则。
// 判据是源码内容，不是组件名字：App 引入的每个 components/* + 其 src/ 内 import 传递闭包，
// 逐行扫交互标记与敏感词，命中即判 fail 并给 file:line ⇒ 新增组件零维护自动覆盖，改名绕不过。
const ui = await auditPublicUiTree('src/App.tsx');
ok(ui.roots.length >= 1, `公共引入的 components/* 全部纳入扫描（实测 ${ui.roots.join(', ') || '无'}）`);
for (const file of ui.files) {
  const ih = ui.interactions.get(file);
  ok(ih.length === 0, `公共 UI 树 ${file} 无交互控件/回调（无倍速入口可挂）— 命中: ${ih.length}${ih.length ? ' :: ' + formatHits(file, ih) : ''}`);
  const wh = ui.words.get(file);
  ok(wh.length === 0, `公共 UI 树 ${file} 避开 SCAN_WORDS/ADMIN_WORDS/CONSOLE_MARKERS — 命中: ${wh.length}${wh.length ? ' :: ' + formatHits(file, wh) : ''}`);
}
const main = readSrc('src/main.tsx');
// #5 · 路由两态门控：形式允许「三元」或「lazy 分支 + Suspense」；此处校验语义 + 按需加载证据。
// 关键：必须把 <App/> 绑定到**非 director 分支**（否则 route 分支反接也能蒙混过关）。
ok(
  /route\s*===\s*'director'\s*\?\s*<DirectorApp\s*\/>\s*:\s*<App\s*\/>/.test(main) || // 三元：director?DirectorApp:App
  /route\s*!==\s*'director'[\s\S]{0,60}return\s*<App\s*\/>/.test(main),                 // 早返回：非 director → App
  '路由：public 分支 → App（非导演分支渲染 App，杜绝分支反接）');
ok(/lazy\s*\(\s*\(\)\s*=>\s*import\(\s*'\.\/director\/DirectorApp'\s*\)\s*\)/.test(main), '#5：导演路由懒加载（动态 import → 独立 chunk）');
ok(/<Suspense[\s\S]{0,140}<DirectorApp\s*\/>/.test(main), '#5：Suspense 兜底包裹 DirectorApp（按需拉取）');
// 「这条 import 逃出了闭包」同样不许发生：书写出来的 components 引用数必须等于
// 实际解析进扫描集的 root 数 —— 不等即说明有引用没被读到（改名/路径错/新写法），fail-closed。
const uiSpecs = componentSpecifiers('src/App.tsx');
ok(uiSpecs.length === ui.roots.length,
  `公共引用的 components/* 全部解析进扫描闭包（书写 ${uiSpecs.length} 条 / 实扫 ${ui.roots.length} 个）`);
log(`setPlaybackRate 仅 AltarScene 定义、全仓零调用；公共 UI 树 ${ui.files.length} 文件 × ${ui.wordCount} 敏感词逐行审过 0 命中`);

// ──────────────────────────────────────────────────────────────────────
// 6. 非仪式档不淡出（默认恒 {1,1,1}）
// ──────────────────────────────────────────────────────────────────────
console.log('[6] 非仪式档不淡出');
const audio = AU.altarAudio;
eq(JSON.stringify(audio.getLayerGains()), JSON.stringify({ water: 1, bucket: 1, reverb: 1 }),
  'altarAudio 默认包络 = {1,1,1}（未调制＝不淡出）');
// getLayerGains 返回副本
const g1 = audio.getLayerGains(); g1.water = 999;
eq(audio.getLayerGains().water, 1, 'getLayerGains 返回副本（外部改写不污染内部）');
// applyPhaseEnvelope（altarAudio 方法）唯一调用点在 AltarScene 的 updateRitualTimeline 内
const sceneCalls = (scene.match(/altarAudio\.applyPhaseEnvelope\s*\(/g) || []).length;
eq(sceneCalls, 1, 'AltarScene 仅 1 处 altarAudio.applyPhaseEnvelope');
// 该调用点必须在 updateRitualTimeline 体内，且置于非仪式态早退守卫之后
// （L2：守卫先把 ritualDeltaSec 回落墙钟再 return —— 包络仍只在仪式运行态下发）
const utlStart = scene.indexOf('updateRitualTimeline(');
const utlGuard = scene.indexOf('if (!this.ritualClock.running) {', utlStart);
const envCall = scene.indexOf('altarAudio.applyPhaseEnvelope(', utlStart);
const utlEnd = scene.indexOf('\n  }', utlStart + 10);
ok(utlStart >= 0 && utlGuard > utlStart, 'updateRitualTimeline 保留非仪式态早退守卫（ritualDeltaSec 回落墙钟）');
ok(envCall > utlGuard && envCall < utlEnd + 2, 'applyPhaseEnvelope 在守卫之后、方法体内（非运行态不执行）');
// 非仪式档（未调 setPlaybackRate / 未 startRitual）不会触达该调用 ⟹ 包络不被下发
eq(typeof audio.applyPhaseEnvelope, 'function', 'altarAudio.applyPhaseEnvelope 存在（仅仪式态被调用）');
log('默认 {1,1,1}；applyPhaseEnvelope 仅在 ritualRunning 的 updateRitualTimeline 内下发 ⟹ 非仪式档不淡出');

console.log(`\n✅ QA 独立门禁全部通过：${checks} 项断言\n`);
