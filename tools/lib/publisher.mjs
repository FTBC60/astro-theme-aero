import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import lockfile from 'proper-lockfile';
import { inside, removeWithin, resolveNotesDir } from './paths.mjs';
import { copyTheme, inspectSite } from './publish-files.mjs';
import { createNotesSnapshot } from './notes-snapshot.mjs';
import { loadDeploymentConfig, siteDeploymentConfig } from './deployment-config.mjs';

export function runProcess(script, args, { cwd, env, signal, output }) {
  return new Promise((done, reject) => {
    signal.throwIfAborted();
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let stopTimer;
    const kill = (name) => {
      try { process.platform === 'win32' ? child.kill(name) : process.kill(-child.pid, name); }
      catch (error) { if (error.code !== 'ESRCH') output(error.message + '\n'); }
    };
    const stop = () => {
      kill('SIGTERM');
      stopTimer = setTimeout(() => kill('SIGKILL'), 5000);
    };
    signal.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', (data) => output(data.toString()));
    child.stderr.on('data', (data) => output(data.toString()));
    child.on('error', reject);
    child.on('close', (code, reason) => {
      clearTimeout(stopTimer);
      signal.removeEventListener('abort', stop);
      code === 0 && !signal.aborted ? done() : reject(new Error(`${basename(script)} ${args[0] || ''} failed (${reason || code})`));
    });
  });
}

async function jsonFile(path, data) {
  await writeFile(path + '.tmp', JSON.stringify(data, null, 2) + '\n');
  await rename(path + '.tmp', path);
}

export async function checkDependencies(themeRoot, runtimeRoot) {
  for (const name of ['package.json', 'package-lock.json']) {
    const load = async (root) => {
      try { return JSON.parse(await readFile(join(root, name), 'utf8')); }
      catch (error) { throw new Error(`Cannot read dependency file ${join(root, name)}: ${error.message}`); }
    };
    if (!isDeepStrictEqual(await load(themeRoot), await load(runtimeRoot))) {
      throw new Error(`${name} differs from the publisher toolchain. Rebuild the publisher image before publishing.`);
    }
  }
}

