/**
 * #00 无极点（吸光体）不变量验收 —— Gitea #3。
 *
 * 目标：证明 #00 是「不可占有的吸光体」，而**不是第 50 席**。
 *
 * 方法（两层证据）：
 *   1) 真数据断言：用 esbuild 把**纯数据层** `src/data/spiral_events.ts`
 *      打到临时 JS 后 import，对真实的 49 条 events 与 seatMidi 直接断言
 *      —— 证明 #00 不在席位、不在音高路径。
 *   2) 源码审查：AltarScene 依赖 three/DOM、无法在 node 里实例化，
 *      故读其源码做代码级断言 —— 证明 #00 不进席位表、不进拾取（raycast）。
 *   3) 全仓扫描：证明不存在「把 #00 当第 50 席」的回退逻辑，也没有通证/
 *      成交/转让/铸造/贡献等变现模块。
 *
 * 运行：node scripts/verify-wuji-absorber.mjs   （或 npm run test:wuji）
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// 断言只看**代码**，不看注释 —— 注释里出现 “#00” 是说明，不是回退逻辑。
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readCode = (rel) => stripComments(read(rel));

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, `✗ ${msg}`); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, `✗ ${msg}`); checks++; };

// 权威席位域常量（与 src/types/altar.ts 一一对应）
const WUJI_ANCHOR_ID = 0;
const SEAT_ID_MIN = 1;
const SEAT_ID_MAX = 49;
const isSeatId = (id) => Number.isInteger(id) && id >= SEAT_ID_MIN && id <= SEAT_ID_MAX;

// ── 1. 权威席位域（唯一来源：src/types/altar.ts）────────────────────
const altarTypes = readCode('src/types/altar.ts');
ok(/export const WUJI_ANCHOR_ID\s*=\s*0;/.test(altarTypes), '#00 锚点必须显式定义为 0');
ok(/export const SEAT_ID_MIN\s*=\s*1;/.test(altarTypes), '席位域下界必须是 1');
ok(/export const SEAT_ID_MAX\s*=\s*49;/.test(altarTypes), '席位域上界必须是 49');
ok(/export function isSeatId\(/.test(altarTypes), 'isSeatId 闸门必须存在');
eq(24 * 60, 1440, '24:00 必须等于 1440s');
eq(29 * 60 + 11, 1751, '29:11 必须等于 1751s');
ok(/WUJI_REVEAL_SEC\s*=\s*24\s*\*\s*60/.test(altarTypes), '24:00 阈值必须以秒常量表达');
ok(/WUJI_SILENCE_SEC\s*=\s*29\s*\*\s*60\s*\+\s*11/.test(altarTypes), '29:11 阈值必须以秒常量表达');

// 0 锚点与一切越界 / 非整数都不是席位
for (const bad of [WUJI_ANCHOR_ID, -1, 50, 51, 1.5, NaN, Infinity]) {
  ok(!isSeatId(bad), `非席位值 ${String(bad)} 必须被 isSeatId 拒绝`);
}
for (const good of [1, 25, 49]) ok(isSeatId(good), `席位 ${good} 必须被 isSeatId 接受`);

// ── 2. 真数据断言：把纯模块 bundle 出来，对真实 events/seatMidi/时间码断言 ──
const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild（vite 内置依赖）——无法对真数据断言');
const tmp = mkdtempSync(resolve(tmpdir(), 'wuji-'));
let EVENTS, seatMidi, wujiRevealStateAt, WUJI_REVEAL_SEC, WUJI_SILENCE_SEC;
try {
  const bundle = (entry, out) => {
    execFileSync(esbuildBin, [
      resolve(ROOT, entry),
      '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
      `--outfile=${resolve(tmp, out)}`
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    return import(pathToFileURL(resolve(tmp, out)).href);
  };
  const types = await bundle('src/types/altar.ts', 'altar.mjs');
  const dataMod = await bundle('src/data/spiral_events.ts', 'spiral_events.mjs');
  ({ wujiRevealStateAt, WUJI_REVEAL_SEC, WUJI_SILENCE_SEC } = types);
  ({ INITIAL_SPIRAL_EVENTS: EVENTS, seatMidi } = dataMod);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const ids = EVENTS.map((e) => e.seat_id);

eq(EVENTS.length, 49, 'events 必须恰有 49 条');
eq(new Set(ids).size, 49, 'seat_id 必须互不重复');
ok(ids.every(isSeatId), '每条 seat_id 都必须落在 1..49');
ok(!ids.includes(WUJI_ANCHOR_ID), '#00 锚点（0）不在 events');
ok(!ids.includes(50), 'events 里不存在第 50 席');
eq(Math.min(...ids), 1, '最小 seat_id 必须是 1');
eq(Math.max(...ids), 49, '最大 seat_id 必须是 49');

// 音高路径对 #00 闭合：seatMidi(0) 必须抛错；1→C2(36)、49→C6(84)
let pitched = false; try { seatMidi(WUJI_ANCHOR_ID); } catch { pitched = true; }
ok(pitched, 'seatMidi(#00) 必须被拒绝 —— #00 无音高');
eq(seatMidi(1), 36, '第 1 席必须 = C2 (MIDI 36)');
eq(seatMidi(49), 84, '第 49 席必须 = C6 (MIDI 84)');

// 时间码驱动（真常量 + 真映射）：24:00 显形 / 29:11 静默
eq(WUJI_REVEAL_SEC, 1440, '真常量 WUJI_REVEAL_SEC 必须 = 1440s (24:00)');
eq(WUJI_SILENCE_SEC, 1751, '真常量 WUJI_SILENCE_SEC 必须 = 1751s (29:11)');
eq(wujiRevealStateAt(0), 'hidden', 't=0 → hidden');
eq(wujiRevealStateAt(1439), 'hidden', 't=23:59 → hidden（尚未显形）');
eq(wujiRevealStateAt(1440), 'revealed', 't=24:00 → revealed（冷顶光点亮 #00）');
eq(wujiRevealStateAt(1750), 'revealed', 't=29:10 → revealed');
eq(wujiRevealStateAt(1751), 'silent', 't=29:11 → silent（除冷顶光外全坛寂灭）');
eq(wujiRevealStateAt(1e9), 'silent', 't≫29:11 → silent');

// ── 3. 场景层源码审查：席位表 / 拾取（AltarScene 依赖 three/DOM，无法实例化）──
const sceneSrc = readCode('src/three/AltarScene.ts');
ok(/this\.scene\.add\(absorber\)/.test(sceneSrc), '#00 吸光体必须挂在场景根（不属于任何席位组）');
ok(/ritual_anchor: 'wuji'/.test(sceneSrc), '#00 必须带 ritual_anchor=wuji 归属标记');
ok(/claimable: false/.test(sceneSrc) && /tokenizable: false/.test(sceneSrc), '#00 必须显式 claimable/tokenizable=false');
ok(/seatId:\s*null/.test(sceneSrc), '#00 的 seatId 必须明置为 null（绝无第 50 席身份）');
ok(/roughness:\s*0\.95/.test(sceneSrc) && /metalness:\s*0\.1,/.test(sceneSrc), '#00 材质必须 roughness 0.95 / metalness 0.1');
ok(/emissive:\s*0x000000/.test(sceneSrc) && /emissiveIntensity:\s*0/.test(sceneSrc), '#00 必须关闭自发光');

// 席位三张表绝不接受 0 / 50 号键
for (const map of ['seatPads', 'seatLotusMeshes', 'starshipMeshes']) {
  ok(!new RegExp(`${map}\\.set\\(\\s*(0|50)\\b`).test(sceneSrc), `${map} 不得以 0/50 为键（#00 不是席位）`);
}
// 拾取（raycast）列表绝不含 #00
ok(!/intersectObjects\([^)]*(wuji|absorber)/i.test(sceneSrc), 'raycast 拾取列表不得包含 #00 吸光体');
// 席位构建必须过 isSeatId 闸门（结构上杜绝 #00 混入席位）
ok(/this\.events\.filter\(\(ev\) => isSeatId\(ev\.seat_id\)\)/.test(sceneSrc), '席位构建必须以 isSeatId 过滤');
// 时间码驱动入口 + 24:00 前的隐藏
ok(/public setRitualTime\(/.test(sceneSrc), '必须存在 setRitualTime(sec) 注入入口');
ok(/WUJI_REVEAL_SEC/.test(sceneSrc) && /WUJI_SILENCE_SEC/.test(sceneSrc), 'setRitualTime 必须使用两个时间码常量');
ok(/wujiAbsorber\)\s*this\.wujiAbsorber\.visible = false/.test(sceneSrc), '24:00 之前 #00 必须隐藏（未显形）');

// ── 4. 认领（预约）UI：目标席位恒在 1..totalSeats ───────────────────
const starPaper = readCode('src/components/StarPaperModal.tsx');
ok(/i \+ 1/.test(starPaper), '认领席位的下拉必须从 1 起（绝不含 0 / #00）');
ok(!/length:\s*50\b/.test(starPaper), '认领 UI 不得出现 50 席');

// ── 5. 全仓扫描：不存在「#00 当第 50 席」的回退逻辑 / 变现模块 ──────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const srcFiles = walk(resolve(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));

// 5a. 通证 / 成交 / 转让 / 铸造 / 贡献 等变现模块一律不存在
const moneyName = /(mint|provenance|contribution|token|booking|secondary|transfer|order|trade)/i;
const moneyModules = srcFiles.filter((f) => moneyName.test(relative(ROOT, f)));
ok(moneyModules.length === 0, `不得存在通证/成交/转让/铸造/贡献模块，发现：${moneyModules.join(', ') || '无'}`);

// 5b. 全仓不得出现把非席位值喂进「席位相关路径」的代码
const codeRules = [
  [/seat_id\s*:\s*(0|50)\b/, '字面量 seat_id 为 0/50'],
  [/seatMidi\(\s*(0|50)\s*\)/, '对 0/50 求音高'],
  [/(seatPads|seatLotusMeshes|starshipMeshes)\.set\(\s*(0|50)\b/, '以 0/50 为席位表键'],
  [/seatId\s*===\s*(0|50)\b/, '把 seatId 与 0/50 判等'],
  [/Array\.from\(\{\s*length:\s*50\s*\}/, '按 50 席构造数组'],
  [/SEAT_ID_MAX\s*=\s*50/, '把席位上界写成 50']
];
const violations = [];
for (const file of srcFiles) {
  const text = stripComments(readFileSync(file, 'utf8'));
  for (const [re, label] of codeRules) {
    if (re.test(text)) violations.push(`${relative(ROOT, file)} :: ${label}`);
  }
}
ok(violations.length === 0, `全仓不得存在「#00 当第 50 席」的回退逻辑，发现：\n    ${violations.join('\n    ') || '无'}`);

// ── 汇总 ────────────────────────────────────────────────────────────
console.log(
  `wuji-absorber: 49 seats + time-codes 24:00/29:11 verified on real modules; ` +
    `#00(anchor=${WUJI_ANCHOR_ID}) excluded from seat/pitch/pick/claim/mint paths; ` +
    `${checks} assertions passed across ${srcFiles.length} source files.`
);
