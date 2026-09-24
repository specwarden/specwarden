import { expandBraces } from '../brace-expansion/brace-expansion.util';

/**
 * A glob pattern, compiled the way Node's `fs.globSync` compiles one — minimatch with
 * the options Node passes it — so that the engine can walk a tree by the same rules on a
 * runtime that has no `globSync`, and on one whose `globSync` answers differently.
 *
 * That second case is not hypothetical. On one tree, Node 24.9 found nothing for
 * `**\/.github/workflows/*.yml` where 22.23, 24.21 and 26.10 all found both workflow
 * files: the verdict of a check reading that glob depended on the Node minor. Owning the
 * rules is what makes a local green and a CI green mean the same. The semantics are Node
 * 24.21's — the LTS this repository develops on — and
 * `_contract/glob/file-source.glob.contract.spec.ts` holds them to what it answered. Node
 * has moved once since: from 26.9, a segment after `**` that names a directory link is no
 * longer followed into it; here it is, as on 24.21. One thing stays the runtime's: a POSIX
 * class and a case-insensitive match read its Unicode tables. An extglob inside an extglob
 * is refused (`NestedExtglobError`), never read differently.
 *
 * What the options mean, read from what a consumer writes:
 * - `\` is a path separator, never an escape — on every platform;
 * - a leading `#` or `!` is text: there is no comment and no negated pattern;
 * - `*`, `?` and a class never match a leading dot, and `**` never enters a dot
 *   directory; a segment that spells the dot (`.github`, `.*`) reaches it;
 * - on win32 and darwin a WILDCARD segment ignores case; a literal one is looked up on
 *   the file system, which decides for itself.
 */
export const GLOBSTAR: unique symbol = Symbol('**');

/** One path segment: a literal name, a pattern over one name, or `**`. */
export type GlobSegment = string | RegExp | typeof GLOBSTAR;

export interface CompiledGlob {
  readonly segments: readonly GlobSegment[];
  /** The segments as written, after normalisation — a walk's memo key. */
  readonly parts: readonly string[];
}

export interface GlobOptions {
  /** Wildcard segments ignore case — Node's choice on win32 and darwin. */
  readonly nocase: boolean;
  /** `//host/share` is one root and `C:` is a drive — Node's choice on win32. */
  readonly windows: boolean;
}

export const platformGlobOptions = (platform: string): GlobOptions => ({
  nocase: platform === 'win32' || platform === 'darwin',
  windows: platform === 'win32',
});

/** Every alternative a pattern stands for, one per brace expansion, each as segments. */
export function compileGlob(pattern: string, options: GlobOptions): readonly CompiledGlob[] {
  const seen = new Set<string>();
  const out: CompiledGlob[] = [];
  const alternatives = expandBraces(pattern.replace(/\\/g, '/')).map((p) => splitSegments(p, options.windows));
  for (const parts of normalise(alternatives)) {
    const key = parts.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    const drive = options.windows && /^[a-z]:$/i.test(parts[0] as string);
    out.push({
      parts,
      segments: parts.map((part, i) => (drive && i === 0 ? part : compileSegment(part, options.nocase))),
    });
  }
  return out;
}

function splitSegments(pattern: string, windows: boolean): string[] {
  // A UNC root keeps its two leading slashes as two empty segments.
  if (windows && /^\/\/[^/]+/.test(pattern)) return ['', ...pattern.split(/\/+/)];
  return pattern.split(/\/+/);
}

/**
 * What minimatch does to the segment lists before anything is matched, and which changes
 * what a walk visits: `**\/**` is one `**`, `a/./b` and `a//b` are `a/b`, `a/x/../b` is
 * `a/b`, and `**\/../x/y` is split into the two walks it could mean.
 */
