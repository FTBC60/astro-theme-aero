import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetPlan, inside, resolveNoteAsset, validatePostId } from './note-assets.mjs';
import { checkedToolArchives } from './tool-package.mjs';

const version = 3;
const metadataKey = '__aeroCompilation';
const planFile = 'aero-attachments.json';
export const noteAssetsIntegrationName = 'aero-note-assets';
const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');
const publishedAssetUrl = (url, note) => url.startsWith('./')
  ? `${note.base.replace(/\/$/, '')}/posts/${encodedPath(note.id)}/${url.slice(2)}` : url;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function checkedAssets(assets, postIds, root) {
  if (!Array.isArray(assets) || !Array.isArray(postIds) || new Set(postIds).size !== postIds.length) {
    throw new Error('Invalid attachment plan: expected assets and unique published post IDs');
  }
  for (const id of postIds) {
    if (typeof id !== 'string') throw new Error('Invalid attachment plan: expected published post IDs');
    validatePostId(id);
  }
  const published = new Set(postIds);
  const belongsToPost = (target) => {
    const parts = target.split('/');
    if (parts.shift() !== 'posts') return false;
    for (let length = 1; length < parts.length; length++) {
      if (published.has(parts.slice(0, length).join('/'))) return true;
    }
    return false;
  };
  for (const asset of assets) {
    if (!asset || typeof asset.source !== 'string' || !isAbsolute(asset.source) || !inside(root, asset.source)
      || /\.(md|mdx|astro)$/i.test(asset.source) || typeof asset.target !== 'string'
      || !belongsToPost(asset.target)) {
      throw new Error('Invalid attachment plan: attachment must belong to a published note inside notesDir');
    }
  }
  return assetPlan(assets, postIds);
}

function checkedToolEntries(entries, assets) {
  const targets = new Set(assets.map(asset => asset.target));
  if (!Array.isArray(entries) || entries.some(entry => typeof entry !== 'string' || !entry.endsWith('/index.html') || !targets.has(entry))) {
    throw new Error('Invalid attachment plan: tool entry must be a planned index.html');
  }
  return [...new Set(entries)];
}

/** One content sync owns one compilation batch; only complete batches replace the cached plan.
 * @param {{root: string, base: string, cacheDir: URL, integrations?: {name: string}[], downloadLabels?: {html: string, zip: string}}} settings
 */
