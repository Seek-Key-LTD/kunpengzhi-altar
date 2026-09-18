// 花名制红线校验 —— Gitea #6 · T5 / 设计书 §3.6
//
// 规范 §7.5：展示层强制花名 / 角色名，禁真实姓名与真实机构；实名仅存后台风控。
//
// 本模块是一个**叶子**（零依赖、零管理语义、零数据），被两侧复用：
//   · 管理面聚合 `aggregate.ts` —— 校验 `RankEntry.node`
//   · 公共只读投影 `publicView.ts` —— 校验 `PublicSeatBadge.glyph`
// 抽成叶子是为了避免两处各写一份判据（且 `publicView` 不可 import `aggregate`，见 T9 隔离）。

/** 合规花名：恰 2–6 个汉字（自动排除 `@`、`.`、ASCII 字母等邮箱/机构特征）。 */
export const PUBLIC_NAME_PATTERN = /^[\u4e00-\u9fff]{2,6}$/;

/** 机构 / 邮箱特征（不区分大小写地按子串拒绝）。 */
export const ORG_NAME_MARKERS: readonly string[] = ['@', '.', '公司', '集团', '院', '所', '大学'];

/** 是否为合规花名（纯函数）。 */
export function isPublicPersonalName(name: string): boolean {
  if (typeof name !== 'string') return false;
  if (!PUBLIC_NAME_PATTERN.test(name)) return false;
  for (const marker of ORG_NAME_MARKERS) {
    if (name.includes(marker)) return false;
  }
  return true;
}

/** 断言合规（管理面用：违反红线即失败，不静默）。 */
export function assertPublicPersonalName(name: string, context: string): void {
  if (!isPublicPersonalName(name)) {
    throw new Error(`${context}：花名不合规（须 2–6 个汉字，且不含机构/邮箱特征）`);
  }
}
