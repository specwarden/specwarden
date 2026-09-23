import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { planStaleness } from './plan-staleness.check';

const ARCHIVE_OK = [
  '# Done',
  '**Started:** 1',
  '**Finished:** 2',
  '**Branch:** b',
  '**Harvested:** h',
  '**Left open:** o',
].join('\n');

const runWith = (tree: Record<string, string>, branches: readonly string[]): Promise<IVerdict> =>
  runCheck(planStaleness({ id: 'plan-staleness', title: 't' }), {
    tree: { 'docs/_plans/README.md': 'The contract.', ...tree },
    branches,
  });

describe('planStaleness — a relative link into the archive', () => {
  // `./_archive/done.md`, written in the document beside the archive, cited it in plain
  // sight: only the archive's repository path, spelled out, was read as a citation.
  const tree = { 'docs/_plans-archive/done.md': ARCHIVE_OK };

  it('is a citation too, resolved against the document it is written in', async () => {
    const verdict = await runWith({ ...tree, 'docs/GUIDE.md': 'See [what we did](./_plans-archive/done.md).' }, [
      'dev',
    ]);

    expect(errorsOf(verdict)).toEqual([
      'docs/GUIDE.md links to docs/_plans-archive/done.md — an archived plan describes the past in the present tense; cite the document that owns the fact instead.',
    ]);
  });

  it('is reported once when both spellings name the same plan', async () => {
    const both = '[a](../docs/_plans-archive/done.md) and docs/_plans-archive/done.md';

    expect(errorsOf(await runWith({ ...tree, 'guides/x.md': both }, ['dev']))).toHaveLength(1);
  });

  it('is not a citation when it lands somewhere else, or on the archive README', async () => {
    const other =
      '[x](./other/done.md) [y](../README.md) [z](./_plans-archive/README.md) [w](./_plans-archive/deep/x.md)';

    expect(errorsOf(await runWith({ ...tree, 'docs/x.md': other }, ['dev']))).toEqual([]);
  });
});
