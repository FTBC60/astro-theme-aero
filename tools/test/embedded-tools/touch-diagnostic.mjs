// Isolated controls for Chromium's emulated touch after scrolling an iframe.
// These pages are test-only; they do not change theme permissions or tool code.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const manifest = JSON.parse(await readFile(arg('--manifest')));
const origin = arg('--url').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await pw.chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const report = { browser: browser.version(), created: new Date().toISOString(), cases: [] };
const save = { format: 'aero-2048', version: 1, board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, history: [], wonAcknowledged: false };
const simple = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}button{height:44px;width:100px;touch-action:manipulation}</style><div style="height:450px">Spacer</div><button id="target" onclick="document.getElementById(\'score\').textContent=\'4\'">Button</button><p id="score">0</p><div style="height:400px">End</div>';
const cases = [
  { name: 'theme-original', theme: true },
  { name: 'theme-repeat', theme: true },
  { name: 'plain-480', height: 480 },
  { name: 'plain-480-cdp', height: 480, cdp: true },
  { name: 'plain-1000', height: 1000 },
  { name: 'standalone', standalone: true },
  { name: 'simple-480', height: 480, simple: true },
  { name: 'simple-1000', height: 1000, simple: true },
  { name: 'plain-480-no-sandbox-control', height: 480, noSandbox: true },
  { name: 'simple-small-480', height: 480, simple: true, small: true },
  { name: 'simple-small-at-origin', height: 480, simple: true, small: true, padding: 0 },
  { name: 'simple-small-desktop-touch', height: 480, simple: true, small: true, desktop: true },
  { name: 'simple-small-no-sandbox-control', height: 480, simple: true, small: true, noSandbox: true },
  { name: 'simple-small-mouse-control', height: 480, simple: true, small: true, mouse: true },
  { name: 'minimal-scrolled', height: 480, simple: true, small: true, scroll: 208 },
  { name: 'minimal-scrolled-at-origin', height: 480, simple: true, small: true, scroll: 208, padding: 0 },
  { name: 'minimal-scrolled-desktop-touch', height: 480, simple: true, small: true, scroll: 208, desktop: true },
  { name: 'minimal-scrolled-no-sandbox-control', height: 480, simple: true, small: true, scroll: 208, noSandbox: true },
  { name: 'focus-region', height: 480, simple: true, small: true, scroll: 208, focusRegion: true },
  { name: 'sample-at-origin', height: 480, padding: 0 },
  { name: 'sample-desktop-touch', height: 480, desktop: true },
  { name: 'sample-board-not-focusable', height: 480, unfocusBoard: true },
  { name: 'sample-board-not-hit-testable', height: 480, noBoardHit: true },
];
try {
  for (const item of cases) {
    if (arg('--cases') && !new RegExp(arg('--cases')).test(item.name)) continue;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: !item.desktop, hasTouch: true });
    const page = await context.newPage(); page.setDefaultTimeout(7000);
    const result = { ...item };
    try {
      await context.route(origin + '/__touch-simple', (route) => {
        let body = item.small ? simple.replace('height:44px;width:100px', 'height:40px;width:44px;margin-left:65px') : simple;
        if (item.focusRegion) body = body.replace('<div style="height:450px">', '<div tabindex="0" style="height:450px;touch-action:none">');
        return route.fulfill({ contentType: 'text/html', body });
      });
      await context.route(origin + '/__touch-host', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:${item.padding ?? 24}px}iframe{display:block;box-sizing:border-box;width:332px;height:${item.height}px;border:1px solid}</style><iframe ${item.noSandbox ? '' : 'sandbox="allow-scripts allow-downloads"'} src="${item.simple ? '/__touch-simple' : '/posts/day/2048.html'}"></iframe>` }));
      await page.goto(origin + (item.theme ? '/posts/day/' : item.standalone ? '/posts/day/2048.html' : '/__touch-host'));
      const iframe = page.locator('iframe').first();
      if (!item.standalone) await iframe.scrollIntoViewIfNeeded();
      const frame = item.standalone ? page : await (await iframe.elementHandle()).contentFrame();
      if (!item.simple) {
        await frame.locator('#board').waitFor(); await frame.locator('summary').click();
        await frame.locator('#import-input').setInputFiles({ name: 'probe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
        await frame.waitForFunction(() => document.getElementById('status').textContent.includes('存档已导入'));
      }
      const target = frame.locator(item.simple ? '#target' : '[data-direction="left"]');
      if (item.unfocusBoard) await frame.locator('#board').evaluate((el) => el.removeAttribute('tabindex'));
      if (item.noBoardHit) await frame.locator('#board').evaluate((el) => { el.style.pointerEvents = 'none'; });
      if (item.scroll) await frame.evaluate((y) => scrollTo(0, y), item.scroll);
      await target.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await frame.evaluate(() => {
        window.__touchDiagnostic = [];
        for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) document.addEventListener(type, (event) => {
          const x = event.clientX ?? event.changedTouches?.[0]?.clientX, y = event.clientY ?? event.changedTouches?.[0]?.clientY;
          window.__touchDiagnostic.push({ type, target: event.target.id || event.target.dataset.direction || event.target.tagName, x, y, time: performance.now(), scroll: scrollY, hit: document.elementFromPoint(x, y)?.outerHTML.slice(0, 180) });
        }, true);
      });
      result.before = await target.evaluate((el) => { const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, innerScroll: scrollY, touchAction: getComputedStyle(el).touchAction }; });
      result.outer = await page.evaluate(() => ({ scroll: scrollY, width: innerWidth, scale: visualViewport.scale }));
      if (item.cdp) {
        const box = await target.boundingBox(); const session = await context.newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
        await page.waitForTimeout(60);
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
      } else if (item.mouse) await target.click();
      else await target.tap();
      await frame.waitForFunction(() => document.getElementById('score').textContent === '4', null, { timeout: 1500 }).catch(() => {});
      Object.assign(result, await frame.evaluate(() => ({ score: document.getElementById('score').textContent, events: window.__touchDiagnostic })));
      result.status = result.score === '4' ? 'pass' : 'fail';
    } catch (error) { result.status = 'error'; result.error = error.message; }
    finally { await context.close(); }
    report.cases.push(result); console.log(`${result.status.toUpperCase()} ${item.name}: score=${result.score} events=${result.events?.map((event) => `${event.type}:${event.target}@${event.y}`).join(',')}`);
  }
} finally { await browser.close(); await writeFile(join(manifest.output, `touch-diagnostic${arg('--label') ? '-' + arg('--label') : ''}.json`), JSON.stringify(report, null, 2)); }
assert(report.cases.length > 0);
if (report.cases.some((item) => item.status !== 'pass')) process.exitCode = 1;
