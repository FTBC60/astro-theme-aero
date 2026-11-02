import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, writeFile, cp, rm, symlink } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { notesLoader } from '../../src/lib/notes-loader.ts';
import { createMarkdownProcessor, parseFrontmatter } from '@astrojs/markdown-remark';
import { assetPlan, inside, noteId, resolveNoteAsset, resolveNotesDir } from '../../src/lib/note-assets.mjs';
import { createNoteCompilation, remarkNoteAssets } from '../../src/lib/note-compilation.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(project, '.astro');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const put = async (path, content) => { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, content); };
const exists = async (path) => readFile(path).then(() => true, () => false);

// Use Astro's real Markdown processor at the same seam as LoaderContext.
async function markdownRenderer(withAssets = true) {
  const processor = await createMarkdownProcessor({ remarkPlugins: withAssets ? [remarkNoteAssets] : [] });
  return async (markdown, options) => {
    const { frontmatter, content } = parseFrontmatter(markdown);
    const { code, metadata } = await processor.render(content, { frontmatter, fileURL: options?.fileURL });
    return { html: code, metadata };
  };
}

async function compilationFixture(run) {
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(join(cache, 'compilation-test-'));
  const settings = { root, base: '/blog/', cacheDir: pathToFileURL(join(root, '.cache') + '/') };
  const note = { id: 'day', file: join(root, 'day.md'), frontmatter: { title: 'Day', publish: true }, body: 'Plain text' };
  try { await run({ root, settings, note, render: await markdownRenderer() }); }
  finally { assert(root !== cache && inside(cache, root)); await rm(root, { recursive: true, force: true }); }
}

test('loader stores file paths relative to the site root on every platform', async () => {
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(join(cache, 'loader-path-test-'));
  const note = join(root, '.notes/2026-01-01/2026-01-01.md');
  const stored = [];
  try {
    await put(note, '---\ntitle: Test\ndate: "2026-01-01"\npublish: true\n---\nTest');
    await notesLoader('./.notes').load({
      config: { root: pathToFileURL(root + '/'), cacheDir: pathToFileURL(join(root, '.cache') + '/'), base: '/' },
      parseData: async ({ data }) => data,
      renderMarkdown: await markdownRenderer(),
      generateDigest: () => 'test',
      store: { clear() {}, set(entry) {
        assert.equal(isAbsolute(entry.filePath), false, 'Astro store requires a site-relative path');
        assert(!entry.filePath.includes('\\'));
        stored.push(entry);
      } },
    });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].filePath, relative(root, note).replaceAll('\\', '/'));
  } finally { assert(inside(cache, root)); await rm(root, { recursive: true, force: true }); }
});

