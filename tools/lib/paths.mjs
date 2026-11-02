import { constants } from 'node:fs';
import { access, realpath, rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

// Publisher utilities must work without any theme source installed in the image.
export function inside(directory, file) {
  const path = relative(directory, file);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function removeWithin(parent, target) {
  parent = resolve(parent);
  target = resolve(target);
  if (target === parent || !inside(parent, target)) throw new Error(`Refusing cleanup outside publisher data: ${target}`);
  try {
    const actualParent = await realpath(parent);
    const actualTarget = await realpath(target);
    if (actualTarget === actualParent || !inside(actualParent, actualTarget)) throw new Error(`Cleanup path escapes publisher data: ${target}`);
    await rm(target, { recursive: true, force: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function resolveNotesDir(projectRoot, notesDir) {
  if (typeof notesDir !== 'string' || !notesDir.trim()) throw new Error('notesDir must be a non-empty directory path');
  const path = resolve(projectRoot, notesDir);
  try {
    const directory = await realpath(path);
    if (!(await stat(directory)).isDirectory()) throw new Error('not a directory');
    await access(directory, constants.R_OK | constants.X_OK);
    return directory;
  } catch (error) { throw new Error(`Cannot read notesDir "${path}": ${error.message}`); }
}
