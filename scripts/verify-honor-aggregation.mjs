/**
 * 荣誉层聚合验收 —— Gitea #6 · T8。
 *
 * 用 esbuild 把**真模块**打进临时目录后 import（沿用 `verify-audio-envelope.mjs` 取真值方式）：
 *   · src/honor/aggregate.ts   — 聚合纯函数 + #00 三态
 *   · src/honor/publicView.ts  — 公共只读投影（中性词表）
 *   · src/honor/fixture.ts     — 替身数据（无后端）
 *   · src/honor/naming.ts      — 花名制判据
 *   · src/types/altar.ts       — 席位域权威（isSeatId / WUJI_ANCHOR_ID / SEAT_ID_MAX）
 *
 * 覆盖设计书 §3.2 的 E1–E12、§3.6 的 E13–E14、§2.3 的 P1–P5。
 * 断言全部 import 自真模块，阈值**不手抄**。
 *
 * 运行：node scripts/verify-honor-aggregation.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, `✗ ${m}`); checks++; };
const deep = (a, b, m) => { assert.deepEqual(a, b, `✗ ${m}`); checks++; };
const near = (a, b, eps, m) => {
  assert.ok(Math.abs(a - b) <= eps, `✗ ${m}（${a} vs ${b}，容差 ${eps}）`);
  checks++;
};
const log = (m) => console.log(`   · ${m}`);

const esbuildBin = resolve(ROOT, 'node_modules/.bin/esbuild');
ok(existsSync(esbuildBin), '缺少 esbuild —— 无法对真模块断言');

const tmp = mkdtempSync(resolve(tmpdir(), 'honor-'));
const bundle = (rel, out) => {
  execFileSync(esbuildBin, [
    resolve(ROOT, rel),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, out)}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return import(pathToFileURL(resolve(tmp, out)).href);
};

let AG, PV, FX, NM, A;
try {
  AG = await bundle('src/honor/aggregate.ts', 'aggregate.mjs');
  PV = await bundle('src/honor/publicView.ts', 'publicView.mjs');
  FX = await bundle('src/honor/fixture.ts', 'fixture.mjs');
  NM = await bundle('src/honor/naming.ts', 'naming.mjs');
  A = await bundle('src/types/altar.ts', 'altar.mjs');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const ranking = FX.FIXTURE_RANKING;
const anchors = FX.FIXTURE_ANCHORS;
const credentials = FX.FIXTURE_CREDENTIALS;

console.log('\n══ #6 荣誉层聚合 · 机械取证（E1–E14 / P1–P5）══\n');

// ══════════════════════════════════════════════════════════════════════
// E1–E2 · 席位域权威 & #00 不在域内
// ══════════════════════════════════════════════════════════════════════
console.log('[E1–E2] 席位域权威');
eq(A.isSeatId(A.WUJI_ANCHOR_ID), false, 'E1 isSeatId(WUJI_ANCHOR_ID) === false');
eq(A.WUJI_ANCHOR_ID, 0, 'E2 WUJI_ANCHOR_ID === 0');

// ══════════════════════════════════════════════════════════════════════
// E3–E6 · 三态查找（excluded / absent / value）
// ══════════════════════════════════════════════════════════════════════
console.log('[E3–E6] 三态查找');
deep(AG.lookupSeatHonor(0, ranking), { kind: 'excluded', reason: 'wuji_anchor' },
  'E3 lookupSeatHonor(0) → excluded(wuji_anchor)');
for (const n of [-1, 50, 1.5, Number.NaN, -0.5]) {
  deep(AG.lookupSeatHonor(n, ranking), { kind: 'excluded', reason: 'out_of_domain' },
    `E4 lookupSeatHonor(${n}) → excluded(out_of_domain)`);
}
// E5：本期 credits 为 0 的合法席位 → value:0（证明 0 是值）
const seat1 = ranking.entries.find((e) => e.seatId === 1);
eq(seat1.credits, 0, 'E5 前置：替身 #1 本期 credits === 0');
deep(AG.lookupSeatHonor(1, ranking), { kind: 'value', value: 0 }, 'E5 lookupSeatHonor(1) → value:0（0 是值）');
// E6：新席无上期快照 → absent（证明缺项 ≠ 0）
const seat2 = ranking.entries.find((e) => e.seatId === 2);
eq(seat2.creditsPrev, null, 'E6 前置：替身 #2 creditsPrev === null（新席）');
deep(AG.lookupPrevCredits(2, ranking), { kind: 'absent' }, 'E6 lookupPrevCredits(2) → absent（缺项 ≠ 0）');
// 合法席位但本期有条目、有上期 → value
ok(AG.lookupPrevCredits(3, ranking).kind === 'value', 'E6b 有上期的合法席位 → value');
// 合法席位但本期无条目 → absent
const onlySeat1 = { ...ranking, entries: [seat1] };
deep(AG.lookupSeatHonor(5, onlySeat1), { kind: 'absent' }, 'E6c 合法席位本期无条目 → absent');

// ══════════════════════════════════════════════════════════════════════
// E7–E8 · #00 永不入聚合条目
// ══════════════════════════════════════════════════════════════════════
console.log('[E7–E8] 聚合 #00 排除');
const agg = AG.aggregateHonor(ranking, anchors);
eq(agg.badges.some((b) => b.seatIndex === A.WUJI_ANCHOR_ID), false, 'E7 badges 不含 seatIndex===0');
eq(agg.badges.every((b) => A.isSeatId(b.seatIndex)), true, 'E8 badges 每条 seatIndex 均满足 isSeatId');
ok(agg.badges.length <= A.SEAT_ID_MAX, 'E7b badges 长度 ≤ SEAT_ID_MAX(49)');

// ══════════════════════════════════════════════════════════════════════
// E9–E10 · 分母 49 / 凭证 #00 排除
// ══════════════════════════════════════════════════════════════════════
console.log('[E9–E10] 分母与凭证');
eq(AG.countCommissionedSeats(ranking).matched, A.SEAT_ID_MAX, 'E9 countCommissionedSeats().matched === SEAT_ID_MAX(49，非 50)');
deep(AG.lookupCredential(AG.tokenIdOf(A.WUJI_ANCHOR_ID), credentials), { kind: 'excluded', reason: 'wuji_anchor' },
  'E10 lookupCredential(tokenIdOf(0)) → excluded');
// meanCredits 分母不含 #00：#00 条目即便携带巨大 credits 也不改变均值
const withWuji = {
  ...ranking,
  entries: [{ seatId: 0, node: '青圭', rank: 0, delta: 'same', credits: 999999, creditsPrev: null }, ...ranking.entries]
};
near(AG.meanCredits(withWuji), AG.meanCredits(ranking), 1e-12, 'E10b meanCredits 分母不含 #00（加 #00 巨额条目均值不变）');

// ══════════════════════════════════════════════════════════════════════
// E11–E12 · 公共投影 / 对象键
// ══════════════════════════════════════════════════════════════════════
console.log('[E11–E12] 公共投影 / 对象键');
const view = PV.toPublicView(ranking, anchors);
eq(view.badges.every((b) => b.seatIndex !== A.WUJI_ANCHOR_ID), true, 'E11 toPublicView().badges 逐条 seatIndex !== 0');
eq(Object.keys(AG.contributionTotals(ranking)).includes('0'), false, 'E12 contributionTotals 键不含字符串 "0"');
eq(Object.keys(AG.contributionTotals(withWuji)).includes('0'), false, 'E12b 含 #00 条目时仍不产生 "0" 键');

// ══════════════════════════════════════════════════════════════════════
// E13–E14 · 花名制红线（node / glyph）
// ══════════════════════════════════════════════════════════════════════
console.log('[E13–E14] 花名制红线');
const allNames = [
  ...ranking.entries.map((e) => e.node),
  ...credentials.map((c) => c.node),
  ...view.badges.map((b) => b.glyph)
];
ok(allNames.length > 0, 'E13 前置：已采集 node/glyph 取值');
eq(allNames.every((n) => /^[\u4e00-\u9fff]{2,6}$/.test(n)), true, 'E13 全部 node/glyph 匹配 /^[\\u4e00-\\u9fff]{2,6}$/');
eq(allNames.every((n) => NM.isPublicPersonalName(n)), true, 'E13b 全部 node/glyph 通过 isPublicPersonalName');
const ORG = ['@', '.', '公司', '集团', '院', '所', '大学'];
eq(allNames.every((n) => ORG.every((m) => !n.includes(m))), true, 'E14 node/glyph 不含 @ / . / 公司 / 集团 / 院 / 所 / 大学');
// 反例：机构名必须被拒
eq(NM.isPublicPersonalName('腾讯公司'), false, 'E14b 「腾讯公司」被判不合规');
eq(NM.isPublicPersonalName('a@b.co'), false, 'E14c 邮箱被判不合规');
eq(NM.isPublicPersonalName('青圭'), true, 'E14d 合规花名被接受');

// ══════════════════════════════════════════════════════════════════════
// P1–P5 · 公共只读投影规则
// ══════════════════════════════════════════════════════════════════════
console.log('[P1–P5] 公共投影规则');
// P1
ok(view.badges.length <= A.SEAT_ID_MAX, 'P1 badges.length ≤ 49');
ok(view.badges.every((b) => A.isSeatId(b.seatIndex)), 'P1 badges 逐条 isSeatId(seatIndex)');
// P2：字段集精确（不含 credits/node/tokenId/snapshotHash/basis/epoch）
eq(JSON.stringify(Object.keys(view).sort()), JSON.stringify(['badges', 'periodTag', 'seatDomainSize', 'vacantApex']),
  'P2 PublicHonorView 字段集恰 {periodTag,badges,vacantApex,seatDomainSize}');
eq(view.badges.every((b) => JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['changed', 'glyph', 'ordinal', 'seatIndex'])),
  true, 'P2 每条 badge 字段集恰 {seatIndex,ordinal,glyph,changed}（无 credits/node/tokenId/…）');
eq(['credits', 'creditsPrev', 'node', 'tokenId', 'snapshotHash', 'basis', 'epoch'].every((k) => !Object.keys(view).includes(k)),
  true, 'P2 视图顶层不含任何管理面字段名');
// P3
eq(view.badges.every((b) => NM.isPublicPersonalName(b.glyph)), true, 'P3 glyph 经花名白名单校验');
// P4（运行期值）
eq(view.vacantApex, true, 'P4 vacantApex === true');
eq(view.seatDomainSize, A.SEAT_ID_MAX, 'P4 seatDomainSize === SEAT_ID_MAX(49)');
// P5：非席位 / #00 / 域外条目不投影（不补 0）
const dirty = {
  ...ranking,
  entries: [
    { seatId: 0, node: '青圭', rank: 0, delta: 'same', credits: 7, creditsPrev: null },
    { seatId: 50, node: '玄石', rank: 50, delta: 'same', credits: 7, creditsPrev: null },
    { seatId: 1.5, node: '素问', rank: 3, delta: 'same', credits: 7, creditsPrev: null },
    seat1
  ]
};
const dirtyView = PV.toPublicView(dirty, anchors);
eq(dirtyView.badges.length, 1, 'P5 非席位/#00/域外条目一律不投影（仅剩 1 条合法）');
eq(dirtyView.badges[0].seatIndex, 1, 'P5 仅剩的正是合法席位 #1');
eq(dirtyView.badges.some((b) => b.seatIndex === 0), false, 'P5 不补 0（#00 不进投影）');
// 幂等：同输入同输出
eq(JSON.stringify(PV.toPublicView(ranking, anchors)), JSON.stringify(PV.toPublicView(ranking, anchors)), 'P-幂等 toPublicView 同输入恒同输出');
eq(JSON.stringify(AG.aggregateHonor(ranking, anchors)), JSON.stringify(AG.aggregateHonor(ranking, anchors)), '幂等 aggregateHonor 同输入恒同输出');

console.log(
  '\n#6 honor aggregation verified on real modules\n' +
  `  E1–E14 全绿；P1–P5 全绿\n` +
  `  席位域权威：isSeatId(${A.WUJI_ANCHOR_ID})=false；#00 三态 excluded(wuji_anchor)；越界/非整数 out_of_domain\n` +
  `  三态：value:0 是值（#1）；absent 是缺项（#2 新席）；excluded 是域外（#00/负数/50/1.5/NaN）\n` +
  `  聚合：badges≤49 且无一为 #00；计数分母恒 ${A.SEAT_ID_MAX}；meanCredits/contributionTotals 不含 #00\n` +
  `  公共投影：badges≤49、中性词表 {seatIndex,ordinal,glyph,changed}、vacantApex:true、seatDomainSize:49\n` +
  `  ${checks} assertions passed.`
);
