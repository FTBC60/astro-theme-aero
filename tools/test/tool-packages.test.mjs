import assert from 'node:assert/strict';
import test from 'node:test';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMarkdownProcessor, parseFrontmatter } from '@astrojs/markdown-remark';
import { assetPlan, inside } from '../../src/lib/note-assets.mjs';
import { createNoteCompilation, remarkNoteAssets } from '../../src/lib/note-compilation.mjs';
import { resourceDelivery } from '../../src/lib/note-resource-plan.mjs';
import { createNoteResources } from '../../src/lib/note-resources.mjs';
import noteAssets from '../../src/integrations/note-assets.mjs';
import { createToolArchive } from '../../src/lib/tool-package.mjs';
import { unzipSync } from 'fflate';

const cache = fileURLToPath(new URL('../../.astro/', import.meta.url));
const put = async (file, data = '') => { await mkdir(dirname(file), { recursive: true }); await writeFile(file, data); };
async function fixture(run) {
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(join(cache, 'tool-package-test-'));
  const processor = await createMarkdownProcessor({ remarkPlugins: [remarkNoteAssets] });
  const render = async (markdown, options) => {
    const { frontmatter, content } = parseFrontmatter(markdown);
    const result = await processor.render(content, { frontmatter, fileURL: options?.fileURL });
    return { html: result.code, metadata: result.metadata };
  };
  const settings = { root, base: '/blog/', cacheDir: pathToFileURL(join(root, '.cache') + '/') };
  const note = { root, base: '/blog/', file: join(root, 'day/note.md'), id: '日记/day', frontmatter: {}, body: '![iframe: Clock](./clock/index.html)' };
  const directory = join(root, 'day/clock');
  await put(note.file);
  const manifest = async (files, options = {}) => put(join(directory, 'manifest.json'), JSON.stringify({ version: 1, files, ...options }));
  await put(join(directory, 'index.html'), '<script src="./app.js"></script>');
  await put(join(directory, 'app.js'), 'document.body.dataset.ready="yes"');
  await manifest(['index.html', 'app.js']);
  try { await run({ root, directory, settings, note, render, manifest }); }
  finally { assert(inside(cache, root) && root !== cache); await rm(root, { recursive: true, force: true }); }
}

test('package files use the entry mapping, retain bytes, and do not scan HTML dependencies', async () => fixture(async ({ directory, note, settings, render, manifest }) => {
  await put(join(directory, '资源/样式.css'), '/* 原字节 */');
  await put(join(directory, 'unused.js'), 'NOT_SELECTED');
  await put(join(directory, 'index.html'), '<script src="missing-dynamic-dependency.js"></script>');
  await manifest(['index.html', 'app.js', '资源/样式.css']);
  const compilation = createNoteCompilation(settings);
  const result = await compilation.compile({ ...note, body: note.body + '\n\n' + note.body }, render);
  await compilation.writePlan();
  const plan = await compilation.readPlan();
  assert.equal(plan.assets.length, 3);
  assert.deepEqual(plan.assets.map(x => x.target), ['posts/日记/day/clock/index.html', 'posts/日记/day/clock/app.js', 'posts/日记/day/clock/资源/样式.css']);
  assert(plan.assets.every(x => Object.keys(x).sort().join(',') === 'source,target'));
  assert.deepEqual(plan.toolEntries, [{ entry: 'posts/日记/day/clock/index.html', files: ['index.html', 'app.js', '资源/样式.css'] }]);
  assert.equal((result.rendered.html.match(/<iframe /g) || []).length, 2);
  assert.match(result.rendered.html, /sandbox="allow-scripts allow-downloads"/);
  assert(result.rendered.html.includes('/blog/posts/%E6%97%A5%E8%AE%B0/day/clock/index.html'));
  assert(!JSON.stringify(result.rendered.metadata).includes('toolEntries'), 'private compilation metadata must not reach Astro store');
  assert.equal(await readFile(plan.assets[2].source, 'utf8'), '/* 原字节 */');
}));

test('per-note resource collection validates before finalizing and cannot publish failed selections', async () => fixture(async ({ root, note }) => {
  const pending = createNoteResources(note);
  const inFlight = pending.resolve('./clock/index.html', 'link');
  assert.throws(() => pending.finish(), /Cannot finish an incomplete/);
  await inFlight;
  const selected = pending.finish();
  assert.equal(selected.assets.length, 2);
  assert.deepEqual(selected.toolEntries, [{ entry: 'posts/日记/day/clock/index.html', files: ['index.html', 'app.js'] }]);
  assert.throws(() => pending.finish(), /Cannot finish/);
  await assert.rejects(pending.resolve('./clock/app.js'), /finished/);

  const failed = createNoteResources(note);
  await failed.resolve('./clock/app.js');
  await assert.rejects(failed.resolve('./missing.js'), /Missing attachment/);
  assert.throws(() => failed.finish(), /Cannot finish/);
  await assert.rejects(failed.resolve('./clock/index.html', 'link'), /failed/);

  await put(join(root, 'day/index.html'), '<p>collision</p>');
  const conflicting = createNoteResources(note);
  await conflicting.resolve('./index.html', 'image');
  assert.throws(() => conflicting.finish(), /collision/);
  assert.throws(() => conflicting.finish(), /Cannot finish/);
}));

