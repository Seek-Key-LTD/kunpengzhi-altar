# #11-A · 既有 Cloudflare Worker 与朗诵资产可达性审计

> **阶段**：Gitea #11「五绝赋 17 段录音」**A 阶段**（只读取证，不写产品代码）
> **审计人**：software-engineer
> **基线 HEAD**：`4647199`
> **线上站点**：`https://altar.git4ta.fun`
> **本文不含任何密钥/账号全文**（token / account id / secret 一律脱敏）。

---

## 0. 结论摘要（TL;DR）

| 问题 | 判定 |
|---|---|
| A. `/ritual-audio/chap_NN.mp3` route 契约**是否已存在且可用**？ | **否，不存在。** |
| B. 返回是否满足 `Content-Type: audio/mpeg` + `Range`？ | **否**（当前返回 `text/html`，**Range 被忽略**，一律 `200`） |
| C. 本机是否有既有 Wrangler 登录态 / 既有 Worker 配置？ | **否。** 本机未登录；仓库内**无** `wrangler.toml`、**无** `functions/`、**无**任何 Worker 源。 |
| D. 平台侧部署方式是什么？ | **Cloudflare Pages**（项目名 `kunpengzhi-altar`），非 Worker。凭据在 **Gitea Actions secret**（自托管 runner）里，不在本机/仓库。 |
| E. 我们现在能否直接部署一个 `/ritual-audio/` 服务？ | **不能直连**：缺对象存储绑定/凭据 + 缺 CF 部署权限（本机无登录态）。**不新建任何基础设施**（遵守 #11 红线）。 |

**一句话**：既有平台**没有**任何服务于 `/ritual-audio/` 的 Worker；该前缀当前**落回 SPA `index.html`**（`200 text/html`，非音频）。#11 要实现契约，需**新增**一段路由逻辑（Pages Function 或 Worker）**并**获得对象存储访问（绑定名/凭据目前未知）。

---

## 1. 第 1 步 · 本机 Wrangler / Cloudflare 现场勘查（只读）

### 1.1 本机凭据与环境变量（**只判存在，不打印值**）
```
CLOUDFLARE_API_TOKEN  = unset
CLOUDFLARE_ACCOUNT_ID = unset
CF_API_TOKEN          = unset
CF_ACCOUNT_ID         = unset
CLOUDFLARE_API_KEY    = unset
CLOUDFLARE_EMAIL      = unset
```
无 `.dev.vars`、无 `.env`。本机存在 HTTP 代理（`HTTP_PROXY/HTTPS_PROXY = 127.0.0.1:*`，仅记 host，值隐藏）——wrangler 启动时亦警告「Proxy environment variables detected」。

### 1.2 Wrangler 安装态
- 全局 `wrangler` 不在 PATH；项目内 `node_modules/.bin/wrangler` **存在**（`devDependencies: "wrangler": "^4.130.0"`）。

### 1.3 登录态（决定性）
```
$ ./node_modules/.bin/wrangler whoami
Getting User settings...
You are not authenticated. Please run `wrangler login`.
```
→ **本机无既有 Wrangler 登录态。** 按 #11 约定，**未尝试登录、未新建任何设施**。

### 1.4 仓库内 Wrangler / Worker 配置
- `git ls-files` 与磁盘扫描（排除 `node_modules`）均**未发现**：`wrangler.toml` / `wrangler.jsonc` / `.wrangler/` / `functions/`。
- 无 `.github/workflows`；CI/部署全部在 **`.gitea/workflows/`**。

### 1.5 平台侧部署配置（来自仓库内 `.gitea/workflows/deploy.yml`，**非密钥**）
- 触发：`push` 到 `main`（及手动）。
- runner：自托管 `[raccoon]`。
- 步骤：`npm install` → `npm run build` → `npx wrangler pages deploy dist --project-name=kunpengzhi-altar --branch=main --commit-dirty=true`。
- 部署身份：`CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}`（**仓库 secret**，值不在本机、不在仓库）。
- **类型 = Cloudflare Pages 项目**，项目名（binding 语义上唯一可公开的标识）：**`kunpengzhi-altar`**。
- 另有 `.gitea/workflows/sync-github.yml`（Gitea → GitHub 公开镜像），与本次无关。

