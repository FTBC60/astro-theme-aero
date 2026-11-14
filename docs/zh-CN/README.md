# Astro Theme Aero

**文档语言：** 简体中文 · [English](../en/README.md)

这是基于 [hexo-theme-aero](https://github.com/5h1nnN/hexo-theme-aero) 的 Astro 静态博客主题。它保留了 Aero 风格的玻璃窗框、桌面双栏与移动端侧栏，并提供文章、归档、标签、可自定义主题色及音乐播放器。

## 下载主题包

前往 [GitHub Releases](https://github.com/FTBC60/astro-theme-aero/releases/latest)，下载 `astro-theme-aero-v1.3.0-theme.tar.gz`（后续版本使用对应版本号）。它是面向博客作者的主题包，包含可配置源码、默认资源、示例和中英文使用文档。GitHub 自动附带的 “Source code” 是完整仓库快照，包含开发资料，请选择名称以 `-theme.tar.gz` 结尾的附件。解压后进入 `astro-theme-aero/`，再执行下面的安装步骤。可用同一 Release 的 `SHA256SUMS.txt` 核对下载完整性。

## 快速开始

推荐使用 Node.js 22.22 或更高版本，以满足当前锁定依赖的版本要求。在主题目录运行：

```bash
npm ci
npm run dev
```

然后按顺序完成站点配置：

1. 在 `src/config/site.config.ts` 设置界面语言（`zh-CN` 或 `en`）、站点标题、作者、签名、头像、导航和每页文章数。
2. 在 `src/config/theme.config.ts` 设置默认配色、壁纸及壁纸焦点。
3. 在 `src/config/music.config.ts` 设置播放器，在 `public/audio/playlist.json` 编辑歌曲；不需要播放器时设为 `enabled: false`。
4. 在 `src/config/content.config.ts` 设置笔记目录（默认 `./src/content/posts`），将文章放入该目录，在 frontmatter 中设置 `publish: true`，并编辑 `src/content/pages/about.md`。目录中的 `welcome.md` 只是预览文章，可以删除。可复制的文章模板见 [中文示例](../../examples/posts/zh-CN/)和[英文示例](../../examples/posts/en/)。

四份配置文件的字段、图片与音频路径、文章 frontmatter 和发布检查，详见[配置指南](CONFIGURATION.md)。

## 使用 Obsidian 写日记

在 **设置 → 文件与链接** 中，按同目录日记布局设置：

| 设置 | 值 |
| --- | --- |
| 使用 Wiki 链接 | 关闭 |
| 新链接格式 | 相对于当前文件的路径 |
| 新附件的默认位置 | 与当前文件相同的文件夹 |
| 自动更新内部链接 | 建议开启，重命名时更新引用 |

正文图片应为 `![照片](./photo.png)`，PDF 应为 `[附件](./document.pdf)`。主题不解析 `![[photo.png]]`、笔记嵌入或 Obsidian 块 ID 引用（`#^block-id`）。上述设置只影响之后自动生成的链接；已有 Wiki 链接需要手动转换。

正文保留常规 Markdown 换行规则，不自动把单次回车变成硬换行：

| 普通正文中的写法 | HTML 与浏览器显示 |
| --- | --- |
| 回车一次 | 软换行；HTML 文本中通常保留换行字符，浏览器折叠显示为空格 |
| 回车两次，形成空行 | 分成两个 `<p>` 段落，显示段落间距 |
| 行尾反斜杠 `\` 后回车，或行尾两个普通半角空格后回车 | 段内硬换行，生成 `<br>` |

例如，以下写法会在同一段内换行：

```md
第一行\
第二行
```

空行表示分段，和 `<br>` 硬换行不同。Obsidian 的显示设置可能让单次回车也可见，但不改变本站的上述编译规则。规则依据见 [CommonMark 软换行](https://spec.commonmark.org/0.31.2/#soft-line-breaks)及[硬换行](https://spec.commonmark.org/0.31.2/#hard-line-breaks)。

在笔记属性面板点击属性名左侧图标，固定以下类型。同名属性类型在整个 Vault 内共享；电脑和手机应分别核对。

| 属性 | 类型 |
| --- | --- |
| `title` | 文本 |
| `slug` | 文本 |
| `date` | 日期 |
| `publish` | 复选框 |

主题以 YAML Core 读取笔记，`title: 2026-11-01`、`slug: 2026-11-01` 与对应的带引号写法得到相同字符串；只有 `date`、`updated` 按日期字段校验。Obsidian 保存时重排引号或把 `tags: [日记]` 改为多行列表，不影响文章标题、地址或标签。数字、布尔值、数组或对象不能作为标题或 slug。模板中的日期变量仍应加引号；生成日记后无需反复恢复日期文字外的引号。

自动创建每日日记时，将[日记模板](../../examples/obsidian/日记模板.md)复制到 Vault 的 `模板/日记模板.md`，启用核心插件“每日笔记”，并设置日期格式 `YYYY-MM-DD/YYYY-MM-DD`、新文件位置留空、模板文件位置为该文件。以后使用“打开今天的每日笔记”命令，将创建 `2026-11-01/2026-11-01.md` 这样的目录和文件；当天文件已存在时直接打开。完整步骤见[模板说明](../../examples/obsidian/README.md)。

模板和新日记默认 `publish: false`；写完当天日记后再勾选该篇的 `publish`，保留模板自身的假值。使用 Remotely Save 时，NAS 端须保留可读取的原始 Markdown 和附件，同步后的实际目录应与 Publisher 的笔记挂载一致。先确认同步完成及 NAS 文件内容，再等待或执行下一次发布。

设置位置及行为依据：[Obsidian 文件与链接](https://obsidian.md/help/settings)、[属性类型](https://obsidian.md/help/properties)、[每日笔记](https://obsidian.md/help/plugins/daily-notes)。

## 检查与构建

```bash
npm run check
npm run build
npm run preview
```

构建后的静态文件位于 `dist/`。

## 群晖定时发布

支持 Container Manager 常驻定时发布：在 Compose 中设置 cron 表达式、时区和 Cloudflare 凭据，只读挂载笔记目录。配置、手动 dry run、日志与排错见[部署指南](DEPLOYMENT.md)。

## 导出发布包

在主题根目录运行 `npm run export`。脚本依次执行类型检查和构建，然后在 `release/` 生成两个 `.tar.gz` 文件（文件名含版本号和 Git 提交短哈希；工作区有未提交修改时加 `-dirty`）：

- `*-theme.tar.gz`：可继续配置和开发的主题源码，包含主题源码和默认资源、中英文使用文档、作者示例、正式编译发布工具、工程配置、README 和许可证。测试、验收材料及开发维护文档不进入源码包；包内 `package.json` 也不包含测试或原型命令。解压后进入 `astro-theme-aero/`，运行 `npm ci` 即可使用。
- `*-site.tar.gz`：当前配置及文章生成的静态站点，解压后将文件直接上传到静态托管服务的网站根目录。包内没有外层 `dist/` 目录。

源码包仅在作者交付清单内枚举 Git 跟踪文件与未忽略新文件，因此未提交但未忽略的新文章和资源也会进入包，已跟踪且后来被忽略的文件仍可进入源码包；请先检查待分享内容。`node_modules/`、`.astro/`、`dist/`、`release/`、Git 历史及本地交接记录不在源码交付范围内。导出需要 Git、Node.js、npm 和 `tar`。`release/` 已被忽略，不会意外提交。

站点包与 Publisher 在构建前按相同规则选择 `public/`：读取主题根目录及各级 `.gitignore`，支持 `!` 例外，固定区分大小写，且与 Git 跟踪状态无关。个人全局忽略配置和 `.git/info/exclude` 不参与；`.gitignore` 本身仅用于选择，不进入站点。排除整个父目录后，仅为其中的文件添加 `!` 无法恢复该文件，需先恢复父目录。

export 将选中的资源复制到临时目录，检查并构建后打包；原 `public/`、笔记配置和已有 `dist/` 保留，临时目录在成功或失败后清理。常规 `dev` / `build` 使用原主题输入，正式发布请使用站点包或 Publisher。

源码包与仓库版本的 npm 命令不同：源码包不含测试或原型命令。使用 Publisher 时，请从所用主题的同一份仓库版本或源码包构建镜像，保持主题与工具链的 package 文件一致。

## 主要功能

- 可配置笔记目录、同目录附件、Markdown 文章、草稿、归档和标签；归档顶部展示标签，下方按年份展示全部文章，不分页；首页和标签页默认每页显示 10 篇文章。
- 中英文界面和经典蓝、翡翠绿、紫罗兰三套配色；访客可以在侧栏选择配色，壁纸不会随配色改变。
- 音乐播放器从静态 JSON 加载歌单，支持手动刷新、失败重试、进度与顺序播放、列表循环、单曲循环；站内切页时保留播放状态。
- 桌面端的头像与侧栏组件随页面滚动配合底栏；移动端有可展开的侧栏。
- 站内切页采用 500ms、`ease-in-out` 的整页交叉淡化；不支持原生视图过渡时分为 250ms 淡出和 250ms 淡入，保留壁纸。链接及浏览器前进后退沿用 Astro 导航，音乐继续播放；系统启用“减少动态效果”时关闭过渡动画。

## 来源与许可

主题移植自 ShinN 的 [hexo-theme-aero](https://github.com/5h1nnN/hexo-theme-aero)，保留了仓库中的 [MIT 许可证](../../LICENSE)。部分控件样式参考 [7.css](https://github.com/khang-nd/7.css)。发布自己的站点前，请根据所使用的图片、图标和音频确认其使用范围，并替换需要更换的素材。
