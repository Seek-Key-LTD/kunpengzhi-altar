/**
 * L2 · 音频×物理时序对齐取证（跨域：RitualTime 下发 vs 物理步进）。
 *
 * 契约：物理耦合体（waterLift / maglev）的步进量必须与 RitualClock 的**实际
 * 推进量**同域（含 rate 缩放与 1800s 封顶）——否则 rate≠1 时，五阶段包络
 * （仪式时域）与翻斗/黄钟林钟触发（墙钟时域）按比例漂移。
 *
 * 用真模块（RitualClock + AltarWaterLiftEngine）做行为取证，
 * 并对 AltarScene 源码做接线审计（与 verify-audio-envelope 同款纪律）。
 *
 * 运行：node scripts/verify-ritual-physics-clock.mjs
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
const log = (m) => console.log(`   · ${m}`);

const esbuild = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuild), '缺少 esbuild（vite 内置依赖）');
const tmp = mkdtempSync(resolve(tmpdir(), 'ritual-clock-'));
let C, W;
try {
  const bundle = (rel, out) => {
    execFileSync(esbuild, [
      resolve(ROOT, rel),
      '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
      `--outfile=${resolve(tmp, out)}`
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    return import(pathToFileURL(resolve(tmp, out)).href);
  };
  [C, W] = await Promise.all([
    bundle('src/three/RitualClock.ts', 'ritualClock.mjs'),
    bundle('src/three/AltarWaterLiftEngine.ts', 'engine.mjs')
  ]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const { RitualClock } = C;
const { AltarWaterLiftEngine } = W;
ok(typeof RitualClock === 'function' && typeof AltarWaterLiftEngine === 'function',
  '真模块必须可加载（RitualClock / AltarWaterLiftEngine）');

const FRAME = 1 / 30;

/**
 * 模拟 AltarScene 主循环。
 * mode='raw'    —— 旧实现：物理吃墙钟 dt（漂移基线，用于复现缺陷）。
 * mode='scaled' —— L2 实现：物理吃 RitualClock 实际推进量（rate 缩放 + 1800s 封顶）。
 */
function run(wallSeconds, rate, mode) {
  const clock = new RitualClock();
  clock.start();
  clock.rate = rate;
  const engine = new AltarWaterLiftEngine();
  let transitions = 0;
  engine.onPhaseTransition = () => { transitions++; };
  const frames = Math.round(wallSeconds / FRAME);
  for (let i = 0; i < frames; i++) {
    const before = clock.elapsed;
    clock.tick(FRAME);
    const ritualDelta = clock.elapsed - before; // 与 AltarScene.ritualDeltaSec 同式
    engine.update(mode === 'scaled' ? ritualDelta : FRAME);
  }
  return { transitions, ritualElapsed: clock.elapsed };
}

const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const scene = stripComments(readFileSync(resolve(ROOT, 'src/three/AltarScene.ts'), 'utf8'));

console.log('\n══ L2 音频×物理时序对齐 · 机械取证 ══\n');

// ── 1. 漂移复现：rate=2 下旧实现（墙钟 dt）的物理推进只有仪式时域的一半 ──
const t1 = run(60, 1, 'raw').transitions;      // rate=1：raw 与 scaled 等价
const t2raw = run(60, 2, 'raw').transitions;   // 旧实现：物理仍 1×，翻斗次数 ≈ rate=1
ok(t1 >= 10, `60s 墙钟内 rate=1 应产生足量死点相变（实测 ${t1}）`);
ok(Math.abs(t2raw - t1) <= Math.max(2, t1 * 0.2),
  `漂移复现：rate=2 + 墙钟 dt 的相变数应与 rate=1 几乎相同（${t2raw} vs ${t1}）——证明缺陷存在`);
log(`漂移基线：rate=1 → ${t1} 次；rate=2 + 墙钟 dt → ${t2raw} 次（物理相对仪式慢一半）`);

