/**
 * Brace expansion, the first thing a glob pattern goes through — before it is split into
 * path segments, so a brace may hold a slash: `{README.md,src/x.ts}` is two patterns.
 *
 * The semantics are the ones Node's `fs.globSync` inherits from minimatch, which are
 * bash's: `{a,b}` is an alternation, `{1..3}` and `{a..c}` are sequences (an optional
 * third part is the step; a zero-padded member pads every member), braces nest and
 * multiply (`{a,b}{1,2}` is four), and a brace with neither a top-level comma nor a valid
 * sequence is literal text — `{a}`, `{}`, an unclosed `{`. At the top level an empty
 * alternative is dropped: `{,a}` is `a`.
 *
 * And, as there, it stops: at {@link MAX_ALTERNATIVES} patterns, or {@link MAX_LENGTH}
 * characters across them. Without a cap `{a,b}` written twenty times is a million
 * patterns and over a gigabyte before one directory is read.
 */
export function expandBraces(pattern: string): readonly string[] {
  if (pattern === '') return [];
  // Bash keeps a leading `{}` as text rather than expanding around it.
  const marked = pattern.startsWith('{}') ? `${OPEN}${CLOSE}${pattern.slice(2)}` : pattern;
  return expand(marked, true).map(unmark);
}

/** Node 24.21's minimatch caps, so a pattern expands to exactly what it expands to there. */
export const MAX_ALTERNATIVES = 100_000;
export const MAX_LENGTH = 4_000_000;

/** A brace that is text, not syntax — restored once expansion is over. */
const OPEN = '\u0001';
const CLOSE = '\u0002';
const unmark = (s: string): string => s.split(OPEN).join('{').split(CLOSE).join('}');

const NUMERIC_SEQUENCE = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/;
const ALPHA_SEQUENCE = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/;
const PADDED = /^-?0\d/;

/**
 * Left to right, one brace at a time: `acc` holds every expansion of what has been read,
 * and each brace multiplies it by its members. `dropEmpties` is decided by the FIRST
 * brace of a top-level pattern: an empty alternative is dropped only after an
 * alternation at the top, never after a sequence or inside another brace.
 */
function expand(input: string, top: boolean): string[] {
  let str = input;
  let isTop = top;
  let acc = [''];
  let dropEmpties = false;
  let firstGroup = true;
  for (;;) {
    const m = balanced(str);
    if (!m) return combine(acc, str, [''], dropEmpties);
    // `${…}` is a shell variable, not a brace to expand.
    if (m.pre.endsWith('$')) {
      acc = combine(acc, `${m.pre}{${m.body}}`, [''], dropEmpties && m.post === '');
      firstGroup = false;
      if (m.post === '') return acc;
      str = m.post;
      continue;
    }
    const alpha = ALPHA_SEQUENCE.test(m.body);
    const sequence = alpha || NUMERIC_SEQUENCE.test(m.body);
    if (!sequence && !m.body.includes(',')) {
      // `{a},b}`: the first close was not the one a comma belongs to — make it text and
      // look again. Anything else is left exactly as written, braces after it included.
      if (/,(?!,).*\}/.test(m.post)) {
        str = `${m.pre}{${m.body}${CLOSE}${m.post}`;
        isTop = true;
        continue;
      }
      return combine(acc, `${m.pre}{${m.body}}${m.post}`, [''], dropEmpties);
    }
    if (firstGroup) {
      dropEmpties = isTop && !sequence;
      firstGroup = false;
    }

    let values: string[];
    if (sequence) {
      values = sequenceOf(m.body.split('..'), alpha);
    } else {
      const parts = commaParts(m.body);
      if (parts.length === 1) {
        // `x{{a,b}}y` is `x{a}y x{b}y`: the comma belongs to the inner brace.
        const inner = expand(parts[0] as string, false).map((s) => `{${s}}`);
        if (inner.length === 1) {
          acc = combine(acc, m.pre + inner[0], [''], dropEmpties && m.post === '');
          if (m.post === '') return acc;
          str = m.post;
          continue;
        }
        values = within(inner, false);
      } else {
        // An empty member is dropped only when nothing can follow or precede it.
        const drops = dropEmpties && m.post === '' && m.pre === '' && acc.every((a) => a === '');
        values = within(
          parts.flatMap((part) => expand(part, false)),
          drops,
        );
      }
    }
    acc = combine(acc, m.pre, values, dropEmpties && m.post === '');
    if (m.post === '') return acc;
    str = m.post;
  }
}

