# 环境契约与密钥边界

> Issue: #24
> 时区: Asia/Shanghai (GMT+8)

## 一、环境变量清单

### 公共（前端可访问）

| 变量 | dev | stage | ops | 说明 |
|---|---|---|---|---|
| `VITE_ARCH_ENV` | `dev` | `stage` | `ops` | 环境标识 |
| `VITE_BROADCAST_ENDPOINT` | - | - | `https://altar.git4ta.fun/api/broadcast` | #19 广播时钟源 |

### 服务端（Kelly / NUC Runner，不进前端）

| 变量 | 位置 | 说明 |
|---|---|---|
| `KELLY_HOST` | Gitea Secret | Kelly 运行机地址 |
| `KELLY_USER` | Gitea Secret | Kelly SSH 用户 |
| `KELLY_SSH_KEY` | Gitea Secret | Kelly SSH 私钥 |
| `CLOUDFLARE_API_TOKEN` | Gitea Secret | Cloudflare Pages 部署 token（仅 ops） |
| `GITHUB_MIRROR_TOKEN` | Gitea Secret | GitHub 镜像 token（只读镜像） |

## 二、密钥红线

- 禁止把任何 token / 私钥写进前端代码或公开仓库
- 禁止 NUC Runner 接触 `CLOUDFLARE_API_TOKEN`
- 禁止 raccoon Runner 接触 `KELLY_SSH_KEY`
- 所有密钥必须通过 Gitea Secrets 注入，workflow 里 `echo "$KEY" > /tmp/xxx && chmod 600`，用完即删

## 三、晋升审批边界

| 阶段 | 触发 | 审批 |
|---|---|---|
| feature → dev | PR | 主理人 review |
| dev → stage | merge | 自动（CI 全绿即可） |
| stage → ops (main) | merge | 主理人手动合并 + Cloudflare Pages 自动部署 |

## 四、为 #19 / #22 预留

### #19 公共广播时钟
- 服务端时间源：Kelly 上 `https://altar.git4ta.fun/api/broadcast`
- 前端只读使用，不本地重置仪式时钟
- Caddy 反代 `/api/*` → Kelly:ops:8080

### #22 手机 handoff
- handoff token 签发：Kelly 服务端签发，短时一次性
- 二维码 URL：`https://altar.git4ta.fun/handoff?token=xxx`
- Caddy 反代 `/handoff` → Kelly:ops:8080
