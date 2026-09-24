import { describe, expect, it } from 'vitest';

import { type IParsedArgs, KNOWN_FLAGS, flagProblems, parseArgs } from './parse-args.util';

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
      flags: [],
      verify: false,
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
    ['--verify', 'verify'],
  ])('%s turns on %s and nothing else', (flag, field) => {
    // A switch that also flipped a neighbour — `--tighten` implying `--fix`, say —
    // would make a read-only run write. Each one is asserted in isolation for that.
    const parsed = parseArgs(['check', flag]);
    const on = (
      ['all', 'list', 'json', 'fix', 'tighten', 'ifRelevant', 'relevance', 'showSkipped', 'verify'] as const
    ).filter((k) => parsed[k]);
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

  // `--tier=fast` was an unknown flag named `--tier=fast`, exit 2, where every other tool takes it.
  it('takes a value attached with = as the same flag', () => {
    expect(parseArgs(['check', '--tier=fast', '--id=a', '--base=origin/main', '--jobs=4'])).toMatchObject({
      tier: 'fast',
      ids: ['a'],
      base: 'origin/main',
      jobs: '4',
      problems: [],
    });
    expect(parseArgs(['check', '--base=a=b']).base).toBe('a=b');
  });

  it('refuses an empty attached value, and a value attached to a switch', () => {
    expect(parseArgs(['check', '--tier=']).problems).toEqual(['--tier needs a value']);
    expect(parseArgs(['check', '--all=yes']).problems).toEqual(['--all takes no value, and was given "yes"']);
    expect(parseArgs(['check', '--nope=1']).problems).toEqual(['unknown flag --nope']);
  });

  // One output switch, two spellings: `--json --reporter tty` rendered a terminal while the
  // rest of the run kept quiet for a machine.
  it('reads --json as --reporter json, and refuses the two disagreeing', () => {
    expect(parseArgs(['check', '--json'])).toMatchObject({ json: true, reporter: 'json' });
    expect(parseArgs(['check', '--reporter', 'json'])).toMatchObject({ json: true, reporter: 'json' });
    expect(parseArgs(['check', '--json', '--reporter', 'json']).problems).toEqual([]);
    expect(parseArgs(['check', '--json', '--reporter', 'tty']).problems).toEqual([
      '--json is --reporter json, and --reporter tty says otherwise',
    ]);
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
  });

  // `--template` bare used to be refused the same way, as if it were a typo. It is how a
  // newcomer asks what is installed — `init` reads the empty string as "list them".
  it('`--template` alone is not a problem — it is the empty string, for `init` to read as a listing', () => {
    expect(parseArgs(['init', '--template'])).toMatchObject({ template: '', problems: [] });
  });

  it('`--template=` explicitly empty is still a problem — a name was promised and not given', () => {
    expect(parseArgs(['init', '--template=']).problems).toEqual(['--template needs a value']);
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
      '--verify',
    ]);
  });
});

describe('a flag belongs to one command', () => {
  // Read and ignored, each of these ran as if the flag were not on the line.
  it.each([
    [['init', '--tier', 'fast'], ['--tier is a flag of check, not of init']],
    [['doctor', '--fix', '--json'], ['--fix is a flag of check, not of doctor']],
    [['new', 'x', '--template', 't'], ['--template is a flag of init, not of new']],
    [['plan', 'status', 'p.md', '--all'], ['--all is a flag of check, not of plan']],
    [['adopt', '--reporter', 'json'], ['--reporter is a flag of check and doctor, not of adopt']],
  ])('%j is refused, naming the owner', (argv, problems) => {
    expect(flagProblems(parseArgs(argv))).toEqual(problems);
  });

  it("a command's own flags, and a line with no command, raise nothing", () => {
    expect(flagProblems(parseArgs(['check', '--tier', 'fast', '--json', '--jobs', '2']))).toEqual([]);
    expect(flagProblems(parseArgs(['doctor', '--json']))).toEqual([]);
    expect(flagProblems(parseArgs(['plan', 'status', 'p.md', '--verify']))).toEqual([]);
    expect(flagProblems(parseArgs(['--json']))).toEqual([]);
  });
});
