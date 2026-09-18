# Gitea #7 · WebGL 静默降级 · 设计说明书

> **只设计，不改产品代码。** 本单产出 `docs/design/007-webgl-degradation.md`；不触碰 `src/`、`scripts/`、`package.json`、`vite.config.ts`、`tools/`、`.gitea/`。
> 对应议题：`#7 [v2.0][P0] 发布资格：全程录屏、黑场清单、WebGL 静默降级`。

---

## 0. 基线与既有事实（本次真实回显）

- **基线 HEAD**：`eceaa85`（`docs(arch): #6 设计书 §7-4 改为不裁决口径（与 #13 对齐）`）。
- **关键缺口**：`src/three/AltarScene.ts:248` —— `this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });`，**无能力探测、无 `try/catch`**；`src/App.tsx:10` 直接 `new AltarScene(...)`。⇒ 无 WebGL 时 three.js 构造会抛 `Error creating WebGL context`，经 React 副作用冒泡，**当前无任何静默降级**。
- **全库无 `webglcontextlost` 处理**：`grep -rnE 'webglcontextlost|webglcontextrestored' src tools` → 零命中。`destroy()` 只在卸载时 `renderer.dispose()` + `renderer.forceContextLoss()`（`AltarScene.ts:2493-2494`）。
- **既有"静默降级"仅指音频 fail-soft**：`AltarScene.ts:1880`「**全程静默降级，绝不抛错。**」（`kickAudio`）。语义 = **不崩 / 不弹错**，**不等于**"无音频"。
- **既有取证工具链**：`tools/capture/capture.mjs`（Playwright + 无头 Chromium，WebGL2 经 ANGLE/SwiftShader）；`tools/capture/main.ts:10` 明示「⚠️ 不进 dist、不打包进 App：本文件不被 index.html 引用」。
- **既有隔离门禁**：#5 `scripts/verify-entry-isolation.mjs:130-131` 断言公共侧 `window.__altar` / `window.__capture` 均 `undefined`；`scripts/qa-audit-public-entry.mjs`（HEAD `:37` `SCAN_WORDS`）。
- **时间轴权威**（`src/types/altar.ts`）：`:226` `RITUAL_TOTAL_SEC = 30 * 60`；`:229` abyss 末 = 180；`:232` naming 末 = 1020；`:235` lanterns 末 = 1440（`= WUJI_REVEAL_SEC`）；`:202` `WUJI_SILENCE_SEC = 29 * 60 + 11`（1751）；`:238` `RitualPhase`；`:244` `ritualPhaseAt`。
- **#4 不变量**：`src/audio/phaseEnvelope.ts:5-6`「包络**只由** #8 的单一时间轴 `ritualPhaseAt(sec)`（src/types/altar.ts）驱动，**禁止复制第二套时间轴**」；`:9`「silence 幕 1751→1800 **恰 49s**，三层增益恒为 0」。

> **取证方法学提醒**：本机为 macOS/BSD `grep`，**不支持 BRE 的 `\|` 交替**（GNU 扩展）—— `grep 'A\|B' f` 会**静默假阴性**，多选一必须 `grep -E 'A|B' f`。本文所有 `file:line` 均来自本次 `Read` / `grep -nE` 回显。

---

## 1. 触发检测（创建失败 / `webglcontextlost` / 能力不足）

### 1.1 三类触发源

| 触发 | 现象 | 判据位置（现状 / 应落点） |
|---|---|---|
| **A · 创建失败 / 能力缺失** | `new WebGLRenderer` 抛错，或预先探测无上下文 | 现状无（`AltarScene.ts:248`）；应落点 = 构造前探测 `canvas.getContext('webgl2')`（`capture.mjs:309-316` 已有同款手法） |
| **B · 运行中上下文丢失** | `webglcontextlost` 事件 | 现状无（全库零命中）；应落点 = `renderer.domElement.addEventListener('webglcontextlost', …)` + `event.preventDefault()` |
| **C · 上下文恢复** | `webglcontextrestored` 事件 | 现状无；可选恢复渲染，否则维持降级页 |

### 1.2 能力三态（判别联合 discriminated union）

