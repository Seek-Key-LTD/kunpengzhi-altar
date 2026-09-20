/**
 * 无极天听 · 布置几何纯函数验收
 *
 * 断言 README/注释里写的"为什么是抛物面"：
 *   · 旋转抛物面 z=z0−c·r² 的焦距 f=1/(4c)，c=0.01 时 f=25
 *   · 焦点在顶点下方 f 处（收向坛底）
 *   · 飞碟悬高/光柱长度由 SEAL_HOVER_Y 推导，不再是魔法数字
 *
 * 运行：node scripts/verify-wuji-geometry.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');

const tmp = mkdtempSync(resolve(tmpdir(), 'wuji-'));
execFileSync(esbuildBin, [
  resolve(ROOT, 'src/data/wujiGeometry.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'wuji.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const W = await import(pathToFileURL(resolve(tmp, 'wuji.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

// 1. 焦距公式：c=0.01 → f=1/(4·0.01)=25
assert.equal(W.paraboloidFocalLength(0.01), 25, '焦距 f=1/(4c)，c=0.01 时 f=25');
assert.equal(W.paraboloidFocalLength(0.04), 6.25, '焦距公式自洽：c=0.04 → f=6.25');

// 2. 音龙抛物面实际常数（从 dualDragon 取）
assert.equal(W.SOUND_PARABOLIC_F, 25, '音龙 c=0.0100 ⟹ f=25');
// 顶点 y = 21.45 + 0.01·9.6² = 21.45 + 0.9216 = 22.3716
assert.ok(Math.abs(W.SOUND_PARABOLIC_VERTEX_Y - (21.45 + 0.01 * 9.6 * 9.6)) < 1e-9,
  '顶点 y = start + c·R²');
// 焦点 z = 顶点 - 25 = 22.3716 - 25 = -2.6284（收向坛底）
assert.ok(Math.abs(W.SOUND_PARABOLIC_FOCUS_Z - (W.SOUND_PARABOLIC_VERTEX_Y - 25)) < 1e-9,
  '焦点 z = 顶点下方一个焦距');
assert.ok(W.SOUND_PARABOLIC_FOCUS_Z < 0, '焦点在坛体基面之下（z<0）');

// 3. 飞碟布置：SEAL_HOVER_Y=12.7，悬高 +4.3 → saucerY=17.0
const lay = W.saucerLayout();
assert.ok(Math.abs(lay.saucerY - 27.5) < 1e-9, '飞碟悬高 = 玉玺(23.2) + 4.3 = 27.5');
assert.ok(Math.abs(lay.beamLen - 4.3) < 1e-9, '光柱长度 = 悬高差 = 4.3');
assert.ok(Math.abs(lay.beamCenterY - 25.35) < 1e-9, '光柱中心 = 中点 = 25.35');

// 4. 单一数据源：saucerLayout 默认值 = SEAL_HOVER_Y=23.2，不硬编码
assert.ok(Math.abs(lay.saucerY - lay.beamLen - 23.2) < 1e-9, '光柱底端落在玉玺高度 23.2');

console.log(
  `wuji-geometry: 焦距 f=${W.SOUND_PARABOLIC_F}，顶点 y=${W.SOUND_PARABOLIC_VERTEX_Y.toFixed(4)}，` +
  `焦点 z=${W.SOUND_PARABOLIC_FOCUS_Z.toFixed(4)}（坛底之下）；飞碟 y=${lay.saucerY}，光柱 ${lay.beamLen}`
);
