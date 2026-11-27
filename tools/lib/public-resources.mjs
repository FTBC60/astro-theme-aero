import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import ignore from 'ignore';
import { inside } from './paths.mjs';

async function readRootRules(root) {
  const path = join(root, '.gitignore');
  let info;
  try { info = await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  if (!info.isFile()) throw new Error(`Ignore rules must be a regular file: ${path}`);
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
}

/** Select public-relative regular files using only the repository root .gitignore rules.
 * The notes tree, when supplied, remains private build input. Git tracking,
 * global excludes and .git/info/exclude never participate. Rule files are
 * build metadata and are not public resources. Matching is case-sensitive.
 */
export async function selectPublicResources(root, notesRoot) {
  const publicRoot = join(root, 'public');
  try { await lstat(publicRoot); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }

  const files = [];
  const rules = ignore({ ignorecase: false }).add(await readRootRules(root));
  async function visit(source) {
    if (notesRoot && inside(notesRoot, source)) return;
    const info = await lstat(source);
    const name = relative(root, source).split(sep).join('/');
    if (rules.ignores(name + (info.isDirectory() ? '/' : ''))) return;
    if (info.isDirectory()) {
      for (const child of (await readdir(source)).sort()) {
        if (child !== '.gitignore') await visit(join(source, child));
      }
    } else if (info.isFile()) files.push(relative(publicRoot, source).split(sep).join('/'));
    else throw new Error(`Public resource is not a regular file or directory: ${source}`);
  }
  await visit(publicRoot);
  return files;
}
