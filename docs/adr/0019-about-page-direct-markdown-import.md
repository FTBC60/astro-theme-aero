---
status: accepted
---

# 0019：About 固定页面分离作者内容与路由，直接导入 Markdown

2026-11-13（America/Los_Angeles）。继 [ADR-0018](0018-aero-playlist-viewport-accordion.md) 的播放列表调整之后，整理 Aero 的 About 固定页面目录。选择直接导入 Markdown 的方案 B，让作者内容、Astro 路由和页面布局分别由独立文件承担。本决策已在 `static` 分支实施并通过本地验收，尚未发布。

## 背景

原 `src/pages/about.md` 同时保存作者编写的正文，并由 Astro 的 Markdown 文件路由生成 `/about/`。这种写法符合 Astro 的约定，但作者修改页面内容时需要进入主题路由目录；同时，`src/layouts/AboutLayout.astro` 已单独负责页面展示。将 About 内容放入内容目录，能让作者编辑入口与主题维护的路由、布局职责更清晰。

本次只有一个需要独立维护的 About 页面，现有 `src/content.config.ts` 仅注册 `posts` 内容集合。为单页新增集合需要额外配置 Schema 和查询、渲染流程，当前没有批量管理固定页面的需求。

## 决策

- 将 `src/pages/about.md` 移至 [作者内容](../../src/content/pages/about.md)。保留 `title`、`description` 与正文，移除 Markdown 文件路由专用的 `layout` 字段，并更新正文中的编辑路径。
- 新增 [固定路由](../../src/pages/about.astro)，直接导入 Markdown 的 `Content` 与 `frontmatter`，将正文交给现有 [AboutLayout](../../src/layouts/AboutLayout.astro) 渲染。页面地址保持 `/about/`，布局与 SEO 元数据沿用原有逻辑。
- [Remark 固定页面图片插件](../../src/integrations/page-images.mjs) 同时识别 `src/pages/` 与 `src/content/pages/` 来源，按最终页面 URL 解析相对图片路径。保留 Markdown 图片、引用式图片、原始 HTML `<img>`、已有 `base` 前缀及相邻真实源图片的既有处理规则，支持根部署和 `/blog/` 子路径部署。
- 同步更新中英文 About 示例、作者说明、图片测试与发行包测试，使作者主题包包含新的内容文件与路由入口。

不新增 `pages` Content Collection、Schema、`getEntry()` / `render()` 调用、动态固定页面路由或通用附件发布机制。`posts` 集合、`notesDir`、文章加载器及 Publisher 流程继续使用已有实现。

## 取舍与影响

直接导入 Markdown 已满足当前单页的职责分离目标，改动集中于一条固定路由及既有图片插件的来源识别。相比新增 Content Collection，它减少了单个页面的注册、查询和 Schema 维护成本。若以后出现需要统一查询、校验或批量生成的多个固定内容页面，再独立评估集合方案。

作者今后编辑 `src/content/pages/about.md`。源文件位置改变后，相对图片必须继续按 `/about/` 这一最终页面路径生成浏览器 URL，而不能把 `src/content/pages/` 当作公开 URL 路径；真正位于 Markdown 文件旁的图片仍保留 Astro 源图片导入行为。

## 落地与验证

实现涉及 [About 路由](../../src/pages/about.astro)、[内容文件](../../src/content/pages/about.md)、[图片插件](../../src/integrations/page-images.mjs)、[图片回归测试](../../tools/test/page-images.test.mjs)和[发行包测试](../../tools/test/release.test.mjs)，以及中英文示例与使用文档。

2026-11-13 的实施记录显示 `npm run test:page-images` 7 项通过，`npm run check` 检查 88 个文件且零错误、零警告，`npm run build` 生成包括 `/about/index.html` 在内的 8 个页面，`npm run test:release` 151 项通过，`npm run export` 成功并核对了源码包与站点包。图片测试覆盖新旧来源、根路径与 `/blog/` 前缀，及相邻真实图片的处理。物理设备上的导航交互与最终部署仍按发布流程复核。

## 依据

决策讨论与实施证据见 [S20](SOURCES.md#s20)，变更追溯见 [HISTORY.md](HISTORY.md)。设计权衡、文件清单、图片语义和验收记录见 [About 迁移开发方案（方案 B）](../architecture/about-page-migration-development-plan.md)。Astro 的直接 Markdown 导入机制见 [Markdown 内容指南](https://docs.astro.build/en/guides/markdown-content/)，Content Collection 的适用场景见 [Content Collections 指南](https://docs.astro.build/en/guides/content-collections/)。
