# Aero 配置指南

**文档语言：** 简体中文 · [English](../en/CONFIGURATION.md)

这份指南面向使用本主题建立博客的作者。四个主要配置文件都在 `src/config/`；文章默认写在 `src/content/posts/`，也可指定外部笔记目录，关于页写在 `src/content/pages/about.md`。

## 准备站点与资源

推荐安装 Node.js 22.22 或更高版本，以满足当前锁定依赖的版本要求。在主题根目录运行 `npm ci` 和 `npm run dev`，再打开终端显示的本地地址。存放在 `public/` 下的文件，在配置中写成以 `/` 开头的路径，**不要包含 `public`**。例如 `public/image/avatar.jpg` 写成 `/image/avatar.jpg`；`public/audio/song.mp3` 写成 `/audio/song.mp3`。图片和音频字段也可以使用完整的 HTTPS 地址。本地配置路径会按站点的 `base` 前缀处理。头像、壁纸和歌曲封面分别指定，换壁纸不会改变其他图片。

| 内容 | 默认文件或目录 | 配置位置 |
| --- | --- | --- |
| 头像 | `public/image/avatar.jpg` | `site.config.ts` 的 `avatar` |
| 网站图标 | `public/image/icon/vista_pc_1.jpg` | `site.config.ts` 的 `favicon` |
| 壁纸 | `public/image/wallpaper.jpg` | `theme.config.ts` 的 `wallpaper` |
| 播放器默认封面 | `public/image/music-cover.svg` | `music.config.ts` 的 `defaultCover` |
| 歌曲 | `public/audio/` | `public/audio/playlist.json` 中的 `src` |

## 站点信息：`src/config/site.config.ts`

修改导出的 `siteConfig` 对象。仓库中的 `Author` 和欢迎文章是示例内容，请换成自己的信息。

| 字段 | 类型与当前值 | 作用 |
| --- | --- | --- |
| `title` | 字符串，`Aero Blog` | 站点名称和页面标题后缀。 |
| `subtitle` | 字符串，`Hello, World!` | 页首短句；设为空字符串可隐藏文字。 |
| `author` | 字符串，`Author` | 侧栏作者名和底栏署名。 |
| `lang` | `zh-CN` 或 `en`，当前为 `zh-CN` | 选择全站界面语言，并设置页面 HTML 的语言标记。 |
| `signature` | 字符串数组 | 侧栏个人签名，每个元素占一行。 |
| `avatar` | 路径或 HTTPS 地址 | 作者头像图片。 |
| `avatarLink` | 路径或 HTTPS 地址，`/about/` | 点击头像时打开的地址。 |
| `favicon` | 路径或 HTTPS 地址 | 浏览器标签上的网站图标。 |
| `postsPerPage` | 正整数，`10` | 首页和标签列表的每页文章数；归档不分页。 |
| `navigation` | 导航项数组 | 顶部按钮，按数组顺序显示。 |

`lang: 'en'` 会将主题按钮、面板、分页和辅助提示切换为英文；文章正文、关于页、作者签名、歌曲名称等作者填写的内容不会自动翻译。`navigation` 的每项包含 `label`（按钮文字）、`icon`（图标路径或 HTTPS 地址）和可选的 `href`（链接）。`label` 可写成单个字符串，也可分别提供 `zh-CN` 和 `en` 两种文字。站内链接使用以 `/` 开头的路径，例如 `/archives/`；外部链接使用完整 HTTPS 地址。改动或删除页面时，记得同步调整导航。

```ts
navigation: [
  { label: { 'zh-CN': '首页', en: 'Home' }, href: '/', icon: '/image/icon/vista_messenger.jpg' },
  { label: { 'zh-CN': '归档', en: 'Archives' }, href: '/archives/', icon: '/image/icon/vista_book_1.jpg' },
  { label: { 'zh-CN': '关于', en: 'About' }, href: '/about/', icon: '/image/icon/vista_pc_1.jpg' },
],
```

`postsPerPage` 必须是大于零的整数。文章按 `date` 从新到旧排列；更改每页数量会影响首页和标签页的分页。归档页顶部展示全部已发布文章的标签，下方按年份一次展示全部已发布文章，不分页；没有标签时不显示顶部标签窗口。旧的 `/archives/page/<页码>/` 路径不再生成。

