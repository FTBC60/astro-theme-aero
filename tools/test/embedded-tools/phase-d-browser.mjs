// Live Worker checks through a standard Chrome installation; no deployment.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const sessionPath = resolve(arg('--session', '.astro/embedded-tools-phase-d/session.json'));
const session = JSON.parse(await readFile(sessionPath, 'utf8'));
const origin = new URL(arg('--url')).origin;
assert(session.workerUrls.includes(origin), 'Use the recorded live Worker');
const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE_PATH || 'playwright';
const pw = require(modulePath);
const browser = await pw.chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const output = resolve(sessionPath, '../output/playwright');
await mkdir(output, { recursive: true });
const report = { created: new Date().toISOString(), browser: browser.version(), playwright: require(modulePath + '/package.json').version, cloudWrites: false, physicalPhone: false, checks: [], pageErrors: [], externalToolRequests: [] };
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (error) => {
  if (/frame attempting navigation of the top-level window is sandboxed/.test(error.message)) (report.securityDiagnostics ??= []).push(error.message);
  else report.pageErrors.push(error.message);
});
page.on('request', (request) => {
  if (request.frame()?.parentFrame() && /^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) report.externalToolRequests.push(request.url());
});
const post = origin + '/posts/' + session.fixture.first + '/';
const sharedPost = origin + '/posts/' + session.fixture.second + '/';
const save = (score = 12) => ({ format: 'aero-2048', version: 1, board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score, history: [], wonAcknowledged: false });
const frameOf = async (index = 0) => {
  const locator = page.locator('iframe.aero-embedded-tool').nth(index); await locator.scrollIntoViewIfNeeded();
  const frame = await (await locator.elementHandle()).contentFrame(); await frame.locator('#board').waitFor(); return frame;
};
const openSave = async (frame) => { if (await frame.locator('#save-panel').getAttribute('open') === null) await frame.locator('summary').click(); };
const importSave = async (frame, value, realChooser = false) => {
  await openSave(frame);
  const payload = { name: 'phase-d.json', mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) };
  if (realChooser) { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), frame.locator('#import-btn').click()]); await chooser.setFiles(payload); }
  else await frame.locator('#import-input').setInputFiles(payload);
  await frame.waitForFunction(() => /存档已导入|导入失败/.test(document.getElementById('status').textContent));
};
const exportSave = async (frame) => {
  await openSave(frame);
  const [download] = await Promise.all([page.waitForEvent('download'), frame.locator('#export-btn').click()]);
  const name = download.suggestedFilename(); assert.match(name, /^2048_\d+\.json$/);
  const bytes = await readFile(await download.path()); await download.delete(); return { name, value: JSON.parse(bytes) };
};
const check = async (name, task) => { const detail = await task(); report.checks.push({ name, status: 'pass', detail }); console.log('PASS ' + name); };
try {
  await check('live article, fixed sandbox, both actual tools and storage fallback', async () => {
    await page.goto(post);
    await writeFile(join(output, 'live-article.yml'), await page.locator('body').ariaSnapshot());
    assert.equal(await page.locator('iframe.aero-embedded-tool').count(), 2);
    const first = await frameOf();
    assert.match(await first.locator('#storage-status').textContent(), /无法自动保存/);
    for (const element of await page.locator('iframe.aero-embedded-tool').all()) {
      assert.equal(await element.getAttribute('sandbox'), 'allow-scripts allow-downloads');
      assert.equal(await element.getAttribute('referrerpolicy'), 'no-referrer');
      assert.equal(await element.evaluate((el) => getComputedStyle(el).height), '480px');
    }
    const second = await frameOf(1); assert.equal(await second.locator('#score').textContent(), '0');
    return { framePaths: [new URL(first.url()).pathname, new URL(second.url()).pathname] };
  });
  await check('native file chooser, two JSON downloads, reimport and invalid-file preservation', async () => {
    const frame = await frameOf(); await importSave(frame, save(), true);
    const first = await exportSave(frame), second = await exportSave(frame);
    assert.deepEqual(first.value, save()); assert.deepEqual(second.value, first.value);
    assert.equal(first.name, '2048_12.json');
    await frame.locator('#restart-btn').click(); await importSave(frame, first.value, true);
    assert.deepEqual((await exportSave(frame)).value, first.value);
    await importSave(frame, '{"bad":true}'); assert.match(await frame.locator('#status').textContent(), /导入失败/);
    assert.deepEqual((await exportSave(frame)).value, first.value);
    await writeFile(join(output, 'live-export.json'), JSON.stringify(first.value, null, 2));
    return { downloads: [first.name, second.name], roundTrip: true, invalidImportPreservesGame: true };
  });
  await check('live parent DOM, cookie, storage and top navigation remain denied', async () => {
    const frame = await frameOf();
    const blocked = await frame.evaluate(() => {
      const denied = (fn) => { try { fn(); return false; } catch (error) { return error.name; } };
      return { parentDOM: denied(() => parent.document.body), cookie: denied(() => document.cookie), storage: denied(() => localStorage.getItem('phase-d')), topNavigation: denied(() => { top.location.href = '/__phase-d-forbidden'; }), referrer: document.referrer };
    });
    assert(['parentDOM', 'cookie', 'storage', 'topNavigation'].every((name) => blocked[name])); assert.equal(blocked.referrer, ''); assert.equal(page.url(), post);
    return blocked;
  });
  await check('real ClientRouter/history reinitialisation with continuous original audio', async () => {
    await page.goto(origin + '/');
    await page.evaluate(() => { window.__phaseD = true; window.__phaseDSwaps = 0; document.addEventListener('astro:after-swap', () => window.__phaseDSwaps++); });
    await page.locator('[data-play]:not([disabled])').waitFor(); await page.locator('[data-play]').click();
    await page.waitForFunction(() => document.querySelector('audio').currentTime > 0);
    const audio = await page.locator('audio').elementHandle(); const before = await audio.evaluate((el) => el.currentTime);
    await page.locator(`main a.rm-link[href='/posts/${session.fixture.first}/']`).click(); await page.waitForURL(post); await page.waitForFunction(() => window.__phaseDSwaps === 1);
    assert.equal(await page.evaluate(() => window.__phaseD), true);
    const old = await frameOf(); await importSave(old, save(52));
    assert(await audio.evaluate((el) => el === document.querySelector('audio') && !el.paused && el.currentTime > 0));
    assert((await audio.evaluate((el) => el.currentTime)) >= before);
    await page.goBack(); await page.waitForURL(origin + '/'); await page.waitForFunction(() => window.__phaseDSwaps === 2);
    const deadline = Date.now() + 3000; while (!old.isDetached() && Date.now() < deadline) await page.waitForTimeout(50); assert(old.isDetached());
    await page.goForward(); await page.waitForURL(post); await page.waitForFunction(() => window.__phaseDSwaps === 3);
    const fresh = await frameOf(); assert.equal(await fresh.locator('#score').textContent(), '0');
    assert(await audio.evaluate((el) => el === document.querySelector('audio') && !el.paused));
    await page.screenshot({ path: join(output, 'live-desktop.png'), animations: 'disabled' });
    return { sameAudio: true, stillPlaying: true, oldFrameDetached: true, reenteredScore: 0, swaps: 3 };
  });
  await check('live narrow layout, keyboard activation and separately owned shared tool', async () => {
    const first = await frameOf(); await importSave(first, save(0)); await first.locator('[data-direction="left"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await first.locator('#score').textContent(), '4');
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
    const frame = await frameOf(); await openSave(frame); await frame.locator('#export-btn').scrollIntoViewIfNeeded();
    const outer = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    const inner = await frame.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    assert(outer.content <= outer.width + 1 && inner.content <= inner.width + 1);
    await page.screenshot({ path: join(output, 'live-narrow.png'), animations: 'disabled' });
    await page.goto(sharedPost); const shared = await frameOf(); await importSave(shared, save(24), true); assert.deepEqual((await exportSave(shared)).value, save(24));
    return { outer, inner, keyboardScore: 4, sharedRoundTrip: true, physicalTouchNotCovered: true };
  });
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.externalToolRequests, []);
} catch (error) { report.error = error.message; process.exitCode = 1; console.error(error); }
finally {
  await browser.close();
  await writeFile(resolve(sessionPath, '../initial-browser-chrome.json'), JSON.stringify(report, null, 2));
}
