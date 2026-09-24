import type { ICheck, ICorpusFloor, IFinding, IModuleCheckDeclaration, TPathspecs } from 'specwarden';
import { buildCheck, checkOptions, lineOf, testStateless, thresholdOf } from 'specwarden';
import { DEFAULT_DOCS, DOCS_CORPUS_OPTIONS, corpusOf, debtVerdict, refusedCorpus } from '../_shared/corpus/corpus.util';

export interface IDocPlacementOptions extends IModuleCheckDeclaration {
  /** git pathspec(s) for the markdown corpus. Default: `**\/*.md`. */
  readonly docs?: TPathspecs;
  /** Pathspecs of documents left out of the corpus. */
  readonly except?: readonly string[];
  /** How many documents a run must read for its verdict to count. Default: one. */
  readonly corpus?: ICorpusFloor;
  /** The placement contract: a document must match ONE of these. Regexes, because
   * the contract's shapes (alternations, anchored names) exceed what a glob says. */
  readonly allowed: readonly RegExp[];
  /** Optional inbound-link ban: nothing outside `dir` may link to a file under it
   * (a plan is deleted when its work ends, so every inbound pointer is a delayed
   * dangling one). `pattern` is global with capture group 1 = the linked name;
   * `allow` names the one file that is safe to point at (the folder's own README). */
  readonly link?: { readonly pattern: RegExp; readonly dir: string; readonly allow?: string };
}

/**
 * A markdown file sits where the placement contract describes, and nothing links
 * into the deletable-plan folder from outside it. A location the contract does not
 * describe is not wrong — it is UNDECIDED, which is where a partial second copy is
 * born; either the contract gains a row or the file moves.
 *
 * THE RATCHET counts misplaced documents only. An inbound link always fails: it is one
 * edit to remove, and a repository armed at its count of them would keep a pointer that
 * starts dangling the day the plan is deleted.
 *
 * A PRODUCT check: matching a path against a contract, and banning an inbound link
 * into a folder, are universal; the contract's shapes and the folder are facts
 * about one repository and arrive as options.
 */
export function docPlacement(options: IDocPlacementOptions): ICheck {
  checkOptions('docPlacement', options, {
    ...DOCS_CORPUS_OPTIONS,
    allowed: { kind: 'array', required: true },
    link: { kind: 'object' },
  });
  const docs = options.docs ?? DEFAULT_DOCS;
  return buildCheck(
    {
      ...options,
      id: options.id ?? 'doc-placement',
      rule: options.rule ?? {
        statement: 'a document sits where the placement contract says, and nothing outside links into the plans',
        owner: '@specwarden/docs',
        implied: true,
      },
      zone: 'product',
    },
    ['read'],
    (ctx, self) => {
      const corpus = corpusOf(ctx.vcs, docs, options.except);
      // Too few documents is a failure: a pathspec that stopped matching would otherwise
      // report every document correctly placed, over a corpus of none.
      const short = refusedCorpus(self.id, docs, corpus, options.corpus);
      if (short) return short;

      const placement: IFinding[] = corpus.files
        .filter((f) => !options.allowed.some((re) => testStateless(re, f)))
        .map((file) => ({
          severity: 'error',
          file,
          message: `${file} sits where the placement contract does not describe. Move it, or add the row that describes its kind to \`allowed\`.`,
        }));

      const links: IFinding[] = [];
      if (options.link) {
        const { pattern, dir, allow } = options.link;
        const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
        for (const file of corpus.files) {
          if (file.startsWith(dir)) continue;
          const body = ctx.files.tryRead(file);
          if (body === undefined) continue;
          for (const m of body.matchAll(re)) {
            if (m[1] !== allow)
              links.push({
                severity: 'error',
                file,
                line: lineOf(body, m.index ?? 0),
                message: `${file} links into ${dir} (\`${m[1]}\`) from outside it — a plan is deleted when its work ends, so nothing may point at one. Cite the document that owns the durable fact instead.`,
              });
          }
        }
      }

      return debtVerdict({ hard: links, soft: placement }, thresholdOf(ctx, self), {
        id: self.id,
        examined: corpus.files.length,
        unit: 'document',
      });
    },
  );
}