## 外观：`src/config/theme.config.ts`

| 字段 | 当前值 | 作用 |
| --- | --- | --- |
| `defaultColor` | `#3C7FB1` | 新访客的默认主色，使用六位 HEX，例如 `#437F68`。允许大小写。 |
| `wallpaper` | `/image/wallpaper.jpg` | 页面背景图片路径或完整 HTTPS 地址。 |
| `wallpaperPosition` | `center center` | 壁纸焦点，使用 CSS `background-position` 格式，例如 `70% center`。 |

推荐主色如下。主题根据主色统一派生玻璃、高光、底色与播放器配色，并根据阅读面板的实际底色修正链接文字，以 4.5∶1 为对比度目标。修改 SCSS 的 `--white-main` 时使用六位 HEX。播放器歌名固定为白色，并使用文字阴影。

| 推荐配色 | HEX |
| --- | --- |
| 经典蓝 | `#3C7FB1` |
| 翡翠绿 | `#437F68` |
| 紫罗兰 | `#73619B` |

侧栏的调色板按钮默认收起，点击后在侧栏内部展开 Windows 7 Paint 风格的 20 个基本色与 10 个自定义色槽。两枚圆形按钮为 40×40，内部图标为 24×24。

- 点击基本色立即换色。“颜色 1”显示当前主色。
- 首次编辑以第一个空槽为目标，全部填满时以第 1 槽为目标。蓝色内框标记编辑目标，橙色边框标记当前应用的色块。
- 点击已有色槽会应用其颜色并选中它。点击空槽会选中它并打开原生取色器。“编辑颜色”将结果写入选中的槽位，后续编辑继续写回该槽。
- “清除色槽”将选中的色槽清空，并将焦点返回该槽。空槽时按钮禁用。
- 外侧红色“×”恢复作者配置的默认主色。色槽列表和当前主色分别保存。

访客选择优先于作者默认色。浏览器存储主色与色槽。存储失败时，当前页面及客户端切页使用内存状态。刷新后按可读取的存储或作者默认色初始化。壁纸图片使用 `wallpaper` 配置。

## 音乐播放器

`src/config/music.config.ts` 管理播放器设置，`public/audio/playlist.json` 管理歌曲。

| 配置字段 | 类型与当前值 | 作用 |
| --- | --- | --- |
| `enabled` | 布尔值，`true` | 设为 `false` 时隐藏整个播放器，不请求歌单。 |
| `defaultCover` | 路径或 HTTPS 地址 | 歌曲未填写 `cover` 时使用的封面。 |
| `defaultPlaybackMode` | `list-loop` | 首次加载时的播放模式。 |

歌单是 JSON 数组，按数组顺序显示和播放，第一首默认选中但不自动播放：

```json
[
  { "title": "第一首歌", "artist": "歌手", "src": "/audio/song.mp3", "cover": "/image/song-cover.jpg" },
  { "title": "第二首歌", "src": "/audio/another-song.mp3" }
]
```

`title` 和 `src` 必填且不能为空；`artist` 和 `cover` 是选填字符串，封面省略或为空时使用 `defaultCover`。音频和封面支持站点内路径或完整 HTTPS 地址。`/audio/song.mp3` 会自动带上部署子目录（例如 `/blog/`），不要手动重复添加；`song.mp3` 等相对路径以歌单所在目录为基准，不受当前文章路径影响。

打开网站时，浏览器读取 `/audio/playlist.json`（自动适配子目录）。播放列表中的“刷新歌单”按钮可重新读取已部署的文件；不定时轮询，站内切页也不重新请求歌单。请求失败、超时或 JSON 格式错误时显示重试入口，并保留上次成功加载的歌单和播放状态。刷新后当前歌曲地址仍存在时保留进度；当前歌曲被移除或列表清空时停止播放。`[]` 会保留不可播放的播放器外观；若不需要播放器，请使用 `enabled: false`。

本地修改 `public/audio/playlist.json` 或音乐文件后，仍需将更新后的静态文件部署到托管平台；仅编辑本地文件不会更新网站。常规流程仍可使用 `npm run build` 后部署 `dist/`。浏览器读取歌单不依赖主题重新编译，但本项目暂未提供独立歌单部署命令。

