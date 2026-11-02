import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceRoots, sourceFiles as releaseFiles } from './lib/publish-files.mjs';
import { selectPublicResources } from './lib/public-resources.mjs';
import { inside, resolveNotesDir } from './lib/paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(root, 'release');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const sourceFiles = new Set(releaseFiles);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm', ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed${result.error ? `: ${result.error.message}` : ''}`);
}

function gitFiles(args) {
  const result = spawnSync('git', ['ls-files', '-z', ...args], { cwd: root, encoding: 'buffer' });
  if (result.error || result.status !== 0) throw new Error('Export requires a Git checkout and the git command.');
  return result.stdout.toString('utf8').split('\0').filter(Boolean).map((path) => path.replaceAll('\\', '/'));
}

function copyFile(from, to) {
  const source = join(root, from);
  if (!existsSync(source) || !lstatSync(source).isFile()) throw new Error(`Expected a regular file: ${from}`);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(source, to);
}

function validateSite(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) validateSite(path);
    else if (!entry.isFile()) throw new Error(`Unexpected link or special file in site: ${path}`);
  }
}

function archive(stage, name, member) {
  const target = join(release, name);
  const pending = `${target}.partial`;
  try {
    run('tar', ['-czf', pending, '-C', stage, member]);
    rmSync(target, { force: true });
    renameSync(pending, target);
  } finally {
    rmSync(pending, { force: true });
  }
  console.log(target);
}

const cache = join(root, '.astro');
mkdirSync(cache, { recursive: true });
const temp = mkdtempSync(join(cache, 'export-'));
try {
  // Within the author-delivery allowlist, keep Git's tracked and unignored new
  // files independently of the public-resource selection for the site build.
  const files = gitFiles(['--cached', '--others', '--exclude-standard', '--', ...sourceRoots, ...sourceFiles]);
  // The index still lists tracked files removed from an uncommitted working tree.
  const deleted = new Set(gitFiles(['--deleted']));
  const source = files.filter((file) => !deleted.has(file) && (sourceFiles.has(file) || sourceRoots.some((dir) => file.startsWith(`${dir}/`))));
  for (const required of sourceFiles) if (!source.includes(required)) throw new Error(`Missing source file: ${required}`);

  const { contentConfig } = await import(pathToFileURL(join(root, 'src/config/content.config.ts')).href);
  const notes = await resolveNotesDir(root, contentConfig.notesDir);
  const publicDir = join(temp, 'public');
  mkdirSync(publicDir);
  for (const name of await selectPublicResources(root, notes)) copyFile(`public/${name}`, join(publicDir, name));
  // Keep the original root for notesDir and config imports. Only public input,
  // output and cache are redirected; the author's public/ and dist/ are untouched.
  const config = join(temp, 'astro.config.mjs');
  const stageSite = join(temp, 'site');
  const buildPaths = { root, publicDir, outDir: stageSite, cacheDir: join(temp, 'cache') };
  writeFileSync(config, `import config from '../../astro.config.mjs';\nexport default { ...config, ...${JSON.stringify(buildPaths)} };\n`);
  const configFile = relative(root, config).split(sep).join('/');
  run('npm', ['run', 'check', '--', '--config', configFile]);
  run('npm', ['run', 'build', '--', '--config', configFile]);
  if (!existsSync(join(stageSite, 'index.html'))) throw new Error('Build did not produce site/index.html');

  const stageSource = join(temp, packageJson.name);
  for (const file of source) copyFile(file, join(stageSource, ...file.split('/')));
  // Test commands belong to the Git checkout; only edit the archive's copy.
  const authorPackage = { ...packageJson, scripts: Object.fromEntries(
    Object.entries(packageJson.scripts).filter(([name]) => name !== 'test' && !name.startsWith('test:')),
  ) };
  writeFileSync(join(stageSource, 'package.json'), JSON.stringify(authorPackage, null, 2) + '\n');
  validateSite(stageSite);

  const hash = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (hash.status !== 0) throw new Error('Could not read Git revision');
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' });
  if (status.status !== 0) throw new Error('Could not read Git status');
  const version = `${packageJson.name}-v${packageJson.version}-${hash.stdout.trim()}${status.stdout.trim() ? '-dirty' : ''}`;
  mkdirSync(release, { recursive: true });
  archive(temp, `${version}-source.tar.gz`, basename(stageSource));
  archive(stageSite, `${version}-site.tar.gz`, '.');
} finally {
  if (temp === cache || !inside(cache, temp)) throw new Error(`Refusing export cleanup outside cache: ${temp}`);
  rmSync(temp, { recursive: true, force: true });
}
