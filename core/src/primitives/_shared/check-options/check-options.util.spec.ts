import { describe, expect, it } from 'vitest';

import { CheckOptionsError, checkOptions } from './check-options.util';

/**
 * A factory's options, checked where they were written. The case that matters most is the
 * one nothing reported before: an option dropped in silence because its name was wrong —
 * an exemption, a pattern or a directory the author believed was in force.
 */
const SPEC = {
  in: { kind: 'string', required: true },
  pattern: { kind: 'regexp', required: true },
  except: { kind: 'array' },
} as const;

const refusal = (options: unknown): string => {
  try {
    checkOptions('forbidPattern', options, SPEC);
  } catch (error) {
    expect(error).toBeInstanceOf(CheckOptionsError);
    return (error as Error).message;
  }
  throw new Error('checkOptions accepted what it should have refused');
};

describe('checkOptions', () => {
  it('accepts every option it knows, and the identity every factory shares', () => {
    expect(() =>
      checkOptions(
        'forbidPattern',
        { id: 'x', title: 't', tier: 'fast', rule: 'no TODO', in: 'src/**', pattern: /TODO/, except: [] },
        SPEC,
      ),
    ).not.toThrow();
  });

  it('refuses a misspelled option by name — it was dropped in silence, and the check ran without it', () => {
    expect(refusal({ in: 'src/**', pattern: /x/, excpet: ['a'] })).toContain(
      '`excpet` is not an option of forbidPattern',
    );
  });

  it('refuses a missing required option, naming the check', () => {
    expect(refusal({ id: 'no-todo', in: 'src/**' })).toContain("forbidPattern 'no-todo': `pattern` is required");
  });

  it('refuses the wrong kind, saying what it was and what it should be', () => {
    expect(refusal({ in: 'src/**', pattern: 'TODO' })).toContain('`pattern` must be a RegExp (got the string "TODO")');
  });

  it('accepts either of several kinds, and names both when neither is given', () => {
    expect(() => checkOptions('f', { rule: 'a statement' }, {})).not.toThrow();
    expect(() => checkOptions('f', { rule: { statement: 's' } }, {})).not.toThrow();
    expect(() => checkOptions('f', { when: () => true }, {})).not.toThrow();
    expect(() => {
      checkOptions('f', { rule: 3 }, {});
    }).toThrow('`rule` must be a string or an object (got number 3)');
  });

  it('reports every problem at once, and lists the factory’s own options', () => {
    const message = refusal({ pattern: 'x', nope: 1 });

    expect(message).toContain('`nope` is not an option');
    expect(message).toContain('`pattern` must be a RegExp');
    expect(message).toContain('`in` is required');
    expect(message).toContain('Its own options are: except, in, pattern.');
  });

  it('ignores an option explicitly set to undefined — a spread of an optional value', () => {
    expect(() => checkOptions('forbidPattern', { in: 'a', pattern: /x/, except: undefined }, SPEC)).not.toThrow();
  });

  it('refuses something that is not an options object at all', () => {
    expect(refusal('src/**')).toContain('takes one options object, and was handed the string "src/**"');
    expect(refusal([])).toContain('handed a array');
  });
});

describe('checkOptions — how a wrong value is described', () => {
  it.each([
    [42, 'number 42'],
    [true, 'boolean true'],
    [/x/, 'regexp /x/'],
    [() => 1, 'a function'],
    [{}, 'a object'],
    [null, 'null'],
  ])('%s is described as %s', (value, described) => {
    expect(refusal({ in: value, pattern: /x/ })).toContain(`(got ${described})`);
  });
});