播放模式有 `sequential`（顺序播完即停）、`list-loop`（播完从头循环）和 `single-loop`（重复当前歌曲），可在播放列表中切换。首次播放由访客点击触发。站内切页保留播放状态，整页刷新后重新初始化。音频能否播放取决于浏览器对该格式的支持。

音频完整下载为临时 Blob 后开始播放，当前歌曲实际播放时预取下一首，最多保留当前歌曲和一首候选。切换到另一首歌曲时立即停止旧曲、释放旧 Blob，并复用有效候选或开始下载目标歌曲。快速切歌时取消过期任务，以最新选择为准。重新选择当前已就绪歌曲或暂停恢复时复用现有资源及进度。首次播放、自然切歌和失败重试立即执行。Blob 随持久播放器会话保留，切换及销毁时释放引用。

等待时封面显示 Aero 加载圈，歌曲进度保持为零。就绪后封面约 200ms 淡入，按最新播放意图播放或暂停。Safari 若要求再次操作，点击播放即可使用已加载资源。加载失败时歌名显示“加载失败”，展开播放列表可查看底部原因，并通过“重新加载”手动重试。返回前台时继续有效任务，已失败的任务等待手动重试。

外部 HTTPS 音频服务器需要允许 CORS，使浏览器能够完整读取音频响应。跨域授权、网络读取或音频解码失败均会显示加载错误。原响应的 MIME 类型随 Blob 保留。

支持 Media Session 的浏览器可通过系统媒体控件执行播放、暂停、上一首、下一首和进度跳转。控件信息跟随实际已加载歌曲，切歌与网页操作共用即时选曲入口。浏览器支持的具体动作按其能力接入。

触屏上可以从歌曲文字处开始滑动列表，滑动和取消的手势不会切歌或关闭歌单。列表或侧栏惯性滚动时触摸歌曲也不会触发播放；滚动停止后，独立轻点一次即可播放。鼠标点击和键盘确认仍然可用，浏览器原生滚动与双指缩放保持可用。

## 笔记目录：`src/config/content.config.ts`

`notesDir` 是唯一的笔记目录配置，默认值为 `./src/content/posts`。相对路径相对于主题根目录解析，不受启动命令所在目录影响；也可以填写绝对路径，例如 `/vault/Notes`。目录不存在、不是目录或不可读时，检查与构建会明确失败，不会回退到示例文章。

```ts
export const contentConfig = {
  notesDir: './src/content/posts',
};
```

程序递归读取 `.md` 文件，忽略隐藏文件和隐藏目录，不遍历符号链接目录。成功解析 Frontmatter 后先筛选发布许可，只有顶层小写 `publish` 为布尔真值的笔记才计算 ID、检查重复、校验下方文章元数据并编译正文与附件。无 Frontmatter 或未发布的私人笔记无需填写 `title/date`，不进入文章集合，也不参与 ID 冲突检查；其中缺失的图片不会影响已发布文章。更改目录、删除文章或撤销发布后，下次同步会清除旧内容。使用 `npm run dev` 时，笔记与附件的增删改会触发内容同步。

Frontmatter 语法损坏时，本轮检查/构建失败并报告笔记路径，不静默跳过；开头的 `---` 或 `+++` 没有结束分隔符也视为不完整 Frontmatter。即使损坏文件原本是私人笔记，这条规则仍然适用。失败不会发布新站点，撤稿仍需等待下一次成功构建和部署。

主题不会向笔记目录写入文件；附件清单和缓存写入 Astro 缓存目录，产物写入 `dist/`，因此笔记目录可以只读挂载。发布容器将主题只读挂载在 `/theme`，保留默认配置时，将 NAS 笔记目录挂载到 `/theme/src/content/posts:ro`；`/app` 仅存放工具和依赖。定时构建与部署容器的配置见[部署指南](DEPLOYMENT.md)。

外部笔记目录不会自动收进主题源码发布包；迁移环境时需要单独准备笔记，并调整 `notesDir`。

## 写文章

把 `.md` 文件放入 `notesDir` 指定的目录（默认 `src/content/posts/`）。默认的 `welcome.md` 是站点预览文章，发布自己的博客时可以编辑或删除。[中文模板](../../examples/posts/zh-CN/)和[英文模板](../../examples/posts/en/)不会自动发布；将模板复制进文章目录并设置 `publish: true` 后才会发布。文件名默认决定文章路径：`hello.md` 对应 `/posts/hello/`。

