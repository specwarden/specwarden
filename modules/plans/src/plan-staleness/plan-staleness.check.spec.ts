import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { type IPlanStalenessOptions, planStaleness } from './plan-staleness.check';

/**
 * The states a person cannot see: a plan whose branch is gone, a draft that names one, an
 * archive entry missing the fields that say how far to trust it, and a live document
 * citing the archive.
 */
const ARCHIVE_HEADER = [
  { label: 'Started', pattern: /^\*\*Started:\*\*\s*\S/m },
  { label: 'Finished', pattern: /^\*\*Finished:\*\*\s*\S/m },
  { label: 'Left open', pattern: /^\*\*Left open:\*\*\s*\S/m },
];

const OPTIONS: IPlanStalenessOptions = {
  plansDir: 'docs/_plans',
  archiveDir: 'docs/_plans-archive',
  branchDeclaration: /^\*\*Branch:\*\*\s*`?([^\s`]+)`?/m,
  statusDeclaration: /^\*\*Status:\*\*\s*`?(draft|active)`?/im,
  activeStatuses: ['active'],
  archiveHeader: ARCHIVE_HEADER,
  when: () => true,
};

const ACTIVE = ['**Status:** active', '**Branch:** work-branch'].join('\n');
const ARCHIVE_OK = ['# Done', '**Started:** 2026-01-01', '**Finished:** 2026-01-02', '**Left open:** nothing'].join(
  '\n',
);

/** The plans folder every scene has unless it says otherwise — an absent one is a failure. */
const FOLDER = { 'docs/_plans/README.md': 'The contract.' };

/** `branches: null` is a checkout with no refs at all — "cannot tell", not "gone". */
const runWith = (
  tree: Record<string, string>,
  branches: readonly string[] | null,
  over: Partial<IPlanStalenessOptions> = {},
): Promise<IVerdict> => runCheck(planStaleness({ ...OPTIONS, ...over }), { tree: { ...FOLDER, ...tree }, branches });

const messages = (verdict: IVerdict) => verdict.findings.map((f) => f.message).join('\n');

describe('planStaleness — the identity a run reads', () => {
  it('is a product-zone, read-only check named `plan-staleness`, in the fast tier by default', () => {
    expect(planStaleness(OPTIONS)).toMatchObject({
      id: 'plan-staleness',
      zone: 'product',
      capabilities: ['read'],
      tier: 'fast',
    });
  });

  it('matters, by default, only when a document changed', () => {
    const { when } = planStaleness({ ...OPTIONS, when: undefined });

    expect(when?.(['docs/_plans/a.md'])).toBe(true);
    expect(when?.(['src/index.ts'])).toBe(false);
  });
});

describe('planStaleness — the live folder', () => {
  it('passes an active plan whose branch exists', async () => {
    expect((await runWith({ 'docs/_plans/thing.md': ACTIVE }, ['dev', 'work-branch'])).ok).toBe(true);
  });

  it('fails an active plan that declares no branch', async () => {
    const verdict = await runWith({ 'docs/_plans/thing.md': '**Status:** active' }, ['dev']);

    expect(errorsOf(verdict)).toEqual([
      'docs/_plans/thing.md is active and declares no branch. An active plan names where its work happens.',
    ]);
    expect(verdict.findings[0]).toMatchObject({ file: 'docs/_plans/thing.md', line: 1 });
  });

  it('fails a draft that names a branch — it arms a failure for the day that branch goes', async () => {
    const draft = ['**Status:** draft', '**Branch:** work-branch'].join('\n');
    const verdict = await runWith({ 'docs/_plans/thing.md': draft }, ['dev', 'work-branch']);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/draft yet declares branch `work-branch`/);
    expect(verdict.findings[0]).toMatchObject({ file: 'docs/_plans/thing.md', line: 2 });
  });

  // It was read as a draft, and failed as "a draft that declares a branch".
  it('passes a done plan that keeps its branch, and says to harvest and move it', async () => {
    const done = ['**Status:** done', '**Branch:** work-branch'].join('\n');
    const verdict = await runWith({ 'docs/_plans/thing.md': done }, ['dev'], {
      statusDeclaration: /^\*\*Status:\*\*\s*`?(draft|active|done)`?/im,
    });

    expect(verdict.ok).toBe(true);
    expect(messages(verdict)).toContain('docs/_plans/thing.md is done — harvest it, then move it to');
  });

  it('passes a draft with no branch — draft is a first-class state', async () => {
    expect((await runWith({ 'docs/_plans/thing.md': '**Status:** draft' }, ['dev'])).ok).toBe(true);
  });

  it('fails an active plan whose branch is gone — the work merged unharvested', async () => {
    const verdict = await runWith({ 'docs/_plans/thing.md': ACTIVE }, ['dev']);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/no longer exists here or on the remote.*docs\/_plans-archive\//s);
    expect(verdict.findings[0]).toMatchObject({ file: 'docs/_plans/thing.md', line: 2 });
  });

  /**
   * The lifecycle rule, reused rather than restated: a checkout with no refs cannot tell
   * whether the branch is gone, and a guess there archives live work.
   */
  it('skips the branch question when the checkout has no refs, instead of failing it', async () => {
    const verdict = await runWith({ 'docs/_plans/thing.md': ACTIVE }, null);

    expect(verdict.ok).toBe(true);
    expect(messages(verdict)).toMatch(/SKIPPED, this checkout has no branch refs/);
  });

  it('names each plan with no status, fails past the ratchet, and holds them under it', async () => {
    const tree = { 'docs/_plans/a.md': '# no status here', 'docs/_plans/b.md': '# nor here' };

    const failing = await runWith(tree, ['dev']);
    expect(errorsOf(failing)).toEqual([
      'docs/_plans/a.md declares no status, so a draft cannot be told from work under way. Declare whether it is a draft, active or done.',
      'docs/_plans/b.md declares no status, so a draft cannot be told from work under way. Declare whether it is a draft, active or done.',
    ]);
    expect(failing.findings.map((f) => f.file)).toEqual(['docs/_plans/a.md', 'docs/_plans/b.md']);

    const held = await runWith(tree, ['dev'], { ratchet: 2 });
    expect(held.ok).toBe(true);
    expect(held.measured).toBe(2);
    expect(messages(held)).toContain('2 pre-existing violation(s) tolerated under ratchet 2');
  });

  // `undeclaredStatusRatchet` was read off the options alone, and a passing run reported the
  // count only as a note: `--tighten` stored 0 over the plans the check had been tolerating.
  it('holds to the STORED threshold the run hands it, over the declared ceiling', async () => {
    const tree = { ...FOLDER, 'docs/_plans/a.md': '# no status here' };

    expect((await runCheck(planStaleness(OPTIONS), { tree, branches: [], threshold: 1 })).ok).toBe(true);
    const armed = planStaleness({ ...OPTIONS, ratchet: 5 });
    expect((await runCheck(armed, { tree, branches: [], threshold: 0 })).ok).toBe(false);
  });

  it('leaves out a plan `except` names', async () => {
    const tree = { 'docs/_plans/a.md': '# no status here' };

    expect((await runWith(tree, ['dev'], { except: ['docs/_plans/a.md'] })).ok).toBe(true);
  });

  it('does not treat the folder README as a plan', async () => {
    expect((await runWith({ 'docs/_plans/README.md': '# Plans' }, ['dev'])).ok).toBe(true);
  });

  it('uses the default convention when a house states none', async () => {
    // The bolded header a hand-written plan already has. Without defaults the check was
    // shipped unconfigured, threw on the first plan, and so never ran.
    const check = planStaleness({ id: 'plan-staleness', title: 't', plansDir: 'plans', archiveDir: 'archive' });
    const tree = { 'plans/a.md': '**Status:** active\n**Branch:** `feature/a`\n' };

    expect((await runCheck(check, { tree, branches: ['feature/a'] })).ok).toBe(true);
    expect((await runCheck(check, { tree, branches: ['main'] })).ok).toBe(false);
  });

  it('reads a `/g` declaration the same way in every plan', async () => {
    // `exec` on a global regex resumes from `lastIndex`, which survived from one plan to
    // the next: every second plan's status read as undeclared.
    const tree = {
      'docs/_plans/a.md': ACTIVE,
      'docs/_plans/b.md': ACTIVE,
      'docs/_plans/c.md': ACTIVE,
    };
    const verdict = await runWith(tree, ['work-branch'], {
      statusDeclaration: /^\*\*Status:\*\*\s*`?(draft|active)`?/gim,
      branchDeclaration: /^\*\*Branch:\*\*\s*`?([^\s`]+)`?/gm,
    });

    expect(verdict.ok).toBe(true);
    expect(verdict.measured).toBe(0);
  });
});

