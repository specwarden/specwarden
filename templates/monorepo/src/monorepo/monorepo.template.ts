import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import {
  ciCoveragePart,
  compose,
  docPathsPart,
  exampleRule,
  header,
  scriptWrappersPart,
  secretScanPart,
  switchOn,
  tierOption,
} from '@specwarden/scaffold-parts';

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
      header:
        'One scan for the whole workspace: a credential does not care which package it landed in.\nA match means rotate first, delete second.',
    }),
    docPathsPart(ctx, {
      header: 'Paths cross package boundaries here, and a package that moves takes every document naming it along.',
      docs: '**/*.md',
    }),
    scriptWrappersPart(ctx),
    ciCoveragePart(ctx),
  );

/** Where the workspace packages live: the fixed part of the first workspace glob. */
const packagesDir = (ctx: ITemplateContext): string =>
  (ctx.workspaces[0] ?? 'packages/*').replace(/\/?\*.*$/, '') || 'packages';

const examples = (ctx: ITemplateContext): ITemplateFile[] => [
  {
    path: 'checks/workspace/build-order.check.mjs.example',
    body: `${header(
      '`build-order` — a package is built after everything it depends on.',
      `A package built before its dependency ships the PREVIOUS build's output, and nothing errors.
OFF until the prefix, the files that declare the order and the build invocation are yours.
${switchOn('build-order')}`,
    )}
import { buildOrderFollowsDeps } from '@specwarden/ops';

export const check = buildOrderFollowsDeps({
  id: 'build-order',
${tierOption(ctx)}  packagesDir: '${packagesDir(ctx)}',
  // REPLACE: the workspace packages' name prefix; anything else is an external dependency.
  scopePrefix: '@your-scope/',
  // REPLACE: the files that DECLARE the order — a Dockerfile, a CI workflow, a build script.
  containerFiles: 'Dockerfile*',
  // Matches one build invocation and captures the package name.
  buildInvocation: String.raw\`pnpm --filter (\\S+) run build\`,
});
`,
  },
  {
    path: 'checks/workspace/dependency-pins.check.mjs.example',
    body: `${header(
      '`dependency-pins` — frozen versions stay exact, and coordinated groups agree across workspaces.',
      `Every failure is silent: a caret on a frozen package still installs, two majors both compile.
OFF until the POLICY below is yours; an empty one says it is inert rather than passing.
${switchOn('dependency-pins')}`,
    )}
import { fromResult } from 'specwarden';

// REPLACE: the policy, declared once.
const FROZEN = [];        // e.g. ['react', 'typescript']
const COORDINATED = [];   // e.g. [{ group: 'react', packages: ['react', 'react-dom'] }]

export const check = fromResult({
  id: 'dependency-pins',
${tierOption(ctx)}  hint: 'Fix the tree, or change the policy above and say why in the commit message.',
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
        if (spec && RANGE.test(spec)) failures.push(\`\${path}: \${name} is \${spec} — frozen packages are declared exactly\`);
      }
    }
    for (const { group, packages } of COORDINATED) {
      const seen = new Map();
      for (const { path, deps } of manifests) {
        const all = { ...deps.dependencies, ...deps.devDependencies };
        for (const name of packages) if (all[name]) seen.set(\`\${name}@\${all[name]}\`, path);
      }
      const versions = new Set([...seen.keys()].map((k) => k.split('@').pop()));
      if (versions.size > 1) failures.push(\`group \${group} disagrees: \${[...seen.keys()].join(', ')}\`);
    }
    const notes = FROZEN.length + COORDINATED.length === 0 ? ['no policy declared yet — this check is inert'] : [\`\${manifests.length} manifest(s) read\`];
    return { failures, notes };
  },
});
`,
  },
];

export const monorepo: ITemplate = {
  name: 'monorepo',
  describe: 'a pnpm workspace — lockfile, build order, dependency pins, credential scan',
  requires: ['@specwarden/ops', '@specwarden/security', '@specwarden/docs'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => {
    const pm = ctx.packageManager ?? 'pnpm';
    return [
      {
        path: 'checks/workspace/lockfile.check.mjs',
        body: `${header(
          '`lockfile` — the lockfile still describes the manifests.',
          'A drifted lockfile installs FINE on the machine that drifted it and differently everywhere else.',
        )}
import { commandCheck } from 'specwarden';

export const check = commandCheck({
${tierOption(ctx)}  cmd: '${pm} install --frozen-lockfile',
  rule: 'The lockfile describes the manifests, so every workspace resolves the same tree.',
  hint: "Run '${pm} install' from the repository root and commit the updated lockfile.",
});
`,
      },
      ...examples(ctx),
      ...shared(ctx).files,
    ];
  },

  rules: (ctx: ITemplateContext): readonly IRule[] => [
    exampleRule('build-order', 'A package is built after everything it depends on.'),
    exampleRule('dependency-pins', 'Frozen versions stay exact, and coordinated groups agree across workspaces.'),
    ...shared(ctx).rules,
  ],
};