发布许可采用解析后的严格布尔判断：`publish: true`、`publish: True`、`publish: TRUE` 都允许发布；字段名必须是小写 `publish`。带引号的 `"true"`、`"True"`、`"TRUE"`，以及 `1`、`yes`、缺失开关或布尔假值都会跳过，不作为文章校验。旧的 `draft` 字段不再控制发布：原来使用 `draft: false` 或未写开关的文章，需要补上 `publish: true`；隐藏文章使用 `publish: false` 或省略该字段。已发布文章的 `title/date` 仍为必填且必须合法。此规则适用于博客文章，关于页仍独立构建。

文章顶部的 frontmatter 支持以下字段：

| 字段 | 要求 | 作用 |
| --- | --- | --- |
| `title` | 必填，非空字符串 | 文章标题。 |
| `date` | 必填，日期 | 发布日期；用于排序、卡片及归档。建议写成带引号的 `YYYY-MM-DD`。 |
| `updated` | 选填，日期 | 晚于 `date` 时，仅在文章正文页显示更新日期；不改变排序。 |
| `description` | 选填，字符串 | 页面描述；没有 `excerpt` 时也用作列表摘要。 |
| `excerpt` | 选填，字符串 | 首页等文章列表中的摘要；省略时先取 `description`，再从正文提取。 |
| `cover` | 选填，路径或 HTTPS 地址 | 文章列表中的封面图片；支持相对于当前 MD 的附件路径、站点内绝对路径或 HTTPS 地址。不填时没有封面。 |
| `tags` | 选填，字符串数组 | 标签；未填写时为空数组。 |
| `publish` | 选填，布尔值，默认 `false` | 只有明确设置 `true` 才生成文章页，并进入列表、归档和标签统计；省略或设为 `false` 均不发布。 |
| `slug` | 选填，字符串 | 覆盖由文件名生成的文章 ID 和路径。 |

```md
---
title: 一篇完整的示例文章
date: "2026-01-01"
updated: "2026-01-02"
description: 页面描述
excerpt: 首页摘要
cover: /image/wallpaper.jpg
tags: [Aero, 写作]
publish: true
---

从这里开始写正文。
```

笔记 Frontmatter 使用 YAML 1.2 Core，不启用隐式时间戳转换。日期形状的 `title`、`slug` 带不带引号都保留为字符串，例如 `title: 2026-10-29`；只有 `date`、`updated` 由文章 Schema 转换、校验日期。Obsidian 将标签从 `tags: [日记]` 重排为多行列表，或移除普通描述/摘要外的引号，不影响其值。发布许可仍采用严格布尔判断。数字、布尔值、数组、对象或 null slug 不会被强转为地址；不指定 slug 时省略字段或使用空字符串，继续按笔记相对路径生成 ID。标题的错误类型同样会被 Schema 拒绝。此兼容仅用于笔记入口，关于页仍由 Astro 独立处理。

文章 ID 的每个路径段分别进行 URL 编码，嵌套目录之间的 `/` 会保留；中文文章名可正常生成链接，`slug` 也遵循此规则。自定义 `slug` 请避免 `#`、`?` 和 `%`，当前 Astro 对这些字符的静态路由处理存在限制；可使用中文、英文、数字、空格或连字符。

标签中的空格和标点会转换为路径里的连字符，英文不区分大小写。若不同标签产生相同路径，构建会报错，需修改其中一个标签。正文可使用普通 Markdown、代码块、表格和引用。关于页在 `src/content/pages/about.md`，它不使用博客文章的 frontmatter；编辑正文和页面顶部的 `title`、`description` 即可。可从[中文模板](../../examples/pages/zh-CN/about.md)或[英文模板](../../examples/pages/en/about.md)开始。

固定 Markdown 页引用 `public/` 图片时，推荐写 `/image/example.png`，也可保留相对页面 URL 的写法。编译时会把普通 Markdown 图片、引用式图片及原始 `<img src="…">` 转为带部署子目录的稳定 URL，避免客户端切页时按上一页地址加载。HTTPS、协议相对地址和 `data:` 地址保持原样；能从 Markdown 源文件位置读取的图片仍由 Astro 处理。博客笔记的附件选择与复制规则不变。

