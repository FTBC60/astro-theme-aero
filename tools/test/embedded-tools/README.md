# Embedded tools: staged verification

阶段 A 脚本用于前置技术实验，不实现 Markdown 工具语法或正式工具发布器；阶段 B/C 则验证实际实现。前置结果见[阶段 A 记录](../validation-docs/embedded-tools-phase-a-2026-11-03.md)及[脱敏证据](../validation-docs/embedded-tools-phase-a-2026-11-03.json)。这些文件属于开发测试资料，不进入作者源码包或 Publisher 镜像。

## 环境与样本

- Node.js 24.22.1、项目现有依赖；不升级 Astro、Wrangler 或锁文件。
- Playwright 库及匹配的浏览器。可通过 `PLAYWRIGHT_MODULE_PATH` 指定现有安装路径，通过 `PLAYWRIGHT_CHANNEL` 指定 Chrome 频道。WebKit 必须与驱动匹配；单独强行指定另一个版本的浏览器二进制不能作为有效验收。
- `fixtures/2048.html` 是本次实际样本的原字节快照，SHA-256 记录于结果文件；不运行 PHP、WordPress 或原多文件版本。
- 浏览器脚本是普通 Playwright 程序，不依赖 `@playwright/test`。本机 CLI 未缓存，本次使用现有库，没有安装新依赖。

## 本地复现

在主题根目录执行：

```powershell
node tools/test/embedded-tools/prepare.mjs --sample tools/test/embedded-tools/fixtures/2048.html
node tools/test/embedded-tools/routing.mjs --action inspect
$fixture = Get-Content .astro/embedded-tools-phase-a/manifest.json -Raw | ConvertFrom-Json
node node_modules/wrangler/bin/wrangler.js dev --config $fixture.cloudConfig --local --ip 127.0.0.1 --port 18865 --inspector-port 19365 --persist-to (Join-Path $fixture.run 'wrangler-state')
```

另一个终端：

```powershell
node tools/test/embedded-tools/routing.mjs --url http://127.0.0.1:18865 --label local --phase initial
node tools/test/embedded-tools/browser.mjs --url http://127.0.0.1:18865 --label local --base /
node tools/test/embedded-tools/browser.mjs --url http://127.0.0.1:18865 --label local --base /blog/ --engines chromium
```

`prepare.mjs` 创建新的 `.astro/embedded-tools-phase-a/run-*`，复制正式主题的 src 与配置，在副本中手写 iframe 测试页，使用合成头像和音频；不复制真实 public、不编辑正式主题。工具文件经现有 `resolveNoteAsset` 规划到模拟交付位置，再手动作为测试资源提供；**这不证明工具 Markdown 编译或正式附件 middleware 已接入**。

## 阶段 B 实际编译接入 / Phase B integration

```powershell
node tools/test/embedded-tools/phase-b.mjs --sample ../2048/2048.html
```

这项检查读取当前传入的样本，记录 SHA-256；不默认使用阶段 A 快照。它在临时主题中写入真正的已发布 Markdown，通过现有 loader/remark/附件计划执行根路径及 `/blog/` 两次构建，并启动实际 Astro dev 检查 HTML MIME、原字节、未引用资源、JSON 导入导出、标题属性、CSS 和 ClientRouter 历史导航。随后在副本中更新 HTML 和撤稿，检查开发响应；最终停止服务、删除临时主题，只在 `.astro/embedded-tools-phase-b/` 保存结果和截图。

它不执行云端上传，也不代表阶段 C 的完整多浏览器或 NAS 验收。结果见[阶段 B 记录](../validation-docs/embedded-tools-phase-b-2026-11-03.md)。

## 阶段 C 本地验收 / Phase C local acceptance

```powershell
node tools/test/embedded-tools/phase-c.mjs --sample ../2048/2048.html
```

