# Aero 关于页迁移开发方案（最终版，方案 B）

> 日期：2026-11-13（America/Los_Angeles）
> 状态：已实施并通过本地验收，尚未发布
> 实施仓库：`astro-theme-aero-static`（当前开发线 `static`）
> 适用版本：Aero v1.2.0 / Astro 7

## 1. 背景与目标

迁移前，`src/pages/about.md` 同时保存作者编写的 About 内容并依靠 Astro Markdown 文件路由生成 `/about/`。这种写法受 Astro 支持，但它把作者内容与主题维护的路由代码放在同一个目录中。`src/layouts/AboutLayout.astro` 已独立负责页面布局。

本轮迁移将固定路由、作者内容和页面布局分别放在 `pages/`、`content/pages/`、`layouts/`，保持作者修改 About 页的操作简单。

完成后满足以下结果。

- `/about/` 地址、页面标题、描述、正文呈现与现有布局保持一致。
- 作者只需编辑 `src/content/pages/about.md`，或将中英文示例复制到该位置。
- 现有 Remark 固定页面图片处理同时识别迁移后的 About 与其他仍位于 `src/pages/` 的 Markdown 页面。
- `posts` 内容集合、`notesDir`、Publisher、导出及部署行为继续沿用现有流程。

## 2. 最终架构决定

选择**方案 B：直接导入单个 Markdown 文件**。Astro 官方允许将 `src/` 内的 Markdown 直接导入 `.astro`，并使用其 `Content` 与 `frontmatter` 导出。对于唯一的 About 固定页面，沿用这一机制即可。

```text
src/
├── content/
│   ├── pages/
│   │   └── about.md           # 作者编辑的 About 正文和元数据
│   └── posts/                # 保留现有文章内容目录
├── layouts/
│   └── AboutLayout.astro     # 现有页面布局
├── pages/
│   └── about.astro           # 固定 /about/ 路由
└── content.config.ts        # 继续只注册 posts
```

不新增 `pages` Content Collection、Schema、`getEntry()`、`render()`、`import.meta.glob()`、动态固定页面路由、`pagesDir` 用户配置项或通用附件管线。`src/config/content.config.ts` 的 `notesDir` 与文章加载器不变。

### 2.1 路由实现

迁移后创建 `src/pages/about.astro`，内容如下。

```astro
---
import AboutLayout from '../layouts/AboutLayout.astro';
import { Content, frontmatter } from '../content/pages/about.md';
const aboutFrontmatter = frontmatter as { title: string; description?: string };
---

<AboutLayout frontmatter={aboutFrontmatter}>
  <Content />
</AboutLayout>
```

保留 `AboutLayout.astro` 对 `frontmatter.title` 和可选 `frontmatter.description` 的读取，以及 `BaseLayout`、`article` 和正文插槽的现有结构。

`about.md` 的 frontmatter 保留 `title` 和 `description`，删除仅用于 Markdown 文件路由的 `layout: ../layouts/AboutLayout.astro`。文件正文中的两处旧编辑路径同步改为 `src/content/pages/about.md`。删除旧的 `src/pages/about.md`，确保 `/about/` 只有一条路由。

