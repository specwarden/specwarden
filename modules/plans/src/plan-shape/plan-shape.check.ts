import type { ICheck, ICheckContext, IFinding, IVerdict } from 'specwarden';
import { buildCheck, checkOptions, frameTolerated, testStateless } from 'specwarden';
import { DEFAULT_PLANS_DIR, type IPlanCheckIdentity } from '../_shared/identity/identity.model';
import { nothingInFlight, plansFolder } from '../_shared/plans-folder/plans-folder.util';

export interface IPlanShapeOptions extends IPlanCheckIdentity {
  /** The flat plans directory (repository-relative). Listed directly, so an untracked
   * new plan is checked before it is committed. Default: `docs/_plans`. Absent, the
   * check fails naming it. */
  readonly plansDir?: string;
  /** The legal plan filename shape. Default: `DEFAULT_PLAN_NAME`, kebab-case. */
  readonly nameRe?: RegExp;
  /** Files in the folder that are not plans. Default: its `README.md`. */
  readonly allowedNonPlans?: readonly string[];
  /** Phrases that only appear when a document sizes work. Default: `DEFAULT_SIZING`. */
  readonly sizingPatterns?: readonly RegExp[];
  /** A phase heading, in whatever language the repo writes plans. Default:
   * `DEFAULT_PHASE_HEADING`. */
  readonly phaseHeadingRe?: RegExp;
  /** Anything runnable that decides a phase is finished. Default: `DEFAULT_COMMAND`. */
  readonly commandRe?: RegExp;
  /** The check ids a plan's `--id` acceptance may name. A `--id` naming something outside
   * this is a hard failure: the acceptance command exits non-zero for the wrong reason
   * and the implementer hunts in code. Default: the run's own roster, read from the
   * context — the list the engine is actually running, which is the only honest one. */
  readonly knownGateIds?: readonly string[];
  /** Ratchet on work-sizing mentions. */
  readonly sizingRatchet?: number;
  /** Ratchet on phases with no acceptance command. */
  readonly unacceptedRatchet?: number;
}

/**
 * THE ENGLISH PLAN CONVENTION — what four of the options default to.
 *
 * Every repository wiring this check wrote the same four regexes, because nobody had
 * one yet; the check waited on an answer every English repository gives identically.
 * They are English by construction — a phase heading and a unit of time are vocabulary —
 * and exported, so a house that plans in another language starts from these rather than
 * meeting a check that finds no phase and reports every plan well-shaped.
 */
/** A kebab-case markdown filename: `refunds.md`, `01-consumer-journey.md`. */
export const DEFAULT_PLAN_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
/** A number followed by a unit of effort. */
export const DEFAULT_SIZING: readonly RegExp[] = [/\b\d+\s*(?:hours?|days?|weeks?|story points?)\b/i];
/** A level-two or level-three heading that opens a phase. */
export const DEFAULT_PHASE_HEADING = /^#{2,3}\s+Phase\b/;
/** An acceptance line: a command a person can run, or the bolded `**Acceptance.**` lead. */
export const DEFAULT_COMMAND = /^\s*(?:\*\*Acceptance\.\*\*|(?:\$\s+)?(?:pnpm|npm|npx|yarn|bun|node|bash|sh|make)\s)/;

interface IPhaseSection {
  readonly title: string;
  readonly depth: number;
  readonly line: number;
  readonly body: string[];
}

