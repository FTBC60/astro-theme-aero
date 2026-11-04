// Keep compact, sanitised evidence; raw logs and screenshots stay in .astro.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = JSON.parse(await readFile(join(project, '.astro/embedded-tools-phase-a/manifest.json')));
const sanitize = (text) => text.replace(/https?:\/\/[^\s"']+/g, '<test-url>')
  .replace(/(?:[a-z\d-]+\.)+workers\.dev/gi, '<test-host>').replaceAll(manifest.run, '<generated-run>');
const clean = (value) => typeof value === 'string' ? sanitize(value)
  : Array.isArray(value) ? value.map(clean)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]))
  : value;
const read = async (name) => JSON.parse(await readFile(join(manifest.run, name)));
const browserFiles = [
  'local-root-no-adapter-browser.json',
  'cloud-root-no-adapter-browser.json', 'cloud-blog-no-adapter-browser.json',
  'cloud-webkit-subset-root-no-adapter-browser.json', 'cloud-extra-root-no-adapter-browser.json',
  'cloud-touch-repeat-root-no-adapter-browser.json', 'cloud-touch-settled-root-no-adapter-browser.json',
  'cloud-touch-tall-root-no-adapter-browser.json', 'cloud-touch-standalone-root-no-adapter-browser.json',
  'cloud-touch-bundled-root-no-adapter-browser.json',
  'local-webkit-isolated-root-no-adapter-browser.json', 'local-webkit-adapter-root-minimal-adapter-browser.json',
];
const evidence = {
  clientDate: '2026-11-03', baseline: 'ffd0518', generated: new Date().toISOString(),
  purpose: 'Phase A manual iframe technical verification; tool Markdown compilation and production delivery are not implemented.',
  platform: process.platform, node: manifest.node, astro: manifest.astro, wrangler: manifest.wrangler,
  compatibilityDate: '2026-10-25', htmlHandling: 'force-trailing-slash', notFoundHandling: 'none',
  sample: { sha256: manifest.sampleSha256, bytes: manifest.sampleBytes },
  browser: [], routing: [],
  filenameUpload: manifest.nameProbeResults.map(({ label, status }) => ({ label, status, apiCode: status ? 10304 : null })),
  cloudDeploymentCount: manifest.cloudDeployments.filter((d) => !d.status).length,
  cleanup: manifest.cloudCleanup.map(({ status }, index) => ({ target: index === 0 ? 'main-test-worker' : 'filename-test-worker', status })),
};
for (const file of browserFiles) {
  const report = await read(file);
  evidence.browser.push(clean({ file, label: report.label, base: report.base, mode: report.mode, playwright: report.playwright, engines: report.engines.map(({ engine, version, results, errors, securityDiagnostics, touchDiagnostics }) => ({ engine, version, results, errors, securityDiagnostics, touchDiagnostics })) }));
}
for (const label of ['local-initial', 'cloud-initial', 'cloud-update', 'cloud-withdraw']) {
  const report = await read(label + '-routing.json');
  evidence.routing.push({ file: label + '-routing.json', phase: report.phase, routes: report.routes, collisions: report.collisions });
}
evidence.webkitDiagnostic = clean(await read('webkit-diagnostic.json'));
const directory = join(project, 'tools/test/validation-docs');
await writeFile(join(directory, 'embedded-tools-phase-a-2026-11-03.json'), JSON.stringify(evidence, null, 2) + '\n');
const snapshot = join(project, 'tools/test/embedded-tools/fixtures');
await mkdir(snapshot, { recursive: true });
const source = join(manifest.run, 'notes/day/2048.html');
const bytes = await readFile(source);
if (createHash('sha256').update(bytes).digest('hex') !== manifest.sampleSha256) throw new Error('Sample snapshot changed');
await copyFile(source, join(snapshot, '2048.html'));
console.log('Saved sanitised Phase A evidence and exact 2048 fixture snapshot.');
