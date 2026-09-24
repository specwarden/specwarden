import {
  CHECK_CONTRACT_VERSION,
  shellArgv,
  shellStartFailure,
  type ICheckRule,
  type IFinding,
  type IProcessResult,
  type IShell,
  type ICheck,
  type ICheckContext,
  type IVerdict,
  type TCapability,
  type TTier,
  type TZone,
} from '../../../domain';
import { platformShell } from '../../../infrastructure';
import {
  type TWhen,
  CheckOptionsError,
  UNNAMED_CHECK_ID,
  attributionOf,
  checkOptions,
  normaliseRule,
  resolveWhen,
  testStateless,
} from '../../../primitives/_shared';

/**
 * A pattern the output must NOT contain, with the reason it is fatal. The reason is
 * printed, because "output matched /no test files/" tells a reader what happened and
 * not why a green exit code was a lie.
 */
export interface IOutputRefusal {
  readonly pattern: RegExp;
  readonly why?: string;
}

/** What a consumer states to wrap a shell command as a check. Everything but `cmd` is
 * optional: the id is the file's name when the file exports the check alone, the title
 * the rule's statement else the id, the tier `fast`. */
export interface ICommandCheckOptions {
  readonly id?: string;
  readonly title?: string;
  readonly tier?: TTier;
  /**
   * How to invoke a shell. Defaults to what `resolveShell` finds for this machine —
   * `bash -c` everywhere but Windows, and Git's own bash there, because a bare `bash` on
   * Windows is often WSL's launcher and the command then runs inside Linux. Some
   * containers ship only `sh`, and a consumer may run everything through another shell
   * entirely; neither should require forking the engine, so the shell is a setting, per
   * check here or for every check through `SPECWARDEN_SHELL`.
   */
  readonly shell?: IShell;
  /** The shell command line. */
  readonly cmd: string;
  /** Relevance: a predicate over the changed set, or the declarative form. Absent
   * means always relevant. */
  readonly when?: TWhen;
  readonly advisory?: boolean;
  /** Run this command alone under `--jobs` — see `exclusive` on ICheck. */
  readonly exclusive?: boolean;
  readonly hint?: string;
  /** The rule this check enforces, declared beside it rather than in a register that
   * has to be kept in step by hand. A string is the statement. */
  readonly rule?: string | ICheckRule;
  /** Extra environment for the command (e.g. a flag that makes missing infrastructure
   * fatal instead of skippable). */
  readonly env?: Readonly<Record<string, string>>;
  /** True for a suite that accepts `--shard=i/N`; the run's shard is appended. */
  readonly shardable?: boolean;
  /**
   * Kill the command after this many seconds. EXECUTED, not merely recorded: a
   * timeout the engine carries and never applies is a declaration nothing reads, and
   * a declaration nothing reads is a promise nobody keeps.
   */
  readonly timeoutSec?: number;
  /**
   * External services the command needs — a database, a cache. The engine does not
   * start them; it carries the declaration so a CI-coverage check can place the check
   * in a job that offers what it needs, and so the report can say why one was skipped.
   */
  readonly needs?: readonly string[];
  /** The zone the check is declared in — a wrapped repository command is `consumer`. */
  readonly zone?: TZone;

