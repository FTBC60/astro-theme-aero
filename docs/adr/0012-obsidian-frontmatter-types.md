---
status: accepted
---

# 0012：兼容 Obsidian 的 Frontmatter 重排并保留文本字段

2026-11-01（America/Los_Angeles）实际使用中，Obsidian 属性面板重新保存笔记后，会将日期形状的 `title`、`slug` 写成无引号值。原 Astro 入口额外启用了 YAML 时间戳识别，将它们解析成 Date，导致标题校验失败及日期 ID 变成本地化时间文本。要求作者持续恢复引号难以兼顾可视化编辑，因此在笔记读取边界采用 YAML Core，不添加隐式 timestamp 标签；普通日期形状的值保留为字符串，`date`、`updated` 继续由现有文章 Schema 转换和校验。

Loader 与文章互链继续共用 [note-publication.mjs](../../src/lib/note-publication.mjs)。保留 Astro 的 Frontmatter 分隔及正文提取规则、无 Frontmatter 的普通笔记和 TOML 入口；发布筛选仍先于文章校验，布尔值规则与损坏 Frontmatter 的失败语义遵守 [0011](0011-publication-before-validation.md)。行内标签数组和 Obsidian 多行列表是同一数据类型，无需另设标签协议。日期形状的字符串无需依赖引号，数字、布尔值、数组和对象不会被通用 String() 转换；标题由 Schema 拒绝错误类型，slug 在 [noteId](../../src/lib/note-assets.mjs) 生成 ID 前检查类型，null 同样拒绝。省略 slug 或使用空字符串时沿用相对路径 ID。

此决策不修改源笔记，不改变软换行、段落或硬换行规则，也不替换关于页等独立 Markdown 页面的 Astro 解析入口。`yaml` 保持版本 2.9.1，从开发依赖移入直接依赖；依赖清单随之更新，NAS 发布镜像需重建一次以满足既有主题/工具链一致性检查。

验证覆盖 Obsidian 保存前后等价值、LF/CRLF/BOM、YAML 合并、TOML、严格发布值、非法标题/slug、日期校验、互链、标准软换行，以及合成 Vault 的真实 Publisher 构建与附件清理。NAS 和真实线上复验单独执行，不能由本地测试代替。
