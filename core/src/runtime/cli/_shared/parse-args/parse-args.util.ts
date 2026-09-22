import type { TTier } from '../../../../domain';

/**
 * The argv grammar, in one place.
 *
 * A value flag consumes the NEXT token only when that token is not itself a flag —
 * without the guard `--base --json` swallows `--json` as the base and drops it.
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
}

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
  };
  const valueFlags: Record<string, keyof IParsedArgs> = {
    '--tier': 'tier',
    '--base': 'base',
    '--shard': 'shard',
    '--jobs': 'jobs',
    '--template': 'template',
    '--family': 'family',
    '--reporter': 'reporter',
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    // The next token is a value only if it is present and is not itself a flag —
    // otherwise `--base --json` would swallow `--json` as the base and drop it.
    const next = argv[i + 1];
    const hasValue = next !== undefined && !next.startsWith('--');
    if (token === '--id') {
      if (hasValue) args.ids.push(argv[++i]);
    } else if (token in valueFlags) {
      if (hasValue) (args[valueFlags[token]] as string | undefined) = argv[++i];
    } else if (token === '--all') {
      args.all = true;
    } else if (token === '--list') {
      args.list = true;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--fix') {
      args.fix = true;
    } else if (token === '--tighten') {
      args.tighten = true;
    } else if (token === '--if-relevant') {
      args.ifRelevant = true;
    } else if (token === '--relevance') {
      args.relevance = true;
    } else if (token === '--show-skipped') {
      args.showSkipped = true;
    } else if (!token.startsWith('--')) {
      // The first bare token is the command; the rest are its arguments, kept in
      // order. They used to be dropped, which is why every command took its input
      // through a flag even where a positional was the obvious spelling.
      if (args.command === undefined) args.command = token;
      else args.positionals.push(token);
    }
  }
  return args;
}
