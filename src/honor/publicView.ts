// 荣誉层公共只读投影 —— Gitea #6 · T4
//
// ── 中性命名纪律（设计书 §2.3）────────────────────────────────────────────
// SCAN_WORDS 是对公共 DOM 的**大小写不敏感子串**扫描。因此本投影的**字段名与字面量
// 必须是中性词**：
//   · 用 `ordinal` 而不是 `rank`   —— 公共不暴露"排名"这个可攀比概念
//   · 用 `glyph`   而不是 `node`   —— 只给展示用字形，不给身份
//   · 用 `changed` 而不是 `delta`  —— 只表达"动了没"，不表达"上去还是下来多少位"
//
// ── 隔离纪律（设计书 §4.2 · T9）───────────────────────────────────────────
// 本模块**可被公共侧引用**，因此**严禁 import `aggregate.ts` / `fixture.ts` /
// `honorAdmin.ts`** —— 否则公共入口可经本模块触达管理面聚合，隔离即失效。
// 它只依赖：`types/altar.ts`（席位闸门）+ `honor/types.ts`（类型，编译期擦除）
// + `honor/naming.ts`（叶子判据）。

import { SEAT_ID_MAX, WUJI_ANCHOR_ID, isSeatId } from '../types/altar';
import { isPublicPersonalName } from './naming';
import type { EpochTag, MonthlyRanking, RankChange, SeatAnchor } from './types';

/** 公共只读牌位（中性命名）。 */
export interface PublicSeatBadge {
  readonly seatIndex: number;
  readonly ordinal: number;
  /** 展示字形（花名代号），禁真名/机构。 */
  readonly glyph: string;
  readonly changed: RankChange;
}

/**
 * 公共只读视图。字段集**已穷举**：`periodTag` / `badges` / `vacantApex` / `seatDomainSize`。
 * 任何 ASN 相关字段（`sourceRefs` / `snapshotHash` / `chainRef` / `basis` / `node`）
 * 都不进这个接口 —— 这是 §2.3 投影规则 P2 的直接后果。
 */
export interface PublicHonorView {
  /** '2026-09'。保留 epoch 的**值**作文案，但字段名不叫 epoch。 */
  readonly periodTag: EpochTag;
  readonly badges: readonly PublicSeatBadge[];
  /** 无极天花板恒空（规范 §2）。**字面量 `true`** —— 不存在"可以变成 false"的路径。 */
  readonly vacantApex: true;
  /** 恒 49。不是"当前实际有几个" —— 那是管理面口径。**字面量 `49`**。 */
  readonly seatDomainSize: 49;
}

/**
 * 唯一投影入口（纯函数）。
 *
 * 投影规则：
 *   P1 badges.length ≤ 49，且每条 seatIndex 满足 isSeatId。
 *   P2 **丢弃** credits / creditsPrev / node / tokenId / snapshotHash / basis / epoch（字段名）。
 *   P3 glyph 经花名白名单校验（不合规则不投影）。
 *   P4 vacantApex / seatDomainSize 为字面量类型（编译期锁死）。
 *   P5 seatId === WUJI_ANCHOR_ID 或任何非席位值一律**排除**（不投影、不补 0）。
 */
export function toPublicView(
  ranking: MonthlyRanking,
  anchors: readonly SeatAnchor[]
): PublicHonorView {
  const anchorSet = new Set<number>();
  for (const anchor of anchors) {
    if (isSeatId(anchor.seatId)) anchorSet.add(anchor.seatId);
  }

  const badges: PublicSeatBadge[] = [];
  for (const entry of ranking.entries) {
    // P5：#00 与一切非席位排除（不投影、不补 0）。
    if (entry.seatId === WUJI_ANCHOR_ID) continue;
    if (!isSeatId(entry.seatId)) continue;
    // 只投影真实存在的固定席位（锚点是公共侧的席位权威）。
    if (!anchorSet.has(entry.seatId)) continue;
    // P3：花名白名单；不合规则不投影（绝不透传身份/机构）。
    if (!isPublicPersonalName(entry.node)) continue;
    badges.push({
      seatIndex: entry.seatId,
      ordinal: entry.rank,
      glyph: entry.node,
      changed: entry.delta
    });
  }

  return {
    periodTag: ranking.epoch,
    badges,
    vacantApex: true,
    seatDomainSize: SEAT_ID_MAX
  };
}
