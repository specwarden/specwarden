import {
  type ICheck,
  type ICorpusFloor,
  type IFinding,
  type IModuleCheckDeclaration,
  type IVerdict,
  type TTier,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  thresholdOf,
  verdictFrom,
  withExaminedNote,
} from 'specwarden';
import { MODULE_OPTIONS, failure, note, opsIdentity } from '../_shared/identity/identity.util';

/**
 * Every check that only CI runs is named by a CI job, every job that runs checks is waited
 * for by the job branch protection requires, and some job runs the cheap tier.
 *
 * THE DEFECT THIS EXISTS FOR. A check list opens with a contract — "one job per heavy
 * check" — and nothing executes it. The failure it catches, as it is found in practice:
 * several heavy checks in the roster and in no matrix at all, among them the only one
 * answering "does this image build on its own" and the whole test suite of one workspace. A
 * check nobody runs is worse than no check: the roster reads as coverage, the cheap tier
 * does not include it, and the entry keeps its predicate and its hint as though something
 * consumed them.
 *
 * WHY THE REQUIRED JOB BELONGS HERE TOO. Branch protection reads ONE status. A job that runs
 * checks but is not in that job's `needs` can be red while the thing the merge button looks
 * at is green — the same defect one layer up, and invisible in exactly the same way.
 *
 * WHAT IS CONFIGURATION, and therefore not here: which file the workflow is, what the
 * required job is called, which tier CI owns, and how a check-running invocation looks.
 * Those are facts about a consumer's CI, and a check that hard-codes them only ever worked in
 * one repository.
 *
 * LINE-SCANNED, NOT YAML-PARSED, and deliberately: the three shapes a check id appears in
 * are a bracket list under a matrix key (`gate:` or `check:`), an inline `{ gate: … }` and a
 * literal `--id …`, which is the whole grammar needed, and it keeps this dependency-free.
 * Full-line comments are dropped first, because a workflow that explains itself mentions
 * check ids that are not invocations.
 */

export interface IWorkflowJob {
  readonly id: string;
  /** The 1-based line of the job's header. */
  readonly line: number;
  readonly checkIds: readonly string[];
  readonly runsChecks: boolean;
  readonly runsCheapTier: boolean;
  readonly needs: readonly string[];
}

/** One check CI is reconciled against: the roster's shape, and all this needs of it. */
export interface ICheckEntry {
  readonly id: string;
  readonly title?: string;
  readonly tier: TTier;
}

export interface ICiCoverageOptions extends IModuleCheckDeclaration {
  /** The workflow CI runs, repo-relative. */
  readonly workflowFile: string;
  /** The job whose result branch protection requires — every job that runs checks must be
   * in its `needs`. */
  readonly requiredJob: string;
  /** The tier this workflow owns — a check of another tier named here runs on the wrong
   * tier, or twice. Default: `heavy`. */
  readonly ciTier?: TTier;
  /** The cheap tier some job must run, because a client-side hook can be skipped.
   * Default: `fast`. */
  readonly cheapTier?: TTier;
  /** Matches a check-running invocation. Default: `DEFAULT_RUNNER_PATTERN`, the engine's
   * own command. */
  readonly runnerPattern?: RegExp;
  /** The checks to reconcile CI against, read at run time. Default: the run's own roster —
   * the list the engine is actually running. A list built by hand could forget a check, and
   * the forgotten check would be invisible to the one audit meant to notice it. */
  readonly checks?: () => readonly ICheckEntry[];
  /** How many workflow jobs a run must read. Default: at least 1. */
  readonly corpus?: ICorpusFloor;
}

/**
 * The engine's own command, however it is reached: the bin by either name, or the script
 * itself — `npx specwarden check`, `pnpm exec spw check`, `node …/bin/specwarden.mjs check`.
 */
