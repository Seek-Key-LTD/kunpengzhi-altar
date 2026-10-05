/**
 * lark drive +search 统一封装 —— 搜索层盲区的护栏落点（W3 搜索层测试产出）。
 *
 * 为什么要有这一层（docs/audit/search-blindspots.md）：
 * 1. `--query` 超过 30 字符（Unicode 码点）时服务端**静默返回空结果**（不报
 *    99992402），程序化调用会误判"无知识"——这里统一截断并打 truncated 标记。
 * 2. CLI 参考文档的字段名（title/doc_type）与实际响应不符——实际是
 *    title_highlighted/entity_type/result_meta.doc_types，这里统一归一化，
 *    调用方不再各自踩坑。
 * 3. runner 环境可能没有 lark-cli/登录态——统一抛 LARK_CLI_UNAVAILABLE，
 *    冒烟脚本据此跳过而不是假红。
 */
import { execFileSync } from 'node:child_process';

/** 服务端硬限制：--query 按 Unicode 码点数最多 30，超长静默空结果 */
export const QUERY_MAX_CHARS = 30;

/** 码点级截断（中英文同口径）；与原串不同时调用方可见 truncated 标记 */
export function clampQuery(query) {
  return [...String(query ?? '')].slice(0, QUERY_MAX_CHARS).join('');
}

/** 剥离返回标题/摘要里的 <h>/<hb> 高亮标签 */
export function stripHighlight(text) {
  return String(text ?? '').replace(/<\/?h[bp]>/g, '');
}

/** runner/本机缺少 lark-cli 或登录态时的可识别错误码 */
export const isUnavailable = (err) => err?.code === 'LARK_CLI_UNAVAILABLE';

/**
 * drive +search 统一入口。
 * @returns {{ query, truncated, total, hasMore, pageToken, results: Array<{
 *   entityType, docType, title, token, url, owner }> }}
 */
export function searchDrive(query, opts = {}) {
  const q = clampQuery(query);
  const args = ['drive', '+search', '--as', opts.as ?? 'user', '--format', 'json', '--query', q];
  if (opts.pageSize) args.push('--page-size', String(opts.pageSize));
  if (opts.pageToken) args.push('--page-token', String(opts.pageToken));
  if (opts.docTypes) args.push('--doc-types', String(opts.docTypes));
  if (opts.spaceIds) args.push('--space-ids', String(opts.spaceIds));

  let raw;
  try {
    raw = execFileSync('lark-cli', args, { encoding: 'utf8', timeout: 60_000 });
  } catch (err) {
    const wrapped = new Error(`lark-cli 不可用或调用失败：${err.message}`);
    wrapped.code = 'LARK_CLI_UNAVAILABLE';
    throw wrapped;
  }

  const d = JSON.parse(raw);
  if (!d.ok) {
    const wrapped = new Error(`search API 错误：${JSON.stringify(d).slice(0, 200)}`);
    wrapped.code = 'LARK_SEARCH_API_ERROR';
    throw wrapped;
  }

  const data = d.data ?? {};
  const results = (data.results ?? []).map((r) => ({
    entityType: r.entity_type ?? '',
    docType: r.result_meta?.doc_types ?? '',
    title: stripHighlight(r.title_highlighted) || stripHighlight(r.summary_highlighted).slice(0, 60),
    token: r.result_meta?.token ?? '',
    url: r.result_meta?.url ?? '',
    owner: r.result_meta?.owner_name ?? '',
  }));

  return {
    query: q,
    truncated: String(query ?? '') !== q,
    total: data.total,
    hasMore: !!data.has_more,
    pageToken: data.page_token ?? '',
    results,
  };
}