describe('planStaleness — the archive', () => {
  it('names each missing archive header field', async () => {
    const verdict = await runWith({ 'docs/_plans-archive/done.md': '# Done\n**Started:** 2026-01-01' }, ['dev']);

    expect(errorsOf(verdict)).toHaveLength(1);
    expect(errorsOf(verdict)[0]).toMatch(/archive header is missing Finished, Left open\./);
  });

  it('passes a complete archive header', async () => {
    expect((await runWith({ 'docs/_plans-archive/done.md': ARCHIVE_OK }, ['dev'])).ok).toBe(true);
  });

  it('reads a `/g` header field the same way in every archive entry', async () => {
    const header = ARCHIVE_HEADER.map((f) => ({ ...f, pattern: new RegExp(f.pattern.source, 'gm') }));
    const tree = { 'docs/_plans-archive/a.md': ARCHIVE_OK, 'docs/_plans-archive/b.md': ARCHIVE_OK };

    expect((await runWith(tree, ['dev'], { archiveHeader: header })).ok).toBe(true);
  });

  it('fails a live document that links into the archive', async () => {
    const tree = {
      'docs/_plans-archive/done.md': ARCHIVE_OK,
      'skills/x/SKILL.md': 'see docs/_plans-archive/done.md for the reasoning',
    };
    const verdict = await runWith(tree, ['dev']);

    expect(errorsOf(verdict)).toEqual([
      'skills/x/SKILL.md:1 links to docs/_plans-archive/done.md — an archived plan describes the past in the present tense; cite the document that owns the fact instead.',
    ]);
    expect(verdict.findings[0]).toMatchObject({ file: 'skills/x/SKILL.md', line: 1 });
  });

  it('reads the ROOT documents for archive links too', async () => {
    // `**/*.md` spans zero directories: the README every visitor reads first is exactly
    // the document most likely to cite a finished plan.
    const tree = { 'docs/_plans-archive/done.md': ARCHIVE_OK, 'README.md': 'history: docs/_plans-archive/done.md' };

    expect((await runWith(tree, ['dev'])).ok).toBe(false);
  });

  it('allows a document `except` names to cite the archive', async () => {
    const tree = {
      'docs/_plans-archive/done.md': ARCHIVE_OK,
      'docs/HISTORY.md': 'archived plans live in docs/_plans-archive/done.md',
    };

    expect((await runWith(tree, ['dev'])).ok).toBe(false);
    expect((await runWith(tree, ['dev'], { except: ['docs/HISTORY.md'] })).ok).toBe(true);
  });

  it('reads the documents `docs` names for a citation, and nothing else', async () => {
    const tree = { 'docs/_plans-archive/done.md': ARCHIVE_OK, 'vendor/x.md': 'see docs/_plans-archive/done.md' };

    expect((await runWith(tree, ['dev'], { docs: 'docs/**/*.md' })).ok).toBe(true);
    expect((await runWith(tree, ['dev'], { docs: ['docs/**/*.md', 'vendor/*.md'] })).ok).toBe(false);
  });

  it('fails when there is an archive to cite and `docs` matched no document to read', async () => {
    const verdict = await runWith({ 'docs/_plans-archive/done.md': ARCHIVE_OK }, ['dev'], { docs: 'handbook/*.md' });

    expect(errorsOf(verdict)).toEqual([
      '`docs` matched no document, so nothing was read for a citation of docs/_plans-archive/. Point `docs` at the repository’s documentation.',
    ]);
  });

  it('lets both folder READMEs cite the archive by default', async () => {
    const tree = {
      'docs/_plans-archive/done.md': ARCHIVE_OK,
      'docs/_plans-archive/README.md': 'see docs/_plans-archive/done.md',
      'docs/_plans/README.md': 'see docs/_plans-archive/done.md',
    };

    expect((await runWith(tree, ['dev'])).ok).toBe(true);
  });

  it('allows a link to the archive README — it is a contract, not an archived plan', async () => {
    const tree = {
      'docs/_plans-archive/README.md': 'the contract',
      'skills/x/SKILL.md': 'the contract is docs/_plans-archive/README.md',
    };

    expect((await runWith(tree, ['dev'])).ok).toBe(true);
  });

  it('lets archived plans cite their siblings', async () => {
    const tree = {
      'docs/_plans-archive/done.md': `${ARCHIVE_OK}\n\nsupersedes docs/_plans-archive/older.md`,
      'docs/_plans-archive/older.md': ARCHIVE_OK,
    };

    expect((await runWith(tree, ['dev'])).ok).toBe(true);
  });

  it('skips a tracked document the file source cannot read', async () => {
    const check = planStaleness(OPTIONS);
    const verdict = await runCheck(check, {
      tree: { ...FOLDER, 'a.md': '# a' },
      tracked: ['a.md', 'deleted.md'],
      branches: [],
    });

    expect(verdict.ok).toBe(true);
  });
});

