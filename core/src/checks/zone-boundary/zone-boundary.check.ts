import type { ICheck, ICheckDeclaration, IFinding } from '../../domain';
import {
  type ICorpusFloor,
  IMPORT_RE,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  emptyCorpusReason,
  lineOf,
  matchesSpecifier,
  thresholdOf,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../../primitives/_shared';

/** A consumer-repository token a product-zone source may never contain, with a human
 * label. WHICH tokens are the consumer's is a fact about the consumer, so the set is
 * supplied by the consumer — never baked into the engine. */
export interface IForbiddenLiteral {
  readonly label: string;
  readonly pattern: RegExp;
}

export interface IZoneBoundaryOptions extends ICheckDeclaration {
  /** Glob of the product-zone sources to sweep. */
  readonly productSources: string;
  /** Globs exempt from the sweep — a product's own tests legitimately name the
   * literals they test against, exactly as this engine's zone.spec does. */
  readonly except?: readonly string[];
  /** The consumer-repository literals a product source may never contain. */
  readonly forbiddenLiterals: readonly IForbiddenLiteral[];
  /** An import specifier that reaches into the consumer zone — P must never import
   * C. A string prefix or a RegExp tested against the specifier. Optional: some
   * layouts express the barrier by literals alone. */
  readonly consumerImport?: string | RegExp;
  /** How many product sources the sweep must cover for its verdict to count. Defaults
   * to one: a barrier sweeping no source is not a barrier, and it passed in silence. */
  readonly corpus?: ICorpusFloor;
}

/** The first match of `pattern` in `content` as a global search, or `undefined`.
 * The literal matchers carry `m`/`i` flags and are not necessarily global; cloning
 * with `g` lets `exec` report an index for the line number. */
function firstMatch(content: string, pattern: RegExp): RegExpExecArray | null {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  return re.exec(content);
}

/**
 * The zone barrier made runnable — the P→C boundary the whole product rests on,
 * enforced over a file source rather than only in the package's own test. A
 * product source may not name a consumer-repository literal (so the engine survives
 * "rename the project") and may not import into the consumer zone (the dependency
 * is one-way — C reaches into P, never the reverse).
 *
 * This is itself a PRODUCT check: the MECHANISM (sweep a tree for a forbidden set)
 * is universal, and the repository facts — which tree is the product, which tokens
 * are the consumer's — arrive as options, which is where consumer knowledge belongs.
 */
export function zoneBoundary(options: IZoneBoundaryOptions): ICheck {
  checkOptions('zoneBoundary', options, {
    productSources: { kind: 'string', required: true },
    forbiddenLiterals: { kind: 'array', required: true },
    except: { kind: 'array' },
    consumerImport: { kind: ['string', 'regexp'] },
    corpus: { kind: 'object' },
  });
  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx, self) => {
    const corpus = trackedCorpus(ctx.vcs, options.productSources, options.except);
    const files = corpus.files;
    const short = belowCorpusFloor(
      self.id,
      files.length,
      options.corpus,
      emptyCorpusReason(options.productSources, corpus, 'sweep').replace(
        'matched nothing to sweep',
        'matched no product source to sweep',
      ),
    );
    if (short) return short;

    const findings: IFinding[] = [];
    let examined = 0;
    for (const file of files) {
      const content = ctx.files.tryRead(file);
      if (content === undefined) continue;
      examined++;

      if (options.consumerImport !== undefined) {
        for (const m of content.matchAll(IMPORT_RE)) {
          if (matchesSpecifier(m[1], options.consumerImport)) {
            findings.push({
              severity: 'error',
              file,
              line: lineOf(content, m.index ?? 0),
              message: `${file} imports \`${m[1]}\`, reaching into the consumer zone — the dependency is one-way, P never imports C.`,
            });
          }
        }
      }

      for (const literal of options.forbiddenLiterals) {
        const hit = firstMatch(content, literal.pattern);
        if (hit) {
          findings.push({
            severity: 'error',
            file,
            line: lineOf(content, hit.index),
            message: `${file} names the consumer literal ${literal.label} — a product-zone source must survive renaming the project. Move the repository fact into .specwarden/ config.`,
          });
        }
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, examined), thresholdOf(ctx, self));
  });
}