test('shared packages and nested IDs have independent complete copies through either Markdown form', async () => fixture(async ({ root, note, settings, render }) => {
  const compilation = createNoteCompilation(settings);
  for (const id of ['first', 'changed/slug']) {
    const file = join(root, id + '/note.md');
    await put(file);
    await compilation.compile({ ...note, id, file, body: '![iframe: Shared](../' + (id.includes('/') ? '../' : '') + 'day/clock/index.html)' }, render);
  }
  await compilation.writePlan();
  const plan = await compilation.readPlan();
  for (const id of ['first', 'changed/slug']) assert.deepEqual(plan.assets.filter(x => x.target.startsWith(`posts/${id}/`)).map(x => x.target), [
    `posts/${id}/_attachments/day/clock/index.html`, `posts/${id}/_attachments/day/clock/app.js`,
  ]);
  const resources = createNoteResources(note);
  await resources.resolve('./clock/index.html?mode=plain#panel', 'link');
  const selected = resources.finish();
  assert.equal(selected.assets.length, 2);
  assert.deepEqual(selected.toolEntries, [{ entry: 'posts/日记/day/clock/index.html', files: ['index.html', 'app.js'] }]);
  await assert.rejects(createNoteResources(note).resolve('./clock/manifest.json', 'link'), /build metadata/);
}));

test('link-only articles expand local and shared entries, preserve suffixes and inline formatting, and deduplicate mixed references', async () => fixture(async ({ root, note, settings, render }) => {
  for (const base of ['/', '/blog/']) {
    const compilation = createNoteCompilation({ ...settings, base });
    const result = await compilation.compile({ ...note, body: '[**Open** clock](./clock/index.html?mode=plain&size=2#panel "Clock title")\n\n[Reference clock][clock]\n\n[clock]: ./clock/index.html?mode=ref#result' }, render);
    assert.doesNotMatch(result.rendered.html, /<iframe/);
    assert.match(result.rendered.html, /href="\.\/clock\/index.html\?mode=plain(?:&amp;|&#x26;)size=2#panel"/);
    assert.match(result.rendered.html, /title="Clock title"/);
    assert.match(result.rendered.html, /<strong>Open<\/strong> clock<\/a>/);
    assert.equal((result.rendered.html.match(/target="_blank"/g) || []).length, 2);
    assert.equal((result.rendered.html.match(/data-astro-reload/g) || []).length, 2);
    assert.match(result.rendered.html, /href="\.\/clock\/index.html\?mode=ref#result"/);
    const sharedNote = join(root, 'elsewhere/note.md');
    await put(sharedNote);
    await compilation.compile({ ...note, id: 'shared', file: sharedNote, body: '[Shared](../day/clock/index.html#shared)' }, render);
    await compilation.writePlan();
    const plan = await compilation.readPlan();
    assert.deepEqual(plan.assets.map(asset => asset.target), [
      'posts/日记/day/clock/index.html', 'posts/日记/day/clock/app.js',
      'posts/shared/_attachments/day/clock/index.html', 'posts/shared/_attachments/day/clock/app.js',
    ]);
    assert.equal(plan.toolEntries.length, 2);
  }
  const mixed = createNoteCompilation(settings);
  await mixed.compile({ ...note, body: note.body + '\n\n[Open](./clock/index.html)' }, render);
  await mixed.writePlan();
  assert.equal((await mixed.readPlan()).assets.length, 2);
  assert.equal((await mixed.readPlan()).toolEntries.length, 1);
}));

test('linked packages reject invalid selections while ordinary HTML and other link kinds retain their mapping', async () => fixture(async ({ root, directory, note, manifest }) => {
  await put(join(directory, 'page.html'), '<p>another page</p>');
  const page = createNoteResources(note);
  await page.resolve('./clock/page.html#part', 'link');
  assert.equal(page.finish().assets.length, 1);
  for (const files of [['index.html', 'missing.js'], ['index.html', '../private.txt'], ['index.html', 'APP.js']]) {
    await manifest(files);
    await assert.rejects(createNoteResources(note).resolve('./clock/index.html?mode=x#part', 'link'), /Invalid tool package/);
  }
  await put(join(directory, 'manifest.json'), '{');
  await assert.rejects(createNoteResources(note).resolve('./clock/index.html', 'link'), /valid JSON/);
  await manifest(['index.html', 'app.js']);
  const outside = createNoteResources(note);
  assert.equal((await outside.resolve('https://example.com/index.html', 'link')).url, 'https://example.com/index.html');
  assert.equal((await outside.resolve('/index.html', 'link')).url, '/blog/index.html');
  assert.equal(outside.finish().assets.length, 0);
  const image = createNoteResources(note);
  await image.resolve('./clock/index.html', 'image');
  assert.equal(image.finish().assets.length, 1);
  await put(join(root, 'single/index.html'), '<p>legacy</p>');
  const single = createNoteResources(note);
  await single.resolve('../single/index.html?x=1#part', 'link');
  assert.equal(single.finish().assets.length, 1);
}));

