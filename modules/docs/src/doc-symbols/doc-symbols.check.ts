import type { ICheck, ICheckIdentity, IFinding } from 'specwarden';
import { buildCheck, verdictFrom } from 'specwarden';

export interface IDocSymbolsOptions extends ICheckIdentity {
  /** git pathspec(s) for the code corpus that DEFINES symbols. */
  readonly code: readonly string[];
  /** git pathspec for the documentation corpus scanned for references. */
  readonly docs: string;
  /** Substrings; a code path containing any is excluded (built output, e.g. dist). */
  readonly excludeCode?: readonly string[];
  /** Directory prefixes whose documents are skipped (snapshots, plans, archive). */
  readonly skipDirs?: readonly string[];
  /** The structural suffixes a NAME must end in to be a symbol reference rather than
   * prose (Service, Repository, …). A bare suffix used as a word is prose. */
  readonly suffixes: readonly string[];
  /** Symbols a framework or library owns — named in docs, never defined here. */
  readonly external?: readonly string[];
  /** Identifiers that are deliberate illustrations (a naming rule's bad example). */
  readonly illustrative?: readonly string[];
  readonly ratchet?: number;
  /** How a symbol is written in prose. Replaces `DEFAULT_SYMBOL_REF_RE`; must be
   * global and must capture the name. */
  readonly symbolRef?: RegExp;
  /** How a declaration is written in this repository's language. Replaces
   * `DEFAULT_DECL_RE`; must be global and must capture the name. */
  readonly declaration?: RegExp;
}

/**
 * What a symbol looks like in prose, and what a declaration looks like in code.
 *
 * The second is TYPESCRIPT — `class|const|function|enum|interface|type`. Pointed at a
 * Python or Go repository it matches almost nothing, so every documented symbol reads
 * as undeclared; arm the ratchet to quieten that and the check now passes while
 * checking nothing, which is the failure this package exists to prevent. The first is
 * a naming CONVENTION: five-plus characters, initial capital.
 *
 * Both are defaults. Both are options.
 */
export const DEFAULT_SYMBOL_REF_RE = /`([A-Z][A-Za-z0-9]{4,})`/g;
export const DEFAULT_DECL_RE = /(?:export\s+)?(?:abstract\s+)?(?:class|const|function|enum|interface|type)\s+(\w+)/g;

/**
 * Documentation names a class that no longer exists. Docs decay through NAMES
 * before rules — a renamed class leaves the old name in prose, and an agent greps
 * the dead name, finds nothing, and invents the rest while the invariants it read
 * were right. Every backticked PascalCase identifier ending in a structural suffix
 * must be defined somewhere in the code, or be a known framework symbol.
 *
 * A PRODUCT check: the scan and the ratchet on distinct stale names are universal;
 * the suffix vocabulary, the framework allowlist and the illustrative set are facts
 * about one codebase and arrive as options.
 */
export function docSymbols(options: IDocSymbolsOptions): ICheck {
  const suffixRe = new RegExp(`(?:${options.suffixes.join('|')})$`);
  const bareRe = new RegExp(`^(?:${options.suffixes.join('|')})$`);
  const external = new Set(options.external ?? []);
  const illustrative = new Set(options.illustrative ?? []);
  const excludeCode = options.excludeCode ?? [];
  const skipDirs = options.skipDirs ?? [];
  const codeSpecs = options.code;
  const declRe = options.declaration ?? DEFAULT_DECL_RE;
  const symbolRefRe = options.symbolRef ?? DEFAULT_SYMBOL_REF_RE;

  const isReference = (id: string): boolean =>
    !bareRe.test(id) && suffixRe.test(id) && !external.has(id) && !illustrative.has(id);

  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx) => {
    const defined = new Set<string>();
    const codeFiles = codeSpecs
      .flatMap((s) => ctx.vcs.trackedFiles(s))
      .filter((f) => !excludeCode.some((e) => f.includes(e)));
    for (const file of codeFiles) {
      // `d\.ts` before `tsx?` so `foo.d.ts` → `foo`, not `foo.d` (the `tsx?` branch
      // would otherwise match the trailing `.ts` first and leave `.d`).
      const base = (file.split('/').pop() ?? '').replace(/\.(d\.ts|tsx?)$/, '');
      defined.add(base);
      const src = ctx.files.tryRead(file);
      if (src === undefined) continue;
      for (const m of src.matchAll(declRe)) defined.add(m[1]);
    }

    const offenders = new Map<string, string>(); // symbol → first file naming it
    for (const file of ctx.vcs.trackedFiles(options.docs)) {
      if (skipDirs.some((d) => file.startsWith(d))) continue;
      const src = ctx.files.tryRead(file);
      if (src === undefined) continue;
      for (const m of src.matchAll(symbolRefRe)) {
        const id = m[1];
        if (!isReference(id) || defined.has(id) || offenders.has(id)) continue;
        offenders.set(id, file);
      }
    }

    const findings: IFinding[] = [...offenders.entries()].map(([id, file]) => ({
      severity: 'error',
      file,
      message: `${file} names \`${id}\`, which no .ts defines. A renamed class leaves the old name in prose; fix the doc, or add the symbol to the framework allowlist.`,
      ruleId: options.id,
    }));
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
