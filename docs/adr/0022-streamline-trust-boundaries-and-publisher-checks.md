---
status: accepted
---

# 0022：收敛内部信任边界并精简发布器过度防御校验

2026-11-26（America/Los_Angeles）。在对仓库代码进行过度防御性设计审计后，确认前端脚本（`src/scripts/`）中的异常捕获与状态保护多针对真实浏览器兼容性（如 `MediaSession` 与移动端触摸滑动误触），而发布器工具链（`tools/lib/`、`tools/export.mjs`）及笔记编译管线（`src/lib/note-compilation.mjs`、`src/lib/note-resources.mjs`）存在多处超出实际发生概率的重复校验与防御协议，偏离了 `AGENTS.md` 中的 **Strict Trust Boundaries**（仅在外部 I/O 边界校验，内部契约完全信任）原则。经作者确认，本轮执行**第一梯队瘦身与同进程 UUID 令牌清理**，并同步精简对应的过度防御单测。

## 背景

在单人维护、本地/CI/NAS 顺序构建的个人静态博客场景下，此前实现累计引入了多类高成本或强假设的防御逻辑：

- [deployment-config.mjs](../../tools/lib/deployment-config.mjs) 手写了一整套 `wrangler.json` 顶层字段、路由字段与格式正则白名单，抢在 Wrangler 之前校验配置，导致 Cloudflare 后续新增字段会被发布脚本提前拦截；
- [public-resources.mjs](../../tools/lib/public-resources.mjs) 为个人博客的 `public/` 目录手写了支持多级嵌套 `.gitignore`、继承重写与反斜杠转义尾随空格的完整解析器，而同仓库 `copyTheme()` 本身仅读取根目录 `.gitignore`；
- [notes-snapshot.mjs](../../tools/lib/notes-snapshot.mjs) 与 [publish-files.mjs](../../tools/lib/publish-files.mjs) 在每次发布时对整个笔记目录（含全部图片附件）执行“拷贝前源目录、拷贝后目标目录、拷贝后源目录”共 **3 遍全量读取 SHA-256 哈希**，在附件增多后会带来可观的磁盘 I/O 与 CPU 开销；
- [publisher.mjs](../../tools/lib/publisher.mjs) 与 [export.mjs](../../tools/export.mjs) 分别在短暂的拷贝/构建步骤前后重复执行 `checkDependencies()` 与 `checkedReleaseRevision()`；
- [note-compilation.mjs](../../src/lib/note-compilation.mjs) 与 [note-resources.mjs](../../src/lib/note-resources.mjs) 在同一 Node.js 进程内通过 `randomUUID()` 令牌协议传参，并在 `finish()` → `compile()` → `writePlan()` → `readPlan()` 之间连续 4 层重复执行 `checkedResourcePlan()`。

## 决策

在保持真实安全底线与 Fail-Fast 错误暴露的前提下，实施以下 6 项精简，并同步调整对应测试：

1. **将 `wrangler.json` Schema 校验交还 Wrangler**（[deployment-config.mjs](../../tools/lib/deployment-config.mjs)）：
   - 移除 `keys`、`routeKeys`、`assetKeys` 全量字段白名单、`route()` 校验以及 `name` 正则与 `YYYY-MM-DD` 日期回环检查。
   - 仅保留：合法 JSON 对象校验、非空 `name` 字符串校验、禁止高危覆盖字段（`main`、`site`、`assets.directory`），以及 `siteDeploymentConfig()` 强制注入构建产物目录的安全边界。这是对 [ADR-0009](0009-external-deployment-configuration.md) 的局部修订：由硬编码允许列表转为黑名单拦截高危覆盖字段，其余配置交由 Wrangler 校验。
2. **`public/` 资源选择改为仅复用根目录 `.gitignore`**（[public-resources.mjs](../../tools/lib/public-resources.mjs)、[publish-files.mjs](../../tools/lib/publish-files.mjs)）：
   - 删除 `scopedRules()` 与逐级递归读取 `public/**/.gitignore` 的逻辑，改为通过 `readRootRules()` 只读取主题根目录 `.gitignore`（缺失则视为空规则）并复用同一个 `ignore({ ignorecase: false })` 实例。
   - 保留 `notesRoot` 排除、跳过目录中出现的 `.gitignore` 元文件、非普通文件/目录报错，以及 `publish-files.mjs` 中的 `inspectSite()`（拦截 `.git` / `.obsidian` / `.env` / `.md` 泄露与 25 MiB / 20,000 文件上限）。这是对 [ADR-0010](0010-shared-public-resource-selection.md) 的局部修订：两条发布入口仍共享 `selectPublicResources()`，但不再支持 `public/` 内部嵌套 `.gitignore`。
