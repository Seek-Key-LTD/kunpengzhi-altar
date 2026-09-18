/**
 * 朗诵模块验收 —— Gitea #11-B。
 *
 * 无头环境不播真音，故以**代码级机械断言**取证：用 esbuild 把**真模块**打进临时目录后
 * import，`HTMLAudioElement` 以桩替换（不接公共页、不发起真实请求）：
 *   · src/audio/ritualNarration.ts  — 朗诵播放器（manifest / 生命周期 / 顺序续播 / fail-soft）
 *   · src/audio/phaseEnvelope.ts    — 既有唯一时间轴包络（音量来源）
 *
 * 覆盖：① manifest 恰 17 章且顺序严格；② ended 顺序续播、末章不再请求；
 *       ③ 单章失败跳过并继续、失败次数有界；④ dispose 后监听/src 清空、零请求；
 *       ⑤ 音量派生自 envelopeAt（无自抄阈值）；⑥ 对外文本无工程化字样。
 *
 * 运行：node scripts/verify-ritual-narration.mjs
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

const tmp = mkdtempSync(resolve(tmpdir(), 'narration-'));
const bundle = (rel, out) => {
  execFileSync(esbuildBin, [
    resolve(ROOT, rel),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, out)}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return import(pathToFileURL(resolve(tmp, out)).href);
};

let M, P;
try {
  M = await bundle('src/audio/ritualNarration.ts', 'ritualNarration.mjs');
  P = await bundle('src/audio/phaseEnvelope.ts', 'phaseEnvelope.mjs');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const readSrc = (rel) => stripComments(readFileSync(resolve(ROOT, rel), 'utf8'));

// ── HTMLAudioElement 桩（记录 src/play/load/监听器，可编程失败） ──────────
class FakeAudio {
  constructor() {
    this.src = '';
    this.volume = 1;
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.error = null;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.loadCalls = 0;
    this.playThrows = false;
    this.playRejects = false;
    this._listeners = new Map();
  }
  play() {
    this.playCalls += 1;
    if (this.playThrows) throw new Error('play-throw');
    this.paused = false;
    if (this.playRejects) return Promise.reject(new Error('play-reject'));
    return Promise.resolve();
  }
  pause() { this.pauseCalls += 1; this.paused = true; }
  load() { this.loadCalls += 1; }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { const s = this._listeners.get(type); if (s) s.delete(fn); }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  dispatch(type) { const s = this._listeners.get(type); if (s) for (const fn of [...s]) fn({ type, target: this }); }
  listenerCount() { let n = 0; for (const s of this._listeners.values()) n += s.size; return n; }
}

function makeHarness() {
  const started = [], ended = [], errors = [], progress = [];
  const els = [];
  let complete = 0;
  const mk = () => { const a = new FakeAudio(); els.push(a); return a; };
  const el = () => els[els.length - 1];
  const narration = new M.RitualNarration({
    createAudio: mk,
    events: {
      onChapterStart: (c) => started.push({ index: c.index, id: c.id, src: el() ? el().src : '' }),
      onChapterEnd: (c) => ended.push(c.id),
      onError: (f) => errors.push({ index: f.index, id: f.id, reason: f.reason, keys: Object.keys(f).sort().join(',') }),
      onProgress: (p) => progress.push({ ...p }),
      onComplete: () => { complete += 1; }
    }
  });
  return { narration, started, ended, errors, progress, els, el, complete: () => complete };
}

console.log('\n══ #11-B 朗诵模块 · 机械取证 ══\n');

// ══════════════════════════════════════════════════════════════════════
// 1. manifest 恰 17 章，顺序严格 chap_00…chap_16（逐项比对）
// ══════════════════════════════════════════════════════════════════════
console.log('[1] manifest 单一真源 / 17 章顺序');
eq(M.NARRATION_CHAPTER_COUNT, 17, '章节总数常量 = 17');
eq(M.NARRATION_MANIFEST.length, 17, 'manifest 恰 17 项');
const ids = M.NARRATION_MANIFEST.map((c) => c.id);
const expected = Array.from({ length: 17 }, (_, i) => `chap_${String(i).padStart(2, '0')}`);
eq(JSON.stringify(ids), JSON.stringify(expected), '章节 id 顺序严格 chap_00…chap_16（逐项）');
ok(M.NARRATION_MANIFEST.every((c, i) => c.index === i), '每项 index 与位置一致 [0,16]');
ok(M.NARRATION_MANIFEST.every((c, i) => c.id === expected[i]), '每项 id 与序号一一对应');
eq(JSON.stringify(M.NARRATION_CHAPTER_IDS), JSON.stringify(ids), 'NARRATION_CHAPTER_IDS 与 manifest 同源');
eq(M.RITUAL_AUDIO_BASE_PATH, '/ritual-audio/', '默认路由前缀 = /ritual-audio/');
eq(M.chapterUrl(M.NARRATION_MANIFEST[0]), '/ritual-audio/chap_00.mp3', '首章同域路径');
eq(M.chapterUrl(M.NARRATION_MANIFEST[16]), '/ritual-audio/chap_16.mp3', '末章同域路径');
ok(M.NARRATION_MANIFEST.every((c) => M.chapterUrl(c).startsWith(M.RITUAL_AUDIO_BASE_PATH)), '全部路径同域、前缀集中');
log(`manifest 17 章：${ids[0]} … ${ids[16]}；前缀 ${M.RITUAL_AUDIO_BASE_PATH}`);

// ══════════════════════════════════════════════════════════════════════
// 2. ended 顺序续播；末章 ended 不再产生新播放与请求
// ══════════════════════════════════════════════════════════════════════
console.log('[2] ended 顺序续播 / 末章收束');
const h = makeHarness();
h.narration.play(0);
eq(h.narration.isPlaying, true, 'play() 后处于播放态');
eq(JSON.stringify(h.started.map((s) => s.id)), JSON.stringify(['chap_00']), '起始只播 chap_00');
eq(h.el().src, '/ritual-audio/chap_00.mp3', '首章已下发同域路径到元素 src');
eq(h.el().playCalls, 1, '首章恰一次 play()');
for (let i = 0; i < 17; i++) {
  if (!h.narration.isPlaying) break;
  h.el().dispatch('ended');
}
eq(JSON.stringify(h.started.map((s) => s.id)), JSON.stringify(expected), 'ended 逐章推进至末章（顺序续播）');
eq(JSON.stringify(h.ended), JSON.stringify(expected), '每章 ended 回调各一次');
eq(h.complete(), 1, '末章 ended 后触发 onComplete 恰一次');
eq(h.narration.isPlaying, false, '结束后不再处于播放态');
eq(h.el().playCalls, 17, '全部 17 章各恰一次 play()，末章 ended 后不再新播放');
eq(h.ended.length, 17, '末章 ended 不再产生新章节（终止于 17）');
// 顺序：每章请求的 src 与其 id 匹配
ok(h.started.every((s) => s.src === `/ritual-audio/${s.id}.mp3`), '每次续播请求的 src 与章节 id 一致（顺序）');
log(`17 章 ended 链式推进，play() 共 ${h.el().playCalls} 次，onComplete ×${h.complete()}`);

// ══════════════════════════════════════════════════════════════════════
// 3. 单章失败 → 跳过并继续；失败次数有界（无无限重试）
// ══════════════════════════════════════════════════════════════════════
console.log('[3] fail-soft：跳过并继续 / 有界');
const hf = makeHarness();
hf.narration.play(0);
hf.el().dispatch('ended'); // → chap_01
hf.el().dispatch('ended'); // → chap_02
hf.el().dispatch('ended'); // → chap_03
hf.el().error = { code: 2 };
hf.el().dispatch('error'); // chap_03 失败 → 跳过 → chap_04
eq(hf.errors.length, 1, '单章失败记录一次 error');
eq(hf.errors[0].index, 3, '失败的正是 chap_03');
eq(hf.errors[0].reason, '网络错误', '原因可诊断（网络错误），非原始堆栈');
ok(!hf.ended.includes('chap_03'), '失败章不触发 ended（未完成）');
eq(hf.started[hf.started.length - 1].id, 'chap_04', '失败后**继续**下一章 chap_04');
eq(hf.narration.isPlaying, true, '失败后仍在播（未崩、未停）');
hf.el().error = { code: 3 };
hf.el().dispatch('error'); // chap_04 解码失败 → chap_05
eq(hf.errors[1].reason, '解码错误', '解码失败原因可诊断（解码错误）');
eq(hf.started[hf.started.length - 1].id, 'chap_05', '第二次失败继续 chap_05');
log('单章失败：记录可诊断原因 → 跳过 → 继续；播放器不崩');

// 全章失败：失败次数有界（=17），随后零新请求（无无限重试）
const hb = makeHarness();
hb.narration.play(0);
for (let i = 0; i < 40; i++) {
  if (!hb.narration.isPlaying) break;
  hb.el().dispatch('error');
}
eq(hb.errors.length, 17, '全章失败恰 17 次（有界，非无限重试）');
eq(hb.el().playCalls, 17, '请求次数恰 17（每章至多一次）');
eq(hb.narration.isPlaying, false, '达失败上界后停止');
eq(hb.narration.failureCount, 17, 'failureCount = 上界 17');
const reqAfter = hb.el().playCalls;
hb.el().dispatch('error');
eq(hb.el().playCalls, reqAfter, '停止后再派发 error 不产生任何新请求');
log('全章失败：17 次即止（NARRATION_MAX_FAILURES），无无限重试');

// ══════════════════════════════════════════════════════════════════════
// 4. dispose()：暂停、清 src、清监听、零后续播放/请求
// ══════════════════════════════════════════════════════════════════════
console.log('[4] dispose 释放');
const hd = makeHarness();
hd.narration.play(0);
hd.el().dispatch('ended'); // → chap_01（元素仍在用）
const elBefore = hd.el();
const pauseBefore = elBefore.pauseCalls;
const playBefore = elBefore.playCalls;
eq(elBefore.listenerCount() > 0, true, 'dispose 前元素上挂有监听器');
hd.narration.dispose();
eq(hd.narration.isDisposed, true, 'dispose() 置 disposed');
eq(hd.narration.isPlaying, false, 'dispose() 后非播放态');
eq(hd.el().src, '', 'dispose() 后元素 src 清空');
eq(elBefore.listenerCount(), 0, 'dispose() 后全部监听器移除');
ok(elBefore.pauseCalls > pauseBefore, 'dispose() 暂停了元素');
const playAfter = elBefore.playCalls;
elBefore.dispatch('ended');
elBefore.dispatch('error');
eq(elBefore.playCalls, playAfter, 'dispose() 后再派发事件不产生新播放');
eq(hd.started.length, 2, 'dispose() 后不再推进章节');
eq(playBefore >= 2, true, 'dispose() 前已播放 2 章（对照）');
log('dispose：暂停 + 清 src + 清监听 + 零后续播放/请求');

// ══════════════════════════════════════════════════════════════════════
// 5. 音量派生自既有唯一时间轴 envelopeAt(sec)；无自抄阈值、无第二计时器
// ══════════════════════════════════════════════════════════════════════
console.log('[5] 音量派生自 envelopeAt（单一时间轴）');
eq(M.NARRATION_ENVELOPE_LAYER, 'water', '音量取包络层 = water（与既有时间轴同源）');
const hv = makeHarness();
hv.narration.play(0);
for (const sec of [0, 180, 500, 1020, 1440, 1750, 1751, 1800]) {
  hv.narration.setRitualTime(sec);
  near(hv.narration.volume, P.envelopeAt(sec)[M.NARRATION_ENVELOPE_LAYER], 1e-12,
    `t=${sec}s 音量恒等于 envelopeAt(${sec}).water`);
}
near(hv.narration.volume, 0, 1e-12, 't=1800s（silence）音量 = 0');
eq(hv.el().volume, hv.narration.volume, 'setRitualTime 已实时应用到元素 volume');
const rn = readSrc('src/audio/ritualNarration.ts');
ok(/from\s+'\.\/phaseEnvelope'/.test(rn), '模块自 phaseEnvelope 取包络');
ok(/envelopeAt/.test(rn), '模块调用 envelopeAt（单一时间轴）');
ok(!/\b(180|1020|1440|1751|1800)\b/.test(rn), '模块无自抄阈值数字（180/1020/1440/1751/1800）');
ok(!/setInterval|setTimeout|requestAnimationFrame/.test(rn), '模块无任何自带计时器（无第二套时间轴）');
log('音量 = envelopeAt(sec).water，实时下发元素；无自抄阈值、无独立计时器');

// ══════════════════════════════════════════════════════════════════════
// 6. 对外文本无工程化字样；模块不混入网络/UI/场景
// ══════════════════════════════════════════════════════════════════════
console.log('[6] 对外文本无工程化字样 / 职责单一');
// 对外文本（消息）严禁：对象存储/工程/文件名/调试 字样
const MSG_FORBIDDEN = /bucket|worker|\bs3\b|\br2\b|\boss\b|secret|credential|\btoken\b|stack|\.mp3|ritual-audio|chap_|debug|console/i;
// 模块源码（去注释）严禁工程化实现字样（路由前缀与 manifest id 属正常组成，不在此列）
const SRC_FORBIDDEN = /bucket|worker|\bs3\b|\br2\b|\boss\b|secret|credential|\btoken\b|debug|console\./i;
const hx = makeHarness();
hx.narration.play(0);
hx.el().error = { code: 2 };
for (let i = 0; i < 20 && hx.narration.isPlaying; i++) hx.el().dispatch('error');
const reasons = hx.errors.map((e) => e.reason);
ok(reasons.length >= 1, '已采集到对外错误文本');
ok(reasons.every((r) => !MSG_FORBIDDEN.test(r)), '对外错误文本不含工程化字样（bucket/Worker/S3/文件名/调试）');
ok(hx.errors.every((e) => e.keys === 'id,index,reason'), '错误对象仅含 {id,index,reason}（无 URL/堆栈）');
// 源码审计（去注释）：无工程化字样、无 console 调试、无越界依赖
ok(!SRC_FORBIDDEN.test(rn), '模块源码（去注释）无工程化实现字样');
ok(!/console\./.test(rn), '模块无 console 调试输出');
ok(!/from\s+'\.\.\/three|from\s+'react|from\s+'\.\.\/components/.test(rn), '模块不引 Three.js / React / UI 组件（单一职责）');
const imports = [...rn.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
eq(JSON.stringify(imports), JSON.stringify(['./phaseEnvelope']), '模块仅依赖 phaseEnvelope（无网络/UI/场景）');
log(`对外错误文本样例：${JSON.stringify([...new Set(reasons)])}；模块仅依赖 ./phaseEnvelope`);

// eslint 之外：确认锚点模块未被误接公共页（本轮不接）
const app = readSrc('src/App.tsx');
ok(!/ritualNarration|RitualNarration|narration/.test(app), '本轮公共页未接朗诵（App.tsx 无引用，属 C 阶段）');

// ══════════════════════════════════════════════════════════════════════
// 7. 注册：package.json + 聚合器
// ══════════════════════════════════════════════════════════════════════
console.log('[7] 注册与聚合');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
eq(pkg.scripts['test:narration'], 'node scripts/verify-ritual-narration.mjs', 'package.json 注册 test:narration');
const runner = readSrc('scripts/run-tests.mjs');
ok(/verify-ritual-narration\.mjs/.test(runner), '聚合器 run-tests.mjs 已纳入朗诵套件');

console.log(
  '\n#11-B narration verified on real modules\n' +
  `  manifest：17 章（${ids[0]} … ${ids[16]}），前缀 ${M.RITUAL_AUDIO_BASE_PATH}\n` +
  `  顺序续播：ended 链式推进，末章不再请求；play() 上限 = 章数\n` +
  `  fail-soft：失败可诊断（网络/解码）→ 跳过继续；上界 ${M.NARRATION_MAX_FAILURES} 次即止\n` +
  `  dispose：暂停 + 清 src + 清监听 + 零后续请求\n` +
  `  音量：envelopeAt(sec).${M.NARRATION_ENVELOPE_LAYER}（单一时间轴，无自抄阈值/无独立计时器）\n` +
  `  对外文本：无工程化字样；模块仅依赖 phaseEnvelope\n` +
  `  ${checks} assertions passed.`
);
