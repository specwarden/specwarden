import type { IFileSource, IRule } from '../../../../domain';
import type { IRepoShape } from '../../adopt/detect-repo/detect-repo.util';

/**
 * The files `init` writes, as text.
 *
 * Kept apart from the command so each one can be asserted directly — a generator whose
 * output is only ever checked by eye produces files nobody notices are wrong until a
 * newcomer runs them. That is not hypothetical: this generator once emitted a config
 * importing `docPaths` from the engine, months after that check moved to a module. It
 * typechecked, it read correctly, and it failed on the first run with an import error.
 * Hence `availableModules` — the scaffold writes what the repository can actually
 * resolve, and nothing else.
 *
 * WHAT IT GENERATES IS THE CONVENTION, NOT A CONFIG. A check is a file under
 * `checks/<family>/<id>.check.mjs`, discovered by the engine; the config names only what
 * the tree cannot express. So `init` writes the tree: a family folder per installed
 * module, one check file in each, a README explaining the shape, and a short config.
 * The first thing a newcomer sees is the structure they will grow, not a list they
 * will have to keep in step with a folder.
 *
 * Every generated file is COMMENTED. A scaffold that emits bare configuration teaches
 * nothing, and the reader's next move is to search for documentation elsewhere; the
 * comments are the documentation, at the point of use.
 */

/** A module the scaffold knows how to wire: where its first check goes, and what it says. */
interface IKnownModule {
  readonly pkg: string;
  readonly family: string;
  /** The rule the generated check enforces, so a fresh tree has no orphan: every check
   * names a rule, every rule names its check, and the newcomer sees the pairing. */
  readonly rule: { readonly id: string; readonly statement: string; readonly checkId: string };
  readonly render: (shape: IRepoShape) => { readonly file: string; readonly body: string };
}

const docGlob = (shape: IRepoShape): string => (shape.docDirs.length ? `${shape.docDirs[0]}/**/*.md` : '**/*.md');

const SECURITY: IKnownModule = {
  pkg: '@specwarden/security',
  family: 'security',
  rule: {
    id: 'no-credentials-in-tree',
    statement: 'A credential never enters the repository, not even a revoked one.',
    checkId: 'secret-scan',
  },
  render: () => ({
    file: 'secret-scan.check.mjs',
    body: `/**
 * \`secret-scan\` — a credential-shaped string anywhere in the tracked tree.
 *
 * The built-in library covers a few common vendor formats. It is a PRESET, not a
 * mandate: add your own with \`patterns.extra\`, switch one off with \`patterns.disable\`
 * (a reason is required, and it is reported), or supply the whole library with
 * \`patterns.replace\`. A match means ROTATE first, delete second.
 */
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  id: 'secret-scan',
  title: 'no credential-shaped string is committed',
  tier: 'fast',
});
`,
  }),
};

const DOCS: IKnownModule = {
  pkg: '@specwarden/docs',
  family: 'docs',
  rule: {
    id: 'paths-in-documentation-resolve',
    statement: 'Every repository-relative path named in documentation exists.',
    checkId: 'doc-paths',
  },
  render: (shape) => ({
    file: 'doc-paths.check.mjs',
    body: `/**
 * \`doc-paths\` — every repository-relative path named in documentation resolves.
 *
 * The commonest way documentation rots: a file moves, the prose does not, and a
 * reader — or an agent — follows the old path, finds nothing, and invents the rest.
 *
 * More from the same module, when you want them: \`docSymbols\` (a renamed class leaves
 * its old name in prose; takes another language's grammar), \`docCounts\` ("seven
 * services" in a document that describes nine; its vocabulary is English by default
 * and overridable), \`docHygiene\`, \`docPlacement\`.
 */
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'paths named in documentation exist',
  tier: 'fast',
  docs: '${docGlob(shape)}',
});
`,
  }),
};

/**
 * Which optional modules this repository can already import.
 *
 * Read from the manifest rather than from disk: a dependency declared but not yet
 * installed is still the repository's intent, and generating for it produces a tree
 * that works after the next install rather than one that never mentions it.
 */