```ts
export type WebglTier =
  | { tier: 'full' }                                        // WebGL2 且非软栅格
  | { tier: 'degraded'; reason: 'no-webgl2' | 'software' }  // 可用但降质：仍渲染、降档
  | { tier: 'none';     reason: 'no-context' | 'context-lost' }; // 不可用：换静默降级页
```

- **不可用（`none`）** → 渲染**静默降级页**（§2），**不建 3D**。
- **可用但降质（`degraded`）** → **仍渲染**，但降档：`no-webgl2` 走 WebGL1；`software` 降 `pixelRatio` / 关阴影。**不换页**。

### 1.3 「不可用」vs「可用但降质」的边界（默认假设，见 §7-2）

- WebGL2 缺失 ⇒ `degraded`（降档渲染），**不是** `none`。
- 无**任何** WebGL（连 WebGL1 也拿不到）⇒ `none`（换页）。
- 软栅格（SwiftShader，无头/VM 常见）⇒ `degraded`。

### 1.4 决策点

能力探测**先于** `new AltarScene`，置于 `App.tsx` 副作用（`App.tsx:8-18`）内，把「渲染分支」与「3D 构造」解耦——3D 构造一旦抛错，必须被**兜进 `none` 分支**而非冒泡（§2.4）。

---

## 2. 降级后观众可见行为

### 2.1 决策（默认假设，附理由）

| 要素 | `tier='none'` 降级下 | 理由 |
|---|---|---|
| **1800s 时间轴** | **保留**（继续推进） | 时间轴与渲染无关；#4 包络依赖它，停轴会破坏 §2.2 |
| **雾中字幕（DOM）** | **保留** | 字幕是 DOM 元素（`AltarScene.ts:318-323` 的 `.ritual-caption`），**不依赖 WebGL** |
| **音频（水 / 链 / 混响 / 朗诵）** | **保留** | 只由单一时间轴驱动（`phaseEnvelope.ts:111-114`），且已 fail-soft（`AltarScene.ts:1880`） |
| **3D 画面** | **移除**，换静默降级页 | 无 WebGL 即无法出画 |
| **对外文案** | 一句不涉工程字的场记诗 + 静置入口 | 见 §2.3 |

⇒ 默认口径：**「有声、有字幕、无画」的静默降级**——不是白屏报错页，也不是死黑空页。（"静默"在本仓 = **不抛错 / 不弹错**，见 `AltarScene.ts:1880`；**不等于**静音。）

### 2.2 #4 单一包络不变量（硬约束，不得破坏）

- 降级路径**不得**新建第二套时间轴或计时器。音量必须仍经 `phaseEnvelope.envelopeAt(sec)`（`phaseEnvelope.ts:111-114`）派生。
- `silence` 段（1751→1800，**恰 49s**，`phaseEnvelope.ts:9`）三层增益恒 0 —— 降级下**同样成立**。
- 字幕与音频均消费**同一个** `ritualPhaseAt(sec)`（`altar.ts:244`）；渲染层降级**只是不画**，**不改时钟**。

### 2.3 文案红线（不得出现工程化字样）

- 降级页文本必须避开 `Scripts/qa-audit-public-entry.mjs`（HEAD `:37`）的 `SCAN_WORDS`：`topology / ulam / 49 / 91 / rapier / camera / debug / speed / 倍速 / playback`。
- 并避开 `verify-entry-isolation.mjs:56-61` 的 `CONSOLE_MARKERS / ADMIN_WORDS`：`导演 / 认证 / 拓扑 / 座次 / 倍速 / 调试 / Rapier …`。
- **禁止**出现：「WebGL」「不支持」「错误」「请升级浏览器」「调试」「降级」「重试」等字样。默认文案 = 一句**不涉工程**的定场诗 + 入口静置（气质对齐 `index.css:49-71` 的 `.ritual-landing`）。
- ⚠️ 最终上屏文案由**主理人**确认（§7-3），**不得**由工程自拟上屏。

### 2.4 收敛为"不崩"

`App.tsx` 的 3D 构造必须包 `try/catch`：任何构造异常 ⇒ 归入 `tier='none'`，走降级页；**绝不**让异常冒泡成 React 错误边界/白屏。

---

## 3. 与 #5 隔离一致（触发只存在于测试侧，不进产物）

### 3.1 铁律

