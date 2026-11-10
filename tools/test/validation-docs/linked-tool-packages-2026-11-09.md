# 普通链接目录包的本地验收

日期为 2026-11-09，时区为 America/Los_Angeles。本次在 `1fba224` 之后实现普通 Markdown 链接触发目录包发布。

## 实现约定

- 本地 `index.html` 普通链接复用 `expandToolPackage`。入口同目录的 `manifest.json` 负责选择发布文件。
- 普通链接的查询参数、锚点、标题与加粗等行内格式保留。文件解析和输出映射使用去除查询及片段后的路径。
- 无清单的 HTML 与目录包内其他 HTML 页面按单文件交付。普通图片、封面、远程地址及站点绝对地址使用各自原有处理路径。
- 本地 HTML 附件链接使用 `target="_blank"`、`rel="noopener"`、`data-astro-reload`，由浏览器原生打开独立页面。
- iframe 和普通链接共享附件计划、按文章复制、重复引用去重及输出冲突检查。开发预览使用同一入口集合提供目录别名。

## 环境与结果

Node.js 22.18.0，Astro 7.3.8，Playwright CLI 0.1.23，Chrome 148.0.7778.179。

| 检查 | 结果 |
| --- | --- |
| `node --test --test-concurrency=1 tools/test/*.test.mjs` | 133 项通过 |
| `npm run check` | 83 文件，0 errors / warnings / hints |
| `npm run build` | 默认站点 8 页 |
| 真实 Publisher 目录包集成 | 5 次成功的 build-only，1 次预期输出冲突失败 |
| 浏览器验收 | 6 组通过 |
| 开发预览更新 | 5 项通过 |

集成使用隔离主题副本与合成 Vault。第一篇混用 iframe 与普通链接，第二篇只含两个普通链接，分别指向同目录目录包和共享目录目录包。共享链接采用引用式 Markdown，带加粗文字、标题、查询参数和锚点。

合成工具包包含 `index.html`、`app.js`、`style.css`、`worker.js`、`data/manifest.json` 和用于验证清单减项的文本文件。每个已发布文件均与来源逐字节比对。入口旁的控制清单与未选文件被排除，嵌套 JSON 作为实际运行数据发布。

Publisher 覆盖 `/` 与 `/blog/`，验证完整本地及共享副本、混合引用去重、仅修改 JS 时更新、清单减项、文章撤稿、最后一个链接移除，以及失败构建保留之前的站点候选。撤稿第一篇后，仅含普通链接的第二篇仍保留完整包。

浏览器在 `/blog/` 的 Astro dev 和静态 preview 上实际点击本地及共享链接。两个工具分别在新标签页运行，保留查询参数和锚点，`window.opener` 为 `null`。工具完成时间戳计算，并实际运行 Worker、fetch 嵌套 JSON 与 localStorage 读写。继续浏览博客其他页面后，工具文档标记和计算结果仍保留。原有 iframe 的不透明来源、历史导航、390px 键盘操作与目录 URL 检查也通过。

首轮历史导航用例曾在 URL 已变化、DOM 尚在切换时读取 iframe，出现元素脱离 DOM。测试已改为等待 `astro:after-swap` 计数增加，再读取目标页面，复验通过。

## 复现入口

```sh
node tools/test/embedded-tools/package-integration.mjs
```

该脚本生成 `.astro/tool-packages-phase-b/manifest.json`，其中记录临时主题目录、预览端口和产物位置。复用此前的目录包验收夹具，当前版本同时覆盖 iframe 和普通链接。

在记录的主题副本目录下使用 Astro CLI 启动 `dev` 和 `preview`，监听 127.0.0.1 与记录的端口，然后按顺序运行浏览器和更新检查。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test/embedded-tools/package-browser.ps1
node tools/test/embedded-tools/package-dev-updates.mjs
```

本机完整日志位于 `.astro/linked-packages-2026-11-09/`。浏览器报告在夹具的 `output/playwright/browser-report.json`，开发更新结果在夹具的 `dev-updates-report.json`。浏览器与更新检查按顺序执行，更新检查会恢复合成输入。

## 验证范围

本次结果来自本机合成工具和隔离发布流程。WebADB 实际设备授权、音乐解锁的业务处理、真机后台调度及 NAS／Cloudflare 的本轮部署行为，需要各自在目标环境验证。源码和网站交付能力由上述测试覆盖。
