# Navigation images and mobile sidebar repair — 2026-11-01

Branch: `static`. The repair commit also includes the author's `src/i18n/ui.ts` label changes (`Aero 音乐` → `音乐`, `Aero Music` → `Music`). The pre-existing `.gitignore` edits are excluded.

## Cause and change

Fixed Markdown pages emitted relative image URLs unchanged. Astro ClientRouter can resolve the incoming image against the previous page during its DOM/history swap. The real reproduction was `/posts/2026-11-01/` → `/about/`, producing `/posts/image/示例.png` (404), while a reload resolved `/image/示例.png` (200).

`src/integrations/page-images.mjs` adds a fixed-page remark pass using the resolved `srcDir` and deployment `base`. Markdown images and image references are normalized before Astro's image collection; raw HTML image `src` values are normalized without modifying comments, raw-text elements, or unrelated attributes. Existing source-image imports and external/data URLs are preserved. Blog-note image URLs are also made stable after attachment resolution; source references, attachment selection, copied files and withdrawal rules are unchanged. This scope covers `img[src]`; responsive `srcset` is not newly transformed.

The sidebar previously focused its first link (the avatar) for every opening. The user confirmed iPhone WebKit displayed its default `:focus-visible` outline. Pointer opening now focuses the `tabindex=-1` sidebar container; keyboard/assistive activation focuses its first visible control. Only the sidebar container's outline is suppressed. Tab/Shift+Tab includes entry from the container and wraps among visible controls; Escape and mask closing return menu focus. A visible keyboard outline is provided for the menu button.

## Verification

Use Node.js 24.22.1 (the project's container version).

- Before the change, fixed-page image regression failed on raw HTML, Markdown images and references.
- `node --test tools/test/page-images.test.mjs tools/test/content.test.mjs`: 14 passed, including actual builds with `/blog/` and development config changes.
- `node --test tools/test/playlist-panel.test.mjs tools/test/playlist-touch.test.mjs tools/test/playback-session.test.mjs`: 57 passed.
- `node --test tools/test/public-resources.test.mjs tools/test/release.test.mjs`: 7 passed, including source/site export and a Git-free Publisher build.
- `tools/test/publication.test.mjs`: 8 checks passed in the initial combined run, including actual mixed-Vault publishing, attachment edits, withdrawal and last-note removal. Two initial content-test failures were resolved: integration removal fixture matched the old single-integration configuration, and an explicit TS config import introduced during testing bypassed Vite's reload behavior. Final source retains its original extensionless config import; all final content tests passed.
- Final `node --test tools/test/content.test.mjs tools/test/page-images.test.mjs tools/test/publication.test.mjs`: 22 passed after adding stable article-image output. Final `astro check`: zero errors, warnings or hints.
- Root build and real `/blog/` build: successful.
- Chromium and WebKit root/subdirectory browser checks: article → About, back/forward, reload, pointer/keyboard focus, Tab wrapping, Escape and mask closing passed. Audio element identity was retained through client navigation.
- Real NAS candidate (2 published posts) passed the same browser regression and fresh WebKit touch sessions, including touch reopening after client navigation. Avatar remained unfocused and the neutral sidebar outline was `none`.

Browser regression command, after opening the site's homepage in an isolated session:

```sh
npx --yes --package @playwright/cli playwright-cli -s=aero-fix run-code --filename tools/test/navigation.browser.js
```

## NAS synchronization and publication

13 scoped repair/documentation/test files were synchronized. Existing files were first compared with the Git baseline, backed up under an ignored local backup directory, then verified byte-for-byte. The NAS About page and personal site/content/music/theme/Worker configuration hashes remained unchanged. The local sample About page uses a root-relative public image, while the personalized NAS About source continues working through compilation without content changes.

The candidate used an isolated local copy of the NAS theme and a Publisher snapshot of the actual NAS Vault. Build-only Publisher reported 38 files, 134118885 bytes; its notes digest matched the previous successful NAS note digest. All public page/media paths were retained; a previous Windows Thumbs.db file was omitted. No dependencies or runtime Publisher tooling changed; no container rebuild is required.

NAS operations and deployment use the existing shared Publisher lock. Compose credentials were read in memory and redacted from diagnostic output. The verified candidate was deployed using the unchanged private Worker configuration. The NAS scheduler will consume the synchronized theme on its next normal run. This one-time local publication's logs and deployment record are in ignored `.astro/navigation-nas*` files; they do not replace the NAS scheduler's own status history.

Online verification and deployment identity are recorded below. The user confirmed successful iPhone testing on 2026-11-01 after publication: the reported problems no longer occurred. This is user-reported hardware acceptance, separate from desktop WebKit emulation.

### Published verification

The private Worker URL and deployment version are omitted from this public record.

The deployed site passed the Chromium navigation/focus regression. Fresh mobile WebKit touch sessions passed on the deployed Worker: active element `sidebar`, avatar unfocused, container outline `none`, including touch opening after client navigation. A muted real-audio check confirmed closing the drawer and navigating to About retained the same playing audio instance, with currentTime progressing from 0.261335 to 0.703314 seconds.


Final browser regression explicitly waits for each destination URL, validates article images after going back, and fails on image HTTP errors during navigation. An intermediate candidate exposed a transient `/about/示例.png` request during rapid history navigation; this prompted stable article-image URL generation as well as the fixed-page repair. The final Chromium run passed without image HTTP failures. Final native-transition WebKit runs also crashed in a fresh Windows browser process while entering the article. Direct article loading works. A browser-only control disabling document.startViewTransition loads the same stable article image successfully; changing lazy to eager loading did not prevent the native crash. Windows WebKit native-transition validation therefore remains failed, while its fallback image checks and touch-focus checks passed. The user subsequently reported no remaining issues on the actual iPhone. No production transition workaround was introduced based only on the Windows port.
