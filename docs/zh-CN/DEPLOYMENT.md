# 编译与 Cloudflare Workers 部署指南

**文档语言：** 简体中文 · [English](../en/DEPLOYMENT.md)

主题保持 Astro 静态构建，发布流程只负责生成静态站点并通过 Wrangler 上传 Worker Static Assets，线上不需要 SSR、R2 或数据库。项目提供两种自动发布方案：

- **方案一：群晖 NAS 容器定时发布** — 适合将笔记保存在本地 NAS Obsidian Vault 的作者，使用只读挂载与常驻 Docker 容器定时构建。
- **方案二：GitHub Actions 自动编译与发布** — 适合将仓库用作 GitHub Template（或自行托管在 GitHub）、把笔记提交到 `src/content/posts/` 的作者，无需 NAS 即可在推送或定时触发时完成构建与部署。

两种方案共用同一套根目录 `wrangler.json` 配置及 `tools/deploy.mjs` 检查、构建与发布流程。

## 准备与 Wrangler 共享配置

无论采用方案一还是方案二，都需要先准备 Cloudflare 凭据与站点配置：

- 准备 Cloudflare Account ID 和允许编辑目标账户 Workers 的 API Token，可使用官方 Edit Cloudflare Workers 模板。
- 在主题根目录的 `wrangler.json` 中设置 Worker 名称、兼容性日期和可选域名路由；首次发布可创建 Worker，配置自定义域名需要域名已托管于目标 Cloudflare 账户且 Token 有相应权限。Cloudflare Access 仍在控制台配置。

主题根目录的 `wrangler.json` 是部署参数的唯一来源。在方案一中，容器每次任务读取 `/theme/wrangler.json`（`name` 取代旧的 Compose `WORKER_NAME`，旧环境变量不再参与覆盖）；在方案二中，GitHub Actions 直接读取仓库根目录的 `wrangler.json`。文件是标准 JSON，不支持注释或尾逗号；保留它在主题根目录，不要放入 `public/`。文件随源码发布包提供，但不进入镜像或上传产物。

```json
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "aero-diary",
  "compatibility_date": "2026-10-25",
  "send_metrics": false,
  "workers_dev": true,
  "preview_urls": false,
  "assets": {
    "html_handling": "force-trailing-slash",
    "not_found_handling": "none"
  }
}
```

默认模板启用了 `workers_dev: true`、关闭版本预览地址且未配置自定义域名，部署后可直接通过 Cloudflare 分配的 `*.workers.dev` 地址访问。如果在同一 Cloudflare 账户下部署多个站点，请修改 `name` 以避免同名覆盖。需要绑定自定义域名时，可加入 `routes`：

```json
  "routes": [
    { "pattern": "blog.example.com", "custom_domain": true }
  ]
```

请替换为自己的域名后再发布；绑定自定义域名后如需关闭 `*.workers.dev` 访问，可将 `workers_dev` 设为 `false`。普通路由也支持 `"routes": ["example.com/diary/*"]`，或带 `zone_id`、`zone_name` 的路由对象；也可使用单个 `route`，但不能同时设置 `route` 和 `routes`。

发布工具在构建前仅做基础与边界校验：要求文件为合法 JSON 对象、包含非空 `name`，且禁止填写 `main`、`site` 和 `assets.directory`。其余所有字段与格式校验均交由固定版本的 Wrangler 执行；省略的可选参数遵循 Wrangler 自身语义，不会被脚本补成另一个值。

`assets.directory` 始终由发布工具指向检查后的站点产物目录，不要在 `wrangler.json` 中手动填写。`main`、自定义 `build`、`env`、数据库绑定等不属于此纯静态发布流程。账户 ID 与 Token 放在 Compose 环境变量或 GitHub Repository Secrets 中，不要放进 `wrangler.json`。每次任务读取后固定使用该份配置快照，任务中途修改会在下次任务生效；配置缺失、无效或不支持时直接失败，不回退到镜像内旧配置。

修改此文件无需重建容器镜像（方案一）或修改工作流（方案二），重新执行一次发布或等待定时任务即可。`--dry-run` 验证配置和构建但不修改线上域名。真实发布时，域名变更由 Wrangler 应用；固定版本 4.152.0 在域名/路由列表为空时会跳过相应发布操作，因此**删除配置项或设为 `routes: []` 不保证解除已有绑定**，解绑最后一个域名请在 Cloudflare 控制台的 Domains & Routes 中删除。Access 策略也不会由该文件自动创建。

