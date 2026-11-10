# Scheduled publishing on Synology and Cloudflare Workers

The theme builds static HTML. A long-running publishing container schedules builds and uploads Worker Static Assets, without SSR, R2, or a database at runtime.

The image is a build tool: `/app` holds fixed dependencies and publisher tools, `THEME_DIR` selects a read-only theme mount (default `/theme`), and `/data` holds writable workspaces, logs, and results. Theme code, configuration, images, playlists, and notes are not installed in the image. Every job reads the mounted theme again, without modifying it or running `npm install` there.

## Setup

Put the complete theme source, Dockerfile, and lockfile in a Container Manager project directory. Keep NAS notes outside the Docker build context where possible. Obtain a Cloudflare account ID and API token with Workers edit access to that account; the official Edit Cloudflare Workers template is a starting point. Set the Worker name and routes in the theme's root `wrangler.json`. Custom domains require the zone to be hosted in the target account and appropriate token permissions. Configure Access in Cloudflare separately. The template disables workers.dev and preview URLs and does not configure any domains.

Copy `examples/deployment/compose.yaml` to `compose.yaml` in the theme root. Create the Container Manager project from that root, not the examples subdirectory. Fill the actual file's environment values:

If Compose is in a parent project directory with the theme under `./astro-theme-aero/`, set both `build.context` and the `/theme` mount source to `./astro-theme-aero`. Preserve the existing data mount (for example, `./data:/data`); the template uses `./publisher-data:/data` for a new installation.

| Variable | Meaning |
| --- | --- |
| `CRON_SCHEDULE` | Five-field cron expression; default `0 3 * * *`. |
| `TZ` | Scheduling timezone, e.g. `America/Los_Angeles`. The image includes tzdata. |
| `THEME_DIR` | Container path of the theme mount, default `/theme`. This is not an override for `notesDir`. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID. |
| `CLOUDFLARE_API_TOKEN` | API token for deployment. |

Credentials go directly in Compose `environment`. Only placeholder examples belong to the repository. The actual root `compose.yaml`, `publisher-data/`, and `.env*` are Git-ignored, and the Docker build context excludes the actual Compose file.

## External Wrangler configuration

The theme's root `wrangler.json` is the single source of deployment settings, read from `/theme/wrangler.json` on every job. Its `name` replaces the old Compose `WORKER_NAME`, which no longer overrides anything. This is standard JSON without comments or trailing commas. Keep the file outside `public/`: it is included in source archives but excluded from the image, staged Astro inputs, and uploaded site.

