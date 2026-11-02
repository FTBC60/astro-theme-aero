import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

export async function publishedPosts(): Promise<Post[]> {
  return (await getCollection('blog', ({ data }) => data.publish === true))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}

export function displayDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function postPath(post: Post): string {
  return `/posts/${post.id.split('/').map(encodeURIComponent).join('/')}/`;
}

export function excerpt(post: Post): string {
  const text = post.data.excerpt || post.data.description || (post.body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, '$1')
    .replace(/[#*_`>\-|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(text).slice(0, 150).join('') + (Array.from(text).length > 150 ? '...' : '');
}

export function tagSlug(tag: string): string {
  const normalized = tag.normalize('NFC').trim().toLowerCase();
  const slug = normalized.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return slug || `u-${Array.from(normalized).map((char) => char.codePointAt(0)!.toString(16)).join('-')}`;
}

export function tagPath(tag: string): string {
  return `/tags/${encodeURIComponent(tagSlug(tag))}/`;
}

export function allTags(posts: Post[]): { name: string; slug: string; posts: Post[] }[] {
  const map = new Map<string, { name: string; slug: string; posts: Post[] }>();
  for (const post of posts) {
    for (const name of new Set(post.data.tags)) {
      const slug = tagSlug(name);
      if (!slug) throw new Error(`Empty tag in ${post.id}`);
      const existing = map.get(slug);
      if (existing && existing.name !== name) {
        throw new Error(`Tag path collision: "${existing.name}" and "${name}" both map to ${slug}`);
      }
      if (existing) existing.posts.push(post);
      else map.set(slug, { name, slug, posts: [post] });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function pages<T>(entries: T[], pageSize: number): T[][] {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('postsPerPage must be a positive integer');
  return Array.from({ length: Math.max(1, Math.ceil(entries.length / pageSize)) }, (_, i) =>
    entries.slice(i * pageSize, (i + 1) * pageSize));
}

export function archiveYears(posts: Post[]): { year: string; posts: Post[] }[] {
  const years = new Map<string, Post[]>();
  for (const post of posts) {
    const year = String(post.data.date.getUTCFullYear());
    years.set(year, [...(years.get(year) || []), post]);
  }
  return [...years].map(([year, entries]) => ({ year, posts: entries }));
}
