import type { TTier } from '../../../../domain';

/**
 * The argv grammar, in one place.
 *
 * A value flag consumes the NEXT token only when that token is not itself a flag —
 * without the guard `--base --json` swallows `--json` as the base and drops it. A value
 * flag with nothing usable after it is a PROBLEM, never a flag quietly dropped.
 */
export interface IParsedArgs {
  command?: string;
  tier?: TTier;
  /** Repeatable: `--id a --id b` selects both, in the order given. */
  ids: string[];
  base?: string;
  shard?: string;
  all: boolean;
  list: boolean;
  json: boolean;
  fix: boolean;
  tighten: boolean;
  /** Apply the relevance filter even to named ids (CI per-gate jobs). */
  ifRelevant: boolean;
  /** Query-only: print `run`/`skip` for a single id and exit. */
  relevance: boolean;
  /** How many checks may run at once. Absent means the config's value, then 1. */
  jobs?: string;
  /** `init --template <name>`: the starting tree to write. */
  template?: string;
  /** Which built-in renders the run: `tty`, `json` or `github`. Absent lets `--json`
   * and the CI environment decide. */
  reporter?: string;
  /** Print a line per skipped check, rather than only naming them in the summary. */
  showSkipped: boolean;
  /** `new <id> --family <dir>`: the folder under `checks/` the new check goes in. */
  family?: string;
  /** Bare tokens after the command, in order — `new <id>` reads its id from here.
   * The command itself is NOT among them; it is the first positional and is taken. */
  positionals: string[];
  /** `--help`, `-h`, or `help` as the command: print the usage and exit 0. */
  help: boolean;
  /**
   * What the line got wrong, one sentence each: a flag the parser does not know, a value
   * flag with nothing after it. Collected rather than thrown, so a command that reads its
   * own flags (`plan`) can ignore them; every other command refuses the line, exit 2.
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
};

/** Every flag the grammar knows, for the usage text and for a test that holds the two
 * to each other. */
export const KNOWN_FLAGS: readonly string[] = ['--id', ...Object.keys(VALUE_FLAGS), ...Object.keys(SWITCHES)];

export function parseArgs(argv: readonly string[]): IParsedArgs {
  const args: IParsedArgs = {
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
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    // The next token is a value only if it is present and is not itself a flag —
    // otherwise `--base --json` would swallow `--json` as the base and drop it.
    const next = argv[i + 1];
    const hasValue = next !== undefined && !next.startsWith('--');
    if (token === '--id' || token in VALUE_FLAGS) {
      if (!hasValue) {
        args.problems.push(`${token} needs a value${next === undefined ? '' : `, and ${next} is a flag`}`);
      } else if (token === '--id') {
        args.ids.push(argv[++i]);
      } else {
        (args[VALUE_FLAGS[token]] as string | undefined) = argv[++i];
      }
    } else if (token in SWITCHES) {
      (args[SWITCHES[token]] as boolean) = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token.startsWith('-') && token.length > 1) {
      args.problems.push(`unknown flag ${token}`);
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
  return args;
}
