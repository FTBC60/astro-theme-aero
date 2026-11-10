// Read-only checks run by the user in the existing Publisher container.
// The separate, session-specific host script owns the disposable source edits.
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const configPath = process.argv[2];
const phase = process.argv[3];
assert(configPath && ['initial', 'update', 'withdraw', 'removed'].includes(phase));
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert(/^[a-f0-9]{6}$/.test(config.nonce));
assert(config.directory === `2026-11-03-工具验收-${config.nonce}`);
assert(config.first === `tool-validation-20261103-${config.nonce}`);
assert(config.second === `tool-shared-20261103-${config.nonce}`);
const origin = new URL(config.origin).origin;
assert(origin === config.origin && origin.startsWith('https://'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileHash = async (path) => hash(await readFile(path));
const root = '/theme/src/content/posts';
const fixture = join(root, config.directory);
const site = '/data/site';
const result = { phase, created: new Date().toISOString(), status: 'running', cloudWrites: false, checks: [], routes: [] };
const outputPath = `/data/embedded-tools-phase-d-${config.nonce}-${phase}.json`;
const missing = async (path) => assert.rejects(stat(path), (error) => error.code === 'ENOENT');
const list = async (directory, prefix = '') => {
  let files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Unexpected validation symlink');
    if (entry.isDirectory()) files.push(...await list(join(directory, entry.name), prefix + entry.name + '/'));
    else { assert(entry.isFile()); files.push(prefix + entry.name); }
  }
  return files.sort();
};
const encode = (path) => '/' + path.split('/').map(encodeURIComponent).join('/');
const targets = [
  `posts/${config.first}/2048.html`,
  ...[config.first, config.second].map((id) => `posts/${id}/_attachments/${config.directory}/共享工具/计算 器#.html`),
];
const surviving = phase === 'removed' ? [] : phase === 'withdraw' ? [targets[2]] : targets;
const expectedHash = phase === 'initial' ? config.sourceSha256 : config.updatedSha256;
const get = async (path) => {
  let current = origin + path;
  const redirects = [];
  for (let n = 0; n < 8; n++) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, current);
      redirects.push({ status: response.status, location: next.pathname }); await response.arrayBuffer();
      assert.equal(next.origin, origin, 'Authentication or unexpected cross-origin redirect');
      current = next.href;
    } else {
      const body = Buffer.from(await response.arrayBuffer());
      assert(response.headers.get('cf-mitigated') !== 'challenge' && !/<title>\s*(?:Just a moment|請稍候|Sign in)/i.test(body.toString()), 'Authentication/challenge page is not tool evidence');
      return { path, redirects, finalPath: new URL(current).pathname, httpStatus: response.status, mime: response.headers.get('content-type'), sha256: hash(body), bytes: body.length, marker: body.toString().includes(`PHASE_D_${config.nonce}`) };
    }
  }
  throw new Error('Redirect loop');
};

