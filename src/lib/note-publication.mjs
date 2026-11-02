import { extractFrontmatter, parseFrontmatter } from '@astrojs/markdown-remark';
import { parseDocument } from 'yaml';

/** A parsed YAML boolean grants publication; strings and other truthy values do not. */
export function isPublishedNote(frontmatter) {
  return frontmatter?.publish === true;
}

/** Keep parse failures attributable to a note, including interrupted frontmatter writes. */
export function parseNoteFrontmatter(contents, file) {
  try {
    const rawFrontmatter = extractFrontmatter(contents);
    if (rawFrontmatter === undefined) {
      if (/^(?:\uFEFF)?(?:[ \t]*\r?\n)*(?:---|\+\+\+)[ \t]*(?:\r?\n|$)/.test(contents)) {
        throw new Error('Opening frontmatter delimiter has no closing delimiter');
      }
      return parseFrontmatter(contents);
    }
    // Keep Astro's framing and TOML support, but do not opt YAML into implicit timestamps.
    if (/(?:^\uFEFF?|^\s*\n)(---|\+\+\+)/.exec(contents)?.[1] === '+++') return parseFrontmatter(contents);
    const document = parseDocument(rawFrontmatter, { schema: 'core', merge: true });
    if (document.errors.length) throw document.errors[0];
    const frontmatter = document.toJS();
    return {
      frontmatter: frontmatter && typeof frontmatter === 'object' ? frontmatter : {},
      rawFrontmatter,
      content: contents.replace(`---${rawFrontmatter}---`, ''),
    };
  } catch (error) {
    // Parser errors may contain full source excerpts; the first line has the reason/location.
    const reason = error instanceof Error ? error.message.split(/\r?\n/)[0] : 'Unknown parsing error';
    throw new Error(`Invalid frontmatter in "${file}": ${reason}`);
  }
}
