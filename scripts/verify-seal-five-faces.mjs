/**
 * 传国玉玺五面刻字 ↔ sealSpec 对齐验收（Issue #1 / #18）。
 *
 * 需求口径：docs/seal-five-faces.md 五面清单——
 *   底面（秦·受命于天）+ 魏晋两面（大魏受汉传国之宝 / 天命在赵）
 *   + 唐西壁（大唐受命宝）+ 宋南壁（大宋承天受命之宝）。
 * 本脚本断言 spec 中**已实现层**的文字与史载比例；唐/宋两面尚未入 spec
 * （需求缺口，见 director-ops 验收台账），此处不为其造断言，防假绿。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const esbuild = resolve(ROOT, 'node_modules/.bin/esbuild');
assert.ok(existsSync(esbuild), '缺少 esbuild（vite 内置依赖）');

const tmp = mkdtempSync(resolve(tmpdir(), 'seal-five-'));
let spec;
try {
  execFileSync(esbuild, [
    resolve(ROOT, 'src/data/sealSpec.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'seal.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  spec = await import(pathToFileURL(resolve(tmp, 'seal.mjs')).href);
} finally {
  rmSync(resolve(tmp, 'seal.mjs'), { recursive: true, force: true });
}

let passed = 0;
function ok(cond, message) {
  assert.ok(cond, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

// —— 1. 底面（秦）：受命于天，既寿永昌 ——
ok(spec.SEAL_ERA_LAYERS.qin.text === '受命于天，既寿永昌',
  '底面·秦刻文字与五面清单一致');
ok(spec.SEAL_ERA_LAYERS.qin.script === '小篆',
  '底面·字形依据=小篆');

// —— 2. 魏晋两面：主刻 + 石勒第二道加刻 ——
ok(spec.SEAL_ERA_LAYERS.weijin.text === '大魏受汉传国之宝',
  '魏晋面·主刻「大魏受汉传国之宝」');
ok(spec.SEAL_WEIJIN_SECOND_INSCRIPTION === '天命在赵',
  '魏晋面·石勒加刻「天命在赵」独立存句（不污染主文案）');

// —— 3. 无字层：金镶玉（汉新）与水蚀（辽金）不承载文字 ——
ok(spec.SEAL_ERA_LAYERS.xin.text === '',
  '汉新层·无字（金镶玉断代层）');
ok(spec.SEAL_ERA_LAYERS.liaojin.text === '',
  '辽金层·无字（桑干河水蚀断代层）');

// —— 4. 史载比例不随绝对尺度漂移：印面:通高 = 4:3.6 ——
const ratio = spec.SEAL_HEIGHT / spec.SEAL_SIDE;
assert.ok(Math.abs(ratio - 3.6 / 4) < 1e-9, `印面:通高比 ${ratio} 必须 = 0.9`);
passed += 1;
console.log('  ✓ 印面:通高 = 4:3.6（史载比例严格成立，SEAL_HEIGHT/SEAL_SIDE=0.9）');

// —— 5. 尺度锚定砖格：1 寸 = 半砖 ——
ok(spec.SEAL_CUN === spec.SEAL_SIDE / 4 && spec.SEAL_SIDE > 0,
  '尺度锚定：SEAL_CUN=半砖，方四寸=SEAL_SIDE');

// —— 6. 需求缺口锚（#18 唐/宋两面未入 spec，台账已记）——
// 五面清单中的「大唐受命宝」「大宋承天受命之宝」当前无对应 era 层。
// 此断言把缺口钉在门禁上：未来补层时本断言转红，提醒同步更新五面清单与台账。
const implementedEras = Object.keys(spec.SEAL_ERA_LAYERS);
ok(!implementedEras.includes('tang') && !implementedEras.includes('song'),
  '缺口锚·唐/宋两面尚未入 spec（补层时更新本断言与验收台账）');

console.log(`\n玉玺五面对齐：${passed} 条断言通过（已实现层逐字核对，缺口显式锚定）`);
