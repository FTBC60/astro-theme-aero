---
status: accepted
---

# 0005：只有显式发布的笔记生成公开文章

Vault 会同时保存日记、草稿及其他笔记。原先默认展示、通过 `draft: true` 排除的做法容易让新文件意外进入站点；2026-10-24 至 25 日决定在静态主题中采用 `publish: true` 作为唯一发布开关，沿用动态实验中已讨论的显式筛选意图。

`41b7619` 将 [frontmatter schema](../../src/content.config.ts) 改为布尔 `publish`，缺省为 `false`，并让[共享文章查询](../../src/lib/posts.ts)及文章路由统一使用严格的 `=== true`。未发布内容不生成文章页，也不计入首页、归档、标签和分页；字符串 `"true"` 不等同于布尔值。示例和中英文迁移说明同步修改。后来的 [notes loader](../../src/lib/notes-loader.ts)仍会读取并校验笔记元数据，但只渲染已发布正文及收集其引用附件。

这个选择让旧文章必须主动补上 `publish: true` 才继续出现在站点。静态撤稿在重新构建并部署后生效，不具有动态实验逐请求查询清单的语义。发布筛选决定哪些内容进入产物，部署侧访问控制决定谁能读取产物，二者职责不同。

2026-10-29 的 [0011](0011-publication-before-validation.md) 补充上述接入行为：仅已获得发布许可的笔记参与 ID 和文章元数据校验，普通私人笔记不再要求 `title/date`；Frontmatter 损坏仍使本轮失败。上文对早期 Loader 行为的描述作为历史记录保留。

依据：[S10](SOURCES.md#s10) L101 明确建议采用 `publish: true`、L130/L135 汇总方案；[S11](SOURCES.md#s11) L760 开始实现、L919 提交确认；提交 `41b7619`。附件与原始笔记边界见 [0007](0007-notes-directory-and-attachments.md)。
