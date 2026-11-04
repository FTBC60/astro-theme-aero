// Real compiled Markdown pages; plain Playwright, no injected lifecycle adapter.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
assert(arg('--manifest') && arg('--url'), 'Supply --manifest and --url');
const manifest = JSON.parse(await readFile(arg('--manifest')));
const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE_PATH || 'playwright';
const pw = require(modulePath);
const engine = arg('--engine', 'chromium');
const selected = arg('--cases', '');
const origin = arg('--url').replace(/\/$/, '');
const output = join(manifest.output, 'output/playwright');
await mkdir(output, { recursive: true });
const report = { engine, node: process.version, playwright: require(modulePath + '/package.json').version, physicalPhone: false, lifecycleAdapter: false, checks: [], diagnostics: [] };
const browser = await pw[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' } : {}) });
report.browser = browser.version();
const save = (score = 0) => ({ format: 'aero-2048', version: 1, board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score, history: [], wonAcknowledged: false });
const frameOf = async (page, index = 0) => {
  const iframe = page.locator('iframe.aero-embedded-tool').nth(index);
  await iframe.scrollIntoViewIfNeeded();
  const frame = await (await iframe.elementHandle()).contentFrame();
  assert(frame, 'Tool browsing context missing'); await frame.locator('#board').waitFor({ timeout: 8000 });
  return frame;
};
const openSave = async (frame) => { if (await frame.locator('#save-panel').getAttribute('open') === null) await frame.locator('summary').click(); };
const importSave = async (frame, value, chooser = false) => {
  await openSave(frame);
  const payload = { name: 'acceptance.json', mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) };
  if (chooser) { const [dialog] = await Promise.all([frame.page().waitForEvent('filechooser'), frame.locator('#import-btn').click()]); await dialog.setFiles(payload); }
  else await frame.locator('#import-input').setInputFiles(payload);
  await frame.waitForFunction(() => /存档已导入|导入失败|文件过大/.test(document.getElementById('status').textContent));
};
const exportSave = async (frame) => {
  await openSave(frame);
  const [download] = await Promise.all([frame.page().waitForEvent('download', { timeout: 5000 }), frame.locator('#export-btn').click()]);
  const name = download.suggestedFilename(); assert.match(name, /^2048_\d+\.json$/);
  const value = JSON.parse(await readFile(await download.path(), 'utf8')); await download.delete(); return { name, value };
};
const detached = async (frame) => {
  const deadline = Date.now() + 3000;
  while (!frame.isDetached() && Date.now() < deadline) await new Promise((done) => setTimeout(done, 50));
  assert(frame.isDetached(), 'Old tool must detach after the page transition');
};
const check = async (base, name, task, options = {}) => {
  if (selected && !new RegExp(selected).test(name)) return;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...options });
  const page = await context.newPage(); page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(12000);
  const errors = [], external = [];
  context.on('request', (request) => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) external.push(request.url()); });
  page.on('pageerror', (error) => {
    if (/frame attempting navigation of the top-level window is sandboxed/.test(error.message)) report.diagnostics.push({ base, name, security: error.message });
    else errors.push(error.message);
  });
  const url = (id = '') => origin + base + (id ? `posts/${id}/` : '');
  try {
    const detail = await task({ context, page, url });
    assert.deepEqual(external, [], 'Self-contained fixture must not use external requests');
    assert.deepEqual(errors, [], 'Unexpected page error');
    report.checks.push({ base, name, status: 'pass', detail }); console.log(`PASS ${engine} ${base} ${name}`);
  } catch (error) {
    report.checks.push({ base, name, status: 'fail', error: error.message, errors, external });
    console.log(`FAIL ${engine} ${base} ${name}: ${error.message.slice(0, 300)}`);
  } finally { await context.close(); }
};
try {
  for (const base of arg('--bases', '/,/blog/').split(',')) {
    await check(base, 'direct article: current sample, original sandbox, title and real file round trip', async ({ page, url }) => {
      await page.goto(url('day')); const frame = await frameOf(page);
      await writeFile(join(output, `${engine}-${base === '/' ? 'root' : 'blog'}-article.yml`), await page.locator('body').ariaSnapshot());
      const iframe = page.locator('iframe.aero-embedded-tool').first();
      assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts allow-downloads');
      assert.equal(await iframe.getAttribute('title'), '2048 " onload="unsafe'); assert.equal(await iframe.getAttribute('onload'), null);
      assert.equal(await iframe.getAttribute('referrerpolicy'), 'no-referrer'); assert.equal(await iframe.evaluate((el) => getComputedStyle(el).height), '480px');
      assert.match(await frame.locator('#storage-status').textContent(), /无法自动保存/);
      await importSave(frame, save(12), true);
      const first = await exportSave(frame), second = await exportSave(frame);
      assert.deepEqual(first.value, save(12)); assert.deepEqual(second.value, first.value);
      await frame.locator('#restart-btn').click(); await importSave(frame, first.value);
      assert.deepEqual((await exportSave(frame)).value, first.value);
      // An empty FileList models cancellation: no file read and no state change.
      const statusBefore = await frame.locator('#status').textContent();
      await frame.locator('#import-input').setInputFiles([]);
      assert.deepEqual((await exportSave(frame)).value, first.value);
      await importSave(frame, '{"bad":true}'); assert.match(await frame.locator('#status').textContent(), /导入失败/);
      assert.deepEqual((await exportSave(frame)).value, first.value);
      await importSave(frame, 'x'.repeat(65537)); assert.match(await frame.locator('#status').textContent(), /文件过大/);
      assert.deepEqual((await exportSave(frame)).value, first.value);
      return { downloads: [first.name, second.name], cancelledSelection: 'empty FileList, native dialog dismissal not automated', previousStatus: statusBefore, invalidAndOversizePreserveGame: true, finalFramePath: new URL(frame.url()).pathname };
    });
    await check(base, 'real permission probes deny parent DOM, cookie, storage and top navigation', async ({ page, url }) => {
      await page.goto(url('day')); const frame = await frameOf(page);
      await page.evaluate(() => { document.cookie = 'aero_parent_probe=private; SameSite=Lax; path=/'; localStorage.setItem('aero-parent-probe', 'private'); });
      const denied = await frame.evaluate(() => {
        const blocks = (fn) => { try { fn(); return false; } catch (error) { return error.name; } };
        return { parentDOM: blocks(() => parent.document.body), parentCookie: blocks(() => parent.document.cookie), cookie: blocks(() => document.cookie), parentStorage: blocks(() => parent.localStorage.getItem('aero-parent-probe')), storage: blocks(() => localStorage.getItem('aero-parent-probe')), topNavigation: blocks(() => { top.location.href = '/__forbidden-tool-navigation'; }) };
      });
      assert(Object.values(denied).every(Boolean), JSON.stringify(denied)); assert.equal(page.url(), url('day'));
      assert.equal(await frame.evaluate(() => document.referrer), '');
      return denied;
    });
    await check(base, 'ClientRouter entry, history and fresh tool coexist with uninterrupted music', async ({ page, url }) => {
      await page.goto(url());
      await page.evaluate(() => { window.__phaseC = true; window.__phaseCSwaps = 0; document.addEventListener('astro:after-swap', () => window.__phaseCSwaps++); });
      await page.locator('[data-play]:not([disabled])').waitFor(); await page.locator('[data-play]').click();
      await page.waitForFunction(() => document.querySelector('audio').currentTime > 0);
      const audio = await page.locator('audio').elementHandle(); const time = await audio.evaluate((el) => el.currentTime);
      await page.locator(`main a.rm-link[href='${base}posts/day/']`).click(); await page.waitForURL(url('day'));
      await page.waitForFunction(() => window.__phaseCSwaps === 1); assert.equal(await page.evaluate(() => window.__phaseC), true);
      let frame = await frameOf(page); await importSave(frame, save(52));
      assert(await audio.evaluate((el) => el === document.querySelector('audio') && el.isConnected && !el.paused && el.currentTime > 0));
      assert((await audio.evaluate((el) => el.currentTime)) >= time);
      const old = frame; await page.goBack(); await page.waitForURL(url()); await page.waitForFunction(() => window.__phaseCSwaps === 2); await detached(old);
      await page.goForward(); await page.waitForURL(url('day')); await page.waitForFunction(() => window.__phaseCSwaps === 3);
      frame = await frameOf(page); assert.equal(await frame.locator('#score').textContent(), '0');
      await page.locator(`a[href='${base}']`).first().click(); await page.waitForURL(url()); await page.waitForFunction(() => window.__phaseCSwaps === 4); await detached(frame);
      await page.locator(`main a.rm-link[href='${base}posts/day/']`).click(); await page.waitForURL(url('day')); await page.waitForFunction(() => window.__phaseCSwaps === 5);
      frame = await frameOf(page); assert.equal(await frame.locator('#score').textContent(), '0');
      assert(await audio.evaluate((el) => el === document.querySelector('audio') && el.isConnected && !el.paused));
      return { sameDocument: true, swaps: 5, oldFrameDetached: true, reinitialisedScore: 0, sameAudioStillPlaying: true };
    });
    await check(base, 'long article: native transition then below-fold lazy tool loads on scroll', async ({ page, url }) => {
      await page.goto(url()); await page.evaluate(() => { window.__phaseC = true; });
      await page.locator(`main a.rm-link[href='${base}posts/lazy/']`).click(); await page.waitForURL(url('lazy'));
      const iframe = page.locator('iframe.aero-embedded-tool'); await iframe.waitFor();
      assert.equal(await page.evaluate(() => window.__phaseC), true);
      const y = await iframe.evaluate((el) => el.getBoundingClientRect().top);
      assert(y > 900, 'Lazy fixture must start below the viewport');
      const before = page.frames().map((frame) => /^https?:/.test(frame.url()) ? new URL(frame.url()).pathname : frame.url());
      const frame = await frameOf(page); await importSave(frame, save(24)); assert.deepEqual((await exportSave(frame)).value, save(24));
      return { initialIframeTop: y, initialFrames: before, loadedPath: new URL(frame.url()).pathname };
    });
    await check(base, 'keyboard Tab and Shift+Tab cross iframe; Enter and Space operate controls', async ({ page, url }) => {
      await page.goto(url('day')); const frame = await frameOf(page); await importSave(frame, save());
      await page.locator('#before-tool').focus(); let entered = false, exited = false;
      for (let n = 0; n < 35; n++) { await page.keyboard.press('Tab'); const active = await page.evaluate(() => document.activeElement.id || document.activeElement.tagName); entered ||= active === 'IFRAME'; if (active === 'after-tool') { exited = true; break; } }
      assert(entered && exited);
      let backwards = false;
      for (let n = 0; n < 35; n++) { await page.keyboard.press('Shift+Tab'); if (await page.evaluate(() => document.activeElement.id) === 'before-tool') { backwards = true; break; } }
      assert(backwards);
      const left = frame.locator('[data-direction="left"]'); await left.focus();
      const focus = await left.evaluate((el) => { const style = getComputedStyle(el); return { width: style.outlineWidth, style: style.outlineStyle }; });
      assert.notEqual(focus.style, 'none'); assert.notEqual(focus.width, '0px');
      await page.keyboard.press('Enter'); assert.equal(await frame.locator('#score').textContent(), '4');
      await importSave(frame, save()); await left.focus(); await page.keyboard.press('Space'); assert.equal(await frame.locator('#score').textContent(), '4');
      return { entered, exited, backwards, visibleFocus: focus, enterAndSpaceScore: 4 };
    });
    await check(base, '390px and 280px article and tool have no horizontal overflow; inner scroll reaches files', async ({ page, url }) => {
      const layouts = [];
      for (const width of [390, 280]) {
        await page.setViewportSize({ width, height: 844 }); await page.goto(url('day')); const frame = await frameOf(page);
        // Finish the existing responsive sidebar animation before measuring layout.
        await page.waitForTimeout(400);
        await openSave(frame); await frame.locator('#export-btn').scrollIntoViewIfNeeded();
        const outer = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
        const inner = await frame.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, scroll: scrollY, height: innerHeight }));
        assert(outer.content <= outer.viewport + 1, JSON.stringify(outer)); assert(inner.content <= inner.viewport + 1, JSON.stringify(inner)); assert(inner.scroll > 0);
        await exportSave(frame); layouts.push({ width, outer, inner });
      }
      await page.screenshot({ path: join(output, `${engine}-${base === '/' ? 'root' : 'blog'}-narrow.png`), animations: 'disabled' });
      return layouts;
    });
    await check(base, 'calculator input labels, keyboard calculation, focus and JSON export', async ({ page, url }) => {
      const results = [];
      for (const lang of ['zh', 'en']) {
        await page.goto(url(`calculator-${lang}`)); const element = page.locator('iframe.aero-embedded-tool'); await element.scrollIntoViewIfNeeded();
        const frame = await (await element.elementHandle()).contentFrame();
        const labels = await frame.locator('input').evaluateAll((inputs) => inputs.map((el) => ({ id: el.id, labels: [...el.labels].map((label) => label.textContent.trim()) })));
        assert(labels.every((item) => item.labels.some(Boolean)));
        await frame.locator('#first').fill('7'); await frame.locator('#second').fill('9'); await frame.locator('#calculate').focus(); await page.keyboard.press('Enter');
        assert.equal(await frame.locator('#result').textContent(), '7 + 9 = 16');
        const focus = await frame.locator('#calculate').evaluate((el) => getComputedStyle(el).outlineWidth); assert.notEqual(focus, '0px');
        const [download] = await Promise.all([page.waitForEvent('download'), frame.locator('#export').click()]);
        const value = JSON.parse(await readFile(await download.path(), 'utf8')); await download.delete(); assert.deepEqual(value, { first: 7, second: 9, sum: 16 });
        results.push({ lang, labels, value });
      }
      return results;
    });
    await check(base, 'mouse wheel scrolls inside the tool and outside in the article', async ({ page, url }) => {
      await page.goto(url('day')); const frame = await frameOf(page); await openSave(frame); await frame.locator('#export-btn').scrollIntoViewIfNeeded();
      const box = await page.locator('iframe.aero-embedded-tool').first().boundingBox();
      const before = await frame.evaluate(() => scrollY);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * .55); await page.mouse.wheel(0, -160);
      await frame.waitForFunction((value) => scrollY < value, before, { timeout: 2500 });
      const innerAfter = await frame.evaluate(() => scrollY);
      const outerBefore = await page.evaluate(() => scrollY);
      await page.mouse.move(8, 800); await page.mouse.wheel(0, 180);
      await page.waitForFunction((value) => scrollY > value, outerBefore, { timeout: 2500 });
      return { innerBefore: before, innerAfter, outerBefore, outerAfter: await page.evaluate(() => scrollY) };
    });
    await check(base, 'touch: actual direction tap', async ({ page, url }) => {
      await page.goto(url('day')); const frame = await frameOf(page); await importSave(frame, save());
      const left = frame.locator('[data-direction="left"]'); await left.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await frame.evaluate(() => {
        window.__touchProbe = [];
        for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) document.addEventListener(type, (event) => window.__touchProbe.push({ type, target: event.target.id || event.target.dataset.direction || event.target.tagName, x: event.clientX ?? event.changedTouches?.[0]?.clientX, y: event.clientY ?? event.changedTouches?.[0]?.clientY, scroll: scrollY }), true);
      });
      await left.tap();
      // Touch compatibility click may arrive after tap() has dispatched touchend.
      await frame.waitForFunction(() => document.getElementById('score').textContent === '4', null, { timeout: 1500 }).catch(() => {});
      const diagnostic = await frame.evaluate(() => ({ score: document.getElementById('score').textContent, events: window.__touchProbe, scroll: scrollY }));
      report.diagnostics.push({ base, name: 'touch', ...diagnostic });
      assert.equal(diagnostic.score, '4', JSON.stringify(diagnostic));
      return { score: 4, physicalPhone: false };
    }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    if (engine === 'chromium') await check(base, 'touch gestures: board swipe, internal scroll, boundary handoff and outer scroll', async ({ context, page, url }) => {
      await page.goto(url('day')); const frame = await frameOf(page); await importSave(frame, save());
      const session = await context.newCDPSession(page);
      const drag = async (x, y, dx, dy) => {
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let n = 1; n <= 8; n++) { await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * n / 8, y: y + dy * n / 8 }] }); await page.waitForTimeout(25); }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(350);
      };
      try {
        const stages = [];
        await frame.locator('#board').scrollIntoViewIfNeeded();
        let box = await frame.locator('#board').boundingBox(); await drag(box.x + box.width * .7, box.y + box.height * .5, -90, 0);
        const swipeScore = await frame.locator('#score').textContent();
        stages.push({ name: 'board swipe', status: swipeScore === '4' ? 'pass' : 'fail', score: swipeScore });
        await openSave(frame); await frame.locator('#export-btn').scrollIntoViewIfNeeded();
        box = await page.locator('iframe.aero-embedded-tool').first().boundingBox();
        const before = await frame.evaluate(() => scrollY);
        const hit = await frame.evaluate(() => ({ tag: document.elementFromPoint(innerWidth / 2, innerHeight * .55)?.outerHTML.slice(0, 220), scroll: scrollY, height: document.documentElement.scrollHeight, viewport: innerHeight }));
        await frame.evaluate(() => {
          window.__phaseCGesture = [];
          for (const type of ['pointerdown', 'pointercancel', 'touchstart', 'touchmove', 'touchend']) document.addEventListener(type, (event) => window.__phaseCGesture.push({ type, target: event.target.id || event.target.tagName, y: event.changedTouches?.[0]?.clientY ?? event.clientY, prevented: event.defaultPrevented }), { capture: true, passive: true });
        });
        await drag(box.x + box.width / 2, box.y + box.height * .55, 0, 90);
        const after = await frame.evaluate(() => scrollY);
        stages.push({ name: 'internal finger scroll', status: after < before ? 'pass' : 'fail', before, after });
        await frame.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150);
        const outerBefore = await page.evaluate(() => scrollY);
        await drag(box.x + box.width / 2, box.y + box.height * .65, 0, -100);
        const handoff = await page.evaluate(() => scrollY);
        stages.push({ name: 'boundary handoff', status: handoff > outerBefore ? 'pass' : 'fail', before: outerBefore, after: handoff });
        await drag(4, 650, 0, -120);
        const outerAfter = await page.evaluate(() => scrollY);
        stages.push({ name: 'outside finger scroll', status: outerAfter > handoff ? 'pass' : 'fail', before: handoff, after: outerAfter });
        report.diagnostics.push({ base, name: 'touch gestures', box, before, after, hit, events: await frame.evaluate(() => window.__phaseCGesture), stages });
        assert(stages.every((stage) => stage.status === 'pass'), JSON.stringify(stages));
        return { swipeScore: 4, innerBefore: before, innerAfter: after, outerBefore, handoff, outerAfter, trustedBrowserTouchInput: true, physicalPhone: false };
      } finally { await session.detach(); }
    }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await check(base, 'direct HTML has normal origin storage and does not inherit iframe isolation', async ({ page, url }) => {
      await page.goto(url('day') + '2048.html'); await page.locator('#board').waitFor();
      const result = await page.evaluate(() => { localStorage.setItem('phase-c-direct', 'yes'); const value = localStorage.getItem('phase-c-direct'); localStorage.removeItem('phase-c-direct'); return value; });
      assert.equal(result, 'yes'); return { storageAccessible: true, inheritedSandbox: false, finalPath: new URL(page.url()).pathname };
    });
  }
} finally {
  await browser.close();
  await writeFile(join(manifest.output, `browser-${engine}${arg('--label', '') ? '-' + arg('--label') : ''}.json`), JSON.stringify(report, null, 2));
}
assert(report.checks.length > 0, 'No browser cases matched');
if (report.checks.some((item) => item.status === 'fail')) process.exitCode = 1;
