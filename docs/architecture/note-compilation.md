# 笔记编译与附件计划

2026-10-29（America/Los_Angeles）。本改进落实 ADR-0001 的构建时渲染、ADR-0005 的显式发布和 ADR-0007 的单一笔记目录及按引用发布附件，调整内部协作协议。

## 职责

- `src/lib/note-compilation.mjs` 的 `createNoteCompilation` 管理一次内容同步的编译批次。`compile(note, renderMarkdown)` 返回完成处理的正文与封面，同时收集本篇附件；`writePlan()` 验证整批附件冲突并保存完整计划；`readPlan()` 向 dev/build 返回经过校验的计划。
- 同一模块的 `remarkNoteAssets` 负责 Markdown 图片、链接和封面的处理，以及私有编译请求与结果的传递。配置中的 Markdown 注册仍是必需的，但 loader 不再读写私有 frontmatter 字段。
- `notes-loader.ts` 负责读取笔记、发布筛选和元数据校验，并把完整编译结果写入 Astro 内容存储。每次同步创建新批次，先完成整批编译和计划保存，再替换存储。
- `src/integrations/note-assets.mjs` 负责 dev 请求与 build 文件复制。它通过编译模块读取计划，不再自行解析缓存 JSON；输出碰撞与符号链接校验继续在实际交付处执行。
- `resolveNoteAsset` 与 `assetPlan` 继续集中处理路径、文章互链、共享附件和输出冲突；原始笔记只读，只有已发布笔记的实际引用进入附件计划。

## 完整性契约

每次编译都携带版本和独立请求标记，配套 remark 完成正文图片、链接与封面处理后，返回与本次请求对应的完成结果。结果必须包含 HTML、明确的封面结果和附件数组。无封面、无附件是有效结果，与未执行配套处理不同。缺失完成结果、串用另一篇笔记的结果或字段格式错误时，编译失败并提示检查 `astro.config.mjs` 中的 `remarkNoteAssets`。Astro 接入同时核对 `noteAssets` integration 的注册，避免正文已处理但附件没有交付步骤的静默失败。

私有协议只存在于编译模块内部，完成后从渲染元数据中移除。其他 Markdown 页面没有编译请求时，remark 按普通页面处理。`astro.config.mjs` 中的公式、高亮与部署 base 设置继续生效。

## 缓存与失败语义

附件计划包含格式版本、规范化笔记根目录、部署 base、已发布文章 ID 以及附件列表。读取时核对当前目录、base 和版本，并验证附件来源、输出目标与文章归属。旧版本、损坏或来源不匹配的计划明确报错，不能当作空附件计划继续构建或提供附件。

整批编译成功后，先写入缓存目录中的独立临时文件，再以 rename 替换完整计划。未完成或已失败的批次不能保存，计划冲突或保存失败不会用半份计划覆盖之前的完整结果；临时文件在写入失败时清理。开发模式同步失败时保留上一份成功结果并记录错误。成功撤稿、删除笔记或切换目录后，新的批次完整替换旧文章和附件计划。

## 验证范围

### 单文件 HTML 工具接入（2026-11-03）

`remarkNoteAssets` 将图片节点中精确的小写 `iframe:` 前缀识别为工具，校验非空标题，再使用 `resolveNoteAsset(..., 'tool')`。引用式图片先复用现有 definition 解析。普通图片、链接与封面继续走原路径。

`tool` 是附件解析 interface 的一种用途约束：仅接受相对本地 `.html`，拒绝查询、片段和当前上传链路不接受的字面百分号输出路径；源路径与真实目标都必须是 HTML 文件。路径根、共享输出、符号链接和冲突检查继续集中在现有 resolver。它不创建新的资源种类字段、存储清单或注册系统；附件计划版本和 `{source, target}` 格式保持不变。

