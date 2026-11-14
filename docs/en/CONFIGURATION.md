# Aero Configuration Guide

**Documentation language:** [简体中文](../zh-CN/CONFIGURATION.md) · English

This guide is for authors using Aero to build a blog. The four main configuration files are in `src/config/`. Posts default to `src/content/posts/`, with an optional external notes directory, and the About page is `src/content/pages/about.md`.

## Prepare the site and assets

Node.js 22.22 or later is recommended to satisfy the current locked dependencies. Run `npm ci` and `npm run dev` in the theme directory, then open the local address shown in the terminal.

For a file in `public/`, use a path that starts with `/` **without `public`**. For example, write `public/image/avatar.jpg` as `/image/avatar.jpg` and `public/audio/song.mp3` as `/audio/song.mp3`. Image and audio fields also accept full HTTPS URLs. Local paths in configuration are adjusted for the site's `base` prefix. The avatar, wallpaper, and music covers have separate settings; changing one does not change the others.

| Asset | Included file or directory | Setting |
| --- | --- | --- |
| Avatar | `public/image/avatar.jpg` | `avatar` in `site.config.ts` |
| Favicon | `public/image/icon/vista_pc_1.jpg` | `favicon` in `site.config.ts` |
| Wallpaper | `public/image/wallpaper.jpg` | `wallpaper` in `theme.config.ts` |
| Default music cover | `public/image/music-cover.svg` | `defaultCover` in `music.config.ts` |
| Audio files | `public/audio/` | `src` in `public/audio/playlist.json` |

## Site information: `src/config/site.config.ts`

Edit the exported `siteConfig` object. `Author` and the included welcome post are placeholders for your own content.

| Field | Type and current value | What it controls |
| --- | --- | --- |
| `title` | String, `Aero Blog` | Site name and suffix of page titles. |
| `subtitle` | String, `Hello, World!` | Short line in the header; an empty string hides its text. |
| `author` | String, `Author` | Author name in the sidebar and footer. |
| `lang` | `zh-CN` or `en`; currently `zh-CN` | Site-wide interface language and HTML language attribute. |
| `signature` | Array of strings | Profile signature; each array item appears on a separate line. |
| `avatar` | Path or HTTPS URL | Author avatar image. |
| `avatarLink` | Path or HTTPS URL; currently `/about/` | Destination when a visitor clicks the avatar. |
| `favicon` | Path or HTTPS URL | Browser tab icon. |
| `postsPerPage` | Positive integer, `10` | Number of posts per page on home and tag lists; archives are not paginated. |
| `navigation` | Array of navigation items | Header buttons, in array order. |

Set `lang: 'en'` for English buttons, panels, pagination, and accessibility messages. Posts, the About page, the signature, and track names are author content and are **not translated automatically**.

Each `navigation` item has a `label` (button text), an `icon` (path or HTTPS URL), and an optional `href` (destination). A label may be one string for both languages or an object with both `zh-CN` and `en` values. Use a path starting with `/` for internal links, such as `/archives/`, or a full HTTPS URL for external links. Update navigation when you add or remove pages.

```ts
navigation: [
  { label: { 'zh-CN': '首页', en: 'Home' }, href: '/', icon: '/image/icon/vista_messenger.jpg' },
  { label: { 'zh-CN': '归档', en: 'Archives' }, href: '/archives/', icon: '/image/icon/vista_book_1.jpg' },
  { label: { 'zh-CN': '关于', en: 'About' }, href: '/about/', icon: '/image/icon/vista_pc_1.jpg' },
],
```

`postsPerPage` must be an integer greater than zero. Posts are ordered by `date`, newest first. This setting affects pagination on the home and tag pages. The archive page shows tags from all published posts at the top, followed by all published posts grouped by year, without pagination. The top tag panel is omitted when there are no tags. Old `/archives/page/<number>/` routes are no longer generated.

## Appearance: `src/config/theme.config.ts`

| Field | Current value | What it controls |
| --- | --- | --- |
| `defaultColor` | `#3C7FB1` | Default primary color for new visitors. Use six-digit HEX, such as `#437F68`. Either letter case is accepted. |
| `wallpaper` | `/image/wallpaper.jpg` | Background image path or full HTTPS URL. |
| `wallpaperPosition` | `center center` | Wallpaper focus using CSS `background-position` syntax, such as `70% center`. |

