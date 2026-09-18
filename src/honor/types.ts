// 荣誉层四对象契约 —— Gitea #6 · T1
//
// ── 本文件是**纯类型模块（零运行时导出）** ────────────────────────────────
// 只允许 `export type` / `export interface`。它的存在意义是：契约可公共查阅
// （公共侧只能 `import type`，编译期擦除、零字节），数据不可公共触达。
//
// 席位域权威 = `src/types/altar.ts` 的 `isSeatId()`。本文件**不**重新定义席位域；
// 四对象严格对应《荣誉座次表规范》§3 的三层结构（席位 / 座次 / 凭证）。
// 「席位不动，座次动」是全部设计的公理。
//
// ⛔ 本文件一旦出现任何 `const` / `function` / 运行时值导出，即违反设计书 §4.2。

import type { SeatStatus } from '../types/altar';

// ── 1.1 固定席位 · SeatAnchor（公共侧权威：sipral_events + altarGeometry）────
/**
 * 固定席位。**不可变**：不随月度重排变化，是叙事锚点。
 * `seatId` 必须满足 `isSeatId()` —— `0`（#00 锚点）永不入此类型。
 * 不设 `name`/`title`/`message`/`starship`（那些是讲解文案，已由
 * `src/director/seatPresentation.ts` 持有，#5 分家）。
 */
export interface SeatAnchor {
  readonly seatId: number;
  readonly status: SeatStatus;
  readonly isPrime: boolean;
  readonly isFinale: boolean;
}

// ── 1.2 月度座次 · MonthlyRanking（管理面权威）────────────────────────────
/** 期次标签：自然月，形如 '2026-09'。 */
export type EpochTag = string;

/** 座次变动方向（与上期相比）。 */
export type RankChange = 'up' | 'down' | 'same' | 'new';

export interface RankEntry {
  /** 1..49（isSeatId 必须为真）。 */
  readonly seatId: number;
  /** 花名/角色名。**禁真实姓名与真实机构**。 */
  readonly node: string;
  /** 当期名次，1..49 内。 */
  readonly rank: number;
  readonly delta: RankChange;
  /** 标量贡献。**不可充值、不可变现** —— 只由站内任务/内容参与/节目活动发放。 */
  readonly credits: number;
  /** 上期快照值；新席为 null。 */
  readonly creditsPrev: number | null;
}

export type RankDiffKind = 'endorsement' | 'downgrade' | 'refusal' | 'error' | 'inflow';

export interface RankDiffReason {
  readonly seatId: number;
  readonly kind: RankDiffKind;
  /** debate / papers 的引用（非内联证据，即 ASN 边界）。 */
  readonly sourceRefs: readonly string[];
  readonly note: string;
}

export interface MonthlyRanking {
  readonly epoch: EpochTag;
  /** 重排前冻结的当期 credits 快照标识（规范 §5）。 */
  readonly frozenSnapshotId: string;
  readonly entries: readonly RankEntry[];
  /** 「标出每一处变动的原因」是硬要求（§5），不得为空数组。 */
  readonly diffReasons: readonly RankDiffReason[];
}

// ── 1.3 证据快照 · EvidenceSnapshot（管理面权威）──────────────────────────
export type BasisKind = 'debate' | 'paper';

export interface BasisRef {
  readonly claimId: string;
  readonly kind: BasisKind;
  readonly ts: number;
}

/** 落账存快照，不存引用（§6.2 硬要求）—— 上游模型输出会事后撤回。 */
export interface EvidenceSnapshot {
  readonly snapshotId: string;
  /** ★ 硬要求。 */
  readonly snapshotHash: string;
  /** 冻结时刻的证据正文（不可变）。 */
  readonly frozenBody: string;
  readonly basis: readonly BasisRef[];
  readonly ts: number;
}

// ── 1.4 凭证展示 · CredentialExhibit（管理面权威）──────────────────────────
/**
 * 凭证展示位。**SBT（不可转让），不是 NFT。**
 *
 * 规范 §6.1 红线：禁金融化（禁充值/禁变现/禁转让），而 NFT 天然可交易 ——
 * 所以凭证必须是 Soulbound。因此 `transferable` 是**字面量类型 `false`**，
 * 不是 `boolean`：谁把它改成 `boolean` 或 `true`，编译期就挂。
 */
export interface CredentialExhibit {
  readonly tokenId: string;
  readonly epoch: EpochTag;
  readonly rank: number;
  /** 花名（禁真名/机构）。 */
  readonly node: string;
  readonly basis: readonly BasisRef[];
  readonly snapshotHash: string;
  readonly ts: number;
  /** 只有 sbt。NFT 不是一个可选值。 */
  readonly kind: 'sbt';
  /** ★ 字面量类型，不可转让。 */
  readonly transferable: false;
  /** 链上事实 vs 仅展示位 —— 本阶段恒为 null。 */
  readonly chainRef: string | null;
  /** 不做托管、不上 OpenSea。展示位就是祭坛本身。 */
  readonly custody: 'none';
}

// ── 3.1 #00 排除规则：三分查找结果（三态，不是可空值）──────────────────────
export type HonorExclusionReason =
  /** 值 === WUJI_ANCHOR_ID(0)：结构上永不属于荣誉域。 */
  | 'wuji_anchor'
  /** 非 [1,49] 整数（负数 / 50 / 1.5 / NaN）：本就不是席位。 */
  | 'out_of_domain';

/**
 * 席位荣誉查找结果 —— **三态，不是可空值**。
 *
 *   excluded = 该键在荣誉域内**不存在**（#00 或非席位）→ 不得聚合、不得计数、不得补 0
 *   absent   = 是合法席位，但**本期无此项**（例如新席无上期快照）
 *   value    = 真实聚合值。**value: 0 是一个值，不是 void。**
 *
 * 为什么不用 `T | null | 0`：那会让「#00 被静默算成 0」与「本期真的是 0」无法区分，
 * 于是 #00 会从"排除"退化成"第 50 个 0 值席位"，统计口径从 49 悄悄变 50。
 */
export type HonorLookup<T> =
  | { readonly kind: 'excluded'; readonly reason: HonorExclusionReason }
  | { readonly kind: 'absent' }
  | { readonly kind: 'value'; readonly value: T };
