import type { IFileSource, ISpecRequirement, ISpecSource, ISpecSourceResult, ISpecTask } from 'specwarden';
import { checkOptions } from 'specwarden';

export interface IOpenspecOptions {
  /** Where the capability folders live, each holding its `specFile`. Default: `openspec/specs`. */
  readonly specsDir?: string;
  /** Where the change folders live, each holding its `tasksFile`. Default: `openspec/changes`. */
  readonly changesDir?: string;
  /** The file holding a capability's requirements, inside each capability folder.
   * Default: `spec.md`. */
  readonly specFile?: string;
  /** The file holding a change's task checkboxes, inside each change folder.
   * Default: `tasks.md`. */
  readonly tasksFile?: string;
  /** Matches a requirement line, capturing its statement. OpenSpec writes
   * `### Requirement: The system SHALL …`; a fork that spells it differently says so
   * here rather than discovering the silence later. Default: `DEFAULT_REQUIREMENT_PATTERN`. */
  readonly requirementPattern?: RegExp;
}

const TASK_LINE = /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/;

/** A requirement heading as OpenSpec writes it, capturing the statement. */
export const DEFAULT_REQUIREMENT_PATTERN = /^#{2,4}\s+Requirement:\s*(.+?)\s*$/;

/** A stable id from a statement: the same wording gives the same id across runs. */
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/**
 * The OpenSpec source — requirements from `<specsDir>/<capability>/<specFile>`, tasks from
 * `<changesDir>/<change>/<tasksFile>`. It is here to prove the port has a second, real
 * implementation and to hold the contract every adapter owes: when it does not find what it
 * expects, it says so (`found: false`), and it does NOT return an empty list, because an
 * empty list reads as "nothing to do" and is a check that cannot fail.
 *
 * That contract was stated here while `requirements()` broke it — returning `found: true`
 * with nothing in it for any specs directory. See the method for what that cost.
 *
 * EVERY PATH IS AN OPTION. The source said so while `specs/`, `changes/` and `tasks.md` were
 * written into it: a layout moved by the tool's next release was a source that found
 * nothing where the consumer pointed it, with no option to point it elsewhere.
 *
 * specwarden never WRITES here — reading a foreign tool's directory is the whole
 * relationship; writing to it is the boundary the ownership map forbids.
 */
export function openspec(options: IOpenspecOptions = {}): ISpecSource {
  // A source is not a check, so the identity every check takes (`id`, `tier`, `rule`, …) is
  // refused here rather than accepted and dropped — and a misspelled path (`specsFile`) was
  // dropped in silence, leaving a source that found nothing where the author pointed it.
  checkOptions(
    'openspec',
    options,
    {
      specsDir: { kind: 'string', nonEmpty: true },
      changesDir: { kind: 'string', nonEmpty: true },
      specFile: { kind: 'string', nonEmpty: true },
      tasksFile: { kind: 'string', nonEmpty: true },
      requirementPattern: { kind: 'regexp' },
    },
    { identity: false },
  );
  const specsDir = options.specsDir ?? 'openspec/specs';
  const changesDir = options.changesDir ?? 'openspec/changes';
  const specFile = options.specFile ?? 'spec.md';
  const tasksFile = options.tasksFile ?? 'tasks.md';
  // Without `g` or `y`: `exec` on such a regex resumes from `lastIndex`, which survives from
  // one line to the next, so a consumer's `/g` pattern read every second requirement.
  const given = options.requirementPattern ?? DEFAULT_REQUIREMENT_PATTERN;
  const pattern = given.global || given.sticky ? new RegExp(given.source, given.flags.replace(/[gy]/g, '')) : given;
  return {
    name: 'openspec',
    /**
     * Requirements, read from `<specsDir>/<capability>/<specFile>`.
     *
     * THIS USED TO RETURN AN EMPTY LIST with `found: true`, which is the exact defect
     * the header above warns about: `sync-invariants` printed "0 requirements" and then
     * "✓ in sync", which is a reconciliation that cannot fail. An empty corpus is now
     * reported as one — with the directory it read and a note — rather than passed off
     * as agreement.
     */
    requirements(files: IFileSource): ISpecSourceResult<ISpecRequirement> {
      if (!files.exists(specsDir) || !files.isDirectory(specsDir)) {
        return {
          found: false,
          items: [],
          note: `${specsDir} not found — is OpenSpec installed here? Set \`specsDir\` if its capabilities live elsewhere.`,
        };
      }
      const items: ISpecRequirement[] = [];
      for (const capability of files.list(specsDir)) {
        const content = files.tryRead(`${specsDir}/${capability}/${specFile}`);
        if (content === undefined) continue;
        for (const line of content.split('\n')) {
          const m = pattern.exec(line.replace(/\r$/, ''));
          // Prefixed by the capability: OpenSpec identifies a requirement by its
          // wording, and two capabilities may word one the same way.
          if (m?.[1]) items.push({ id: `${capability}#${slug(m[1])}`, statement: m[1] });
        }
      }
      return items.length > 0
        ? { found: true, items }
        : {
            found: true,
            items,
            note: `${specsDir} holds no requirement heading in any \`${specFile}\` — nothing to reconcile against. Pass \`requirementPattern\` if this OpenSpec version words them differently.`,
          };
    },
    tasks(files: IFileSource): ISpecSourceResult<ISpecTask> {
      if (!files.exists(changesDir) || !files.isDirectory(changesDir)) {
        return {
          found: false,
          items: [],
          note: `${changesDir} not found — is OpenSpec installed here? Set \`changesDir\` if its changes live elsewhere.`,
        };
      }
      const items: ISpecTask[] = [];
      for (const change of files.list(changesDir)) {
        const content = files.tryRead(`${changesDir}/${change}/${tasksFile}`);
        if (content === undefined) continue;
        let n = 0;
        for (const line of content.split('\n')) {
          const m = TASK_LINE.exec(line);
          if (!m) continue;
          n++;
          items.push({ id: `${change}#${n}`, title: m[2], done: m[1].toLowerCase() === 'x' });
        }
      }
      // The same contract `requirements()` was fixed to keep: found, and empty, says so —
      // a bare empty list reads as "every task is done", which is a check that cannot fail.
      return items.length > 0
        ? { found: true, items }
        : {
            found: true,
            items,
            note: `${changesDir} holds no task checkbox — no change has a \`${tasksFile}\` yet.`,
          };
    },
  };
}
