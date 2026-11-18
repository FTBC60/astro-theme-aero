import { dirname, isAbsolute, join, posix } from 'node:path';
import { assetPlan, inside, validatePostId } from './note-assets.mjs';
import { checkedManifest, checkedToolArchives } from './tool-package.mjs';

/** Validate the complete attachment and package plan at compilation and cache boundaries. */
export function checkedResourcePlan({ root, assets, toolEntries, archives, postIds }) {
  if (!Array.isArray(assets) || !Array.isArray(postIds) || new Set(postIds).size !== postIds.length) {
    throw new Error('Invalid attachment plan: expected assets and unique published post IDs');
  }
  for (const id of postIds) {
    if (typeof id !== 'string') throw new Error('Invalid attachment plan: expected published post IDs');
    validatePostId(id);
  }
  const published = new Set(postIds);
  const belongsToPost = (target) => {
    const parts = target.split('/');
    if (parts.shift() !== 'posts') return false;
    for (let length = 1; length < parts.length; length++) {
      if (published.has(parts.slice(0, length).join('/'))) return true;
    }
    return false;
  };
  for (const asset of assets) {
    if (!asset || typeof asset.source !== 'string' || !isAbsolute(asset.source) || !inside(root, asset.source)
      || /\.(md|mdx|astro)$/i.test(asset.source) || typeof asset.target !== 'string'
      || !belongsToPost(asset.target)) {
      throw new Error('Invalid attachment plan: attachment must belong to a published note inside notesDir');
    }
  }
  const planned = assetPlan(assets, postIds);
  const sources = new Map(planned.map(asset => [asset.target, asset.source]));
  const fail = message => { throw new Error(`Invalid attachment plan: ${message}`); };
  if (!Array.isArray(toolEntries)) fail('expected tool entries array');
  const selectedEntries = new Map();
  for (const record of toolEntries) {
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || Object.keys(record).sort().join(',') !== 'entry,files'
      || typeof record.entry !== 'string' || !record.entry.endsWith('/index.html')
      || !sources.has(record.entry)) fail('tool entry must be a planned index.html with files');
    const files = checkedManifest({ version: 1, files: record.files }, fail).files;
    const sourceDirectory = dirname(sources.get(record.entry));
    for (const file of files) {
      const target = posix.join(posix.dirname(record.entry), file);
      if (sources.get(target) !== join(sourceDirectory, ...file.split('/'))) {
        fail(`tool member does not match the selected file: ${target}`);
      }
    }
    const previous = selectedEntries.get(record.entry);
    if (previous && JSON.stringify(previous.files) !== JSON.stringify(files)) {
      fail(`conflicting tool membership: ${record.entry}`);
    }
    selectedEntries.set(record.entry, { entry: record.entry, files });
  }
  const entries = [...selectedEntries.values()];
  const selectedArchives = checkedToolArchives(archives, planned, entries.map(record => record.entry));
  for (const archive of selectedArchives) {
    if (JSON.stringify(selectedEntries.get(archive.entry).files) !== JSON.stringify(archive.manifest.files)) {
      fail(`archive membership does not match the tool entry: ${archive.entry}`);
    }
  }
  assetPlan(planned, postIds, selectedArchives.map(archive => archive.target));
  return { assets: planned, toolEntries: entries, archives: selectedArchives };
}

/** Query verified resources for Dev routing and enumerate the identical Build outputs. */
export function resourceDelivery(plan) {
  const entries = new Set(plan.toolEntries.map(record => record.entry));
  const packageTargets = new Set(plan.toolEntries.flatMap(record => record.files.map(file =>
    posix.join(posix.dirname(record.entry), file))));
  const outputs = [
    ...plan.assets.map(asset => ({ ...asset, kind: 'file', packageMember: packageTargets.has(asset.target) })),
    ...plan.archives.map(archive => ({ ...archive, kind: 'archive' })),
  ];
  const byTarget = new Map(outputs.map(output => [output.target, output]));
  return {
    resolve(target, packagesOnly = false) {
      const entry = target.endsWith('/') ? `${target}index.html` : null;
      const mapped = entry && entries.has(entry) ? entry : target;
      const output = byTarget.get(mapped);
      if (!output || (packagesOnly && output.kind === 'file' && !output.packageMember)) return undefined;
      return output;
    },
    outputs() { return outputs; },
  };
}