> ⚠️ 与 #11 正文设想的「已有 Worker + route + R2/S3 binding」**不一致**：本仓库只有 **Pages** 部署通道，**没有任何 Worker source、没有 R2/S3 绑定名**可引用。

---

## 2. 第 2 步 · 线上契约实测（HEAD + 少量字节 Range）

> 仅 `curl -sSI`（HEAD）与 `-r 0-1023`（≤1KB GET），**未整段下载**。
> 经本机代理（`HTTP/1.1 200 Connection Established` 为代理 CONNECT 隧道，其后 `HTTP/2 xxx` 为真实源站响应）。

| 请求 | 状态码 | content-type | accept-ranges | content-range | content-length | 备注 |
|---|---|---|---|---|---|---|
| HEAD `/ritual-audio/chap_00.mp3` | **200** | **`text/html; charset=utf-8`** | **（无）** | （无） | （无） | 非音频 |
| Range(0–1023) `/ritual-audio/chap_00.mp3` | **200** | **`text/html; charset=utf-8`** | （无） | （无） | — | **Range 被忽略**（非 206） |
| HEAD `/ritual-audio/chap_08.mp3` | **200** | **`text/html; charset=utf-8`** | （无） | （无） | （无） | 非音频 |
| Range(0–1023) `/ritual-audio/chap_08.mp3` | **200** | **`text/html; charset=utf-8`** | （无） | （无） | — | **Range 被忽略**（非 206） |

**响应体**（前 90 字符，与实际站点根 `/` 逐字相同）：
```
<!doctype html> <html lang="zh-CN" class="dark">   <head>     <meta charset="UTF-8" />
```

**判定**：`/ritual-audio/chap_NN.mp3` 命中的是 **SPA 兜底 `index.html`**（1217 B），**不是**音频对象。
（`content-length` 在 HTTP/2 下未回显；关键信号是 `content-type: text/html` + 与根路径相同的 HTML 体。）

---

## 3. 第 3 步 · 拒绝路径实测（各记状态码 + 响应体前 90 字符）

| 场景 | URL（经 `curl --path-as-is`） | 状态码 | content-type | 响应体前 90 字符 |
|---|---|---|---|---|
| 对照：站点根 | `/` | 200 | `text/html; charset=utf-8` | `<!doctype html> <html lang="zh-CN" class="dark">…` |
| 越界章节 | `/ritual-audio/chap_17.mp3` | **200** | `text/html` | 同上（SPA 兜底） |
| 路径穿越（parent） | `/ritual-audio/../index.html` | **308** | （空） | （空，Pages 归一化重定向） |
| 路径穿越（回绕） | `/ritual-audio/../ritual-audio/chap_00.mp3` | **200** | `text/html` | 同上（SPA 兜底） |
| 路径穿越（编码） | `/ritual-audio/%2e%2e/chap_00.mp3` | **200** | `text/html` | 同上（SPA 兜底） |
| 查询拼 key | `/ritual-audio/chap_00.mp3?key=oca/21579-lhhq-164014/五绝赋_mp3/chap_00.mp3` | **200** | `text/html` | 同上（SPA 兜底） |
| 目录列举 | `/ritual-audio/` | **200** | `text/html` | 同上（SPA 兜底） |
| 目录列举（前缀） | `/ritual-audio/chap_` | **200** | `text/html` | 同上（SPA 兜底） |

**判定**：当前**没有任何路由逻辑**区分合法/非法键——一切未知路径都均匀落回 `index.html`（`200`）。这**正是 #11 要规避的「SPA 200 兜底」陷阱**：未来 Worker 必须对越界/穿越/任意 key/目录列举返回 **4xx（非 200 HTML）**，对合法键返回 **`audio/mpeg` + `Range`/206**。