export function createNoteCompilation({ root, base, cacheDir, integrations, downloadLabels = { html: 'Download HTML', zip: 'Download ZIP' } }) {
  if (integrations && !integrations.some(({ name }) => name === noteAssetsIntegrationName)) {
    throw new Error('Note compilation requires the noteAssets integration in astro.config.mjs');
  }
  const assets = [];
  const toolEntries = [];
  const archives = [];
  const postIds = [];
  const manifest = new URL(planFile, cacheDir);
  let pending = 0;
  let failed = false;
  let sealed = false;
  return {
    /**
     * @param {{id: string, file: string, frontmatter: Record<string, any>, body: string}} note
     * @param {import('astro/loaders').LoaderContext['renderMarkdown']} renderMarkdown
     */
    async compile({ id, file, frontmatter, body }, renderMarkdown) {
      if (sealed) throw new Error('Note compilation batch has already been saved');
      pending++;
      try {
        validatePostId(id);
        const token = randomUUID();
        const request = { version, kind: 'request', token, note: { id, root, file, base, downloadLabels } };
        const metadata = { ...frontmatter, [metadataKey]: request };
        const rendered = await renderMarkdown(`---\n${JSON.stringify(metadata)}\n---\n${body}`, { fileURL: pathToFileURL(file) });
        const extra = rendered?.metadata?.frontmatter;
        const result = extra?.[metadataKey];
        if (typeof rendered?.html !== 'string' || result?.version !== version || result.kind !== 'result' || result.token !== token
          || !Object.hasOwn(result, 'cover') || (frontmatter.cover === undefined ? result.cover !== null : typeof result.cover !== 'string')) {
          throw new Error(`Incomplete note compilation for "${id}" (${file}): check remarkNoteAssets in astro.config.mjs; expected a complete result for this note`);
        }
        const planned = checkedAssets(result.assets, [id], root);
        const plannedEntries = checkedToolEntries(result.toolEntries, planned);
        const plannedArchives = checkedToolArchives(result.archives, planned, plannedEntries);
        assetPlan(planned, [id], plannedArchives.map(archive => archive.target));
        // Private requests/results never reach Astro's content store.
        const { [metadataKey]: _private, ...cleanFrontmatter } = extra;
        /** @type {NonNullable<typeof rendered.metadata>} */
        const cleanMetadata = { ...rendered.metadata, frontmatter: cleanFrontmatter };
        assets.push(...planned);
        toolEntries.push(...plannedEntries);
        archives.push(...plannedArchives);
        postIds.push(id);
        return {
          rendered: { ...rendered, metadata: cleanMetadata },
          cover: result.cover === null ? undefined : result.cover,
        };
      } catch (error) {
        failed = true;
        throw error;
      } finally { pending--; }
    },
    async writePlan() {
      if (failed || pending || sealed) throw new Error('Cannot save an incomplete or already saved note compilation batch');
      sealed = true;
      const planned = checkedAssets(assets, postIds, root);
      const entries = checkedToolEntries(toolEntries, planned);
      const selectedArchives = checkedToolArchives(archives, planned, entries);
      assetPlan(planned, postIds, selectedArchives.map(archive => archive.target));
      const plan = { version, root, base, postIds, assets: planned, toolEntries: entries, archives: selectedArchives };
      await mkdir(cacheDir, { recursive: true });
      const temporary = new URL(`${planFile}.${randomUUID()}.tmp`, cacheDir);
      try {
        await writeFile(temporary, JSON.stringify(plan));
        await rename(temporary, manifest);
      } finally { await rm(temporary, { force: true }); }
    },
    async readPlan() {
      let plan;
      try { plan = JSON.parse(await readFile(manifest, 'utf8')); }
      catch (error) { throw new Error(`Cannot read attachment plan; run content sync again: ${error.message}`, { cause: error }); }
      if (plan?.version !== version || plan.root !== root || plan.base !== base) {
        throw new Error('Attachment plan does not match the current notesDir, base or format version; run content sync again');
      }
      const planned = checkedAssets(plan.assets, plan.postIds, root);
      const entries = checkedToolEntries(plan.toolEntries, planned);
      const selectedArchives = checkedToolArchives(plan.archives, planned, entries);
      assetPlan(planned, plan.postIds, selectedArchives.map(archive => archive.target));
      return { root, assets: planned, toolEntries: entries, archives: selectedArchives };
    },
  };
}

