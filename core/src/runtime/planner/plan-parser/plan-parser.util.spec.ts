import { describe, expect, it } from 'vitest';

import type { IPlan } from '../../../domain';
import { parsePlan, unquoteCommand } from './plan-parser.util';
import { renderPlan } from '../plan-render/plan-render.util';

/** A tiny deterministic PRNG so the generated corpus is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatePlan(seed: number): IPlan {
  const r = mulberry32(seed);
  const phases = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => ({
    title: `phase ${i} does thing ${Math.floor(r() * 100)}`,
    acceptance: r() < 0.2 ? undefined : `pnpm run check-${Math.floor(r() * 100)}`,
  }));
  return {
    status: (['draft', 'active', 'done'] as const)[Math.floor(r() * 3)],
    branch: r() < 0.5 ? undefined : `feat-${Math.floor(r() * 1000)}`,
    phases,
  };
}

describe('plan reversibility is a property, not a hope', () => {
  it('parse ∘ render is the identity on any generated valid plan', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const plan = generatePlan(seed);
      const reparsed = parsePlan(renderPlan(plan)).plan;
      expect(reparsed, `roundtrip failed for seed ${seed}`).toEqual(plan);
    }
  });
});

describe('parsePlan on a real-format plan', () => {
  const SAMPLE = [
    '# Some feature',
    '',
    '**Status:** active',
    '**Branch:** feature-x',
    '',
    '## Phase 1 — the zone boundary',
    'Some prose about the phase.',
    '',
    '**Acceptance.** `pnpm --dir core exec vitest run`',
    '',
    '## Phase 2 — domain and ports',
    '',
    '**Acceptance.** pnpm run tsc',
    '',
    '## Dependencies',
    'not a phase — a section',
  ].join('\n');

  it('extracts status, branch and the phases with their acceptance', () => {
    const { plan, findings } = parsePlan(SAMPLE);
    expect(plan.status).toBe('active');
    expect(plan.branch).toBe('feature-x');
    expect(plan.phases.map((p) => p.title)).toEqual(['the zone boundary', 'domain and ports']); // the ## section is not a phase
    expect(plan.phases[0].acceptance).toContain('vitest run');
    expect(plan.phases[1].acceptance).toBe('pnpm run tsc');
    expect(findings).toEqual([]);
  });
});

describe('the parser complains rather than skipping silently', () => {
  it('flags a plan with no status', () => {
    const { findings } = parsePlan('# x\n\n## Phase 1 — a\n**Acceptance.** cmd\n');
    expect(findings.some((f) => f.message.includes('no `**Status:**`'))).toBe(true);
  });

  it('flags a phase with no acceptance command', () => {
    const { findings } = parsePlan('**Status:** draft\n\n## Phase 1 — a\nprose only\n');
    expect(findings.some((f) => f.severity === 'error' && f.message.includes('no acceptance command'))).toBe(true);
  });
});

describe('one acceptance convention: the line, or a fenced block under the phase', () => {
  const plan = (...lines: string[]) => parsePlan(['**Status:** active', '', ...lines].join('\n'));

  it('reads a fenced bash or sh block as the acceptance — the form plan-shape and the templates use', () => {
    const { plan: p, findings } = plan(
      '## Phase 1 — a',
      'prose',
      '```bash',
      'pnpm gate --id unit',
      '```',
      '## Phase 2 — b',
      '```sh',
      'true',
      '```',
    );
    expect(p.phases.map((x) => x.acceptance)).toEqual(['pnpm gate --id unit', 'true']);
    expect(findings).toEqual([]);
  });

  it('chains a block of several commands so the first failure fails it, dropping blanks and comments', () => {
    const { plan: p } = plan(
      '## Phase 1 — a',
      '```bash',
      '# setup',
      'pnpm build',
      '',
      'pnpm test \\',
      '  --run',
      '```',
    );
    expect(p.phases[0].acceptance).toBe('pnpm build && pnpm test --run');
  });

  it('ignores a fence in another language, and an empty block', () => {
    const { plan: p, findings } = plan('## Phase 1 — a', '```js', 'run()', '```', '```bash', '```');
    expect(p.phases[0].acceptance).toBeUndefined();
    expect(findings.map((f) => f.message)).toEqual([
      'phase "a" names no acceptance command — a phase without one has no definition of done. Write an `**Acceptance.**` line, or a fenced `bash` block under the heading.',
    ]);
  });

  it('takes whichever form comes first', () => {
    const { plan: p } = plan('## Phase 1 — a', '**Acceptance:** first', '```bash', 'second', '```');
    expect(p.phases[0].acceptance).toBe('first');
  });

  it('strips the backticks markdown writes around an inline command — the shell read them as substitution', () => {
    expect(plan('## Phase 1 — a', '**Acceptance.** `pnpm --dir core exec vitest run`').plan.phases[0].acceptance).toBe(
      'pnpm --dir core exec vitest run',
    );
    expect(plan('## Phase 1 — a', '**Acceptance:** ``echo `x` ``').plan.phases[0].acceptance).toBe('echo `x`');
    expect(plan('## Phase 1 — a', '**Acceptance**: a `quoted` word').plan.phases[0].acceptance).toBe('a `quoted` word');
  });

  it('ends a phase at the next section, so a later section’s block is not the last phase’s acceptance', () => {
    const { plan: p } = plan('## Phase 1 — a', 'prose', '## Harvest', '```bash', 'not-an-acceptance', '```');
    expect(p.phases[0].acceptance).toBeUndefined();
  });

  it('keeps a `###` subsection inside its phase', () => {
    const { plan: p } = plan('## Phase 1 — a', '### Decision: x', '```bash', 'true', '```');
    expect(p.phases[0].acceptance).toBe('true');
  });
});

describe('one status vocabulary: draft, active, done', () => {
  it('reads `done` as done — it was "draft", beside a finding that it declared no status', () => {
    const parsed = parsePlan('**Status:** done\n\n## Phase 1 — a\n**Acceptance.** true\n');
    expect([parsed.declared, parsed.plan.status, parsed.findings]).toEqual(['done', 'done', []]);
  });

  it('reports an undeclared status as undeclared, naming the three', () => {
    const parsed = parsePlan('# x\n\n## Phase 1 — a\n**Acceptance.** true\n');
    expect(parsed.declared).toBeUndefined();
    expect(parsed.findings.map((f) => f.message)).toEqual(['plan declares no `**Status:**` (draft, active, done)']);
  });

  it('reads a status in backticks, in any case', () => {
    expect(parsePlan('**Status:** `Active`\n').declared).toBe('active');
  });
});

describe('unquoteCommand', () => {
  it('takes off wrapping inline-code delimiters and nothing else', () => {
    expect(unquoteCommand(' `a b` ')).toBe('a b');
    expect(unquoteCommand('a `b`')).toBe('a `b`');
    expect(unquoteCommand('plain')).toBe('plain');
  });
});
