import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ICheckMeta, ICheckResult, IVerdict } from '../../domain';
import { forbidPattern } from '../../primitives';
import { runCheck } from '../../testing';
import { TtyReporter, type ITtyReporterOptions } from './tty-reporter.adapter';

/**
 * The human-facing reporter, rendered into a captured sink. Every case asserts the
 * TEXT, because the text is the product here: a reporter that decides nothing still
 * decides what a reader believes, and a green line over a red run is a lie told in
 * the one place everybody looks.
 *
 * `_contract/reporter.contract.spec.ts` holds the environment-leak promise both
 * reporters share; this file is what only the TTY one renders.
 */
const meta = (id: string, extra: Partial<ICheckMeta> = {}): ICheckMeta => ({
  id,
  title: `${id} title`,
  tier: 'fast',
  zone: 'consumer',
  capabilities: [],
  contractVersion: 1,
  ...extra,
});

const result = (id: string, over: Partial<ICheckResult> = {}, extra: Partial<ICheckMeta> = {}): ICheckResult => ({
  meta: meta(id, extra),
  verdict: { ok: true, findings: [] },
  durationMs: 100,
  ...over,
});

const failed = (findings: IVerdict['findings'] = []): IVerdict => ({ ok: false, findings });

function capture(options?: ITtyReporterOptions): { reporter: TtyReporter; out: () => string } {
  let text = '';
  const reporter = new TtyReporter((t) => (text += t), options);
  return { reporter, out: () => text };
}

