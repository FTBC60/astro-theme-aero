// Repository-only validation of the exact author asset uploaded by release.yml.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceFiles, sourceRoots } from '../../tools/lib/publish-files.mjs';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const name = `${pkg.name}-v${pkg.version}-theme.tar.gz`;
const archive = join(root, 'release', name);
const tar = (...args) => execFileSync('tar', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const members = tar('-tzf', archive).split(/\r?\n/).filter(Boolean);
const files = new Set();
for (const member of members) {
  assert(member.startsWith(`${pkg.name}/`) && !member.split('/').includes('..'), `Unexpected archive path: ${member}`);
  if (member.endsWith('/')) continue;
  const relative = member.slice(pkg.name.length + 1);
  assert(sourceFiles.includes(relative) || sourceRoots.some(dir => relative.startsWith(`${dir}/`)), `Developer or unknown file in theme: ${relative}`);
  files.add(relative);
}
for (const required of sourceFiles) assert(files.has(required), `Missing author file: ${required}`);
for (const required of ['docs/en/README.md', 'docs/zh-CN/README.md', 'examples/posts/en/tools/calculator.html', 'examples/posts/zh-CN/tools/2048.html']) assert(files.has(required), `Missing author guide/example: ${required}`);
const author = JSON.parse(tar('-xOf', archive, `${pkg.name}/package.json`));
const expected = { ...pkg, scripts: Object.fromEntries(Object.entries(pkg.scripts).filter(([key]) => key !== 'test' && !key.startsWith('test:'))) };
assert.deepEqual(author, expected, 'Only test commands may differ in the archived manifest');
assert.equal(tar('-xOf', archive, `${pkg.name}/package-lock.json`), readFileSync(join(root, 'package-lock.json'), 'utf8'));
const checksum = createHash('sha256').update(readFileSync(archive)).digest('hex');
assert.equal(readFileSync(join(root, 'release/SHA256SUMS.txt'), 'utf8'), `${checksum}  ${name}\n`);
console.log(`Verified ${name}: ${files.size} author files; SHA-256 ${checksum}`);