export function availableModules(files: IFileSource): readonly IKnownModule[] {
  const manifest = files.tryRead('package.json') ?? '';
  return [SECURITY, DOCS].filter((m) => manifest.includes(`"${m.pkg}"`));
}

/** The check files to write: one per installed module, each in its family folder. */
export function renderCheckFiles(
  shape: IRepoShape,
  modules: readonly IKnownModule[],
): readonly { readonly path: string; readonly body: string }[] {
  return modules.map((m) => {
    const { file, body } = m.render(shape);
    return { path: `checks/${m.family}/${file}`, body };
  });
}

export function renderConfig(extras: { imports?: string; fields: string } = { fields: '' }): string {
  return `import { defineConfig } from 'specwarden';

import { rules } from './rules.mjs';${extras.imports ? `\n${extras.imports}` : ''}

/**
 * What this repository enforces — the part the tree cannot say for itself.
 *
 * The engine reads \`checks/\` by convention: every \`*.check.mjs\` under it is a check,
 * found without being named here. The harness's own audits — rule ownership, rule
 * coverage, orphans, enforcer resolution, ratchet direction — are assembled from
 * defaults and appear in the manifest without being declared. So this file holds only
 * what has no other home: plugins, ownership, relevance inputs, and the tier names.
 *
 * Checks are enabled DELIBERATELY, one file each. A check nobody chose, failing on day
 * one, teaches that this tool is noisy — and that lesson outlives the check.
 */
export default defineConfig({
  rules,
${extras.fields}
  /**
   * A diff touching one of these can affect anything, so relevance filtering is
   * skipped for it. Start empty; add a prefix when you notice a gate that should have
   * run and did not.
   */
  sharedBuildInputs: [],
});
`;
}

export function renderChecksReadme(modules: readonly IKnownModule[], template = ''): string {
  const families = template
    ? `| _the folders beside this README_ | from the \`${template}\` template |`
    : modules.length
      ? modules.map((m) => `| \`${m.family}/\` | from \`${m.pkg}\` |`).join('\n')
      : '| _(none yet)_ | install a module and its family folder appears here |';
  return `# checks/

One file per check, grouped by SUBJECT — a family is what a check is about, never
when it runs. The engine discovers every \`*.check.mjs\` beneath this folder; nothing
has to import or list it.

| Family | Holds |
| --- | --- |
${families}

## Adding a check

Create \`<family>/<id>.check.mjs\` exporting \`check\`, with \`id\` equal to the file name.
For an external command:

\`\`\`js
import { commandCheck } from 'specwarden';
export const check = commandCheck({ id: 'lint', title: 'ESLint', tier: 'heavy', cmd: 'pnpm lint', when: () => true });
\`\`\`

For a native one, a module factory (\`docPaths\`, \`secretScan\`, …) or \`fromResult\` over a
function of your own — it receives the check context, so read through \`ctx.files\` and
\`ctx.vcs\`, never the disk.

**Show it RED before believing it.** Write the failing case first and watch the check
reject it. A check nobody has seen fail is a hope.

Then \`specwarden check --list\` shows it — the moment the file exists.
`;
}