- **公共产物**（`dist/index-*.js`、`index.html`）**不得**新增任何调试开关：不得有 `window.__degrade` / `?webgl=off` / `#degrade` 之类的公共强制降级入口。
- 公共侧仍须满足 `verify-entry-isolation.mjs:130-131`：`typeof window.__altar === 'undefined'` 且 `typeof window.__capture === 'undefined'`。
- 能力探测 + 降级页属**正常产品逻辑**（可进公共包）——它们不含工程词、不暴露句柄，故**不违反**隔离。**强制降级**的钩子（仅供测试）**绝不进公共包**。

### 3.2 测试侧触发（唯一允许的"强制降级"）

沿用既有 `tools/capture` 模式（`main.ts:10`：独立入口、不进 dist）：

- **真能力剥夺**：Playwright 启动 Chromium 时加 `--disable-webgl --disable-webgl2 --disable-3d-apis`（**不给** SwiftShader 兜底）→ 公共页**真实地**"没有 WebGL"。
- **运行中丢失**：正常加载后，`page.evaluate` 取 canvas 调 `getExtension('WEBGL_lose_context').loseContext()`（标准扩展，**无需应用钩子**）。
- 二者都**不需要**公共页提供任何调试开关 ⇒ 满足"不依赖公共页调试开关"。

### 3.3 与 #5 门禁相容

- 新增降级页文本串必须先在冒烟里过 DOM 扫描（§6 T7）。
- 若新增 `BUNDLE_MARKERS`，须为**特征字面量**（如 `WebglFallback`），不用 3 字泛词（沿用 #6 §6.2 纪律）。

---

## 4. 可验证性（**最重要**）

### 4.1 目标

证明：**①** 降级确实生效；**②** 不依赖公共页调试开关；**③** 无未捕获异常；**④** 降级页**「有内容地暗」**（非死黑、非白屏报错）。

### 4.2 方案选型与理由

| 方案 | 做法 | 依赖公共开关？ | 取舍 |
|---|---|---|---|
| **A · 真能力剥夺（选定·主）** | 启动参数禁 WebGL，加载**公共** `#/` | **否** | ✅ 与 issue「WebGL 禁用测试截图」逐字对应 |
| **B · 运行中丢失（选定·辅）** | `WEBGL_lose_context.loseContext()` | **否** | ✅ 覆盖 `webglcontextlost` 触发 |
| C · 公共调试开关 | `?webgl=off` / `window.__degrade` | **是** | ❌ 违反 #5 隔离 |

**选定 A（主）+ B（辅）。** 理由：唯一能"零应用钩子"证伪的路径；复用既有 Playwright 工具链（`capture.mjs`）；与 #5 隔离天然相容。

### 4.3 断言集（可机械判红）

落于 `tools/capture/verify-webgl-degradation.mjs`（**新**，独立命令，**不入 `npm test`**——同 `capture.mjs:29` 之训）：

1. `page.on('pageerror')` 计数 **== 0**（无未捕获异常）。
2. console `error` **== 0**（或仅白名单）。
3. 降级页在场：`document.body.innerText` 含降级页锚文本；且 **无 WebGL 画布**（`#root canvas` 缺失或不可用）。
4. 无工程字：正文**不含** `SCAN_WORDS / ADMIN_WORDS` 任一词（复用 `qa-audit-public-entry.mjs` 词表）。
5. 无公共句柄：`typeof window.__altar/__capture === 'undefined'`。
6. **亮度探针**：对降级截图跑 `capture.mjs` 的 `analyze()`（`:181-210`）——断言 `nonBlackRatio > 0`（有内容，非死黑）且 `meanLum` 落在**暗场**区间（默认 `meanLum < 40`），`brightPixels` 非"整屏白" ⇒ 证明是"安静暗场页"而非"白屏报错"。
7. B 路径补充：触发丢失后渲染循环停止（`cancelAnimationFrame`）且**无异常**。

### 4.4 证据产物（对应 issue「验收证据」）

- `artifacts/capture/degraded/degrade-01-nowebgl.png`（A 截图）+ `degrade-02-contextlost.png`（B 截图）。
- `artifacts/capture/degraded/probe.json`（像素探针：`nonBlackRatio / meanLum / brightPixels / sha256`）。
- 控制台断言日志（`pageerror` / `console error` 计数）。**PNG 二进制不进版本库**（同 `capture.mjs:28` 之训）。

