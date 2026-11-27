---
status: accepted
---

# 0021：保留 NAS 发布容器并新增 GitHub Actions 编译发布流程

2026-11-26（America/Los_Angeles）。自 2026-11-23 起讨论将 [ADR-0008](0008-isolated-scheduled-publisher.md) 的发布能力扩展到 GitHub Actions，使没有 NAS 的博客作者也能通过 GitHub Template 直接编译并部署到 Cloudflare Workers。最终决定**保留群晖 NAS 容器作为方案一，新增 GitHub Actions 发布流程作为方案二**，在 CI 中直接复用 `npm run deploy` / `npm run deploy:dry-run`，并在仓库无 Cloudflare Secrets 时自动回退为检查与构建。相关实现已提交至 `static` 分支 `5d7c2cb`，本地验证通过；GitHub Actions 云端实际执行与线上部署尚待在 GitHub 仓库触发验证。

## 背景

既有发布体系假设作者在群晖 NAS 上运行常驻 Docker 容器，由 Supercronic 定时触发 `tools/deploy.mjs`，从只读挂载的主题目录与外部 Obsidian Vault 编译站点并上传 Workers Static Assets。这一设计依赖本地 NAS、Docker 与容器内调度，没有 NAS 的作者缺少开箱即用的自动发布路径。

作者明确本次目标并非废弃或迁移替代 NAS 发布器，而是：

- 将主题作为 **GitHub Template**，让作者可直接复制仓库，并将笔记提交到仓库内置的 `src/content/posts/` 目录；
- 当作者不希望公开未发布草稿或私人笔记时，可在复制模板后将自己的仓库设为 Private，而非在公开主题模板内引入复杂的外部私有仓库拉取机制；
- 保留现有的 Docker 容器、Compose 示例与全部 NAS 发布文档，在文档中以「方案一（NAS）/ 方案二（GitHub Actions）」并列呈现。

## 决策

- **GitHub Actions 直接复用 `npm run deploy` 链（路径 A）**：新增 [publish.yml](../../.github/workflows/publish.yml)，使用 `ubuntu-24.04` 与 Node.js `24.22.1`，支持 `push`（`main` / `master`，忽略纯文档和发行脚本改动）、每日 UTC `11:00` 定时触发（`0 11 * * *`）以及带 `dry_run` 开关的 `workflow_dispatch`，并用 `concurrency: blog-publish`（`cancel-in-progress: false`）防止并发部署冲突。工作流直接调用 `npm run deploy` 或 `npm run deploy:dry-run`，从而与方案一共用同一套 [deploy.mjs](../../tools/deploy.mjs) 校验、隔离构建、产物上限检查（20,000 文件 / 单文件 25 MiB）与日志脱敏逻辑，失败时保留 `.astro/publisher/logs/` 与 `status.json` 7 天作为 Artifact。
- **未配置 Cloudflare Secrets 时的分级回退**：由于主题仓库本身是公开的 GitHub Template 仓库（且作者刚复制模板或选用方案一 NAS 时也尚未配置 Secrets），当 `CLOUDFLARE_ACCOUNT_ID` 或 `CLOUDFLARE_API_TOKEN` 缺失或仍为 `REPLACE_WITH_*` 占位符时：
  - `push` 与 `schedule` 自动回退为仅执行 `npm run check` 与 `npm run build` 验证编译，避免模板仓库或未启用云端部署的仓库持续报错；
  - 手动触发 `workflow_dispatch` 且未勾选 `dry_run` 时则显式失败退出，防止误以为部署已上线；
  - 勾选 `dry_run: true` 时执行 `npm run deploy:dry-run`（已验证在无 Cloudflare 凭据时仍可完成检查、构建与 Wrangler `--dry-run`）。
