import { type ICheck, type IVerdict, buildCheck, checkOptions } from 'specwarden';
import { type IDocCheckIdentity, optionsError } from '../_shared/identity/identity.model';
import { DEFAULT_DOCS, nothingExamined } from '../_shared/nothing-examined/nothing-examined.util';

/**
 * Documentation does not restate what the repository already owns — a count, or a bare
 * menu number.
 *
 * WHY A COUNT IN PROSE IS A DEFECT. "Fourteen agents" is true on the day it is written and
 * silently false on the day the fifteenth arrives. Nothing fails, nothing warns, and the
 * reader — increasingly an agent — believes the sentence because there is no reason not to.
 * The fix is never a smaller number: it is a sentence that says how to COUNT, so the answer
 * comes from git rather than from memory.
 *
 * WHAT IS EXEMPT, and why the exemptions are so specific. Three classes are legitimate and
 * each was found by the check's own false positives: a NORMATIVE threshold (a budget the
 * repository enforces, not an inventory it describes), a DATED measurement (a study that
 * says what was true on a day, which is the honest form), and a HEDGE ("about 70 gates" is
 * an order of magnitude, not a claim). Ordinals — "step 3", "§5" — are not counts at all,
 * and without that the check reports every numbered list in the corpus, which is how a gate
 * gets ignored.
 *
 * THE SECOND HALF: a menu number written without the item's name. Measured over one
 * corpus's history, fifty-nine hand edits were an operator document catching up with a
 * renumbered menu — more than the inventory counts. The number is NOT removed, because for
 * a menu the number is the keystroke; what is required is that it travel with its LABEL, so
 * a renumbering breaks the pair visibly instead of silently pointing elsewhere.
 *
 * WHAT IS CONFIGURATION: the countable nouns, the hedges, the trees where a frozen number is
 * correct by construction, the allowlist of normative thresholds, and how a menu spells its
 * items. None of those is a fact about the rule.
 */

export interface IDocCountsOptions extends IDocCheckIdentity {
  /** Nouns whose "how many" lives in the repository rather than in a document. Required,
   * and never empty: an empty list matches every number, not none. */
  readonly countableNouns: readonly string[];
  /** git pathspec for the documents read. Default: `**\/*.md`. */
  readonly docs?: string;
  /** Paths where a frozen number is correct by construction — generated trees, studies,
   * plans. Default: none. */
  readonly skipped?: readonly RegExp[];
  /** Declared normative thresholds: a claim, and the paths where it is legitimate.
   * Default: none. */
  readonly allowlist?: (read: (path: string) => string | undefined) => readonly IAllowedClaim[];
  /** How many count claims are tolerated. Only ever lowered. */
  readonly countRatchet?: number;
  /** The menu half. Omit it entirely in a repository that has no such menu. */
  readonly menu?: IMenuOptions;
  /** Words that turn a count into an estimate. Replaces `DEFAULT_HEDGE` — a regex
   * SOURCE fragment, not a RegExp, because it is spliced into a larger pattern. */
  readonly hedge?: string;
  /** Words that make a number a reference rather than a claim ("step 3"). */
  readonly ordinalLead?: string;
  /** How a number is written, including this locale's digit grouping. */
  readonly numberPattern?: string;
  /** Marks a figure as dated, and therefore honest. Replaces `DEFAULT_DATED`. */
  readonly dated?: RegExp;
}

export interface IAllowedClaim {
  readonly claim: string;
  readonly paths: readonly string[];
}

export interface IMenuOptions {
  /** The file whose items are the source of truth. */
  readonly source: string;
  /** Matches an item, capturing number then label. */
  readonly item: RegExp;
  /** Matches a reference to an item in prose, capturing the number. */
  readonly reference: RegExp;
  /** Matches a dispatch arm, capturing the number — two arms mean one is unreachable. */
  readonly dispatch: RegExp;
  readonly ordinalRatchet?: number;
}

/**
 * The four grammars below are ENGLISH, and that is a limit, not a universal.
 *
 * A hedge, an ordinal lead-in and a date marker are all vocabulary, and a repository
 * documenting in another language gets a check that finds nothing and reports green —
 * the worst outcome available, because it looks exactly like clean documentation.
 * Each is exported and each is overridable, so the mechanism (a bare count is a claim;
 * a hedged or dated one is not) travels while the words do not.
 */
