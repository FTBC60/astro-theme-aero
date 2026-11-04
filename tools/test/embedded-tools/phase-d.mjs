// Read-only NAS/HTTP acceptance for an explicitly prepared Phase D session.
// Does not deploy, change authentication, or modify the theme/Vault.
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const sessionFile = resolve(arg('--session', '.astro/embedded-tools-phase-d/session.json'));
const session = JSON.parse(await readFile(sessionFile, 'utf8'));
const phase = arg('--phase', session.fixture.phase);
assert(['initial', 'update', 'withdraw', 'removed'].includes(phase));
const action = arg('--action', 'inspect');
assert(['inspect', 'probe'].includes(action));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encode = (path) => '/' + path.split('/').map(encodeURIComponent).join('/');
const publicTargets = [
  `posts/${session.fixture.first}/2048.html`,
  ...[session.fixture.first, session.fixture.second].map((id) => `posts/${id}/_attachments/${session.fixture.directory}/共享工具/计算 器#.html`),
];
const expectedTargets = phase === 'removed' ? [] : phase === 'withdraw' ? [publicTargets[2]] : publicTargets;
const report = { action, phase, created: new Date().toISOString(), checks: [], cloudWrites: false };
const missing = async (file) => assert.rejects(readFile(file), (error) => error.code === 'ENOENT');
const putResult = async () => writeFile(resolve(sessionFile, '..', `${phase}-${action}.json`), JSON.stringify(report, null, 2));

try {
  if (action === 'inspect') {
    const site = join(session.project, 'data/site');
    const state = JSON.parse(await readFile(join(session.project, 'data/status.json'), 'utf8'));
    assert(['built', 'published', 'dry-run'].includes(state.status), 'NAS job is not successful');
    report.job = { id: state.id, mode: state.mode, status: state.status, startedAt: state.startedAt, finishedAt: state.finishedAt, files: state.files };
    for (const change of session.sync.files) assert.equal(hash(await readFile(join(session.theme, change.path))), change.after, `Synced theme differs: ${change.path}`);
    report.checks.push({ name: 'synced theme bytes', status: 'pass', files: session.sync.files.length });
    for (const file of session.fixture.existingNoteFiles) assert.equal(hash(await readFile(join(session.notes, file.path))), file.sha256, 'An existing Vault file changed: ' + file.path);
    report.checks.push({ name: 'pre-existing Vault files unchanged', status: 'pass', files: session.fixture.existingNoteFiles.length });
    for (const [id, count] of [[session.fixture.first, phase === 'withdraw' || phase === 'removed' ? 0 : 2], [session.fixture.second, phase === 'removed' ? 0 : 1]]) {
      const page = join(site, 'posts', id, 'index.html');
      if (!count) { await missing(page); continue; }
      const html = await readFile(page, 'utf8');
      const frames = [...html.matchAll(/<iframe\b[^>]*>/g)].map((match) => match[0]);
      assert.equal(frames.length, count);
      for (const frame of frames) {
        assert.match(frame, /sandbox="allow-scripts allow-downloads"/);
        assert.match(frame, /loading="lazy"/); assert.match(frame, /referrerpolicy="no-referrer"/);
        const src = frame.match(/src="([^"]+)"/)[1];
        assert(expectedTargets.map(encode).includes(src), 'Unexpected iframe URL: ' + src);
      }
    }
    report.checks.push({ name: 'compiled articles and fixed iframe contract', status: 'pass' });
    const expectedHash = phase === 'removed' ? null : hash(await readFile(join(session.fixture.root, phase === 'withdraw' ? '共享工具/计算 器#.html' : 'first/2048.html')));
    report.toolSha256 = expectedHash;
    for (const target of publicTargets) {
      if (expectedTargets.includes(target)) assert.equal(hash(await readFile(join(site, target))), expectedHash, target);
      else await missing(join(site, target));
    }
    await missing(join(site, 'posts', session.fixture.first, 'unused.html'));
    const list = async (directory, prefix = '') => {
      let names = [];
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) names.push(...await list(join(directory, entry.name), prefix + entry.name + '/'));
        else { assert(entry.isFile()); names.push(prefix + entry.name); }
      }
      return names;
    };
    const files = await list(site);
    assert(files.every((name) => !/\.(md|mdx)$/i.test(name) && !/(^|\/)\.obsidian\//.test(name)));
    report.checks.push({ name: 'owned tool bytes, unreferenced exclusion and raw-note exclusion', status: 'pass', toolFiles: expectedTargets.length, siteFiles: files.length });
  } else {
    const origin = new URL(arg('--url')).origin;
    assert(origin.startsWith('https://'), 'Probe the configured HTTPS site');
    const deployment = JSON.parse(await readFile(join(session.theme, 'wrangler.json'), 'utf8'));
    const allowed = new Set([...(session.workerUrls || []), ...(deployment.routes || []).filter((item) => item.custom_domain).map((item) => 'https://' + item.pattern)]);
    assert(allowed.has(origin), 'Only recorded deployment origins may be probed');
    const get = async (path) => {
      let current = origin + path;
      const redirects = [];
      for (let n = 0; n < 8; n++) {
        const response = await fetch(current, { redirect: 'manual', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
          const next = new URL(location, current);
          // Authentication redirects can contain signed metadata: never print it.
          redirects.push({ status: response.status, location: next.origin + next.pathname });
          await response.arrayBuffer();
          if (next.origin !== origin) return { path, redirects, status: response.status, authBlocked: true };
          current = next.href;
        } else {
          const bytes = Buffer.from(await response.arrayBuffer());
          return { path, redirects, finalPath: new URL(current).pathname, status: response.status, type: response.headers.get('content-type'), sha256: hash(bytes), bytes: bytes.length, authBlocked: response.headers.get('cf-mitigated') === 'challenge' || /<title>\s*(?:Just a moment|請稍候|Sign in)/i.test(bytes.toString()) };
        }
      }
      throw new Error('Redirect loop: ' + path);
    };
    const gate = await get('/');
    report.origin = origin; report.gate = gate;
    if (gate.authBlocked) { report.authBlocked = true; process.exitCode = 2; }
    else {
      assert.equal(gate.status, 200);
      const expectedHash = phase === 'removed' ? null : hash(await readFile(join(session.fixture.root, phase === 'withdraw' ? '共享工具/计算 器#.html' : 'first/2048.html')));
      for (const target of publicTargets) {
        const original = encode(target), stem = original.replace(/\.html$/, '');
        for (const path of [original, stem, stem + '/', stem + '/index', stem + '/index.html']) {
          const result = await get(path);
          assert(!result.authBlocked, 'Tool request reached an authentication page');
          if (expectedTargets.includes(target)) { assert.equal(result.status, 200); assert.match(result.type, /text\/html/i); assert.equal(result.sha256, expectedHash); }
          else { assert.equal(result.status, 404); assert.notEqual(result.sha256, session.fixture.sourceSha256); }
          report.checks.push({ ...result, statusOfCheck: 'pass' });
        }
      }
      const unused = await get(`/posts/${session.fixture.first}/unused.html`); assert.equal(unused.status, 404); assert(!unused.authBlocked);
      report.checks.push({ ...unused, statusOfCheck: 'pass' });
    }
  }
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { await putResult(); }
console.log(JSON.stringify({ action, phase, job: report.job, passed: report.checks.length, authBlocked: report.authBlocked || false, error: report.error, cloudWrites: false }));
