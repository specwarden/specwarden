/**
 * The repository these checks run against.
 *
 * TWO trees, because a check that returns the same verdict for both is a check that
 * cannot fail — and one that cannot fail reports success. `CLEAN` is what a repository
 * following every rule in this package looks like; `BROKEN` violates each rule exactly
 * once, so a failure names which rule rather than "something is wrong".
 */

/** A repository that follows every rule this package enforces. */
export const CLEAN: Record<string, string> = {
  'README.md': [
    '# clean',
    '',
    'The entry point is `src/index.ts`, and `ServiceRegistry` is what it exports.',
    '',
    'See [the module document](./src/THINGS_MODULE.md).',
  ].join('\n'),
  'src/index.ts': 'export class ServiceRegistry {}\n',
  'src/THINGS_MODULE.md': '# things\n\nThe invariants of this module.\n',
};

/**
 * The same repository with one violation per rule.
 *
 * Each line is the exact shape its check looks for, which is why they are commented: a
 * fixture nobody can read is a fixture nobody can repair when the check changes.
 */
export const BROKEN: Record<string, string> = {
  'README.md': [
    '# broken',
    '',
    // doc-paths: a backticked `dir/file.ext` that resolves to nothing.
    'The entry point is `src/gone.ts`.',
    '',
    // doc-symbols: a backticked identifier with a declaring suffix no source declares.
    'It exports `VanishedRegistry`.',
    '',
    // doc-counts: an inventory the repository owns, restated in prose. A NUMERAL — the
    // check reads digits, because "four" in prose is as often a quantity as a count.
    'There are 4 services.',
    '',
    // doc-hygiene: a RELATIVE link resolving to nothing. An absolute-looking path is not
    // a link this check reads — it only follows `./` and `../`.
    'See [the module document](./docs/nowhere.md).',
  ].join('\n'),
  'src/index.ts': 'export class ServiceRegistry {}\n',
  // doc-placement: a module document at the root, where the contract does not allow it.
  'THINGS_MODULE.md': '# things\n\nAt the root, where the contract does not put it.\n',
};

/** The factories this playground claims to exercise — the five checks and the preset. */
export const COVERED = ['docPaths', 'docSymbols', 'docCounts', 'docPlacement', 'docHygiene', 'docsChecks'];

/**
 * What every export is probed with to tell a factory from a helper: nothing. A factory
 * builds a check from it or refuses it by name; a helper — `claimPattern`, `scanCounts` —
 * fails some other way, which is the answer "not a factory".
 */
export const PROBE = {};
