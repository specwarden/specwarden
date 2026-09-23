import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { removeScratch, scratchTree, warden } from '../../scripts/playgrounds.mjs';

/**
 * Journey B — a consumer writes every kind of check as a file under `.specwarden/checks/`.
 *
 * One file per primitive, through the real CLI, over a scratch repository that has the
 * engine installed and nothing else: write the minimal file, plant the defect it exists
 * for, point it at nothing, misconfigure it the way a first-time author does, wire the
 * rule, share what repeats, test it with `runCheck` under `node --test`.
 *
 * Every assertion holds against the engine as it stands. Where that is not what a consumer
 * would want, the `it` starts with `[friction]` and a comment says what it should be; where
 * it is a defect, `[bug]`. A scene the plan has fixed drops its prefix and asserts the
 * corrected behaviour, with a comment saying what it used to do.
 */

const PLAYGROUND = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const MANIFEST = JSON.parse(readFileSync(join(PLAYGROUND, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
/** Every published package, from this playground's node_modules — what a consumer has. */
const INSTALLED = Object.keys(MANIFEST.dependencies).map(
  (name) => [name, join(PLAYGROUND, 'node_modules', ...name.split('/'))] as const,
);

/** The smallest config the engine accepts. No `rules` key, so the four rule audits stay off. */
const CONFIG = `import { defineConfig } from 'specwarden';\nexport default defineConfig({});\n`;

type IFinding = { severity: string; message: string; file?: string; line?: number };
type IRow = { id: string; ok: boolean; skipped: unknown; findings: readonly IFinding[] };
/** `rows` is the parsed `--json` output — empty when the run printed none (a load error). */
type IRun = { status: number | null; stdout: string; stderr: string; rows: readonly IRow[] };
type TTree = Record<string, string>;

const parse = (stdout: string): readonly IRow[] => {
  try {
    return (JSON.parse(stdout) as { results: IRow[] }).results;
  } catch {
    return [];
  }
};
/** Build the scratch repository, run the CLI once, tear it down. */
function cli(tree: TTree, args: readonly string[] = ['check', '--all', '--json']): IRun {
  const dir = scratchTree(tree, { installed: INSTALLED });
  try {
    const r = warden(dir, args);
    return { ...r, rows: parse(r.stdout) };
  } finally {
    removeScratch(dir);
  }
}
const row = (run: IRun, id: string): IRow => {
  const found = run.rows.find((r) => r.id === id);
  if (!found) throw new Error(`no result for '${id}' — exit ${run.status}\n${run.stdout}\n${run.stderr}`);
  return found;
};
const bySeverity = (severity: string) => (r: IRow) =>
  r.findings.filter((f) => f.severity === severity).map((f) => f.message);
const errors = bySeverity('error');
const infos = bySeverity('info');
const firstError = (r: IRow): IFinding => r.findings.find((f) => f.severity === 'error') as IFinding;
const failed = (run: IRun): string[] => run.rows.filter((r) => !r.ok).map((r) => r.id);
const ids = (run: IRun) => [run.status, run.rows.map((r) => r.id)];
/** Rows of a table written as text: one per line, cells split on ` ¦ `. */
const table = (text: string): string[][] =>
  text
    .trim()
    .split('\n')
    .map((line) => line.split(' ¦ ').map((cell) => cell.trim()));

/** A tree with one check file, `x.check.mjs`, and a config. */
const withCheck = (file: string, tree: TTree = {}, config = CONFIG): TTree => ({
  '.specwarden/warden.config.mjs': config,
  '.specwarden/checks/x.check.mjs': file,
  ...tree,
});
/** A check file calling `factory` with id `x` and the identity every factory's type asks for. */
const make = (factory: string, options: string): string =>
  `import { ${factory} } from 'specwarden';\n` +
  `export const check = ${factory}({ id: 'x', title: 't', tier: 'fast', ${options} });\n`;

/** A small tree the misconfiguration scenes run over. */
const TREE: TTree = {
  'src/a.ts': "import { x } from './b';\nexport const a = x; // TODO\n",
  'src/b.ts': 'export const x = 1; // TODO\n',
  'docs/guide.md': 'Owner: me\n',
};
/** Check `x`'s result from one run of `file` over `tree`. */
const x = (file: string, tree: TTree = TREE, args?: readonly string[]): IRow =>
  row(cli(withCheck(file, tree), args), 'x');

/**
 * The eleven minimal files, each over its own corpus so one tree carries all of them. The id
 * is the factory's name in kebab case. `id`, `title`, `tier` are what the types demand;
 * `rule` and `when` are left off — the engine accepts a check without either.
 */
const MINIMAL: Readonly<Record<string, string>> = {
  forbidImport: `import { forbidImport } from 'specwarden';
export const check = forbidImport({ id: 'forbid-import', title: 'no fs in fi/', tier: 'fast', from: 'fi/**/*.ts', to: 'node:fs' });`,
  forbidPattern: `import { forbidPattern } from 'specwarden';
export const check = forbidPattern({ id: 'forbid-pattern', title: 'no TODO in fp/', tier: 'fast', in: 'fp/**/*.ts', pattern: /TODO/ });`,
  pathContract: `import { pathContract } from 'specwarden';
export const check = pathContract({ id: 'path-contract', title: 'contracts in pc/', tier: 'fast', kind: '**/*.contract.md', allowedIn: ['pc/**'] });`,
  siblingRequired: `import { siblingRequired } from 'specwarden';
export const check = siblingRequired({ id: 'sibling-required', title: 'a service has a spec', tier: 'fast', subjects: 'sr/*.service.ts', require: '{name}.spec.ts' });`,
  mustDeclare: `import { mustDeclare } from 'specwarden';
export const check = mustDeclare({ id: 'must-declare', title: 'md/ names an owner', tier: 'fast', files: 'md/**/*.md', fields: [{ name: 'Owner', pattern: /^Owner:/m }] });`,
  referencesResolve: `import { referencesResolve } from 'specwarden';
export const check = referencesResolve({ id: 'references-resolve', title: 'links resolve', tier: 'fast', in: 'rr/**/*.md', extract: /\\]\\(([^)]+)\\)/ });`,
  regenerable: `import { regenerable } from 'specwarden';
export const check = regenerable({ id: 'regenerable', title: 'rg/table.md is generated', tier: 'fast', artifact: 'rg/table.md', by: 'cat rg/source.txt' });`,
  sourcesAgree: `import { sourcesAgree } from 'specwarden';
const names = (file) => (ctx) => JSON.parse(ctx.files.tryRead(file) ?? '{"names":[]}').names;
export const check = sourcesAgree({ id: 'sources-agree', title: 'sa/a and sa/b agree', tier: 'fast', a: { name: 'sa/a.json', extract: names('sa/a.json') }, b: { name: 'sa/b.json', extract: names('sa/b.json') } });`,
  defineCheck: `import { defineCheck, readTracked } from 'specwarden';
export const check = defineCheck({
  id: 'define-check', title: 'dc/ names an owner', corpus: { atLeast: 1 },
  run: (ctx) => {
    const docs = readTracked(ctx.vcs, ctx.files, 'dc/**/*.md');
    return { findings: docs.filter((d) => !d.text.includes('Owner:')).map((d) => ({ severity: 'error', file: d.file, message: d.file + ' names no owner.' })), examined: docs.length, unit: 'documents' };
  },
});`,
  fromResult: `import { fromResult } from 'specwarden';
export const check = fromResult({
  id: 'from-result', title: 'fr/ names an owner',
  run: (ctx) => ({ errors: ctx.files.glob('fr/**/*.md').filter((f) => !ctx.files.read(f).includes('Owner:')).map((f) => f + ' names no owner.') }),
});`,
  commandCheck: `import { commandCheck } from 'specwarden';
export const check = commandCheck({ id: 'command-check', title: 'cc/ names an owner', tier: 'fast', cmd: 'grep -L "Owner:" cc/*.md | grep . && exit 1 || true' });`,
};
const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const IDS = Object.keys(MINIMAL).map(kebab);
const CHECK_FILES = Object.fromEntries(
  Object.entries(MINIMAL).map(([name, file]) => [`.specwarden/checks/${kebab(name)}.check.mjs`, `${file}\n`]),
);

/** The clean tree: every corpus present and satisfying its check. */
const CLEAN: TTree = {
  '.specwarden/warden.config.mjs': CONFIG,
  ...CHECK_FILES,
  'fi/a.ts': "import { x } from './b';\nexport const a = x;\n",
  'fi/b.ts': 'export const x = 1;\n',
  'fp/a.ts': 'export const a = 1;\n',
  'pc/a.contract.md': 'a contract\n',
  'sr/a.service.ts': 'export class A {}\n',
  'sr/a.service.spec.ts': 'test\n',
  'md/a.md': 'Owner: me\n',
  'rr/a.md': 'See [b](rr/b.md).\n',
  'rr/b.md': 'b\n',
  'rg/table.md': 'generated\n',
  'rg/source.txt': 'generated\n',
  'sa/a.json': '{"names":["x","y"]}\n',
  'sa/b.json': '{"names":["x","y"]}\n',
  'dc/a.md': 'Owner: me\n',
  'fr/a.md': 'Owner: me\n',
  'cc/a.md': 'Owner: me\n',
};
const NO_OWNER = 'nobody owns this\n';
/** One planted defect per check — the thing each one exists to catch. */
const BROKEN: TTree = {
  ...CLEAN,
  'fi/a.ts': "import { readFileSync } from 'node:fs';\nexport const a = readFileSync;\n",
  'fp/a.ts': 'export const a = 1; // TODO later\n',
  'stray/b.contract.md': 'a contract in the wrong place\n',
  'sr/b.service.ts': 'export class B {}\n',
  'md/a.md': NO_OWNER,
  'rr/a.md': 'See [gone](rr/gone.md).\n',
  'rg/table.md': 'hand-edited\n',
  'sa/b.json': '{"names":["x"]}\n',
  'dc/a.md': NO_OWNER,
  'fr/a.md': NO_OWNER,
  'cc/a.md': NO_OWNER,
};
/** Every corpus gone: the checks and the config, and not one file they are about. */
const EMPTY: TTree = { '.specwarden/warden.config.mjs': CONFIG, ...CHECK_FILES };

describe('journey B — a consumer writes every kind of check as a file under .specwarden/checks/', () => {
  let clean: IRun;
  let broken: IRun;
  let empty: IRun;
  beforeAll(() => {
    [clean, broken, empty] = [cli(CLEAN), cli(BROKEN), cli(EMPTY)];
  });

  describe('1. the minimal file', () => {
    it('loads all eleven from files, each discovered by name, and is green over the clean tree', () => {
      expect(clean.status).toBe(0);
      expect(clean.rows.map((r) => r.id).sort()).toEqual([...IDS, 'ratchet-direction'].sort());
      expect(clean.rows.filter((r) => !r.ok || r.skipped)).toEqual([]);
    });

    it('is two lines for eight of them; three for sourcesAgree, five for fromResult, eight for defineCheck', () => {
      const lines = Object.entries(MINIMAL).map(([name, file]) => `${name}:${file.split('\n').length}`);
      expect(lines.join(' ')).toBe(
        'forbidImport:2 forbidPattern:2 pathContract:2 siblingRequired:2 mustDeclare:2 referencesResolve:2 ' +
          'regenerable:2 sourcesAgree:3 defineCheck:8 fromResult:5 commandCheck:2',
      );
    });

    it('every primitive says what a clean pass examined, in one shape: `✓ <id> — N <unit> examined, clean`', () => {
      // Five passed saying nothing at all — pathContract, siblingRequired, mustDeclare,
      // regenerable, commandCheck — so a pass over nothing looked like any other pass.
      expect(infos(row(clean, 'forbid-import'))).toEqual(['✓ forbid-import — 2 file(s) examined, clean']);
      expect(infos(row(clean, 'sources-agree'))).toEqual(['✓ sources-agree — 2 name(s) examined, clean']);
      expect(infos(row(clean, 'define-check'))).toEqual(['✓ define-check — 1 documents examined, clean']);
      expect(infos(row(clean, 'path-contract'))).toEqual(['✓ path-contract — 1 file(s) examined, clean']);
      expect(infos(row(clean, 'sibling-required'))).toEqual(['✓ sibling-required — 1 file(s) examined, clean']);
      expect(infos(row(clean, 'must-declare'))).toEqual(['✓ must-declare — 1 file(s) examined, clean']);
      expect(infos(row(clean, 'regenerable'))).toEqual(['✓ regenerable — 1 artifact(s) examined, clean']);
      // No count to state, and the same frame: fromResult was `✓ from-result clean`.
      expect(infos(row(clean, 'from-result'))).toEqual(['✓ from-result — clean']);
      // A command's evidence is its own output; one that prints nothing still says nothing.
      expect(IDS.filter((id) => row(clean, id).findings.length === 0)).toEqual(['command-check']);
    });

    it('`title` and `tier` are defaults, not ceremony: the title is the id (or the rule), the tier `fast`', () => {
      // Without them a check listed as `undefined`, in no tier at all.
      const bare = `import { defineCheck } from 'specwarden';\nexport const check = defineCheck({ id: 'x', run: () => [] });\n`;
      expect(cli(withCheck(bare), ['check', '--list']).stdout).toMatch(/^x\tx\n/);
      const ruled = bare.replace("id: 'x',", "id: 'x', rule: 'x holds',");
      expect(cli(withCheck(ruled), ['check', '--list', '--tier', 'fast']).stdout).toMatch(/^x\tx holds\n/);
      expect(
        x(`import { commandCheck } from 'specwarden';\nexport const check = commandCheck({ id: 'x', cmd: 'true' });\n`)
          .ok,
      ).toBe(true);
    });

    it('the id is free of the file name: `not-x` in `x.check.mjs` is accepted without comment', () => {
      const file = make('forbidPattern', "in: 'src/**', pattern: /TODO/").replace("id: 'x'", "id: 'not-x'");
      expect(row(cli(withCheck(file, { 'src/a.ts': 'ok\n' })), 'not-x').ok).toBe(true);
    });

    it('a check with no `id`, exported alone, takes its file’s name', () => {
      // It was refused as a file that "exports no check" — it did export one.
      const run = cli(withCheck(make('forbidPattern', "in: 'src/**', pattern: /TODO/").replace("id: 'x', ", ''), TREE));
      expect(run.stderr).not.toContain('exports no check');
      expect(errors(row(run, 'x'))).toEqual([
        'forbidden pattern in src/a.ts: TODO',
        'forbidden pattern in src/b.ts: TODO',
      ]);
    });
  });

  describe('2. the defect it exists for', () => {
    it('turns every one of the eleven red over the broken tree, and nothing else', () => {
      expect(broken.status).toBe(1);
      expect(failed(broken).sort()).toEqual([...IDS].sort());
    });

    it.each([
      ['forbid-import', 'fi/a.ts imports `node:fs`, which is forbidden from fi/**/*.ts.'],
      ['forbid-pattern', 'forbidden pattern in fp/a.ts: TODO'],
      ['path-contract', 'stray/b.contract.md is of kind `**/*.contract.md` but lives outside its contract (pc/**).'],
      ['sibling-required', 'sr/b.service.ts requires a sibling sr/b.service.spec.ts, which is missing.'],
      ['must-declare', 'md/a.md does not declare `Owner`.'],
      ['references-resolve', 'rr/a.md references `rr/gone.md`, which does not resolve.'],
      [
        'regenerable',
        'rg/table.md does not match what `cat rg/source.txt` produces — it is generated; regenerate it rather than editing by hand.',
      ],
      ['sources-agree', '`y` is in sa/a.json but not sa/b.json.'],
      ['define-check', 'dc/a.md names no owner.'],
      ['from-result', 'fr/a.md names no owner.'],
      ['command-check', 'command-check exited 1 — grep -L "Owner:" cc/*.md | grep . && exit 1 || true'],
    ])('%s says: %s', (id, message) => {
      expect(errors(row(broken, id))).toEqual([message]);
    });

    it('the three scanners give a line; sourcesAgree names the file that lacks the name', () => {
      // sourcesAgree gave no file at all. fromResult's strings and a command's output are
      // prose the engine does not parse — a location guessed out of them would be a finding
      // pointing at the wrong line — so those two stay unlocated, deliberately.
      const where = (key: 'file' | 'line') => IDS.filter((id) => firstError(row(broken, id))[key] !== undefined);
      expect(where('line')).toEqual(['forbid-import', 'forbid-pattern', 'references-resolve']);
      expect(IDS.filter((id) => !where('file').includes(id))).toEqual(['from-result', 'command-check']);
      expect(firstError(row(broken, 'sources-agree')).file).toBe('sa/b.json');
    });

    it("commandCheck puts the command's own output first, as an info line", () => {
      expect(infos(row(broken, 'command-check'))).toEqual(['cc/a.md']);
    });

    it('the TTY reporter leads every finding with the file:line it carries', () => {
      // It printed the message and left the line to be found — now clickable in every terminal.
      const run = cli(withCheck(`${MINIMAL.forbidPattern}\n`, { 'fp/a.ts': '// TODO\n' }), ['check', '--all']);
      expect(run.stdout).toContain('fp/a.ts:1 forbidden pattern in fp/a.ts: TODO\n❌ forbid-pattern FAILED');
    });
  });

  describe('3. an empty corpus', () => {
    it.each([
      ['forbid-import', 'examined 0 file(s) — `fi/**/*.ts` matched nothing to scan — below the floor of 1. '],
      ['forbid-pattern', 'examined 0 file(s) — `fp/**/*.ts` matched nothing to scan — below the floor of 1. '],
      ['references-resolve', 'examined 0 file(s) — `rr/**/*.md` matched nothing to read — below the floor of 1. '],
      [
        'sources-agree',
        'examined 0 name(s) — neither sa/a.json nor sa/b.json described a single name — below the floor of 1. ',
      ],
    ])('%s refuses it, naming the glob and the opt-out', (id, start) => {
      expect(errors(row(empty, id))).toEqual([
        `${start}A check that examined nothing cannot fail, so it reports success; this is that state, caught. ` +
          'Point the pathspec at where the files are, or declare `corpus: { atLeast: 0 }` if an empty set is expected.',
      ]);
    });

    it('defineCheck with `corpus` and zoneBoundary refuse it too, each in its own words', () => {
      expect(errors(row(empty, 'define-check'))[0]).toMatch(/^examined 0 documents, below the declared floor of 1\./);
      const zone = x(make('zoneBoundary', "productSources: 'lib/**/*.ts', forbiddenLiterals: []"));
      expect(errors(zone)[0]).toMatch(/^examined 0 file\(s\) — `lib\/\*\*\/\*\.ts` matched no product source to sweep/);
    });

    it.each([
      ['path-contract', '`**/*.contract.md` matched nothing to hold to its contract'],
      ['sibling-required', '`sr/*.service.ts` matched nothing to require a sibling of'],
      ['must-declare', '`md/**/*.md` matched nothing to read'],
    ])('%s refuses it too — it passed over nothing, saying nothing', (id, what) => {
      expect(errors(row(empty, id))).toEqual([
        `examined 0 file(s) — ${what} — below the floor of 1. A check that examined nothing cannot fail, so it reports ` +
          'success; this is that state, caught. Point the pathspec at where the files are, or declare `corpus: { atLeast: 0 }` if an empty set is expected.',
      ]);
    });

    it('`corpus` handed to mustDeclare is honoured — it was dropped, green over no file', () => {
      const md = x(
        make('mustDeclare', "files: 'no/*.md', fields: [{ name: 'O', pattern: /O/ }], corpus: { atLeast: 1 }"),
      );
      expect(md.ok).toBe(false);
      expect(errors(md)[0]).toMatch(
        /^examined 0 file\(s\) — `no\/\*\.md` matched nothing to read — below the floor of 1\./,
      );
    });

    it('regenerable refuses a missing artifact', () => {
      expect(errors(row(empty, 'regenerable'))).toEqual(['rg/table.md does not exist to compare against.']);
    });

    it('fromResult takes a `corpus` and an `examined` count, and refuses to pass over nothing when it declares one', () => {
      // It had no `corpus` option to declare, and passed over nothing with `✓ … clean`.
      const counted = `import { fromResult } from 'specwarden';
export const check = fromResult({ id: 'x', corpus: { atLeast: 1 }, run: (ctx) => {
  const files = ctx.vcs.trackedFiles('fr/**/*.md');
  return { errors: [], examined: files.length, unit: 'files' };
} });\n`;
      expect(errors(x(counted, {}))[0]).toMatch(/^examined 0 files, below the declared floor of 1\./);
      expect(infos(x(counted, { 'fr/a.md': 'Owner: me\n' }))).toEqual(['✓ x — 1 files examined, clean']);
      // The minimal one declares nothing, and says as much.
      expect([row(empty, 'from-result').ok, infos(row(empty, 'from-result'))]).toEqual([
        true,
        ['✓ from-result — clean'],
      ]);
    });

    it("the bare commandCheck still believes the exit code; the guide's example, pasted, cannot pass over nothing", () => {
      // The bare form passes over nothing, the tool's complaint an info line. That is a
      // bare command's nature, so the guide no longer shows one: its example declares
      // `paths`, `expect` and `refuse`, and each of them turns this run red.
      const cc = row(empty, 'command-check');
      expect([cc.ok, infos(cc)]).toEqual([true, ['grep: cc/*.md: No such file or directory']]);

      const guide = readFileSync(join(PLAYGROUND, '..', 'core', 'GUIDE.md'), 'utf8');
      const block = /```js\n(export const check = commandCheck\(\{[\s\S]*?\}\);)\n```/.exec(guide)?.[1];
      expect(block, 'the guide shows a commandCheck example').toBeDefined();
      const file = `import { commandCheck } from 'specwarden';\n${block}\n`;
      const TEST = "import test from 'node:test';\ntest('holds', () => {});\n";
      const at = (tree: TTree) => row(cli(withCheck(file, tree)), 'x');
      const ran = (r: IRow) => [r.ok, errors(r).length > 0];

      expect(ran(at({ 'tests/a.test.mjs': TEST }))).toEqual([true, false]);
      // No tests/ at all: refused before the command spawns.
      expect(ran(at({ 'src/a.mjs': 'export {};\n' }))).toEqual([false, true]);
      // A tests/ with no test in it: the runner exits 0, and `expect` does not believe it.
      expect(ran(at({ 'tests/README.md': '# none yet\n' }))).toEqual([false, true]);
    });

    it('a defineCheck that declares `corpus` but returns a bare array fails — the floor needs a count', () => {
      // It had no floor at all: green, `✓ x — clean`.
      const file = `import { defineCheck } from 'specwarden';\nexport const check = defineCheck({ id: 'x', title: 't', corpus: { atLeast: 1 }, run: () => [] });\n`;
      expect(errors(x(file))).toEqual([
        'x declares `corpus: { atLeast: 1 }`, and its body reported no `examined` count, so the floor has nothing to hold. ' +
          'Return `{ findings, examined }` — how many units this run looked at.',
      ]);
    });
  });

  describe('4. misconfiguration a consumer will actually make', () => {
    const cc = (options: string) => make('commandCheck', options);
    /** The load refusal every misconfigured factory now gives: exit 2, the file, then the option. */
    const LOADS = '.specwarden/checks/x.check.mjs failed to load: ';

    /** factory ¦ what is wrong ¦ the options it is given ¦ what it says, by name */
    const MISCONFIGURED = table(`
      forbidImport      ¦ no from               ¦ to: 'node:fs'                           ¦ forbidImport 'x': \`from\` is required
      forbidPattern     ¦ no in                 ¦ pattern: /TODO/                         ¦ forbidPattern 'x': \`in\` is required
      pathContract      ¦ no kind               ¦ allowedIn: ['docs/**']                  ¦ pathContract 'x': \`kind\` is required
      pathContract      ¦ no allowedIn          ¦ kind: '**/*.md'                         ¦ pathContract 'x': \`allowedIn\` is required
      pathContract      ¦ a string allowedIn    ¦ kind: '**/*.md', allowedIn: 'docs/**'   ¦ pathContract 'x': \`allowedIn\` must be an array (got the string "docs/**")
      siblingRequired   ¦ no subjects           ¦ require: '{name}.spec.ts'               ¦ siblingRequired 'x': \`subjects\` is required
      siblingRequired   ¦ no require            ¦ subjects: 'src/*.ts'                    ¦ siblingRequired 'x': \`require\` is required
      mustDeclare       ¦ no files              ¦ fields: [{ name: 'O', pattern: /O/ }]   ¦ mustDeclare 'x': \`files\` is required
      mustDeclare       ¦ no fields             ¦ files: 'docs/*.md'                      ¦ mustDeclare 'x': \`fields\` is required
      mustDeclare       ¦ a string pattern      ¦ files: 'docs/*.md', fields: [{ name: 'O', pattern: 'O' }] ¦ mustDeclare 'x': \`fields[0]\` must be { name: string, pattern: RegExp }
      referencesResolve ¦ no in                 ¦ extract: /\\((.*)\\)/                   ¦ referencesResolve 'x': \`in\` is required
      referencesResolve ¦ no capture group      ¦ in: 'docs/*.md', extract: /Owner/       ¦ referencesResolve 'x': \`extract\` /Owner/ has no capture group
      regenerable       ¦ no artifact           ¦ by: 'cat docs/guide.md'                 ¦ regenerable 'x': \`artifact\` is required
      regenerable       ¦ no by                 ¦ artifact: 'docs/guide.md'               ¦ regenerable 'x': \`by\` is required
      sourcesAgree      ¦ no b                  ¦ a: { name: 'a', extract: () => ['x'] }  ¦ sourcesAgree 'x': \`b\` is required
      defineCheck       ¦ no run                ¦ hint: 'h'                               ¦ defineCheck 'x': \`run\` is required
      fromResult        ¦ no run                ¦ hint: 'h'                               ¦ fromResult 'x': \`run\` is required
      commandCheck      ¦ no cmd                ¦ hint: 'h'                               ¦ commandCheck 'x': \`cmd\` is required
      commandCheck      ¦ a string expect       ¦ cmd: 'echo 3 passed', expect: '3 passed' ¦ commandCheck 'x': \`expect\` must be a RegExp or an array (got the string "3 passed")
    `);

    // Each one loaded, ran, and failed in the platform's words — "The "patterns" argument
    // must be of type string", "options.run is not a function", "x exited 127 — undefined".
    it.each(MISCONFIGURED)(
      '%s with %s is refused at load, exit 2, the file and the option named',
      (f, _, opts, message) => {
        const run = cli(withCheck(make(f, opts), TREE));
        expect([run.status, run.rows, run.stderr.startsWith(`${LOADS}${message}`)], run.stderr).toEqual([2, [], true]);
        expect(run.stderr).not.toMatch(/\n\s+at /);
      },
    );

    it('defineCheck with a body returning nothing fails in words about the body — it read "reading \'unit\'"', () => {
      expect(errors(x(make('defineCheck', 'run: () => {}')))).toEqual([
        'x: the body returned nothing — return an array of findings, or `{ findings, examined }`.',
      ]);
    });

    it('a string `pattern` or `extract`, or no `pattern`, is refused by name — it crashed the whole run with a raw stack', () => {
      for (const [factory, options, said] of [
        ['forbidPattern', "in: 'src/**/*.ts'", "forbidPattern 'x': `pattern` is required"],
        [
          'forbidPattern',
          "in: 'src/**/*.ts', pattern: 'TODO'",
          'forbidPattern \'x\': `pattern` must be a RegExp (got the string "TODO")',
        ],
        [
          'referencesResolve',
          "in: 'docs/*.md', extract: 'Owner'",
          'referencesResolve \'x\': `extract` must be a RegExp (got the string "Owner")',
        ],
      ]) {
        const run = cli(withCheck(make(factory, options), TREE));
        expect([run.status, run.rows, run.stderr.startsWith(`${LOADS}${said}`)], run.stderr).toEqual([2, [], true]);
      }
    });

    it('forbidImport with no `to` is refused at load — a ban with no target bans nothing, and it passed green', () => {
      const run = cli(withCheck(make('forbidImport', "from: 'src/**/*.ts'"), TREE));
      expect([run.status, run.stderr.startsWith(`${LOADS}forbidImport 'x': \`to\` is required`)]).toEqual([2, true]);
    });

    it("forbidImport `to: '@db/'` bans everything under `@db/`, as `@db` does — it matched nothing", () => {
      const tree = { 'src/app.ts': "import { q } from '@db/core';\n" };
      expect(x(make('forbidImport', "from: 'src/**/*.ts', to: '@db'"), tree).ok).toBe(false);
      expect(errors(x(make('forbidImport', "from: 'src/**/*.ts', to: '@db/'"), tree))).toEqual([
        'src/app.ts imports `@db/core`, which is forbidden from src/**/*.ts.',
      ]);
    });

    it('a `/g` regex is harmless in the file primitives — forbidPattern, mustDeclare, referencesResolve (commandCheck: §7)', () => {
      expect(errors(x(make('forbidPattern', "in: 'src/**/*.ts', pattern: /TODO/g")))).toHaveLength(2);
      const twoDocs = { 'docs/a.md': 'Owner: a\n[a](gone-a.md) [b](gone-b.md)\n', 'docs/b.md': 'Owner: b\n' };
      expect(
        x(make('mustDeclare', "files: 'docs/*.md', fields: [{ name: 'O', pattern: /Owner:/g }]"), twoDocs).ok,
      ).toBe(true);
      expect(
        errors(x(make('referencesResolve', "in: 'docs/*.md', extract: /\\]\\(([^)]+)\\)/g"), twoDocs)),
      ).toHaveLength(2);
    });

    it('an `except` that exempts everything is caught by the floor, and the refusal says the `except` did it', () => {
      // The refusal blamed the glob: "`src/**/*.ts` matched nothing to scan".
      const said = 'examined 0 file(s) — `src/**/*.ts` matched 2 file(s), and `except` exempted all of them';
      expect(errors(x(make('forbidPattern', "in: 'src/**/*.ts', pattern: /TODO/, except: ['src/**']")))[0]).toContain(
        said,
      );
      expect(errors(x(make('forbidImport', "from: 'src/**/*.ts', to: './b', except: ['**/*.ts']")))[0]).toContain(said);
    });

    it('an option a factory does not take is refused at load, naming it and the ones it does take', () => {
      // Dropped in silence: `except` on referencesResolve checked the file it meant to exempt.
      const rr = cli(
        withCheck(make('referencesResolve', "in: 'docs/*.md', extract: /\\]\\(([^)]+)\\)/, except: ['docs/**']"), {}),
      );
      expect([rr.status, rr.stderr.trim()]).toEqual([
        2,
        `${LOADS}referencesResolve 'x': \`except\` is not an option of referencesResolve. Its own options are: corpus, extract, in, resolve.`,
      ]);
      const typo = cli(withCheck(make('forbidPattern', "in: 'src/**', pattern: /TODO/, excpet: ['src/**']"), TREE));
      expect([typo.status, typo.stderr]).toEqual([
        2,
        expect.stringContaining('`excpet` is not an option of forbidPattern'),
      ]);
    });

    it('pathContract reads the tracked set: node_modules/ is not the repository, a committed dist/ is', () => {
      // It globbed the working tree, so `**/*.md` found node_modules/ too.
      const tree = { 'docs/guide.md': 'x\n', 'node_modules/foo/README.md': 'x\n', 'dist/out.md': 'x\n' };
      expect(
        x(make('pathContract', "kind: '**/*.md', allowedIn: ['docs/**']"), tree)
          .findings.filter((f) => f.severity === 'error')
          .map((f) => f.file),
      ).toEqual(['dist/out.md']);
    });

    /** what is wrong ¦ the options ¦ how the one error it reports ends */
    const COMMANDS = table(`
      a nonexistent cmd       ¦ cmd: 'no-such-zz --flag'                              ¦ x exited 127 — no-such-zz --flag
      paths at a missing file ¦ cmd: 'true', paths: ['src/moved.ts']                  ¦ so this would have been a green gate over a shrinking subject.
      expect never matched    ¦ cmd: 'echo ran 0 tests', expect: /\\d+ passed/         ¦ it never means the command did anything.
      refuse matched          ¦ cmd: 'echo No test files', refuse: [/No test files/]  ¦ That pattern is declared as evidence the command silently did nothing.
      refuse matched, a why   ¦ cmd: 'echo None', refuse: [{ pattern: /None/, why: 'the filter matched nothing.' }] ¦ /None/. the filter matched nothing.
    `);

    it.each(COMMANDS)('commandCheck with %s fails, and says why', (_, options, ending) => {
      const reported = errors(x(cc(options)));
      expect([reported.length, reported[0].endsWith(ending)], reported[0]).toEqual([1, true]);
    });

    it("commandCheck keeps the shell's words as an info line, and a missing `paths` entry as the finding's file", () => {
      expect(infos(x(cc("cmd: 'no-such-zz'")))[0]).toMatch(/no-such-zz: command not found/);
      expect(firstError(x(cc("cmd: 'true', paths: ['src/moved.ts']"))).file).toBe('src/moved.ts');
    });

    it('a tier outside the vocabulary is refused at load by name, as `--tier fastt` on the command line is', () => {
      // It loaded, ran under --all, and every --tier skipped it in silence: a gate no schedule runs.
      const file = make('forbidPattern', "in: 'src/**/*.ts', pattern: /TODO/").replace("tier: 'fast'", "tier: 'fastt'");
      for (const args of [
        ['check', '--all', '--json'],
        ['check', '--tier', 'fast', '--json'],
      ]) {
        const run = cli(withCheck(file, TREE), args);
        expect([run.status, run.rows, run.stderr.trim()]).toEqual([
          2,
          [],
          'check \'x\' (.specwarden/checks/x.check.mjs) declares tier "fastt" — expected one of: fast, heavy, nightly. ' +
            'A tier outside the vocabulary is in no schedule, so no `--tier` would ever run it.',
        ]);
      }
      const typo = cli(withCheck(file, TREE), ['check', '--tier', 'fastt', '--json']);
      expect([typo.status, typo.stderr.includes('unknown tier "fastt" — expected one of: fast, heavy')]).toEqual([
        2,
        true,
      ]);
    });

    it('a defineCheck finding with no `severity` is an error, and fails the verdict', () => {
      // It was printed and ignored: green, beside `undefined: bad`.
      const file = `import { defineCheck } from 'specwarden';\nexport const check = defineCheck({ id: 'x', title: 't', run: () => [{ message: 'bad' }] });\n`;
      const r = x(file);
      expect([r.ok, r.findings.map((f) => `${f.severity}: ${f.message}`)]).toEqual([false, ['error: bad']]);
    });

    it('fromResult refuses a result that is a bare array, or one under any key but the ones it reads', () => {
      // It printed `✓ x clean` over the problems it had been handed.
      const said: Record<string, string> = {
        "['bad thing']":
          'x returned an array — wrap it: `{ errors: [...] }` (or `failures`), so the adapter knows what the entries are.',
        "({ problems: ['bad thing'] })":
          'x returned `problems`, which this adapter does not read — it reads `errors`, `failures`, `notes`, `examined`, `unit`. Rename the key, or the problems under it are dropped.',
      };
      for (const [result, message] of Object.entries(said)) {
        const file = `import { fromResult } from 'specwarden';\nexport const check = fromResult({ id: 'x', title: 't', run: () => ${result} });\n`;
        expect(errors(x(file)), result).toEqual([message]);
      }
    });

    it('--tighten records a ratchet with or without `ratchetId`, which defaults to the check id', () => {
      // With no `ratchetId` it wrote no file, and the ratchet was invisible to ratchet-direction.
      const stored = (id: string) => {
        const file = make('forbidPattern', `in: 'src/**', pattern: /TODO/, ${id}ratchet: 5`);
        const dir = scratchTree(withCheck(file, TREE), { installed: INSTALLED });
        try {
          const run = warden(dir, ['check', '--all', '--json', '--tighten']);
          expect(run.stdout).toContain('↑ 2 pre-existing violation(s) tolerated under ratchet 5; the lines below are');
          const path = join(dir, '.specwarden', 'ratchets', 'x.json');
          return existsSync(path) ? JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))) : 'nothing';
        } finally {
          removeScratch(dir);
        }
      };
      expect([stored("ratchetId: 'x', "), stored('')]).toEqual(['{"id":"x","value":2}', '{"id":"x","value":2}']);
    });

    it('sourcesAgree and regenerable honour `ratchet` — the tolerance every other primitive gives', () => {
      // They accepted it on the identity and ignored it: red at 1 of 1.
      const names = "(ctx) => JSON.parse(ctx.files.read('a.json'))";
      const agree = make(
        'sourcesAgree',
        `ratchetId: 'x', ratchet: 1, a: { name: 'a', extract: ${names} }, b: { name: 'b', extract: () => [] }`,
      );
      expect(x(agree, { 'a.json': '["y"]' })).toMatchObject({
        ok: true,
        findings: [
          { message: expect.stringMatching(/^↑ 1 pre-existing violation\(s\) tolerated under ratchet 1/) },
          { message: '`y` is in a but not b.' },
        ],
      });
      const regen = make('regenerable', "ratchetId: 'x', ratchet: 1, artifact: 'gen/t.md', by: 'echo generated'");
      expect(x(regen, { 'gen/t.md': 'edited\n' }).ok).toBe(true);
    });

    it('a file that throws while loading is a load error — exit 2, the file named, no stack — like "exports no check"', () => {
      // It crashed the CLI with exit 1 and a raw stack ending in discoverChecks.
      const run = cli(withCheck(`throw new Error('boom at import');\n`, TREE));
      expect([run.status, run.rows, run.stderr]).toEqual([
        2,
        [],
        '.specwarden/checks/x.check.mjs failed to load: boom at import\n',
      ]);
    });
  });

  describe('5. rules', () => {
    const RTREE = { 'src/a.ts': 'export const a = 1;\n', 'README.md': '# r\n' };
    const prim = (rule = '') => make('forbidPattern', `in: 'src/**/*.ts', pattern: /FIXME/${rule}`);
    const WITH_RULES = CONFIG.replace('({})', '({ rules: [] })');
    const IMPORTING = `import { defineConfig } from 'specwarden';\nimport { rules } from './rules.mjs';\nexport default defineConfig({ rules });\n`;
    const REGISTER = `export const rules = [{ id: 'no-fixme', statement: 's', owner: 'README.md', enforcement: { checkIds: ['xx'] } }];\n`;
    const audit = (rule: string, id: string) => errors(row(cli(withCheck(prim(rule), RTREE, WITH_RULES)), id));

    it('with no `rules` key nothing audits the check and stderr says so; with `rules: []` it is an orphan, listed', () => {
      expect(cli(withCheck(prim(), RTREE), ['check', '--list']).stderr).toContain(
        'no `rules` declared — the four rule audits (owner, coverage, orphans, enforcers) are not registered; add `rules: []` to start one.',
      );
      expect(audit('', 'orphan-check')).toEqual(['1 check(s) enforce no declared rule: x']);
    });

    it("`rules: []` in a hand-written tree does not fail rule-owner-resolves over the harness's own rule", () => {
      // It did: the harness rule was owned by `.specwarden/README.md`, a file only `init`
      // writes. Without that README the engine owns its own rule.
      expect(audit('', 'rule-owner-resolves')).toEqual([]);
    });

    it('the smallest fix is `rule: { statement, owner }` — an owner that is a document that exists, or not path-shaped', () => {
      for (const owner of ['README.md', 'platform team']) {
        expect(audit(`, rule: { statement: 's', owner: '${owner}' }`, 'orphan-check'), owner).toEqual([]);
        expect(audit(`, rule: { statement: 's', owner: '${owner}' }`, 'rule-owner-resolves'), owner).toEqual([]);
      }
      expect(audit(", rule: { statement: 's', owner: 'docs/RULES.md' }", 'rule-owner-resolves')[0]).toBe(
        "rule 'x' names owner 'docs/RULES.md', whose document docs/RULES.md does not exist",
      );
    });

    it('a `rule` with a statement and no owner is owned by the file that declares it — and a string rule too', () => {
      // It crashed rule-owner-resolves with "Cannot read properties of undefined (reading 'split')".
      for (const rule of [", rule: { statement: 's' }", ", rule: 's'"]) {
        expect(audit(rule, 'rule-owner-resolves'), rule).toEqual([]);
        expect(audit(rule, 'orphan-check'), rule).toEqual([]);
      }
    });

    it('the same rule id on the check and in rules.mjs is refused at load, exit 2, with both remedies', () => {
      const run = cli({
        ...withCheck(prim(", rule: { statement: 's', owner: 'README.md' }"), RTREE, IMPORTING),
        '.specwarden/rules.mjs': REGISTER.replace("'no-fixme'", "'x'"),
      });
      expect([run.status, run.stderr.trim()]).toEqual([
        2,
        'x: declared BOTH on a check (`rule: { … }`) and in the rule register. One id, one declaration — ' +
          'delete the register entry, or drop the `rule` from the check and keep the register as its owner.',
      ]);
    });

    it('a misspelled enforcer id fails enforcement-resolves, and the check it meant becomes an orphan', () => {
      const run = cli({ ...withCheck(prim(), RTREE, IMPORTING), '.specwarden/rules.mjs': REGISTER });
      expect(errors(row(run, 'enforcement-resolves'))).toEqual([
        "rule 'no-fixme' names enforcer 'xx', which is not a registered check and not declared by any other enforcer " +
          'registry — the rule counts as enforced and nothing enforces it.',
      ]);
      expect(errors(row(run, 'orphan-check'))).toEqual(['1 check(s) enforce no declared rule: x']);
    });

    it('a rules.mjs the config does not import is the register — read by convention, as checks/ is', () => {
      // It was read by nothing: the audits stayed off and the misspelled enforcer below passed.
      const run = cli({ ...withCheck(prim(), RTREE), '.specwarden/rules.mjs': REGISTER });
      expect(run.status).toBe(1);
      expect(run.rows.map((r) => r.id)).toEqual(expect.arrayContaining(['x', 'orphan-check', 'enforcement-resolves']));
      expect(errors(row(run, 'enforcement-resolves'))[0]).toContain("rule 'no-fixme' names enforcer 'xx'");
    });
  });

  describe('6. composition — two checks over one corpus', () => {
    const trees = (files: TTree): TTree => ({
      '.specwarden/warden.config.mjs': CONFIG,
      'docs/guide.md': 'Owner: me\n',
      ...files,
    });
    const one = (docs: string, when: string, owner: string) =>
      `import { forbidPattern } from 'specwarden';\nexport const check = forbidPattern({ id: 'one', title: 'no TODO in docs', tier: 'fast', when: ${when}, in: ${docs}, pattern: /TODO/, rule: { statement: 'no TODO in a document', owner: ${owner} } });\n`;
    const two = (docs: string, when: string, owner: string) =>
      `import { mustDeclare } from 'specwarden';\nexport const check = mustDeclare({ id: 'two', title: 'docs name an owner', tier: 'fast', when: ${when}, files: ${docs}, fields: [{ name: 'Owner', pattern: /^Owner:/m }], rule: { statement: 'a document names its owner', owner: ${owner} } });\n`;
    const BOTH = [0, ['one', 'two', 'ratchet-direction']];

    it('two checks over one corpus share it through a plain module, or live in one file', () => {
      // A decision, not an oversight: a corpus is a JavaScript value and an import shares it,
      // so the engine adds no second mechanism for it. `tier` and `title` no longer need
      // repeating at all (they default); the option NAMES differ by primitive — `in`,
      // `files` — and unifying them is a breaking change left for a major version.
      const flat = ["'docs/**/*.md'", "{ ending: ['.md'] }", "'README.md'"] as const;
      const [a, b] = [one(...flat), two(...flat)];
      expect(ids(cli(trees({ '.specwarden/checks/one.check.mjs': a, '.specwarden/checks/two.check.mjs': b })))).toEqual(
        BOTH,
      );
      const imp = `import { DOCS, WHEN, OWNER } from '../_shared/docs.mjs';\n`;
      const helper = `export const DOCS = 'docs/**/*.md';\nexport const WHEN = { ending: ['.md'] };\nexport const OWNER = 'README.md';\n`;
      const viaHelper = trees({
        '.specwarden/checks/_shared/docs.mjs': helper,
        '.specwarden/checks/docs/one.check.mjs': imp + one('DOCS', 'WHEN', 'OWNER'),
        '.specwarden/checks/docs/two.check.mjs': imp + two('DOCS', 'WHEN', 'OWNER'),
      });
      expect(ids(cli(viaHelper))).toEqual(BOTH);
      const oneFile = `import { forbidPattern, mustDeclare } from 'specwarden';\nconst DOCS = 'docs/**/*.md';\nexport const checks = [
  forbidPattern({ id: 'one', title: 't', tier: 'fast', in: DOCS, pattern: /TODO/ }),
  mustDeclare({ id: 'two', title: 't', tier: 'fast', files: DOCS, fields: [{ name: 'Owner', pattern: /^Owner:/m }] }),
];\n`;
      expect(ids(cli(trees({ '.specwarden/checks/docs.check.mjs': oneFile })))).toEqual(BOTH);
    });

    it('a helper that IS named *.check.mjs, and one id in two files, are refused at load with exit 2 and the fix', () => {
      const helper = cli(trees({ '.specwarden/checks/_shared/docs.check.mjs': `export const DOCS = 'docs/**';\n` }));
      expect([helper.status, helper.stderr.trim()]).toEqual([
        2,
        '.specwarden/checks/_shared/docs.check.mjs exports no check. A file under .specwarden/checks/ named *.check.mjs ' +
          'must export `check`, `checks` or a default — rename it if it is a helper, or export the check it builds.',
      ]);
      const file = make('forbidPattern', "in: 'docs/**', pattern: /TODO/");
      const dup = cli(trees({ '.specwarden/checks/a.check.mjs': file, '.specwarden/checks/b.check.mjs': file }));
      expect([dup.status, dup.stderr.trim()]).toEqual([
        2,
        "check id 'x' is exported by both .specwarden/checks/a.check.mjs and .specwarden/checks/b.check.mjs. One id, one file.",
      ]);
    });
  });

  describe('7. the test the guide recommends — runCheck under node:test, inside the consumer tree', () => {
    const TESTED: TTree = {
      '.specwarden/warden.config.mjs': CONFIG,
      'src/a.ts': 'export const a = 1;\n',
      'docs/guide.md': 'Owner: me\n',
      '.specwarden/checks/hygiene/no-todo.check.mjs': `import { forbidPattern } from 'specwarden';
export const check = forbidPattern({ id: 'no-todo', title: 'no TODO in src', tier: 'fast', in: 'src/**/*.ts', pattern: /TODO/ });
`,
      '.specwarden/checks/hygiene/no-todo.check.test.mjs': `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorsOf, runCheck } from 'specwarden';
import { check } from './no-todo.check.mjs';

test('clean', async () => assert.deepEqual(errorsOf(await runCheck(check, { tree: { 'src/a.ts': 'fine' } })), []));
test('red on a TODO, naming the file', async () => assert.match(errorsOf(await runCheck(check, { tree: { 'src/a.ts': '// TODO' } }))[0], /src\\/a\\.ts/));
test('DELIBERATELY WRONG: expects clean over a TODO', async () => {
  assert.equal((await runCheck(check, { tree: { 'src/a.ts': '// TODO' } })).ok, true);
});
`,
      '.specwarden/checks/docs/doc-owner.check.mjs': `import { defineCheck, readTracked } from 'specwarden';
export const check = defineCheck({
  id: 'doc-owner', title: 'every document names who owns it', tier: 'fast',
  when: { ending: ['.md'] }, corpus: { atLeast: 1 },
  run: (ctx) => {
    const docs = readTracked(ctx.vcs, ctx.files, '**/*.md');
    return { findings: docs.filter((d) => !d.text.includes('Owner:')).map((d) => ({ severity: 'error', file: d.file, message: d.file + ' names no owner.' })), examined: docs.length, unit: 'documents' };
  },
});
`,
      '.specwarden/checks/docs/doc-owner.check.test.mjs': `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorsOf, runCheck, testContext } from 'specwarden';
import { check } from './doc-owner.check.mjs';

test('owned', async () => assert.equal((await runCheck(check, { tree: { 'docs/a.md': 'Owner: me' } })).ok, true));
test('red without an owner', async () => assert.deepEqual(errorsOf(await runCheck(check, { tree: { 'docs/a.md': 'nobody' } })), ['docs/a.md names no owner.']));
test('relevance', () => assert.deepEqual([check.when(['src/a.ts']), check.when(['docs/a.md'])], [false, true]));
test('THE TRAP: a forgotten await makes "the check failed" pass over a clean tree', () => {
  assert.ok(!check.run(testContext({ tree: { 'docs/a.md': 'Owner: me' } })).ok);
});
`,
      '.specwarden/checks/quirks/quirks.check.mjs': `import { commandCheck, defineCheck } from 'specwarden';
export const checks = [
  commandCheck({ id: 'tests-ran', title: 't', tier: 'fast', cmd: 'echo 3 passed', expect: /\\d+ passed/g }),
  commandCheck({ id: 'not-silent', title: 't', tier: 'fast', cmd: 'echo No test files found', refuse: [/No test files found/g] }),
  defineCheck({ id: 'shells-out', title: 't', run: (ctx) => (ctx.proc.run('git', ['--version']), []) }),
];
`,
      // Not a *.check.mjs: it cannot load, which is the point, and discovery would refuse the run.
      '.specwarden/checks/quirks/string-when.mjs': `import { forbidPattern } from 'specwarden';
export const check = forbidPattern({ id: 'docs-only', title: 't', tier: 'fast', when: 'docs/', in: 'docs/**/*.md', pattern: /TODO/ });
`,
      '.specwarden/checks/quirks/quirks.check.test.mjs': `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCheck } from 'specwarden';
import { checks } from './quirks.check.mjs';

const [testsRan, notSilent, shellsOut] = checks;
const says = (stdout) => ({ exec: () => ({ status: 0, stdout, stderr: '' }) });
test('expect /g: first run believes the zero exit', async () => assert.equal((await runCheck(testsRan, says('3 passed'))).ok, true));
test('expect /g: the same check, run again, still does', async () => assert.equal((await runCheck(testsRan, says('3 passed'))).ok, true));
test('refuse /g: first run refuses the silent pass', async () => assert.equal((await runCheck(notSilent, says('No test files found'))).ok, false));
test('refuse /g: the same check, run again, still refuses', async () => assert.equal((await runCheck(notSilent, says('No test files found'))).ok, false));
test('when as a string: refused where it is written', async () => assert.rejects(import('./string-when.mjs'), /\`when\` must be a function or an object/));
test('a body that shells out without declaring exec fails in its test, as in the CLI', async () => assert.equal((await runCheck(shellsOut, says('git version 2'))).ok, false));
`,
    };
    const TESTS = Object.keys(TESTED).filter((path) => path.endsWith('.test.mjs'));

    let dir: string;
    let out: string;
    let status: number | null;
    beforeAll(() => {
      dir = scratchTree(TESTED, { installed: INSTALLED });
      const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
      ({ stdout: out, status } = spawnSync(process.execPath, ['--test', ...TESTS], {
        cwd: dir,
        encoding: 'utf8',
        env,
      }));
    });
    afterAll(() => removeScratch(dir));

    it("`import { runCheck, errorsOf, testContext } from 'specwarden'` resolves from a consumer tree; the honest tests pass", () => {
      for (const name of ['clean', 'red on a TODO, naming the file', 'owned', 'red without an owner', 'relevance']) {
        expect(out).toContain(`✔ ${name}`);
      }
      // 9 of 13 passed while four quirks held; the one failure left is the deliberately wrong test.
      expect(out).toMatch(/ℹ tests 13\n[\s\S]*ℹ pass 12\nℹ fail 1\n/);
    });

    it('a failing assertion is legible: the values, the operator, and the test file with its line', () => {
      expect(status).toBe(1);
      expect(out).toContain('✖ DELIBERATELY WRONG: expects clean over a TODO');
      expect(out).toContain('false !== true');
      expect(out).toMatch(/no-todo\.check\.test\.mjs:\d+:\d+/);
    });

    it('the trap the guide warns about is real: without `await`, `!verdict.ok` is true for a passing check', () => {
      expect(out).toContain('✔ THE TRAP: a forgotten await makes "the check failed" pass over a clean tree');
    });

    it('commandCheck `expect` and `refuse` with `/g` give the same verdict on every run', () => {
      // They kept `lastIndex`, so every second run of one check inverted — the second `refuse` was GREEN.
      expect(out).toContain('✔ expect /g: first run believes the zero exit');
      expect(out).toContain('✔ expect /g: the same check, run again, still does');
      expect(out).toContain('✔ refuse /g: first run refuses the silent pass');
      expect(out).toContain('✔ refuse /g: the same check, run again, still refuses');
    });

    it('`when` as a string is refused where it is written', () => {
      // It was taken as "always relevant", in silence.
      expect(out).toContain('✔ when as a string: refused where it is written');
    });

    it('runCheck applies the capability gate the runner applies: the test and the CLI agree', () => {
      // A body that shelled out without `exec` was green in its test and red in the CLI.
      expect(out).toContain('✔ a body that shells out without declaring exec fails in its test, as in the CLI');
      const r = warden(dir, ['check', '--id', 'shells-out', '--json']);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("check 'shells-out' used a 'exec' capability it did not declare (called run).");
    });

    it('discovery does not load the `*.check.test.mjs` files as checks', () => {
      const r = warden(dir, ['check', '--list']);
      expect(
        r.stdout
          .trim()
          .split('\n')
          .map((l) => l.split('\t')[0]),
      ).toEqual(['doc-owner', 'no-todo', 'tests-ran', 'not-silent', 'shells-out', 'ratchet-direction']);
      expect(r.stderr).toContain('discovered 5 check(s) in 3 file(s)');
    });
  });
});
