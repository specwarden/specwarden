import type { ICheck, ICheckContext, ICheckDeclaration, IFinding } from '../../domain';
import {
  CheckOptionsError,
  type ICorpusFloor,
  type TPathspecs,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  emptyCorpusReason,
  lineOf,
  thresholdOf,
  trackedCorpus,
  verdictFrom,
  withExaminedNote,
} from '../_shared';

export interface IReferencesResolveOptions extends ICheckDeclaration {
  /** The TRACKED files whose references are checked: a pathspec, or several whose matches are joined. */
  readonly files: TPathspecs;
  /** Pathspecs among `files` that are exempt. */
  readonly except?: readonly string[];
  /** How many files `files` must match for a verdict to count. Defaults to one: no file
   * means no reference, which resolved trivially and passed in silence. */
  readonly corpus?: ICorpusFloor;
  /** A RegExp whose first capture group is the reference to resolve. */
  readonly extract: RegExp;
  /** Whether a reference resolves. Default: it names a file that exists. */
  readonly resolve?: (ref: string, ctx: ICheckContext) => boolean;
}

/** How many capture groups a RegExp has — the empty alternative always matches. */
const groupsOf = (re: RegExp): number =>
  (new RegExp(`${re.source}|`, re.flags.replace(/[gy]/g, '')).exec('') ?? ['']).length - 1;

/**
 * References of a shape inside a set of files must resolve — `doc-paths`,
 * `doc-symbols`. A reference wrong a quarter of the time is worse than none: the
 * reader follows the dead one, finds nothing, and invents.
 */
export function referencesResolve(options: IReferencesResolveOptions): ICheck {
  checkOptions('referencesResolve', options, {
    files: { kind: ['string', 'array'], required: true, nonEmpty: true },
    except: { kind: 'array' },
    extract: { kind: 'regexp', required: true },
    resolve: { kind: 'function' },
    corpus: { kind: 'object' },
  });
  if (groupsOf(options.extract) < 1) {
    throw new CheckOptionsError(
      `referencesResolve${options.id ? ` '${options.id}'` : ''}: \`extract\` ${String(options.extract)} has no capture ` +
        'group — the first group is the reference to resolve, and with none there is nothing to look up.',
    );
  }
  const re = new RegExp(
    options.extract.source,
    options.extract.flags.includes('g') ? options.extract.flags : `${options.extract.flags}g`,
  );
  const resolves = options.resolve ?? ((ref, ctx) => ctx.files.exists(ref));
  return buildCheck(options, ['read'], (ctx, self) => {
    const corpus = trackedCorpus(ctx.vcs, options.files, options.except);
    const short = belowCorpusFloor(
      self.id,
      corpus.files.length,
      options.corpus,
      emptyCorpusReason(options.files, corpus, 'read'),
    );
    if (short) return short;

    const findings: IFinding[] = [];
    let examined = 0;
    for (const file of corpus.files) {
      const content = ctx.files.tryRead(file);
      if (content === undefined) continue;
      examined++;
      for (const m of content.matchAll(re)) {
        const ref = m[1];
        // An optional group that did not take part names nothing to resolve.
        if (ref !== undefined && !resolves(ref, ctx)) {
          findings.push({
            severity: 'error',
            file,
            line: lineOf(content, m.index ?? 0),
            message: `${file} references \`${ref}\`, which does not resolve.`,
          });
        }
      }
    }
    return verdictFrom(withExaminedNote(findings, self.id, examined), thresholdOf(ctx, self));
  });
}
