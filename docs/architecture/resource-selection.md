# 发布资源选择

2026-10-28 起草，2026-10-29（America/Los_Angeles）确认并实施。范围为 `astro-theme-aero-static` 的站点包导出与 Publisher。长期取舍见 [ADR-0010](../adr/0010-shared-public-resource-selection.md)。

## 已确认的目标

- 对主题 `public/` 资源，两条入口统一遵守根目录与嵌套 `.gitignore`，包含 `!` 例外规则。
- 发布选择与 Git 跟踪状态无关。即使文件已被 Git 跟踪，只要规则最终排除它，就不进入两条入口的站点产物。
- 只读取主题内的规则，不读取个人 Git 全局配置或 `.git/info/exclude`；匹配固定区分大小写。
- 两条入口在构建前使用筛选后的 `public/`；忽略规则不作用于构建后生成的 HTML、CSS 或笔记附件。

## 改进前的证据

- `tools/lib/publish-files.mjs` 的 `copyTheme` 只加载根 `.gitignore`；`tools/export.mjs` 的 Git 查询会解释嵌套规则。临时目录样例中，嵌套规则排除的文件未进入导出选择，却进入 Publisher 构建副本。
- 原导出使用的 `--others --ignored --exclude-standard` 查询不列出已跟踪的文件，因此已跟踪且后来被忽略的资源仍可能进入导出站点包；相同样例在 Publisher 构建副本中被排除。
- Git 与现有 `ignore` 依赖对父目录排除的行为一致：排除整个目录后，仅对其中的文件写 `!` 不会恢复该文件；保留父目录、排除目录内容后再写文件例外，可以恢复该文件。

上述结果来自本机合成临时目录，未操作真实发布内容或执行部署。

## 实现职责

- `tools/lib/public-resources.mjs` 的 `selectPublicResources` 返回 public 相对路径，集中处理规则继承、目录剪枝、规则文件和文件类型。`.gitignore` 本身不作为公开资源。笔记目录可作为独立输入排除。
- Publisher 的 `copyTheme` 消费选择结果，将资源复制到构建副本；其余源码复制和安全约束保留。
- export 将选择结果复制到 `.astro/export-*/public/`，通过临时 Astro 配置指定输入、输出及缓存目录，保持主题根和笔记路径基准。站点包直接打包本次输出，原有 `dist/` 保留。导出临时目录在成功或失败时清理。
- 源码包仍使用 Git 枚举和已有交付范围，与站点资源选择分开。Workers 产物限制只由 Publisher 校验。

## 验证

`npm run test:resources` 在共同 interface 上验证嵌套规则、例外、目录剪枝、中文路径、Git 跟踪状态与无 Git 输入，并与 Git 的 `--no-index` 结果对照。真实 export / Publisher 测试检查构建前资源、最终站点、生成页面与忽略资源同路径、相对及外部绝对笔记目录、base、公式、封面和附件，以及源码包范围、输入保留和失败清理。

2026-10-29 本地 44 项测试、类型检查及当前仓库双包导出通过。用户随后将改动上传至 NAS，重新构建 Docker 镜像并试用，反馈未发现问题；该项为用户实机反馈。

源码包的交付范围、Publisher 的隔离构建及部署产物限制仍分别依据 ADR-0002 和 ADR-0008。
