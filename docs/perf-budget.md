# 性能预算化 · 四探针 + CI 门禁（tools/perf/）

> 外部观察者口径：**零应用代码改动**（不碰 `src/`），全部在真浏览器（无头 Chromium +
> SwiftShader 软栅格）与 dist 产物侧量取。探针驱动见 `tools/perf/measure.mjs`，
> 预算见 `tools/perf/budget.json`，门禁见 `tools/perf/check-budget.mjs`。

## 四探针各测什么

| 探针 | 页面 | 测什么 | 预算项 | 门禁含义 |
|------|------|--------|--------|----------|
| `frame` | 公共入口 `/` | 注入 rAF 采样脚本，收集 30s 内**所有相邻帧间隔**（`performance.now` 差值数组），算 P50 / P99 | `p50_ms_max=150`、`p99_ms_max=750`（软栅格校准值，见下文校准章节） | 公共首屏渲染节奏的下限保障：一半以上帧要达到预算中位线，最差 1% 帧不得无限卡死。真 GPU 上应另设严预算（建议 p50≤20ms / p99≤100ms） |
| `render` | 导演台 `#/director` | 预置一次性确认（localStorage）直入工作台，在 React 挂载根 `#root` 上挂 `MutationObserver(childList+attributes+subtree)`，**空闲态**计 15s 的**变更批次数**（observer 回调次数 ≈ DOM 更新批次），算 updates/sec | `updates_per_sec_max=3` | **导演台 10Hz 轮询重渲染修复的回归门禁**：`useRelicState(altarRef, 10)` 曾把 10Hz 轮询直接打成重渲染风暴；修复后空闲态每秒 DOM 更新批次必须 ≤3，一超即超支（硬断言，不是建议） |
| `bundle` | （纯文件侧） | 遍历 `dist/assets/*.js`，`gzipSync` 后算**总 gzip** 与**最大单 chunk gzip**（「主 chunk」口径 = gzip 最大的 JS chunk，当前即公共入口 `index-*.js`；导演台/玉玺查看器走懒加载拆分，天然更小） | `total_gzip_kb_max=420`、`main_chunk_gzip_kb_max=380` | 代码分割税：公共入口每多背 1KB 都要过闸（当前实况 ≈343KB 主 chunk / ≈350KB 总 gzip，预算留 ~10% 余量） |
| `memory` | 公共入口 `/` | 浏览器以 `--js-flags=--expose-gc` 启动；6 个循环 = reload → 等场景挂载 → `window.gc()` 两次 → 读 `performance.memory.usedJSHeapSize`；断言 `(末-首) ≤ max(growth_mb_max, growth_ratio_max × 首值)` | `cycles=6`、`growth_mb_max=25`、`growth_ratio_max=0.35` | 仪式长跑（公共页 30 分钟不关）不掉堆：绝对增量与相对增量两闸取宽，超任一即漏 |

探针容错：每个探针独立 try/catch + 失败自动重试一次（外接盘 / 慢机偶发楔死可自
愈），重试再败只标 `SKIP`（含原因），不拖垮其余；整体裁决在 `check-budget.mjs`。
SKIP 是**局部**豁免（黄色警告）；但浏览器侧三探针（frame/render/memory）若**一个
都没实测成功**，门禁按「取证失败」fail-closed 报红——整机楔死时不得靠 fail-open
装绿（实测踩过）。FAIL 才是最常规的红。

## 怎么本地复测

```bash
npm run build && npm run perf:budget
# 或分两步：
npm run perf:measure   # 只量，写 tools/perf/report.json，不裁决
npm run perf:budget    # 量 + 对照 budget.json 裁决（任何超支 → exit 1）
```

前提：`dist/` 已产出（`vite preview` 需要，脚本开头会检测并提示先 build）；
playwright 的 chromium 已安装（没装时 `npx playwright install chromium`）。
本机若有组织受管 Chrome，可设 `ALTAR_CHROME_PATH` 顶替（见
`scripts/lib/chromium-launch.mjs`，capture 工具同一套夹具）。

## 预算怎么校准

初始口径**宁宽勿严**，且必须为「当前测量环境」校准，不能拍脑袋。本项目首次校准
（2026-10-04，`mbp-ben.local`，Intel i5-8257U + 无头 Chromium SwiftShader 软栅格 +
外接盘 I/O 噪声）实测了三次：

