// 荣誉层管理面适配 —— Gitea #6 · T7
//
// ⛔ **本模块只可被 `src/director/**` 引用。** 一旦被公共入口（`src/App.tsx` /
// `src/three/**` / `src/audio/**`）引用，管理面隔离即失效（由
// `scripts/verify-honor-isolation.mjs` 断言）。
//
// 职责：把管理面聚合结果 + ASN 链接（debate/papers 引用）+ 凭证引用组装给导演 UI。
// 与 `src/director/seatPresentation.ts` 同一套「公共/管理面数据分家」的做法（#5 先例）。

import { aggregateHonor, lookupCredential, tokenIdOf } from '../honor/aggregate';
import type { CredentialExhibit, MonthlyRanking, RankChange, SeatAnchor } from '../honor/types';

/** 导演台一行荣誉账（含管理面字段：credits / 花名 / ASN 引用 / 凭证）。 */
export interface HonorAdminRow {
  readonly seatIndex: number;
  readonly ordinal: number;
  readonly node: string;
  readonly credits: number;
  readonly creditsPrev: number | null;
  readonly changed: RankChange;
  /** ASN 边界：辩论/论文引用链（**仅管理面**）。 */
  readonly sourceRefs: readonly string[];
  readonly credentialTokenId: string;
  readonly credentialFound: boolean;
  /** 身份凭据引用（仅管理面；本阶段恒 null）。 */
  readonly chainRef: string | null;
}

/**
 * 组装导演台荣誉账（纯函数）。
 * 排序：按 ordinal 升序（当期次序），便于导演阅读；同序回退 seatIndex。
 */
export function buildHonorAdminRows(
  ranking: MonthlyRanking,
  anchors: readonly SeatAnchor[],
  credentials: readonly CredentialExhibit[]
): readonly HonorAdminRow[] {
  const aggregate = aggregateHonor(ranking, anchors);

  const refsBySeat = new Map<number, readonly string[]>();
  for (const reason of ranking.diffReasons) {
    refsBySeat.set(reason.seatId, reason.sourceRefs);
  }

  const rows: HonorAdminRow[] = aggregate.badges.map((badge) => {
    const tokenId = tokenIdOf(badge.seatIndex);
    const credential = lookupCredential(tokenId, credentials);
    return {
      seatIndex: badge.seatIndex,
      ordinal: badge.ordinal,
      node: badge.node,
      credits: badge.credits,
      creditsPrev: badge.creditsPrev,
      changed: badge.changed,
      sourceRefs: refsBySeat.get(badge.seatIndex) ?? [],
      credentialTokenId: tokenId,
      credentialFound: credential.kind === 'value',
      chainRef: credential.kind === 'value' ? credential.value.chainRef : null
    };
  });

  return [...rows].sort(
    (a, b) => (a.ordinal - b.ordinal) || (a.seatIndex - b.seatIndex)
  );
}
