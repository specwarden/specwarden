import { describe, expect, it } from 'vitest';

import { agentDefinitions } from '@specwarden/agents';
import { docHygiene, docPaths, docSymbols } from '@specwarden/docs';
import { openspec } from '@specwarden/openspec';
import { shellLocalScope } from '@specwarden/ops';
import { decisionLogShape, planStaleness } from '@specwarden/plans';
import { nestjs } from '@specwarden/plugin-nestjs';
import { secretScan } from '@specwarden/security';
import { speckit } from '@specwarden/speckit';
import {
  CHECK_CONTRACT_VERSION,
  CheckRegistry,
  CheckRunner,
  type ICheck,
  type ICheckResult,
  type IEngineAdapters,
  type IReporter,
  InMemoryFileSource,
  SystemClock,
  defineConfig,
} from 'specwarden';

import { BRANCHES, BROKEN, CLEAN } from './repository';

/**
 * EVERY package this workspace publishes, in ONE config, over ONE repository.
 *
 * A consumer does not install one of these. They install the engine, three or four
 * modules and maybe a plugin, and write a single `warden.config.mjs` that names all of
 * them — and the failures that shape has are not the failures a per-package suite can
 * see: two packages minting the same check id, a plugin whose checks never reach the
 * registry, a module left in no tier, a capability one package needs and the repository
 * denies to all of them.
 *
 * So this file assembles the whole thing and runs it, twice, over a repository that
 * carries a subject for every package.
 */

/** The config a consumer would write, with every package named in it. */
const config = defineConfig({
  checks: [
    docPaths({ id: 'doc-paths', title: 'documented paths resolve', tier: 'fast', docs: '**/*.md' }),
    docSymbols({
      id: 'doc-symbols',
      title: 'documented symbols exist',
      tier: 'fast',
      docs: '**/*.md',
      code: ['src/**/*.ts'],
      suffixes: ['Registry', 'Service'],
    }),
    docHygiene({ id: 'doc-hygiene', title: 'links resolve', tier: 'fast', docs: '**/*.md' }),
    planStaleness({
      id: 'plan-staleness',
      title: 'no plan outlives its work',
      tier: 'fast',
      plansDir: 'docs/_plans',
      archiveDir: 'docs/_archive',
    }),
    decisionLogShape({
      id: 'decision-log-shape',
      title: 'a rejection states why',
      tier: 'fast',
      docs: 'docs/_plans/*.md',
    }),
    shellLocalScope({
      id: 'shell-local-scope',
      title: 'local only inside a function',
      tier: 'fast',
      pathspecs: ['scripts/*.sh'],
      when: () => true,
    }),
    agentDefinitions({
      id: 'agent-definitions',
      title: 'every agent declares its tools',
      tier: 'fast',
      agentsDir: '.claude/agents',
    }),
    secretScan({ id: 'secret-scan', title: 'no credential in the tree', tier: 'fast' }),
  ],
  plugins: [nestjs({ modulesRoot: 'src/modules', ormPackage: 'drizzle-orm' })],
  specSource: openspec(),
  // The harness's checks on itself read a consumer tree that does not exist here; this
  // playground is about the PACKAGES composing, and `false` says that out loud rather
  // than leaving them to fail for a reason that is not the subject.
  harness: false,
});

/** Everything the config contributes, in the order the registry receives it. */
const declared = (): readonly ICheck[] => [
  ...(config.checks ?? []),
  ...(config.plugins ?? []).flatMap((p) => p.checks),
];

function run(tree: Record<string, string>) {
  const registry = new CheckRegistry();
  registry.registerAll(declared());

  const results: ICheckResult[] = [];
  const reporter: IReporter = {
    checkStarted: () => {},
    checkFinished: (result) => void results.push(result),
    runFinished: () => {},
  };

  const adapters: IEngineAdapters = {
    files: new InMemoryFileSource(tree, ''),
    vcs: {
      refExists: (ref) => BRANCHES.includes(ref),
      remoteBranches: () => BRANCHES,
      branchNames: () => BRANCHES,
      currentBranch: () => 'main',
      changedFiles: () => Object.keys(tree),
      changedLineCount: () => 0,
      // An EMPTY pathspec means "every tracked file" to git, and a check that scans the
      // whole tree passes exactly that. Translated as a glob it matches nothing, the
      // check examines an empty corpus and reports green — which is the defect this
      // whole product exists against, reproduced inside its own fixture. It happened
      // here: the credential scan passed over a tree with a credential in it.
      trackedFiles: (pathspec) => new InMemoryFileSource(tree, '').glob(pathspec ? pathspec : '**/*'),
    },
    proc: { run: () => ({ status: 0, stdout: '', stderr: '' }) },
    clock: new SystemClock(),
    writer: { write: () => {} },
    ratchets: {
      read: () => undefined,
      establish: (id, value) => ({ id, value }),
      tighten: (id, value) => ({ id, value }),
    },
  };

  return new CheckRunner(registry, adapters, reporter).run({ all: true }, { ci: false });
}

const failedIds = (results: readonly ICheckResult[]): string[] =>
  results.filter((r) => !r.skipped && !r.verdict.ok).map((r) => r.meta.id);

describe('the whole workspace, in one config', () => {
  it('every package contributes checks, and no two of them collide on an id', () => {
    // A duplicate id is not a warning anywhere: the second registration throws, because
    // the alternative is a check that is silently unreachable by `--id`.
    const ids = declared().map((c) => c.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(9);
  });

  it('a plugin’s checks reach the registry alongside the inline ones', () => {
    expect(declared().map((c) => c.id)).toContain('nestjs/db-access-through-repositories');
  });

  it('every declared check speaks the contract version this engine registers', () => {
    // The packages version independently, so this is the one assertion that catches a
    // module built against an older engine — which otherwise fails at a consumer's
    // first run with an error about a field nobody has heard of.
    for (const check of declared()) expect(check.contractVersion).toBe(CHECK_CONTRACT_VERSION);
  });

  it('every declared check lands in a tier, and declares the capabilities it uses', () => {
    for (const check of declared()) {
      expect(check.tier).toBeTruthy();
      expect(check.capabilities.length).toBeGreaterThan(0);
    }
  });

  it('the clean repository passes every check from every package', async () => {
    const outcome = await run(CLEAN);

    expect(failedIds(outcome.results)).toEqual([]);
    expect(outcome.exitCode).toBe(0);
  });

  it('the broken repository is caught by EACH package, not merely by one of them', async () => {
    // The assertion the per-package playgrounds cannot make. One defect per package, and
    // every package must still reach its own subject under the shared config — a module
    // whose corpus was narrowed by another's options would go quiet here and nowhere else.
    const outcome = await run(BROKEN);
    const failed = failedIds(outcome.results);

    expect(outcome.exitCode).toBe(1);
    expect(failed).toContain('doc-paths');
    expect(failed).toContain('decision-log-shape');
    expect(failed).toContain('shell-local-scope');
    expect(failed).toContain('agent-definitions');
    expect(failed).toContain('secret-scan');
    expect(failed).toContain('nestjs/db-access-through-repositories');
  });

  it('both spec sources fill the same port, and both say so when the tree is absent', () => {
    // Two adapters can share an accident; the port is only real because a third exists.
    // What matters at this level is that neither reports "nothing to do" for a tree it
    // never found — which is the one way interop turns into a check that cannot fail.
    const files = new InMemoryFileSource(CLEAN, '');

    for (const source of [openspec(), speckit()]) {
      expect(source.name).toBeTruthy();
      expect(source.requirements(files).found).toBe(false);
      expect(source.requirements(files).note).toBeDefined();
    }
  });
});
