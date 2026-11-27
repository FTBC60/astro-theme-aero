import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { assetPlan, inside, noteId, validatePostId } from './note-assets.mjs';
import { isPublishedNote, parseNoteFrontmatter } from './note-publication.mjs';
import { expandToolPackage } from './tool-package.mjs';

const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');

/** Resolve and validate the complete resource selection for one published note. */
export function createNoteResources(note) {
  const assets = [];
  const toolEntries = [];
  const archives = [];
  let pending = 0;
  let failed = false;
  let finished = false;

  return {
    async resolve(url, kind = 'attachment') {
      if (failed || finished) throw new Error('Cannot resolve resources in a failed or finished note resource collection');
      pending++;
      try {
        if (kind === 'tool' && (typeof url !== 'string' || !url || /^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i.test(url) || /[?#]/.test(url))) {
          throw new Error(`Invalid tool reference "${url}" in ${note.file}: use a relative local .html file without a query or fragment`);
        }
        if (!url || url.startsWith('#') || url.startsWith('?') || url.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(url)) return { url, download: null };
        const base = note.base.replace(/\/$/, '');
        if (url.startsWith('/')) return { url: base && !url.startsWith(`${base}/`) ? `${base}${url}` : url, download: null };
        const [path, suffix = ''] = url.split(/([?#].*)/s);
        let decoded;
        try { decoded = decodeURIComponent(path); } catch { throw new Error(`Invalid attachment URL "${url}" in ${note.file}`); }
        if (/[\\\u0000-\u001f]/.test(decoded) || isAbsolute(decoded)) throw new Error(`Invalid attachment path "${url}" in ${note.file}`);
        if (kind === 'tool' && extname(decoded).toLowerCase() !== '.html') {
          throw new Error(`Invalid tool reference "${url}" in ${note.file}: target must be a .html file`);
        }
        const sourcePath = resolve(dirname(note.file), decoded);
        if (!inside(note.root, sourcePath)) throw new Error(`Attachment escapes notesDir: "${url}" in ${note.file}`);
        let source;
        try { source = await realpath(sourcePath); } catch { throw new Error(`Missing attachment "${url}" in ${note.file}`); }
        if (!inside(note.root, source)) throw new Error(`Attachment escapes notesDir: "${url}" in ${note.file}`);
        if (!(await stat(source)).isFile()) throw new Error(`Attachment is not a file: "${url}" in ${note.file}`);
        if (kind === 'tool' && extname(source).toLowerCase() !== '.html') {
          throw new Error(`Invalid tool reference "${url}" in ${note.file}: resolved target must be a .html file`);
        }
        if (extname(sourcePath) === '.md' && kind === 'link') {
          const path = relative(note.root, sourcePath);
          if (path.split(sep).some((part) => part.startsWith('.'))) throw new Error(`Link targets a hidden note outside the loaded collection: "${url}"`);
          for (let parent = dirname(sourcePath); relative(note.root, parent) !== ''; parent = dirname(parent)) {
            if ((await lstat(parent)).isSymbolicLink()) throw new Error(`Link targets an unscanned symlink directory: "${url}"`);
          }
          const { frontmatter } = parseNoteFrontmatter(await readFile(source, 'utf8'), source);
          if (!isPublishedNote(frontmatter)) throw new Error(`Link targets an unpublished note: "${url}" in ${note.file}`);
          const id = noteId(path.split(sep).join('/'), frontmatter);
          validatePostId(id);
          return { url: `${base}/posts/${encodedPath(id)}/${suffix}`, download: null };
        }
        if ([source, sourcePath].some((path) => /^\.(md|mdx|astro)$/i.test(extname(path)))) throw new Error(`Notes cannot be copied as attachments: "${url}" in ${note.file}`);
        for (const file of new Set([sourcePath, source])) {
          if (basename(file).toLowerCase() !== 'manifest.json') continue;
          let entry;
          try { entry = await stat(resolve(dirname(file), 'index.html')); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (entry?.isFile()) {
            throw new Error(`Tool package manifests are build metadata, not attachments: "${url}" in ${note.file}`);
          }
        }
        const local = inside(dirname(note.file), sourcePath)
          ? relative(dirname(note.file), sourcePath)
          : `_attachments/${relative(note.root, source)}`;
        const output = local.split(sep).join('/');
        const target = `posts/${note.id}/${output}`;
        const linkedEntry = kind === 'link' && basename(sourcePath).toLowerCase() === 'index.html';
        const bundle = kind === 'tool' || linkedEntry
          ? await expandToolPackage({ entry: sourcePath, root: note.root, target }) : null;
        if ((kind === 'tool' || bundle) && output.includes('%')) {
          throw new Error(`Invalid tool reference "${url}" in ${note.file}: literal % in the output path is unsupported by the current publisher; rename the file or folder`);
        }
        let download = null;
        if (bundle) {
          assets.push(...bundle.assets);
          toolEntries.push({ entry: target, files: bundle.manifest.files });
          if (bundle.manifest.download === true) {
            const archive = { entry: target, target: posix.dirname(target) + '.zip', manifest: bundle.manifest };
            archives.push(archive);
            download = { kind: 'zip', url: `${base}/${encodedPath(archive.target)}`, name: posix.basename(archive.target) };
          }
        } else {
          assets.push({ source, target });
          if ((kind === 'tool' || kind === 'link') && extname(output).toLowerCase() === '.html') {
            download = { kind: 'html', url: `${base}/${encodedPath(target)}`, name: posix.basename(output) };
          }
        }
        return { url: `./${encodedPath(output)}${suffix}`, download };
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        pending--;
      }
    },
    finish() {
      if (finished || failed || pending) throw new Error('Cannot finish an incomplete or already finished note resource collection');
      finished = true;
      return {
        assets: assetPlan(assets, [note.id], archives.map(archive => archive.target)),
        toolEntries,
        archives,
      };
    },
  };
}