test('only the entry-directory manifest is reserved; nested and unrelated manifests are ordinary JSON assets', async () => fixture(async ({ root, directory, note, settings, render, manifest }) => {
  const data = '{"purpose":"runtime data, not a package control file"}\n';
  await put(join(directory, 'data/manifest.json'), data);
  await manifest(['index.html', 'app.js', 'data/manifest.json']);
  const compilation = createNoteCompilation(settings);
  await compilation.compile({ ...note, body: note.body + '\n\n[data](./clock/data/manifest.json)' }, render);
  await compilation.writePlan();
  const plan = await compilation.readPlan();
  assert.deepEqual(plan.assets.map(asset => asset.target), [
    'posts/日记/day/clock/index.html',
    'posts/日记/day/clock/app.js',
    'posts/日记/day/clock/data/manifest.json',
  ]);
  assert.equal(await readFile(plan.assets[2].source, 'utf8'), data);

  await put(join(root, 'data/manifest.json'), data);
  const attachments = createNoteResources(note);
  assert.equal((await attachments.resolve('../data/manifest.json', 'link')).url, './_attachments/data/manifest.json');
  assert.equal(attachments.finish().assets.length, 1);

  // A malformed control file is still reserved when directly linked.
  await put(join(directory, 'manifest.json'), '{');
  await assert.rejects(createNoteResources(note).resolve('./clock/manifest.json', 'link'), /build metadata/);
  await manifest(['index.html', 'manifest.json']);
  await assert.rejects(createNoteResources(note).resolve('./clock/index.html', 'tool'), /build metadata/);
}));

test('strict package schemas and paths reject malformed selections', async () => fixture(async ({ directory, note, manifest }) => {
  const resolve = () => createNoteResources(note).resolve('./clock/index.html', 'tool');
  const invalidSchemas = [null, [], {}, { version: 2, files: ['index.html'] }, { version: true, files: ['index.html'] }, { version: 1, files: [] }, { version: 1, files: ['app.js'] }, { version: 1, files: ['index.html'], name: 'unexpected' }, ...[null, 1, 'true', [], {}].map(download => ({ version: 1, files: ['index.html'], download }))];
  for (const schema of invalidSchemas) {
    await put(join(directory, 'manifest.json'), JSON.stringify(schema));
    await assert.rejects(resolve(), /Invalid tool package/);
  }
  await put(join(directory, 'manifest.json'), '{');
  await assert.rejects(resolve(), /valid JSON/);
  for (const name of ['', '../app.js', './app.js', 'a//x', '/app.js', 'C:/x', 'https://example.com/x.js', 'a\\b', 'a%20b.js', 'app.js?x', 'app.js#x', 'a\u0000.js', 'manifest.json', 'private.MD', 'component.astro', {}, 1, 'missing.js', 'APP.js']) {
    await manifest(['index.html', name]);
    await assert.rejects(resolve(), /Invalid tool package/, JSON.stringify(name));
  }
  await manifest(['index.html', 'app.js', 'app.js']);
  await assert.rejects(resolve(), /duplicate file/);
  await manifest(['index.html', 'directory']);
  await mkdir(join(directory, 'directory'));
  await assert.rejects(resolve(), /not a regular file/);
  await manifest(['index.html']);
  await put(join(directory, 'other.html'), '');
  await assert.rejects(createNoteResources(note).resolve('./clock/other.html', 'tool'), /through index.html/);
  await assert.rejects(createNoteResources(note).resolve('./CLOCK/index.html', 'tool'), /incorrect path case|Missing attachment/);
}));

