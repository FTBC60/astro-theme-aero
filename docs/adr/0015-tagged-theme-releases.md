---
status: accepted
---

# 0015：正式版本标签与作者主题包自动发布

2026-11-04（America/Los_Angeles）。主要功能完成后，首个正式版本确定为 `1.0.0`。GitHub 仓库快照仍包含开发资料，不能替代 [ADR-0013](0013-delivery-scopes-and-test-isolation.md) 定义的作者交付物。

作者交付物统一称为“主题包 / Theme package”，文件名为 `astro-theme-aero-v<版本>-theme.tar.gz`；静态站点产物继续使用 `-site.tar.gz`。本地普通导出保留提交哈希和可选 `dirty` 标记，正式导出仅保留版本号。`package.json` 与锁文件根版本同步，依赖版本不随本次发布调整。

现有导出工具继续作为唯一打包入口。`npm run export:release` 要求干净工作区、与 package 版本完全一致且指向 HEAD 的现有 `v<版本>` 标签；检查和构建后再次验证版本状态，再产生主题包、站点包及仅针对主题包的 `SHA256SUMS.txt`。作者 manifest 移除测试及原型开发命令，正式导出命令由随包工具提供。

GitHub Actions 由版本标签推送触发，也可手动指定已存在的标签重试。构建任务仅有读取权限，固定 Node 24.22.1，执行串行回归、正式导出和独立交付范围检查。发布任务单独获得 `contents: write`，验证传递的校验文件后，使用内置令牌创建 Release；只上传主题包与校验文件。官方 Actions 固定到已核对的版本提交。

Release 标题为 `Astro Theme Aero v<版本>`，说明首先引导作者下载 `*-theme.tar.gz`，并区分 GitHub 自动生成的 “Source code” 快照。当前版本为正式版；以后带预发布后缀的标签标记为 prerelease。重复运行不覆盖已发布附件，修正正式交付物需创建新版本。

`.github/`、测试和维护资料仍为仓库专用，不进入主题包或 Publisher 镜像。该流程发布主题发行包，不执行 NAS 同步或博客部署。现有功能的设备验收边界继续以 [ADR-0014](0014-static-embedded-tools.md) 及其阶段记录为准。
