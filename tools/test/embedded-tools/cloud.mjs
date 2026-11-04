// All mutations are confined to the newly named Phase A test Worker(s).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = join(project, '.astro/embedded-tools-phase-a/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath));
assert.match(manifest.cloudName, /^aero-tools-a-20261103-[a-z0-9]+$/);
const action = process.argv[2] || 'deploy';
const label = process.argv[3] || 'initial';
const cli = async (args, label) => {
  const chunks = [];
  const status = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [join(project, 'node_modules/wrangler/bin/wrangler.js'), ...args], {
      cwd: project, windowsHide: true,
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(manifest.run, `${label}-wrangler.log`) },
    });
    child.stdout.on('data', (chunk) => chunks.push(chunk)); child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', reject); child.on('close', done);
  });
  const text = Buffer.concat(chunks).toString().replace(/\x1b\[[0-9;]*m/g, '');
  await writeFile(join(manifest.run, `${label}-cli.txt`), text);
  return { status, url: text.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0], version: text.match(/Current Version ID: ([\w-]+)/)?.[1], error: status ? text.slice(-1300) : undefined };
};
if (action === 'names') {
  const results = [];
  for (const [label, filename] of [['ascii', 'plain.html'], ['unicode-space', '工具 空格.html'], ['percent', 'percent%name.html'], ['hash', 'hash#name.html']]) {
    const root = join(manifest.run, 'name-probes', label);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'index.html'), '<!doctype html><title>Phase A filename probe</title>');
    await writeFile(join(root, filename), `<!doctype html><p>PHASE_A_NAME_${label}</p>`);
    const config = join(manifest.run, `name-${label}.json`);
    await writeFile(config, JSON.stringify({ name: manifest.cloudName + '-names', compatibility_date: '2026-10-25', workers_dev: true, preview_urls: false, send_metrics: false, assets: { directory: root, html_handling: 'force-trailing-slash', not_found_handling: 'none' } }, null, 2));
    const result = { label, filename, ...await cli(['deploy', '--config', config], `name-${label}`) };
    results.push(result); console.log(JSON.stringify(result));
  }
  manifest.nameProbeResults = results;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(join(manifest.run, 'cloud-filenames.json'), JSON.stringify(results, null, 2));
} else if (action === 'deploy') {
  const result = await cli(['deploy', '--config', manifest.cloudConfig], `cloud-${label}`);
  manifest.cloudDeployments ??= []; manifest.cloudDeployments.push({ label, ...result });
  if (result.url) manifest.cloudUrl = result.url;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(result));
  if (result.status) process.exitCode = 1;
} else {
  assert.equal(action, 'cleanup');
  const results = [];
  for (const name of [manifest.cloudName, ...(manifest.nameProbeResults ? [manifest.cloudName + '-names'] : [])]) {
    results.push({ name, ...await cli(['delete', '--name', name, '--force'], `delete-${name}`) });
  }
  manifest.cloudCleanup = results;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(results));
  if (results.some((result) => result.status)) process.exitCode = 1;
}
