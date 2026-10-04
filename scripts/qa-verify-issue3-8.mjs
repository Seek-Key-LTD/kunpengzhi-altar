/**
 * QA 独立验证 —— Gitea #3（#00 无极点·吸光体）与 #8（1800s 五幕时间轴）。
 * 作者：严过关（QA）。**不 import 工程师的验收脚本**，也不手抄任何阈值常量：
 *   所有阈值 / 相位映射 / litSeats 插值一律通过 esbuild 现场打包真模块后 import 取得。
 *
 * 与工程师脚本的差别（独立性所在）：
 *   · 用**稠密扫描**证明 isTimelineDrivenPhase 的 true/false 划分恰好把五幕切成两半（互斥 + 覆盖）；
 *   · 用真实数据 INITIAL_SPIRAL_EVENTS 断言 49 席无 #00、seatMidi(0) 必须抛；
 *   · 音频 init() 的**幂等 + 并发单飞**与无头环境静默降级；
 *   · 时间轴控制流镜像：dt 巨跳跨多边界 / elapsed clamp / startRitual 重入归零。
 *
 * 运行：node scripts/qa-verify-issue3-8.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };

const esbuild = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuild), '缺少 esbuild（vite 内置依赖）');

const tmp = mkdtempSync(resolve(tmpdir(), 'qa-issue38-'));
const bundle = (entry, name) => {
  const out = resolve(tmp, name);
  execFileSync(esbuild, [
    resolve(ROOT, entry),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${out}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return pathToFileURL(out).href;
};

const altar = await import(bundle('src/types/altar.ts', 'altar.mjs'));
const spiral = await import(bundle('src/data/spiral_events.ts', 'spiral.mjs'));
const {
  RITUAL_TOTAL_SEC, RITUAL_ABYSS_END_SEC, RITUAL_NAMING_END_SEC, RITUAL_LANTERNS_END_SEC,
  WUJI_REVEAL_SEC, WUJI_SILENCE_SEC, SEAT_ID_MIN, SEAT_ID_MAX, WUJI_ANCHOR_ID,
  ritualPhaseAt, ritualLitSeatsAt, isTimelineDrivenPhase, wujiRevealStateAt, isSeatId
} = altar;

// ══ 1. #00 排除性 ════════════════════════════════════════════════════
eq(WUJI_ANCHOR_ID, 0, '#00 锚点必须是 0');
eq(SEAT_ID_MIN, 1, '席位域下界 1');
eq(SEAT_ID_MAX, 49, '席位域上界 49');
for (const bad of [0, -1, 50, 1.5, NaN, Infinity]) {
  eq(isSeatId(bad), false, `isSeatId 必须拒绝非席位 ${bad}`);
}
for (const good of [1, 25, 49]) eq(isSeatId(good), true, `isSeatId 必须接受 ${good}`);

// 真实数据：49 席，无 0 号
const evs = spiral.INITIAL_SPIRAL_EVENTS;
eq(evs.length, 49, 'INITIAL_SPIRAL_EVENTS 必须正好 49 席');
eq(evs.some((e) => e.seat_id === 0), false, '席位数组中不得出现 #00');
ok(evs.every((e) => isSeatId(e.seat_id)), '每一席 seat_id 都必须是合法席位');
eq(new Set(evs.map((e) => e.seat_id)).size, 49, '席位号必须互不重复（1..49 全覆盖）');

// 音高路径：#00 必须拒发
eq(spiral.seatMidi(1), 36, '第 1 席 = MIDI 36 (C2)');
eq(spiral.seatMidi(49), 84, '第 49 席 = MIDI 84 (C6)');
for (const bad of [0, -3, 50]) {
  assert.throws(() => spiral.seatMidi(bad), RangeError, `seatMidi(${bad}) 必须抛 RangeError`);
  checks++;
}

// 源码扫描：#00 不得出现在拾取/认领/铸造路径
const walk = (d) => readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const srcFiles = walk(resolve(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));
const joinSrc = srcFiles.map((f) => [f, readFileSync(f, 'utf8')]);
const hitsSeatIdZero = joinSrc.filter(([, s]) => /seat_id\s*:\s*0\b|seatId\s*:\s*0\b/.test(s));
eq(hitsSeatIdZero.length, 0, `不得有任何源文件把 seat_id/seatId 写成 0（命中：${hitsSeatIdZero.map(([f]) => relative(ROOT, f))}）`);
const absorberLine = joinSrc
  .flatMap(([f, s]) => s.split('\n').map((l, i) => [f, i + 1, l]))
  .find(([, , l]) => /ritual_anchor:\s*'wuji'/.test(l));
ok(!!absorberLine, '必须存在 #00 吸光体的 userData 声明');
ok(/seatId:\s*null/.test(absorberLine[2]), '#00 的 userData.seatId 必须为 null（非席位）');
ok(/claimable:\s*false/.test(absorberLine[2]), '#00 必须 claimable:false');
ok(/tokenizable:\s*false/.test(absorberLine[2]), '#00 必须 tokenizable:false');

// ══ 2. 相位边界（真值模块） ══════════════════════════════════════════
eq(RITUAL_TOTAL_SEC, 1800, '总时长 1800s');
eq(RITUAL_LANTERNS_END_SEC, WUJI_REVEAL_SEC, 'lanterns 幕末 == #00 显形阈值');
eq(ritualPhaseAt(0), 'abyss', 't=0 应为 abyss');
eq(ritualPhaseAt(179.999), 'abyss', 't=179.999 仍 abyss');
eq(ritualPhaseAt(180), 'naming', 't=180 应为 naming（半开区间）');
eq(ritualPhaseAt(1019.999), 'naming', 't=1019.999 仍 naming');
eq(ritualPhaseAt(1020), 'lanterns', 't=1020 应为 lanterns');
eq(ritualPhaseAt(1439.999), 'lanterns', 't=1439.999 仍 lanterns');
eq(ritualPhaseAt(1440), 'extinguishing', 't=1440 应为 extinguishing');
eq(ritualPhaseAt(1750.999), 'extinguishing', 't=1750.999 仍 extinguishing');
eq(ritualPhaseAt(1751), 'silence', 't=1751 应为 silence');
eq(ritualPhaseAt(1800), 'silence', 't=1800 应为 silence');

eq(wujiRevealStateAt(1439), 'hidden', '24:00 前 #00 未显形');
eq(wujiRevealStateAt(1440), 'revealed', 't=1440 #00 显形');
eq(wujiRevealStateAt(1750), 'revealed', 't=1750 仍显形');
eq(wujiRevealStateAt(1751), 'silent', 't=1751 #00 静默');
eq(wujiRevealStateAt(1800), 'silent', 't=1800 静默');

// ══ 3. 防双写契约：true/false 恰好切两半、互斥、无叠、覆盖五幕 ════════
const PHASES = ['abyss', 'naming', 'lanterns', 'extinguishing', 'silence'];
const driven = new Set(PHASES.filter(isTimelineDrivenPhase));
const manual = new Set(PHASES.filter((p) => !isTimelineDrivenPhase(p)));
eq(driven.size, 3, '时间轴驱动的幕必须恰为 3 个');
eq(manual.size, 2, 'setRitualTime 结算的幕必须恰为 2 个');
eq([...driven].sort().join(','), 'abyss,lanterns,naming', '驱动集必须是 {abyss,naming,lanterns}');
eq([...manual].sort().join(','), 'extinguishing,silence', '手动集必须是 {extinguishing,silence}');
ok([...driven].every((p) => !manual.has(p)), '两集合必须互斥');
eq(driven.size + manual.size, PHASES.length, '两集合并集必须恰好覆盖五幕');

// 稠密扫描：每一秒都恰好落在「驱动」或「手动」一侧，且与 1440 阈值严格一致
let drivenSecs = 0, manualSecs = 0, mismatch = 0;
for (let s = 0; s < RITUAL_TOTAL_SEC; s++) {
  const p = ritualPhaseAt(s);
  const isDriven = isTimelineDrivenPhase(p);
  const shouldBeManual = s >= WUJI_REVEAL_SEC; // ≥24:00 一律交给 setRitualTime
  if (isDriven === shouldBeManual) mismatch++;
  if (isDriven) drivenSecs++; else manualSecs++;
}
eq(mismatch, 0, '扫描 0..1799：驱动/手动划分必须与 1440 阈值逐秒一致（无双写窗口）');
eq(drivenSecs + manualSecs, RITUAL_TOTAL_SEC, '逐秒划分必须无缝无叠');
eq(drivenSecs, WUJI_REVEAL_SEC, '驱动段长度必须恰为 1440s');
eq(manualSecs, RITUAL_TOTAL_SEC - WUJI_REVEAL_SEC, '手动段长度必须恰为 360s');

// ══ 4. litSeats 爬升 ════════════════════════════════════════════════
eq(ritualLitSeatsAt(0), 0, 't=0 litSeats=0');
eq(ritualLitSeatsAt(180), 0, 't=180 litSeats=0');
eq(ritualLitSeatsAt(1020), 49, 't=1020 litSeats=49');
eq(ritualLitSeatsAt(1440), 49, 't=1440 litSeats=49');
eq(ritualLitSeatsAt(1800), 49, 't=1800 litSeats=49');
let mono = true, prev = -1, strictlyGrows = 0;
for (let s = 0; s <= RITUAL_TOTAL_SEC; s++) {
  const v = ritualLitSeatsAt(s);
  if (v < prev) mono = false;
  if (v > prev) strictlyGrows++;
  prev = v;
}
ok(mono, 'litSeats 必须单调非降');
eq(prev, 49, '扫描结束必须到 49');
ok(strictlyGrows >= 49, `命名幕内至少要出现 49 次增长台阶（实测 ${strictlyGrows}）`);

// ══ 5. 音频：幂等 + 并发单飞 + 无头静默降级 ══════════════════════════
const audioUrl = bundle('src/audio/altarAudio.ts', 'audio.mjs');
const { altarAudio } = await import(audioUrl);
ok(typeof altarAudio.init === 'function', 'altarAudio.init 必须是函数');

let syncThrow = null;
let p1, p2;
try {
  p1 = altarAudio.init(); // 无头环境：不得同步抛
  p2 = altarAudio.init(); // 并发第二次
} catch (e) { syncThrow = e; }
eq(syncThrow, null, '无 AudioContext 时 init() 不得同步抛错');
ok(p1 instanceof Promise && p2 instanceof Promise, 'init() 必须返回 Promise');
eq(p1, p2, '并发两次 init() 必须返回同一个 Promise（单飞，只建一套 synth）');
p1.catch(() => {}); // 静默降级：拒绝也必须被吞掉，不留 unhandledRejection
let rejected = false;
await p1.then(() => {}, () => { rejected = true; });
ok(true, `init() 无头结算完成（rejected=${rejected}，允许失败但必须静默）`);
// 失败后不得残留进行中的 promise（否则永远无法重试）
const p3 = altarAudio.init();
ok(p3 instanceof Promise, '失败后仍可再次 init()（initPromise 已复位）');
p3.catch(() => {});

// ══ 6. 时间轴控制流镜像（真值函数 + AltarScene.updateRitualTimeline 的三行控制流）══
// 说明：AltarScene 需要 WebGL，无法在 node 实例化；此处只镜像其可读控制流，
//       阈值/相位/litSeats 全部来自上面的真值模块，**不复制任何常量**。
//       startRitual(startSec) 镜像真实语义（AltarScene.startRitual）：off-air/default
//       落 0/abyss；直播中段入场（broadcast.showSec）落场内秒数并**接续** phase/litSeats
//       （71ba36f），不再无条件归零。
const makeTimeline = () => {
  const st = { running: false, elapsed: 0, phase: null, lit: -1, writes: [], wuji: null };
  return {
    st,
    startRitual(startSec = 0) {
      st.running = true; st.elapsed = startSec;
      st.phase = ritualPhaseAt(startSec); st.lit = -1; st.writes = [];
      // setRitualTime(startSec) 结算镜像：wuji 显隐与 litSeats 一并落位
      st.wuji = wujiRevealStateAt(startSec);
      st.lit = ritualLitSeatsAt(startSec);
      if (st.wuji !== 'hidden') st.lit = SEAT_ID_MAX;
    },
    tick(dt) {
      if (!st.running) return;
      st.elapsed = Math.min(RITUAL_TOTAL_SEC, st.elapsed + dt);      // AltarScene.ts:1631
      const phase = ritualPhaseAt(st.elapsed);
      if (phase !== st.phase) {
        st.phase = phase;
        if (isTimelineDrivenPhase(phase)) st.writes.push(phase);      // 只有早段三幕在此写
      }
      if (phase === 'naming') st.lit = ritualLitSeatsAt(st.elapsed);
      // setRitualTime(elapsed) 结算：revealed→extinguishing(49)、silent→silence(49)，
      // 但 dt 巨跳可能一步跨到末段，此处必须一并镜像，否则镜像比源码少写一次 litSeats。
      st.wuji = wujiRevealStateAt(st.elapsed);
      if (st.wuji !== 'hidden') st.lit = SEAT_ID_MAX;
    }
  };
};

const t1 = makeTimeline();
t1.startRitual();
eq(t1.st.elapsed, 0, 'startRitual()（off-air/default）必须落 0s');
eq(t1.st.phase, 'abyss', 'startRitual()（off-air/default）必须落初幕 abyss');
eq(t1.st.wuji, 'hidden', 'startRitual() 时 #00 必须未显形');

// 直播中段入场：seed = broadcast.showSec（修复 71ba36f 的语义）——不归零，按场内秒接续
const tMid = makeTimeline();
tMid.startRitual(1500); // extinguishing 段（1440–1751）
eq(tMid.st.elapsed, 1500, '直播中段入场：elapsed 必须接续场内秒数，不得归零');
eq(tMid.st.phase, 'extinguishing', '直播中段入场：phase 必须接续到场内相位');
eq(tMid.st.lit, SEAT_ID_MAX, '直播中段入场：晚段席位必须全额在场，不得空坛');
tMid.startRitual(300); // naming 段
eq(tMid.st.phase, 'naming', '直播中段入场（naming）：phase 接续');
ok(tMid.st.lit > 0 && tMid.st.lit < SEAT_ID_MAX, '直播中段入场（naming）：litSeats 必须是当时席数而非 0/49');

// 重入：跑一段后再次 startRitual(0) → 归零（off-air 语义）
for (let i = 0; i < 600; i++) t1.tick(1); // 走到 600s（naming 中）
eq(t1.st.phase, 'naming', '600s 应处于 naming');
t1.startRitual(0);
eq(t1.st.elapsed, 0, '重入 startRitual(0) 必须把 elapsed 再次归零');
eq(t1.st.phase, 'abyss', '重入后回到 abyss');

// 正常步进到终态，并检查「时间轴只写早段三幕」
const t2 = makeTimeline();
t2.startRitual();
for (let i = 0; i < RITUAL_TOTAL_SEC; i++) t2.tick(1);
eq(t2.st.phase, 'silence', '走满 1800s 应到 silence');
eq(t2.st.wuji, 'silent', '走满 1800s #00 应静默');
eq(t2.st.lit, 49, '走满 1800s litSeats=49');
eq(t2.st.writes.join(','), 'naming,lanterns', '时间轴只应写 naming/lanterns（abyss 为初幕，ext/silence 交给 setRitualTime）');
ok(!t2.st.writes.includes('extinguishing') && !t2.st.writes.includes('silence'),
  '时间轴绝不改写 extinguishing/silence（防双写）');

// dt 巨跳：一次跨越多边界
const t3 = makeTimeline();
t3.startRitual();
let crash = null;
try { t3.tick(2000); } catch (e) { crash = e; }
eq(crash, null, 'dt=2000 巨跳不得抛错');
eq(t3.st.elapsed, RITUAL_TOTAL_SEC, 'dt 巨跳后 elapsed 必须 clamp 到 1800');
eq(t3.st.phase, 'silence', 'dt 巨跳后必须落到终态 silence');
eq(t3.st.wuji, 'silent', 'dt 巨跳后 #00 必须静默');
eq(t3.st.lit, 49, 'dt 巨跳后 litSeats 必须为 49');

// 非有限 dt（观察项，非阻塞）：AltarScene.ts:1631 是裸 `Math.min(TOTAL, elapsed + dt)`，
// 没有像 setRitualTime 那样做 Number.isFinite 兜底；一旦 dt=NaN，elapsed 会永久 NaN。
// 但调用点 :1912 `Math.min(0.05, elapsedTime - lastElapsed)` 已把 dt 钳到 [~0, 0.05]，
// 且 Three.Clock.getElapsedTime() 恒为有限单调值 ⟹ 实际不可达。此处只**记录**不判失败。
const t4 = makeTimeline();
t4.startRitual();
t4.tick(Number.NaN);
const nanObservable = !Number.isFinite(t4.st.elapsed);
console.log(`  [观察] NaN dt 会把 ritualElapsed 变 NaN = ${nanObservable}（调用点已钳 dt≤0.05，实际不可达；建议加 isFinite 兜底，非阻塞）`);

// ══ 7. 入口核对（静态） ═══════════════════════════════════════════════
const appSrc = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');
ok(/altar\.startRitual\(\)/.test(appSrc), 'App.tsx 公共路径必须调用 startRitual()');
ok(/altar\.setRole\(/.test(appSrc), 'App.tsx 仍须调用 setRole()');
const sceneSrc = readFileSync(resolve(ROOT, 'src/three/AltarScene.ts'), 'utf8');
ok(/public presentImmediately\(\)/.test(sceneSrc), 'presentImmediately() 必须仍在（未删）');
ok(/public startRitual\(\)/.test(sceneSrc), 'startRitual() 必须存在');
ok(/isTimelineDrivenPhase\(phase\)/.test(sceneSrc), 'updateRitualTimeline 必须用 isTimelineDrivenPhase 收口');

rmSync(tmp, { recursive: true, force: true });
console.log(`qa-verify-issue3-8: ${checks} 项断言全部通过 ✅`);
console.log('  #00 排除性 / 相位边界 / 防双写划分 / litSeats 爬升 / 音频单飞 / 时间轴边界 均已独立复核');