The theme derives glass, highlight, surface, and player colors from one primary color. Link text is corrected against the reading surface with a contrast target of 4.5:1. Use six-digit HEX when changing the SCSS `--white-main` token. Player titles use fixed white text with a text shadow.

| Recommended color | HEX |
| --- | --- |
| Classic Blue | `#3C7FB1` |
| Emerald Green | `#437F68` |
| Violet | `#73619B` |

The sidebar palette starts collapsed. Its button opens a Windows 7 Paint-style palette inside the sidebar, with 20 basic colors and 10 custom slots. Both round buttons measure 40×40, with 24×24 icons.

- Choosing a basic color applies it immediately. “Color 1” previews the current primary color.
- The initial edit target is the first empty slot, or slot 1 when all slots are filled. A blue inner outline marks the edit target. An orange border marks the applied color.
- Choosing a filled slot applies its color and selects it for editing. Choosing an empty slot selects it and opens the native color picker. “Edit colors” writes the result to the selected slot. Subsequent edits continue to update that slot.
- “Clear slot” empties the selected slot and returns focus to it. The button is disabled for an empty slot.
- The outer red “×” restores the author's default primary color. The slot list and current primary color are saved separately.

Visitor choices take precedence over the author's default. The browser saves the color and slots. If storage fails, the current page and client-side navigation use in-memory state. Reloading initializes from readable storage or the author's default. Set the wallpaper image through `wallpaper`.

## Music player

`src/config/music.config.ts` controls the player settings; `public/audio/playlist.json` contains the tracks.

| Setting | Type and current value | What it controls |
| --- | --- | --- |
| `enabled` | Boolean, `true` | Set to `false` to remove the player and skip the playlist request. |
| `defaultCover` | Path or HTTPS URL | Cover used when a track has no `cover`. |
| `defaultPlaybackMode` | `list-loop` | Playback mode when the page first loads. |

The playlist is a JSON array. Tracks appear and play in array order; the first is selected without autoplay:

```json
[
  { "title": "First Song", "artist": "Artist", "src": "/audio/song.mp3", "cover": "/image/song-cover.jpg" },
  { "title": "Second Song", "src": "/audio/another-song.mp3" }
]
```

`title` and `src` are required and must not be empty. `artist` and `cover` are optional strings; a missing or empty cover uses `defaultCover`. Audio and covers support local paths or full HTTPS URLs. `/audio/song.mp3` automatically receives the deployment base (such as `/blog/`), so do not add that prefix yourself. Relative paths such as `song.mp3` resolve from the playlist directory, independently of the current article URL.

The browser fetches `/audio/playlist.json` when the site opens, respecting the deployment base. Use **Refresh playlist** in the playlist panel to read the deployed file again. There is no polling or additional playlist request during internal navigation. Failed requests, timeouts, or invalid JSON show a retry button and preserve the last working playlist and playback state. Refreshing retains playback progress when the current audio URL remains in the list; removing that track or clearing the list stops playback. An empty array (`[]`) leaves a visible but unplayable player; use `enabled: false` to remove it.

After editing `public/audio/playlist.json` or music files locally, deploy the updated static files to your host. Local edits alone do not update the website. The normal workflow remains `npm run build` followed by deployment of `dist/`. Reading the playlist does not require recompiling the theme, but this project does not yet provide a separate playlist deployment command.

The modes are `sequential` (stop after the last track), `list-loop` (start again from the first track), and `single-loop` (repeat the current track). Change modes in the playlist panel. A visitor starts initial playback. Playback persists during internal navigation, and a full reload initializes a new session. Audio format support depends on the browser.

Audio downloads completely into a temporary Blob before playback. Once the current track actually plays, the player prefetches the next track, holding the current track and at most one candidate. Selecting a different track immediately stops the old audio, releases its Blob, and reuses a valid candidate or starts downloading the target. Rapid selection cancels obsolete tasks and applies the latest choice. Selecting the current ready track or resuming after a pause reuses its resource and position. Initial playback, natural transitions and manual retries execute immediately. Blob references belong to the persistent player session and are released on replacement and disposal.

While loading, the cover displays an Aero spinner and playback progress stays at zero. When ready, the cover fades in over about 200ms and the latest play or pause intent applies. If Safari requires another interaction, press play to use the loaded resource. Failed loading displays “Loading failed”. Open the playlist to read the reason at the bottom and select “Reload” to retry. Returning to the foreground continues valid tasks, and failed tasks remain available for manual retry.

