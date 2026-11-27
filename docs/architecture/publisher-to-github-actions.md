# Publisher 与 GitHub Actions 发布方案

2026-11-26。新增 GitHub Actions 自动编译发布选项，保留 NAS Docker Publisher。最终决策及验收记录见 [ADR-0021](../adr/0021-github-actions-publishing-workflow.md)。

## 架构

- NAS：Supercronic 调用 Publisher，使用只读挂载的主题和笔记目录，隔离构建并部署到 Cloudflare Workers。
- GitHub Actions：从仓库 checkout 后安装锁定依赖，通过相同的 Publisher 入口执行检查、构建及部署。无部署凭据时，push 和 schedule 仅检查与构建。
- 主题发行：release.yml 独立响应版本标签，生成作者主题包及 SHA-256 校验文件。

## 设计取舍

评估过将笔记存放在 Git 仓库、外部对象存储或 NAS，以及使用自托管 Runner。采用仓库内置笔记目录作为 GitHub Template 的默认路径，可通过私有博客仓库保护未发布的笔记。继续支持 NAS 本地 Vault；两种部署方案共用 Publisher，避免重复实现和验证逻辑。

保留 Compose 示例、Dockerfile、调度工具和双语文档。作者源码包提供 examples/deployment/publish.yml，与仓库工作流保持一致。默认 wrangler.json 启用 workers.dev，不预设自定义路由。外部 HTTPS 音频链接仍可使用，需满足 CORS 要求。

工作流支持 main/master 推送、每日 UTC 11:00 调度和手动 dry run。Cloudflare 账户 ID 和 API Token 通过 Actions Secrets 配置。相关操作见 [中文部署指南](../zh-CN/DEPLOYMENT.md) 与 [英文部署指南](../en/DEPLOYMENT.md)。