test('attachment resolution, Markdown references, covers and output conflicts', async () => {
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(join(cache, 'asset-test-'));
  try {
    const file = join(root, 'day/day.md');
    await put(file, '');
    await put(join(root, 'day/图 片.png'), png);
    await put(join(root, 'shared/file.txt'), 'shared');
    const note = { root, file, id: '日记/day', base: '/blog/' };
    const assets = [];
    assert.equal(await resolveNoteAsset('./图%20片.png', note, assets), './%E5%9B%BE%20%E7%89%87.png');
    assert.equal(await resolveNoteAsset('../shared/file.txt#section', note, assets), './_attachments/shared/file.txt#section');
    assert.equal(await resolveNoteAsset('https://example.com/photo.jpg', note, assets), 'https://example.com/photo.jpg');
    assert.equal(await resolveNoteAsset('/image/cover.jpg', note, assets), '/blog/image/cover.jpg');
    await assert.rejects(resolveNoteAsset('missing.jpg', note, assets), /Missing attachment/);
    await assert.rejects(resolveNoteAsset('../../package.json', note, assets), /escapes notesDir/);
    await assert.rejects(resolveNotesDir(root, 'missing'), /Cannot read notesDir/);
    await assert.rejects(resolveNotesDir(root, 'day/day.md'), /not a directory/);
    await put(join(root, '.hidden.md'), '---\npublish: true\n---\nHidden');
    await assert.rejects(resolveNoteAsset('../.hidden.md', note, assets, 'link'), /hidden note/);
    assert.equal(await resolveNotesDir(root, './day'), join(root, 'day'));
    assert.equal(noteId('日记/My Note.md', {}), '日记/my-note');
    assert.equal(noteId('day/day.md', { slug: 'day' }), 'day');
    const compilation = createNoteCompilation({ root, base: note.base, cacheDir: pathToFileURL(join(root, '.cache') + '/') });
    const result = await compilation.compile({ ...note, frontmatter: { cover: './图%20片.png' }, body: '![safe <alt>][photo]\n\n[photo]: ./图%20片.png\n\n[download](../shared/file.txt)\n\n![remote](https://example.com/photo.jpg)' }, await markdownRenderer());
    assert.match(result.rendered.html, /src="\/blog\/posts\/%E6%97%A5%E8%AE%B0\/day\/%E5%9B%BE%20%E7%89%87.png"/);
    assert.deepEqual(result.rendered.metadata.localImagePaths, []);
    assert.deepEqual(result.rendered.metadata.remoteImagePaths, []);
    assert.equal(result.cover, '/blog/posts/%E6%97%A5%E8%AE%B0/day/%E5%9B%BE%20%E7%89%87.png');
    assert.deepEqual(Object.keys(result.rendered.metadata.frontmatter), ['cover']);
    await compilation.writePlan();
    assert.equal((await compilation.readPlan()).assets.length, 2);
    assert.throws(() => assetPlan([{ source: 'x', target: 'posts/day/index.html' }], ['day']), /collision/);
    assert.throws(() => assetPlan([{ source: 'x', target: 'posts/day/a' }, { source: 'y', target: 'posts/day/a/b' }], ['day']), /collision/);
    assert.throws(() => assetPlan([{ source: 'x', target: 'posts/day/A.jpg' }, { source: 'y', target: 'posts/day/a.jpg' }], ['day']), /collision/);
    try {
      await symlink(join(project, 'package.json'), join(root, 'day/outside.json'));
      await assert.rejects(resolveNoteAsset('outside.json', note, assets), /escapes notesDir/);
    } catch (error) { if (error.code !== 'EPERM') throw error; }
  } finally { assert(inside(cache, root)); await rm(root, { recursive: true, force: true }); }
});

test('compilation distinguishes a completed empty result from missing remark handling', async () => compilationFixture(async ({ settings, note, render }) => {
  const compilation = createNoteCompilation(settings);
  const result = await compilation.compile(note, render);
  assert.match(result.rendered.html, /Plain text/);
  assert.equal(result.cover, undefined);
  assert.deepEqual(result.rendered.metadata.frontmatter, note.frontmatter);
  await compilation.writePlan();
  assert.deepEqual((await compilation.readPlan()).assets, []);
  const ordinaryRenderer = await markdownRenderer(false);
  for (const frontmatter of [note.frontmatter, { ...note.frontmatter, cover: './cover.png' }]) {
    const incomplete = createNoteCompilation(settings);
    await assert.rejects(incomplete.compile({ ...note, frontmatter }, ordinaryRenderer), /Incomplete note compilation[\s\S]*remarkNoteAssets/);
    await assert.rejects(incomplete.writePlan(), /Cannot save an incomplete/);
  }
}));

test('compilation rejects missing HTML and a result returned for a different note', async () => compilationFixture(async ({ settings, note, render }) => {
  let previous;
  await createNoteCompilation(settings).compile(note, async (...args) => {
    previous = await render(...args);
    return previous;
  });
  await assert.rejects(createNoteCompilation(settings).compile({ ...note, id: 'other' }, async () => previous), /Incomplete note compilation/);
  await assert.rejects(createNoteCompilation(settings).compile(note, async (...args) => ({ ...await render(...args), html: undefined })), /Incomplete note compilation/);
}));

