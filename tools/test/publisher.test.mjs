import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { checkDependencies, publish, runProcess } from '../lib/publisher.mjs';
import { copyNotes, fingerprint, inspectSite } from '../lib/publish-files.mjs';
import { createNotesSnapshot } from '../lib/notes-snapshot.mjs';
import { removeWithin } from '../lib/paths.mjs';
import { scheduleConfig } from '../scheduler.mjs';
import { loadDeploymentConfig } from '../lib/deployment-config.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const deploymentTemplate = JSON.parse(await readFile(join(project, 'wrangler.json'), 'utf8'));
const cache = join(project, '.astro');
const put = async (path, value) => { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, value); };
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function fixture(run) {
  await mkdir(cache, { recursive: true });
  const workspace = await mkdtemp(join(cache, 'publisher-test-'));
  const root = join(workspace, 'theme');
  const runtimeRoot = join(workspace, 'runtime');
  const dataDir = join(workspace, 'data');
  const env = { ...process.env, WORKER_NAME: 'test-diary', CLOUDFLARE_ACCOUNT_ID: 'test-account', CLOUDFLARE_API_TOKEN: 'sensitive-test-token' };
  try {
    await put(join(root, '.gitignore'), '/public/private/\n');
    await put(join(root, 'package.json'), '{"type":"module"}');
    await put(join(root, 'wrangler.json'), JSON.stringify({ ...deploymentTemplate, name: 'test-diary' }));
    await put(join(root, 'package-lock.json'), '{"lockfileVersion":3}');
    await put(join(runtimeRoot, 'package.json'), '{"type":"module"}');
    await put(join(runtimeRoot, 'package-lock.json'), '{"lockfileVersion":3}');
    await put(join(root, 'astro.config.mjs'), "export default { output: 'static' };\n");
    await put(join(root, 'src/config/content.config.ts'), "export const contentConfig = { notesDir: './notes' };\n");
    await put(join(root, 'notes/日记/day.md'), '---\ntitle: Day\ndate: "2026-01-01"\npublish: true\n---\n![photo](photo.txt)');
    await put(join(root, 'notes/日记/photo.txt'), 'original attachment');
    await put(join(root, 'public/private/secret.txt'), 'must not be staged');
    await put(join(root, 'public/visible.txt'), 'visible');
    await put(join(root, 'compose.yaml'), 'secret configuration must not be staged');
    await symlink(join(project, 'node_modules'), join(runtimeRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await run({ root, runtimeRoot, dataDir, env });
  } finally {
    assert(workspace.startsWith(cache));
    await rm(workspace, { recursive: true, force: true });
  }
}

function runner(events, fail) {
  return async (script, args, options) => {
    const operation = script.includes('wrangler') ? 'deploy' : args[0];
    events.push(operation);
    assert(!options.signal.aborted);
    if (operation !== 'deploy') {
      assert.equal(options.env.CLOUDFLARE_API_TOKEN, undefined);
      assert.equal(options.env.CLOUDFLARE_ACCOUNT_ID, undefined);
      assert.match(await readFile(join(options.cwd, 'src/config/content.config.ts'), 'utf8'), /\.\/\.notes/);
      await assert.rejects(readFile(join(options.cwd, 'compose.yaml')), /ENOENT/);
      await assert.rejects(readFile(join(options.cwd, 'wrangler.json')), /ENOENT/);
      await assert.rejects(readFile(join(options.cwd, 'public/private/secret.txt')), /ENOENT/);
      assert.equal(await readFile(join(options.cwd, '.notes/日记/photo.txt'), 'utf8'), 'original attachment');
    } else {
      assert.equal(options.env.CLOUDFLARE_API_TOKEN, 'sensitive-test-token');
      const config = await json(args[args.indexOf('--config') + 1]);
      assert.equal(config.workers_dev, false);
      assert.equal(config.preview_urls, false);
      assert.equal(config.assets.html_handling, 'force-trailing-slash');
      assert.equal(await readFile(join(config.assets.directory, 'index.html'), 'utf8'), '<html>built</html>');
    }
    // Deliberately split the credential across chunks to verify log redaction.
    options.output('sensitive-test-'); options.output('token\n');
    if (operation === fail) throw new Error(`${operation} failed sensitive-test-token`);
    if (operation === 'build') await put(join(options.cwd, 'dist/index.html'), '<html>built</html>');
  };
}

test('publisher stages a read-only input copy, filters resources, deploys and persists status', async () => fixture(async (options) => {
  const events = [];
  const before = await fingerprint(join(options.root, 'notes'));
  const result = await publish(options, runner(events));
  assert.equal(result.status, 'published');
  assert.deepEqual(events, ['check', 'build', 'deploy']);
  assert.equal(await fingerprint(join(options.root, 'notes')), before);
  assert.equal((await json(join(options.dataDir, 'last-success.json'))).status, 'published');
  assert.deepEqual(await readdir(join(options.dataDir, 'runs')), []);
  const logs = (await Promise.all((await readdir(join(options.dataDir, 'logs'))).map((name) => readFile(join(options.dataDir, 'logs', name), 'utf8')))).join('');
  assert(!logs.includes('sensitive-test-token'));
  assert(logs.includes('[redacted]'));
  assert.match(await readFile(join(options.root, 'src/config/content.config.ts'), 'utf8'), /\.\/notes/);
}));

test('deployment settings reload from the theme and only the inspected site is uploaded', async () => fixture(async (options) => {
  const captured = [];
  const fake = runner([]);
  const run = async (script, args, command) => {
    if (!script.includes('wrangler')) return fake(script, args, command);
    const config = await json(args[args.indexOf('--config') + 1]);
    assert.equal(config.assets.directory, join(options.dataDir, 'site'));
    assert.equal(await readFile(join(config.assets.directory, 'index.html'), 'utf8'), '<html>built</html>');
    assert.equal(command.env.WRANGLER_SEND_METRICS, String(config.send_metrics));
    captured.push(config);
  };
  const path = join(options.root, 'wrangler.json');
  const original = await readFile(path, 'utf8');
  const staleEnvironment = { ...options.env, WORKER_NAME: 'ignored-old-name' };
  await publish({ ...options, env: staleEnvironment }, run);
  assert.equal(await readFile(path, 'utf8'), original);
  const updated = { ...deploymentTemplate, name: 'updated-diary', workers_dev: true, preview_urls: true, send_metrics: true, compatibility_flags: ['nodejs_compat'], routes: [{ pattern: 'diary.example.com', custom_domain: true, zone_name: 'example.com' }], assets: { html_handling: 'drop-trailing-slash', not_found_handling: '404-page' } };
  await put(path, JSON.stringify(updated));
  const result = await publish({ ...options, env: staleEnvironment }, run);
  assert.equal(result.workerName, 'updated-diary');
  assert.equal(captured[0].name, 'test-diary');
  assert.equal(captured[0].workers_dev, false);
  assert.deepEqual(captured[1], { ...updated, assets: { ...updated.assets, directory: join(options.dataDir, 'site') } });
  assert.equal(await readFile(path, 'utf8'), JSON.stringify(updated));
}));

test('invalid or missing deployment configuration stops before build or upload', async () => fixture(async (options) => {
  const path = join(options.root, 'wrangler.json');
  const invalid = [
    'not JSON', 'null', '[]', '{}',
    JSON.stringify({ ...deploymentTemplate, name: '' }),
    JSON.stringify({ ...deploymentTemplate, compatibility_date: '2026-02-30' }),
    JSON.stringify({ ...deploymentTemplate, workers_dev: 'true' }),
    JSON.stringify({ ...deploymentTemplate, routes: 'diary.example.com' }),
    JSON.stringify({ ...deploymentTemplate, routes: [{ pattern: 'https://diary.example.com/', custom_domain: true }] }),
    JSON.stringify({ ...deploymentTemplate, routes: [], route: 'diary.example.com/*' }),
    JSON.stringify({ ...deploymentTemplate, assets: { directory: '/private' } }),
    JSON.stringify({ ...deploymentTemplate, main: 'src/worker.js' }),
    JSON.stringify({ ...deploymentTemplate, account_id: 'not-a-config-credential' }),
  ];
  for (const text of invalid) {
    await put(path, text);
    const events = [];
    await assert.rejects(publish(options, runner(events)), /Invalid wrangler.json/);
    assert.deepEqual(events, []);
  }
  await rm(path);
  await assert.rejects(publish(options, runner([])), /Cannot read deployment configuration/);
  await put(path, '\uFEFF' + JSON.stringify({ ...deploymentTemplate, routes: ['example.com/*'] }));
  assert.deepEqual((await loadDeploymentConfig(options.root)).routes, ['example.com/*']);
}));

test('real builds read changed theme config, styles and public assets without changing the toolchain', { timeout: 90000 }, async () => fixture(async (options) => {
  // An unrelated parent project must never become the staged app's check root.
  await put(join(options.root, '../tsconfig.json'), JSON.stringify({ include: ['outside.ts'] }));
  await put(join(options.root, '../outside.ts'), 'const outside: string = 123;');
  await put(join(options.root, 'tsconfig.json'), JSON.stringify({
    extends: 'astro/tsconfigs/strict',
    include: ['.astro/types.d.ts', 'src/**/*'],
    exclude: ['dist', 'node_modules'],
  }));
  await put(join(options.root, 'src/config/display.ts'), 'export const title = "First title";');
  await put(join(options.root, 'src/styles/theme.css'), 'body { color: #123456; }');
  await put(join(options.root, 'public/audio/playlist.json'), '[{"title":"First track"}]');
  await put(join(options.root, 'public/image/cover.svg'), '<svg>first</svg>');
  await put(join(options.root, 'tools/deploy.mjs'), 'throw new Error("Mounted tools must not run");');
  await cp(join(project, 'tools/lib'), join(options.runtimeRoot, 'tools/lib'), { recursive: true });
  await cp(join(project, 'tools/deploy.mjs'), join(options.runtimeRoot, 'tools/deploy.mjs'));
  await put(join(options.root, 'src/pages/index.astro'), `---
import { ClientRouter } from 'astro:transitions';
import { title } from '../config/display';
import '../styles/theme.css';
---
<html><head><ClientRouter /></head><body>{title}</body></html>`);
  const toolchainFiles = () => Promise.all(['package.json', 'package-lock.json'].map((name) => readFile(join(options.runtimeRoot, name), 'utf8')));
  const toolchainBefore = await toolchainFiles();
  const result = await publish({ ...options, mode: 'build-only' });
  assert.equal(result.status, 'built');
  assert.match(await readFile(join(options.dataDir, 'site/index.html'), 'utf8'), /First title/);
  await put(join(options.root, 'src/config/display.ts'), 'export const title = "Updated title";');
  await put(join(options.root, 'src/styles/theme.css'), 'body { color: #654321; }');
  await put(join(options.root, 'public/audio/playlist.json'), '[{"title":"Updated track"}]');
  await put(join(options.root, 'public/image/cover.svg'), '<svg>updated</svg>');
  // Launch the actual image-style CLI from a tool-only root with no src/public.
  await runProcess(join(options.runtimeRoot, 'tools/deploy.mjs'), ['--build-only'], {
    cwd: options.runtimeRoot,
    env: { ...options.env, THEME_DIR: options.root, PUBLISHER_DATA_DIR: options.dataDir },
    signal: new AbortController().signal,
    output: (text) => process.stdout.write(text),
  });
  assert.match(await readFile(join(options.dataDir, 'site/index.html'), 'utf8'), /Updated title/);
  assert.match(await readFile(join(options.dataDir, 'site/audio/playlist.json'), 'utf8'), /Updated track/);
  assert.equal(await readFile(join(options.dataDir, 'site/image/cover.svg'), 'utf8'), '<svg>updated</svg>');
  const css = (await readdir(join(options.dataDir, 'site/_astro'))).filter((name) => name.endsWith('.css'));
  const html = await readFile(join(options.dataDir, 'site/index.html'), 'utf8');
  assert.match(html + (await Promise.all(css.map((name) => readFile(join(options.dataDir, 'site/_astro', name), 'utf8')))).join(''), /#654321/);
  assert.deepEqual(await toolchainFiles(), toolchainBefore);
  await assert.rejects(readFile(join(options.root, 'node_modules/astro/package.json')), /ENOENT/);
  await assert.rejects(readFile(join(options.runtimeRoot, 'src/config/display.ts')), /ENOENT/);
  assert.deepEqual(await readdir(join(options.dataDir, 'runs')), []);
}));

test('changed or missing dependency files block checks and deployment until the image is rebuilt', async () => fixture(async (options) => {
  for (const name of ['package.json', 'package-lock.json']) {
    const path = join(options.root, name);
    const original = await readFile(path, 'utf8');
    await put(path, JSON.stringify({ ...JSON.parse(original), changed: true }));
    const events = [];
    await assert.rejects(publish(options, runner(events)), /differs from the publisher toolchain.*Rebuild/);
    assert.deepEqual(events, []);
    assert.equal((await json(join(options.dataDir, 'status.json'))).status, 'failed');
    await put(path, original);
    await rm(path);
    await assert.rejects(publish(options, runner(events)), /Cannot read dependency file/);
    assert.deepEqual(events, []);
    await put(path, original);
  }
  // JSON formatting and line endings are not dependency changes.
  await put(join(options.root, 'package.json'), '{\r\n  "type": "module"\r\n}\r\n');
  await checkDependencies(options.root, options.runtimeRoot);
}));

test('check, build and deployment failures stop the pipeline and retain last success', async () => fixture(async (options) => {
  await publish(options, runner([]));
  const lastSuccess = await readFile(join(options.dataDir, 'last-success.json'), 'utf8');
  for (const failed of ['check', 'build', 'deploy']) {
    const events = [];
    await assert.rejects(publish(options, runner(events, failed)), /\[redacted\]/);
    assert.deepEqual(events, ['check', 'build', 'deploy'].slice(0, ['check', 'build', 'deploy'].indexOf(failed) + 1));
    assert.equal((await json(join(options.dataDir, 'status.json'))).status, 'failed');
    assert.equal(await readFile(join(options.dataDir, 'last-success.json'), 'utf8'), lastSuccess);
    assert.deepEqual(await readdir(join(options.dataDir, 'runs')), []);
  }
}));

test('publisher builds and records the verified retry result rather than the first notes copy', async () => fixture(async (options) => {
  const events = [];
  const fake = runner(events);
  const notes = join(options.root, 'notes');
  let copies = 0;
  const snapshot = (settings) => createNotesSnapshot(settings, async (source, destination) => {
    await copyNotes(source, destination);
    if (++copies === 1) await put(join(source, 'added-during-copy.txt'), 'latest source');
  });
  const result = await publish(options, async (...args) => {
    if (args[1][0] === 'check') assert.equal(await readFile(join(args[2].cwd, '.notes/added-during-copy.txt'), 'utf8'), 'latest source');
    await fake(...args);
  }, snapshot);
  assert.equal(copies, 2);
  assert.equal(result.notesDigest, await fingerprint(notes));
  assert.deepEqual(events, ['check', 'build', 'deploy']);
  const log = await readFile(join(options.dataDir, 'logs', result.id + '.log'), 'utf8');
  assert.equal(log.match(/retrying the snapshot/g)?.length, 1);
}));

test('three changing snapshots prevent checks, builds and upload while retaining last success', async () => fixture(async (options) => {
  await publish(options, runner([]));
  const previous = await readFile(join(options.dataDir, 'last-success.json'), 'utf8');
  const events = [];
  let copies = 0;
  await assert.rejects(publish(options, runner(events), (settings) => createNotesSnapshot(settings, async (source, destination) => {
    await copyNotes(source, destination);
    await put(join(source, '日记/photo.txt'), `edit ${++copies}`);
  })), /Notes changed repeatedly/);
  assert.equal(copies, 3);
  assert.deepEqual(events, []);
  const status = await json(join(options.dataDir, 'status.json'));
  assert.equal(status.status, 'failed');
  assert.equal(await readFile(join(options.dataDir, 'last-success.json'), 'utf8'), previous);
  assert.equal(await readFile(join(options.dataDir, 'site/index.html'), 'utf8'), '<html>built</html>');
  assert.deepEqual(await readdir(join(options.dataDir, 'runs')), []);
  const log = await readFile(join(options.dataDir, 'logs', status.id + '.log'), 'utf8');
  assert.equal(log.match(/retrying the snapshot/g)?.length, 2);
}));

test('snapshot I/O errors and cancellation cannot enter the build pipeline or replace last success', async () => fixture(async (options) => {
  await publish(options, runner([]));
  const previous = await readFile(join(options.dataDir, 'last-success.json'), 'utf8');
  const before = await fingerprint(join(options.root, 'notes'));
  for (const mode of ['error', 'cancel']) {
    const events = [];
    const controller = new AbortController();
    let copies = 0;
    await assert.rejects(publish({ ...options, signal: controller.signal }, runner(events), (settings) => createNotesSnapshot(settings, async (...args) => {
      copies++;
      await copyNotes(...args);
      if (mode === 'cancel') controller.abort(new Error('snapshot interrupted'));
      else throw Object.assign(new Error('snapshot copy denied'), { code: 'EACCES' });
    })), /snapshot (interrupted|copy denied)/);
    assert.equal(copies, 1);
    assert.deepEqual(events, []);
    assert.equal((await json(join(options.dataDir, 'status.json'))).status, 'failed');
    assert.equal(await readFile(join(options.dataDir, 'last-success.json'), 'utf8'), previous);
    assert.equal(await fingerprint(join(options.root, 'notes')), before);
    assert.deepEqual(await readdir(join(options.dataDir, 'runs')), []);
  }
}));

test('manual and scheduled invocations share a lock; stale lock and abandoned runs recover', async () => fixture(async (options) => {
  let resume;
  let entered;
  const started = new Promise((done) => { entered = done; });
  const pending = new Promise((done) => { resume = done; });
  const fake = runner([]);
  const first = publish(options, async (...args) => { if (args[1][0] === 'check') { entered(); await pending; } await fake(...args); });
  await started;
  assert.equal((await publish(options, runner([]))).status, 'skipped');
  resume();
  await first;
  await mkdir(join(options.dataDir, 'publish.lock'));
  const old = new Date(Date.now() - 60000);
  await utimes(join(options.dataDir, 'publish.lock'), old, old);
  await put(join(options.dataDir, 'runs/run-abandoned/private.md'), 'old private snapshot');
  await put(join(options.dataDir, 'runs/unrelated/keep.txt'), 'keep');
  const result = await publish({ ...options, mode: 'build-only' }, runner([]));
  assert.equal(result.status, 'built');
  assert.deepEqual(await readdir(join(options.dataDir, 'runs')), ['unrelated']);
}));

test('dry run skips publication status; missing credentials and interrupts cannot deploy', async () => fixture(async (options) => {
  const events = [];
  const fake = runner(events);
  await publish({ ...options, mode: 'dry-run' }, async (...args) => {
    if (args[0].includes('wrangler')) assert(args[1].includes('--dry-run'));
    await fake(...args);
  });
  await assert.rejects(readFile(join(options.dataDir, 'last-success.json')), /ENOENT/);
  await assert.rejects(publish({ ...options, env: {} }, runner([])), /requires real/);
  const abort = new AbortController();
  const interrupted = [];
  await assert.rejects(publish({ ...options, signal: abort.signal }, async (...args) => {
    await runner(interrupted)(...args);
    if (args[1][0] === 'check') abort.abort(new Error('interrupted test'));
  }), /interrupted/);
  assert.deepEqual(interrupted, ['check']);
}));

test('site inspection rejects source files and limits, and cleanup rejects paths outside its parent', async () => fixture(async ({ root }) => {
  const site = join(root, 'site');
  await put(join(site, 'index.html'), 'HTML');
  assert.equal((await inspectSite(site)).files, 1);
  await put(join(site, 'private.md'), 'private');
  await assert.rejects(inspectSite(site), /Unexpected source/);
  await rm(join(site, 'private.md'));
  await put(join(site, 'wrangler.json'), '{}');
  await assert.rejects(inspectSite(site), /Unexpected source or configuration/);
  await rm(join(site, 'wrangler.json'));
  await put(join(site, 'large.bin'), Buffer.alloc(25 * 1024 * 1024 + 1));
  await assert.rejects(inspectSite(site), /25 MiB/);
  await assert.rejects(removeWithin(site, root), /Refusing cleanup/);
}));

test('the real child-process runner stops an interrupted command', async () => fixture(async ({ root }) => {
  const script = join(root, 'slow.mjs');
  await put(script, 'console.log("ready"); setInterval(() => {}, 1000);');
  const abort = new AbortController();
  await assert.rejects(runProcess(script, [], { cwd: root, env: process.env, signal: abort.signal, output: (text) => { if (text.includes('ready')) abort.abort(); } }), /failed/);
}));

test('Compose settings, cron format, timezone and pinned image configuration agree', async () => {
  const dockerignore = await readFile(join(project, '.dockerignore'), 'utf8');
  assert.doesNotMatch(dockerignore, /[^\x09\x0a\x0d\x20-\x7e]/, 'Keep Docker ignore rules ASCII-only for older BuildKit metadata transport');
  assert.match(dockerignore, /^tools\/test\/$/m, 'Tests must be excluded after the tools allow rule');
  assert(dockerignore.indexOf('tools/test/') > dockerignore.indexOf('!tools/**'));
  const compose = YAML.parse(await readFile(join(project, 'examples/deployment/compose.yaml'), 'utf8'));
  const service = compose.services.publisher;
  assert.equal(service.environment.CONTENT_DIR, undefined);
  assert.equal(service.environment.WORKER_NAME, undefined);
  assert.equal(service.environment.CRON_SCHEDULE, '0 3 * * *');
  assert.equal(service.volumes[0].read_only, true);
  assert.equal(service.volumes[0].bind.create_host_path, false);
  assert.equal(service.environment.THEME_DIR, '/theme');
  assert.equal(service.volumes[0].target, '/theme');
  assert.equal(service.volumes[1].target, '/theme/src/content/blog');
  assert.equal(service.volumes[1].read_only, true);
  assert.deepEqual(scheduleConfig(service.environment), { schedule: '0 3 * * *', timezone: 'America/Los_Angeles' });
  assert.throws(() => scheduleConfig({ CRON_SCHEDULE: '* * * * *\necho stolen', TZ: 'UTC' }), /five-field/);
  assert.throws(() => scheduleConfig({ CRON_SCHEDULE: '* * * * *', TZ: 'Invalid/Zone' }), /Invalid TZ/);
  const dockerfile = await readFile(join(project, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /FROM node:24\.22\.1-bookworm-slim/);
  assert.match(dockerfile, /SUPERCRONIC_VERSION=v0\.2\.51/);
  assert.match(dockerfile, /sha256sum -c/);
  assert.doesNotMatch(dockerfile, /COPY (src|public|astro\.config)/);
  assert.doesNotMatch(dockerfile, /^COPY tools \.\/tools$/m);
  assert.match(dockerfile, /^COPY tools\/deploy\.mjs tools\/export\.mjs tools\/scheduler\.mjs \.\/tools\/$/m);
  assert.match(dockerfile, /^COPY tools\/lib \.\/tools\/lib$/m);
  assert.match(dockerfile, /THEME_DIR=\/theme/);
});
