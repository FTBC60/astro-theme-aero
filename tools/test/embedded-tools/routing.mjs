import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inside } from '../../lib/paths.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = join(project, '.astro/embedded-tools-phase-a/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i === -1 ? fallback : process.argv[i + 1]; };
const action = arg('--action', 'probe');
const phase = arg('--phase', 'initial');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gamePaths = ['posts/preflight-day/2048.html', 'posts/preflight-day/_attachments/共享工具/计算 器#.html'];
const markerPath = 'posts/routing/工具 空格#.html';
const encoded = (path) => '/' + path.split('/').map(encodeURIComponent).join('/');
if (action === 'inspect') {
  const files = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert(!entry.isSymbolicLink(), 'Site must not contain symlinks');
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        const relative = path.slice(manifest.site.length + 1).replaceAll('\\', '/');
        assert(!/(^|\/)(\.env[^/]*|\.git|\.obsidian|node_modules)(\/|$)|\.(md|mdx|php)$/i.test(relative), `Unexpected source: ${relative}`);
        files.push({ path: relative, bytes: (await readFile(path)).length });
      }
    }
  };
  await walk(manifest.site);
  assert.match(manifest.cloudName, /^aero-tools-a-20261103-[a-z0-9]+$/);
  await writeFile(join(manifest.run, 'site-inventory.json'), JSON.stringify(files, null, 2));
  console.log(JSON.stringify({ name: manifest.cloudName, files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), sampleHash: manifest.sampleSha256, syntheticOnly: true }));
} else if (action === 'mutate') {
  assert(['update', 'withdraw'].includes(phase));
  for (const base of ['', 'blog/']) {
    for (const path of [...gamePaths, markerPath]) {
      const target = resolve(manifest.site, base + path);
      assert(inside(manifest.site, target), 'Mutation must stay inside the generated fixture site');
      if (phase === 'withdraw') await unlink(target);
      else {
        const bytes = await readFile(target);
        const updated = path === markerPath ? Buffer.from(bytes.toString().replace('_V1', '_V2')) : Buffer.concat([bytes, Buffer.from('\n<!-- PHASE_A_UPDATE_V2 -->\n')]);
        await writeFile(target, updated);
        if (path === gamePaths[0]) manifest.updatedSampleSha256 = sha256(updated);
      }
    }
  }
  manifest.sitePhase = phase;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Generated fixture site changed to ${phase}; author sources unchanged`);
} else {
  assert.equal(action, 'probe');
  const origin = arg('--url', 'http://127.0.0.1:18865').replace(/\/$/, '');
  const label = arg('--label', 'local');
  const report = { origin, phase, created: new Date().toISOString(), routes: [], collisions: [] };
  const fetchRoute = async (path) => {
    const start = origin + path; let current = start;
    const redirects = [];
    for (let count = 0; count < 9; count++) {
      const response = await fetch(current, { redirect: 'manual', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        redirects.push({ status: response.status, location });
        await response.arrayBuffer(); current = new URL(location, current).href;
        assert.equal(new URL(current).origin, new URL(origin).origin, 'Do not follow a cross-origin redirect');
      } else {
        const bytes = Buffer.from(await response.arrayBuffer());
        return { start: path, redirects, finalPath: new URL(current).pathname, status: response.status, type: response.headers.get('content-type'), bytes: bytes.length, sha256: sha256(bytes), marker: bytes.toString().match(/PHASE_A_[A-Z_]+_V[12]/)?.[0] ?? null, cache: response.headers.get('cf-cache-status') };
      }
    }
    throw new Error(`Redirect loop: ${path}`);
  };
  for (const base of ['', '/blog']) {
    for (const [name, path] of [['game', gamePaths[0]], ['shared', gamePaths[1]], ['encoded', markerPath], ['uppercase', 'posts/routing/UPPER.HTML'], ['index', 'posts/routing/folder/index.html']]) {
      const original = base + encoded(path);
      const stem = original.replace(/\/index\.html$/, '').replace(/\.html$/i, '');
      const aliases = [...new Set([original, stem, stem + '/', stem + '/index', stem + '/index.html'])];
      for (const alias of aliases) {
        const result = { base: base || '/', name, ...await fetchRoute(alias) };
        if (name === 'uppercase') result.statusOfCheck = 'observation';
        else if (phase === 'withdraw' && ['game', 'shared', 'encoded'].includes(name)) {
          result.statusOfCheck = result.sha256 !== manifest.sampleSha256 && result.sha256 !== manifest.updatedSampleSha256 && !result.marker ? 'pass' : 'fail';
        } else if (['game', 'shared'].includes(name)) {
          const expected = phase === 'update' ? manifest.updatedSampleSha256 : manifest.sampleSha256;
          result.statusOfCheck = result.status === 200 && /text\/html/i.test(result.type) && result.sha256 === expected ? 'pass' : 'fail';
        } else {
          const expected = name === 'encoded' ? `PHASE_A_ENCODED_${phase === 'update' ? 'V2' : 'V1'}` : 'PHASE_A_INDEX_V1';
          result.statusOfCheck = result.status === 200 && result.marker === expected && /text\/html/i.test(result.type) ? 'pass' : 'fail';
        }
        report.routes.push(result);
      }
    }
    for (const name of ['collision', 'page-collision']) {
      for (const suffix of ['tool.html', 'tool/', 'tool', 'tool/index.html']) report.collisions.push({ base: base || '/', name, ...await fetchRoute(`${base}/posts/${name}/${suffix}`) });
    }
  }
  const path = join(manifest.run, `${label}-${phase}-routing.json`);
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, phase, pass: report.routes.filter((r) => r.statusOfCheck === 'pass').length, fail: report.routes.filter((r) => r.statusOfCheck === 'fail').length, observations: report.routes.filter((r) => r.statusOfCheck === 'observation').length, collisions: report.collisions.length, report: path }));
  for (const result of report.routes.filter((r) => r.statusOfCheck === 'fail')) console.log(JSON.stringify(result));
  if (report.routes.some((r) => r.statusOfCheck === 'fail')) process.exitCode = 1;
}
