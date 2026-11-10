# 工具目录包阶段 B：本地验收

2026-11-04（America/Los_Angeles）。用户已反馈 AuthKey 阶段 A 检查正常，并授权进入阶段 B。工作树为 `static` 分支，起点提交 `3816505`；本次功能未提交、未推送、未部署。开始前已有 `.gitignore` 改动，原样保留。

## 本轮实现

- 工具入口旁的 `manifest.json` v1 仅声明 `version` 和具体 `files`；无清单继续旧单 HTML，有清单必须通过 `index.html` 引用，错误阻止构建。
- 校验文件存在、精确大小写、路径规范及普通文件类型，拒绝包根/子路径符号链接、目录、重复文件、越界、源码与清单发布。标准 JSON.parse 保留最后同名键，不新增特殊解析器或配额。
- 以入口 target 父目录映射完整包，沿用 `{ source, target }` 及既有冲突/文章归属检查，共享引用仍有各文章副本。
- 内部缓存格式 v2 仅新增私有 `toolEntries`，供开发目录别名使用，不进入公开站点或内容存储；作者清单仍为 v1。
- 开发预览补齐 JS/MJS、CSS、JSON、WASM MIME；目录地址仅映射已登记包入口。
- 中英文时间戳示例位于 `examples/posts/{zh-CN,en}/tools/timestamp/`，文章默认不发布。该示例用于文件机制验收，不代表四个目标工具已全部交付。

## 浏览器发现及处理

真实浏览器初测发现：Astro 7.3.8 的开发服务在普通中间件前验证 Sec-Fetch 元数据，隔离 iframe 对包内 JS/CSS 的请求被视为 cross-site/no-cors 并返回 403。普通 HTTP 请求能通过，所以只补 MIME 和 HTTP 测试不足以证明可运行。

集成新增仅开发时启用的 Vite post configureServer 回调，在 Astro 安装检查之后，把**已登记包目录中、且精确命中附件计划**的静态文件处理放到前面。未选路径、源码及普通附件不适用。没有修改 Astro/Vite 依赖、源码或安全配置，没有添加 CORS 或 iframe 权限。

修正后实测：包内 app.js 返回 200；伪造 cross-site/no-cors 请求访问其他源码仍返回 403。配置重启后同样可用。此处使用 Connect 中间件栈顺序，Astro 升级时需继续执行相应浏览器回归。

临时主题通过 node_modules 链接使用工具链，开发配置单独允许该依赖目录、关闭工具栏并隔离 Vite 缓存，以避免测试夹具与主工作树互相干扰。这些设置只在 `.astro/` 的合成主题中存在，不进入正式配置。

## 已执行检查

| 检查 | 结果与范围 |
| --- | --- |
| `node --test tools/test/tool-packages.test.mjs` | 6 组通过：编译、去重、共享/嵌套 ID、严格清单、大小写/符号链接、冲突、缓存保留和 GET/HEAD/MIME/目录别名 |
| `npm run test:content` | 28 项通过：内容、附件、旧单 HTML、开发服务及完整 Vault 回归 |
| `npm run test:resources` | 7 项通过，包含源码/站点包与实际隔离 Publisher 资源一致性 |
| `npm run check` | 83 文件，0 errors、0 warnings、0 hints |
| `npm run build` | 成功，默认主题生成 8 个页面，时间戳示例未被自动发布 |
| 真实 Publisher 工具包专项 | 根路径及 /blog/ 构建、本地/共享副本、原字节、未选文件排除、公开资源冲突阻断、依赖更新、清单减项、撤稿和末次引用移除通过；所有调用都是 build-only |
| 真实浏览器 | Chrome 148.0.7778.179，6 项通过，详情如下 |
| 开发态更新 | 5 步通过：JS-only 更新、清单-only 减项、恢复、撤稿/共享副本、恢复夹具 |

Chrome 浏览器 6 项：

1. 从首页实际 ClientRouter 导航进入文章；在 origin 为 null、权限仍为 `allow-scripts allow-downloads` 的 iframe 中运行外部 JS/CSS，秒/毫秒转换正确；旧单 HTML 仍可操作。
2. 浏览器后退/前进保留父文档并重建工具初始状态。
3. 开发 `index.html` 与目录 URL 正确；HEAD/MIME、清单和未选文件 404；其他源码跨源请求 403。
4. 共享包 `_attachments/` 下的相对资源和转换正常。
5. 实际构建候选产物通过 Astro preview 运行，目录/显式 index 地址均可用；已移除资源不可访问。不是 Cloudflare 路由实测。
6. 桌面模拟 390px 窄屏，无工具内部横向溢出，键盘转换正常，没有未捕获 JS 错误或外网请求。不是手机实机验收。

专项发布测试执行了 5 次成功完整构建和 1 次预期冲突失败。失败不会替换已有候选站点；修改、撤稿均未改真实 Vault。初轮失败的浏览器测试用于发现开发服务问题，最终报告保留为通过版本，不把初轮 HTTP 通过误表述为浏览器通过。

## 复现

从主题根目录执行：

```powershell
node --test tools/test/tool-packages.test.mjs
node tools/test/embedded-tools/package-integration.mjs
```

专项集成测试生成 `.astro/tool-packages-phase-b/manifest.json`，记录临时主题、候选站点、输出和两个端口。然后分别启动两个服务器：

```powershell
$fixture = Get-Content .astro/tool-packages-phase-b/manifest.json -Raw | ConvertFrom-Json
node node_modules/astro/bin/astro.mjs dev --root $fixture.theme --host 127.0.0.1 --port $fixture.devPort
```

```powershell
$fixture = Get-Content .astro/tool-packages-phase-b/manifest.json -Raw | ConvertFrom-Json
node node_modules/astro/bin/astro.mjs preview --root $fixture.theme --host 127.0.0.1 --port $fixture.previewPort
```

在另一个 PowerShell 终端顺序运行验证器；浏览器测试和修改夹具的测试不要并发：

```powershell
& .\tools\test\embedded-tools\package-browser.ps1
node tools/test/embedded-tools/package-dev-updates.mjs
```

浏览器验证器使用独立开发 CLI `@playwright/cli@0.1.23` 和已安装 Chrome，不向主题 package.json 添加浏览器依赖；首次运行可下载 CLI。根据 CLI 快照检查真实界面后运行场景。结果为每次生成目录下的 `output/playwright/browser-report.json`、截图和 `dev-updates-report.json`。测试报告失败时进程退出非零。

本轮夹具和产物位置由[生成清单](../../../.astro/tool-packages-phase-b/manifest.json)记录。根目录 `.astro/tool-packages-{tests,content,resources,check,build,integration,dev-updates}.log` 分别记录各项命令输出，不随源码包或站点发布。重跑集成测试会生成新目录，不覆盖真实站点。

## 未完成及明确限制

- 没有同步 NAS、重建正式容器或部署 Cloudflare；线上 HTML 规范地址、缓存和撤稿需要阶段 D 实测。
- 没有实机 iPhone、Android、独立 Safari 或 WebKit 浏览器矩阵。
- 没有为主题引入 AuthKey 业务、依赖分析、工具 npm 编译、运行时后端、浏览器发布门禁或工具专用清理器。
- AuthKey 尚未通过此目录包机制发布，二维码和解锁码也未进入阶段 C。
- 实际候选站点上的 preview 结果不能替代线上验证；build-only 与后续 deploy 重新构建的产物也不能声称逐字相同。
- 本轮工具预览与 Astro 新版本检查顺序兼容；未来升级 Astro 时需重跑不透明 iframe 与未选路径保护用例。