External HTTPS audio servers must allow CORS so the browser can read the complete response. Cross-origin access, network reading and decoding failures display a loading error. The Blob retains the response MIME type.

Browsers supporting Media Session can route system media controls to play, pause, previous track, next track and seeking. Media information follows the actual loaded track, and track changes share the immediate selection entry point with the page controls. Available actions follow browser capabilities.

On touch screens, drag from a track's text to scroll. Dragging and cancelled gestures do not select a track or close the playlist. Touching a track during momentum scrolling in the list or sidebar does not start playback; once scrolling stops, a separate tap plays the track. Mouse clicks, keyboard activation, native scrolling, and pinch zoom remain available.

## Notes directory: `src/config/content.config.ts`

`notesDir` is the only setting for the notes directory and defaults to `./src/content/posts`. Relative paths resolve from the theme root, independently of the shell working directory. Absolute paths such as `/vault/Notes` are also supported. A missing, unreadable, or non-directory path fails checks and builds instead of falling back to demo posts.

```ts
export const contentConfig = {
  notesDir: './src/content/posts',
};
```

The loader recursively reads `.md` files, skips hidden files and directories, and does not follow directory symlinks. After parsing frontmatter, it filters publication eligibility before generating IDs, checking duplicates, validating article metadata, or compiling Markdown and attachments. Only a top-level lowercase `publish` with boolean value `true` qualifies. Plain or unpublished private notes need no `title/date`, do not enter the collection, and cannot cause article ID conflicts; their missing images do not affect published articles. Changing directories, deleting notes, or withdrawing publication clears old entries on the next sync. During `npm run dev`, note and attachment changes trigger content sync.

Malformed frontmatter fails the current check/build with the note's path, even if the note was intended to be private. An opening `---` or `+++` without a closing delimiter is also incomplete frontmatter. Failed jobs do not publish a new site; withdrawal takes effect after the next successful build and deployment.

The theme does not write into the notes directory. Attachment manifests and caches use Astro's cache directory, and output goes into `dist/`, allowing a read-only notes mount. The publisher mounts the theme read-only at `/theme`; with the default setting, mount NAS notes at `/theme/src/content/posts:ro`. `/app` contains only tools and dependencies. See the [deployment guide](DEPLOYMENT.md) for scheduled builds and deployment.

External notes are not automatically included in the theme source archive. Provide them separately and adjust `notesDir` when moving to another environment.

## Write posts

Place `.md` files in `notesDir` (default: `src/content/posts/`). The included `welcome.md` is a preview post that you can edit or remove. [English templates](../../examples/posts/en/) and [Chinese templates](../../examples/posts/zh-CN/) are outside the content directory and are published only after you copy them into it and set `publish: true`. By default, the filename determines the post URL: `hello.md` becomes `/posts/hello/`.

Publication uses a strict comparison of the parsed value: `publish: true`, `publish: True`, and `publish: TRUE` all qualify; the field name must be lowercase `publish`. Quoted strings (`"true"`, `"True"`, `"TRUE"`), `1`, `yes`, absent flags, and boolean false values are skipped before article validation. The old `draft` field no longer controls publication: add `publish: true` to posts that previously used `draft: false` or had no flag. Published articles still require valid `title/date`. To keep a post unpublished, use `publish: false` or omit the field. This rule applies to blog posts; the About page is built independently.

Post frontmatter supports these fields:

| Field | Requirement | What it controls |
| --- | --- | --- |
| `title` | Required, non-empty string | Post title. |
| `date` | Required date | Publication date used for ordering, cards, and archives. Quoted `YYYY-MM-DD` is recommended. |
| `updated` | Optional date | Shown only on the post page when later than `date`; does not affect ordering. |
| `description` | Optional string | Page description; also used as the list excerpt if `excerpt` is absent. |
| `excerpt` | Optional string | Summary on the home page and other post lists; falls back to `description`, then body text. |
| `cover` | Optional path or HTTPS URL | Cover image on post lists. Accepts a path relative to the Markdown file, a site-root path, or an HTTPS URL. Omitted means no cover. |
| `tags` | Optional array of strings | Post tags; defaults to an empty array. |
| `publish` | Optional boolean, default `false` | Only explicit `true` generates a post page and includes it in lists, archives, and tag counts. Omitted or `false` means unpublished. |
| `slug` | Optional string | Overrides the post ID and URL derived from its filename. |