3. **笔记快照一致性检查降级为 `size + mtimeNs` 元数据指纹**（[publish-files.mjs](../../tools/lib/publish-files.mjs)、[notes-snapshot.mjs](../../tools/lib/notes-snapshot.mjs)）：
   - `fingerprint()` 改用 `lstat(path, { bigint: true })` 基于相对路径、类型、`size` 与 `mtimeNs`（及内部软链目标）生成摘要，不再对每个文件执行 `readFile()` 读取内容。
   - `createNotesSnapshot()` 在 `copy()` 前后比对 `source` 的元数据摘要以检测拷贝期间的源目录变更，移除拷贝后对 `directory` 的重复指纹计算与循环内多余的 `signal.throwIfAborted()`；完整保留 `source` 与 `stage` 目录不重叠校验与最多 3 次重试保护。
4. **移除 `publisher.mjs` 第二次重复依赖校验**（[publisher.mjs](../../tools/lib/publisher.mjs)）：
   - 删除 `copyTheme()` 之后对隔离副本的第二次 `checkDependencies(stage, runtimeRoot)` 调用，仅保留构建前对主题根的校验。
   - 完整保留 `removeWithin()` 清理防逃逸、构建环境剥离 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 以及日志 `redact` 脱敏。
5. **移除 `export.mjs` 末尾重复 Git 版本校验**（[export.mjs](../../tools/export.mjs)）：
   - 保留脚本开头的单次 `checkedReleaseRevision()`（校验干净工作树与版本 tag 指向 `HEAD`），删除打 tar 包前的第二次重复校验。
6. **移除同进程 UUID 令牌协议并收敛 `checkedResourcePlan()` 到计划出口**（[note-compilation.mjs](../../src/lib/note-compilation.mjs)、[note-resources.mjs](../../src/lib/note-resources.mjs)、[note-resource-plan.mjs](../../src/lib/note-resource-plan.mjs)）：
   - 移除 `compile()` 与 `remarkNoteAssets()` 之间签发及核对 `randomUUID()` 令牌（`version` / `kind` / `token`）的协议；`compile()` 直接向 `frontmatter.__aeroCompilation` 写入 `{ id, root, file, base, downloadLabels }`，回读时校验 `rendered.html` 与编译结果完整存在即可及时捕捉 `astro.config.mjs` 漏配 `remarkNoteAssets` 的配置错误。
   - `resources.finish()` 改为仅调用 `assetPlan()` 处理单篇资源去重与冲突检查；`compile()` 与 `readPlan()` 不再重复执行 `checkedResourcePlan()`（`readPlan()` 保留缓存格式 `version`、`root`、`base` 匹配与 JSON 解析检查），仅在计划生成出口 `writePlan()` 保留汇总检查。

### 第二梯队补充精简（2026-11-26）

在第一梯队提交（`3931048`）之后，继续按 **Strict Trust Boundaries** 原则对工具包打包与笔记资源交付路径实施第二梯队精简：

7. **移除工具包交付期的内核级 TOCTOU 与重复校验**（[tool-package.mjs](../../src/lib/tool-package.mjs)）：
   - 保留 `checkedFile()` 仅在 `expandToolPackage()` 内容同步入口执行 Windows 精确大小写与软链检查（方案 A）；
   - 删除 `openCheckedFile()`（`O_NOFOLLOW` + 双重 `checkedFile()` + `dev/ino` 比对）与 `checkedToolArchives()`；
   - `createToolArchive()` 信任已规划的 `archive` 与 `assets` 映射，仅在读取成员及 `manifest.json` 前用 `realpath()` + `inside(root, ...)` 确认仍在 `notesDir` 内后直接 `readFile()` 打包，不再二次解析与比对 `manifest.json` 内容。
8. **统一工具包成员交付路径并改用原生独占文件写入**（[note-assets.mjs](../../src/integrations/note-assets.mjs)）：
   - `serveAssets()` 删除 `output.packageMember` 专用 `openCheckedFile()` 分支，统一与普通附件共用 `realpath()` + `inside(plan.root, ...)` + `createReadStream()`；
   - `astro:build:done` 保留前置防逃逸与 `lstat(destination)` 碰撞检查，移除写盘循环中第 2/3 次 `realpath(parent)`、`randomUUID()` 临时文件、分块流式写入以及 `link()`/`unlink()` 硬链接流程，改为直接使用 `writeFile(destination, bytes, { flag: 'wx' })` 与 `copyFile(source, destination, constants.COPYFILE_EXCL)`。