test('download opt-in applies equally to iframe and ordinary references, with one archive per package', async () => fixture(async ({ note, settings, render, manifest }) => {
  for (const download of [undefined, false, true]) {
    await manifest(['index.html', 'app.js'], download === undefined ? {} : { download });
    const compilation = createNoteCompilation({ ...settings, downloadLabels: { html: '下载 HTML', zip: '下载 ZIP' } });
    const result = await compilation.compile({ ...note, body: note.body + '\n\n[**Open**](./clock/index.html?x=1#panel "Clock")' }, render);
    await compilation.writePlan();
    const plan = await compilation.readPlan();
    assert.equal(plan.archives.length, download === true ? 1 : 0);
    assert.equal((result.rendered.html.match(/download=/g) || []).length, download === true ? 2 : 0);
    assert.equal(plan.assets.length, 2);
    assert.match(result.rendered.html, /<strong>Open<\/strong><\/a>/);
    assert.match(result.rendered.html, /index.html\?x=1#panel/);
    assert(!JSON.stringify(result.rendered.metadata).includes('archives'));
    if (download === true) {
      assert.equal(plan.archives[0].target, 'posts/日记/day/clock.zip');
      assert.match(result.rendered.html, /aero-tool-toolbar/);
      assert.match(result.rendered.html, /下载 ZIP/);
      assert.match(result.rendered.html, /href="\/blog\/posts\/%E6%97%A5%E8%AE%B0\/day\/clock.zip"/);
    }
  }
}));

test('legacy HTML downloads keep the original bytes and remove open-only URL suffixes', async () => fixture(async ({ root, note, settings, render }) => {
  await put(join(root, 'legacy.html'), '<!doctype html><p>original bytes</p>');
  const compilation = createNoteCompilation(settings);
  const result = await compilation.compile({ ...note, body: '![iframe: Legacy](../legacy.html)\n\n[Legacy](../legacy.html?mode=open#panel)' }, render);
  await compilation.writePlan();
  const plan = await compilation.readPlan();
  assert.equal(plan.archives.length, 0);
  assert.equal(plan.assets.length, 1);
  assert.equal((result.rendered.html.match(/download="legacy.html"/g) || []).length, 2);
  assert.match(result.rendered.html, /href="\.\/_attachments\/legacy.html\?mode=open#panel"/);
  assert.equal((result.rendered.html.match(/href="\/blog\/posts\/%E6%97%A5%E8%AE%B0\/day\/_attachments\/legacy.html"/g) || []).length, 2);
  assert.equal(await readFile(plan.assets[0].source, 'utf8'), '<!doctype html><p>original bytes</p>');
}));

test('resource planning determines downloads and delivery resolves only selected outputs', async () => fixture(async ({ root, note, settings, render, manifest }) => {
  const entry = 'posts/日记/day/clock/index.html';
  const archive = 'posts/日记/day/clock.zip';
  const resource = (url, kind = 'link') => createNoteResources(note).resolve(url, kind);
  await manifest(['index.html', 'app.js']);
  assert.equal((await resource('./clock/index.html?mode=open#panel')).download, null);
  await manifest(['index.html', 'app.js'], { download: true });
  assert.deepEqual((await resource('./clock/index.html?mode=open#panel')).download, {
    kind: 'zip', url: '/blog/posts/%E6%97%A5%E8%AE%B0/day/clock.zip', name: 'clock.zip',
  });
  await put(join(root, 'day/legacy.html'), '<p>legacy</p>');
  assert.deepEqual((await resource('./legacy.html?mode=open#panel')).download, {
    kind: 'html', url: '/blog/posts/%E6%97%A5%E8%AE%B0/day/legacy.html', name: 'legacy.html',
  });
  assert.equal((await resource('https://example.com/legacy.html')).download, null);

  const compilation = createNoteCompilation(settings);
  await compilation.compile({ ...note, body: note.body + '\n\n[Legacy](./legacy.html)' }, render);
  await compilation.writePlan();
  const delivery = resourceDelivery(await compilation.readPlan());
  assert.equal(delivery.resolve('posts/日记/day/clock/').target, entry);
  assert.equal(delivery.resolve('posts/日记/day/clock/app.js', true).kind, 'file');
  assert.equal(delivery.resolve(archive, true).kind, 'archive');
  assert.equal(delivery.resolve('posts/日记/day/legacy.html', true), undefined);
  assert.equal(delivery.resolve('posts/日记/day/legacy.html').kind, 'file');
  assert.equal(delivery.resolve('posts/日记/day/clock/not-selected.js'), undefined);
  assert.deepEqual(delivery.outputs().map(output => output.target), [entry, 'posts/日记/day/clock/app.js', 'posts/日记/day/legacy.html', archive]);
}));

test('separately linked files in a package directory remain ordinary attachments with or without ZIP', async () => fixture(async ({ directory, note, settings, render, manifest }) => {
  await put(join(directory, 'extra.js'), 'ordinary attachment');
  for (const download of [false, true]) {
    await manifest(['index.html', 'app.js'], { download });
    const compilation = createNoteCompilation(settings);
    await compilation.compile({ ...note, body: `${note.body}\n\n[extra](./clock/extra.js)` }, render);
    await compilation.writePlan();
    const plan = await compilation.readPlan();
    const delivery = resourceDelivery(plan);
    const target = 'posts/日记/day/clock/extra.js';
    assert.deepEqual(plan.toolEntries[0].files, ['index.html', 'app.js']);
    assert.equal(delivery.resolve(target, true), undefined);
    assert.equal(delivery.resolve(target).packageMember, false);
    assert.equal(delivery.resolve('posts/日记/day/clock/app.js', true).packageMember, true);
    assert.equal(plan.archives.length, Number(download));
  }
}));

test('ZIP preserves selected UTF-8 and binary bytes, includes its validated control manifest, and is reproducible', async () => fixture(async ({ directory, note, settings, render, manifest }) => {
  await put(join(directory, 'vendor/中文.js'), '/* 中文 */\n');
  await put(join(directory, 'data/manifest.json'), '{"runtime":true}');
  await put(join(directory, 'binary.bin'), Buffer.from([0, 255, 1, 128]));
  await put(join(directory, 'README.txt'), 'Run with a local HTTP server.');
  await put(join(directory, 'unselected.txt'), 'must not appear');
  const files = ['index.html', 'app.js', 'vendor/中文.js', 'data/manifest.json', 'binary.bin', 'README.txt'];
  await manifest(files, { download: true });
  const compilation = createNoteCompilation(settings);
  await compilation.compile(note, render);
  await compilation.writePlan();
  const plan = await compilation.readPlan();
  const bytes = await createToolArchive(plan.archives[0], plan.assets, plan.root);
  assert.deepEqual(bytes, await createToolArchive(plan.archives[0], plan.assets, plan.root));
  const members = unzipSync(bytes);
  assert.deepEqual(Object.keys(members).sort(), [...files, 'manifest.json'].sort());
  for (const file of files) assert.deepEqual(Buffer.from(members[file]), await readFile(join(directory, file)));
  assert.deepEqual(JSON.parse(Buffer.from(members['manifest.json']).toString()), { version: 1, files, download: true });
  assert.deepEqual(Buffer.from(members['manifest.json']), await readFile(join(directory, 'manifest.json')));
  await manifest(files, { download: false });
  await assert.rejects(createToolArchive(plan.archives[0], plan.assets, plan.root), /manifest changed/);
  await manifest(files, { download: true });
  await rm(join(directory, 'app.js'));
  await assert.rejects(createToolArchive(plan.archives[0], plan.assets, plan.root), /missing file/);
}));

test('archive outputs participate in attachment, case and file-directory collisions', async () => {
  for (const file of ['clock.zip', 'CLOCK.ZIP', 'clock.zip/child.txt']) {
    await fixture(async ({ root, note, settings, render, manifest }) => {
      await manifest(['index.html', 'app.js'], { download: true });
      const good = createNoteCompilation(settings);
      await good.compile(note, render);
      await good.writePlan();
      const previous = await good.readPlan();
      await put(join(root, 'day', file), 'collision');
      const bad = createNoteCompilation(settings);
      await assert.rejects(bad.compile({ ...note, body: note.body + `\n\n[attachment](./${file})` }, render), /collision/);
      await assert.rejects(bad.writePlan(), /Cannot save/);
      assert.deepEqual(await good.readPlan(), previous);
    });
  }
});

test('cached archives must match planned entries and selected members', async () => fixture(async ({ note, settings, render, manifest }) => {
  await manifest(['index.html', 'app.js'], { download: true });
  const compilation = createNoteCompilation(settings);
  await compilation.compile(note, render);
  await compilation.writePlan();
  const file = new URL('aero-attachments.json', settings.cacheDir);
  const good = JSON.parse(await readFile(file, 'utf8'));
  const archive = good.archives[0];
  for (const replacement of [
    { ...archive, target: '../escape.zip' },
    { ...archive, entry: 'posts/other/index.html' },
    { ...archive, manifest: { ...archive.manifest, download: false } },
    { ...archive, manifest: { ...archive.manifest, files: ['index.html', 'unselected.js'] } },
    { ...archive, manifest: { ...archive.manifest, files: ['index.html', '../private.txt'] } },
  ]) {
    await writeFile(file, JSON.stringify({ ...good, archives: [replacement] }));
    await assert.rejects(compilation.readPlan(), /Invalid tool archive/);
  }
  await writeFile(file, JSON.stringify(good));
  assert.equal((await compilation.readPlan()).archives.length, 1);
  const entry = good.toolEntries[0];
  for (const replacement of [
    entry.entry,
    { ...entry, files: ['index.html', 'missing.js'] },
    { ...entry, files: ['index.html', '../other.js'] },
    { ...entry, files: ['index.html'] },
    { ...entry, entry: 'posts/other/index.html' },
    { ...entry, files: ['index.html', 'app.js'], other: true },
  ]) {
    await writeFile(file, JSON.stringify({ ...good, toolEntries: [replacement] }));
    await assert.rejects(compilation.readPlan(), /Invalid attachment plan/);
  }
  await writeFile(file, JSON.stringify({ ...good, version: 3 }));
  await assert.rejects(compilation.readPlan(), /format version/);
  await writeFile(file, JSON.stringify(good));
  assert.deepEqual((await compilation.readPlan()).toolEntries, [entry]);
}));

test('package metadata and parent junctions are rejected; legacy single HTML is unchanged', async (t) => fixture(async ({ root, directory, note, manifest }) => {
  await put(join(root, 'legacy.html'), '<p>legacy</p>');
  const resources = createNoteResources(note);
  await resources.resolve('../legacy.html', 'tool');
  const plan = resources.finish();
  assert.equal(plan.assets.length, 1);
  assert.deepEqual(plan.toolEntries, []);
  const shared = join(root, 'shared');
  await mkdir(shared);
  await put(join(shared, 'dep.js'), '');
  const linked = join(directory, 'linked');
  await symlink(shared, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await manifest(['index.html', 'linked/dep.js']);
  await assert.rejects(createNoteResources(note).resolve('./clock/index.html', 'tool'), /symbolic links/);
  await manifest(['index.html']);
  await symlink(directory, join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(createNoteResources(note).resolve('../alias/index.html', 'tool'), /symbolic links/);
  await assert.rejects(createNoteResources(note).resolve('../alias/index.html?mode=linked#panel', 'link'), /symbolic links/);
  try {
    await rm(join(directory, 'manifest.json'));
    await symlink(join(root, 'legacy.html'), join(directory, 'manifest.json'));
    await assert.rejects(createNoteResources(note).resolve('./clock/index.html', 'tool'), /symbolic links/);
  } catch (error) { if (error.code === 'EPERM') t.diagnostic('File-symlink creation not permitted; directory-junction cases still ran'); else throw error; }
}));

test('package targets share all attachment collision checks and failed compilation retains the last plan', async () => fixture(async ({ note, settings, render, manifest }) => {
  const first = createNoteCompilation(settings);
  await first.compile(note, render);
  await first.writePlan();
  const before = await first.readPlan();
  assert.throws(() => assetPlan(before.assets, ['日记/day/clock']), /collision/);
  assert.throws(() => assetPlan([...before.assets, { source: 'other', target: 'posts/日记/day/clock/APP.js' }], ['日记/day']), /collision/);
  assert.throws(() => assetPlan([...before.assets, { source: 'other', target: 'posts/日记/day/clock/app.js/child' }], ['日记/day']), /collision/);
  await manifest(['index.html', 'missing.js']);
  const broken = createNoteCompilation(settings);
  await assert.rejects(broken.compile(note, render), /Invalid tool package/);
  await assert.rejects(broken.writePlan(), /Cannot save/);
  assert.deepEqual(await first.readPlan(), before);
  await manifest(['index.html']);
  const second = createNoteCompilation(settings);
  await second.compile(note, render);
  await second.writePlan();
  assert.deepEqual((await second.readPlan()).assets.map(x => x.target), ['posts/日记/day/clock/index.html']);
  const removed = createNoteCompilation(settings);
  await removed.compile({ ...note, body: 'Removed' }, render);
  await removed.writePlan();
  assert.deepEqual((await removed.readPlan()).toolEntries, []);
  assert.deepEqual((await removed.readPlan()).assets, []);
}));

test('build publishes package files and ZIP via exclusive hard links and preserves occupied destinations', async (t) => fixture(async ({ root, directory, note, settings, render, manifest }) => {
  await manifest(['index.html', 'app.js'], { download: true });
  const compilation = createNoteCompilation(settings);
  await compilation.compile(note, render);
  await compilation.writePlan();
  const integration = noteAssets({ notesDir: '.' });
  await integration.hooks['astro:config:done']({ config: { root: pathToFileURL(root + '/'), base: settings.base, cacheDir: settings.cacheDir } });
  const build = async (folder) => {
    await mkdir(folder, { recursive: true });
    return integration.hooks['astro:build:done']({ dir: pathToFileURL(folder + '/') });
  };
  const out = join(root, 'dist');
  await build(out);
  const appTarget = join(out, 'posts/日记/day/clock/app.js');
  assert.deepEqual(await readFile(appTarget), await readFile(join(directory, 'app.js')));
  assert.deepEqual(await readFile(join(out, 'posts/日记/day/clock.zip')), Buffer.from(await createToolArchive((await compilation.readPlan()).archives[0], (await compilation.readPlan()).assets, root)));
  assert.equal((await readdir(dirname(appTarget))).some(name => name.endsWith('.tmp')), false);
  await assert.rejects(build(out), /collides with a generated page/);

  const outWithLink = join(root, 'dist-link');
  const linkedTarget = join(outWithLink, 'posts/日记/day/clock/app.js');
  const missing = join(root, 'dangling-symlink-target');
  await mkdir(dirname(linkedTarget), { recursive: true });
  try { await symlink(missing, linkedTarget, 'file'); }
  catch (error) {
    if (error.code === 'EPERM') { t.diagnostic('File-symlink creation is unavailable on this Windows configuration'); return; }
    throw error;
  }
  await assert.rejects(build(outWithLink), /collides with a generated page/);
  await assert.rejects(readFile(missing), { code: 'ENOENT' });
  assert((await lstat(linkedTarget)).isSymbolicLink());
  assert.equal((await readdir(dirname(linkedTarget))).some(name => name.endsWith('.tmp')), false);
}));

test('build and ZIP reject package members replaced by symlinks after compilation', async (t) => fixture(async ({ root, directory, note, settings, render, manifest }) => {
  await manifest(['index.html', 'app.js'], { download: true });
  const compilation = createNoteCompilation(settings);
  await compilation.compile(note, render);
  await compilation.writePlan();
  const app = join(directory, 'app.js');
  await rm(app);
  try { await symlink(join(directory, 'index.html'), app, 'file'); }
  catch (error) {
    if (error.code === 'EPERM') { t.diagnostic('File-symlink creation is unavailable on this Windows configuration'); return; }
    throw error;
  }
  const plan = await compilation.readPlan();
  await assert.rejects(createToolArchive(plan.archives[0], plan.assets, root), /symbolic links/);
  const integration = noteAssets({ notesDir: '.' });
  await integration.hooks['astro:config:done']({ config: { root: pathToFileURL(root + '/'), base: settings.base, cacheDir: settings.cacheDir } });
  const out = join(root, 'dist');
  await mkdir(out);
  await assert.rejects(integration.hooks['astro:build:done']({ dir: pathToFileURL(out + '/') }), /symbolic links/);
  const appFolder = join(out, 'posts/日记/day/clock');
  assert.equal((await readdir(appFolder)).some(name => name.endsWith('.tmp')), false, 'staged files must be removed after a failed source validation');
}));

test('dev, build and ZIP reject a package member whose parent becomes a symlink after compilation', async () => fixture(async ({ root, directory, note, settings, render, manifest }) => {
  await put(join(directory, 'vendor/member.js'), 'original member');
  await manifest(['index.html', 'app.js', 'vendor/member.js'], { download: true });
  const compilation = createNoteCompilation(settings);
  await compilation.compile(note, render);
  await compilation.writePlan();
  const plan = await compilation.readPlan();

  const replacement = join(root, 'replacement-vendor');
  await put(join(replacement, 'member.js'), 'unexpected member');
  await rm(join(directory, 'vendor'), { recursive: true });
  await symlink(replacement, join(directory, 'vendor'), process.platform === 'win32' ? 'junction' : 'dir');

  const integration = noteAssets({ notesDir: '.' });
  await integration.hooks['astro:config:done']({ config: { root: pathToFileURL(root + '/'), base: settings.base, cacheDir: settings.cacheDir } });
  let middleware;
  integration.hooks['astro:server:setup']({ server: { middlewares: { use(handler) { middleware = handler; } } } });
  const server = createServer((req, res) => middleware(req, res, error => res.writeHead(error ? 500 : 404).end(error?.message)));
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}/blog/posts/%E6%97%A5%E8%AE%B0/day/clock`;
  try {
    const member = await fetch(origin + '/vendor/member.js');
    assert.equal(member.status, 500);
    assert.match(await member.text(), /symbolic links/);
    const archive = await fetch(origin + '.zip');
    assert.equal(archive.status, 500);
    assert.match(await archive.text(), /symbolic links/);
  } finally { await new Promise(done => server.close(done)); }

  await assert.rejects(createToolArchive(plan.archives[0], plan.assets, root), /symbolic links/);
  const out = join(root, 'dist');
  await mkdir(out);
  await assert.rejects(integration.hooks['astro:build:done']({ dir: pathToFileURL(out + '/') }), /symbolic links/);
}));

test('build rejects a symlinked output parent escaping dist without touching external files', async () => fixture(async ({ root, note, settings, render }) => {
  const compilation = createNoteCompilation(settings);
  await compilation.compile(note, render);
  await compilation.writePlan();

  const out = join(root, 'dist');
  const outside = join(root, 'outside-dist');
  const sentinel = join(outside, 'sentinel.txt');
  await put(sentinel, 'keep this content');
  const parent = join(out, 'posts/日记/day/clock');
  await mkdir(dirname(parent), { recursive: true });
  await symlink(outside, parent, process.platform === 'win32' ? 'junction' : 'dir');

  const integration = noteAssets({ notesDir: '.' });
  await integration.hooks['astro:config:done']({ config: { root: pathToFileURL(root + '/'), base: settings.base, cacheDir: settings.cacheDir } });
  await assert.rejects(integration.hooks['astro:build:done']({ dir: pathToFileURL(out + '/') }), /Attachment output symlink escapes dist/);
  assert.equal(await readFile(sentinel, 'utf8'), 'keep this content');
  assert.deepEqual(await readdir(outside), ['sentinel.txt']);
  assert((await lstat(parent)).isSymbolicLink());
}));

test('dev serves package directory aliases and selected MIME types for GET/HEAD only', async () => fixture(async ({ root, directory, note, settings, render, manifest }) => {
  const files = ['index.html', 'app.js', 'style.css', 'data.json', 'module.mjs', 'core.wasm', '资源/中文.js', 'data/manifest.json'];
  for (const name of files.slice(2)) await put(join(directory, name), name);
  await put(join(directory, 'extra.js'), 'ordinary attachment');
  await manifest(files, { download: true });
  const compilation = createNoteCompilation(settings);
  await compilation.compile({ ...note, body: `${note.body}\n\n[extra](./clock/extra.js)` }, render);
  await compilation.writePlan();
  const integration = noteAssets({ notesDir: '.' });
  let devPlugin;
  integration.hooks['astro:config:setup']({ config: { root: pathToFileURL(root + '/') }, addWatchFile() {}, updateConfig(value) { [devPlugin] = value.vite.plugins; } });
  await integration.hooks['astro:config:done']({ config: { root: pathToFileURL(root + '/'), base: settings.base, cacheDir: settings.cacheDir } });
  let middleware;
  const stack = [];
  integration.hooks['astro:server:setup']({ server: { middlewares: { stack, use(fn) { middleware = fn; } } } });
  assert.equal(devPlugin.enforce, 'post');
  devPlugin.configureServer({ middlewares: { stack } })();
  assert.equal(stack.length, 1);
  let preAstroFallthroughs = 0;
  const server = createServer((req, res) => stack[0].handle(req, res, error => {
    if (error) return res.writeHead(500).end(error.message);
    preAstroFallthroughs++;
    return middleware(req, res, error => res.writeHead(error ? 500 : 404).end(error?.message));
  }));
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const prefix = '/blog/posts/%E6%97%A5%E8%AE%B0/day/clock/';
  try {
    for (const path of [prefix, prefix + 'index.html', prefix.replace('/blog', '')]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), await readFile(join(directory, 'index.html'), 'utf8'));
    }
    for (const [name, type] of [['app.js', 'text/javascript'], ['module.mjs', 'text/javascript'], ['style.css', 'text/css'], ['data.json', 'application/json'], ['core.wasm', 'application/wasm'], ['资源/中文.js', 'text/javascript'], ['data/manifest.json', 'application/json']]) {
      const path = prefix + name.split('/').map(encodeURIComponent).join('/');
      const get = await fetch(origin + path);
      assert.equal(get.status, 200);
      assert(get.headers.get('content-type').startsWith(type));
      const head = await fetch(origin + path, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
      assert.equal(await head.text(), '');
    }
    for (const path of ['manifest.json', 'unused.js', 'unplanned/']) assert.equal((await fetch(origin + prefix + path)).status, 404);
    const beforeExtra = preAstroFallthroughs;
    const extra = await fetch(origin + prefix + 'extra.js');
    assert.equal(await extra.text(), 'ordinary attachment');
    assert.equal(preAstroFallthroughs, beforeExtra + 1, 'unlisted Markdown attachment must pass the pre-Astro middleware');
    const archiveUrl = origin + prefix.slice(0, -1) + '.zip';
    const zip = await fetch(archiveUrl);
    assert.equal(zip.status, 200);
    assert(zip.headers.get('content-type').startsWith('application/zip'));
    const plan = await compilation.readPlan();
    assert.deepEqual(new Uint8Array(await zip.arrayBuffer()), await createToolArchive(plan.archives[0], plan.assets, plan.root));
    await put(join(directory, 'app.js'), 'updated dependency');
    const updated = new Uint8Array(await (await fetch(archiveUrl)).arrayBuffer());
    assert.equal(Buffer.from(unzipSync(updated)['app.js']).toString(), 'updated dependency');
    const head = await fetch(archiveUrl, { method: 'HEAD' });
    assert.equal(Number(head.headers.get('content-length')), updated.byteLength);
    assert.equal(await head.text(), '');
    const appFile = join(directory, 'app.js');
    await rm(appFile);
    let linked = true;
    try { await symlink(join(directory, 'index.html'), appFile, 'file'); }
    catch (error) { if (error.code === 'EPERM') linked = false; else throw error; }
    if (linked) {
      assert.equal((await fetch(origin + prefix + 'app.js')).status, 500);
      assert.equal((await fetch(archiveUrl)).status, 500);
      await rm(appFile);
    }
    await put(appFile, 'restored dependency');
    const extraFile = join(directory, 'extra.js');
    await rm(extraFile);
    let ordinaryLinked = true;
    try { await symlink(appFile, extraFile, 'file'); }
    catch (error) { if (error.code === 'EPERM') ordinaryLinked = false; else throw error; }
    if (ordinaryLinked) {
      const ordinary = await fetch(origin + prefix + 'extra.js');
      assert.equal(ordinary.status, 200);
      assert.equal(await ordinary.text(), 'restored dependency', 'ordinary attachment follows existing in-root symlinks');
      await rm(extraFile);
    }
    await put(extraFile, 'ordinary attachment');
    for (const download of [false, undefined]) {
      await manifest(files, download === undefined ? {} : { download });
      const disabled = createNoteCompilation(settings);
      await disabled.compile({ ...note, body: `${note.body}\n\n[extra](./clock/extra.js)` }, render);
      await disabled.writePlan();
      assert.equal((await fetch(archiveUrl)).status, 404);
      assert.equal((await fetch(origin + prefix + 'app.js')).status, 200);
      const before = preAstroFallthroughs;
      assert.equal((await fetch(origin + prefix + 'extra.js')).status, 200);
      assert.equal(preAstroFallthroughs, before + 1);
    }
    assert.equal((await fetch(origin + prefix, { method: 'POST' })).status, 404);
  } finally { await new Promise(done => server.close(done)); }
}));
