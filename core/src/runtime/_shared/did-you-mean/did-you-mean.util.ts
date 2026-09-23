/**
 * The known names closest to one that was not known, as the tail of a refusal:
 * ` — did you mean 'no-todo'?`, or nothing when no name is close enough to be the one meant.
 *
 * A refusal that names only what was wrong leaves the reader to diff what they typed
 * against a list they cannot see; the id is almost always one keystroke from a real one.
 * CLOSE means an edit distance of at most a quarter of the longer name (and at least one),
 * or one name a prefix of the other — a far guess is noise, and a wrong suggestion is
 * followed.
 */
export function didYouMean(word: string, known: readonly string[]): string {
  const close = nearest(word, known);
  if (close.length === 0) return '';
  return ` — did you mean ${close.map((name) => `'${name}'`).join(' or ')}?`;
}

/** Up to three known names close to `word`, nearest first; ties keep the given order. */
export function nearest(word: string, known: readonly string[]): readonly string[] {
  const scored = [...new Set(known)]
    .filter((name) => name !== word)
    .map((name) => ({ name, distance: distance(word.toLowerCase(), name.toLowerCase()) }))
    .filter(({ name, distance: d }) => {
      const limit = Math.max(1, Math.floor(Math.max(word.length, name.length) / 4));
      const prefix = Math.min(word.length, name.length) >= 3 && (name.startsWith(word) || word.startsWith(name));
      return d <= limit || prefix;
    });
  return scored
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ name }) => name);
}

/** Edit distance with transposition — `no-tood` is one step from `no-todo`, not two. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