---

## 4. 第 4 步 · 结论与缺口

### 4.1 (a) route 契约是否已存在且可用
**不存在。** `/ritual-audio/chap_NN.mp3` 现返回 SPA `index.html`（`200 text/html`），非音频、无 Range。

### 4.2 (b) 若不存在，缺什么

| 缺口 | 说明 | 谁能补 |
|---|---|---|
| ① 服务端路由逻辑 | 仓库内**无** `functions/`、**无** Worker source；Pages 现把未知路径一律兜底 `index.html` | 需**新增**：`functions/ritual-audio/[[path]].ts`（Pages Function，随本项目部署）**或**独立 Worker + route。二者均需 CF 权限与存储绑定 |
| ② 对象存储访问 | 前缀 `oca/21579-lhhq-164014/五绝赋_mp3/`（17 对象 `chap_00..16.mp3`）在**某对象存储**；仓库内**无**任何 R2/S3/OCI 绑定名或 endpoint、无 `mc` alias 引用 | 需平台侧提供**绑定名**（如 R2 binding）或只读凭据；**本机/仓库当前均无** |
| ③ 部署权限 | 本机 `wrangler whoami` = 未认证；CF token 仅存于 **Gitea Actions secret**（runner `[raccoon]`） | 走既有 `.gitea/workflows/deploy.yml` 通道（push main）或由持有 secret 者操作 |
| ④ route 命名 | #11 要求同域只读契约 `/ritual-audio/chap_NN.mp3`（严格白名单 `chap_00..chap_16`） | 与 ① 同批实现 |

### 4.3 (c) 若存在，返回是否满足 `audio/mpeg` + Range
不适用（**不存在**）。当前实测：`text/html`、无 `Accept-Ranges`、Range 请求被降级为 `200` 全量语义。

### 4.4 与 #11 正文的关键偏差（须向 Issue 澄清）
#11 正文假设「**复用平台侧既有的 Worker/Wrangler 配置**，定位已部署 Worker、其 route 与现有 R2/S3 binding 名称」。
**实测结论**：本仓库与部署通道中**并不存在**这样的 Worker/R2/S3 配置——平台侧只有 **Pages 部署**。因此 #11 的「复用既有 Worker」前提**不成立**，需要：
- 明确对象存储的服务方与**可用的绑定/凭据**（否则无法只读取对象）；以及
- 明确是在 **Pages 内新增 Function** 还是 **新建/复用独立 Worker**（后者触及「不得新建基础设施」红线，需授权）。

---

## 5. 可复现命令（全部只读）

```bash
# 1) 本机登录态 / 配置（Sanitized）
./node_modules/.bin/wrangler whoami            # → You are not authenticated
node -e 'const p=require("./package.json");console.log(p.scripts.deploy)'
cat .gitea/workflows/deploy.yml

# 2) 线上契约（HEAD + ≤1KB Range，禁止整段下载）
curl -sSI --max-time 25 https://altar.git4ta.fun/ritual-audio/chap_00.mp3
curl -sS  --max-time 25 -r 0-1023 -D- -o /dev/null https://altar.git4ta.fun/ritual-audio/chap_00.mp3

# 3) 拒绝路径（--path-as-is 保留 .. 不做客户端归一化）
curl -sS --path-as-is --max-time 20 -o /dev/null -w '%{http_code} %{content_type}\n' \
  https://altar.git4ta.fun/ritual-audio/chap_17.mp3
```

---

## 6. 红线遵守声明
- 本阶段**只读**：未改动 `src/`、`package.json`、`scripts/qa-*`、`artifacts/audit/`。
- **未**新建账号 / bucket / 公开桶 / 任何基础设施；**未**尝试 `wrangler login`。
- **未**改动 `oca/21579-lhhq-164014/五绝赋_mp3/` 下任何对象；**未**整段下载音频。
- 全文**不含**密钥 / token / account id 全文（已脱敏）。
