import { describe, expect, it } from 'vitest';

import type { ISpecRequirement, ISpecSource, ISpecSourceResult } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import type { IWardenConfig } from '../../config/config.model';
import { testContext } from '../../../testing';
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
    const { code, text } = run({ specSource: sourceOf({ found: false, items: [], note: 'openspec/specs not found' }) });

    // Exit 2, as the CLI says "could not be used": it was 0, and a CI step passed over no spec tree.
    expect(code).toBe(2);
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

describe('sync-invariants — a note is one sentence, ending once', () => {
  // A source's note that ended in its own mark printed "…elsewhere.. (This" and
  // "…installed here?. (This".
  it.each([
    ['a note with no closing mark gains a full stop', 'openspec/specs not found', 'not found. (This'],
    ['a note ending in a full stop keeps one', 'Set `root` if its features live elsewhere.', 'elsewhere. (This'],
    ['a note ending in a question keeps the question', 'is OpenSpec installed here?', 'installed here? (This'],
  ])('%s', (_name, note, printed) => {
    const found = run({ specSource: sourceOf({ found: false, items: [], note }) }).text;
    const empty = run({ specSource: sourceOf({ found: true, items: [], note }) }).text;
    for (const text of [found, empty]) {
      expect(text).toContain(printed);
      expect(text).not.toMatch(/[.?!]\. \(This/);
    }
  });
});

describe('sync-invariants — a source that gives no note', () => {
  it('still ends each line once', () => {
    expect(run({ specSource: sourceOf({ found: false, items: [] }) }).text).toContain(
      'found nothing: no requirements. (This',
    );
    expect(run({ specSource: sourceOf({ found: true, items: [] }) }).text).toContain(
      'holds no requirements: nothing to reconcile against. (This',
    );
  });
});

describe('sync-invariants reads the documents version control tracks', () => {
  it('ignores a marker in a file git does not track — an installed dependency deposited nothing here', () => {
    const tree = {
      'docs/checkout.md': '<!-- invariant: checkout#totals-include-tax -->\n',
      'node_modules/some-pkg/README.md': '<!-- invariant: checkout#stolen-from-a-dependency -->\n',
    };
    const { io, text } = capture();
    const vcs = testContext({ tree, tracked: ['docs/checkout.md'] }).vcs;

    syncInvariants(
      {
        specSource: sourceOf({ found: true, items: REQUIREMENTS.slice(0, 1) }),
        invariants: { docs: '**/*.md', idPattern: /<!--\s*invariant:\s*([a-z0-9#-]+)\s*-->/g },
      },
      new InMemoryFileSource(tree),
      io,
      vcs,
    );

    // Read from the working tree, the dependency's marker was reported as an orphan.
    expect(text()).toContain('1 requirement(s), 1 invariant(s) found');
    expect(text()).not.toContain('stolen-from-a-dependency');
    expect(text()).toContain('✓ in sync');
  });
});