---

## 5. 「全程录屏」合格标准

### 5.1 基线

- 速率 `rate = 64`（`tools/capture/capture.mjs:48`）；理想 ≈ `1800 / 64 ≈ 28.1s`；**实测全程真跑 ≈ 3 分 14 秒（≈194s）**（无头软栅格吞吐远低于理想；`capture.mjs:341-342` 按 10× 余量留硬上限）。
- 五幕边界（`altar.ts`）：`0 / 180(:229) / 1020(:232) / 1440(:235) / 1751(:202) / 1800(:226)`。

### 5.2 两台设备

桌面 Chrome + 移动端，**各一次**全长录制。

### 5.3 时间码检查表（每条须在录屏中**可见 / 可听**）

| # | 时间码 | 期望 |
|---|---|---|
| 1 | 00:00–03:00 | 深渊黑场：机器独鸣，水未发（`phaseEnvelope.ts:81` abyss 水 [0,0]） |
| 2 | 03:00–17:00 | 命名幕：49 席逐一点亮，水涨（naming 水 [0,0.7]） |
| 3 | 17:00–24:00 | 走马灯幕：满席（`capture.mjs:50` `lit=49`）、16 灯低速顺时针 |
| 4 | 24:00–29:11 | 敛光：逆熄，逐席熄灭，唯留 #00 冷顶光 |
| 5 | **29:11–30:00** | **49 秒绝对静默**：三层增益恒 0（`phaseEnvelope.ts:9`），画面 + 音频**皆死寂** |
| 6 | 黑场清单 | 深渊/静默两幕"有内容黑"（字幕在场 + 可测非黑像素；`capture.mjs:404-414`） |

### 5.4 录屏实现（默认）

- 复用 `capture.mjs --run`（`:343-346`）产出**五幕 PNG + manifest**作为**时间码佐证**；
- 视频用 Playwright `context` 的 `recordVideo`（或外部录屏）补足**连续录屏**；两者时间码须一致。

### 5.5 合格判据

- 6 条时间码**全部**命中；29:11 后**确无**声画；
- 每帧过 `capture.mjs` 的"死黑"判定（`:414` `deadBlack`），断言 `anyDeadBlack === false`。

---

## 6. 文件清单与有序任务

### 6.1 文件清单（**供后续实现单使用；本单不改**）

| 动作 | 文件 | 说明 |
|---|---|---|
| 新增 | `src/three/webglCapability.ts` | 能力三态探测（§1.2） |
| 修改 | `src/App.tsx` | 构造前探测 + `try/catch`；按 tier 分支（§1.4 / §2.4） |
| 新增 | `src/components/WebglFallback.tsx` | 静默降级页（DOM） |
| 修改 | `src/three/AltarScene.ts` | `webglcontextlost/restored` 监听；暴露降级回调；`destroy()` 幂等 |
| 修改 | `src/index.css` | 降级页样式（复用 `.ritual-landing` 气质） |
| 新增 | `tools/capture/verify-webgl-degradation.mjs` | A + B 取证驱动（§4） |
| 修改 | `scripts/qa-audit-public-entry.mjs` | 降级页文本纳入 `SCAN_WORDS` 扫描（若需） |
| 修改 | `package.json` | 加 `verify:degrade` 别名（**独立命令，不入 `npm test`**） |
| 产物 | `artifacts/capture/degraded/*` | 截图 + 探针（PNG 不进库） |

### 6.2 有序任务（粒度到一次一条）

| 任务 | 内容 | 依赖 | 源文件 |
|---|---|---|---|
| **T1** | 能力探测纯函数（三态）+ 单测 | — | `webglCapability.ts` |
| **T2** | `App` 分支：`none`→降级页；`degraded`→降档渲染；构造异常兜底 | T1 | `App.tsx` |
| **T3** | 静默降级页组件 + 文案（主理人确认） | T2 | `WebglFallback.tsx`, `index.css` |
| **T4** | `AltarScene` 监听 `contextlost/restored` + 降级回调 | T1 | `AltarScene.ts` |
| **T5** | 保时间轴/字幕/音频的"无画"路径（#4 不变量） | T2, T4 | `App.tsx`, `AltarScene.ts` |
| **T6** | 取证驱动 A（禁 WebGL 启动）+ B（`lose_context`） | T2, T4 | `verify-webgl-degradation.mjs` |
| **T7** | 亮度探针 + DOM 扫描断言 | T6 | 同上 |
| **T8** | 公共隔离回归（`verify-entry-isolation.mjs` 仍全绿） | T2 | 复用 |
| **T9** | 全程录屏 + manifest + 时间码检查表 | T5 | `capture.mjs`（`--run` / `recordVideo`） |

