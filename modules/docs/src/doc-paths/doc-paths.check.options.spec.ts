import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { docPaths } from './doc-paths.check';

/**
 * The options, checked where they are written. The one that mattered: the shipped skill
 * wrote `skipped:` for `skipDirs`, the option was dropped in silence, and the archive it
 * meant to skip was read — a red run over documents the author believed were excluded.
 */
describe('docPaths — its options', () => {
  it('refuses an option it does not have, by name, when the file loads', () => {
    const misspelled = { id: 'doc-paths', title: 't', skipped: [/^docs\//] } as never;

    expect(() => docPaths(misspelled)).toThrow(CheckOptionsError);
    expect(() => docPaths(misspelled)).toThrow("docPaths 'doc-paths': `skipped` is not an option of docPaths");
  });

  it('refuses the wrong kind — a single string where a list of directories belongs', () => {
    expect(() => docPaths({ id: 'doc-paths', title: 't', skipDirs: 'docs/' } as never)).toThrow(
      '`skipDirs` must be an array',
    );
  });

  it('reads every tracked document, and runs in the fast tier, when neither is said', async () => {
    const check = docPaths({ id: 'doc-paths', title: 't' });

    expect(check.tier).toBe('fast');
    expect(errorsOf(await runCheck(check, { tree: { 'README.md': 'see `src/gone.ts`' } }))).toEqual([
      'README.md names `src/gone.ts`, which does not resolve. Often the file gained its own folder and the path did not follow.',
    ]);
  });

  it('runs whatever the changed set is, when it declares no `when`', () => {
    expect(docPaths({ id: 'doc-paths', title: 't' }).when(['anything.txt'])).toBe(true);
  });
});