export function renderRules(modules: readonly IKnownModule[] = [], extra: readonly IRule[] = []): string {
  // A single-quoted JS literal. The backslash goes first, or the escapes added after it
  // would themselves be escaped; a line break would end the literal mid-statement.
  const quote = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  // A not-mechanizable rule keeps its REASON. Rendered as `checkIds: []` it became a rule
  // neither enforced nor excused — the one state the coverage audit refuses.
  const enforcementSource = (e: IRule['enforcement']): string =>
    'notMechanizable' in e
      ? `{ notMechanizable: '${quote(e.notMechanizable)}' }`
      : `{ checkIds: [${e.checkIds.map((c) => `'${quote(c)}'`).join(', ')}] }`;
  const asSource = (id: string, statement: string, owner: string, enforcement: IRule['enforcement']): string =>
    [
      '  {',
      `    id: '${quote(id)}',`,
      `    statement: '${quote(statement)}',`,
      `    owner: '${quote(owner)}',`,
      `    enforcement: ${enforcementSource(enforcement)},`,
      '  },',
    ].join('\n');

  const generated = [
    ...modules.map((m) =>
      asSource(m.rule.id, m.rule.statement, '.specwarden/README.md', { checkIds: [m.rule.checkId] }),
    ),
    // A template's rules arrive already owned by the caller — it knows where the README
    // it just wrote is; the template does not.
    ...extra.map((r) => asSource(r.id, r.statement, r.owner, r.enforcement)),
  ].join('\n');
  return `/**
 * What this repository has DECIDED — separate from what it can check.
 *
 * A rule is a decision with an owner document. Some are enforced by a check; some
 * cannot be mechanised at all, and those are declared here WITH A REASON rather than
 * left unsaid. That is the point of the file: \`specwarden doctor\` can then answer
 * "what do we believe, and how much of it is actually verified" — a question no list
 * of passing checks answers.
 *
 * The engine refuses a rule that is unenforced AND has no stated reason. Not because
 * every rule must be automated, but because "we never got to it" and "this cannot be
 * automated" are different states, and only one of them is finished.
 *
 * Declaring this list — even empty — turns the rule audits on. With no \`rules\` key at
 * all the engine leaves them off, so a repository with checks and no rules yet is not
 * met by a red orphan-check for the checks it just enabled.
 */
export const rules = [
${generated}${generated ? '\n' : ''}  // A rule nothing can mechanise is still declared — with the reason, which is what
  // separates "we never got to it" from "this cannot be automated":
  // {
  //   id: 'reviews-before-merge',
  //   statement: 'Every change to main is reviewed by someone who did not write it.',
  //   owner: 'CONTRIBUTING.md',
  //   enforcement: { notMechanizable: 'Enforced by branch protection in the forge, not here.' },
  // },
];
`;
}

export function renderReadme(): string {
  return `# .specwarden/

This repository's own facts. The engine is the package; everything here is yours.

\`\`\`
.specwarden/
  warden.config.mjs   the ENTRY — only what the tree cannot say for itself
  rules.mjs           what this repository has decided, and who owns each decision
  checks/             one file per check, by family; the engine discovers them
  perimeter.mjs       what an assistant may not do here (optional)
  relevance.mjs       which paths a gate cares about, when a diff should skip it (optional)
  ratchets/           DATA, written by --tighten — commit it
  baseline/           DATA — same reasoning
\`\`\`

Every declaration above may instead live in its OWN FOLDER together with its test: a
\`perimeter\` folder holding \`perimeter.mjs\` beside \`perimeter.test.mjs\`, named for the
stem before the first dot. The engine resolves both layouts, so a house style that keeps a
tested file and its test together does not have to argue with the CLI. A check under
\`checks/\` is discovered at any depth and needs no permission at all.

*(That example names a folder and two files rather than two paths on purpose: a
\`doc-paths\` check reads any backticked path carrying a slash as a claim that the file
exists, and this document is scaffolded into trees that write no perimeter. A starter tree
that fails the first gate it ships with teaches the wrong thing about the gate.)*

## The one rule about this folder

**Repository facts live here; the engine never learns them.** A workspace name, a
table, a vendor, a directory layout — all of it belongs on this side. That boundary is
what lets the engine be upgraded without re-learning your repository, and it is
enforced: a product source naming a host literal fails its own zone check.

## Getting further

- \`specwarden check --all\` — run everything, ignoring relevance filtering.
- \`specwarden check --list\` — the manifest: every check the engine found, in run order.
- \`specwarden doctor\` — what is declared, without running any of it.
- \`specwarden suggest\` — rules this repository already follows, each ratchet set to
  current reality. Nothing is enabled for you.
- \`specwarden check --tighten\` — lower every ratchet to today's count, so the next
  regression fails.
- \`specwarden check --jobs 4\` — overlap the work; a check that cannot share the machine
  declares \`exclusive: true\`.
`;
}
