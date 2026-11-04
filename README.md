# Astro Theme Aero

欢迎使用 Aero！这是一个将经典 Aero 风格带到 Astro 的博客主题。请选择您习惯的语言，开始配置自己的博客。

Welcome to Aero! This Astro blog theme brings the classic Aero look to your site. Choose a language below to get started.

博客作者请从 [Releases](https://github.com/FTBC60/astro-theme-aero/releases/latest) 下载 `*-theme.tar.gz` 主题包。GitHub 自动附带的 “Source code” 是包含开发资料的仓库快照。

Blog authors: download the `*-theme.tar.gz` theme package from [Releases](https://github.com/FTBC60/astro-theme-aero/releases/latest). GitHub's automatic “Source code” archives are repository snapshots with developer materials.

- [简体中文文档](docs/zh-CN/README.md)
- [English documentation](docs/en/README.md)

## Obsidian 设置 / Obsidian setup

使用 Obsidian 写日记时，请在 **设置 → 文件与链接** 核对以下项目。已有 Wiki 链接需手动转换；更改设置只影响之后自动生成的链接。

When writing in Obsidian, check **Settings → Files and links**. Convert existing Wikilinks manually; these settings control newly generated links.

| 设置 / Setting | 值 / Value |
| --- | --- |
| 使用 Wiki 链接 / Use Wikilinks | 关闭 / Off |
| 新链接格式 / New link format | 相对路径 / Relative path to file |
| 新附件的默认位置 / Default location for new attachments | 与当前文件相同的文件夹 / Same folder as current file |
| 自动更新内部链接 / Automatically update internal links | 建议开启 / On (recommended) |

图片使用 `![照片](./photo.png)`，文件使用 `[附件](./document.pdf)`。当前主题不解析 `![[photo.png]]` 等 Wiki 链接语法。

Use Markdown images and links as shown above. The theme does not resolve Obsidian Wikilink syntax.

正文沿用常规 Markdown 换行规则：单次回车是软换行，生成的 HTML 文本中通常保留该换行字符，由浏览器折叠显示为空格；空一行会分成两个段落（`<p>`），并非段内硬换行。需要同一段内换行时，在行尾添加反斜杠 `\` 或两个普通半角空格，再回车，即生成 `<br>`。主题不自动将所有单次回车转换为硬换行。

Body text keeps standard Markdown line handling: a single newline is a soft break, usually retained in HTML text and collapsed to a space by the browser. A blank line separates paragraphs (`<p>`). For a hard break within one paragraph (`<br>`), end the line with a backslash or two ordinary spaces before the newline. See [CommonMark line breaks](https://spec.commonmark.org/0.31.2/#soft-line-breaks).

在属性面板中，建议将 `title` 和 `slug` 设为**文本**，`date` 设为**日期**，`publish` 设为**复选框**。主题按 YAML Core 读取笔记，`title: 2026-11-01`、`slug: 2026-11-01` 与带引号的写法均保留为字符串；Obsidian 重排引号或标签列表后无需手动恢复。`date`、`updated` 仍按日期校验，标题和 slug 的数字、布尔值、数组或对象会报错。同名属性类型在整个 Vault 内共享。

For editing, use **Text** for `title` and `slug`, **Date** for `date`, and **Checkbox** for `publish`. YAML Core parsing keeps bare date-shaped titles and slugs as strings, just like quoted values; Obsidian may reformat quotes and tag lists. Only `date` and `updated` undergo date validation. Numeric, boolean, array, or object titles/slugs are rejected. Property types are shared by name throughout the Vault.

每天自动创建日期文件夹与同名笔记的配置、可复制模板和发布开关说明，见[中文说明](docs/zh-CN/README.md) / [English instructions](docs/en/README.md)。Obsidian 的设置位置和属性行为参见[官方设置说明](https://obsidian.md/help/settings)与[属性说明](https://obsidian.md/help/properties)。
