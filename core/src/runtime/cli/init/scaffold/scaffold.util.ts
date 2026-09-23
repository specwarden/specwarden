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
 * `checks/<family>/<id>.check.mjs`, discovered by the engine and named by its file; the
 * config names only what the tree cannot express.
 *
 * SHORT, AND TRUE OF THIS TREE. Each generated file carries a header and its options;
 * the reasoning lives in the module's GUIDE. The READMEs describe the files that were
 * written — a sentence about a check the tree does not run, or a folder nobody wrote, is
 * the scaffold teaching the newcomer that its prose is decoration.
 */

/** A module the scaffold knows how to wire: where its first check goes, and what it says. */
interface IKnownModule {
  readonly pkg: string;
  readonly family: string;
  readonly render: (shape: IRepoShape) => { readonly file: string; readonly body: string };
}

const docGlob = (shape: IRepoShape): string => (shape.docDirs.length ? `${shape.docDirs[0]}/**/*.md` : '**/*.md');

const SECURITY: IKnownModule = {
  pkg: '@specwarden/security',
  family: 'security',
  render: () => ({
    file: 'secret-scan.check.mjs',
    body: `// \`secret-scan\` — no credential-shaped string in any tracked file.
// A committed key outlives its deletion in history: a match means rotate first, delete second.
// Add a format with \`patterns.extra\`; switch one off with \`patterns.disable\`, which takes a reason.
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  rule: 'A credential never enters the repository, not even a revoked one.',
});
`,
  }),
};