移动侧栏由触摸或鼠标打开时，焦点停在侧栏容器；键盘或辅助技术激活时，焦点进入第一个控件。Tab / Shift+Tab 在可见控件间循环，Escape 或点击遮罩关闭后焦点返回菜单按钮。控件保留键盘焦点提示。

博客笔记仍使用相对路径引用同目录或共享附件；发布后的正文图片 URL 会包含部署子目录及文章路径，避免从其他页面进入或返回文章时按旧页面解析。附件的发布范围、文件位置及撤稿清理规则不变。

### 同目录附件

推荐每篇日记使用一个文件夹。可复制[附件示例](../../examples/posts/zh-CN/attachments/)整文件夹到笔记目录：

```text
notesDir/
└── 2026-01-01/
    ├── 2026-01-01.md
    └── photo.svg
```

```md
---
title: "2026-01-01"
date: "2026-01-01"
publish: true
slug: "2026-01-01"
cover: ./photo.svg
---

![照片](./photo.svg)
```

示例的 `slug` 明确指定文章地址，避免同名文件夹和文件形成重复路径。构建后生成 `dist/posts/2026-01-01/index.html` 和同目录的 `photo.svg`。正文使用 `./photo.svg`，首页封面则自动使用带部署前缀的文章附件地址。

仅复制已发布文章通过标准 Markdown 图片、链接或 `cover` 实际引用的附件；不会整目录上传笔记，也不会上传原始 MD。支持引用式图片与链接，例如 `![照片][photo]` 配合 `[photo]: ./photo.svg`。本地图片保留原文件和文件名，不经过 Astro 图片优化。

- 当前文章目录内的附件保留相对目录，例如 `./images/photo.jpg`、`./docs/report.pdf`。
- `../shared/photo.jpg` 等共享附件必须仍位于 `notesDir` 内，输出到当前文章的 `_attachments/` 下，并保留相对于笔记根目录的路径。
- 相对 `.md` 链接会转换为目标已发布文章的页面地址，保留查询参数与锚点；指向未发布笔记时构建失败。不会把 MD 当作下载附件复制。
- 以 `/` 开头的地址继续表示站点 `public/` 资源，自动适配部署子目录；HTTPS 等外部地址保持原样。
- 中文与空格文件名会进行 URL 编码。链接中的文件名如果包含 `#` 或 `%`，分别写成 `%23` 或 `%25`。
- 附件缺失、越出笔记根目录（包括符号链接越界）、文章 ID 重复或输出目标冲突时，检查或构建会报错。附件不能覆盖文章的 `index.html`、其他生成页面或 `public/` 文件。

Obsidian 建议使用“与当前文件相同目录”的附件位置、“相对于当前文件”的链接格式，并关闭 Wiki 链接。`![[附件]]`、笔记嵌入和原始 HTML 中的本地附件路径不属于此次支持范围；请使用标准 Markdown。

自定义 `astro.config.mjs` 的 Markdown 配置时，请保留 `remarkNoteAssets` 及配套 `noteAssets(contentConfig)` integration。缺少配套处理时，即使文章没有附件，也会报 `Incomplete note compilation`，请修复配置后重新检查和构建。附件缓存损坏或与当前笔记目录、部署前缀不符时同样会报错，重新运行内容同步或构建即可生成新计划。

### 嵌入 HTML 工具

把作者审查过的自包含 `.html` 文件与文章放在同一目录，使用保留的小写 `iframe:` 图片标记：

```md
![iframe: 加法计算器](./calculator.html)
```

也支持引用式写法：

```md
![iframe: 加法计算器][calculator]

[calculator]: ./calculator.html
```

可复制[工具示例文件夹](../../examples/posts/zh-CN/tools/)，其中文章默认 `publish: false`。检查文件后再将该篇设为 `true`。没有清单时仍按原字节交付单个 HTML，样式、脚本和固定数据应自包含；放入笔记目录本身不会使工具公开。

多文件工具使用 `index.html` 入口，并在同目录提供 `manifest.json`。参考[时间戳目录包示例](../../examples/posts/zh-CN/tools/timestamp.md)：

