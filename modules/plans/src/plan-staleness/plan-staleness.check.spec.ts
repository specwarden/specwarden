import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from 'specwarden';
import { planStaleness } from './plan-staleness.check';

/**
 * Carried from the consumer check this replaced, which had itself been written to let that
 * check's predecessor be deleted safely. The cases are the states a person cannot see: a
 * plan whose branch is gone, a draft that names one, an archive entry missing the fields
 * that say how far to trust it, and a live document citing the archive.
 */
const ARCHIVE_HEADER = [
  { label: 'Started', pattern: /^\*\*Started:\*\*\s*\S/m },
  { label: 'Finished', pattern: /^\*\*Finished:\*\*\s*\S/m },
  { label: 'Left open', pattern: /^\*\*Left open:\*\*\s*\S/m },
];

const check = planStaleness({
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
});

const ACTIVE = ['**Status:** active', '**Branch:** work-branch'].join('\n');
const ARCHIVE_OK = ['# Done', '**Started:** 2026-01-01', '**Finished:** 2026-01-02', '**Left open:** nothing'].join(
  '\n',
);

const runWith = (files: Record<string, string>, branches: string[] | undefined, tracked = Object.keys(files)) => {
  const source = new InMemoryFileSource(files, '');
  const vcs = { branchNames: () => branches, trackedFiles: () => tracked };
  return check.run({ files: source, vcs } as never);
};

const messages = (verdict: { findings: readonly { message: string }[] }) =>
  verdict.findings.map((f) => f.message).join('\n');

describe('planStaleness', () => {
  it('passes an active plan whose branch exists', () => {
    expect(runWith({ 'docs/_plans/thing.md': ACTIVE }, ['dev', 'work-branch']).ok).toBe(true);
  });

  it('fails an active plan that declares no branch', () => {
    const verdict = runWith({ 'docs/_plans/thing.md': '**Status:** active' }, ['dev']);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/declares no branch/);
  });

  it('fails a draft that names a branch — it arms a failure for the day that branch goes', () => {
    const verdict = runWith({ 'docs/_plans/thing.md': ['**Status:** draft', '**Branch:** work-branch'].join('\n') }, [
      'dev',
      'work-branch',
    ]);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/draft yet declares branch/);
  });

  it('passes a draft with no branch — draft is a first-class state', () => {
    expect(runWith({ 'docs/_plans/thing.md': '**Status:** draft' }, ['dev']).ok).toBe(true);
  });

  it('fails an active plan whose branch is gone — the work merged unharvested', () => {
    const verdict = runWith({ 'docs/_plans/thing.md': ACTIVE }, ['dev']);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/no longer exists here or on the remote/);
  });

  /**
   * The lifecycle rule, reused rather than restated: a checkout with no refs cannot tell
   * whether the branch is gone, and a guess there archives live work.
   */
  it('skips the branch question when the checkout has no refs, instead of failing it', () => {
    const verdict = runWith({ 'docs/_plans/thing.md': ACTIVE }, undefined);

    expect(verdict.ok).toBe(true);
    expect(messages(verdict)).toMatch(/SKIPPED, this checkout has no branch refs/);
  });

  it('fails a plan with no status against the ratchet', () => {
    const verdict = runWith({ 'docs/_plans/thing.md': '# no status here' }, ['dev']);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/declare no status/);
  });

  it('does not treat the folder README as a plan', () => {
    expect(runWith({ 'docs/_plans/README.md': '# Plans' }, ['dev']).ok).toBe(true);
  });

  it('names each missing archive header field', () => {
    const verdict = runWith({ 'docs/_plans-archive/done.md': '# Done\n**Started:** 2026-01-01' }, ['dev']);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/Finished/);
    expect(messages(verdict)).toMatch(/Left open/);
  });

  it('passes a complete archive header', () => {
    expect(runWith({ 'docs/_plans-archive/done.md': ARCHIVE_OK }, ['dev']).ok).toBe(true);
  });

  it('fails a live document that links into the archive', () => {
    const files = {
      'docs/_plans-archive/done.md': ARCHIVE_OK,
      'skills/x/SKILL.md': 'see docs/_plans-archive/done.md for the reasoning',
    };

    const verdict = runWith(files, ['dev'], ['skills/x/SKILL.md']);

    expect(verdict.ok).toBe(false);
    expect(messages(verdict)).toMatch(/links to docs\/_plans-archive\/done\.md/);
  });

  it('allows the one document declared able to cite the archive', () => {
    const files = {
      'docs/_plans-archive/done.md': ARCHIVE_OK,
      'docs/_plans/README.md': 'archived plans live in docs/_plans-archive/done.md',
    };

    expect(runWith(files, ['dev'], ['docs/_plans/README.md']).ok).toBe(true);
  });

  it('allows a link to the archive README — it is a contract, not an archived plan', () => {
    const files = {
      'docs/_plans-archive/README.md': 'the contract',
      'skills/x/SKILL.md': 'the contract is docs/_plans-archive/README.md',
    };

    expect(runWith(files, ['dev'], ['skills/x/SKILL.md']).ok).toBe(true);
  });

  it('lets archived plans cite their siblings', () => {
    const files = {
      'docs/_plans-archive/done.md': `${ARCHIVE_OK}\n\nsupersedes docs/_plans-archive/older.md`,
      'docs/_plans-archive/older.md': ARCHIVE_OK,
    };

    expect(runWith(files, ['dev']).ok).toBe(true);
  });

  it('passes a repository with no plans at all', () => {
    expect(runWith({ 'README.md': '# repo' }, ['dev'], ['README.md']).ok).toBe(true);
  });
});