export async function publish({ root, runtimeRoot = fileURLToPath(new URL('../../', import.meta.url)), dataDir, mode = 'deploy', env = process.env, signal = new AbortController().signal }, run = runProcess, snapshotNotes = createNotesSnapshot) {
  if (!['deploy', 'dry-run', 'build-only'].includes(mode)) throw new Error(`Unknown publish mode: ${mode}`);
  root = await realpath(root);
  runtimeRoot = await realpath(runtimeRoot);
  dataDir = resolve(dataDir);
  await mkdir(dataDir, { recursive: true });
  dataDir = await realpath(dataDir);
  const controller = new AbortController();
  const aborted = () => controller.abort(signal.reason || new Error('Publication interrupted'));
  signal.addEventListener('abort', aborted, { once: true });
  if (signal.aborted) aborted();
  let release;
  try {
    release = await lockfile.lock(dataDir, { lockfilePath: join(dataDir, 'publish.lock'), stale: 30000, update: 10000, retries: 0, onCompromised: (error) => controller.abort(error) });
  } catch (error) {
    signal.removeEventListener('abort', aborted);
    if (error.code === 'ELOCKED') {
      console.log('[publisher] Another publication is running; this invocation was skipped.');
      return { status: 'skipped' };
    }
    throw error;
  }
  const id = `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const work = join(dataDir, 'runs', id);
  const stage = join(work, 'app');
  let logQueue = Promise.resolve();
  const secrets = [env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID].filter(Boolean);
  const logPath = join(dataDir, 'logs', id + '.log');
  let buffered = '';
  let logFailure;
  const redact = (text) => secrets.reduce((value, secret) => value.replaceAll(secret, '[redacted]'), text);
  const emit = (text) => {
    text = redact(text);
    process.stdout.write(text);
    logQueue = logQueue.then(() => appendFile(logPath, text)).catch((error) => {
      logFailure = error;
      controller.abort(new Error('Cannot write publisher log: ' + error.message));
    });
  };
  const log = (text) => {
    buffered += text;
    const end = buffered.lastIndexOf('\n');
    if (end >= 0) { emit(buffered.slice(0, end + 1)); buffered = buffered.slice(end + 1); }
  };
  const check = () => controller.signal.throwIfAborted();
  const persist = async (status, details = {}) => {
    const result = { id, mode, status, startedAt, finishedAt: new Date().toISOString(), ...details };
    await jsonFile(join(dataDir, 'status.json'), result);
    if (status === 'published') await jsonFile(join(dataDir, 'last-success.json'), result);
    return result;
  };
  try {
    await mkdir(join(dataDir, 'logs'), { recursive: true });
    await mkdir(join(dataDir, 'runs'), { recursive: true });
    // Only these explicitly owned run directories are reclaimed after an interrupted container.
    for (const name of await readdir(join(dataDir, 'runs'))) if (name.startsWith('run-')) await removeWithin(join(dataDir, 'runs'), join(dataDir, 'runs', name));
    const logs = (await readdir(join(dataDir, 'logs'))).filter((name) => /^run-.*\.log$/.test(name)).sort();
    for (const name of logs.slice(0, -28)) await rm(join(dataDir, 'logs', name));
    log(`[publisher] ${id}: ${mode}\n`);
    const deployment = await loadDeploymentConfig(root);
    log(`[publisher] Deployment: ${deployment.name}; configuration: ${join(root, 'wrangler.json')}.\n`);
    if (mode === 'deploy' && (!env.CLOUDFLARE_API_TOKEN?.trim() || !env.CLOUDFLARE_ACCOUNT_ID?.trim() || [env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID].some((value) => value.startsWith('REPLACE_WITH_')))) throw new Error('Deployment requires real CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID values');
    await checkDependencies(root, runtimeRoot);
    log(`[publisher] Theme: ${root}; toolchain: ${runtimeRoot}.\n`);
    const { contentConfig } = await import(pathToFileURL(join(root, 'src/config/content.config.ts')).href + `?run=${id}`);
    const notes = await resolveNotesDir(root, contentConfig.notesDir);
    if (inside(notes, dataDir) || inside(notes, join(root, 'src/config/content.config.ts'))) throw new Error('notesDir must not contain publisher data or theme configuration');
    check();
    await mkdir(stage, { recursive: true });
    await copyTheme(root, stage, notes);
    // Also check the captured files, in case dependencies changed during copying.
    await checkDependencies(stage, runtimeRoot);
    const { directory: snapshot, digest } = await snapshotNotes({ source: notes, stage, signal: controller.signal,
      onRetry: () => log('[publisher] Notes changed during copying; retrying the snapshot.\n'),
    });
    // This temporary configuration belongs only to the isolated build copy. The author's config never changes.
    const stagedNotesDir = './' + relative(stage, snapshot).replaceAll('\\', '/');
    await writeFile(join(stage, 'src/config/content.config.ts'), `export const contentConfig = { notesDir: ${JSON.stringify(stagedNotesDir)} };\n`);
    await rename(join(stage, 'astro.config.mjs'), join(stage, 'astro.project.config.mjs'));
    // Keep Astro component IDs inside the staged root instead of resolving shared
    // dependencies back to /app, which breaks virtual CSS metadata on Linux.
    await writeFile(join(stage, 'astro.config.mjs'), `import config from './astro.project.config.mjs';\nexport default { ...config, root: ${JSON.stringify(stage)}, publicDir: './public/', outDir: './dist/', cacheDir: './.astro/cache/', vite: { ...config.vite, resolve: { ...config.vite?.resolve, preserveSymlinks: true } } };\n`);
    await symlink(join(runtimeRoot, 'node_modules'), join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const buildEnv = { ...env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
    delete buildEnv.CLOUDFLARE_API_TOKEN;
    delete buildEnv.CLOUDFLARE_ACCOUNT_ID;
    const options = { cwd: stage, env: buildEnv, signal: controller.signal, output: log };
    const astro = join(runtimeRoot, 'node_modules/astro/bin/astro.mjs');
    check();
    log('[publisher] Checking the isolated build copy.\n');
    await run(astro, ['check', '--root', stage], options);
    check();
    log('[publisher] Building static HTML and attachments.\n');
    await run(astro, ['build', '--root', stage], options);
    check();
    const counts = await inspectSite(join(stage, 'dist'));
    const site = join(dataDir, 'site');
    await removeWithin(dataDir, site);
    await rename(join(stage, 'dist'), site);
    const configPath = join(work, 'wrangler.json');
    await jsonFile(configPath, siteDeploymentConfig(deployment, site));
    if (mode !== 'build-only') {
      await logQueue;
      check();
      log(`[publisher] Wrangler ${mode === 'dry-run' ? 'dry run (no upload)' : 'deployment'}.\n`);
      await run(join(runtimeRoot, 'node_modules/wrangler/bin/wrangler.js'), ['deploy', '--config', configPath, ...(mode === 'dry-run' ? ['--dry-run'] : [])], { ...options, env: { ...env, CI: 'true', WRANGLER_SEND_METRICS: String(deployment.send_metrics ?? false), WRANGLER_LOG_PATH: join(dataDir, 'logs', id + '.wrangler.log') } });
    }
    check();
    const status = mode === 'deploy' ? 'published' : mode === 'dry-run' ? 'dry-run' : 'built';
    const result = await persist(status, { workerName: deployment.name, notesDigest: digest, ...counts, site });
    log(`[publisher] ${status}: ${counts.files} files.\n`);
    return result;
  } catch (error) {
    log(`[publisher] FAILED: ${error.message}\n`);
    await persist('failed', { error: redact(error.message) });
    throw new Error(redact(error.message), { cause: error.code ? { code: error.code } : undefined });
  } finally {
    if (buffered) emit(buffered);
    try {
      await logQueue;
      await removeWithin(join(dataDir, 'runs'), work);
    } finally {
      await release().catch((error) => { if (error.code !== 'ERELEASED') console.error('[publisher] Lock release:', error.message); });
      signal.removeEventListener('abort', aborted);
    }
    if (logFailure) throw new Error('Cannot write publisher log: ' + logFailure.message);
  }
}
