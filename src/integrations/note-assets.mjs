import { createReadStream } from 'node:fs';
import { copyFile, mkdir, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inside, resolveNotesDir } from '../lib/note-assets.mjs';
import { createNoteCompilation, noteAssetsIntegrationName } from '../lib/note-compilation.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };

export default function noteAssets(settings) {
  let config;
  let compilation;
  return {
    name: noteAssetsIntegrationName,
    hooks: {
      'astro:config:setup': ({ config, addWatchFile }) => {
        addWatchFile(new URL('src/config/content.config.ts', config.root));
      },
      'astro:config:done': async ({ config: resolved }) => {
        config = resolved;
        const root = await resolveNotesDir(fileURLToPath(config.root), settings.notesDir);
        compilation = createNoteCompilation({ root, base: config.base, cacheDir: config.cacheDir, integrations: config.integrations });
      },
      'astro:build:done': async ({ dir }) => {
        const plan = await compilation.readPlan();
        const out = fileURLToPath(dir);
        const realOut = await realpath(out);
        for (const asset of plan.assets) {
          const source = await realpath(asset.source);
          const destination = resolve(out, asset.target);
          if (!inside(plan.root, source) || !inside(out, destination)) throw new Error(`Attachment escapes its root: ${asset.target}`);
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
            await stat(destination);
            throw new Error(`Attachment collides with a generated page or public file: ${asset.target}`);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
        for (const asset of plan.assets) {
          const destination = resolve(out, asset.target);
          await mkdir(dirname(destination), { recursive: true });
          await copyFile(asset.source, destination);
        }
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          try {
            const url = new URL(req.url, 'http://localhost');
            const prefix = config.base.replace(/\/$/, '');
            const path = decodeURIComponent(url.pathname);
            // Vite may already have removed the deployment base before this middleware.
            const target = (prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path).replace(/^\//, '');
            const plan = await compilation.readPlan();
            const asset = plan.assets.find((item) => item.target === target);
            if (!asset) return next();
            const source = await realpath(asset.source);
            if (!inside(plan.root, source)) throw new Error('Attachment escapes notesDir');
            res.setHeader('Content-Type', types[extname(source).toLowerCase()] || 'application/octet-stream');
            res.setHeader('Content-Length', (await stat(source)).size);
            if (req.method === 'HEAD') return res.end();
            createReadStream(source).on('error', next).pipe(res);
          } catch (error) { next(error); }
        });
      },
    },
  };
}