  /**
   * Files the command is pointed AT, which must exist before it is worth running.
   *
   * THE DEFECT THIS CLOSES, verbatim from the record: a test command was given a list
   * of exact spec paths; one of those files moved; the runner treated the unmatched
   * path as "no filter matched", ran the remaining suites and exited 0. The check
   * reported green for months while running 78 of the 86 tests it claimed. The same
   * shape appears wherever a tool takes paths and shrugs at the ones it cannot find.
   *
   * Declared here, the paths are checked through the file port BEFORE the command is
   * spawned, and a missing one is a failure that names the file. It costs a `read`
   * capability, which is added automatically when this is present.
   */
  readonly paths?: readonly string[];
  /**
   * The directory the command runs in, relative to the repository root — `packages/api`.
   * Absent, the root. A command check runs at the root wherever the CLI was invoked from,
   * so a package's own suite in a monorepo says where it lives; the directory is verified
   * through the file port before the command spawns, like `paths`, because a `cd` into a
   * directory that moved runs nothing and a shell that shrugs exits 0.
   */
  readonly cwd?: string;
  /**
   * What the output must contain for a zero exit to be believed.
   *
   * A command's exit code answers "did I fail", never "did I do anything". Between
   * those two questions live a package filter matching no package, a path filter
   * matching no file, and a pipeline whose failure was swallowed mid-pipe — each of
   * them exits 0, prints something inert, and passes.
   *
   * Only consulted on SUCCESS: a command that already failed needs no second opinion.
   */
  readonly expect?: RegExp | readonly RegExp[];
  /**
   * Output patterns that make a zero exit a failure — the specific phrases a tool
   * prints when it silently did nothing.
   *
   * The counterpart to `expect`, and the cheaper half to write: naming the sentence a
   * tool prints when it matched nothing needs no knowledge of what a successful run
   * looks like.
   */
  readonly refuse?: readonly (RegExp | IOutputRefusal)[];
}

/** CSI sequences (colour, cursor) and OSC sequences (titles, hyperlinks), as a terminal
 * reads them. */
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const stripAnsi = (text: string): string => text.replace(ANSI, '');

/** What `commandCheck` takes beside the identity, checked by name when the file loads. */
const SPEC_OPTIONS = {
  cmd: { kind: 'string', required: true },
  shell: { kind: 'object' },
  env: { kind: 'object' },
  shardable: { kind: 'boolean' },
  needs: { kind: 'array' },
  paths: { kind: 'array' },
  cwd: { kind: 'string' },
  expect: { kind: ['regexp', 'array'] },
  refuse: { kind: 'array' },
  // Accepted and dropped, it was a tolerance nobody had: a command's verdict is its exit,
  // and there is no count to hold a threshold against.
  ratchet: {
    refused:
      'a command check has no count to tolerate: its verdict is the exit code. To ratchet a measurement, read it with fromResult or defineCheck',
  },
} as const;

/**
 * A check whose logic is an external command — the bridge that lets specwarden run
 * a repository's existing commands unchanged while the native rewrites happen check by
 * check. It declares the `exec` capability, plus `read` when it was given paths to
 * verify: its engine-port use is the subprocess and, optionally, the existence check
 * before it; the subprocess does its own file IO outside the capability system, which
 * is correct — the manifest governs what a check does THROUGH the engine.
 *
 * A generic primitive, so it lives in the product; an instance wrapping a concrete
 * repository command is consumer-zone, which the spec declares.
 */
export class CommandCheck implements ICheck {
  readonly id: string;
  readonly title: string;
  readonly tier: TTier;
  readonly zone: TZone;
  readonly capabilities: readonly TCapability[];
  readonly contractVersion = CHECK_CONTRACT_VERSION;
  readonly advisory: boolean;
  readonly exclusive?: boolean;
  readonly hint?: string;
  readonly rule?: ICheckRule;
  readonly timeoutSec?: number;
  /** Services the command needs; carried for CI placement, never started here. */
  readonly needs?: readonly string[];
  /**
   * The command line, readable from outside. A manifest consumer — the CI-coverage
   * audit, a test asserting that a check sweeps by path — needs to know WHAT a wrapped
   * check runs, and the spec it was built from is private. Metadata, never re-run.
   */
  readonly cmd: string;

  private readonly relevant: (changed: readonly string[]) => boolean;