工具生成包含部署 base 的 iframe，固定 `sandbox="allow-scripts allow-downloads"`、懒加载、无 referrer。属性值由现有转义函数处理。HTML 按原字节复制；开发 middleware 仍先匹配计划，只为匹配的 HTML 资源返回正确 MIME，不扫描或加工 HTML。正文样式为宽度 100%、高度 480px；没有新增客户端生命周期脚本。

该接入只承载作者审查过的自包含工具，直接 HTML 访问不继承 iframe sandbox，移动兼容性仍有待验项。设计取舍见 [ADR-0014](../adr/0014-static-embedded-tools.md)，阶段 B 的实际 Markdown/2048 检查见[实现验证](../../tools/test/validation-docs/embedded-tools-phase-b-2026-11-03.md)。

`tools/test/content.test.mjs` 在相同 interface 上验证：正常空结果、封面与附件完整性、配套 remark 缺席、渲染结果串用、失败批次保留旧结果、计划版本与来源校验、损坏计划、整批输出冲突及撤稿清理。

真实 Astro 构建覆盖公式、高亮、中文路径、引用式图片、封面、共享附件、文章互链与部署 base，同时验证移除 remark、integration 与 loader 配置不同笔记根时的失败行为。真实 dev 验证附件修改、撤稿、目录切换和删除笔记后的旧资源清理。资源选择与 Publisher 的回归测试另行验证导出及隔离构建接入；NAS 和线上验收需在更新后的实际环境中执行。

2026-10-29 本地验收：内容与发布筛选测试 13 项、发布资源测试 7 项、Publisher 测试 11 项、触摸测试 22 项全部通过；当前仓库类型检查无错误、警告或提示，实际源码包和站点包导出通过。本轮未执行 NAS 或线上验收。

2026-10-30 用户复验：已将本轮改动同步到 NAS 并测试发布，反馈发布没有问题。该结果来源为用户实机反馈。

2026-10-30 第二阶段本地验收：新增[完整 Vault 合成样本](../../tools/test/vault/)与[验收指南](../../tools/test/validation-docs/zh-CN/VAULT-VALIDATION.md)。`tools/test/publication.test.mjs` 通过真实 Publisher 的四轮 `build-only` 验证外部混合 Vault、中文/空格路径、同目录 PDF、子目录笔记、封面/互链、共享附件更新、撤稿及删除最后一篇文章；逐轮核对输入指纹、附件字节、完整文章产物清单和 HTML 链接。内容与发布筛选共 18 项测试通过；样本 PDF 通过严格解析和正文提取。本次保持附件实现与 URL 规则不变，不调用 Wrangler，也未执行该组样本的 NAS／线上 URL 验收。

2026-10-31 用户反馈第二阶段改动在 NAS 单次发布正常；记录已补入 [ADR 0007](../adr/0007-notes-directory-and-attachments.md)。该反馈不代替验收指南中逐项的线上资源、撤稿 URL 和手机同步检查。

2026-11-03 前端工具[阶段 C 本地验收](../../tools/test/validation-docs/embedded-tools-phase-c-2026-11-03.md)：内容与发布 28 项通过，真实 Publisher 的 7 轮构建及导出核对工具所属副本、HTML 单独更新、普通链接保留和最终撤稿；本地工具 URL 检查通过。没有改变编译接口或清单格式。移动输入仍有未通过项，NAS 和线上未执行。

2026-11-03 随后完成[阶段 D NAS/Worker 验收](../../tools/test/validation-docs/embedded-tools-phase-d-2026-11-03.md)：四轮真实发布核对原字节交付、HTML 单独更新、撤稿所属副本与共享副本保留，最终临时工具和全部记录别名清除。只读挂载和工具链一致性通过；原有 Vault 未变。移动输入限制、手机同步及本轮定时触发仍待另验。

同日用户补充 iPhone Chrome 的棋盘操作及 iframe 内外滚动正常，已在阶段 D 中作为用户实机反馈单列。桌面 Chromium 模拟失败不外推为该手机不可滚动，也不因此改写原始自动化结果；本次只更新验收说明。
