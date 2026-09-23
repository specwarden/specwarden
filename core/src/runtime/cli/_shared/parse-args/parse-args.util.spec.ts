import { describe, expect, it } from 'vitest';

import { type IParsedArgs, KNOWN_FLAGS, parseArgs } from './parse-args.util';

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
      help: false,
      problems: [],
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

describe('a value flag does not swallow what follows it — and says it had no value', () => {
  it('leaves the value unset, still parses the next flag, and records the problem by name', () => {
    // `--base --json` swallowed nothing, and dropped `--base` in silence: a value flag with
    // no value is refused now, rather than run as if it had not been typed.
    const a = parseArgs(['check', '--base', '--json']);
    expect([a.base, a.json, a.problems]).toEqual([undefined, true, ['--base needs a value, and --json is a flag']]);
    const b = parseArgs(['check', '--id', '--all']);
    expect([b.ids, b.all, b.problems]).toEqual([[], true, ['--id needs a value, and --all is a flag']]);
  });

  it('a value flag at the very end of argv is a problem — `--id` there ran EVERY check', () => {
    expect(parseArgs(['check', '--tier']).problems).toEqual(['--tier needs a value']);
    expect(parseArgs(['check', '--id']).problems).toEqual(['--id needs a value']);
    expect(parseArgs(['init', '--template']).template).toBeUndefined();
  });

  it('a value may start with a single dash — `--jobs -3` is a value, refused later for what it is', () => {
    expect(parseArgs(['check', '--jobs', '-3'])).toMatchObject({ jobs: '-3', problems: [] });
  });
});

describe('what the grammar does not know', () => {
  it('an unknown flag is a problem, named, and never becomes the command', () => {
    // `--tighen` and `--fixx` ran a plain check and exited as if nothing had been asked.
    const parsed = parseArgs(['--verbose', 'check', '--tighen', '-x']);
    expect(parsed.command).toBe('check');
    expect(parsed.positionals).toEqual([]);
    expect(parsed.problems).toEqual(['unknown flag --verbose', 'unknown flag --tighen', 'unknown flag -x']);
  });

  it('a clean line has no problems', () => {
    expect(parseArgs(['check', '--all', '--id', 'a', '--tier', 'fast']).problems).toEqual([]);
  });

  it.each([['--help'], ['-h']])('%s asks for help wherever it sits', (flag) => {
    expect(parseArgs([flag]).help).toBe(true);
    expect(parseArgs(['check', flag]).help).toBe(true);
  });

  it('`help` as the command asks for help; as a later word it is a positional', () => {
    expect(parseArgs(['help']).help).toBe(true);
    expect(parseArgs(['new', 'help'])).toMatchObject({ help: false, positionals: ['help'] });
  });

  it('names every flag it knows, for the usage text to be held to', () => {
    expect(KNOWN_FLAGS).toEqual([
      '--id',
      '--tier',
      '--base',
      '--shard',
      '--jobs',
      '--template',
      '--family',
      '--reporter',
      '--all',
      '--list',
      '--json',
      '--fix',
      '--tighten',
      '--if-relevant',
      '--relevance',
      '--show-skipped',
    ]);
  });
});