```md
---
title: A Complete Example Post
date: "2026-01-01"
updated: "2026-01-02"
description: Page description
excerpt: Summary for post lists
cover: /image/wallpaper.jpg
tags: [Aero, Writing]
publish: true
---

Start writing here.
```

Note frontmatter uses YAML 1.2 Core without implicit timestamps. Date-shaped `title` and `slug` values remain strings whether quoted or bare, such as `title: 2026-10-29`; only `date` and `updated` undergo schema date conversion/validation. Obsidian may reformat tag arrays as block lists or remove ordinary description/excerpt quotes without changing their values. The strict boolean publication gate is retained. Numeric, boolean, array, object, or null slugs are rejected before ID generation; omit `slug` or use an empty string to retain the relative-path fallback. Invalid title types still fail the collection schema. This compatibility applies to the note entry point; Astro handles the About page independently.

Each segment of a post ID is URL-encoded separately, preserving `/` between nested directories. This supports links with Chinese post names and also applies to `slug` overrides. Avoid `#`, `?`, and `%` in custom slugs because of static routing limitations in the current Astro version; use letters, numbers, spaces, or hyphens instead.

Spaces and punctuation in tag names become hyphens in tag URLs; English tags are case-insensitive. If two different tag names produce the same URL, the build fails so you can rename one of them. Post bodies support regular Markdown, code blocks, tables, and blockquotes. The About page is `src/content/pages/about.md`. It does not use post frontmatter; edit its body and the `title` and `description` at the top. You can start with the [English template](../../examples/pages/en/about.md) or [Chinese template](../../examples/pages/zh-CN/about.md).

For public images in fixed Markdown pages, prefer `/image/example.png`; page-relative URLs also work. Compilation converts Markdown images, image references, and raw `<img src="…">` into stable URLs including the deployment base, so client navigation cannot resolve them against the previous page. HTTPS, protocol-relative and `data:` URLs are unchanged. Images found relative to the Markdown source still use Astro's image pipeline. Blog attachment selection and copying are unchanged.

Touch or mouse opening focuses the mobile sidebar container; keyboard or assistive activation focuses its first control. Tab / Shift+Tab cycle through visible controls. Escape or mask closing returns focus to the menu button. Controls retain visible keyboard focus.

Blog notes continue to reference same-directory or shared attachments with relative source paths. Published body-image URLs include the deployment base and post path, so entering or returning to an article cannot resolve an image against the previous page. Attachment selection, output locations and withdrawal cleanup are unchanged.

### Attachments alongside notes

A directory per diary entry keeps notes and attachments together. Copy the complete [attachment example directory](../../examples/posts/en/attachments/) into your notes directory:

```text
notesDir/
└── 2026-01-01/
    ├── 2026-01-01.md
    └── photo.svg
```

```md
---
title: "2026-01-01"
date: "2026-01-01"
publish: true
slug: "2026-01-01"
cover: ./photo.svg
---

![Photo](./photo.svg)
```

The explicit `slug` avoids repeating the directory and filename in the post URL. The build produces `dist/posts/2026-01-01/index.html` and `photo.svg` beside it. The body uses `./photo.svg`; cover images on lists use the post attachment URL with the deployment base.

Only attachments referenced by published posts through standard Markdown images, links, or `cover` are copied. The entire notes directory and original Markdown files are not uploaded. Reference-style images and links are supported, such as `![Photo][photo]` with `[photo]: ./photo.svg`. Local images retain their original bytes and filenames without Astro image optimization.

- Files within the note's directory retain subdirectories, such as `./images/photo.jpg` and `./docs/report.pdf`.
- Shared attachments such as `../shared/photo.jpg` must remain inside `notesDir`. They are placed under the current post's `_attachments/` directory, retaining their path relative to the notes root.
- Relative `.md` links become URLs of the target published post, preserving query strings and fragments. Links to unpublished notes fail the build. Markdown files are never copied as download attachments.
- Paths starting with `/` still refer to site `public/` resources and receive the deployment base. External URLs remain unchanged.
- Chinese names and spaces are URL-encoded. Encode literal `#` and `%` in filenames as `%23` and `%25` in Markdown links.
- Missing files, paths outside the notes root (including symlink escapes), duplicate post IDs, and conflicting output paths fail checks or builds. Attachments cannot overwrite article `index.html` files, other generated pages, or public assets.

