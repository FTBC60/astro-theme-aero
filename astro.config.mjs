import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax/svg';
import { remarkNoteAssets } from './src/lib/note-compilation.mjs';
import noteAssets from './src/integrations/note-assets.mjs';
import pageImages from './src/integrations/page-images.mjs';
import { contentConfig } from './src/config/content.config';

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  integrations: [noteAssets(contentConfig), pageImages()],
  markdown: {
    shikiConfig: { theme: 'github-light', wrap: false },
    processor: unified({
      remarkPlugins: [remarkMath, remarkNoteAssets],
      rehypePlugins: [rehypeMathjax],
    }),
  },
});