function normalise(alternatives: readonly string[][]): string[][] {
  const all = alternatives.map((parts) => [...parts]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const parts of all) {
      for (let gs = parts.indexOf('**'); gs !== -1; gs = parts.indexOf('**', gs + 1)) {
        let run = gs;
        while (parts[run + 1] === '**') run++;
        if (run > gs) parts.splice(gs + 1, run - gs);
        const [next, p, p2] = [parts[gs + 1], parts[gs + 2], parts[gs + 3]];
        if (next !== '..' || !isPlain(p) || !isPlain(p2)) continue;
        changed = true;
        parts.splice(gs, 1);
        const other = [...parts];
        other[gs] = '**';
        all.push(other);
        gs--;
      }
      for (let i = 1; i < parts.length - 1; i++) {
        if (i === 1 && parts[1] === '' && parts[0] === '') continue;
        if (parts[i] === '.' || parts[i] === '') {
          changed = true;
          parts.splice(i, 1);
          i--;
        }
      }
      if (parts[0] === '.' && parts.length === 2 && (parts[1] === '.' || parts[1] === '')) {
        changed = true;
        parts.pop();
      }
      for (let dd = parts.indexOf('..', 1); dd !== -1; dd = parts.indexOf('..', dd + 1)) {
        const p = parts[dd - 1];
        if (!p || p === '.' || p === '..' || p === '**') continue;
        changed = true;
        const needDot = dd === 1 && parts[dd + 1] === '**';
        parts.splice(dd - 1, 2, ...(needDot ? ['.'] : []));
        if (parts.length === 0) parts.push('');
        dd -= 2;
      }
    }
  }
  return all;
}

const isPlain = (p: string | undefined): boolean => !!p && p !== '.' && p !== '..';

// ── one segment ─────────────────────────────────────────────────────────────────────

type Node =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'star' }
  | { readonly kind: 'one' }
  | { readonly kind: 'class'; readonly source: string; readonly unicode: boolean }
  | { readonly kind: 'ext'; readonly op: string; readonly branches: readonly (readonly Node[])[] };

const STAR = '[^/]*?';
const NO_DOT = '(?!\\.)';

/**
 * `.` and `..` are never a wildcard's to match, even after a spelled dot: `.*` reaches
 * `.github` and not the directory itself or its parent.
 */
const NO_TRAVERSAL = '(?!(?:^|\\/)\\.\\.?(?:$|\\/))';

function compileSegment(part: string, nocase: boolean): GlobSegment {
  if (part === '**') return GLOBSTAR;
  const nodes = parse(part, 0, false).nodes;
  if (nodes.every(isText)) return nodes.map((n) => n.text).join('');
  const unicode = nodes.some(usesUnicode);
  const src = sequence(nodes, '', true);
  const traversal =
    (src.startsWith('\\.') && '[.'.includes(src.charAt(2))) ||
    (src.startsWith('\\.\\.') && '[.'.includes(src.charAt(4)));
  return new RegExp(`^${traversal ? NO_TRAVERSAL : ''}${src}$`, `${nocase ? 'i' : ''}${unicode ? 'u' : ''}`);
}

const isText = (n: Node): n is Extract<Node, { kind: 'text' }> => n.kind === 'text';
const usesUnicode = (n: Node): boolean =>
  (n.kind === 'class' && n.unicode) || (n.kind === 'ext' && n.branches.some((b) => b.some(usesUnicode)));

/**
 * The regex source for `nodes`, followed by `tail` (what comes after them in the segment,
 * which a negated extglob must see). `start` is whether the nodes begin the segment: a
 * wildcard there must not match a leading dot.
 */
function sequence(nodes: readonly Node[], tail: string, start: boolean): string {
  return nodes
    .map((node, i) => {
      // Only a negated extglob reads what follows it: `!(a)b` must refuse `ab`, not `a`.
      const rest = node.kind === 'ext' && node.op === '!' ? sequence(nodes.slice(i + 1), tail, false) + tail : tail;
      return source(node, rest, start && i === 0);
    })
    .join('');
}