---

## 方案一：群晖容器定时发布

容器是编译工具，主题是运行时输入：`/app` 仅包含 Node、固定依赖和发布工具；`THEME_DIR` 指定只读挂载的主题目录，默认 `/theme`；`/data` 保存构建副本、日志和结果。镜像不包含主题源码、主题配置、图片、歌单或笔记。每次任务重新读取主题，不修改主题或 Vault，也不在挂载目录执行 `npm install`。

### 准备与 Compose 配置

- 群晖 Container Manager 的项目目录中放置完整主题源码（含 `Dockerfile` 和锁文件）。
- 笔记存放在独立 NAS 目录，推荐不放入 Docker 构建上下文。

将 [compose.yaml](../../examples/deployment/compose.yaml) 复制到主题根目录，命名为 `compose.yaml`，再在 Container Manager 中为这个目录建立项目。示例的构建上下文和主题挂载来源均为 `.`。不要直接以示例子目录作为构建上下文。

若沿用外层项目目录结构：

```text
astro-publisher/
├── compose.yaml
├── astro-theme-aero/     # 主题、Dockerfile、tools 和依赖清单
└── data/                # 现有日志与状态
```

则将 `build.context` 和 `/theme` 挂载的 `source` 均设为 `./astro-theme-aero`，保留原有 `./data:/data`。默认示例使用 `./publisher-data:/data`；不要因迁移更换已有数据目录。

在实际 Compose 文件中填写：

| 参数 | 含义 |
| --- | --- |
| `CRON_SCHEDULE` | 五字段 cron 表达式，默认 `0 3 * * *`。 |
| `TZ` | 调度时区，例如 `America/Los_Angeles`；镜像含 tzdata。 |
| `THEME_DIR` | 容器内主题读取位置，默认 `/theme`，必须与主题挂载目标一致。不是笔记目录覆盖项。 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID。 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token。 |

凭据直接写在 Compose 的 `environment` 中。仓库仅保存占位符示例；实际的根目录 `compose.yaml`、`publisher-data/` 和 `.env*` 已被 Git 忽略，Docker 构建上下文也不包含实际 Compose 文件。

从旧版迁移：将 Compose 的 `WORKER_NAME` 值填入 `wrangler.json` 的 `name`，移除该环境变量，并重建一次工具镜像以安装读取外部配置的新发布脚本。以后仅调整部署参数不需要重建。

笔记目录仍只由主题 `src/config/content.config.ts` 中的 `notesDir` 决定，没有 `CONTENT_DIR`。默认配置保持 `./src/content/posts`，对应挂载目标 `/theme/src/content/posts`：

```yaml
volumes:
  - type: bind
    source: .
    target: /theme
    read_only: true
    bind:
      create_host_path: false
  - type: bind
    source: /volume1/Files/Vault/Notes
    target: /theme/src/content/posts
    read_only: true
    bind:
      create_host_path: false
  - ./publisher-data:/data
```

修改 `source` 为实际 NAS 目录；若修改 `notesDir`，也要相应调整挂载目标。默认笔记位置被嵌套的只读 Vault 挂载覆盖。`create_host_path: false` 用于在 NAS 路径不存在时直接失败，避免误建空目录。运行用户必须能读取主题和笔记并写入数据目录。`.dockerignore` 仅放行依赖清单和 `tools/`，整个主题 `src/`、`public/` 和 Vault 均不进入镜像。主题整个 `public/` 已挂载，无需单独挂载 `public/audio/`。

常见表达式：`0 3 * * *` 每天 03:00；`0 */6 * * *` 每六小时；`*/15 * * * *` 每十五分钟。表达式按 `TZ` 解释，日志时间戳使用 UTC。修改环境变量、凭据或挂载后重新创建容器。

