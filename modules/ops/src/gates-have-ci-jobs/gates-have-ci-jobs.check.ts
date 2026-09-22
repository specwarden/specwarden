import { CHECK_CONTRACT_VERSION, type ICheck, type IFinding, type IVerdict, type TTier } from 'specwarden';

/**
 * Every gate that only CI runs is named by a CI job, every job that runs gates reaches the
 * arbiter, and some job runs the cheap tier.
 *
 * THE DEFECT THIS EXISTS FOR. A gate list opens with a contract — "one job per heavy gate"
 * — and nothing executes it. Measured in the repository this was extracted from: eight
 * heavy gates were in the list and in no matrix at all, among them the only gate that
 * answered "does this image build on its own" and the whole test suite of one workspace. A
 * gate nobody runs is worse than no gate: the list reads as coverage, the cheap tier does
 * not include it, and the entry keeps its predicate and its hint as though something
 * consumed them.
 *
 * WHY THE ARBITER RULE BELONGS HERE TOO. Branch protection reads ONE check. A job that runs
 * gates but is not in that job's `needs` can be red while the thing the merge button looks
 * at is green — the same defect one layer up, and invisible in exactly the same way.
 *
 * WHAT IS CONFIGURATION, and therefore not here: which file the workflow is, what the
 * arbiter job is called, which tier CI owns, and how a gate-running invocation looks. Those
 * are facts about a host's CI, and a check that hard-codes them is a check that only ever
 * worked in one repository.
 *
 * LINE-SCANNED, NOT YAML-PARSED, and deliberately: the three shapes a gate id appears in
 * are a bracket list, an inline `{ gate: … }` and a literal `--id …`, which is the whole
 * grammar needed, and it keeps this dependency-free. Full-line comments are dropped first,
 * because a workflow that explains itself mentions gate ids that are not invocations.
 */

export interface IWorkflowJob {
  readonly id: string;
  readonly gateIds: readonly string[];
  readonly runsGates: boolean;
  readonly runsCheapTier: boolean;
  readonly needs: readonly string[];
}

/** The gate list this check reconciles CI against. */
export interface IGateEntry {
  readonly id: string;
  readonly title?: string;
  readonly tier: string;
}

export interface IGatesHaveCiJobsOptions {
  readonly id: string;
  readonly title: string;
  readonly tier?: TTier;
  readonly hint?: string;
  /** The workflow CI runs, repo-relative. */
  readonly workflow: string;
  /** The job whose result branch protection reads. */
  readonly arbiterJob: string;
  /** The tier this workflow owns — a gate of another tier named here runs on the wrong
   * schedule, or twice. */
  readonly ciTier: string;
  /** The cheap tier some job must run, because a client-side hook can be skipped. */
  readonly cheapTier: string;
  /** Source pattern (not a RegExp — it is embedded) matching a gate-running invocation. */
  readonly runnerPattern: string;
  /** The gates to reconcile CI against, read at run time. Default: the run's own roster
   * from the context — the list the engine is actually running. A consumer that built
   * this list by hand could forget a check, and the forgotten check would be invisible
   * to the one audit meant to notice it. */
  readonly gates?: () => readonly IGateEntry[];
  readonly when: (changed: readonly string[]) => boolean;
}

