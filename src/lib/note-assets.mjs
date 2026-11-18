import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { slug } from 'github-slugger';

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