In Obsidian, use attachments in the same folder as the note, paths relative to the current file, and standard Markdown links. Wikilinks (`![[file]]`), note embeds, and local attachment paths in raw HTML are outside this feature's scope.

When customizing Markdown in `astro.config.mjs`, keep `remarkNoteAssets` and the paired `noteAssets(contentConfig)` integration. Missing paired processing raises `Incomplete note compilation`, even for posts without attachments; fix the configuration and rerun checks and builds. Corrupt attachment caches or plans for a different notes directory or deployment base also fail explicitly. Rerun content sync or build to generate a new plan.

### Embedded HTML tools

Place an author-reviewed, self-contained `.html` file beside the post and use the reserved lowercase `iframe:` image marker:

```md
![iframe: Addition calculator](./calculator.html)
```

Reference-style images work too:

```md
![iframe: Addition calculator][calculator]

[calculator]: ./calculator.html
```

Copy the complete [tool example directory](../../examples/posts/en/tools/). Its posts default to `publish: false`; review the files before publishing. Without a manifest, the existing single-HTML behavior remains: styles, scripts and fixed data must be self-contained. Merely placing files in the Vault does not publish them.

For a multi-file tool, reference `index.html` and place `manifest.json` in the same directory. See the [timestamp package example](../../examples/posts/en/tools/timestamp.md):

```md
![iframe: Timestamp converter](./timestamp/index.html)
```

```json
{
  "version": 1,
  "download": true,
  "files": ["index.html", "app.js", "style.css"]
}
```

Iframe references and ordinary Markdown links to a local `index.html` use the same manifest validation. The theme looks for `manifest.json` beside the entry. Fields `version` and `files` are required, `download` is an optional boolean, and unknown fields are rejected. List specific existing files with exact path case and include `index.html`. Globs, directory expansion, absolute paths, dot/parent segments, backslashes, drive prefixes, control characters and `%`, `?`, `#` are rejected. Paths are unencoded relative filenames. Symlinks in the package root or file paths are unsupported. Markdown, MDX and Astro source cannot be package assets.

The entry-directory `manifest.json` is the reserved control file and cannot list itself in `files`. Direct attachment references to a `manifest.json` beside `index.html` are rejected. Nested resources such as `data/manifest.json` may be explicitly listed in `files`. A same-named JSON file in another directory without an adjacent `index.html` is treated as an ordinary attachment.

With a manifest, the entry must be named exactly `index.html`. Invalid JSON, unsupported formats, missing files and invalid paths fail checks/builds instead of falling back to single-file behavior. Standard `JSON.parse` semantics apply (the final duplicate JSON key wins); duplicate entries in the files array are rejected. All assets use the entry's output directory and retain their relative layout. Shared packages retain separate per-post copies. Updates, removed entries and withdrawal take effect after the next successful build/deployment.

Use paths such as `./app.js` and `./style.css` inside the tool. The index entry supports canonical directory URLs. Development also serves directory aliases for registered package entries, with JS/MJS, CSS, JSON and WASM MIME types. The control manifest is retained in build inputs and download archives. Content sync writes the current attachment-plan format while author manifests use `version: 1`.

Astro 7 development additionally checks cross-origin subresource requests from opaque frames. This integration serves only exact planned static files under registered package entries before that check. Other source paths retain the existing protection. No CORS permission is added; fetch/WASM still require separate browser compatibility checks.

The theme does not scan HTML/JS/WASM dependencies, install libraries, compile tools or run their business tests. A manifest guarantees delivery of its selected files, not runtime completeness. Test tools independently and carry dependencies locally. Classic scripts, fetch, modules and WASM have different loading requirements in the existing sandbox; multiple files do not automatically remove CORS or storage restrictions.

Iframe titles must be nonempty and targets must be local `.html` files relative to the current Markdown file. Extension case is preserved and checked without case sensitivity. Iframe references reject remote/site-absolute URLs, queries and fragments. Encode a literal filename `#` as `%23`. Literal `%` characters in iframe or package output paths require renaming the file or folder. Normal URL encoding remains supported. Shared `../` tools must stay inside `notesDir` and use the existing per-post `_attachments/` copies. Invalid, missing, escaping or conflicting targets fail checks/builds.

The compiler generates a stable iframe URL containing the deployment base and post ID, such as `/blog/posts/tool-example/calculator.html`. Keep relative paths in source Markdown. The iframe fills the article width and has a 480px height with internal scrolling; the tool author must support narrow layouts and keyboard operation. Tools do not persist after leaving an article. Automatic height, parent communication and execution inside Obsidian are not provided.