| 次数 | p50 实测 | p99 实测 | 帧数/30s |
|------|---------|---------|----------|
| 1 | 52.6ms | 355.5ms | 368 |
| 2（I/O 楔死期间） | 133.4ms | 547.6ms | 191 |
| 3 | 62.8ms | 701.2ms | 322 |

据此把 frame 预算定为 `p50_ms_max=150` / `p99_ms_max=750`（包络上限留余量）。
任务书最初建议的 34ms/100ms（≈30fps 口径）在这台软栅格机器上三次实测全越线，
**属真 GPU 预算，不该硬套在软栅格上**——这正是校准流程存在的理由。
其余三项（render / bundle / memory）与环境速度无关或余量充足，沿用初始值。

**换真 GPU / 换机器后必须重新校准，不得沿用软栅格宽口径装作性能合格。** 流程：

1. 在新环境跑 `npm run build && npm run perf:measure`，**跑 2~3 次取包络**（本机
   实测单次之间 p50 可差 2.5 倍——I/O 噪声与仪式时间轴相位都会影响；一次定预算
   必然要么常红要么形同虚设），记下实测基线（`tools/perf/report.json` 里有
   hostname / cpu / 实测值）。
2. 取包络上限 × 1.1~1.3 的余量改 `tools/perf/budget.json`（例：真 GPU 上 p50
   实测 8ms → 预算可收到 10~12ms）。
3. 把新预算连同实测基线一起提交，让 diff 本身就是校准记录（budget.json 的
   `_comment` 字段注明口径与环境）。
4. 门禁红 ≠ 一定改预算：先看是回归（代码变了）还是环境变了（换机器没校准）。

`render` 探针的 `updates_per_sec_max=3` 与环境无关（测的是 DOM 行为不是帧率），
任何机器上都不该放宽——它是 10Hz 重渲染修复的语义边界。

## CI 在 raccoon 跑的前提

`.gitea/workflows/perf-budget.yml`：`runs-on: [raccoon]`（与 deploy.yml 同一 runner），
触发于 push `w1/**` 与 pull_request（paths: `src/**`、`tools/**`、`package.json`）。
前提：

1. raccoon 上 Node 20 + npm 缓存可用（setup-node@v4）；
2. `npm ci` 可装依赖（失败自动回落 `npm install`，见工作流步骤）；
3. playwright chromium 二进制可取得——已装则 `npx playwright install chromium` 秒过；
   CDN 超时也不挂（`|| true`），真缺浏览器时 measure 会在探针层如实 SKIP，
   **不会静默绿**；raccoon 也可用 `ALTAR_CHROME_PATH` 指向本机受管 Chrome 作夹具；
4. raccoon 也是无头软栅格环境，但首校机器是 `mbp-ben.local`——若 raccoon 硬件
   更快/更慢，按上面流程先在 raccoon 上跑 2~3 次基线再决定是否改预算，勿盲套。

任何超支 → `npm run perf:budget` exit 1 → 该步红；`tools/perf/report.json`
无论红绿都会作为 artifact 上传，供事后取证。

## 已知限制

- 无头 SwiftShader 的帧间隔只证明「下限没破」，不代表真 GPU 体验；
- `render` 探针量的是 **DOM 变更批次**（observer 回调），纯内存重渲染不触发
  observer——它量的是用户可感知的那部分（DOM 真在动）；
- `memory` 探针依赖 Chromium 专有的 `performance.memory` + `--expose-gc`，
  换浏览器内核即 SKIP；
- `bundle` 的「主 chunk」按 gzip 最大文件取，若未来某个懒加载 chunk 反超入口
  chunk，口径含义会漂移（报告里带 `main_chunk_file` 字段可查）。

## CI 报告读取（perf-report 分支）

每次门禁运行（无论成败）都会把实测 `report.json` 以 `report-latest.json` 推到仓库 `perf-report` 分支：

```bash
tea run ... # 或直接 API：
curl -H "Authorization: token $GITEA_TOKEN" \
  https://gitea.capitaltrain.cn/seekkey/kunpengzhi-altar/raw/branch/perf-report/report-latest.json
```

用途：本版 Gitea 的 Actions 日志 API 不可程序化读取，`perf-report` 分支即门禁的持久观测面——CI 红时先看它，不用猜。
