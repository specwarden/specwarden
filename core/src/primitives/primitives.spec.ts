import { describe, expect, it } from 'vitest';

import type { ICheck, ICheckContext, IProcessResult, IVerdict } from '../domain';
import { InMemoryFileSource } from '../infrastructure';
import { matchPathspec } from '../infrastructure/git-vcs/git-pathspec/git-pathspec.util';
import {
  forbidImport,
  forbidPattern,
  mustDeclare,
  pathContract,
  referencesResolve,
  regenerable,
  siblingRequired,
  sourcesAgree,
} from './index';

const ID = { id: 'r', title: 'rule', tier: 'fast' as const };

function run(check: ICheck, files: InMemoryFileSource, proc?: (cmd: string) => IProcessResult): IVerdict {
  const ctx = {
    changed: [],
    files,
    // The primitives read the TRACKED set; here, every file in the source is tracked.
    vcs: {
      trackedFiles: (pathspec?: string) =>
        matchPathspec(pathspec, [...(files as unknown as { files: Map<string, string> }).files.keys()]),
    } as unknown as ICheckContext['vcs'],
    clock: {} as ICheckContext['clock'],
    writer: {} as ICheckContext['writer'],
    proc: {
      run: (_c: string, args: readonly string[]) =>
        proc ? proc(args[args.length - 1]) : { status: 0, stdout: '', stderr: '' },
    },
  } as ICheckContext;
  return check.run(ctx) as IVerdict;
}

describe('siblingRequired', () => {
  const check = siblingRequired({ ...ID, files: 'server/src/**/*.service.ts', require: '{name}.spec.ts' });
  it('fails when a service has no spec beside it', () => {
    const v = run(check, new InMemoryFileSource({ 'server/src/a.service.ts': '' }));
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('server/src/a.service.spec.ts');
  });
  it('passes when the sibling exists', () => {
    expect(
      run(check, new InMemoryFileSource({ 'server/src/a.service.ts': '', 'server/src/a.service.spec.ts': '' })).ok,
    ).toBe(true);
  });
});

describe('forbidImport', () => {
  const check = forbidImport({
    ...ID,
    files: 'server/src/modules/**',
    to: 'drizzle-orm',
    except: ['server/src/modules/**/repositories/**'],
  });
  it('fails when forbidden code imports the banned module', () => {
    const v = run(
      check,
      new InMemoryFileSource({ 'server/src/modules/x/x.service.ts': "import { sql } from 'drizzle-orm';\n" }),
    );
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('drizzle-orm');
  });
  it('passes for the excepted layer', () => {
    expect(
      run(
        check,
        new InMemoryFileSource({
          'server/src/modules/x/repositories/x.repo.ts': "import { sql } from 'drizzle-orm';\n",
          // A module file OUTSIDE the exception, so the ban has a corpus to hold.
          'server/src/modules/x/x.service.ts': "import { XRepository } from './repositories/x.repo';\n",
        }),
      ).ok,
    ).toBe(true);
  });
  it('a violation within the ratchet passes, keeps the error finding, and frames it as tolerated', () => {
    const ratcheted = forbidImport({ ...ID, files: 'server/src/modules/**', to: 'drizzle-orm', ratchet: 1 });
    const v = run(
      ratcheted,
      new InMemoryFileSource({ 'server/src/modules/x/x.service.ts': "import { sql } from 'drizzle-orm';\n" }),
    );
    expect(v.ok).toBe(true);
    // The frame comes first so the ✅ is not printed above a bare `error` line, and
    // the original error survives so `--tighten` can still count it.
    expect(v.findings[0]).toMatchObject({ severity: 'info' });
    expect(v.findings[0].message).toContain('tolerated under ratchet 1');
    expect(v.findings.filter((f) => f.severity === 'error')).toHaveLength(1);
    expect(v.findings.some((f) => f.severity === 'error' && f.message.includes('drizzle-orm'))).toBe(true);
  });
});

