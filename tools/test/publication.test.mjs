import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMarkdownProcessor, parseFrontmatter } from '@astrojs/markdown-remark';
import { z } from 'astro/zod';
import { parseDocument } from 'yaml';
import { notesLoader } from '../../src/lib/notes-loader.ts';
import { inside, noteId } from '../../src/lib/note-assets.mjs';
import { isPublishedNote, parseNoteFrontmatter } from '../../src/lib/note-publication.mjs';
import { remarkNoteAssets } from '../../src/lib/note-compilation.mjs';
import { publish, runProcess } from '../lib/publisher.mjs';
import { fingerprint } from '../lib/publish-files.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(project, '.astro');
const put = async (path, content) => { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, content); };

async function loaderFixture(run) {
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(join(cache, 'publication-test-'));
  const notes = join(root, 'notes');
  await mkdir(notes);
  const stored = new Map();
  const parsed = [];
  const rendered = [];
  const processor = await createMarkdownProcessor({ remarkPlugins: [remarkNoteAssets] });
  const context = {
    config: { root: pathToFileURL(root + '/'), cacheDir: pathToFileURL(join(root, '.cache') + '/'), base: '/' },
    parseData: async ({ id, data }) => {
      parsed.push(id);
      assert.equal(data.publish, true, 'Unpublished notes must never reach article validation');
      assert(data.title && data.date, 'Published articles still require metadata');
      return data;
    },
    renderMarkdown: async (contents, { fileURL }) => {
      rendered.push(fileURL);
      const { frontmatter, content } = parseFrontmatter(contents);
      const result = await processor.render(content, { frontmatter });
      return { html: result.code, metadata: result.metadata };
    },
    generateDigest: () => 'test',
    store: { clear: () => stored.clear(), set: (entry) => stored.set(entry.id, entry) },
  };
  try { await run({ root, notes, stored, parsed, rendered, context, load: () => notesLoader('./notes').load(context) }); }
  finally { assert(inside(cache, root)); await rm(root, { recursive: true, force: true }); }
}

test('note frontmatter preserves date-shaped strings through Obsidian YAML rewrites', () => {
  const quoted = 'title: "2026-10-29"\ndate: "2026-10-29"\nupdated: "2026-11-01"\npublish: true\nslug: "2026-10-29"\ntags: [日记]\ndescription: "日记一篇"\nexcerpt: "2026-10-29 日记"';
  const rewritten = 'title: 2026-10-29\ndate: 2026-10-29\nupdated: 2026-11-01\npublish: true\nslug: 2026-10-29\ntags:\n  - 日记\ndescription: 日记一篇\nexcerpt: 2026-10-29 日记';
  const expected = parseNoteFrontmatter(`---\n${quoted}\n---\nLine one\nLine two`, 'quoted.md');
  for (const eol of ['\n', '\r\n']) {
    for (const prefix of ['', '\uFEFF', '\n']) {
      const contents = prefix + `---\n${rewritten}\n---\nLine one\nLine two`.replaceAll('\n', eol);
      const parsed = parseNoteFrontmatter(contents, 'rewritten.md');
      assert.deepEqual(parsed.frontmatter, expected.frontmatter);
      assert.equal(parsed.rawFrontmatter, parseFrontmatter(contents).rawFrontmatter);
      assert.equal(parsed.content, parseFrontmatter(contents).content);
      assert.equal(typeof parsed.frontmatter.title, 'string');
      assert.equal(typeof parsed.frontmatter.slug, 'string');
      assert.equal(isPublishedNote(parsed.frontmatter), true);
    }
  }
  const parsed = expected.frontmatter;
  const dates = z.object({ date: z.coerce.date(), updated: z.coerce.date() }).parse(parsed);
  assert.equal(dates.date.toISOString(), '2026-10-29T00:00:00.000Z');
  assert.equal(dates.updated.toISOString(), '2026-11-01T00:00:00.000Z');
});

test('note frontmatter retains plain notes, YAML merges and TOML framing', () => {
  for (const source of ['Plain note\nSecond line', '---\n---\nBody', '+++\ntitle = "2026-10-29"\nslug = "2026-10-29"\ndate = 2026-10-29\npublish = true\n+++\nBody']) {
    assert.deepEqual(parseNoteFrontmatter(source, 'note.md'), parseFrontmatter(source));
  }
  const { frontmatter } = parseNoteFrontmatter('---\ndefaults: &defaults\n  tags: [日记]\n<<: *defaults\ntitle: 2026-10-29\nslug: 2026-10-29\npublish: TRUE\n---\nBody', 'merged.md');
  assert.deepEqual(frontmatter.tags, ['日记']);
  assert.equal(frontmatter.title, '2026-10-29');
  assert.equal(frontmatter.slug, '2026-10-29');
  assert.equal(isPublishedNote(frontmatter), true);
});

