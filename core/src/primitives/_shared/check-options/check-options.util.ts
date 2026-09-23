/**
 * A factory's options, checked by name when the check file loads.
 *
 * WHY THIS EXISTS. Every factory took whatever it was handed. A missing `pattern` crashed
 * the whole run with a raw stack; a string where a RegExp belonged failed deep inside a
 * body with "the path argument must be of type string"; a misspelled `except`, a GUIDE's
 * `patterns.add` for `patterns.extra`, a skill's `agents:` for `agentsDir` — each was
 * dropped in silence, and the check ran as if the option had never been given. The last
 * is the worst: an exemption, a pattern or a directory the author believes is in force,
 * and a green run to confirm the belief.
 *
 * So a factory declares what it takes, and a wrong option is refused where it was written,
 * naming the factory, the check, the option and what it should have been.
 */

/** What an option's value may be. `regexp` is a RegExp object; `array` any array. */
export type TOptionKind = 'string' | 'number' | 'boolean' | 'regexp' | 'function' | 'array' | 'object';

export interface IOptionRule {
  /** The kind, or several accepted kinds. */
  readonly kind: TOptionKind | readonly TOptionKind[];
  /** Absent means optional. */
  readonly required?: boolean;
}

/** Option name → what it may hold. The identity fields every factory shares are added. */
export type TOptionSpec = Readonly<Record<string, IOptionRule>>;

/** The identity every factory accepts — see `ICheckIdentity`. */
const IDENTITY: TOptionSpec = {
  id: { kind: 'string' },
  title: { kind: 'string' },
  tier: { kind: 'string' },
  zone: { kind: 'string' },
  advisory: { kind: 'boolean' },
  when: { kind: ['function', 'object'] },
  hint: { kind: 'string' },
  timeoutSec: { kind: 'number' },
  exclusive: { kind: 'boolean' },
  ratchetId: { kind: 'string' },
  ratchetDirection: { kind: 'string' },
  ratchet: { kind: 'number' },
  rule: { kind: ['string', 'object'] },
};

/** Thrown when a factory is handed options it cannot honour. The loader reports it as a
 * load error — exit 2, the file named — never as a finding, because no check ran. */
export class CheckOptionsError extends Error {
  override readonly name = 'CheckOptionsError';
}

function kindOf(value: unknown): TOptionKind | 'undefined' | 'null' {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (value instanceof RegExp) return 'regexp';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'function') return t;
  return 'object';
}

const describe = (value: unknown): string => {
  const kind = kindOf(value);
  if (kind === 'string') return `the string ${JSON.stringify(value)}`;
  if (kind === 'regexp' || kind === 'number' || kind === 'boolean') return `${kind} ${String(value)}`;
  return kind === 'object' || kind === 'array' || kind === 'function' ? `a ${kind}` : kind;
};

const article = (kind: TOptionKind): string =>
  kind === 'regexp' ? 'a RegExp' : kind === 'array' || kind === 'object' ? `an ${kind}` : `a ${kind}`;

/**
 * Refuse options a factory cannot honour: a required one missing, one of the wrong kind,
 * and one the factory does not know. Returns nothing; throws `CheckOptionsError`.
 */
export function checkOptions(factory: string, options: unknown, spec: TOptionSpec): void {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new CheckOptionsError(`${factory}() takes one options object, and was handed ${describe(options)}.`);
  }
  const given = options as Record<string, unknown>;
  const known: TOptionSpec = { ...IDENTITY, ...spec };
  const who = `${factory}${typeof given.id === 'string' && given.id ? ` '${given.id}'` : ''}`;
  const problems: string[] = [];

  for (const key of Object.keys(given)) {
    if (given[key] === undefined) continue;
    const rule = known[key];
    if (!rule) {
      problems.push(`\`${key}\` is not an option of ${factory}`);
      continue;
    }
    const kinds = typeof rule.kind === 'string' ? [rule.kind] : rule.kind;
    if (!kinds.includes(kindOf(given[key]) as TOptionKind)) {
      problems.push(`\`${key}\` must be ${kinds.map(article).join(' or ')} (got ${describe(given[key])})`);
    }
  }
  for (const [key, rule] of Object.entries(known)) {
    if (rule.required && given[key] === undefined) problems.push(`\`${key}\` is required`);
  }

  if (problems.length > 0) {
    const options = Object.keys(spec).sort().join(', ');
    throw new CheckOptionsError(`${who}: ${problems.join('; ')}. Its own options are: ${options}.`);
  }
}
