import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

function checkedManifest(data, fail) {
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
async function checkedFile(root, file, fail) {
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

/** Validate generated archives against the same selected attachment records. */
export function checkedToolArchives(archives, assets, entries) {
  const fail = message => { throw new Error(`Invalid tool archive: ${message}`); };
  if (!Array.isArray(archives)) fail('expected an archive array');
  const sources = new Map(assets.map(asset => [asset.target, asset.source]));
  const planned = new Map();
  for (const archive of archives) {
    if (!archive || typeof archive.entry !== 'string' || !entries.includes(archive.entry) || typeof sources.get(archive.entry) !== 'string'
      || archive.target !== posix.dirname(archive.entry) + '.zip') fail('archive must belong to a planned package entry');
    const manifest = checkedManifest(archive.manifest, fail);
    if (manifest.download !== true) fail('archive requires download: true');
    const sourceDirectory = dirname(sources.get(archive.entry));
    for (const file of manifest.files) {
      if (sources.get(posix.join(posix.dirname(archive.entry), file)) !== join(sourceDirectory, ...file.split('/'))) {
        fail(`member does not match the selected package file: ${file}`);
      }
    }
    const selected = { entry: archive.entry, target: archive.target, manifest };
    const previous = planned.get(archive.target);
    if (previous && JSON.stringify(previous) !== JSON.stringify(selected)) fail(`conflicting selections: ${archive.target}`);
    planned.set(archive.target, selected);
  }
  return [...planned.values()];
}

/** The build and dev server use identical archive bytes, generated from selected files. */
export async function createToolArchive(archive, assets, root) {
  const [selection] = checkedToolArchives([archive], assets, [archive.entry]);
  const sources = new Map(assets.map(asset => [asset.target, asset.source]));
  const files = Object.create(null);
  const fail = message => { throw new Error(`Cannot create tool archive ${archive.target}: ${message}`); };
  for (const file of [...selection.manifest.files].sort()) {
    const source = sources.get(posix.join(posix.dirname(selection.entry), file));
    await checkedFile(root, source, fail);
    files[file] = await readFile(source);
  }
  const manifestSource = join(dirname(sources.get(selection.entry)), 'manifest.json');
  await checkedFile(root, manifestSource, fail);
  const manifestBytes = await readFile(manifestSource);
  let current;
  try { current = JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch (error) { fail(`control manifest is invalid: ${error.message}`); }
  if (JSON.stringify(checkedManifest(current, fail)) !== JSON.stringify(selection.manifest)) {
    fail('control manifest changed after content sync');
  }
  files['manifest.json'] = manifestBytes;
  return zipSync(files, { level: 6, mtime: new Date(1980, 0, 1) });
}
