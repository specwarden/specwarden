import { describe, expect, it } from 'vitest';

import { errorsOf, runCheck } from '../../testing';
import { forbidPattern, type IForbidPatternOptions } from './forbid-pattern.primitive';

/**
 * A pattern must not occur. Both halves are pinned: a scan that stops seeing a match is
 * a green gate over a leak, and a scan that cannot be told about a lookalike is one a
 * team turns off — taking every true positive with it. The token is synthetic on
 * purpose; a real credential shape here would trip the repository's own scanner.
 */
const ID = { id: 'no-banned', title: 'no banned tokens', tier: 'fast' as const };
const check = (over: Partial<IForbidPatternOptions> = {}) =>
  forbidPattern({ ...ID, in: 'src/**/*.ts', pattern: /BANNED-[0-9]{4}/, ...over });

describe('forbidPattern — the refusing verdict', () => {
  it('fails on a match and says where: file, line, rule', async () => {
    const verdict = await runCheck(check(), { tree: { 'src/a.ts': 'const ok = 1;\n\nconst k = "BANNED-1234";\n' } });

    expect(verdict.ok).toBe(false);
    expect(verdict.findings).toEqual([
      {
        severity: 'error',
        file: 'src/a.ts',
        line: 3,
        message: 'forbidden pattern in src/a.ts: BANNED-1234',
        ruleId: 'no-banned',
      },
    ]);
  });

  /**
   * A non-global pattern would stop at the first hit. One finding for three leaks
   * reads as "fix this line", and the other two ship.
   */
  it('reports EVERY occurrence, each on its own line, from a pattern given without /g', async () => {
    const verdict = await runCheck(check(), {
      tree: { 'src/a.ts': 'BANNED-0001\nfine\nBANNED-0002 and BANNED-0003\n' },
    });

    expect(verdict.findings.map((f) => [f.line, f.message])).toEqual([
      [1, 'forbidden pattern in src/a.ts: BANNED-0001'],
      [3, 'forbidden pattern in src/a.ts: BANNED-0002'],
      [3, 'forbidden pattern in src/a.ts: BANNED-0003'],
    ]);
  });

  it('finds a match in every file when the pattern is ALREADY global — no lastIndex carried across', async () => {
    const verdict = await runCheck(check({ pattern: /BANNED-[0-9]{4}/g }), {
      tree: { 'src/a.ts': 'BANNED-0001\n', 'src/b.ts': 'BANNED-0002\n', 'src/c.ts': 'BANNED-0003\n' },
    });

    expect(verdict.findings.map((f) => f.file)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('keeps the pattern’s own flags when it makes it global', async () => {
    const verdict = await runCheck(check({ pattern: /banned-[0-9]{4}/i }), { tree: { 'src/a.ts': 'BANNED-1234' } });

    expect(errorsOf(verdict)).toHaveLength(1);
  });

  it('renders a custom message with the matched text in place of {match}', async () => {
    const verdict = await runCheck(check({ message: 'a banned token ({match}) must not be committed' }), {
      tree: { 'src/a.ts': 'BANNED-4321' },
    });

    expect(errorsOf(verdict)).toEqual(['a banned token (BANNED-4321) must not be committed']);
  });
});

describe('forbidPattern — the passing verdict', () => {
  it('passes a clean tree', async () => {
    const verdict = await runCheck(check(), { tree: { 'src/a.ts': 'const k = "fine";\n' } });

    expect(verdict.ok).toBe(true);
    expect(errorsOf(verdict)).toEqual([]);
  });

  it('only scans what `in` selects — a match outside it is not this rule’s business', async () => {
    const verdict = await runCheck(check(), { tree: { 'docs/a.md': 'BANNED-1234', 'src/a.ts': '' } });

    expect(verdict.ok).toBe(true);
  });

  it('lets an allowed lookalike through while still catching the real thing beside it', async () => {
    const verdict = await runCheck(check({ allow: /BANNED-0000/ }), {
      tree: { 'src/a.ts': 'BANNED-0000 is the documented example\nBANNED-9999 is not\n' },
    });

    expect(verdict.findings.map((f) => f.line)).toEqual([2]);
  });

  /**
   * `allow` is `.test`ed once per match. A global `allow` tested statefully alternates
   * true/false, so every second lookalike would be reported — the false positive that
   * gets a rule deleted.
   */
  it('treats every lookalike the same when `allow` is itself global', async () => {
    const verdict = await runCheck(check({ allow: /BANNED-0000/g }), {
      tree: { 'src/a.ts': 'BANNED-0000\nBANNED-0000\nBANNED-0000\nBANNED-0000\n' },
    });

    expect(verdict.ok).toBe(true);
  });

  it('skips a file an `except` glob exempts, and still scans the rest', async () => {
    const verdict = await runCheck(check({ except: ['src/**/*.spec.ts'] }), {
      tree: { 'src/a.spec.ts': 'BANNED-1234', 'src/a.ts': 'BANNED-5678' },
    });

    expect(verdict.findings.map((f) => f.file)).toEqual(['src/a.ts']);
  });

  it('holds at its inline ratchet, framing the tolerated set, and fails one past it', async () => {
    const tree = { 'src/a.ts': 'BANNED-0001\nBANNED-0002\n' };

    const held = await runCheck(check({ ratchet: 2 }), { tree });
    expect(held.ok).toBe(true);
    expect(held.findings[0].message).toContain('tolerated under ratchet 2');
    expect(errorsOf(held)).toHaveLength(2);

    expect((await runCheck(check({ ratchet: 1 }), { tree })).ok).toBe(false);
  });

  it('lets a stored ratchet override the inline one', async () => {
    const tree = { 'src/a.ts': 'BANNED-0001\nBANNED-0002\n' };

    expect((await runCheck(check({ ratchet: 5 }), { tree, ratchet: 1 })).ok).toBe(false);
    expect((await runCheck(check(), { tree, ratchet: 2 })).ok).toBe(true);
  });

  it('states the violation count as its measurement, tolerated or not', async () => {
    const verdict = await runCheck(check({ ratchet: 9 }), { tree: { 'src/a.ts': 'BANNED-0001\nBANNED-0002\n' } });

    expect(verdict.ratchet).toEqual({ value: 2 });
  });
});

describe('forbidPattern — an empty corpus', () => {
  /**
   * A primitive whose `in` glob matches nothing — a folder that moved, a typo in the
   * extension — used to pass, with no line saying what was scanned. The floor is now on by
   * default, and an empty corpus is accepted only when declared.
   */
  it('refuses a glob that matched nothing, naming the glob — a ban over zero files bans nothing', async () => {
    // The tree HAS the banned token; the glob just does not reach it. This passed.
    const verdict = await runCheck(check({ in: 'src/**/*.tsx' }), { tree: { 'src/a.ts': 'BANNED-1234' } });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual([expect.stringContaining('`src/**/*.tsx` matched nothing to scan')]);
  });

  it('accepts an empty corpus only when the check says so in writing', async () => {
    const verdict = await runCheck(check({ in: 'src/**/*.tsx', corpus: { atLeast: 0 } }), { tree: { 'src/a.ts': '' } });

    expect(verdict.ok).toBe(true);
  });

  it('says how many files a clean pass examined, so an empty corpus is visible in the output', async () => {
    const verdict = await runCheck(check(), { tree: { 'src/a.ts': 'clean', 'src/b.ts': 'clean' } });

    expect(verdict.ok).toBe(true);
    expect(verdict.findings).toEqual([{ severity: 'info', message: '✓ no-banned — 2 file(s) examined, clean' }]);
  });
});

describe('forbidPattern — its identity', () => {
  it('declares only `read`, defaults to the consumer zone, and carries what it was given', () => {
    const built = check({ hint: 'remove the token', advisory: true });

    expect(built.capabilities).toEqual(['read']);
    expect(built.zone).toBe('consumer');
    expect(built).toMatchObject({
      id: 'no-banned',
      title: 'no banned tokens',
      tier: 'fast',
      hint: 'remove the token',
      advisory: true,
    });
    expect(built.when(['anything'])).toBe(true);
  });
});
