import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { HARNESS_CHECK_IDS, PLAN_STATUSES } from 'specwarden';
import { beforeAll, describe, expect, it } from 'vitest';

import { inScratchRepository, planted } from '../../scripts/playground-proof.mjs';
import { ROOT } from '../../scripts/playgrounds.mjs';

/**
 * Journey D — day one with a template, the week after, and the surface an agent working
 * in that repository is handed.
 *
 * The template playgrounds already prove each tree is green as scaffolded and that every
 * check it wrote can go red alone. This journey asks what they do not: is what `init`
 * wrote TRUE of the repository it landed in, what happens when a newcomer does the next
 * obvious thing (switches an example on, renames a folder, runs `new`, follows `plan
 * archive`'s advice), and do the shipped skills describe the product that exists.
 *
 * Every scene is the real CLI over a scratch copy of a template's committed repository.
 * A scene named `[friction]` asserts TODAY's behaviour, which is not the behaviour it
 * should have; the comment beside it says what it should be. A scene named `[bug]`
 * reproduces a defect the same way.
 */

const SLOW = 240_000;
const TEMPLATES = ['agentic', 'docs-only', 'monorepo', 'nestjs', 'node-ts', 'openspec', 'ops', 'speckit'] as const;
type TSlug = (typeof TEMPLATES)[number];
const AGENTIC_BRANCHES = ['feat/burst-allowance'];
const PLAN = 'docs/_plans/burst-allowance.md';

const repoPath = (slug: TSlug, rel: string) => join(ROOT, 'templates', slug, '_playground', 'repository', rel);
/** A committed file of a template's repository, line endings normalised so `planted` is stable on any checkout. */
const repoFile = (slug: TSlug, rel: string) => readFileSync(repoPath(slug, rel), 'utf8').replace(/\r\n/g, '\n');
const said = (r: { stdout: string; stderr: string }) => `${r.stdout}${r.stderr}`;
const setupFor = (slug: TSlug) => ({ branches: slug === 'agentic' ? AGENTIC_BRANCHES : [] });

/** Every `.mjs` / `.mjs.example` a template wrote, as [relative path, text]. */
function generated(slug: TSlug): [string, string][] {
  const root = repoPath(slug, '.specwarden');
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.mjs(\.example)?$/.test(e.name)) out.push([full.slice(root.length + 1), readFileSync(full, 'utf8')]);
    }
  };
  walk(root);
  return out;
}

/** An example switched on the way its own prose says: renamed to `.check.mjs`. */
const activate = (slug: TSlug, example: string, body = repoFile(slug, `.specwarden/checks/${example}`)) => ({
  [`.specwarden/checks/${example.replace(/\.example$/, '')}`]: body,
  [`.specwarden/checks/${example}`]: null,
});

/** An example's rule, uncommented in the register the way the example's header says. */
const uncomment = (slug: TSlug, id: string) => {
  const rules = repoFile(slug, '.specwarden/rules.mjs');
  const line = rules.split('\n').find((l) => l.startsWith(`  // { id: '${id}'`));
  if (!line) throw new Error(`${slug}: rules.mjs carries no commented rule for ${id}`);
  return { '.specwarden/rules.mjs': planted(rules, line, line.replace('  // ', '  ')) };
};

/** The family folders a template wrote under checks/, from the committed tree. */
const familiesOf = (slug: TSlug) => [
  ...new Set(
    generated(slug)
      .map(([p]) => p.split('\\').join('/'))
      .filter((p) => p.startsWith('checks/'))
      .map((p) => p.split('/')[1]),
  ),
];

