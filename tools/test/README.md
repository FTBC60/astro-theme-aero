# 开发测试与维护 / Development tests and maintenance

本目录随 GitHub 源码仓库保留，不进入面向博客作者的源码包或 Publisher 镜像。作者使用文档见[中文指南](../../docs/zh-CN/README.md)和[English guide](../../docs/en/README.md)。

This directory is included in the Git checkout, but excluded from author source archives and Publisher images. Run commands from the project root with Node.js 24 (the container pins 24.22.1), after `npm ci`.

## 自动测试 / Automated tests

| 命令 / Command | 覆盖范围 / Coverage |
| --- | --- |
| `npm run test:content` | 笔记编译、附件、发布许可、Frontmatter 和完整 Vault / note compilation, attachments, publication, frontmatter, complete Vault |
| `npm run test:playlist` | 播放会话、浮层、触摸和生命周期 / playback sessions, panel, touch and lifecycle |
| `npm run test:resources` | 公开资源规则、源码/站点包、真实隔离发布构建 / public resource selection, source/site archives, isolated Publisher builds |
| `npm run test:publisher` | 发布流程、快照、锁、失败处理、调度和配置 / publishing, snapshots, locking, failures, schedule and configuration |
| `npm run test:page-images` | 固定 Markdown 页图片与部署前缀 / fixed-page images and deployment base |

全部分组按顺序执行，然后检查和构建：

Run every group, then check and build:

```sh
npm run test:content
npm run test:playlist
npm run test:resources
npm run test:publisher
npm run test:page-images
npm run check
npm run build
```

测试使用临时工作目录。Publisher 测试的上传由替身接管，真实集成用例使用 `build-only`；这些测试不执行真实云端部署。`fixtures/playlist-dom.mjs` 是受控 DOM 替身，不能代替真实浏览器布局或物理设备手势验收。

Tests use temporary workspaces. Uploads are mocked in Publisher tests; real integration cases use `build-only`. They do not deploy to the cloud. The controlled DOM fixture does not replace browser layout or hardware gesture checks.

## 完整 Vault / Complete Vault

[合成 Vault](vault/README.md)包含已发布笔记、私人笔记、草稿、模板、隐藏文件、同目录 PDF、子目录和共享附件。默认主题不会发布它。完整步骤和预期产物见[中文验收指南](validation-docs/zh-CN/VAULT-VALIDATION.md) / [English acceptance guide](validation-docs/en/VAULT-VALIDATION.md)。

The synthetic fixture covers mixed publication states, local PDFs, nested notes, shared assets, attachment-only updates, withdrawal and removal of the final post. It is not the default content directory. Run just the complete-Vault integration case with:

```sh
node --test --test-name-pattern="complete Vault" tools/test/publication.test.mjs
```

## 浏览器验收 / Browser acceptance

先执行 `npm run build` 和 `npm run preview`，在独立浏览器会话中打开预览首页并检查快照，再运行迁移后的脚本：

Build, start the preview, open its homepage in an isolated browser session, inspect the snapshot, then run:

```sh
npx --yes --package @playwright/cli playwright-cli -s=aero-check open http://localhost:4321/
npx --yes --package @playwright/cli playwright-cli -s=aero-check snapshot
npx --yes --package @playwright/cli playwright-cli -s=aero-check run-code --filename tools/test/navigation.browser.js
npx --yes --package @playwright/cli playwright-cli -s=aero-check close
```

脚本检查文章与关于页图片、前进后退、音频元素保留、移动侧栏、键盘焦点和关闭行为。它不替代真实播放、触摸滚动和手机测试。历史问题与验收边界见[导航验收记录](validation-docs/navigation-2026-11-01.md)。

The script checks images, navigation/history, retained audio identity, mobile sidebar and focus. It does not replace actual audio playback, touch scrolling or phone testing. See the linked record for historical browser limitations.

本次目录与交付范围迁移的结果及未验项目见[迁移验收记录](validation-docs/delivery-separation-2026-11-01.md)。

## 交付范围 / Delivery scope

- GitHub：正式主题、作者示例/文档、测试与经检查的维护资料。
- 作者源码包：正式主题、默认资源、作者示例/文档、正式工具及工程配置；排除本目录与 `docs/adr/`、`docs/architecture/` 等开发资料。仅打包副本的 `package.json` 移除测试命令。
- Publisher 镜像：package 文件和正式工具；主题与笔记通过运行时只读挂载读取。本目录不进入 Docker 上下文或镜像。

GitHub keeps developer materials; author archives exclude them and strip test commands only in the staged package manifest. Publisher images contain production tooling and dependencies, with theme/notes mounted at runtime. Build images from the same checkout/archive used by the theme: Publisher compares complete package manifests and lockfiles. Do not mix an archive's stripped manifest with an image built from the full checkout.

`test:resources` verifies selected public resources before actual builds, archive contents, preserved inputs and cleanup. `test:publisher` verifies snapshot retries, fail-fast errors/cancellation, locks, state preservation and configuration. Container scheduling and read-only mounts still require an available Docker/Linux environment; `deploy:dry-run` is a separate Wrangler check.

## 开发决策与模块说明 / Decisions and modules

- [架构决策索引 / Architecture decisions](../../docs/adr/README.md)
- [交付范围与测试隔离 / Delivery scope and test isolation](../../docs/adr/0013-delivery-scopes-and-test-isolation.md)
- [变更追溯 / Change history](../../docs/adr/HISTORY.md)
- [来源与证据边界 / Source evidence](../../docs/adr/SOURCES.md)
- [笔记编译 / Note compilation](../../docs/architecture/note-compilation.md)
- [笔记快照 / Notes snapshots](../../docs/architecture/notes-snapshot.md)
- [资源选择 / Resource selection](../../docs/architecture/resource-selection.md)
- [播放会话 / Playback sessions](../../docs/architecture/playback-session.md)
- [歌单浮层 / Playlist panel](../../docs/architecture/playlist-panel.md)

历史验收的日期、版本和限制保留；路径按当前结构更新不表示重新执行了历史 NAS 或线上验收。原始会话、凭据、私人地址、原始日志和临时运维脚本不随仓库公开。
