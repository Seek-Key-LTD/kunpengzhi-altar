/**
 * 观礼人体尺度红线（Issue #20 · P0）+ 导演/工程能力隔离（#5/#6）验收。
 *
 * 红线口径：公共入口（guest）禁止自由飞行、禁止一切写/拾取能力——行为逐字节保持原样；
 * 能力按 guest → authenticated → director 分级放开；游客安全档位数值是规格锚，
 * 源码注释明言「游客档位一个数字都不能动」。断言全部取自真模块 `src/types/altar.ts`，
 * 脚本不自抄任何能力位/安全常量——角色表改了，这里必须跟着红或跟着绿。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const esbuild = resolve(ROOT, 'node_modules/.bin/esbuild');
assert.ok(existsSync(esbuild), '缺少 esbuild（vite 内置依赖）');

const tmp = mkdtempSync(resolve(tmpdir(), 'redline-'));
let altar;
try {
  execFileSync(esbuild, [
    resolve(ROOT, 'src/types/altar.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'altar.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  altar = await import(pathToFileURL(resolve(tmp, 'altar.mjs')).href);
} finally {
  rmSync(resolve(tmp, 'altar.mjs'), { recursive: true, force: true });
}

const { ROLE_CAPABILITIES, CAMERA_SAFETY_BY_ROLE, CAMERA_DISTANCE_BY_ROLE, GUEST_ROUTINES } = altar;

let passed = 0;
function ok(cond, message) {
  assert.ok(cond, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

// —— 1. #20 红线：公共入口（guest）零能力，逐字节原样 ——
const guestCaps = Object.values(ROLE_CAPABILITIES.guest);
ok(guestCaps.length > 0 && guestCaps.every((v) => v === false),
  '红线·guest 全能力位=false（禁飞/禁拾取/禁拓印/禁拆解/禁断代）');

// —— 2. 能力分级放开：认证可自由观览但无圣物形态权，导演全开 ——
ok(ROLE_CAPABILITIES.authenticated.freeCamera === true,
  'authenticated 可自由观览（freeCamera）');
ok(ROLE_CAPABILITIES.authenticated.sealExploded === false
  && ROLE_CAPABILITIES.authenticated.sealEra === false,
  '认证无圣物形态/断代权（讲解权隔离 #5/#6）');
ok(ROLE_CAPABILITIES.director.freeCamera === true
  && ROLE_CAPABILITIES.director.sealExploded === true
  && ROLE_CAPABILITIES.director.sealEra === true,
  '导演席讲解权全开（拆解+断代）');

// —— 3. 安全档位规格锚：游客数值一个数字都不能动 ——
ok(CAMERA_SAFETY_BY_ROLE.guest.minY === 0.3
  && CAMERA_SAFETY_BY_ROLE.guest.maxRadius === 120,
  'guest 安全档位=规格锚（minY=0.3 / maxRadius=120，源码明言不得改动）');
ok(CAMERA_DISTANCE_BY_ROLE.guest.min === 0.8
  && CAMERA_DISTANCE_BY_ROLE.guest.max === 220,
  'guest 推拉范围=规格锚（0.8 / 220）');

// —— 4. 档位单调：越有权限越可贴地/越可远行 ——
const { guest, authenticated, director } = CAMERA_SAFETY_BY_ROLE;
ok(guest.minY >= authenticated.minY && authenticated.minY >= director.minY,
  '离地红线按角色递减：guest ≥ authenticated ≥ director');
ok(guest.maxRadius <= authenticated.maxRadius
  && authenticated.maxRadius <= director.maxRadius,
  '活动半径按角色递增：guest ≤ authenticated ≤ director');
ok(CAMERA_DISTANCE_BY_ROLE.guest.max <= CAMERA_DISTANCE_BY_ROLE.director.max,
  '推拉范围 guest ≤ director');

// —— 5. 游客例行路线白名单：只许预设机位，无自由飞入口 ——
ok(Array.isArray(GUEST_ROUTINES) && GUEST_ROUTINES.length > 0,
  `游客例行路线白名单非空（${GUEST_ROUTINES.length} 条）`);
for (const routine of GUEST_ROUTINES) {
  ok(typeof routine === 'string' && routine.length > 0, `例行路线 ${routine} 为合法 CameraMode`);
}
ok(!GUEST_ROUTINES.includes('free'),
  '白名单不含 free——游客动线只有预设机位（#20 红线）');

console.log(`\n观礼红线：${passed} 条断言通过（能力位/安全常量全部取自真模块）`);
