// Explicit local acceptance, including real isolated Publisher builds. No cloud writes.
import assert from 'node:assert/strict';
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publish, runProcess } from '../../lib/publisher.mjs';
import { fingerprint } from '../../lib/publish-files.mjs';
import { unzipSync } from 'fflate';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const artifacts = join(project, '.astro/tool-packages-phase-b');
await mkdir(artifacts, { recursive: true });
const run = await mkdtemp(join(artifacts, 'run-'));
const theme = join(run, 'theme');
const notes = join(run, 'Vault');
const dataDir = join(run, 'publisher');
const site = join(dataDir, 'site');
const output = join(run, 'output/playwright');
const report = { run, theme, notes, site, output, results: [], cloudWrites: false, node: process.version };
const put = async (file, text) => { await mkdir(dirname(file), { recursive: true }); await writeFile(file, text); };
const list = async (directory, prefix = '') => {
  const names = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) names.push(...await list(join(directory, entry.name), name + '/'));
    else names.push(name);
  }
  return names.sort();
};
const pass = text => { report.results.push(text); console.log('PASS ' + text); };
const save = async () => { await put(join(artifacts, 'manifest.json'), JSON.stringify(report, null, 2) + '\n'); };

try {
  await cp(join(project, 'src'), join(theme, 'src'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'astro.config.mjs', '.gitignore', 'wrangler.json']) await copyFile(join(project, name), join(theme, name));
  for (const name of ['site', 'theme', 'music']) {
    const path = join(theme, `src/config/${name}.config.ts`);
    await writeFile(path, (await readFile(path, 'utf8')).replace(/'\/image\/[^']+'/g, "'/fixture.svg'"));
  }
  await put(join(theme, 'public/fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="skyblue"/></svg>');
  await put(join(theme, 'public/audio/playlist.json'), '[]');
  await put(join(theme, 'src/config/content.config.ts'), "export const contentConfig = { notesDir: '../Vault' };\n");
  const config = join(theme, 'astro.config.mjs');
  const originalConfig = await readFile(config, 'utf8');
  const firstNote = join(notes, 'day/note.md');
  const secondNote = join(notes, 'second/note.md');
  const firstBody = '---\ntitle: Tool package sample\ndate: "2026-11-04"\nslug: first\npublish: true\n---\n\n![iframe: Timestamp](./timestamp/index.html)\n\n![iframe: Legacy](./legacy.html)\n\n[Open timestamp](./timestamp/index.html?mode=mixed#result)\n\n[Open legacy](./legacy.html?mode=open#legacy)';
  const localLink = '[Local timestamp](./local/index.html?mode=local#result)';
  const sharedLink = '[**Shared** timestamp][shared-clock]';
  const secondBody = `---\ntitle: Link-only package sample\ndate: "2026-11-03"\nslug: second\npublish: true\n---\n\n${localLink}\n\n${sharedLink}\n\n[shared-clock]: ../day/timestamp/index.html?mode=shared&size=2#result "Shared clock"`;
  await put(firstNote, firstBody);
  await put(secondNote, secondBody);
  await cp(join(project, 'examples/posts/zh-CN/tools/timestamp'), join(notes, 'day/timestamp'), { recursive: true });
  await put(join(notes, 'day/legacy.html'), '<!doctype html><meta charset="utf-8"><button id="legacy" onclick="this.textContent=\'legacy-ok\'">legacy</button>');
  await put(join(notes, 'day/timestamp/obsolete.txt'), 'OBSOLETE_SELECTED');
  await put(join(notes, 'day/timestamp/unused.js'), 'NOT_SELECTED');
  await put(join(notes, 'day/timestamp/data/manifest.json'), '{"value":"link-ready"}');
  await put(join(notes, 'day/timestamp/worker.js'), 'self.onmessage = event => self.postMessage(event.data + "-worker");');
  const probeScript = `
;(async () => {
  if (window.top !== window) return;
  const data = await (await fetch('./data/manifest.json')).json();
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js');
    worker.onmessage = event => { worker.terminate(); resolve(event.data); };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage(data.value);
  });
  localStorage.setItem('aero-linked-package-probe', result);
  if (localStorage.getItem('aero-linked-package-probe') !== 'link-ready-worker') throw new Error('Storage probe failed');
  document.documentElement.dataset.linkProbe = 'ready';
})();
`;
  const initialApp = join(notes, 'day/timestamp/app.js');
  await writeFile(initialApp, (await readFile(initialApp, 'utf8')) + probeScript);
  await put(join(notes, 'private.md'), '---\npublish: false\n---\n![iframe: Invalid](./private/missing.html)');
  const manifestFile = join(notes, 'day/timestamp/manifest.json');
  const initialFiles = ['index.html', 'app.js', 'style.css', 'obsolete.txt', 'data/manifest.json', 'worker.js'];
  const manifest = (files, download = true) => put(manifestFile, JSON.stringify({ version: 1, files, download }));
  await manifest(initialFiles);
  await cp(join(notes, 'day/timestamp'), join(notes, 'second/local'), { recursive: true });
  const firstPackage = 'posts/first/timestamp/';
  const sharedPackage = 'posts/second/_attachments/day/timestamp/';
  const localPackage = 'posts/second/local/';
  const assertPackage = async (prefix, files, source = 'day/timestamp') => {
    for (const file of files) assert.deepEqual(await readFile(join(site, prefix, file)), await readFile(join(notes, source, file)));
    for (const file of ['manifest.json', 'unused.js']) await assert.rejects(readFile(join(site, prefix, file)), /ENOENT/);
  };
  const assertArchive = async (prefix, files, source = 'day/timestamp') => {
    const archive = await readFile(join(site, prefix.slice(0, -1) + '.zip'));
    const members = unzipSync(archive);
    assert.deepEqual(Object.keys(members).sort(), [...files, 'manifest.json'].sort());
    for (const file of files) assert.deepEqual(Buffer.from(members[file]), await readFile(join(notes, source, file)));
    assert.deepEqual(JSON.parse(Buffer.from(members['manifest.json']).toString()), JSON.parse(await readFile(join(notes, source, 'manifest.json'), 'utf8')));
    assert.deepEqual(Buffer.from(members['manifest.json']), await readFile(join(notes, source, 'manifest.json')));
    return archive;
  };
  const build = async base => {
    // Publisher fixtures share dependencies, so keep Vite's writable cache local.
    await writeFile(config, originalConfig.replace("output: 'static',", `output: 'static', base: ${JSON.stringify(base)}, vite: { cacheDir: ${JSON.stringify(join(run, '.vite-build'))} },`));
    const before = await Promise.all([fingerprint(theme), fingerprint(notes)]);
    const result = await publish({ root: theme, runtimeRoot: project, dataDir, mode: 'build-only' }, async (script, ...args) => {
      assert(!script.includes('wrangler'), 'This acceptance must never upload');
      return runProcess(script, ...args);
    });
    assert.equal(result.status, 'built');
    assert.deepEqual(await Promise.all([fingerprint(theme), fingerprint(notes)]), before, 'publisher must leave inputs unchanged');
    return list(site);
  };
  let files = await build('/');
  await assertPackage(firstPackage, initialFiles);
  await assertPackage(sharedPackage, initialFiles);
  await assertPackage(localPackage, initialFiles, 'second/local');
  const originalZip = await assertArchive(firstPackage, initialFiles);
  await assertArchive(sharedPackage, initialFiles);
  await assertArchive(localPackage, initialFiles, 'second/local');
  assert.match(await readFile(join(site, 'posts/first/index.html'), 'utf8'), /src="\/posts\/first\/timestamp\/index.html"[^>]+sandbox="allow-scripts allow-downloads"/);
  assert.equal(await readFile(join(site, 'posts/first/legacy.html'), 'utf8'), await readFile(join(notes, 'day/legacy.html'), 'utf8'));
  const linkedHtml = await readFile(join(site, 'posts/second/index.html'), 'utf8');
  assert.doesNotMatch(linkedHtml, /<iframe/);
  assert.match(linkedHtml, /href="\.\/local\/index.html\?mode=local#result"[^>]+target="_blank"/);
  assert.match(linkedHtml, /href="\.\/_attachments\/day\/timestamp\/index.html\?mode=shared(?:&#x26;|&amp;)size=2#result"/);
  assert.match(linkedHtml, /<strong>Shared<\/strong> timestamp<\/a>/);
  assert(!files.some(name => name.endsWith('/unused.js')));
  pass('root base: mixed iframe/link references deduplicate; a link-only article publishes local and shared packages, query/hash and inline formatting');

  for (const target of ['timestamp/app.js', 'timestamp.zip']) {
    const publicCollision = join(theme, 'public/posts/first', target);
    await put(publicCollision, 'COLLISION');
    const previousSite = await fingerprint(site);
    await assert.rejects(build('/'), /failed/);
    assert.equal(await fingerprint(site), previousSite, 'failed build must not replace candidate');
    await rm(publicCollision);
  }
  pass('raw dependency and generated ZIP collisions each block the real build and retain the previous candidate');

  const appFile = join(notes, 'day/timestamp/app.js');
  await writeFile(appFile, (await readFile(appFile, 'utf8')).replace('timestamp-1', 'timestamp-2'));
  const finalFiles = initialFiles.filter(file => file !== 'obsolete.txt');
  await manifest(finalFiles);
  const markdownBefore = await Promise.all([readFile(firstNote), readFile(secondNote)]);
  files = await build('/blog/');
  assert.deepEqual(await Promise.all([readFile(firstNote), readFile(secondNote)]), markdownBefore);
  await assertPackage(firstPackage, finalFiles);
  await assertPackage(sharedPackage, finalFiles);
  await assertPackage(localPackage, initialFiles, 'second/local');
  const updatedZip = await assertArchive(firstPackage, finalFiles);
  assert.notDeepEqual(updatedZip, originalZip);
  await assertArchive(sharedPackage, finalFiles);
  assert(!files.includes(firstPackage + 'obsolete.txt') && !files.includes(sharedPackage + 'obsolete.txt'));
  assert.match(await readFile(join(site, 'posts/first/index.html'), 'utf8'), /src="\/blog\/posts\/first\/timestamp\/index.html"/);
  pass('subdirectory base: dependency and manifest changes refresh both online copies and ZIP members');

  await manifest(finalFiles, false);
  const localManifest = join(notes, 'second/local/manifest.json');
  await put(localManifest, JSON.stringify({ version: 1, files: initialFiles }));
  files = await build('/blog/');
  assert(!files.some(file => file.endsWith('.zip')));
  await assertPackage(firstPackage, finalFiles);
  await assertPackage(sharedPackage, finalFiles);
  await assertPackage(localPackage, initialFiles, 'second/local');
  assert.doesNotMatch(await readFile(join(site, 'posts/second/index.html'), 'utf8'), /download=/);
  pass('false and omitted download flags remove ZIP outputs and link controls while all online files remain published');
  await manifest(finalFiles);
  await put(localManifest, JSON.stringify({ version: 1, files: initialFiles, download: true }));

  await put(firstNote, '---\npublish: false\n---\nwithdrawn');
  files = await build('/blog/');
  assert(!files.some(name => name.startsWith('posts/first/')));
  await assertPackage(sharedPackage, finalFiles);
  await assertPackage(localPackage, initialFiles, 'second/local');
  await assertArchive(sharedPackage, finalFiles);
  await assertArchive(localPackage, initialFiles, 'second/local');
  pass('withdrawal removes entire owning article and package; other shared copy survives');
  await put(secondNote, secondBody.replace(sharedLink, 'Shared reference removed').replace(localLink, 'Local reference removed'));
  files = await build('/blog/');
  assert.deepEqual(files.filter(name => name.startsWith('posts/')), ['posts/second/index.html']);
  pass('removing final reference removes package files from clean candidate');

  // Restore only synthetic inputs for a user-reviewable dev/preview fixture.
  await put(firstNote, firstBody);
  await put(secondNote, secondBody);
  await build('/blog/');
  await symlink(join(project, 'node_modules'), join(theme, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  // A temporary theme resolves its symlinked dependencies outside its own root.
  // These dev-only settings must never be added to the production theme config.
  await writeFile(config, originalConfig.replace("output: 'static',", `output: 'static', base: '/blog/', outDir: ${JSON.stringify(site)}, devToolbar: { enabled: false }, vite: { cacheDir: ${JSON.stringify(join(theme, '.astro/vite'))}, server: { fs: { allow: ${JSON.stringify([theme, join(project, 'node_modules')])} } } },`));
  await mkdir(output, { recursive: true });
  const sockets = [createServer(), createServer()];
  for (const socket of sockets) await new Promise(done => socket.listen(0, '127.0.0.1', done));
  report.devPort = sockets[0].address().port;
  report.previewPort = sockets[1].address().port;
  for (const socket of sockets) await new Promise(done => socket.close(done));
  report.base = '/blog/';
  await save();
  console.log('Prepared fixture and candidate: ' + run);
} catch (error) {
  report.failure = error.stack;
  await save();
  throw error;
}