/** The jobs of a workflow, each with the gate ids it names and whether it runs gates. */
export function parseWorkflowJobs(source: string, runnerPattern: string, cheapTier: string): IWorkflowJob[] {
  const lines = source.split('\n').map((line) => line.replace(/\r$/, ''));
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (start === -1) return [];

  const collected: { id: string; body: string[] }[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const header = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(lines[i] as string);
    if (header) {
      collected.push({ id: header[1] as string, body: [] });
      continue;
    }
    if (collected.length > 0) (collected[collected.length - 1] as { body: string[] }).body.push(lines[i] as string);
  }

  return collected.map(({ id, body }) => {
    const text = body.filter((line) => !/^\s*#/.test(line)).join('\n');
    const gateIds = new Set<string>();

    for (const [, list] of text.matchAll(/\bgate:\s*\[([^\]]*)\]/g)) {
      for (const token of (list as string).split(',')) {
        const candidate = token.trim().replace(/^['"]|['"]$/g, '');
        if (/^[\w-]+$/.test(candidate)) gateIds.add(candidate);
      }
    }
    for (const [, matched] of text.matchAll(/\{\s*gate:\s*([\w-]+)/g)) gateIds.add(matched as string);
    for (const [, matched] of text.matchAll(/--id\s+([\w-]+)/g)) gateIds.add(matched as string);

    const list = /\bneeds:\s*\[([^\]]*)\]/.exec(text);
    const single = /\bneeds:\s*([\w-]+)\s*$/m.exec(text);

    return {
      id,
      gateIds: [...gateIds],
      runsGates: new RegExp(runnerPattern).test(text),
      runsCheapTier: new RegExp(`${runnerPattern}\\s+--tier\\s+${cheapTier}`).test(text),
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

export function gatesHaveCiJobs(options: IGatesHaveCiJobsOptions): ICheck {
  return {
    id: options.id,
    title: options.title,
    tier: options.tier ?? 'fast',
    zone: 'product',
    capabilities: ['read'],
    contractVersion: CHECK_CONTRACT_VERSION,
    hint: options.hint,
    when: options.when,
    run: (ctx): IVerdict => {
      const findings: IFinding[] = [];
      const fail = (message: string): void => {
        findings.push({ severity: 'error', message, ruleId: options.id });
      };

      const source = ctx.files.tryRead(options.workflow);
      if (source === undefined) {
        fail(`${options.workflow} cannot be read — a check that sees nothing passes everything.`);
        return { ok: false, findings };
      }

      const jobs = parseWorkflowJobs(source, options.runnerPattern, options.cheapTier);
      if (jobs.length === 0) {
        fail(
          `${options.workflow} yielded no jobs. Either the workflow moved or this scanner no longer ` +
            'recognises a job header — a check that sees nothing passes everything.',
        );
        return { ok: false, findings };
      }

      const named = new Map<string, string>();
      for (const job of jobs) for (const gateId of job.gateIds) named.set(gateId, job.id);

      if (named.size === 0) {
        fail(
          `${options.workflow} names no gate this scanner can see. The three shapes it reads are ` +
            '`gate: [a, b]`, `{ gate: a }` and `--id a`; a fourth one needs adding to the engine.',
        );
        return { ok: false, findings };
      }

      const gates = options.gates ? options.gates() : ctx.roster();
      const byId = new Map(gates.map((gate) => [gate.id, gate]));

      for (const gate of gates.filter((g) => g.tier === options.ciTier)) {
        if (named.has(gate.id)) continue;
        fail(
          `${options.ciTier} gate \`${gate.id}\`${gate.title ? ` (${gate.title})` : ''} has no job in ` +
            `${options.workflow}. Add it to the matrix of the job that offers what it needs, or move it ` +
            'to another tier on purpose.',
        );
      }

      for (const [gateId, jobId] of named) {
        const gate = byId.get(gateId);
        if (!gate) {
          fail(
            `job \`${jobId}\` runs gate \`${gateId}\`, which is not in the gate list. An id is renamed in ` +
              'both places or in neither: selecting an unknown gate fails the job with a message about ' +
              'the id rather than about the code.',
          );
          continue;
        }
        if (gate.tier !== options.ciTier) {
          fail(
            `job \`${jobId}\` runs \`${gateId}\`, which is tier \`${gate.tier}\`. ${options.workflow} carries ` +
              `the ${options.ciTier} tier, so naming another tier's gate here runs it twice or on the ` +
              'wrong schedule.',
          );
        }
      }

      const arbiter = jobs.find((job) => job.id === options.arbiterJob);
      if (!arbiter) {
        fail(
          `${options.workflow} has no \`${options.arbiterJob}\` job. It is the single check branch ` +
            'protection reads; without it every gate job is advisory.',
        );
      } else {
        for (const job of jobs) {
          if (!job.runsGates || job.id === options.arbiterJob) continue;
          if (!arbiter.needs.includes(job.id)) {
            fail(
              `job \`${job.id}\` runs gates but is not in \`${options.arbiterJob}\`'s needs. It can be red ` +
                'while the one check branch protection reads is green.',
            );
          }
        }
      }

      if (!jobs.some((job) => job.runsCheapTier)) {
        fail(
          `no job in ${options.workflow} runs the ${options.cheapTier} tier. A client-side hook can be ` +
            'skipped, so without this that tier has no enforcement.',
        );
      }

      return findings.length > 0
        ? { ok: false, findings }
        : {
            ok: true,
            findings: [
              {
                severity: 'info',
                message: `✓ ${named.size} gate(s) named across ${jobs.length} job(s), all reaching ${options.arbiterJob}`,
              },
            ],
          };
    },
  };
}
