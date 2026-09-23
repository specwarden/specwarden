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
  id: 'plan-staleness',
  title: 'a finished plan leaves the live corpus',
  plansDir: 'docs/_plans',
  archiveDir: 'docs/_plans-archive',
  branchDeclaration: /^\*\*Branch:\*\*\s*`?([^\s`]+)`?/m,
  statusDeclaration: /^\*\*Status:\*\*\s*`?(draft|active)`?/im,
  activeStatuses: ['active'],
  archiveHeader: ARCHIVE_HEADER,
  mayCiteArchive: ['docs/_plans/README.md'],
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
  it('is a product-zone, read-only check in the fast tier by default', () => {
    expect(planStaleness(OPTIONS)).toMatchObject({ zone: 'product', capabilities: ['read'], tier: 'fast' });
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
      'docs/_plans/thing.md: is active and declares no branch. An active plan names where its work happens.',
    ]);
  });

  it('fails a draft that names a branch — it arms a failure for the day that branch goes', async () => {
    const draft = ['**Status:** draft', '**Branch:** work-branch'].join('\n');
    const verdict = await runWith({ 'docs/_plans/thing.md': draft }, ['dev', 'work-branch']);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/draft yet declares branch `work-branch`/);
  });

  // It was read as a draft, and failed as "a draft that declares a branch".
  it('passes a done plan that keeps its branch, and says to harvest and move it', async () => {
    const done = ['**Status:** done', '**Branch:** work-branch'].join('\n');
    const verdict = await runWith({ 'docs/_plans/thing.md': done }, ['dev'], {
      statusDeclaration: /^\*\*Status:\*\*\s*`?(draft|active|done)`?/im,
    });

    expect(verdict.ok).toBe(true);
    expect(messages(verdict)).toContain('docs/_plans/thing.md: is done — harvest it, then move it to');
  });

  it('passes a draft with no branch — draft is a first-class state', async () => {
    expect((await runWith({ 'docs/_plans/thing.md': '**Status:** draft' }, ['dev'])).ok).toBe(true);
  });

  it('fails an active plan whose branch is gone — the work merged unharvested', async () => {
    const verdict = await runWith({ 'docs/_plans/thing.md': ACTIVE }, ['dev']);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/no longer exists here or on the remote.*docs\/_plans-archive\//s);
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

  it('fails plans with no status past the ratchet, and holds them under it', async () => {
    const tree = { 'docs/_plans/a.md': '# no status here', 'docs/_plans/b.md': '# nor here' };

    const failing = await runWith(tree, ['dev']);
    expect(errorsOf(failing)).toEqual(['2 plan(s) declare no status; the ratchet is 0.']);
    // Each undeclared plan is still NAMED, as a note, so the reader knows which to fix.
    expect(messages(failing)).toContain('docs/_plans/a.md: no status declaration');

    const held = await runWith(tree, ['dev'], { undeclaredStatusRatchet: 2 });
    expect(held.ok).toBe(true);
    expect(messages(held)).toContain('✓ plan staleness — 2 plan(s) without a status (ratchet 2), archive clean');
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
    expect(messages(verdict)).toContain('0 plan(s) without a status');
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
      'skills/x/SKILL.md links to docs/_plans-archive/done.md — an archived plan describes the past in the present tense; cite the document that owns the fact instead.',
    ]);
  });

  it('reads the ROOT documents for archive links too', async () => {
    // `**/*.md` spans zero directories: the README every visitor reads first is exactly
    // the document most likely to cite a finished plan.
    const tree = { 'docs/_plans-archive/done.md': ARCHIVE_OK, 'README.md': 'history: docs/_plans-archive/done.md' };

    expect((await runWith(tree, ['dev'])).ok).toBe(false);
  });

  it('allows the one document declared able to cite the archive', async () => {
    const tree = {
      'docs/_plans-archive/done.md': ARCHIVE_OK,
      'docs/_plans/README.md': 'archived plans live in docs/_plans-archive/done.md',
    };

    expect((await runWith(tree, ['dev'])).ok).toBe(true);
  });

  it('lets both folder READMEs cite the archive by default', async () => {
    const tree = {
      'docs/_plans-archive/done.md': ARCHIVE_OK,
      'docs/_plans-archive/README.md': 'see docs/_plans-archive/done.md',
      'docs/_plans/README.md': 'see docs/_plans-archive/done.md',
    };

    expect((await runWith(tree, ['dev'], { mayCiteArchive: undefined })).ok).toBe(true);
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
    expect(messages(verdict)).toBe('no plan in docs/_plans — nothing in flight');
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
    const check = planStaleness({ id: 'plan-staleness', title: 't' });
    const verdict = await runCheck(check, { tree: { 'docs/_plans/a.md': ACTIVE }, branches: ['dev'] });

    expect(check.tier).toBe('fast');
    expect(errorsOf(verdict)[0]).toContain('move it to docs/_plans-archive/.');
  });

  it('refuses an option it does not have, by name, when the file loads', () => {
    expect(() => planStaleness({ ...OPTIONS, plans: 'docs/_plans' } as never)).toThrow(
      "planStaleness 'plan-staleness': `plans` is not an option of planStaleness",
    );
  });

  it('takes a `rule` like every other factory', () => {
    const check = planStaleness({ ...OPTIONS, rule: { statement: 'no plan outlives its work', owner: 'README.md' } });

    expect(check.rule).toMatchObject({ statement: 'no plan outlives its work' });
  });
});
