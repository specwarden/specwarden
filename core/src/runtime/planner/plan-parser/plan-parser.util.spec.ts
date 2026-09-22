import { describe, expect, it } from 'vitest';

import type { IPlan } from '../../../domain';
import { parsePlan } from './plan-parser.util';
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
    status: r() < 0.5 ? 'draft' : 'active',
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
    '**Статус:** active',
    '**Branch:** feature-x',
    '',
    '## Фаза 1 — граница зон',
    'Some prose about the phase.',
    '',
    '**Приёмка.** `pnpm --dir packages/specwarden/core exec vitest run`',
    '',
    '## Фаза 2 — домен и порты',
    '',
    '**Acceptance.** pnpm run tsc',
    '',
    '## Зависимости',
    'not a phase — a section',
  ].join('\n');

  it('extracts status, branch and the phases with their acceptance', () => {
    const { plan, findings } = parsePlan(SAMPLE);
    expect(plan.status).toBe('active');
    expect(plan.branch).toBe('feature-x');
    expect(plan.phases.map((p) => p.title)).toEqual(['граница зон', 'домен и порты']); // the ## section is not a phase
    expect(plan.phases[0].acceptance).toContain('vitest run');
    expect(plan.phases[1].acceptance).toBe('pnpm run tsc');
    expect(findings).toEqual([]);
  });
});

describe('the parser complains rather than skipping silently', () => {
  it('flags a plan with no status', () => {
    const { findings } = parsePlan('# x\n\n## Фаза 1 — a\n**Приёмка.** cmd\n');
    expect(findings.some((f) => f.message.includes('no `**Status:**`'))).toBe(true);
  });

  it('flags a phase with no acceptance command', () => {
    const { findings } = parsePlan('**Status:** draft\n\n## Фаза 1 — a\nprose only\n');
    expect(findings.some((f) => f.severity === 'error' && f.message.includes('no acceptance command'))).toBe(true);
  });
});