export const DEFAULT_RUNNER_PATTERN = /(?:\bspecwarden(?:\.mjs)?|\bspw)\s+check\b/;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether a job runs the cheap tier: the engine's invocation — or the consumer's
 * `runnerPattern` — followed, anywhere later on its line, by `--tier <cheap>`.
 *
 * It was `runnerPattern` with `\s+--tier\s+<cheap>` appended, which only works for a
 * pattern that ends where the tier flag begins. The scaffolded pattern ends in
 * `--id (\S+)`, so the appended flag could never match: a workflow running exactly
 * `specwarden check --tier fast` was red for not running the fast tier.
 */
function cheapTierPattern(runnerPattern: RegExp, cheapTier: string): RegExp {
  return new RegExp(
    `(?:${DEFAULT_RUNNER_PATTERN.source}|${runnerPattern.source})[^\\n]*?--tier(?:=|\\s+)${escapeRegExp(cheapTier)}(?![\\w-])`,
  );
}

/** A pattern without the flags that make `.test` resume from `lastIndex`. */
const stateless = (re: RegExp): RegExp =>
  re.global || re.sticky ? new RegExp(re.source, re.flags.replace(/[gy]/g, '')) : re;

/** The jobs of a workflow, each with the check ids it names and whether it runs checks. */
export function parseWorkflowJobs(
  source: string,
  runnerPattern: RegExp = DEFAULT_RUNNER_PATTERN,
  cheapTier = 'fast',
): IWorkflowJob[] {
  const lines = source.split('\n').map((line) => line.replace(/\r$/, ''));
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (start === -1) return [];
  const runner = stateless(runnerPattern);
  const cheap = cheapTierPattern(runner, cheapTier);

  const collected: { id: string; line: number; body: string[] }[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const header = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(lines[i] as string);
    if (header) {
      collected.push({ id: header[1] as string, line: i + 1, body: [] });
      continue;
    }
    if (collected.length > 0) (collected[collected.length - 1] as { body: string[] }).body.push(lines[i] as string);
  }

  return collected.map(({ id, line, body }) => {
    const text = body.filter((l) => !/^\s*#/.test(l)).join('\n');
    const checkIds = new Set<string>();

    for (const [, list] of text.matchAll(/\b(?:gate|check):\s*\[([^\]]*)\]/g)) {
      for (const token of (list as string).split(',')) {
        const candidate = token.trim().replace(/^['"]|['"]$/g, '');
        if (/^[\w-]+$/.test(candidate)) checkIds.add(candidate);
      }
    }
    for (const [, matched] of text.matchAll(/\{\s*(?:gate|check):\s*([\w-]+)/g)) checkIds.add(matched as string);
    for (const [, matched] of text.matchAll(/--id\s+([\w-]+)/g)) checkIds.add(matched as string);

    const list = /\bneeds:\s*\[([^\]]*)\]/.exec(text);
    const single = /\bneeds:\s*([\w-]+)\s*$/m.exec(text);

    return {
      id,
      line,
      checkIds: [...checkIds],
      runsChecks: runner.test(text),
      runsCheapTier: cheap.test(text),
      needs: list
        ? (list[1] as string)
            .split(',')
            .map((n) => n.trim())
            .filter(Boolean)
        : single
          ? [single[1] as string]
          : [],
    };
  });
}

export function ciCoverage(options: ICiCoverageOptions): ICheck {
  checkOptions('ciCoverage', options, {
    ...MODULE_OPTIONS,
    workflowFile: { kind: 'string', required: true, nonEmpty: true },
    requiredJob: { kind: 'string', required: true, nonEmpty: true },
    ciTier: { kind: 'string', nonEmpty: true },
    cheapTier: { kind: 'string', nonEmpty: true },
    runnerPattern: { kind: 'regexp' },
    checks: { kind: 'function' },
  });
  const ciTier = options.ciTier ?? 'heavy';
  const cheapTier = options.cheapTier ?? 'fast';
  const runnerPattern = options.runnerPattern ?? DEFAULT_RUNNER_PATTERN;
  const workflow = options.workflowFile;

  return buildCheck(
    opsIdentity(
      options,
      'ci-coverage',
      'every check of the CI tier is run by a CI job that the required job waits for',
    ),
    ['read'],
    (ctx, self): IVerdict => {
      const source = ctx.files.tryRead(workflow);
      const jobs = parseWorkflowJobs(source ?? '', runnerPattern, cheapTier);
      const floor = belowCorpusFloor(
        self.id,
        jobs.length,
        options.corpus,
        source === undefined ? `\`${workflow}\` could not be read` : `\`${workflow}\` yielded no job under \`jobs:\``,
        'job',
      );
      if (floor) return floor;

      const findings: IFinding[] = [];
      const named = new Map<string, IWorkflowJob>();
      for (const job of jobs) for (const checkId of job.checkIds) named.set(checkId, job);

      if (jobs.length > 0 && named.size === 0) {
        findings.push(
          failure(
            `${workflow} names no check this scanner can read. Name each one as \`check: [a, b]\` in a ` +
              'matrix, `{ check: a }`, or `--id a` on the command line.',
            workflow,
          ),
        );
        return verdictFrom(findings, thresholdOf(ctx, self));
      }

      const checks = options.checks ? options.checks() : ctx.roster();
      const byId = new Map(checks.map((check) => [check.id, check]));

      for (const check of checks.filter((c) => c.tier === ciTier)) {
        if (named.has(check.id)) continue;
        findings.push(
          failure(
            `${ciTier} check \`${check.id}\`${check.title ? ` (${check.title})` : ''} has no job in ` +
              `${workflow}. Add it to the matrix of the job that offers what it needs, or move it ` +
              'to another tier on purpose.',
            workflow,
          ),
        );
      }

      for (const [checkId, job] of named) {
        const check = byId.get(checkId);
        if (!check) {
          findings.push(
            failure(
              `job \`${job.id}\` runs check \`${checkId}\`, which this run does not declare. Rename the id in ` +
                'both places or in neither: selecting an unknown check fails the job with a message about ' +
                'the id rather than about the code.',
              workflow,
              job.line,
            ),
          );
          continue;
        }
        if (check.tier !== ciTier) {
          findings.push(
            failure(
              `job \`${job.id}\` runs \`${checkId}\`, which is tier \`${check.tier}\`. ${workflow} carries ` +
                `the ${ciTier} tier, so naming another tier's check here runs it twice or in the wrong tier — ` +
                `move the check to \`${ciTier}\`, or the job to the workflow that runs \`${check.tier}\`.`,
              workflow,
              job.line,
            ),
          );
        }
      }

      const required = jobs.find((job) => job.id === options.requiredJob);
      if (!required) {
        findings.push(
          failure(
            `${workflow} has no \`${options.requiredJob}\` job. It is the one status branch protection ` +
              'requires; without it every job that runs checks is advisory — add it, with each of them in its `needs`.',
            workflow,
          ),
        );
      } else {
        for (const job of jobs) {
          if (!job.runsChecks || job.id === options.requiredJob) continue;
          if (!required.needs.includes(job.id)) {
            findings.push(
              failure(
                `job \`${job.id}\` runs checks but is not in \`${options.requiredJob}\`'s needs, so it can be red ` +
                  `while the status branch protection requires is green — add it to \`${options.requiredJob}\`'s needs.`,
                workflow,
                job.line,
              ),
            );
          }
        }
      }

      if (!jobs.some((job) => job.runsCheapTier)) {
        findings.push(
          failure(
            `no job in ${workflow} runs the ${cheapTier} tier. A client-side hook can be skipped, so ` +
              `without it that tier has no enforcement — add a job running \`specwarden check --tier ${cheapTier}\`.`,
            workflow,
          ),
        );
      }

      const clean = findings.length === 0;
      return verdictFrom(
        [
          ...withExaminedNote(findings, self.id, jobs.length, 'job'),
          ...(clean
            ? [note(`${named.size} check(s) named across ${jobs.length} job(s), all reaching ${options.requiredJob}`)]
            : []),
        ],
        thresholdOf(ctx, self),
      );
    },
  );
}
