import { describe, expect, it } from 'vitest';

import type { ICheck } from '../domain';
import { commandCheck } from '../runtime/runner/command-check/command-check.check';
import { zoneBoundary } from '../checks/zone-boundary/zone-boundary.check';
import { errorsOf, runCheck } from '../testing';
import {
  CheckOptionsError,
  defineCheck,
  forbidImport,
  forbidPattern,
  fromResult,
  mustDeclare,
  pathContract,
  referencesResolve,
  regenerable,
  siblingRequired,
  sourcesAgree,
} from './index';

/**
 * Every factory checks its options where the file wrote them, and every primitive reads
 * the TRACKED set and refuses to pass over an empty one. Each case is a defect on record:
 * a missing `pattern` crashed the run, a misspelled `except` was dropped in silence, a
 * `**\/*.md` over the working tree found `node_modules/`.
 */

const refusal = (build: () => unknown): string => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(CheckOptionsError);
    return (error as Error).message;
  }
  throw new Error('the factory accepted what it should have refused');
};

const infos = (findings: readonly { severity: string; message: string }[]) =>
  findings.filter((f) => f.severity === 'info').map((f) => f.message);

describe('every factory checks its options by name when the file loads', () => {
  it.each<[string, () => unknown, string]>([
    [
      'forbidPattern, no pattern',
      () => forbidPattern({ id: 'x', in: 'src/**' } as never),
      "forbidPattern 'x': `pattern` is required",
    ],
    [
      'forbidPattern, a string pattern',
      () => forbidPattern({ in: 'a', pattern: 'TODO' } as never),
      '`pattern` must be a RegExp',
    ],
    [
      'forbidPattern, a misspelled except',
      () => forbidPattern({ in: 'a', pattern: /x/, excpet: [] } as never),
      '`excpet` is not an option of forbidPattern',
    ],
    ['forbidImport, no to', () => forbidImport({ from: 'src/**' } as never), '`to` is required'],
    [
      'pathContract, a string allowedIn',
      () => pathContract({ kind: '**/*.md', allowedIn: 'docs/**' } as never),
      '`allowedIn` must be an array',
    ],
    ['siblingRequired, no require', () => siblingRequired({ subjects: 'src/*.ts' } as never), '`require` is required'],
    ['mustDeclare, no fields', () => mustDeclare({ files: 'docs/*.md' } as never), '`fields` is required'],
    [
      'referencesResolve, a string extract',
      () => referencesResolve({ in: 'a', extract: 'x' } as never),
      '`extract` must be a RegExp',
    ],
    ['regenerable, no by', () => regenerable({ artifact: 'a.md' } as never), '`by` is required'],
    ['sourcesAgree, no b', () => sourcesAgree({ a: { name: 'a', extract: () => [] } } as never), '`b` is required'],
    ['defineCheck, no run', () => defineCheck({ id: 'x' } as never), "defineCheck 'x': `run` is required"],
    ['fromResult, no run', () => fromResult({ hint: 'h' } as never), '`run` is required'],
    ['commandCheck, no cmd', () => commandCheck({ hint: 'h' } as never), '`cmd` is required'],
    [
      'commandCheck, a string expect',
      () => commandCheck({ cmd: 'x', expect: '3 passed' } as never),
      '`expect` must be a RegExp or an array',
    ],
    [
      'zoneBoundary, no literals',
      () => zoneBoundary({ productSources: 'src/**' } as never),
      '`forbiddenLiterals` is required',
    ],
    [
      'a `when` that is a string',
      () => forbidPattern({ in: 'a', pattern: /x/, when: 'docs/' } as never),
      '`when` must be a function or an object',
    ],
  ])('%s', (_name, build, message) => {
    expect(refusal(build)).toContain(message);
  });

  it.each<[string, () => unknown, string]>([
    [
      'a mustDeclare field whose pattern is a string',
      () => mustDeclare({ files: 'a', fields: [{ name: 'O', pattern: 'O' }] } as never),
      '`fields[0]` must be { name: string, pattern: RegExp }',
    ],
    [
      'a referencesResolve extract with no capture group',
      () => referencesResolve({ in: 'a', extract: /Owner/ }),
      '`extract` /Owner/ has no capture group',
    ],
    [
      'a sourcesAgree side with no extract',
      () => sourcesAgree({ a: { name: 'a' }, b: { name: 'b', extract: () => [] } } as never),
      '`a` must be { name: string, extract: (ctx) => string[] }',
    ],
    [
      'a commandCheck refuse entry that is a string',
      () => commandCheck({ cmd: 'x', refuse: ['None'] } as never),
      'every `expect` entry must be a RegExp, and every `refuse` entry a RegExp',
    ],
    [
      'a commandCheck expect list holding a string',
      () => commandCheck({ id: 'c', cmd: 'x', expect: ['3'] } as never),
      "commandCheck 'c': every `expect` entry",
    ],
  ])('%s is refused by name, not failed in the platform’s words', (_name, build, message) => {
    expect(refusal(build)).toContain(message);
  });

  it('accepts a check written with only what it knows — the one-line check', async () => {
    const check = forbidPattern({ in: 'src/**/*.ts', pattern: /TODO/, rule: 'no TODO in shipped source' });
    expect([check.tier, check.title, check.rule]).toEqual([
      'fast',
      'no TODO in shipped source',
      { statement: 'no TODO in shipped source' },
    ]);
    expect((await runCheck(check, { tree: { 'src/a.ts': 'ok' } })).ok).toBe(true);
  });
});

