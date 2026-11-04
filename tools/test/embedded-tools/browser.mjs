// Plain Playwright verification, no @playwright/test or production adapter.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const project = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = JSON.parse(await readFile(join(project, '.astro/embedded-tools-phase-a/manifest.json')));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i === -1 ? fallback : process.argv[i + 1]; };
const origin = arg('--url', 'http://127.0.0.1:8805').replace(/\/$/, '');
const base = arg('--base', '/').replace(/\/$/, '');
const label = arg('--label', 'local');
const adapter = process.argv.includes('--adapter');
const engines = arg('--engines', 'chromium,webkit').split(',');
const mode = adapter ? 'minimal-adapter' : 'no-adapter';
const selectedCases = arg('--cases', '');
const output = join(manifest.run, 'output/playwright');
await mkdir(output, { recursive: true });
const report = { label, base, origin, mode, selectedCases, playwright: require((process.env.PLAYWRIGHT_MODULE_PATH || 'playwright') + '/package.json').version, created: new Date().toISOString(), engines: [] };
const url = (page) => `${origin}${base}/preflight/${page ? page + '/' : ''}`;
const save = (score = 0) => ({ format: 'aero-2048', version: 1, board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score, history: [], wonAcknowledged: false });

for (const engine of engines) {
  const record = { engine, results: [], errors: [], requests: [], snapshots: [] };
  report.engines.push(record);
  let browser;
  const check = async (name, task) => {
    if (selectedCases && !new RegExp(selectedCases).test(name)) return;
    try { const detail = await task(); record.results.push({ name, status: 'pass', detail }); console.log(`PASS ${label}/${mode}/${engine}: ${name}`); }
    catch (error) { record.results.push({ name, status: 'fail', error: error.message }); console.log(`FAIL ${label}/${mode}/${engine}: ${name}: ${error.message.slice(0, 240)}`); }
  };
  try {
    const options = { headless: true };
    if (engine === 'chromium') options.channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
    if (engine === 'webkit' && process.env.WEBKIT_EXECUTABLE_PATH) options.executablePath = process.env.WEBKIT_EXECUTABLE_PATH;
    browser = await pw[engine].launch(options);
    record.version = browser.version();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    context.on('request', (request) => { if (!/^(data:|blob:)/.test(request.url())) record.requests.push(request.url()); });
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      // WebKit emits a diagnostic as well as the caught exception for our
      // deliberate forbidden top-navigation probe. Keep it as evidence.
      if (/frame attempting navigation of the top-level window is sandboxed/.test(error.message)) (record.securityDiagnostics ??= []).push(error.message);
      else record.errors.push(error.message);
    });
    if (adapter) await page.addInitScript(() => {
      document.addEventListener('astro:after-swap', () => {
        for (const frame of document.querySelectorAll('iframe.aero-embedded-tool')) {
          const fresh = document.createElement('iframe');
          for (const { name, value } of frame.attributes) if (name !== 'src') fresh.setAttribute(name, value);
          fresh.src = frame.getAttribute('src');
          frame.replaceWith(fresh);
        }
      });
    });
    const snapshot = async (name) => {
      const text = await page.locator('body').ariaSnapshot({ timeout: 4000 });
      await writeFile(join(output, `${label}-${mode}-${engine}-${name}.yml`), text);
      record.snapshots.push(name);
    };
    const game = async (target = page) => {
      const locator = target.locator('#tool');
      await locator.scrollIntoViewIfNeeded();
      const frame = await (await locator.elementHandle()).contentFrame();
      assert(frame, 'iframe has no browsing context');
      try { await frame.waitForSelector('#board', { timeout: 6000 }); }
      catch { throw new Error(`2048 did not initialise; frame=${frame.url()}; frames=${JSON.stringify(target.frames().map((f) => f.url()))}`); }
      return frame;
    };
    const openSave = async (frame) => { if (!(await frame.locator('details').getAttribute('open') !== null)) await frame.locator('summary').click(); };
    const exportSave = async (frame) => {
      await openSave(frame);
      const [download] = await Promise.all([frame.page().waitForEvent('download', { timeout: 5000 }), frame.locator('#export-btn').click()]);
      const filename = download.suggestedFilename();
      assert.match(filename, /^2048_\d+\.json$/);
      const json = JSON.parse(await readFile(await download.path(), 'utf8'));
      await download.delete();
      return { filename, json };
    };
    const importSave = async (frame, value, actualChooser = false) => {
      await openSave(frame);
      const payload = { name: 'phase-a.json', mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) };
      if (actualChooser) {
        const [chooser] = await Promise.all([frame.page().waitForEvent('filechooser'), frame.locator('#import-btn').click()]);
        await chooser.setFiles(payload);
      } else await frame.locator('#import-input').setInputFiles(payload);
      await frame.waitForFunction(() => /存档已导入|导入失败|文件过大/.test(document.getElementById('status').textContent));
    };
    await check('direct iframe: user file chooser, two downloads and JSON round trip', async () => {
      await page.goto(url('top')); await snapshot('direct');
      const frame = await game();
      assert.match(await frame.locator('#storage-status').textContent(), /无法自动保存/);
      await importSave(frame, save(12), true);
      const first = await exportSave(frame); const second = await exportSave(frame);
      assert.deepEqual(first.json, save(12)); assert.deepEqual(second.json, first.json);
      await frame.locator('#restart-btn').click(); await importSave(frame, first.json);
      assert.deepEqual((await exportSave(frame)).json, first.json);
      await importSave(frame, '{"bad":true}');
      assert.match(await frame.locator('#status').textContent(), /导入失败/);
      assert.deepEqual((await exportSave(frame)).json, first.json);
      return { downloads: [first.filename, second.filename], frameUrl: frame.url() };
    });
    await check('dual permission still denies parent DOM, cookie, storage and top navigation', async () => {
      await page.goto(url('top')); const frame = await game();
      const denied = await frame.evaluate(() => {
        const blocks = (fn) => { try { fn(); return false; } catch { return true; } };
        return { parentDOM: blocks(() => parent.document.body), cookie: blocks(() => document.cookie), storage: blocks(() => localStorage.getItem('phase-a')), topNavigation: blocks(() => { top.location.href = '/__phase-a-navigation-attempt'; }) };
      });
      assert(Object.values(denied).every(Boolean), JSON.stringify(denied));
      assert.equal(page.url(), url('top'));
      assert.equal(await page.locator('#tool').getAttribute('sandbox'), 'allow-scripts allow-downloads');
      return denied;
    });
    await check('scripts-only control runs but blocks JSON download', async () => {
      await page.goto(url('blocked')); const frame = await game(); await openSave(frame);
      let downloaded = false; const listener = () => { downloaded = true; };
      page.on('download', listener); await frame.locator('#export-btn').click();
      await page.waitForTimeout(1300); page.off('download', listener);
      assert.equal(downloaded, false); return { downloadBlocked: true };
    });
    const armNavigation = async () => {
      await page.goto(url(''));
      await snapshot('home');
      await page.evaluate(() => { window.__phaseASentinel = 'same-document'; window.__phaseASwaps = 0; document.addEventListener('astro:after-swap', () => window.__phaseASwaps++); });
    };
    const clientClick = async (id, expected) => {
      const previous = await page.evaluate(() => window.__phaseASwaps);
      await page.locator(id).click(); await page.waitForURL(url(expected));
      assert.equal(await page.evaluate(() => window.__phaseASentinel), 'same-document', 'Navigation unexpectedly reloaded the document');
      await page.waitForFunction((previous) => window.__phaseASwaps > previous, previous);
      await page.locator(expected ? '#tool' : '#fixture-home').waitFor();
    };
    await check('ClientRouter home → top tool without full reload; audio identity retained', async () => {
      await armNavigation();
      const audio = await page.locator('audio').elementHandle();
      await page.locator('[data-play]:not([disabled])').waitFor();
      await page.locator('[data-play]').click();
      await page.waitForFunction(() => document.querySelector('audio').currentTime > 0);
      const before = await page.locator('audio').evaluate((a) => a.currentTime);
      await clientClick('#go-top', 'top'); const frame = await game();
      assert(await audio.evaluate((a) => a === document.querySelector('audio') && a.isConnected && !a.paused));
      assert((await page.locator('audio').evaluate((a) => a.currentTime)) >= before);
      return { frameUrl: frame.url(), audioIdentity: true, playing: true };
    });
    await check('ClientRouter below-fold lazy iframe initialises after scroll', async () => {
      await armNavigation(); await clientClick('#go-lazy', 'lazy');
      const initialFrames = page.frames().map((f) => f.url()); const frame = await game();
      return { initialFrames, loadedUrl: frame.url() };
    });
    await check('leave/re-enter and history back/forward initialise a fresh game', async () => {
      await armNavigation(); await clientClick('#go-top', 'top'); let frame = await game();
      await importSave(frame, save(52));
      const oldFrame = frame;
      await clientClick('#go-home', ''); assert(oldFrame.isDetached(), 'Leaving must detach the old frame');
      let previous = await page.evaluate(() => window.__phaseASwaps);
      await page.goBack(); await page.waitForURL(url('top'));
      await page.waitForFunction((previous) => window.__phaseASwaps > previous, previous); frame = await game();
      assert.equal(await frame.locator('#score').textContent(), '0');
      previous = await page.evaluate(() => window.__phaseASwaps);
      await page.goForward(); await page.waitForURL(url(''));
      await page.waitForFunction((previous) => window.__phaseASwaps > previous, previous);
      await page.locator('#fixture-home').waitFor(); assert(frame.isDetached());
      await clientClick('#go-top', 'top'); frame = await game();
      assert.equal(await frame.locator('#score').textContent(), '0');
      return { oldFrameDetached: true, restoredScore: 0 };
    });
    await check('shared encoded path works through navigation', async () => {
      await armNavigation(); await clientClick('#go-shared', 'shared'); const frame = await game();
      await importSave(frame, save(24)); assert.deepEqual((await exportSave(frame)).json, save(24));
      return { frameUrl: frame.url() };
    });
    await check('keyboard can enter and leave iframe in both directions', async () => {
      await page.goto(url('top')); const frame = await game();
      await page.locator('#before-tool').focus();
      let entered = false, exited = false;
      for (let n = 0; n < 35; n++) {
        await page.keyboard.press('Tab');
        const active = await page.evaluate(() => document.activeElement.id);
        entered ||= active === 'tool'; if (active === 'after-tool') { exited = true; break; }
      }
      assert(entered && exited, 'Tab must enter tool and reach following control');
      let returned = false;
      for (let n = 0; n < 35; n++) { await page.keyboard.press('Shift+Tab'); if (await page.evaluate(() => document.activeElement.id) === 'before-tool') { returned = true; break; } }
      assert(returned, 'Shift+Tab must leave tool backwards');
      return { entered, exited, returned, frameUrl: frame.url() };
    });
    await check('390px and 280px layout with 480px iframe; inner scroll reaches export', async () => {
      const layouts = [];
      for (const width of [390, 280]) {
        await page.setViewportSize({ width, height: 844 }); await page.goto(url('top')); const frame = await game();
        await openSave(frame); await frame.locator('#export-btn').scrollIntoViewIfNeeded();
        const dimensions = await frame.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth, height: innerHeight, scroll: scrollY }));
        assert(dimensions.content <= dimensions.width + 1, JSON.stringify(dimensions));
        await exportSave(frame); layouts.push({ viewport: width, ...dimensions });
      }
      await page.screenshot({ path: join(output, `${label}-${mode}-${engine}-mobile.png`), fullPage: false });
      return layouts;
    });
    await check('touch emulation can operate direction buttons and reach file export', async () => {
      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
      mobileContext.on('request', (request) => { if (!/^(data:|blob:)/.test(request.url())) record.requests.push(request.url()); });
      const mobile = await mobileContext.newPage();
      try {
        if (arg('--height', '')) await mobile.addInitScript((height) => document.addEventListener('DOMContentLoaded', () => { const tool = document.getElementById('tool'); if (tool) tool.style.height = `${height}px`; }), Number(arg('--height', '')));
        const standalone = process.argv.includes('--standalone');
        await mobile.goto(standalone ? `${origin}${base}/posts/preflight-day/2048.html` : url('top'));
        const frame = standalone ? mobile : await game(mobile);
        await frame.locator('#board').waitFor();
        await importSave(frame, save());
        await frame.evaluate(() => {
          window.__phaseATouchEvents = [];
          for (const name of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) document.addEventListener(name, (event) => window.__phaseATouchEvents.push({ type: name, target: event.target.id || event.target.dataset.direction || event.target.tagName }), true);
        });
        if (process.argv.includes('--settle-touch')) {
          await frame.locator('[data-direction="left"]').scrollIntoViewIfNeeded();
          await mobile.waitForTimeout(350);
        }
        await frame.locator('[data-direction="left"]').tap();
        try { await frame.waitForFunction(() => document.getElementById('score').textContent === '4', null, { timeout: 3000 }); }
        catch (error) { record.touchDiagnostics = await frame.evaluate(() => ({ events: window.__phaseATouchEvents, scroll: scrollY, score: document.getElementById('score').textContent, tiles: [...document.querySelectorAll('.tile')].map((e) => e.dataset.value) })); throw error; }
        assert.equal(await frame.locator('#score').textContent(), '4');
        await openSave(frame); await frame.locator('#export-btn').scrollIntoViewIfNeeded();
        const [download] = await Promise.all([mobile.waitForEvent('download'), frame.locator('#export-btn').tap()]);
        const exported = JSON.parse(await readFile(await download.path(), 'utf8')); await download.delete();
        assert.equal(exported.score, 4);
        return { emulation: true, physicalPhone: false, score: exported.score, height: arg('--height', '480'), settledBeforeTouch: process.argv.includes('--settle-touch') };
      } finally { await mobileContext.close(); }
    });
    await check('direct HTML URL has normal origin storage; iframe sandbox is not inherited', async () => {
      await page.goto(`${origin}${base}/posts/preflight-day/2048.html`);
      await page.locator('#board').waitFor();
      const accessible = await page.evaluate(() => { localStorage.setItem('phase-a-direct-probe', 'yes'); const value = localStorage.getItem('phase-a-direct-probe'); localStorage.removeItem('phase-a-direct-probe'); return value; });
      assert.equal(accessible, 'yes'); return { directStorageAccessible: true, finalUrl: page.url() };
    });
    await check('no uncaught page errors or external HTTP requests', async () => {
      assert.deepEqual(record.errors, []);
      const external = record.requests.filter((request) => new URL(request).origin !== new URL(origin).origin);
      assert.deepEqual(external, []); return { requests: record.requests.length };
    });
    await context.close();
  } catch (error) { record.unavailable = error.message; console.log(`UNAVAILABLE ${engine}: ${error.message.slice(0, 250)}`); }
  finally { if (browser) await browser.close(); }
}
const path = join(manifest.run, `${label}-${base ? 'blog' : 'root'}-${mode}-browser.json`);
await writeFile(path, JSON.stringify(report, null, 2));
console.log(`Browser report: ${path}`);
if (report.engines.some((e) => e.unavailable || e.results.some((r) => r.status === 'fail'))) process.exitCode = 1;
