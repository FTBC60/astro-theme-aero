async (page) => {
  const config = __PACKAGE_FIXTURE__;
  const origin = `http://127.0.0.1:${config.devPort}`;
  const preview = `http://127.0.0.1:${config.previewPort}`;
  const report = { browser: page.context().browser().version(), results: [], errors: [], requests: [], downloads: [], cloudWrites: false };
  page.on('pageerror', error => report.errors.push(error.message));
  page.context().on('page', popup => popup.on('pageerror', error => report.errors.push(error.message)));
  page.context().on('request', request => report.requests.push(request.url()));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const check = async (name, run) => {
    try { report.results.push({ name, status: 'pass', detail: await run() }); }
    catch (error) { report.results.push({ name, status: 'fail', error: String(error) }); }
  };
  const frame = async title => {
    const locator = page.locator(`iframe[title="${title}"]`);
    await locator.scrollIntoViewIfNeeded();
    assert(await locator.getAttribute('sandbox') === 'allow-scripts allow-downloads', 'permissions changed');
    assert(await locator.getAttribute('allow') === null, 'no extra permission policy');
    const target = await (await locator.elementHandle()).contentFrame();
    await target.waitForFunction(() => document.documentElement.dataset.toolBuild === 'timestamp-2');
    return target;
  };
  await check('real ClientRouter entry: package JS/CSS in opaque iframe and legacy HTML', async () => {
    await page.goto(origin + '/blog/');
    await page.evaluate(() => { window.__packageDocument = 'preserved'; window.__packageSwaps = 0; document.addEventListener('astro:after-swap', () => window.__packageSwaps++); });
    await page.locator('main a[href="/blog/posts/first/"]').first().click();
    await page.waitForFunction(() => window.__packageSwaps > 0);
    assert(await page.evaluate(() => window.__packageDocument) === 'preserved', 'navigation reloaded document');
    const target = await frame('Timestamp');
    assert(await target.evaluate(() => window.origin) === 'null', 'tool origin is not opaque');
    assert((await target.locator('#result').textContent()).includes('1970-01-01T00:00:00.000Z'), 'epoch conversion');
    await target.locator('input[value="ms"]').check();
    await target.locator('#timestamp').fill('1000');
    await target.locator('#convert').click();
    assert((await target.locator('#result').textContent()).includes('1970-01-01T00:00:01.000Z'), 'millisecond conversion');
    assert(await target.locator('body').evaluate(el => getComputedStyle(el).margin) === '0px', 'external CSS did not load');
    const legacy = await (await page.locator('iframe[title="Legacy"]').elementHandle()).contentFrame();
    await legacy.locator('#legacy').click();
    assert(await legacy.locator('#legacy').textContent() === 'legacy-ok', 'legacy tool failed');
    await page.screenshot({ path: config.output + '/dev-article.png', fullPage: true });
    return { opaque: true, epoch: true, milliseconds: true, legacy: true };
  });
  await check('history back/forward recreates tool state without reloading parent', async () => {
    const beforeBack = await page.evaluate(() => window.__packageSwaps);
    await page.goBack();
    await page.waitForURL(origin + '/blog/');
    await page.waitForFunction(count => window.__packageSwaps > count, beforeBack);
    const beforeForward = await page.evaluate(() => window.__packageSwaps);
    await page.goForward();
    await page.waitForURL(origin + '/blog/posts/first/');
    await page.waitForFunction(count => window.__packageSwaps > count, beforeForward);
    const target = await frame('Timestamp');
    assert(await target.locator('#timestamp').inputValue() === '0', 'tool state unexpectedly persisted');
    assert(await page.evaluate(() => window.__packageDocument) === 'preserved', 'history reloaded parent');
    return { parentPreserved: true, toolReset: true };
  });
  await check('dev explicit index, directory alias, HEAD, selected files and metadata exclusion', async () => {
    const base = '/blog/posts/first/timestamp/';
    for (const path of [base, base + 'index.html']) {
      const response = await page.request.get(origin + path);
      assert(response.status() === 200, path + ': status');
      assert(response.headers()['content-type'].startsWith('text/html'), path + ': MIME');
    }
    for (const [name, type] of [['app.js', 'text/javascript'], ['style.css', 'text/css']]) {
      const response = await page.request.head(origin + base + name);
      assert(response.status() === 200 && response.headers()['content-type'].startsWith(type), name + ': HEAD/MIME');
    }
    for (const name of ['manifest.json', 'unused.js', 'obsolete.txt']) assert((await page.request.get(origin + base + name)).status() === 404, name + ': must not be served');
    const guarded = await page.request.get(origin + '/blog/src/config/site.config.ts', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors' } });
    assert(guarded.status() === 403, 'Astro protection for unselected source paths must remain active');
    await page.goto(origin + base);
    await page.waitForFunction(() => document.documentElement.dataset.toolBuild === 'timestamp-2');
    return { explicitIndex: true, directory: true, metadataStatus: 404 };
  });
  await check('link-only article opens complete local/shared tools as independent pages in dev and preview', async () => {
    for (const host of [origin, preview]) {
      await page.goto(host + '/blog/posts/second/');
      assert(await page.locator('iframe').count() === 0, 'article must contain only ordinary links');
      for (const mode of ['local', 'shared']) {
        const link = page.locator(`.post-content a[href*="mode=${mode}"]`);
        assert(await link.getAttribute('target') === '_blank', 'new tab');
        assert(await link.getAttribute('rel') === 'noopener', 'opener isolation');
        assert(await link.getAttribute('data-astro-reload') !== null, 'native navigation');
        const popupEvent = page.waitForEvent('popup');
        await link.click();
        const popup = await popupEvent;
        try {
          await popup.waitForLoadState('load');
          await popup.waitForFunction(() => document.documentElement.dataset.linkProbe === 'ready');
          const url = new URL(popup.url());
          assert(url.searchParams.get('mode') === mode && url.hash === '#result', 'query and fragment');
          if (mode === 'shared') assert(url.searchParams.get('size') === '2' && url.pathname.includes('/_attachments/day/timestamp/'), 'shared mapping');
          assert(await popup.evaluate(() => window.opener === null && window.origin === location.origin), 'independent origin context');
          await popup.locator('input[value="ms"]').check();
          await popup.locator('#timestamp').fill('1000');
          await popup.locator('#convert').click();
          assert((await popup.locator('#result').textContent()).includes('1970-01-01T00:00:01.000Z'), 'tool script');
          assert(await popup.locator('body').evaluate(el => getComputedStyle(el).margin) === '0px', 'CSS');
          assert(page.url() === host + '/blog/posts/second/', 'article remains open');
          await popup.evaluate(() => { window.__linkedToolResidence = 'retained'; });
          await page.goto(host + '/blog/');
          assert(await popup.evaluate(() => window.__linkedToolResidence === 'retained'), 'tool document lost during blog navigation');
          assert((await popup.locator('#result').textContent()).includes('1970-01-01T00:00:01.000Z'), 'tool state lost');
          await page.goto(host + '/blog/posts/second/');
        } finally { await popup.close(); }
      }
    }
    return { local: true, shared: true, fetch: true, worker: true, storage: true, retainedAcrossBlogNavigation: true, dev: true, preview: true };
  });
  await check('actual built candidate runs with directory/index URLs and no unselected resources', async () => {
    await page.goto(preview + '/blog/posts/first/');
    const target = await frame('Timestamp');
    assert((await target.locator('#result').textContent()).includes('1970-01-01T00:00:00.000Z'), 'built result');
    await page.goto(preview + '/blog/posts/first/timestamp/');
    await page.waitForFunction(() => document.documentElement.dataset.toolBuild === 'timestamp-2');
    await page.goto(preview + '/blog/posts/first/timestamp/index.html');
    await page.waitForFunction(() => document.documentElement.dataset.toolBuild === 'timestamp-2');
    for (const name of ['manifest.json', 'unused.js', 'obsolete.txt']) assert((await page.request.get(preview + '/blog/posts/first/timestamp/' + name)).status() === 404, 'built unselected: ' + name);
    return { candidate: true, cloudflareTested: false };
  });
  await check('actual HTML and ZIP downloads work from iframe toolbars and adjacent ordinary links', async () => {
    for (const [environment, host] of [['dev', origin], ['preview', preview]]) {
      await page.goto(host + '/blog/posts/first/');
      assert(await page.locator('.aero-tool-toolbar a[download]').count() === 2, 'iframe toolbars');
      for (const name of ['timestamp.zip', 'legacy.html']) {
        const links = page.locator(`.post-content a[download="${name}"]`);
        assert(await links.count() === 2, 'toolbar and ordinary-link downloads');
        for (let index = 0; index < 2; index++) {
          await links.nth(index).scrollIntoViewIfNeeded();
          await links.nth(index).focus();
          const started = page.waitForEvent('download');
          await links.nth(index).click();
          const download = await started;
          assert(download.suggestedFilename() === name, 'suggested filename');
          const file = `${config.output}/${environment}-${index}-${name}`;
          await download.saveAs(file);
          assert(await download.failure() === null, 'download completed');
          const url = new URL(download.url());
          assert(!url.search && !url.hash, 'download URL contains open-only parameters');
          assert(page.url() === host + '/blog/posts/first/', 'download navigated away from article');
          report.downloads.push({ environment, placement: index === 0 ? 'iframe' : 'link', name, file });
        }
      }
      await page.goto(host + '/blog/posts/second/');
      assert(await page.locator('iframe').count() === 0, 'link-only article');
      assert(await page.locator('a[download="local.zip"]').count() === 1, 'local link ZIP');
      assert(await page.locator('a[download="timestamp.zip"]').count() === 1, 'shared link ZIP');
    }
    return { html: true, zip: true, iframe: true, ordinaryLink: true, count: report.downloads.length };
  });
  await check('narrow iframe, keyboard conversion, no JS runtime errors', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/blog/posts/first/');
    const target = await frame('Timestamp');
    await target.locator('#timestamp').fill('1');
    await target.locator('#convert').focus();
    await page.keyboard.press('Enter');
    assert((await target.locator('#result').textContent()).includes('1970-01-01T00:00:01.000Z'), 'keyboard conversion');
    assert(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow');
    assert(report.errors.length === 0, 'runtime errors: ' + JSON.stringify(report.errors));
    assert(report.requests.every(url => url.startsWith(origin + '/') || url.startsWith(preview + '/')), 'unexpected external request');
    await page.screenshot({ path: config.output + '/dev-narrow.png', fullPage: true });
    return { width: 390, realPhone: false };
  });
  return report;
}
