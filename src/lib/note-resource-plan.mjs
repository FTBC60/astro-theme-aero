import { posix } from 'node:path';
import { assetPlan } from './note-assets.mjs';

/** Deduplicate batch tool metadata and validate cross-note output collisions once before saving. */
export function finalizeResourcePlan({ assets, toolEntries, archives, postIds }) {
  const selectedEntries = new Map();
  for (const record of toolEntries) {
    const previous = selectedEntries.get(record.entry);
    if (previous && JSON.stringify(previous.files) !== JSON.stringify(record.files)) {
      throw new Error(`Invalid attachment plan: conflicting tool membership: ${record.entry}`);
    }
    selectedEntries.set(record.entry, record);
  }
  const selectedArchives = new Map();
  for (const archive of archives) {
    const previous = selectedArchives.get(archive.target);
    if (previous && JSON.stringify(previous) !== JSON.stringify(archive)) {
      throw new Error(`Invalid tool archive: conflicting selections: ${archive.target}`);
    }
    selectedArchives.set(archive.target, archive);
  }
  const archiveList = [...selectedArchives.values()];
  return {
    assets: assetPlan(assets, postIds, archiveList.map(archive => archive.target)),
    toolEntries: [...selectedEntries.values()],
    archives: archiveList,
  };
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