describe('planStaleness — what it examined', () => {
  it('fails over a plans folder that is not there, naming it and the option — it passed with a green tick', async () => {
    const verdict = await runCheck(planStaleness(OPTIONS), { tree: { 'README.md': '# repo' }, branches: ['dev'] });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual([
      'docs/_plans does not exist — this check examined nothing, and a check that examined nothing cannot fail. Point `plansDir` at the folder the plans live in, or create it.',
    ]);
  });

  it('passes a folder that holds no plan yet — nothing is in flight, which is true', async () => {
    const verdict = await runWith({}, ['dev']);

    expect(verdict.ok).toBe(true);
    expect(messages(verdict)).toBe(
      '✓ plan-staleness — 0 plan(s) examined, clean\nno plan in docs/_plans — nothing in flight.',
    );
  });

  it('holds the plans to a floor when told one', async () => {
    const verdict = await runWith({}, ['dev'], { corpus: { atLeast: 1 } });

    expect(errorsOf(verdict)[0]).toContain('examined 0 plan(s) — docs/_plans holds 0 plan(s) — below the floor of 1');
  });

  it('prints the engine’s pass line, naming how many plans it read', async () => {
    const verdict = await runWith({ 'docs/_plans/a.md': ACTIVE }, ['work-branch']);

    expect(messages(verdict)).toBe('✓ plan-staleness — 1 plan(s) examined, clean');
  });

  it('fails a FILE where the plans folder should be, rather than crashing on the listing', async () => {
    const verdict = await runCheck(planStaleness(OPTIONS), { tree: { 'docs/_plans': 'x' }, branches: ['dev'] });

    expect(errorsOf(verdict)).toEqual([
      'docs/_plans is a file, not a folder of plans. Point `plansDir` at the folder.',
    ]);
  });

  it('does not require the archive to exist — a repository that has finished nothing has none', async () => {
    expect((await runWith({ 'docs/_plans/a.md': ACTIVE }, ['work-branch'])).ok).toBe(true);
  });
});

describe('planStaleness — its defaults and its options', () => {
  it('reads `docs/_plans` and archives into `docs/_plans-archive` when neither is said', async () => {
    const check = planStaleness();
    const verdict = await runCheck(check, { tree: { 'docs/_plans/a.md': ACTIVE }, branches: ['dev'] });

    expect(check.tier).toBe('fast');
    expect(errorsOf(verdict)[0]).toContain('move it to docs/_plans-archive/.');
  });

  it('refuses an option it does not have, by name, when the file loads', () => {
    expect(() => planStaleness({ ...OPTIONS, id: 'plan-staleness', plans: 'docs/_plans' } as never)).toThrow(
      "planStaleness 'plan-staleness': `plans` is not an option of planStaleness",
    );
    for (const retired of ['mayCiteArchive', 'undeclaredStatusRatchet']) {
      expect(() => planStaleness({ [retired]: 1 } as never), retired).toThrow(
        `\`${retired}\` is not an option of planStaleness`,
      );
    }
  });

  it('takes a `rule` like every other factory', () => {
    const check = planStaleness({ ...OPTIONS, rule: { statement: 'no plan outlives its work', owner: 'README.md' } });

    expect(check.rule).toMatchObject({ statement: 'no plan outlives its work' });
  });
});