通过真正的 Publisher `build-only` 执行 7 轮根路径/base、工具更新、普通链接保留、移除最后引用、撤稿及删除最后文章验证，并运行真正的源码包/站点包导出。Wrangler 只以 `--local` 监听 loopback，使用本轮合成配置；脚本不调用部署命令，Publisher runner 也明确拒绝调用 Wrangler。临时主题最后回收，结果、原始日志、初始站点快照、导出包与配置留在 `.astro/embedded-tools-phase-c/run-*`。

默认运行 Chrome 浏览器矩阵；已知触屏失败返回退出码 1，但后续独立的交付/撤稿检查仍继续。`--skip-browser` 仅执行交付部分，不表示浏览器通过。结果分别见 [Markdown 记录](../validation-docs/embedded-tools-phase-c-2026-11-03.md)与[结构化证据](../validation-docs/embedded-tools-phase-c-2026-11-03.json)。

重跑浏览器时，先取该次 `manifest.json` 的路径，启动同目录 `wrangler-initial.json` 对应的本地服务，再调用浏览器程序；该配置指向不会被后续撤稿检查改写的 `site-initial/`。

```powershell
# 用本轮实际路径替换 run-XXXXXX；另一个终端运行浏览器命令。
node node_modules/wrangler/bin/wrangler.js dev --config .astro/embedded-tools-phase-c/run-XXXXXX/wrangler-initial.json --local --ip 127.0.0.1 --port 18866 --inspector-port 19366
node tools/test/embedded-tools/phase-c-browser.mjs --manifest .astro/embedded-tools-phase-c/run-XXXXXX/manifest.json --url http://127.0.0.1:18866 --engine chromium
node tools/test/embedded-tools/phase-c-browser.mjs --manifest .astro/embedded-tools-phase-c/run-XXXXXX/manifest.json --url http://127.0.0.1:18866 --engine webkit
node tools/test/embedded-tools/touch-diagnostic.mjs --manifest .astro/embedded-tools-phase-c/run-XXXXXX/manifest.json --url http://127.0.0.1:18866 --cases '^focus-region$' --label minimal
```

用 `PLAYWRIGHT_MODULE_PATH` 选择本机已安装的 Playwright；分别选择与 Chrome、WebKit 匹配的驱动，不强行混用浏览器版本。浏览器脚本可用 `--cases <正则>`、`--bases /` 和 `--label <名称>` 缩小问题并保留独立报告。没有匹配用例时报错。最小触屏诊断的非零结果是仍可复现的失败，不能当作解决方案；移除 sandbox 或焦点的对照只影响临时诊断页，不改变正式工具。

截图位于各轮 `output/playwright/`。本地服务测试后应停止；这些命令不等同于物理设备或 NAS 验收。

## 阶段 D NAS 与线上 / Phase D NAS and live hosting

[当前记录](../validation-docs/embedded-tools-phase-d-2026-11-03.md)保留已经通过的 NAS 四轮发布、线上交互及清理检查；实体移动限制另行记录。`phase-d.mjs` 消费显式准备的私有会话文件，只读取 NAS 候选站点并探测已记录的部署域名；不会执行部署或修改源文件。实际验收辅助文件已从 NAS 清理，重跑须新建隔离会话，不能直接重跑已清理的主机脚本。

```powershell
node tools/test/embedded-tools/phase-d.mjs --session .astro/embedded-tools-phase-d/session.json --phase initial --action inspect
node tools/test/embedded-tools/phase-d.mjs --session .astro/embedded-tools-phase-d/session.json --phase initial --action probe --url https://your-configured-host.example
```

`--phase` 可选 `initial`、`update`、`withdraw`、`removed`，对应实际已完成的源文件调整及重新构建/发布，不由探针自动推进。URL 必须是会话或 NAS 部署配置中已经记录的来源。Access 或人机验证阻挡时返回退出码 2 并记录待认证，不把登录页、挑战页或其 HTTP 200 当作工具通过。正常身份验证由用户完成，原始会话和认证信息不纳入仓库。

`phase-d-browser.mjs --url <已记录的 Worker 来源>` 使用现有标准 Chrome 验证线上文件往返、实际权限限制、音乐/历史导航与窄屏。`phase-d-nas-check.mjs <容器内私有配置路径> <阶段>` 在 Publisher 容器里只读核对工具链、挂载、候选站点和线上别名；结果写到 `/data/`。它不部署或修改 Vault。仅用于本次已准备的独立验收目录，普通测试不自动调用。

