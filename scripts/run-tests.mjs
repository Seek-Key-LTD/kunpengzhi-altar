/**
 * #9 · 全量门禁：一条 `npm test` 跑完仓库所有 verify / 断言脚本。
 *
 * 零依赖 —— 只用 node:test 作 runner（不引 vitest 等框架）。每个套件在**子进程**
 * 里独立执行、互不污染；任一失败即非零退出。全部 node 可跑，不需要浏览器 / WebGL。
 *
 * 运行：npm test   （= node --test scripts/run-tests.mjs）
 */
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 顺序即门禁顺序：几何 → 席位排除 → 时间轴 → 双龙（#2）→ 音高 → 投影 → 音频包络（#4）
// → 朗诵模块（#11-B）→ QA 独立复核（#3/#8）→ QA 独立复核（#2/#9）→ QA 独立复核（#4）
const SUITES = [
  ['蝎子楔水路几何（真模块常量）', 'scripts/verify-scorpion-waterway.mjs'],
  ['#00 无极点排除（#3）', 'scripts/verify-wuji-absorber.mjs'],
  ['1800s 五幕时间轴（#8）', 'scripts/verify-ritual-timeline.mjs'],
  ['#10 幕次取景·纯函数+结构（A/B 组）', 'scripts/verify-ceremony-view.mjs'],
  ['水龙×音龙·49 席双向同源（#2）', 'scripts/verify-dual-dragon.mjs'],
  ['无极天听·抛物面焦距与飞碟布置', 'scripts/verify-wuji-geometry.mjs'],
  ['仪式幕次→视觉显隐纯映射', 'scripts/verify-ceremony-visibility.mjs'],
  ['走马灯章节→机位纯几何', 'scripts/verify-lantern-camera.mjs'],
  ['导演台机位模式纯数据表', 'scripts/verify-camera-modes.mjs'],
  ['49 半音 C2→C6（Tone）', 'scripts/assert-semitones.mjs'],
  ['7×7 正交投影', 'scripts/assert-ulam-projection.mjs'],
  ['五阶段音频包络（#4）', 'scripts/verify-audio-envelope.mjs'],
  ['朗诵模块·17 章 manifest（#11-B）', 'scripts/verify-ritual-narration.mjs'],
  ['QA 独立门禁（#3/#8）', 'scripts/qa-verify-issue3-8.mjs'],
  ['QA 独立门禁（#2/#9）', 'scripts/qa-verify-dual-dragon.mjs'],
  ['QA 独立门禁（#4）', 'scripts/qa-verify-audio-envelope.mjs'],
  // #6 荣誉层：数据契约 + #00 三态（44 断言） + 公共入口不可达（15 断言）
  ['荣誉层聚合·#00 三态（#6 T1–T6）', 'scripts/verify-honor-aggregation.mjs'],
  ['荣誉层隔离·import-graph（#6 T9）', 'scripts/verify-honor-isolation.mjs']
];

for (const [name, rel] of SUITES) {
  test(`${name} · ${rel}`, () => {
    const res = spawnSync(process.execPath, [resolve(ROOT, rel)], { cwd: ROOT, encoding: 'utf8' });
    if (res.error) throw res.error;
    const out = (res.stdout || '').trim();
    if (out) console.log(out);
    if (res.status !== 0) {
      throw new Error(
        `套件失败：${rel}（exit ${res.status}）\n--- stderr ---\n${(res.stderr || '').trim()}`
      );
    }
  });
}