/** The guard belongs to whatever begins the segment; everything after it is past the dot. */
function source(node: Node, rest: string, start: boolean): string {
  const guard = start ? NO_DOT : '';
  switch (node.kind) {
    case 'text':
      return escape(node.text);
    case 'star':
      return guard + STAR;
    case 'one':
      return `${guard}[^/]`;
    case 'class':
      // minimatch guards a segment whose regex STARTS with `[`: a class that mixes a range
      // with a negated POSIX class compiles to `(…|…)` and is left unguarded — so
      // `[x[:graph:]]` matches a leading dot there, and must here.
      return (node.source.startsWith('[') ? guard : '') + node.source;
    case 'ext': {
      const body = node.branches.map((b) => sequence(b, rest, start)).join('|');
      if (node.op === '!') return `(?:(?!(?:${body})${rest}$)${guard}${STAR})`;
      return `(?:${body})${node.op === '@' ? '' : node.op}`;
    }
  }
}

/** Only the characters regex syntax owns: under the `u` flag any other escape is an error. */
const escape = (s: string): string => s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

/**
 * The nodes of `text` from `from`, up to the end — or, inside an extglob, up to its `)`
 * or a `|`. An extglob that never closes is not one: its operator and parenthesis are
 * read again as ordinary characters.
 *
 * A `[` that never closes swallows the rest of the segment, as minimatch reads it: inside
 * an extglob its `)` is class text, so the extglob never closes; outside one, nothing after
 * it is an extglob.
 */
function parse(text: string, from: number, nested: boolean): { nodes: Node[]; end: number; closed: boolean } {
  const nodes: Node[] = [];
  const push = (node: Node): void => {
    const last = nodes[nodes.length - 1];
    if (node.kind === 'text' && last?.kind === 'text')
      nodes[nodes.length - 1] = { kind: 'text', text: last.text + node.text };
    else if (node.kind === 'star' && last?.kind === 'star') return;
    else nodes.push(node);
  };
  let swallowed = false;
  let i = from;
  while (i < text.length) {
    const c = text[i] as string;
    if (nested && (c === '|' || c === ')')) return { nodes, end: i, closed: true };
    if (!swallowed && '!?+*@'.includes(c) && text[i + 1] === '(') {
      const ext = parseExtglob(text, i);
      if (ext) {
        push(ext.node);
        i = ext.end;
        continue;
      }
    }
    if (c === '*') push({ kind: 'star' });
    else if (c === '?') push({ kind: 'one' });
    else if (c === '[') {
      const cls = parseClass(text, i);
      if (cls) {
        push(cls.node);
        i = cls.end;
        continue;
      }
      if (nested) return { nodes, end: text.length, closed: false };
      swallowed = true;
      push({ kind: 'text', text: c });
    } else push({ kind: 'text', text: c });
    i++;
  }
  return { nodes, end: i, closed: false };
}

function parseExtglob(text: string, at: number): { node: Node; end: number } | undefined {
  const branches: Node[][] = [];
  let i = at + 2;
  for (;;) {
    const branch = parse(text, i, true);
    if (!branch.closed) return undefined;
    branches.push(branch.nodes);
    i = branch.end + 1;
    if (text[branch.end] === ')') break;
  }
  const op = text[at] as string;
  // `@()` as a whole segment has nothing to match and is read as text; `!()` is anything.
  if (op !== '!' && at === 0 && i === text.length && branches.length === 1 && branches[0]?.length === 0)
    return undefined;
  if (branches.some((b) => b.some((n) => n.kind === 'ext'))) throw new NestedExtglobError(text);
  return { node: { kind: 'ext', op, branches }, end: i };
}

/**
 * An extglob inside an extglob — `!(*(a|aa))b` — is refused rather than read.
 *
 * minimatch flattens these before it builds a regex, and a regex built without that step
 * both answers differently (`!(!(a))b` matched `ab`, where Node matches nothing) and
 * backtracks exponentially: 98 ms on a 30-character name, 704 ms on 34, a hang on a long
 * one. No check needs the construct, and a pattern the engine cannot read as Node does is
 * better stopped by name than answered.
 */
export class NestedExtglobError extends Error {
  constructor(readonly segment: string) {
    super(
      `a glob segment holds an extglob inside another (\`${segment}\`), which specwarden does not read — ` +
        'write the alternatives out, or split it into two patterns.',
    );
    this.name = 'NestedExtglobError';
  }
}