```json
{
  "name": "aero-blog",
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

Replace the example hostname before publishing. For workers.dev testing, set `workers_dev: true`; no custom domain is required. Standard routes can use strings such as `"routes": ["example.com/diary/*"]` or route objects with `zone_id`/`zone_name`. A single `route` is also accepted; do not combine it with `routes`.

Supported settings are `$schema`, `name`, `compatibility_date`, `compatibility_flags`, `workers_dev`, `preview_urls`, `send_metrics`, `route`, `routes`, `observability`, and `assets.html_handling`/`assets.not_found_handling`. Unknown fields and basic type, date, or route errors stop before building. Wrangler performs further validation of its own options. Omitted optional settings retain Wrangler's semantics instead of being filled in by the publisher.

`assets.directory` is controlled by the publisher and always points at the inspected `/data/site`; do not specify it. Worker entry points, custom `build` commands, environments, and database bindings are outside this static workflow. Keep account ID and token in Compose, not this file. A job uses one configuration snapshot, so edits during a job take effect on the next job. Missing or invalid configuration fails without falling back to image defaults.

Changes need no image rebuild or container restart: publish once or wait for the schedule. Dry runs do not modify live domains. Wrangler applies routes during real deployment. Pinned Wrangler 4.152.0 skips the corresponding domain/route publication when its list is empty: **omitting routes or setting `routes: []` does not guarantee removing existing bindings**. Remove the last binding in Cloudflare Domains & Routes. Access policies are managed separately.

To migrate, move the Compose `WORKER_NAME` value to `wrangler.json` as `name`, remove that environment variable, and rebuild the tool image once to install the new reader. Later deployment-setting changes need no rebuild.

`notesDir` in the theme's `src/config/content.config.ts` remains the only notes setting. There is no `CONTENT_DIR` override. With the default `./src/content/posts`, mount notes at `/theme/src/content/posts`:

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

Change the source to the NAS directory. Changing `notesDir` also requires changing the matching container target. The nested read-only Vault mount replaces the theme's default notes path. Disabling host-path creation makes a missing NAS directory fail instead of creating an empty one. The container user needs read access to theme and notes, and write access to data. `.dockerignore` permits only dependency manifests and `tools/`; all theme files and notes stay outside the image. A separate `public/audio/` mount is unnecessary because the entire theme is mounted.

Schedules use `TZ`: `0 3 * * *` is daily at 03:00, `0 */6 * * *` every six hours, and `*/15 * * * *` every fifteen minutes. Log timestamps are UTC. Recreate the container after changing environment values, credentials, or mounts.

Changes to theme configuration, pages, styles, images, audio, playlists, or notes are read by the next job without rebuilding the image or restarting the scheduler. Browsers see changes after publication. Rebuild only when `package.json`, `package-lock.json`, or publisher tools (`tools/`, Dockerfile) change, then run `docker compose up -d --force-recreate`. Jobs compare both theme dependency files with the image copies, ignoring JSON formatting. Missing, invalid, or mismatched files stop publication before checks, builds, or upload and require rebuilding the image.

## First run

From the NAS project root:

```sh
docker compose build
docker compose run --rm publisher validate
docker compose run --rm publisher once --dry-run
```

`validate` checks the schedule with Supercronic. `once --dry-run` performs real checks, builds, and a Wrangler dry run without upload. Review the logs and HTML/attachments in `publisher-data/site/`, then publish and start scheduling:

```sh
docker compose run --rm publisher once
docker compose up -d
```

Startup waits for the next schedule and does not publish immediately. Job failures are logged; the scheduler continues. Manual runs from the Container Manager terminal use `node tools/deploy.mjs --dry-run` or `node tools/deploy.mjs`. Manual and scheduled runs share the same lock.

The container exposes no ports and needs no Docker socket. Node is pinned to 24.22.1, Supercronic to v0.2.51 with SHA-256 verification, and Wrangler/dependencies to the lockfile. Image creation downloads dependencies from Debian, GitHub, and npm; daily runs do not reinstall packages or pull theme updates.

## Publication lifecycle

1. Acquire a shared lock and validate configuration. Concurrent invocations skip successfully.
2. Verify theme dependencies against the toolchain, copy `src/`, `public/`, and build configuration into an isolated workspace, and verify the captured dependency files again. Mounted theme tools, dependencies, and Docker/Compose files are not build inputs. Checks and deployment use the image's tools. Compare note fingerprints before and after copying, retrying up to three times if notes change. Neither theme copying nor note copying with fingerprint checks is an atomic filesystem snapshot; schedule after editing and synchronization where possible.
3. Point only the temporary copy's notes configuration at its `.notes` snapshot. The original notes and `notesDir` configuration are never written. Relative and absolute source directories use the same flow.
4. Run Astro check, static build, and attachment handling. Before building, select `public/` with the same rules as site exports: theme-local root and nested `.gitignore` files, including `!` exceptions, with case-sensitive matching independent of Git tracking. Personal Git excludes do not participate, and rule files themselves are not copied. The mounted theme needs no `.git` directory. Rebuild the image to install this publisher-tool update.
5. Require an index page and reject Markdown source, note configuration, symlinks, and special files in the site. Check Workers Free limits of 20,000 files and 25 MiB per file.
6. Only after successful checks, upload the inspected site with Wrangler. Missing credentials, failed checks, or failed builds prevent upload.
7. Record the result, remove work files, and release the lock. Deployment failure returns a nonzero exit code and preserves the last successful record.

A hard interruption can leave work files or a lock. The next lock holder removes this program's abandoned `run-*` directories. The lock heartbeat runs every ten seconds; a crashed owner's lock can be reclaimed after about thirty seconds. Normal container shutdown waits for its job, with a two-minute Compose grace period before Docker may force termination.

## Logs and state

The NAS `publisher-data/` directory is mounted at `/data`:

- `logs/`: job and Wrangler logs, retaining roughly the latest thirty files. Job output also appears in Container Manager.
- `status.json`: latest `published`, `dry-run`, `built`, or `failed` result.
- `last-success.json`: last successful real deployment, unchanged by failures and dry runs.
- `site/`: latest inspected candidate, which may not be live and is not an archive of past successful deployments.
- `runs/`: temporary build workspaces, removed on completion.

With Node.js 24 locally, edit the theme's `wrangler.json`, set the required deployment environment variables, and use `npm run deploy:build`, `npm run deploy:dry-run`, or `npm run deploy`. Without `THEME_DIR`, local publishing reads the tool project's root; set it to build a separate theme directory. Local state defaults to the tool project's `.astro/publisher/`. `PUBLISHER_DATA_DIR` controls writable work data only; the container sets it to `/data`. It never overrides the notes directory.

If upload fails after a successful dry run, check account scope, Workers permissions, and route permissions. When a network interruption leaves the result uncertain, consult Cloudflare deployment history. Check `wrangler.json` routes, the workers.dev switch, and Access settings if the site is inaccessible.

References: [Cloudflare Astro deployment](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/), [Static Assets limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets), [Supercronic](https://github.com/aptible/supercronic).
