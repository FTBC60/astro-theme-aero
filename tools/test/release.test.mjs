import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fingerprint, sourceFiles } from '../lib/publish-files.mjs';
import { inside } from '../lib/paths.mjs';
import { publish } from '../lib/publisher.mjs';

const execute = promisify(execFile);
const project = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(project, '.astro');
const put = async (path, value) => { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, value); };
const exists = async (path) => readFile(path).then(() => true, () => false);
const excluded = ['tracked.txt', 'album/private.txt', 'album/hidden.tmp', 'norevive/keep.txt', 'content-excluded/hidden.txt', 'posts/day/index.html', 'album/.gitignore'];
const included = ['album/keep.tmp', 'content-excluded/keep.txt', '中文/图 片.svg', 'visible-by-local-rules.txt'];

async function assertAuthorLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await assertAuthorLinks(file);
    else if (entry.name.endsWith('.md')) {
      // Ignore fenced and inline examples: their sample URLs are not doc links.
      const text = (await readFile(file, 'utf8'))
        .replace(/^\s*```[^\n]*\n[\s\S]*?^\s*```\s*$/gm, '').replace(/`[^`\n]*`/g, '');
      for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
        const target = match[1].split(/[?#]/)[0];
        if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
        await stat(resolve(file, '..', decodeURIComponent(target))).catch((error) => {
          throw new Error(`Broken author link in ${file}: ${match[1]}`, { cause: error });
        });
      }
    }
  }
}

for (const external of [false, true]) {
  test(`export and Git-free Publisher build identical selected resources with ${external ? 'absolute external' : 'relative'} notesDir`, { timeout: 180000 }, async () => {
    await mkdir(cache, { recursive: true });
    const workspace = await mkdtemp(join(cache, 'release-test-'));
    const root = join(workspace, 'theme');
    const notes = external ? join(workspace, 'outside-notes') : join(root, '笔记');
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(workspace, 'empty-gitconfig') };
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { env });
    const runExport = async () => {
      try {
        return await execute(process.execPath, [join(root, 'tools/export.mjs')], { cwd: root, env, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
      } catch (error) { throw new Error(`${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`); }
    };
    try {
      await mkdir(root);
      await put(env.GIT_CONFIG_GLOBAL, '');
      for (const name of ['src', 'public', 'tools', 'docs', 'examples', ...sourceFiles]) {
        await cp(join(project, name), join(root, name), { recursive: true });
      }
      await symlink(join(project, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      await put(join(root, '.gitignore'), 'node_modules/\ndist/\n.astro/\nrelease/\n*.tmp\n/public/tracked.txt\n/public/norevive/\n!/public/norevive/keep.txt\n/public/content-excluded/*\n!/public/content-excluded/keep.txt\n');
      await put(join(root, 'public/album/.gitignore'), 'private.txt\n!keep.tmp\n');
      await put(join(root, 'public/posts/day/.gitignore'), '/index.html\n');
      for (const name of [...included, ...excluded.filter((name) => !name.endsWith('.gitignore'))]) {
        await put(join(root, 'public', name), `fixture: ${name}`);
      }
      const originalPackage = await readFile(join(root, 'package.json'), 'utf8');
      const originalLock = await readFile(join(root, 'package-lock.json'), 'utf8');
      await put(join(root, 'docs/adr/developer-only.md'), 'developer decision');
      await put(join(root, 'docs/architecture/developer-only.md'), 'developer architecture');
      await put(join(root, 'docs/validation/developer-only.md'), 'developer evidence');
      await put(join(root, 'examples/vault/developer-only.md'), 'legacy test sample');
      await put(join(root, 'tools/test/secret-fixture.txt'), 'test input');
      await put(join(root, 'tools/unlisted-tool.mjs'), '// developer-only script');
      const notesConfig = `export const contentConfig = { notesDir: ${JSON.stringify(external ? notes : './笔记')} };\n`;
      await put(join(root, 'src/config/content.config.ts'), notesConfig);
      await put(join(notes, 'day.md'), '---\ntitle: Published note\ndate: "2026-10-29"\npublish: true\ncover: ./cover.svg\n---\nA formula: $x^2$.\n\n[download](./document.txt)');
      await put(join(notes, 'cover.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      await put(join(notes, 'document.txt'), 'referenced attachment');
      await put(join(notes, 'unpublished.md'), '---\ntitle: Private note\ndate: "2026-10-29"\npublish: false\n---\nprivate');
      // This hook observes build input, proving filtering happens before Astro
      // rather than deleting matching paths from generated output afterward.
      const config = join(root, 'astro.config.mjs');
      await writeFile(config, "import { existsSync } from 'node:fs';\n" + (await readFile(config, 'utf8'))
        .replace("output: 'static',", "output: 'static', base: '/blog/',")
        .replace('integrations: [noteAssets(contentConfig), pageImages()],', `integrations: [noteAssets(contentConfig), pageImages(), {
          name: 'assert-filtered-build-input',
          hooks: { 'astro:config:done': ({ config }) => {
            for (const name of ${JSON.stringify(excluded)}) {
              if (existsSync(new URL(name, config.publicDir))) throw new Error('Excluded resource reached build: ' + name);
            }
            for (const name of ${JSON.stringify(included)}) {
              if (!existsSync(new URL(name, config.publicDir))) throw new Error('Selected resource missing from build: ' + name);
            }
          } }
        }],`));
      await put(join(root, 'src/deleted.ts'), 'export const removed = true;');
      git('init', '--quiet');
      git('add', '.');
      git('add', '-f', 'public/tracked.txt');
      git('-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid', 'commit', '--quiet', '-m', 'fixture');
      await rm(join(root, 'src/deleted.ts'));
      await put(join(root, 'docs/en/untracked.md'), 'intentional untracked author guide');
      await put(join(root, '.git/info/exclude'), '/public/visible-by-local-rules.txt\n');
      const globalIgnore = join(workspace, 'global-ignore');
      await put(globalIgnore, '/public/visible-by-local-rules.txt\n');
      git('config', 'core.excludesFile', globalIgnore);
      await put(join(root, 'dist/keep.txt'), 'previous local build');
      const before = { public: await fingerprint(join(root, 'public')), notes: await fingerprint(notes) };

      await runExport();
      const releases = await readdir(join(root, 'release'));
      const siteArchive = releases.find((name) => name.endsWith('-site.tar.gz'));
      const sourceArchive = releases.find((name) => name.endsWith('-source.tar.gz'));
      assert(siteArchive && sourceArchive);
      const exported = join(workspace, 'exported-site');
      await mkdir(exported);
      execFileSync('tar', ['-xzf', join(root, 'release', siteArchive), '-C', exported]);
      const members = execFileSync('tar', ['-tzf', join(root, 'release', sourceArchive)], { encoding: 'utf8' }).split(/\r?\n/);
      const packageName = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name;
      assert(members.includes(`${packageName}/public/tracked.txt`), 'source archive retains its existing tracked-file policy');
      assert(members.includes(`${packageName}/docs/en/untracked.md`));
      for (const name of ['tools/deploy.mjs', 'tools/export.mjs', 'tools/scheduler.mjs', 'tools/lib/publisher.mjs']) {
        assert(members.includes(`${packageName}/${name}`), name);
      }
      for (const name of ['tools/test/', 'docs/adr/', 'docs/architecture/', 'docs/validation/', 'examples/vault/', 'tools/unlisted-tool.mjs']) {
        assert(!members.some((member) => member.startsWith(`${packageName}/${name}`)), name);
      }
      const source = join(workspace, 'exported-source');
      await mkdir(source);
      execFileSync('tar', ['-xzf', join(root, 'release', sourceArchive), '-C', source]);
      const authorPackage = JSON.parse(await readFile(join(source, packageName, 'package.json'), 'utf8'));
      const expectedPackage = JSON.parse(originalPackage);
      for (const name of Object.keys(expectedPackage.scripts)) {
        if (name === 'test' || name.startsWith('test:')) delete expectedPackage.scripts[name];
      }
      assert.deepEqual(authorPackage, expectedPackage);
      await assertAuthorLinks(join(source, packageName));
      assert.equal(await readFile(join(source, packageName, 'package-lock.json'), 'utf8'), originalLock);
      assert.equal(await readFile(join(root, 'package.json'), 'utf8'), originalPackage);
      assert(!members.includes(`${packageName}/src/deleted.ts`));
      assert.equal(await readFile(join(root, 'dist/keep.txt'), 'utf8'), 'previous local build');
      assert(!(await readdir(join(root, '.astro'))).some((name) => name.startsWith('export-')));

      // The same theme works as a read-only NAS mount with no Git metadata.
      await rename(join(root, '.git'), join(workspace, 'git-metadata'));
      const dataDir = join(workspace, 'publisher-data');
      await publish({ root, runtimeRoot: project, dataDir, mode: 'build-only', env });
      const published = join(dataDir, 'site');
      for (const site of [exported, published]) {
        for (const name of included) assert.equal(await readFile(join(site, name), 'utf8'), `fixture: ${name}`);
        for (const name of excluded.filter((name) => name !== 'posts/day/index.html')) assert.equal(await exists(join(site, name)), false, name);
        const html = await readFile(join(site, 'posts/day/index.html'), 'utf8');
        assert.match(html, /Published note/);
        assert.match(html, /mjx-container/);
        assert.match(await readFile(join(site, 'index.html'), 'utf8'), /\/blog\/posts\/day\/cover.svg/);
        assert.equal(await readFile(join(site, 'posts/day/document.txt'), 'utf8'), 'referenced attachment');
        assert.equal(await readFile(join(site, 'posts/day/cover.svg'), 'utf8'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
        for (const name of ['day.md', 'posts/unpublished/index.html', 'posts/day/.gitignore']) assert.equal(await exists(join(site, name)), false);
      }
      assert.equal(await fingerprint(join(root, 'public')), before.public);
      assert.equal(await fingerprint(notes), before.notes);
      assert.equal(await readFile(join(root, 'src/config/content.config.ts'), 'utf8'), notesConfig);
      assert.deepEqual(await readdir(join(dataDir, 'runs')), []);

      await rename(join(workspace, 'git-metadata'), join(root, '.git'));
      await put(join(root, 'src/config/content.config.ts'), "export const contentConfig = { notesDir: './missing-notes' };\n");
      await assert.rejects(runExport(), /Cannot read notesDir/);
      assert.deepEqual(await readdir(join(root, 'release')), releases);
      assert(!(await readdir(join(root, '.astro'))).some((name) => name.startsWith('export-')));
    } finally {
      assert(workspace !== cache && inside(cache, workspace));
      await rm(workspace, { recursive: true, force: true });
    }
  });
}
