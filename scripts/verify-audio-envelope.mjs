/**
 * 五阶段音频包络验收 —— Gitea #4。
 *
 * 无头环境出不了录屏（本环境无 WebGL/AudioContext），故以**代码级机械断言**取证；
 * 时间码复核/录屏归 #7。用 esbuild 把**真模块**打进临时目录后 import：
 *   · src/audio/phaseEnvelope.ts   — 五阶段包络 / 幕窗 / 幕内进度（纯函数，唯一权威）
 *   · src/types/altar.ts           — ritualPhaseAt（单一时间轴）/ 阈值常量
 *   · src/audio/altarAudio.ts      — 真 altarAudio 单例（未起声即可读缓存包络）
 * 并读 src/three/AltarScene.ts / src/App.tsx 做接线与「公共无倍速入口」审计。
 *
 * 运行：node scripts/verify-audio-envelope.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

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

const tmp = mkdtempSync(resolve(tmpdir(), 'audio-'));
const bundle = (rel, out) => {
  execFileSync(esbuildBin, [
    resolve(ROOT, rel),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, out)}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return import(pathToFileURL(resolve(tmp, out)).href);
};

let P, A, AU;
try {
  P = await bundle('src/audio/phaseEnvelope.ts', 'phaseEnvelope.mjs');
  A = await bundle('src/types/altar.ts', 'altar.mjs');
  AU = await bundle('src/audio/altarAudio.ts', 'altarAudio.mjs');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const readSrc = (rel) => stripComments(readFileSync(resolve(ROOT, rel), 'utf8'));

console.log('\n══ #4 五阶段音频包络 · 机械取证 ══\n');

// ══════════════════════════════════════════════════════════════════════
// 1. 五阶段边界时间码（单一时间轴 = ritualPhaseAt）
// ══════════════════════════════════════════════════════════════════════
console.log('[1] 五阶段边界时间码');
eq(A.RITUAL_ABYSS_END_SEC, 180, 'abyss 末 = 180s');
eq(A.RITUAL_NAMING_END_SEC, 1020, 'naming 末 = 1020s(17:00)');
eq(A.RITUAL_LANTERNS_END_SEC, 1440, 'lanterns 末 = 1440s(24:00)');
eq(A.WUJI_SILENCE_SEC, 1751, 'silence 起 = 1751s(29:11)');
eq(A.RITUAL_TOTAL_SEC, 1800, '总时长 = 1800s');
const bounds = [];
for (let s = 1; s < A.RITUAL_TOTAL_SEC; s++) {
  if (A.ritualPhaseAt(s) !== A.ritualPhaseAt(s - 1)) bounds.push(s);
}
eq(JSON.stringify(bounds), JSON.stringify([180, 1020, 1440, 1751]), '幕次切换边界恰为 [180,1020,1440,1751]');
// 幕窗表（本模块）与权威阈值同源
const wins = P.PHASE_WINDOWS;
eq(wins.length, 5, '五幕窗口表恰 5 段');
eq(wins.map((w) => w.start).join(','), '0,180,1020,1440,1751', '窗口起点 = 权威阈值');
eq(wins.map((w) => w.end).join(','), '180,1020,1440,1751,1800', '窗口终点 = 权威阈值');
for (let i = 1; i < wins.length; i++) ok(wins[i].start === wins[i - 1].end, `窗口 #${i} 与前一窗首尾相接`);

// ══════════════════════════════════════════════════════════════════════
// 2. 49 秒静默：1751→1800 三层增益完全归零
// ══════════════════════════════════════════════════════════════════════
console.log('[2] 49s 静默归零');
eq(P.SILENCE_SPAN_SEC, 49, 'silence 时长恰 49s（1800−1751）');
const silenceSecs = [1751, 1751.0001, 1760.5, 1775, 1799.999, 1800];
for (const s of silenceSecs) {
  const g = P.envelopeAt(s);
  eq(g.water, 0, `t=${s}s 水声增益 = 0`);
  eq(g.bucket, 0, `t=${s}s 链条增益 = 0`);
  eq(g.reverb, 0, `t=${s}s 混响增益 = 0`);
}
let silenceNonZero = 0;
for (let s = 1751; s <= 1800; s++) {
  const g = P.envelopeAt(s);
  if (g.water !== 0 || g.bucket !== 0 || g.reverb !== 0) silenceNonZero++;
}
eq(silenceNonZero, 0, 'silence 幕 [1751,1800] 每整秒三层增益全 0（完全归零，不灰不响）');
// 跨边界：1750.999 仍属 extinguishing（允许拖尾），1751 起归零
const justBefore = P.envelopeAt(1750.999);
ok(justBefore.water < 0.001 && justBefore.bucket < 0.01, '1750.999s（extinguishing 末）水/链条已近 0');

// ══════════════════════════════════════════════════════════════════════
// 3. 三条声链在各幕的包络 gain
// ══════════════════════════════════════════════════════════════════════
console.log('[3] 三层包络增益');
eq(P.AUDIO_LAYERS.length, 3, '恰三条声链（水声/翻斗链条/低频混响）');
eq(JSON.stringify(P.AUDIO_LAYERS), JSON.stringify(['water', 'bucket', 'reverb']), '声链命名 = water/bucket/reverb');
// abyss：机器独鸣（无水的黑场）
const abyss0 = P.applyPhaseEnvelope('abyss', 0);
const abyss1 = P.applyPhaseEnvelope('abyss', 1);
eq(abyss0.water, 0, 'abyss 水声 = 0（黑场无水）');
eq(abyss1.water, 0, 'abyss 末端水声 = 0');
ok(abyss0.bucket > 0 && abyss1.bucket > 0, 'abyss 链条 > 0（机器独鸣）');
ok(abyss0.reverb > 0 && abyss1.reverb > 0, 'abyss 混响 > 0（低频垫底）');
// naming：水随进度上涨
let namingMono = true;
for (let i = 1; i <= 100; i++) {
  if (P.applyPhaseEnvelope('naming', i / 100).water < P.applyPhaseEnvelope('naming', (i - 1) / 100).water) namingMono = false;
}
ok(namingMono, 'naming 水声随幕内进度单调不减（随 49 席点亮渐强）');
near(P.applyPhaseEnvelope('naming', 0).water, 0, 1e-12, 'naming 起点水声 = 0');
near(P.applyPhaseEnvelope('naming', 1).water, 0.7, 1e-12, 'naming 末端水声 = 0.7');
// lanterns：水满
near(P.applyPhaseEnvelope('lanterns', 1).water, 1.0, 1e-12, 'lanterns 末端水声 = 1.0（满）');
// extinguishing：水/链条收束到 0
near(P.applyPhaseEnvelope('extinguishing', 1).water, 0, 1e-12, 'extinguishing 末端水声 = 0');
near(P.applyPhaseEnvelope('extinguishing', 1).bucket, 0, 1e-12, 'extinguishing 末端链条 = 0');
// 每条链在非静默幕里确实有出声
const hasSound = { water: false, bucket: false, reverb: false };
for (const w of wins) {
  if (w.phase === 'silence') continue;
  const g = P.applyPhaseEnvelope(w.phase, 0.5);
  if (g.water > 0) hasSound.water = true;
  if (g.bucket > 0) hasSound.bucket = true;
  if (g.reverb > 0) hasSound.reverb = true;
}
ok(hasSound.water && hasSound.bucket && hasSound.reverb, '三条链在非静默幕均有出声（无死链）');
// 全域有界 [0,1]
let inRange = true, maxG = 0;
for (let s = 0; s <= 1800; s += 0.5) {
  const g = P.envelopeAt(s);
  for (const k of ['water', 'bucket', 'reverb']) {
    if (g[k] < 0 || g[k] > 1) inRange = false;
    if (g[k] > maxG) maxG = g[k];
  }
}
ok(inRange, '全部增益恒在 [0,1]');
log(`增益上界 ${maxG.toFixed(2)}；abyss 链条 ${abyss0.bucket}→${abyss1.bucket}；naming 水 0→0.7；lanterns 水→1.0`);

// ══════════════════════════════════════════════════════════════════════
// 4. 单一时间轴：envelopeAt 与 ritualPhaseAt 同源（无第二套时间轴）
// ══════════════════════════════════════════════════════════════════════
console.log('[4] 单一时间轴同源');
let mismatch = 0;
for (let s = 0; s <= 1800; s += 0.5) {
  const g1 = P.envelopeAt(s);
  const g2 = P.applyPhaseEnvelope(A.ritualPhaseAt(s), P.phaseProgress(s));
  if (g1.water !== g2.water || g1.bucket !== g2.bucket || g1.reverb !== g2.reverb) mismatch++;
}
eq(mismatch, 0, 'envelopeAt(sec) 恒等于 applyPhaseEnvelope(ritualPhaseAt(sec), phaseProgress(sec))');
eq(P.phaseProgress(180), 0, 'phaseProgress 在幕起点 = 0');
near(P.phaseProgress(1019.999), (1019.999 - 180) / (1020 - 180), 1e-9, 'phaseProgress 线性归一到幕窗');
// 源码审计：包络模块从 types/altar 取时间轴，且不含自造边界数字
const pe = readSrc('src/audio/phaseEnvelope.ts');
ok(/from\s+'\.\.\/types\/altar'/.test(pe), 'phaseEnvelope 自 types/altar 取阈值');
ok(/ritualPhaseAt/.test(pe), 'phaseEnvelope 用 ritualPhaseAt（单一时间轴）');
ok(!/\b(1020|1440|1751)\b/.test(pe), 'phaseEnvelope 无自造边界数字（1020/1440/1751）——无第二套时间轴');

// ══════════════════════════════════════════════════════════════════════
// 5. 真 altarAudio 单例（未起声即可读缓存包络）
// ══════════════════════════════════════════════════════════════════════
console.log('[5] 真 altarAudio 集成');
const au = AU.altarAudio;
eq(typeof au.applyPhaseEnvelope, 'function', 'altarAudio.applyPhaseEnvelope 存在');
eq(typeof au.triggerBucketChain, 'function', 'altarAudio.triggerBucketChain 存在（翻斗链条声源）');
eq(typeof au.getLayerGains, 'function', 'altarAudio.getLayerGains 存在');
const def = au.getLayerGains();
eq(JSON.stringify(def), JSON.stringify({ water: 1, bucket: 1, reverb: 1 }), '默认未调制 {1,1,1}（导演/工程直入不淡出）');
au.applyPhaseEnvelope('silence', 1);
eq(JSON.stringify(au.getLayerGains()), JSON.stringify({ water: 0, bucket: 0, reverb: 0 }), 'silence：真单例三层归零');
au.applyPhaseEnvelope('lanterns', 1);
eq(au.getLayerGains().water, 1, 'lanterns：真单例水声 = 1.0');
au.applyPhaseEnvelope('abyss', 0);
eq(au.getLayerGains().water, 0, 'abyss：真单例水声 = 0');
// 未初始化调用不应抛错（静默降级）
let threw = false;
try { au.triggerBucketChain('LIN_ZHONG'); au.triggerBucketChain('HUANG_ZHONG'); } catch { threw = true; }
ok(!threw, '未起声时 triggerBucketChain 静默降级（不抛错）');
au.applyPhaseEnvelope('silence', 1); // 复位，避免影响后续
log('真单例：silence→{0,0,0}；lanterns→水 1.0；abyss→水 0；未起声静默降级✓');

// ══════════════════════════════════════════════════════════════════════
// 6. 场景接线 + 公共入口「无倍速」审计
// ══════════════════════════════════════════════════════════════════════
console.log('[6] 接线 + 公共无倍速入口');
const scene = readSrc('src/three/AltarScene.ts');
ok(/altarAudio\.applyPhaseEnvelope\s*\(/.test(scene), 'AltarScene 逐帧下发 applyPhaseEnvelope');
ok(/phaseProgress\s*\(/.test(scene), 'AltarScene 用 phaseProgress（幕内进度）');
ok(/ritualPhaseAt\s*\(/.test(scene), 'AltarScene 包络由 ritualPhaseAt 驱动（与 #8 同源）');
ok(/onPhaseTransition[\s\S]{0,400}altarAudio\.triggerBucketChain\s*\(/.test(scene),
  '水梯死点相变回调调用 triggerBucketChain（翻斗链条声源）');
ok(/public\s+setPlaybackRate\s*\(/.test(scene), 'AltarScene 提供 setPlaybackRate API');
ok(/step\s*\*\s*this\.ritualPlaybackRate/.test(scene), '时间轴推进乘 ritualPlaybackRate');
ok(/RITUAL_PLAYBACK_DEFAULT\s*=\s*1\b/.test(scene), '回放速率默认 = 1（公共恒定）');

const audio = readSrc('src/audio/altarAudio.ts');
ok(/triggerBucketChain/.test(audio), 'altarAudio 定义 triggerBucketChain');
ok(/bucketChain/.test(audio) && /bucketFilter/.test(audio), 'altarAudio 建翻斗链条声源（噪声+带通）');
ok(/waterGain/.test(audio) && /bucketGain/.test(audio) && /reverbGain/.test(audio), 'altarAudio 三条链各自 gain 节点');
ok(/lowpass/.test(audio) && /reverb/.test(audio) && /120/.test(audio), '保留既有 reverb + lowpass(120) 链');

// 公共入口 = App.tsx（整棵公共渲染树）。不得含任何倍速/回放入口，也不得引 UI 组件。
const app = readSrc('src/App.tsx');
ok(!/setPlaybackRate|playbackRate|倍速|播放速度|回放速率|速率/i.test(app), '公共 App 无任何倍速/回放标识');
ok(!/type\s*=\s*["']range["']|onChange|<input|<button|slider/i.test(app), '公共 App 无输入/按钮/滑块控件');
// #7：静默层 `src/components/WebglFallback.tsx` 属**公共侧**纯展示层，单独放行；
// components/* 其余组件仍一律禁止。放行≠放宽 —— 下一条改为**实测**该组件零交互控件，
// 比原来「一刀切禁止 components/」更能证明「倍速入口无处可挂」。
ok(!/from\s+'\.\/components\/(?!WebglFallback')/.test(app),
  '公共 App 不引任何 UI 组件（#7 静默层 WebglFallback 除外）');
const veilSrc = readSrc('src/components/WebglFallback.tsx');
ok(!/<button|<input|<select|<textarea|onChange|onClick|onPointerDown|slider|type\s*=\s*["']range["']/i.test(veilSrc),
  '#7 静默层零交互控件（无按钮/输入/回调 ⇒ 无处可挂倍速入口）');
ok(!/startRitual\s*\(\)[\s\S]{0,80}setPlaybackRate/.test(app), '公共 App 从不对 setPlaybackRate 下发');
log('公共渲染树 = App.tsx（仅 ritual-root/canvas），无倍速/回放/输入控件；速率 API 仅存在于 AltarScene');

// ── 复用 #9（不重建）：49 半音断言仍在门禁内 ─────────────────────────
const runner = readSrc('scripts/run-tests.mjs');
ok(/assert-semitones\.mjs/.test(runner), '49 半音断言（#9）仍在 npm test 门禁内（复用，未重建）');
ok(existsSync(resolve(ROOT, 'scripts/assert-semitones.mjs')), 'scripts/assert-semitones.mjs 存在');

console.log(
  '\n#4 audio-envelope verified on real modules\n' +
  `  五阶段边界：${JSON.stringify(bounds)}s；静默 ${P.SILENCE_SPAN_SEC}s（${A.WUJI_SILENCE_SEC}→${A.RITUAL_TOTAL_SEC}）三层全 0\n` +
  `  三层：water/bucket/reverb；abyss 链条 ${abyss0.bucket}→${abyss1.bucket}、水恒 0；lanterns 水→1.0；extinguishing→水/链条 0\n` +
  `  单一时间轴：envelopeAt ≡ applyPhaseEnvelope(ritualPhaseAt(sec), phaseProgress(sec))，包络模块无自造边界数字\n` +
  `  翻斗链条：AltarScene 死点相变 → altarAudio.triggerBucketChain（顶黄钟/底林钟）\n` +
  `  公共入口：App.tsx 无倍速/回放/输入控件；setPlaybackRate 仅存于 AltarScene（默认 rate=1）\n` +
  `  数据源：src/audio/phaseEnvelope.ts · src/types/altar.ts · src/audio/altarAudio.ts · src/three/AltarScene.ts\n` +
  `  ${checks} assertions passed.`
);
