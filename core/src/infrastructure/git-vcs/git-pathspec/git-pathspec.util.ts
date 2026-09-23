/**
 * What a pathspec handed to `IVcs.trackedFiles` means — ONE reading, shared by the real
 * adapter and every stand-in for it.
 *
 * WHY THIS EXISTS. `GitVcs` passed the pathspec to `git ls-files` as written, and git's
 * default pathspec is not a glob: `*` crosses directories and `**` is two of them. So the
 * `**\/*.md` that `init` writes for a repository with no `docs/` returned every document
 * EXCEPT the ones at the root — `README.md` included — while `src/**\/*.ts` skipped
 * `src/index.ts` and `modules/*\/src/*.ts` reached six directories deep. The test kit
 * meanwhile matched with globstar semantics, so every unit test of a documentation check
 * passed over a README that the real run never read. A test whose pathspec means
 * something different from what the real check sees is worse than no test.
 *
 * The meaning chosen is git's own `:(glob)` magic, because that is what the adapter now
 * asks git for, and the stand-ins must agree with the adapter rather than the reverse:
 *
 * - no pathspec, or an empty one — every tracked file;
 * - no wildcard — that file, or every file under that directory;
 * - `*` and `?` stay inside one segment, and DO match a leading dot (git has no dotfile
 *   rule — a `.env` is as tracked as anything else);
 * - `**` as a whole segment spans zero or more directories; trailing, everything below.
 *
 * `infrastructure/_contract/vcs.contract.spec.ts` runs the same cases against a real git
 * repository and against the test kit, so the two cannot drift apart again unnoticed.
 */

const WILDCARD = /[*?[]/;

/** Whether a pathspec is a literal path — a file, or a directory meaning everything in it. */
export const isLiteralPathspec = (pathspec: string): boolean => !WILDCARD.test(pathspec);

/** The pathspec as git's glob magic spells it. An already-magic pathspec is left alone. */
export const asGitGlob = (pathspec: string): string => (pathspec.startsWith(':') ? pathspec : `:(glob)${pathspec}`);

function segment(seg: string): string {
  let out = '';
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '[') {
      const close = seg.indexOf(']', i + 1);
      if (close === -1) out += '\\[';
      else {
        out += `[${seg.slice(i + 1, close).replace(/^!/, '^')}]`;
        i = close;
      }
    } else out += /[.+^${}()|\\\]]/.test(c) ? `\\${c}` : c;
  }
  return out;
}

/** A matcher for one pathspec, over repository-relative forward-slashed paths. */
export function pathspecMatcher(pathspec: string | undefined): (path: string) => boolean {
  const spec = (pathspec ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (spec === '' || spec === '.') return () => true;
  if (isLiteralPathspec(spec)) return (path) => path === spec || path.startsWith(`${spec}/`);

  const segs = spec.split('/');
  let source = '';
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === '**') {
      source += last ? '.*' : '(?:[^/]+/)*';
      return;
    }
    source += segment(seg) + (last ? '' : '/');
  });
  const re = new RegExp(`^${source}$`);
  return (path) => re.test(path);
}

/** The paths a pathspec selects, in the order given. */
export const matchPathspec = (pathspec: string | undefined, paths: readonly string[]): string[] =>
  paths.filter(pathspecMatcher(pathspec));