describe('TtyReporter — one check', () => {
  it('opens a check with its id and title', () => {
    const { reporter, out } = capture();
    reporter.checkStarted(meta('lint'));

    expect(out()).toBe('▶ lint — lint title\n');
  });

  it('renders a passing check with its duration to one decimal', () => {
    const { reporter, out } = capture();
    reporter.checkFinished(result('lint', { durationMs: 1250 }));

    expect(out()).toBe('✅ lint — 1.3s\n');
  });

  // It printed ✅ beside a note reading SKIPPED: a pass nobody earned.
  it('renders a check that could not look as skipped, with its notes, whatever --show-skipped says', () => {
    const { reporter, out } = capture();
    reporter.checkFinished(
      result('env', {
        skipped: 'cannot-tell',
        verdict: { ok: true, findings: [{ severity: 'info', message: 'prod: absent' }], skipped: 'no env file here' },
      }),
    );

    expect(out()).toBe('prod: absent\n⏭  env — could not look here: no env file here\n');
  });

  it('prints each finding verbatim on its own line, above the frame line', () => {
    const { reporter, out } = capture();
    reporter.checkFinished(
      result('docs', {
        verdict: failed([
          { severity: 'error', message: 'docs/a.md: dead link' },
          { severity: 'warning', message: 'docs/b.md: long line' },
        ]),
      }),
    );

    expect(out()).toBe('docs/a.md: dead link\ndocs/b.md: long line\n❌ docs FAILED after 0.1s\n');
  });

  it('shows the hint under a failure', () => {
    const { reporter, out } = capture();
    reporter.checkFinished(result('x', { verdict: failed() }, { hint: 'run pnpm fix' }));

    expect(out()).toBe('❌ x FAILED after 0.1s\n   💡 run pnpm fix\n');
  });

  it('prints no hint line for a failure that declares none', () => {
    const { reporter, out } = capture();
    reporter.checkFinished(result('x', { verdict: failed() }));

    expect(out()).not.toContain('💡');
  });

  /**
   * An advisory check that is not ok WARNS. Printed as ❌ FAILED it would read as the
   * reason a run went red when it cannot be, and people stop reading the ❌ lines.
   */
  it('renders a not-ok ADVISORY check as a warning, never as a failure, and without the hint', () => {
    const { reporter, out } = capture();
    reporter.checkFinished(
      result(
        'orphan',
        { verdict: failed([{ severity: 'error', message: '2 orphans' }]) },
        {
          advisory: true,
          hint: 'declare a rule',
        },
      ),
    );

    expect(out()).toBe('2 orphans\n⚠️  orphan WARNS after 0.1s\n');
    expect(out()).not.toContain('FAILED');
  });

  it('prints a passing advisory check as a pass', () => {
    const { reporter, out } = capture();
    reporter.checkFinished(result('orphan', {}, { advisory: true }));

    expect(out()).toBe('✅ orphan — 0.1s\n');
  });

  /**
   * A tolerated pass is ✅ over `error` lines, which is exactly the frame a reader
   * mistakes for a failure — so the summary line the verdict carries must be printed
   * FIRST. Built through a real primitive under a ratchet rather than a hand-written
   * verdict, so a change to the framing is caught here too.
   */
  it('renders a pass tolerated by a ratchet with the tolerance note above the tolerated lines', async () => {
    const check = forbidPattern({ id: 'banned', title: 'banned', tier: 'fast', files: '**/*.ts', pattern: /BANNED/ });
    const verdict = await runCheck(check, { tree: { 'a.ts': 'BANNED\n' }, threshold: 1 });
    const { reporter, out } = capture();
    reporter.checkFinished(result('banned', { verdict }));

    const lines = out().trimEnd().split('\n');
    expect(lines[0]).toMatch(/^↑ 1 pre-existing violation\(s\) tolerated under ratchet 1/);
    expect(lines[1]).toBe('a.ts:1 forbidden pattern in a.ts: BANNED');
    expect(lines[2]).toBe('✅ banned — 0.1s');
  });

  /**
   * The location leads. It was on every finding and printed by the annotation reporter
   * alone, so the terminal said "forbidden pattern in src/util.ts: TODO" and the reader
   * went looking for the line the engine already knew.
   */
  it.each([
    [
      'a file and a line, the message not naming it',
      { file: 'src/a.ts', line: 3, message: 'banned' },
      'src/a.ts:3 banned',
    ],
    [
      'a message opening with its file gains the line there',
      { file: 'src/a.ts', line: 3, message: 'src/a.ts imports x.' },
      'src/a.ts:3 imports x.',
    ],
    [
      'a message opening with file:line is left alone',
      { file: 'src/a.ts', line: 3, message: 'src/a.ts:3 said so' },
      'src/a.ts:3 said so',
    ],
    [
      'a message opening with file and a colon keeps it',
      { file: 'src/a.ts', line: 1, message: 'src/a.ts: TODO' },
      'src/a.ts:1: TODO',
    ],
    ['a file and no line', { file: 'src/a.ts', message: 'is missing' }, 'src/a.ts is missing'],
    [
      'a message opening with its file, no line, unchanged',
      { file: 'src/a.ts', message: 'src/a.ts is missing' },
      'src/a.ts is missing',
    ],
    [
      'a longer path that merely starts with the file is not the file',
      { file: 'src/a.ts', message: 'src/a.tsx differs' },
      'src/a.ts src/a.tsx differs',
    ],
    ['no file: the message, unchanged', { message: '3 rules unowned' }, '3 rules unowned'],
  ])('%s', (_name, finding, line) => {
    const { reporter, out } = capture();
    reporter.checkFinished(result('x', { verdict: failed([{ severity: 'error', ...finding }]) }));

    expect(out().split('\n')[0]).toBe(line);
  });

  it('says nothing for a skipped check unless asked — a filtered tier would bury what ran', () => {
    const { reporter, out } = capture();
    reporter.checkFinished(result('heavy', { skipped: 'not-relevant', verdict: failed() }));

    expect(out()).toBe('');
  });

  it('names a skipped check and why when showSkipped is on, and never frames it as pass or fail', () => {
    const { reporter, out } = capture({ showSkipped: true });
    reporter.checkFinished(result('heavy', { skipped: 'by-request', verdict: failed() }));

    expect(out()).toBe('⏭  heavy — skipped (by-request)\n');
  });
});

