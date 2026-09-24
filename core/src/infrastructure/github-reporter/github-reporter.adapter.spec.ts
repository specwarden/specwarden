import { describe, expect, it } from 'vitest';

import type { ICheckMeta, ICheckResult, IFinding } from '../../domain';
import { GithubReporter } from './github-reporter.adapter';

const meta = (over: Partial<ICheckMeta> = {}): ICheckMeta =>
  ({
    id: 'lint',
    title: 'ESLint',
    tier: 'fast',
    zone: 'consumer',
    capabilities: [],
    contractVersion: 1,
    ...over,
  }) as ICheckMeta;

const result = (findings: readonly IFinding[], over: Partial<ICheckResult> = {}): ICheckResult =>
  ({
    meta: meta(),
    verdict: { ok: findings.every((f) => f.severity !== 'error'), findings },
    durationMs: 10,
    ...over,
  }) as ICheckResult;

function capture() {
  let out = '';
  return { write: (t: string) => (out += t), out: () => out };
}

describe('GithubReporter', () => {
  it('annotates an error at its file and line', () => {
    const c = capture();
    new GithubReporter(c.write).checkFinished(
      result([{ severity: 'error', message: 'bad import', file: 'src/a.ts', line: 12, column: 3 }]),
    );

    expect(c.out()).toContain('::error title=lint,file=src/a.ts,line=12,col=3::bad import');
  });

  it('annotates a warning as a warning, so an advisory check does not read as a failure', () => {
    const c = capture();
    new GithubReporter(c.write).checkFinished(result([{ severity: 'warning', message: 'shape', file: 'a.md' }]));

    expect(c.out()).toContain('::warning title=lint,file=a.md::shape');
  });

  it("annotates an ADVISORY check's errors as warnings — ::error on a green job reads as a failed gate", () => {
    const c = capture();
    new GithubReporter(c.write).checkFinished(
      result([{ severity: 'error', message: 'ugly', file: 'src/u.ts' }], { meta: meta({ advisory: true }) }),
    );

    expect(c.out()).toContain('::warning title=lint,file=src/u.ts::ugly');
    expect(c.out()).not.toContain('::error');
  });

  it('counts the run as the terminal does: a failed advisory check is warned, not passed', () => {
    const c = capture();
    new GithubReporter(c.write).runFinished(
      [
        result([]),
        result([], { meta: meta({ id: 'advice', advisory: true }) }),
        result([{ severity: 'error', message: 'x' }], { meta: meta({ id: 'broke', advisory: true }) }),
      ],
      1000,
    );

    expect(c.out()).toBe('::notice title=specwarden::2 check(s) passed (1 warned) in 1.0s\n');
  });

  it('prints an info finding as a plain line, never as an annotation', () => {
    // An annotation per explanatory line would put a note on the diff for everything a
    // passing check chose to say — which trains people to collapse annotations.
    const c = capture();
    new GithubReporter(c.write).checkFinished(result([{ severity: 'info', message: '✓ 438 documents examined' }]));

    expect(c.out()).toContain('✓ 438 documents examined');
    expect(c.out()).not.toContain('::notice');
  });

  it('names the rule when a finding proves one the check is not named after', () => {
    const c = capture();
    new GithubReporter(c.write).checkFinished(result([{ severity: 'error', message: 'x', ruleId: 'no-deep-import' }]));

    expect(c.out()).toContain('title=lint (no-deep-import)');
  });

  it('escapes the characters that would silently truncate an annotation', () => {
    // A colon inside a parameter list ends the value: an unescaped drive-letter path or
    // a message with a colon does not error, it just annotates the wrong thing.
    const c = capture();
    new GithubReporter(c.write).checkFinished(
      result([{ severity: 'error', message: 'first\nsecond, 100% sure', file: 'a:b,c.ts' }]),
    );

    expect(c.out()).toContain('file=a%3Ab%2Cc.ts');
    expect(c.out()).toContain('first%0Asecond, 100%25 sure');
    // The whole annotation stays on ONE line: a raw newline in the message would end
    // the workflow command there and leave the rest as plain log text.
    expect(
      c
        .out()
        .split('\n')
        .filter((l) => l.startsWith('::error')),
    ).toHaveLength(1);
  });

  it('wraps each check in a collapsible group', () => {
    const c = capture();
    const reporter = new GithubReporter(c.write);
    reporter.checkStarted(meta());
    reporter.checkFinished(result([]));

    expect(c.out()).toContain('::group::lint — ESLint');
    expect(c.out()).toContain('::endgroup::');
  });

  it('puts a hint on the log rather than on the diff', () => {
    const c = capture();
    new GithubReporter(c.write).checkFinished(
      result([{ severity: 'error', message: 'x' }], { meta: meta({ hint: 'run the thing' }) }),
    );

    expect(c.out()).toContain('hint: run the thing');
    expect(c.out()).not.toContain('::error title=lint::hint');
  });

  it('reports a skipped check as a line and opens no group for it', () => {
    const c = capture();
    new GithubReporter(c.write).checkFinished(result([], { skipped: 'not-relevant' }));

    expect(c.out()).toBe('skipped: lint (not-relevant)\n');
  });

  it('closes the group of a check that ran and could not look, with its notes and why', () => {
    const c = capture();
    new GithubReporter(c.write).checkFinished(
      result([{ severity: 'info', message: 'prod: absent' }], {
        skipped: 'cannot-tell',
        verdict: { ok: true, findings: [{ severity: 'info', message: 'prod: absent' }], skipped: 'no env file here' },
      }),
    );

    expect(c.out()).toBe('prod: absent\nskipped: lint (cannot-tell) — no env file here\n::endgroup::\n');
  });

  it('summarises failures once, as a notice — the failures are already annotated', () => {
    const c = capture();
    new GithubReporter(c.write).runFinished(
      [result([{ severity: 'error', message: 'x' }]), result([], { meta: meta({ id: 'build' }) })],
      1500,
    );

    expect(c.out()).toContain('::notice title=specwarden::1 check(s) failed: lint');
    expect(c.out()).not.toContain('::error');
  });

  it('says nothing ran when every check was skipped', () => {
    const c = capture();
    new GithubReporter(c.write).runFinished([result([], { skipped: 'not-relevant' })], 1000);

    expect(c.out()).toBe('::notice title=specwarden::nothing ran — 1 skipped, 0 checked, in 1.0s\n');
  });

  it('summarises a clean run with its duration', () => {
    const c = capture();
    new GithubReporter(c.write).runFinished([result([])], 2000);

    expect(c.out()).toContain('1 check(s) passed in 2.0s');
  });
});
