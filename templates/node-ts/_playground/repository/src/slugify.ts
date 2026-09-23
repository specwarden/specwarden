/** Thrown when a title has nothing left in it once the punctuation is gone. */
export class SlugError extends Error {
  override readonly name = 'SlugError';
}

/** Lowercase, ASCII-folded, hyphen-joined — the shape every URL on the site uses. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === '') throw new SlugError(`nothing to slug in ${JSON.stringify(title)}`);
  return slug;
}
