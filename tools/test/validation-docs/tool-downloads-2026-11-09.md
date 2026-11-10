# 工具下载与 ZIP 归档验收

2026-11-09，America/Los_Angeles。在 `17440a2` 之后实现第三开发阶段，覆盖 iframe 与普通链接两种工具引用。

## 交付行为

| 引用目标 | 设置 | 下载形式 |
| --- | --- | --- |
| 单 HTML | 无需清单 | 自动提供原 HTML 下载 |
| 目录包 | `download: true` | 提供 ZIP 下载 |
| 目录包 | `download: false` 或未声明 | 关闭下载入口，在线文件继续发布 |

iframe 下载链接位于框架上方工具栏，普通 HTML 链接后附加独立下载链接。原链接的文字、标题、行内格式、查询参数与片段保留。下载地址使用文件路径，文件名与 URL 由编译器生成，文案复用站点语言。

ZIP 与工具目录同级，归档根目录直接包含入口、所选文件与自动加入的 `manifest.json`。成员路径、资源与控制清单的原始字节均保留。生成前校验当前控制清单与发布计划一致。成员顺序与时间固定，源文件未变化时归档可重复生成相同字节。

## 实现

- `tool-package.mjs` 共用清单校验、文件校验及归档生成。清单 v1 必需 `version`、`files`，允许可选布尔字段 `download`。
- ZIP 使用锁定的构建依赖 fflate 0.8.2。生成输入复用已验证的文件列表，生成前再次检查文件类型、路径大小写和符号链接。
- 私有编译协议为 v3，增加 `archives` 描述。每条归档记录包含入口、目标与经过校验的清单，成员来源引用既有附件计划。描述按入口去重，并与复制文件、文章及公开文件共用冲突检查。
- dev 与 build 共用归档生成函数。dev 按请求读取文件，内容同步负责开关和文件选择变化。完整构建负责更新、减项及撤稿清理。
- 主题作者包与 Publisher 使用同一份 package.json 和锁文件。部署时按现有流程同步依赖和重建 Publisher 镜像。

## 环境和结果

Node.js 22.18.0，Astro 7.3.8，Playwright CLI 0.1.23，Chrome 148.0.7778.179。Python 标准库负责独立 ZIP 读取与 CRC 校验。

| 验证 | 结果 |
| --- | --- |
| 串行自动测试套件 | 138 项通过 |
| Astro 类型检查 | 84 文件，零错误、警告和提示 |
| 默认站点构建 | 8 页 |
| 真实 Publisher 集成 | 6 次成功 build-only，2 次预期碰撞失败 |
| 浏览器交互 | 7 组通过 |
| dev 更新与撤稿 | 9 项通过，合成输入已恢复 |
| 实际浏览器下载 | 8 个文件完成，HTML 与 ZIP 均覆盖两种入口和 dev/preview |
| 独立下载校验 | ZIP CRC、成员列表、资源及控制清单原字节全部匹配 |
| 解压后运行 | CSS、计算、fetch、Worker、localStorage 和单 HTML 操作通过 |

自动测试覆盖下载开关三种状态、字段类型、未知字段、原字节和 UTF-8 路径、二进制文件、归档复现、缺失文件、清单变更、私有计划篡改、路径及大小写冲突。

集成夹具中的第一篇文章混用 iframe 和普通链接，并包含单 HTML。第二篇只含普通链接，分别引用同目录及共享目录工具包。按 `/` 和 `/blog/` 构建，逐字节比对在线文件、ZIP 成员和控制清单。ZIP 与公开文件冲突时构建失败，原站点候选指纹保持一致。

关闭下载和省略字段时，旧 ZIP 从新产物中消失，所选在线文件完整保留。重新开启后可生成归档。依赖单独更新、清单减项、文章撤稿及最后引用移除均覆盖。

浏览器在 dev 和静态 preview 上分别点击 iframe 工具栏与普通链接旁的 HTML / ZIP 下载入口。文件名正确，下载地址排除打开页面用的查询和片段，文章页面继续保留。实际下载由 Python `zipfile` 检查 CRC 和成员原字节，并解压至全新目录。通过仅监听 127.0.0.1 的 HTTP 服务打开解压工具后，运行 `extracted-browser.js`，验证计算、资源加载和 Worker 等功能。临时解压服务已关闭。

## 验证过程中的修正

首次下载检查在自动滚动期间丢失点击事件。脚本显式滚动并聚焦下载链接后，实际点击下载全部通过。源文件与清单最初分别采用原字节和重新序列化方式，现已统一保留原字节，并增加控制清单一致性校验。

一次并行本地验证碰到 Windows Vite 共享缓存的 rename 文件锁。Publisher 集成夹具已设置独立 Vite 缓存目录，随后顺序复验全部通过。该配置只存在于合成夹具。

## 复现

从主题仓库根目录按顺序执行。

```sh
node --test --test-concurrency=1 tools/test/*.test.mjs
npm run check
npm run build
node tools/test/embedded-tools/package-integration.mjs
```

夹具地址、主题目录及端口记录在 `.astro/tool-packages-phase-b/manifest.json`。在记录的主题副本目录启动 Astro dev 和 preview，然后执行。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test/embedded-tools/package-browser.ps1
python tools/test/embedded-tools/verify-downloads.py
node tools/test/embedded-tools/package-dev-updates.mjs
```

解压位置记录在夹具的 `download-verification.json`。通过本地 HTTP 服务打开该目录，在独立 Playwright CLI 会话中检查页面快照，再执行 `tools/test/embedded-tools/extracted-browser.js`。完成后关闭该会话和临时服务。

详细本机日志位于 `.astro/tool-downloads-2026-11-09/`，浏览器和 dev 更新报告保存在夹具目录中。测试产物按现有规则保留在忽略目录。

上述自动化结果来自隔离 Vault、合成工具和本机浏览器。真实手机的保存行为，以及各工具在 file:// 下的运行方式按目标环境验收。

## 用户部署验收

2026-11-09，America/Los_Angeles。用户确认已将本轮修改同步到 NAS 文件夹，重新编译镜像，并完成编译、发布和实际测试，结果成功，第三开发阶段验收完成。该部署结果来自用户反馈，本次提交整理复用上述本地验收记录。

提交前重新执行 `node --test tools/test/tool-packages.test.mjs`，14 项专项测试全部通过。
