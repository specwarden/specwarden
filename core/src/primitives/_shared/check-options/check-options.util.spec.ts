import { describe, expect, it } from 'vitest';

import { CheckOptionsError, checkOptions } from './check-options.util';

/**
 * A factory's options, checked where they were written. The case that matters most is the
 * one nothing reported before: an option dropped in silence because its name was wrong —
 * an exemption, a pattern or a directory the author believed was in force.
 */
const SPEC = {
  files: { kind: 'string', required: true },
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
        { id: 'x', title: 't', tier: 'fast', rule: 'no TODO', files: 'src/**', pattern: /TODO/, except: [] },
        SPEC,
      ),
    ).not.toThrow();
  });

  it('refuses a misspelled option by name — it was dropped in silence, and the check ran without it', () => {
    expect(refusal({ files: 'src/**', pattern: /x/, excpet: ['a'] })).toContain(
      '`excpet` is not an option of forbidPattern',
    );
  });

  it('refuses a missing required option, naming the check', () => {
    expect(refusal({ id: 'no-todo', files: 'src/**' })).toContain("forbidPattern 'no-todo': `pattern` is required");
  });

  it('refuses the wrong kind, saying what it was and what it should be', () => {
    expect(refusal({ files: 'src/**', pattern: 'TODO' })).toContain(
      '`pattern` must be a RegExp (got the string "TODO")',
    );
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
    expect(message).toContain('`files` is required');
    expect(message).toContain('Its own options are: except, files, pattern.');
  });

  it('ignores an option explicitly set to undefined — a spread of an optional value', () => {
    expect(() => checkOptions('forbidPattern', { files: 'a', pattern: /x/, except: undefined }, SPEC)).not.toThrow();
  });

  it('refuses something that is not an options object at all', () => {
    expect(refusal('src/**')).toContain('takes one options object, and was handed the string "src/**"');
    expect(refusal([])).toContain('handed a array');
  });
});

describe('checkOptions — what a spec may say beyond a kind', () => {
  // An empty list of what to scan scans nothing, and a check over nothing reports success.
  it('refuses an empty list or string where the spec says `nonEmpty`', () => {
    const spec = { dirs: { kind: 'array', nonEmpty: true }, glob: { kind: 'string', nonEmpty: true } } as const;
    expect(() => checkOptions('f', { dirs: [], glob: '' }, spec)).toThrow(
      '`dirs` is empty, which selects nothing to check — a check over nothing reports success; `glob` is empty',
    );
    expect(() => checkOptions('f', { dirs: ['docs'], glob: '*.md' }, spec)).not.toThrow();
  });

  // Accepted and dropped, an identity field a factory cannot honour was a setting nobody had.
  it('refuses an identity field the spec marks refused, with its reason, and never lists it as an option', () => {
    const spec = { cmd: { kind: 'string' }, ratchet: { refused: 'there is no count to tolerate' } } as const;
    let message = '';
    try {
      checkOptions('commandCheck', { cmd: 'x', ratchet: 3 }, spec);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('`ratchet` is not an option of commandCheck — there is no count to tolerate');
    expect(message).toContain('Its own options are: cmd.');
  });

  // A factory that builds no check — a spec source — took `tier` and `rule` and dropped them.
  it('with `identity: false`, refuses the fields every CHECK factory shares', () => {
    expect(() =>
      checkOptions('openspec', { dir: 'openspec', tier: 'fast' }, { dir: { kind: 'string' } }),
    ).not.toThrow();
    expect(() =>
      checkOptions('openspec', { dir: 'openspec', tier: 'fast' }, { dir: { kind: 'string' } }, { identity: false }),
    ).toThrow('`tier` is not an option of openspec');
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
    expect(refusal({ files: value, pattern: /x/ })).toContain(`(got ${described})`);
  });
});
