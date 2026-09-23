import type { IFileSource, ISpecRequirement, ISpecSource, ISpecSourceResult, ISpecTask } from 'specwarden';

export interface ISpeckitOptions {
  /** Where feature folders live. Spec Kit puts them in `specs/`; a repository that
   * moved them says so here rather than discovering the silence later. */
  readonly root?: string;
  /** The file holding a feature's requirements, inside each feature folder. */
  readonly specFile?: string;
  /** The file holding a feature's task list. */
  readonly tasksFile?: string;
}

const TASK_LINE = /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/;
/** Spec Kit writes requirements as `- **FR-001**: the system MUST …`, and variations
 * of it. Captured loosely on purpose: the id is what matters, and the statement is
 * carried through untranslated — attaching proof is this engine's job, rewording
 * another tool's requirement is not. */
const REQUIREMENT_LINE = /^\s*[-*]\s*\*{0,2}([A-Z]{2,}-\d+)\*{0,2}\s*[:.]?\s*(.+?)\s*$/;

/**
 * The Spec Kit source — the third implementation of `ISpecSource`, and the one that
 * shows the port carries its weight.
 *
 * Two adapters can share an accident; three cannot. OpenSpec keeps tasks under
 * `changes/<change>/tasks.md` and has no machine-readable requirements at all, Spec
 * Kit keeps both under `specs/<feature>/`, and the native source reads this
 * repository's own documents — yet all three answer the same two questions, which is
 * what makes "bring your own spec tool" a real offer rather than a claim.
 *
 * Every path is an OPTION. A tool that reorganises its layout in a minor release is
 * the normal case, not the exception, and a memorised layout turns that into a source
 * that finds nothing while reporting success.
 *
 * SpecWarden never WRITES here. Reading a foreign tool's directory is the whole
 * relationship; writing to it is what the ownership map forbids.
 */
export function speckit(options: ISpeckitOptions = {}): ISpecSource {
  const root = options.root ?? 'specs';
  const specFile = options.specFile ?? 'spec.md';
  const tasksFile = options.tasksFile ?? 'tasks.md';

  const features = (files: IFileSource): readonly string[] | undefined =>
    files.exists(root) && files.isDirectory(root) ? files.list(root) : undefined;

  const missing = <T>(): ISpecSourceResult<T> => ({
    found: false,
    items: [],
    note: `${root}/ not found — is Spec Kit initialised here? Set \`root\` if its features live elsewhere.`,
  });

  return {
    name: 'speckit',

    requirements(files: IFileSource): ISpecSourceResult<ISpecRequirement> {
      const dirs = features(files);
      if (!dirs) return missing();
      const items: ISpecRequirement[] = [];
      for (const feature of dirs) {
        const content = files.tryRead(`${root}/${feature}/${specFile}`);
        if (content === undefined) continue;
        for (const line of content.split('\n')) {
          const m = REQUIREMENT_LINE.exec(line);
          // The id keeps its upstream spelling, prefixed by the feature it belongs to:
          // two features may both number from FR-001, and a collision would silently
          // merge two different requirements into one.
          if (m) items.push({ id: `${feature}#${m[1]}`, statement: m[2] });
        }
      }
      // Found, and empty, says so: a bare empty list is what a requirement format that
      // drifted from `- **FR-001**: …` looks like, and it reads as "nothing to reconcile".
      return items.length > 0
        ? { found: true, items }
        : {
            found: true,
            items,
            note: `${root}/ holds no requirement line (\`- **FR-001**: …\`) in any \`${specFile}\` — nothing to reconcile against.`,
          };
    },

    tasks(files: IFileSource): ISpecSourceResult<ISpecTask> {
      const dirs = features(files);
      if (!dirs) return missing();
      const items: ISpecTask[] = [];
      for (const feature of dirs) {
        const content = files.tryRead(`${root}/${feature}/${tasksFile}`);
        if (content === undefined) continue;
        let n = 0;
        for (const line of content.split('\n')) {
          const m = TASK_LINE.exec(line);
          if (!m) continue;
          n++;
          items.push({ id: `${feature}#${n}`, title: m[2], done: m[1].toLowerCase() === 'x' });
        }
      }
      return items.length > 0
        ? { found: true, items }
        : { found: true, items, note: `${root}/ holds no task checkbox in any \`${tasksFile}\` yet.` };
    },
  };
}
