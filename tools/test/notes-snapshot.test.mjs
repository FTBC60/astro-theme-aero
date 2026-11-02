import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNotesSnapshot } from '../lib/notes-snapshot.mjs';
import { copyNotes, fingerprint } from '../lib/publish-files.mjs';
import { inside } from '../lib/paths.mjs';

const cache = fileURLToPath(new URL('../../.astro/', import.meta.url));
const put = async (path, contents) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, contents); };
const missing = (path) => assert.rejects(readFile(path), { code: 'ENOENT' });

async function fixture(run) {
  await mkdir(cache, { recursive: true });
  const workspace = await mkdtemp(join(cache, 'notes-snapshot-test-'));
  const source = join(workspace, 'Vault');
  const stage = join(workspace, 'stage');
  const directory = join(stage, '.notes');
  try {
    await put(join(source, '日记/day.md'), '---\npublish: true\n---\n![photo](图 片.txt)');
    await put(join(source, '日记/图 片.txt'), 'original attachment');
    await put(join(source, '.private.md'), 'private input stays in the isolated snapshot');
    await mkdir(join(source, 'empty'));
    await put(join(stage, 'keep.txt'), 'unrelated stage file');
    await run({ workspace, source, stage, directory });
  } finally {
    assert(workspace !== cache && inside(cache, workspace));
    await rm(workspace, { recursive: true, force: true });
  }
}

test('a stable snapshot replaces obsolete files and returns a verified directory and digest', async () => fixture(async ({ source, stage, directory }) => {
  await put(join(directory, 'obsolete.txt'), 'old copy');
  const before = await fingerprint(source);
  let copies = 0;
  const result = await createNotesSnapshot({ source, stage, onRetry: () => assert.fail('Stable input must not retry') }, async (...args) => {
    copies++;
    await copyNotes(...args);
  });
  assert.equal(copies, 1);
  assert.deepEqual(result, { directory, digest: before });
  assert.equal(await fingerprint(result.directory), result.digest);
  assert.equal(await fingerprint(source), before);
  assert.equal(await readFile(join(directory, '日记/图 片.txt'), 'utf8'), 'original attachment');
  assert.equal(await readFile(join(stage, 'keep.txt'), 'utf8'), 'unrelated stage file');
  await missing(join(directory, 'obsolete.txt'));
}));

test('an empty notes directory is a complete successful snapshot', async () => fixture(async ({ workspace, stage }) => {
  const source = join(workspace, 'empty-Vault');
  await mkdir(source);
  const result = await createNotesSnapshot({ source, stage });
  assert.equal(result.digest, await fingerprint(source));
  assert.equal(await fingerprint(result.directory), result.digest);
}));

test('source changes after copying retry with a fresh copy and discard deleted files', async () => fixture(async ({ source, stage }) => {
  const obsolete = join(source, 'deleted.txt');
  await put(obsolete, 'removed during copying');
  let copies = 0;
  let retries = 0;
  const result = await createNotesSnapshot({ source, stage, onRetry: () => retries++ }, async (root, destination) => {
    copies++;
    await copyNotes(root, destination);
    if (copies === 1) {
      await put(join(source, '日记/图 片.txt'), 'updated during copying');
      await rm(obsolete);
    }
  });
  assert.equal(copies, 2);
  assert.equal(retries, 1);
  assert.equal(result.digest, await fingerprint(source));
  assert.equal(await fingerprint(result.directory), result.digest);
  assert.equal(await readFile(join(result.directory, '日记/图 片.txt'), 'utf8'), 'updated during copying');
  await missing(join(result.directory, 'deleted.txt'));
}));

test('a mismatched copy retries even when the source has not changed', async () => fixture(async ({ source, stage }) => {
  const before = await fingerprint(source);
  let copies = 0;
  const result = await createNotesSnapshot({ source, stage }, async (root, destination) => {
    copies++;
    await copyNotes(root, destination);
    if (copies === 1) await put(join(destination, '日记/图 片.txt'), 'incomplete copy');
  });
  assert.equal(copies, 2);
  assert.equal(await fingerprint(source), before);
  assert.equal(result.digest, before);
  assert.equal(await fingerprint(result.directory), before);
}));

test('three changing copies fail and remove the incomplete snapshot', async () => fixture(async ({ source, stage, directory }) => {
  let copies = 0;
  let retries = 0;
  await assert.rejects(createNotesSnapshot({ source, stage, onRetry: () => retries++ }, async (root, destination) => {
    await copyNotes(root, destination);
    await put(join(source, '日记/图 片.txt'), `edit ${++copies}`);
  }), /Notes changed repeatedly/);
  assert.equal(copies, 3);
  assert.equal(retries, 2);
  await assert.rejects(realpath(directory), { code: 'ENOENT' });
  assert.equal(await readFile(join(source, '日记/图 片.txt'), 'utf8'), 'edit 3');
  assert.equal(await readFile(join(stage, 'keep.txt'), 'utf8'), 'unrelated stage file');
}));

test('the third attempt can succeed when the first two copies observe source changes', async () => fixture(async ({ source, stage }) => {
  let copies = 0;
  let retries = 0;
  const result = await createNotesSnapshot({ source, stage, onRetry: () => retries++ }, async (root, destination) => {
    await copyNotes(root, destination);
    if (++copies < 3) await put(join(source, '日记/图 片.txt'), `edit ${copies}`);
  });
  assert.equal(copies, 3);
  assert.equal(retries, 2);
  assert.equal(result.digest, await fingerprint(source));
  assert.equal(await fingerprint(result.directory), result.digest);
}));

