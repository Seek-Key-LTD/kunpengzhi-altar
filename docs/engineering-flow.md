# 工程流跑通 —— 第四包（w4/eng-flow）

> 基准：`stage@6346d00`（ci(mirror): GitHub 镜像改走 SSH…）。执行：raccoon-zcode（tea topaz）。2026-10-04。

## 1. 核验：dev/stage 不进 GitHub 镜像 ✓

证据（全部实查于本分支工作树 6346d00）：

1. **触发器只听 main**：`.gitea/workflows/sync-github.yml` `on.push.branches: [main]` + `workflow_dispatch`——dev/stage 的 push 根本不会创建镜像运行。
2. **推送到 GitHub 的 ref 只有 main**：`git push github-mirror HEAD:refs/heads/main`（dispatch 也只推 main）。
3. **全 workflow 排查**：`.gitea/workflows/` 下 6 个文件中，仅 sync-github.yml 出现 `github.com`；deploy.yml→Cloudflare Pages、stage-deploy.yml→nuc rsync、sync-to-codeup.yml→阿里云 Codeup（另有 gitea-codeup-sync TF 渲染，与 GitHub 无关）。
4. **SSH 前提实证**：镜像走 `git@github.com`，复用 runner（raccoon 本机）`~/.ssh` 已认证部署密钥——`ssh -T git@github.com` 实测返回 `Hi houzhonglogic!`（gh-ops 登记的具备写权限的个人账户）。HTTPS token（GITHUB_MIRROR_TOKEN）路线已弃用，gitea-ops#3 所述 secret 缺失问题随之消解。
5. **防覆盖守卫**：推送前 `merge-base --is-ancestor` 校验 GitHub 侧 main 是 Gitea main 的祖先，远端领先即报错退出——杜绝强推覆盖公开镜像。

## 2. main 分支保护（CI 绿才可合并）

- **缺口**：本仓原有无 PR→main 的 CI——dev-ci 只触发 dev/feature/** 与 PR→dev；main 的 PR 没有任何 status context，"CI 绿才可合并"无处可挂。
- **补齐**：本分支新增 `.gitea/workflows/ci.yml`（workflow `CI` / job `verify`），配方与 dev-ci 逐字同源（checkout→node22→npm ci→tsc→build→npm test 39 套件），触发 `pull_request: main` + `push: main` + dispatch，runner raccoon。
- **保护配置**（Gitea 侧，见下）：`main` 启用 status check 要求（context=CI verify）+ 禁止直推。配置动作与首次 context 名实证记录在本文件提交后的 run #1（workflow_dispatch 于本分支实测取回真实 context 串）。

## 3. 分支保护配置记录

| 项 | 值 | 说明 |
|---|---|---|
| branch | main | — |
| enable_push | false | 禁止绕过 CI 的直推 |
| enable_status_check | true | 必须绿才可合并 |
| status_check_contexts | （CI verify，以 dispatch 实测名为准） | 与 `.gitea/workflows/ci.yml` 对应 |
| block_on_official_review | — | 互审机制按导演组流程另行约定，本包不启用 |

> 纳管注记：branch protection 当前不在 gitea-ops TF 纳管范围（TF provider 能力与 state 归属待查证）；本次经 admin API 配置并在此留证，属「已声明的受控漂移」——TF 化立项建议记入 gitea-ops。

## 4. 合并流程（对本包生效后）

1. PR → main（如本分支 w4/eng-flow）；2. CI workflow `CI / verify` 自动跑（39 套件 + tsc + build）；3. 绿 + 无驳回评审 → 合并；4. push main 触发 sync-github（SSH 快进镜像，仅 main）与 CI 复跑作发布前闸。