test('note IDs reject non-string slug values before coercion', () => {
  for (const slug of [[], ['day'], {}, { day: true }, new Date('2026-10-29'), 123, true, false, null]) {
    assert.throws(() => noteId('folder/day.md', { slug }), /slug.*string/i);
  }
  assert.equal(noteId('folder/day.md', {}), 'folder/day');
  assert.equal(noteId('folder/day.md', { slug: '' }), 'folder/day');
  assert.equal(noteId('folder/day.md', { slug: '2026-10-29' }), '2026-10-29');
  assert.equal(noteId('folder/day.md', { slug: '中文/第二篇' }), '中文/第二篇');
});

test('loader and note links keep daily IDs stable across quoted and bare metadata', async () => loaderFixture(async ({ notes, stored, context, load }) => {
  const validate = context.parseData;
  const schema = z.object({ title: z.string().min(1), date: z.coerce.date(), updated: z.coerce.date().optional() });
  context.parseData = async (entry) => {
    const data = await validate(entry);
    return { ...data, ...schema.parse(data) };
  };
  const day = '2026-10-29';
  const note = join(notes, `${day}/${day}.md`);
  await put(join(notes, '00-linker.md'), `---\ntitle: Linker\ndate: ${day}\npublish: true\nslug: linker\n---\n[Diary](./${day}/${day}.md?view=full#notes)`);
  await put(join(notes, 'private.md'), '---\npublish: false\ntitle: []\nslug: {}\n---\nPrivate');
  for (const quote of ['', '"']) {
    const value = `${quote}${day}${quote}`;
    await put(note, `---\ntitle: ${value}\ndate: ${value}\nupdated: 2026-11-01\npublish: True\nslug: ${value}\ntags:\n  - 日记\n---\nLine one\nLine two`);
    await load();
    assert.deepEqual([...stored.keys()], ['linker', day]);
    const entry = stored.get(day);
    assert.equal(entry.data.title, day);
    assert.equal(entry.data.date.toISOString(), '2026-10-29T00:00:00.000Z');
    assert.equal(entry.data.updated.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.deepEqual(entry.data.tags, ['日记']);
    assert.match(entry.rendered.html, /<p>Line one\nLine two<\/p>/);
    assert.match(stored.get('linker').rendered.html, /href="\/posts\/2026-10-29\/\?view=full#notes"/);
  }
  for (const title of ['[]', '{}', 'true', '123']) {
    await put(note, `---\ntitle: ${title}\ndate: ${day}\npublish: true\nslug: ${day}\n---\nInvalid title`);
    await assert.rejects(load(), /expected string/i);
    assert.deepEqual([...stored.keys()], ['linker', day]);
  }
  await put(note, `---\ntitle: ${day}\ndate: invalid\npublish: true\nslug: ${day}\n---\nInvalid date`);
  await assert.rejects(load());
}));

test('publication filtering precedes IDs, schema validation, rendering and collection storage', async () => loaderFixture(async ({ notes, stored, parsed, rendered, load }) => {
  await put(join(notes, '00-plain.md'), 'PRIVATE_PLAIN\n![missing](missing.png)');
  const rejected = ['publish: false', 'publish: False', 'publish: FALSE', '', 'publish: "true"', 'publish: "True"', 'publish: "TRUE"', 'publish: 1', 'publish: yes', 'Publish: true'];
  for (const [index, field] of rejected.entries()) {
    await put(join(notes, `01-private-${index}.md`), `---\n${field}\nslug: shared\ncover: missing.png\n---\nPRIVATE_NOTE\n![missing](missing.png)`);
  }
  await put(join(notes, '02-invalid-private-id.md'), '---\npublish: false\nslug: ../invalid\n---\nPRIVATE_NOTE');
  for (const [index, value] of ['true', 'True', 'TRUE'].entries()) {
    await put(join(notes, `published-${index}.md`), `---\ntitle: Published\ndate: "2026-10-29"\npublish: ${value}\nslug: ${index === 0 ? 'shared' : `accepted-${index}`}\n---\nPUBLIC_BODY`);
  }
  await put(join(notes, '.hidden/published.md'), '---\npublish: true\n---\nHIDDEN_NOTE');
  await load();
  assert.deepEqual([...stored.keys()], ['shared', 'accepted-1', 'accepted-2']);
  assert.deepEqual(parsed, ['shared', 'accepted-1', 'accepted-2']);
  assert.equal(rendered.length, 3);
  assert([...stored.values()].every((entry) => entry.body.includes('PUBLIC_BODY')));
}));

test('malformed frontmatter reports its note path and preserves the previous collection', async () => loaderFixture(async ({ root, notes, stored, load }) => {
  await put(join(notes, 'good.md'), '---\ntitle: Good\ndate: "2026-10-29"\npublish: true\n---\nGOOD');
  await load();
  const before = await readFile(join(root, '.cache/aero-attachments.json'), 'utf8');
  const broken = join(notes, 'broken.md');
  for (const content of ['---\npublish: [true\n---\nBROKEN', '---\npublish: false\npublish: true\n---\nBROKEN', '---\npublish: true\ntitle: Incomplete']) {
    await put(broken, content);
    await assert.rejects(load(), (error) => {
      assert.match(error.message, /frontmatter/i);
      assert(error.message.includes(broken), 'The error must identify the file');
      return true;
    });
    assert.deepEqual([...stored.keys()], ['good']);
    assert.equal(await readFile(join(root, '.cache/aero-attachments.json'), 'utf8'), before);
  }
}));

test('isolated publisher builds mixed Vaults, withdraws assets and blocks invalid published notes', { timeout: 120000 }, async () => loaderFixture(async ({ root, notes }) => {
  for (const folder of ['src', 'public']) await cp(join(project, folder), join(root, folder), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'astro.config.mjs', '.gitignore', 'wrangler.json']) await cp(join(project, name), join(root, name));
  await put(join(root, 'src/config/content.config.ts'), "export const contentConfig = { notesDir: './notes' };\n");
  const note = join(notes, '2026-10-29/2026-10-29.md');
  const photo = join(notes, '2026-10-29/photo.svg');
  const photoBytes = '<svg xmlns="http://www.w3.org/2000/svg"><text>Public photo</text></svg>';
  await put(note, '---\ntitle: Published Diary\ndate: "2026-10-29"\npublish: TRUE\nslug: diary\ntags: [PublicTag]\ncover: ./photo.svg\n---\nPUBLIC_DIARY\n![photo](./photo.svg)\n[Other](../other.md)');
  await put(photo, photoBytes);
  await put(join(notes, 'other.md'), '---\ntitle: Other\ndate: "2026-10-28"\npublish: True\n---\nOTHER_PUBLIC_NOTE');
  await put(join(notes, 'plain.md'), 'PRIVATE_PLAIN_WITHOUT_METADATA');
  await put(join(notes, 'private.md'), '---\npublish: "true"\nslug: diary\ntags: [PrivateTag]\ncover: missing.png\n---\nPRIVATE_BODY\n![missing](missing.png)');
  const dataDir = join(root, 'publisher-data');
  const options = { root, runtimeRoot: project, dataDir, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'test-account', CLOUDFLARE_API_TOKEN: 'test-token' } };
  let uploads = 0;
  const run = async (script, args, command) => {
    if (!script.includes('wrangler')) return runProcess(script, args, command);
    uploads++;
    const config = JSON.parse(await readFile(args[args.indexOf('--config') + 1], 'utf8'));
    assert.equal(config.assets.directory, join(dataDir, 'site'));
    assert(!JSON.stringify(config).includes('test-token'));
  };
  const sourceBefore = await readFile(note, 'utf8');
  await publish(options, run);
  assert.equal(uploads, 1);
  assert.equal(await readFile(note, 'utf8'), sourceBefore);
  assert.equal(await readFile(join(dataDir, 'site/posts/diary/photo.svg'), 'utf8'), photoBytes);
  const html = await readFile(join(dataDir, 'site/posts/diary/index.html'), 'utf8');
  assert.match(html, /PUBLIC_DIARY/);
  assert.match(html, /href="\/posts\/other\/"/);
  for (const path of ['index.html', 'archives/index.html', 'posts/other/index.html']) {
    assert.doesNotMatch(await readFile(join(dataDir, 'site', path), 'utf8'), /PRIVATE_|PrivateTag/);
  }
  await assert.rejects(readFile(join(dataDir, 'site/tags/privatetag/index.html')), /ENOENT/);
  await put(note, '---\npublish: false\n---\nPRIVATE_AFTER_WITHDRAWAL');
  await publish(options, run);
  assert.equal(uploads, 2);
  await assert.rejects(readFile(join(dataDir, 'site/posts/diary/index.html')), /ENOENT/);
  await assert.rejects(readFile(join(dataDir, 'site/posts/diary/photo.svg')), /ENOENT/);
  await assert.rejects(readFile(join(dataDir, 'site/tags/publictag/index.html')), /ENOENT/);
  assert.doesNotMatch(await readFile(join(dataDir, 'site/archives/index.html'), 'utf8'), /Published Diary/);
  const successBefore = await readFile(join(dataDir, 'last-success.json'), 'utf8');
  const siteBefore = await readFile(join(dataDir, 'site/index.html'), 'utf8');
  await put(note, '---\npublish: true\ntitle: []\ndate: invalid\n---\nBROKEN_PUBLISHED');
  await assert.rejects(publish(options, run), /check failed/);
  assert.equal(uploads, 2);
  assert.equal(JSON.parse(await readFile(join(dataDir, 'status.json'), 'utf8')).status, 'failed');
  assert.equal(await readFile(join(dataDir, 'last-success.json'), 'utf8'), successBefore);
  assert.equal(await readFile(join(dataDir, 'site/index.html'), 'utf8'), siteBefore);
}));