修改主题配置、页面、样式、图片、音频、歌单或日记后，下次发布直接读取，无需重建镜像或重启调度器；浏览器仍须等待发布完成才能看到更新。只有 `package.json`、`package-lock.json` 或发布工具（`tools/`、`Dockerfile`）变化时才重建镜像，然后用 `docker compose up -d --force-recreate` 更新常驻容器。任务会比较主题与镜像中的两个依赖文件（忽略 JSON 排版差异）；缺失、无效或不匹配时停止，提示先重建镜像，且不执行检查、构建或上传。

### 第一次验证与日常运行

在 NAS 项目目录中：

```sh
docker compose build
docker compose run --rm publisher validate
docker compose run --rm publisher once --dry-run
```

`validate` 使用 Supercronic 检查表达式和时区，不发布；`once --dry-run` 实际检查、构建和执行 Wrangler dry run，不上传。查看日志和 `publisher-data/site/` 中的 HTML、附件后，再执行真正发布：

```sh
docker compose run --rm publisher once
docker compose up -d
```

常驻容器启动后等待下一次计划时间，不立即发布。任务失败会记录错误，调度器继续等待下一次执行。也可以在 Container Manager 终端中运行 `node tools/deploy.mjs --dry-run` 或 `node tools/deploy.mjs`；手动与定时执行共用同一把锁。

发布容器不开放端口，也不需要挂载 Docker socket。Node 固定为 24.22.1，Supercronic 固定为 v0.2.51 并校验 SHA-256，Wrangler 与其他依赖由 `package-lock.json` 固定。首次镜像构建需要访问 Debian、GitHub 和 npm 下载源；每天执行不重新安装依赖或自动拉取主题更新。

### 输出与排错

`/data` 对应 NAS 的 `publisher-data/`：

- `logs/`：任务日志及 Wrangler 日志，保留最近最多约 30 个文件；同时可从 Container Manager 查看标准输出。
- `status.json`：最近一次任务的 `published`、`dry-run`、`built` 或 `failed` 状态。
- `last-success.json`：最近一次实际发布成功的信息；dry run 和失败不更新。
- `site/`：最近一次检查通过的候选站点，可能尚未上线；它不等同于历史成功版本的备份。
- `runs/`：本次工作目录，结束后清理。

本机也可使用 Node.js 24 运行 `npm run deploy:build`（仅构建）、`npm run deploy:dry-run` 或 `npm run deploy`。先编辑主题根目录的 `wrangler.json` 并在当前终端设置部署所需环境变量。未设置 `THEME_DIR` 时，本机默认读取发布脚本所在的项目根目录；设置后可编译独立主题目录。默认工作数据在工具项目的 `.astro/publisher/`；`PUBLISHER_DATA_DIR` 只控制工作数据位置，容器固定为 `/data`，不影响笔记读取目录。

---

## 方案二：GitHub Actions 自动编译与发布

如果没有 NAS，建议将本主题仓库作为 GitHub Template 复制到自己的 GitHub 账号下，将日记直接提交到仓库的 `src/content/posts/` 目录，由 GitHub Actions 自动编译并部署到 Cloudflare Workers。

### 1. 创建仓库与准备工作流

- **通过 GitHub Template 创建（推荐）**：在主题仓库页面点击 **Use this template** 创建自己的仓库。若不想将未发布草稿或私人笔记公开在 Git 历史中，创建时或创建后可将仓库设为 **Private（私有）**；仅不设置 `publish: true` 并不能阻止 Git 历史中的源文件被公开仓库访问。
  - Template 复制的仓库已自带 `.github/workflows/publish.yml`。
  - 仓库内附带的 `.github/workflows/release.yml` 用于作者打包主题发行版，仅在推送 `v*` 版本标签时运行，日常博客提交不会触发，可忽略或按需移除。
- **通过 `*-theme.tar.gz` 主题包创建**：从 Release 解压主题包并自行初始化 Git 仓库推送到 GitHub 时，请将 [publish.yml](../../examples/deployment/publish.yml) 复制为仓库根目录下的 `.github/workflows/publish.yml`。

### 2. 配置 GitHub Secrets

进入仓库的 **Settings → Secrets and variables → Actions → Repository secrets**，添加以下两项：

| Secret 名称 | 说明 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `CLOUDFLARE_API_TOKEN` | 具备 Workers 编辑权限的 Cloudflare API Token |

### 3. 触发规则与无凭据回退行为

