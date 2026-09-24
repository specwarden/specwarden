import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ROOT, linkPackages, removeScratch, scratchTree } from '../../scripts/playgrounds.mjs';

/**
 * Journey E — a developer's shell and a CI job meet the command line: the commands, the
 * flags, the three reporters, the exit codes and the environment variables. One scratch
 * repository with five checks across two tiers, then every way of asking it to run.
 *
 * The spec PASSES against the engine as it stands. Where that is not what a consumer would
 * want, the `it` starts with `[friction]` (`[friction] BUG:` where it is a defect) and a
 * one-line comment says what it should be. A scene the plan has fixed drops its prefix and
 * asserts the corrected behaviour, with a comment saying what it used to do.
 * The probe tables are one row per invocation, and kept that way by `prettier-ignore`.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ENGINE = join(ROOT, 'core', 'bin', 'specwarden.mjs');
const INSTALLED = [['specwarden', join(HERE, '..', 'node_modules', 'specwarden')] as const];
const read = (...rel: string[]): string => readFileSync(join(ROOT, ...rel), 'utf8');
const GUIDE = read('core', 'GUIDE.md');
const READMES = read('README.md') + read('core', 'README.md');

type TEnv = Record<string, string>;
type TRun = { status: number | null; stdout: string; stderr: string };
type TFinding = { severity: string; message: string; file?: string; line?: number; ruleId?: string };
type TRow = { id: string; tier: string; advisory: boolean; skipped: string | null; ok: boolean; findings: TFinding[] };
type TDoc = { version?: number; totalMs: number; results: TRow[] };

/**
 * The CLI as a shell spawns it, with every ambient variable that could pre-decide a run
 * cleared — the playground helper pins `SPECWARDEN_ALL=1`, the very variable under test.
 */
