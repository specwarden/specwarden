import type { TTier } from '../../../../domain';

/**
 * The argv grammar, in one place.
 *
 * A value flag takes its value as `--flag value` or `--flag=value`. Spaced, it consumes
 * the NEXT token only when that token is not itself a flag — without the guard
 * `--base --json` swallows `--json` as the base and drops it. A value flag with nothing
 * usable after it is a PROBLEM, never a flag quietly dropped.
 */
export interface IParsedArgs {
  command?: string;
  tier?: TTier;
  /** Repeatable: `--id a --id b` selects both, in the order given. `check <id>` adds to it. */
  ids: string[];
  base?: string;
  shard?: string;
  all: boolean;
  list: boolean;
  /** Machine output. `--json` IS `--reporter json`: either sets both this and `reporter`. */
  json: boolean;
  fix: boolean;
  tighten: boolean;
  /** Apply the relevance filter even to named ids (CI per-check jobs). */
  ifRelevant: boolean;
  /** Query-only: print `run`/`skip` for a single id and exit. */
  relevance: boolean;
  /** How many checks may run at once. Absent means the config's value, then 1. */
  jobs?: string;
  /** `init --template <name>`: the starting tree to write. */
  template?: string;
  /** Which built-in renders the run: `tty`, `json` or `github`. Absent lets the CI
   * environment decide. */
  reporter?: string;
  /** Print a line per skipped check, rather than only naming them in the summary. */
  showSkipped: boolean;
  /** `new <id> --family <dir>`: the folder under `checks/` the new check goes in. */
  family?: string;
  /** `plan status <file> --verify`: run each phase's acceptance. */
  verify: boolean;
  /** Bare tokens after the command, in order — `new <id>` reads its id from here.
   * The command itself is NOT among them; it is the first positional and is taken. */
  positionals: string[];
  /** Every flag the line typed, by name, in order — what `flagProblems` holds to the
   * command that was asked for. */
  flags: string[];
  /** `--help`, `-h`, or `help` as the command: print the usage and exit 0. */
  help: boolean;
  /**
   * What the line got wrong, one sentence each: a flag the parser does not know, a value
   * flag with nothing after it. Collected rather than thrown, so every command refuses
   * the same way, exit 2, before anything runs.
   *
   * They used to be dropped. `--tighen` ran a plain check and exited as if nothing had
   * been asked, and `--id` at the end of the line ran EVERY check — a selection that
   * silently became none.
   */
  problems: string[];
}

const VALUE_FLAGS: Readonly<Record<string, keyof IParsedArgs>> = {
  '--tier': 'tier',
  '--base': 'base',
  '--shard': 'shard',
  '--jobs': 'jobs',
  '--template': 'template',
  '--family': 'family',
  '--reporter': 'reporter',
};

const SWITCHES: Readonly<Record<string, keyof IParsedArgs>> = {
  '--all': 'all',
  '--list': 'list',
  '--json': 'json',
  '--fix': 'fix',
  '--tighten': 'tighten',
  '--if-relevant': 'ifRelevant',
  '--relevance': 'relevance',
  '--show-skipped': 'showSkipped',
  '--verify': 'verify',
};

/** Every flag the grammar knows, for the usage text and for a test that holds the two
 * to each other. */
export const KNOWN_FLAGS: readonly string[] = ['--id', ...Object.keys(VALUE_FLAGS), ...Object.keys(SWITCHES)];

/**
 * Which command owns which flag. A flag typed on a command that does not own it was read
 * and ignored — `init --tier heavy`, `doctor --fix`, `check --template x` each ran as if
 * the flag were not there — so it is refused, naming the command that does own it.
 */
export const FLAG_OWNERS: Readonly<Record<string, readonly string[]>> = {
  check: [
    '--tier',
    '--id',
    '--base',
    '--shard',
    '--jobs',
    '--all',
    '--if-relevant',
    '--relevance',
    '--list',
    '--fix',
    '--tighten',
    '--reporter',
    '--json',
    '--show-skipped',
  ],
  doctor: ['--reporter', '--json'],
  init: ['--template'],
  new: ['--family'],
  plan: ['--verify'],
};

export function parseArgs(argv: readonly string[]): IParsedArgs {
  const args: IParsedArgs = {
    ids: [],
    positionals: [],
    flags: [],
    all: false,
    list: false,
    json: false,
    fix: false,
    tighten: false,
    ifRelevant: false,
    relevance: false,
    showSkipped: false,
    verify: false,
    help: false,
    problems: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    // `--flag=value` is the same flag with its value attached.
    const eq = token.startsWith('--') ? token.indexOf('=') : -1;
    const name = eq === -1 ? token : token.slice(0, eq);
    const attached = eq === -1 ? undefined : token.slice(eq + 1);
    if (name === '--id' || name in VALUE_FLAGS) {
      args.flags.push(name);
      let value = attached;
      if (value === undefined) {
        // The next token is a value only if it is present and is not itself a flag —
        // otherwise `--base --json` would swallow `--json` as the base and drop it.
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) value = argv[++i];
        // `--template` bare is not a mistake to refuse: it is how a newcomer asks what is
        // installed, so it takes the empty string rather than becoming a problem — `init`
        // reads that as "list them" rather than "write the minimal tree".
        else if (name === '--template') value = '';
        else args.problems.push(`${name} needs a value${next === undefined ? '' : `, and ${next} is a flag`}`);
      } else if (value === '') {
        args.problems.push(`${name} needs a value`);
        value = undefined;
      }
      if (value === undefined) continue;
      if (name === '--id') args.ids.push(value);
      else (args[VALUE_FLAGS[name]] as string | undefined) = value;
    } else if (name in SWITCHES) {
      args.flags.push(name);
      if (attached !== undefined) args.problems.push(`${name} takes no value, and was given "${attached}"`);
      else (args[SWITCHES[name]] as boolean) = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token.startsWith('-') && token.length > 1) {
      args.problems.push(`unknown flag ${name}`);
    } else if (args.command === undefined) {
      // The first bare token is the command; the rest are its arguments, kept in
      // order. They used to be dropped, which is why every command took its input
      // through a flag even where a positional was the obvious spelling.
      args.command = token;
      if (token === 'help') args.help = true;
    } else {
      args.positionals.push(token);
    }
  }

  // One output switch, two spellings. `--json --reporter tty` rendered a terminal while
  // the rest of the run kept quiet for a machine, so the two cannot disagree.
  if (args.json && args.reporter !== undefined && args.reporter !== 'json') {
    args.problems.push(`--json is --reporter json, and --reporter ${args.reporter} says otherwise`);
  } else if (args.json || args.reporter === 'json') {
    args.json = true;
    args.reporter = 'json';
  }
  return args;
}

/**
 * The flags on this line that its command does not own, one sentence each — empty for a
 * command the dispatcher will refuse anyway (none, or unknown).
 */
export function flagProblems(args: IParsedArgs): string[] {
  const command = args.command;
  if (command === undefined || command === 'help') return [];
  const owned = FLAG_OWNERS[command] ?? [];
  return [...new Set(args.flags)]
    .filter((flag) => !owned.includes(flag))
    .map((flag) => {
      const owners = Object.keys(FLAG_OWNERS).filter((c) => FLAG_OWNERS[c].includes(flag));
      return `${flag} is a flag of ${owners.join(' and ')}, not of ${command}`;
    });
}
