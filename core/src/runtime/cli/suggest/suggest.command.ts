import type { IFileSource, IVcs } from '../../../domain';
import { CONFIG_DIR } from '../_shared/find-config/find-config.util';
import { type ISiblingInference, inferSibling } from './infer-sibling/infer-sibling.util';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/** Only a habit this consistent is worth proposing as a rule; below it, a match is
 * probably a coincidence, and proposing it teaches distrust of the tool. */
const CONSISTENCY_THRESHOLD = 0.9;

/** A habit this consistent is not proposed, and is NAMED — the reader may know the
 * exceptions are the defects. Below it, nothing is said: that is not a habit. */
const NEAR_MISS = 0.7;

/** Fewer subjects than this are an anecdote, not a convention. */
const MINIMUM_SUBJECTS = 3;

interface ICandidate {
  readonly id: string;
  readonly when: string;
  readonly require: string;
  readonly except?: readonly string[];
}

/** A source folder's test habit — each file beside its test — in each spelling. */
const SOURCE_CANDIDATES: readonly ICandidate[] = ['ts', 'tsx', 'js', 'mjs'].flatMap((ext) =>
  ['test', 'spec'].map((style) => ({
    id: `${ext}-has-${style}`,
    when: `src/**/*.${ext}`,
    require: `{name}.${style}.${ext}`,
    except: [`**/*.test.${ext}`, `**/*.spec.${ext}`, `**/index.${ext}`, ...(ext === 'ts' ? ['**/*.d.ts'] : [])],
  })),
);

/** The habits worth checking for. Kept small and universal; a plugin adds its own. */
const CANDIDATES: readonly ICandidate[] = [
  { id: 'service-has-spec', when: '**/*.service.ts', require: '{name}.spec.ts' },
  { id: 'controller-has-spec', when: '**/*.controller.ts', require: '{name}.spec.ts' },
  ...SOURCE_CANDIDATES,
];

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * The whole check file, as it would be saved — imports, rule, ratchet — so pasting it is
 * the entire adoption. A call to paste INTO something is a second step somebody has to
 * know, and the file it named (the config) is not where a check lives.
 */
function checkFile(i: ISiblingInference): string {
  return [
    "import { siblingRequired } from 'specwarden';",
    '',
    'export const check = siblingRequired({',
    `  files: ${q(i.when)},`,
    `  require: ${q(i.require)},`,
    ...(i.except.length ? [`  except: [${i.except.map(q).join(', ')}],`] : []),
    // The exceptions that exist today are tolerated, and the count only turns down.
    `  ratchet: ${i.exceptions.length},`,
    `  rule: ${q(`Every ${i.when} has its ${i.require} beside it.`)},`,
    '});',
  ].join('\n');
}

const measured = (i: ISiblingInference): string =>
  `${Math.round(i.ratio * 100)}% of ${i.when} have ${i.require} (${i.satisfied} of ${i.total})`;

const listed = (exceptions: readonly string[]): string => {
  const shown = exceptions.slice(0, 5);
  return `${shown.join(', ')}${exceptions.length > shown.length ? ', …' : ''}`;
};

/**
 * `specwarden suggest` — the real answer to "authoring a rule is too big an ask".
 * It infers candidate rules from what the repository already does consistently, so
 * a person CONFIRMS a convention rather than composing one. Three guards against
 * mistaking a coincidence for a convention: a high threshold, exceptions ALWAYS
 * shown, and nothing enabled on its own.
 *
 * It measures the TRACKED files, as the check it proposes will. And it says what it
 * nearly proposed: a habit at 85% was "nothing to suggest", the same words as a
 * repository with no habit at all.
 */
export function suggest(files: IFileSource, io: ICliIo, vcs?: IVcs): number {
  const list = vcs ? (pathspec: string) => vcs.trackedFiles(pathspec) : undefined;
  const measuredAll = CANDIDATES.map((candidate) => ({
    candidate,
    inference: inferSibling(files, candidate.when, candidate.require, { except: candidate.except, list }),
  })).filter(({ inference }) => inference.total >= MINIMUM_SUBJECTS && inference.satisfied > 0);

  // One spelling per folder habit: `a.test.ts` and `a.spec.ts` for the same files are two
  // readings of one habit, and the one the repository follows more is the one it has.
  const best = measuredAll.filter(
    ({ candidate, inference }) =>
      !measuredAll.some(
        (other) =>
          other.candidate !== candidate &&
          other.candidate.when === candidate.when &&
          other.inference.satisfied > inference.satisfied,
      ),
  );
  const proposed = best.filter(({ inference }) => inference.ratio >= CONSISTENCY_THRESHOLD);
  // A narrower habit a broader proposal already holds is the same rule twice: services
  // under `src/` beside their specs are inside "every src file beside its spec".
  const proposals = proposed.filter(
    ({ candidate, inference }) =>
      !proposed.some(
        (other) =>
          other.candidate !== candidate &&
          other.inference.require === inference.require &&
          inference.subjects.every((file) => other.inference.subjects.includes(file)) &&
          // Over the SAME files, the narrower name says more — `service-has-spec` — so the
          // folder-wide spelling yields.
          (other.inference.total > inference.total || SOURCE_CANDIDATES.includes(candidate)),
      ),
  );
  const nearMisses = best.filter(
    ({ inference }) => inference.ratio >= NEAR_MISS && inference.ratio < CONSISTENCY_THRESHOLD,
  );

  for (const { candidate, inference } of proposals) {
    io.out(`${measured(inference)}.\n`);
    // The summary is the rule the saved file states — `except` included, or the one line
    // copied instead of the file flags the tests themselves.
    const except = inference.except.length ? `, except: [${inference.except.map(q).join(', ')}]` : '';
    io.out(
      `  → siblingRequired({ files: '${inference.when}', require: '${inference.require}'${except} }), ratchet ${inference.exceptions.length}.\n`,
    );
    if (inference.exceptions.length > 0) io.out(`  exceptions: ${listed(inference.exceptions)}\n`);
    io.out(`  Save as ${CONFIG_DIR}/checks/tests/${candidate.id}.check.mjs:\n\n`);
    io.out(`${checkFile(inference)}\n\n`);
  }

  if (proposals.length === 0) {
    io.out('No convention crossed the consistency threshold — nothing to suggest.\n');
  }
  if (nearMisses.length > 0) {
    io.out(
      `${proposals.length ? '' : '\n'}Near misses — followed, but below the ${CONSISTENCY_THRESHOLD * 100}% a suggestion needs:\n`,
    );
    for (const { inference } of nearMisses) {
      io.out(`  ${measured(inference)}; missing: ${listed(inference.exceptions)}\n`);
    }
    io.out('  If the missing ones are the defects, write the siblings and ask again.\n');
  }
  io.out(
    proposals.length
      ? 'Nothing was enabled. Save a suggestion as the file it names, and the next run holds it.\n'
      : 'Nothing was enabled.\n',
  );
  return 0;
}
