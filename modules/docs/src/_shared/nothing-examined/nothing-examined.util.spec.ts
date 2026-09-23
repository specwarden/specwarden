import { describe, expect, it } from 'vitest';

import { errorsOf } from 'specwarden';
import { nothingExamined } from './nothing-examined.util';

describe('nothingExamined', () => {
  it('is a FAILING verdict — an empty corpus must never read as a clean run', () => {
    expect(nothingExamined('doc-paths', 'docs/**/*.md').ok).toBe(false);
  });

  it('names the pathspec, so the repair is an edit rather than an investigation', () => {
    expect(errorsOf(nothingExamined('doc-paths', 'handbook/**/*.md'))[0]).toContain(
      'no document matched `handbook/**/*.md`',
    );
  });

  it('names the kind of file it expected, and attributes the finding to the rule', () => {
    const verdict = nothingExamined('doc-symbols', 'src/**/*.ts', 'code file');

    expect(verdict.findings).toEqual([expect.objectContaining({ severity: 'error', ruleId: 'doc-symbols' })]);
    expect(errorsOf(verdict)[0]).toMatch(/^no code file matched `src\/\*\*\/\*\.ts`/);
  });
});
