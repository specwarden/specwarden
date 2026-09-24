import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { DEFAULT_COMMAND, DEFAULT_NAME, DEFAULT_PHASE_HEADING, DEFAULT_SIZING, planShape } from './plan-shape.check';

/**
 * The English plan convention, as defaults. Four regexes were required, every repository
 * wired the same four, and a skill that named `plans` and `statuses` instead crashed the
 * run with "The "path" argument must be of type string".
 */
const ID = { id: 'plan-shape' };

const PLAN = [
  '# Refunds',
  '',
  '## Phase 1 — the refund line',
  '',
  '```bash',
  'pnpm gate --id unit',
  '```',
  '',
  '## Phase 2 — the ledger',
  '',
  '**Acceptance.** `pnpm gate --id unit` exits 0.',
].join('\n');

const run = (tree: Record<string, string>) => runCheck(planShape(ID), { tree, roster: [] });

describe('planShape — the defaults an English repository has', () => {
  it('reads `docs/_plans`, as `plan-shape`, in the fast tier, when nothing is said', async () => {
    const check = planShape();

    expect(check).toMatchObject({ id: 'plan-shape', tier: 'fast' });
    expect(errorsOf(await run({ 'README.md': '# a' }))[0]).toContain('docs/_plans does not exist');
  });

  it('passes a plan whose phases are accepted by a command or an `**Acceptance.**` line', async () => {
    const verdict = await runCheck(planShape({ ...ID, knownCheckIds: ['unit'] }), {
      tree: { 'docs/_plans/refunds.md': PLAN, 'docs/_plans/README.md': '# the contract' },
    });

    expect(errorsOf(verdict)).toEqual([]);
  });

  it('names a phase with no acceptance, a plan that sizes work, and a name off the convention', async () => {
    const verdict = await runCheck(planShape({ ...ID, knownCheckIds: [] }), {
      tree: { 'docs/_plans/Refunds_Plan.md': '# r\n\nThis takes 3 days.\n\n## Phase 1 — x\n\nNothing runs.\n' },
    });

    expect(errorsOf(verdict)).toEqual([
      `docs/_plans/Refunds_Plan.md — its name must match ${String(DEFAULT_NAME)}. Rename the plan.`,
      'docs/_plans/Refunds_Plan.md:3 sizes work — a plan states dependency and deployability, not hours. Say what the phase depends on instead.',
      'docs/_plans/Refunds_Plan.md:5 ## Phase 1 — x — a phase with no acceptance command has no definition of done. End it with the command that proves it.',
    ]);
  });

  it('exports each default, so a house writing in another language starts from them', () => {
    expect(DEFAULT_NAME.test('01-consumer-journey.md')).toBe(true);
    expect(DEFAULT_SIZING.some((re) => re.test('about 2 weeks'))).toBe(true);
    expect(DEFAULT_PHASE_HEADING.test('### Phase 3 — the rest')).toBe(true);
    expect(DEFAULT_COMMAND.test('npx vitest run')).toBe(true);
    expect(DEFAULT_COMMAND.test('Run the tests.')).toBe(false);
  });
});

describe('planShape — its options', () => {
  it('refuses the options the shipped skill named, by name, when the file loads', () => {
    const skill = { ...ID, plans: 'docs/_plans/*.md', statuses: ['draft', 'done'] } as never;

    expect(() => planShape(skill)).toThrow(CheckOptionsError);
    expect(() => planShape(skill)).toThrow(
      '`plans` is not an option of planShape; `statuses` is not an option of planShape',
    );
  });

  it('refuses a pattern given as a string', () => {
    expect(() => planShape({ ...ID, command: 'pnpm' } as never)).toThrow('`command` must be a RegExp');
  });

  it('refuses the retired spellings by name — patterns carry no `Re`, and there is one `ratchet`', () => {
    for (const retired of [
      'nameRe',
      'phaseHeadingRe',
      'commandRe',
      'sizingRatchet',
      'unacceptedRatchet',
      'knownGateIds',
    ]) {
      expect(() => planShape({ ...ID, [retired]: 1 } as never), retired).toThrow(
        `\`${retired}\` is not an option of planShape`,
      );
    }
  });

  it('refuses `zone`: a module’s check speaks for its package', () => {
    expect(() => planShape({ zone: 'consumer' } as never)).toThrow('`zone` is not an option of planShape');
  });
});