describe('forbidPattern', () => {
  // A synthetic token, not a real-secret shape — the primitive's job is to catch a
  // pattern; using an AWS-key-shaped fixture would (rightly) trip the repo's own
  // secret scanner on this very test file.
  const check = forbidPattern({
    ...ID,
    files: '**/*.ts',
    pattern: /BANNED-[0-9]{4}/,
    message: 'banned token: {match}',
  });
  it('fails on a match', () => {
    const v = run(check, new InMemoryFileSource({ 'a.ts': 'const k = "BANNED-1234";\n' }));
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('BANNED-1234');
  });
  it('passes clean source, and honours allow for a lookalike', () => {
    expect(run(check, new InMemoryFileSource({ 'a.ts': 'const k = "fine";\n' })).ok).toBe(true);
    const allowed = forbidPattern({ ...ID, files: '**/*.ts', pattern: /BANNED-[0-9]{4}/, allowMatch: /BANNED-0000/ });
    expect(run(allowed, new InMemoryFileSource({ 'a.ts': 'BANNED-0000\n' })).ok).toBe(true);
  });
});

describe('mustDeclare', () => {
  const check = mustDeclare({ ...ID, files: '.claude/agents/*.md', fields: [{ name: 'tools', pattern: /^tools:/m }] });
  it('fails when a required field is missing', () => {
    const v = run(check, new InMemoryFileSource({ '.claude/agents/x.md': 'name: x\n' }));
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('tools');
  });
  it('passes when declared', () => {
    expect(run(check, new InMemoryFileSource({ '.claude/agents/x.md': 'name: x\ntools: Read\n' })).ok).toBe(true);
  });
});

describe('pathContract', () => {
  const check = pathContract({ ...ID, files: '**/*_MODULE.md', allowedIn: ['server/src/**'] });
  it('fails for a file of the kind outside its contract', () => {
    const v = run(check, new InMemoryFileSource({ 'docs/FOO_MODULE.md': '' }));
    expect(v.ok).toBe(false);
  });
  it('passes inside the contract', () => {
    expect(run(check, new InMemoryFileSource({ 'server/src/x/FOO_MODULE.md': '' })).ok).toBe(true);
  });
});

describe('referencesResolve', () => {
  const check = referencesResolve({ ...ID, files: 'docs/*.md', extract: /\]\(([^)]+\.md)\)/g });
  it('fails on a link that does not resolve', () => {
    const v = run(check, new InMemoryFileSource({ 'docs/a.md': 'see [b](docs/missing.md)\n' }));
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('docs/missing.md');
  });
  it('passes when the target exists', () => {
    expect(run(check, new InMemoryFileSource({ 'docs/a.md': 'see [b](docs/b.md)\n', 'docs/b.md': '' })).ok).toBe(true);
  });
});

describe('regenerable', () => {
  const check = regenerable({ ...ID, artifact: 'CLAUDE.md', cmd: 'node build-router.mjs' });
  it('fails when the artifact differs from the generator output', () => {
    const v = run(check, new InMemoryFileSource({ 'CLAUDE.md': 'stale\n' }), () => ({
      status: 0,
      stdout: 'fresh\n',
      stderr: '',
    }));
    expect(v.ok).toBe(false);
  });
  it('passes when they match', () => {
    expect(
      run(check, new InMemoryFileSource({ 'CLAUDE.md': 'fresh\n' }), () => ({
        status: 0,
        stdout: 'fresh\n',
        stderr: '',
      })).ok,
    ).toBe(true);
  });
  it('fails when the generator itself fails', () => {
    const v = run(check, new InMemoryFileSource({ 'CLAUDE.md': 'x\n' }), () => ({
      status: 1,
      stdout: '',
      stderr: 'boom',
    }));
    expect(v.ok).toBe(false);
  });
});

describe('sourcesAgree', () => {
  it('fails when the two sets differ, naming the offender and its side', () => {
    const check = sourcesAgree({
      ...ID,
      a: { name: 'compose', extract: () => ['pg', 'redis'] },
      b: { name: 'tiers', extract: () => ['pg'] },
    });
    const v = run(check, new InMemoryFileSource({}));
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('redis');
  });
  it('passes when the sets match', () => {
    const check = sourcesAgree({
      ...ID,
      a: { name: 'compose', extract: () => ['pg', 'redis'] },
      b: { name: 'tiers', extract: () => ['redis', 'pg'] },
    });
    expect(run(check, new InMemoryFileSource({})).ok).toBe(true);
  });
});

