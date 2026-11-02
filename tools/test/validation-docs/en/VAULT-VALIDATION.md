# Complete Vault and attachment acceptance

This phase keeps the layout from [ADR 0007](../../../../docs/adr/0007-notes-directory-and-attachments.md) and the publication gate from [ADR 0011](../../../../docs/adr/0011-publication-before-validation.md). It uses the existing Loader, attachment plan, and Publisher without another attachment-directory setting.

## Synthetic fixture and expected paths

[tools/test/vault/Notes](../../vault/Notes/) contains synthetic content only and is outside the default content directory:

```text
Notes/
├── 2026-10-28/
│   ├── 2026-10-28.md          # publish: true; slug: 2026-10-28
│   ├── 照片 早晨.svg
│   ├── 行程 说明.pdf
│   └── 未引用.txt
├── 旅行记录/2026-10-29/
│   ├── 2026-10-29.md          # publish: True; no slug
│   └── 附件/路线 图.svg
├── 共享资料/共用 图.svg         # referenced by both posts
├── 私人笔记.md                 # no frontmatter
├── 草稿/                      # string publish flag; private attachment
├── 模板/日记模板.md             # unpublished; placeholder date
└── .obsidian/                 # hidden settings and hidden note
```

Keep standard relative links: `![Morning](../../../../docs/en/照片%20早晨.svg)` and `[PDF](../../../../docs/en/行程%20说明.pdf#page=1)`. Shared images use `../共享资料/共用%20图.svg`, or `../../共享资料/共用%20图.svg` from the deeper note. No attachment relocation is required.

| Source / setting | Expected candidate path, relative to `site/` |
| --- | --- |
| First note, explicit `slug: "2026-10-28"` | `posts/2026-10-28/index.html` |
| First note's local image and PDF | `posts/2026-10-28/照片 早晨.svg` and `posts/2026-10-28/行程 说明.pdf` |
| First note's shared image copy | `posts/2026-10-28/_attachments/共享资料/共用 图.svg` |
| Second note, no slug | `posts/旅行记录/2026-10-29/2026-10-29/index.html` |
| Second note's local image | `posts/旅行记录/2026-10-29/2026-10-29/附件/路线 图.svg` |
| Second note's shared image copy | `posts/旅行记录/2026-10-29/2026-10-29/_attachments/共享资料/共用 图.svg` |
| Private/template/hidden content, source Markdown, unused attachments | Absent from the candidate site |

Default IDs retain the complete path relative to `notesDir`, remove `.md`, and slug each segment. Matching folder and note names are not collapsed. Continue using an explicit slug for a single date segment. URLs encode each segment; output filenames retain Unicode and spaces. Shared files have per-article copies, so withdrawing one article leaves the copy referenced by another article intact.

## Local automated acceptance

With the project's supported Node.js 24, run:

```sh
npm run test:content
```

To run just this phase's complete Vault case:

```sh
node --test --test-name-pattern="complete Vault" tools/test/publication.test.mjs
```

The case copies the fixture to a temporary directory and configures a separate theme to read that external Vault. It runs real Publisher staging, Astro checking, static builds, and site inspection with a `/diary/` deployment prefix. It uses `build-only` and never invokes Wrangler. Each run fingerprints both inputs to detect source writes, compares attachment bytes and output inventories, and resolves actual generated HTML links to built files.

Four runs cover:

To test unique-tag withdrawal, the automated case adds a first-post-only tag to the temporary Vault. For manual acceptance, also add a test tag used only by the first post. The copyable fixture keeps its simple diary tag.

1. Only the two published notes become pages. Local images/PDFs, nested notes, Unicode/spaces, reference images, covers, and note links resolve to outputs; archives remain newest first.
2. Editing only the shared image refreshes both output copies without editing Markdown.
3. Replacing the first note's metadata with only `publish: false` removes its page, local image/PDF, shared copy, and unique tag. The second article and its shared copy remain; home, archives, and the common tag listing omit the withdrawn post.
4. Deleting the last published note removes remaining articles, tags, and attachment copies without falling back to bundled sample posts.

The last run has an empty collection, so Astro emits empty-`blog` collection notices. The build still succeeds with home, archives, and About pages.

## NAS and live acceptance

Copy `Notes/` to a separate test directory. Reuse the validated publisher image and Compose configuration in an isolated test project with separate work data. With the default `notesDir: './src/content/blog'`, keep the read-only notes target `/theme/src/content/blog` but point its host source to the test Vault. Give `/data` a separate directory and retain the read-only theme mount. Run the test project manually with:

```sh
docker compose run --rm publisher once --build-only
```

Check `site/` in the test data directory against the table. Apply the four fixture edits and repeat. The status is `built`; this mode neither updates `last-success.json` nor changes the live site.

For live acceptance, select a test Worker and its entry points in the test project's external `wrangler.json`, use the validated Access configuration, then run:

```sh
docker compose run --rm publisher once --dry-run
docker compose run --rm publisher once
```

Using the site's normal authenticated entry, open both articles, the local image/PDF, shared images, and nested image. Repeat attachment changes and withdrawal, waiting for each deployment to succeed. The withdrawn article and its exclusive attachment URLs should return 404 while the second article and its shared copy remain available. Delete the second article and publish successfully; its old URLs and attachment copies should also return 404.

Record `status.json`, the real deployment's `last-success.json`, Cloudflare version ID, checked URLs, and HTTP statuses for each run. `site/` is the latest inspected candidate and alone does not prove live withdrawal. This phase does not change snapshot or synchronization-completion rules; mobile-to-NAS consistency requires separate acceptance.
