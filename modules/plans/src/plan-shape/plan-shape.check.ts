import type { ICheck, ICheckContext, ICorpusFloor, IFinding, IModuleCheckDeclaration } from 'specwarden';
import { buildCheck, checkOptions, lineOf, testStateless, thresholdOf } from 'specwarden';
import {
  DEFAULT_PLANS_DIR,
  PLANS_SHARED_OPTIONS,
  debtVerdict,
  isExempt,
  refusedPlans,
} from '../_shared/corpus/corpus.util';
import { nothingInFlight, plansFolder } from '../_shared/plans-folder/plans-folder.util';

export interface IPlanShapeOptions extends IModuleCheckDeclaration {
  /** The flat plans directory (repository-relative). Listed directly, so an untracked
   * new plan is checked before it is committed. Default: `docs/_plans`. Absent, the
   * check fails naming it. */
  readonly plansDir?: string;
  /** The legal plan filename shape. Default: `DEFAULT_NAME`, kebab-case. */
  readonly name?: RegExp;
  /** Pathspecs of files in the folder that are not plans. The folder's own `README.md` is
   * never a plan. Default: none. */
  readonly except?: readonly string[];
  /** How many plans the folder must hold for a verdict to count. Default: none — a folder
   * with no plan is a repository with nothing in flight. */
  readonly corpus?: ICorpusFloor;
  /** Phrases that only appear when a document sizes work. Default: `DEFAULT_SIZING`. */
  readonly sizing?: readonly RegExp[];
  /** A phase heading, in whatever language the repo writes plans. Default:
   * `DEFAULT_PHASE_HEADING`. */
  readonly phaseHeading?: RegExp;
  /** Anything runnable that decides a phase is finished. Default: `DEFAULT_COMMAND`. */
  readonly command?: RegExp;
  /** The check ids a plan's `--id` acceptance may name. A `--id` naming something outside
   * this is a hard failure: the acceptance command exits non-zero for the wrong reason
   * and the implementer hunts in code. Default: the run's own roster, read from the
   * context — the list the engine is actually running, which is the only honest one. */
  readonly knownCheckIds?: readonly string[];
}

/**
 * THE ENGLISH PLAN CONVENTION — what four of the options default to.
 *
 * Every repository wiring this check wrote the same four regexes, because nobody had
 * one yet; the check waited on an answer every English repository gives identically.
 * They are English by construction — a phase heading and a unit of time are vocabulary —
 * and exported, so a consumer that plans in another language starts from these rather than
 * meeting a check that finds no phase and reports every plan well-shaped.
 */
/** A kebab-case markdown filename: `refunds.md`, `01-consumer-journey.md`. */
export const DEFAULT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
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
 * of done).
 *
 * THE RATCHET. Naming, a nested folder and an unknown id are hard failures. Sizing and an
 * unaccepted phase are debt a repository with old plans may carry, and they were two
 * ratchets — `sizingRatchet` and `unacceptedRatchet` — neither of them the engine's, so the
 * stored threshold never reached either and `--tighten` could not move them. `ratchet` now
 * counts both together: each is a plan that does not yet say what done is in the terms a
 * reader can check.
 *
 * A PRODUCT check: the contract mechanics are universal; the naming shape, the
 * sizing vocabulary, the toolchain and the known check ids are options.
 */
