import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { removeScratch, scratchTree, warden } from '../../scripts/playgrounds.mjs';

/**
 * Journey A — day one, no template.
 *
 * An ordinary small TypeScript repository installs the engine (and nothing else) and
 * follows the guide literally: adopt, suggest, init, new, a primitive, a ratchet, a fix,
 * then the mistakes a newcomer makes. Everything runs through the real CLI over a scratch
 * git repository.
 *
 * Every assertion holds against the engine as it stands. `[friction]` marks behaviour a
 * consumer would not want (a comment says what it should be); `[bug]` marks a defect — a
 * crash, a wrong exit code, a green run over nothing. A scene the plan has fixed drops its
 * prefix and asserts the corrected behaviour, with a comment saying what it used to do.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PLAYGROUND = join(HERE, '..');

/** The engine, and only the engine — what `pnpm add -D specwarden` gives a consumer. */
const INSTALLED = Object.keys(
  (JSON.parse(readFileSync(join(PLAYGROUND, 'package.json'), 'utf8')) as { dependencies: Record<string, string> })
    .dependencies,
)
  .filter((name) => name === 'specwarden')
  .map((name) => [name, join(PLAYGROUND, 'node_modules', ...name.split('/'))] as const);

type Tree = Record<string, string>;
type Run = ReturnType<typeof warden>;

/** The repository the developer already has. */
const REPO: Tree = {
  'README.md': '# tiny\n\nThe entry is `src/index.ts`, helpers in `src/util.ts`. See `docs/usage.md`.\n',
  'package.json': `${JSON.stringify({ name: 'tiny', type: 'module', scripts: { lint: 'eslint src', test: 'node --test' } }, null, 2)}\n`,
  'src/index.ts': "import { add } from './util';\nexport const main = () => add(1, 2);\n",
  'src/util.ts': 'export const add = (a: number, b: number) => a + b;\n',
  'src/format.ts': 'export const fmt = (n: number) => `${n}`;\n',
  'src/types.ts': 'export type N = number;\n',
  'docs/usage.md': '# Usage\n\nRun `npm test`.\n',
  '.github/workflows/ci.yml':
    'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n',
};

const HARNESS = ['rule-owner-resolves', 'rule-coverage', 'orphan-check', 'enforcement-resolves', 'ratchet-direction'];
const CHECKS = '.specwarden/checks';
const RULE = "rule: { statement: 'no TODO in shipped source', owner: 'README.md' }";
const fp = (opts: string) =>
  `import { forbidPattern } from 'specwarden';\nexport const check = forbidPattern({ ${opts} });\n`;
const NO_TODO = fp(`id: 'no-todo', title: 'no TODO in src', tier: 'fast', in: 'src/**/*.ts', pattern: /TODO/, ${RULE}`);
const TODO_IN_UTIL: Tree = { 'src/util.ts': '// TODO: remove\n' };

const said = (r: Run) => r.stdout + r.stderr;
const git = (dir: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=a', '-c', 'user.email=a@a.invalid', ...args], { cwd: dir, encoding: 'utf8' });
const put = (dir: string, rel: string, text: string) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};
const commit = (dir: string) => {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '--no-verify', '--allow-empty', '-m', 'step']);
};
const nodeTest = (dir: string, rel: string) =>
  spawnSync(process.execPath, ['--test', rel], { cwd: dir, encoding: 'utf8' });
const ratchetFile = (dir: string, id: string) =>
  JSON.parse(readFileSync(join(dir, '.specwarden/ratchets', `${id}.json`), 'utf8')) as { value: number };

/** The files a command left untracked under `sub` — what it wrote. */
const writtenUnder = (dir: string, sub: string): Tree =>
  Object.fromEntries(
    git(dir, ['ls-files', '--others', '--', sub])
      .trim()
      .split('\n')
      .map((f) => [f, readFileSync(join(dir, f), 'utf8')]),
  );

/** Set environment variables for the duration of `fn` — `warden` spawns with `process.env`. */
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const apply = (v: Record<string, string | undefined>) => {
    for (const [k, x] of Object.entries(v))
      if (x === undefined) delete process.env[k];
      else process.env[k] = x;
  };
  apply(vars);
  try {
    return fn();
  } finally {
    apply(saved);
  }
}
const LOCAL = { CI: undefined, GITHUB_ACTIONS: undefined };

const open: string[] = [];
/** A scratch repository — the developer's tree, plus `init`'s output unless told otherwise. */
function repo(extra: Tree = {}, { initialised = true } = {}): string {
  const dir = scratchTree({ ...REPO, ...(initialised ? INIT : {}), ...extra }, { installed: INSTALLED });
  open.push(dir);
  return dir;
}
/** One repository, several CLI runs, torn down. */
function scene(extra: Tree, ...runs: string[][]): Run[] {
  const dir = repo(extra);
  return runs.map((args) => warden(dir, args));
}