  constructor(private readonly spec: ICommandCheckOptions) {
    checkOptions('commandCheck', spec, SPEC_OPTIONS);
    // Inside the repository, relative to its root — refused at load otherwise. An absolute
    // path passed the directory check as itself and spawned beneath the root, and `..` ran
    // the command outside the repository the check is about.
    if (spec.cwd !== undefined && (/^([a-z]:)?[\\/]/i.test(spec.cwd) || spec.cwd.split(/[\\/]/).includes('..'))) {
      throw new CheckOptionsError(
        `commandCheck${spec.id ? ` '${spec.id}'` : ''}: \`cwd\` must be a directory inside the repository, relative to its root — got "${spec.cwd}".`,
      );
    }
    const expected = spec.expect === undefined ? [] : Array.isArray(spec.expect) ? spec.expect : [spec.expect];
    const refused = (spec.refuse ?? []).map((r) => (r instanceof RegExp ? r : (r as Partial<IOutputRefusal>)?.pattern));
    if (![...expected, ...refused].every((p) => p instanceof RegExp)) {
      throw new CheckOptionsError(
        `commandCheck${spec.id ? ` '${spec.id}'` : ''}: every \`expect\` entry must be a RegExp, and every \`refuse\` ` +
          'entry a RegExp or { pattern: RegExp, why }. A string is not tested — the output would never be doubted.',
      );
    }
    const rule = normaliseRule(spec.rule);
    this.id = spec.id ?? UNNAMED_CHECK_ID;
    this.cmd = spec.cmd;
    this.title = spec.title ?? rule?.statement ?? this.id;
    this.tier = spec.tier ?? 'fast';
    this.zone = spec.zone ?? 'consumer';
    this.advisory = Boolean(spec.advisory);
    this.exclusive = spec.exclusive;
    this.needs = spec.needs;
    this.hint = spec.hint;
    this.rule = rule;
    // BOTH: the option kills the child, and the check-level deadline ends the WAIT.
    // They are not redundant — a process runner that ignores the option would leave
    // the run hanging forever, and the deadline is what makes that a failure with a
    // name instead of a job that burns its whole budget in silence.
    this.timeoutSec = spec.timeoutSec;
    this.capabilities = spec.paths?.length || spec.cwd !== undefined ? ['exec', 'read'] : ['exec'];
    this.relevant = resolveWhen(spec.when);
  }

  when(changed: readonly string[]): boolean {
    return this.relevant(changed);
  }

  run(ctx: ICheckContext): IVerdict | Promise<IVerdict> {
    // Before spawning anything: is the command still pointed at files that exist?
    // A tool handed a path it cannot find usually shrugs and succeeds.
    const missing = (this.spec.paths ?? []).filter((path) => !ctx.files.exists(path));
    if (missing.length > 0) {
      return {
        ok: false,
        findings: missing.map((path) => ({
          severity: 'error' as const,
          file: path,
          message:
            `${this.id} is pointed at ${path}, which does not exist — the command was not run. ` +
            'A tool given a path it cannot find generally runs the rest and exits 0, so this ' +
            'would have been a green check over a shrinking subject.',
          ruleId: attributionOf(this),
        })),
      };
    }

    const dir = this.spec.cwd?.replace(/\\/g, '/').replace(/\/+$/, '');
    if (dir !== undefined && dir !== '' && dir !== '.' && !ctx.files.isDirectory(dir)) {
      return {
        ok: false,
        findings: [
          {
            severity: 'error' as const,
            file: dir,
            message: `${this.id} runs in ${dir}, which is not a directory here — the command was not run.`,
            ruleId: attributionOf(this),
          },
        ],
      };
    }

    const cmd = this.spec.shardable && ctx.shard ? `${this.spec.cmd} --shard=${ctx.shard}` : this.spec.cmd;
    const shell = this.spec.shell ?? platformShell();
    // Non-blocking when the adapter offers it, so a concurrent run actually overlaps;
    // a synchronous spawn holds the event loop and would make concurrency a no-op.
    // An ABSOLUTE directory: a relative one resolves against the process's own directory,
    // which is wherever the CLI was invoked from — the defect `cwd` exists to avoid.
    const options = {
      env: this.spec.env,
      timeoutSec: this.spec.timeoutSec,
      ...(dir === undefined || dir === '' || dir === '.'
        ? {}
        : { cwd: ctx.files.root() === '' ? dir : `${ctx.files.root().replace(/[\\/]+$/, '')}/${dir}` }),
    };
    if (typeof ctx.proc.runAsync === 'function') {
      return ctx.proc
        .runAsync(shell.command, shellArgv(shell, cmd), options)
        .then((r) => this.verdictOf(r, cmd, shell));
    }
    const result = ctx.proc.run(shell.command, shellArgv(shell, cmd), options);
    return this.verdictOf(result, cmd, shell);
  }

