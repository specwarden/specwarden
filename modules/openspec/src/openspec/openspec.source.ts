import type { IFileSource, ISpecRequirement, ISpecSource, ISpecSourceResult, ISpecTask } from 'specwarden';

export interface IOpenspecOptions {
  /** The OpenSpec root; its layout is configured, not memorized, so a version that
   * moves things does not break silently. */
  readonly root?: string;
  /** The file holding a capability's requirements, inside each capability folder. */
  readonly specFile?: string;
  /** Matches a requirement heading, capturing its statement. OpenSpec writes
   * `### Requirement: The system SHALL …`; a fork that spells it differently says so
   * here rather than discovering the silence later. */
  readonly requirementHeading?: RegExp;
}

const TASK_LINE = /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/;
const REQUIREMENT_HEADING = /^#{2,4}\s+Requirement:\s*(.+?)\s*$/;

/** A stable id from a statement: the same wording gives the same id across runs. */
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/**
 * The OpenSpec source — requirements from `openspec/specs/<capability>/spec.md`, tasks
 * from `openspec/changes/<change>/tasks.md`. It is here to prove the port has a second,
 * real implementation and to hold the contract every adapter owes: when it does not find
 * what it expects, it says so (`found: false`), and it does NOT return an empty list,
 * because an empty list reads as "nothing to do" and is a check that cannot fail.
 *
 * That contract was stated here while `requirements()` broke it — returning `found: true`
 * with nothing in it for any specs directory. See the method for what that cost.
 *
 * SpecWarden never WRITES here — reading a foreign tool's directory is the whole
 * relationship; writing to it is the boundary the ownership map forbids.
 */
export function openspec(options: IOpenspecOptions = {}): ISpecSource {
  const root = options.root ?? 'openspec';
  const specFile = options.specFile ?? 'spec.md';
  // Without `g` or `y`: `exec` on such a regex resumes from `lastIndex`, which survives from
  // one line to the next, so a consumer's `/g` heading read every second requirement.
  const given = options.requirementHeading ?? REQUIREMENT_HEADING;
  const heading = given.global || given.sticky ? new RegExp(given.source, given.flags.replace(/[gy]/g, '')) : given;
  return {
    name: 'openspec',
    /**
     * Requirements, read from `openspec/specs/<capability>/spec.md`.
     *
     * THIS USED TO RETURN AN EMPTY LIST with `found: true`, which is the exact defect
     * the header above warns about: `sync-invariants` printed "0 requirements" and then
     * "✓ in sync", which is a reconciliation that cannot fail. An empty corpus is now
     * reported as one — with the directory it read and a note — rather than passed off
     * as agreement.
     */
    requirements(files: IFileSource): ISpecSourceResult<ISpecRequirement> {
      const specsDir = `${root}/specs`;
      if (!files.exists(specsDir) || !files.isDirectory(specsDir)) {
        return { found: false, items: [], note: `${specsDir} not found — is OpenSpec installed here?` };
      }
      const items: ISpecRequirement[] = [];
      for (const capability of files.list(specsDir)) {
        const content = files.tryRead(`${specsDir}/${capability}/${specFile}`);
        if (content === undefined) continue;
        for (const line of content.split('\n')) {
          const m = heading.exec(line);
          // Prefixed by the capability: OpenSpec identifies a requirement by its
          // wording, and two capabilities may word one the same way.
          if (m) items.push({ id: `${capability}#${slug(m[1])}`, statement: m[1] });
        }
      }
      return items.length > 0
        ? { found: true, items }
        : {
            found: true,
            items,
            note: `${specsDir} holds no requirement heading — nothing to reconcile against. Pass \`requirementHeading\` if this OpenSpec version words them differently.`,
          };
    },
    tasks(files: IFileSource): ISpecSourceResult<ISpecTask> {
      const changesDir = `${root}/changes`;
      if (!files.exists(changesDir) || !files.isDirectory(changesDir)) {
        return { found: false, items: [], note: `${changesDir} not found — is OpenSpec installed here?` };
      }
      const items: ISpecTask[] = [];
      for (const change of files.list(changesDir)) {
        const tasksFile = `${changesDir}/${change}/tasks.md`;
        const content = files.tryRead(tasksFile);
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
        : { found: true, items, note: `${changesDir} holds no task checkbox — no change has a \`tasks.md\` yet.` };
    },
  };
}
