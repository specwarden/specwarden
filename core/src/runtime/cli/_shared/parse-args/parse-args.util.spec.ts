import { describe, expect, it } from 'vitest';

import { type IParsedArgs, parseArgs } from './parse-args.util';

/**
 * The argv grammar is the one thing every command shares, so a slip here is a slip in
 * all of them at once — and it is silent: a flag the parser does not recognise is not
 * an error, it simply never reaches the command that was waiting for it.
 */

describe('parseArgs reads the command and its flags', () => {
  it('reads the command, flags with values, and boolean flags', () => {
    expect(parseArgs(['check', '--tier', 'fast'])).toMatchObject({ command: 'check', tier: 'fast' });
    expect(parseArgs(['check', '--id', 'x', '--base', 'origin/dev', '--shard', '1/3'])).toMatchObject({
      command: 'check',
      ids: ['x'],
      base: 'origin/dev',
      shard: '1/3',
    });
    expect(parseArgs(['check', '--all', '--list', '--json'])).toMatchObject({ all: true, list: true, json: true });
  });

  it('an empty argv is no command and every switch off — never a default the caller did not type', () => {
    expect(parseArgs([])).toEqual({
      ids: [],
      positionals: [],
      all: false,
      list: false,
      json: false,
      fix: false,
      tighten: false,
      ifRelevant: false,
      relevance: false,
      showSkipped: false,
    });
  });

  it.each<[string, keyof IParsedArgs]>([
    ['--all', 'all'],
    ['--list', 'list'],
    ['--json', 'json'],
    ['--fix', 'fix'],
    ['--tighten', 'tighten'],
    ['--if-relevant', 'ifRelevant'],
    ['--relevance', 'relevance'],
    ['--show-skipped', 'showSkipped'],
  ])('%s turns on %s and nothing else', (flag, field) => {
    // A switch that also flipped a neighbour — `--tighten` implying `--fix`, say —
    // would make a read-only run write. Each one is asserted in isolation for that.
    const parsed = parseArgs(['check', flag]);
    const on = (['all', 'list', 'json', 'fix', 'tighten', 'ifRelevant', 'relevance', 'showSkipped'] as const).filter(
      (k) => parsed[k],
    );
    expect(on).toEqual([field]);
  });

  it.each<[string, keyof IParsedArgs]>([
    ['--tier', 'tier'],
    ['--base', 'base'],
    ['--shard', 'shard'],
    ['--jobs', 'jobs'],
    ['--template', 'template'],
    ['--family', 'family'],
    ['--reporter', 'reporter'],
  ])('%s stores its value in %s, and the value is not mistaken for a positional', (flag, field) => {
    const parsed = parseArgs(['check', flag, 'value']);
    expect(parsed[field]).toBe('value');
    expect(parsed.positionals).toEqual([]);
    expect(parsed.command).toBe('check');
  });
});

describe('repeatable and positional input', () => {
  it('collects a repeated --id into ids, in order', () => {
    expect(parseArgs(['check', '--id', 'a', '--id', 'b']).ids).toEqual(['a', 'b']);
    expect(parseArgs(['check', '--tier', 'fast']).ids).toEqual([]);
  });

  it('takes the first positional as the command regardless of flag order', () => {
    const parsed = parseArgs(['--tier', 'fast', 'check']);
    expect(parsed.command).toBe('check');
    // `fast` was consumed as the tier's value; it must not ALSO be the command.
    expect(parsed.tier).toBe('fast');
    expect(parsed.positionals).toEqual([]);
  });

  it('keeps the bare tokens after the command, in order, and never includes the command itself', () => {
    // They used to be dropped, which is why `new <id>` could not take its id as a word.
    const parsed = parseArgs(['new', 'doc-links', '--family', 'docs', 'extra']);
    expect(parsed.command).toBe('new');
    expect(parsed.positionals).toEqual(['doc-links', 'extra']);
    expect(parsed.family).toBe('docs');
  });

  it('a later value flag overwrites an earlier one rather than accumulating', () => {
    expect(parseArgs(['check', '--tier', 'fast', '--tier', 'heavy']).tier).toBe('heavy');
  });
});

describe('a value flag does not swallow what follows it', () => {
  it('leaves the value unset and still parses the next flag', () => {
    // `--base` with no value before `--json`: base stays unset and --json is still parsed.
    const a = parseArgs(['check', '--base', '--json']);
    expect(a.base).toBeUndefined();
    expect(a.json).toBe(true);
    expect(parseArgs(['check', '--id', '--all']).ids).toEqual([]);
    expect(parseArgs(['check', '--id', '--all']).all).toBe(true);
  });

  it('a value flag at the very end of argv is unset, not a crash and not the string "undefined"', () => {
    expect(parseArgs(['check', '--tier']).tier).toBeUndefined();
    expect(parseArgs(['check', '--id']).ids).toEqual([]);
    expect(parseArgs(['init', '--template']).template).toBeUndefined();
  });

  it('an unknown flag is ignored and never becomes the command', () => {
    // The first bare token is the command; a `--flag` the grammar does not know is
    // not bare, so `specwarden --verbose check` is still a check run.
    const parsed = parseArgs(['--verbose', 'check']);
    expect(parsed.command).toBe('check');
    expect(parsed.positionals).toEqual([]);
  });
});