  /** One result, one verdict — shared by the sync and async paths so they cannot drift. */
  private verdictOf(result: IProcessResult, cmd: string, shell: IShell): IVerdict {
    // A shell that never started is not a failing command. Reported apart, because the
    // default wording ("exited by signal") sends the reader off to debug a command
    // that did not run, on a machine where nothing would have run.
    if (result.spawnError !== undefined) {
      return {
        ok: false,
        findings: [
          {
            severity: 'error' as const,
            message: shellStartFailure(this.id, shell, result.spawnError),
            ruleId: attributionOf(this),
          },
        ],
      };
    }

    // Colour codes stripped: a tool under FORCE_COLOR (or a TTY-sniffing one) wrote them
    // verbatim into findings and JSON, and an `expect` written against the words did not
    // match the words between the escapes.
    const output = stripAnsi(`${result.stdout}${result.stderr}`).trim();
    const findings = output === '' ? [] : [{ severity: 'info' as const, message: output, ruleId: attributionOf(this) }];

    if (result.status === 0) {
      // A zero exit says the command did not fail. Whether it DID anything is a
      // separate question, and one the command cannot be trusted to answer alone.
      const doubts = this.doubtsAbout(output);
      if (doubts.length === 0) return { ok: true, findings };
      return { ok: false, findings: [...findings, ...doubts] };
    }
    return {
      ok: false,
      findings: [
        ...findings,
        {
          severity: this.advisory ? ('warning' as const) : ('error' as const),
          message: `${this.id} exited ${result.status ?? 'by signal'} — ${cmd}`,
          ruleId: attributionOf(this),
        },
      ],
    };
  }

  /** Reasons not to believe a zero exit, from the declarations the spec carries. */
  private doubtsAbout(output: string): IFinding[] {
    const findings: IFinding[] = [];

    const expected =
      this.spec.expect === undefined ? [] : Array.isArray(this.spec.expect) ? this.spec.expect : [this.spec.expect];
    for (const pattern of expected as readonly RegExp[]) {
      // Stateless: a `/g` pattern keeps `lastIndex` between calls, so the same check run
      // twice believed a zero exit on one run and refused it on the next.
      if (testStateless(pattern, output)) continue;
      findings.push({
        severity: 'error',
        ruleId: attributionOf(this),
        message:
          `${this.id} exited 0 but its output does not match ${String(pattern)}, which it declares as proof of work. ` +
          'A zero exit means the command did not fail; it never means the command did anything.',
      });
    }

    for (const entry of this.spec.refuse ?? []) {
      const refusal: IOutputRefusal = entry instanceof RegExp ? { pattern: entry } : entry;
      if (!testStateless(refusal.pattern, output)) continue;
      findings.push({
        severity: 'error',
        ruleId: attributionOf(this),
        message:
          `${this.id} exited 0 but its output matched ${String(refusal.pattern)}. ` +
          (refusal.why ?? 'That pattern is declared as evidence the command silently did nothing.'),
      });
    }

    return findings;
  }
}

/**
 * The factory, for a check file.
 *
 *   export const check = commandCheck({ cmd: 'pnpm lint', tier: 'heavy', rule: '…' });
 *
 * The class behind it is not exported: a check FILE reads like every other check file — a
 * call producing a check — rather than being the one place a consumer meets a class and a
 * constructor.
 */
export function commandCheck(options: ICommandCheckOptions): ICheck {
  return new CommandCheck(options);
}