const DOCS: IKnownModule = {
  pkg: '@specwarden/docs',
  family: 'docs',
  render: (shape) => ({
    file: 'doc-paths.check.mjs',
    body: `// \`doc-paths\` — every repository-relative path named in documentation resolves.
// A file moves, the prose does not, and a reader follows the old path to nothing.
// \`docs\` is what is read; the module also has docSymbols, docCounts, docHygiene, docPlacement.
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  docs: '${docGlob(shape)}',
  rule: 'Every repository-relative path named in documentation exists.',
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

// Only what the tree cannot say: every *.check.mjs under checks/ is found without being named here.
export default defineConfig({
  rules,
${extras.fields}});
`;
}

/** One file `init` wrote, as the tables in the READMEs describe it. */
export interface IWrittenFile {
  readonly path: string;
  readonly body: string;
}

/** The family folders under `checks/`, each with the checks in it and where they come from. */
function familiesOf(written: readonly IWrittenFile[]): readonly string[] {
  const families = new Map<string, { ids: string[]; from: Set<string> }>();
  for (const f of written) {
    const m = /^checks\/([^/]+)\/(.+?)\.check\.mjs(\.example)?$/.exec(f.path);
    if (!m) continue;
    const family = families.get(m[1]) ?? { ids: [], from: new Set<string>() };
    family.ids.push(m[3] ? `${m[2]} (example, off)` : m[2]);
    for (const [, pkg] of f.body.matchAll(/^import .* from '([^'.][^']*)';$/gm)) family.from.add(`\`${pkg}\``);
    families.set(m[1], family);
  }
  return [...families].map(([name, { ids, from }]) => `| \`${name}/\` | ${ids.join(', ')} | ${[...from].join(', ')} |`);
}

/** The install line for a package, in this repository's package manager. */
function installLine(pkg: string, shape: IRepoShape): string {
  if (shape.packageManager === 'npm') return `npm install --save-dev ${pkg}`;
  if (shape.packageManager === 'yarn') return `yarn add --dev ${pkg}`;
  return `pnpm add -D ${pkg}`;
}

/**
 * With nothing installed, what to install and the file each module then needs — whole.
 * The table said "install a module — `docPaths`, `secretScan` …", naming factories that
 * are not in the engine and listing nothing, while `init` said the README listed what to
 * add. `init` will not run twice over a config, so the file is the one step left.
 */
function startingModules(shape: IRepoShape): string {
  const fence = '```';
  const blocks = [SECURITY, DOCS].map((m) => {
    const { file, body } = m.render(shape);
    return [
      `**\`${m.pkg}\`** — \`${installLine(m.pkg, shape)}\`, then save as \`${m.family}/${file}\`:`,
      '',
      `${fence}js`,
      body.trimEnd(),
      fence,
    ].join('\n');
  });
  return [
    '## A module to start from',
    '',
    'Nothing is installed yet. Each module is one install and one file:',
    '',
    blocks.join('\n\n'),
    '',
    '',
  ].join('\n');
}

export function renderChecksReadme(written: readonly IWrittenFile[] = [], shape?: IRepoShape): string {
  const rows = familiesOf(written);
  const none = shape
    ? 'see _A module to start from_ below'
    : 'install a module, and save the check file its GUIDE shows';
  const table = rows.length ? rows.join('\n') : `| _(none yet)_ | ${none} | |`;
  const starting = rows.length === 0 && shape ? startingModules(shape) : '';
  return `# checks/

One file per check, grouped by SUBJECT — a family is what a check is about, never
when it runs. The engine discovers every \`*.check.mjs\` beneath this folder; nothing
has to import or list it.

| Family | Check files | From |
| --- | --- | --- |
${table}

${starting}## Adding a check

Create \`<family>/<id>.check.mjs\` exporting \`check\`. The file name is its id, and
\`rule\` is the statement it enforces, owned by the file. A module's check carries a rule of
its own; one built with the engine's \`commandCheck\`, \`fromResult\` or \`defineCheck\` has
none, and with no rule the run is red on orphan-check.

\`\`\`js
import { commandCheck } from 'specwarden';
export const check = commandCheck({ cmd: 'pnpm lint', tier: 'heavy', rule: 'Nothing merges while the linter is red.' });
\`\`\`

For a native one, a module factory or \`fromResult\` over a function of your own — it
receives the check context, so read through \`ctx.files\` and \`ctx.vcs\`, never the disk.

**Show it RED before believing it.** Write the failing case first and watch the check
reject it. A check nobody has seen fail is a hope.
`;
}

/** A single-quoted JavaScript literal. The backslash first, or the escapes after it double. */
const quote = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n');

/**
 * A not-mechanizable rule keeps its REASON. Rendered as `checkIds: []` it became a rule
 * neither enforced nor excused — the one state the coverage audit refuses.
 */
const enforcementSource = (e: IRule['enforcement']): string =>
  'notMechanizable' in e
    ? `{ notMechanizable: '${quote(e.notMechanizable)}' }`
    : `{ checkIds: [${e.checkIds.map((c) => `'${quote(c)}'`).join(', ')}] }`;

/**
 * `rules.mjs`: the register, for the rules no single check states.
 *
 * `live` are declared; `switchedOff` are the rules of the examples, written COMMENTED
 * OUT on one line each — live, they would name a check nobody registered and fail
 * `enforcement-resolves` on the tree just written; left out, the repository's statement
 * of the rule would live nowhere it can read, and an example built on an engine factory,
 * which implies no rule, would meet a red orphan-check nobody had mentioned.
 */
export function renderRules(live: readonly IRule[] = [], switchedOff: readonly IRule[] = []): string {
  const declared = live
    .map((r) =>
      [
        '  {',
        `    id: '${quote(r.id)}',`,
        `    statement: '${quote(r.statement)}',`,
        `    owner: '${quote(r.owner)}',`,
        `    enforcement: ${enforcementSource(r.enforcement)},`,
        '  },',
      ].join('\n'),
    )
    .join('\n');
  const off = switchedOff.map(
    (r) =>
      `  // { id: '${quote(r.id)}', statement: '${quote(r.statement)}', owner: '${quote(r.owner)}', enforcement: ${enforcementSource(r.enforcement)} },`,
  );
  return `// The rules no single check states — a check declares its own (\`rule: '…'\`) and its file owns it.
// Declaring the list, even empty, turns the rule audits on.
export const rules = [
${declared}${declared ? '\n' : ''}${
    off.length
      ? `  // Each switched-off example's rule: uncomment it when the example is renamed.\n${off.join('\n')}\n`
      : ''
  }  // A rule no check can enforce is declared with the reason:
  // { id: 'reviews-before-merge', statement: 'Every change to main is reviewed by someone who did not write it.', owner: 'CONTRIBUTING.md', enforcement: { notMechanizable: 'No check can see a review; branch protection in the forge enforces it.' } },
];
`;
}

/** What each file init can write beside `checks/` is for, in one line. */
const TOP_LEVEL: Readonly<Record<string, string>> = {
  'warden.config.mjs': 'the entry — only what the tree cannot say for itself',
  'rules.mjs': "the rules no single check states, and each example's rule, commented out",
  'README.md': 'this file',
  'perimeter.mjs': 'what an assistant may not do here, checked by a hook before the action runs',
  'spec-source.mjs': 'where requirements and tasks come from, for specwarden sync-invariants',
};

/** The one line `init` prints and the README lists for a file written beside `checks/`. */
export const describeTopLevel = (file: string): string => TOP_LEVEL[file] ?? 'written by the template';

/** The files written beside `checks/`, in the order the README lists them. */
export function topLevelFiles(written: readonly IWrittenFile[]): readonly string[] {
  return ['warden.config.mjs', 'rules.mjs', 'README.md', ...written.map((f) => f.path).filter((p) => !p.includes('/'))];
}

export function renderReadme(written: readonly IWrittenFile[] = []): string {
  const files = topLevelFiles(written);
  // Only where there is one: a paragraph about examples in a tree with none describes nothing.
  const examples = written.some((f) => f.path.endsWith('.example'))
    ? '\nAn `.example` under checks is switched off: it says what it needs, and is switched on by\nrenaming it AND uncommenting its rule in rules.mjs.'
    : '';
  const width = Math.max(...files.map((f) => f.length), 'checks/'.length) + 3;
  const listing = [...files, 'checks/']
    .map((f) =>
      f === 'checks/'
        ? `  ${'checks/'.padEnd(width)}one file per check, by family; the engine discovers every *.check.mjs`
        : `  ${f.padEnd(width)}${describeTopLevel(f)}`,
    )
    .join('\n');
  return `# .specwarden/

This repository's own checks and rules. The engine is the package; everything here is yours.

\`\`\`
.specwarden/
${listing}
\`\`\`

A check states the rule it enforces (\`rule: '…'\`), and its file owns that rule.${examples}
\`specwarden check --tighten\` writes a ratchets folder here the first time a ratchet has
something to hold — commit it.

## Getting further

- \`specwarden check --all\` — run everything, ignoring relevance filtering.
- \`specwarden check --list\` — every check the engine found, in run order.
- \`specwarden doctor\` — what is declared, without running any of it.
- \`specwarden check --tighten\` — lower every ratchet to today's count, so the next
  regression fails.
`;
}