export function planShape(options: IPlanShapeOptions = {}): ICheck {
  checkOptions('planShape', options, {
    ...PLANS_SHARED_OPTIONS,
    plansDir: { kind: 'string', nonEmpty: true },
    name: { kind: 'regexp' },
    sizing: { kind: 'array' },
    phaseHeading: { kind: 'regexp' },
    command: { kind: 'regexp' },
    knownCheckIds: { kind: 'array' },
  });
  const plansDir = options.plansDir ?? DEFAULT_PLANS_DIR;
  const name = options.name ?? DEFAULT_NAME;
  const sizing = options.sizing ?? DEFAULT_SIZING;
  const phaseHeading = options.phaseHeading ?? DEFAULT_PHASE_HEADING;
  const command = options.command ?? DEFAULT_COMMAND;
  const except = options.except ?? [];

  return buildCheck(
    {
      ...options,
      id: options.id ?? 'plan-shape',
      rule: options.rule ?? {
        statement: 'a plan is named by convention, sizes nobody’s work, and gives every phase an acceptance command',
        owner: '@specwarden/plans',
        implied: true,
      },
      zone: 'product',
    },
    ['read'],
    (ctx, self) => {
      const folder = plansFolder(ctx.files, plansDir, self.id);
      if ('refused' in folder) return { ok: false, findings: [folder.refused] };
      const hard: IFinding[] = [];
      const soft: IFinding[] = [];
      const plans: string[] = [];

      for (const entry of folder.listed) {
        const rel = `${plansDir}/${entry}`;
        if (ctx.files.isDirectory(rel)) {
          hard.push({
            severity: 'error',
            file: rel,
            message: `${rel}/ — plans are FLAT; a folder here means plans stopped being deleted. Move what it holds out of ${plansDir}.`,
          });
          continue;
        }
        if (!entry.endsWith('.md') || entry === 'README.md' || isExempt(ctx.vcs, except, rel)) continue;
        if (!testStateless(name, entry)) {
          hard.push({
            severity: 'error',
            file: rel,
            message: `${rel} — its name must match ${name}. Rename the plan.`,
          });
        }
        plans.push(entry);
      }

      const short = refusedPlans(self.id, plans.length, plansDir, options.corpus);
      if (short) return short;

      for (const entry of plans) {
        const rel = `${plansDir}/${entry}`;
        const text = ctx.files.read(rel);
        const lines = text.split('\n');

        for (let index = 0; index < lines.length; index++) {
          if (sizing.some((p) => testStateless(p, lines[index]))) {
            soft.push({
              severity: 'error',
              file: rel,
              line: index + 1,
              message: `${rel}:${index + 1} sizes work — a plan states dependency and deployability, not hours. Say what the phase depends on instead.`,
            });
          }
        }

        // A plan may only name a check that already exists: there is no escape hatch for a
        // plan that INTRODUCES one, and an unknown id is a hard error rather than a tolerated
        // finding. So a plan whose phase delivers a new check cannot state its acceptance as
        // `--id <that check>`; it routes through the script path instead until the check
        // lands. Deliberate, and the cost is real — weigh it before adding a declaration
        // mechanism.
        for (const m of text.matchAll(/--id\s+([a-z0-9-]+)/g)) {
          if (!knownIds(ctx, options.knownCheckIds).has(m[1])) {
            const line = lineOf(text, m.index as number);
            hard.push({
              severity: 'error',
              file: rel,
              line,
              message: `${rel}:${line} names '--id ${m[1]}', which is not a check this run knows. Name a check the roster has, or state the acceptance as the command that runs it until it lands.`,
            });
          }
        }

        for (const section of phaseSections(lines, phaseHeading)) {
          if (!section.body.some((line) => testStateless(command, line))) {
            soft.push({
              severity: 'error',
              file: rel,
              line: section.line,
              message: `${rel}:${section.line} ${section.title.slice(0, 100)} — a phase with no acceptance command has no definition of done. End it with the command that proves it.`,
            });
          }
        }
      }

      // A folder holding no plan yet is a valid state — nothing is in flight — but a blank
      // pass reads as "every plan is well-shaped", so it says it looked at none.
      const notes = plans.length === 0 ? [nothingInFlight(plansDir)] : [];
      return debtVerdict({ hard, soft, notes }, thresholdOf(ctx, self), {
        id: self.id,
        examined: plans.length,
        unit: 'plan',
      });
    },
  );
}

/** The ids an acceptance may name: the caller's list, or the engine's roster. */
function knownIds(ctx: ICheckContext, given?: readonly string[]): ReadonlySet<string> {
  return new Set(given ?? ctx.roster().map((c) => c.id));
}