describe('the primitives read TRACKED files, their exemptions included', () => {
  // Every file carries what each of the six reports, so a file read is a file named.
  const BAD = "TODO import 'x'; [a](gone.md)\n";
  const TREE = { 'docs/a.md': BAD, 'node_modules/p/README.md': BAD, 'dist/out.md': BAD };
  const TRACKED = ['docs/a.md'];

  it.each<[string, ICheck]>([
    ['forbidPattern', forbidPattern({ id: 'p', in: '**/*.md', pattern: /TODO/ })],
    ['forbidImport', forbidImport({ id: 'i', from: '**/*.md', to: 'x' })],
    ['pathContract', pathContract({ id: 'c', kind: '**/*.md', allowedIn: ['nowhere/**'] })],
    ['mustDeclare', mustDeclare({ id: 'm', files: '**/*.md', fields: [{ name: 'Owner', pattern: /Owner/ }] })],
    ['siblingRequired', siblingRequired({ id: 's', subjects: '**/*.md', require: '{name}.spec.ts' })],
    ['referencesResolve', referencesResolve({ id: 'r', in: '**/*.md', extract: /\]\(([^)]+)\)/ })],
  ])('%s never sees node_modules/ or dist/ — the working-tree glob found both', async (_name, check) => {
    const verdict = await runCheck(check, { tree: TREE, tracked: TRACKED });
    expect(verdict.findings.map((f) => f.file).filter(Boolean)).not.toContainEqual(
      expect.stringMatching(/node_modules|dist/),
    );
  });

  it('pathContract judges exactly the tracked file of its kind', async () => {
    const verdict = await runCheck(pathContract({ id: 'c', kind: '**/*.md', allowedIn: ['nowhere/**'] }), {
      tree: TREE,
      tracked: TRACKED,
    });
    expect(verdict.findings.filter((f) => f.severity === 'error').map((f) => f.file)).toEqual(['docs/a.md']);
  });

  it('an `except` is a pathspec over the tracked set too', async () => {
    const check = forbidPattern({ id: 'p', in: '**/*.md', pattern: /TODO/, except: ['docs/**'] });
    const verdict = await runCheck(check, {
      tree: { ...TREE, 'guide/b.md': 'TODO' },
      tracked: [...TRACKED, 'guide/b.md'],
    });
    expect(errorsOf(verdict)).toEqual(['forbidden pattern in guide/b.md: TODO']);
  });

  it('an `except` that exempts everything says so — the refusal blamed the glob', async () => {
    const check = forbidPattern({ id: 'p', in: 'docs/**', pattern: /TODO/, except: ['docs/**'] });
    expect(errorsOf(await runCheck(check, { tree: TREE, tracked: TRACKED }))[0]).toMatch(
      /^examined 0 file\(s\) — `docs\/\*\*` matched 1 file\(s\), and `except` exempted all of them — below the floor of 1\./,
    );
  });

  it('a tracked file deleted from the working tree is skipped, not a crash', async () => {
    const check = forbidPattern({ id: 'p', in: '**/*.md', pattern: /TODO/ });
    const verdict = await runCheck(check, { tree: { 'docs/a.md': 'fine' }, tracked: ['docs/a.md', 'docs/gone.md'] });
    expect(infos(verdict.findings)).toEqual(['✓ p — 1 file(s) examined, clean']);
  });

  it('zoneBoundary sweeps the tracked product sources', async () => {
    const check = zoneBoundary({
      id: 'z',
      productSources: 'src/**',
      forbiddenLiterals: [{ label: 'host', pattern: /host/ }],
    });
    const verdict = await runCheck(check, {
      tree: { 'src/a.ts': 'ok', 'src/scratch.ts': 'host' },
      tracked: ['src/a.ts'],
    });
    expect(verdict.ok).toBe(true);
  });
});