Frames always use `sandbox="allow-scripts allow-downloads"`, lazy loading and `referrerpolicy="no-referrer"`; HTML permission declarations are not read. Scripts and file exports are allowed, without same-origin, form submission, popup or top-navigation permissions. Tools should export from explicit buttons, although the download permission itself is not limited to user gestures or JSON. Import through a file chooser, without an upload service. Tools must validate file size/content and remain usable without persistent storage.

Publish reviewed tools only. Frame isolation does not automatically protect direct HTML visits, prevent all networking or limit computation. Local builds, exports and desktop operation are verified. A user reports that board swipes, scrolling outside the board within the tool, and parent-page scrolling work in iPhone Chrome. In the 2048 sample, gestures that start on the board control the game; start a drag in the instructions or another area outside the board to scroll the tool. Desktop Chrome touch emulation still has tap/internal-scroll failures. Other devices, mobile file round trips and the standalone Safari app are not fully verified; check the intended environment.

### Open an HTML tool independently

An article containing only ordinary links also publishes the complete selected package. Copy the [link-only example](../../examples/posts/en/tools/timestamp-linked.md).

```md
[Open the timestamp tool](./timestamp/index.html?mode=standalone#result)

[**Open the tool**][clock]

[clock]: ./timestamp/index.html?mode=reference#result "Timestamp converter"
```

Ordinary links retain queries, fragments, titles and inline formatting. Package detection uses the file path. Local HTML links copied into article attachments use `target="_blank"`, `rel="noopener"` and `data-astro-reload` for native navigation in a new tab. The tool runs as an independent document with its normal browser origin. The tool initiates any browser device authorization.

For ordinary links, only `index.html` triggers package detection. Other HTML files, single HTML files without manifests, ordinary images and covers retain single-attachment delivery. Site-absolute and remote links keep their existing URL handling. Iframe and ordinary references to the same package within an article share its published copy.

### Download tool files

| Tool | Setting | Download entry in the article |
| --- | --- | --- |
| Single HTML | No manifest required | Download the original HTML by default |
| Package | `download: true` | Download the ZIP generated during the build |
| Package | `download: false` or omitted | Download entry disabled |

Iframe downloads appear in a toolbar above the frame. Ordinary links receive an adjacent download link. The theme generates filenames and URLs. Single HTML downloads use the file path, while the original opening link retains its query and fragment.

A ZIP is placed beside its tool directory, for example `timestamp.zip` beside `timestamp/index.html`. Its root contains `index.html`, the selected files and an automatically included `manifest.json`. Subdirectories and original file bytes are preserved. The control manifest is added automatically. Repeated references in an article share the archive, and ZIP targets participate in page, attachment and public-file collision checks.

The next successful build updates archives after download settings, files, manifests, references or publication status change. Development reads selected files on each request and uses the same ZIP generator. The build dependency is delivered through package.json and the lockfile. Follow the deployment guide to rebuild the Publisher image when updating the theme.

`download: true` provides the distribution files selected by the manifest. Tool authors document local execution requirements. Include `README.txt` in `files` when a local HTTP server is required. Download labels follow the site language.

### Math formulas

Posts and the About page support LaTeX math. MathJax renders formulas during the build, so visitors do not need a MathJax script. Use `$...$` for inline math and a separate `$$...$$` block for display math:

```md
The Pythagorean theorem is $a^2+b^2=c^2$.

$$
E = mc^2
$$
```

Write a literal dollar sign as `\$`, and put code examples in backticks or fenced code blocks. Long display formulas can scroll horizontally within the article.

## Check before publishing

```bash
npm run check
npm run build
npm run preview
```

`npm run build` generates the static site in `dist/`. Use the preview command to inspect posts, images, tags, and music, then run `npm run export` and deploy the extracted `*-site.tar.gz` from `release/` to a static host. Export selects `public/` before building with theme-local root and nested `.gitignore` rules, including `!` exceptions, independently of Git tracking. Temporary inputs and output preserve your existing `dist/`; see [Export release archives](README.md#export-release-archives). If an image is missing, check that the file is in `public/` and that its configured path starts with `/` but omits `public`. If audio does not play, check its path and browser format support. If a post is missing, check that `publish: true` is explicitly set.