function cli(dir: string, args: readonly string[], env: TEnv = {}): TRun {
  const base: Record<string, string | undefined> = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  for (const name of ['CI', 'GITHUB_ACTIONS', 'SPECWARDEN_ALL', 'SPECWARDEN_SKIP', 'SPECWARDEN_BASE'])
    delete base[name];
  const r = spawnSync(process.execPath, [ENGINE, ...args], { cwd: dir, encoding: 'utf8', env: { ...base, ...env } });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const parse = (run: TRun): TDoc => JSON.parse(run.stdout) as TDoc;
const json = (dir: string, args: readonly string[], env?: TEnv): TDoc => parse(cli(dir, [...args, '--json'], env));
const ids = (doc: TDoc): string[] => doc.results.map((r) => r.id);
const ran = (doc: TDoc): string[] => doc.results.filter((r) => r.skipped === null).map((r) => r.id);
const skipped = (doc: TDoc): string[] => doc.results.filter((r) => r.skipped !== null).map((r) => r.id);
const lines = (text: string): string[] => text.trim().split('\n');

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=journey', '-c', 'user.email=journey@specwarden.invalid', ...args], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

/** Write `edits` over `dir` and commit them — the checks read tracked files. */
function commitEdits(dir: string, edits: TEnv): void {
  for (const [rel, text] of Object.entries(edits)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '--no-verify', '-m', 'edit');
}

// ─── the repository ──────────────────────────────────────────────────────────────────

const src = (factory: string, body: string): string =>
  `import { ${factory} } from 'specwarden';\nexport const check = ${factory}({ ${body} });\n`;

/**
 * `no-todo`: a `when` predicate and a ratchet ceiling of 3. `readme-present`: a
 * declarative `when`. `node-says-hi`: a command printing where it ran. `style-advice`:
 * advisory. `db-migrate`: exclusive, scoped to `migrations/`. The config declares a tier
 * nothing is in (`smoke`), a shared build input and a file-count trigger.
 */
const TREE: TEnv = {
  'README.md': '# demo\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'src/a.ts': 'export const a = 1; // TODO later\n',
  'src/b.ts': 'export const b = 2;\n',
  'docs/guide.md': '# guide\n',
  'migrations/001.sql': 'select 1;\n',
  '.specwarden/config.mjs': `import { defineConfig } from 'specwarden';
export default defineConfig({ selfChecks: false, tiers: ['fast', 'heavy', 'nightly', 'smoke'], fullRunTriggers: { files: 4 },
  sharedBuildInputs: [{ prefix: 'pnpm-lock.yaml', why: 'the dependency graph may have moved' }] });
`,
  '.specwarden/checks/no-todo.check.mjs': src(
    'forbidPattern',
    `id: 'no-todo', title: 'no TODO left in sources', tier: 'fast', files: 'src/**/*.ts', pattern: /TODO/,
  ratchet: 3, when: (changed) => changed.some((f) => f.startsWith('src/'))`,
  ),
  '.specwarden/checks/readme-present.check.mjs': src(
    'defineCheck',
    `id: 'readme-present', title: 'a README exists when docs change', tier: 'fast', when: { under: ['docs/'] },
  run: (ctx) => ctx.files.exists('README.md') ? { examined: 1, unit: 'files' }
    : [{ severity: 'error', message: 'README.md is missing', file: 'README.md', line: 1 }]`,
  ),
  '.specwarden/checks/node-says-hi.check.mjs': src(
    'commandCheck',
    `id: 'node-says-hi', title: 'node answers', tier: 'fast',
  cmd: 'node -e "console.log(String.fromCharCode(104,105)+process.cwd())"', expect: /^hi/`,
  ),
  '.specwarden/checks/style-advice.check.mjs': src(
    'defineCheck',
    `id: 'style-advice', title: 'no ugly file (advisory)', tier: 'heavy', advisory: true,
  run: (ctx) => ctx.files.exists('src/ugly.ts')
    ? [{ severity: 'error', message: 'src/ugly.ts is ugly', file: 'src/ugly.ts' }] : { examined: 1 }`,
  ),
  '.specwarden/checks/db-migrate.check.mjs': src(
    'commandCheck',
    `id: 'db-migrate', title: 'migrations apply (needs the machine to itself)', tier: 'heavy', exclusive: true,
  when: { under: ['migrations/'] }, cmd: 'node -e "setTimeout(()=>console.log(6*7),300)"', expect: /42/`,
  ),
};

const ROSTER = ['db-migrate', 'no-todo', 'node-says-hi', 'readme-present', 'style-advice'];
const FAST = ['no-todo', 'node-says-hi', 'readme-present'];
const USAGE = 'usage: specwarden <command>';
const FULL = 'ℹ full run — no relevance filter: ';
const NO_CONFIG = 'no .specwarden/config.mjs found from';
const THROWS = src('defineCheck', `id: 'throws', title: 't', tier: 'fast', run: () => { throw new Error('kaboom'); }`);
const EXEC = src('defineCheck', `id: 'needs-exec', title: 'x', tier: 'fast', run: (c) => [c.proc.run('node', [])][1]`);

/** Two gates red (five TODOs over a ceiling of three, no README), the advisory warning. */
const WITHOUT_README = Object.fromEntries(Object.entries(TREE).filter(([rel]) => rel !== 'README.md'));
const BROKEN = { ...WITHOUT_README, 'src/a.ts': 'TODO\nTODO\nTODO\nTODO\nTODO\n', 'src/ugly.ts': 'ugly\n' };

const scratch: string[] = [];
function make(tree: TEnv = TREE): string {
  const dir = scratchTree(tree, { installed: INSTALLED });
  scratch.push(dir);
  return dir;
}
/** A fresh repository with `rel` added and committed — as a thunk, for a probe row. */
const withFile =
  (rel: string, text: string): (() => string) =>
  () => {
    const dir = make();
    commitEdits(dir, { [rel]: text });
    return dir;
  };
/** Pretend HEAD is pushed, then commit `edits`: the relevance range is exactly them. */
function pushedThen(edits: TEnv): string {
  const dir = make();
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  commitEdits(dir, edits);
  return dir;
}
/** An empty directory under the same temp root: no config anywhere above it. */
function bare(): string {
  const dir = join(dirname(green), `specwarden-journey-bare-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  scratch.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of new Set(scratch)) removeScratch(dir);
});

let green: string;
let broken: string;
beforeAll(() => {
  green = make();
  broken = make(BROKEN);
}, 120_000);

/** One invocation: `out`/`err` must appear, `not` must appear in neither, `silent` = stdout empty. */
interface IProbe {
  readonly args: readonly string[];
  readonly status: number;
  readonly on?: () => string;
  readonly env?: TEnv;
  readonly out?: readonly string[];
  readonly err?: readonly string[];
  readonly not?: readonly string[];
  readonly silent?: true;
}
function probe(p: IProbe): TRun {
  const r = cli(p.on?.() ?? green, p.args, p.env);
  expect(r.status, r.stdout + r.stderr).toBe(p.status);
  if (p.silent) expect(r.stdout).toBe('');
  for (const s of p.out ?? []) expect(r.stdout).toContain(s);
  for (const s of p.err ?? []) expect(r.stderr).toContain(s);
  for (const s of p.not ?? []) expect(r.stdout + r.stderr).not.toContain(s);
  return r;
}
const probes = (rows: [string, IProbe][]): void =>
  it.each(rows)('%s', (_name, p) => {
    probe(p);
  });

// ─── 1. help and usage ───────────────────────────────────────────────────────────────

describe('1. help and usage', () => {
  // prettier-ignore
  probes([
    ['no arguments: the usage on stderr, stdout empty, exit 2', { args: [], status: 2, err: [USAGE], silent: true }],
    // Asking for help was an error: the usage on stderr, exit 2 — `spw --help | less` showed nothing.
    ['`--help` prints the usage to stdout, exit 0', { args: ['--help'], status: 0, out: [USAGE], not: ['unknown'] }],
    ['`-h` the same way', { args: ['-h'], status: 0, out: [USAGE] }],
    ['`help` the same way', { args: ['help'], status: 0, out: [USAGE] }],
    // The command was not named, so the reader diffed what they typed against the list.
    ['an unknown command is named above the usage', { args: ['bogus'], status: 2, err: ['unknown command "bogus"', USAGE], silent: true }],
    // An unknown flag was ignored in silence, and the run exited 0.
    ['`check --bogus` is a usage error, by name', { args: ['check', '--bogus', '--all', '--json'], status: 2, err: ['unknown flag --bogus'], silent: true }],
    ['a single-dash `-x` the same way', { args: ['check', '-x', '--all', '--json'], status: 2, err: ['unknown flag -x'], silent: true }],
    // `check --help` ran the checks.
    ['`check --help` prints the usage and runs nothing', { args: ['check', '--help', '--all', '--json'], status: 0, out: [USAGE], not: ['"id"'] }],
    // A value flag with no value was dropped: `--tier` at the end of the line ran EVERY tier.
    ['`--tier` with no value is refused, by name', { args: ['check', '--all', '--json', '--tier'], status: 2, err: ['--tier needs a value'], silent: true }],
    // It does not swallow `--json` as its value — and it is not quietly dropped either.
    ['a value flag does not swallow the next, and is refused for having none: `--base --json`', { args: ['check', '--base', '--json'], status: 2, err: ['--base needs a value, and --json is a flag'], silent: true }],
  ]);

  it('the usage names every command the dispatcher accepts and every flag the parser knows', () => {
    const { stderr } = cli(green, []);
    for (const c of 'adopt suggest init check new doctor plan sync-invariants migrate perimeter'.split(' '))
      expect(stderr).toMatch(new RegExp(`^\\s+${c}\\b`, 'm'));
    const flags = '--tier --id --base --shard --jobs --all --if-relevant --relevance --list --fix --tighten --reporter';
    for (const f of `${flags} --json --show-skipped --template --family`.split(' ')) expect(stderr).toContain(f);
  });

  it('every environment variable and the exit codes are in the usage and the guide', () => {
    // Neither said a word: the guide named SPECWARDEN_SKIP and nothing else.
    const usage = cli(green, []).stderr;
    for (const name of [
      'CI',
      'GITHUB_ACTIONS',
      'SPECWARDEN_ALL',
      'SPECWARDEN_BASE',
      'SPECWARDEN_SKIP',
      'SPECWARDEN_SHELL',
    ]) {
      expect(usage, name).toContain(name);
      expect(GUIDE, name).toContain(name);
    }
    expect(usage).toMatch(
      /0 every check held[\s\S]*1 the answer is no: a check failed, doctor found a defect, a plan is not ready[\s\S]*2 the line/,
    );
    expect(GUIDE).toContain('### Exit codes');
    expect(READMES).toMatch(/Exit `0` every check held, `1` the answer is no/);
  });

  it('`spw` is declared beside `specwarden` as the same binary, and the README says so', () => {
    const { bin } = JSON.parse(read('core', 'package.json')) as { bin: Record<string, string> };
    expect(bin.spw).toBe(bin.specwarden);
    expect(existsSync(join(ROOT, 'core', bin.spw))).toBe(true);
    expect(read('README.md')).toContain('`spw` is a shorter alias');
  });
});

// ─── 2. relevance ────────────────────────────────────────────────────────────────────

describe('2. relevance — a commit touching src/a.ts', () => {
  let diff: string;
  beforeAll(() => {
    diff = pushedThen({ 'src/a.ts': 'export const a = 1; // TODO later\nexport const c = 3;\n' });
  }, 120_000);
  const at = (): string => diff;
  const RELEVANT = ['no-todo', 'node-says-hi', 'style-advice'];

  // prettier-ignore
  probes([
    ['the terminal names the skipped ids, not why', { on: at, args: ['check'], status: 0, out: ['skipped: db-migrate, readme-present', '3 check(s) passed (2 skipped)'], not: ['not-relevant'] }],
    ['--show-skipped says why, one line each', { on: at, args: ['check', '--show-skipped'], status: 0, out: ['⏭  db-migrate — skipped (not-relevant)', '⏭  readme-present — skipped (not-relevant)'] }],
    ['--relevance --id answers skip, exit 0', { on: at, args: ['check', '--relevance', '--id', 'readme-present'], status: 0, out: ['skip\n'] }],
    ['--relevance --id answers run, exit 0', { on: at, args: ['check', '--relevance', '--id', 'no-todo'], status: 0, out: ['run\n'] }],
    ['--relevance with no id: 2', { on: at, args: ['check', '--relevance'], status: 2, err: ['--relevance answers for exactly one check — name one id.'] }],
    ['--relevance with two ids: 2', { on: at, args: ['check', '--relevance', '--id', 'no-todo', '--id', 'readme-present'], status: 2 }],
    ['--relevance with an unknown id: 2', { on: at, args: ['check', '--relevance', '--id', 'nope'], status: 2, err: ["unknown check id 'nope'"] }],
    // A typo'd ref ran everything, exit 0, blaming "the range" — indistinguishable from a shallow clone.
    ['--base no-such-ref is refused, exit 2, naming it', { on: at, args: ['check', '--base', 'no-such-ref'], status: 2, err: ['--base no-such-ref does not resolve to a commit here'], silent: true }],
    ['--if-relevant makes a named id obey the filter', { on: at, args: ['check', '--if-relevant', '--id', 'readme-present'], status: 0, out: ['skipped: readme-present', '⏭  nothing ran — 1 skipped, 0 checked'], not: ['✅'] }],
    ["a shared build input drops the filter with the config's reason", { on: () => pushedThen({ 'pnpm-lock.yaml': 'x: 1\n' }), args: ['check'], status: 0, out: [`${FULL}pnpm-lock.yaml — the dependency graph may have moved`, '✅ 5 check(s) passed'] }],
    ['a diff at fullRunTriggers.files drops it and says how wide', { on: () => pushedThen({ 'x/1': '1', 'x/2': '2', 'x/3': '3', 'x/4': '4' }), args: ['check'], status: 0, out: [`${FULL}4 files changed (trigger: 4)`, '✅ 5 check(s) passed'] }],
    ['no remote: the range cannot be read, the fail-safe runs everything', { args: ['check'], status: 0, out: [`${FULL}the changed-file range could not be read — running everything is the fail-safe`] }],
    ['SPECWARDEN_ALL=1 drops the filter and says it was asked for', { on: at, args: ['check'], env: { SPECWARDEN_ALL: '1' }, status: 0, out: [`${FULL}requested explicitly (--all / SPECWARDEN_ALL)`, '✅ 5 check(s) passed'] }],
  ]);

  it('runs what the change reaches — the predicate, the declarative when, the always-on — and skips the rest', () => {
    const doc = json(diff, ['check']);
    expect([ran(doc), skipped(doc)]).toEqual([RELEVANT, ['db-migrate', 'readme-present']]);
    expect(doc.results.filter((r) => r.skipped !== null).every((r) => r.skipped === 'not-relevant')).toBe(true);
    expect(ran(json(diff, ['check', '--id', 'readme-present']))).toEqual(['readme-present']);
    expect(ran(json(diff, ['check'], { SPECWARDEN_ALL: '1' }))).toEqual(ROSTER);
  });

  it('--base <ref> and SPECWARDEN_BASE set the same range; --base origin/main matches the unpushed range', () => {
    expect(ran(json(diff, ['check', '--base', 'HEAD~1']))).toEqual(RELEVANT);
    expect(ran(json(diff, ['check'], { SPECWARDEN_BASE: 'HEAD~1' }))).toEqual(RELEVANT);
    expect(ran(json(diff, ['check', '--base', 'origin/main']))).toEqual(RELEVANT);
  });

  it('the JSON document of a fail-safe full run carries the reason the terminal prints; a filtered one does not', () => {
    // It did not, so a dashboard reading `--json` could not tell a filtered run from a fail-safe one.
    // An unresolvable SPECWARDEN_BASE is still the fail-safe (an explicit --base is refused).
    const doc = json(diff, ['check'], { SPECWARDEN_BASE: 'no-such-ref' }) as unknown as { fullRunReason?: string };
    expect(ran(doc as never)).toEqual(ROSTER);
    expect(doc.fullRunReason).toMatch(/could not be read/);
    expect(Object.keys(json(diff, ['check'])).sort()).toEqual(['results', 'totalMs', 'version']);
  });
});

// ─── 3. reporters ────────────────────────────────────────────────────────────────────

describe('3. reporters', () => {
  const secret = 'S3CR3T-journey-value';
  const annotations = [
    '::group::no-todo — no TODO left in sources',
    '::error title=no-todo,file=src/a.ts,line=1::forbidden pattern in src/a.ts: TODO',
    '::error title=no-todo,file=src/a.ts,line=5::forbidden pattern in src/a.ts: TODO',
    '::error title=readme-present,file=README.md,line=1::README.md is missing',
    '::endgroup::',
    '::notice title=specwarden::2 check(s) failed: no-todo, readme-present',
  ];

  // prettier-ignore
  probes([
    // `--json` IS `--reporter json`: the two disagreeing rendered a terminal while the rest of
    // the run kept quiet for a machine, so the line is refused rather than half-honoured.
    ['--json beside --reporter tty is refused, exit 2', { args: ['check', '--all', '--json', '--reporter', 'tty'], status: 2, err: ['--json is --reporter json, and --reporter tty says otherwise.'], silent: true }],
    ['--reporter bogus is refused naming the three, exit 2', { args: ['check', '--all', '--reporter', 'bogus'], status: 2, err: ['unknown reporter "bogus" — expected one of: tty, json, github'] }],
    ['github: an ::error per finding with file and line, a group per check, a summary notice', { on: () => broken, args: ['check', '--all', '--reporter', 'github'], status: 1, out: annotations }],
    ['github: a finding with no location (a run that throws) has no file/line', { on: withFile('.specwarden/checks/t.check.mjs', THROWS), args: ['check', '--all', '--id', 'throws', '--reporter', 'github'], status: 1, out: ['::error title=throws::kaboom'] }],
    // It was annotated ::error and counted as passed: an error on a green job reads as a failed gate.
    ['github: a failed advisory check is annotated ::warning and counted as warned', { on: () => broken, args: ['check', '--all', '--id', 'style-advice', '--reporter', 'github'], status: 0, out: ['::warning title=style-advice,file=src/ugly.ts::src/ugly.ts is ugly', '::notice title=specwarden::0 check(s) passed (1 warned)'], not: ['::error'] }],
    // The terminal said "4 check(s) passed" for five, the github notice 5: one count now, in both.
    ['the terminal counts a passing advisory check: five checks held, five passed', { args: ['check', '--all'], status: 0, out: ['✅ style-advice —', '✅ 5 check(s) passed in'] }],
    ['…and the github notice for the same run says the same', { args: ['check', '--all', '--reporter', 'github'], status: 0, out: ['::notice title=specwarden::5 check(s) passed in'] }],
    ['GITHUB_ACTIONS=true selects the github reporter without a flag', { args: ['check', '--all'], env: { GITHUB_ACTIONS: 'true' }, status: 0, out: ['::group::'] }],
    ['--reporter tty overrides GITHUB_ACTIONS', { args: ['check', '--all', '--reporter', 'tty'], env: { GITHUB_ACTIONS: 'true' }, status: 0, out: ['▶ db-migrate'], not: ['::group::'] }],
    // Two ℹ discovery notes went to stderr on every non-JSON run, green or not. They answer doctor and --list.
    ['a run prints no discovery notes', { args: ['check', '--all', '--id', 'readme-present'], status: 0, not: ['ℹ discovered', 'ℹ self-checks'] }],
    ['…doctor and --list do', { args: ['check', '--list'], status: 0, err: ['ℹ discovered 5 check(s) in 5 file(s) under .specwarden/checks/', 'ℹ self-checks disabled entirely (config.selfChecks = false)'] }],
    ['no environment value is printed — not a failed base ref, not a secret', { args: ['check', '--all'], env: { SPECWARDEN_BASE: secret, SPW_JOURNEY_SECRET: secret }, status: 0, not: [secret] }],
    ['no environment value is printed under --json either', { args: ['check', '--json'], env: { SPECWARDEN_BASE: secret }, status: 0, not: [secret] }],
  ]);

  it('--json is ONE document on stdout, nothing on stderr: id, tier, advisory, skipped, ok, durationMs, findings', () => {
    const r = cli(green, ['check', '--all', '--json']);
    expect(r).toMatchObject({ status: 0, stderr: '' });
    const doc = parse(r);
    // `--all` is a full run, and the document says why — as the terminal does.
    expect(Object.keys(doc).sort()).toEqual(['fullRunReason', 'results', 'totalMs', 'version']);
    expect(doc.version).toBe(1);
    const keys = ['advisory', 'durationMs', 'findings', 'id', 'ok', 'skipped', 'tier'];
    for (const row of doc.results) expect(Object.keys(row).sort()).toEqual(keys);
    expect(ids(doc)).toEqual(ROSTER);
    const todo = doc.results.find((x) => x.id === 'no-todo')?.findings.find((f) => f.severity === 'error');
    expect(todo).toMatchObject({ file: 'src/a.ts', line: 1, ruleId: 'no-todo' });
  });

  it('--reporter json on a full run is ONE document on stdout, the reason inside it — --json is the same line', () => {
    // The line was appended after the document, so the output was not JSON. The reason is the
    // document's `fullRunReason`; stderr stays for what could not be used.
    const r = cli(green, ['check', '--all', '--reporter', 'json']);
    expect(ids(parse(r))).toEqual(ROSTER);
    expect(r.stderr).toBe('');
    expect((parse(r) as unknown as { fullRunReason: string }).fullRunReason).toBe(
      'requested explicitly (--all / SPECWARDEN_ALL)',
    );
    expect(ids(json(green, ['check', '--all']))).toEqual(ids(parse(r)));
  });

  const ansi = '\u001b[';
  const forced = (args: string[]): string =>
    spawnSync(process.execPath, [ENGINE, 'check', '--all', ...args], {
      cwd: green,
      encoding: 'utf8',
      env: { ...process.env, CI: undefined, GITHUB_ACTIONS: undefined, FORCE_COLOR: '1', NO_COLOR: undefined },
    }).stdout;

  it("every github workflow command is one line; the engine's own frame carries no ANSI, even under FORCE_COLOR", () => {
    const gh = cli(broken, ['check', '--all', '--reporter', 'github']).stdout;
    for (const line of lines(gh).filter((l) => l.startsWith('::error'))) expect(line).toMatch(/^::error [^:]*::.+$/);
    expect(cli(green, ['check', '--all'], { NO_COLOR: '1' }).stdout).not.toContain(ansi);
    expect(forced(['--tier', 'fast'])).not.toContain(ansi);
  });

  it("under FORCE_COLOR a wrapped command's colour codes are stripped from its findings, JSON included", () => {
    // They passed verbatim — `\u001b[33m42\u001b[39m` — so a finding was not data and an
    // `expect: /^42$/` failed on the escapes around the words.
    const [row] = (JSON.parse(forced(['--id', 'db-migrate', '--json'])) as TDoc).results;
    expect(row.ok).toBe(true);
    expect(row.findings.map((f) => f.message)).toContain('42');
    expect(JSON.stringify(row)).not.toContain('\u001b');
  });
});

// ─── 4. exit codes ───────────────────────────────────────────────────────────────────

describe('4. exit codes', () => {
  const config = (text: string): (() => string) => withFile('.specwarden/config.mjs', text);
  const checkFile = (name: string, text: string): (() => string) => withFile(`.specwarden/checks/${name}`, text);
  const boom = "throw new Error('boom at import');\n";

  // prettier-ignore
  probes([
    ['0: every gate held', { args: ['check', '--all'], status: 0 }],
    ['1: a gate failed', { on: () => broken, args: ['check', '--all'], status: 1, out: ['❌ 2 check(s) FAILED'] }],
    ['2: an unknown tier, naming the declared ones', { args: ['check', '--all', '--tier', 'nope'], status: 2, err: ['unknown tier "nope" — expected one of: fast, heavy, nightly, smoke'] }],
    ['2: no config found (check)', { on: bare, args: ['check', '--all'], status: 2, err: [NO_CONFIG, 'nothing to run.'] }],
    ['2: no config found (doctor)', { on: bare, args: ['doctor'], status: 2, err: [NO_CONFIG] }],
    ['2: no config found (--list)', { on: bare, args: ['check', '--list'], status: 2, err: [NO_CONFIG] }],
    ['2: a config with no default export', { on: config('export const x = 1;\n'), args: ['check', '--all'], status: 2, err: ['must default-export a config object (see defineConfig)'] }],
    // Each was exit 1 and a node stack — and 1 means "a gate failed". Now caught at the import.
    ['2, the file and one sentence: a config that does not parse', { on: config('export default {\n'), args: ['check', '--all'], status: 2, err: ['.specwarden/config.mjs failed to load: SyntaxError: '], not: ['    at '], silent: true }],
    ['2, the file and one sentence: a config importing a missing package', { on: config("import 'not-installed-anywhere';\nexport default {};\n"), args: ['check', '--all'], status: 2, err: ['.specwarden/config.mjs failed to load: ', 'not-installed-anywhere'], not: ['    at '], silent: true }],
    ['2, the file and one sentence: a check file that throws on import (check)', { on: checkFile('boom.check.mjs', boom), args: ['check', '--all'], status: 2, err: ['.specwarden/checks/boom.check.mjs failed to load: boom at import'], not: ['    at '], silent: true }],
    ['2, the file and one sentence: a check file that throws on import (doctor)', { on: checkFile('boom.check.mjs', boom), args: ['doctor'], status: 2, err: ['.specwarden/checks/boom.check.mjs failed to load: boom at import'], not: ['    at '] }],
    ['2: a *.check.mjs that exports no check, with the fix spelled out', { on: checkFile('helper.check.mjs', 'export const helper = 1;\n'), args: ['check', '--all'], status: 2, err: ['helper.check.mjs exports no check', 'rename it if it is a helper'] }],
    ['2: two files exporting one id', { on: checkFile('no-todo-2.check.mjs', TREE['.specwarden/checks/no-todo.check.mjs']), args: ['check', '--all'], status: 2, err: ["check id 'no-todo' is exported by both"] }],
    ['1, not a crash: a check whose run throws — its finding, and the run goes on', { on: checkFile('t.check.mjs', THROWS), args: ['check', '--all', '--id', 'throws', '--id', 'readme-present'], status: 1, out: ['kaboom', '❌ throws FAILED after', '❌ 1 check(s) FAILED, 1 passed'], not: ['    at '] }],
    ['1: a check using a capability it did not declare, in a sentence', { on: checkFile('x.check.mjs', EXEC), args: ['check', '--all', '--id', 'needs-exec'], status: 1, out: ["check 'needs-exec' used a 'exec' capability it did not declare (called run)"] }],
    ['0: only an advisory check failed — it WARNS', { on: () => broken, args: ['check', '--all', '--id', 'style-advice'], status: 0, out: ['⚠️  style-advice WARNS after', '✅ 0 check(s) passed (1 warned)'] }],
    ['0: --if-relevant left nothing to run', { on: () => pushedThen({ 'src/a.ts': 'export const a = 11;\n' }), args: ['check', '--if-relevant', '--id', 'db-migrate', '--id', 'readme-present'], status: 0, out: ['⏭  nothing ran — 2 skipped, 0 checked'], not: ['✅'] }],
  ]);

  it('an advisory failure is ok:false advisory:true in the JSON', () => {
    const [row] = json(broken, ['check', '--all', '--id', 'style-advice']).results;
    expect(row).toMatchObject({ ok: false, advisory: true });
  });
});

// ─── 5. selection ────────────────────────────────────────────────────────────────────

describe('5. selection', () => {
  const firstColumn = (text: string): string[] => lines(text).map((l) => l.split('\t')[0]);

  // prettier-ignore
  probes([
    ['an unknown --id exits 2 with nothing on stdout', { args: ['check', '--all', '--id', 'nope'], status: 2, err: ["unknown check id 'nope'"], silent: true }],
    // It was a green run over nothing — "✅ 0 check(s) passed" — the product's founding failure.
    ['a run over a tier with no check in it is refused, exit 2', { args: ['check', '--all', '--tier', 'smoke'], status: 2, err: ["tier 'smoke' holds no check — a run over it would pass having run nothing"], silent: true }],
    ['--list with an unknown id exits 2', { args: ['check', '--list', '--id', 'nope'], status: 2, err: ['unknown check id(s): nope'] }],
    ['--list over an empty tier prints nothing, exit 0', { args: ['check', '--list', '--tier', 'smoke'], status: 0, silent: true }],
    ['--shard 3/2 is refused, exit 2', { args: ['check', '--all', '--shard', '3/2', '--json'], status: 2, err: ['--shard "3/2" asks for part 3 of 2 — the index runs from 1 to 2'], silent: true }],
    ['--shard 0/2 is refused, exit 2', { args: ['check', '--all', '--shard', '0/2', '--json'], status: 2, err: ['--shard "0/2" asks for part 0 of 2'], silent: true }],
    ['--shard abc is refused, exit 2', { args: ['check', '--all', '--shard', 'abc', '--json'], status: 2, err: ['--shard must be written i/N (for example 1/3); got "abc"'], silent: true }],
    ['--shard 1/0 is refused, exit 2', { args: ['check', '--all', '--shard', '1/0', '--json'], status: 2, err: ['--shard "1/0" divides the work into 0 parts'], silent: true }],
    ['SPECWARDEN_SKIP naming an unknown id exits 2 locally', { args: ['check', '--all'], env: { SPECWARDEN_SKIP: 'nope' }, status: 2, err: ['unknown check id(s) in skip: nope'] }],
    ['…and is ignored in silence under CI=true', { args: ['check', '--all', '--id', 'readme-present'], env: { SPECWARDEN_SKIP: 'nope', CI: 'true' }, status: 0 }],
  ]);

  it('--tier selects one tier, a declared custom tier is accepted, --id repeats in the order given', () => {
    expect(ids(json(green, ['check', '--all', '--tier', 'fast']))).toEqual(FAST);
    expect(ids(json(green, ['check', '--all', '--tier', 'heavy']))).toEqual(['db-migrate', 'style-advice']);
    expect(cli(green, ['check', '--all', '--tier', 'nightly']).status).toBe(2);
    const order = ['check', '--all', '--id', 'style-advice', '--id', 'no-todo'];
    expect(ids(json(green, order))).toEqual(['style-advice', 'no-todo']);
  });

  it('--tier with --id names checks of that tier; an id outside it is refused, exit 2', () => {
    // It silently overrode the tier: `--tier heavy --id no-todo` ran a fast check.
    const r = cli(green, ['check', '--all', '--tier', 'heavy', '--id', 'no-todo']);
    expect([r.status, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toContain("'no-todo' is in tier fast, not heavy");
    expect(ids(json(green, ['check', '--all', '--tier', 'heavy', '--id', 'db-migrate']))).toEqual(['db-migrate']);
  });

  it('--list prints id<TAB>title per line and honours --tier and --id', () => {
    const all = cli(green, ['check', '--list']).stdout;
    expect(firstColumn(all)).toEqual(ROSTER);
    expect(lines(all)[0]).toBe('db-migrate\tmigrations apply (needs the machine to itself)');
    expect(firstColumn(cli(green, ['check', '--list', '--tier', 'fast']).stdout)).toEqual(FAST);
    const two = cli(green, ['check', '--list', '--id', 'db-migrate', '--id', 'no-todo']).stdout;
    expect(two).toBe('db-migrate\tmigrations apply (needs the machine to itself)\nno-todo\tno TODO left in sources\n');
  });

  it('--list --json prints the roster as JSON; a flag the listing does not use is not validated', () => {
    // It printed the tab-separated list. The second half is a decision: a query is not
    // refused over a shard or a reporter it never uses.
    const listing = JSON.parse(cli(green, ['check', '--list', '--json']).stdout) as {
      version: number;
      checks: { id: string }[];
    };
    expect(listing.version).toBe(1);
    expect(listing.checks.map((row) => row.id)).toEqual(ROSTER);
    expect(Object.keys(listing.checks[0]).sort()).toEqual(['advisory', 'exclusive', 'id', 'tier', 'title']);
    const lax = cli(green, ['check', '--list', '--shard', '3/2', '--reporter', 'bogus']);
    expect([lax.status, firstColumn(lax.stdout)]).toEqual([0, ROSTER]);
  });

  it('--shard 1/2 and 2/2 each run the whole roster — it is forwarded to a shardable check, never a split', () => {
    // A decision, and the guide says it: a check that shards its own work already receives
    // the value, and splitting the roster as well would halve its input twice.
    expect(GUIDE).toContain('is not a split of the roster');
    expect(ids(json(green, ['check', '--all', '--shard', '1/2']))).toEqual(ROSTER);
    expect(ids(json(green, ['check', '--all', '--shard', '2/2']))).toEqual(ROSTER);
  });

  it('--jobs 4 overlaps ordinary checks and runs an exclusive one alone', () => {
    const stamp = `import { commandCheck } from 'specwarden';
const cmd = 'node -e "const fs=require(String.fromCharCode(102,115));const s=Date.now();setTimeout(()=>{fs.appendFileSync(process.env.JOURNEY_LOG,JSON.stringify({id:process.env.JOURNEY_ID,s,e:Date.now()})+String.fromCharCode(10))},250)"';
const timed = (id, extra = {}) => commandCheck({ id, title: id, tier: 'nightly', cmd, env: { JOURNEY_ID: id }, ...extra });
export const checks = [timed('t-alpha'), timed('t-beta'), timed('t-solo', { exclusive: true }), timed('t-gamma')];
`;
    const dir = withFile('.specwarden/checks/timed.check.mjs', stamp)();
    const log = join(dir, '.timing.log');
    const r = cli(dir, ['check', '--all', '--tier', 'nightly', '--jobs', '4'], { JOURNEY_LOG: log });
    expect(r.stdout).toContain('✅ 4 check(s) passed');
    const spans = lines(readFileSync(log, 'utf8')).map((l) => JSON.parse(l) as { id: string; s: number; e: number });
    expect(spans.map((x) => x.id).sort()).toEqual(['t-alpha', 't-beta', 't-gamma', 't-solo']);
    const solo = spans.find((x) => x.id === 't-solo') as { s: number; e: number };
    const others = spans.filter((x) => x.id !== 't-solo');
    for (const o of others) expect(o.e <= solo.s || o.s >= solo.e).toBe(true);
    expect(others.some((a) => others.some((b) => a !== b && a.s < b.e && b.s < a.e))).toBe(true);
  });

  it('--jobs that is not a positive integer — `abc`, `0`, `-3` — is a usage error, exit 2, naming it', () => {
    // All three ran serially and exited 0.
    for (const jobs of ['abc', '0', '-3']) {
      const r = cli(green, ['check', '--all', '--tier', 'fast', '--jobs', jobs, '--json']);
      expect([r.status, r.stdout, r.stderr]).toEqual([
        2,
        '',
        `--jobs must be a positive whole number of checks to run at once; got "${jobs}".\n`,
      ]);
    }
  });

  const skipOf = (env: TEnv): string | null | undefined =>
    json(green, ['check', '--all'], { SPECWARDEN_SKIP: 'no-todo', ...env }).results.find((x) => x.id === 'no-todo')
      ?.skipped;

  it('SPECWARDEN_SKIP skips by request locally — an id, or all — and is ignored under CI', () => {
    expect([skipOf({}), skipOf({ CI: 'true' }), skipOf({ GITHUB_ACTIONS: 'true' })]).toEqual([
      'by-request',
      null,
      null,
    ]);
    const all = json(green, ['check', '--all'], { SPECWARDEN_SKIP: 'all' }).results;
    expect(all.every((x) => x.skipped === 'by-request')).toBe(true);
  });

  it('CI is any CI but "", "false" and "0", and GITHUB_ACTIONS is read as the reporter reads it', () => {
    // Only CI=true or ANY GITHUB_ACTIONS counted: CI=1 honoured a skip, GITHUB_ACTIONS=false ignored it.
    expect([skipOf({ CI: '1' }), skipOf({ GITHUB_ACTIONS: 'false' }), skipOf({ CI: '0' })]).toEqual([
      null,
      'by-request',
      'by-request',
    ]);
  });
});

// ─── 6. writes ───────────────────────────────────────────────────────────────────────

describe('6. writes — --tighten and --fix', () => {
  const ratchet = (dir: string): unknown =>
    JSON.parse(readFileSync(join(dir, '.specwarden/ratchets/no-todo.json'), 'utf8'));
  const status = (dir: string): string => git(dir, 'status', '--porcelain').trim();
  const run = (dir: string, ...args: string[]): number | null => cli(dir, ['check', '--all', ...args]).status;

  it('--tighten writes nothing for a check with no ratchet, the observed count for a ratcheted one', () => {
    const dir = make();
    expect(run(dir, '--id', 'readme-present', '--tighten')).toBe(0);
    expect(status(dir)).toBe('');
    expect(run(dir, '--id', 'no-todo', '--tighten')).toBe(0);
    expect([ratchet(dir), status(dir)]).toEqual([{ id: 'no-todo', value: 1 }, '?? .specwarden/ratchets/']);
    expect(cli(dir, ['check', '--all', '--id', 'no-todo']).stdout).toContain('tolerated under ratchet 1');
  });

  it('--fix with nothing fixable writes nothing; --fix --tighten --jobs 4 runs serially and writes only the ratchet', () => {
    const dir = make();
    expect(run(dir, '--fix')).toBe(0);
    expect(status(dir)).toBe('');
    expect(run(dir, '--fix', '--tighten', '--jobs', '4')).toBe(0);
    expect([ratchet(dir), status(dir)]).toEqual([{ id: 'no-todo', value: 1 }, '?? .specwarden/ratchets/']);
  });

  it('a check failing for another reason does not stop a healthy one being tightened; the run still exits 1', () => {
    const dir = make(WITHOUT_README);
    probe({ on: () => dir, args: ['check', '--all', '--tighten'], status: 1, out: ['❌ readme-present FAILED'] });
    expect(ratchet(dir)).toEqual({ id: 'no-todo', value: 1 });
  });

  it('--tighten on a FAILING ratcheted check stores nothing; the next run is still red', () => {
    // It stored the failing count, above the ceiling, and the next run passed.
    const dir = make(BROKEN);
    expect([run(dir, '--id', 'no-todo'), run(dir, '--id', 'no-todo', '--tighten')]).toEqual([1, 1]);
    expect(existsSync(join(dir, '.specwarden/ratchets/no-todo.json'))).toBe(false);
    probe({ on: () => dir, args: ['check', '--all', '--id', 'no-todo'], status: 1, out: ['❌ no-todo FAILED'] });
    expect(GUIDE).toContain('lower each threshold to today');
    expect(GUIDE).toContain('`--tighten` records only what a passing run measured');
  });
});

// ─── 7. a CI job ─────────────────────────────────────────────────────────────────────

describe('7. a CI job: check --tier fast --all, then --tier heavy --all', () => {
  const GHA = { CI: 'true', GITHUB_ACTIONS: 'true' };

  it('the two tier jobs together run exactly what --all runs, nothing twice, nothing in a third place', () => {
    const fast = ran(json(green, ['check', '--tier', 'fast', '--all'], GHA));
    const heavy = ran(json(green, ['check', '--tier', 'heavy', '--all'], GHA));
    expect([...fast, ...heavy].sort()).toEqual(ran(json(green, ['check', '--all'], GHA)));
    expect(fast.length + heavy.length).toBe(ROSTER.length);
  });

  it('under GITHUB_ACTIONS the same two commands annotate with no extra flag; the failing job exits 1', () => {
    const out = [
      '::error title=no-todo,file=src/a.ts,line=1::',
      '::error title=readme-present,file=README.md,line=1::',
    ];
    probe({ on: () => broken, args: ['check', '--tier', 'fast', '--all'], env: GHA, status: 1, out });
    probe({ on: () => broken, args: ['check', '--tier', 'heavy', '--all'], env: GHA, status: 0, out: ['::notice'] });
  });

  it('a CI checkout at a pushed commit WITHOUT --all runs everything, and says why', () => {
    // HEAD already on a remote read as "nothing changed": only the always-on checks ran, exit 0,
    // no reason. Under CI with no base an empty range is "cannot tell" now.
    const clone = join(dirname(green), `specwarden-journey-clone-${process.pid}`);
    scratch.push(clone);
    const from = `file://${green.replace(/\\/g, '/')}`;
    execFileSync('git', ['clone', '--quiet', '--depth', '1', from, clone], { stdio: 'ignore' });
    writeFileSync(join(clone, '.git', 'info', 'exclude'), 'node_modules/\n');
    linkPackages(clone, INSTALLED);
    const doc = json(clone, ['check', '--tier', 'fast'], GHA);
    expect([ran(doc), skipped(doc)]).toEqual([FAST, []]);
    const reason = `${FULL}under CI with no --base, the unpushed range is empty and cannot tell what changed`;
    probe({
      on: () => clone,
      args: ['check', '--tier', 'fast'],
      env: GHA,
      status: 0,
      out: ['::notice title=specwarden::3 check(s) passed'],
      err: [reason],
    });
    // `--relevance` answers from the same derivation, so a workflow keeps an expensive setup…
    expect(cli(clone, ['check', '--relevance', '--id', 'db-migrate'], GHA).stdout).toBe('run\n');
    // …and a --base the depth-1 clone lacks is refused by name rather than passed off as a fail-safe.
    probe({
      on: () => clone,
      args: ['check', '--base', 'main~3'],
      env: GHA,
      status: 2,
      err: ['--base main~3 does not resolve'],
    });
    expect(GUIDE).toContain('a shallow clone or a first push skips the whole tier');
    expect(GUIDE).toContain('Under CI\nwith no `--base`, the range of unpushed commits is empty by construction');
  });

  it("this repository's own workflow runs exactly those two commands, one job per tier, no --reporter", () => {
    const ci = read('.github', 'workflows', 'ci.yml');
    expect(ci).toContain('node core/bin/specwarden.mjs check --tier fast --all');
    expect(ci).toContain('node core/bin/specwarden.mjs check --tier heavy --all');
    expect(ci).not.toContain('--reporter');
  });

  it('the guide has a CI section: annotations under Actions, --base for a pull request, one job per tier', () => {
    // It named the github reporter and nothing else about CI.
    expect(GUIDE).toContain('### In CI');
    expect(GUIDE).toMatch(/Annotations are automatic/);
    expect(GUIDE).toContain('--base origin/main');
    expect(GUIDE).toMatch(/One job per tier/);
  });
});

// ─── 8. doctor ───────────────────────────────────────────────────────────────────────

describe('8. doctor', () => {
  it('prints one tab-separated line per check: id, tier, zone, capabilities and flags, title, file — exit 0', () => {
    // It said neither which file a check came from, nor which were advisory or exclusive.
    expect(lines(probe({ args: ['doctor'], status: 0 }).stdout)).toEqual([
      'db-migrate\theavy\tconsumer\t[exec] exclusive\tmigrations apply (needs the machine to itself)\t.specwarden/checks/db-migrate.check.mjs',
      'no-todo\tfast\tconsumer\t[read]\tno TODO left in sources\t.specwarden/checks/no-todo.check.mjs',
      'node-says-hi\tfast\tconsumer\t[exec]\tnode answers\t.specwarden/checks/node-says-hi.check.mjs',
      'readme-present\tfast\tconsumer\t[read]\ta README exists when docs change\t.specwarden/checks/readme-present.check.mjs',
      'style-advice\theavy\tconsumer\t[read] advisory\tno ugly file (advisory)\t.specwarden/checks/style-advice.check.mjs',
    ]);
  });

  it('marks a denied capability, lists denyCapabilities, adds the self-checks and rule coverage when rules exist', () => {
    const strict = withFile(
      '.specwarden/config.mjs',
      `import { defineConfig } from 'specwarden';
export default defineConfig({ tiers: ['fast', 'heavy', 'nightly', 'smoke'], denyCapabilities: ['exec'], rules: [] });
`,
    )();
    const denied = [
      'db-migrate\theavy\tconsumer\t[exec] DENIED exclusive\t',
      'node-says-hi\tfast\tconsumer\t[exec] DENIED\t',
    ];
    const r = probe({ on: () => strict, args: ['doctor'], status: 0, out: [...denied, '\ndenyCapabilities: exec\n'] });
    for (const id of [
      'rule-owner-resolves',
      'rule-coverage',
      'orphan-check',
      'enforcement-resolves',
      'ratchet-direction',
    ])
      expect(r.stdout).toMatch(new RegExp(`^${id}\\tfast\\tproduct\\t`, 'm'));
    // The count names the engine's own rule — it was "declared: 1" over an empty register.
    expect(r.stdout).toContain("rule coverage:\n  declared: 1 (the engine's own: self-checks-hold)\n  enforced: 1\n");
    expect(r.stdout).toContain('checks enforcing no rule (orphans): 5');
    const refused = 'declares capability exec, which this repository denies (denyCapabilities). It was not run.';
    probe({ on: () => strict, args: ['check', '--all', '--id', 'node-says-hi'], status: 1, out: [refused] });
  });

  it('`doctor --json` is the same report as one document, nothing on stderr; an unknown flag is refused', () => {
    // It printed the text: `--json` was accepted and ignored.
    const r = probe({ args: ['doctor', '--json'], status: 0 });
    const doc = JSON.parse(r.stdout) as { checks: { id: string; origin: string; exclusive: boolean }[] };
    expect(doc.checks.map((c) => c.id)).toEqual(ROSTER);
    expect(doc.checks.find((c) => c.id === 'db-migrate')).toMatchObject({
      exclusive: true,
      origin: '.specwarden/checks/db-migrate.check.mjs',
    });
    expect(r.stderr).toBe('');
    probe({ args: ['doctor', '--bogus'], status: 2, err: ['unknown flag --bogus'], silent: true });
  });

  it('a typo in an id or a command is refused with the name it was close to', () => {
    // It said only "unknown check id 'no-tod'", and the reader diffed it against a list unseen.
    probe({
      args: ['check', '--all', '--id', 'no-tod'],
      status: 2,
      err: ["unknown check id 'no-tod' (did you mean 'no-todo'?)"],
    });
    probe({
      args: ['check', '--list', '--id', 'readme-presnt'],
      status: 2,
      err: ["readme-presnt (did you mean 'readme-present'?)"],
    });
    probe({
      args: ['check', '--all'],
      env: { SPECWARDEN_SKIP: 'style-advise' },
      status: 2,
      err: ["style-advise (did you mean 'style-advice'?)"],
    });
    probe({ args: ['doctr'], status: 2, err: [`unknown command "doctr" (did you mean 'doctor'?)`] });
  });
});

// ─── 9. Windows: the same command check from PowerShell and from bash ───────────────

describe('9. a command check from PowerShell and from bash', () => {
  const viaShell = (shell: string, flag: string, env: TEnv = {}): unknown => {
    const line = `node "${ENGINE}" check --all --id node-says-hi --id db-migrate --json`;
    const opts = { cwd: green, encoding: 'utf8' as const, env: { ...process.env, NO_COLOR: '1', ...env } };
    const r = spawnSync(shell, [flag, line], opts);
    expect(r.status, r.stderr).toBe(0);
    return (JSON.parse(r.stdout) as TDoc).results.map((x) => [x.id, x.ok]);
  };

  it.skipIf(process.platform !== 'win32')('one verdict from PowerShell, from bash, and with SPECWARDEN_SHELL', () => {
    const verdict = [
      ['node-says-hi', true],
      ['db-migrate', true],
    ];
    expect(viaShell('powershell.exe', '-Command')).toEqual(verdict);
    expect(viaShell('bash', '-c')).toEqual(verdict);
    expect(viaShell('powershell.exe', '-Command', { SPECWARDEN_SHELL: 'powershell' })).toEqual(verdict);
  });

  it('`cwd` runs a command check in a package directory, and refuses one that is not there', () => {
    // A monorepo package's own suite could only `cd` in its command line; a directory that
    // moved ran nothing and the shell exited 0.
    const inSrc = src(
      'commandCheck',
      `id: 'in-src', cmd: 'node -e "console.log(String.fromCharCode(104,105)+process.cwd())"', cwd: 'src', expect: /^hi/`,
    );
    const dir = withFile('.specwarden/checks/in-src.check.mjs', inSrc)();
    const [row] = json(dir, ['check', '--all', '--id', 'in-src']).results;
    const said = row.findings.find((f) => f.message.startsWith('hi'))?.message.slice(2) ?? '';
    expect(said.replace(/\\/g, '/').toLowerCase()).toBe(`${dir.replace(/\\/g, '/').toLowerCase()}/src`);

    const gone = withFile(
      '.specwarden/checks/gone.check.mjs',
      src('commandCheck', "id: 'gone', cmd: 'true', cwd: 'packages/api'"),
    )();
    const r = cli(gone, ['check', '--all', '--id', 'gone']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('gone runs in packages/api, which is not a directory here — the command was not run.');
  });

  it('a command check runs at the repository root, wherever the CLI was invoked from', () => {
    // It ran in the directory the CLI was INVOKED from, while its `paths` were verified
    // against the root the config was found at.
    const where = (cwd: string): string => {
      const [row] = json(cwd, ['check', '--all', '--id', 'node-says-hi']).results;
      const said = row.findings.find((f) => f.message.startsWith('hi'))?.message.slice(2) ?? '';
      return said.replace(/\\/g, '/').toLowerCase();
    };
    const root = green.replace(/\\/g, '/').toLowerCase();
    expect([where(green), where(join(green, 'src'))]).toEqual([root, root]);
  });
});
