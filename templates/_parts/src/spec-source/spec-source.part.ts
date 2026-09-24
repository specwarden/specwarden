import type { IPart } from '../_shared/part.model';

export type TSpecFramework = 'openspec' | 'speckit';

/**
 * Wiring a SPEC FRAMEWORK — OpenSpec, Spec Kit, or one nobody has written yet.
 *
 * What this contributes is not a check but a `specSource` field in the config, plus the
 * file that constructs it, so `specwarden sync-invariants` has an answer to "where do
 * requirements and tasks come from". In its own file, because a foreign tool's layout is
 * exactly the knowledge that goes stale on the tool's next minor release.
 *
 * BRING YOUR OWN: `ISpecSource` is two functions, `requirements()` and `tasks()`. A source
 * that cannot read its tool answers `found: false` — never an empty list, which reads as
 * agreement.
 */
export const specSourcePart = (framework: TSpecFramework): IPart => {
  const body =
    framework === 'openspec'
      ? `// The spec source — OpenSpec: requirements from the \`### Requirement:\` headings under
// openspec/specs, tasks from each change's tasks.md. Every path is an option, because a
// memorised layout finds nothing the day the tool moves it. Nothing here is ever written.
import { openspec } from '@specwarden/openspec';

export const source = openspec({
  // specsDir: 'openspec/specs',
  // changesDir: 'openspec/changes',
  // requirementPattern: /^#{2,4}\\s+Requirement:\\s*(.+?)\\s*$/,
});
`
      : `// The spec source — Spec Kit: requirements from each feature's spec.md (\`**FR-001**: …\`),
// tasks from its tasks.md, each id prefixed by its feature so two FR-001s stay two. Every
// path is an option, because a memorised layout finds nothing the day the tool moves it.
import { speckit } from '@specwarden/speckit';

export const source = speckit({
  // featuresDir: 'specs',
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
  // Where requirements and tasks come from; \`specwarden sync-invariants\` prints what to deposit,
  // against where invariants are deposited and how one is marked:
  specSource,
  // invariants: { docs: 'docs/**/*.md', idPattern: /<!--\\s*invariant:\\s*([^\\s>]+)\\s*-->/g },
`,
    },
  };
};
