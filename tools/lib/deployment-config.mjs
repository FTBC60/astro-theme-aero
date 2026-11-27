import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message) => { throw new Error(`Invalid wrangler.json: ${message}`); };

/** Read once per job; never consult image defaults or WORKER_NAME overrides. */
export async function loadDeploymentConfig(themeRoot) {
  const path = join(themeRoot, 'wrangler.json');
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { throw new Error(`Cannot read deployment configuration ${path}: ${error.code || 'read failed'}`); }
  let config;
  try { config = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { fail('expected valid JSON (comments and trailing commas are not supported)'); }
  if (!object(config)) fail('configuration must be an object');
  if (typeof config.name !== 'string' || !config.name.trim()) fail('name must be a non-empty string');
  for (const key of ['main', 'site']) {
    if (key in config) fail(`${key} is not supported by this static publisher`);
  }
  if ('assets' in config) {
    if (!object(config.assets)) fail('assets must be an object');
    if ('directory' in config.assets) fail('assets.directory is not supported by this static publisher');
  }
  return config;
}

export function siteDeploymentConfig(config, directory) {
  // Paths in the author's configuration can never select extra upload sources.
  return { ...config, assets: { ...config.assets, directory } };
}