官方机制依据见 [Astro Markdown 文档](https://docs.astro.build/en/guides/markdown-content/) 与 [Content Collections 文档](https://docs.astro.build/en/guides/content-collections/)。实现阶段以当前锁定的 Astro 7.3.8 执行 `check` 和 `build`，确认该目录中的直接导入实际可用。

## 3. 固定页面图片处理

### 3.1 迁移前行为

迁移前，`src/integrations/page-images.mjs` 的 `remarkPageImages({ pagesDir, base })` 只识别位于 `src/pages/` 下的 Markdown 源文件。它将源文件相对路径转换为最终页面路径，然后复用 `imageUrl()`、`rawImages()` 及 Remark AST 遍历处理以下内容。

- Markdown 图片及引用式图片。
- 原始 HTML `<img src="...">`。
- 外部链接、数据 URL、锚点与已有部署 `base` 前缀。
- 与 Markdown 同目录的真实图片文件所使用的 Astro 图片导入流程。

移动 `about.md` 后，如果只修改文件位置，新来源将被旧的 `pagesDir` 范围判断跳过，因此必须更新来源识别。

### 3.2 最小实现范围

在 `astro:config:setup` 中继续使用 `config.srcDir` 派生目录，同时把 `src/pages/` 与 `src/content/pages/` 传给现有 Remark 插件。插件先确定文件属于哪个固定页面目录，再使用该目录下的相对路径推导页面路由。

例如两个来源都对应同一目标 URL，迁移时只保留后一种来源。

| Markdown 源位置 | 用于生成 URL 的相对路径 | 最终页面 |
| --- | --- | --- |
| `src/pages/about.md` | `about.md` | `/about/` |
| `src/content/pages/about.md` | `about.md` | `/about/` |
| `src/pages/guide/index.md` | `guide/index.md` | `/guide/` |

目录判断继续使用现有 `relative()`、`isAbsolute()`、路径分隔符与 `.md` 后缀检查，防止其他内容（尤其 `src/content/posts/`）进入固定页面转换。匹配到新目录后，复用原来的 `route`、`page`、`imageUrl()`、`rawImages()`、图片引用处理和源文件存在性检查。插件参数名称可依据最小代码差异调整，避免增加独立路由映射表。

### 3.3 图片语义与验收示例

图片 URL 按**最终页面 `/about/`** 解析，而不是按仓库中的 `src/content/pages/` 目录拼接浏览器 URL。

| 输入位置与语法 | 条件 | `base: '/'` 的预期 | `base: '/blog/'` 的预期 |
| --- | --- | --- | --- |
| About 中 `![图](./photo.png)` | 源文件旁不存在 `photo.png`，按静态页面资源解析 | `/about/photo.png` | `/blog/about/photo.png` |
| About 中 `![图](./photo.png)` | 源文件旁存在真实图片 | 保留 Astro 源图片导入路径 | 保留 Astro 源图片导入路径 |
| About 中 `![图][p]` 与 `[p]: /image/bg.jpg` | `public/` 根路径资源 | `/image/bg.jpg` | `/blog/image/bg.jpg` |
| About 中 `<img src="/image/bg.jpg">` | 当前示例使用的 HTML 图片 | `/image/bg.jpg` | `/blog/image/bg.jpg` |
| About 中 `<img src="../image/bg.jpg">` | 相对于页面的 HTML 图片 | `/image/bg.jpg` | `/blog/image/bg.jpg` |
| About 中 `/blog/image/bg.jpg` | 已带 `/blog/` 前缀 | `/blog/image/bg.jpg` | `/blog/image/bg.jpg`，前缀不重复 |

外部 `https:`、`data:`、`//`、`#` 等地址沿用原有跳过规则。HTML 图片属性、注释、脚本内容以及 URL 查询参数与片段继续保留现有处理结果。

本轮不更改 `imageUrl()`、`rawImages()` 的核心算法，不复制图片，也不新增附件发布机制。

## 4. 文件改动清单

| 路径 | 实施内容 |
| --- | --- |
| `src/pages/about.md` → `src/content/pages/about.md` | 移动正文；删除 `layout` 字段；更新正文中的中英文编辑路径 |
| `src/pages/about.astro` | 新增固定路由，直接导入 `Content` 与 `frontmatter` 并包裹现有布局 |
| `src/integrations/page-images.mjs` | 扩展两个固定页面来源目录的识别，复用现有图片转换逻辑 |
| `tools/test/page-images.test.mjs` | 保留旧 `src/pages/` 测试，增加新来源与两种部署 `base` 的回归用例 |
| `tools/test/release.test.mjs` | 在现有发行包测试中检查 About 的新内容路径与路由文件是否收录，旧路径是否消失 |
| `examples/pages/zh-CN/about.md` | 删除 `layout` 字段，复制目标路径改为 `src/content/pages/about.md` |
| `examples/pages/en/about.md` | 同步删除 `layout` 并更新复制说明 |
| `docs/zh-CN/README.md`、`docs/en/README.md` | 更新快速开始中的 About 编辑路径 |
| `docs/zh-CN/CONFIGURATION.md`、`docs/en/CONFIGURATION.md` | 更新作者配置说明，明确 About 元数据与正文从新路径编辑 |

`src/layouts/AboutLayout.astro`、`src/content.config.ts`、`src/config/content.config.ts`、`src/lib/notes-loader`、`tools/lib/publish-files.mjs`、Publisher 与部署配置保持现状。导出清单已包含整个 `src/` 和 `examples/pages/`，新文件会按现有规则进入作者主题包。

## 5. 实施顺序

1. 在 `astro-theme-aero-static` 的独立变更中移动 About Markdown，保留正文、`title`、`description` 和现有示例图片，更新正文路径并删除 `layout`。
2. 新建 `src/pages/about.astro`，引入 Markdown 和原有 `AboutLayout`，确认只有一条 `/about/` 路由。
3. 对 `page-images.mjs` 增加新来源识别，保留旧 `src/pages/` 的兼容与现有图片路径规则。
4. 扩充图片回归与发行包断言。通过测试确认新来源生效、文章内容不被错误识别。
5. 更新中英文示例及 README、配置指南，搜索并清理面向作者的旧路径说明。
6. 执行完整验收，再按照项目现有发布流程将通过验证的变更同步到公开发行线。

## 6. 测试与验收

### 6.1 自动化验证

沿用 `node:test` 与现有脚本，在实施仓库运行。

```sh
npm run test:page-images
npm run check
npm run build
npm run test:release
npm run export
```

重点检查以下结果。

| 验收项目 | 通过条件 |
| --- | --- |
| About 路由 | `dist/about/index.html` 正常生成；不存在重复路由或导入错误 |
| 内容与元数据 | 页面标题、描述、正文与迁移前一致；继续使用 `AboutLayout` 和 `BaseLayout` |
| Markdown 图片 | 行内与引用式图片在新目录得到正确 URL；真实同目录源图片仍走 Astro 导入 |
| 原始 HTML 图片 | `<img>` 相对、根路径及带前缀 URL 均正确，属性与外部地址不变 |
| 子路径部署 | `base: '/blog/'` 时不丢失或重复拼接 `/blog/`；目标页面仍为 `/blog/about/` |
| 旧固定页面 | 现有 `src/pages/` Markdown 图片处理测试继续通过 |
| 文章隔离 | `src/content/posts/` 及外部 `notesDir` 的加载、正文、附件处理不变 |
| 作者主题包 | 包内包含 `src/content/pages/about.md` 与 `src/pages/about.astro`，不包含旧 `src/pages/about.md` |
| 示例与指南 | 中英文示例不含过期 `layout`，复制目标正确；README 与配置文档指向新路径 |

`tools/test/page-images.test.mjs` 的渲染辅助函数原先固定使用 `src/pages/${page}`，实施时已增加明确的来源目录参数，使旧、新目录走相同的真实插件入口。测试保留 `./photo.png` 存在与不存在两种情况，避免将 Astro 源文件导入误判为 public URL。

对 `base: '/blog/'` 的静态页面也应执行一次实际构建或浏览器验收，至少检查 About 的页面导航、布局及图片请求。在已有浏览器验收流程中检查从文章页进入 About、前进与后退时图片正常，涵盖 Astro 客户端导航的历史回归场景。无需引入新的端到端测试框架。

### 6.2 发行包核对

`npm run export` 应生成可用的主题源码包和静态站点包。解压检查主题包中的新 Markdown、`about.astro`、更新后的中英文模板与指南，并核对站点包的 `/about/index.html`。`tools/lib/publish-files.mjs` 的现有 `sourceRoots` 已包含本次目标文件，原则上无需更改发布配置。

## 7. 完成标准与边界

完成标准是源码、示例、文档、测试及作者发行包中的 About 路径统一，`/about/` 的页面行为与图片路径在根部署和 `/blog/` 部署下通过验证，现有文章发布回归通过。

本次只交付 About 页面迁移及其必要的图片处理和文档测试调整。后续若出现需要统一查询、Schema 校验或批量生成的多个固定内容页面，再独立评估 Content Collection。

## 8. 实施记录

2026-11-13：完成方案 B 定稿，并在 `astro-theme-aero-static` 开发线实施迁移。

- 将 `src/pages/about.md` 迁移到 `src/content/pages/about.md`，删除 Markdown 路由专用的 `layout` 字段，更新正文中的中英文编辑路径。
- 新增 `src/pages/about.astro`，直接导入 `Content` 与 `frontmatter`，使用原有 `AboutLayout`。为满足 Astro 严格类型检查，显式声明布局需要的 `title` 与可选 `description` 类型。
- `remarkPageImages` 同时识别 `src/pages/` 与 `src/content/pages/`，保留原有 URL 处理与文章排除逻辑。扩充图片及发行包回归测试，并更新中英文示例和作者文档。
- 验证通过：`npm run test:page-images`（7/7）、`npm run check`（88 个文件，0 错误、0 警告）、`npm run build`（8 个页面，包含 `/about/index.html`）、`npm run test:release`（151/151）、`npm run export`（检查与构建均成功）。
- `npm run export` 生成 `release/` 下的主题源码包与静态站点包。核对源码包含新 About Markdown、Astro 路由、双语示例与指南，且不含旧 Markdown 路由；站点包含 `about/index.html` 与示例图片。`/blog/` 下的 About 图片 URL 通过现有 export、Publisher 构建回归测试。

变更提交在 `static` 开发分支，尚未同步到公开发行线或部署。发布前可按项目现有浏览器验收流程复核 About 导航与前进、后退交互。
