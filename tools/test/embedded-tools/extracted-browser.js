async (page) => {
  // Open the extracted-tool directory through a local HTTP server before running.
  await page.waitForFunction(() => document.documentElement.dataset.linkProbe === 'ready');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  assert(await page.locator('body').evaluate(element => getComputedStyle(element).margin) === '0px', 'extracted CSS');
  await page.locator('input[value="ms"]').check();
  await page.locator('#timestamp').fill('1000');
  await page.locator('#convert').click();
  assert((await page.locator('#result').textContent()).includes('1970-01-01T00:00:01.000Z'), 'extracted tool calculation');
  const origin = new URL(page.url()).origin;
  await page.goto(new URL('legacy.html', page.url()).href);
  await page.locator('#legacy').click();
  assert(await page.locator('#legacy').textContent() === 'legacy-ok', 'downloaded single HTML');
  return { origin, extractedZip: true, css: true, fetch: true, worker: true, storage: true, singleHtml: true };
}
