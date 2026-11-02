import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const keys = new Set(['$schema', 'name', 'compatibility_date', 'compatibility_flags', 'send_metrics', 'workers_dev', 'preview_urls', 'route', 'routes', 'observability', 'assets']);
const assetKeys = new Set(['html_handling', 'not_found_handling']);
const routeKeys = new Set(['pattern', 'zone_id', 'zone_name', 'custom_domain', 'enabled', 'previews_enabled']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message) => { throw new Error(`Invalid wrangler.json: ${message}`); };

function allowed(value, permitted, label) {
  if (!object(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!permitted.has(key)) fail(`${label}.${key} is not supported by this static publisher`);
}

function route(value) {
  if (typeof value === 'string') {
    if (!value.trim()) fail('route patterns must not be empty');
    return;
  }
  allowed(value, routeKeys, 'route');
  if (typeof value.pattern !== 'string' || !value.pattern.trim()) fail('route.pattern must be a non-empty string');
  for (const key of ['custom_domain', 'enabled', 'previews_enabled']) if (key in value && typeof value[key] !== 'boolean') fail(`route.${key} must be boolean`);
  for (const key of ['zone_id', 'zone_name']) if (key in value && (typeof value[key] !== 'string' || !value[key].trim())) fail(`route.${key} must be a non-empty string`);
  if (value.custom_domain && /[\s/*:]/.test(value.pattern)) fail('custom domains must be hostnames without a scheme, path or wildcard');
}

/** Read once per job; never consult image defaults or WORKER_NAME overrides. */
export async function loadDeploymentConfig(themeRoot) {
  const path = join(themeRoot, 'wrangler.json');
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { throw new Error(`Cannot read deployment configuration ${path}: ${error.code || 'read failed'}`); }
  let config;
  try { config = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { fail('expected valid JSON (comments and trailing commas are not supported)'); }
  allowed(config, keys, 'configuration');
  if (typeof config.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(config.name)) fail('name must be a lowercase Worker name using letters, numbers and hyphens (max 63 characters)');
  if (typeof config.compatibility_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date) || Number.isNaN(Date.parse(config.compatibility_date)) || new Date(config.compatibility_date).toISOString().slice(0, 10) !== config.compatibility_date) fail('compatibility_date must be a valid YYYY-MM-DD date');
  for (const key of ['send_metrics', 'workers_dev', 'preview_urls']) if (key in config && typeof config[key] !== 'boolean') fail(`${key} must be boolean`);
  if ('$schema' in config && typeof config.$schema !== 'string') fail('$schema must be a string');
  if ('compatibility_flags' in config && (!Array.isArray(config.compatibility_flags) || config.compatibility_flags.some((flag) => typeof flag !== 'string' || !flag.trim()))) fail('compatibility_flags must be an array of non-empty strings');
  if ('route' in config && 'routes' in config) fail('use either route or routes, not both');
  if ('route' in config) route(config.route);
  if ('routes' in config) {
    if (!Array.isArray(config.routes)) fail('routes must be an array');
    config.routes.forEach(route);
  }
  if ('observability' in config && !object(config.observability)) fail('observability must be an object');
  if ('assets' in config) {
    allowed(config.assets, assetKeys, 'assets');
    if ('html_handling' in config.assets && !['auto-trailing-slash', 'force-trailing-slash', 'drop-trailing-slash', 'none'].includes(config.assets.html_handling)) fail('unsupported assets.html_handling');
    if ('not_found_handling' in config.assets && !['single-page-application', '404-page', 'none'].includes(config.assets.not_found_handling)) fail('unsupported assets.not_found_handling');
  }
  return config;
}

export function siteDeploymentConfig(config, directory) {
  // Paths in the author's configuration can never select extra upload sources.
  return { ...config, assets: { ...config.assets, directory } };
}
