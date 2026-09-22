import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import type { ITemplateContext } from 'specwarden';

import { ops } from './ops.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: 'docs/**/*.md',
  tier: 'fast',
  workspaces: [],
  packageManager: 'pnpm',
  scripts: ['lint'],
  composeFiles: ['docker-compose.yml'],
  hasShellScripts: true,
  ...over,
});

const paths = (c = ctx()) => ops.files(c).map((f) => f.path);
const requires = (c = ctx()) => (typeof ops.requires === 'function' ? ops.requires(c) : ops.requires);

/**
 * A template emits STRINGS, and a typechecker never reads them: an option renamed in a
 * module leaves this compiling happily and producing a tree that throws on the first
 * run. So the files are written and IMPORTED, examples included — an `.example` that
 * cannot construct will fail on the day somebody renames it, which is the worst day.
 */
const scratch = mkdtempSync(
  join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '.tmp-generated-'),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the generated tree actually loads', () => {
  it('every generated file imports and exports a check', async () => {
    for (const file of ops.files(ctx())) {
      const abs = join(scratch, file.path.replace(/\//g, '-').replace(/\.example$/, ''));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { id: string } };
      expect(mod.check, `${file.path} exports no check`).toBeDefined();
      const expected = file.path
        .split('/')
        .pop()
        ?.replace(/\.check\.mjs(\.example)?$/, '');
      expect(mod.check?.id).toBe(expected);
    }
  });
});

describe('what an infrastructure repository gets wrong that others do not', () => {
  it('checks shell scoping — `local` at top level ends a deploy halfway, under set -e', () => {
    expect(paths()).toContain('checks/ops/shell-local-scope.check.mjs');
  });

  it('sweeps the deploy scripts too, not only scripts/', () => {
    const body = ops.files(ctx()).find((f) => f.path.includes('shell-local-scope'))?.body ?? '';
    expect(body).toContain("'deploy/**/*.sh'");
  });

  it('scans for credentials — an infra repository is where one arrives by accident', () => {
    expect(paths()).toContain('checks/security/secret-scan.check.mjs');
  });

  it('checks runbook paths, because an operational document is read under pressure', () => {
    expect(paths()).toContain('checks/docs/doc-paths.check.mjs');
  });
});

describe('what it refuses to guess', () => {
  it('the env-file check ships as an example — where the app declares its keys is yours', () => {
    expect(paths()).toContain('checks/ops/env-files-agree.check.mjs.example');
  });

  it('and is omitted entirely with no compose file — it would reconcile against nothing', () => {
    expect(paths(ctx({ composeFiles: [] })).some((p) => p.includes('env-files'))).toBe(false);
  });

  it('the upstream check ships as an example — which modes run the proxy on the host is a deployment fact', () => {
    expect(paths()).toContain('checks/ops/upstreams-resolve.check.mjs.example');
  });

  it('no example declares a rule: its file is not loaded until somebody renames it', () => {
    const named = new Set(ops.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds));
    for (const id of ['env-files-agree', 'upstreams-resolve']) expect(named.has(id)).toBe(false);
  });
});

describe('CI coverage follows the repository', () => {
  it('is written where a workflow was detected', () => {
    expect(paths(ctx({ ci: 'github' }))).toContain('checks/harness/gate-coverage.check.mjs.example');
  });

  it('and omitted where there is none — it would reconcile a roster against an empty file', () => {
    expect(paths(ctx({ ci: undefined })).some((p) => p.includes('gate-coverage'))).toBe(false);
  });
});

describe('rules and requirements', () => {
  it('every live check is named by a rule, so a fresh tree has no orphan', () => {
    const live = paths()
      .filter((p) => p.endsWith('.check.mjs'))
      .map(
        (p) =>
          p
            .split('/')
            .pop()
            ?.replace(/\.check\.mjs$/, '') as string,
      );
    const named = new Set(ops.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds));
    for (const id of live) expect(named.has(id), `${id} enforces no rule`).toBe(true);
  });

  it('every rule names a check the template actually writes', () => {
    const written = new Set(
      paths()
        .filter((p) => p.endsWith('.check.mjs'))
        .map(
          (p) =>
            p
              .split('/')
              .pop()
              ?.replace(/\.check\.mjs$/, '') as string,
        ),
    );
    for (const rule of ops.rules(ctx())) {
      for (const id of (rule.enforcement as { checkIds: readonly string[] }).checkIds) {
        expect(written.has(id), `rule ${rule.id} names ${id}, which is not written`).toBe(true);
      }
    }
  });

  it('imports only from packages it declares it requires', () => {
    const allowed = new Set(['specwarden', ...requires()]);
    for (const f of ops.files(ctx())) {
      for (const [, pkg] of f.body.matchAll(/^import .* from '([^']+)';$/gm)) {
        expect(allowed.has(pkg), `${f.path} imports ${pkg}`).toBe(true);
      }
    }
  });
});
