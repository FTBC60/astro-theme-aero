---
status: accepted
---

# 0010：两条发布入口在构建前选择相同的 public 资源

2026-10-29（America/Los_Angeles）决定落实架构复检中的资源选择改进。[0002](0002-validated-static-export.md) 的站点包导出和 [0008](0008-isolated-scheduled-publisher.md) 的 Publisher 都承诺过滤不应发布的主题资源，但原先使用不同规则：export 的 Git 查询支持嵌套忽略文件，却没有排除已跟踪且后来被忽略的资源；Publisher 的构建副本只解释根 `.gitignore`。相同主题因此可能产生不同的交付内容。

两条入口共同使用 [selectPublicResources](../../tools/lib/public-resources.mjs)，读取主题根与 `public/` 内各级 `.gitignore`，按目录解释规则、继承和 `!`，与 Git 跟踪状态无关。已排除的父目录不遍历，其中的文件不能仅靠子级例外恢复；需要先在可读取的上级规则中恢复父目录。匹配固定区分大小写，不读取个人 Git 全局配置、`core.excludesFile` 或 `.git/info/exclude`，以便 Git checkout 和无 `.git` 的 NAS 主题使用同一规则。`.gitignore` 是构建元数据，读取但不作为公开资源复制；选中的符号链接或特殊文件报错，笔记目录仍作为独立输入排除。

选择结果在 **Astro 构建前** 使用。Publisher 将选中的资源复制到隔离构建副本；export 将它们放入 `.astro/export-*/public/`，通过临时 Astro 配置重定向 `publicDir`、构建输出和缓存。export 保留原主题根，因此原配置导入、相对或绝对 `notesDir` 和部署 base 的解析方式不变。原 `public/`、笔记和已有 `dist/` 不被改写；临时导出目录在成功或失败后清理。站点包直接打包这次构建输出，取消构建结束后依据源资源路径删除输出的做法，以免误删同路径的生成页面。

这个选择增加一次 public 资源复制与临时配置，换取可重现的构建输入及两条入口的一致性。源码包继续沿用 0002 的 Git 文件枚举、明确范围、删除文件处理和版本标记；它与公开站点的内容范围不同，仍应在分享前检查。普通 `dev` / `build` 命令读取常规主题配置，正式交付使用 export 或 Publisher。Workers 文件大小和数量检查仍只属于 Publisher，部署参数仍遵守 [0009](0009-external-deployment-configuration.md)。

验证入口为 `npm run test:resources`：与 `git check-ignore --no-index` 对照嵌套规则，检查跟踪状态、个人排除规则、无 Git 输入、中文路径、符号链接及规则文件；真实运行 export 和无 Git Publisher，覆盖相对与外部绝对笔记目录、base、公式、封面和附件。构建钩子检查资源在进入 Astro 前已被过滤，并验证被忽略的 public 路径不会导致同路径生成文章被删除。源码包范围、原始输入及已有 `dist/` 保留、失败清理也在此验证。部署工具变化需要重建镜像。

2026-10-29 本地验收：资源测试 7 项、内容测试 4 项、Publisher 测试 11 项和触摸测试 22 项全部通过；类型检查、当前仓库双包导出、归档内容及临时目录清理检查通过。同日用户完成代码 Review，将改动上传至 NAS，重新构建 Docker 镜像并试用，反馈未发现问题；NAS 结果来源为用户实机反馈。
