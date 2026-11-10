import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { unified } from '@astrojs/markdown-remark';
import pageImages from '../../src/integrations/page-images.mjs';

const root = new URL('../../', import.meta.url);

async function render(body, page = 'about.md', base = '/') {
  let config = { root, srcDir: new URL('src/', root), base, markdown: { processor: unified() } };
  pageImages().hooks['astro:config:setup']({ config,
    updateConfig(change) { config = { ...config, markdown: { ...config.markdown, ...change.markdown } }; },
  });
  const renderer = await config.markdown.processor.createRenderer({ syntaxHighlight: false, smartypants: false });
  return renderer.render(body, { fileURL: new URL(`src/pages/${page}`, root) });
}

test('fixed-page raw images resolve against their destination, including deployment base', async () => {
  for (const base of ['/', '/blog/']) {
    const { code } = await render('<img src="../image/比丢.png" alt="比丢" width="1637">', 'about.md', base);
    assert.match(code, new RegExp(`src="${base}image/(?:比丢|%E6%AF%94%E4%B8%A2)\\.png"`));
    assert.match(code, /width="1637"/);
  }
});

test('Markdown images, image references and nested index pages use stable public URLs', async () => {
  const { code, metadata } = await render('![inline](../../image/bg.jpg)\n\n![reference][photo]\n\n[photo]: /image/avatar.jpg', 'guide/index.md', '/blog/');
  assert.match(code, /src="\/blog\/image\/bg.jpg"/);
  assert.match(code, /src="\/blog\/image\/avatar.jpg"/);
  assert.deepEqual(metadata.localImagePaths, []);
});

test('raw HTML keeps external URLs, escaped attributes, comments and script contents', async () => {
  const { code } = await render(`<!-- <img src="../comment.png"> -->
<script>const example = '<img src="../script.png">';</script>
<img title='a > b; src="../title.png"' src='../image/图 片.png?x=1&amp;y=2#part'>
<img src="https://example.com/photo.png"><img src="//example.com/photo.png"><img src="data:image/png;base64,AAAA">`);
  assert.match(code, /src="\/image\/(?:图%20片|%E5%9B%BE%20%E7%89%87)\.png\?x=1(?:&amp;|&#x26;)y=2#part"/);
  assert.match(code, /<!-- <img src="\.\.\/comment.png"> -->/);
  assert.match(code, /const example = '<img src="\.\.\/script.png">'/);
  assert.match(code, /https:\/\/example.com\/photo.png/);
  assert.match(code, /src="\/\/example.com\/photo.png"/);
  assert.match(code, /data:image\/png;base64,AAAA/);
});

test('fixed-page handling leaves note compilation and source-image imports to their own pipelines', async () => {
  const outside = await render('<img src="./attachment.png">', '../content/posts/day.md', '/blog/');
  assert.match(outside.code, /src="\.\/attachment.png"/);
  const { metadata } = await render('![source](../../public/image/bg.jpg)');
  assert(metadata.localImagePaths.includes('../../public/image/bg.jpg'), fileURLToPath(root));
});
