import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, symlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ignore from 'ignore';
import { inside } from './paths.mjs';
import { selectPublicResources } from './public-resources.mjs';

// Author archives deliberately omit repository-only tests and maintenance docs.
export const sourceRoots = ['src', 'public', 'docs/zh-CN', 'docs/en', 'examples/deployment', 'examples/obsidian', 'examples/pages', 'examples/posts', 'tools/lib'];
export const sourceFiles = ['.gitignore', '.dockerignore', 'Dockerfile', 'LICENSE', 'README.md', 'astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json', 'wrangler.json', 'tools/deploy.mjs', 'tools/export.mjs', 'tools/scheduler.mjs'];

export async function copyTheme(root, destination, notesRoot) {
  const ignored = ignore().add(await readFile(join(root, '.gitignore'), 'utf8'));
  async function copy(source, target) {
    const name = relative(root, source).split(sep).join('/');
    if (source === notesRoot || inside(notesRoot, source) || ignored.ignores(name)) return;
    const info = await lstat(source);
    if (info.isSymbolicLink()) throw new Error(`Theme source contains a symlink: ${source}`);
    if (info.isDirectory()) {
      await mkdir(target, { recursive: true });
      for (const child of await readdir(source)) await copy(join(source, child), join(target, child));
    } else if (info.isFile()) {
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    } else throw new Error(`Theme source is not a regular file: ${source}`);
  }
  // Runtime tooling belongs to the image, not the mounted theme's build copy.
  for (const name of ['src', '.gitignore', 'astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    try { await copy(join(root, name), join(destination, name)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const name of await selectPublicResources(root, notesRoot)) {
    const target = join(destination, 'public', name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, 'public', name), target);
  }
}

/** Fingerprint files and relative symlink destinations, without following directory links. */
export async function fingerprint(root) {
  const hash = createHash('sha256');
  async function visit(path) {
    const info = await lstat(path);
    const name = relative(root, path).split(sep).join('/');
    if (info.isSymbolicLink()) {
      const target = await realpath(path);
      if (!inside(root, target)) throw new Error(`Snapshot symlink escapes notesDir: ${name}`);
      hash.update(JSON.stringify(['link', name, relative(root, target).split(sep).join('/')]));
    } else if (info.isDirectory()) {
      hash.update(JSON.stringify(['directory', name]));
      for (const child of (await readdir(path)).sort()) await visit(join(path, child));
    } else if (info.isFile()) {
      const digest = createHash('sha256').update(await readFile(path)).digest('hex');
      hash.update(JSON.stringify(['file', name, digest]));
    } else throw new Error(`Snapshot contains a special file: ${name}`);
  }
  await visit(root);
  return hash.digest('hex');
}

export async function copyNotes(root, destination) {
  async function copy(source, target) {
    const info = await lstat(source);
    if (info.isSymbolicLink()) {
      const actual = await realpath(source);
      if (!inside(root, actual)) throw new Error(`Snapshot symlink escapes notesDir: ${source}`);
      const rebased = resolve(destination, relative(root, actual));
      await mkdir(dirname(target), { recursive: true });
      await symlink(rebased, target, (await lstat(actual)).isDirectory() ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file');
    } else if (info.isDirectory()) {
      await mkdir(target, { recursive: true });
      for (const child of await readdir(source)) await copy(join(source, child), join(target, child));
    } else if (info.isFile()) {
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    } else throw new Error(`Snapshot contains a special file: ${source}`);
  }
  await copy(root, destination);
}

export async function inspectSite(directory) {
  let files = 0;
  let bytes = 0;
  async function visit(path) {
    const info = await lstat(path);
    const name = relative(directory, path).split(sep).join('/');
    if (info.isDirectory()) {
      for (const child of await readdir(path)) await visit(join(path, child));
    } else if (info.isFile()) {
      if (/(^|\/)(\.git|\.obsidian|\.env[^/]*)(\/|$)|\.(md|mdx)$|(^|\/)wrangler\.(jsonc?|toml)$/i.test(name)) throw new Error(`Unexpected source or configuration in site: ${name}`);
      if (info.size > 25 * 1024 * 1024) throw new Error(`Static asset exceeds 25 MiB: ${name}`);
      files++;
      bytes += info.size;
    } else throw new Error(`Site contains a symlink or special file: ${name}`);
  }
  await visit(directory);
  if (files > 20000) throw new Error(`Static assets exceed the Workers Free limit: ${files} files`);
  if (!(await lstat(join(directory, 'index.html'))).isFile()) throw new Error('Site is missing index.html');
  return { files, bytes };
}
