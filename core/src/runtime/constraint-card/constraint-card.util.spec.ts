import { describe, expect, it } from 'vitest';

import type { IRule } from '../../domain';
import {
  ConstraintCardMissingLineError,
  ConstraintCardTooLongError,
  ConstraintCardTooManyLinesError,
  generateConstraintCard,
} from './constraint-card.util';

const rule = (id: string, statement: string, over: Partial<IRule> = {}): IRule => ({
  id,
  statement,
  owner: 'AGENTS.md',
  enforcement: { enforcedBy: [id] },
  ...over,
});

const irreversible = (id: string, card: string): IRule =>
  rule(id, `declarative form of ${id}`, { irreversible: true, card });

describe('generateConstraintCard', () => {
  it('emits only the irreversible rules, in roster order', () => {
    const card = generateConstraintCard([
      irreversible('a', 'Never delete a volume'),
      rule('b', 'lint passes'), // not irreversible → excluded
      irreversible('c', 'Never force-push a shared branch'),
    ]);

    expect(card).toContain('- Never delete a volume');
    expect(card).toContain('- Never force-push a shared branch');
    expect(card).not.toContain('lint passes');
    expect(card.indexOf('volume')).toBeLessThan(card.indexOf('force-push'));
  });

  it('emits the CARD wording, never the declarative statement', () => {
    // Two registers, two readers. The statement is for whoever audits the rule set;
    // the card is read mid-task by whoever is about to act, and the consumers of this
    // card enforce a shape ("every line is a prohibition") the statement would fail.
    const card = generateConstraintCard([irreversible('a', 'Never delete a volume')]);

    expect(card).not.toContain('declarative form of a');
  });

  it('refuses an irreversible rule with no card line, rather than degrading to the statement', () => {
    const rules = [rule('a', 'no volume is ever deleted', { irreversible: true })];

    expect(() => generateConstraintCard(rules)).toThrow(ConstraintCardMissingLineError);
    expect(() => generateConstraintCard(rules)).toThrow(/\ba\b/);
  });

  it('refuses an empty card line for the same reason', () => {
    expect(() => generateConstraintCard([irreversible('a', '   ')])).toThrow(ConstraintCardMissingLineError);
  });

  it('names every offender at once — fixing them one error at a time is the slow way', () => {
    const rules = [rule('a', 'x', { irreversible: true }), rule('b', 'y', { irreversible: true })];

    expect(() => generateConstraintCard(rules)).toThrow(/a, b/);
  });

  it('is deterministic — an unchanged roster regenerates byte-identically', () => {
    const rules = [irreversible('a', 'Never x'), irreversible('b', 'Never y')];

    expect(generateConstraintCard(rules)).toBe(generateConstraintCard(rules));
  });

  it('refuses a card over its byte budget', () => {
    const rules = [irreversible('a', 'Never do a very long thing that will not fit in the budget')];

    expect(() => generateConstraintCard(rules, { maxBytes: 20 })).toThrow(ConstraintCardTooLongError);
  });

  it('refuses a card over its line limit, and says to take a rule off rather than raise it', () => {
    const rules = [irreversible('a', 'Never a'), irreversible('b', 'Never b'), irreversible('c', 'Never c')];

    expect(() => generateConstraintCard(rules, { maxLines: 2 })).toThrow(ConstraintCardTooManyLinesError);
    expect(() => generateConstraintCard(rules, { maxLines: 2 })).toThrow(/Take a rule off the card/);
  });

  it('counts the limit against the irreversible rules only', () => {
    const rules = [irreversible('a', 'Never a'), rule('b', 'x'), rule('c', 'y')];

    expect(() => generateConstraintCard(rules, { maxLines: 1 })).not.toThrow();
  });

  it('carries a note as an HTML comment — for the reader of the file, not the card', () => {
    const card = generateConstraintCard([irreversible('a', 'Never a')], {
      note: 'generated; edit the register instead',
    });

    expect(card).toContain('<!--');
    expect(card).toContain('edit the register instead');
    // The injector strips comments, so the note must not be a rule line.
    expect(card.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(1);
  });

  it('produces no rule lines at all for a register with nothing irreversible', () => {
    const card = generateConstraintCard([rule('a', 'x')]);

    expect(card.split('\n').filter((l) => l.startsWith('- '))).toEqual([]);
  });
});
