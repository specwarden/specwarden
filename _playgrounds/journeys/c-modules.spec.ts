import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ROOT, removeScratch, scratchTree, verdictsIn, specwarden } from '../../scripts/playgrounds.mjs';

/**
 * JOURNEY C — a consumer installs an optional module and follows its GUIDE.
 *
 * Every scene is a scratch git repository with the packages linked the way an install
 * would link them, a check file (or a config) written the way a GUIDE, a shipped SKILL or
 * a template `.example` tells a consumer to write it, and the real CLI run over it.
 *
 * The spec passes against TODAY's behaviour. Where today's behaviour is not what a
 * consumer should meet, the `it` name starts with `[friction]` and a one-line comment
 * says what it should be — so the day it is fixed, the scene goes red and is rewritten
 * rather than silently kept.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PLAYGROUND = join(HERE, '..');

/** What a consumer who installed every package has — the workspace playground's own deps. */
const INSTALLED = Object.keys(
  (JSON.parse(readFileSync(join(PLAYGROUND, 'package.json'), 'utf8')) as { dependencies: Record<string, string> })
    .dependencies,
).map((name) => [name, join(PLAYGROUND, 'node_modules', ...name.split('/'))] as const);

/** A config that says nothing, the self-checks off: the subject is the module. */
const BARE = "import { defineConfig } from 'specwarden';\n\nexport default defineConfig({ selfChecks: false });\n";
/** The config a consumer has on day one when the GUIDE says nothing about one. */
const DAY_ONE = "import { defineConfig } from 'specwarden';\n\nexport default defineConfig({});\n";
/** A compose-file interpolation, spelled so it is not read as a template literal. */
const MODE = '$' + '{MODE}';

interface IScene {
  readonly config?: string;
  readonly branches?: readonly string[];
}

function inRepo<T>(tree: Record<string, string | null>, scene: IScene, act: (dir: string) => T): T {
  const planted: Record<string, string> = { '.specwarden/config.mjs': scene.config ?? BARE };
  for (const [path, text] of Object.entries(tree)) if (text !== null) planted[path] = text;
  const dir = scratchTree(planted, { installed: INSTALLED, branches: scene.branches ?? [] });
  try {
    return act(dir);
  } finally {
    removeScratch(dir);
  }
}

const verdicts = (tree: Record<string, string | null>, scene: IScene = {}) => inRepo(tree, scene, verdictsIn);
const cli = (tree: Record<string, string | null>, args: readonly string[], scene: IScene = {}) =>
  inRepo(tree, scene, (dir) => specwarden(dir, args));

function resultOf(run: ReturnType<typeof verdictsIn>, id: string) {
  const found = run.results.find((r) => r.id === id);
  if (!found) throw new Error(`no result for ${id}: ${run.results.map((r) => r.id).join(', ')}`);
  return found;
}

/** A template's `.example`, as the file a consumer renames it to. */
const example = (rel: string): string => readFileSync(join(ROOT, 'templates', rel), 'utf8');

/** Lines, and how often a fragment repeats, in a check file — the ceremony measured. */
const lines = (source: string): number => source.trimEnd().split('\n').length;
const occurrences = (source: string, fragment: string): number => source.split(fragment).length - 1;

/**
 * A fenced block of a GUIDE or a shipped SKILL, exactly as a consumer pastes it: the first
 * block of `lang` containing `marker`. A scene that says "as the GUIDE says" runs THIS text,
 * so a GUIDE that drifts from the code turns its own scene red.
 */
function pasted(rel: string, marker: string, lang = 'js'): string {
  const text = readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  const blocks = [...text.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1] as string);
  const found = blocks.find((block) => block.includes(marker));
  if (found === undefined) throw new Error(`${rel} has no ${lang} block containing ${marker}`);
  return found;
}

/** A block's code — without the `// .specwarden/…` line that says where the file goes. */
const codeOf = (block: string): string =>
  block
    .split('\n')
    .filter((line) => !line.startsWith('// .specwarden/'))
    .join('\n');

/** The run's stdout and stderr together — a load error may land in either. */
const said = (r: { stdout: string; stderr: string }): string => `${r.stdout}\n${r.stderr}`;

// ─────────────────────────────────────────────────────────────────────────────────────
// @specwarden/docs
// ─────────────────────────────────────────────────────────────────────────────────────

/** Every docs check, each shaped exactly as its GUIDE section shows it. */
const DOCS_ALL_FIVE = `import { docPaths, docSymbols, docCounts, docHygiene, docPlacement } from '@specwarden/docs';

export const checks = [
  docPaths({ id: 'doc-paths', title: 'documented paths resolve', tier: 'fast', docs: '**/*.md' }),
  docSymbols({
    id: 'doc-symbols',
    title: 'documented symbols exist',
    tier: 'fast',
    docs: '**/*.md',
    code: ['src/**/*.ts'],
    suffixes: ['Service', 'Repository', 'Gateway'],
  }),
  docCounts({
    id: 'doc-counts',
    title: 'counts are derived, never restated',
    tier: 'fast',
    countableNouns: ['services', 'gates', 'modules'],
    except: [],
    allowlist: () => [],
    ratchet: 0,
    when: () => true,
  }),
  docPlacement({
    id: 'doc-placement',
    title: 'module documents sit beside their module',
    tier: 'fast',
    docs: '**/*_MODULE.md',
    allowed: [/^src\\/[^/]+\\/[^/]+_MODULE\\.md$/],
  }),
  docHygiene({ id: 'doc-hygiene', title: 'relative links resolve', tier: 'fast', docs: '**/*.md' }),
];
`;

/** The whole module as the GUIDE wires it today — one preset call. */
const DOCS_GUIDE = pasted('modules/docs/GUIDE.md', 'docsChecks({');

const DOCS_CLEAN = {
  'README.md':
    '# a repository\n\nThe entry point is `src/index.ts`, and `ServiceRegistry` is what it exports.\n\n' +
    'See [the module document](./src/things/THINGS_MODULE.md).\n',
  'src/index.ts': 'export class ServiceRegistry {}\nexport class GapService {}\n',
  'src/things/THINGS_MODULE.md': '# things\n\n`GapService` owns the invariants of this module.\n',
  '.specwarden/checks/docs/docs.check.mjs': DOCS_GUIDE,
};

