import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import { ciCoveragePart, compose, docPathsPart, scriptWrappersPart, secretScanPart } from '@specwarden/scaffold-parts';

/**
 * A starting tree for a pnpm WORKSPACE — several packages, one lockfile, one toolchain.
 *
 * What a monorepo gets wrong that a single package cannot: a lockfile that drifts from
 * the manifests, a build order that contradicts the dependency graph, versions of one
 * library disagreeing between workspaces, and a gate list that silently covers only the
 * packages somebody remembered to name. Each of those fails QUIETLY — the install still
 * works, the build still runs, both majors still compile — which is why they are worth
 * a check apiece.
 *
 * The build-order and dependency-pin checks are the reason this template exists rather
 * than being "node-ts, but run it in each package". The gate-coverage check joins them
 * when a workflow is detected: a workspace is where a gate list grows fastest, and a
 * gate nobody runs is the failure that looks exactly like a pass.
 *
 * Three of its files are written HERE rather than composed from the shared parts. They
 * are the ones whose whole content is a workspace's own policy — the lockfile command,
 * the build order, the pinning rules — and a part that took all of that as options
 * would be a template with extra steps.
 */
const shared = (ctx: ITemplateContext) =>
  compose(
    secretScanPart(ctx, {
      header: `a credential-shaped string anywhere in the tracked tree.
 *
 * One scan for the whole workspace: a credential does not care which package it landed
 * in, and a per-package scan is a per-package chance to forget one.`,
    }),
    docPathsPart(ctx, {
      header: `every repository-relative path named in documentation resolves.
 *
 * Worth more in a monorepo than anywhere else: paths cross package boundaries, and a
 * package that moves takes every document naming it with it.`,
    }),
    scriptWrappersPart(ctx),
    ciCoveragePart(ctx),
  );

export const monorepo: ITemplate = {
  name: 'monorepo',
  describe: 'a pnpm workspace — lockfile, build order, dependency pins, credential scan',
  requires: ['@specwarden/ops', '@specwarden/security', '@specwarden/docs'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => {
    const pm = ctx.packageManager ?? 'pnpm';
    return [
      {
        path: 'checks/workspace/lockfile.check.mjs',
        body: `/**
 * \`lockfile\` — the lockfile still describes the manifests.
 *
 * A drifted lockfile installs FINE on the machine that drifted it and differently
 * everywhere else, which is the shape of bug that costs an afternoon per person.
 */
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  id: 'lockfile',
  title: 'the lockfile is in sync with the manifests',
  tier: '${ctx.tier}',
  cmd: '${pm} install --frozen-lockfile',
  when: () => true,
  hint: "Run '${pm} install' from the repository root and commit the updated lockfile.",
});
`,
      },
      {
        path: 'checks/workspace/build-order.check.mjs.example',
        body: `/**
 * \`build-order\` — the declared build order follows the dependency graph.
 *
 * A package built before the one it depends on picks up the PREVIOUS build's output.
 * Nothing errors: the build succeeds, and ships something stale.
 *
 * Ships as \`.example\` because four of its inputs are facts about YOUR tooling that no
 * template can guess — where the packages are, what their name prefix is, which files
 * declare the order, and how a build is spelled in them. Fill the four in, rename to
 * \`.check.mjs\`, and it enforces the graph. Left half-configured it would find nothing
 * and report green, which is the failure this engine exists against.
 */
import { buildOrderFollowsDeps } from '@specwarden/ops';

export const check = buildOrderFollowsDeps({
  id: 'build-order',
  title: 'a package is built after everything it depends on',
  tier: '${ctx.tier}',
  // Where the workspace packages live.
  packagesDir: 'packages',
  // A workspace package's name prefix; anything else is an external dependency.
  scopePrefix: '@your-scope/',
  // The files that DECLARE the order — a Dockerfile, a CI workflow, a build script.
  containerFiles: 'Dockerfile*',
  // Matches one build invocation and captures the package name.
  buildInvocation: String.raw\`pnpm --filter (\\S+) run build\`,
  when: (changed) => changed.some((f) => f.includes('Dockerfile') || f.endsWith('package.json')),
  hint: 'Reorder the build, or fix the dependency that made the order wrong.',
});
`,
      },
      {
        path: 'checks/workspace/dependency-pins.check.mjs.example',
        body: `/**
 * \`dependency-pins\` — versions that must stay exact stay exact, and coordinated
 * groups agree across workspaces.
 *
 * Ships as \`.example\` because the POLICY is yours: which packages are frozen, which
 * must agree with each other, and which image tags may float are decisions no engine
 * can guess. Write them down, rename this file to \`.check.mjs\`, and the rules below
 * become enforceable.
 *
 * Every failure it catches is silent: a caret on a frozen package still installs, two
 * majors of one library both compile, \`:latest\` still starts.
 */
import { fromResult } from 'specwarden';

/** The policy. One declaration, never a second copy elsewhere. */
const FROZEN = [];        // e.g. ['react', 'typescript']
const COORDINATED = [];   // e.g. [{ group: 'react', packages: ['react', 'react-dom'] }]

export const check = fromResult({
  id: 'dependency-pins',
  title: 'frozen versions stay exact and coordinated groups agree',
  tier: '${ctx.tier}',
  when: (changed) => changed.some((f) => f.endsWith('package.json')),
  hint: 'Fix the tree, or change the declaration above and say why in the commit message.',
  run: (ctx) => {
    const manifests = ctx.vcs
      .trackedFiles('package.json')
      .concat(ctx.vcs.trackedFiles('*/package.json'), ctx.vcs.trackedFiles('packages/*/package.json'))
      .filter((f) => !f.includes('dist'))
      .map((path) => ({ path, deps: JSON.parse(ctx.files.read(path)) }));

    const failures = [];
    const RANGE = /[\\^~*x]|>=|<=|>|<|\\s-\\s|\\|\\||latest/i;
    for (const { path, deps } of manifests) {
      const all = { ...deps.dependencies, ...deps.devDependencies };
      for (const name of FROZEN) {
        const spec = all[name];
        if (spec && RANGE.test(spec)) failures.push(\\\`\\\${path}: \\\${name} is \\\${spec} — frozen packages are declared exactly\\\`);
      }
    }
    for (const { group, packages } of COORDINATED) {
      const seen = new Map();
      for (const { path, deps } of manifests) {
        const all = { ...deps.dependencies, ...deps.devDependencies };
        for (const name of packages) if (all[name]) seen.set(\\\`\\\${name}@\\\${all[name]}\\\`, path);
      }
      const versions = new Set([...seen.keys()].map((k) => k.split('@').pop()));
      if (versions.size > 1) failures.push(\\\`group \\\${group} disagrees: \\\${[...seen.keys()].join(', ')}\\\`);
    }
    // An empty policy checks nothing — say so rather than reporting a clean pass.
    const notes = FROZEN.length + COORDINATED.length === 0 ? ['no policy declared yet — this check is inert'] : [\\\`\\\${manifests.length} manifest(s) read\\\`];
    return { failures, notes };
  },
});
`,
      },
      ...shared(ctx).files,
    ];
  },

  rules: (ctx: ITemplateContext): readonly IRule[] => [
    {
      id: 'one-resolved-dependency-tree',
      statement: 'The lockfile describes the manifests, so every workspace resolves the same tree.',
      owner: '',
      enforcement: { checkIds: ['lockfile'] },
    },
    ...shared(ctx).rules,
  ],
};