9. **将 `checkedResourcePlan()` 收敛为单次跨文章汇总检查**（[note-resource-plan.mjs](../../src/lib/note-resource-plan.mjs)、[note-compilation.mjs](../../src/lib/note-compilation.mjs)）：
   - 将 `checkedResourcePlan()` 精简为 `finalizeResourcePlan()`，去掉对内部已校验字段的深层 schema 复检及第二遍 `assetPlan()`，仅执行 `toolEntries`/`archives` 去重冲突检查与单次跨文章 `assetPlan()`；
   - 保留 [note-resources.mjs](../../src/lib/note-resources.mjs) 中 `.md` 互链父目录 `lstat()` 检查与 `pending`/`failed`/`finished` 状态锁。

## 取舍与影响

- **运行效率与可维护性提升**：消除笔记与附件全量读盘哈希后，大附件库发布不再产生 3 倍全文件读取开销；`astro dev` 每次资源请求不再重复执行全量计划校验与逐级 `readdir` / 双重 `lstat`；`astro:build:done` 直接走原生 `copyFile(..., COPYFILE_EXCL)` 与 `{ flag: 'wx' }`，避免临时文件硬链接跨挂载限制；`wrangler.json` 也能够直接透传 Cloudflare 新增字段。
- **行为边界变化**：
  - 主题 `public/` 下的局部 `.gitignore` 文件不再作为嵌套忽略规则解析（统一在根目录 `.gitignore` 配置，且 `.gitignore` 文件本身仍不进入静态站点）；
  - `notes-snapshot.mjs` 信任本机 `copyNotes()` 写入结果不会在源未变的情况下静默损坏；
  - `.astro/aero-attachments.json` 视为同工具内部生成的构建缓存，结构合法性由入口编译与 `finalizeResourcePlan()` 保证，`readPlan()` 不再防备人工手工篡改缓存内部字段；
  - `createToolArchive()`、`serveAssets()` 与 `astro:build:done` 信任内容同步阶段完成的软链与清单校验，不再防范同步完成至打包/服务间隙内的本地文件或 `manifest.json` 篡改竞态（仍保留 `realpath()` + `inside()` 防逃逸 `notesDir` / `dist` 检查）。
- **测试同步精简**：清理了针对上述过度防御行为的单测断言（Wrangler 字段细节白名单、嵌套 `.gitignore` 及尾随空格、目标快照目录复算指纹与模拟拷贝静默篡改、同进程 UUID 串用、人工篡改缓存 JSON 内部字段、以及同步后 TOCTOU 软链替换与 `manifest.json` 篡改断言），保留全部正常安全与功能边界测试。

## 落地与验证

- **第一梯队（提交 `3931048`）**：覆盖 `tools/`、`note-compilation.mjs`、`note-resources.mjs` 及 6 个测试文件；本地验证 `npm run check`（91 文件 0 错误/0 警告/0 提示）与 `npm run test:release`（168 / 168 项测试通过）。
- **第二梯队（提交 `408a43b`）**：覆盖 [tool-package.mjs](../../src/lib/tool-package.mjs)、[note-assets.mjs](../../src/integrations/note-assets.mjs)、[note-resource-plan.mjs](../../src/lib/note-resource-plan.mjs)、[note-compilation.mjs](../../src/lib/note-compilation.mjs) 与 [tool-packages.test.mjs](../../tools/test/tool-packages.test.mjs)，本地类型检查（91 文件）及发行测试（166 项）通过，见 [HISTORY.md](HISTORY.md)。

两轮精简均未单独触发完整静态站点部署或 NAS / GitHub Actions 线上发布验证。

## 依据

- 本次审计与实施记录见 [S23](SOURCES.md#s23)，变更记录见 [HISTORY.md](HISTORY.md)。
- 关联前期决策：[ADR-0008](0008-isolated-scheduled-publisher.md)、[ADR-0009](0009-external-deployment-configuration.md)、[ADR-0010](0010-shared-public-resource-selection.md)、[ADR-0015](0015-tagged-theme-releases.md)、[ADR-0016](0016-tool-package-file-manifests.md)。
