import { describe, expect, it } from 'vitest';

import { parsePlan } from '../plan-parser/plan-parser.util';
import { renderPlan } from './plan-render.util';

/**
 * The roundtrip this function was written for, finally asserted.
 *
 * `renderPlan` exists — its own docblock says so — to make reversibility a PROPERTY
 * rather than a hope: for any valid plan, parse → render → parse yields the same plan.
 * Nothing called it and nothing tested it, so the property it was built to guarantee
 * was guaranteed by nobody, and a lossy parser would have been found in the field.
 *
 * What the roundtrip covers is what the parser treats as STRUCTURE — status, branch,
 * phases, acceptance. Prose around it is not structure and is not claimed to survive;
 * saying which is which is the point of the test rather than a caveat to it.
 */
const roundtrip = (markdown: string) => {
  const first = parsePlan(markdown);
  const second = parsePlan(renderPlan(first.plan));
  return { first: first.plan, second: second.plan, findings: second.findings };
};

describe('parse → render → parse', () => {
  it('keeps a whole plan identical', () => {
    const { first, second } = roundtrip(
      [
        '**Status:** in-progress',
        '**Branch:** work/thing',
        '',
        '## Phase 1 — the first thing',
        '',
        '**Acceptance.** the command that proves it',
        '',
        '## Phase 2 — the second thing',
        '',
        '**Acceptance.** another command',
      ].join('\n'),
    );

    expect(second).toEqual(first);
  });

  it('keeps a plan with no branch and no acceptance identical', () => {
    // The optional fields are where a render loses something quietly: absent and empty
    // parse the same on the way in and would differ on the way back.
    const { first, second } = roundtrip(['**Status:** draft', '', '## Phase 1 — bare'].join('\n'));

    expect(second).toEqual(first);
    expect(second.branch).toBeUndefined();
  });

  it('renders a plan the parser reads back without complaint', () => {
    const { findings } = roundtrip(['**Status:** done', '**Branch:** b', '', '## Phase 1 — x', '', '**Acceptance.** y'].join('\n'));

    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('is stable — rendering twice produces the same bytes', () => {
    const plan = parsePlan(['**Status:** draft', '', '## Phase 1 — x'].join('\n')).plan;

    expect(renderPlan(plan)).toBe(renderPlan(parsePlan(renderPlan(plan)).plan));
  });
});