test('an unfinished or failed compilation cannot replace the last complete plan', async () => compilationFixture(async ({ root, settings, note, render }) => {
  const first = createNoteCompilation(settings);
  await first.compile(note, render);
  await first.writePlan();
  const [filename] = await readdir(settings.cacheDir);
  const manifest = new URL(filename, settings.cacheDir);
  const previous = await readFile(manifest, 'utf8');
  const batch = createNoteCompilation(settings);
  let resume;
  const gate = new Promise((done) => { resume = done; });
  const pending = batch.compile(note, async (...args) => { await gate; return render(...args); });
  await assert.rejects(batch.writePlan(), /Cannot save an incomplete/);
  resume();
  await pending;
  await assert.rejects(batch.compile({ ...note, id: 'broken' }, async () => ({ html: '<p>Incomplete</p>' })), /Incomplete note compilation/);
  await assert.rejects(batch.writePlan(), /Cannot save an incomplete/);
  assert.equal(await readFile(manifest, 'utf8'), previous);
  assert.deepEqual(await readdir(join(root, '.cache')), [filename]);
}));

test('plan readers reject mismatched provenance, unsupported versions and malformed assets', async () => compilationFixture(async ({ root, settings, note, render }) => {
  await put(join(root, 'file.txt'), 'attachment');
  const compilation = createNoteCompilation(settings);
  await compilation.compile({ ...note, body: '[file](file.txt)' }, render);
  await compilation.writePlan();
  await assert.rejects(createNoteCompilation({ ...settings, root: join(root, 'other') }).readPlan(), /does not match/);
  await assert.rejects(createNoteCompilation({ ...settings, base: '/' }).readPlan(), /does not match/);
  const [filename] = await readdir(settings.cacheDir);
  const manifest = new URL(filename, settings.cacheDir);
  const valid = JSON.parse(await readFile(manifest, 'utf8'));
  const mutations = [
    { ...valid, version: valid.version + 1 }, { ...valid, assets: null }, { ...valid, postIds: ['day', 'day'] },
    { ...valid, assets: [{ source: join(root, '..', 'outside.txt'), target: 'posts/day/file.txt' }] },
    { ...valid, assets: [{ source: join(root, 'private.md'), target: 'posts/day/private.md' }] },
    { ...valid, assets: [{ source: join(root, 'file.txt'), target: 'posts/other/file.txt' }] },
    { ...valid, assets: [{ source: join(root, 'file.txt'), target: 'posts/day/../file.txt' }] },
    { ...valid, assets: [{ source: join(root, 'file.txt'), target: 'posts/day/index.html' }] },
  ];
  for (const plan of mutations) {
    await writeFile(manifest, JSON.stringify(plan));
    await assert.rejects(compilation.readPlan(), /does not match|Invalid attachment|collision/);
  }
  await writeFile(manifest, '{');
  await assert.rejects(compilation.readPlan(), /Cannot read attachment plan/);
  await writeFile(manifest, JSON.stringify(valid));
  assert.equal((await compilation.readPlan()).assets.length, 1);
  await rm(manifest);
  await assert.rejects(compilation.readPlan(), /Cannot read attachment plan/);
}));

test('the complete batch checks cross-note collisions and replaces obsolete attachments', async () => compilationFixture(async ({ root, settings, note, render }) => {
  await put(join(root, 'folder'), 'attachment');
  const first = createNoteCompilation(settings);
  await first.compile({ ...note, body: '[file](folder)' }, render);
  await first.writePlan();
  const conflicting = createNoteCompilation(settings);
  await conflicting.compile({ ...note, id: 'a', body: '[file](folder)' }, render);
  await conflicting.compile({ ...note, id: 'a/folder' }, render);
  await assert.rejects(conflicting.writePlan(), /collision/);
  assert.equal((await first.readPlan()).assets.length, 1);
  const withdrawn = createNoteCompilation(settings);
  await withdrawn.writePlan();
  assert.deepEqual((await first.readPlan()).assets, []);
}));

