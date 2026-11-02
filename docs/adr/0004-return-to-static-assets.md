---
status: accepted
---

# 0004：回归静态主题与 Workers Static Assets

2026-10-23 重新明确的目标是一个方便按日期阅读 Markdown 日记、保留 Aero 外观及背景音乐的阅读器。此前增加部分动态模式，主要是担心每次更新全站构建和托管平台的构建次数；用户进一步明确，简单的构建与运行流程更重要，R2、数据库和常驻后端超出了原始需求。

决定接受本地或 NAS 定时全站构建，将生成的完整 HTML 部署到 Workers Static Assets；正文保持构建时渲染，歌单采用 [0006](0006-runtime-static-playlist.md) 的静态资源读取。访问控制由部署侧的 Cloudflare Access 负责，主题本身不新增账户或加密系统。这是访问边界的设计选择，不代表本次已核验线上 Access 配置。

2026-10-24 从 `50dcbb1` 建立独立 `static` 分支和工作区，保留 `dev` 实验；后续按需提取归档等有用改动，而非合入整套 SSR/R2 实现。当前 [astro.config.mjs](../../astro.config.mjs) 固定 `output: 'static'`。更新日记仍需完成构建与部署，作为换取低运维复杂度的明确取舍。SSR 整合性能未达标也是实验背景，但回归静态的直接依据是重新确认的产品需求，不能简化为“SSR 无法使用”。

依据：[S09](SOURCES.md#s09) L34 原动机、L63/L85/L109/L119 需求收敛及 L138 暂缓讨论；[S10](SOURCES.md#s10) L13 恢复静态工作区指令、L36 完成报告；`static` 的分叉基线 `50dcbb1`。后续部署实现见 `862d7b8` 及[部署指南](../zh-CN/DEPLOYMENT.md)。
