import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { docPaths } from './doc-paths.check';

/**
 * The options, checked where they are written. The one that mattered: the shipped skill
 * wrote `skipped:` for the exemption, the option was dropped in silence, and the archive it
 * meant to leave out was read — a red run over documents the author believed were excluded.
 */
describe('docPaths — its options', () => {
  it('refuses an option it does not have, by name, when the file loads — the retired spellings too', () => {
    for (const retired of ['skipped', 'skipDirs']) {
      const misspelled = { id: 'doc-paths', [retired]: ['docs/'] } as never;

      expect(() => docPaths(misspelled)).toThrow(CheckOptionsError);
      expect(() => docPaths(misspelled)).toThrow(`docPaths 'doc-paths': \`${retired}\` is not an option of docPaths`);
    }
  });

  it('refuses the wrong kind — a single string where a list of pathspecs belongs', () => {
    expect(() => docPaths({ except: 'docs/' } as never)).toThrow('`except` must be an array');
  });

  it('refuses an empty `docs` — a corpus of no pathspec reads nothing', () => {
    expect(() => docPaths({ docs: [] })).toThrow('`docs` is empty');
  });

  it('refuses `zone`: a module’s check speaks for its package', () => {
    expect(() => docPaths({ zone: 'consumer' } as never)).toThrow('`zone` is not an option of docPaths');
  });

  it('with nothing said: id `doc-paths`, the fast tier, its rule as its title, every tracked document', async () => {
    const check = docPaths();

    expect(check).toMatchObject({ id: 'doc-paths', tier: 'fast', title: 'a path the documentation names exists' });
    expect(errorsOf(await runCheck(check, { tree: { 'README.md': 'see `src/gone.ts`' } }))).toEqual([
      'README.md names `src/gone.ts`, which does not resolve. Point it at where the file is now — often it gained its own folder and the path did not follow.',
    ]);
  });

  it('runs whatever the changed set is, when it declares no `when`', () => {
    expect(docPaths().when(['anything.txt'])).toBe(true);
  });

  it('attributes its findings to the id it was given', async () => {
    const verdict = await runCheck(docPaths({ id: 'links' }), { tree: { 'a.md': '`src/gone.ts`' } });

    expect(verdict.findings[0].ruleId).toBe('links');
  });
});
