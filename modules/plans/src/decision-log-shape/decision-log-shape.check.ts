import type { ICheck, ICorpusFloor, IFinding, IModuleCheckDeclaration, TPathspecs } from 'specwarden';
import {
  buildCheck,
  checkOptions,
  parseDecisionLog,
  rejectionsWithoutReason,
  thresholdOf,
  verdictFrom,
  withExaminedNote,
} from 'specwarden';
import { DEFAULT_PLANS_DIR, PLANS_SHARED_OPTIONS, corpusOf, refusedCorpus } from '../_shared/corpus/corpus.util';

export interface IDecisionLogShapeOptions extends IModuleCheckDeclaration {
  /** git pathspec(s) of the documents that may carry a decision log. Default: the plans in
   * `docs/_plans`, `docs/_plans/*.md`. */
  readonly docs?: TPathspecs;
  /** Pathspecs of documents left unread. */
  readonly except?: readonly string[];
  /** How many documents a run must read for its verdict to count. Default: one. */
  readonly corpus?: ICorpusFloor;
}

/**
 * A decision log states, for each decision, the alternatives it rejected AND why.
 * The one shape rule: a rejection carries a reason — a reason is an assertion, not
 * an apology, and a rejected alternative with its reason is exactly the fact that
 * lives only in the plan and is lost if archived without harvest.
 *
 * A PRODUCT check: the decision-log grammar is the product's; the corpus is an
 * option.
 */
export function decisionLogShape(options: IDecisionLogShapeOptions = {}): ICheck {
  checkOptions('decisionLogShape', options, {
    ...PLANS_SHARED_OPTIONS,
    docs: { kind: ['string', 'array'], nonEmpty: true },
  });
  const docs = options.docs ?? `${DEFAULT_PLANS_DIR}/*.md`;

  return buildCheck(
    {
      ...options,
      id: options.id ?? 'decision-log-shape',
      rule: options.rule ?? {
        statement: 'a decision names the alternatives it rejected, each with its reason',
        owner: '@specwarden/plans',
        implied: true,
      },
      zone: 'product',
    },
    ['read'],
    (ctx, self) => {
      const corpus = corpusOf(ctx.vcs, docs, options.except);
      // Too few documents is a failure, not a clean run: a `docs` pathspec left pointing at a
      // folder that moved would otherwise report every rejection reasoned, over none.
      const short = refusedCorpus(self.id, docs, corpus, options.corpus);
      if (short) return short;

      const findings: IFinding[] = [];
      for (const file of corpus.files) {
        const src = ctx.files.tryRead(file);
        if (src === undefined) continue;
        for (const r of rejectionsWithoutReason(parseDecisionLog(src))) {
          findings.push({
            severity: 'error',
            file,
            line: r.line,
            message: `${file}:${r.line} — decision "${r.statement}" rejects "${r.alternative}" with no reason. State why: a rejection without a reason is the fact that gets lost.`,
          });
        }
      }
      return verdictFrom(withExaminedNote(findings, self.id, corpus.files.length, 'document'), thresholdOf(ctx, self));
    },
  );
}
