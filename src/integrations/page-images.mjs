import { stat } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unified } from '@astrojs/markdown-remark';

const external = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;

function imageUrl(value, page, base) {
  if (!value.trim() || external.test(value.trim())) return value;
  const prefix = base.replace(/\/$/, '');
  // Root-relative public URLs already carrying base must not receive it twice.
  if (prefix && (value === prefix || value.startsWith(`${prefix}/`))) return value;
  const url = new URL(value, `https://aero.invalid/${page}`);
  return `${prefix}${url.pathname}${url.search}${url.hash}`;
}

// Tokenize complete HTML tags, keeping quoted '>' characters together. Comments
// and raw-text elements are opaque; an example '<img>' inside them is not an image.
const htmlTokens = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const attributes = /([^\s=<>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;

function rawImages(html, page, base) {
  return html.replace(htmlTokens, (tag) => {
    if (!/^<img\s/i.test(tag)) return tag;
    return tag.replace(attributes, (attribute, name, quoted, offset) => {
      if (offset === 0 || name.toLowerCase() !== 'src' || !quoted) return attribute;
      const quote = /^["']/.test(quoted) ? quoted[0] : '"';
      const value = /^["']/.test(quoted) ? quoted.slice(1, -1) : quoted;
      const resolved = imageUrl(value, page, base);
      if (resolved === value) return attribute;
      return `${name}=${quote}${resolved.replaceAll(quote, quote === '"' ? '&quot;' : '&#39;')}${quote}`;
    });
  });
}

/** Resolve only fixed-page images; note attachments and source imports keep their existing pipelines. */
export function remarkPageImages({ pagesDir, contentPagesDir, base }) {
  return async (tree, file) => {
    if (!file.path) return;
    let path = relative(pagesDir, file.path);
    if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) {
      path = relative(contentPagesDir, file.path);
    }
    if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`) || !/\.md$/i.test(path)) return;
    const route = path.split(sep).join('/').replace(/\.md$/i, '').replace(/(?:^|\/)index$/, '');
    const page = route ? `${route}/` : '';
    const definitions = new Map();
    const collect = (node) => {
      if (node.type === 'definition') definitions.set(node.identifier.toLowerCase(), node);
      node.children?.forEach(collect);
    };
    collect(tree);
    const visit = async (node) => {
      if (node.type === 'imageReference') {
        const definition = definitions.get(node.identifier.toLowerCase());
        if (definition) Object.assign(node, { type: 'image', url: definition.url, title: definition.title });
      }
      if (node.type === 'image' && !external.test(node.url)) {
        // Astro can import images located beside Markdown. Only unresolved browser
        // paths refer to public files and need the destination page's URL base.
        const source = new URL(node.url, pathToFileURL(file.path));
        const isSource = !node.url.startsWith('/') && await stat(source).then((s) => s.isFile(), () => false);
        if (!isSource) node.url = imageUrl(node.url, page, base);
      }
      if (node.type === 'html') node.value = rawImages(node.value, page, base);
      if (node.children) for (const child of node.children) await visit(child);
    };
    await visit(tree);
  };
}

export default function pageImages() {
  return {
    name: 'aero-page-images',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        const options = config.markdown.processor.options;
        updateConfig({ markdown: { processor: unified({ ...options,
          remarkPlugins: [...options.remarkPlugins, [remarkPageImages, {
            pagesDir: fileURLToPath(new URL('pages/', config.srcDir)),
            contentPagesDir: fileURLToPath(new URL('content/pages/', config.srcDir)),
            base: config.base,
          }]],
        }) } });
      },
    },
  };
}