工作流使用 `concurrency` 防止并发部署冲突，支持三种触发方式：

- **推送自动发布（`push`）**：推送到 `main` 或 `master` 分支时自动运行（已忽略 `docs/**`、`README.md`、`LICENSE` 等纯文档变动）。将新日记或 `public/` 资源提交并推送后即可触发上线。
- **定时任务（`schedule`）**：默认每天 `0 11 * * *`（**UTC 11:00**，即美西标准时间 03:00）自动执行。注意 GitHub Actions 的 cron 固定按 UTC 解释且在高峰期可能有数分钟延迟；另外若仓库连续 **60 天没有任何新提交**，GitHub 会自动暂停 `schedule` 触发器，可在 Actions 页面手动重新启用。
- **手动触发（`workflow_dispatch`）**：在仓库 **Actions → Publish blog → Run workflow** 手动运行，提供 `dry_run` 开关（勾选后执行检查、构建和 Wrangler `--dry-run`，不上传线上站点）。

未配置 Cloudflare Secrets 时的行为设计：
- 在公开模板仓库、或尚未配置 Secrets（例如仅先提交配置或选择方案一 NAS）的仓库中，`push` 与 `schedule` 会自动**回退为仅执行 `npm run check` 与 `npm run build`**，用来校验主题和文章能否正常编译，而不会报错红叉。
- 在 Actions 页面**手动触发 `workflow_dispatch` 且未勾选 `dry_run`** 时，如果缺少上述 Secrets，工作流会**明确报错失败**，避免误以为已成功部署。

### 4. 与本地 / NAS 发布的行为一致性

GitHub Actions 工作流直接调用 `npm run deploy`（与 `npm run deploy:dry-run`），复用下文相同的发布流水线；如果音频文件较大，建议注意 Cloudflare Workers Free 的单文件 **25 MiB** 上限和 Git 仓库体积限制，在 `public/audio/playlist.json` 中改用支持 CORS 的外部 HTTPS 音频链接。若运行失败，工作流会自动将 `.astro/publisher/logs/` 与 `status.json` 打包为名为 `publisher-logs-<run_id>` 的 Artifact（保留 7 天）供下载排查。

---

## 单次发布的行为与共同排错

无论通过方案一（容器定时/手动）还是方案二（GitHub Actions 执行 `npm run deploy`），单次发布均严格执行以下步骤：

1. 取得共享锁，验证目录与 `wrangler.json` 配置。已有任务运行时，本次调用跳过并返回成功。
2. 核对主题与运行环境的依赖清单，将主题的 `src/`、`public/` 和构建配置复制到独立工作目录；再次核对副本依赖文件。主题中自带的 `tools/`、`node_modules/`、Docker/Compose 文件不作为构建输入。复制笔记前后比较指纹，发现变化时最多尝试三次；持续变化则停止。
3. 仅在临时副本内把笔记配置指向该副本中的 `.notes`，原 `notesDir` 配置和原始笔记完全不写入。相对与绝对源目录使用相同流程。
4. 在副本中运行 Astro check、静态构建和附件处理。`public/` 在构建前与站点包导出共用选择规则：读取主题根目录 `.gitignore`，支持 `!`，固定区分大小写，与 Git 跟踪状态无关；个人 Git 排除配置不参与，规则文件本身不复制。
5. 检查站点：必须有首页，不接受原始 MD、笔记配置、符号链接或特殊文件；检查 Workers Free 的 **20,000 文件**及**单文件 25 MiB** 限制。
6. 全部通过后才运行 Wrangler，且上传目录仅为检查后的站点。缺失凭据、检查或构建失败时不会发起上传。
7. 写入结果、清理临时副本并释放锁。部署失败返回非零退出码；上次成功记录不覆盖。

如果 dry run 通过但真实部署失败，检查 Token 的账户范围、Workers 及域名路由权限；网络中断造成结果不确定时，以 Cloudflare 部署历史为准。若域名不可访问，检查 `wrangler.json` 的路由、`workers_dev` 开关以及 Cloudflare Access 设置。

参考：[Cloudflare Astro 静态部署](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)、[Static Assets 限制](https://developers.cloudflare.com/workers/platform/limits/#static-assets)、[Supercronic](https://github.com/aptible/supercronic)。
