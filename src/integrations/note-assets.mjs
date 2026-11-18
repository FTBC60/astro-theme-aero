import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, lstat, mkdir, open, realpath, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inside, resolveNotesDir } from '../lib/note-assets.mjs';
import { createNoteCompilation, noteAssetsIntegrationName } from '../lib/note-compilation.mjs';
import { resourceDelivery } from '../lib/note-resource-plan.mjs';
import { createToolArchive, openCheckedFile } from '../lib/tool-package.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
Object.assign(types, { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm' });

export default function noteAssets(settings) {
  let config;
  let compilation;
  const serveAssets = (packagesOnly = false) => async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    try {
      const url = new URL(req.url, 'http://localhost');
      const prefix = config.base.replace(/\/$/, '');
      const path = decodeURIComponent(url.pathname);
      // Vite may already have removed the deployment base before this middleware.
      const target = (prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path).replace(/^\//, '');
      if (packagesOnly && !target.startsWith('posts/')) return next();
      let plan;
      try { plan = await compilation.readPlan(); }
      catch (error) {
        // Initial content sync may still be warming up; do not block Astro routes.
        if (packagesOnly) return next();
        throw error;
      }
      const output = resourceDelivery(plan).resolve(target, packagesOnly);
      if (!output) return next();
      if (output.kind === 'archive') {
        const bytes = await createToolArchive(output, plan.assets, plan.root);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Length', bytes.byteLength);
        if (req.method === 'HEAD') return res.end();
        return res.end(bytes);
      }
      if (output.packageMember) {
        const fail = message => { throw new Error(`Cannot serve tool member ${output.target}: ${message}`); };
        const handle = await openCheckedFile(plan.root, output.source, fail);
        try {
          res.setHeader('Content-Type', types[extname(output.source).toLowerCase()] || 'application/octet-stream');
          res.setHeader('Content-Length', (await handle.stat()).size);
          if (req.method === 'HEAD') {
            await handle.close();
            return res.end();
          }
          return handle.createReadStream().on('error', next).pipe(res);
        } catch (error) {
          await handle.close();
          throw error;
        }
      }
      const source = await realpath(output.source);
      if (!inside(plan.root, source)) throw new Error('Attachment escapes notesDir');
      res.setHeader('Content-Type', types[extname(source).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Content-Length', (await stat(source)).size);
      if (req.method === 'HEAD') return res.end();
      createReadStream(source).on('error', next).pipe(res);
    } catch (error) { next(error); }
  };
  return {
    name: noteAssetsIntegrationName,
    hooks: {
      'astro:config:setup': ({ config, addWatchFile, updateConfig }) => {
        addWatchFile(new URL('src/config/content.config.ts', config.root));
        updateConfig({ vite: { plugins: [{
          name: 'aero-tool-package-dev',
          apply: 'serve',
          enforce: 'post',
          configureServer(server) {
            // Run after Astro installs its Sec-Fetch guard, including Vite restarts.
            // Only explicitly planned files under package entries are handled here.
            return () => server.middlewares.stack.unshift({ route: '', handle: serveAssets(true) });
          },
        }] } });
      },
      'astro:config:done': async ({ config: resolved }) => {
        config = resolved;
        const root = await resolveNotesDir(fileURLToPath(config.root), settings.notesDir);
        compilation = createNoteCompilation({ root, base: config.base, cacheDir: config.cacheDir, integrations: config.integrations });
      },
      'astro:build:done': async ({ dir }) => {
        const plan = await compilation.readPlan();
        const outputs = resourceDelivery(plan).outputs();
        const out = fileURLToPath(dir);
        const realOut = await realpath(out);
        for (const asset of outputs) {
          const destination = resolve(out, asset.target);
          if (!inside(out, destination)) throw new Error(`Attachment escapes its root: ${asset.target}`);
          if (asset.source && !inside(plan.root, await realpath(asset.source))) throw new Error(`Attachment escapes its root: ${asset.target}`);
          let parent = dirname(destination);
          while (true) {
            try {
              if (!inside(realOut, await realpath(parent))) throw new Error(`Attachment output symlink escapes dist: ${asset.target}`);
              break;
            } catch (error) {
              if (error.code !== 'ENOENT') throw error;
              parent = dirname(parent);
            }
          }
          try {
            await lstat(destination);
            throw new Error(`Attachment collides with a generated page or public file: ${asset.target}`);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
        for (const output of outputs) {
          const destination = resolve(out, output.target);
          const parent = dirname(destination);
          await mkdir(parent, { recursive: true });
          if (!inside(realOut, await realpath(parent))) {
            throw new Error(`Attachment output symlink escapes dist: ${output.target}`);
          }
          const temporary = resolve(parent, `.${basename(destination)}.${randomUUID()}.tmp`);
          let created = false;
          try {
            const staged = await open(temporary, 'wx');
            created = true;
            try {
              if (output.kind === 'archive') {
                await staged.writeFile(await createToolArchive(output, plan.assets, plan.root));
              } else {
                const fail = message => { throw new Error(`Cannot build tool member ${output.target}: ${message}`); };
                let source;
                if (output.packageMember) {
                  source = await openCheckedFile(plan.root, output.source, fail);
                } else {
                  const path = await realpath(output.source);
                  if (!inside(plan.root, path)) throw new Error(`Attachment escapes its root: ${output.target}`);
                  source = await open(path, 'r');
                }
                try {
                  if (!(await source.stat()).isFile()) throw new Error(`Attachment is not a file: ${output.target}`);
                  for await (const chunk of source.createReadStream({ autoClose: false })) {
                    await staged.writeFile(chunk);
                  }
                } finally { await source.close(); }
              }
            } finally { await staged.close(); }
            if (!inside(realOut, await realpath(parent))) {
              throw new Error(`Attachment output symlink escapes dist: ${output.target}`);
            }
            try { await link(temporary, destination); }
            catch (error) {
              if (error.code === 'EEXIST') {
                throw new Error(`Attachment collides with a generated page or public file: ${output.target}`, { cause: error });
              }
              throw new Error(`Cannot publish attachment with a hard link (${output.target}): ${error.message}`, { cause: error });
            }
          } finally {
            if (created) await unlink(temporary);
          }
        }
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(serveAssets());
      },
    },
  };
}