test('complete Vault preserves attachment paths and removes only obsolete outputs', { timeout: 180000 }, async (t) => loaderFixture(async ({ root }) => {
  const theme = join(root, 'theme');
  const notes = join(root, 'Vault');
  const dataDir = join(root, 'publisher-data');
  const site = join(dataDir, 'site');
  const base = '/diary/';
  for (const folder of ['src', 'public']) await cp(join(project, folder), join(theme, folder), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'astro.config.mjs', '.gitignore', 'wrangler.json']) await cp(join(project, name), join(theme, name));
  await cp(fileURLToPath(new URL('./vault/Notes', import.meta.url)), notes, { recursive: true });
  await put(join(theme, 'src/config/content.config.ts'), "export const contentConfig = { notesDir: '../Vault' };\n");
  const config = join(theme, 'astro.config.mjs');
  await writeFile(config, (await readFile(config, 'utf8')).replace("output: 'static',", `output: 'static', base: '${base}',`));
  const first = 'posts/2026-10-28';
  const second = 'posts/旅行记录/2026-10-29/2026-10-29';
  const firstNote = join(notes, '2026-10-28/2026-10-28.md');
  const secondNote = join(notes, '旅行记录/2026-10-29/2026-10-29.md');
  // Scope the withdrawal-only tag to this temporary Vault, keeping the copyable example simple.
  const firstContents = await readFile(firstNote, 'utf8');
  const { rawFrontmatter } = parseNoteFrontmatter(firstContents, firstNote);
  const firstMetadata = parseDocument(rawFrontmatter, { schema: 'core' });
  firstMetadata.get('tags').add('首日独有');
  const seededContents = firstContents.replace(rawFrontmatter, `\n${firstMetadata.toString()}`);
  assert.match(seededContents, /\ntitle: 2026-10-28\n/, 'Real builds must still exercise a bare date-shaped title');
  assert.match(seededContents, /\nslug: 2026-10-28\n/);
  await writeFile(firstNote, seededContents);
  const shared = '共享资料/共用 图.svg';
  const attachments = new Map([
    [`${first}/照片 早晨.svg`, '2026-10-28/照片 早晨.svg'],
    [`${first}/行程 说明.pdf`, '2026-10-28/行程 说明.pdf'],
    [`${first}/_attachments/${shared}`, shared],
    [`${second}/附件/路线 图.svg`, '旅行记录/2026-10-29/附件/路线 图.svg'],
    [`${second}/_attachments/${shared}`, shared],
  ]);
  const list = async (directory, prefix = '') => {
    const paths = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) paths.push(...await list(join(directory, entry.name), `${name}/`));
      else { assert(entry.isFile(), `Unexpected non-file: ${name}`); paths.push(name); }
    }
    return paths.sort();
  };
  // A build-only job exercises the real staging/check/build/inspection pipeline.
  // It must never invoke Wrangler, even if the caller has Cloudflare credentials.
  const build = async () => {
    const before = await Promise.all([fingerprint(theme), fingerprint(notes)]);
    const result = await publish({ root: theme, runtimeRoot: project, dataDir, mode: 'build-only' }, async (script, ...args) => {
      assert(!script.includes('wrangler'), 'Vault acceptance must not upload');
      return runProcess(script, ...args);
    });
    assert.equal(result.status, 'built');
    assert.deepEqual(await Promise.all([fingerprint(theme), fingerprint(notes)]), before, 'Builds must not modify either input');
    return list(site);
  };
  const verifyOutput = async (files, survivingPosts, expectedAttachments) => {
    assert.deepEqual(files.filter((name) => name.startsWith('posts/')), [...survivingPosts.map((post) => `${post}/index.html`), ...expectedAttachments.keys()].sort());
    for (const [target, source] of expectedAttachments) assert.deepEqual(await readFile(join(site, target)), await readFile(join(notes, source)), target);
    const linked = new Set();
    for (const name of files.filter((path) => path.endsWith('.html'))) {
      const html = await readFile(join(site, name), 'utf8');
      assert.doesNotMatch(html, /VAULT_PRIVATE_|VAULT_UNUSED_|VAULT_HIDDEN_|PRIVATE_VAULT_TAG|Welcome to Aero/);
      const pageUrl = new URL(base + name.replace(/index\.html$/, ''), 'https://vault.example');
      // Resolve actual generated href/src values, including percent-encoded Unicode,
      // spaces, deployment prefixes, cover URLs and PDF fragments, to built files.
      for (const [, attribute] of html.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
        const url = new URL(attribute.replaceAll('&amp;', '&'), pageUrl);
        if (url.origin !== pageUrl.origin || !url.pathname.startsWith(`${base}posts/`)) continue;
        const target = decodeURIComponent(url.pathname.slice(base.length)) + (url.pathname.endsWith('/') ? 'index.html' : '');
        assert(inside(site, resolve(site, target)));
        assert(files.includes(target), `${name}: broken article/attachment URL ${attribute}`);
        linked.add(target);
      }
    }
    for (const target of expectedAttachments.keys()) assert(linked.has(target), `Attachment lacks a usable HTML URL: ${target}`);
  };
  await t.test('mixed Vault builds only two public notes and their referenced bytes', async () => {
    const files = await build();
    await verifyOutput(files, [first, second], attachments);
    assert.deepEqual(files.filter((name) => name.startsWith('tags/')), ['tags/日记/index.html', 'tags/首日独有/index.html']);
    const firstHtml = await readFile(join(site, first, 'index.html'), 'utf8');
    assert.match(firstHtml, /href="\.\/%E8%A1%8C%E7%A8%8B%20%E8%AF%B4%E6%98%8E\.pdf#page=1"/);
    assert.match(firstHtml, /href="\/diary\/posts\/%E6%97%85%E8%A1%8C%E8%AE%B0%E5%BD%95\/2026-10-29\/2026-10-29\/#/);
    const archive = await readFile(join(site, 'archives/index.html'), 'utf8');
    assert(archive.indexOf('datetime="2026-10-29"') < archive.indexOf('datetime="2026-10-28"'), 'Diaries must remain newest first');
    assert(files.every((name) => !/\.(md|mdx)$/i.test(name) && !name.split('/').includes('.obsidian')));
    await assert.rejects(readFile(join(dataDir, 'last-success.json')), /ENOENT/, 'Build-only cannot claim a live deployment');
  });
  await t.test('editing a shared attachment refreshes both copies without editing Markdown', async () => {
    const markdownBefore = await Promise.all([readFile(firstNote), readFile(secondNote)]);
    await writeFile(join(notes, shared), (await readFile(join(notes, shared), 'utf8')).replace('VAULT_SHARED_IMAGE', 'VAULT_SHARED_IMAGE_UPDATED'));
    const files = await build();
    await verifyOutput(files, [first, second], attachments);
    assert.deepEqual(await Promise.all([readFile(firstNote), readFile(secondNote)]), markdownBefore);
    for (const post of [first, second]) assert.match(await readFile(join(site, post, '_attachments', shared), 'utf8'), /VAULT_SHARED_IMAGE_UPDATED/);
  });
  await t.test('withdrawal removes the article, unique tag and all of its attachments', async () => {
    await put(firstNote, '---\npublish: false\n---\nVAULT_PRIVATE_WITHDRAWN');
    const remaining = new Map([...attachments].filter(([target]) => target.startsWith(`${second}/`)));
    const files = await build();
    await verifyOutput(files, [second], remaining);
    assert.deepEqual(files.filter((name) => name.startsWith('tags/')), ['tags/日记/index.html']);
    for (const name of ['index.html', 'archives/index.html', 'tags/日记/index.html']) {
      assert.doesNotMatch(await readFile(join(site, name), 'utf8'), /2026-10-28|首日独有/);
    }
  });
  await t.test('deleting the last public note removes remaining pages, tags and shared copies', async () => {
    await rm(secondNote);
    const files = await build();
    await verifyOutput(files, [], new Map());
    assert.deepEqual(files.filter((name) => name.startsWith('tags/')), []);
    assert(!files.includes('posts/welcome/index.html'), 'An empty published Vault must not fall back to bundled notes');
  });
}));
