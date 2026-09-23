import { describe, expect, it } from 'vitest';

import { CheckOptionsError, type ICheck, errorsOf, runCheck } from 'specwarden';
import { docsChecks } from './docs-checks.check';

/** The four facts no preset can know, given once. */
const FACTS = {
  code: ['src/**/*.ts'],
  suffixes: ['Service'],
  countableNouns: ['services'],
  placement: { docs: '**/*_MODULE.md', allowed: [/^src\/[^/]+\/[^/]+_MODULE\.md$/] },
};

const CLEAN = {
  'README.md': 'The entry point is `src/index.ts`; `RealService` is exported.\n\n[m](./src/a/A_MODULE.md)\n',
  'src/index.ts': 'export class RealService {}\n',
  'src/a/A_MODULE.md': '# a\n',
};

const byId = (checks: readonly ICheck[], id: string): ICheck => {
  const found = checks.find((c) => c.id === id);
  if (!found) throw new Error(`no ${id} in ${checks.map((c) => c.id).join(', ')}`);
  return found;
};

describe('docsChecks — the module in one call', () => {
  it('returns the five checks, with their conventional ids, in the fast tier', () => {
    const checks = docsChecks(FACTS);

    expect(checks.map((c) => c.id)).toEqual(['doc-paths', 'doc-symbols', 'doc-counts', 'doc-placement', 'doc-hygiene']);
    expect(new Set(checks.map((c) => c.tier))).toEqual(new Set(['fast']));
  });

  it('is green over a clean tree', async () => {
    for (const check of docsChecks(FACTS)) {
      expect(errorsOf(await runCheck(check, { tree: CLEAN })), check.id).toEqual([]);
    }
  });

  it('says the corpus once, and every check reads it', async () => {
    const checks = docsChecks({ ...FACTS, docs: 'docs/**/*.md', placement: { allowed: [/^docs\//] } });

    for (const check of checks) {
      const v = await runCheck(check, { tree: CLEAN });
      expect(errorsOf(v)[0], check.id).toContain('no document matched `docs/**/*.md`');
    }
  });

  it('skips the same directories in every check that reads prose for claims', async () => {
    const tree = {
      ...CLEAN,
      'docs/_archive/old.md': 'There were 4 services; `GoneService` lived in `src/gone.ts`.\n',
    };
    const checks = docsChecks({ ...FACTS, skipDirs: ['docs/_archive/'] });

    for (const id of ['doc-paths', 'doc-symbols', 'doc-counts']) {
      expect(errorsOf(await runCheck(byId(checks, id), { tree })), id).toEqual([]);
    }
    for (const id of ['doc-paths', 'doc-symbols', 'doc-counts']) {
      expect((await runCheck(byId(docsChecks(FACTS), id), { tree })).ok, id).toBe(false);
    }
  });

  it('lays a check’s own options over the preset’s — an id, a tier, an option of its own', () => {
    const checks = docsChecks({ ...FACTS, paths: { id: 'paths', tier: 'heavy', illustrative: ['a/b.ts'] } });

    expect(byId(checks, 'paths').tier).toBe('heavy');
  });

  it('leaves a check out only when told `false`', () => {
    const checks = docsChecks({ code: ['src/**/*.ts'], suffixes: ['Service'], counts: false, placement: false });

    expect(checks.map((c) => c.id)).toEqual(['doc-paths', 'doc-symbols', 'doc-hygiene']);
  });

  it('takes a fact from the check’s own options as well as from the top level', () => {
    const checks = docsChecks({
      symbols: { code: ['lib/**/*.ts'], suffixes: ['Repository'] },
      counts: { countableNouns: ['gates'] },
      placement: { allowed: [/.*/] },
    });

    expect(checks).toHaveLength(5);
  });

  it('refuses a missing fact by name, saying how to leave the check out instead', () => {
    expect(() => docsChecks({ ...FACTS, suffixes: undefined })).toThrow(CheckOptionsError);
    expect(() => docsChecks({ ...FACTS, suffixes: undefined })).toThrow(
      'docsChecks: pass `suffixes` for `doc-symbols`, or `symbols: false` to leave it out.',
    );
    expect(() => docsChecks({ ...FACTS, code: undefined })).toThrow('pass `code` for `doc-symbols`');
    expect(() => docsChecks({ ...FACTS, countableNouns: undefined })).toThrow(
      'pass `countableNouns` for `doc-counts`, or `counts: false`',
    );
    expect(() => docsChecks({ ...FACTS, placement: undefined })).toThrow(
      'pass `placement: { allowed: [...] }` for `doc-placement`, or `placement: false`',
    );
  });

  it('refuses an option it does not have, and hands a check’s refusal through', () => {
    expect(() => docsChecks({ ...FACTS, suffix: ['Service'] } as never)).toThrow(
      '`suffix` is not an option of docsChecks',
    );
    expect(() => docsChecks({ ...FACTS, countableNouns: [] })).toThrow('`countableNouns` is empty');
    expect(() => docsChecks({ ...FACTS, paths: { skipped: [] } as never })).toThrow(
      '`skipped` is not an option of docPaths',
    );
  });

  it('with nothing said, asks for the first fact it cannot default', () => {
    expect(() => docsChecks()).toThrow('pass `code` for `doc-symbols`');
  });
});
