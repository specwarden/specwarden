import type { IPart } from '../_shared/part.model';

export type TSpecFramework = 'openspec' | 'speckit';

/**
 * Wiring a SPEC FRAMEWORK — OpenSpec, Spec Kit, or one nobody has written yet.
 *
 * What this contributes is not a check but a `specSource` field in the config, plus the
 * file that constructs it. The engine then has an answer to "where do requirements and
 * tasks come from", which is what `specwarden sync-invariants` reconciles the corpus
 * against.
 *
 * WHY IT IS A FILE AND NOT A LINE IN THE CONFIG. A source is where the layout of a
 * foreign tool is declared — its root, its file names, how it words a requirement — and
 * that is exactly the knowledge that goes stale on the tool's next minor release. In
 * its own file it has room for the comment saying so.
 *
 * BRING YOUR OWN: `ISpecSource` is two functions, `requirements()` and `tasks()`, each
 * returning `{ found, items, note? }`. A source that cannot read its tool answers
 * `found: false` — never an empty list, which reads as agreement.
 */
export const specSourcePart = (framework: TSpecFramework): IPart => {
  const pkg = `specwarden-module-${framework}`;
  const body =
    framework === 'openspec'
      ? `/**
 * The spec source — OpenSpec.
 *
 * Requirements come from \`openspec/specs/<capability>/spec.md\` (the
 * \`### Requirement:\` headings), tasks from \`openspec/changes/<change>/tasks.md\`.
 * Both paths are OPTIONS rather than memorised facts: a tool that reorganises its
 * layout in a minor release is the normal case, and a memorised layout turns that into
 * a source that finds nothing while reporting success.
 *
 * SpecWarden never WRITES here. Reading the tool's directory is the whole relationship.
 */
import { openspec } from 'specwarden-module-openspec';

export const source = openspec({
  // root: 'openspec',
  // requirementHeading: /^#{2,4}\\s+Requirement:\\s*(.+?)\\s*$/,
});
`
      : `/**
 * The spec source — Spec Kit.
 *
 * Requirements and tasks both come from \`specs/<feature>/\` — \`spec.md\` for the
 * \`**FR-001**: the system MUST …\` lines, \`tasks.md\` for the checkboxes. Ids keep
 * their upstream spelling, prefixed by the feature: two features may both number from
 * FR-001, and a collision would silently merge two different requirements into one.
 *
 * Every path is an OPTION. A tool that reorganises its layout in a minor release is the
 * normal case, and a memorised layout turns that into a source that finds nothing while
 * reporting success.
 */
import { speckit } from 'specwarden-module-speckit';

export const source = speckit({
  // root: 'specs',
  // specFile: 'spec.md',
  // tasksFile: 'tasks.md',
});
`;

  return {
    files: [{ path: 'spec-source.mjs', body }],
    rules: [],
    configExtras: {
      imports: `import { source as specSource } from './spec-source.mjs';`,
      fields: `
  // Where requirements and tasks come from. \`specwarden sync-invariants\` reads this
  // and reconciles it against the invariants deposited in the corpus; it PRINTS the
  // proposed edit and writes nothing, because turning a requirement's wording into an
  // invariant read as truth about behaviour is a person's decision.
  //
  // Swap ${pkg} for any other implementation of ISpecSource — two functions — and
  // nothing else here changes.
  specSource,

  // The other half of the reconciliation: where invariants are already deposited, and
  // how one is identified. Without it every requirement reads as "not deposited yet",
  // which is honest but noisy. The id pattern is your documentation's convention.
  // invariants: { docs: 'docs/**/*.md', idPattern: /<!--\\s*invariant:\\s*([a-z0-9-]+)\\s*-->/g },
`,
    },
  };
};