```md
![iframe: 时间戳转换](./timestamp/index.html)
```

```json
{
  "version": 1,
  "download": true,
  "files": ["index.html", "app.js", "style.css"]
}
```

`iframe:` 引用与指向本地 `index.html` 的普通 Markdown 链接共用清单校验。主题只在入口同目录寻找 `manifest.json`。`version` 与 `files` 为必需字段，`download` 为可选布尔值，未知字段会报错。文件必须具体列出、存在且大小写准确，必须包含 `index.html`。不支持通配符、目录展开、绝对路径、`.`/`..` 路径段、反斜杠、盘符、控制字符或 `%`、`?`、`#`。路径是未经 URL 编码的相对文件名。包根及文件路径中的符号链接不受支持，`.md`、`.mdx` 和 `.astro` 不得作为包资源。

入口同目录的 `manifest.json` 是保留的控制清单，不能列入自身的 `files`。直接引用与 `index.html` 同目录的该文件作为附件时会报错。子目录中的 `data/manifest.json` 等资源可以显式列入 `files`。其他目录没有相邻 `index.html` 的同名 JSON 按普通附件处理。

有清单时入口名必须精确为 `index.html`；有清单却损坏、格式错误、版本不支持或文件缺失会阻止检查/构建，不回退到单文件。JSON 采用标准 `JSON.parse` 行为（同名键保留最后值），文件列表重复项会报错。工具包所有文件映射到入口的发布目录，保持包内相对路径；共享引用仍各归所属文章，更新、减项和撤稿在下一次成功构建/部署后生效。

HTML 内用 `./app.js`、`./style.css` 等相对路径，不使用站点根路径。`index.html` 可适应目录规范地址，开发服务器支持已登记包入口的目录地址，以及 JS/MJS、CSS、JSON、WASM 的响应类型。控制清单保留在构建输入和下载归档中。内容同步会生成当前版本的附件计划，作者清单使用 `version: 1`。

Astro 7 开发预览对隔离 iframe 的资源请求有额外检查。本集成仅提前服务已登记包目录中精确列入附件计划的静态文件；其他源码路径继续受原有保护。这不增加 CORS 许可，fetch/WASM 等能力仍按浏览器规则验证。

主题不扫描 HTML/JS/WASM 依赖，不安装库，不编译工具，也不运行其业务测试。清单只保证所列文件可交付，完整运行依赖由作者独立测试。工具应携带本地依赖；在现有 sandbox 中，普通脚本加载与 fetch、模块脚本、WASM 请求的权限行为不同，多文件化不自动解决 CORS 或存储限制。

iframe 标题必须非空，目标必须是相对于当前 MD 的本地 `.html` 文件（扩展名大小写均可）。iframe 引用不接受远程或站点绝对地址、查询参数或片段，名称中的 `#` 写成 `%23`。iframe 及目录包输出路径中的字面 `%` 会提示改名，正常 URL 编码仍受支持。`../` 共享工具须留在 `notesDir` 内，沿用当前文章 `_attachments/` 副本规则。非法目标、缺失文件、越界或冲突会阻止检查/构建。

编译器生成包含部署前缀及文章 ID 的稳定 iframe 地址，例如 `/blog/posts/tool-example/calculator.html`，作者保留源 MD 中的相对写法即可。工具默认占满正文宽度、高 480px，内容可在内部滚动；工具作者仍需适配窄屏和键盘操作。离开文章后不保留工具状态，也不提供自动高度、父子通信或 Obsidian 内运行能力。

iframe 固定使用 `sandbox="allow-scripts allow-downloads"`、懒加载和 `referrerpolicy="no-referrer"`，不读取 HTML 的权限声明。它允许脚本运行及文件导出，但不授予同源、表单提交、弹窗或顶层导航权限。工具应通过明确按钮导出；下载权限本身不限于用户点击或 JSON 格式。导入使用文件选择器读取用户选择的文件，不需要上传服务。工具应自行校验文件大小和内容，且在存储不可用时仍能操作。

