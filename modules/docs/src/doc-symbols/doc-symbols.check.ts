import type { ICheck, ICorpusFloor, IFinding, IModuleCheckDeclaration, TPathspecs } from 'specwarden';
import { CheckOptionsError, buildCheck, checkOptions, thresholdOf, verdictFrom, withExaminedNote } from 'specwarden';
import { DEFAULT_DOCS, DOCS_CORPUS_OPTIONS, corpusOf, refusedCorpus } from '../_shared/corpus/corpus.util';

export interface IDocSymbolsOptions extends IModuleCheckDeclaration {
  /** git pathspec(s) for the code corpus that DEFINES symbols. Never empty. */
  readonly code: TPathspecs;
  /** git pathspec(s) for the documentation corpus scanned for references. Default: `**\/*.md`. */
  readonly docs?: TPathspecs;
  /** Pathspecs left out of BOTH corpora — built output (`**\/dist/**`), so a stale build
   * cannot keep a dead name alive, and snapshot trees whose names are history. */
  readonly except?: readonly string[];
  /** How many files each corpus must hold for a verdict to count. Default: one of each. */
  readonly corpus?: ICorpusFloor;
  /** The structural suffixes a NAME must end in to be a symbol reference rather than
   * prose (Service, Repository, …). A bare suffix used as a word is prose. Never empty. */
  readonly suffixes: readonly string[];
  /** Symbols a framework or library owns — named in docs, never defined here. */
  readonly external?: readonly string[];
  /** Identifiers that are deliberate illustrations (a naming rule's bad example). */
  readonly illustrative?: readonly string[];
  /** How a symbol is written in prose. Replaces `DEFAULT_SYMBOL_REF`; must be global and
   * must capture the name. */
  readonly symbolRef?: RegExp;
  /** How a declaration is written in this repository's language. Replaces
   * `DEFAULT_DECLARATION`; must be global and must capture the name. */
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
export const DEFAULT_SYMBOL_REF = /`([A-Z][A-Za-z0-9]{4,})`/g;
export const DEFAULT_DECLARATION =
  /(?:export\s+)?(?:abstract\s+)?(?:class|const|function|enum|interface|type)\s+(\w+)/g;

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
  checkOptions('docSymbols', options, {
    ...DOCS_CORPUS_OPTIONS,
    code: { kind: ['string', 'array'], required: true, nonEmpty: true },
    suffixes: { kind: 'array', required: true, nonEmpty: true },
    external: { kind: 'array' },
    illustrative: { kind: 'array' },
    symbolRef: { kind: 'regexp' },
    declaration: { kind: 'regexp' },
  });
  // EMPTY IS NOT INERT. The suffix group is an alternation, and an alternation of nothing
  // matches the empty string — so `[]` made every backticked PascalCase name a symbol
  // reference, the widest setting there is, while the templates' comment called it off.
  // `nonEmpty` refuses the list; an empty string inside it widens the match the same way.
  if (options.suffixes.includes('')) {
    throw new CheckOptionsError(
      `docSymbols${options.id ? ` '${options.id}'` : ''}: \`suffixes\` holds an empty string, which matches every ` +
        "backticked PascalCase name, not none. Name the endings that make a word a symbol here, e.g. ['Service', 'Repository'].",
    );
  }
  const docs = options.docs ?? DEFAULT_DOCS;
  const suffixRe = new RegExp(`(?:${options.suffixes.join('|')})$`);
  const bareRe = new RegExp(`^(?:${options.suffixes.join('|')})$`);
  const external = new Set(options.external ?? []);
  const illustrative = new Set(options.illustrative ?? []);
  const declRe = options.declaration ?? DEFAULT_DECLARATION;
  const symbolRefRe = options.symbolRef ?? DEFAULT_SYMBOL_REF;

  const isReference = (id: string): boolean =>
    !bareRe.test(id) && suffixRe.test(id) && !external.has(id) && !illustrative.has(id);

  return buildCheck(
    {
      ...options,
      id: options.id ?? 'doc-symbols',
      rule: options.rule ?? {
        statement: 'a class the documentation names exists in the code',
        owner: '@specwarden/docs',
        implied: true,
      },
      zone: 'product',
    },
    ['read'],
    (ctx, self) => {
      // Either corpus below its floor is a failure. No code means nothing is declared and the
      // answer is compared against nothing; no documents means nothing is read and every
      // symbol "exists" by default.
      const code = corpusOf(ctx.vcs, options.code, options.except);
      const noCode = refusedCorpus(self.id, options.code, code, options.corpus, 'code file');
      if (noCode) return noCode;
      const documents = corpusOf(ctx.vcs, docs, options.except);
      const noDocs = refusedCorpus(self.id, docs, documents, options.corpus);
      if (noDocs) return noDocs;

      const defined = new Set<string>();
      for (const file of code.files) {
        // `d\.ts` before `tsx?` so `foo.d.ts` → `foo`, not `foo.d` (the `tsx?` branch
        // would otherwise match the trailing `.ts` first and leave `.d`).
        const base = (file.split('/').pop() ?? '').replace(/\.(d\.ts|tsx?)$/, '');
        defined.add(base);
        const src = ctx.files.tryRead(file);
        if (src === undefined) continue;
        for (const m of src.matchAll(declRe)) defined.add(m[1]);
      }

      const offenders = new Map<string, { file: string; line: number }>(); // symbol → first place naming it
      for (const file of documents.files) {
        const src = ctx.files.tryRead(file);
        if (src === undefined) continue;
        for (const m of src.matchAll(symbolRefRe)) {
          const id = m[1];
          if (!isReference(id) || defined.has(id) || offenders.has(id)) continue;
          offenders.set(id, { file, line: src.slice(0, m.index ?? 0).split('\n').length });
        }
      }

      const findings: IFinding[] = [...offenders.entries()].map(([id, { file, line }]) => ({
        severity: 'error',
        file,
        line,
        message: `${file} names \`${id}\`, which nothing in the code corpus declares. Rename it to the symbol that replaced it, or name it in \`external\` if a framework owns it.`,
      }));
      return verdictFrom(
        withExaminedNote(findings, self.id, documents.files.length, 'document'),
        thresholdOf(ctx, self),
      );
    },
  );
}
