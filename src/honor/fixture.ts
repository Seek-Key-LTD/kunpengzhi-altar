// 荣誉层数据替身 —— Gitea #6 · T6
//
// ⚠️⚠️ **本阶段无后端：此处为「替身」数据。接真源时【整文件删除】。** ⚠️⚠️
//
// 依据设计书 §2.4：本仓库没有后端资产表，`src/` 下唯一"数据层"是 `src/data/*.ts`（静态常量）。
// 因此：
//   · 席位锚点**不复制**席位数据，直接由公共侧权威 `src/data/spiral_events.ts` 引用派生；
//   · 月度座次 / 证据快照 / 凭证为**构造的替身**，接真源时本文件整体移除。
//
// 数据须满足设计书 §3.2：E5（合法席位 credits 为 0 → value:0）与
// E6（新席无上期快照 → absent）两种情形各至少 1 例（见下方 seatId 1 / seatId 2）。

import { INITIAL_SPIRAL_EVENTS } from '../data/spiral_events';
import { tokenIdOf } from './aggregate';
import type {
  BasisRef,
  CredentialExhibit,
  EpochTag,
  EvidenceSnapshot,
  MonthlyRanking,
  RankChange,
  RankDiffReason,
  RankEntry,
  SeatAnchor
} from './types';

/** 替身期次（自然月口径，设计书 §7-1 默认假设）。 */
export const FIXTURE_EPOCH: EpochTag = '2026-09';

/**
 * 49 条固定席位锚点。**引用**公共侧席位权威（`spiral_events.ts`）派生，
 * 不复制坐标/时序/音高 —— 席位是地理，不是评价。
 */
export const FIXTURE_ANCHORS: readonly SeatAnchor[] = INITIAL_SPIRAL_EVENTS.map((event) => ({
  seatId: event.seat_id,
  status: event.seat_status,
  isPrime: event.is_prime,
  isFinale: event.is_finale
}));

/** 替身花名（2–3 汉字，无机构/邮箱特征；满足 §3.6 花名制红线）。 */
const PERSONAS: readonly string[] = [
  '青圭', '玄石', '素问', '白露', '沧浪', '流火', '孤鸿', '寒山', '听松', '拾贝',
  '望舒', '长风', '折枝', '问渠', '漱石', '衔月', '惊蛰', '残雪', '漱玉', '扶摇',
  '朝暾', '夕照', '竹喧', '莲动', '浣沙', '采薇', '蒹葭', '溯洄', '宛在', '溯游',
  '雎鸠', '参差', '寤寐', '辗转', '琴瑟', '钟鼓', '采苓', '于以', '薄言', '蔽芾',
  '猗嗟', '猗重', '淇奥', '考槃', '硕人', '偕老', '鹿鸣', '呦呦', '采苹'
];

/** 替身座次条目：E5 例（#1 本期 credits=0）、E6 例（#2 新席，creditsPrev=null）。 */
const FIXTURE_ENTRIES: readonly RankEntry[] = FIXTURE_ANCHORS.map((anchor, i): RankEntry => {
  const seatId = anchor.seatId;
  const node = PERSONAS[i % PERSONAS.length];
  if (seatId === 1) {
    // E5：合法席位，本期 credits 为 0 → 查找应得 { kind:'value', value:0 }（0 是值）。
    return { seatId, node, rank: 1, delta: 'same', credits: 0, creditsPrev: 0 };
  }
  if (seatId === 2) {
    // E6：新席，无上期快照 → 上期查找应得 { kind:'absent' }（缺项 ≠ 0）。
    return { seatId, node, rank: 2, delta: 'new', credits: 12, creditsPrev: null };
  }
  const delta: RankChange = i % 3 === 0 ? 'up' : i % 3 === 1 ? 'down' : 'same';
  const credits = 100 - seatId;
  const creditsPrev = credits + (i % 2 === 0 ? 5 : -5);
  return { seatId, node, rank: seatId, delta, credits, creditsPrev };
});

/** 替身变动原因（§5 硬要求：不得为空数组）。 */
const FIXTURE_DIFF_REASONS: readonly RankDiffReason[] = [
  { seatId: 1, kind: 'inflow', sourceRefs: ['debate:2026-09-001'], note: '本期新晋内容参与' },
  { seatId: 2, kind: 'endorsement', sourceRefs: ['paper:2026-09-014', 'debate:2026-09-021'], note: '他席引用其论辩证据' },
  { seatId: 7, kind: 'downgrade', sourceRefs: ['debate:2026-09-033'], note: '引用撤回，按快照回撤' }
];

/** 替身：一个 epoch 的月度座次。 */
export const FIXTURE_RANKING: MonthlyRanking = {
  epoch: FIXTURE_EPOCH,
  frozenSnapshotId: 'snap-2026-09-frozen',
  entries: FIXTURE_ENTRIES,
  diffReasons: FIXTURE_DIFF_REASONS
};

const FIXTURE_BASIS: readonly BasisRef[] = [
  { claimId: 'debate:2026-09-001', kind: 'debate', ts: 1757000000000 },
  { claimId: 'paper:2026-09-014', kind: 'paper', ts: 1757003600000 }
];

/** 替身：证据快照（落账存快照，不存引用）。 */
export const FIXTURE_EVIDENCE: readonly EvidenceSnapshot[] = [
  {
    snapshotId: 'ev-2026-09-001',
    snapshotHash: 'sha256:0f1e2d3c4b5a6978',
    frozenBody: '替身证据正文（接真源时删除）',
    basis: FIXTURE_BASIS,
    ts: 1757000000000
  },
  {
    snapshotId: 'ev-2026-09-002',
    snapshotHash: 'sha256:1122334455667788',
    frozenBody: '替身证据正文（接真源时删除）',
    basis: [FIXTURE_BASIS[1]],
    ts: 1757003600000
  }
];

/** 替身：凭证展示位（SBT，不可转让，custody none，chainRef 恒 null）。 */
export const FIXTURE_CREDENTIALS: readonly CredentialExhibit[] = [
  {
    tokenId: tokenIdOf(1),
    epoch: FIXTURE_EPOCH,
    rank: 1,
    node: PERSONAS[0],
    basis: FIXTURE_BASIS,
    snapshotHash: 'sha256:0f1e2d3c4b5a6978',
    ts: 1757000000000,
    kind: 'sbt',
    transferable: false,
    chainRef: null,
    custody: 'none'
  },
  {
    tokenId: tokenIdOf(2),
    epoch: FIXTURE_EPOCH,
    rank: 2,
    node: PERSONAS[1],
    basis: [FIXTURE_BASIS[1]],
    snapshotHash: 'sha256:1122334455667788',
    ts: 1757003600000,
    kind: 'sbt',
    transferable: false,
    chainRef: null,
    custody: 'none'
  }
];