只发布经过审查的工具：iframe 的隔离不自动覆盖直接访问 HTML 的场景，也不保证禁止联网或限制计算资源。已验证本地构建、导出及桌面操作；用户在 iPhone Chrome 上实测 2048 棋盘滑动、工具非棋盘区域滚动及父页面滚动正常。棋盘区域会处理从该区域开始的游戏手势，滚动工具内容请从说明等非棋盘区域开始。桌面 Chrome 触屏模拟仍有点击/内部滚动失败；其他设备、手机文件往返和独立 Safari 尚未完整验收，请在目标环境复验。

### 独立打开 HTML 工具

文章只包含普通链接时，也会发布清单中的完整目录包。可复制[独立链接示例](../../examples/posts/zh-CN/tools/timestamp-linked.md)。

```md
[打开时间戳工具](./timestamp/index.html?mode=standalone#result)

[**打开工具**][clock]

[clock]: ./timestamp/index.html?mode=reference#result "时间戳转换"
```

普通链接中的查询参数、锚点、标题和行内格式会保留。清单识别使用文件路径。已复制到文章附件中的本地 HTML 链接通过 `target="_blank"`、`rel="noopener"` 和 `data-astro-reload` 在新标签页中原生打开，工具页面具有独立文档，并以站点的正常来源运行。浏览器设备授权由工具自身发起。

普通链接中，只有 `index.html` 入口触发目录包识别。其他 HTML 文件、无清单的单 HTML 以及普通图片与封面继续按单个附件交付。站点绝对地址与远程链接使用原有 URL 处理规则。同一篇文章的 iframe 和普通链接引用同一个包时，共用发布副本。

### 下载工具文件

| 工具形式 | 设置 | 文章中的下载入口 |
| --- | --- | --- |
| 单 HTML | 无需清单 | 默认下载原 HTML |
| 目录包 | `download: true` | 下载构建期生成的 ZIP |
| 目录包 | `download: false` 或省略该字段 | 关闭下载入口 |

iframe 的下载入口位于框架上方工具栏，普通链接的下载入口位于原链接旁。文件名和 URL 由主题生成，单 HTML 的下载地址使用文件路径，打开页面时使用的查询参数与锚点保留在原链接中。

目录包 ZIP 位于工具目录同级，例如 `timestamp/index.html` 对应 `timestamp.zip`。归档根目录包含 `index.html`、`files` 所选文件和自动加入的 `manifest.json`，包内子目录及文件字节保留。入口控制清单无需列入 `files`。同篇重复引用共用归档，ZIP 路径参与文章、附件及公开文件的冲突检查。

开启或关闭下载、修改文件或清单、移除引用及撤稿，会通过下一次成功构建更新归档。开发预览按请求读取已选择的文件，并使用相同 ZIP 生成代码。新增构建依赖随主题 package.json 与锁文件交付，更新主题时按部署指南同步构建 Publisher 镜像。

`download: true` 表示提供按清单生成的分发包。工具作者负责说明本地运行方式，可将 `README.txt` 列入 `files`，介绍所需的本地 HTTP 服务。下载文案使用站点语言。

### 数学公式

文章和关于页支持 LaTeX 数学公式。构建时由 MathJax 生成公式 HTML，访客无需加载 MathJax 脚本。行内公式用 `$...$`，独立成段的公式用 `$$...$$`：

```md
勾股定理为 $a^2+b^2=c^2$。

$$
E = mc^2
$$
```

可复制的[公式示例文章](../../examples/posts/zh-CN/math.md)还包含多行公式与代码块。普通金额中的美元符号请写成 `\$`，代码示例则放入反引号或代码围栏，避免被识别为公式。过长的独立公式可在正文区域横向滚动。

## 发布前检查

```bash
npm run check
npm run build
npm run preview
```

`npm run build` 会生成静态站点到 `dist/`。用预览命令检查文章、图片、标签和音乐后，运行 `npm run export`，将 `release/` 中的 `*-site.tar.gz` 解压部署到静态托管服务。export 使用主题根目录及嵌套 `.gitignore` 在构建前筛选 `public/`，支持 `!` 例外，与 Git 跟踪状态无关；通过临时输入和输出目录构建，原有 `dist/` 保留。详细范围见[导出发布包](README.md#导出发布包)。若图片无法显示，先确认文件在 `public/` 中，且配置路径以 `/` 开头、不含 `public`；若歌曲无法播放，检查文件路径和目标浏览器的格式支持；若文章没有出现，检查是否明确填写了 `publish: true`。