try {
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8')).trim().split('\n').map((line) => line.split(' '));
  for (const target of ['/theme', root]) assert(mounts.some((fields) => fields[4] === target && fields[5].split(',').includes('ro')), 'Expected read-only mount: ' + target);
  const tools = ['package.json', 'package-lock.json', 'tools/deploy.mjs', 'tools/export.mjs', 'tools/scheduler.mjs', ...(await readdir('/app/tools/lib')).filter((name) => name.endsWith('.mjs')).map((name) => 'tools/lib/' + name)];
  for (const file of tools) assert.equal(await fileHash('/app/' + file), await fileHash('/theme/' + file), 'Image mismatch: ' + file);
  result.runtime = { node: process.version, astro: JSON.parse(await readFile('/app/node_modules/astro/package.json')).version, wrangler: JSON.parse(await readFile('/app/node_modules/wrangler/package.json')).version, themeReadOnly: true, notesReadOnly: true, matchingFiles: tools.length };
  for (const file of config.synced) assert.equal(await fileHash(join('/theme', file.path)), file.after, 'Synced theme changed: ' + file.path);
  for (const file of config.originalNotes) assert.equal(await fileHash(join(root, file.path)), file.sha256, 'Pre-existing Vault input changed');
  result.checks.push({ name: 'read-only mounts, matching toolchain, synced theme and original Vault inputs', status: 'pass', originalFiles: config.originalNotes.length });

  if (phase === 'removed') await missing(fixture);
  else {
    assert.deepEqual(await list(fixture), config.originalFixture.map((file) => file.path).sort(), 'Unexpected file in disposable directory; refuse cleanup');
    for (const file of config.originalFixture) {
      const expected = ['first/2048.html', '共享工具/计算 器#.html'].includes(file.path) ? expectedHash : file.path === 'first/index.md' && phase === 'withdraw' ? config.withdrawnNoteSha256 : file.sha256;
      assert.equal(await fileHash(join(fixture, file.path)), expected, 'Disposable input changed unexpectedly: ' + file.path);
    }
  }
  result.checks.push({ name: 'exact disposable source inventory and expected phase bytes', status: 'pass' });
  const job = JSON.parse(await readFile('/data/status.json', 'utf8'));
  const lastSuccess = JSON.parse(await readFile('/data/last-success.json', 'utf8'));
  assert.equal(job.status, 'published'); assert.equal(job.id, lastSuccess.id);
  if (phase !== 'initial') {
    const previous = phase === 'update' ? 'initial' : phase === 'withdraw' ? 'update' : 'withdraw';
    const previousResult = JSON.parse(await readFile(`/data/embedded-tools-phase-d-${config.nonce}-${previous}.json`, 'utf8'));
    assert.equal(previousResult.status, 'pass'); assert.notEqual(job.id, previousResult.job.id, 'A new successful publication is required');
  }
  result.job = { id: job.id, status: job.status, mode: job.mode, startedAt: job.startedAt, finishedAt: job.finishedAt, files: job.files };
  for (const target of targets) {
    if (surviving.includes(target)) assert.equal(await fileHash(join(site, target)), expectedHash);
    else await missing(join(site, target));
  }
  for (const [id, count] of [[config.first, phase === 'withdraw' || phase === 'removed' ? 0 : 2], [config.second, phase === 'removed' ? 0 : 1]]) {
    const target = join(site, 'posts', id, 'index.html');
    if (!count) await missing(target);
    else {
      const html = await readFile(target, 'utf8');
      const frames = [...html.matchAll(/<iframe\b[^>]*>/g)].map((match) => match[0]); assert.equal(frames.length, count);
      for (const frame of frames) { assert.match(frame, /sandbox="allow-scripts allow-downloads"/); assert.match(frame, /referrerpolicy="no-referrer"/); assert.match(frame, /loading="lazy"/); }
    }
  }
  await missing(join(site, 'posts', config.first, 'unused.html'));
  const files = await list(site); assert(files.every((name) => !/\.(md|mdx)$/i.test(name) && !/(^|\/)\.obsidian\//.test(name)));
  assert.equal(files.length, config.siteFiles[phase], 'Unexpected live site inventory; review concurrent edits');
  result.checks.push({ name: 'candidate article/tool ownership, exact HTML bytes and exclusions', status: 'pass', siteFiles: files.length, survivingToolFiles: surviving.length });
  const home = await get('/'); assert.equal(home.httpStatus, 200);
  for (const target of targets) {
    const path = encode(target), stem = path.replace(/\.html$/, '');
    for (const alias of [path, stem, stem + '/', stem + '/index', stem + '/index.html']) {
      const route = await get(alias);
      if (surviving.includes(target)) { assert.equal(route.httpStatus, 200); assert.match(route.mime, /text\/html/i); assert.equal(route.sha256, expectedHash); }
      else { assert.equal(route.httpStatus, 404); assert(![config.sourceSha256, config.updatedSha256].includes(route.sha256)); }
      result.routes.push({ ...route, statusOfCheck: 'pass' });
    }
  }
  for (const [id, exists] of [[config.first, !['withdraw', 'removed'].includes(phase)], [config.second, phase !== 'removed']]) {
    const route = await get(`/posts/${id}/`); assert.equal(route.httpStatus, exists ? 200 : 404);
    if (exists) assert(route.marker); result.routes.push({ ...route, statusOfCheck: 'pass' });
  }
  for (const path of [`/posts/${config.first}/unused.html`, '/tags/' + encodeURIComponent('临时工具验收') + '/']) {
    const route = await get(path); assert.equal(route.httpStatus, path.includes('/tags/') && phase !== 'removed' ? 200 : 404);
    result.routes.push({ ...route, statusOfCheck: 'pass' });
  }
  result.status = 'pass';
} catch (error) { result.status = 'fail'; result.error = error.message; process.exitCode = 1; }
finally { await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n'); }
console.log(JSON.stringify({ phase, status: result.status, job: result.job?.id, siteFiles: result.job?.files, routes: result.routes.length, runtime: result.runtime, error: result.error }));
