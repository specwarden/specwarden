import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import type { ITemplateContext } from 'specwarden';

import { opsTemplate } from './ops.template';

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

const paths = (c = ctx()) => opsTemplate.files(c).map((f) => f.path);
const requires = (c = ctx()) =>
  typeof opsTemplate.requires === 'function' ? opsTemplate.requires(c) : opsTemplate.requires;

/**
 * A template emits STRINGS, and a typechecker never reads them: an option renamed in a
 * module leaves this compiling happily and producing a tree that throws on the first
 * run. So the files are written and IMPORTED, examples included — an `.example` that
 * cannot construct will fail on the day somebody renames it, which is the worst day.
 */
const scratch = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.tmp-generated-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the generated tree actually loads', () => {
  it('every generated file imports and exports a check', async () => {
    for (const file of opsTemplate.files(ctx())) {
      const abs = join(scratch, file.path.replace(/\//g, '-').replace(/\.example$/, ''));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { run: unknown } };
      expect(typeof mod.check?.run, `${file.path} exports no check`).toBe('function');
      if (file.path.endsWith('.check.mjs'))
        expect(file.body, `${file.path} restates its file name as an id`).not.toMatch(/^\s+id: '/m);
    }
  });
});

describe('what an infrastructure repository gets wrong that others do not', () => {
  it('checks shell scoping — `local` at top level ends a deploy halfway, under set -e', () => {
    expect(paths()).toContain('checks/ops/shell-scope.check.mjs');
  });

  it('sweeps the deploy scripts too, not only scripts/', () => {
    const body = opsTemplate.files(ctx()).find((f) => f.path.includes('shell-scope'))?.body ?? '';
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
  it('the env-pairing check ships as an example — where the app declares its keys is yours', () => {
    expect(paths()).toContain('checks/ops/env-pairing.check.mjs.example');
  });

  it('and is omitted entirely with no compose file — it would reconcile against nothing', () => {
    expect(paths(ctx({ composeFiles: [] })).some((p) => p.includes('env-pairing'))).toBe(false);
  });

  it('the upstream check ships as an example — which modes run the proxy on the host is a deployment fact', () => {
    expect(paths()).toContain('checks/ops/proxy-upstreams.check.mjs.example');
  });

  it("each example's rule is declared, for init to write commented out beside the others", () => {
    // Declared nowhere, the rule an example enforces lived nowhere the repository could read.
    expect(opsTemplate.rules(ctx({ ci: 'github' })).map((r) => r.id)).toEqual([
      'env-pairing',
      'proxy-upstreams',
      'ci-coverage',
    ]);
  });

  it('points each example at what init found — the proxy config, the workflow, the env sample', () => {
    const found = ctx({
      ci: 'github',
      workflows: ['.github/workflows/deploy.yml'],
      proxyConfigs: ['deploy/nginx/upstreams.conf'],
      envSamples: ['.env.example'],
    } as Partial<ITemplateContext>);
    const body = (fragment: string) => opsTemplate.files(found).find((f) => f.path.includes(fragment))?.body ?? '';
    expect(body('proxy-upstreams')).toContain("fileFor: () => 'deploy/nginx/upstreams.conf'");
    expect(body('ci-coverage')).toContain("workflowFile: '.github/workflows/deploy.yml'");
    expect(body('env-pairing')).toContain("read('.env.example')");
  });
});

describe('CI coverage follows the repository', () => {
  it('is written where a workflow was detected', () => {
    expect(paths(ctx({ ci: 'github' }))).toContain('checks/ops/ci-coverage.check.mjs.example');
  });

  it('and omitted where there is none — it would reconcile a roster against an empty file', () => {
    expect(paths(ctx({ ci: undefined })).some((p) => p.includes('ci-coverage'))).toBe(false);
  });
});

describe('rules and requirements', () => {
  it('every live check states its own rule, so a fresh tree has no orphan', () => {
    for (const f of opsTemplate.files(ctx()).filter((x) => x.path.endsWith('.check.mjs')))
      expect(f.body, `${f.path} states no rule`).toMatch(/^\s+rule: '/m);
  });

  it('reads every tracked document — the README is where an operator starts', () => {
    expect(opsTemplate.files(ctx({ docs: 'docs/**/*.md' })).find((f) => f.path.includes('doc-paths'))?.body).toContain(
      "docs: '**/*.md'",
    );
  });

  it('every rule names a check the template actually writes', () => {
    const written = new Set(
      paths()
        .filter((p) => /\.check\.mjs(\.example)?$/.test(p))
        .map(
          (p) =>
            p
              .split('/')
              .pop()
              ?.replace(/\.check\.mjs(\.example)?$/, '') as string,
        ),
    );
    for (const rule of opsTemplate.rules(ctx())) {
      for (const id of (rule.enforcement as { enforcedBy: readonly string[] }).enforcedBy) {
        expect(written.has(id), `rule ${rule.id} names ${id}, which is not written`).toBe(true);
      }
    }
  });

  it('imports only from packages it declares it requires', () => {
    const allowed = new Set(['specwarden', ...requires()]);
    for (const f of opsTemplate.files(ctx())) {
      for (const [, pkg] of f.body.matchAll(/^import .* from '([^']+)';$/gm)) {
        expect(allowed.has(pkg), `${f.path} imports ${pkg}`).toBe(true);
      }
    }
  });
});
