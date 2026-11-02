import { readFile, readdir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader, LoaderContext } from 'astro/loaders';
import { inside, noteId, resolveNotesDir } from './note-assets.mjs';
import { createNoteCompilation } from './note-compilation.mjs';
import { isPublishedNote, parseNoteFrontmatter } from './note-publication.mjs';

async function markdownFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.name.endsWith('.md') && (entry.isFile() || entry.isSymbolicLink())) files.push(path);
  }
  return files.sort();
}

export function notesLoader(notesDir: string): Loader {
  return {
    name: 'aero-notes',
    async load(context) {
      const root = await resolveNotesDir(fileURLToPath(context.config.root), notesDir);
      const sync = async () => {
        const entries = [];
        const ids = new Set<string>();
        const compilation = createNoteCompilation({ root, base: context.config.base, cacheDir: context.config.cacheDir, integrations: context.config.integrations });
        for (const file of await markdownFiles(root)) {
          if (!inside(root, await realpath(file))) throw new Error(`Note escapes notesDir: ${file}`);
          const contents = await readFile(file, 'utf8');
          const { frontmatter, content: body } = parseNoteFrontmatter(contents, file);
          // Unpublished Vault notes are not article inputs: skip IDs, schema and compilation.
          if (!isPublishedNote(frontmatter)) continue;
          const path = relative(root, file).replaceAll('\\', '/');
          const id = noteId(path, frontmatter);
          if (ids.has(id)) throw new Error(`Duplicate note ID "${id}" in ${file}`);
          ids.add(id);
          const data = await context.parseData({ id, data: frontmatter, filePath: file });
          const compiled = await compilation.compile({ id, file, frontmatter, body }, context.renderMarkdown);
          const rendered = compiled.rendered;
          data.cover = compiled.cover;
          // Astro's content store requires a site-relative path, including on Linux.
          const filePath = relative(fileURLToPath(context.config.root), file).replaceAll('\\', '/');
          entries.push({ id, data, body, filePath, rendered, digest: context.generateDigest({ contents, root, base: context.config.base }) });
        }
        await compilation.writePlan();
        // Clear on every sync so changing notesDir, deleting notes or withdrawing publication cannot retain old content.
        context.store.clear();
        for (const entry of entries) context.store.set(entry);
      };
      await sync();
      if (context.watcher) watchNotes(context, root, sync);
    },
  };
}

function watchNotes(context: LoaderContext, root: string, sync: () => Promise<void>) {
  let timer: ReturnType<typeof setTimeout>;
  let pending = Promise.resolve();
  context.watcher!.add(root);
  context.watcher!.on('all', (_event, path) => {
    if (!inside(root, path)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(sync).catch((error) => context.logger.error(error.message));
    }, 100);
  });
}