describe('pathContract, siblingRequired and mustDeclare carry the corpus floor and the examined line', () => {
  const cases: [string, ICheck, Record<string, string>][] = [
    ['pathContract', pathContract({ id: 'c', kind: 'pc/**/*.md', allowedIn: ['pc/**'] }), { 'pc/a.md': 'x' }],
    [
      'siblingRequired',
      siblingRequired({ id: 's', subjects: 'sr/*.service.ts', require: '{name}.spec.ts' }),
      { 'sr/a.service.ts': 'x', 'sr/a.service.spec.ts': 'x' },
    ],
    [
      'mustDeclare',
      mustDeclare({ id: 'm', files: 'md/*.md', fields: [{ name: 'O', pattern: /O/ }] }),
      { 'md/a.md': 'O' },
    ],
  ];

  it.each(cases)('%s refuses an empty corpus — it passed over nothing, saying nothing', async (_name, check) => {
    const verdict = await runCheck(check, { tree: {} });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toMatch(/^examined 0 file\(s\) — `.*` matched nothing to .* — below the floor of 1\./);
  });

  it.each(cases)('%s says what a clean pass examined', async (_name, check, tree) => {
    const verdict = await runCheck(check, { tree });
    expect([verdict.ok, infos(verdict.findings)]).toEqual([true, [`✓ ${check.id} — 1 file(s) examined, clean`]]);
  });

  it('mustDeclare honours a `corpus` it used to drop — and `atLeast: 0` still opts out', async () => {
    const floor = mustDeclare({
      id: 'm',
      files: 'no/*.md',
      fields: [{ name: 'O', pattern: /O/ }],
      corpus: { atLeast: 2 },
    });
    expect(errorsOf(await runCheck(floor, { tree: { 'no/a.md': 'O' } }))[0]).toContain('below the floor of 2');
    const none = mustDeclare({
      id: 'm',
      files: 'no/*.md',
      fields: [{ name: 'O', pattern: /O/ }],
      corpus: { atLeast: 0 },
    });
    expect((await runCheck(none, { tree: {} })).ok).toBe(true);
  });
});

describe('sourcesAgree and regenerable honour `ratchet`', () => {
  it('sourcesAgree tolerates the declared count, and fails past it', async () => {
    const build = (ratchet: number) =>
      sourcesAgree({
        id: 'x',
        ratchet,
        a: { name: 'a', extract: () => ['x', 'y'] },
        b: { name: 'b', extract: () => ['x'] },
      });
    expect((await runCheck(build(1))).ok).toBe(true);
    expect((await runCheck(build(0))).ok).toBe(false);
  });

  it('regenerable tolerates a stale artifact under a ratchet of 1, and a stored ratchet wins', async () => {
    const build = (ratchet?: number) => regenerable({ id: 'x', ratchet, artifact: 'gen.md', by: 'gen' });
    const exec = () => ({ status: 0, stdout: 'fresh\n', stderr: '' });
    expect((await runCheck(build(1), { tree: { 'gen.md': 'edited\n' }, exec })).ok).toBe(true);
    expect((await runCheck(build(1), { tree: { 'gen.md': 'edited\n' }, exec, ratchet: 0 })).ok).toBe(false);
    expect((await runCheck(build(), { tree: { 'gen.md': 'edited\n' }, exec })).ok).toBe(false);
  });

  it('regenerable says what a clean pass examined', async () => {
    const check = regenerable({ id: 'x', artifact: 'gen.md', by: 'gen' });
    const verdict = await runCheck(check, {
      tree: { 'gen.md': 'fresh\n' },
      exec: () => ({ status: 0, stdout: 'fresh\n', stderr: '' }),
    });
    expect(infos(verdict.findings)).toEqual(['✓ x — 1 artifact(s) examined, clean']);
  });
});

describe('forbidImport with a target written as a prefix', () => {
  it('`@db/` bans everything under `@db/` — it matched nothing', async () => {
    const check = forbidImport({ id: 'x', from: 'src/**', to: '@db/' });
    const tree = { 'src/a.ts': "import { q } from '@db/core';\nimport { r } from '@dbx';\n" };
    expect(errorsOf(await runCheck(check, { tree }))).toEqual([
      'src/a.ts imports `@db/core`, which is forbidden from src/**.',
    ]);
  });
});

