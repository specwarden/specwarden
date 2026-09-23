import { describe, expect, it } from 'vitest';

import type { ISpecRequirement, ISpecSource, ISpecSourceResult } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import type { IWardenConfig } from '../../config/config.model';
import { syncInvariants } from './sync-invariants.command';

/**
 * `sync-invariants` PRINTS a reconciliation and writes nothing, so what it prints is the
 * whole of its behaviour — and the case that matters most is the one where it has nothing
 * to compare, because "✓ in sync" over nothing is a reconciliation that cannot fail.
 */

function capture() {
  const out: string[] = [];
  return {
    io: { out: (t: string) => void out.push(t), err: (t: string) => void out.push(t) },
    text: () => out.join(''),
  };
}

const sourceOf = (result: ISpecSourceResult<ISpecRequirement>): ISpecSource => ({
  name: 'fixture',
  requirements: () => result,
  tasks: () => ({ found: true, items: [] }),
});

const REQUIREMENTS = [
  { id: 'checkout#totals-include-tax', statement: 'The system SHALL include tax in every total' },
  { id: 'checkout#refunds-are-partial', statement: 'The system SHALL allow a partial refund' },
];

const run = (config: IWardenConfig, tree: Record<string, string> = {}) => {
  const { io, text } = capture();
  const code = syncInvariants(config, new InMemoryFileSource(tree), io);
  return { code, text: text() };
};

describe('sync-invariants', () => {
  it('says there is nothing to sync when no spec source is configured', () => {
    const { code, text } = run({});

    expect(code).toBe(0);
    expect(text).toContain('no specSource configured');
  });

  it('says the source could not be read — and that this is not a green light', () => {
    const { text } = run({ specSource: sourceOf({ found: false, items: [], note: 'openspec/specs not found' }) });

    expect(text).toContain('found nothing: openspec/specs not found');
    expect(text).toContain('not a green light');
    expect(text).not.toContain('in sync');
  });

  it('never reports "in sync" over a source that was found and holds no requirement', () => {
    // The defect this pins: nothing to deposit and nothing orphaned printed "✓ in sync".
    const { text } = run({
      specSource: sourceOf({ found: true, items: [], note: 'openspec/specs holds no requirement heading' }),
    });

    expect(text).toContain('holds no requirements: openspec/specs holds no requirement heading');
    expect(text).not.toContain('✓ in sync');
  });

  it('proposes every requirement for deposit when no invariant exists yet, and writes nothing', () => {
    const { code, text } = run({ specSource: sourceOf({ found: true, items: REQUIREMENTS }) });

    expect(code).toBe(0);
    expect(text).toContain('2 requirement(s), 0 invariant(s) found');
    expect(text).toContain('+ checkout#totals-include-tax  The system SHALL include tax in every total');
    expect(text).toContain('+ checkout#refunds-are-partial');
    expect(text).toContain('Nothing was written');
  });

  it('reconciles both ways against invariants deposited in the corpus', () => {
    const { text } = run(
      {
        specSource: sourceOf({ found: true, items: REQUIREMENTS }),
        invariants: { docs: 'docs/**/*.md', idPattern: /<!--\s*invariant:\s*([a-z0-9#-]+)\s*-->/g },
      },
      {
        'docs/checkout.md': [
          '<!-- invariant: checkout#totals-include-tax -->',
          'Every total includes tax.',
          '<!-- invariant: checkout#prices-are-rounded -->',
          'A price is rounded half-up.',
        ].join('\n'),
      },
    );

    // One requirement has its invariant; one does not; one invariant lost its requirement.
    expect(text).toContain('2 requirement(s), 2 invariant(s) found');
    expect(text).toContain('+ checkout#refunds-are-partial');
    expect(text).not.toContain('+ checkout#totals-include-tax');
    expect(text).toContain('- checkout#prices-are-rounded');
  });

  it('says "in sync" only when every requirement has an invariant and every invariant a requirement', () => {
    const { text } = run(
      {
        specSource: sourceOf({ found: true, items: REQUIREMENTS.slice(0, 1) }),
        invariants: { docs: 'docs/**/*.md', idPattern: /<!--\s*invariant:\s*([a-z0-9#-]+)\s*-->/g },
      },
      { 'docs/checkout.md': '<!-- invariant: checkout#totals-include-tax -->\n' },
    );

    expect(text).toContain('✓ in sync');
    expect(text).toContain('(1)');
  });
});