test('copy errors fail immediately and remove partial files without changing the source', async () => fixture(async ({ source, stage, directory }) => {
  const before = await fingerprint(source);
  for (const code of ['EACCES', 'ENOENT']) {
    const failure = Object.assign(new Error(`copy failed: ${code}`), { code });
    let copies = 0;
    await assert.rejects(createNotesSnapshot({ source, stage, onRetry: () => assert.fail('I/O failures must not retry') }, async (root, destination) => {
      copies++;
      await copyNotes(root, destination);
      throw failure;
    }), (error) => error === failure);
    assert.equal(copies, 1);
    await assert.rejects(realpath(directory), { code: 'ENOENT' });
    assert.equal(await fingerprint(source), before);
  }
}));

test('cancellation before copying removes an obsolete snapshot without copying', async () => fixture(async ({ source, stage, directory }) => {
  await put(join(directory, 'obsolete.txt'), 'old copy');
  const controller = new AbortController();
  const reason = new Error('cancel before copy');
  controller.abort(reason);
  await assert.rejects(createNotesSnapshot({ source, stage, signal: controller.signal }, () => assert.fail('Cancelled input must not copy')), (error) => error === reason);
  await assert.rejects(realpath(directory), { code: 'ENOENT' });
}));

test('cancellation during copying cleans up and never returns a completed snapshot', async () => fixture(async ({ source, stage, directory }) => {
  const before = await fingerprint(source);
  const controller = new AbortController();
  const reason = new Error('cancel during copy');
  let copies = 0;
  await assert.rejects(createNotesSnapshot({ source, stage, signal: controller.signal, onRetry: () => assert.fail('Cancellation must not retry') }, async (...args) => {
    copies++;
    await copyNotes(...args);
    controller.abort(reason);
  }), (error) => error === reason);
  assert.equal(copies, 1);
  await assert.rejects(realpath(directory), { code: 'ENOENT' });
  assert.equal(await fingerprint(source), before);
}));

test('cancellation after a mismatch prevents the next copy and removes its predecessor', async () => fixture(async ({ source, stage, directory }) => {
  const controller = new AbortController();
  let copies = 0;
  await assert.rejects(createNotesSnapshot({ source, stage, signal: controller.signal, onRetry: () => controller.abort() }, async (root, destination) => {
    copies++;
    await copyNotes(root, destination);
    await put(join(source, '日记/图 片.txt'), 'changed');
  }), { name: 'AbortError' });
  assert.equal(copies, 1);
  await assert.rejects(realpath(directory), { code: 'ENOENT' });
}));

test('allowed symlinks are rebased into the verified snapshot', async (t) => fixture(async ({ source, stage }) => {
  const directoryLink = join(source, 'shortcut');
  await symlink(join(source, '日记'), directoryLink, process.platform === 'win32' ? 'junction' : 'dir');
  try { await symlink(join(source, '日记/图 片.txt'), join(source, 'alias.txt'), 'file'); }
  catch (error) {
    if (error.code !== 'EPERM') throw error;
    t.diagnostic('File symlinks require Windows privileges; directory junction rebasing remains covered.');
  }
  const before = await fingerprint(source);
  const result = await createNotesSnapshot({ source, stage });
  assert.equal(result.digest, before);
  assert.equal(await fingerprint(result.directory), before);
  assert.equal(await realpath(join(result.directory, 'shortcut')), join(result.directory, '日记'));
  assert.equal(await readFile(join(result.directory, 'shortcut/图 片.txt'), 'utf8'), 'original attachment');
  assert.equal(await fingerprint(source), before);
}));

test('escaping symlinks fail without retries or writes outside the owned stage', async () => fixture(async ({ workspace, source, stage, directory }) => {
  const outside = join(workspace, 'outside');
  await put(join(outside, 'keep.txt'), 'outside input');
  await symlink(outside, join(source, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(createNotesSnapshot({ source, stage, onRetry: () => assert.fail('Escaping links must not retry') }, () => assert.fail('Invalid sources must not copy')), /symlink escapes notesDir/);
  await assert.rejects(realpath(directory), { code: 'ENOENT' });
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'outside input');
}));

test('source overlap is rejected before any source or stage files are removed', async () => fixture(async ({ workspace, stage, directory }) => {
  await put(join(directory, 'keep.md'), 'must not delete source');
  const nestedSource = join(stage, 'nested-Vault');
  await put(join(nestedSource, 'keep.md'), 'source inside stage');
  for (const source of [workspace, stage, directory, nestedSource]) {
    await assert.rejects(createNotesSnapshot({ source, stage }), /must not overlap/);
    assert.equal(await readFile(join(directory, 'keep.md'), 'utf8'), 'must not delete source');
    assert.equal(await readFile(join(stage, 'keep.txt'), 'utf8'), 'unrelated stage file');
    assert.equal(await readFile(join(nestedSource, 'keep.md'), 'utf8'), 'source inside stage');
  }
}));

test('cleanup failures retain the original error and refuse to follow an escaping destination', async () => fixture(async ({ workspace, source, stage, directory }) => {
  const outside = join(workspace, 'outside');
  await put(join(outside, 'keep.txt'), 'outside input');
  const failure = Object.assign(new Error('copy denied'), { code: 'EACCES' });
  await assert.rejects(createNotesSnapshot({ source, stage }, async () => {
    await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir');
    throw failure;
  }), (error) => {
    assert(error instanceof AggregateError);
    assert.equal(error.cause, failure);
    assert.equal(error.errors[0], failure);
    assert.match(error.errors[1].message, /Cleanup path escapes/);
    assert.match(error.message, /copy denied; cleanup failed/);
    return true;
  });
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'outside input');
}));
