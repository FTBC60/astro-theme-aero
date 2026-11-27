import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectPublicResources } from '../lib/public-resources.mjs';
import { copyTheme } from '../lib/publish-files.mjs';
import { inside } from '../lib/paths.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(project, '.astro');
const put = async (path, value) => { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, value); };

async function fixture(run) {
  await mkdir(cache, { recursive: true });
  const workspace = await mkdtemp(join(cache, 'resource-test-'));
  const root = join(workspace, 'theme');
  await mkdir(root);
  try { await run(root, workspace); }
  finally {
    assert(workspace !== cache && inside(cache, workspace));
    await rm(workspace, { recursive: true, force: true });
  }
}

test('root ignore rules, negation and directory pruning agree with Git without its index', async () => fixture(async (root) => {
  await put(join(root, '.gitignore'), [
    '*.tmp',
    '/public/closed/',
    '!/public/closed/keep.txt',
    '/public/open/*',
    '!/public/open/keep.txt',
    '/public/album/private.txt',
    '!/public/album/keep.tmp',
    '/public/album/\\#secret.txt',
    '/public/album/\\!secret.txt',
    '',
  ].join('\n'));
  const candidates = [
    'visible.txt', 'closed/keep.txt', 'closed/hidden.txt',
    'open/keep.txt', 'open/hidden.txt',
    'album/private.txt', 'album/keep.tmp', 'album/hidden.tmp',
    'album/#secret.txt', 'album/!secret.txt',
    '中文/图 片.png', 'case.TMP', '.well-known/visible.txt',
  ];
  for (const name of candidates) await put(join(root, 'public', name), name);
  execFileSync('git', ['init', '--quiet', root]);
  const empty = join(root, '.git/empty-global');
  await put(empty, '');
  execFileSync('git', ['-C', root, 'add', '-f', 'public/album/private.txt']);
  const result = spawnSync('git', ['-C', root, '-c', 'core.ignoreCase=false', '-c', `core.excludesFile=${empty}`, 'check-ignore', '--no-index', '-z', '--stdin'], {
    input: candidates.map((name) => `public/${name}\0`).join(''), encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: empty },
  });
  assert.ifError(result.error);
  assert([0, 1].includes(result.status), result.stderr);
  const excluded = new Set(result.stdout.split('\0').filter(Boolean));
  const expected = candidates.filter((name) => !excluded.has(`public/${name}`)).sort();
  const selected = (await selectPublicResources(root)).sort();
  assert.deepEqual(selected, expected);
  assert(selected.includes('album/keep.tmp'));
  assert(!selected.includes('closed/keep.txt'));
  assert(!selected.includes('album/private.txt'));
}));

test('global and repository-private Git excludes never affect public selection', async () => fixture(async (root, workspace) => {
  await put(join(root, '.gitignore'), '');
  await put(join(root, 'public/visible.txt'), 'public');
  execFileSync('git', ['init', '--quiet', root]);
  await put(join(root, '.git/info/exclude'), '/public/visible.txt\n');
  const global = join(workspace, 'global-ignore');
  await put(global, '/public/visible.txt\n');
  execFileSync('git', ['-C', root, 'config', 'core.excludesFile', global]);
  assert.deepEqual(await selectPublicResources(root), ['visible.txt']);
  await rm(join(root, '.git'), { recursive: true });
  assert.deepEqual(await selectPublicResources(root), ['visible.txt']);
}));

test('copyTheme consumes the common selection, keeping rule files and notes out of public', async () => fixture(async (root, workspace) => {
  await put(join(root, '.gitignore'), '*.tmp\n!/public/album/keep.tmp\n/public/album/private.txt\n');
  await put(join(root, 'public/album/.gitignore'), 'ignored-nested-rules\n');
  await put(join(root, 'public/album/keep.tmp'), 'kept');
  await put(join(root, 'public/album/private.txt'), 'excluded');
  const notes = join(root, 'public/notes');
  await put(join(notes, 'day.md'), 'private note');
  const destination = join(workspace, 'copy');
  await copyTheme(root, destination, notes);
  assert.equal(await readFile(join(destination, 'public/album/keep.tmp'), 'utf8'), 'kept');
  for (const name of ['album/private.txt', 'album/.gitignore', 'notes/day.md']) {
    await assert.rejects(readFile(join(destination, 'public', name)), /ENOENT/);
  }
  assert.deepEqual(await selectPublicResources(root, notes), ['album/keep.tmp']);
}));

test('missing public and rule files are valid; invalid root ignore files fail', async () => fixture(async (root) => {
  assert.deepEqual(await selectPublicResources(root), []);
  await put(join(root, 'public/visible.txt'), 'public');
  assert.deepEqual(await selectPublicResources(root), ['visible.txt']);
  await mkdir(join(root, '.gitignore'));
  await assert.rejects(selectPublicResources(root), /Ignore rules must be a regular file/);
}));

test('selected public symlinks are rejected rather than followed', async () => fixture(async (root, workspace) => {
  const outside = join(workspace, 'outside');
  await put(join(outside, 'file.txt'), 'outside');
  await mkdir(join(root, 'public'));
  await symlink(outside, join(root, 'public/link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(selectPublicResources(root), /not a regular file or directory/);
  await put(join(root, '.gitignore'), '/public/link\n');
  assert.deepEqual(await selectPublicResources(root), []);
}));