后续主机脚本由用户显式执行，顺序调用现有 Publisher；它会修改和移除本次生成的测试文件。执行前必须已有会话备份和匹配的五文件清单，不能用于任意 Vault 清理。每阶段检查失败即停，原始脚本/配置与运行结果只保存在私有开发产物中。

## 阶段 A 历史样本的后续步骤

根路径和 `/blog/` 各执行一次真实 Astro 构建。为在同一测试主机上验证两个部署位置，将 `/blog/` 构建产物挂到生成站点的 `blog/` 子目录；这不改变 Astro 的输出规则。manifest 记录本轮目录、样本摘要和两个构建。

## 隔离失败与对照

```powershell
node tools/test/embedded-tools/browser.mjs --url http://127.0.0.1:18865 --label webkit-isolated --engines webkit --cases 'below-fold'
node tools/test/embedded-tools/browser.mjs --url http://127.0.0.1:18865 --label webkit-adapter --engines webkit --cases 'below-fold' --adapter
node tools/test/embedded-tools/webkit-diagnostic.mjs http://127.0.0.1:18865
node tools/test/embedded-tools/browser.mjs --url http://127.0.0.1:18865 --label touch --engines chromium --cases 'touch emulation'
node tools/test/embedded-tools/browser.mjs --url http://127.0.0.1:18865 --label touch-standalone --engines chromium --cases 'touch emulation' --standalone
```

`--adapter` 仅在测试浏览器中加入旧版最小重建逻辑；不编辑 BaseLayout。`--settle-touch` 与 `--height 820` 用于触屏失败的滚动等待和高度对照。失败场景退出码为 1，报告仍会保存，不能将其视为测试基础设施一律不可用而跳过。

`webkit-diagnostic.mjs` 在生成站点增加无 iframe 的长页面，分别测试原生切换和强制回退的对照。它不改变正式主题或承诺修复浏览器崩溃。

## 云端实验（显式执行）

以下命令会创建和更新全新临时 Worker；不纳入 npm 的普通测试命令，不调用当前博客的 wrangler.json。

```powershell
node tools/test/embedded-tools/cloud.mjs names
node tools/test/embedded-tools/cloud.mjs deploy initial
$fixture = Get-Content .astro/embedded-tools-phase-a/manifest.json -Raw | ConvertFrom-Json
node tools/test/embedded-tools/routing.mjs --url $fixture.cloudUrl --label cloud --phase initial
node tools/test/embedded-tools/browser.mjs --url $fixture.cloudUrl --label cloud --base / --engines chromium
node tools/test/embedded-tools/browser.mjs --url $fixture.cloudUrl --label cloud --base /blog/ --engines chromium
node tools/test/embedded-tools/routing.mjs --action mutate --phase update
node tools/test/embedded-tools/cloud.mjs deploy update
node tools/test/embedded-tools/routing.mjs --url $fixture.cloudUrl --label cloud --phase update
node tools/test/embedded-tools/routing.mjs --action mutate --phase withdraw
node tools/test/embedded-tools/cloud.mjs deploy withdraw
node tools/test/embedded-tools/routing.mjs --url $fixture.cloudUrl --label cloud --phase withdraw
node tools/test/embedded-tools/cloud.mjs cleanup
```

先完成站点检查和浏览器检查，再改写生成产物；不要与浏览器检查并发执行 update/withdraw。mutation 只作用于已校验的生成目录；不修改 Vault 或样本。最后无论试验是否通过都清理本次 Worker。本次两个 Worker 已确认删除。

原始 JSON、日志、快照和截图保留在本轮 `.astro` 目录下，截图使用其 `output/playwright/`。`collect.mjs` 仅用于本次已命名实验的证据汇集，脱敏输出不含账户 ID、测试域名、机器绝对路径或令牌。它不参与生产流程。
