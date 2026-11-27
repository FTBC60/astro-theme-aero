---
status: accepted
---

# 0023：为内嵌前端工具 iframe 启用 allow-same-origin 权限

2026-11-27（America/Los_Angeles）。在保持现有单文件工具与目录包清单机制不变的前提下，将文章内嵌工具 `iframe` 的固定 `sandbox` 权限由 `allow-scripts allow-downloads` 调整为 `allow-scripts allow-downloads allow-same-origin`，使内嵌工具从不透明来源（opaque origin）切换为与站点一致的同源执行环境，从而消除同源 Fetch、WebAssembly 加载与浏览器存储障碍。本决策修订 [ADR-0014](0014-static-embedded-tools.md) 与 [ADR-0016](0016-tool-package-file-manifests.md) 中关于禁止 `allow-same-origin` 的边界约定。

## 背景

此前 [ADR-0014](0014-static-embedded-tools.md) 与 [ADR-0016](0016-tool-package-file-manifests.md) 为文章内嵌工具固定使用 `sandbox="allow-scripts allow-downloads"`：

- 缺少 `allow-same-origin` 时，浏览器将 `iframe` 置于不透明来源（`window.origin === 'null'`），导致工具无法在嵌入视图中使用同源 `fetch`、WebAssembly 实例化及 `localStorage` / `IndexedDB` 等浏览器存储；
- 对于依赖同源资源加载与 WebAssembly 的前端工具（例如 Ruffle），不透明来源会直接阻断其同源资源请求；
- 同时，主题的既定前提已是“仅发布经过博客作者审查的工具”，且工具 HTML 与站点同源托管，通过独立链接直接访问时本来就以站点正常同源运行、不继承 `iframe` 沙箱隔离。

因此，在作者自托管、作者审核工具的前提下，继续以不透明来源限制内嵌工具已与实际工具运行需求产生明显摩擦。

## 决策

1. **源码修改**（[note-compilation.mjs](../../src/lib/note-compilation.mjs#L156)）：
   - 将统一生成内嵌工具 `iframe` 的 `sandbox` 属性由 `"allow-scripts allow-downloads"` 更新为 `"allow-scripts allow-downloads allow-same-origin"`。
   - 保留 `loading="lazy"`、`referrerpolicy="no-referrer"` 与 `class="aero-embedded-tool"`，继续不授予 `allow-forms`、`allow-popups` 与 `allow-top-navigation`。
   - 现有的工具包 `manifest.json` 格式、Markdown `![iframe: ...]` 语法、附件计划以及普通链接独立打开机制均保持不变。
2. **测试断言同步**（[content.test.mjs](../../tools/test/content.test.mjs)、[tool-packages.test.mjs](../../tools/test/tool-packages.test.mjs)）：
   - 将两处测试文件中的 `sandbox` 匹配断言更新为 `sandbox="allow-scripts allow-downloads allow-same-origin"`。
   - 从 [content.test.mjs](../../tools/test/content.test.mjs#L122) 的 `assert.doesNotMatch` 禁用列表移除 `allow-same-origin`，保留对 `allow-forms`、`allow-popups`、`allow-top-navigation` 与 `transition:persist` 的禁止断言。
   - 历史阶段性验收脚本（`tools/test/embedded-tools/`）及验收报告（`tools/test/validation-docs/`）作为历史阶段证据保留原样。
3. **配置文档更新**（[中文配置文档](../zh-CN/CONFIGURATION.md#L254-L264)、[English configuration guide](../en/CONFIGURATION.md#L258-L268)）：
   - 更新固定 `sandbox` 属性说明及能力边界描述，明确内嵌工具支持同源 Fetch、WebAssembly 与浏览器存储，跨站请求仍受 CORS 规则约束；
   - 明确说明同时启用 `allow-scripts` 与 `allow-same-origin` 后，`iframe` 不再提供不透明来源隔离，工具具备与直接访问 HTML 相同的同源脚本权限（包括访问父页面 DOM 与站点存储），安全边界由博客作者审查并发布可信工具来保证。

## 取舍与影响

- **功能收益**：所有通过 `![iframe: ...]` 嵌入的单文件与目录包工具均直接获得同源权限，可使用同源 Fetch、WebAssembly 与浏览器存储；对 Ruffle 等工具而言，该修改消除了 `iframe` 不透明来源导致的同源资源加载障碍。
- **安全边界变化**：由于同时授予 `allow-scripts` 与 `allow-same-origin` 且工具与站点同源托管，内嵌工具已具备访问父页面 DOM 与同源存储的能力，主题不再将内嵌 `iframe` 表述为对工具脚本的来源隔离屏障。该机制仍仅适用于博客作者自行审查后发布的工具，不适用于不可信第三方输入。
- **兼容性边界**：消除不透明来源障碍并不自动证明特定工具（如 Ruffle）在全部浏览器或具体内容上的播放兼容性，实际运行效果仍需针对具体工具另行测试验证。

## 落地与验证

修改落地后在 `static` 工作区执行了完整的自动化验证：

- `npm run test:release`：166 / 166 项测试通过（0 失败，0 跳过）；
- `npm run check`：91 个文件类型检查通过（0 errors、0 warnings、0 hints）；
- `npm run build`：静态站点构建通过（生成 8 个页面）。

未在本次变更中重写历史阶段性浏览器脚本或对 Ruffle 进行实机播放测试。

## 依据

- 本次决策与实施记录见 [S24](SOURCES.md#s24)，变更记录见 [HISTORY.md](HISTORY.md)。
- 修订前期决策：[ADR-0014](0014-static-embedded-tools.md)、[ADR-0016](0016-tool-package-file-manifests.md)。
