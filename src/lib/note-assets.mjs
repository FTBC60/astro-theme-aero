import { access, lstat, readFile, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, extname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { slug } from 'github-slugger';
import { isPublishedNote, parseNoteFrontmatter } from './note-publication.mjs';
import { expandToolPackage } from './tool-package.mjs';

export function noteId(path, frontmatter) {
  if (frontmatter.slug !== undefined && typeof frontmatter.slug !== 'string') {
    throw new Error(`Invalid slug in "${path}": expected a string`);
  }
  return frontmatter.slug || path.replace(/\.md$/, '').split('/').map((part) => slug(part)).join('/').replace(/\/index$/, '');
}

export function inside(directory, file) {
  const path = relative(directory, file);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function resolveNotesDir(projectRoot, notesDir) {
  if (typeof notesDir !== 'string' || !notesDir.trim()) throw new Error('notesDir must be a non-empty directory path');
  const path = resolve(projectRoot, notesDir);
  try {
    const directory = await realpath(path);
    if (!(await stat(directory)).isDirectory()) throw new Error('not a directory');
    await access(directory, constants.R_OK | constants.X_OK);
    return directory;
  } catch (error) {
    throw new Error(`Cannot read notesDir "${path}": ${error.message}`);
  }
}

export function validatePostId(id) {
  if (!id || /[\\%?#\u0000-\u001f]/.test(id) || id.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid post ID "${id}": use ordinary path segments without %, #, ? or backslashes`);
  }
}

const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');

/** Resolve only referenced files, retaining subdirectories and isolating shared assets. */
export async function resolveNoteAsset(url, note, assets, kind = 'attachment', toolEntries = [], archives = []) {
  if (kind === 'tool' && (typeof url !== 'string' || !url || /^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i.test(url) || /[?#]/.test(url))) {
    throw new Error(`Invalid tool reference "${url}" in ${note.file}: use a relative local .html file without a query or fragment`);
  }
  if (!url || url.startsWith('#') || url.startsWith('?') || url.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  const base = note.base.replace(/\/$/, '');
  if (url.startsWith('/')) return base && !url.startsWith(`${base}/`) ? `${base}${url}` : url;
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
    return `${base}/posts/${encodedPath(id)}/${suffix}`;
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
  if (bundle) {
    assets.push(...bundle.assets);
    toolEntries.push(target);
    if (bundle.manifest.download === true) {
      archives.push({ entry: target, target: posix.dirname(target) + '.zip', manifest: bundle.manifest });
    }
  } else assets.push({ source, target });
  return `./${encodedPath(output)}${suffix}`;
}

/** Check the complete plan before writing any attachments. */
export function assetPlan(assets, postIds, generatedTargets = []) {
  const targets = new Map();
  const pages = postIds.map((id) => `posts/${id}/index.html`);
  const generated = generatedTargets.map(target => ({ target, source: '<generated>' }));
  for (const asset of [...pages.map((target) => ({ target, source: '<article>' })), ...assets, ...generated]) {
    const parts = asset.target.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\'))) throw new Error(`Invalid attachment output: ${asset.target}`);
    const key = asset.target.normalize('NFC').toLowerCase();
    const existing = targets.get(key);
    if (existing && (existing.source !== asset.source || existing.target !== asset.target)) throw new Error(`Attachment output collision: ${asset.target}`);
    targets.set(key, asset);
  }
  for (const [target] of targets) {
    const parts = target.split('/');
    for (let i = 1; i < parts.length; i++) if (targets.has(parts.slice(0, i).join('/'))) throw new Error(`Attachment file/directory collision: ${target}`);
  }
  return [...targets.values()].filter((asset) => asset.source !== '<article>' && asset.source !== '<generated>');
}