/** Every `a + pre + v`, in order, until either cap is reached. */
function combine(acc: readonly string[], pre: string, values: readonly string[], dropEmpties: boolean): string[] {
  const out: string[] = [];
  let length = 0;
  for (const a of acc) {
    for (const v of values) {
      if (out.length >= MAX_ALTERNATIVES) return out;
      const expansion = a + pre + v;
      if (dropEmpties && !expansion) continue;
      if (length + expansion.length > MAX_LENGTH) return out;
      out.push(expansion);
      length += expansion.length;
    }
  }
  return out;
}

/** `values` up to either cap, without the empty ones when `dropEmpties`. */
function within(values: readonly string[], dropEmpties: boolean): string[] {
  const out: string[] = [];
  let length = 0;
  for (const v of values) {
    if (dropEmpties && !v) continue;
    if (out.length >= MAX_ALTERNATIVES || length + v.length > MAX_LENGTH) break;
    out.push(v);
    length += v.length;
  }
  return out;
}

function sequenceOf(ends: readonly string[], alpha: boolean): string[] {
  const [from, to, stepText] = ends as [string, string, string | undefined];
  const at = (s: string): number => (alpha ? s.charCodeAt(0) : Number(s));
  const x = at(from);
  const y = at(to);
  const width = Math.max(from.length, to.length);
  const pad = ends.some((e) => PADDED.test(e));
  // A zero step would never arrive; the direction always comes from the ends.
  const step = Math.abs(Number(stepText ?? 1)) || 1;
  const members: string[] = [];
  let length = 0;
  for (let i = x; (x <= y ? i <= y : i >= y) && members.length < MAX_ALTERNATIVES; i += x <= y ? step : -step) {
    let member: string;
    if (alpha) {
      const c = String.fromCharCode(i);
      member = c === '\\' ? '' : c;
    } else {
      const digits = String(Math.abs(i)).padStart(pad ? width - (i < 0 ? 1 : 0) : 0, '0');
      member = i < 0 ? `-${digits}` : digits;
    }
    if (length + member.length > MAX_LENGTH) break;
    members.push(member);
    length += member.length;
  }
  return members;
}

/** The top-level comma-separated parts of a brace body; a nested brace stays in one part. */
function commaParts(body: string): string[] {
  const m = balanced(body);
  if (!m) return body.split(',');
  const parts = m.pre.split(',');
  parts[parts.length - 1] += `{${m.body}}`;
  if (m.post !== '') {
    const rest = commaParts(m.post);
    parts[parts.length - 1] += rest.shift() as string;
    parts.push(...rest);
  }
  return parts;
}

interface Balanced {
  readonly pre: string;
  readonly body: string;
  readonly post: string;
}

/**
 * The first balanced `{…}`, as bash finds it: the outermost pair that closes, scanning
 * from the left. When open braces outnumber the closes, the leftmost INNER pair is taken
 * instead — `{{a}` pairs the second brace, and the first stays text.
 */
function balanced(str: string): Balanced | undefined {
  const opens: number[] = [];
  let inner: readonly [number, number] | undefined;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      opens.push(i);
    } else if (str[i] === '}' && opens.length > 0) {
      const start = opens.pop() as number;
      if (opens.length === 0) return split(str, start, i);
      if (inner === undefined || start < inner[0]) inner = [start, i];
    }
  }
  return inner && split(str, inner[0], inner[1]);
}

const split = (str: string, start: number, end: number): Balanced => ({
  pre: str.slice(0, start),
  body: str.slice(start + 1, end),
  post: str.slice(end + 1),
});