describe('TtyReporter — the run summary', () => {
  it('is green and counts the passes when nothing failed', () => {
    const { reporter, out } = capture();
    reporter.runFinished([result('a'), result('b')], 2000);

    expect(out()).toBe('\n✅ 2 check(s) passed in 2.0s\n');
  });

  it('counts a passing advisory check as passed — "4 check(s) passed" was printed for five', () => {
    const { reporter, out } = capture();
    reporter.runFinished([result('a'), result('advice', {}, { advisory: true })], 1000);

    expect(out()).toBe('\n✅ 2 check(s) passed in 1.0s\n');
  });

  it('says nothing ran when every check was skipped — "✅ 0 check(s) passed" was a tick over nothing', () => {
    const { reporter, out } = capture();
    reporter.runFinished([result('a', { skipped: 'by-request' })], 100);

    expect(out()).toContain('\n⏭  nothing ran — 1 skipped, 0 checked, in 0.1s\n');
    expect(out()).not.toContain('✅');
  });

  it('is red over a run with any failure, however many passed', () => {
    const { reporter, out } = capture();
    reporter.runFinished([result('a'), result('b'), result('c', { verdict: failed() })], 1000);

    expect(out()).toContain('❌ 1 check(s) FAILED, 2 passed in 1.0s');
    expect(out()).not.toContain('✅');
  });

  it('counts a warning and a skip aside on a failing run too', () => {
    const { reporter, out } = capture();
    reporter.runFinished(
      [
        result('a', { verdict: failed() }),
        result('w', { verdict: failed() }, { advisory: true }),
        result('s', { skipped: 'not-relevant' }),
      ],
      500,
    );

    expect(out()).toContain('❌ 1 check(s) FAILED, 0 passed (1 warned, 1 skipped) in 0.5s');
  });

  /**
   * A skipped check's verdict is a placeholder. Counted, a skipped not-ok verdict
   * would turn a green run red for a check that never ran.
   */
  it('never counts a skipped check as passed or failed', () => {
    const { reporter, out } = capture();
    reporter.runFinished([result('a'), result('s', { skipped: 'not-relevant', verdict: failed() })], 0);

    expect(out()).toContain('✅ 1 check(s) passed (1 skipped) in 0.0s');
  });

  it('names the skipped ids compactly, because the count alone leaves WHICH unanswerable', () => {
    const { reporter, out } = capture();
    reporter.runFinished(
      [result('a'), result('s1', { skipped: 'by-request' }), result('s2', { skipped: 'by-request' })],
      0,
    );

    expect(out()).toContain('\nskipped: s1, s2\n');
  });

  it('caps the skipped list at twelve and says how many more', () => {
    const { reporter, out } = capture();
    const skipped = Array.from({ length: 15 }, (_, i) => result(`s${i + 1}`, { skipped: 'not-relevant' }));
    reporter.runFinished(skipped, 0);

    expect(out()).toContain('skipped: s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, +3 more\n');
    expect(out()).not.toContain('s13');
  });

  it('does not list the skipped ids again when each was already printed', () => {
    const { reporter, out } = capture({ showSkipped: true });
    reporter.runFinished([result('s', { skipped: 'by-request' })], 0);

    expect(out()).not.toContain('skipped: s');
  });

  it('prints no skipped line when nothing was skipped', () => {
    const { reporter, out } = capture();
    reporter.runFinished([result('a')], 0);

    expect(out()).not.toContain('skipped');
  });
});

describe('TtyReporter — where the time went', () => {
  const three = [
    result('fast', { durationMs: 100 }),
    result('slow', { durationMs: 3000 }),
    result('mid', { durationMs: 1500 }),
  ];

  it('is silent by default — a line nobody asked for is a line people learn to skip', () => {
    const { reporter, out } = capture();
    reporter.runFinished(three, 0);

    expect(out()).not.toContain('slowest');
  });

  it('names the slowest checks, slowest first, capped at the count asked for', () => {
    const { reporter, out } = capture({ slowest: 2 });
    reporter.runFinished(three, 0);

    expect(out()).toContain('\nslowest: slow 3.0s, mid 1.5s\n');
    expect(out()).not.toContain('fast 0.1s');
  });

  it('prints the profile BEFORE the summary line, so the verdict is the last thing on screen', () => {
    const { reporter, out } = capture({ slowest: 1 });
    reporter.runFinished(three, 0);

    expect(out().indexOf('slowest:')).toBeLessThan(out().indexOf('check(s) passed'));
  });

  it('is silent for a run too small to have a profile', () => {
    const { reporter, out } = capture({ slowest: 3 });
    reporter.runFinished(three.slice(0, 2), 0);

    expect(out()).not.toContain('slowest');
  });

  it('is silent when nothing took measurable time — "0.0s, 0.0s, 0.0s" is not information', () => {
    const { reporter, out } = capture({ slowest: 3 });
    reporter.runFinished(
      [result('a', { durationMs: 0 }), result('b', { durationMs: 0 }), result('c', { durationMs: 0 })],
      0,
    );

    expect(out()).not.toContain('slowest');
  });

  it('ranks only the checks that ran — a skip has no duration worth naming', () => {
    const { reporter, out } = capture({ slowest: 1 });
    reporter.runFinished([...three, result('skipped-but-slow', { durationMs: 9000, skipped: 'not-relevant' })], 0);

    expect(out()).toContain('slowest: slow 3.0s\n');
  });

  it('treats a zero or negative count as off', () => {
    const { reporter, out } = capture({ slowest: 0 });
    reporter.runFinished(three, 0);

    expect(out()).not.toContain('slowest');
  });
});

describe('TtyReporter — its default sink', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to the process stdout when no sink is given', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    new TtyReporter().checkStarted(meta('lint'));

    expect(write).toHaveBeenCalledWith('▶ lint — lint title\n');
  });
});
