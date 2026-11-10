// Local acceptance through the real Publisher and exporter. Never deploys.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publish, runProcess } from '../../lib/publisher.mjs';
import { fingerprint, sourceFiles, sourceRoots } from '../../lib/publish-files.mjs';
import { removeWithin } from '../../lib/paths.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
assert(arg('--sample'), 'Supply --sample /path/to/current/2048.html');
const sample = resolve(arg('--sample'));
const bytes = await readFile(sample);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const put = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value); };
const cache = join(project, '.astro/embedded-tools-phase-c');
await mkdir(cache, { recursive: true });
const output = await mkdtemp(join(cache, 'run-'));
const fixture = await mkdtemp(join(project, 'aero-tools-validation-'));
const theme = join(fixture, 'theme');
const notes = join(fixture, 'Vault');
const dataDir = join(output, 'publisher');
const site = join(dataDir, 'site');
const combined = join(output, 'site');
const manifestPath = join(output, 'manifest.json');
const env = { ...process.env, PATH: dirname(process.execPath) + (process.platform === 'win32' ? ';' : ':') + process.env.PATH, ASTRO_TELEMETRY_DISABLED: '1', WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' };
const report = { created: new Date().toISOString(), node: process.version, sampleSha256: hash(bytes), sampleBytes: bytes.length, cloudWrites: false, checks: [], routes: [], publisher: [] };
const manifest = { output, site: combined, sampleSha256: hash(bytes), sampleBytes: bytes.length, config: join(output, 'wrangler.json') };
let server;
let serverLog = '';
let base = '/';
const check = async (name, task) => { const detail = await task(); report.checks.push({ name, status: 'pass', detail }); console.log(`PASS ${name}`); };
const execute = (cmd, args, cwd = theme) => new Promise((done, reject) => {
  const chunks = [];
  const child = spawn(cmd, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (data) => chunks.push(data)); child.stderr.on('data', (data) => chunks.push(data));
  child.on('error', reject); child.on('close', (code) => code === 0 ? done(Buffer.concat(chunks)) : reject(new Error(`${cmd} ${args.join(' ')} failed (${code}): ${Buffer.concat(chunks).toString().slice(-3000)}`)));
});
const list = async (directory, prefix = '') => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...await list(join(directory, entry.name), prefix + entry.name + '/'));
    else { assert(entry.isFile()); files.push(prefix + entry.name); }
  }
  return files.sort();
};
const port = async () => { const socket = createServer(); await new Promise((done) => socket.listen(0, '127.0.0.1', done)); const value = socket.address().port; await new Promise((done) => socket.close(done)); return value; };
const stop = async () => {
  if (server && server.exitCode === null) { const exited = new Promise((done) => server.once('exit', done)); server.kill(); await exited; }
  server = undefined;
};
const serve = async () => {
  await stop();
  const listen = await port();
  server = spawn(process.execPath, [join(project, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', manifest.config, '--local', '--ip', '127.0.0.1', '--port', String(listen), '--inspector-port', String(await port()), '--persist-to', join(output, 'wrangler-state')], { cwd: output, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (data) => { serverLog += data; }); server.stderr.on('data', (data) => { serverLog += data; });
  const origin = `http://127.0.0.1:${listen}`;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try { if ((await fetch(origin + '/', { signal: AbortSignal.timeout(1000) })).status === 200) return origin; } catch {}
    if (server.exitCode !== null) break;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('Local Wrangler failed: ' + serverLog.slice(-3000));
};
const build = async (label) => {
  const inputFingerprint = async () => Promise.all(['src', 'public', ...sourceFiles].map((name) => fingerprint(join(theme, name))));
  const before = { theme: await inputFingerprint(), notes: await fingerprint(notes) };
  const result = await publish({ root: theme, runtimeRoot: project, dataDir, mode: 'build-only', env }, async (script, args, options) => {
    assert(!script.includes('wrangler'), 'No upload command may be invoked');
    return runProcess(script, args, options);
  });
  assert.equal(result.status, 'built');
  assert.deepEqual({ theme: await inputFingerprint(), notes: await fingerprint(notes) }, before, 'Publisher must leave its inputs unchanged');
  await assert.rejects(readFile(join(dataDir, 'last-success.json')), /ENOENT/, 'Build-only must not claim deployment');
  assert.deepEqual(await readdir(join(dataDir, 'runs')), []);
  const files = await list(site);
  assert(files.every((name) => !/\.(md|mdx)$/i.test(name) && !/(^|\/)\.obsidian\//.test(name)));
  report.publisher.push({ label, base, files: files.length, status: result.status, unchangedInputs: true });
  return files;
};
const expectFile = async (target, source) => assert.deepEqual(await readFile(join(site, target)), await readFile(join(notes, source)), target);
const missing = async (target) => assert.rejects(readFile(join(site, target)), /ENOENT/, target);
const encoded = (path) => path.split('/').map(encodeURIComponent).join('/');
const route = async (origin, path) => {
  let current = origin + path;
  const redirects = [];
  for (let n = 0; n < 8; n++) {
    const response = await fetch(current, { redirect: 'manual', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      redirects.push({ status: response.status, location }); await response.arrayBuffer();
      current = new URL(location, current).href; assert.equal(new URL(current).origin, origin);
    } else { const body = Buffer.from(await response.arrayBuffer()); return { path, redirects, finalPath: new URL(current).pathname, status: response.status, mime: response.headers.get('content-type'), sha256: hash(body), marker: body.toString().match(/PHASE_C_[A-Z_]+/)?.[0] }; }
  }
  throw new Error('Redirect loop: ' + path);
};
const aliases = (path) => { const stem = path.replace(/\/index\.html$/, '').replace(/\.html$/i, ''); return [...new Set([path, stem, stem + '/', stem + '/index', stem + '/index.html'])]; };
const toolTargets = ['posts/day/2048.html', 'posts/day/_attachments/共享工具/计算 器#.html', 'posts/second/_attachments/共享工具/计算 器#.html'];
const probe = async (phase, expected, removed = []) => {
  const origin = await serve();
  const rows = [];
  for (const prefix of phase === 'initial' ? ['', '/blog'] : ['/blog']) {
    for (const target of [...expected.keys(), ...removed]) for (const alias of aliases('/' + encoded(target))) {
      const result = await route(origin, prefix + alias);
      if (expected.has(target)) { assert.equal(result.status, 200, result.path); assert.match(result.mime, /text\/html/i); assert.equal(result.sha256, expected.get(target), result.path); }
      else { assert.equal(result.status, 404, result.path); assert.notEqual(result.sha256, report.sampleSha256); }
      rows.push({ ...result, target, statusOfCheck: 'pass' });
    }
    if (phase === 'initial') {
      for (const [directory, flat, folder] of [['collision', 'PHASE_C_FLAT', 'PHASE_C_FOLDER'], ['page-collision', 'PHASE_C_ATTACHMENT', 'PHASE_C_ARTICLE']]) {
        for (const suffix of ['tool.html', 'tool/', 'tool', 'tool/index.html']) {
          const result = await route(origin, `${prefix}/posts/${directory}/${suffix}`);
          assert.equal(result.status, 200); assert.equal(result.marker, suffix === 'tool.html' ? flat : folder);
          assert.equal(result.redirects.length, ['tool', 'tool/index.html'].includes(suffix) ? 1 : 0);
          rows.push({ ...result, statusOfCheck: 'pass' });
        }
      }
      for (const path of ['/posts/day/unused.html', '/posts/private/private.html']) assert.equal((await route(origin, prefix + path)).status, 404);
      const upper = await route(origin, prefix + '/posts/routing/UPPER.HTML'); assert.equal(upper.status, 200); assert.equal(upper.redirects.length, 0); assert.equal(upper.marker, 'PHASE_C_UPPER'); rows.push({ ...upper, statusOfCheck: 'pass' });
    }
  }
  report.routes.push({ phase, rows });
  return origin;
};

try {
  for (const name of [...sourceRoots.filter((name) => name !== 'public'), ...sourceFiles]) await cp(join(project, name), join(theme, name), { recursive: true });
  await symlink(join(project, 'node_modules'), join(theme, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await put(join(theme, 'src/config/content.config.ts'), `export const contentConfig = { notesDir: ${JSON.stringify(notes)} };\n`);
  for (const name of ['site', 'theme', 'music']) {
    const path = join(theme, `src/config/${name}.config.ts`);
    await writeFile(path, (await readFile(path, 'utf8')).replace(/'\/image\/[^']+'/g, "'/fixture.svg'"));
  }
  await put(join(theme, 'public/fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="skyblue"/></svg>');
  const wav = Buffer.alloc(44 + 8000 * 120 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < (wav.length - 44) / 2; i++) wav.writeInt16LE(Math.round(400 * Math.sin(i * 2 * Math.PI * 220 / 8000)), 44 + i * 2);
  await put(join(theme, 'public/audio/fixture.wav'), wav);
  await put(join(theme, 'public/audio/playlist.json'), JSON.stringify([{ title: 'Synthetic local acceptance tone', src: '/audio/fixture.wav' }]));
  const front = (title, slug) => `---\ntitle: ${title}\ndate: "2026-11-03"\npublish: true\nslug: ${slug}\n---\n\n`;
  const first = front('2048 local acceptance', 'day') + '<button type="button" id="before-tool">Before tool</button>\n\n![iframe: 2048 " onload="unsafe](./2048.html)\n\n<button type="button" id="after-tool">After tool</button>\n\n[Download HTML](./2048.html)\n\n![iframe: Repeat](./2048.html)\n\n![iframe: Shared][shared]\n\n[shared]: ../共享工具/计算%20器%23.html\n\n![Ordinary image](./photo.svg)\n\n[Ordinary download](./report.txt)\n\n$x^2$\n\n```js\nconst unchanged = 42;\n```\n';
  await put(join(notes, 'day/index.md'), first);
  await put(join(notes, 'day/2048.html'), bytes);
  await put(join(notes, '共享工具/计算 器#.html'), bytes);
  await put(join(notes, 'day/photo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text>ordinary image</text></svg>');
  await put(join(notes, 'day/report.txt'), 'ordinary download');
  await put(join(notes, 'second/index.md'), front('Second owner', 'second') + '![iframe: Shared](../共享工具/计算%20器%23.html)');
  await put(join(notes, 'lazy.md'), front('Long lazy article', 'lazy') + Array.from({ length: 90 }, (_, i) => `Paragraph ${i}: local lazy-loading acceptance.`).join('\n\n') + '\n\n![iframe: Lazy](./day/2048.html)');
  for (const [lang, directory] of [['zh', 'zh-CN'], ['en', 'en']]) {
    await put(join(notes, `calculator-${lang}/index.md`), front(`Calculator ${lang}`, `calculator-${lang}`) + '![iframe: Calculator](./calculator.html)');
    await copyFile(join(project, `examples/posts/${directory}/tools/calculator.html`), join(notes, `calculator-${lang}/calculator.html`));
  }
  await put(join(notes, 'day/unused.html'), '<!doctype html><p>PHASE_C_UNUSED</p>');
  await put(join(notes, 'private/index.md'), '---\npublish: false\n---\n![iframe: Invalid](https://example.invalid/private.html)');
  await put(join(notes, 'private/private.html'), '<!doctype html><p>PHASE_C_PRIVATE</p>');
  await put(join(notes, '.obsidian/private.json'), '{"private":true}');
  const marker = (name) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p id="marker">PHASE_C_${name}</p><script>document.body.dataset.ready='yes'</script>`;
  for (const [path, name] of [['routing/工具 空格#.html', 'ENCODED'], ['routing/UPPER.HTML', 'UPPER'], ['routing/folder/index.html', 'INDEX'], ['collision/tool.html', 'FLAT'], ['collision/tool/index.html', 'FOLDER'], ['page-collision/tool.html', 'ATTACHMENT']]) await put(join(notes, path), marker(name));
  await put(join(notes, 'routing/index.md'), front('Routing sample', 'routing') + '![iframe: Encoded](./工具%20空格%23.html)\n\n![iframe: Upper](./UPPER.HTML)\n\n![iframe: Index](./folder/index.html)');
  await put(join(notes, 'collision/index.md'), front('File collision routes', 'collision') + '![iframe: Flat](./tool.html)\n\n![iframe: Folder](./tool/index.html)');
  await put(join(notes, 'page-collision/index.md'), front('Article collision routes', 'page-collision') + '![iframe: Attachment](./tool.html)');
  await put(join(notes, 'page-collision/article.md'), front('PHASE_C_ARTICLE', 'page-collision/tool') + 'PHASE_C_ARTICLE');
  const originalConfig = await readFile(join(theme, 'astro.config.mjs'), 'utf8');
  await check('root Publisher build-only: real compiled tools and exact bytes', async () => {
    const files = await build('initial-root');
    for (const target of toolTargets) await expectFile(target, target.includes('_attachments') ? '共享工具/计算 器#.html' : 'day/2048.html');
    const html = await readFile(join(site, 'posts/day/index.html'), 'utf8');
    assert.match(html, /src="\/posts\/day\/2048.html"/); assert.equal((html.match(/<iframe /g) || []).length, 3); assert.match(html, /mjx-container/); assert.match(html, /astro-code/);
    assert.equal(files.filter((path) => path === toolTargets[0]).length, 1);
    await missing('posts/day/unused.html'); await missing('posts/private/index.html');
    await cp(site, combined, { recursive: true });
  });
  base = '/blog/';
  await put(join(theme, 'astro.config.mjs'), originalConfig.replace("output: 'static',", "output: 'static', base: '/blog/',"));
  await check('base Publisher build-only: encoded shared URLs and independent ownership', async () => {
    await build('initial-blog');
    for (const target of toolTargets) await expectFile(target, target.includes('_attachments') ? '共享工具/计算 器#.html' : 'day/2048.html');
    const html = await readFile(join(site, 'posts/day/index.html'), 'utf8');
    assert(html.includes('/blog/posts/day/_attachments/' + encoded('共享工具/计算 器#.html'))); assert(!html.includes('/blog/blog/'));
    await cp(site, join(combined, 'blog'), { recursive: true });
  });
  await check('real site/source archives include tools and exclude unpublished inputs', async () => {
    // Export requires a revision. This repository exists only in the disposable fixture.
    await execute('git', ['init', '--quiet']);
    await execute('git', ['add', '.']);
    await execute('git', ['-c', 'user.name=Local Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '--quiet', '-m', 'Synthetic acceptance fixture']);
    const before = await fingerprint(notes);
    await writeFile(join(output, 'export.log'), await execute(process.execPath, [join(theme, 'tools/export.mjs')]));
    const releases = await readdir(join(theme, 'release'));
    const siteArchive = releases.find((name) => name.endsWith('-site.tar.gz'));
    const sourceArchive = releases.find((name) => name.endsWith('-theme.tar.gz'));
    assert(siteArchive && sourceArchive);
    const exported = join(output, 'exported-site'); await mkdir(exported);
    await execute('tar', ['-xzf', join(theme, 'release', siteArchive), '-C', exported]);
    const files = await list(exported);
    for (const target of toolTargets) assert.deepEqual(await readFile(join(exported, target)), await readFile(join(site, target)));
    assert(files.every((path) => !/\.(md|mdx)$/i.test(path) && !path.includes('.obsidian')));
    assert(!files.includes('posts/day/unused.html') && !files.includes('posts/private/private.html'));
    assert.match(await readFile(join(exported, 'posts/day/index.html'), 'utf8'), /src="\/blog\/posts\/day\/2048.html"/);
    const sourceMembers = (await execute('tar', ['-tzf', join(theme, 'release', sourceArchive)])).toString();
    assert.match(sourceMembers, /examples\/posts\/zh-CN\/tools\/calculator.html/); assert.match(sourceMembers, /examples\/posts\/en\/tools\/calculator.html/);
    assert.doesNotMatch(sourceMembers, /tools\/test\/|docs\/architecture\/|docs\/adr\//);
    assert.equal(await fingerprint(notes), before);
    for (const name of releases) await copyFile(join(theme, 'release', name), join(output, name));
    return { siteFiles: files.length, sourceExamplesIncluded: true };
  });
  await put(manifest.config, JSON.stringify({ name: 'aero-tools-local-acceptance', compatibility_date: '2026-10-25', send_metrics: false, assets: { directory: combined, html_handling: 'force-trailing-slash', not_found_handling: 'none' } }, null, 2));
  await cp(combined, join(output, 'site-initial'), { recursive: true });
  await put(join(output, 'wrangler-initial.json'), JSON.stringify({ name: 'aero-tools-local-acceptance', compatibility_date: '2026-10-25', send_metrics: false, assets: { directory: join(output, 'site-initial'), html_handling: 'force-trailing-slash', not_found_handling: 'none' } }, null, 2));
  await put(manifestPath, JSON.stringify(manifest, null, 2));
  const initialTargets = new Map([...toolTargets, 'posts/routing/工具 空格#.html', 'posts/routing/folder/index.html'].map((target) => [target, '']));
  for (const target of initialTargets.keys()) initialTargets.set(target, hash(await readFile(join(site, target))));
  await check('local static routing: root/base, encoded names, aliases and article collisions', async () => {
    const origin = await probe('initial', initialTargets);
    if (!process.argv.includes('--skip-browser')) {
      let log;
      try { log = await execute(process.execPath, [join(project, 'tools/test/embedded-tools/phase-c-browser.mjs'), '--manifest', manifestPath, '--url', origin, '--engine', 'chromium'], project); }
      catch (error) { log = Buffer.from(error.message); }
      await writeFile(join(output, 'browser-chromium.log'), log); console.log(log.toString());
      const result = JSON.parse(await readFile(join(output, 'browser-chromium.json')));
      report.checks.push({ name: 'compiled-page Chromium browser matrix', status: result.checks.every((row) => row.status === 'pass') ? 'pass' : 'fail', passed: result.checks.filter((row) => row.status === 'pass').length, failed: result.checks.filter((row) => row.status === 'fail').length });
    }
    return { assertions: report.routes.at(-1).rows.length };
  });
  await stop();
  await check('HTML-only Publisher update refreshes every article copy', async () => {
    const updated = Buffer.concat([bytes, Buffer.from('\n<!-- PHASE_C_UPDATE -->\n')]);
    await put(join(notes, 'day/2048.html'), updated); await put(join(notes, '共享工具/计算 器#.html'), updated);
    await build('html-only-update');
    for (const target of toolTargets) assert.equal(hash(await readFile(join(site, target))), hash(updated));
    await removeWithin(combined, join(combined, 'blog')); await cp(site, join(combined, 'blog'), { recursive: true });
    await probe('update', new Map(toolTargets.map((target) => [target, hash(updated)]))); await stop();
  });
  await check('removing only iframe keeps ordinary HTML link; final reference removes only that copy', async () => {
    const linked = first.replace(/!\[tool: 2048[^\n]+\n/g, '').replace(/!\[tool: Repeat[^\n]+\n/g, '');
    await put(join(notes, 'day/index.md'), linked); await build('link-only');
    await expectFile('posts/day/2048.html', 'day/2048.html');
    const html = await readFile(join(site, 'posts/day/index.html'), 'utf8');
    assert.match(html, /href="\.\/2048.html"/); assert(!html.includes('<iframe src="/blog/posts/day/2048.html"'));
    await put(join(notes, 'day/index.md'), linked.replace('[Download HTML](./2048.html)', ''));
    await build('final-local-reference-removed'); await missing('posts/day/2048.html');
    await expectFile(toolTargets[1], '共享工具/计算 器#.html'); await expectFile(toolTargets[2], '共享工具/计算 器#.html');
  });
  await check('withdrawal removes its owned tools while the other article still works', async () => {
    await put(join(notes, 'day/index.md'), '---\npublish: false\n---\n![iframe: Invalid](https://example.invalid/withdrawn.html)');
    await build('withdraw-day'); await missing('posts/day/index.html'); await missing(toolTargets[0]); await missing(toolTargets[1]);
    await expectFile(toolTargets[2], '共享工具/计算 器#.html');
    await removeWithin(combined, join(combined, 'blog')); await cp(site, join(combined, 'blog'), { recursive: true });
    await probe('withdraw', new Map([[toolTargets[2], hash(await readFile(join(site, toolTargets[2])))]]), toolTargets.slice(0, 2)); await stop();
  });
  await check('deleting the last published notes removes every article and tool alias', async () => {
    for (const path of (await list(notes)).filter((path) => /\.md$/i.test(path) && !path.startsWith('private/') && path !== 'day/index.md')) await removeWithin(notes, join(notes, path));
    const files = await build('no-public-notes'); assert(files.every((path) => !path.startsWith('posts/')));
    await removeWithin(combined, join(combined, 'blog')); await cp(site, join(combined, 'blog'), { recursive: true });
    await probe('empty', new Map(), [...initialTargets.keys(), 'posts/routing/UPPER.HTML']); await stop();
  });
  assert.equal(hash(await readFile(sample)), report.sampleSha256, 'Original current sample must remain unchanged');
} catch (error) { report.error = error.stack; process.exitCode = 1; console.error(error); }
finally {
  await stop();
  await writeFile(join(output, 'wrangler.log'), serverLog);
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2));
  await removeWithin(project, fixture);
  console.log(`Phase C result: ${join(output, 'result.json')}`);
}
if (report.checks.some((item) => item.status === 'fail')) process.exitCode = 1;
