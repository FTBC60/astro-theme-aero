---
title: 欢迎使用 Aero / Welcome to Aero
date: "2026-01-01"
publish: true
description: Aero 主题的欢迎文章 / A welcome post for the Aero theme.
tags: [Aero]
---

## 简体中文

这是随主题附带的欢迎文章。你可以在 `src/content/posts/` 中编辑或删除它，然后把自己的 Markdown 文章放进同一目录。

站点标题、作者和导航位于 `src/config/site.config.ts`；壁纸与默认配色位于 `src/config/theme.config.ts`；播放器设置位于 `src/config/music.config.ts`，歌曲列表位于 `public/audio/playlist.json`。

完整字段说明见仓库中的 `docs/zh-CN/CONFIGURATION.md`。可复制的中文文章模板在 `examples/posts/zh-CN/`；这些模板在示例目录中不会自动发布；复制到文章目录后，仅 `publish: true` 的文件会生成文章页面。

## English

This welcome post is included with the theme. Edit or remove it from `src/content/posts/`, then put your own Markdown posts in that directory.

Set the site title, author, and navigation in `src/config/site.config.ts`; the wallpaper and default color in `src/config/theme.config.ts`; the player settings in `src/config/music.config.ts`; and tracks in `public/audio/playlist.json`.

See `docs/en/CONFIGURATION.md` for every setting. Copyable English post templates are in `examples/posts/en/`; they are published only after you copy them into `src/content/posts/` and set `publish: true`.
