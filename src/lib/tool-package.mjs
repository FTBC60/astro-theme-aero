import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, sep } from 'node:path';
import { zipSync } from 'fflate';
import { inside } from './note-assets.mjs';

export function checkedManifest(data, fail) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || Object.keys(data).some(key => !['version', 'files', 'download'].includes(key))
    || data.version !== 1 || !Array.isArray(data.files) || !data.files.length
    || (Object.hasOwn(data, 'download') && typeof data.download !== 'boolean')) {
    fail('expected version: 1, a nonempty files array and optional boolean download');
  }
  if (!data.files.includes('index.html')) fail('files must include index.html');
  const seen = new Set();
  for (const file of data.files) {
    if (typeof file !== 'string' || /[\\:%?#\u0000-\u001f\u007f]/.test(file)
      || file.split('/').some(part => !part || part === '.' || part === '..')) fail(`invalid relative file path: ${JSON.stringify(file)}`);
    if (seen.has(file)) fail(`duplicate file: ${file}`);
    seen.add(file);
    if (file.toLowerCase() === 'manifest.json' || /\.(md|mdx|astro)$/i.test(file)) fail(`build metadata or source cannot be published: ${file}`);
  }
  const manifest = { version: 1, files: [...data.files] };
  if (Object.hasOwn(data, 'download')) manifest.download = data.download;
  return manifest;
}

// Check actual entries so Windows also enforces case and rejects parent junctions.
export async function checkedFile(root, file, fail) {
  const name = relative(root, file);
  if (isAbsolute(name) || name === '..' || name.startsWith(`..${sep}`)) fail('file escapes notesDir');
  let parent = root;
  const parts = name.split(sep);
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!(await readdir(parent)).includes(part)) fail(`missing file or incorrect path case: ${name}`);
    parent = join(parent, part);
    const info = await lstat(parent);
    if (info.isSymbolicLink()) fail(`symbolic links are not supported: ${name}`);
    if (index === parts.length - 1 ? !info.isFile() : !info.isDirectory()) fail(`not a regular file: ${name}`);
  }
  return file;
}

/** Expand one explicitly referenced package without interpreting runtime dependencies. */
export async function expandToolPackage({ entry, root, target }) {
  const directory = dirname(entry);
  const manifest = join(directory, 'manifest.json');
  try { await lstat(manifest); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const fail = (message) => { throw new Error(`Invalid tool package ${manifest}: ${message}`); };
  await checkedFile(root, manifest, fail);
  if (basename(entry) !== 'index.html') fail('a package must be referenced through index.html');
  let data;
  try { data = JSON.parse((await readFile(manifest, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { fail(`expected valid JSON: ${error.message}`); }
  const selection = checkedManifest(data, fail);
  const assets = [];
  for (const file of selection.files) {
    const source = await checkedFile(root, join(directory, ...file.split('/')), fail);
    assets.push({ source, target: posix.join(posix.dirname(target), file) });
  }
  return { assets, manifest: selection };
}

/** The build and dev server use identical archive bytes, generated from selected files. */
export async function createToolArchive(archive, assets, root) {
  const sources = new Map(assets.map(asset => [asset.target, asset.source]));
  const files = Object.create(null);
  const entryDir = posix.dirname(archive.entry);
  for (const file of [...archive.manifest.files].sort()) {
    const source = await realpath(sources.get(posix.join(entryDir, file)));
    if (!inside(root, source)) throw new Error(`Cannot create tool archive ${archive.target}: file escapes notesDir`);
    files[file] = await readFile(source);
  }
  const manifestSource = await realpath(join(dirname(sources.get(archive.entry)), 'manifest.json'));
  if (!inside(root, manifestSource)) throw new Error(`Cannot create tool archive ${archive.target}: manifest escapes notesDir`);
  files['manifest.json'] = await readFile(manifestSource);
  return zipSync(files, { level: 6, mtime: new Date(1980, 0, 1) });
}