/** A rule appended to a template's register, which is what `orphan-check` asks for. */
const withRule = (slug: TSlug, id: string, checkId: string) => ({
  '.specwarden/rules.mjs': planted(
    repoFile(slug, '.specwarden/rules.mjs'),
    'export const rules = [\n',
    `export const rules = [\n  { id: '${id}', statement: 'switched on by hand', owner: '.specwarden/README.md', enforcement: { checkIds: ['${checkId}'] } },\n`,
  ),
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('day one — what init writes, read as the newcomer reads it', () => {
  describe.each(TEMPLATES)('%s', (slug) => {
    let init: { status: number | null; stdout: string; stderr: string };
    let check: { status: number | null; stdout: string; stderr: string };
    beforeAll(() => {
      [init, check] = inScratchRepository(slug, { ...setupFor(slug), edits: { '.specwarden': null } }, ({ warden }) => [
        warden(['init', '--template', slug]),
        warden(['check', '--all']),
      ]);
    }, SLOW);

    it('init exits 0, lists what it wrote, names every example it left switched off, and says what to run next', () => {
      expect(init.status).toBe(0);
      const examples = generated(slug).filter(([p]) => p.endsWith('.example'));
      for (const [p] of examples) expect(init.stdout).toContain(p.split('\\').join('/'));
      if (examples.length) expect(init.stdout).toContain('Switched OFF until you fill them in');
      expect(init.stdout).toContain('specwarden check --all');
      // …and the run it points at is green over the tree it just wrote.
      expect(check.status).toBe(0);
    });

    it('"Next:" names the steps this tree left undone, and no `suggest` it has nothing for', () => {
      // It recommended `suggest`, which has nothing to say in any template repository, and
      // never the one step a template leaves undone.
      const next = init.stdout.slice(init.stdout.indexOf('Next:'));
      expect(next).not.toContain('specwarden suggest');
      if (existsSync(repoPath(slug, '.specwarden/perimeter.mjs'))) {
        expect(next).toContain(
          'wire the perimeter — until a hook runs it, .specwarden/perimeter.mjs enforces nothing.',
        );
        expect(next).toContain('hooks.PreToolUse');
      } else expect(next).not.toContain('perimeter');
      const examples = generated(slug).filter(([p]) => p.endsWith('.example'));
      if (examples.length) expect(next).toContain('rename it to .check.mjs, AND uncomment its rule');
      for (const [p] of examples) {
        const id = /([^/\\]+)\.check\.mjs\.example$/.exec(p)![1];
        expect(next).toContain(`${p.split('\\').join('/')} → rule '${id}'`);
      }
    });
  });

  it(
    'init lists perimeter.mjs beside checks/, at the path it has — not indented under checks/',
    () => {
      // The indentation read as `checks/perimeter.mjs`, a path that does not exist.
      const run = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { '.specwarden': null } },
        ({ dir, warden }) => ({
          out: warden(['init', '--template', 'agentic']).stdout,
          atRoot: existsSync(join(dir, '.specwarden', 'perimeter.mjs')),
          underChecks: existsSync(join(dir, '.specwarden', 'checks', 'perimeter.mjs')),
        }),
      );
      expect(run.out).toMatch(/^ {2}perimeter\.mjs +what an assistant may not do here/m);
      expect(run.out).not.toMatch(/^ {4}perimeter\.mjs$/m);
      expect(run.out).toMatch(/^ {2}checks\/ +one file per check[^\n]*\n {4}agents\/agent-definitions\.check\.mjs\n/m);
      expect(run.atRoot).toBe(true);
      expect(run.underChecks).toBe(false);
    },
    SLOW,
  );

  it(
    'init lists spec-source.mjs beside checks/ too, in the templates that write one',
    () => {
      for (const slug of ['openspec', 'speckit'] as const) {
        const out = inScratchRepository(
          slug,
          { edits: { '.specwarden': null } },
          ({ warden }) => warden(['init', '--template', slug]).stdout,
        );
        expect(out, slug).toMatch(/^ {2}spec-source\.mjs +where requirements and tasks come from/m);
        expect(out, slug).not.toMatch(/^ {4}spec-source\.mjs$/m);
      }
    },
    SLOW,
  );

  it(
    '"Detected:" names the test script it could not name a runner for, and counts the packages the globs match',
    () => {
      // It printed a bare `other`, and "1 workspace(s)" for one glob over three packages.
      const out = inScratchRepository(
        'monorepo',
        { edits: { '.specwarden': null } },
        ({ warden }) => warden(['init', '--template', 'monorepo']).stdout,
      );
      expect(readdirSync(repoPath('monorepo', 'packages'))).toHaveLength(3);
      expect(out).toContain(
        'Detected: pnpm, test script `node --test packages/*/test/*.test.ts`, 3 workspace packages, docs in docs, github actions (.github/workflows/ci.yml)\n',
      );
    },
    SLOW,
  );

  it(
    'init does not recommend `suggest` after a template, and `suggest` never points at the config',
    () => {
      // It recommended a command with nothing to say in any template repository, which then
      // said to copy a suggestion into warden.config.mjs — where no check of this tree lives.
      const r = inScratchRepository('node-ts', { edits: { '.specwarden': null } }, ({ warden }) => [
        warden(['init', '--template', 'node-ts']),
        warden(['suggest']),
      ]);
      expect(r[0].stdout).not.toContain('specwarden suggest');
      expect(r[1].stdout).toContain('nothing to suggest');
      expect(r[1].stdout).not.toContain('warden.config.mjs');
    },
    SLOW,
  );

  it(
    'what `suggest` prints, saved where it says, loads as pasted and holds over the tree',
    () => {
      // The whole adoption is one file: it used to print a one-line call to paste into a
      // config that no longer lists checks.
      const specs: Record<string, string> = {};
      for (const name of ['invoices', 'payments', 'refunds'])
        specs[`src/modules/${name}/${name}.service.spec.ts`] = "import { it } from 'node:test';\nit('x', () => {});\n";
      specs['src/modules/payments/payments.service.ts'] = 'export class PaymentsService {}\n';
      specs['src/modules/refunds/refunds.service.ts'] = 'export class RefundsService {}\n';
      const r = inScratchRepository('nestjs', { edits: specs }, ({ dir, warden }) => {
        const out = warden(['suggest']).stdout;
        const target = /Save as (\S+):\n/.exec(out)?.[1] ?? '';
        const file = /\.check\.mjs:\n\n([\s\S]*?\n\}\);)\n/.exec(out)?.[1] ?? '';
        mkdirSync(dirname(join(dir, target)), { recursive: true });
        writeFileSync(join(dir, target), `${file}\n`);
        return { out, target, check: warden(['check', '--id', 'service-has-spec']) };
      });
      expect(r.out).toContain('100% of **/*.service.ts have {name}.spec.ts (3 of 3).');
      expect(r.target).toBe('.specwarden/checks/tests/service-has-spec.check.mjs');
      expect(r.check.status).toBe(0);
      expect(r.check.stdout).toContain('✓ service-has-spec — 3 file(s) examined, clean');
    },
    SLOW,
  );

  it.each(TEMPLATES)('%s: the checks/README family table lists each family folder init wrote', (slug) => {
    // It was one placeholder row — "the folders beside this README" — in every template.
    const readme = repoFile(slug, '.specwarden/checks/README.md');
    expect(readme).not.toContain('the folders beside this README');
    const rows = [...readme.matchAll(/^\| `([a-z-]+)\/` \|/gm)].map((m) => m[1]);
    expect(rows.sort()).toEqual(familiesOf(slug).sort());
  });

  it(
    'a template-less init writes the same family table, each module named',
    () => {
      const readme = inScratchRepository('node-ts', { edits: { '.specwarden': null } }, ({ dir, warden }) => {
        expect(warden(['init']).status).toBe(0);
        return readFileSync(join(dir, '.specwarden', 'checks', 'README.md'), 'utf8');
      });
      expect(readme).toContain('| `security/` | secret-scan | `@specwarden/security` |');
      expect(readme).toContain('| `docs/` | doc-paths | `@specwarden/docs` |');
    },
    SLOW,
  );

  it.each(TEMPLATES)(
    "%s: every rule is owned by the file that holds its reasoning — a check's by the check itself",
    (slug) => {
      // Every rule named .specwarden/README.md as its owner, and that README never mentioned
      // one: an owner that resolves and answers no question anybody brings to it.
      const rules = repoFile(slug, '.specwarden/rules.mjs');
      const owners = [...rules.matchAll(/^\s{4}owner: '([^']+)'/gm)].map((m) => m[1]);
      for (const owner of owners) {
        expect(owner).not.toBe('.specwarden/README.md');
        expect(existsSync(repoPath(slug, owner)), owner).toBe(true);
      }
      // A live check states its rule, owned by its own file.
      for (const [p, text] of generated(slug).filter(([f]) => /\.check\.mjs$/.test(f)))
        expect(text, p).toMatch(/^\s+rule: '/m);
      // An example's rule waits, commented out, owned by the file the example becomes.
      for (const [p] of generated(slug).filter(([f]) => f.endsWith('.example'))) {
        const live = `.specwarden/${p
          .split('\\')
          .join('/')
          .replace(/\.example$/, '')}`;
        expect(rules, p).toContain(`owner: '${live}'`);
      }
    },
  );

  it(
    'the README claims no zone check the tree does not run',
    () => {
      // "fails its own zone check" — the consumer's run has no zone-boundary without `harness.zone`.
      for (const slug of TEMPLATES) expect(repoFile(slug, '.specwarden/README.md')).not.toMatch(/zone check/i);
      expect(HARNESS_CHECK_IDS).toContain('zone-boundary');
      const list = inScratchRepository('node-ts', {}, ({ warden }) => warden(['check', '--list']).stdout);
      expect(list).not.toContain('zone-boundary');
    },
    SLOW,
  );

  it('the README lists only what the tree holds, and carries no note to the template maintainers', () => {
    // It spent a paragraph explaining how it dodged its own doc-paths check, and listed
    // relevance.mjs, ratchets/ and baseline/ — which no template writes — in every tree.
    for (const slug of TEMPLATES) {
      const readme = repoFile(slug, '.specwarden/README.md');
      expect(readme).not.toContain('on purpose');
      for (const absent of ['relevance.mjs', 'ratchets/', 'baseline/'])
        expect(readme, `${slug}: ${absent}`).not.toContain(absent);
      for (const file of ['perimeter.mjs', 'spec-source.mjs'])
        expect(readme.includes(file), `${slug}: ${file}`).toBe(existsSync(repoPath(slug, `.specwarden/${file}`)));
      const examples = generated(slug).some(([p]) => p.endsWith('.example'));
      expect(readme.includes('uncommenting its rule in rules.mjs'), slug).toBe(examples);
    }
  });

  it.each(TEMPLATES)('%s: the generated .mjs files carry fewer comment lines than code lines', (slug) => {
    // They carried more — agentic 135 comment to 107 code, openspec 80 to 38. A header of a
    // few lines per check now, and the reasoning in the module's GUIDE.
    let comment = 0;
    let code = 0;
    for (const [, text] of generated(slug)) {
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        if (/^(\/\*\*|\*|\/\/)/.test(line)) comment++;
        else code++;
      }
    }
    expect(comment).toBeLessThan(code);
  });

  it(
    'docs-only: a dead path in the root README is red — the README that says the handbook is checked',
    () => {
      // It went unnoticed: the corpus was `docs/**/*.md`, and the root README is the index.
      const readme = repoFile('docs-only', 'README.md');
      expect(readme).toContain('The handbook is checked on every merge');
      const r = inScratchRepository(
        'docs-only',
        {
          edits: {
            'README.md': planted(
              readme,
              'docs/runbooks/restart-the-queue.md`, say',
              'docs/runbooks/restart-the-kraken.md`, say',
            ),
          },
        },
        ({ warden }) => warden(['check', '--id', 'doc-paths']),
      );
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/README\.md:\d+ names `docs\/runbooks\/restart-the-kraken\.md`, which does not resolve/);
    },
    SLOW,
  );

  it(
    'agentic: doc-paths reads CLAUDE.md and AGENTS.md — the first files an agent follows',
    () => {
      const r = inScratchRepository(
        'agentic',
        {
          ...setupFor('agentic'),
          edits: {
            'CLAUDE.md': planted(repoFile('agentic', 'CLAUDE.md'), 'docs/architecture.md', 'docs/architecture-v2.md'),
          },
        },
        ({ warden }) => warden(['check', '--id', 'doc-paths']),
      );
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/CLAUDE\.md:\d+ names `docs\/architecture-v2\.md`, which does not resolve/);
    },
    SLOW,
  );

  it('the ops and nestjs examples name the files their repository has — the ones init detected', () => {
    // They named `caddy/Caddyfile.${mode}`, `.github/workflows/ci.yml` and
    // `config/env.schema.json`, none of which these repositories have.
    const up = repoFile('ops', '.specwarden/checks/ops/upstreams-resolve.check.mjs.example');
    expect(up).toContain("fileFor: () => 'deploy/nginx/upstreams.conf'");
    expect(existsSync(repoPath('ops', 'deploy/nginx/upstreams.conf'))).toBe(true);
    // …and says plainly that the check reads Caddy, not nginx.
    expect(up).toContain("not nginx's: over this file it finds no upstream and fails");

    expect(repoFile('ops', '.specwarden/checks/harness/gate-coverage.check.mjs.example')).toContain(
      "workflow: '.github/workflows/deploy.yml'",
    );
    expect(existsSync(repoPath('ops', '.github/workflows/deploy.yml'))).toBe(true);

    for (const slug of ['ops', 'nestjs'] as const) {
      const env = repoFile(slug, '.specwarden/checks/ops/env-files-agree.check.mjs.example');
      expect(env).not.toContain('config/env.schema.json');
      expect(env).toContain("read('.env.example')");
      expect(existsSync(repoPath(slug, '.env.example'))).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('switching an example on', () => {
  it(
    'docs-only doc-placement: its header names rules.mjs — renamed alone it is green on the rule the module implies',
    () => {
      // The prose never mentioned rules.mjs, and renamed alone it went red on orphan-check.
      // Its rule now waits, commented out, beside the others; a module check carries an
      // implied rule of its own meanwhile, so the rename alone is no longer red.
      const example = 'docs/doc-placement.check.mjs.example';
      expect(repoFile('docs-only', `.specwarden/checks/${example}`)).toContain(
        'rename to doc-placement.check.mjs AND uncomment its rule in rules.mjs',
      );
      const r = inScratchRepository('docs-only', { edits: activate('docs-only', example) }, ({ warden }) =>
        warden(['check', '--all']),
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/✅ doc-placement/);
      expect(r.stdout).toMatch(/✅ orphan-check/);
    },
    SLOW,
  );

  it(
    'nestjs migrations example: an engine factory implies no rule — renamed alone orphan-check is red, uncommented it is green',
    () => {
      // Why the second step is there: `fromResult` carries no rule of its own.
      const example = 'backend/migrations-backwards-compatible.check.mjs.example';
      const r = inScratchRepository('nestjs', { edits: activate('nestjs', example) }, ({ warden }) =>
        warden(['check', '--all']),
      );
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('1 check(s) enforce no declared rule: migrations-backwards-compatible');
      const both = inScratchRepository(
        'nestjs',
        { edits: { ...activate('nestjs', example), ...uncomment('nestjs', 'migrations-backwards-compatible') } },
        ({ warden }) => warden(['check', '--all']),
      );
      expect(both.status).toBe(0);
      expect(both.stdout).toContain('✓ migrations-backwards-compatible — 1 migration files examined, clean');
    },
    SLOW,
  );

  it(
    'docs-only doc-placement: renamed AND its rule uncommented, the example as written is green over the handbook',
    () => {
      const r = inScratchRepository(
        'docs-only',
        {
          edits: {
            ...activate('docs-only', 'docs/doc-placement.check.mjs.example'),
            ...uncomment('docs-only', 'doc-placement'),
          },
        },
        ({ warden }) => warden(['check', '--all']),
      );
      expect(r.status).toBe(0);
    },
    SLOW,
  );

  it(
    'a rule declared by hand for a renamed example is green too — the commented one is a convenience, not a gate',
    () => {
      const r = inScratchRepository(
        'docs-only',
        {
          edits: {
            ...activate('docs-only', 'docs/doc-placement.check.mjs.example'),
            ...withRule('docs-only', 'documents-sit-where-their-kind-lives', 'doc-placement'),
          },
        },
        ({ warden }) => warden(['check', '--all']),
      );
      expect(r.status).toBe(0);
    },
    SLOW,
  );

  it(
    'node-ts doc-symbols, renamed as shipped: it loads and checks the suffixes it names — REPLACE marked on them',
    () => {
      // It shipped `suffixes: []`, which looked for nothing (the prose said "EMPTY MEANS
      // INERT"), and is now refused at load. The example ships a guess, labelled as one.
      const example = repoFile('node-ts', '.specwarden/checks/docs/doc-symbols.check.mjs.example');
      expect(example).toContain("// REPLACE: the endings of this repository's own class names.");
      expect(example).not.toMatch(/inert|suffixes: \[\]/i);
      const r = inScratchRepository(
        'node-ts',
        {
          edits: {
            ...activate('node-ts', 'docs/doc-symbols.check.mjs.example'),
            ...uncomment('node-ts', 'doc-symbols'),
          },
        },
        ({ warden }) => warden(['check', '--id', 'doc-symbols']),
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('✅ doc-symbols');
    },
    SLOW,
  );

  it(
    'node-ts doc-symbols: filled in as the prose asks, it catches a renamed class named in the README',
    () => {
      const body = planted(
        repoFile('node-ts', '.specwarden/checks/docs/doc-symbols.check.mjs.example'),
        "suffixes: ['Service', 'Repository', 'Controller', 'Error'],",
        "suffixes: ['Error'],",
      );
      const readme = `${repoFile('node-ts', 'README.md')}\nA title with nothing in it throws \`SlugifyError\`.\n`;
      const r = inScratchRepository(
        'node-ts',
        {
          edits: {
            ...activate('node-ts', 'docs/doc-symbols.check.mjs.example', body),
            ...withRule('node-ts', 'docs-name-real-symbols', 'doc-symbols'),
            'README.md': readme,
          },
        },
        ({ warden }) => warden(['check', '--id', 'doc-symbols']),
      );
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('SlugifyError');
    },
    SLOW,
  );

  it(
    'docs-only doc-counts, renamed as shipped, loads and looks for the nouns it names — a guess, marked REPLACE',
    () => {
      // It shipped `countableNouns: []` and reported "no restated counts" having looked for
      // none; an empty list is a load error now, so the example names three nouns to replace.
      expect(repoFile('docs-only', '.specwarden/checks/docs/doc-counts.check.mjs.example')).toContain(
        "// REPLACE: the nouns whose \"how many\" lives in the repository rather than in prose.\n  countableNouns: ['services', 'packages', 'modules'],",
      );
      const r = inScratchRepository(
        'docs-only',
        {
          edits: {
            ...activate('docs-only', 'docs/doc-counts.check.mjs.example'),
            ...uncomment('docs-only', 'doc-counts'),
          },
        },
        ({ warden }) => warden(['check', '--id', 'doc-counts']),
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/✓ \d+ document\(s\), no restated counts/);
    },
    SLOW,
  );

  it(
    'nestjs migrations example: over no migrations it FAILS its corpus floor, naming where it looked',
    () => {
      // Its comment said an empty corpus was "never passed over", while it printed a count
      // and went green. It declares `corpus: { atLeast: 1 }` now.
      const example = 'backend/migrations-backwards-compatible.check.mjs.example';
      expect(repoFile('nestjs', `.specwarden/checks/${example}`)).toContain('corpus: { atLeast: 1,');
      const r = inScratchRepository(
        'nestjs',
        { edits: { ...activate('nestjs', example), migrations: null } },
        ({ warden }) => warden(['check', '--id', 'migrations-backwards-compatible']),
      );
      expect(r.status).toBe(1);
      expect(r.stdout).toContain(
        'examined 0 migration files, below the declared floor of 1. no .sql file under migrations/',
      );
    },
    SLOW,
  );

  it(
    'ops env-files-agree, renamed as shipped: the empty `verifierService` is refused by name',
    () => {
      // The finding named a service called ``.
      const r = inScratchRepository(
        'ops',
        { edits: activate('ops', 'ops/env-files-agree.check.mjs.example') },
        ({ warden }) => warden(['check', '--id', 'env-files-agree']),
      );
      expect(r.status).toBe(1);
      expect(r.stdout).toContain(
        '`verifierService` is not set — name the compose service that VERIFIES a key another service sends.',
      );
      expect(r.stdout).not.toContain('service ``');
    },
    SLOW,
  );

  it(
    'ops gate-coverage, renamed as shipped, reads the workflow init found — and fails on it loudly, the right direction',
    () => {
      // It read `.github/workflows/ci.yml`, which this repository does not have.
      const r = inScratchRepository(
        'ops',
        { edits: activate('ops', 'harness/gate-coverage.check.mjs.example') },
        ({ warden }) => warden(['check', '--id', 'gate-coverage']),
      );
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('.github/workflows/deploy.yml names no gate this scanner can see.');
    },
    SLOW,
  );

  it(
    'ops upstreams-resolve, renamed as shipped, reads the nginx config init found and says it cannot see into it',
    () => {
      const r = inScratchRepository(
        'ops',
        { edits: activate('ops', 'ops/upstreams-resolve.check.mjs.example') },
        ({ warden }) => warden(['check', '--id', 'upstreams-resolve']),
      );
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('deploy/nginx/upstreams.conf has no reverse_proxy upstream this check can see.');
    },
    SLOW,
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the week after', () => {
  describe('a folder the checks point at is renamed', () => {
    it(
      'node-ts: doc-paths names the moved file and says what usually happened',
      () => {
        const r = inScratchRepository(
          'node-ts',
          { edits: { 'src/slugify.ts': null, 'src/slug.ts': repoFile('node-ts', 'src/slugify.ts') } },
          ({ warden }) => warden(['check', '--id', 'doc-paths']),
        );
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/README\.md:\d+ names `src\/slugify\.ts`, which does not resolve/);
      },
      SLOW,
    );

    it(
      'nestjs: the plugin over a modulesRoot that matches nothing fails its corpus floor, and says to move the pathspec',
      () => {
        const moved: Record<string, string | null> = {};
        for (const rel of [
          'invoices.service.ts',
          'invoices.controller.ts',
          'invoices.module.ts',
          'invoice-total.ts',
          'entities/invoice.entity.ts',
          'repositories/invoices.repository.ts',
        ]) {
          moved[`src/modules/invoices/${rel}`] = null;
          moved[`src/features/invoices/${rel}`] = repoFile('nestjs', `src/modules/invoices/${rel}`);
        }
        const r = inScratchRepository('nestjs', { edits: moved }, ({ warden }) =>
          warden(['check', '--id', 'nestjs/db-access-through-repositories']),
        );
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('`src/modules/**` matched nothing to scan');
        expect(r.stdout).toContain('Point the pathspec at where the files are');
        // The hint printed under it is the one for a real violation, not for an empty corpus.
        expect(r.stdout).toContain('Move the query behind a repository');
      },
      SLOW,
    );

    it(
      'ops: shell-local-scope over scripts moved to bin/ says it examined nothing',
      () => {
        const r = inScratchRepository(
          'ops',
          {
            edits: {
              'scripts/backup.sh': null,
              'scripts/deploy.sh': null,
              'bin/backup.sh': repoFile('ops', 'scripts/backup.sh'),
              'bin/deploy.sh': repoFile('ops', 'scripts/deploy.sh'),
            },
          },
          ({ warden }) => warden(['check', '--all']),
        );
        expect(r.status).toBe(1);
        expect(r.stdout).toContain(
          'no shell files matched scripts/**/*.sh, deploy/**/*.sh, *.sh — this check examined nothing',
        );
        expect(r.stdout).toMatch(/docs\/runbooks\/restore-a-backup\.md:\d+ names `scripts\/backup\.sh`/);
      },
      SLOW,
    );

    it(
      'docs-only: a docs/ renamed to handbook/ is still read, and every path and link the README kept is red',
      () => {
        // Over `docs/**/*.md` both checks refused the emptied corpus; over every tracked
        // document the README is read, and it still points into docs/.
        const edits: Record<string, string | null> = { docs: null };
        for (const rel of [
          'runbooks/README.md',
          'runbooks/restart-the-queue.md',
          'runbooks/rotate-a-credential.md',
          'onboarding/first-week.md',
          'decisions/0001-handbook-lives-in-git.md',
        ])
          edits[`handbook/${rel}`] = repoFile('docs-only', `docs/${rel}`);
        const r = inScratchRepository('docs-only', { edits }, ({ warden }) => warden(['check', '--all']));
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('❌ doc-paths');
        expect(r.stdout).toContain('❌ doc-hygiene');
        expect(r.stdout).toMatch(
          /README\.md:\d+ names `docs\/runbooks\/restart-the-queue\.md`, which does not resolve/,
        );
        expect(r.stdout).toMatch(/README\.md:\d+ links to `\.\/docs\/runbooks\/README\.md`, which does not exist/);
      },
      SLOW,
    );

    it(
      'agentic: agent-definitions over a roster moved out of .claude/agents is red, naming the folder',
      () => {
        // It was GREEN — "nothing to verify": a missing roster is the exact silence this
        // product names.
        const edits: Record<string, string | null> = { '.claude/agents': null };
        for (const role of ['lead', 'reviewer', 'scout'])
          edits[`.claude/roles/${role}.md`] = repoFile('agentic', `.claude/agents/${role}.md`);
        const r = inScratchRepository('agentic', { ...setupFor('agentic'), edits }, ({ warden }) =>
          warden(['check', '--id', 'agent-definitions']),
        );
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('.claude/agents does not exist — this check examined nothing');
        expect(r.stdout).toContain('Point `agentsDir` at the folder the agent definitions live in.');
      },
      SLOW,
    );

    it(
      'agentic: plan-shape and plan-staleness over plans moved out of docs/_plans are both red, naming the folder',
      () => {
        // Both were GREEN — "nothing to verify": a renamed plans folder switched off both
        // plan checks without a single line of red.
        const r = inScratchRepository(
          'agentic',
          {
            ...setupFor('agentic'),
            edits: {
              'docs/_plans': null,
              'docs/plans/README.md': repoFile('agentic', 'docs/_plans/README.md'),
              'docs/plans/burst-allowance.md': repoFile('agentic', PLAN),
            },
          },
          ({ warden }) => warden(['check', '--all']),
        );
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('❌ plan-shape');
        expect(r.stdout).toContain('❌ plan-staleness');
        expect(r.stdout).toContain('docs/_plans does not exist — this check examined nothing');
        // …and the routers that send an agent to the old folder are red on doc-paths.
        expect(r.stdout).toMatch(/CLAUDE\.md:\d+ names `docs\/_plans\/README\.md`, which does not resolve/);
      },
      SLOW,
    );
  });

  describe('a second check, written by hand beside the generated ones', () => {
    const HAND = `import { defineCheck, readTracked } from 'specwarden';

export const check = defineCheck({
  id: 'no-console',
  title: 'the library never prints',
  tier: 'fast',
  corpus: { atLeast: 1, why: 'src/ held no TypeScript' },
  run: (ctx) => {
    const files = readTracked(ctx.vcs, ctx.files, 'src/**/*.ts');
    return {
      findings: files.filter((f) => f.text.includes('console.log')).map((f) => ({ severity: 'error', file: f.file, message: f.file + ' prints' })),
      examined: files.length,
      unit: 'files',
    };
  },
});
`;

    it(
      'copied from a neighbour, it is discovered with no registration — and red on orphan-check until it names a rule',
      () => {
        const r = inScratchRepository(
          'node-ts',
          { edits: { '.specwarden/checks/hygiene/no-console.check.mjs': HAND } },
          ({ warden }) => warden(['check', '--all']),
        );
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('✓ no-console — 2 files examined, clean');
        expect(r.stdout).toContain('1 check(s) enforce no declared rule: no-console');
      },
      SLOW,
    );

    it(
      'with `rule` declared on the check itself, it is green and the register is untouched',
      () => {
        const withOwnRule = planted(
          HAND,
          "tier: 'fast',",
          "tier: 'fast',\n  rule: { statement: 'a library does not print', owner: 'README.md' },",
        );
        const r = inScratchRepository(
          'node-ts',
          { edits: { '.specwarden/checks/hygiene/no-console.check.mjs': withOwnRule } },
          ({ warden }) => warden(['check', '--all']),
        );
        // The same shape every check init wrote here has: its rule on the check, owned by a file.
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('✓ no-console — 2 files examined, clean');
        expect(r.stdout).toContain('✅ orphan-check');
      },
      SLOW,
    );

    it('checks/README shows adding a check WITH its rule — the field whose absence turns the run red', () => {
      // It showed how to add a check, and never that it must name a rule.
      const readme = repoFile('node-ts', '.specwarden/checks/README.md');
      expect(readme).toContain('## Adding a check');
      const example = /```js\n([\s\S]*?)```/.exec(readme)?.[1] ?? '';
      expect(example).toContain("rule: 'Nothing merges while the linter is red.'");
      expect(readme).toContain('with no rule the run is red on orphan-check');
    });

    it(
      '`specwarden new` scaffolds plain JavaScript that loads, and is red until its condition is written',
      () => {
        // It held TypeScript (`as const`) in a .mjs, and the next run died on a SyntaxError.
        const run = inScratchRepository('node-ts', {}, ({ dir, warden }) => {
          const scaffold = warden(['new', 'doc-owner', '--family', 'hygiene']);
          const file = join(dir, '.specwarden', 'checks', 'hygiene', 'doc-owner.check.mjs');
          return { scaffold, body: readFileSync(file, 'utf8'), check: warden(['check', '--all']) };
        });
        expect(run.scaffold.status).toBe(0);
        expect(run.body).not.toContain('as const');
        expect(run.check.status).toBe(1);
        expect(run.check.stderr).not.toContain('SyntaxError');
        expect(run.check.stdout).toContain('the condition of doc-owner is not written yet');
        expect(run.check.stdout).toContain('gate(s) FAILED');
      },
      SLOW,
    );

    it(
      '`new` writes <family>/<id>.check.mjs — the layout checks/README describes',
      () => {
        // It wrote a folder per check, <family>/<id>/<id>.check.mjs, beside a README naming the other.
        const readme = repoFile('node-ts', '.specwarden/checks/README.md');
        expect(readme).toContain('Create `<family>/<id>.check.mjs`');
        const out = inScratchRepository(
          'node-ts',
          {},
          ({ warden }) => warden(['new', 'doc-owner', '--family', 'hygiene']).stdout,
        );
        expect(out).toContain('wrote .specwarden/checks/hygiene/doc-owner.check.mjs\n');
      },
      SLOW,
    );
  });

  it(
    "the template package uninstalled, the tree still runs — the files are the repository's own",
    () => {
      const r = inScratchRepository('node-ts', {}, ({ dir, warden }) => {
        const link = join(dir, 'node_modules', '@specwarden', 'template-node-ts');
        try {
          unlinkSync(link);
        } catch {
          rmdirSync(link); // a junction, on Windows
        }
        return { gone: !existsSync(link), run: warden(['check', '--all']) };
      });
      expect(r.gone).toBe(true);
      expect(r.run.status).toBe(0);
    },
    SLOW,
  );

  describe('specwarden migrate', () => {
    const cfg = () => repoFile('node-ts', '.specwarden/warden.config.mjs');

    it(
      'with `version` absent, says the config is current',
      () => {
        const r = inScratchRepository('node-ts', {}, ({ warden }) => warden(['migrate']));
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('config is at version 1, the current version — nothing to migrate.');
      },
      SLOW,
    );

    it(
      'with an OLDER version no engine ever spoke, migrate refuses with exit 2 and names the fix',
      () => {
        // It exited 0 having done nothing — a migration that did not happen, reading as done.
        const r = inScratchRepository(
          'node-ts',
          {
            edits: { '.specwarden/warden.config.mjs': planted(cfg(), 'defineConfig({', 'defineConfig({ version: 0,') },
          },
          ({ warden }) => [warden(['migrate']), warden(['check', '--list'])],
        );
        expect(r[0].status).toBe(2);
        expect(r[0].stderr).toContain('config declares version 0, which no engine ever spoke');
        expect(r[0].stderr).toContain('Set `version: 1`, or remove the key.');
        expect(r[1].status).toBe(0);
      },
      SLOW,
    );

    it(
      'with a NEWER version, migrate and check both refuse with exit 2 and name the fix',
      () => {
        const r = inScratchRepository(
          'node-ts',
          {
            edits: { '.specwarden/warden.config.mjs': planted(cfg(), 'defineConfig({', 'defineConfig({ version: 2,') },
          },
          ({ warden }) => [warden(['migrate']), warden(['check', '--all'])],
        );
        expect(r[0].status).toBe(2);
        expect(r[0].stderr).toContain('newer than this engine (v1). Upgrade specwarden.');
        expect(r[1].status).toBe(2);
        expect(r[1].stderr).toContain('Upgrade specwarden, or pin the config to v1.');
      },
      SLOW,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the agent surface — what every shipped SKILL.md tells an agent', () => {
  const SKILLS: Record<string, string> = {
    core: 'core/skills/specwarden',
    agents: 'modules/agents/skills/specwarden-agents',
    docs: 'modules/docs/skills/specwarden-docs',
    openspec: 'modules/openspec/skills/specwarden-openspec',
    ops: 'modules/ops/skills/specwarden-ops',
    plans: 'modules/plans/skills/specwarden-plans',
    security: 'modules/security/skills/specwarden-security',
    speckit: 'modules/speckit/skills/specwarden-speckit',
    nestjs: 'plugins/nestjs/skills/specwarden-nestjs',
  };
  const skill = (k: string) => readFileSync(join(ROOT, SKILLS[k], 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

  it(
    'every `specwarden <command>` and every flag on such a line is one the CLI knows',
    () => {
      const help = inScratchRepository('node-ts', {}, ({ warden }) => said(warden(['--help'])));
      const flags = readFileSync(join(ROOT, 'core/src/runtime/cli/_shared/parse-args/parse-args.util.ts'), 'utf8');
      const unknown: string[] = [];
      for (const k of Object.keys(SKILLS)) {
        for (const line of skill(k)
          .split('\n')
          .filter((l) => /^\s*(npx )?specwarden [a-z]/.test(l))) {
          const command = /specwarden ([a-z-]+)/.exec(line)![1];
          if (!help.includes(`  ${command} `)) unknown.push(`${k}: ${command}`);
          for (const flag of line.match(/--[a-z][a-z-]*/g) ?? [])
            if (!flags.includes(`'${flag}'`)) unknown.push(`${k}: ${flag}`);
        }
      }
      expect(unknown).toEqual([]);
    },
    SLOW,
  );

  it('every name the core skill imports from `specwarden` is exported by it', async () => {
    const engine = (await import('specwarden')) as Record<string, unknown>;
    const names = [...skill('core').matchAll(/import \{([^}]+)\} from 'specwarden'/g)].flatMap((m) =>
      m[1].split(',').map((s) => s.trim()),
    );
    names.push(
      'forbidImport',
      'forbidPattern',
      'mustDeclare',
      'pathContract',
      'siblingRequired',
      'referencesResolve',
      'regenerable',
      'sourcesAgree',
      'fromResult',
      'commandCheck',
    );
    expect(names.filter((n) => typeof engine[n] !== 'function')).toEqual([]);
  });

  /** The first ```js block of a skill that calls `factory(`, as an agent would paste it. */
  const snippet = (k: string, factory: string) =>
    [...skill(k).matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]).find((b) => b.includes(`${factory}(`)) ?? '';

  it(
    'specwarden-agents: its snippet names `agentsDir`, and pasted over the agentic roster it is green',
    () => {
      // It passed `agents:`, which the factory does not have, and the check crashed on
      // "The path argument must be of type string".
      const body = snippet('agents', 'agentDefinitions');
      expect(body).toContain("agentsDir: '.claude/agents',");
      expect(body).not.toMatch(/\bagents: /);
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { '.specwarden/checks/agents/agent-definitions.check.mjs': body } },
        ({ warden }) => warden(['check', '--id', 'agent-definitions']),
      );
      expect(r.status).toBe(0);
    },
    SLOW,
  );

  it(
    'specwarden-plans: its snippet passes the options planShape has, and pasted over the agentic plans it is green',
    () => {
      // It passed `plans:` and `statuses:`, neither of which exists, and the check crashed.
      const body = snippet('plans', 'planShape');
      expect(body).toContain("plansDir: 'docs/_plans',");
      expect(body).not.toMatch(/\b(plans|statuses): /);
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { '.specwarden/checks/plans/plan-shape.check.mjs': body } },
        ({ warden }) => warden(['check', '--id', 'plan-shape']),
      );
      expect(r.status).toBe(0);
    },
    SLOW,
  );

  it(
    'specwarden-docs: its snippet skips a tree with `skipDirs`, the option docPaths reads — the skipped tree is not read',
    () => {
      // It passed `skipped:`, which docPaths dropped without a word, so the tree was still read.
      const body = snippet('docs', 'docPaths');
      expect(body).toContain("skipDirs: ['docs/_archive/'],");
      expect(body).not.toContain('skipped:');
      const archive = 'docs/_plans-archive/2026-06-tenant-limits.md';
      const r = inScratchRepository(
        'agentic',
        {
          ...setupFor('agentic'),
          edits: {
            '.specwarden/checks/docs/doc-paths.check.mjs': planted(body, 'docs/_archive/', 'docs/_plans-archive/'),
            [archive]: `${repoFile('agentic', archive)}\nIt lived in \`src/limits/window.ts\`.\n`,
          },
        },
        ({ warden }) => warden(['check', '--id', 'doc-paths']),
      );
      expect(r.status).toBe(0);
      expect(r.stdout).not.toContain('src/limits/window.ts');
    },
    SLOW,
  );

  it('specwarden-ops: its snippet names `arbiterJob`, the option the factory has, and the defaults it may omit', () => {
    // It named `arbiter:` and omitted four options that were required then.
    const text = skill('ops');
    expect(snippet('ops', 'gatesHaveCiJobs')).toContain("arbiterJob: 'ci-ok',");
    expect(text).not.toContain("arbiter: 'ci-ok',");
    expect(text).toMatch(/`ciTier` defaults to `heavy`, `cheapTier` to `fast`, and `runnerPattern`/);
    const dts = readFileSync(join(ROOT, 'modules/ops/dist/index.d.ts'), 'utf8');
    expect(dts).toContain('readonly arbiterJob: string;');
    expect(dts).not.toMatch(/readonly arbiter\??:/);
  });

  it('specwarden-ops and the example the templates ship give one account of what the verifier must hold', () => {
    // The skill said envFilesAgree "compares KEYS, never values"; the example said a pair
    // "must hold the same value". Both now say the verifier must hold the key the sender has.
    expect(skill('ops')).not.toContain('compares KEYS, never values');
    expect(skill('ops')).toContain('must be present and non-empty\nin the verifier');
    const example = repoFile('ops', '.specwarden/checks/ops/env-files-agree.check.mjs.example');
    expect(example).not.toContain('must hold the same value');
    expect(example).toMatch(/VERIFIES a key another sends \(it must hold\n\/\/ that key too\)/);
  });

  it('specwarden-security: the allowlist entry carries `why`, and the entry type has it', () => {
    // The snippet carried `why`, which ISecretAllowEntry did not have: accepted and
    // discarded in a .mjs, a compile error in TypeScript.
    expect(skill('security')).toContain("why: 'the document IS the pattern list'");
    const dts = readFileSync(join(ROOT, 'modules/security/dist/index.d.ts'), 'utf8');
    const entry = /interface ISecretAllowEntry \{[\s\S]*?\n\}/.exec(dts)![0];
    expect(entry).toContain('readonly why?: string;');
  });

  it(
    '[friction] specwarden-nestjs wires the plugin in `plugins:`; the nestjs template exports its checks from a check file — both register',
    () => {
      // Should be: one way named as THE way in both, with the other a footnote.
      expect(skill('nestjs')).toContain('plugins: [');
      expect(repoFile('nestjs', '.specwarden/checks/backend/nestjs-conventions.check.mjs')).toContain(
        'export const checks = plugin.checks;',
      );
      const cfg = planted(
        planted(
          repoFile('nestjs', '.specwarden/warden.config.mjs'),
          "import { rules } from './rules.mjs';",
          "import { rules } from './rules.mjs';\nimport { nestjs } from '@specwarden/plugin-nestjs';",
        ),
        '  rules,\n',
        "  rules,\n  plugins: [nestjs({ modulesRoot: 'src/modules', ormPackage: 'typeorm', allowedFrom: ['**/repositories/**', '**/*.entity.ts'], ratchet: 0 })],\n",
      );
      const list = inScratchRepository(
        'nestjs',
        {
          edits: {
            '.specwarden/checks/backend/nestjs-conventions.check.mjs': null,
            '.specwarden/warden.config.mjs': cfg,
          },
        },
        ({ warden }) => warden(['check', '--list']).stdout,
      );
      expect(list).toContain('nestjs/db-access-through-repositories');
    },
    SLOW,
  );

  it('the core skill covers the perimeter, enforcement-resolves, and switching an `.example` on', () => {
    // It mentioned none of them — the three things an agent in a scaffolded repository meets
    // that no check file explains: the hook that just refused it, the red gate after renaming
    // a perimeter rule, and the red orphan-check after an activation.
    const text = skill('core');
    for (const heading of ['## The perimeter: what an assistant may not do', '## A check a template left switched off'])
      expect(text).toContain(heading);
    expect(text).toContain('`enforcement-resolves` walks the other way');
    expect(text).toContain('uncomment its rule in `rules.mjs`');
    expect(text).toContain('hooks.PreToolUse');
    for (const kept of ['orphan-check', '--tighten', 'corpus']) expect(text).toContain(kept);
  });

  it('every reference.md beside a skill is its GUIDE.md verbatim, under a generated-from header', () => {
    const drift: string[] = [];
    for (const dir of Object.values(SKILLS)) {
      const pkg = dir.split('/skills/')[0];
      const guide = readFileSync(join(ROOT, pkg, 'GUIDE.md'), 'utf8').replace(/\r\n/g, '\n');
      const ref = readFileSync(join(ROOT, dir, 'reference.md'), 'utf8').replace(/\r\n/g, '\n');
      const header = `<!-- GENERATED from ${pkg}/GUIDE.md. Edit the guide. -->\n\n`;
      // A relative link is rewritten to an absolute one, so it survives being installed.
      const body = ref.startsWith(header)
        ? ref
            .slice(header.length)
            .replace(/https:\/\/github\.com\/specwarden\/specwarden\/blob\/main\/modules\//g, '../')
        : ref;
      if (body !== guide) drift.push(pkg);
    }
    expect(drift).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('the perimeter, wired as the agentic perimeter.mjs says', () => {
  const bash = (command: string) => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  const PAYLOADS: Record<string, string> = {
    'git push --force': bash('git push --force origin main'),
    'git push -f': bash('git push -f'),
    'a force-push chained after a harmless command': bash('git status && git push --force'),
    'git push --force-with-lease': bash('git push --force-with-lease origin main'),
    'git reset --hard': bash('git reset --hard HEAD~1'),
    'git rebase': bash('git rebase main'),
    'an ordinary push': bash('git push origin feat/burst-allowance'),
    'a Write to .specwarden/rules.mjs': JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '.specwarden/rules.mjs', content: 'x' },
    }),
    'malformed JSON': '{not json',
    'an empty payload': '',
    'a tool it does not know': JSON.stringify({ tool_name: 'Frobnicate', tool_input: { thing: 1 } }),
    'JSON null': 'null',
    'a Bash command that is not a string': JSON.stringify({ tool_name: 'Bash', tool_input: { command: 42 } }),
  };
  let answers: Record<string, { status: number | null; stdout: string; stderr: string }>;
  let wired: { status: number | null; stderr: string };
  let nested: number | null;
  let settingsWritten: boolean;
  beforeAll(() => {
    inScratchRepository('agentic', setupFor('agentic'), ({ dir, warden }) => {
      answers = Object.fromEntries(Object.entries(PAYLOADS).map(([k, v]) => [k, warden(['perimeter'], { input: v })]));
      // Exactly the command the comment says to put in .claude/settings.json.
      const hook = join(dir, 'node_modules', 'specwarden', 'bin', 'warden.mjs');
      const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
      const w = spawnSync(process.execPath, [hook, 'perimeter'], {
        cwd: dir,
        input: PAYLOADS['git push --force'],
        encoding: 'utf8',
        env,
      });
      wired = { status: w.status, stderr: w.stderr };
      nested = spawnSync(process.execPath, [hook, 'perimeter'], {
        cwd: join(dir, 'src', 'limits'),
        input: PAYLOADS['git push --force'],
        encoding: 'utf8',
        env,
      }).status;
      settingsWritten = existsSync(join(dir, '.claude', 'settings.json'));
    });
  }, SLOW);

  it.each([
    ['git push --force', 2],
    ['git push -f', 2],
    ['a force-push chained after a harmless command', 2],
    ['git reset --hard', 2],
    ['git rebase', 2],
    ['an ordinary push', 0],
    ['a Write to .specwarden/rules.mjs', 0],
    ['malformed JSON', 0],
    ['an empty payload', 0],
    ['a tool it does not know', 0],
    ['JSON null', 0],
    ['a Bash command that is not a string', 0],
  ] as const)('%s → exit %i', (payload, code) => {
    expect(answers[payload].status).toBe(code);
    expect(answers[payload].stdout).toBe('');
    if (code === 0) expect(answers[payload].stderr).toBe('');
  });

  it('a block names the command, the rule id, and why — and tells the agent not to retry it verbatim', () => {
    const msg = answers['git push --force'].stderr;
    expect(msg).toContain('Blocked by the perimeter: git push --force origin main — rule no-force-push.');
    expect(msg).toContain('Push a new commit, or ask the owner.');
    expect(msg).toContain('do not retry it verbatim');
  });

  it('[friction] the block says "read the owner document" — and neither template rule names one', () => {
    // Should be: each shipped rule carrying `owner` (commandRule takes one), or the runtime
    // leaving that sentence out when the rule has no owner.
    expect(answers['git push --force'].stderr).toContain('Read the owner document and take the path it names');
    expect(answers['git push --force'].stderr).not.toContain(', owner ');
  });

  it('[friction] the history rule blocks every reset --hard and every rebase, local ones too, and names no alternative', () => {
    // Should be: scoped to what its id says (a SHARED branch — e.g. a push-tracked one),
    // with a `why` naming what to do instead, as the file's own header demands of every rule.
    const msg = answers['git reset --hard'].stderr;
    expect(msg).toContain('git reset --hard HEAD~1 — rule no-history-rewrite-of-a-shared-branch.');
    expect(msg).toContain('discards work that is not yours to discard.\n');
    expect(msg).not.toMatch(/instead|git revert|new branch/i);
  });

  it('[friction] `git push --force-with-lease` is let through — it rewrites the remote branch all the same', () => {
    // Should be: blocked by no-force-push, or the rule's `why` saying lease is the allowed form.
    expect(answers['git push --force-with-lease'].status).toBe(0);
  });

  it('the documented hook command blocks from the repository root and from a nested working directory', () => {
    expect(wired.status).toBe(2);
    expect(wired.stderr).toContain('no-force-push');
    expect(nested).toBe(2);
  });

  it(
    "init writes no .claude/settings.json — it is the assistant's file — and names the hook that switches the perimeter on",
    () => {
      // It said nothing about wiring the hook, and until then the perimeter enforces nothing.
      expect(settingsWritten).toBe(false);
      const out = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { '.specwarden': null } },
        ({ warden }) => warden(['init', '--template', 'agentic']).stdout,
      );
      expect(out).toContain('until a hook runs it, .specwarden/perimeter.mjs enforces nothing.');
      expect(out).toContain('in .claude/settings.json, a hooks.PreToolUse command running');
      expect(out).toContain('node "$CLAUDE_PROJECT_DIR/node_modules/specwarden/bin/warden.mjs" perimeter');
      expect(repoFile('agentic', '.specwarden/perimeter.mjs')).toContain('Nothing is enforced until the hook is wired');
    },
    SLOW,
  );

  it(
    'a custom commandRule is enforced the moment it is in perimeter.mjs — no registration',
    () => {
      const custom = planted(
        repoFile('agentic', '.specwarden/perimeter.mjs'),
        'export const rules = [\n',
        "export const rules = [\n  commandRule({ id: 'no-rm-rf', owner: 'docs/architecture.md', why: 'delete through git rm so the removal is in the diff.', match: (words) => (words[0] === 'rm' && words.includes('-rf') ? words.join(' ') : null) }),\n",
      );
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { '.specwarden/perimeter.mjs': custom } },
        ({ warden }) => [warden(['perimeter'], { input: bash('rm -rf build') }), warden(['check', '--all'])],
      );
      expect(r[0].status).toBe(2);
      expect(r[0].stderr).toContain('rm -rf build — rule no-rm-rf, owner docs/architecture.md. delete through git rm');
      // [friction] …and no audit notices it enforces no declared rule. A CHECK in that state
      // is red on orphan-check; a perimeter rule is not. Should be: the same audit for both.
      expect(r[1].status).toBe(0);
    },
    SLOW,
  );

  it(
    'a rule that throws is skipped, and the rules after it still block',
    () => {
      const throwing = planted(
        repoFile('agentic', '.specwarden/perimeter.mjs'),
        'export const rules = [\n',
        "export const rules = [\n  { id: 'boom', evaluate: () => { throw new Error('boom'); } },\n",
      );
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { '.specwarden/perimeter.mjs': throwing } },
        ({ warden }) => warden(['perimeter'], { input: bash('git push --force') }),
      );
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('rule no-force-push');
    },
    SLOW,
  );

  it(
    'renaming a perimeter rule without touching rules.mjs turns enforcement-resolves red, naming both',
    () => {
      const renamed = planted(
        repoFile('agentic', '.specwarden/perimeter.mjs'),
        "id: 'no-force-push'",
        "id: 'never-force-push'",
      );
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { '.specwarden/perimeter.mjs': renamed } },
        ({ warden }) => warden(['check', '--all']),
      );
      expect(r.status).toBe(1);
      expect(r.stdout).toContain(
        "rule 'no-irreversible-action-without-a-person' names enforcer 'no-force-push', which is not a registered check",
      );
    },
    SLOW,
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('plans, in the agentic repository', () => {
  const plan = () => repoFile('agentic', PLAN);
  const LOCAL = 'node node_modules/specwarden/bin/warden.mjs check --id doc-paths';
  const FENCE_1 = '```bash\nnpx specwarden check --id doc-paths\n```';
  const FENCE_2 = '```bash\nnpx specwarden check --id plan-shape\n```';
  /** The plan as `plan archive` accepts it: its harvest listed, and the archive header declared. */
  const archivable = () =>
    `${planted(
      plan(),
      '**Branch:** feat/burst-allowance',
      '**Started:** 2026-09-01\n**Finished:** 2026-09-20\n**Branch:** feat/burst-allowance\n**Harvested:** the burst-capacity decision → docs/architecture.md\n**Left open:** nothing',
    )}\n## Harvest\n\n- the burst-capacity decision → docs/architecture.md\n`;
  /** Both phases given a `**Acceptance:**` line too, the fences kept so plan-shape stays green. */
  const withAcceptance = (line: string) =>
    planted(planted(plan(), FENCE_1, `${line}\n\n${FENCE_1}`), FENCE_2, `${line}\n\n${FENCE_2}`);

  it(
    "`plan status` reads the template's own plan — green under plan-shape — with the same acceptance plan-shape reads",
    () => {
      // One acceptance convention now: `plan status` read the fenced command plan-shape
      // accepts as "(no acceptance)", so no plan satisfied both.
      const r = inScratchRepository('agentic', setupFor('agentic'), ({ warden }) => [
        warden(['check', '--id', 'plan-shape']),
        warden(['plan', 'status', PLAN]),
      ]);
      expect(r[0].status).toBe(0);
      expect(r[1].status).toBe(0);
      expect(r[1].stdout).toContain('• the bucket carries a burst capacity — npx specwarden check --id doc-paths');
      expect(r[1].stdout).not.toContain('(no acceptance)');
    },
    SLOW,
  );

  it(
    'with a bare `**Acceptance:**` line per phase, --verify runs each command and passes',
    () => {
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { [PLAN]: withAcceptance(`**Acceptance:** ${LOCAL}`) } },
        ({ warden }) => warden(['plan', 'status', PLAN, '--verify'], { timeoutSec: 200 }),
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(`✅ the bucket carries a burst capacity — ${LOCAL}`);
    },
    SLOW,
  );

  it(
    'the same command in backticks — how markdown writes a command — passes under --verify, the delimiters stripped',
    () => {
      // The shell read `…` as command substitution, so it failed, and printed nothing of why.
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { [PLAN]: withAcceptance(`**Acceptance:** \`${LOCAL}\``) } },
        ({ warden }) => warden(['plan', 'status', PLAN, '--verify'], { timeoutSec: 200 }),
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(`✅ the bucket carries a burst capacity — ${LOCAL}`);
    },
    SLOW,
  );

  it(
    'a plan marked `**Status:** done` is reported by `plan status` as done — one status vocabulary',
    () => {
      // It printed "status draft" and "declares no Status": the engine knew draft|active only.
      expect([...PLAN_STATUSES]).toEqual(['draft', 'active', 'done']);
      const done = planted(plan(), '**Status:** active', '**Status:** done');
      const r = inScratchRepository('agentic', { ...setupFor('agentic'), edits: { [PLAN]: done } }, ({ warden }) =>
        warden(['plan', 'status', PLAN]),
      );
      expect(r.stdout).toContain('(status done, branch feat/burst-allowance)');
      expect(r.stdout).not.toContain('declares no');
    },
    SLOW,
  );

  it(
    'plan-staleness reads a finished plan as done, and says to harvest and archive it',
    () => {
      // It called it "a draft yet declares branch" and failed. Done is the state a plan is in
      // while its harvest lands — the verdict is the archive step's, not this check's.
      const done = planted(plan(), '**Status:** active', '**Status:** done');
      const r = inScratchRepository('agentic', { ...setupFor('agentic'), edits: { [PLAN]: done } }, ({ warden }) =>
        warden(['check', '--id', 'plan-staleness']),
      );
      expect(r.status, r.stdout).toBe(0);
      expect(r.stdout).toContain('is done — harvest it, then move it to');
      expect(r.stdout).not.toContain('is a draft');
    },
    SLOW,
  );

  it(
    '`plan archive` refuses a plan with no Harvest section, and refuses "Harvested: yes"',
    () => {
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { 'docs/_plans/bare.md': `${plan()}\n## Harvest\n\nHarvested: yes\n` } },
        ({ warden }) => [warden(['plan', 'archive', PLAN]), warden(['plan', 'archive', 'docs/_plans/bare.md'])],
      );
      expect(r[0].status).toBe(2);
      expect(r[0].stderr).toContain('no Harvest section — archiving requires declaring what moved and where.');
      expect(r[1].status).toBe(2);
      expect(r[1].stderr).toContain('"harvested: yes" is not accepted');
    },
    SLOW,
  );

  it(
    'with the harvest AND the archive header declared, it names the archive directory the plans module reads',
    () => {
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { [PLAN]: archivable() } },
        ({ warden }) => warden(['plan', 'archive', PLAN]),
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(`Move it: git mv ${PLAN} docs/_plans-archive/`);
      expect(repoFile('agentic', '.specwarden/checks/plans/plan-staleness.check.mjs')).toContain(
        "archiveDir: 'docs/_plans-archive'",
      );
    },
    SLOW,
  );

  it(
    '`plan archive` names the archive header before the move, and the plan moved with it is green',
    () => {
      // Following its advice literally turned check --all red on an archive header it never
      // mentioned; it checks the header now, and names the lines to add.
      const harvestOnly = `${plan()}\n## Harvest\n\n- the burst-capacity decision → docs/architecture.md\n`;
      const r = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { [PLAN]: harvestOnly } },
        ({ warden }) => warden(['plan', 'archive', PLAN]),
      );
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(
        'the archive header is missing **Started:**, **Finished:**, **Harvested:**, **Left open:**',
      );
      const moved = inScratchRepository(
        'agentic',
        { ...setupFor('agentic'), edits: { [PLAN]: null, 'docs/_plans-archive/burst-allowance.md': archivable() } },
        ({ warden }) => warden(['check', '--all']),
      );
      expect(moved.status).toBe(0);
    },
    SLOW,
  );
});
