# 群晖定时构建与 Cloudflare Worker 部署

主题保持 Astro 静态构建。常驻发布容器只负责按时生成站点并通过 Wrangler 上传 Static Assets，线上不需要 SSR、R2 或数据库。

容器是编译工具，主题是运行时输入：`/app` 仅包含 Node、固定依赖和发布工具；`THEME_DIR` 指定只读挂载的主题目录，默认 `/theme`；`/data` 保存构建副本、日志和结果。镜像不包含主题源码、主题配置、图片、歌单或笔记。每次任务重新读取主题，不修改主题或 Vault，也不在挂载目录执行 `npm install`。

## 准备

- 群晖 Container Manager 的项目目录中放置完整主题源码（含 Dockerfile 和锁文件）。
- 笔记存放在独立 NAS 目录，推荐不放入 Docker 构建上下文。
- 准备 Cloudflare Account ID 和允许编辑目标账户 Workers 的 API Token，可使用官方 Edit Cloudflare Workers 模板。
- 在主题根目录的 `wrangler.json` 中设置专用 Worker 名称和域名路由；首次发布可创建 Worker，配置自定义域名需要域名已托管于目标 Cloudflare 账户且 Token 有相应权限。Cloudflare Access 仍在控制台配置。默认模板关闭 workers.dev 与版本预览地址，未配置任何域名。

## Compose 配置

将 `examples/deployment/compose.yaml` 复制到主题根目录，命名为 `compose.yaml`，再在 Container Manager 中为这个目录建立项目。示例的构建上下文和主题挂载来源均为 `.`。不要直接以示例子目录作为构建上下文。

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

## Wrangler 外部配置

主题根目录的 `wrangler.json` 是部署参数的唯一来源，容器每次任务读取 `/theme/wrangler.json`。`name` 取代旧的 Compose `WORKER_NAME`；旧环境变量不再参与覆盖。文件是标准 JSON，不支持注释或尾逗号；保留它在主题根目录，不要放入 `public/`。文件随源码发布包提供，但不进入镜像或上传产物。

```json
{
  "name": "blog",
  "compatibility_date": "2026-10-25",
  "workers_dev": false,
  "preview_urls": false,
  "send_metrics": false,
  "routes": [
    { "pattern": "blog.example.com", "custom_domain": true }
  ],
  "assets": {
    "html_handling": "force-trailing-slash",
    "not_found_handling": "none"
  }
}
```

以上域名仅为示例；请替换为自己的域名后再发布。临时使用 workers.dev 测试时可设置 `workers_dev: true`，不需要自定义域名。普通路由也支持 `"routes": ["example.com/diary/*"]`，或带 `zone_id`、`zone_name` 的路由对象；也可使用单个 `route`，但不能同时设置 `route` 和 `routes`。

当前支持 `$schema`、`name`、`compatibility_date`、`compatibility_flags`、`workers_dev`、`preview_urls`、`send_metrics`、`route`、`routes`、`observability` 和 `assets` 中的 `html_handling`、`not_found_handling`。未知字段或基本类型、日期、路由格式错误会在构建前停止；具体 Cloudflare 选项的进一步校验由固定版本的 Wrangler 执行。省略的可选参数遵循 Wrangler 自身语义，不会被脚本补成另一个值。

`assets.directory` 始终由发布工具指向已检查的 `/data/site`，不要在外部配置填写。`main`、自定义 `build`、`env`、数据库绑定等不属于此纯静态发布流程。账户 ID 与 Token 仍放在 Compose，不放进 Wrangler 文件。每次任务读取后固定使用该份配置快照，任务中途修改会在下次任务生效；配置缺失、无效或不支持时直接失败，不回退到镜像内旧配置。

修改此文件无需重建镜像或重启容器，手动执行一次发布或等待定时任务即可。`--dry-run` 验证配置和构建但不修改线上域名。真实发布时，域名变更由 Wrangler 应用；固定版本 4.152.0 在域名/路由列表为空时会跳过相应发布操作，因此**删除配置项或设为 `routes: []` 不保证解除已有绑定**，解绑最后一个域名请在 Cloudflare 控制台的 Domains & Routes 中删除。Access 策略也不会由该文件自动创建。

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

