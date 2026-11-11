---
status: accepted
---

# 0013：区分仓库、作者源码包与 Publisher 镜像

2026-11-01（America/Los_Angeles）。主题收尾时，测试脚本与正式发布工具共处 `tools/`，完整 Vault 验收样本放在作者示例目录中；源码导出和 Docker 复制整个工具目录，使开发资料进入面向作者的交付物。

保留 GitHub 中的测试与经检查的维护资料，以便问题复现和后续维护；作者源码包只保留使用主题所需的源码、默认资源、作者示例、使用文档、正式工具和工程文件。Publisher 镜像只提供正式工具及依赖，主题和笔记仍由运行时挂载提供。

测试、DOM fixtures、完整 Vault 和验收文档统一放入 `tools/test/`，入口见[开发测试说明](../../tools/test/README.md)。作者示例继续放在 `examples/posts/`、`examples/pages/`、`examples/obsidian/` 和 `examples/deployment/`。架构和历史资料保留在 `docs/architecture/`、`docs/adr/`；原始会话、本地日志、截图和临时运维脚本不自动纳入公开仓库。

[交付清单](../../tools/lib/publish-files.mjs)明确列出作者源码包允许的目录和根文件，不依赖 `.gitignore` 隐藏仍需 Git 跟踪的测试或维护资料。允许范围内仍使用 Git 的跟踪与未忽略新文件枚举，并排除已从工作区删除的文件。站点的公开资源选择、笔记发布许可及附件规则不变。

[导出工具](../../tools/export.mjs)仅在打包副本的 `package.json` 中移除 `test` / `test:*` 及 `prototype:*` 开发命令；仓库清单、依赖和锁文件保持原有契约。Publisher 比较完整 package 文件，因此镜像须从主题实际使用的同一份仓库版本或作者源码包构建，不混用两种 manifest，也不放宽现有一致性检查。

[Dockerfile](../../Dockerfile)明确复制三个正式入口及 `tools/lib/`，[Docker 忽略规则](../../.dockerignore)排除 `tools/test/`。作者文档中的开发链接、测试命令和 Vault 验收入口迁至测试说明，保证下载包中的相对链接指向已交付文件。

公开维护资料保留决策、提交依据、日期和历史验收限制，移除私有会话文件名、私人部署地址与部署标识。此次检查针对当前拟公开文件，不改写 Git 历史，也不代表重新执行历史 NAS 或云端验收。

本决策细化 [0002](0002-validated-static-export.md) 的源码交付范围和 [0008](0008-isolated-scheduled-publisher.md) 的工具镜像范围。验证覆盖 archive 排除规则、仅副本 manifest 变化、作者文档链接、真实构建和 Publisher `build-only`；实际容器构建与 Linux 调度须在具备 Docker 的环境中另行验证。