export const DEFAULT_HEDGE =
  String.raw`(?:~|≈|≥|≤|about|roughly|around|over|under|almost|nearly|up\s+to|at\s+least|` +
  String.raw`at\s+most|fewer\s+than|more\s+than|no\s+more\s+than|\d+\s*[-–—]\s*)\s*`;

/** "Step 3 checks the interval" is a sentence about step three, not a claim that three exist. */
export const DEFAULT_ORDINAL_LEAD = String.raw`(?:step|phase|part|item|option|section|§|fig\.?|chapter)\s*-?\s*`;
export const DEFAULT_NUMBER = String.raw`\d{1,3}(?:[  ,]\d{3})*|\d{1,4}`;

/** A measurement that says WHEN it was taken is the honest form, and is left alone. */
export const DEFAULT_DATED = /\b20\d\d-\d\d-\d\d\b|\bmeasured\b|\bre-measured\b|\bas of\b|\bbaseline\b/i;

/**
 * A consumer's regex, made safe for the way it is used here.
 *
 * `asGlobal` for a pattern that is SCANNED: `matchAll` throws on a non-global regex, and
 * an `exec` loop over one never advances — a menu `reference` written without `/g` hung
 * the whole run on the first line that matched. `asStateless` for a pattern that is TESTED: a
 * `/g` regex keeps `lastIndex` between calls, so the second dated line of a document read
 * as undated and every other skipped path was scanned.
 */
const asGlobal = (re: RegExp): RegExp => (re.global ? re : new RegExp(re.source, `${re.flags}g`));
const asStateless = (re: RegExp): RegExp =>
  re.global || re.sticky ? new RegExp(re.source, re.flags.replace(/[gy]/g, '')) : re;

export interface ICountHit {
  readonly file: string;
  readonly line: number;
  readonly claim: string;
  readonly text: string;
}

export interface IClaimGrammar {
  readonly hedge?: string;
  readonly ordinalLead?: string;
  readonly numberPattern?: string;
}

export function claimPattern(countableNouns: readonly string[], grammar: IClaimGrammar = {}): RegExp {
  const ordinalLead = grammar.ordinalLead ?? DEFAULT_ORDINAL_LEAD;
  const hedge = grammar.hedge ?? DEFAULT_HEDGE;
  const numberPattern = grammar.numberPattern ?? DEFAULT_NUMBER;
  // The `of` lookbehind is the RATIO guard: in "269 of 510 files" the second number is a
  // denominator. It must be a lookbehind rather than a group, because the engine reaches the
  // second number first and would otherwise report it. `(?<!\d:)` excludes "1:1 tables",
  // which is a relationship rather than a claim that one table exists.
  return new RegExp(
    String.raw`(?<lead>${ordinalLead})?(?<hedge>${hedge})?(?<!\d[  ,])(?<!\d\.)\b` +
      String.raw`(?<!\bof\s)(?<!\d:)(?<num>${numberPattern})\b(?!\s*[.,:]\d)\s+` +
      String.raw`(?:distinct\s+|provisioned\s+|spec\s+|locale\s+|fast\s+|of\s+its\s+)?` +
      String.raw`(?<noun>${countableNouns.join('|')})\b`,
    'gi',
  );
}