/** Markdown adapter for the compilation module; other Markdown pages pass through. */
export function remarkNoteAssets() {
  return async (tree, file) => {
    const frontmatter = file.data.astro?.frontmatter;
    const request = frontmatter?.[metadataKey];
    if (!request) return;
    if (request.version !== version || request.kind !== 'request' || typeof request.token !== 'string' || !request.note) {
      throw new Error('Invalid note compilation request');
    }
    const note = request.note;
    const assets = [];
    const toolEntries = [];
    const archives = [];
    const definitions = new Map();
    const collect = (node) => {
      if (node.type === 'definition') definitions.set(node.identifier.toLowerCase(), node);
      node.children?.forEach(collect);
    };
    collect(tree);
    const visit = async (node, insideLink = false) => {
      const additions = [];
      if (node.type === 'imageReference' || node.type === 'linkReference') {
        const definition = definitions.get(node.identifier.toLowerCase());
        if (definition) {
          node.type = node.type === 'imageReference' ? 'image' : 'link';
          node.url = definition.url;
          node.title = definition.title;
        } else if (node.type === 'imageReference' && node.alt?.startsWith('iframe:')) {
          throw new Error(`Missing iframe reference definition "${node.identifier}" in ${note.file}`);
        }
      }
      if (node.type === 'image' || node.type === 'link') {
        const tool = node.type === 'image' && node.alt?.startsWith('iframe:');
        const title = tool ? node.alt.slice('iframe:'.length).trim() : '';
        if (tool && !title) throw new Error(`Iframe title must not be empty in ${note.file}`);
        node.url = await resolveNoteAsset(node.url, note, assets, tool ? 'tool' : node.type, toolEntries, archives);
        const htmlLink = node.type === 'link' && node.url.startsWith('./') && /\.html$/i.test(node.url.split(/[?#]/, 1)[0]);
        let download;
        if (tool || htmlLink) {
          const entryUrl = node.url.split(/[?#]/, 1)[0];
          const entry = `posts/${note.id}/${decodeURIComponent(entryUrl.slice(2))}`;
          const archive = archives.find(item => item.entry === entry);
          if (archive) {
            download = {
              url: `${note.base.replace(/\/$/, '')}/${encodedPath(archive.target)}`,
              name: posix.basename(archive.target),
              label: note.downloadLabels.zip,
            };
          } else if (!toolEntries.includes(entry)) {
            download = {
              url: publishedAssetUrl(entryUrl, note),
              name: decodeURIComponent(posix.basename(entryUrl)),
              label: note.downloadLabels.html,
            };
          }
          if (download && (htmlLink || insideLink)) {
            additions.push({ type: 'text', value: ' ' }, {
              type: 'link',
              url: download.url,
              data: {
                hProperties: {
                  download: download.name,
                  className: ['aero-tool-download'],
                  'data-astro-reload': '',
                  'aria-label': `${download.label} ${download.name}`,
                },
              },
              children: [{ type: 'text', value: download.label }],
            });
          }
        }
        if (htmlLink) {
          node.data ??= {};
          node.data.hProperties = {
            ...node.data.hProperties,
            target: '_blank',
            rel: 'noopener',
            'data-astro-reload': '',
          };
        }
        if (node.type === 'image') {
          // Images and frames must not resolve against the previous ClientRouter page.
          node.url = publishedAssetUrl(node.url, note);
          node.type = 'html';
          node.value = tool
            ? `<iframe src="${escapeHtml(node.url)}" title="${escapeHtml(title)}" sandbox="allow-scripts allow-downloads" loading="lazy" referrerpolicy="no-referrer" class="aero-embedded-tool"></iframe>`
            : `<img src="${escapeHtml(node.url)}" alt="${escapeHtml(node.alt || '')}"${node.title ? ` title="${escapeHtml(node.title)}"` : ''} loading="lazy">`;
          if (tool && download && !insideLink) {
            const control = `<a class="aero-tool-download" href="${escapeHtml(download.url)}"`
              + ` download="${escapeHtml(download.name)}" data-astro-reload`
              + ` aria-label="${escapeHtml(download.label + ' ' + download.name)}">${escapeHtml(download.label)}</a>`;
            node.value = `<span class="aero-tool"><span class="aero-tool-toolbar"><span>${escapeHtml(title)}</span>${control}</span>${node.value}</span>`;
          }
          delete node.children;
        }
      }
      if (node.children) {
        const children = [];
        for (const child of node.children) {
          const after = await visit(child, insideLink || node.type === 'link');
          children.push(child);
          if (insideLink || node.type === 'link') additions.push(...after);
          else children.push(...after);
        }
        node.children = children;
      }
      return additions;
    };
    await visit(tree);
    if (frontmatter.cover) {
      const cover = await resolveNoteAsset(frontmatter.cover, note, assets);
      frontmatter.cover = publishedAssetUrl(cover, note);
    }
    frontmatter[metadataKey] = { version, kind: 'result', token: request.token, cover: frontmatter.cover ?? null, assets, toolEntries, archives };
  };
}