修改主题配置、页面、样式、图片、音频、歌单或日记后，下次发布直接读取，无需重建镜像或重启调度器；浏览器仍须等待发布完成才能看到更新。只有 `package.json`、`package-lock.json` 或发布工具（`tools/`、Dockerfile）变化时才重建镜像，然后用 `docker compose up -d --force-recreate` 更新常驻容器。任务会比较主题与镜像中的两个依赖文件（忽略 JSON 排版差异）；缺失、无效或不匹配时停止，提示先重建镜像，且不执行检查、构建或上传。

## 第一次验证与日常运行

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

发布容器不开放端口，也不需要挂载 Docker socket。Node 固定为 24.22.1，Supercronic 固定为 v0.2.51 并校验 SHA-256，Wrangler 与其他依赖由 package-lock.json 固定。首次镜像构建需要访问 Debian、GitHub 和 npm 下载源；每天执行不重新安装依赖或自动拉取主题更新。

## 单次发布的行为

1. 取得共享锁，验证目录与配置。已有任务运行时，本次调用跳过并返回成功。
2. 核对主题与工具镜像的依赖清单，将挂载主题的 `src/`、`public/` 和构建配置复制到独立工作目录；再次核对副本依赖文件。主题中自带的 `tools/`、`node_modules/`、Docker/Compose 文件不作为构建输入。镜像中的固定工具运行检查和部署。复制笔记前后比较指纹，发现变化时最多尝试三次；持续变化则停止。主题文件复制不是原子快照，笔记复制加指纹校验也不是文件系统原子快照，可将任务安排在编辑和同步完成后的时段。
3. 仅在临时副本内把笔记配置指向该副本中的 `.notes`，原 `notesDir` 配置和原始笔记完全不写入。相对与绝对源目录使用相同流程。
4. 在副本中运行 Astro check、静态构建和附件处理。`public/` 在构建前与站点包导出共用选择规则：读取主题根目录和嵌套 `.gitignore`，支持 `!`，固定区分大小写，与 Git 跟踪状态无关；个人 Git 排除配置不参与，规则文件本身不复制。容器主题无需带 `.git`。本次发布工具升级后须重建镜像。
5. 检查站点：必须有首页，不接受原始 MD、笔记配置、符号链接或特殊文件；检查 Workers Free 的 20,000 文件及单文件 25 MiB 限制。
6. 全部通过后才运行 Wrangler，且上传目录仅为检查后的站点。缺失凭据、检查或构建失败时不会发起上传。
7. 写入结果、清理临时副本并释放锁。部署失败返回非零退出码；上次成功记录不覆盖。

硬中断可能留下工作副本或锁。下一次取得锁后会清理本程序拥有的 `run-*` 工作目录；锁每十秒更新，崩溃后的陈旧锁约三十秒后可回收。正常停止会等待当前任务，Compose 给予两分钟退出时间；之后仍未完成可能被 Docker 强制停止。

## 输出与排错

`/data` 对应 NAS 的 `publisher-data/`：

- `logs/`：任务日志及 Wrangler 日志，保留最近最多约 30 个文件；同时可从 Container Manager 查看标准输出。
- `status.json`：最近一次任务的 `published`、`dry-run`、`built` 或 `failed` 状态。
- `last-success.json`：最近一次实际发布成功的信息；dry run 和失败不更新。
- `site/`：最近一次检查通过的候选站点，可能尚未上线；它不等同于历史成功版本的备份。
- `runs/`：本次工作目录，结束后清理。

本机也可使用 Node.js 24 运行 `npm run deploy:build`（仅构建）、`npm run deploy:dry-run` 或 `npm run deploy`。先编辑主题根目录的 `wrangler.json` 并在当前终端设置部署所需环境变量。未设置 `THEME_DIR` 时，本机默认读取发布脚本所在的项目根目录；设置后可编译独立主题目录。默认工作数据在工具项目的 `.astro/publisher/`；`PUBLISHER_DATA_DIR` 只控制工作数据位置，容器固定为 `/data`，不影响笔记读取目录。

如果 dry run 通过但真实部署失败，检查 Token 的账户范围、Workers 及域名路由权限；网络中断造成结果不确定时，以 Cloudflare 部署历史为准。若域名不可访问，检查 `wrangler.json` 的路由、workers.dev 开关以及 Cloudflare Access 设置。

参考：[Cloudflare Astro 静态部署](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)、[Static Assets 限制](https://developers.cloudflare.com/workers/platform/limits/#static-assets)、[Supercronic](https://github.com/aptible/supercronic)。
