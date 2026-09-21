# Dev / Stage / Ops 发布拓扑与路由表

> Issue: #24
> 时区: Asia/Shanghai (GMT+8)
> 所有在线 Agent 与 Runner 统一 `TZ=Asia/Shanghai`。

## 一、拓扑总览

```
                        ┌─────────────────────────────────┐
                        │         开发者 / Agent           │
                        └─────────────┬─────────────────┘
                                      │ git push
                                      ▼
                        ┌─────────────────────────────────┐
                        │           Gitea (唯一写入口)      │
                        │     gitea.capitaltrain.cn        │
                        └─────────────┬─────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                         │
              ▼                       ▼                         ▼
     feature/<issue>-<slug>       dev (集成)               main = ops (稳定)
              │                       │                         │
              │ push PR               │ push to dev             │ push to main
              ▼                       ▼                         ▼
     ┌─────────────────┐   ┌─────────────────┐         ┌─────────────────┐
     │   CI: dev-ci    │   │ CI: dev-ci      │         │ CI: ops-deploy  │
     │  build+test     │   │ build+test      │         │ Cloudflare Pages│
     └─────────────────┘   └────────┬────────┘         └─────────────────┘
                                    │ merge dev → stage
                                    ▼
                           ┌─────────────────┐
                           │  NUC Runner       │
                           │  (标签: [nuc])    │
                           │  build+test+stage │
                           └────────┬────────┘
                                    │ rsync/scp
                                    ▼
                           ┌─────────────────┐
                           │  Kelly (运行机)   │
                           │  stage 服务容器   │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │  Caddy (边缘 TLS) │
                           │  *.git4ta.fun    │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │ Traefik (内部路由)│
                           │  stage → stage.   │
                           │  ops   → altar.   │
                           └────────┬────────┘
                                    │
                          ┌─────────┴─────────┐
                          ▼                   ▼
                   stage 容器            ops 容器
                (altar.git4ta.fun/      (altar.git4ta.fun/
                 stage/* 预览路由)        公共正典路由)
```

## 二、分支与环境契约

| 分支 | 环境 | 流量 | 触发动作 | 部署目标 |
|---|---|---|---|---|
| `feature/<issue>-<slug>` | 本地 / Agent | 无 | PR to dev | 无（仅 CI 验证） |
| `dev` | 集成 | 无公共流量 | push to dev | NUC Runner build+test，不部署 |
| `stage` | 预发布 | 仅 `stage.altar.git4ta.fun` | merge dev → stage | NUC Runner 部署到 Kelly stage 容器 |
| `main` | 生产 (ops) | `altar.git4ta.fun` | push to main | Cloudflare Pages（当前线上） |

**晋升规则**:
1. `feature/*` → PR → review → merge to `dev`
2. `dev` 全绿 → merge to `stage` → NUC Runner 部署到 Kelly stage
3. stage 验收通过 → merge to `main` → Cloudflare Pages 上线

**禁止**:
- 禁止 `feature/*` 或 `dev` 直接 push 到 `main`
- 禁止 NUC Runner 直接部署到 ops 容器
- 禁止绕过 Gitea 用 GitHub 镜像或公共前端部署

## 三、路由表

### 公共域名

| 域名 | 链路 | 服务 | 说明 |
|---|---|---|---|
| `altar.git4ta.fun` | Caddy → Traefik → Kelly:ops | 公共正典（#19 广播时钟） | 生产流量，只读 |
| `stage.altar.git4ta.fun` | Caddy → Traefik → Kelly:stage | 预发布验收 | 仅主理人/Agent 访问 |
| `altar.git4ta.fun/#/director` | Caddy → Traefik → Kelly:ops | 导演台（工程取证） | 与公共路由隔离 |

### 内部端口（Kelly 本机）

| 服务 | 容器名 | 端口 | Traefik 路由规则 |
|---|---|---|---|
| stage | `altar-stage` | 8081 | `Host(stage.altar.git4ta.fun)` |
| ops | `altar-ops` | 8080 | `Host(altar.git4ta.fun)` |
| Caddy | 边缘 TLS | 443 | 终结 TLS，反代到 Traefik :80 |
| Traefik | 内部路由 | 80 / 8080(API) | 根据 Host 分流 |

## 四、健康检查与回滚

### 健康检查
- stage 部署后：`curl -sf http://localhost:8081/healthz` 必须 200，30s 内连续 3 次通过
- ops 不参与自动部署，由 NUC Runner 手动触发晋升

### 回滚
- stage 失败：保留上一版容器，不切换流量，发 Gitea issue 通知
- stage 健康检查失败：自动切回上一版，**绝不影响 ops**
- ops 回滚：手动在 Cloudflare Pages 回滚到上一 deployment

## 五、Runner 权限边界

| Runner | 标签 | 权限 | 可部署目标 |
|---|---|---|---|
| `raccoon`（现有） | `[raccoon]` | build + Cloudflare Pages deploy | 仅 ops (main) |
| `nuc`（新建） | `[nuc]` | build + test + rsync to Kelly | 仅 stage 容器 |

**NUC Runner 禁止**:
- 直接写 ops 容器
- 接触 Cloudflare Pages
- 接触 TLS 私钥
- 接触 Gitea admin 权限
