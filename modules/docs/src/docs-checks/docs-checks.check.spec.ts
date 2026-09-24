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

const IDS = ['doc-paths', 'doc-symbols', 'doc-counts', 'doc-placement', 'doc-hygiene'];

const byId = (checks: readonly ICheck[], id: string): ICheck => {
  const found = checks.find((c) => c.id === id);
  if (!found) throw new Error(`no ${id} in ${checks.map((c) => c.id).join(', ')}`);
  return found;
};

describe('docsChecks — the module in one call', () => {
  it('returns the five checks, each under its own id, in the fast tier, titled by the rule it enforces', () => {
    const checks = docsChecks(FACTS);

    expect(checks.map((c) => c.id)).toEqual(IDS);
    expect(new Set(checks.map((c) => c.tier))).toEqual(new Set(['fast']));
    // The preset wrote a title of its own for each, which said something slightly different
    // from the rule the check carried — two statements of one check.
    for (const check of checks) expect(check.title, check.id).toBe(check.rule?.statement);
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
      expect(errorsOf(v)[0], check.id).toContain('`docs/**/*.md` matched nothing to read');
    }
  });

  it('says the corpus floor once, and every check holds it', async () => {
    const checks = docsChecks({
      ...FACTS,
      docs: 'docs/**/*.md',
      corpus: { atLeast: 0 },
      placement: { allowed: [/.*/] },
    });

    for (const check of checks.filter((c) => c.id !== 'doc-symbols')) {
      expect((await runCheck(check, { tree: CLEAN })).ok, check.id).toBe(true);
    }
  });

  it('leaves out what `except` names, in every check', async () => {
    const tree = {
      ...CLEAN,
      'docs/_archive/old.md':
        'There were 4 services; `GoneService` lived in `src/gone.ts`, see [x](./gone.md).\n' +
        `| ${'x'.repeat(400)} |\n`,
    };
    const checks = docsChecks({ ...FACTS, except: ['docs/_archive'], placement: { allowed: [/^README/, /^src\//] } });

    for (const check of checks) expect(errorsOf(await runCheck(check, { tree })), check.id).toEqual([]);
    const unexempt = docsChecks({ ...FACTS, placement: { allowed: [/^README/, /^src\//] } });
    for (const check of unexempt) expect((await runCheck(check, { tree })).ok, check.id).toBe(false);
  });

  // `tier` and `when` were accepted and dropped: every check was built in `fast` and ran on
  // every change, whatever the preset was told.
  it('applies `tier` and `when` to every check it builds, and a check’s own wins', () => {
    const when = { under: ['docs/'] };
    const checks = docsChecks({ ...FACTS, tier: 'heavy', when, paths: { tier: 'nightly' } });

    expect(checks.map((c) => c.tier)).toEqual(['nightly', 'heavy', 'heavy', 'heavy', 'heavy']);
    for (const check of checks) {
      expect(check.when(['docs/a.md']), check.id).toBe(true);
      expect(check.when(['src/a.ts']), check.id).toBe(false);
    }
  });

  it('refuses the identity of ONE check — five cannot share an id, a title, a rule or a ratchet', () => {
    for (const option of ['id', 'title', 'rule', 'ratchet']) {
      expect(() => docsChecks({ ...FACTS, [option]: 'x' } as never), option).toThrow(
        `\`${option}\` is not an option of docsChecks — a preset builds five checks, and ${option} belongs to one of them`,
      );
    }
  });

  it('lays a check’s own options over the preset’s — an id, a ratchet, an option of its own', async () => {
    const checks = docsChecks({ ...FACTS, paths: { id: 'paths', ratchet: 1, illustrative: ['a/b.ts'] } });
    const tree = { ...CLEAN, 'README.md': `${CLEAN['README.md']}\nSee \`src/gone.ts\`.\n` };

    expect((await runCheck(byId(checks, 'paths'), { tree })).ok).toBe(true);
  });

  it('leaves a check out only when told `false`', () => {
    const checks = docsChecks({ code: ['src/**/*.ts'], suffixes: ['Service'], counts: false, placement: false });

    expect(checks.map((c) => c.id)).toEqual(['doc-paths', 'doc-symbols', 'doc-hygiene']);
    expect(docsChecks({ ...FACTS, symbols: false, hygiene: false }).map((c) => c.id)).toEqual([
      'doc-paths',
      'doc-counts',
      'doc-placement',
    ]);
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

  it('refuses an option it does not have, the retired `skipDirs` among them, and hands a check’s refusal through', () => {
    expect(() => docsChecks({ ...FACTS, suffix: ['Service'] } as never)).toThrow(
      '`suffix` is not an option of docsChecks',
    );
    expect(() => docsChecks({ ...FACTS, skipDirs: ['docs/'] } as never)).toThrow(
      '`skipDirs` is not an option of docsChecks',
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
