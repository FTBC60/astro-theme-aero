---
status: accepted
---

# 0007：单一笔记目录配置与按引用发布附件

2026-10-25 的使用场景是手机编辑 Obsidian 笔记、同步到 NAS，再定时生成站点；笔记和附件需要一起管理。决定让主题读取可配置的笔记目录，并让 `notesDir` 成为唯一来源。用户明确取消额外的 `CONTENT_DIR`，避免环境变量与主题配置相互覆盖；容器通过只读挂载把真实目录放到配置对应的位置。

`b3d5479` 新增 [content.config.ts](../../src/config/content.config.ts) 和 [notes-loader.ts](../../src/lib/notes-loader.ts)：默认 `./src/content/blog`，相对路径从主题根解析，支持绝对路径；无效或不可读目录报错，不能退回示例目录。同步时重建内容存储，避免切换目录或撤稿后残留旧文章。

[note-assets.mjs](../../src/lib/note-assets.mjs) 解析标准 Markdown 的本地图片、链接和封面，仅复制已发布文章实际引用的附件，保留文件名及必要子目录。文章互链转换为已发布文章 URL；缺失附件、目录越界、重复文章 ID 或输出冲突会阻止构建。原始 Markdown 不作为附件复制，未引用的整个 Vault 也不会被整目录发布。共享附件放在对应文章输出的 `_attachments/` 下。

这比把所有资源复制进 `public/` 多了一层构建处理，但保留了可迁移的相对引用和发布边界。Obsidian WikiLinks 不在当前语法支持范围内。随后容器从内置主题改为挂载主题，挂载目标由早期计划的 `/app/...` 调整为当前 `/theme/...`；该路径演变不改变 `notesDir` 的单一配置原则。

依据：[S12](SOURCES.md#s12) L22 笔记与附件场景；[S13](SOURCES.md#s13) L8 取消覆盖项、L27 修订方案、L35 实现授权、L359 提交报告；提交 `b3d5479`，Linux 内容路径修复见 `862d7b8`。当前使用方式见[配置指南](../zh-CN/CONFIGURATION.md)。

2026-10-29 实现改进：[笔记编译与附件计划](../architecture/note-compilation.md) 将私有 Markdown 协议及附件清单读写集中到一个模块，明确区分完成的空结果与缺失的配套处理，并校验计划版本、笔记根目录和部署 base。目录、发布方式与附件范围继续遵守本决策。

2026-10-30 第二阶段验收延续上述边界：每篇日记仍可与图片、PDF 同目录保存，完整 Vault 通过单一 `notesDir` 接入，仅按已发布文章的实际引用生成附件。保留现有 slug/ID 规则与共享附件的文章内副本，以维持源笔记的可迁移相对路径及各文章独立的撤稿清理范围。新增[合成 Vault](../../tools/test/vault/)、[中文](../../tools/test/validation-docs/zh-CN/VAULT-VALIDATION.md)和[英文](../../tools/test/validation-docs/en/VAULT-VALIDATION.md)验收指南及 [Publisher 回归用例](../../tools/test/publication.test.mjs)，不改变附件实现或增加目录配置。

本地以真实 Publisher 的四轮 `build-only` 验证中文和空格文件名、同目录图片/PDF、子目录笔记、封面与文章互链、未发布/隐藏内容排除、共享附件单独更新，以及撤稿和删除最后一篇笔记后的页面、标签与附件清理；构建前后核对主题和 Vault 指纹，并比对附件字节和实际生成的 HTML 链接。2026-10-30 内容与发布筛选共 18 项测试通过，样本 PDF 通过严格解析及正文提取。

2026-10-31 用户反馈：已在 NAS 执行一次发布，未发现问题。该记录确认用户报告的单次实机发布结果；逐项访问图片/PDF、撤稿后旧 URL 的 HTTP 状态及手机同步一致性，仍按验收指南分别核对，不由一次发布成功推定全部通过。