// ── 2. 修正生效：ritualDeltaSec 下发后，物理轨迹只由仪式时刻决定 ──────────
// 注意：水梯是变质量系统（虹吸流+挑舌改写 mA/mB），相变频率随不对称度**超线性**
// 增长 —— 正确不变量不是"2×时间=2×相变"，而是"同一仪式时刻 → 同一相变数，
// 与回放速率无关"。r1（rate=1 真跑 120s 仪式）就是 120s 仪式时刻的真值。
const r1 = run(120, 1, 'scaled').transitions;
const t2scaled = run(60, 2, 'scaled').transitions; // rate=2 跑 60s 墙钟 = 同样 120s 仪式
ok(t2scaled >= t2raw * 1.5,
  `修正后 rate=2 的相变数应显著高于漂移基线（${t2scaled} vs ${t2raw}）`);
ok(Math.abs(t2scaled - r1) <= 2,
  `修正后 rate=2（60s 墙钟=120s 仪式）的相变数必须对齐 rate=1 真值（${t2scaled} vs ${r1}，容差 2）`);
log(`时域锁定：120s 仪式 → rate=1 ${r1} 次，rate=2（60s 墙钟）${t2scaled} 次 ✓`);

// ── 4. 1800s 封顶联动：仪式到点后物理冻结（ritualDelta=0 被引擎 dt 守卫忽略）──
const capA = run(900, 2, 'scaled').transitions;   // wall 900 → ritual 恰 1800
const capB = run(1000, 2, 'scaled').transitions;  // 多跑 100s 墙钟，ritual 仍 1800
ok(capA === capB,
  `仪式封顶后物理必须冻结（${capA} vs ${capB}，多跑 100s 墙钟不得新增相变）`);
log(`封顶冻结：ritual=1800 后多跑墙钟不再产生相变 ✓`);

// ── 5. 引擎"精确推进 dt"契约：大步长不被截断 ────────────────────────
// 同一 60s 仪式时间：大步长路径（240×0.25s，0.25 = 恰 15 个 1/60 子步量子、
// 等于合并后引擎的 accDt 上限，无截断）与细步长路径（≈1818×0.033s 残差累积）
// 的死点相变数必须一致（±2）——积分路径不同，计时不许不同。
const bigEngine = new AltarWaterLiftEngine();
let bigT = 0;
bigEngine.onPhaseTransition = () => { bigT++; };
for (let i = 0; i < 240; i++) bigEngine.update(0.25);
const fineEngine = new AltarWaterLiftEngine();
let fineT = 0;
fineEngine.onPhaseTransition = () => { fineT++; };
const fineFrames = Math.round(60 / 0.033);
for (let i = 0; i < fineFrames; i++) fineEngine.update(0.033);
ok(Math.abs(bigT - fineT) <= 2,
  `同一 60s 仪式时间，大步长（0.25s×240 → ${bigT} 次）与细步长（0.033s → ${fineT} 次）相变数必须一致（±2）——残差累积下大步长完整推进`);
log(`引擎契约：0.25s 大步长完整推进（大/细步长相变数 ${bigT}/${fineT} 一致）✓`);

// ── 6. AltarScene 接线审计：物理耦合体吃 ritualDeltaSec ──────────────────
ok(/waterLift\.update\(this\.ritualDeltaSec\)/.test(scene),
  'AltarScene 必须把 ritualDeltaSec 下发给 waterLift');
ok(/maglev\.update\(this\.ritualDeltaSec,\s*this\.waterLiftSeismic\)/.test(scene),
  'AltarScene 必须把 ritualDeltaSec 下发给 maglev（与水梯同域）');
ok(/ritualDeltaSec = this\.ritualClock\.elapsed - before/.test(scene),
  'ritualDeltaSec 必须取自 RitualClock 的实际 elapsed 差值（含 rate 缩放与封顶）');
ok(/ritualDeltaSec = Number\.isFinite\(dt\) \? dt : 0/.test(scene),
  '非仪式态必须回落墙钟 dt（保持工程直入/演示循环既有行为）');
log('接线审计：waterLift/maglev 同吃 ritualDeltaSec，非仪式态回落墙钟 ✓');

console.log(`\nritual-physics-clock: 跨域时序对齐取证 · ${checks} 项断言通过`);
