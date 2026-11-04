// Narrow control experiment for the Windows WebKit preview crash.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const project = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = JSON.parse(await readFile(join(project, '.astro/embedded-tools-phase-a/manifest.json')));
const source = await readFile(join(manifest.site, 'preflight/lazy/index.html'), 'utf8');
const directory = join(manifest.site, 'preflight/no-frame');
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'index.html'), source.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/, ''));
const origin = process.argv[2] || 'http://127.0.0.1:18865';
const report = [];
for (const [name, target, fallback] of [['lazy-native', 'lazy', false], ['long-page-no-iframe', 'no-frame', false], ['lazy-fallback-control', 'lazy', true]]) {
  const browser = await pw.webkit.launch({ headless: true });
  const result = { name, browser: browser.version(), fallback, target, status: 'pending', events: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('crash', () => result.events.push('page-crash'));
    page.on('pageerror', (e) => result.events.push(e.message));
    if (fallback) await page.addInitScript(() => { Object.defineProperty(document, 'startViewTransition', { value: undefined }); });
    await page.goto(`${origin}/preflight/`);
    await page.evaluate((target) => {
      const a = document.createElement('a'); a.id = 'diagnostic-link'; a.href = `/preflight/${target}/`; a.textContent = 'Diagnostic target'; document.querySelector('main').prepend(a);
      window.__diagnosticSwap = 0; document.addEventListener('astro:after-swap', () => window.__diagnosticSwap++);
    }, target);
    await page.locator('#diagnostic-link').click();
    await page.waitForFunction(() => window.__diagnosticSwap > 0, null, { timeout: 8000 });
    // Wait for the normal visual transition before scrolling. Do not require
    // all document animations to finish (the music title may animate forever).
    await page.waitForTimeout(500);
    if (target === 'lazy') {
      await page.locator('#tool').scrollIntoViewIfNeeded();
      const frame = await (await page.locator('#tool').elementHandle()).contentFrame();
      await frame.waitForSelector('#board', { timeout: 6000 });
      result.frameUrl = frame.url();
    } else await page.locator('#after-tool').scrollIntoViewIfNeeded();
    result.status = 'pass';
  } catch (e) { result.status = 'fail'; result.error = e.message; }
  finally { await browser.close(); }
  report.push(result); console.log(JSON.stringify(result));
}
await writeFile(join(manifest.run, 'webkit-diagnostic.json'), JSON.stringify(report, null, 2));
if (report.some((r) => r.status === 'fail')) process.exitCode = 1;
