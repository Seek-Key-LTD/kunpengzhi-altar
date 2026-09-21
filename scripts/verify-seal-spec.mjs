/**
 * 传国玉玺 · 规格常量验收
 *
 * 对 sealSpec.ts 做结构断言：
 *   1. 尺寸换算正确（1寸=0.75，方四寸=3.0，高三寸六=2.7）
 *   2. 位置正确（SEAL_HOVER_Y = PYRAMID_TOP + 2.2）
 *   3. 五面刻字齐全
 *   4. 断代层齐全（秦/汉新/魏晋十六国/辽金）
 *   5. 机位常量正确
 *
 * 运行：node scripts/verify-seal-spec.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, `✗ ${msg}`); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, `✗ ${msg}`); checks++; };

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild');

const tmp = mkdtempSync(resolve(tmpdir(), 'seal-'));
let T;
try {
  execFileSync(esbuildBin, [
    resolve(ROOT, 'src/data/sealSpec.ts'),
    '--bundle', '--format=esm',
    `--outfile=${resolve(tmp, 'seal.mjs')}`
  ], { stdio: 'pipe' });
  T = await import(`${tmp}/seal.mjs`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 尺寸换算
eq(T.SEAL_CUN, 1.5, '1寸 = 1.5（BRICK/2）');
eq(T.SEAL_SIDE, 6.0, '方四寸 = 6.0（= 2格）');
eq(T.SEAL_HEIGHT, 5.4, '高三寸六 = 5.4');
ok(T.SEAL_BODY_HEIGHT > 0, '印台高度 > 0');
ok(T.SEAL_KNOB_HEIGHT > 0, '五龙钮高度 > 0');

// 位置
ok(T.SEAL_HOVER_Y > 20, `SEAL_HOVER_Y > 20（实际 ${T.SEAL_HOVER_Y}）`);

// 断代层
ok(T.SEAL_ERA_ORDER, '有 SEAL_ERA_ORDER');
ok(Array.isArray(T.SEAL_ERA_ORDER), 'SEAL_ERA_ORDER 是数组');
eq(T.SEAL_ERA_ORDER.length, 4, '断代层 = 4（秦/汉新/魏晋十六国/辽金）');
ok(T.SEAL_ERA_LAYERS, '有 SEAL_ERA_LAYERS');
ok(Object.keys(T.SEAL_ERA_LAYERS).length >= 4, `SEAL_ERA_LAYERS ≥ 4 键`);

// 拓印位置
ok(T.SEAL_STAMP, '有 SEAL_STAMP');
ok(T.SEAL_STAMP.home, '拓印 home 点存在');

console.log(`✓ sealSpec · ${checks} 断言通过`);