test('loader failure preserves stored entries and the previous complete plan', async () => compilationFixture(async ({ root, settings }) => {
  await put(join(root, 'day.md'), '---\ntitle: Day\ndate: "2026-10-29"\npublish: true\ncover: ./cover.png\n---\nBody');
  await put(join(root, 'cover.png'), png);
  const stored = [];
  let cleared = 0;
  const context = {
    config: { root: pathToFileURL(root + '/'), cacheDir: settings.cacheDir, base: settings.base },
    parseData: async ({ data }) => data,
    renderMarkdown: await markdownRenderer(), generateDigest: () => 'test',
    store: { clear() { cleared++; stored.length = 0; }, set(entry) { stored.push(entry); } },
  };
  await notesLoader('.').load(context);
  assert.equal(cleared, 1);
  const previous = structuredClone(stored);
  assert.equal(stored[0].data.cover, '/blog/posts/day/cover.png');
  await assert.rejects(notesLoader('.').load({ ...context, renderMarkdown: await markdownRenderer(false) }), /Incomplete note compilation/);
  assert.equal(cleared, 1);
  assert.deepEqual(stored, previous);
  assert.equal((await createNoteCompilation(settings).readPlan()).assets.length, 1);
}));

test('build external notes, refresh attachments, switch roots and fail on invalid inputs', { timeout: 180000 }, async () => {
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(join(cache, 'content-test-'));
  const cli = join(project, 'node_modules/astro/bin/astro.mjs');
  const build = (expectedError) => {
    try {
      execFileSync(process.execPath, [cli, 'build', '--root', root], { cwd: cache, stdio: 'pipe', encoding: 'utf8' });
      assert(!expectedError, `Expected build failure: ${expectedError}`);
    } catch (error) {
      if (!expectedError) throw new Error(`${error.stdout || ''}\n${error.stderr || ''}`);
      assert.match(`${error.stdout || ''}\n${error.stderr || ''}`, expectedError);
    }
  };
  const configure = (directory) => put(join(root, 'src/config/content.config.ts'), `export const contentConfig = { notesDir: ${JSON.stringify(directory)} };`);
  try {
    for (const directory of ['src', 'public']) await cp(join(project, directory), join(root, directory), { recursive: true });
    for (const name of ['package.json', 'tsconfig.json', 'astro.config.mjs']) await cp(join(project, name), join(root, name));
    const config = join(root, 'astro.config.mjs');
    await writeFile(config, (await readFile(config, 'utf8')).replace("output: 'static',", "output: 'static', base: '/blog/',"));
    const notes = join(root, 'vault/Notes');
    const daily = join(notes, 'day/day.md');
    const original = '---\ntitle: 测试日记\ndate: "2026-10-02"\npublish: true\nslug: "2026-10-02"\ncover: ./图%20片.png\n---\n\n![图片](./图%20片.png)\n\n[下载](docs/report.pdf#page=1)\n\n![参考][photo]\n\n[photo]: ./图%20片.png\n\n[共享](../shared/shared.txt)\n\n[另一篇](../second.md#heading)\n\n$a^2$\n\n```js\nconst x = 1;\n```';
    await put(daily, original);
    await put(join(notes, 'day/图 片.png'), png);
    await put(join(notes, 'day/docs/report.pdf'), 'PDF');
    await put(join(notes, 'shared/shared.txt'), 'first');
    await put(join(notes, 'day/unused.txt'), 'DO_NOT_PUBLISH');
    await put(join(notes, 'second.md'), '---\ntitle: 第二篇\ndate: "2026-10-03"\npublish: true\nslug: 中文/第二篇\n---\nSecond');
    await put(join(notes, 'private.md'), '---\ntitle: PRIVATE_NOTE\ndate: "2026-10-01"\npublish: false\n---\n![missing](missing.png)');
    await configure('./vault/Notes');
    build();
    const output = join(root, 'dist/posts/2026-10-02');
    assert.deepEqual(await readFile(join(output, '图 片.png')), png);
    assert.equal(await readFile(join(output, 'docs/report.pdf'), 'utf8'), 'PDF');
    assert.equal(await exists(join(output, 'unused.txt')), false);
    const html = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(html, /src="\/blog\/posts\/2026-10-02\/%E5%9B%BE%20%E7%89%87.png"/);
    assert.match(html, /href="\.\/docs\/report.pdf#page=1"/);
    assert.match(html, /href="\/blog\/posts\/%E4%B8%AD%E6%96%87\/%E7%AC%AC%E4%BA%8C%E7%AF%87\/#heading"/);
    assert.match(html, /mjx-container/);
    assert.match(html, /astro-code/);
    const home = await readFile(join(root, 'dist/index.html'), 'utf8');
    assert.match(home, /src="\/blog\/posts\/2026-10-02\/%E5%9B%BE%20%E7%89%87.png"/);
    assert(!home.includes('/blog/blog/') && !home.includes('PRIVATE_NOTE') && !home.includes('Welcome to Aero'));
    assert.equal(await exists(join(root, 'dist/posts/private/index.html')), false);
    const registered = await readFile(config, 'utf8');
    await writeFile(config, registered.replace('[remarkMath, remarkNoteAssets]', '[remarkMath]'));
    build(/Incomplete note compilation[\s\S]*remarkNoteAssets/);
    await writeFile(config, registered);
    await writeFile(config, registered.replace('noteAssets(contentConfig), ', ''));
    build(/requires the noteAssets integration/);
    await writeFile(config, registered);
    await put(join(root, 'mismatched-notes/unused.md'), '---\ntitle: Unused\ndate: "2026-10-29"\n---\nUnused');
    await writeFile(config, registered.replace('noteAssets(contentConfig)', "noteAssets({ notesDir: './mismatched-notes' })"));
    build(/Attachment plan does not match/);
    await writeFile(config, registered);
    await put(join(notes, 'shared/shared.txt'), 'updated without editing Markdown');
    build();
    assert.equal(await readFile(join(output, '_attachments/shared/shared.txt'), 'utf8'), 'updated without editing Markdown');
    await put(daily, original + '\n![missing](missing.png)');
    build(/Missing attachment/);
    await put(join(root, 'vault/outside.txt'), 'outside');
    await put(daily, original + '\n[outside](../../outside.txt)');
    build(/escapes notesDir/);
    await put(join(notes, 'day/index.html'), 'collision');
    await put(daily, original + '\n[collision](index.html)');
    build(/collision/);
    await put(daily, original + '\n[private](../private.md)');
    build(/unpublished note/);
    await put(daily, original.replace('publish: true', 'publish: "true"'));
    build();
    assert.equal(await exists(join(output, 'index.html')), false, 'A string publish value does not opt a note into publication');
    await put(daily, original);
    await put(join(notes, 'duplicate.md'), '---\ntitle: Duplicate\ndate: "2026-10-01"\npublish: true\nslug: "2026-10-02"\n---\nDuplicate');
    build(/Duplicate note ID/);
    await rm(join(notes, 'duplicate.md'));
    const publicConflict = join(root, 'public/posts/2026-10-02/图 片.png');
    await put(publicConflict, png);
    build(/Attachment collides with a generated page or public file/);
    await rm(publicConflict);
    const alternate = join(root, 'other-notes');
    await put(join(alternate, 'replacement.md'), '---\ntitle: Replacement\ndate: "2026-10-04"\npublish: true\n---\nReplacement body');
    await configure(alternate);
    build();
    assert(await exists(join(root, 'dist/posts/replacement/index.html')));
    assert.equal(await exists(join(output, 'index.html')), false);
    assert.equal(await exists(join(output, '图 片.png')), false);
    await put(join(alternate, 'replacement.md'), '---\ntitle: Replacement\ndate: "2026-10-04"\npublish: false\n---\nReplacement body');
    build();
    assert.equal(await exists(join(root, 'dist/posts/replacement/index.html')), false);
    await configure(join(root, 'missing-notes'));
    build(/Cannot read notesDir/);
  } finally { assert(inside(cache, root)); await rm(root, { recursive: true, force: true }); }
});