/** What `init` wrote into REPO, captured once and reused as every later scene's config.
 * No NODE_PATH workaround: the harness drops it, so a scene with only the engine installed
 * resolves only the engine. */
let INIT: Tree = {};
let initRun: Run;
beforeAll(() => {
  const dir = repo({}, { initialised: false });
  initRun = warden(dir, ['init']);
  INIT = writtenUnder(dir, '.specwarden');
});
afterAll(() => {
  open.forEach(removeScratch);
});

describe('1. adopt', () => {
  let r: Run;
  beforeAll(() => (r = warden(repo({}, { initialised: false }), ['adopt'])));

  it('reports what the repository is, and writes nothing', () => {
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('doc directories : docs');
    expect(r.stdout).toContain('Nothing is enabled for you.');
  });

  // Should: name the language, the workflow and the README's path references — init detects the workflow.
  it('[friction] reports `node --test` as "other" and says nothing of the CI workflow or the README', () => {
    expect(r.stdout).toContain('test runner     : other');
    expect(r.stdout).not.toMatch(/github|workflow|README/i);
    expect(initRun.stdout).toContain('github actions');
  });

  // It said to copy suggestions into warden.config.mjs — a file that did not exist yet, and
  // not where a check lives.
  it('names init and the checks folder, and never the config', () => {
    expect(r.stdout).toContain(
      'Next: `specwarden init` writes .specwarden/, one check per file under its checks folder.',
    );
    expect(r.stdout).not.toContain('warden.config.mjs');
  });
});

describe('2. suggest', () => {
  const services = (n: number, withSpec: number): Tree =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [
        [`src/s${i}.service.ts`, 'export class S {}\n'],
        ...(i < withSpec ? [[`src/s${i}.service.spec.ts`, 'test\n']] : []),
      ]).flat(),
    );
  const suggestOver = (extra: Tree) => warden(repo(extra, { initialised: false }), ['suggest']);

  // Should: know one habit an ordinary repository has — it only knows `*.service.ts`/`*.controller.ts`.
  it('[friction] has nothing to say about an ordinary TypeScript repository', () => {
    const r = suggestOver({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('No convention crossed the consistency threshold');
  });

  it('proposes a convention followed 100%, and one at 90% with its exception named', () => {
    const all = suggestOver(services(10, 10));
    expect(all.stdout).toContain('100% of **/*.service.ts have {name}.spec.ts (10 of 10).');
    expect(all.stdout).toContain(
      "siblingRequired({ subjects: '**/*.service.ts', require: '{name}.spec.ts' }), ratchet 0.",
    );
    const most = suggestOver(services(10, 9));
    expect(most.stdout).toContain('90% of **/*.service.ts');
    expect(most.stdout).toContain('exceptions: src/s9.service.ts');
  });

  // Should: mention the near miss ("85% of … — below the 90% threshold") rather than stay silent.
  it('[friction] says nothing at all about a convention followed 85%', () => {
    expect(suggestOver(services(20, 17)).stdout).toContain('nothing to suggest');
  });

  // It was refused as "exports no check" — it did export one, only without an id. The file
  // names it now; the rule it lacks is what orphan-check still asks for.
  it('the suggestion pasted verbatim loads, named after its file, and holds over the tree', () => {
    const [r] = scene(
      {
        ...services(10, 10),
        [`${CHECKS}/tests/sibling.check.mjs`]: `import { siblingRequired } from 'specwarden';\nexport const check = siblingRequired({ subjects: '**/*.service.ts', require: '{name}.spec.ts' });\n`,
      },
      ['check', '--all'],
    );
    expect(r.stderr).not.toContain('exports no check');
    expect(r.stdout).toContain('▶ sibling — sibling\n✓ sibling — 10 file(s) examined, clean\n✅ sibling');
    expect(r.stdout).toContain('1 check(s) enforce no declared rule: sibling');
  });
});