export function scanCounts(input: {
  readonly files: readonly string[];
  readonly read: (file: string) => string | undefined;
  readonly allowed: readonly { readonly match: RegExp; readonly paths: readonly string[] }[];
  readonly skipped: readonly RegExp[];
  readonly claim: RegExp;
  /** What marks a figure as dated, and so exempt. Defaults to `DEFAULT_DATED`. */
  readonly dated?: RegExp;
}): ICountHit[] {
  const hits: ICountHit[] = [];
  const dated = asStateless(input.dated ?? DEFAULT_DATED);
  const skipped = input.skipped.map(asStateless);
  const claim = asGlobal(input.claim);

  for (const file of input.files) {
    if (skipped.some((re) => re.test(file))) continue;
    const source = input.read(file);
    if (source === undefined) continue;

    let fenced = false;
    let headingDated = false;
    for (const [index, rawLine] of source.split('\n').entries()) {
      if (/^\s*(```|~~~)/.test(rawLine)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      if (/^#{1,6}\s/.test(rawLine)) headingDated = dated.test(rawLine);

      // Inline code is a value, not prose about an inventory; a blockquote marker is not part
      // of the sentence.
      const line = rawLine.replace(/`[^`]*`/g, '').replace(/^\s*>\s?/, '');
      if (dated.test(line) || headingDated) continue;

      claim.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = claim.exec(line))) {
        const groups = match.groups as { lead?: string; hedge?: string; num: string; noun: string };
        if (groups.lead || groups.hedge) continue;
        if (groups.num === '0') continue;
        const claim = `${groups.num} ${groups.noun}`;
        if (input.allowed.some((entry) => entry.match.test(claim) && entry.paths.includes(file))) continue;
        hits.push({ file, line: index + 1, claim, text: line.trim().slice(0, 96) });
      }
    }
  }

  return hits;
}

export function menuLabels(source: string, item: RegExp): Map<string, string> {
  const labels = new Map<string, string>();
  for (const match of source.matchAll(asGlobal(item))) {
    // The parenthetical is a gloss, not the name — "Test restore (throwaway container)" is
    // cited as "Test restore", so matching the full string reports every correct citation.
    labels.set(match[1] as string, (match[2] as string).replace(/\s*\(.*$/, '').trim());
  }
  return labels;
}

/**
 * A number claimed twice in the DISPATCH — one arm is unreachable, and which one is decided
 * by line order rather than by anybody's intent.
 *
 * It exists because it happened silently: two branches each added an item and each picked
 * the next free number. The lines landed in different sections, so the merge was clean; the
 * label map is keyed by number, so the second label overwrote the first and every other
 * check kept passing. The damage was in the dispatch, where the shell takes the FIRST match.
 *
 * The LISTING is deliberately not checked. One arm may render different labels in different
 * contexts — a prod branch and an off-prod branch of one `if` — and the operator sees
 * exactly one. Flagging that makes a gate somebody switches off, which takes the real
 * finding with it.
 */
export function duplicateMenuNumbers(source: string, dispatch: RegExp): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();

  for (const match of source.matchAll(asGlobal(dispatch))) {
    const number = match[1] as string;
    seen.set(number, (seen.get(number) ?? 0) + 1);
  }
  for (const [number, n] of seen) {
    if (n > 1) problems.push(`option ${number} has ${n} dispatch arms — only the first can run`);
  }

  return problems.sort();
}

export interface IOrdinalHit {
  readonly file: string;
  readonly line: number;
  readonly number: string;
  readonly kind: 'dead' | 'unnamed';
  readonly label: string | null;
  readonly text: string;
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 3);

export function scanOrdinals(input: {
  readonly files: readonly string[];
  readonly read: (file: string) => string | undefined;
  readonly labels: ReadonlyMap<string, string>;
  readonly skipped: readonly RegExp[];
  readonly reference: RegExp;
}): IOrdinalHit[] {
  const hits: IOrdinalHit[] = [];
  const skipped = input.skipped.map(asStateless);
  const reference = asGlobal(input.reference);

  for (const file of input.files) {
    if (skipped.some((re) => re.test(file))) continue;
    const source = input.read(file);
    if (source === undefined) continue;

    const lines = source.split('\n');
    for (const [index, line] of lines.entries()) {
      reference.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = reference.exec(line))) {
        const number = match[1] as string;
        const label = input.labels.get(number);
        if (label === undefined) {
          hits.push({ file, line: index + 1, number, kind: 'dead', label: null, text: line.trim().slice(0, 90) });
          continue;
        }
        // The name may sit on the line before or after — a table row and its heading, a
        // comment and the command under it. Anything wider is not "accompanied".
        const context = [lines[index - 1] ?? '', line, lines[index + 1] ?? ''].join(' ').toLowerCase();
        const expected = words(label);
        const present = expected.filter((word) => context.includes(word)).length;
        if (expected.length > 0 && present / expected.length < 0.5) {
          hits.push({ file, line: index + 1, number, kind: 'unnamed', label, text: line.trim().slice(0, 90) });
        }
      }
    }
  }

  return hits;
}

