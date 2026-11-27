import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validatePostId } from './note-assets.mjs';
import { finalizeResourcePlan } from './note-resource-plan.mjs';
import { createNoteResources } from './note-resources.mjs';

const version = 4;
const metadataKey = '__aeroCompilation';
const planFile = 'aero-attachments.json';
export const noteAssetsIntegrationName = 'aero-note-assets';
const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');
const publishedAssetUrl = (url, note) => url.startsWith('./')
  ? `${note.base.replace(/\/$/, '')}/posts/${encodedPath(note.id)}/${url.slice(2)}` : url;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

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
        const metadata = { ...frontmatter, [metadataKey]: { id, root, file, base, downloadLabels } };
        const rendered = await renderMarkdown(`---\n${JSON.stringify(metadata)}\n---\n${body}`, { fileURL: pathToFileURL(file) });
        const extra = rendered?.metadata?.frontmatter;
        const result = extra?.[metadataKey];
        if (typeof rendered?.html !== 'string' || !result || !Array.isArray(result.assets)
          || !Object.hasOwn(result, 'cover') || (frontmatter.cover === undefined ? result.cover !== null : typeof result.cover !== 'string')) {
          throw new Error(`Incomplete note compilation for "${id}" (${file}): check remarkNoteAssets in astro.config.mjs; expected a complete result for this note`);
        }
        // Private compilation metadata never reaches Astro's content store.
        const { [metadataKey]: _private, ...cleanFrontmatter } = extra;
        /** @type {NonNullable<typeof rendered.metadata>} */
        const cleanMetadata = { ...rendered.metadata, frontmatter: cleanFrontmatter };
        assets.push(...result.assets);
        toolEntries.push(...result.toolEntries);
        archives.push(...result.archives);
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
      const planned = finalizeResourcePlan({ assets, toolEntries, archives, postIds });
      const plan = { version, root, base, postIds, ...planned };
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
      return { root, assets: plan.assets, toolEntries: plan.toolEntries, archives: plan.archives };
    },
  };
}

/** Markdown adapter for the compilation module; other Markdown pages pass through. */
export function remarkNoteAssets() {
  return async (tree, file) => {
    const frontmatter = file.data.astro?.frontmatter;
    const note = frontmatter?.[metadataKey];
    if (!note) return;
    const resources = createNoteResources(note);
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
        const resource = await resources.resolve(node.url, tool ? 'tool' : node.type);
        node.url = resource.url;
        const htmlLink = node.type === 'link' && node.url.startsWith('./') && /\.html$/i.test(node.url.split(/[?#]/, 1)[0]);
        const download = resource.download && {
          ...resource.download,
          label: note.downloadLabels[resource.download.kind],
        };
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
            ? `<iframe src="${escapeHtml(node.url)}" title="${escapeHtml(title)}" sandbox="allow-scripts allow-downloads allow-same-origin" loading="lazy" referrerpolicy="no-referrer" class="aero-embedded-tool"></iframe>`
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
      const { url: cover } = await resources.resolve(frontmatter.cover);
      frontmatter.cover = publishedAssetUrl(cover, note);
    }
    frontmatter[metadataKey] = { cover: frontmatter.cover ?? null, ...resources.finish() };
  };
}