function phaseSections(lines: readonly string[], phaseRe: RegExp): IPhaseSection[] {
  const sections: IPhaseSection[] = [];
  let current: { title: string; depth: number; line: number; body: string[] } | null = null;
  // A consumer may pass a /g regex; `.exec` on a global regex advances `lastIndex`
  // across lines and silently skips headings. Strip the global flag for this scan.
  const re = phaseRe.global ? new RegExp(phaseRe.source, phaseRe.flags.replace('g', '')) : phaseRe;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (re.test(line)) {
      if (current) sections.push(current);
      // The depth is read from the LINE, never from a capture group of the consumer's
      // regex. It was `heading[1].length`, and the regex the agentic template writes —
      // `/^##+\s+(?:Phase|Stage)\b/im` — captures nothing, so every repository scaffolded
      // with it crashed this check on its first plan with a phase in it.
      current = { title: line.trim(), depth: /^\s*(#*)/.exec(line)![1].length, line: index + 1, body: [] };
      continue;
    }
    if (!current) continue;
    const other = /^(#{1,4})\s/.exec(line);
    if (other && other[1].length <= current.depth) {
      sections.push(current);
      current = null;
      continue;
    }
    current.body.push(line);
  }
  if (current) sections.push(current);
  return sections;
}

/**
 * An implementation plan is the one document read as INSTRUCTIONS, so its shape is
 * enforced: named on convention and filed flat (a plan nobody can find by name is a
 * plan nobody deletes); its `--id` acceptance names a real check; it sizes nobody's
 * work (dependency and deployability are the plan's job, hours are the reader's
 * call); and every phase carries an acceptance command (else it has no definition
 * of done). Naming and gate ids are hard failures; sizing and unaccepted phases are
 * ratcheted.
 *
 * A PRODUCT check: the contract mechanics are universal; the naming shape, the
 * sizing vocabulary, the toolchain and the known check ids are options.
 */
export function planShape(options: IPlanShapeOptions): ICheck {
  checkOptions('planShape', options, {
    plansDir: { kind: 'string' },
    nameRe: { kind: 'regexp' },
    allowedNonPlans: { kind: 'array' },
    sizingPatterns: { kind: 'array' },
    phaseHeadingRe: { kind: 'regexp' },
    commandRe: { kind: 'regexp' },
    knownGateIds: { kind: 'array' },
    sizingRatchet: { kind: 'number' },
    unacceptedRatchet: { kind: 'number' },
  });
  const plansDir = options.plansDir ?? DEFAULT_PLANS_DIR;
  const nameRe = options.nameRe ?? DEFAULT_PLAN_NAME;
  const sizingPatterns = options.sizingPatterns ?? DEFAULT_SIZING;
  const phaseHeadingRe = options.phaseHeadingRe ?? DEFAULT_PHASE_HEADING;
  const commandRe = options.commandRe ?? DEFAULT_COMMAND;
  const allowedNonPlans = new Set(options.allowedNonPlans ?? ['README.md']);
  const sizingRatchet = options.sizingRatchet ?? 0;
  const unacceptedRatchet = options.unacceptedRatchet ?? 0;

  return buildCheck(
    {
      ...options,
      rule: options.rule ?? {
        statement: 'a plan is named by convention, sizes nobody’s work, and gives every phase an acceptance command',
        owner: '@specwarden/plans',
        implied: true,
      },
      tier: options.tier ?? 'fast',
      zone: 'product',
    },
    ['read'],
    (ctx: ICheckContext): IVerdict => {
      const folder = plansFolder(ctx.files, plansDir, options.id);
      if ('refused' in folder) return { ok: false, findings: [folder.refused] };
      const hard: IFinding[] = [];
      const sizing: IFinding[] = [];
      const unaccepted: IFinding[] = [];
      const plans: string[] = [];

      for (const entry of folder.listed) {
        const rel = `${plansDir}/${entry}`;
        if (ctx.files.isDirectory(rel)) {
          hard.push({
            severity: 'error',
            file: rel,
            message: `${rel}/ — plans are FLAT; a folder here means plans stopped being deleted.`,
            ruleId: options.id,
          });
          continue;
        }
        if (!entry.endsWith('.md') || allowedNonPlans.has(entry)) continue;
        if (!testStateless(nameRe, entry)) {
          hard.push({
            severity: 'error',
            file: rel,
            message: `${rel} — name must match ${nameRe}.`,
            ruleId: options.id,
          });
        }
        plans.push(entry);
      }

      for (const entry of plans) {
        const rel = `${plansDir}/${entry}`;
        const text = ctx.files.read(rel);
        const lines = text.split('\n');

        for (let index = 0; index < lines.length; index++) {
          if (sizingPatterns.some((p) => testStateless(p, lines[index]))) {
            sizing.push({
              severity: 'error',
              file: rel,
              line: index + 1,
              message: `${rel}:${index + 1} sizes work — a plan states dependency and deployability, not hours.`,
              ruleId: options.id,
            });
          }
        }

        // A plan may only name a gate that already exists: there is no escape hatch for a
        // plan that INTRODUCES one, and an unknown id is a hard error rather than a tolerated
        // finding. So a plan whose phase delivers a new gate cannot state its acceptance as
        // `--id <that gate>`; it routes through the script path instead until the gate lands.
        // Deliberate, and the cost is real — weigh it before adding a declaration mechanism.
        for (const m of text.matchAll(/--id\s+([a-z0-9-]+)/g)) {
          if (!knownIds(ctx, options.knownGateIds).has(m[1]))
            hard.push({
              severity: 'error',
              file: rel,
              message: `${rel} names gate '--id ${m[1]}', which is not a known check.`,
              ruleId: options.id,
            });
        }

        for (const section of phaseSections(lines, phaseHeadingRe)) {
          if (!section.body.some((line) => testStateless(commandRe, line))) {
            unaccepted.push({
              severity: 'error',
              file: rel,
              line: section.line,
              message: `${rel}:${section.line} ${section.title.slice(0, 100)} — a phase with no acceptance command has no definition of done.`,
              ruleId: options.id,
            });
          }
        }
      }

      const findings = [...hard, ...sizing, ...unaccepted];
      const ok = hard.length === 0 && sizing.length <= sizingRatchet && unaccepted.length <= unacceptedRatchet;
      // hard findings never pass, so a passing verdict's error lines are all tolerated
      // by the sizing / unaccepted ratchets — frame them so the ✅ is not printed above
      // a wall of `error` lines.
      const verdict = frameTolerated(ok, findings, 'the sizing / unaccepted-phase ratchets');
      // A folder holding no plan yet is a valid state — nothing is in flight — but a blank
      // pass reads as "every plan is well-shaped", so it says it looked at none.
      if (plans.length > 0) return verdict;
      return { ...verdict, findings: [...verdict.findings, nothingInFlight(plansDir)] };
    },
  );
}

/** The ids an acceptance may name: the caller's list, or the engine's roster. */
function knownIds(ctx: ICheckContext, given?: readonly string[]): ReadonlySet<string> {
  return new Set(given ?? ctx.roster().map((c) => c.id));
}