describe('fromResult — a corpus, a count, and a return it understands', () => {
  const build = (run: () => unknown, extra = {}) => fromResult({ id: 'x', run: run as never, ...extra });

  it('says what it examined when the function says', async () => {
    const verdict = await runCheck(build(() => ({ errors: [], examined: 4, unit: 'files' })));
    expect(infos(verdict.findings)).toEqual(['✓ x — 4 files examined, clean']);
  });

  it('keeps notes, with the pass line only when there is a count to state', async () => {
    expect(infos((await runCheck(build(() => ({ notes: ['read 4'] })))).findings)).toEqual(['read 4']);
    expect(infos((await runCheck(build(() => ({ notes: ['n'], examined: 1 })))).findings)).toEqual([
      '✓ x — 1 items examined, clean',
      'n',
    ]);
  });

  it('holds a declared `corpus` against the count, and against its absence', async () => {
    const short = await runCheck(build(() => ({ errors: [], examined: 0 }), { corpus: { atLeast: 1 } }));
    expect(errorsOf(short)[0]).toMatch(/^examined 0 items, below the declared floor of 1\./);
    const uncounted = await runCheck(build(() => ({ errors: [] }), { corpus: { atLeast: 1 } }));
    expect(errorsOf(uncounted)[0]).toContain(
      'x declares `corpus: { atLeast: 1 }`, and its function reported no `examined` count',
    );
    const why = await runCheck(
      build(() => ({ examined: 0 }), { corpus: { atLeast: 3, why: 'three packages exist.' } }),
    );
    expect(errorsOf(why)[0]).toBe('examined 0 items, below the declared floor of 3. three packages exist.');
    expect((await runCheck(build(() => ({ examined: 3 }), { corpus: { atLeast: 3 } }))).ok).toBe(true);
  });

  it.each([
    ['a bare array', () => ['bad thing'], 'x returned an array — wrap it: `{ errors: [...] }`'],
    ['an unknown key', () => ({ problems: ['bad thing'] }), 'x returned `problems`, which this adapter does not read'],
    ['nothing', () => undefined, 'x returned nothing — return `{ errors: [...] }`, empty when clean.'],
    ['null', () => null, 'x returned null'],
    ['a number', () => 3, 'x returned number'],
  ])('refuses %s — it was read as "no errors" and printed ✓ clean', async (_name, run, message) => {
    const verdict = await runCheck(build(run));
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toContain(message);
  });
});

describe('defineCheck — what a body returns', () => {
  it('counts a finding with no severity as an error — it was printed and ignored by the verdict', async () => {
    const verdict = await runCheck(defineCheck({ id: 'x', run: () => [{ message: 'bad' } as never] }));
    expect([verdict.ok, errorsOf(verdict)]).toEqual([false, ['bad']]);
  });

  it('counts a severity outside the vocabulary as an error too', async () => {
    const verdict = await runCheck(defineCheck({ id: 'x', run: () => [{ severity: 'err', message: 'bad' } as never] }));
    expect(errorsOf(verdict)).toEqual(['bad']);
  });

  it('refuses a body that returned nothing, in words about the body', async () => {
    const verdict = await runCheck(defineCheck({ id: 'x', run: (() => undefined) as never }));
    expect(errorsOf(verdict)).toEqual([
      'x: the body returned nothing — return an array of findings, or `{ findings, examined }`.',
    ]);
    const odd = await runCheck(defineCheck({ id: 'x', run: (() => 'ok') as never }));
    expect(errorsOf(odd)[0]).toContain('the body returned string');
  });
});

describe('the edges of a tracked corpus', () => {
  it.each<[string, ICheck]>([
    ['forbidImport', forbidImport({ id: 'i', from: 'd/**', to: 'x' })],
    ['mustDeclare', mustDeclare({ id: 'm', files: 'd/**', fields: [{ name: 'O', pattern: /O/ }] })],
    ['referencesResolve', referencesResolve({ id: 'r', in: 'd/**', extract: /\]\(([^)]+)\)/ })],
    ['zoneBoundary', zoneBoundary({ id: 'z', productSources: 'd/**', forbiddenLiterals: [] })],
  ])('%s skips a tracked file the working tree no longer has', async (_name, check) => {
    const verdict = await runCheck(check, { tree: { 'd/a.md': 'O' }, tracked: ['d/a.md', 'd/gone.md'] });
    expect([verdict.ok, infos(verdict.findings)]).toEqual([true, [`✓ ${check.id} — 1 file(s) examined, clean`]]);
  });

  it('referencesResolve looks up nothing for an optional group that did not take part', async () => {
    const check = referencesResolve({ id: 'r', in: 'd/**', extract: /see(?: \[([^\]]+)\])?/ });
    expect((await runCheck(check, { tree: { 'd/a.md': 'see here' } })).ok).toBe(true);
  });

  it('names the check in a nested refusal when it has an id, and the factory alone when not', () => {
    expect(refusal(() => referencesResolve({ id: 'r', in: 'a', extract: /x/ }))).toContain("referencesResolve 'r': ");
    expect(refusal(() => mustDeclare({ id: 'm', files: 'a', fields: [{}] } as never))).toContain("mustDeclare 'm': ");
    expect(refusal(() => sourcesAgree({ id: 's', a: {}, b: {} } as never))).toContain("sourcesAgree 's': ");
    expect(refusal(() => sourcesAgree({ a: {}, b: {} } as never))).toMatch(/^sourcesAgree: /);
  });
});