- **同步提供 `*-theme.tar.gz` 作者模板副本**：遵循 [ADR-0013](0013-delivery-scopes-and-test-isolation.md) 与 [ADR-0015](0015-tagged-theme-releases.md)，`.github/` 继续排除在发行版主题包外。为兼顾通过 Release 下载 `*-theme.tar.gz` 的作者，在 `examples/deployment/` 白名单目录下新增与工作流字节完全一致的 [publish.yml 模板](../../examples/deployment/publish.yml)，在 [verify-theme.mjs](../../.github/scripts/verify-theme.mjs) 中校验其随包交付，并在 [publisher.test.mjs](../../tools/test/publisher.test.mjs) 中强制校验两份 `publish.yml` 一致性与关键配置。
- **默认启用 `workers.dev`**：将根目录 [wrangler.json](../../wrangler.json) 的 `workers_dev` 从 `false` 改为 `true`，暂不预设 `routes`，降低首次通过模板部署预览的门槛；同步更新 [publisher.test.mjs](../../tools/test/publisher.test.mjs) 断言（同时继续覆盖切换回 `workers_dev: false` 的测试）。
- **双语文档与大音频边界**：更新 [中文部署指南](../zh-CN/DEPLOYMENT.md)、[英文部署指南](../en/DEPLOYMENT.md) 及中英文 `README.md`，说明双方案配置、GitHub Template 与主题包的差异、UTC 定时及 60 天无提交暂停机制，以及通过 `public/audio/playlist.json` 使用支持 CORS 的外部 HTTPS 音频链接来规避 Git 体积与 Cloudflare Workers 单文件 25 MiB 限制。

不拆出独立于 `tools/deploy.mjs` 的另一套 CI 构建/上传脚本，也不修改现有 `notesDir`、`release.yml` 与 NAS 容器行为。

## 取舍与影响

相比在 YAML 中手动串联 `astro check`、`astro build` 与自定义临时 `wrangler.json` 脚本，直接复用 `npm run deploy` 会在 Runner 临时目录内多拷贝一次 `src/`、`public/` 与 `posts/`，但消除了两套发布逻辑漂移的风险，且继续沿用 [ADR-0009](0009-external-deployment-configuration.md) 对根目录 `wrangler.json` 禁止填写 `assets.directory` 的约束。

将 `publish.yml` 同时保留在 `.github/workflows/` 与 `examples/deployment/` 需要两份文件严格同步；这一维护成本已由自动化单测兜底，任意一侧修改不同步时 `npm run test:publisher` / `npm run test:release` 会直接失败。

## 落地与验证

本次变更已通过提交 `5d7c2cb` 合入 `static` 分支，涵盖 `.github/workflows/publish.yml`、`examples/deployment/publish.yml`、`.github/scripts/verify-theme.mjs`、`wrangler.json`、`tools/test/publisher.test.mjs`、中英文 `DEPLOYMENT.md` 与 `README.md`，以及方案文档与 `.gitignore`（新增 `AGENTS.md`）。

2026-11-26 在本地 Windows 环境（Node.js 24）执行的验证结果：
- 无 Cloudflare 凭据下执行 `node tools/deploy.mjs --dry-run` 通过：隔离副本 `astro check`（48 个文件 0 错误/警告/提示）、`astro build`（8 页）与 Wrangler 4.152.0 `--dry-run`（资产目录 47 个文件 / 检查输出 34 个文件）均成功退出；
- `npm run test:release`：169 项测试全部通过（0 失败、0 跳过），包含新增的 `publish.yml` 双份一致性与结构校验、更新后的 `workers_dev` 测试以及作者文档链接检查；
- `npm run check`：91 个文件 0 错误、0 警告、0 提示；
- `npm run build`：生成 8 个静态页面。

上述检查仅覆盖本地运行与静态导出校验；在 GitHub Actions 真实 Runner 上触发 `publish.yml` 并携带真实 Secrets 上传至 Cloudflare Workers 尚未在本轮环境执行，需在仓库实际配置 Secrets 后验证。

## 依据

多轮讨论、6 项设计决策回复与实施边界见 [S22](SOURCES.md#s22)，提交记录见 [HISTORY.md](HISTORY.md)。方案分析与设计决策见 [Publisher → GitHub Actions 方案文档](../architecture/publisher-to-github-actions.md)，相关前期决策见 [ADR-0008](0008-isolated-scheduled-publisher.md)、[ADR-0009](0009-external-deployment-configuration.md)、[ADR-0013](0013-delivery-scopes-and-test-isolation.md) 与 [ADR-0015](0015-tagged-theme-releases.md)。
