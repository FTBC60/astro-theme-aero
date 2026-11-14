# Astro Theme Aero

**Documentation language:** [简体中文](../zh-CN/README.md) · English

An Astro static blog theme based on [hexo-theme-aero](https://github.com/5h1nnN/hexo-theme-aero). It retains the Aero glass panels, a two-column desktop layout, and a mobile sidebar. It includes posts, archives, tags, customizable theme colors, and a music player.

## Download the theme package

Open [GitHub Releases](https://github.com/FTBC60/astro-theme-aero/releases/latest) and download `astro-theme-aero-v1.3.0-theme.tar.gz` (use the matching version for later releases). This author package contains configurable theme source, default assets, examples, and usage guides. GitHub’s automatic “Source code” archives are full repository snapshots with developer materials; select the asset ending in `-theme.tar.gz`. Extract it, enter `astro-theme-aero/`, then follow the installation steps below. Use `SHA256SUMS.txt` from the same Release to verify download integrity.

## Quick start

Node.js 22.22 or later is recommended to satisfy the current locked dependencies. In the theme directory, run:

```bash
npm ci
npm run dev
```

Then set up your site:

1. Edit `src/config/site.config.ts` to choose the interface language (`zh-CN` or `en`) and set the site title, author, signature, avatar, navigation, and posts per page.
2. Edit `src/config/theme.config.ts` to choose the default color scheme, wallpaper, and wallpaper position.
3. Configure the player in `src/config/music.config.ts` and edit tracks in `public/audio/playlist.json`. Set `enabled: false` if you do not want a player.
4. Set the notes directory in `src/config/content.config.ts` (default: `./src/content/posts`) and place Markdown posts with `publish: true` there and edit `src/content/pages/about.md`. The included `welcome.md` is a preview post you can remove. Copyable post templates are available in [English](../../examples/posts/en/) and [Chinese](../../examples/posts/zh-CN/); an [English About page template](../../examples/pages/en/about.md) is also included.

See the [configuration guide](CONFIGURATION.md) for every field, asset paths, post frontmatter, and release checks. Choosing `lang: 'en'` changes the theme interface; it does not translate your posts, About page, signature, or track names.

## Writing with Obsidian

For the colocated diary layout, configure **Settings → Files and links**:

| Setting | Value |
| --- | --- |
| Use Wikilinks | Off |
| New link format | Relative path to file |
| Default location for new attachments | Same folder as current file |
| Automatically update internal links | On (recommended, to update references after renaming) |

Use `![Photo](./photo.png)` for images and `[Attachment](./document.pdf)` for PDFs. The theme does not resolve `![[photo.png]]`, note embeds, or Obsidian block references. These settings affect newly generated links; convert existing Wikilinks manually.

Body text retains standard Markdown line handling. The theme does not turn every single newline into a hard break:

| Ordinary paragraph text | HTML and browser display |
| --- | --- |
| One newline | A soft break, usually retained in HTML text and collapsed to a space by the browser |
| Two newlines, leaving a blank line | Separate `<p>` paragraphs with paragraph spacing |
| A backslash or two ordinary spaces at the end of a line, followed by a newline | A hard break within the paragraph, rendered as `<br>` |

For example, this produces a hard break inside one paragraph:

```md
First line\
Second line
```

A blank line starts another paragraph rather than inserting `<br>`. Obsidian display settings may make soft breaks visible without changing this site's compilation rules. See CommonMark's [soft breaks](https://spec.commonmark.org/0.31.2/#soft-line-breaks) and [hard breaks](https://spec.commonmark.org/0.31.2/#hard-line-breaks).

Click the type icon beside a property name and assign these types. Types are shared by property name throughout the Vault; check desktop and mobile settings separately.

| Property | Type |
| --- | --- |
| `title` | Text |
| `slug` | Text |
| `date` | Date |
| `publish` | Checkbox |

YAML Core parsing keeps `title: 2026-11-01` and `slug: 2026-11-01` as the same strings as their quoted forms. Only `date` and `updated` undergo date validation. Obsidian can reformat quotes or turn `tags: [Diary]` into a block list without changing post titles, URLs, or tags. Numeric, boolean, array, or object titles/slugs are rejected. Keep template variables quoted; generated date-shaped text does not require manual quote restoration.

For automatic daily notes, copy the [daily template](../../examples/obsidian/日记模板.md) to `templates/日记模板.md` in your Vault. Enable the core Daily notes plugin, set **Date format** to `YYYY-MM-DD/YYYY-MM-DD`, leave **New file location** empty, and select that file as **Template file location**. Use **Open today's daily note** to create a path such as `2026-11-01/2026-11-01.md`; an existing daily note is opened instead.

The template and new notes default to `publish: false`. Enable `publish` on a completed diary entry and keep the template itself unpublished. With Remotely Save, NAS files must remain readable original Markdown and attachments, and the actual sync directory must match the Publisher notes mount. Confirm successful sync and the NAS files before the next publication.

Setting references: [Obsidian files and links](https://obsidian.md/help/settings), [property types](https://obsidian.md/help/properties), and [daily notes](https://obsidian.md/help/plugins/daily-notes).

## Check and build

```bash
npm run check
npm run build
npm run preview
```

The generated static site is written to `dist/`.

## Scheduled publishing on Synology

Run a persistent publisher in Container Manager with cron, timezone, Cloudflare credentials, and a read-only notes mount configured in Compose. See the [deployment guide](DEPLOYMENT.md) for setup, dry runs, logs, and troubleshooting.

## Export release archives

Run `npm run export` in the theme root. It checks and builds the project, then writes two `.tar.gz` files to `release/` with the package version and short Git commit hash in their names. Uncommitted changes add `-dirty`:

- `*-theme.tar.gz` contains theme source, default assets, Chinese/English usage guides, author examples, production build/publishing tools, project configuration, README, and license. Tests, acceptance materials, and developer maintenance documents are excluded; the archived `package.json` has no test or prototype commands. Extract it, enter `astro-theme-aero/`, and run `npm ci`.
- `*-site.tar.gz` contains the built site for the current settings and posts. Extract its contents directly into the document root of a static host; it has no outer `dist/` directory.

The source archive enumerates tracked files and unignored new files only within the author-delivery allowlist. Uncommitted posts and assets can be included, and a tracked file can still be included after an ignore rule is added; review source contents before sharing. Dependencies, caches, build output, release archives, Git history, and local handoff notes are outside the source delivery scope. Export requires Git, Node.js, npm, and `tar`. The `release/` directory is ignored by Git.

Site exports and Publisher select `public/` resources before building, using the theme's root and nested `.gitignore` files, including `!` exceptions. Matching is case-sensitive and independent of Git tracking. Global Git excludes and `.git/info/exclude` do not participate. Rule files are read but not published. A file cannot be restored with `!` while its parent directory remains excluded; restore the parent first.

Export copies selected resources into a temporary directory, checks and builds, and archives that output. Original public files, notes settings, and existing `dist/` are preserved; temporary export files are cleaned up. Regular `dev` / `build` use the original inputs; use site archives or Publisher for delivery.

Source archives omit test and prototype commands from `package.json`. Build the Publisher image from the same checkout or source archive used for the theme so its package files match the toolchain.

## Features

- Configurable notes directory, colocated attachments, Markdown posts, drafts, archives, and tags; archives show a tag panel above all posts grouped by year without pagination. Home and tag pages default to 10 posts per page.
- Chinese and English interfaces, plus Classic Blue, Emerald Green, and Violet color schemes. Visitors can choose a color scheme in the sidebar without changing the wallpaper.
- A music player with a fetched static JSON playlist, manual refresh and retry, progress control, and sequential, playlist loop, and single-track loop modes. Playback state persists during navigation within the site.
- Sidebar behavior that accommodates page scrolling and the footer on desktop, with an expandable sidebar on mobile.
- Internal navigation uses a 500ms whole-page crossfade with `ease-in-out`. Browsers without native view transitions use a 250ms fade-out followed by a 250ms fade-in, keeping the wallpaper visible. Links and browser history use Astro navigation while music continues playing; reduced-motion preferences disable the transition animations.

## Credits and license

This theme is ported from ShinN's [hexo-theme-aero](https://github.com/5h1nnN/hexo-theme-aero). The repository retains the upstream [MIT license](../../LICENSE). Some control styles were inspired by [7.css](https://github.com/khang-nd/7.css). Before publishing your own site, check the permitted uses of the images, icons, and audio you include, and replace assets where needed.