---

## 7. 待明确事项（默认假设 + `file:line` + 原文）

> 同 #6 纪律：对别的文件下断言必须给 `file:line` + 原文；本机 macOS/BSD `grep` 不支持 BRE `\|` 交替，多选一须 `grep -E`。

| # | 歧义 | 默认假设 | 依据（file:line + 原文） |
|---|---|---|---|
| **1** | 「静默降级」= 完全无音频，还是"有声无画"？ | **有声无画**：保留时间轴/字幕/音频，仅去掉 3D | `AltarScene.ts:1880`「**全程静默降级，绝不抛错。**」；`phaseEnvelope.ts:5-6`「包络**只由** #8 的单一时间轴 `ritualPhaseAt(sec)` 驱动，**禁止复制第二套时间轴**」 |
| **2** | WebGL2 缺失算「降质」还是「不可用」？ | **降质**（降档渲染，不换页） | `capture.mjs:309-316` 以 `c.getContext('webgl2')` 为能力判据；而 `AltarScene.ts:248` 直接构造、无探测（⇒ 判据须新增） |
| **3** | 降级页上屏文案由谁定？ | **主理人确认**；工程只给候选（须过 `SCAN_WORDS`） | `qa-audit-public-entry.mjs`（HEAD `:37`）`SCAN_WORDS = ['topology','ulam','49','91','rapier','camera','debug','speed','倍速','playback']`；`verify-entry-isolation.mjs:61` `ADMIN_WORDS = ['导演','认证','拓扑','座次','倍速','调试']` |
| **4** | 录屏是"视频"还是"帧序列"？ | **二者都要**：帧序列（manifest 佐证时间码）+ 视频（连续） | `tools/capture/main.ts:7-8`「seek(t)…用于 #2 首/中/末席静态取证 / start(r)…用于 #7 全程录屏」；脚本现状仅产 PNG（`capture.mjs:376`） |
| **5** | `rate=64` 的 ≈194s 墙钟是否唯一基线？ | 是**参考基线**；换机须重测（吞吐依实测 fps） | `capture.mjs:48` `const DEFAULT_RATE = 64;`；`:341-342` 硬上限按 10× 余量 |
| **6** | 降级下 49s 静默是否必须原样成立？ | **必须**（#4 不变量） | `phaseEnvelope.ts:9`「silence 幕 1751→1800 **恰 49s**，三层增益恒为 0」 |
| **7** | 移动端录屏设备/工具未定 | 同源 Playwright 移动视口 + 真机浏览器各一 | — （**无外部断言**，属范围决定） |

---

## 附录 A：本说明书自查

| 检查项 | 结论 |
|---|---|
| 是否修改了 `src/` / `scripts/` / `package.json` / `vite.config.ts` / `tools/` / `.gitea/`？ | **否**。仅新增 `docs/design/007-webgl-degradation.md` |
| 每个 `file:line` / 引文是否来自本次真实 `Read`/`grep -nE`？ | **是**。基线 HEAD=`eceaa85`；`webglcontextlost` 零命中、`AltarScene.ts:248` 无守卫、`capture.mjs:48` `DEFAULT_RATE=64` 均为现场回显 |
| 是否主张了产品代码现状中不存在的能力？ | **否**。§0 明列"当前无任何静默降级 / 无 contextlost 处理"，§1~§5 均为**待实现**设计 |
| 是否与 #5 隔离、#4 包络不变量一致？ | **是**。§3 强制降级只存测试侧；§2.2 单时间轴 + 49s 静默不得破坏 |
| 是否把未裁定结论写进文档？ | **否**。所有开放项均有默认假设并标注 `改哪一处`；文案定稿权交主理人（§7-3） |
