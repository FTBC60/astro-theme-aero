# 完整 Vault 与附件验收

本阶段沿用 [ADR 0007](../../../../docs/adr/0007-notes-directory-and-attachments.md) 的附件布局和 [ADR 0011](../../../../docs/adr/0011-publication-before-validation.md) 的发布筛选规则。复用现有 Loader、附件计划与 Publisher，不新增附件目录配置。

## 合成样本与预期路径

[tools/test/vault/Notes](../../vault/Notes/) 是可复制的合成 Vault，不包含真实日记，也不属于主题默认内容目录。

```text
Notes/
├── 2026-10-28/
│   ├── 2026-10-28.md          # publish: true，slug: 2026-10-28
│   ├── 照片 早晨.svg
│   ├── 行程 说明.pdf
│   └── 未引用.txt
├── 旅行记录/2026-10-29/
│   ├── 2026-10-29.md          # publish: True，不设 slug
│   └── 附件/路线 图.svg
├── 共享资料/共用 图.svg         # 两篇文章都引用
├── 私人笔记.md                 # 无 Frontmatter
├── 草稿/                      # 字符串 publish、私人附件
├── 模板/日记模板.md             # 不发布，日期仍是模板占位符
└── .obsidian/                 # 隐藏配置和隐藏笔记
```

笔记保持标准相对引用：`![早晨](../../../../docs/zh-CN/照片%20早晨.svg)`、`[行程说明](../../../../docs/zh-CN/行程%20说明.pdf#page=1)`。共享图片使用 `../共享资料/共用%20图.svg`；更深的笔记使用 `../../共享资料/共用%20图.svg`。无需移动附件。

| 源文件／设置 | 预期候选产物（相对于 `site/`） |
| --- | --- |
| 首篇笔记，显式 `slug: "2026-10-28"` | `posts/2026-10-28/index.html` |
| 首篇同目录图片和 PDF | `posts/2026-10-28/照片 早晨.svg`、`posts/2026-10-28/行程 说明.pdf` |
| 首篇共享图片 | `posts/2026-10-28/_attachments/共享资料/共用 图.svg` |
| 次篇笔记，无 `slug` | `posts/旅行记录/2026-10-29/2026-10-29/index.html` |
| 次篇局部附件 | `posts/旅行记录/2026-10-29/2026-10-29/附件/路线 图.svg` |
| 次篇共享图片 | `posts/旅行记录/2026-10-29/2026-10-29/_attachments/共享资料/共用 图.svg` |
| 私人笔记、模板、隐藏内容、原始 MD、未引用附件 | 不进入候选站点 |

默认 ID 来自笔记相对于 `notesDir` 的完整路径（移除 `.md` 并对各段 slug 化），不会自动把同名文件夹与笔记合并。固定单层日期地址时继续设置显式 `slug`。URL 按路径段编码，磁盘文件名仍保留中文与空格。一个共享文件可在不同文章输出目录中各有一份；撤稿不会删除其他文章仍引用的那份副本。

## 本地自动验收

使用项目支持的 Node.js 24：

```sh
npm run test:content
```

也可只执行本阶段的完整 Vault 用例：

```sh
node --test --test-name-pattern="complete Vault" tools/test/publication.test.mjs
```

用例将样本复制到临时目录，用独立主题配置读取主题目录之外的 Vault，并以 `/diary/` 部署前缀真实执行 Publisher 的隔离复制、Astro 检查、静态构建及产物检查。执行模式为 `build-only`，不调用 Wrangler。每轮都核对主题和笔记文件指纹，确认构建未改写源文件，并按字节比较附件、检查产物清单及 HTML 中实际生成的链接。

四轮分别验证：

为验证独有标签的撤稿清理，自动用例只在临时 Vault 中给首篇添加“首日独有”标签。手工验收时，也请给首篇添加一个次篇未使用的测试标签；可复制样本保留简单的“日记”标签。

1. 混合 Vault 中仅两篇发布笔记生成页面，图片/PDF、子目录、中文、空格、引用式图片、封面和文章互链均指向实际产物；归档按日期倒序。
2. 只修改共享图片，两篇正文不变，两个输出副本都更新。
3. 首篇仅保留 `publish: false`，其 HTML、独占图片/PDF、共享图片副本及独有标签消失；次篇及它仍引用的共享图片保留，首页、归档和公共标签页移除首篇。
4. 删除最后一篇发布笔记后，剩余文章、标签和附件副本全部清除；不退回主题内置的示例文章。

最后一轮为空集合，Astro 会输出 `blog` 集合为空的提示；构建仍应成功，只生成首页、归档和关于页。

## NAS 与线上验收

将 `Notes/` 复制到独立测试目录，复用已经验证的发布镜像和 Compose 配置，以独立项目／工作数据运行。沿用默认 `notesDir: './src/content/blog'` 时，笔记只读挂载目标仍是 `/theme/src/content/blog`；把该挂载的宿主目录指向测试 Vault，并为 `/data` 选择独立目录。保留现有只读主题挂载。测试项目只手动运行单次命令：

```sh
docker compose run --rm publisher once --build-only
```

先对照上表检查测试数据目录下的 `site/`，然后按四轮步骤编辑测试样本并重复构建。`build-only` 结果应为 `built`，不会更新 `last-success.json`，也不会改变线上站点。

实际访问验收时，先在测试项目的外置 `wrangler.json` 中选定测试 Worker 和入口，使用已验证的 Access 设置，执行：

```sh
docker compose run --rm publisher once --dry-run
docker compose run --rm publisher once
```

通过站点的正常登录入口打开两篇笔记、同目录图片、PDF、共享图片和次篇子目录图片。重复附件更新与撤稿步骤，每次等待一次成功部署；直接访问旧文章和它独占附件的 URL，应返回 404，次篇及其共享图片应仍可读取。继续删除次篇并成功发布后，其旧 URL 和附件副本也应返回 404。

记录每轮的 `status.json`、真实发布对应的 `last-success.json`、Cloudflare 版本 ID、检查的 URL 与 HTTP 状态。`site/` 是最新检查通过的候选产物，不能单独证明线上撤稿成功。这里不改变同步完成判定或快照策略；手机同步到 NAS 的一致性另行验收。
