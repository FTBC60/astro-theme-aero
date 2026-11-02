import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { publish } from './lib/publisher.mjs';

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(process.env.THEME_DIR || runtimeRoot);
const args = process.argv.slice(2);
if (args.some((arg) => !['--dry-run', '--build-only'].includes(arg)) || args.length > 1) {
  console.error('Usage: node tools/deploy.mjs [--dry-run | --build-only]');
  process.exitCode = 1;
} else {
  const abort = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => abort.abort(new Error(`Interrupted by ${signal}`)));
  try {
    await publish({ root, runtimeRoot, dataDir: process.env.PUBLISHER_DATA_DIR || join(runtimeRoot, '.astro/publisher'), mode: args[0] === '--dry-run' ? 'dry-run' : args[0] === '--build-only' ? 'build-only' : 'deploy', signal: abort.signal });
  } catch (error) { console.error(`[publisher] ${error.message}`); process.exitCode = 1; }
}
