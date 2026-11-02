import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import ignore from 'ignore';
import { inside } from './paths.mjs';

async function readRules(directory) {
  const path = join(directory, '.gitignore');
  let info;
  try { info = await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  if (!info.isFile()) throw new Error(`Ignore rules must be a regular file: ${path}`);
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
}

// Qualify nested patterns so a single matcher owns inheritance and negation.
// Independent per-directory matchers would retain exclusions from ancestors
// even after a more local rule has reopened a directory.
function scopedRules(contents, directory) {
  const prefix = directory.replace(/[\\*?\[\]]/g, '\\$&');
  return contents.split(/\r?\n/).flatMap((line) => {
    if (!line.trim() || line.startsWith('#')) return [];
    // Ignore unescaped trailing spaces, retaining escaped literal spaces.
    while (line.endsWith(' ')) {
      let escapes = 0;
      for (let i = line.length - 2; i >= 0 && line[i] === '\\'; i--) escapes++;
      if (escapes % 2) break;
      line = line.slice(0, -1);
    }
    const negative = line.startsWith('!');
    const pattern = negative ? line.slice(1) : line;
    if (!pattern || pattern === '/') return [];
    const anchored = pattern.startsWith('/') || pattern.replace(/\/$/, '').includes('/');
    return [`${negative ? '!' : ''}/${prefix}/${anchored ? '' : '**/'}${pattern.replace(/^\//, '')}`];
  });
}

/** Select public-relative regular files using only theme-local .gitignore rules.
 * The notes tree, when supplied, remains private build input. Git tracking,
 * global excludes and .git/info/exclude never participate. Rule files are
 * build metadata and are not public resources. Matching is case-sensitive.
 */
export async function selectPublicResources(root, notesRoot) {
  const publicRoot = join(root, 'public');
  const files = [];
  const rules = ignore({ ignorecase: false }).add(await readRules(root));
  async function visit(source, inherited) {
    if (notesRoot && inside(notesRoot, source)) return;
    const info = await lstat(source);
    const name = relative(root, source).split(sep).join('/');
    if (inherited.ignores(name + (info.isDirectory() ? '/' : ''))) return;
    if (info.isDirectory()) {
      const local = ignore({ ignorecase: false }).add(inherited).add(scopedRules(await readRules(source), name));
      for (const child of (await readdir(source)).sort()) {
        if (child !== '.gitignore') await visit(join(source, child), local);
      }
    } else if (info.isFile()) files.push(relative(publicRoot, source).split(sep).join('/'));
    else throw new Error(`Public resource is not a regular file or directory: ${source}`);
  }
  try { await lstat(publicRoot); }
  catch (error) { if (error.code === 'ENOENT') return files; throw error; }
  await visit(publicRoot, rules);
  return files;
}