export function docCounts(options: IDocCountsOptions): ICheck {
  checkOptions('docCounts', options, {
    countableNouns: { kind: 'array', required: true },
    docs: { kind: 'string' },
    skipped: { kind: 'array' },
    allowlist: { kind: 'function' },
    countRatchet: { kind: 'number' },
    menu: { kind: 'object' },
    hedge: { kind: 'string' },
    ordinalLead: { kind: 'string' },
    numberPattern: { kind: 'string' },
    dated: { kind: 'regexp' },
  });
  // EMPTY IS NOT INERT. The nouns are an alternation, and an alternation of nothing matches
  // the empty string — so `[]` reported every number followed by a space, the opposite of
  // "nothing to look for", which is what the scaffolds' comment promised.
  if (options.countableNouns.length === 0 || options.countableNouns.includes('')) {
    throw optionsError(
      'docCounts',
      options.id,
      '`countableNouns` is empty — an empty list matches every number, not none. ' +
        "Name the nouns whose count the repository owns, e.g. ['services', 'modules'].",
    );
  }
  const countRatchet = options.countRatchet ?? 0;
  const docs = options.docs ?? DEFAULT_DOCS;
  const skipped = (options.skipped ?? []).map(asStateless);
  const allowlist = options.allowlist ?? ((): readonly IAllowedClaim[] => []);

  return buildCheck(
    {
      ...options,
      rule: options.rule ?? {
        statement: 'a count the documentation states is the count the code has',
        owner: '@specwarden/docs',
        implied: true,
      },
      tier: options.tier ?? 'fast',
      zone: 'product',
    },
    ['read'],
    (ctx): IVerdict => {
      const read = (file: string): string | undefined => ctx.files.tryRead(file);
      // What is READ, after the skipped trees. None is a failure like every other check in
      // this package: a count check over no documents finds no restated count, forever.
      const files = ctx.vcs.trackedFiles(docs).filter((file) => !skipped.some((re) => re.test(file)));
      if (files.length === 0) return nothingExamined(options.id, docs);
      const failures: string[] = [];

      const allowed = allowlist(read).map((entry) => ({
        paths: entry.paths,
        match: new RegExp(`\\b${entry.claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
      }));

      const hits = scanCounts({
        files,
        read,
        allowed,
        skipped: [],
        claim: claimPattern(options.countableNouns, {
          hedge: options.hedge,
          ordinalLead: options.ordinalLead,
          numberPattern: options.numberPattern,
        }),
        dated: options.dated,
      });

      if (hits.length > countRatchet) {
        for (const hit of hits) failures.push(`${hit.file}:${hit.line}  "${hit.claim}"  ${hit.text}`);
      }

      if (options.menu) {
        const menuSource = read(options.menu.source);
        if (menuSource === undefined) {
          failures.push(`${options.menu.source} cannot be read — the menu half of this check compared nothing.`);
        } else {
          failures.push(...duplicateMenuNumbers(menuSource, options.menu.dispatch));

          const labels = menuLabels(menuSource, options.menu.item);
          const ordinals = scanOrdinals({
            files,
            read,
            labels,
            skipped: [],
            reference: options.menu.reference,
          });

          for (const hit of ordinals.filter((h) => h.kind === 'dead')) {
            failures.push(`${hit.file}:${hit.line}  option ${hit.number}  ${hit.text}`);
          }
          if (ordinals.length > (options.menu.ordinalRatchet ?? 0)) {
            for (const hit of ordinals.filter((h) => h.kind !== 'dead')) {
              failures.push(`${hit.file}:${hit.line}  option ${hit.number} = "${hit.label}"  ||  ${hit.text}`);
            }
          }
        }
      }

      return failures.length > 0
        ? {
            ok: false,
            findings: failures.map((message) => ({ severity: 'error', message, ruleId: options.id })),
          }
        : {
            ok: true,
            findings: [{ severity: 'info', message: `✓ ${files.length} document(s), no restated counts` }],
          };
    },
  );
}
