// 荣誉层聚合纯函数 —— Gitea #6 · T2 / T3 / T5
//
// ── 纯函数契约 ────────────────────────────────────────────────────────────
// 无 IO、无副作用、无浏览器 API、**不 import 任何 `three`**；同输入恒同输出（幂等）。
//
// ── 席位域闸门唯一来源 ────────────────────────────────────────────────────
// `isSeatId` / `WUJI_ANCHOR_ID` / `SEAT_ID_MAX` 一律 **import 自 `src/types/altar.ts`**，
// 绝不在本模块重写 [1,49] 判断 —— 否则仓库会出现「第二套席位域定义」（已明令禁止）。
//
// ── 事件权重未定（规范 §9 待办 1）────────────────────────────────────────
// 本阶段**不实现打分**：`RankEntry.credits` 是**输入**，聚合层只搬运不计算。

import { SEAT_ID_MAX, WUJI_ANCHOR_ID, isSeatId } from '../types/altar';
import { assertPublicPersonalName } from './naming';
import type {
  CredentialExhibit,
  HonorExclusionReason,
  HonorLookup,
  MonthlyRanking,
  RankChange,
  SeatAnchor
} from './types';

/** 管理面聚合条目（含 credits / 花名，**永不进公共 chunk**）。 */
export interface HonorBadge {
  readonly seatIndex: number;
  readonly ordinal: number;
  readonly node: string;
  readonly credits: number;
  readonly creditsPrev: number | null;
  readonly changed: RankChange;
}

/** `aggregateHonor` 结果。 */
export interface HonorAggregate {
  readonly epochTag: string;
  /** 数组长度 ≤ 49；**整体不产出 #00 条目**。 */
  readonly badges: readonly HonorBadge[];
  readonly seatCount: number;
  /** 非席位（含 #00 / 越界 / 非整数）或被锚点域排除的入参计数。 */
  readonly excludedCount: number;
}

/** `countCommissionedSeats` 结果。 */
export interface CommissionedSeats {
  /** 实际存在的合法席位条目数（≤ 49）。 */
  readonly present: number;
  /** 席位域分母，恒 `SEAT_ID_MAX`（49）—— **不含 #00**。 */
  readonly matched: number;
}

/** 凭证 token id 前缀（唯一拼装点）。 */
export const CREDENTIAL_TOKEN_PREFIX = 'credential-seat-';

/**
 * 「是不是荣誉域内的键」的唯一判据：返回排除原因，或 `null`（合法席位）。
 * 先判 `=== WUJI_ANCHOR_ID` 再判 `isSeatId` —— 保证 #00 归 `wuji_anchor` 而非 `out_of_domain`。
 */
function exclusionOf(seatId: number): HonorExclusionReason | null {
  if (seatId === WUJI_ANCHOR_ID) return 'wuji_anchor';
  if (!isSeatId(seatId)) return 'out_of_domain';
  return null;
}

/**
 * 席位本期贡献查找（三态）。
 * excluded（#00 / 非席位） / absent（合法席位但本期无条目） / value（本期 credits，**0 也是值**）。
 */
export function lookupSeatHonor(seatId: number, ranking: MonthlyRanking): HonorLookup<number> {
  const reason = exclusionOf(seatId);
  if (reason) return { kind: 'excluded', reason };
  const entry = ranking.entries.find((e) => e.seatId === seatId);
  if (!entry) return { kind: 'absent' };
  return { kind: 'value', value: entry.credits };
}

/**
 * 上期快照查找（三态）。
 * excluded（#00 / 非席位） / absent（**无上期快照**，如新席 `creditsPrev === null`） / value。
 * 这是「缺项 ≠ 0」的可执行证据：新席是 `absent`，不是 `value: 0`。
 */
export function lookupPrevCredits(seatId: number, ranking: MonthlyRanking): HonorLookup<number> {
  const reason = exclusionOf(seatId);
  if (reason) return { kind: 'excluded', reason };
  const entry = ranking.entries.find((e) => e.seatId === seatId);
  if (!entry || entry.creditsPrev === null) return { kind: 'absent' };
  return { kind: 'value', value: entry.creditsPrev };
}

/**
 * 聚合座次：以锚点为席位权威，产出管理面条目。
 * #00 与非席位入参**整体不产出**，仅计入 `excludedCount`。
 */
export function aggregateHonor(
  ranking: MonthlyRanking,
  anchors: readonly SeatAnchor[]
): HonorAggregate {
  const anchorSet = new Set<number>();
  for (const anchor of anchors) {
    if (isSeatId(anchor.seatId)) anchorSet.add(anchor.seatId);
  }

  const badges: HonorBadge[] = [];
  let excludedCount = 0;
  for (const entry of ranking.entries) {
    // E7/E8：#00 与非席位一律不产出（不投影、不补 0）。
    if (!isSeatId(entry.seatId) || !anchorSet.has(entry.seatId)) {
      excludedCount += 1;
      continue;
    }
    // 花名制红线（T5）：管理面违规即失败，不静默。
    assertPublicPersonalName(entry.node, `席位 ${entry.seatId} 花名`);
    badges.push({
      seatIndex: entry.seatId,
      ordinal: entry.rank,
      node: entry.node,
      credits: entry.credits,
      creditsPrev: entry.creditsPrev,
      changed: entry.delta
    });
  }
  return { epochTag: ranking.epoch, badges, seatCount: badges.length, excludedCount };
}

/**
 * 席位计数：分母**恒** `SEAT_ID_MAX`（49，不是 50）——`#00` 永不入分母。
 */
export function countCommissionedSeats(ranking: MonthlyRanking): CommissionedSeats {
  const present = new Set<number>();
  for (const entry of ranking.entries) {
    if (isSeatId(entry.seatId)) present.add(entry.seatId);
  }
  return { present: present.size, matched: SEAT_ID_MAX };
}

/** 平均贡献：分母 = **实际席位条目数**（≤49），**不含 #00**。空集返回 0。 */
export function meanCredits(ranking: MonthlyRanking): number {
  let sum = 0;
  let count = 0;
  for (const entry of ranking.entries) {
    if (!isSeatId(entry.seatId)) continue;
    sum += entry.credits;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/** 逐席贡献合计：键恒为合法席位，**绝不产生 `'0'` 键**（E12）。 */
export function contributionTotals(ranking: MonthlyRanking): Record<number, number> {
  const totals: Record<number, number> = {};
  for (const entry of ranking.entries) {
    if (!isSeatId(entry.seatId)) continue;
    totals[entry.seatId] = (totals[entry.seatId] ?? 0) + entry.credits;
  }
  return totals;
}

/** 由席位序号派生凭证 token id（唯一拼装点）。 */
export function tokenIdOf(seatId: number): string {
  return `${CREDENTIAL_TOKEN_PREFIX}${seatId}`;
}

/**
 * 凭证查找（三态）：#00 的 token（`tokenIdOf(0)`）恒 `excluded(wuji_anchor)`，
 * 不因「恰好查到一条记录」而放行。
 */
export function lookupCredential(
  tokenId: string,
  credentials: readonly CredentialExhibit[]
): HonorLookup<CredentialExhibit> {
  const match = /(\d+)$/.exec(tokenId);
  const seatId = match ? Number(match[1]) : Number.NaN;
  const reason = exclusionOf(seatId);
  if (reason) return { kind: 'excluded', reason };
  const found = credentials.find((c) => c.tokenId === tokenId);
  if (!found) return { kind: 'absent' };
  return { kind: 'value', value: found };
}