// ── character classes ───────────────────────────────────────────────────────────────

/** The POSIX classes minimatch understands, and the Unicode property each stands for. */
const POSIX: Readonly<Record<string, readonly [source: string, unicode: boolean, negated?: boolean]>> = {
  '[:alnum:]': ['\\p{L}\\p{Nl}\\p{Nd}', true],
  '[:alpha:]': ['\\p{L}\\p{Nl}', true],
  '[:ascii:]': ['\\x00-\\x7f', false],
  '[:blank:]': ['\\p{Zs}\\t', true],
  '[:cntrl:]': ['\\p{Cc}', true],
  '[:digit:]': ['\\p{Nd}', true],
  '[:graph:]': ['\\p{Z}\\p{C}', true, true],
  '[:lower:]': ['\\p{Ll}', true],
  '[:print:]': ['\\p{C}', true],
  '[:punct:]': ['\\p{P}', true],
  '[:space:]': ['\\p{Z}\\t\\r\\n\\v\\f', true],
  '[:upper:]': ['\\p{Lu}', true],
  '[:word:]': ['\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}', true],
  '[:xdigit:]': ['A-Fa-f0-9', false],
};

const classEscape = (s: string): string => s.replace(/[[\]\\-]/g, '\\$&');

/**
 * `[…]` from `at`, or undefined when it never closes (then `[` is text). `!` or `^` first
 * negates; `]` first is a member; `a-z` is a range and an inverted range is dropped; a
 * class of exactly one ordinary character is that character, not a wildcard; a class
 * that can match nothing makes the segment match nothing.
 */
function parseClass(text: string, at: number): { node: Node; end: number } | undefined {
  const ranges: string[] = [];
  const negs: string[] = [];
  let unicode = false;
  let negate = false;
  let sawStart = false;
  let rangeStart = '';
  let i = at + 1;
  while (i < text.length) {
    const c = text[i] as string;
    if ((c === '!' || c === '^') && i === at + 1) {
      negate = true;
      i++;
      continue;
    }
    if (c === ']' && sawStart) {
      return { node: classNode(ranges, negs, negate, unicode), end: i + 1 };
    }
    sawStart = true;
    if (c === '[') {
      const name = Object.keys(POSIX).find((k) => text.startsWith(k, i));
      if (name) {
        if (rangeStart) return { node: NOTHING, end: text.length };
        const [src, u, neg] = POSIX[name] as readonly [string, boolean, boolean?];
        (neg ? negs : ranges).push(src);
        unicode = unicode || u;
        i += name.length;
        continue;
      }
    }
    if (rangeStart) {
      if (c > rangeStart) ranges.push(`${classEscape(rangeStart)}-${classEscape(c)}`);
      else if (c === rangeStart) ranges.push(classEscape(c));
      rangeStart = '';
      i++;
      continue;
    }
    if (text.startsWith('-]', i + 1)) {
      ranges.push(classEscape(`${c}-`));
      i += 2;
      continue;
    }
    if (text[i + 1] === '-') {
      rangeStart = c;
      i += 2;
      continue;
    }
    ranges.push(classEscape(c));
    i++;
  }
  return undefined;
}

/** A class that can match nothing — and so a segment that matches nothing. */
const NOTHING: Node = { kind: 'class', source: '$.', unicode: false };

function classNode(ranges: readonly string[], negs: readonly string[], negate: boolean, unicode: boolean): Node {
  if (ranges.length === 0 && negs.length === 0) return NOTHING;
  if (negs.length === 0 && ranges.length === 1 && !negate && /^\\?.$/u.test(ranges[0] as string)) {
    // `[_]` is how a wildcard character is written as text; it is not a wildcard itself.
    return { kind: 'text', text: [...(ranges[0] as string)].pop() as string };
  }
  const positive = `[${negate ? '^' : ''}${ranges.join('')}]`;
  const negative = `[${negate ? '' : '^'}${negs.join('')}]`;
  const source = ranges.length && negs.length ? `(${positive}|${negative})` : ranges.length ? positive : negative;
  return { kind: 'class', source, unicode };
}