describe('@specwarden/docs, wired by its GUIDE', () => {
  it('the GUIDE’s first example loads, is discovered, and passes over a clean tree', () => {
    const run = verdicts(
      {
        'README.md': '# a\n\nThe entry point is `src/index.ts`.\n',
        'src/index.ts': 'export {};\n',
        '.specwarden/checks/docs/docs.check.mjs':
          "import { docPaths, docSymbols, docCounts, docHygiene, docPlacement } from '@specwarden/docs';\n\n" +
          "export const checks = [docPaths({ id: 'doc-paths', title: 'documented paths resolve', tier: 'fast', docs: '**/*.md' })];\n",
      },
      { config: DAY_ONE },
    );
    expect(run.status).toBe(0);
    expect(run.results.map((r) => r.id)).toEqual(['doc-paths', 'ratchet-direction']);
  });

  it('all five, as the GUIDE wires them, pass over a clean tree', () => {
    const run = verdicts(DOCS_CLEAN);
    expect(run.failed).toEqual([]);
    expect(run.results.map((r) => r.id)).toEqual([
      'doc-paths',
      'doc-symbols',
      'doc-counts',
      'doc-placement',
      'doc-hygiene',
    ]);
  });

  it('all five wired one factory at a time — the old way — still load and pass', () => {
    const run = verdicts({ ...DOCS_CLEAN, '.specwarden/checks/docs/docs.check.mjs': DOCS_ALL_FIVE });
    expect(run.failed).toEqual([]);
    expect(run.results.map((r) => r.id)).toHaveLength(5);
  });

  it('wiring the whole module by its GUIDE is 8 lines — the corpus said never, the tier never', () => {
    // It was 31, saying `docs` four times and `tier` five — and `docCounts`, alone of the
    // five, took no `docs` and read `**/*.md` whatever the others were pointed at.
    expect(lines(DOCS_ALL_FIVE)).toBe(31);
    expect(lines(codeOf(DOCS_GUIDE))).toBe(8);
    expect(occurrences(DOCS_GUIDE, 'tier')).toBe(0);
    expect(occurrences(DOCS_GUIDE, 'docs:')).toBe(1);
  });

  it('each planted defect turns exactly its own check red, with an actionable message', () => {
    const run = verdicts({
      ...DOCS_CLEAN,
      'README.md':
        '# a repository\n\nThe entry point is `src/gone.ts`, and `ServiceRegistry` is what it exports. `OrderService` too.\n\n' +
        'There are 4 services.\n\nSee [the module document](./src/things/GONE_MODULE.md).\n',
      'docs/STRAY_MODULE.md': '# stray\n',
    });
    expect(run.failed).toEqual(['doc-paths', 'doc-symbols', 'doc-counts', 'doc-placement', 'doc-hygiene']);
    expect(resultOf(run, 'doc-paths').messages).toEqual([
      'README.md names `src/gone.ts`, which does not resolve. Point it at where the file is now — often it gained its own folder and the path did not follow.',
    ]);
    expect(resultOf(run, 'doc-symbols').messages).toEqual([
      'README.md names `OrderService`, which nothing in the code corpus declares. Rename it to the symbol that replaced it, or name it in `external` if a framework owns it.',
    ]);
    expect(resultOf(run, 'doc-counts').messages).toEqual([
      'README.md:5 restates "4 services" — a count the repository owns goes stale in prose. Say how to count it, date it, or hedge it.',
    ]);
    expect(resultOf(run, 'doc-placement').messages).toEqual([
      'docs/STRAY_MODULE.md sits where the placement contract does not describe. Move it, or add the row that describes its kind to `allowed`.',
    ]);
    expect(resultOf(run, 'doc-hygiene').messages).toEqual([
      'README.md:7 links to `./src/things/GONE_MODULE.md`, which does not exist. Point the link at where the file is now.',
    ]);
  });

  it('a `docs` pathspec that matches nothing is a failure, and says what to do', () => {
    const run = verdicts({
      'README.md': '# a\n',
      '.specwarden/checks/docs/docs.check.mjs':
        "import { docPaths } from '@specwarden/docs';\nexport const check = docPaths({ docs: 'docs/**/*.md' });\n",
    });
    expect(resultOf(run, 'doc-paths').messages).toEqual([
      'examined 0 document(s) — `docs/**/*.md` matched nothing to read — below the floor of 1. A check that examined nothing cannot fail, so it reports success; this is that state, caught. Point the pathspec at where the files are, or declare `corpus: { atLeast: 0 }` if an empty set is expected.',
    ]);
  });

  it('`docHygiene` follows `./` and `../` only, as the GUIDE says', () => {
    const run = verdicts({
      'README.md': '# a\n\n[x](/docs/gone.md) and [y](docs/gone.md)\n',
      'docs/g.md': '# g\n\n[up](../README.md) [dead](../GONE.md)\n',
      '.specwarden/checks/docs/h.check.mjs':
        "import { docHygiene } from '@specwarden/docs';\nexport const check = docHygiene({ id: 'doc-hygiene', title: 'x', tier: 'fast', docs: '**/*.md' });\n",
    });
    expect(resultOf(run, 'doc-hygiene').messages).toEqual([
      'docs/g.md:3 links to `../GONE.md`, which does not exist. Point the link at where the file is now.',
    ]);
  });

  it('the shipped SKILL’s `except` leaves the archive out, and the old `skipped:` is refused by name at load', () => {
    // It said `skipped:`, which is not an option: dropped in silence, and the archive it
    // meant to leave out was read.
    const tree = {
      'README.md': '# a\n\nSee `src/index.ts`.\n',
      'src/index.ts': 'export {};\n',
      'docs/_archive/old.md': '# old\n\nThis used `src/removed/thing.ts`.\n',
    };
    const skill = pasted('modules/docs/skills/specwarden-docs/SKILL.md', 'docPaths({');
    const run = verdicts({ ...tree, '.specwarden/checks/docs/skill.check.mjs': skill });
    expect(run.status).toBe(0);
    expect(resultOf(run, 'doc-paths').ok).toBe(true);

    const old = cli(
      {
        ...tree,
        '.specwarden/checks/docs/skill.check.mjs':
          "import { docPaths } from '@specwarden/docs';\nexport const check = docPaths({ id: 'doc-paths', title: 'x', docs: '**/*.md', skipped: [/^docs\\/_archive\\//] });\n",
      },
      ['check', '--all', '--json'],
    );
    expect(old.status).not.toBe(0);
    expect(said(old)).toContain("docPaths 'doc-paths': `skipped` is not an option of docPaths");
  });

  it('docCounts needs only its nouns — no `except`, no `allowlist`, no `when`, no id', () => {
    // It died with "options.allowlist is not a function" on the first run without them.
    const run = verdicts({
      'README.md': '# a\n\nThere are 4 services.\n',
      '.specwarden/checks/docs/counts.check.mjs': pasted('modules/docs/GUIDE.md', 'docCounts({'),
    });
    expect(resultOf(run, 'doc-counts').messages).toEqual([
      'README.md:3 restates "4 services" — a count the repository owns goes stale in prose. Say how to count it, date it, or hedge it.',
    ]);
  });

  it('docCounts over a repository with no document at all fails, like the other four', () => {
    // It was green: "✓ 0 document(s)" is a check that cannot fail.
    const run = verdicts({
      'src/a.ts': 'export {};\n',
      '.specwarden/checks/c.check.mjs':
        "import { docCounts } from '@specwarden/docs';\nexport const check = docCounts({ countableNouns: ['services'] });\n",
    });
    expect(run.status).toBe(1);
    expect(resultOf(run, 'doc-counts').messages[0]).toContain(
      'examined 0 document(s) — `**/*.md` matched nothing to read — below the floor of 1.',
    );
  });

  // It shipped `countableNouns: []` — refused at load, since an empty list matched every
  // number. It now ships a guessed list marked REPLACE, and catches the count it plants.
  it('the `doc-counts` .example as-is loads, and catches a restated count', () => {
    const r = cli(
      {
        'README.md': '# a\n\nThere are 4 services and 12 rows.\n',
        '.specwarden/checks/docs/doc-counts.check.mjs': example(
          'docs-only/_playground/repository/.specwarden/checks/docs/doc-counts.check.mjs.example',
        ),
      },
      ['check', '--all', '--json'],
    );
    expect(r.status).toBe(1);
    expect(said(r)).not.toContain('`countableNouns` is empty');
    expect(said(r)).toContain('4 services');
  });

  // It shipped `suffixes: []` and was refused at load. It now ships a guessed list marked
  // REPLACE, and names the class the documentation invents.
  it('the `doc-symbols` .example as-is loads, and names a class the code does not define', () => {
    const r = cli(
      {
        'README.md': '# a\n\n`GhostService` is named here.\n',
        'src/index.ts': 'export {};\n',
        '.specwarden/checks/docs/doc-symbols.check.mjs': example(
          'node-ts/_playground/repository/.specwarden/checks/docs/doc-symbols.check.mjs.example',
        ),
      },
      ['check', '--all', '--json'],
    );
    expect(r.status).toBe(1);
    expect(said(r)).toContain('GhostService');
  });

  // It read `docs/**/*.md` and was loud over a tree whose only document is a root README.
  // The docs-only template's example reads every document, as the tree it was written for.
  it('the `doc-placement` .example as-is reads every document, a root README included', () => {
    const run = verdicts({
      'README.md': '# a\n',
      '.specwarden/checks/docs/doc-placement.check.mjs': example(
        'docs-only/_playground/repository/.specwarden/checks/docs/doc-placement.check.mjs.example',
      ),
    });
    expect(resultOf(run, 'doc-placement').messages.join(' ')).not.toContain('no document matched');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// @specwarden/plans
// ─────────────────────────────────────────────────────────────────────────────────────

const PLAN = [
  '# Partial refunds',
  '',
  '**Status:** active',
  '**Branch:** feat/partial-refunds',
  '',
  '### Decision: a refund is taken per line',
  '',
  '- Rejected: a free-text amount — a typed number reconciles against nothing.',
  '',
  '## Phase 1 — the refund line',
  '',
  '```bash',
  'pnpm gate --id plan-shape',
  '```',
  '',
].join('\n');

const PLANS_ALL_THREE = `import { planStaleness, planShape, decisionLogShape } from '@specwarden/plans';

export const checks = [
  planStaleness({
    id: 'plan-staleness',
    title: 'no plan outlives its work',
    tier: 'fast',
    plansDir: 'docs/_plans',
    archiveDir: 'docs/_archive',
  }),
  planShape({
    id: 'plan-shape',
    title: 'a plan names real check ids and every phase has an acceptance command',
    tier: 'fast',
    plansDir: 'docs/_plans',
    name: /^[a-z0-9-]+\\.md$/,
    except: ['docs/_plans/README.md'],
    sizing: [/\\b\\d+\\s*(hours?|days?|story points?)\\b/i],
    phaseHeading: /^(#{2,3})\\s+Phase\\b/,
    command: /^\\s*(pnpm|npm|node|bash)\\s/,
  }),
  decisionLogShape({ id: 'decision-log-shape', title: 'a rejection states why', tier: 'fast', docs: 'docs/_plans/*.md' }),
];
`;

const PLANS_CLEAN = {
  'README.md': '# a\n',
  'docs/_plans/refunds.md': PLAN,
  'docs/_plans/README.md': 'The contract.\n',
  '.specwarden/checks/plans/plans.check.mjs': PLANS_ALL_THREE,
};
const BRANCH = { branches: ['feat/partial-refunds'] };

describe('@specwarden/plans, wired by its GUIDE', () => {
  it('all three, as the GUIDE shapes them, pass over a live plan whose branch resolves', () => {
    const run = verdicts(PLANS_CLEAN, BRANCH);
    expect(run.failed).toEqual([]);
    expect(resultOf(run, 'plan-staleness').messages).toEqual(['✓ plan-staleness — 1 plan(s) examined, clean']);
  });

  it('the whole module by its GUIDE is 3 lines — the four regexes planShape needed are defaults', () => {
    // It was 23: the plans folder twice, and the name, sizing, phase-heading and command
    // patterns written out in every English repository the same way.
    const guide = pasted('modules/plans/GUIDE.md', 'plansChecks(');
    expect(lines(PLANS_ALL_THREE)).toBe(23);
    expect(lines(codeOf(guide))).toBe(3);

    const run = verdicts(
      {
        'README.md': '# a\n',
        'docs/_plans/refunds.md': PLAN,
        '.specwarden/checks/plans/plans.check.mjs': guide,
      },
      BRANCH,
    );
    expect(run.failed).toEqual([]);
    expect(run.results.map((r) => r.id)).toEqual(['plan-staleness', 'plan-shape', 'decision-log-shape']);
  });

  it('an active plan whose branch is gone is spent — harvest it', () => {
    const run = verdicts(PLANS_CLEAN);
    expect(run.failed).toEqual(['plan-staleness']);
    expect(resultOf(run, 'plan-staleness').messages).toEqual([
      'docs/_plans/refunds.md declares branch `feat/partial-refunds`, which no longer exists here or on the remote. The work merged — harvest the plan and move it to docs/_archive/.',
    ]);
  });

  it('a draft naming a branch, an active plan naming none, and a plan with no status are each named', () => {
    const run = verdicts(
      {
        'docs/_plans/a.md': '# a\n\n**Status:** draft\n**Branch:** feat/a\n',
        'docs/_plans/b.md': '# b\n\n**Status:** active\n',
        'docs/_plans/c.md': '# c\n\nno header\n',
        '.specwarden/checks/plans/p.check.mjs':
          "import { planStaleness } from '@specwarden/plans';\nexport const check = planStaleness({ archiveDir: 'docs/_archive' });\n",
      },
      { branches: ['feat/a'] },
    );
    expect(resultOf(run, 'plan-staleness').messages).toEqual([
      'docs/_plans/a.md is a draft yet declares branch `feat/a`. Work with a branch has started — say so — or the branch is a placeholder, and a plan must not name one: it arms a hard failure for the day it is cleaned up.',
      'docs/_plans/b.md is active and declares no branch. An active plan names where its work happens.',
      'docs/_plans/c.md declares no status, so a draft cannot be told from work under way. Declare whether it is a draft, active or done.',
    ]);
  });

  it('a nested folder, an unknown check id, sizing, and an unreasoned rejection', () => {
    const run = verdicts(
      {
        ...PLANS_CLEAN,
        'docs/_plans/refunds.md': `${PLAN.replace(' — a typed number reconciles against nothing.', '').replace(
          '--id plan-shape',
          '--id unit',
        )}\nThis takes 3 days.\n`,
        'docs/_plans/nested/old.md': '# old\n',
      },
      BRANCH,
    );
    expect(run.failed).toEqual(['plan-shape', 'decision-log-shape']);
    expect(resultOf(run, 'plan-shape').messages).toEqual([
      'docs/_plans/nested/ — plans are FLAT; a folder here means plans stopped being deleted. Move what it holds out of docs/_plans.',
      "docs/_plans/refunds.md:13 names '--id unit', which is not a check this run knows. Name a check the roster has, or state the acceptance as the command that runs it until it lands.",
      'docs/_plans/refunds.md:16 sizes work — a plan states dependency and deployability, not hours. Say what the phase depends on instead.',
    ]);
    expect(resultOf(run, 'decision-log-shape').messages).toEqual([
      'docs/_plans/refunds.md:6 — decision "a refund is taken per line" rejects "a free-text amount" with no reason. State why: a rejection without a reason is the fact that gets lost.',
    ]);
  });

  it('an archive entry with no header, and a link into the archive', () => {
    const run = verdicts(
      {
        ...PLANS_CLEAN,
        'docs/_archive/done.md': '# done\n\nIt shipped.\n',
        'docs/GUIDE.md': 'See [what we did](./_archive/done.md).\n',
      },
      BRANCH,
    );
    expect(resultOf(run, 'plan-staleness').messages).toEqual([
      'docs/_archive/done.md: archive header is missing Started, Finished, Branch, Harvested, Left open. Without it the archive is a slower delete — the reader cannot tell how far to trust the document, so they trust it fully.',
      'docs/GUIDE.md:1 links to docs/_archive/done.md — an archived plan describes the past in the present tense; cite the document that owns the fact instead.',
    ]);
  });

  it('the relative link `./_archive/done.md` is a link into the archive, resolved against its document', () => {
    // It was not seen: only the archive's path written out, `docs/_archive/…`, was read.
    const run = verdicts(
      { ...PLANS_CLEAN, 'docs/GUIDE.md': 'See [what we did](./_archive/done.md).\n', 'docs/_archive/done.md': '# d\n' },
      BRANCH,
    );
    expect(resultOf(run, 'plan-staleness').messages).toContain(
      'docs/GUIDE.md:1 links to docs/_archive/done.md — an archived plan describes the past in the present tense; cite the document that owns the fact instead.',
    );
  });

  it('over a repository with no plans folder, all three fail and name what they looked for', () => {
    // Three checks of one module gave three answers to "there is no folder": a green ✓,
    // "nothing to verify", and a failure.
    const run = verdicts({ 'README.md': '# a\n', '.specwarden/checks/plans/plans.check.mjs': PLANS_ALL_THREE });
    expect(run.failed).toEqual(['plan-staleness', 'plan-shape', 'decision-log-shape']);
    const absent =
      'docs/_plans does not exist — this check examined nothing, and a check that examined nothing cannot fail. Point `plansDir` at the folder the plans live in, or create it.';
    expect(resultOf(run, 'plan-staleness').messages).toEqual([absent]);
    expect(resultOf(run, 'plan-shape').messages).toEqual([absent]);
    expect(resultOf(run, 'decision-log-shape').messages[0]).toContain(
      'examined 0 document(s) — `docs/_plans/*.md` matched nothing to read',
    );
  });

  it('a plans folder that exists and holds no plan is an honest "nothing in flight"', () => {
    const run = verdicts({
      'docs/_plans/README.md': 'The contract.\n',
      '.specwarden/checks/plans/plans.check.mjs': PLANS_ALL_THREE,
    });
    expect(run.failed).toEqual([]);
    expect(resultOf(run, 'plan-staleness').messages).toEqual([
      '✓ plan-staleness — 0 plan(s) examined, clean',
      'no plan in docs/_plans — nothing in flight.',
    ]);
    expect(resultOf(run, 'plan-shape').messages).toEqual([
      '✓ plan-shape — 0 plan(s) examined, clean',
      'no plan in docs/_plans — nothing in flight.',
    ]);
  });

  it('the shipped SKILL’s `planShape` passes a live plan, and its old `{ plans, statuses }` is refused by name', () => {
    // The old one crashed inside a Node path call: "The "path" argument must be of type string".
    const skill = pasted('modules/plans/skills/specwarden-plans/SKILL.md', 'planShape({');
    const run = verdicts({ 'docs/_plans/refunds.md': PLAN, '.specwarden/checks/plans/skill.check.mjs': skill }, BRANCH);
    expect(resultOf(run, 'plan-shape').ok).toBe(true);

    const old = cli(
      {
        'docs/_plans/refunds.md': PLAN,
        '.specwarden/checks/plans/skill.check.mjs':
          "import { planShape } from '@specwarden/plans';\nexport const check = planShape({ id: 'plan-shape', title: 'x', plans: 'docs/_plans/*.md', statuses: ['draft'] });\n",
      },
      ['check', '--all', '--json'],
      BRANCH,
    );
    expect(old.status).not.toBe(0);
    expect(said(old)).toContain('`plans` is not an option of planShape; `statuses` is not an option of planShape');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// @specwarden/ops
// ─────────────────────────────────────────────────────────────────────────────────────

const ENV_CHECK = `import { envPairing } from '@specwarden/ops';

export const check = envPairing({
  composeFile: 'docker-compose.yml',
  modes: ['prod'],
  verifierService: 'be',
  declaredKeys: (read) => new Set((read('src/env.ts') ?? '').match(/[A-Z][A-Z0-9_]+/g) ?? []),
});
`;
const COMPOSE =
  'services:\n' +
  `  edge:\n    env_file:\n      - ./env/${MODE}/edge.env\n    volumes:\n      - ./caddy/edge.conf:/etc/caddy/edge.conf\n` +
  `  be:\n    env_file:\n      - ./env/${MODE}/be.env\n`;
const ENV_TREE = {
  'docker-compose.yml': COMPOSE,
  'caddy/edge.conf': 'header X-Key {$}\n'.replace('{$}', '$' + '{HANDSHAKE_KEY}'),
  'env/prod/edge.env': 'HANDSHAKE_KEY=abc\nEDGE_PORT=80\n',
  'env/prod/be.env': 'HANDSHAKE_KEY=abc\nBE_PORT=3000\n',
  'src/env.ts': "export const ENV = ['HANDSHAKE_KEY', 'BE_PORT'];\n",
  '.specwarden/checks/ops/env.check.mjs': ENV_CHECK,
};
const CHECKED = 'prod: checked 2 env files — env/prod/edge.env, env/prod/be.env';
const ENV_CLEAN = ['✓ env-pairing — 2 compose service(s) examined, clean', CHECKED];
const VERIFIER_LACKS =
  'prod: HANDSHAKE_KEY is set in env/prod/edge.env (sent by edge) but missing or empty in env/prod/be.env (verified by be). The verifier boots green and rejects every request carrying it — set it in env/prod/be.env.';

const UP_CHECK = `import { proxyUpstreams } from '@specwarden/ops';

export const check = proxyUpstreams({
  modes: ['local', 'prod'],
  fileFor: (mode) => \`caddy/Caddyfile.\${mode}\`,
  hostModes: ['local'],
  loopbackHosts: ['localhost', '127.0.0.1', '[::1]'],
});
`;
const UP_TREE = {
  'caddy/Caddyfile.local': ':80 {\n  reverse_proxy localhost:3000\n}\n',
  'caddy/Caddyfile.prod': ':80 {\n  reverse_proxy be:3000\n}\n',
  '.specwarden/checks/ops/up.check.mjs': UP_CHECK,
};

const CI_CHECK = `import { ciCoverage } from '@specwarden/ops';

export const check = ciCoverage({
  workflowFile: '.github/workflows/ci.yml',
  requiredJob: 'ci-ok',
  ciTier: 'heavy',
  cheapTier: 'fast',
  runnerPattern: /specwarden\\.mjs\\s+check/,
});
`;
const HEAVY_CHECK = (id: string) =>
  `import { docPaths } from '@specwarden/docs';\nexport const check = docPaths({ id: '${id}', title: '${id}', tier: 'heavy', docs: '**/*.md' });\n`;
const CI_TREE = {
  'README.md': '# a\n',
  '.github/workflows/ci.yml':
    'jobs:\n  fast:\n    steps:\n      - run: node specwarden.mjs check --tier fast\n' +
    '  unit:\n    steps:\n      - run: node specwarden.mjs check --id unit\n  ci-ok:\n    needs: [fast, unit]\n',
  '.specwarden/checks/ops/ci.check.mjs': CI_CHECK,
  '.specwarden/checks/unit.check.mjs': HEAVY_CHECK('unit'),
};
const CI_CLEAN = (id = 'ci-coverage') => [
  `✓ ${id} — 3 job(s) examined, clean`,
  '1 check(s) named across 3 job(s), all reaching ci-ok',
];

const BO_CHECK = `import { buildOrder } from '@specwarden/ops';

export const check = buildOrder({
  packagesDir: 'packages',
  scopePrefix: '@acme/',
  containerFiles: '*Dockerfile*',
  buildInvocation: /--filter\\s+(@acme\\/[a-z0-9-]+)\\s+run\\s+build/,
});
`;
const BO_TREE = {
  'packages/core/package.json': '{ "name": "@acme/core" }\n',
  'packages/api/package.json': '{ "name": "@acme/api", "dependencies": { "@acme/core": "workspace:*" } }\n',
  Dockerfile: 'RUN pnpm --filter @acme/core run build\nRUN pnpm --filter @acme/api run build\n',
  '.specwarden/checks/ops/bo.check.mjs': BO_CHECK,
};

const SHELL_CHECK =
  "import { shellScope } from '@specwarden/ops';\n\n" +
  "export const check = shellScope({ scripts: ['scripts/*.sh'] });\n";

/** One repository with every stack the ops GUIDE's wiring block reads, all of it sound. */
const OPS_TREE = {
  ...ENV_TREE,
  '.env.example': 'HANDSHAKE_KEY=\nBE_PORT=\n',
  'caddy/Caddyfile.local': ':80 {\n  reverse_proxy localhost:3000\n}\n',
  'caddy/Caddyfile.prod': ':80 {\n  reverse_proxy be:3000\n}\n',
  '.github/workflows/ci.yml':
    'jobs:\n  fast:\n    steps:\n      - run: npx specwarden check --tier fast\n' +
    '  unit:\n    steps:\n      - run: npx specwarden check --id unit\n  ci-ok:\n    needs: [fast, unit]\n',
  '.specwarden/checks/unit.check.mjs': `import { docPaths } from '@specwarden/docs';\nexport const check = docPaths({ id: 'unit', title: 'unit', tier: 'heavy', docs: '**/*.md' });\n`,
  'README.md': '# a\n',
  'packages/core/package.json': '{ "name": "@acme/core" }\n',
  'packages/api/package.json': '{ "name": "@acme/api", "dependencies": { "@acme/core": "workspace:*" } }\n',
  Dockerfile: 'RUN pnpm --filter @acme/core run build\nRUN pnpm --filter @acme/api run build\n',
  'scripts/deploy.sh': '#!/usr/bin/env bash\nmain() {\n  local target\n}\nmain\n',
  '.specwarden/checks/ops/env.check.mjs': null,
};

describe('@specwarden/ops, wired by its GUIDE', () => {
  it('the GUIDE wires all five with `opsChecks` in one file, and it is green as pasted over a sound repository', () => {
    // It had no wiring block at all: every section was a bare call with no import or
    // export, and the consumer assembled the file from fragments.
    const guide = pasted('modules/ops/GUIDE.md', 'export const checks = opsChecks(');
    expect(guide).toContain("from '@specwarden/ops'");
    const run = verdicts({ ...OPS_TREE, '.specwarden/checks/ops/ops.check.mjs': guide });
    expect(run.failed).toEqual([]);
    // Each check is named for its subject, with no `id` written.
    expect(run.results.map((r) => r.id).sort()).toEqual(
      ['unit', 'env-pairing', 'proxy-upstreams', 'ci-coverage', 'build-order', 'shell-scope'].sort(),
    );
  });

  it('the preset refuses a check whose facts it was not given, by name, saying how to leave it out', () => {
    const r = cli(
      {
        'README.md': '# a\n',
        '.specwarden/checks/ops/ops.check.mjs':
          "import { opsChecks } from '@specwarden/ops';\nexport const checks = opsChecks({ shellScope: {} });\n",
      },
      ['check', '--all', '--json'],
    );
    expect(r.status).toBe(2);
    expect(said(r)).toContain(
      'opsChecks: pass `envPairing: { composeFile, modes, verifierService, declaredKeys }`, or `envPairing: false` to leave it out.',
    );
  });

  describe('shellScope', () => {
    it('passes a clean script and names the line of a misplaced `local`', () => {
      const clean = verdicts({
        'scripts/deploy.sh':
          '#!/usr/bin/env bash\nset -Eeuo pipefail\n\nmain() {\n  local target\n  target="$1"\n}\n\nmain "$@"\n',
        '.specwarden/checks/ops/shell.check.mjs': SHELL_CHECK,
      });
      expect(resultOf(clean, 'shell-scope').messages).toEqual(['✓ shell-scope — 1 shell file(s) examined, clean']);
      const broken = verdicts({
        'scripts/deploy.sh': '#!/usr/bin/env bash\nlocal target\n',
        '.specwarden/checks/ops/shell.check.mjs': SHELL_CHECK,
      });
      expect(resultOf(broken, 'shell-scope').messages).toEqual([
        'scripts/deploy.sh:2 `local target` is outside every function — bash refuses it at run time. Move it inside a function, or drop `local`.',
      ]);
    });

    it('scripts that moved are an empty corpus — a failure naming the pathspec, not a clean run', () => {
      const run = verdicts({ 'bin/deploy.sh': 'local x\n', '.specwarden/checks/ops/shell.check.mjs': SHELL_CHECK });
      expect(run.status).toBe(1);
      expect(resultOf(run, 'shell-scope').messages[0]).toMatch(
        /^examined 0 shell file\(s\) — `scripts\/\*\.sh` matched no tracked script — below the floor of 1\./,
      );
    });

    it('the old `pathspecs` is refused by name at load, exit 2', () => {
      const r = cli(
        {
          'scripts/deploy.sh': 'main() {\n  local t\n}\n',
          '.specwarden/checks/ops/shell.check.mjs':
            "import { shellScope } from '@specwarden/ops';\nexport const check = shellScope({ pathspecs: ['scripts/*.sh'] });\n",
        },
        ['check', '--all', '--json'],
      );
      expect(r.status).toBe(2);
      expect(said(r)).toContain('`pathspecs` is not an option of shellScope');
    });

    it('an ops check wired without `when` is always relevant — the filtered run reports instead of crashing', () => {
      // It crashed the WHOLE pre-push run with "check.when is not a function", while the
      // `--all` run beside it was green.
      inRepo(
        {
          'scripts/deploy.sh': '#!/usr/bin/env bash\nmain() {\n  local t\n}\nmain\n',
          '.specwarden/checks/ops/shell.check.mjs': SHELL_CHECK,
        },
        {},
        (dir) => {
          // Under `--all` the predicate is never consulted, so this is green…
          expect(resultOf(verdictsIn(dir), 'shell-scope').ok).toBe(true);
          // …and so is the pre-push / PR run, which filters by relevance.
          const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: '1' };
          delete env.SPECWARDEN_ALL;
          const r = spawnSync(
            process.execPath,
            [join(ROOT, 'core/bin/specwarden.mjs'), 'check', '--json', '--base', 'main'],
            {
              cwd: dir,
              env,
              encoding: 'utf8',
            },
          );
          expect(r.stderr).not.toContain('is not a function');
          expect(r.status).toBe(0);
          const report = JSON.parse(r.stdout) as { results: { id: string; ok: boolean }[] };
          expect(report.results.find((x) => x.id === 'shell-scope')?.ok).toBe(true);
        },
      );
    });
  });

  describe('envPairing', () => {
    it('the shipped SKILL’s `declaredKeys` is one a consumer can paste — it reads the sample env file', () => {
      // It called `keysFrom`, which nothing exports: "keysFrom is not defined".
      const guide = pasted('modules/ops/skills/specwarden-ops/SKILL.md', 'export const check = envPairing(');
      expect(guide).not.toContain('keysFrom');
      const tree = {
        ...ENV_TREE,
        '.env.example': 'HANDSHAKE_KEY=\nBE_PORT=\n',
        '.specwarden/checks/ops/env.check.mjs': guide,
      };
      expect(resultOf(verdicts(tree), 'env-pairing').messages).toEqual(ENV_CLEAN);
      const broken = verdicts({ ...tree, 'env/prod/be.env': 'BE_PORT=3000\n' });
      expect(resultOf(broken, 'env-pairing').ok).toBe(false);
    });

    it('passes when both files agree, and says what it examined and which files it compared', () => {
      expect(resultOf(verdicts(ENV_TREE), 'env-pairing').messages).toEqual(ENV_CLEAN);
    });

    it('catches the verifier missing a key the sender’s mounted config interpolates', () => {
      const run = verdicts({ ...ENV_TREE, 'env/prod/be.env': 'BE_PORT=3000\n' });
      expect(resultOf(run, 'env-pairing').messages).toEqual([VERIFIER_LACKS, CHECKED]);
    });

    it('the GUIDE’s headline defect — the verifier lacks the key — is red with no mounted config at all', () => {
      // It was GREEN: the rule was reached only through a mounted config's interpolation.
      const run = verdicts({
        ...ENV_TREE,
        'caddy/edge.conf': null,
        'docker-compose.yml': COMPOSE.replace('    volumes:\n      - ./caddy/edge.conf:/etc/caddy/edge.conf\n', ''),
        'env/prod/be.env': 'BE_PORT=3000\n',
      });
      expect(run.status).toBe(1);
      expect(resultOf(run, 'env-pairing').messages).toEqual([VERIFIER_LACKS, CHECKED]);
    });

    it('a mounted `Caddyfile` is read for interpolations, like a .yml, .json, .conf or .caddy', () => {
      // It was not: `Caddyfile` has no extension, and it is the proxy config this module's
      // other check reads by name.
      const run = verdicts({
        ...ENV_TREE,
        'docker-compose.yml': COMPOSE.replace(
          './caddy/edge.conf:/etc/caddy/edge.conf',
          './caddy/Caddyfile:/etc/caddy/Caddyfile',
        ),
        'caddy/Caddyfile': ENV_TREE['caddy/edge.conf'],
        'caddy/edge.conf': null,
        'env/prod/edge.env': 'EDGE_PORT=80\n',
        'env/prod/be.env': 'BE_PORT=3000\n',
      });
      expect(resultOf(run, 'env-pairing').messages).toEqual([
        "prod: HANDSHAKE_KEY is interpolated by edge's mounted config but is missing or empty in env/prod/edge.env — set it there, or the substitution yields an empty string.",
        CHECKED,
      ]);
    });

    it('an EMPTY value in the verifier file is reported as missing, as the GUIDE says, not as "differs"', () => {
      const run = verdicts({
        ...ENV_TREE,
        'caddy/edge.conf': 'nothing\n',
        'env/prod/be.env': 'HANDSHAKE_KEY=\nBE_PORT=3000\n',
      });
      expect(resultOf(run, 'env-pairing').messages[0]).toBe(VERIFIER_LACKS);
    });

    it('a run where no mode’s env files are present is SKIPPED, cannot-tell — as the GUIDE says, not a pass', () => {
      // It was `ok: true` with an info line, counted as a pass.
      const run = verdicts({ ...ENV_TREE, 'env/prod/edge.env': null, 'env/prod/be.env': null });
      const result = resultOf(run, 'env-pairing');
      expect(run.status).toBe(0);
      expect(result.skipped).toBe('cannot-tell');
      expect(result.messages).toEqual([
        "prod: SKIPPED — 0 of the mode's env files exist here (they are gitignored; this rule can only run where they live).",
      ]);
    });

    it('the `env-pairing` .example as-is names the verifier it guessed, rather than a service called ``', () => {
      // It failed on "compose.yaml: service `` declares no env_file" — a finding about a name
      // nobody wrote. An empty name is a load error now, so the example ships a guess no
      // compose file declares, marked REPLACE, and the finding says what to put there.
      const run = verdicts({
        'compose.yaml': `services:\n  be:\n    env_file:\n      - ./.env.${MODE}\n`,
        '.specwarden/checks/ops/env.check.mjs': example(
          'ops/_playground/repository/.specwarden/checks/ops/env-pairing.check.mjs.example',
        ),
      });
      expect(resultOf(run, 'env-pairing').messages).toEqual([
        'compose.yaml: service `your-verifier` is not declared — name in `verifierService` the service that verifies a key another service sends, and give it the env_file it reads.',
      ]);
    });

    it('an empty `verifierService` is refused at load, by name — exit 2', () => {
      const r = cli(
        {
          ...ENV_TREE,
          '.specwarden/checks/ops/env.check.mjs': ENV_CHECK.replace("verifierService: 'be'", "verifierService: ''"),
        },
        ['check', '--all', '--json'],
      );
      expect(r.status).toBe(2);
      expect(said(r)).toContain('envPairing: `verifierService` is empty, which selects nothing to check');
    });

    it('a compose file that cannot be read fails on the corpus floor', () => {
      const run = verdicts({ ...ENV_TREE, 'docker-compose.yml': null });
      expect(resultOf(run, 'env-pairing').messages[0]).toMatch(
        /^examined 0 compose service\(s\) — `docker-compose\.yml` could not be read — below the floor of 1\./,
      );
    });
  });

  describe('proxyUpstreams', () => {
    it('passes a host-mode loopback and a container-mode service name, saying what it examined', () => {
      expect(resultOf(verdicts(UP_TREE), 'proxy-upstreams').messages).toEqual([
        '✓ proxy-upstreams — 2 proxy config(s) examined, clean',
      ]);
    });

    it('names a loopback address in a deployed file, with the fix', () => {
      const run = verdicts({ ...UP_TREE, 'caddy/Caddyfile.prod': ':80 {\n  reverse_proxy 127.0.0.1:3000\n}\n' });
      expect(resultOf(run, 'proxy-upstreams').messages).toEqual([
        'caddy/Caddyfile.prod:2 proxies to `127.0.0.1:3000`. The proxy runs INSIDE the container network in prod mode, so a loopback address is the proxy itself — the site answers 502 on a public host. Use the service name.',
      ]);
    });

    it('with EVERY mode’s file absent it fails on the corpus floor naming them — the `.example` as-is too', () => {
      // It was green: two SKIPPED lines and exit 0, over a `fileFor` pointed at nothing.
      const run = verdicts({ ...UP_TREE, 'caddy/Caddyfile.local': null, 'caddy/Caddyfile.prod': null });
      expect(run.status).toBe(1);
      const [floor, ...skipped] = resultOf(run, 'proxy-upstreams').messages;
      expect(floor).toMatch(
        /^examined 0 proxy config\(s\) — none of the proxy configs `fileFor` names exists \(caddy\/Caddyfile\.local, caddy\/Caddyfile\.prod\) — below the floor of 1\./,
      );
      expect(skipped).toEqual([
        'SKIPPED local: caddy/Caddyfile.local not present.',
        'SKIPPED prod: caddy/Caddyfile.prod not present.',
      ]);
      const templated = verdicts({
        'README.md': '# a\n',
        '.specwarden/checks/ops/up.check.mjs': example(
          'ops/_playground/repository/.specwarden/checks/ops/proxy-upstreams.check.mjs.example',
        ),
      });
      expect(templated.status).toBe(1);
    });

    it('with SOME mode’s file absent it reads the rest, and notes the one it skipped', () => {
      const run = verdicts({ ...UP_TREE, 'caddy/Caddyfile.local': null });
      expect(run.status).toBe(0);
      expect(resultOf(run, 'proxy-upstreams').messages).toEqual([
        '✓ proxy-upstreams — 1 proxy config(s) examined, clean',
        'SKIPPED local: caddy/Caddyfile.local not present.',
      ]);
    });
  });

  describe('ciCoverage', () => {
    it('passes when the heavy check has a job the required job needs, and a job runs the cheap tier', () => {
      expect(resultOf(verdicts(CI_TREE), 'ci-coverage').messages).toEqual(CI_CLEAN());
    });

    it('names a heavy check with no job and a job that runs checks outside the required job’s needs', () => {
      const run = verdicts({
        ...CI_TREE,
        '.github/workflows/ci.yml':
          'jobs:\n  fast:\n    steps:\n      - run: node specwarden.mjs check --tier fast\n' +
          '  lint:\n    steps:\n      - run: node specwarden.mjs check --id lint\n  ci-ok:\n    needs: [fast]\n',
        '.specwarden/checks/lint.check.mjs': HEAVY_CHECK('lint'),
      });
      expect(resultOf(run, 'ci-coverage').messages).toEqual([
        'heavy check `unit` (unit) has no job in .github/workflows/ci.yml. Add it to the matrix of the job that offers what it needs, or move it to another tier on purpose.',
        "job `lint` runs checks but is not in `ci-ok`'s needs, so it can be red while the status branch protection requires is green — add it to `ci-ok`'s needs.",
      ]);
    });

    it('the shipped SKILL’s wiring is green, and the old `arbiterJob` is refused by name at load', () => {
      // `arbiter:` for `arbiterJob` loaded once, and reported `undefined` three times; the
      // option is `requiredJob` now, and the old name is a load error rather than a silence.
      const skill = pasted('modules/ops/skills/specwarden-ops/SKILL.md', 'ciCoverage({');
      const run = verdicts({ ...CI_TREE, '.specwarden/checks/ops/ci.check.mjs': skill });
      expect(resultOf(run, 'ci-coverage').messages).toEqual(CI_CLEAN());

      const old = cli(
        {
          ...CI_TREE,
          '.specwarden/checks/ops/ci.check.mjs':
            "import { ciCoverage } from '@specwarden/ops';\nexport const check = ciCoverage({ workflowFile: '.github/workflows/ci.yml', arbiterJob: 'ci-ok' });\n",
        },
        ['check', '--all', '--json'],
      );
      expect(old.status).toBe(2);
      expect(said(old)).toContain('`arbiterJob` is not an option of ciCoverage; `requiredJob` is required');
    });

    it('the `ci-coverage` .example sees a job that runs the fast tier', () => {
      // It was red over a correct workflow: the cheap-tier test appended `--tier fast` to a
      // pattern that already ends in `--id (\S+)`, so it could never match.
      const run = verdicts({
        ...CI_TREE,
        '.github/workflows/ci.yml':
          'jobs:\n  fast:\n    steps:\n      - run: specwarden check --tier fast\n' +
          '  unit:\n    steps:\n      - run: specwarden check --id unit\n  ci-ok:\n    needs: [fast, unit]\n',
        // The monorepo example names `ci.yml`; the ops one names the `deploy.yml` its tree has.
        '.specwarden/checks/ops/ci.check.mjs': example(
          'monorepo/_playground/repository/.specwarden/checks/ops/ci-coverage.check.mjs.example',
        ),
      });
      expect(resultOf(run, 'ci-coverage').messages).toEqual(CI_CLEAN('ci-coverage'));
    });
  });

  describe('buildOrder', () => {
    it('passes a build in dependency order and names a swapped one, on its line', () => {
      expect(resultOf(verdicts(BO_TREE), 'build-order').messages).toEqual([
        '✓ build-order — 1 container file(s) examined, clean',
      ]);
      const run = verdicts({
        ...BO_TREE,
        Dockerfile: 'RUN pnpm --filter @acme/api run build\nRUN pnpm --filter @acme/core run build\n',
      });
      expect(resultOf(run, 'build-order').messages).toEqual([
        'Dockerfile: builds @acme/api before @acme/core, which @acme/api imports — swap the two.',
      ]);
    });

    it('a pathspec that selects no container file fails on the corpus floor — it passed in silence', () => {
      const run = verdicts({ ...BO_TREE, Dockerfile: null, 'Containerfile.web': 'FROM node\n' });
      expect(resultOf(run, 'build-order').messages[0]).toMatch(/^examined 0 container file\(s\) — /);
    });

    it('the `build-order` .example as-is is loud about the scope it has not been told', () => {
      const run = verdicts({
        ...BO_TREE,
        '.specwarden/checks/ops/bo.check.mjs': example(
          'monorepo/_playground/repository/.specwarden/checks/workspace/build-order.check.mjs.example',
        ),
      });
      expect(resultOf(run, 'build-order').messages).toEqual([
        'no workspace package under packages is named @your-scope/… — point `packagesDir` at where the manifests are, and `scopePrefix` at the scope their names carry.',
      ]);
    });
  });

  it('the `migrations` .example refuses an empty corpus, as it says it does', () => {
    // It said an empty corpus was "never passed over" — and passed it, "0 migration file(s) read".
    const run = verdicts({
      'README.md': '# a\n',
      '.specwarden/checks/workspace/mig.check.mjs': example(
        'nestjs/_playground/repository/.specwarden/checks/workspace/migrations-backwards-compatible.check.mjs.example',
      ),
    });
    expect(run.status).toBe(1);
    expect(resultOf(run, 'migrations-backwards-compatible').ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// @specwarden/security
// ─────────────────────────────────────────────────────────────────────────────────────

/** Assembled, so this spec does not trip a scan run over THIS repository. */
const AWS_KEY = `AKIA${'ABCDEFGHIJ012345'}`;
const ACME_KEY = `acme_${'a'.repeat(32)}`;

describe('@specwarden/security, wired by its GUIDE', () => {
  it('the one-line wiring passes over a clean tree, saying what it read, and names a planted key, rotate-first', () => {
    const wiring = pasted('modules/security/GUIDE.md', 'export const check = secretScan();');
    const clean = verdicts({
      'README.md': '# a\n',
      '.env.example': 'API_TOKEN=\n',
      '.specwarden/checks/security/s.check.mjs': wiring,
    });
    // The README, the sample env file, the config and the check file itself.
    expect(resultOf(clean, 'secret-scan').messages).toEqual(['✓ secret-scan — 4 file(s) examined, clean']);
    const broken = verdicts({
      'README.md': '# a\n',
      'src/config.ts': `export const key = '${AWS_KEY}';\n`,
      '.specwarden/checks/security/s.check.mjs': wiring,
    });
    expect(resultOf(broken, 'secret-scan').messages).toEqual([
      'src/config.ts:1 — AWS access key id [aws-access-key-id]. If real, ROTATE it before deleting the line; if a placeholder, add it to the allowlist with a reason.',
    ]);
  });

  it('the GUIDE’s pattern tuning finds the planted key, and the old `patterns.add` is refused by name', () => {
    // `add` was the GUIDE's word for `extra`, and nothing read it: the planted Acme key
    // stayed GREEN, with a note about a disabled pattern as the only output.
    const tree = { 'README.md': '# a\n', 'src/config.ts': `export const key = '${ACME_KEY}';\n` };
    const guide = pasted('modules/security/GUIDE.md', 'patterns: {');
    const run = verdicts({ ...tree, '.specwarden/checks/security/s.check.mjs': guide });
    expect(run.status).toBe(1);
    expect(resultOf(run, 'secret-scan').messages).toContain(
      'src/config.ts:1 — Acme API key [acme-key]. If real, ROTATE it before deleting the line; if a placeholder, add it to the allowlist with a reason.',
    );

    const old = cli(
      {
        ...tree,
        '.specwarden/checks/security/s.check.mjs': `import { secretScan } from '@specwarden/security';
export const check = secretScan({
  id: 'secret-scan',
  title: 'x',
  patterns: { add: [{ id: 'acme-key', label: 'Acme API key', re: /\bacme_[a-z0-9]{32}\b/ }] },
});
`,
      },
      ['check', '--all', '--json'],
    );
    expect(old.status).not.toBe(0);
    expect(said(old)).toContain('`patterns.add` is not an option — `patterns` takes extra, disable and replace');
  });

  it('the SKILL’s `patterns.extra` finds the same key', () => {
    const run = verdicts({
      'README.md': '# a\n',
      'src/config.ts': `export const key = '${ACME_KEY}';\n`,
      '.specwarden/checks/security/s.check.mjs': `import { secretScan } from '@specwarden/security';
export const check = secretScan({
  patterns: { extra: [{ id: 'acme-key', label: 'Acme API key', re: /\\bacme_[a-z0-9]{32}\\b/ }] },
});
`,
    });
    expect(resultOf(run, 'secret-scan').messages).toEqual([
      'src/config.ts:1 — Acme API key [acme-key]. If real, ROTATE it before deleting the line; if a placeholder, add it to the allowlist with a reason.',
    ]);
  });

  it('a `files` pathspec that matches nothing fails on the corpus floor, and the old `scan` is refused', () => {
    const run = verdicts({
      'README.md': '# a\n',
      '.specwarden/checks/security/s.check.mjs':
        "import { secretScan } from '@specwarden/security';\nexport const check = secretScan({ files: 'src/**' });\n",
    });
    expect(resultOf(run, 'secret-scan').messages[0]).toMatch(
      /^examined 0 file\(s\) — `src\/\*\*`, less `except` and the default exemptions, left nothing to scan — below the floor of 1\./,
    );
    const old = cli(
      {
        'README.md': '# a\n',
        '.specwarden/checks/security/s.check.mjs':
          "import { secretScan } from '@specwarden/security';\nexport const check = secretScan({ scan: 'src/**', skipPaths: [] });\n",
      },
      ['check', '--all', '--json'],
    );
    expect(old.status).toBe(2);
    expect(said(old)).toContain('`scan` is not an option of secretScan; `skipPaths` is not an option of secretScan');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// @specwarden/agents
// ─────────────────────────────────────────────────────────────────────────────────────

const AGENTS_CHECK = `import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions();
`;
const ROSTER = {
  '.claude/agents/lead.md': '---\nname: lead\ndescription: Plans.\ntools: Read, Agent\nmodel: opus\n---\n\nPlans.\n',
  '.claude/agents/reviewer.md':
    '---\nname: reviewer\ndescription: Reviews.\ntools: Read, Grep\nmodel: sonnet\n---\n\nReviews.\n',
  '.specwarden/checks/agents/a.check.mjs': AGENTS_CHECK,
};
const SPAWNING_LEAF =
  'declares the spawn tool(s) Agent but is not an orchestrator — a leaf role that can spawn turns a bounded pipeline into an unbounded one. Remove the tool, or name the role in `orchestrators`.';

describe('@specwarden/agents, wired by its GUIDE', () => {
  it('passes a sound roster, and fails naming the folder when the roster is not there', () => {
    // A missing roster passed as "nothing to verify" — and so did an `agentsDir` pointing at
    // one that moved. A repository with no roster does not install this module.
    expect(pasted('modules/agents/GUIDE.md', 'agentDefinitions()')).toContain(
      'export const check = agentDefinitions();',
    );
    expect(resultOf(verdicts(ROSTER), 'agent-definitions').messages).toEqual([
      '✓ agent-definitions — 2 agent definition(s) examined, clean',
    ]);
    const none = verdicts({ 'README.md': '# a\n', '.specwarden/checks/agents/a.check.mjs': AGENTS_CHECK });
    expect(resultOf(none, 'agent-definitions').messages[0]).toMatch(
      /^examined 0 agent definition\(s\) — `\.claude\/agents` does not exist — point `agentsDir` at the folder the agent definitions live in — below the floor of 1\./,
    );
  });

  it('names a mismatched name, a spawning leaf, and a missing `tools:`', () => {
    const run = verdicts({
      ...ROSTER,
      '.claude/agents/reviewer.md':
        '---\nname: review\ndescription: Reviews.\ntools: Read, Agent\nmodel: sonnet\n---\n',
      '.claude/agents/writer.md': '---\nname: writer\ndescription: Writes.\nmodel: sonnet\n---\n',
    });
    expect(resultOf(run, 'agent-definitions').messages).toEqual([
      '.claude/agents/reviewer.md: `name: review` does not match the filename (`reviewer`) — an assistant addresses agents by name, so this one is uncallable. Rename one to match the other.',
      `.claude/agents/reviewer.md: ${SPAWNING_LEAF}`,
      '.claude/agents/writer.md: missing or empty `tools:` — every definition declares it.',
    ]);
  });

  it("`orchestrators` defaults to `['lead']`, and the GUIDE and the SKILL both say so", () => {
    // It defaulted in silence, while the GUIDE said the check "asks for the list".
    for (const doc of ['modules/agents/GUIDE.md', 'modules/agents/skills/specwarden-agents/SKILL.md']) {
      expect(readFileSync(join(ROOT, doc), 'utf8'), doc).toMatch(/`orchestrators`\s+defaults\s+to\s+`\['lead'\]`/);
    }
    const run = verdicts({
      ...ROSTER,
      '.claude/agents/lead.md': null,
      '.claude/agents/orchestrator.md':
        '---\nname: orchestrator\ndescription: Plans.\ntools: Read, Agent\nmodel: opus\n---\n',
    });
    expect(resultOf(run, 'agent-definitions').messages).toEqual([`.claude/agents/orchestrator.md: ${SPAWNING_LEAF}`]);
  });

  it('a README beside the roster is read as a definition with no frontmatter', () => {
    const run = verdicts({ ...ROSTER, '.claude/agents/README.md': '# the roster\n\nOne file per role.\n' });
    expect(resultOf(run, 'agent-definitions').messages).toEqual([
      '.claude/agents/README.md: no YAML frontmatter — an assistant cannot register this agent. Open the file with `---`, its fields, and `---`.',
    ]);
  });

  it("the shipped SKILL’s wiring is green, and its old `agents: '.claude/agents/*.md'` is refused by name at load", () => {
    // It crashed with a Node internal message: "The "path" argument must be of type string".
    const skill = pasted('modules/agents/skills/specwarden-agents/SKILL.md', 'agentDefinitions({');
    const green = verdicts({ ...ROSTER, '.specwarden/checks/agents/a.check.mjs': skill });
    expect(resultOf(green, 'agent-definitions').ok).toBe(true);
    const run = cli(
      {
        ...ROSTER,
        '.specwarden/checks/agents/a.check.mjs': `import { agentDefinitions } from '@specwarden/agents';

export const check = agentDefinitions({
  id: 'agent-definitions',
  agents: '.claude/agents/*.md',
  orchestrators: ['lead'],
});
`,
      },
      ['check', '--all', '--json'],
    );
    expect(run.status).not.toBe(0);
    expect(said(run)).toContain("agentDefinitions 'agent-definitions': `agents` is not an option of agentDefinitions");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Rules — what `orphan-check` says about a module check the GUIDE wired without one
// ─────────────────────────────────────────────────────────────────────────────────────

const WITH_RULES = "import { defineConfig } from 'specwarden';\n\nexport default defineConfig({ rules: [] });\n";
const DOC_PATHS = (extra = '') =>
  `import { docPaths } from '@specwarden/docs';\nexport const check = docPaths({ id: 'doc-paths', title: 'x', tier: 'fast', docs: '**/*.md'${extra} });\n`;
const DOCS_TREE = { 'README.md': '# a\n\nSee `src/index.ts`.\n', 'src/index.ts': 'export {};\n' };

describe('rules, for a module check wired by its GUIDE', () => {
  it('with no `rules` key the rule audits are not registered — doctor says how to start one', () => {
    const r = cli({ ...DOCS_TREE, '.specwarden/checks/docs/d.check.mjs': DOC_PATHS() }, ['doctor'], {
      config: DAY_ONE,
    });
    expect(r.stderr).toContain(
      'no `rules` declared — the four rule audits (owner, coverage, orphans, enforcers) are not registered; add `rules: []` to start one.',
    );
  });

  it('`rules: []` finds no orphan among GUIDE-wired checks — a module check names the rule it enforces', () => {
    // Every GUIDE-wired check was an orphan: no GUIDE showed a `rule`, and a preset's checks
    // had nowhere to put one. The module now supplies it, implied, owned by the package.
    // The owner is the package, which the consumer's manifest depends on.
    const manifest = JSON.stringify({ devDependencies: { specwarden: '*', '@specwarden/docs': '*' } });
    const run = verdicts(
      { ...DOCS_TREE, 'package.json': manifest, '.specwarden/checks/docs/d.check.mjs': DOC_PATHS() },
      { config: WITH_RULES },
    );
    expect(resultOf(run, 'orphan-check').ok).toBe(true);
    expect(resultOf(run, 'rule-owner-resolves').ok).toBe(true);
  });

  it('a hand-wired consumer meets a green `rule-owner-resolves` — the engine owns its own rule where no README does', () => {
    // It was red: the self-checks’ rule was owned by `.specwarden/README.md`, which only `init` writes.
    const run = verdicts(
      {
        ...DOCS_TREE,
        '.specwarden/checks/docs/d.check.mjs': DOC_PATHS(
          ", rule: { statement: 'a documented path resolves', owner: 'README.md' }",
        ),
      },
      { config: WITH_RULES },
    );
    expect(resultOf(run, 'orphan-check').ok).toBe(true);
    expect(resultOf(run, 'rule-owner-resolves').ok).toBe(true);
  });

  it('a rule whose owner document does not exist is named', () => {
    const run = verdicts(
      {
        ...DOCS_TREE,
        '.specwarden/checks/docs/d.check.mjs': DOC_PATHS(", rule: { statement: 'x', owner: 'docs/RULES.md' }"),
      },
      { config: WITH_RULES },
    );
    expect(resultOf(run, 'rule-owner-resolves').messages[0]).toBe(
      "rule 'doc-paths' names owner 'docs/RULES.md', whose document docs/RULES.md does not exist",
    );
  });

  it('the nestjs plugin’s check carries the rule its package implies, and is no orphan — a rule the consumer writes wins', () => {
    // It was an orphan, and `nestjs()` took no `rule` to fix it with; then only a `rule` the
    // consumer wrote would do. The plugin implies one now, as every module does.
    const tree = {
      'README.md': '# a\n',
      'package.json': JSON.stringify({ devDependencies: { specwarden: '*', '@specwarden/plugin-nestjs': '*' } }),
      'src/modules/gaps/gaps.service.ts': "import { GapRepository } from './repositories/gap.repository';\n",
      'src/modules/gaps/repositories/gap.repository.ts': "import { eq } from 'drizzle-orm';\n",
    };
    const config = (extra: string) =>
      "import { nestjs } from '@specwarden/plugin-nestjs';\nimport { defineConfig } from 'specwarden';\n" +
      `export default defineConfig({ rules: [], plugins: [nestjs({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm'${extra} })] });\n`;
    const implied = verdicts(tree, { config: config('') });
    expect(resultOf(implied, 'orphan-check').ok).toBe(true);
    expect(resultOf(implied, 'rule-owner-resolves').ok).toBe(true);
    const ruled = verdicts(tree, {
      config: config(
        ", rule: { statement: 'a module reaches the database only through a repository', owner: 'README.md' }",
      ),
    });
    expect(resultOf(ruled, 'orphan-check').ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// @specwarden/openspec and @specwarden/speckit — sync-invariants
// ─────────────────────────────────────────────────────────────────────────────────────

const specConfig = (factory: 'openspec' | 'speckit', idPattern = '/INV-([A-Z0-9-]+)/', docs = 'src/**/*_MODULE.md') =>
  `import { ${factory} } from '@specwarden/${factory}';
import { defineConfig } from 'specwarden';

export default defineConfig({
  specSource: ${factory}(),
  invariants: { docs: '${docs}', idPattern: ${idPattern} },
});
`;
/** A marker that carries the adapter's own id — the only shape that can ever match. */
const FULL_ID = String.raw`/<!--\s*invariant:\s*([^\s>]+)\s*-->/`;

const OPENSPEC_TREE = {
  'openspec/specs/auth/spec.md': '# auth\n\n### Requirement: The system SHALL refuse an expired token\n\nText.\n',
  'openspec/changes/add-auth/tasks.md': '- [x] write it\n- [ ] ship it\n',
  'src/auth/AUTH_MODULE.md': '# auth\n\n<!-- INV-AUTH-1 --> An expired token is refused.\n',
};
const SPECKIT_TREE = {
  'specs/001-invites/spec.md':
    '# invites\n\n- **FR-001**: the system MUST expire an invite after 7 days\n- **FR-002**: the system MUST refuse a reused invite\n',
  'specs/001-invites/tasks.md': '- [x] T001 model\n- [ ] T002 api\n',
  'src/invites/INVITES_MODULE.md': '# invites\n\n<!-- INV-INVITES-1 --> An invite expires.\n',
};
const NOTHING_WRITTEN =
  'Nothing was written. Apply the deposits by hand — a requirement becomes a module invariant only when a person decides it does.';

describe('sync-invariants, as the spec-source GUIDEs describe it', () => {
  it('openspec: the GUIDE’s config and the GUIDE’s marker, as pasted, reach "in sync"', () => {
    // Its `idPattern` captured `INV-…`, which can never equal `auth#…`: the round trip the
    // GUIDE described could not close by following the GUIDE.
    const config = pasted('modules/openspec/GUIDE.md', 'specSource: openspec()');
    const deposit = pasted('modules/openspec/GUIDE.md', 'invariant:', 'markdown');
    const r = cli({ ...OPENSPEC_TREE, 'src/auth/AUTH_MODULE.md': `# auth\n\n${deposit}` }, ['sync-invariants'], {
      config,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('✓ in sync — every requirement has an invariant and every invariant a requirement (1).');
  });

  it('openspec: a local `INV-…` marker never matches an OpenSpec id — which is why the GUIDE no longer shows one', () => {
    const r = cli(OPENSPEC_TREE, ['sync-invariants'], { config: specConfig('openspec') });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(
      [
        'sync-invariants — openspec: 1 requirement(s), 1 invariant(s) found',
        '',
        '1 requirement(s) with no invariant yet — propose depositing (a human decides the module and the pinning):',
        '  + auth#the-system-shall-refuse-an-expired-token  The system SHALL refuse an expired token',
        '',
        '1 invariant(s) whose requirement has vanished — reconcile (retire the invariant, or restore the requirement):',
        '  - AUTH-1  (src/auth/AUTH_MODULE.md)',
        '',
        NOTHING_WRITTEN,
        '',
      ].join('\n'),
    );
  });

  it('openspec: a deposit carrying the adapter’s id closes the round trip', () => {
    const r = cli(
      {
        ...OPENSPEC_TREE,
        'src/auth/AUTH_MODULE.md':
          '# auth\n\n<!-- invariant: auth#the-system-shall-refuse-an-expired-token --> Refused.\n',
      },
      ['sync-invariants'],
      { config: specConfig('openspec', FULL_ID) },
    );
    expect(r.stdout).toContain('✓ in sync — every requirement has an invariant and every invariant a requirement (1).');
  });

  it('speckit: the GUIDE’s config and marker, as pasted, match `001-invites#FR-001` — and one more closes it', () => {
    // Its `idPattern` captured `INV-…`, which cannot match a feature-prefixed id either.
    const config = pasted('modules/speckit/GUIDE.md', 'specSource: speckit()');
    const deposit = pasted('modules/speckit/GUIDE.md', 'invariant:', 'markdown');
    const one = cli(
      { ...SPECKIT_TREE, 'src/invites/INVITES_MODULE.md': `# invites\n\n${deposit}` },
      ['sync-invariants'],
      {
        config,
      },
    );
    expect(one.stdout).toContain('1 requirement(s) with no invariant yet');
    expect(one.stdout).toContain('  + 001-invites#FR-002');
    const both = cli(
      {
        ...SPECKIT_TREE,
        'src/invites/INVITES_MODULE.md': `# invites\n\n${deposit}\n${deposit.replace('FR-001', 'FR-002')}`,
      },
      ['sync-invariants'],
      { config },
    );
    expect(both.stdout).toContain(
      '✓ in sync — every requirement has an invariant and every invariant a requirement (2).',
    );
  });

  it('speckit: a local `INV-…` marker cannot match `001-invites#FR-001` either', () => {
    const r = cli(SPECKIT_TREE, ['sync-invariants'], { config: specConfig('speckit') });
    expect(r.stdout).toContain('2 requirement(s) with no invariant yet');
    expect(r.stdout).toContain('  - INVITES-1  (src/invites/INVITES_MODULE.md)');
  });

  it('speckit: one deposit carrying the feature-prefixed id leaves exactly the other requirement', () => {
    const r = cli(
      {
        ...SPECKIT_TREE,
        'src/invites/INVITES_MODULE.md': '# invites\n\n<!-- invariant: 001-invites#FR-001 --> Expires.\n',
      },
      ['sync-invariants'],
      { config: specConfig('speckit', FULL_ID) },
    );
    expect(r.stdout).toBe(
      [
        'sync-invariants — speckit: 2 requirement(s), 1 invariant(s) found',
        '',
        '1 requirement(s) with no invariant yet — propose depositing (a human decides the module and the pinning):',
        '  + 001-invites#FR-002  the system MUST refuse a reused invite',
        '',
        NOTHING_WRITTEN,
        '',
      ].join('\n'),
    );
  });

  it('a spec tree that is not there exits 2 — the source could not be used — and its note ends in one full stop', () => {
    // It exited 0, so a CI step reconciled against nothing and passed.
    const os = cli({ 'README.md': '# a\n' }, ['sync-invariants'], { config: specConfig('openspec') });
    expect(os.status).toBe(2);
    expect(os.stdout).toBe(
      'spec source "openspec" found nothing: openspec/specs not found — is OpenSpec installed here? Set `specsDir` if its capabilities live elsewhere. (This is not a green light — it means the source could not be read.)\n',
    );
    const sk = cli({ 'README.md': '# a\n' }, ['sync-invariants'], { config: specConfig('speckit') });
    expect(sk.status).toBe(2);
    expect(sk.stdout).not.toContain('.. (This is not a green light');
  });

  it('openspec: a tree with no requirement heading says so, and names the option that fixes it', () => {
    const r = cli({ 'openspec/specs/auth/spec.md': '# auth\n\nNo heading here.\n' }, ['sync-invariants'], {
      config: specConfig('openspec'),
    });
    expect(r.stdout).toContain('Pass `requirementPattern` if this OpenSpec version words them differently');
    expect(r.stdout).toContain('(This is not "in sync" — there was nothing to compare.)');
  });

  it("`invariants.docs: '**/*.md'` (the openspec SKILL’s value) reads tracked files — not node_modules", () => {
    // It was a filesystem glob, and an installed dependency's marker was reported as an orphan.
    const r = cli(
      { ...OPENSPEC_TREE, 'node_modules/fake-package/README.md': '# fake\n\nINV-FROM-NODE-MODULES\n' },
      ['sync-invariants'],
      { config: specConfig('openspec', '/INV-([A-Z0-9-]+)/', '**/*.md') },
    );
    expect(r.stdout).not.toContain('FROM-NODE-MODULES');
  });

  it('the openspec SKILL’s two files, as pasted, load and reach "in sync" over a deposit it describes', () => {
    // Its config never imported `defineConfig` — the CLI died on load with a ReferenceError —
    // and its `idPattern` captured `AUTH-001`-style ids an OpenSpec source never produces.
    const skill = 'modules/openspec/skills/specwarden-openspec/SKILL.md';
    const marker = pasted(skill, 'invariant:', 'markdown');
    const r = cli(
      {
        ...OPENSPEC_TREE,
        'src/auth/AUTH_MODULE.md': `# auth\n\n${marker}\nRefused. Pinned by auth.spec.ts.\n`,
        '.specwarden/spec-source.mjs': pasted(skill, 'export const source'),
      },
      ['sync-invariants'],
      { config: pasted(skill, 'defineConfig({') },
    );
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('ReferenceError');
    expect(r.stdout).toContain('✓ in sync — every requirement has an invariant and every invariant a requirement (1).');
  });

  it('with no specSource it says there is nothing to sync', () => {
    const r = cli({ 'README.md': '# a\n' }, ['sync-invariants']);
    expect(r.stdout).toBe(
      'no specSource configured — nothing to sync. Declare one in .specwarden/config.mjs (native plans, or an adapter).\n',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// @specwarden/plugin-nestjs
// ─────────────────────────────────────────────────────────────────────────────────────

const nestConfig = (options: string, prefix = "import { defineConfig } from 'specwarden';\n") =>
  `import { nestjs } from '@specwarden/plugin-nestjs';
${prefix}
export default defineConfig({
  selfChecks: false,
  plugins: [nestjs({ ${options} })],
});
`;
const GUIDE_NEST = "modulesDir: 'src/modules', ormPackage: 'drizzle-orm'";
/** A realistic module: a service, its spec, a repository and a Drizzle entity. */
const NEST_TREE = {
  'src/modules/gaps/gaps.service.ts': "import { GapRepository } from './repositories/gap.repository';\n",
  'src/modules/gaps/gaps.service.spec.ts': "import { eq } from 'drizzle-orm';\n",
  'src/modules/gaps/repositories/gap.repository.ts': "import { eq } from 'drizzle-orm';\n",
  'src/modules/gaps/entities/gap.entity.ts': "import { pgTable } from 'drizzle-orm/pg-core';\n",
};
const ENTITY =
  'src/modules/gaps/entities/gap.entity.ts imports `drizzle-orm/pg-core`, which is forbidden from src/modules/**.';

describe('@specwarden/plugin-nestjs, wired by its GUIDE', () => {
  it('the GUIDE’s config, as pasted: an entity file — the ORM’s schema — is allowed by the default `except`', () => {
    // It was a violation: a Drizzle or TypeORM entity must import its ORM, and every real
    // service was red on its first run.
    const config = pasted(
      'plugins/nestjs/GUIDE.md',
      "plugins: [nestjs({ modulesDir: 'src/modules', ormPackage: 'drizzle-orm' })]",
    );
    const run = verdicts(NEST_TREE, { config });
    expect(resultOf(run, 'nestjs-db-access').messages).toEqual(['✓ nestjs-db-access — 1 file(s) examined, clean']);
    // …and a service reaching the ORM is still named, beside the entity that may.
    const broken = verdicts(
      { ...NEST_TREE, 'src/modules/gaps/gaps.service.ts': "import { eq } from 'drizzle-orm';\n" },
      { config: nestConfig(GUIDE_NEST) },
    );
    expect(resultOf(broken, 'nestjs-db-access').messages).not.toContain(ENTITY);
    expect(broken.failed).toEqual(['nestjs-db-access']);
  });

  it('with `except` naming entities, the tree is clean and the pass says what it examined', () => {
    const run = verdicts(NEST_TREE, {
      config: nestConfig(`${GUIDE_NEST}, except: ['**/repositories/**', '**/entities/**', '**/*.spec.ts']`),
    });
    expect(resultOf(run, 'nestjs-db-access').messages).toEqual(['✓ nestjs-db-access — 1 file(s) examined, clean']);
  });

  it('a service reaching the ORM is named, on the command line by its id, with the rule’s document in the hint', () => {
    const r = cli(
      { ...NEST_TREE, 'src/modules/gaps/gaps.service.ts': "import { eq } from 'drizzle-orm';\n" },
      ['check', '--id', 'nestjs-db-access'],
      {
        config: nestConfig(
          `${GUIDE_NEST}, rule: { statement: 'a module reaches the database only through a repository', owner: 'docs/ARCHITECTURE.md' }`,
        ),
      },
    );
    expect(r.status).toBe(1);
    // `file:line` leads the finding now; the sentence after it is the check's.
    expect(r.stdout).toMatch(
      /src\/modules\/gaps\/gaps\.service\.ts(?::1)? imports `drizzle-orm`, which is forbidden from src\/modules\/\*\*\./,
    );
    expect(r.stdout).toContain(
      '💡 Move the query behind a repository, or add the file to `except`. Rule: docs/ARCHITECTURE.md.',
    );
  });

  it('a `modulesDir` that matches nothing fails on the corpus floor', () => {
    const run = verdicts({ 'README.md': '# a\n' }, { config: nestConfig(GUIDE_NEST) });
    expect(resultOf(run, 'nestjs-db-access').messages).toEqual([
      'examined 0 file(s) — `src/modules/**` matched nothing to scan — below the floor of 1. A check that examined nothing cannot fail, so it reports success; this is that state, caught. Point the pathspec at where the files are, or declare `corpus: { atLeast: 0 }` if an empty set is expected.',
    ]);
  });

  it('the old `modulesRoot`, `allowedFrom` and `ruleDocument` are refused by name at load', () => {
    const r = cli(NEST_TREE, ['check', '--all', '--json'], {
      config: nestConfig(
        "modulesRoot: 'src/modules', ormPackage: 'drizzle-orm', allowedFrom: [], ruleDocument: 'x.md'",
      ),
    });
    expect(r.status).toBe(2);
    expect(said(r)).toContain(
      '`modulesRoot` is not an option of nestjs; `allowedFrom` is not an option of nestjs; `ruleDocument` is not an option of nestjs; `modulesDir` is required',
    );
  });

  it('the ratchet as the GUIDE arms it: today’s count passes as tolerated, and one more fails', () => {
    // The GUIDE said `--tighten` records today's count — and the run that recorded it exited
    // red. `--tighten` no longer records a count the check failed at, so the GUIDE arms the
    // ratchet inline, at today's count, instead.
    const armed = pasted('plugins/nestjs/GUIDE.md', 'ratchet: 1');
    const tree = {
      'src/modules/gaps/gaps.service.ts': "import { eq } from 'drizzle-orm';\n",
      'src/modules/gaps/repositories/gap.repository.ts': "import { eq } from 'drizzle-orm';\n",
    };
    const today = verdicts(tree, { config: armed });
    expect(today.status).toBe(0);
    expect(resultOf(today, 'nestjs-db-access').messages[0]).toBe(
      '↑ 1 pre-existing violation(s) tolerated under ratchet 1; the lines below are that tolerated set, not new failures. Any increase fails this check.',
    );
    const more = verdicts(
      { ...tree, 'src/modules/meetings/meetings.service.ts': "import { eq } from 'drizzle-orm';\n" },
      { config: armed },
    );
    expect(more.failed).toEqual(['nestjs-db-access']);
  });

  it('the shipped SKILL’s config, as pasted, loads and runs the plugin’s check', () => {
    // It never imported `defineConfig`, and the CLI died on load with a ReferenceError.
    const config = pasted('plugins/nestjs/skills/specwarden-nestjs/SKILL.md', 'defineConfig({');
    expect(config).toContain("import { defineConfig } from 'specwarden';");
    const r = cli(NEST_TREE, ['check', '--all', '--json'], { config });
    expect(r.stderr).not.toContain('ReferenceError');
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout) as { results: { id: string; ok: boolean }[] };
    expect(report.results.find((x) => x.id === 'nestjs-db-access')?.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Every example, as a file
// ─────────────────────────────────────────────────────────────────────────────────────

const DOCUMENTS_WITH_EXAMPLES = [
  'modules/docs/GUIDE.md',
  'modules/docs/skills/specwarden-docs/SKILL.md',
  'modules/plans/GUIDE.md',
  'modules/plans/skills/specwarden-plans/SKILL.md',
  'modules/ops/GUIDE.md',
  'modules/ops/skills/specwarden-ops/SKILL.md',
  'modules/security/GUIDE.md',
  'modules/security/skills/specwarden-security/SKILL.md',
  'modules/agents/GUIDE.md',
  'modules/agents/skills/specwarden-agents/SKILL.md',
  'modules/openspec/GUIDE.md',
  'modules/openspec/skills/specwarden-openspec/SKILL.md',
  'modules/speckit/GUIDE.md',
  'modules/speckit/skills/specwarden-speckit/SKILL.md',
  'plugins/nestjs/GUIDE.md',
  'plugins/nestjs/skills/specwarden-nestjs/SKILL.md',
];

describe('every example in a module GUIDE or a shipped SKILL loads as the file it is', () => {
  // The drift this journey found was in the examples: an option the factory does not have
  // (`skipped`, `agents`, `arbiter`, `plans`, `patterns.add`), a helper nothing exports
  // (`keysFrom`), a config that never imported `defineConfig`, a bare call with no import.
  // Every factory now refuses an option it does not have when the file loads, so importing
  // each block is enough to catch the first kind as well as the rest.
  it.each(DOCUMENTS_WITH_EXAMPLES)('%s', async (doc) => {
    const text = readFileSync(join(ROOT, doc), 'utf8').replace(/\r\n/g, '\n');
    const blocks = [...text.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1] as string);
    expect(blocks.length, doc).toBeGreaterThan(0);
    // Inside the playground, so the packages resolve the way an install resolves them.
    const dir = mkdtempSync(join(PLAYGROUND, '.examples-'));
    try {
      // A config block imports the spec-source file its skill shows beside it.
      writeFileSync(join(dir, 'spec-source.mjs'), 'export const source = { name: "stub" };\n');
      for (const [index, block] of blocks.entries()) {
        const file = join(dir, `example-${index}.mjs`);
        writeFileSync(file, block);
        const loaded = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
        const exported = loaded.check ?? loaded.checks ?? loaded.default ?? loaded.source;
        expect(exported, `${doc}, example ${index + 1}, exports nothing:\n${block}`).toBeDefined();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
