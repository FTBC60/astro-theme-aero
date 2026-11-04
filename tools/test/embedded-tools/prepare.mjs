// Phase A only: manual iframe fixtures, not a tool-syntax implementation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetPlan, resolveNoteAsset } from '../../../src/lib/note-assets.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const sampleArg = process.argv.indexOf('--sample');
assert(sampleArg !== -1, 'Supply --sample /absolute/path/to/2048.html');
const sample = resolve(process.argv[sampleArg + 1]);
const bytes = await readFile(sample);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const output = join(project, '.astro/embedded-tools-phase-a');
await mkdir(output, { recursive: true });
const run = await mkdtemp(join(output, 'run-'));
const theme = join(run, 'theme');
const notes = join(run, 'notes');
const put = async (path, contents) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, contents); };
await cp(join(project, 'src'), join(theme, 'src'), { recursive: true });
for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) {
  await copyFile(join(project, name), join(theme, name));
}
await symlink(join(project, 'node_modules'), join(theme, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
await put(join(theme, 'src/config/content.config.ts'), `export const contentConfig = { notesDir: ${JSON.stringify(notes)} };\n`);
await put(join(notes, 'day/day.md'), '---\ntitle: Synthetic fixture\ndate: "2026-11-03"\nslug: preflight-day\npublish: true\n---\nSynthetic Phase A fixture.\n');
await put(join(notes, 'day/2048.html'), bytes);
await put(join(notes, '共享工具/计算 器#.html'), bytes);
// No actual author photos, songs, environment files or private notes enter this fixture.
for (const name of ['site', 'theme', 'music']) {
  const path = join(theme, `src/config/${name}.config.ts`);
  await writeFile(path, (await readFile(path, 'utf8')).replace(/'\/image\/[^']+'/g, "'/preflight.svg'"));
}
await put(join(theme, 'public/preflight.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#428baf"/></svg>');
const wav = Buffer.alloc(44 + 8000 * 40 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < (wav.length - 44) / 2; i++) wav.writeInt16LE(Math.round(500 * Math.sin(i * 2 * Math.PI * 220 / 8000)), 44 + i * 2);
await put(join(theme, 'public/audio/phase-a.wav'), wav);
await put(join(theme, 'public/audio/playlist.json'), JSON.stringify([{ title: 'Synthetic Phase A tone', src: '/audio/phase-a.wav' }]));

const marker = (name) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p id="marker">PHASE_A_${name}_V1</p><img alt="inline" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='blue'/%3E%3C/svg%3E"><script>document.body.dataset.ready='yes'</script></body></html>`;
const probes = [
  ['posts/routing/工具 空格#.html', 'ENCODED'],
  ['posts/routing/UPPER.HTML', 'UPPER'],
  ['posts/routing/folder/index.html', 'INDEX'],
  ['posts/collision/tool.html', 'FLAT'],
  ['posts/collision/tool/index.html', 'FOLDER'],
  ['posts/page-collision/tool.html', 'ATTACHMENT'],
];
for (const [path, name] of probes) await put(join(theme, 'public', path), marker(name));
await put(join(theme, 'src/pages/posts/page-collision/tool.astro'), marker('ARTICLE'));
const shell = (contents) => `---\nimport BaseLayout from '../../layouts/BaseLayout.astro';\nconst base = import.meta.env.BASE_URL.replace(/\\/$/, '');\n---\n<BaseLayout title="Embedded tools Phase A">\n<nav><a id="go-home" href={base + '/preflight/'}>Fixture home</a> | <a id="go-top" href={base + '/preflight/top/'}>Top tool</a> | <a id="go-lazy" href={base + '/preflight/lazy/'}>Lazy tool</a> | <a id="go-shared" href={base + '/preflight/shared/'}>Shared tool</a> | <a id="go-blocked" href={base + '/preflight/blocked/'}>No-download control</a></nav>\n${contents}\n</BaseLayout>`;
await put(join(theme, 'src/pages/preflight/index.astro'), shell('<h1>Phase A manual iframe fixture</h1><p id="fixture-home">No tool lifecycle adapter installed.</p>'));
const mappings = [];
for (const base of ['/', '/blog/']) {
  const assets = [];
  const note = { root: notes, file: join(notes, 'day/day.md'), id: 'preflight-day', base };
  const urls = {};
  for (const [name, reference] of [['game', './2048.html'], ['shared', '../共享工具/计算 器%23.html']]) {
    const relative = await resolveNoteAsset(reference, note, assets, 'image');
    urls[name] = `${base.replace(/\/$/, '')}/posts/preflight-day/${relative.slice(2)}`;
  }
  for (const asset of assetPlan(assets, ['preflight-day'])) await put(join(theme, 'public', asset.target), await readFile(asset.source));
  mappings.push({ base, urls, assets: assets.map(({ target }) => target) });
}
for (const [name, lazy, shared, downloads] of [
  ['top', false, false, true], ['lazy', true, false, true], ['shared', false, true, true], ['blocked', false, false, false],
]) {
  const path = shared ? '/posts/preflight-day/_attachments/%E5%85%B1%E4%BA%AB%E5%B7%A5%E5%85%B7/%E8%AE%A1%E7%AE%97%20%E5%99%A8%23.html' : '/posts/preflight-day/2048.html';
  await put(join(theme, `src/pages/preflight/${name}.astro`), shell(`<h1>${name} tool</h1>${lazy ? '<div style="height:2300px" id="spacer">Below the fold lazy-loading case</div>' : ''}<button id="before-tool" type="button">Before tool</button>\n<iframe id="tool" title="2048 Phase A" class="aero-embedded-tool" src={base + ${JSON.stringify(path)}} loading="lazy" sandbox="allow-scripts${downloads ? ' allow-downloads' : ''}" referrerpolicy="no-referrer" style="display:block;width:100%;height:480px;border:1px solid #777;background:white"></iframe>\n<button id="after-tool" type="button">After tool</button>`));
}
const original = await readFile(join(project, 'astro.config.mjs'), 'utf8');
const manifest = {
  run, theme, sampleSha256: sha256(bytes), sampleBytes: bytes.length, node: process.version,
  astro: JSON.parse(await readFile(join(project, 'node_modules/astro/package.json'))).version,
  wrangler: JSON.parse(await readFile(join(project, 'node_modules/wrangler/package.json'))).version,
  cloudName: `aero-tools-a-20261103-${run.split(/[/\\]/).at(-1).slice(-6).toLowerCase()}`,
  mappings, probes, builds: [], created: new Date().toISOString(),
};
for (const mapping of mappings) {
  const label = mapping.base === '/' ? 'root' : 'blog';
  const dist = join(run, `dist-${label}`);
  const config = original.replace("output: 'static',", `output: 'static',\n  base: ${JSON.stringify(mapping.base)},\n  outDir: ${JSON.stringify(dist)},`);
  await writeFile(join(theme, 'astro.config.mjs'), config);
  const log = [];
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [join(project, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', theme], { cwd: theme, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' }, windowsHide: true });
    child.stdout.on('data', (chunk) => log.push(chunk)); child.stderr.on('data', (chunk) => log.push(chunk));
    child.on('error', reject); child.on('close', done);
  });
  await writeFile(join(run, `build-${label}.log`), Buffer.concat(log));
  assert.equal(code, 0, `Astro ${label} build failed: ${Buffer.concat(log).toString().slice(-2200)}`);
  assert.equal(sha256(await readFile(join(dist, 'posts/preflight-day/2048.html'))), manifest.sampleSha256);
  const cloudConfig = join(run, `wrangler-${label}.json`);
  await put(cloudConfig, JSON.stringify({ name: manifest.cloudName, compatibility_date: '2026-10-25', workers_dev: true, preview_urls: false, send_metrics: false, assets: { directory: dist, html_handling: 'force-trailing-slash', not_found_handling: 'none' } }, null, 2));
  manifest.builds.push({ label, base: mapping.base, dist, cloudConfig });
  console.log(`Built ${label}: actual theme layout + manual iframe; sample bytes match`);
}
// A /blog/ build must be mounted at /blog/ by the host; base does not add a
// physical blog folder to Astro's output. Exercise both mounts on one host.
const combined = join(run, 'site');
await cp(manifest.builds[0].dist, combined, { recursive: true });
await cp(manifest.builds[1].dist, join(combined, 'blog'), { recursive: true });
manifest.site = combined;
manifest.cloudConfig = join(run, 'wrangler-combined.json');
await put(manifest.cloudConfig, JSON.stringify({ name: manifest.cloudName, compatibility_date: '2026-10-25', workers_dev: true, preview_urls: false, send_metrics: false, assets: { directory: combined, html_handling: 'force-trailing-slash', not_found_handling: 'none' } }, null, 2));
await put(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Phase A manifest: ${join(output, 'manifest.json')}`);
