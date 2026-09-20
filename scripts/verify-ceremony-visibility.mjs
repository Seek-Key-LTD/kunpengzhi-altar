/**
 * 仪式幕次 → 视觉显隐 纯映射验收
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(resolve(tmpdir(), 'vis-'));
execFileSync(resolve(ROOT, 'node_modules/.bin/esbuild'), [
  resolve(ROOT, 'src/data/ceremonyVisibility.ts'),
  '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
  `--outfile=${resolve(tmp, 'vis.mjs')}`
], { stdio: ['ignore', 'ignore', 'inherit'] });
const V = await import(pathToFileURL(resolve(tmp, 'vis.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

// abyss：全黑
const abyss = V.ceremonyVisibility('abyss');
assert.ok(abyss.isDark, 'abyss 暗幕');
assert.equal(abyss.outerShellVisible, false, 'abyss 关外壳');
assert.equal(abyss.wujiAbsorberVisible, false, 'abyss 关吸光体');
assert.equal(abyss.ambientLight, 0, 'abyss 灭环境光');
assert.equal(abyss.fogDensity, 0.07, 'abyss 浓雾');

// naming：双龙起、灯屏收
const naming = V.ceremonyVisibility('naming');
assert.ok(!naming.isDark, 'naming 不暗');
assert.equal(naming.dualDragonVisible, true, 'naming 双龙显');
assert.equal(naming.lanternsVisible, false, 'naming 灯屏收');

// lanterns：双龙+灯屏都显
const lanterns = V.ceremonyVisibility('lanterns');
assert.equal(lanterns.dualDragonVisible, true, 'lanterns 双龙显');
assert.equal(lanterns.lanternsVisible, true, 'lanterns 灯屏显');

// extinguishing：灯屏显、双龙收、无极点光起
const ext = V.ceremonyVisibility('extinguishing');
assert.equal(ext.lanternsVisible, true, 'extinguishing 灯屏显');
assert.equal(ext.dualDragonVisible, false, 'extinguishing 双龙收');
assert.equal(ext.wujiLightIntensity, 2.4, 'extinguishing 无极点光 2.4');

// silence：暗幕但外壳留
const sil = V.ceremonyVisibility('silence');
assert.ok(sil.isDark, 'silence 暗幕');
assert.equal(sil.outerShellVisible, true, 'silence 外壳留');
assert.equal(sil.wujiLightIntensity, 2.4, 'silence 无极点光 2.4');

console.log('ceremony-visibility: 5 幕次显隐映射断言通过');