test('dev serves referenced attachments and refreshes after edits and withdrawal', { timeout: 60000 }, async () => {
  await mkdir(cache, { recursive: true });
  // Vite ignores .astro paths for config-file watching, so exercise restarts in a normal project directory.
  const root = await mkdtemp(join(project, 'aero-content-dev-test-'));
  let child;
  let log = '';
  const waitFor = async (check) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try { if (await check()) return; } catch {}
      await new Promise((done) => setTimeout(done, 150));
    }
    throw new Error(`Development server did not reach expected state:\n${log.slice(0, 2000)}\n${log.slice(-3000)}`);
  };
  try {
    for (const directory of ['src', 'public']) await cp(join(project, directory), join(root, directory), { recursive: true });
    for (const name of ['package.json', 'tsconfig.json', 'astro.config.mjs']) await cp(join(project, name), join(root, name));
    const config = join(root, 'astro.config.mjs');
    await writeFile(config, (await readFile(config, 'utf8')).replace("output: 'static',", "output: 'static', base: '/blog/',"));
    await put(join(root, 'src/config/content.config.ts'), "export const contentConfig = { notesDir: './notes' };");
    const file = join(root, 'notes/day.md');
    const markdown = '---\ntitle: Dev Note\ndate: "2026-10-02"\npublish: true\ncover: ./photo.png\n---\n![photo](photo.png)\n[download](document.txt)';
    await put(file, markdown);
    await put(join(root, 'notes/photo.png'), png);
    await put(join(root, 'notes/document.txt'), 'first');
    const socket = createServer();
    await new Promise((done) => socket.listen(0, '127.0.0.1', done));
    const port = socket.address().port;
    await new Promise((done) => socket.close(done));
    child = spawn(process.execPath, [join(project, 'node_modules/astro/bin/astro.mjs'), 'dev', '--root', root, '--host', '127.0.0.1', '--port', String(port)], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data) => { log += data; });
    child.stderr.on('data', (data) => { log += data; });
    const url = `http://127.0.0.1:${port}/blog/posts/day/`;
    const get = (path = '') => fetch(url + path, { signal: AbortSignal.timeout(2000) });
    await waitFor(async () => (await (await get()).text()).includes('Dev Note'));
    const image = await get('photo.png');
    assert.equal(image.status, 200, log);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    assert.equal(await (await get('document.txt')).text(), 'first');
    await put(join(root, 'notes/document.txt'), 'updated');
    await waitFor(async () => (await (await get('document.txt')).text()) === 'updated');
    await put(file, markdown.replace('Dev Note', 'Edited Note'));
    await waitFor(async () => (await (await get()).text()).includes('Edited Note'));
    await put(file, markdown.replace('publish: true', 'publish: false'));
    await waitFor(async () => (await get()).status === 404 && (await get('photo.png')).status === 404);
    await put(file, markdown);
    await waitFor(async () => (await get()).status === 200 && (await get('photo.png')).status === 200);
    await put(join(root, 'other-notes/new.md'), markdown.replace('Dev Note', 'New directory'));
    await put(join(root, 'other-notes/photo.png'), png);
    await put(join(root, 'other-notes/document.txt'), 'new directory attachment');
    await put(join(root, 'src/config/content.config.ts'), "export const contentConfig = { notesDir: './other-notes' };");
    const replacement = `http://127.0.0.1:${port}/blog/posts/new/`;
    const getReplacement = (path = '') => fetch(replacement + path, { signal: AbortSignal.timeout(2000) });
    await waitFor(async () => (await (await getReplacement()).text()).includes('New directory'));
    await waitFor(async () => (await get()).status === 404 && (await get('photo.png')).status === 404);
    assert.equal(await (await getReplacement('document.txt')).text(), 'new directory attachment');
    await rm(join(root, 'other-notes/new.md'));
    await waitFor(async () => (await getReplacement()).status === 404 && (await getReplacement('photo.png')).status === 404);
  } finally {
    if (child && child.exitCode === null) {
      const stopped = new Promise((done) => child.once('exit', done));
      child.kill();
      await stopped;
    }
    assert(inside(project, root));
    await rm(root, { recursive: true, force: true });
  }
});
