// Actual Markdown → attachment → build/dev → browser smoke test, no cloud writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { cp, copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeWithin } from '../../lib/paths.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const sampleArg = process.argv.indexOf('--sample');
assert(sampleArg !== -1, 'Supply --sample /path/to/current/2048.html');
const sourceBytes = await readFile(resolve(process.argv[sampleArg + 1]));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const artifactRoot = join(project, '.astro/embedded-tools-phase-b');
await mkdir(artifactRoot, { recursive: true });
const output = await mkdtemp(join(artifactRoot, 'run-'));
const fixture = await mkdtemp(join(project, 'aero-tools-integration-'));
const put = async (path, bytes) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); };
const report = { sampleSha256: sha256(sourceBytes), sampleBytes: sourceBytes.length, node: process.version, results: [], cloudWrites: false };
const cli = join(project, 'node_modules/astro/bin/astro.mjs');
let server, browser, serverLog = '';
const waitFor = async (check) => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch {}
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`Expected dev state was not reached: ${serverLog.slice(-2200)}`);
};
try {
  await cp(join(project, 'src'), join(fixture, 'src'), { recursive: true });
  for (const file of ['package.json', 'tsconfig.json', 'astro.config.mjs']) await copyFile(join(project, file), join(fixture, file));
  await symlink(join(project, 'node_modules'), join(fixture, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const name of ['site', 'theme', 'music']) {
    const path = join(fixture, `src/config/${name}.config.ts`);
    await writeFile(path, (await readFile(path, 'utf8')).replace(/'\/image\/[^']+'/g, "'/fixture.svg'"));
  }
  await put(join(fixture, 'public/fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="skyblue"/></svg>');
  await put(join(fixture, 'public/audio/playlist.json'), '[]');
  await put(join(fixture, 'src/config/content.config.ts'), "export const contentConfig = { notesDir: './notes' };\n");
  const markdown = '---\ntitle: 2048 integration sample\ndate: "2026-11-03"\nslug: "2048"\npublish: true\n---\n\n![tool: 2048 " onload="unsafe](./2048.html)\n\n[HTML link](./2048.html)';
  const note = join(fixture, 'notes/day/day.md');
  const tool = join(fixture, 'notes/day/2048.html');
  await put(note, markdown); await put(tool, sourceBytes);
  await put(join(fixture, 'notes/private.md'), '---\npublish: false\n---\n![tool: invalid](https://example.com/tool.html)');
  await put(join(fixture, 'notes/day/unused.html'), '<!doctype html><p>NOT_PUBLISHED</p>');
  for (const [lang, directory] of [['zh', 'zh-CN'], ['en', 'en']]) {
    await put(join(fixture, `notes/calculator-${lang}/index.md`), `---\ntitle: Calculator ${lang}\ndate: "2026-11-03"\nslug: calculator-${lang}\npublish: true\n---\n\n![tool: Calculator ${lang}](./calculator.html)`);
    await put(join(fixture, `notes/calculator-${lang}/calculator.html`), await readFile(join(project, `examples/posts/${directory}/tools/calculator.html`)));
  }
  const configPath = join(fixture, 'astro.config.mjs');
  const original = await readFile(configPath, 'utf8');
  for (const [label, base] of [['root', '/'], ['blog', '/blog/']]) {
    const dist = join(output, 'dist-' + label);
    await writeFile(configPath, original.replace("output: 'static',", `output: 'static', base: ${JSON.stringify(base)}, outDir: ${JSON.stringify(dist)},`));
    const log = [];
    const exit = await new Promise((done, reject) => {
      const child = spawn(process.execPath, [cli, 'build', '--root', fixture], { cwd: fixture, windowsHide: true, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
      child.stdout.on('data', (chunk) => log.push(chunk)); child.stderr.on('data', (chunk) => log.push(chunk)); child.on('error', reject); child.on('close', done);
    });
    await writeFile(join(output, `build-${label}.log`), Buffer.concat(log));
    assert.equal(exit, 0, Buffer.concat(log).toString().slice(-2000));
    const html = await readFile(join(dist, 'posts/2048/index.html'), 'utf8');
    assert(html.includes(`src="${base}posts/2048/2048.html"`));
    assert.match(html, /sandbox="allow-scripts allow-downloads"/);
    assert.equal(sha256(await readFile(join(dist, 'posts/2048/2048.html'))), report.sampleSha256);
    await assert.rejects(readFile(join(dist, 'posts/2048/unused.html')), /ENOENT/);
    report.results.push(`${label} real Markdown build, fixed iframe and exact HTML bytes`);
    console.log(`PASS ${report.results.at(-1)}`);
  }
  const socket = createServer(); await new Promise((done) => socket.listen(0, '127.0.0.1', done));
  const port = socket.address().port; await new Promise((done) => socket.close(done));
  server = spawn(process.execPath, [cli, 'dev', '--root', fixture, '--host', '127.0.0.1', '--port', String(port)], { cwd: fixture, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  server.stdout.on('data', (chunk) => { serverLog += chunk; }); server.stderr.on('data', (chunk) => { serverLog += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  const post = origin + '/blog/posts/2048/';
  const get = (url) => fetch(url, { signal: AbortSignal.timeout(2500) });
  await waitFor(async () => (await get(post)).status === 200);
  const response = await get(post + '2048.html');
  assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8$/);
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), report.sampleSha256);
  assert.equal((await get(post + 'unused.html')).status, 404);
  report.results.push('dev serves only referenced HTML with correct MIME and original bytes');
  console.log(`PASS ${report.results.at(-1)}`);

  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/blog/');
  await mkdir(join(output, 'output/playwright'), { recursive: true });
  await writeFile(join(output, 'output/playwright/home.yml'), await page.locator('body').ariaSnapshot());
  await page.evaluate(() => { window.__phaseB = true; window.__phaseBSwaps = 0; document.addEventListener('astro:after-swap', () => window.__phaseBSwaps++); });
  await page.locator(`main a[href='/blog/posts/2048/']`).first().click();
  await page.waitForFunction(() => window.__phaseBSwaps === 1);
  assert.equal(await page.evaluate(() => window.__phaseB), true);
  const iframe = page.locator('iframe.aero-embedded-tool');
  await iframe.scrollIntoViewIfNeeded();
  assert.equal(await iframe.count(), 1);
  assert.equal(await iframe.getAttribute('title'), '2048 " onload="unsafe');
  assert.equal(await iframe.getAttribute('onload'), null);
  assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts allow-downloads');
  assert.equal(await iframe.evaluate((el) => getComputedStyle(el).height), '480px');
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.locator('#board').waitFor();
  assert.match(await frame.locator('#storage-status').textContent(), /无法自动保存/);
  await frame.locator('summary').click();
  const value = { format: 'aero-2048', version: 1, board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 12, history: [], wonAcknowledged: false };
  await frame.locator('#import-input').setInputFiles({ name: 'phase-b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await frame.waitForFunction(() => document.getElementById('status').textContent.includes('存档已导入'));
  const [download] = await Promise.all([page.waitForEvent('download'), frame.locator('#export-btn').click()]);
  assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), value); await download.delete();
  report.results.push('compiled iframe: client navigation, escaped title, 480px style and JSON round trip');
  console.log(`PASS ${report.results.at(-1)}`);
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.locator('#mobile-menu-btn').getAttribute('aria-expanded') === 'true') await page.locator('#mobile-menu-btn').click();
  await page.screenshot({ path: join(output, 'output/playwright/2048-compiled-mobile-width.png'), fullPage: false, animations: 'disabled' });
  await page.goBack(); await page.waitForURL(origin + '/blog/');
  await page.waitForFunction(() => window.__phaseBSwaps === 2);
  assert(frame.isDetached());
  await page.goForward(); await page.waitForURL(post);
  await page.waitForFunction(() => window.__phaseBSwaps === 3);
  const fresh = await (await page.locator('iframe.aero-embedded-tool').elementHandle()).contentFrame();
  await fresh.locator('#score').waitFor(); assert.equal(await fresh.locator('#score').textContent(), '0');
  assert.deepEqual(errors, []);
  report.results.push('compiled article history detaches old tool and reinitialises without runtime errors');
  console.log(`PASS ${report.results.at(-1)}`);
  for (const lang of ['zh', 'en']) {
    await page.goto(`${origin}/blog/posts/calculator-${lang}/`);
    const element = page.locator('iframe.aero-embedded-tool'); await element.scrollIntoViewIfNeeded();
    const calculator = await (await element.elementHandle()).contentFrame();
    await calculator.locator('#calculate').click();
    assert.equal(await calculator.locator('#result').textContent(), '2 + 3 = 5');
    const [download] = await Promise.all([page.waitForEvent('download'), calculator.locator('#export').click()]);
    assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), { first: 2, second: 3, sum: 5 }); await download.delete();
    await calculator.locator('#first').fill(''); await calculator.locator('#calculate').click();
    assert.match(await calculator.locator('#result').textContent(), /有效|valid/);
  }
  report.results.push('both copyable calculator examples calculate, export JSON and reject empty input');
  console.log(`PASS ${report.results.at(-1)}`);
  assert.deepEqual(errors, []);
  await browser.close(); browser = undefined;
  await put(tool, Buffer.concat([sourceBytes, Buffer.from('\n<!-- phase-b-update -->')]));
  await waitFor(async () => (await (await get(post + '2048.html')).text()).endsWith('<!-- phase-b-update -->'));
  await put(note, markdown.replace('publish: true', 'publish: false'));
  await waitFor(async () => (await get(post)).status === 404 && (await get(post + '2048.html')).status === 404);
  report.results.push('HTML-only dev update and article withdrawal remove tool response');
  console.log(`PASS ${report.results.at(-1)}`);
} catch (error) { report.error = error.message; process.exitCode = 1; console.error(error); }
finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) { const stopped = new Promise((done) => server.once('exit', done)); server.kill(); await stopped; }
  await writeFile(join(output, 'dev.log'), serverLog);
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2));
  await removeWithin(project, fixture);
  console.log(`Phase B result: ${join(output, 'result.json')}`);
}
