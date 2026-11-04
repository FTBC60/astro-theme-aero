# 架构决策记录

本目录于 **2026-10-27（America/Los_Angeles）补录**，以 `static` 分支 `2715bb4` 为当前代码基线。记录过去修改的背景、取舍和落地内容；原始讨论日期与补录日期分别保留。编号按本次整理顺序排列，不代表精确的决策先后。

These retrospective ADRs document the static theme and the earlier dynamic experiment. The records are written in Chinese; source identifiers, Git revisions, implementation links, and verification limits are included for traceability.

| ADR | 决策 | 当前状态 |
| --- | --- | --- |
| [0001](0001-build-time-markdown-and-math.md) | 构建时生成正文与 MathJax SVG | 已采用 |
| [0002](0002-validated-static-export.md) | 分别导出经过检查的源码包和静态站点包 | 已采用 |
| [0003](0003-dynamic-publishing-experiment.md) | 方案 D：发布时编译、请求时组装，选用 Astro SSR＋私有 R2 | 历史实验；主线方向由 0004 取代，实验暂缓 |
| [0004](0004-return-to-static-assets.md) | 回归静态主题，以 Workers Static Assets 承载日记阅读器 | 已采用 |
| [0005](0005-explicit-publication.md) | 文章必须显式设置 `publish: true` | 已采用 |
| [0006](0006-runtime-static-playlist.md) | 浏览器读取静态歌单，保留跨页音频实例 | 已采用 |
| [0007](0007-notes-directory-and-attachments.md) | 单一笔记目录配置，只复制文章引用的附件 | 已采用；完整 Vault 本地验收通过，2026-10-31 用户反馈 NAS 单次发布正常 |
| [0008](0008-isolated-scheduled-publisher.md) | 容器作为独立编译工具，手动和定时任务共用隔离发布流程 | 已采用 |
| [0009](0009-external-deployment-configuration.md) | 每次任务读取主题外置 Wrangler 配置 | 已采用；最新更新的 NAS 复验仍有历史待验项 |
| [0010](0010-shared-public-resource-selection.md) | 站点导出与 Publisher 在构建前按共同规则选择 public 资源 | 已采用；本地验证通过，用户反馈 NAS 重建与试用正常 |
| [0011](0011-publication-before-validation.md) | 先筛选 YAML 布尔发布许可，再校验和编译文章 | 已采用；补充 0005 的完整 Vault 接入契约，用户反馈 NAS 发布测试正常 |
| [0012](0012-obsidian-frontmatter-types.md) | YAML Core 保留日期形状的标题和 slug 字符串 | 已采用；兼容 Obsidian 属性重排，NAS 需更新镜像后另行复验 |
| [0013](0013-delivery-scopes-and-test-isolation.md) | 分离 GitHub、作者源码包和 Publisher 镜像范围，集中测试资料 | 已采用；本地验收见测试说明，实际 Docker 构建与 Linux 调度待验 |
| [0014](0014-static-embedded-tools.md) | 单文件 HTML 工具、固定脚本＋下载权限与文章附件归属 | 已采用；核心及 NAS/Worker 链路通过，iPhone Chrome 滚动获用户实机通过反馈，桌面模拟差异保留 |

[变更追溯表](HISTORY.md)记录各阶段修改及提交，包括未单独立 ADR 的界面、归档和播放器修复。[恢复依据](SOURCES.md)记录本机会话文件、消息位置、证据边界和缺口。

补录遵循以下规则：

- 用户讨论确认“为什么”，提交和源码确认“改了什么”；助手的完成说明作为历史报告，与实际实现交叉核对。
- ADR 的“已采用”表示设计已落地，不自动表示通过所有环境验收或已经部署。旧测试均标为历史记录。
- 当前 `static` 代码不包含动态 Publisher、R2 或 SSR。动态实验的实现细节引用其历史提交，不能据此要求当前主题重新实现实验。
- 小型样式调整和普通修复进入追溯表；影响架构边界或存在长期取舍的决策才单独编号。将来改变决策时新增 ADR，并在旧记录链接替代者。

2026-10-27 补录时的本地链接、ADR 编号、提交引用和来源消息定位检查通过；当时只补录和核对文档，没有重新执行构建、浏览器、NAS 或 Cloudflare 验收。后续决策与验证范围见各篇 ADR 的日期和说明。