describe('3. init, no template', () => {
  it('writes four files and says what each is for', () => {
    expect(initRun.status).toBe(0);
    expect(Object.keys(INIT).sort()).toEqual([
      '.specwarden/README.md',
      '.specwarden/checks/README.md',
      '.specwarden/rules.mjs',
      '.specwarden/warden.config.mjs',
    ]);
    expect(INIT['.specwarden/rules.mjs']).toContain('export const rules = [');
  });

  let all: Run, list: Run, doctor: Run, again: Run;
  beforeAll(
    () => ([all, list, doctor, again] = scene({}, ['check', '--all'], ['check', '--list'], ['doctor'], ['init'])),
  );

  it('is green on the first `check --all`, `--list` and `doctor`: the five harness audits', () => {
    expect(all.status).toBe(0);
    expect(all.stdout).toContain('✅ 5 gate(s) passed');
    expect(
      list.stdout
        .trim()
        .split('\n')
        .map((l) => l.split('\t')[0]),
    ).toEqual(HARNESS);
    expect(doctor.status).toBe(0);
  });

  // Should: say 0 declared — or name the harness's own rule — when rules.mjs is empty.
  it('[friction] doctor counts "declared: 1, enforced: 1" over an empty rule register, unnamed', () => {
    expect(doctor.stdout).toContain('  declared: 1\n  enforced: 1\n');
  });

  // Should: the checks README should list the modules to install; `docPaths`/`secretScan` are not in the engine.
  it('[friction] init says "the checks README lists what to add" — it lists nothing, and names factories not installed', () => {
    expect(initRun.stdout).toContain('the checks README lists what to add');
    expect(INIT['.specwarden/checks/README.md']).toContain('_(none yet)_');
    expect(INIT['.specwarden/checks/README.md']).toContain('`docPaths`, `secretScan`');
  });

  // It carried an id, a title and no rule, and pasted it turned orphan-check red.
  it('the checks README example, pasted, names its rule and is no orphan', () => {
    const readme = INIT['.specwarden/checks/README.md'];
    const example = /```js\n([\s\S]*?)```/.exec(readme.slice(readme.indexOf('## Adding a check')))?.[1] ?? '';
    expect(example).toContain("rule: 'Nothing merges while the linter is red.'");
    expect(example).not.toMatch(/\bid:/);
    const [r] = scene({ [`${CHECKS}/tooling/lint.check.mjs`]: example }, ['check', '--id', 'orphan-check']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('a second init is refused, and says why', () => {
    expect(again.status).toBe(2);
    expect(again.stderr).toContain('already exists — init refuses to overwrite a config.');
  });
});

describe('4. new no-todo-in-src --family hygiene', () => {
  const DIR = `${CHECKS}/hygiene`;
  const CHECK = `${DIR}/no-todo-in-src.check.mjs`;
  const TEST = `${DIR}/no-todo-in-src.check.test.mjs`;
  /** The edits a developer makes to the scaffold: the minimum for "no TODO in src/**\/*.ts". */
  const CHECK_EDITS: [string, string][] = [
    [
      "const isWrong = undefined; // for example: (doc) => doc.text.includes('TODO')",
      "const isWrong = (doc) => doc.text.includes('TODO');",
    ],
    ["rule: 'state the assertion that must hold'", "rule: 'shipped source carries no TODO'"],
    ["when: { ending: ['.md'] }", "when: { under: ['src/'] }"],
    ["hint: 'one line telling a person how to fix a failure'", "hint: 'resolve the TODO, or move it to an issue'"],
    ["'**/*.md'", "'src/**/*.ts'"],
    ['`${doc.file}: say what is wrong and what to do about it.`', '`${doc.file}: TODO in shipped source.`'],
    ["return { findings, examined, unit: 'documents' };", "return { findings, examined, unit: 'files' };"],
  ];
  const TEST_EDITS: [string, string][] = [
    ["{ 'docs/a.md': 'fine' }", "{ 'src/a.ts': 'fine' }"],
    ["{ 'docs/a.md': 'the wrong thing' }", "{ 'src/a.ts': '// TODO' }"],
    ['/docs\\/a\\.md/', '/src\\/a\\.ts/'],
    ["check.when(['src/a.ts']), false", "check.when(['docs/a.md']), false"],
    ["check.when(['docs/a.md']), true", "check.when(['src/a.ts']), true"],
  ];
  const edit = (text: string, edits: [string, string][]) =>
    edits.reduce((t, [from, to]) => {
      expect(t).toContain(from);
      return t.replace(from, to);
    }, text);

  let dir: string;
  let scaffolded: Run;
  beforeAll(() => {
    dir = repo(TODO_IN_UTIL);
    scaffolded = warden(dir, ['new', 'no-todo-in-src', '--family', 'hygiene']);
    commit(dir);
  });

  // It held `as const` in a `.mjs`, and the next run died on a SyntaxError with exit 1.
  it('the scaffold — a check and its test, side by side — is plain JavaScript that loads, and is RED until written', () => {
    expect(scaffolded.stdout).toContain(`wrote ${CHECK}\nwrote ${TEST}`);
    const r = warden(dir, ['check', '--id', 'no-todo-in-src']);
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain('SyntaxError');
    expect(r.stdout).toContain(
      `the condition of no-todo-in-src is not written yet — write \`isWrong\` in ${CHECK}.\n❌ no-todo-in-src FAILED`,
    );
  });

  // It filtered on `false` — green over a TODO — and its "fails" test asserted `ok === true`, 4/4.
  it('its generated test fails until the condition is written: the failing case asserts the failure', () => {
    const run = nodeTest(dir, TEST);
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/ℹ pass 2\nℹ fail 2\n/);
    expect(run.stdout).toContain('✖ fails, and names the file, when the rule is broken');
  });

  it('filled in: 7 lines edited in the check and 5 in the test; red over a TODO, green over clean, test green', () => {
    put(dir, CHECK, edit(readFileSync(join(dir, CHECK), 'utf8'), CHECK_EDITS));
    put(dir, TEST, edit(readFileSync(join(dir, TEST), 'utf8'), TEST_EDITS));
    expect(git(dir, ['diff', '--numstat']).trim().split('\n')).toEqual([`7\t7\t${CHECK}`, `5\t5\t${TEST}`]);
    commit(dir);
    const red = warden(dir, ['check', '--id', 'no-todo-in-src']);
    expect(red.status).toBe(1);
    expect(red.stdout).toContain('src/util.ts: TODO in shipped source.');
    expect(red.stdout).toContain('💡 resolve the TODO, or move it to an issue');
    put(dir, 'src/util.ts', 'export const add = 1;\n');
    commit(dir);
    const green = warden(dir, ['check', '--id', 'no-todo-in-src']);
    expect(green.status).toBe(0);
    expect(green.stdout).toContain('4 files examined, clean');
    expect(nodeTest(dir, TEST).stdout).toMatch(/pass 4/);
  });

  it('refuses to overwrite (exit 1) and refuses a bad id (exit 2)', () => {
    expect(warden(dir, ['new', 'no-todo-in-src', '--family', 'hygiene']).status).toBe(1);
    expect(warden(dir, ['new', 'Bad_Id']).stderr).toContain("'Bad_Id' is not a usable check id.");
  });

  // Should: refuse (or offer init) — the check it writes is run by nothing until a config exists.
  it('[friction] `new` before `init` writes a check under a .specwarden/ that `check` then refuses', () => {
    const bare = repo({}, { initialised: false });
    expect(warden(bare, ['new', 'x-y']).status).toBe(0);
    const r = warden(bare, ['check']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('no .specwarden/warden.config.mjs found');
  });
});

describe('5. the same rule as one forbidPattern file', () => {
  it('two lines, one statement: red, naming the file — and both reporters lead with its line', () => {
    const [tty, gh] = scene(
      { ...TODO_IN_UTIL, [`${CHECKS}/hygiene/no-todo.check.mjs`]: NO_TODO },
      ['check', '--all'],
      ['check', '--all', '--reporter', 'github'],
    );
    expect(NO_TODO.split('\n').filter(Boolean)).toHaveLength(2);
    expect(tty.status).toBe(1);
    // The terminal printed the message alone; `file:line` leads it now, as the annotation does.
    expect(tty.stdout).toContain('src/util.ts:1 forbidden pattern in src/util.ts: TODO\n');
    expect(gh.stdout).toContain('::error title=no-todo,file=src/util.ts,line=1::');
  });

  it('the one-line check: the pattern, where, and the rule as a string — the file names it, owns it, and it runs', () => {
    const one = `import { forbidPattern } from 'specwarden';\nexport const check = forbidPattern({ in: 'src/**/*.ts', pattern: /TODO/, rule: 'no TODO in shipped source' });\n`;
    const [r] = scene({ ...TODO_IN_UTIL, [`${CHECKS}/hygiene/no-todo.check.mjs`]: one }, ['check', '--all', '--json']);
    const rows = (JSON.parse(r.stdout) as { results: { id: string; ok: boolean; tier: string }[] }).results;
    expect(rows.filter((x) => !x.ok).map((x) => x.id)).toEqual(['no-todo']);
    expect(rows.find((x) => x.id === 'no-todo')?.tier).toBe('fast');
  });

  // The hint pointed at rules.mjs; the smallest fix is one line on the check itself.
  it('without `rule`, orphan-check is red and its hint names the one-line fix on the check', () => {
    const bare = fp("id: 'no-todo', title: 't', tier: 'fast', in: 'src/**/*.ts', pattern: /TODO/");
    const [r] = scene({ [`${CHECKS}/hygiene/no-todo.check.mjs`]: bare }, ['check', '--all']);
    expect(r.stdout).toContain('1 check(s) enforce no declared rule: no-todo');
    expect(r.stdout).toContain("💡 Add `rule: '<the statement it enforces>'` to the check");
  });

  it('a glob that matches nothing is a legible red, not a green', () => {
    const miss = fp(`id: 'no-todo', title: 't', tier: 'fast', in: 'source/**/*.ts', pattern: /TODO/, ${RULE}`);
    const [r] = scene({ [`${CHECKS}/hygiene/no-todo.check.mjs`]: miss }, ['check', '--id', 'no-todo']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('`source/**/*.ts` matched nothing to scan — below the floor of 1.');
  });

  // It was absent from every `--tier` (exit 0 over a TODO) and listed its title as "undefined".
  it('with no `tier`, the check is in `fast`, red there; with no title, the title is the rule', () => {
    const noTier = fp(`id: 'no-todo', in: 'src/**/*.ts', pattern: /TODO/, ${RULE}`);
    const [all, fast] = scene(
      { ...TODO_IN_UTIL, [`${CHECKS}/hygiene/no-todo.check.mjs`]: noTier },
      ['check', '--all'],
      ['check', '--tier', 'fast'],
    );
    expect(all.status).toBe(1);
    expect(all.stdout).toContain('▶ no-todo — no TODO in shipped source');
    expect(fast.status).toBe(1);
    expect(fast.stdout).toContain('❌ no-todo FAILED');
  });

  // It scanned the working tree, so a scratch file turned a CI-parity run red on one machine.
  it('forbidPattern scans tracked files only — an untracked scratch file is not the repository', () => {
    const dir = repo({
      [`${CHECKS}/hygiene/no-todo.check.mjs`]: fp(
        `id: 'no-todo', title: 't', tier: 'fast', in: '**/*.ts', pattern: /TODO/, ${RULE}`,
      ),
    });
    put(dir, 'scratch/untracked.ts', '// TODO untracked\n');
    const r = warden(dir, ['check', '--id', 'no-todo']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('scratch/untracked.ts');
    commit(dir);
    expect(warden(dir, ['check', '--id', 'no-todo']).stdout).toContain('forbidden pattern in scratch/untracked.ts');
  });
});

describe('6. ratchets', () => {
  const THREE: Tree = { 'src/index.ts': '// TODO a\n', 'src/util.ts': '// TODO b\n', 'src/format.ts': '// TODO c\n' };
  const ratcheted = (inline: string) =>
    fp(
      `id: 'no-todo', title: 'no TODO in src', tier: 'fast', in: 'src/**/*.ts', pattern: /TODO/, ratchetId: 'no-todo', ${inline}${RULE}`,
    );

  it('armed at 3: green at 3, red at 4; two paid and --tighten moves the file to 1, which cannot move back up', () => {
    const dir = repo({ ...THREE, [`${CHECKS}/hygiene/no-todo.check.mjs`]: ratcheted('ratchet: 3, ') });
    const armed = warden(dir, ['check', '--id', 'no-todo']);
    expect(armed.status).toBe(0);
    expect(armed.stdout).toContain('↑ 3 pre-existing violation(s) tolerated under ratchet 3');
    put(dir, 'src/types.ts', '// TODO d\n');
    commit(dir);
    const fourth = warden(dir, ['check', '--id', 'no-todo']);
    expect(fourth.status).toBe(1);
    // Should: say "4 violations, ratchet 3" — the red run lists four findings and never names the ratchet.
    expect(fourth.stdout).not.toContain('ratchet');
    for (const f of ['src/types.ts', 'src/index.ts', 'src/util.ts']) put(dir, f, 'x\n');
    commit(dir);
    const tightened = warden(dir, ['check', '--id', 'no-todo', '--tighten']);
    expect(tightened.status).toBe(0);
    // Should: say what it recorded ("no-todo: 3 → 1"); the run prints nothing about the write.
    expect(said(tightened)).not.toMatch(/→ 1|recorded|wrote/);
    expect(ratchetFile(dir, 'no-todo').value).toBe(1);
    put(dir, 'src/index.ts', '// TODO again\n');
    commit(dir);
    expect(warden(dir, ['check', '--id', 'no-todo', '--tighten']).status).toBe(1);
    expect(ratchetFile(dir, 'no-todo').value).toBe(1);
  });

  // It recorded 3: the bar moved 0 → 3 and the next run was green — `--tighten` loosening.
  it('with no inline ratchet, --tighten on a red run records nothing, and the next run is still red', () => {
    const dir = repo({ ...THREE, [`${CHECKS}/hygiene/no-todo.check.mjs`]: ratcheted('') });
    expect(warden(dir, ['check', '--id', 'no-todo']).status).toBe(1);
    expect(warden(dir, ['check', '--id', 'no-todo', '--tighten']).status).toBe(1);
    expect(existsSync(join(dir, '.specwarden/ratchets/no-todo.json'))).toBe(false);
    commit(dir);
    const after = warden(dir, ['check', '--all']);
    expect(after.status).toBe(1);
    expect(after.stdout).toContain('❌ no-todo FAILED');
  });

  // It wrote 4 — above the ceiling — and the audit that caught it said to run --tighten.
  it('armed at 3 with 4 present, --tighten writes nothing; the next run is red where it should be, the store clean', () => {
    const dir = repo({
      ...THREE,
      'src/types.ts': '// TODO d\n',
      [`${CHECKS}/hygiene/no-todo.check.mjs`]: ratcheted('ratchet: 3, '),
    });
    expect(warden(dir, ['check', '--id', 'no-todo', '--tighten']).status).toBe(1);
    expect(existsSync(join(dir, '.specwarden/ratchets/no-todo.json'))).toBe(false);
    commit(dir);
    const r = warden(dir, ['check', '--all']);
    expect(r.stdout).toContain('❌ no-todo FAILED');
    expect(r.stdout).not.toContain('above the ceiling');
    expect(r.stdout).toContain('✅ ratchet-direction');
  });
});

describe('7. --fix over a regenerable artifact', () => {
  const GEN = "process.stdout.write(['index', 'util'].map((n) => `export * from './${n}';`).join('\\n') + '\\n');\n";
  const FRESH = "export * from './index';\nexport * from './util';\n";
  const regen = (fixable: boolean) =>
    `import { regenerable } from 'specwarden';\nexport const check = regenerable({ id: 'barrel-fresh', title: 'the barrel is generated', tier: 'fast', artifact: 'src/barrel.ts', by: 'node scripts/gen.mjs', ${fixable ? 'fixable: true, ' : ''}${RULE} });\n`;
  const stale = (fixable: boolean) =>
    repo({
      'scripts/gen.mjs': GEN,
      'src/barrel.ts': `${FRESH}export * from './by-hand';\n`,
      [`${CHECKS}/generated/barrel-fresh.check.mjs`]: regen(fixable),
    });

  it('red on a hand edit, and --fix writes the generator output back and reports what remains', () => {
    const dir = stale(true);
    expect(warden(dir, ['check', '--id', 'barrel-fresh']).stdout).toContain(
      '`specwarden check --fix` writes it for you.',
    );
    const fixed = warden(dir, ['check', '--id', 'barrel-fresh', '--fix']);
    expect(fixed.status).toBe(0);
    expect(fixed.stdout).toContain('fixed 1 finding(s): regenerated src/barrel.ts');
    expect(readFileSync(join(dir, 'src/barrel.ts'), 'utf8')).toBe(FRESH);
  });

  // It was silent, so the red run after `--fix` read as a repair that failed.
  it('--fix over a check with no fix says so, and the run stays red', () => {
    const r = warden(stale(false), ['check', '--id', 'barrel-fresh', '--fix']);
    expect(r.status).toBe(1);
    expect(said(r)).toContain('barrel-fresh has no fix — --fix repairs only what a check can derive');
  });
});

describe('8. the edges of the CLI', () => {
  it('no config: check, doctor and migrate exit 2 and say so; init with no package.json works and is green', () => {
    const bare = repo({}, { initialised: false });
    for (const cmd of ['check', 'doctor', 'migrate']) {
      const r = warden(bare, [cmd]);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('no .specwarden/warden.config.mjs found');
    }
    const noManifest = Object.fromEntries(Object.entries(REPO).filter(([k]) => k !== 'package.json'));
    const dir = scratchTree(noManifest, { installed: INSTALLED });
    open.push(dir);
    expect(warden(dir, ['init']).status).toBe(0);
    commit(dir);
    expect(warden(dir, ['check', '--all']).status).toBe(0);
  });

  it('migrate says the config is current; --json has a fixed shape; init --template names the missing package', () => {
    const [migrate, json] = scene(
      { ...TODO_IN_UTIL, [`${CHECKS}/hygiene/no-todo.check.mjs`]: NO_TODO },
      ['migrate'],
      ['check', '--all', '--json'],
    );
    expect(migrate.stdout).toContain('config is at version 1, the current version — nothing to migrate.');
    const parsed = JSON.parse(json.stdout) as { results: Record<string, unknown>[] };
    // `--all` is a full run, and the document says why.
    expect(Object.keys(parsed).sort()).toEqual(['fullRunReason', 'results', 'totalMs']);
    expect(Object.keys(parsed.results[0]).sort()).toEqual([
      'advisory',
      'durationMs',
      'findings',
      'id',
      'ok',
      'skipped',
      'tier',
    ]);
    expect(parsed.results[0].findings).toEqual([
      {
        severity: 'error',
        file: 'src/util.ts',
        line: 1,
        message: 'forbidden pattern in src/util.ts: TODO',
        ruleId: 'no-todo',
      },
    ]);
    const tpl = warden(repo({}, { initialised: false }), ['init', '--template', 'node-ts']);
    expect(tpl.status).toBe(2);
    expect(tpl.stderr).toContain('the package @specwarden/template-node-ts is not installed here.');
  });

  // It printed the tab-separated list.
  it('`check --list --json` prints the roster as JSON', () => {
    const [r] = scene({}, ['check', '--list', '--json']);
    expect(Array.isArray(JSON.parse(r.stdout))).toBe(true);
  });

  describe('SPECWARDEN_SKIP', () => {
    let dir: string;
    beforeAll(() => (dir = repo({ ...TODO_IN_UTIL, [`${CHECKS}/hygiene/no-todo.check.mjs`]: NO_TODO })));
    const run = (env: Record<string, string | undefined>, args = ['check', '--all']) =>
      withEnv({ ...LOCAL, SPECWARDEN_SKIP: 'no-todo', ...env }, () => warden(dir, args));

    it('is honoured locally and said; ignored under CI=true; an unknown id in it is refused', () => {
      const local = run({});
      expect(local.status).toBe(0);
      expect(local.stdout).toContain('✅ 5 gate(s) passed (1 skipped)');
      expect(run({ CI: 'true' }, ['check', '--id', 'no-todo']).status).toBe(1);
      const typo = run({ SPECWARDEN_SKIP: 'no-tod' });
      expect(typo.status).toBe(2);
      expect(typo.stderr).toContain('unknown check id(s) in skip: no-tod');
    });

    // Only CI=true counted: under CI=1 the skip reached the arbiter and a red gate exited 0.
    it('CI=1 and CI=True are CI: the skip is ignored and the red gate fails', () => {
      expect(run({ CI: '1' }, ['check', '--id', 'no-todo']).status).toBe(1);
      expect(run({ CI: 'True' }, ['check', '--id', 'no-todo']).status).toBe(1);
      expect(run({ CI: 'false' }, ['check', '--id', 'no-todo']).status).toBe(0);
    });

    // "✅ 0 gate(s) passed (1 skipped)" was a green tick over nothing. The skip is the person's
    // own, locally, so the exit stays 0 — and the line says that nothing ran.
    it('a check named by --id and skipped by the environment says nothing ran, exit 0', () => {
      const r = run({}, ['check', '--id', 'no-todo']);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('⏭  nothing ran — 1 skipped, 0 checked');
      expect(r.stdout).not.toContain('✅');
    });
  });

  // It printed the usage to stderr and exited 2, as if asking for help were a mistake.
  it('--help prints the usage to stdout and exits 0', () => {
    const r = warden(repo({}, { initialised: false }), ['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('usage: specwarden <command>');
    expect(r.stderr).toBe('');
  });

  // An unknown flag was ignored, and `--id` with no value ran every check.
  it('an unknown flag (`--tighen`, `--fixx`) and `--id` with no value exit 2 by name, running nothing', () => {
    const [tighen, fixx, bareId] = scene(
      { ...TODO_IN_UTIL, [`${CHECKS}/hygiene/no-todo.check.mjs`]: NO_TODO },
      ['check', '--tighen'],
      ['check', '--fixx'],
      ['check', '--id'],
    );
    expect([tighen, fixx, bareId].map((r) => [r.status, r.stdout])).toEqual([
      [2, ''],
      [2, ''],
      [2, ''],
    ]);
    expect(tighen.stderr).toContain('unknown flag --tighen.');
    expect(fixx.stderr).toContain('unknown flag --fixx.');
    expect(bareId.stderr).toContain('--id needs a value.');
  });
});

describe('9. newcomer mistakes', () => {
  const one = (file: string, text: string, args = ['check', '--all']) =>
    scene({ ...TODO_IN_UTIL, [`${CHECKS}/${file}`]: text }, args)[0];

  it('`export default` instead of `export const check` is accepted and runs', () => {
    const r = one('hygiene/no-todo.check.mjs', NO_TODO.replace('export const check =', 'export default'));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('forbidden pattern in src/util.ts');
  });

  // `--id <file name>` found nothing, with no clue why. The id a file states still wins — a
  // file exporting a plugin's checks carries several, none of them its name — so the refusal
  // names the file and the id it declares instead.
  it('an id that is not the file name loads; `--id <file name>` is refused naming the id the file declares', () => {
    const text = NO_TODO.replace("id: 'no-todo'", "id: 'no-todos'");
    expect(one('hygiene/no-todo.check.mjs', text).stdout).toContain('▶ no-todos');
    const r = one('hygiene/no-todo.check.mjs', text, ['check', '--id', 'no-todo']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(
      "unknown check id 'no-todo' — .specwarden/checks/hygiene/no-todo.check.mjs declares 'no-todos'",
    );
  });

  it('two files with one id are refused, naming both', () => {
    const [r] = scene(
      { [`${CHECKS}/hygiene/no-todo.check.mjs`]: NO_TODO, [`${CHECKS}/style/no-todo.check.mjs`]: NO_TODO },
      ['check', '--all'],
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(
      "check id 'no-todo' is exported by both .specwarden/checks/hygiene/no-todo.check.mjs and .specwarden/checks/style/no-todo.check.mjs.",
    );
  });

  // It loaded, ran under --all, and was silently absent from `--tier fast`.
  it("`tier: 'fastt'` is refused at load — exit 2, naming the check, its file and the tiers", () => {
    const text = NO_TODO.replace("tier: 'fast'", "tier: 'fastt'");
    for (const args of [
      ['check', '--all'],
      ['check', '--tier', 'fast'],
    ]) {
      const r = one('hygiene/no-todo.check.mjs', text, args);
      expect([r.status, r.stdout]).toEqual([2, '']);
      expect(r.stderr).toContain(
        'check \'no-todo\' (.specwarden/checks/hygiene/no-todo.check.mjs) declares tier "fastt" — expected one of: fast, heavy, nightly.',
      );
    }
    const asked = one('hygiene/no-todo.check.mjs', text, ['check', '--tier', 'fastt']);
    expect(asked.status).toBe(2);
    expect(asked.stderr).toContain('unknown tier "fastt" — expected one of: fast, heavy, nightly');
  });

  it('a rule whose owner document is missing turns rule-owner-resolves red, legibly', () => {
    const r = one('hygiene/no-todo.check.mjs', NO_TODO.replace("owner: 'README.md'", "owner: 'docs/CONVENTIONS.md'"));
    expect(r.stdout).toContain("names owner 'docs/CONVENTIONS.md', whose document docs/CONVENTIONS.md does not exist");
  });

  // Should: suggest the nearest id ("did you mean no-todo?").
  it('[friction] `--id` with a typo exits 2 with no suggestion', () => {
    const r = one('hygiene/no-todo.check.mjs', NO_TODO, ['check', '--id', 'no-tod']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown check id 'no-tod'");
    expect(r.stderr).not.toMatch(/did you mean|no-todo\b/);
  });

  // They were silently not discovered: green over a TODO.
  it('`no-todo.check.ts` and `no-todo.check.js` are refused at load with the rename — never skipped', () => {
    for (const ext of ['ts', 'js']) {
      const r = one(`hygiene/no-todo.check.${ext}`, NO_TODO);
      expect([r.status, r.stdout]).toEqual([2, '']);
      expect(r.stderr).toContain(
        `Rename it: .specwarden/checks/hygiene/no-todo.check.${ext} → .specwarden/checks/hygiene/no-todo.check.mjs.`,
      );
    }
  });

  // It crashed the CLI with a raw stack and exit 1 ("contract vundefined").
  it('a hand-written check object is a load error — exit 2, the file named, the fix given, no stack', () => {
    const r = one(
      'hygiene/no-todo.check.mjs',
      "export const check = { id: 'no-todo', title: 't', tier: 'fast', run: () => ({ ok: true, findings: [] }) };\n",
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(
      ".specwarden/checks/hygiene/no-todo.check.mjs: 'no-todo' is a hand-written object, not a built check",
    );
    expect(r.stderr).toContain('Wrap the body in `defineCheck({ … })`');
    expect(r.stderr).not.toMatch(/\n\s+at /);
  });

  // It was green over zero files: `✓ no-todo — clean`.
  it('`corpus: { atLeast: 1 }` with a body returning a bare array is red — the floor needs a count', () => {
    const text = `import { defineCheck, readTracked } from 'specwarden';\nexport const check = defineCheck({ id: 'no-todo', title: 't', ${RULE}, corpus: { atLeast: 1 }, run: (ctx) => readTracked(ctx.vcs, ctx.files, 'source/**/*.ts').filter((d) => d.text.includes('TODO')).map((d) => ({ severity: 'error', file: d.file, message: 'TODO' })) });\n`;
    const r = one('hygiene/no-todo.check.mjs', text);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('no-todo declares `corpus: { atLeast: 1 }`, and its body reported no `examined` count');
  });

  // Should: the guide's first example should carry `rule`, since init turns the rule audits on.
  it('the guide’s §3 example, pasted verbatim at the path it names, is green under the config init wrote', () => {
    // It was red on orphan-check: the example carried an id, a title and a tier and no rule.
    // It now carries only the rule, and takes its id from the file it says to write.
    const guide = readFileSync(join(PLAYGROUND, '..', 'core', 'GUIDE.md'), 'utf8');
    const example = /## 3\. A check\r?\n\r?\n```js\r?\n([\s\S]*?)```/.exec(guide)?.[1] ?? '';
    expect(example).toContain('// .specwarden/checks/hygiene/no-todo-in-src.check.mjs');
    expect(example).toContain("rule: 'no TODO left in shipped source'");
    expect(example).not.toMatch(/\bid:|\btitle:|\btier:/);
    const r = scene({ [`${CHECKS}/hygiene/no-todo-in-src.check.mjs`]: example }, ['check', '--all'])[0];
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('✓ no-todo-in-src — 4 file(s) examined, clean');
  });
});