/**
 * The relevance predicate every factory silently dropped.
 *
 * Each of the eight called `buildCheck` without one, so a `when` handed to any of them
 * was accepted by the type and then ignored: the check ran on every change, and the
 * consumer had a filter that did nothing and looked like it did. It surfaced the day a
 * generated-artifact gate was declared with a four-path `when` and turned up in the
 * relevant set for a change to `docker-compose.yml`.
 */
describe('a factory carries the relevance it was given', () => {
  const id = { id: 'x', title: 'x', tier: 'fast' as const };

  it('honours a declarative when', () => {
    const check = forbidImport({ ...id, when: { under: ['src/'] }, files: 'src/**/*.ts', to: 'x' });

    expect(check.when(['src/a.ts'])).toBe(true);
    expect(check.when(['docs/a.md'])).toBe(false);
  });

  it('honours a predicate', () => {
    const check = forbidPattern({
      ...id,
      when: (c: readonly string[]) => c.includes('x'),
      files: '**/*.ts',
      pattern: /x/,
      message: 'm',
    });

    expect(check.when(['x'])).toBe(true);
    expect(check.when(['y'])).toBe(false);
  });

  it('is always relevant when none was given — the conservative answer', () => {
    expect(siblingRequired({ ...id, files: '**/*.ts', require: '{name}.spec.ts' }).when(['anything'])).toBe(true);
  });

  it('applies to every factory, not the one that happened to be fixed', () => {
    const cases = [
      forbidImport({ ...id, when: { under: ['a/'] }, files: 'a/**', to: 'x' }),
      siblingRequired({ ...id, when: { under: ['a/'] }, files: 'a/**', require: '{name}.spec.ts' }),
      pathContract({ ...id, when: { under: ['a/'] }, files: 'a/**', allowedIn: ['a/**'] }),
    ];

    for (const check of cases) {
      expect(check.when(['a/x.ts']), check.id).toBe(true);
      expect(check.when(['b/x.ts']), check.id).toBe(false);
    }
  });
});

/**
 * One corpus, one spelling: `files` — a pathspec or several — and `except`, on every
 * primitive that reads files. Five spellings (`in`, `from`, `subjects`, `kind`, `files`)
 * named one thing, and three primitives had no `except` at all, so a generated or vendored
 * file could only be left out by rewriting the pathspec around it.
 */
describe('every file-reading primitive takes `files` as a list, and `except`', () => {
  const tree = () =>
    new InMemoryFileSource({
      'a/one.md': 'BAD [x](gone.md)',
      'b/two.md': 'BAD [x](gone.md)',
      'b/vendor.md': 'BAD [x](gone.md)',
    });
  const files = ['a/*.md', 'b/*.md'];
  const except = ['b/vendor.md'];
  const flagged = (check: ICheck) =>
    run(check, tree())
      .findings.filter((f) => f.severity === 'error')
      .map((f) => f.file);

  it.each([
    ['forbidPattern', () => forbidPattern({ ...ID, files, except, pattern: /BAD/ })],
    ['forbidImport', () => forbidImport({ ...ID, files, except, to: 'x' })],
    ['referencesResolve', () => referencesResolve({ ...ID, files, except, extract: /\]\(([^)]+)\)/ })],
    ['mustDeclare', () => mustDeclare({ ...ID, files, except, fields: [{ name: 'Owner', pattern: /Owner/ }] })],
    ['pathContract', () => pathContract({ ...ID, files, except, allowedIn: ['c/**'] })],
    ['siblingRequired', () => siblingRequired({ ...ID, files, except, require: '{name}.test.md' })],
  ])('%s reads both pathspecs and leaves the exempt file out', (name, build) => {
    const check = build();
    const got = flagged(check);
    if (name === 'forbidImport') expect(run(check, tree()).ok, name).toBe(true);
    else expect(got, name).toEqual(['a/one.md', 'b/two.md']);
  });

  it('refuses an empty `files` list at load — a scan of nothing reports success', () => {
    expect(() => forbidPattern({ ...ID, files: [], pattern: /x/ })).toThrow(
      "forbidPattern 'r': `files` is empty, which selects nothing to check",
    );
  });

  it('names every pathspec when the list matched nothing', () => {
    const verdict = run(forbidPattern({ ...ID, files: ['x/**', 'y/**'], pattern: /x/ }), tree());
    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0].message).toContain('`x/**`, `y/**` matched nothing to scan');
  });
});
