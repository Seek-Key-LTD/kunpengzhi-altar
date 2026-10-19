# 飞书搜索层盲区清单与规避约定（搜索层立体化测试产出 · 2026-10-04）

> 来源：搜索层立体化测试（`director-ops/agents/mini-lark-search-audit.md`）。本文是**本仓 agent 的常备参考**：用 `lark-cli drive +search` 前先读，避开已知坑。跟踪 issue 见本仓搜索层盲区清单 issue。

## 真实响应 schema（与 CLI 参考文档不符，以此为准）

```json
{
  "ok": true, "identity": "user",
  "data": {
    "total": 30,            // ⚠️ 不可靠（官方自认），统计须逐页累加去重
    "has_more": false,
    "page_token": "...",    // 内含 "search_cold":true 标记=索引冷态，新文档召回可能滞后
    "results": [{
      "entity_type": "WIKI | DOC | ...",   // ⚠️ 粗粒度：DOC 桶内混 SHEET/BITABLE/DOCX
      "title_highlighted": "…<h>关键词</h>…", // ⚠️ 参考文档写的 title 字段不存在
      "summary_highlighted": "…",
      "result_meta": {
        "doc_types": "DOCX",               // ✅ 精确底层类型读这里
        "url": "...", "token": "...",
        "owner_name": "...", "update_time_iso": "..."
      }
    }]
  }
}
```

**解析器规则**：标题=剥离 `<h>/<hb>` 标签的 `title_highlighted`；精确类型=`result_meta.doc_types`；不要信参考文档的 `title`/`doc_type` 顶层字段（实测恒空）。

## 盲区速查（12 项，按优先级）

| 级别 | 盲区 | 规避/修复归属 |
|---|---|---|
| P0 | >30 字符长查询**静默失败**（success+0 条，不报 99992402） | ✅ 已落地：`scripts/lib/lark-search.mjs` 统一封装（clampQuery 截断+真实 schema 解析+isUnavailable 跳过语义），调用方一律走它，不裸调 lark-cli |
| P0 | **跨租户文档可读不可搜**（治理手册 canonical=www.feishu.cn，自身标题词 0 召回） | 平台侧：文档迁入租户 wiki 空间（上报 owner）；搜索前用 `drive +inspect` 验 canonical 域名 |
| P0 | 空间索引覆盖不均（三更道场 196 篇 vs ASN Lark Wiki 2 篇） | 例行"空浏览计数 vs 节点实数"对账（验收台账例行项） |
| P1 | 模板文档淹没召回（"系统"80 条全是云文档助手模板） | 换特异关键词；治理侧做模板命名规范/独立空间 |
| P1 | `total` 不可靠 | 逐页累加去重，不把 total 当承诺 |
| P1 | `entity_type` 粗粒度 | 精确类型读 `result_meta.doc_types` |
| P2 | 空浏览 ≠ 全租户（`--query ""` 无过滤仅 4 条） | 盘点必须显式 `--space-ids`/`--mine` 展开 |
| P2 | `--only-comment` 无法证实 | 低优先验证项 |
| P2 | `search_cold` 冷态 | 新文档编辑后不急于搜索验证 |
| P2 | wiki 域无独立搜索命令 | 单点依赖 `drive +search`，已知 |
| P2 | `--folder-tokens` 与 `--space-ids` 互斥 | drive/wiki 不能一查双跨，分两次查 |
| P2 | `--opened-*` 90 天窗自动裁剪 | 跨窗查询按官方 slice 流程（CLI notice 有指引） |

## 搜索冒烟清单（例行验收用）

固定 probe 词集 + 期望命中，防索引退化（建议纳入验收台账例行项）：

| probe | 期望 |
|---|---|
| `--query '运维'` | total ≥ 30 且 has_more 可翻 |
| `--query '工单系统'` | 命中 📫ASN 工单系统（topaz BITABLE） |
| `--query '祭坛'` | 命中三更道场空间（7+ 条） |
| `--query '' --space-ids <三更道场>` | 索引数 ≈ 196（大幅波动即告警） |
| `--query '' --space-ids <ASN Lark Wiki>` | 当前仅 2——**若治理手册迁入后应显著增长** |
| 40 字符 query | 当前静默 0 条——**平台若修复应转报错** |
