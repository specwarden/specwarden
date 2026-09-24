import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheckMeta, type IVerdict, errorsOf, runCheck } from 'specwarden';
import { planShape } from './plan-shape.check';

const ID = { id: 'plan-shape' };
const NAME_RE = /^(?:[A-Z][A-Z0-9]*-\d+-)?[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const SIZING = [/\d+\s*(?:h|hours?|hrs?)\b/iu, /story\s*points?/iu];
// A lookahead rather than `\b` to end the word: JavaScript's `\b` is ASCII-only, so
// `Φάση\b` never matches — and a phase regex that matches nothing leaves every phase
// unchecked and the verdict green.
const PHASE_RE = /^(#{2,4})\s+(?:Phase|Φάση)(?=\s|$)/i;
const COMMAND_RE = /\b(pnpm|npx|node|vitest|jest)\b/;

type TOptions = Parameters<typeof planShape>[0];

const check = (opts: Partial<TOptions> = {}) =>
  planShape({
    ...ID,
    plansDir: 'docs/_plans',
    name: NAME_RE,
    sizing: SIZING,
    phaseHeading: PHASE_RE,
    command: COMMAND_RE,
    knownCheckIds: ['doc-paths', 'router-mirror'],
    ...opts,
  });

const run = (tree: Record<string, string>, opts: Partial<TOptions> = {}): Promise<IVerdict> =>
  runCheck(check(opts), { tree });

const meta = (id: string): ICheckMeta => ({
  id,
  title: id,
  tier: 'fast',
  zone: 'consumer',
  capabilities: ['read'],
  contractVersion: CHECK_CONTRACT_VERSION,
});

describe('planShape — naming and layout', () => {
  it('is a product-zone check', () => {
    expect(check().zone).toBe('product');
  });

  it('accepts a well-formed plan', async () => {
    const v = await run({
      'docs/_plans/PLAT-9-thing.md': '## Phase 1\nrun `pnpm gate --id doc-paths`\n',
      'docs/_plans/README.md': '',
    });

    expect(v.ok).toBe(true);
  });

  it('fails a plan named off-convention', async () => {
    const v = await run({ 'docs/_plans/BadName.md': '## Phase 1\n`pnpm x`\n' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual([`docs/_plans/BadName.md — its name must match ${NAME_RE}. Rename the plan.`]);
  });

  it('fails a folder inside the plans folder — plans are flat, or they stop being deleted', async () => {
    const v = await run({ 'docs/_plans/archive/old.md': '# old', 'docs/_plans/a-b.md': '## Phase 1\n`pnpm x`\n' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual([
      'docs/_plans/archive/ — plans are FLAT; a folder here means plans stopped being deleted. Move what it holds out of docs/_plans.',
    ]);
  });

  it('ignores a non-markdown file and the folder’s own README', async () => {
    expect((await run({ 'docs/_plans/README.md': 'Bad Name', 'docs/_plans/.keep': '' })).ok).toBe(true);
  });

  it('leaves out what `except` names — a literal path, or a glob over the tracked files', async () => {
    const tree = { 'docs/_plans/CONTRACT.md': '## Phase 1\nprose', 'docs/_plans/a-b.md': '## Phase 1\n`pnpm x`\n' };

    expect((await run(tree)).ok).toBe(false);
    expect((await run(tree, { except: ['docs/_plans/CONTRACT.md'] })).ok).toBe(true);
    expect((await run(tree, { except: ['docs/_plans/[A-Z]*.md'] })).ok).toBe(true);
  });

  it('tests a global name pattern the same way on every plan', async () => {
    // A `/g` regex keeps `lastIndex` between calls; tested statefully, every second
    // well-named plan would be reported as off-convention.
    const tree = { 'docs/_plans/a.md': '', 'docs/_plans/b.md': '', 'docs/_plans/c.md': '' };

    expect((await run(tree, { name: /^[a-z]+\.md$/g })).ok).toBe(true);
  });
});

describe('planShape — the acceptance a plan names', () => {
  it('fails a plan naming a gate id that does not exist', async () => {
    const v = await run({ 'docs/_plans/a-b.md': '## Phase 1\n`pnpm gate --id nonesuch`\n' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual([
      "docs/_plans/a-b.md:2 names '--id nonesuch', which is not a check this run knows. Name a check the roster has, or state the acceptance as the command that runs it until it lands.",
    ]);
    expect(v.findings[0]).toMatchObject({ file: 'docs/_plans/a-b.md', line: 2 });
  });

  it('reads the known ids from the run’s roster when none are given', async () => {
    // A hand-kept list could forget a check, and the forgotten one would be invisible to
    // the audit meant to notice it. The roster is the list the engine is really running.
    const tree = { 'docs/_plans/a-b.md': '## Phase 1\n`pnpm gate --id unit`\n' };
    const rosterCheck = check({ knownCheckIds: undefined });

    expect((await runCheck(rosterCheck, { tree, roster: [meta('unit')] })).ok).toBe(true);
    expect((await runCheck(rosterCheck, { tree, roster: [meta('lint')] })).ok).toBe(false);
  });

  it('a hard failure is never tolerated by the ratchet', async () => {
    const v = await run({ 'docs/_plans/a-b.md': '## Phase 1\n`pnpm gate --id nonesuch`\n' }, { ratchet: 99 });

    expect(v.ok).toBe(false);
  });
});

describe('planShape — sizing and phases', () => {
  it('ratchets work-sizing mentions, reporting each with its line', async () => {
    const tree = { 'docs/_plans/a-b.md': '## Phase 1\ntakes 3 hours\n`pnpm x`\n' };

    expect((await run(tree, { ratchet: 1 })).ok).toBe(true);
    const v = await run(tree, { ratchet: 0 });
    expect(v.ok).toBe(false);
    expect(v.findings[0]).toMatchObject({ file: 'docs/_plans/a-b.md', line: 2 });
  });

  it('frames the tolerated set so a green verdict is not printed above what reads like failures', async () => {
    const v = await run({ 'docs/_plans/a-b.md': '## Phase 1\ntakes 3 hours\n`pnpm x`\n' }, { ratchet: 1 });

    expect(v.findings[0].message).toContain('tolerated under ratchet 1');
    expect(v.measured).toBe(1);
  });

  // Two ratchets of the check's own, `sizingRatchet` and `unacceptedRatchet`, that the stored
  // threshold never reached. One `ratchet` counts both, and the stored bar wins.
  it('counts sizing and unaccepted phases against the one ratchet, held to the STORED threshold', async () => {
    const tree = { 'docs/_plans/a-b.md': '## Phase 1\ntakes 3 hours\n' };

    expect((await runCheck(check(), { tree, threshold: 2 })).ok).toBe(true);
    expect((await runCheck(check({ ratchet: 5 }), { tree, threshold: 1 })).ok).toBe(false);
    expect((await runCheck(check(), { tree, threshold: 2 })).measured).toBe(2);
  });

  it('ratchets a phase with no acceptance command', async () => {
    const tree = { 'docs/_plans/a-b.md': '## Phase 1 — wire the UI\njust prose, nothing runnable\n' };

    expect((await run(tree, { ratchet: 1 })).ok).toBe(true);
    expect((await run(tree, { ratchet: 0 })).ok).toBe(false);
  });

  it('reads a phase heading in whatever language the repository writes plans', async () => {
    const v = await run({ 'docs/_plans/a-b.md': '## Φάση 1\nτίποτα\n' });

    expect(errorsOf(v)[0]).toContain('Φάση 1 — a phase with no acceptance command');
  });

  it('a `\\b` after a non-ASCII word matches nothing — the phase goes unchecked and the verdict green', async () => {
    // Pinned so the trap is visible: this is the regex this very spec used to carry.
    const v = await run({ 'docs/_plans/a-b.md': '## Φάση 1\nτίποτα\n' }, { phaseHeading: /^(#{2,4})\s+Φάση\b/i });

    expect(v.ok).toBe(true);
  });

  it('strips a global flag from the phase regex, so no heading is skipped', async () => {
    const plan = '## Phase 1\nprose\n## Phase 2\nprose\n## Phase 3\nprose\n';
    const v = await run({ 'docs/_plans/a-b.md': plan }, { phaseHeading: /^(#{2,4})\s+Phase\b/gi });

    expect(v.findings.filter((f) => f.message.includes('no acceptance command')).map((f) => f.line)).toEqual([1, 3, 5]);
  });
});

describe('planShape — what it examined', () => {
  it('fails over a plans folder that is not there, naming it — it passed as "nothing to verify"', async () => {
    const v = await run({ 'other/x.md': '' }, { plansDir: 'nope' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toEqual([
      'nope does not exist — this check examined nothing, and a check that examined nothing cannot fail. Point `plansDir` at the folder the plans live in, or create it.',
    ]);
  });

  it('says it looked at nothing when the folder holds no plan — a blank pass reads as "all well-shaped"', async () => {
    const v = await run({ 'docs/_plans/README.md': '# plans' });

    expect(v.ok).toBe(true);
    expect(v.findings.map((f) => f.message)).toEqual([
      '✓ plan-shape — 0 plan(s) examined, clean',
      'no plan in docs/_plans — nothing in flight.',
    ]);
  });

  it('holds the plans to a floor when told one — an empty folder is otherwise honest', async () => {
    const v = await run({ 'docs/_plans/README.md': '# plans' }, { corpus: { atLeast: 1 } });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('examined 0 plan(s) — docs/_plans holds 0 plan(s) — below the floor of 1');
  });

  it('prints the engine’s pass line, naming how many plans it read', async () => {
    const v = await run({ 'docs/_plans/a-b.md': '## Phase 1\n`pnpm x`\n' });

    expect(v.findings.map((f) => f.message)).toEqual(['✓ plan-shape — 1 plan(s) examined, clean']);
  });

  it('fails a FILE at the plans path, rather than crashing on the listing', async () => {
    const v = await run({ 'docs/_plans': 'not a folder' });

    expect(errorsOf(v)).toEqual(['docs/_plans is a file, not a folder of plans. Point `plansDir` at the folder.']);
  });
});

describe('planShape — the heading regex a consumer actually writes', () => {
  // The agentic template writes this regex, with a NON-capturing group. The check read
  // the heading depth from capture group 1, so it threw on the first plan with a phase —
  // and every spec here passed, because every spec used a capturing regex.
  const TEMPLATE_PHASE_RE = /^##+\s+(?:Phase|Stage)\b/im;
  const plan = [
    '## Phase 1 — the bucket',
    '```bash',
    'npx specwarden check --id doc-paths',
    '```',
    '### a note inside the phase',
    '## Phase 2 — per tenant',
    'nothing runnable here',
    '# Appendix',
  ].join('\n');

  it('does not throw when the regex captures nothing', async () => {
    await expect(run({ 'docs/_plans/a-b.md': plan }, { phaseHeading: TEMPLATE_PHASE_RE })).resolves.toBeDefined();
  });

  it('still reads the depth, so a deeper heading stays inside its phase and a shallower one ends it', async () => {
    const v = await run({ 'docs/_plans/a-b.md': plan }, { phaseHeading: TEMPLATE_PHASE_RE });

    // Phase 1 is accepted — its command is above the `###` note, which did not close it.
    // Phase 2 is not: it has no command before `# Appendix` closes it.
    const unaccepted = v.findings.filter((f) => f.message.includes('no acceptance command'));
    expect(unaccepted.map((f) => f.line)).toEqual([6]);
    expect(v.ok).toBe(false);
  });
});
