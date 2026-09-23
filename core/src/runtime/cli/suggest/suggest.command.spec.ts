import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from '../../../infrastructure';
import { suggest } from './suggest.command';

/** The engine's own barrel, which a pasted file's `from 'specwarden'` resolves to. */
const ENGINE = fileURLToPath(new URL('../../../index.ts', import.meta.url));

function run(tree: Record<string, string>) {
  let out = '';
  let err = '';
  const io = { out: (t: string) => (out += t), err: (t: string) => (err += t) };
  const code = suggest(new InMemoryFileSource(tree), io);
  return { code, out, err };
}

/** `n` services under `src/`, the first `withSpec` of them with a sibling spec. */
function services(n: number, withSpec: number): Record<string, string> {
  const tree: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    const name = `s${String(i).padStart(3, '0')}`;
    tree[`src/${name}.service.ts`] = '';
    if (i < withSpec) tree[`src/${name}.service.spec.ts`] = '';
  }
  return tree;
}

/**
 * `suggest` turns "author a rule" into "confirm a rule". It earns that only if what it
 * proposes is a real habit: a coincidence proposed as a convention teaches the reader
 * to distrust every later suggestion. Three guards carry it — the threshold, the
 * exceptions always shown, and nothing enabled — and each is pinned here.
 */
describe('what suggest proposes', () => {
  it('proposes a fully consistent convention with a ratchet of zero and no exceptions line', () => {
    const r = run(services(4, 4));
    expect(r.code).toBe(0);
    expect(r.out).toContain('100% of **/*.service.ts have {name}.spec.ts (4 of 4).');
    expect(r.out).toContain("siblingRequired({ subjects: '**/*.service.ts', require: '{name}.spec.ts' }), ratchet 0.");
    expect(r.out).not.toContain('exceptions:');
  });

  it('proposes a habit at the threshold, with the ratchet armed at today’s exceptions and every exception named', () => {
    // 9 of 10 is exactly 90%. The ratchet is the exception count, so adopting the
    // suggestion is green today and fails on the eleventh service without a spec.
    const r = run(services(10, 9));
    expect(r.out).toContain('90% of **/*.service.ts have {name}.spec.ts (9 of 10).');
    expect(r.out).toContain('ratchet 1.');
    expect(r.out).toContain('exceptions: src/s009.service.ts\n');
  });

  it('shows the first five exceptions and marks that there are more, rather than hiding them or flooding', () => {
    // 60 of 66 is 90.9%: over the threshold with six exceptions.
    const r = run(services(66, 60));
    expect(r.out).toContain('ratchet 6.');
    const line = r.out.split('\n').find((l) => l.includes('exceptions:')) ?? '';
    expect(line.split(', ').length).toBe(6); // five names and the ellipsis
    expect(line.endsWith(', …')).toBe(true);
    expect(line).toContain('src/s060.service.ts');
    expect(line).not.toContain('src/s065.service.ts');
  });

  it('prints the whole check file and where to save it — under checks/, never "copy into the config"', async () => {
    // It said to copy a one-line call into warden.config.mjs: a check lives in its own
    // file under checks/, and the call alone was not a file that could load.
    const r = run(services(10, 9));
    expect(r.out).toContain('Save as .specwarden/checks/tests/service-has-spec.check.mjs:\n');
    expect(r.out).not.toContain('warden.config.mjs');
    const file = /\.check\.mjs:\n\n([\s\S]*?\n\}\);)\n/.exec(r.out)?.[1] ?? '';
    expect(file).toContain("import { siblingRequired } from 'specwarden';");
    expect(file).toContain('ratchet: 1,');
    expect(file).toContain("rule: 'Every **/*.service.ts has its {name}.spec.ts beside it.',");
    // …and it loads as pasted, a check stating its rule.
    const dir = mkdtempSync(join(tmpdir(), 'spw-suggest-'));
    try {
      const abs = join(dir, 'service-has-spec.check.mjs');
      writeFileSync(abs, file.replace("from 'specwarden'", `from '${pathToFileURL(ENGINE).href}'`));
      const { check } = (await import(pathToFileURL(abs).href)) as { check: { rule?: { statement: string } } };
      expect(check.rule?.statement).toBe('Every **/*.service.ts has its {name}.spec.ts beside it.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names a controller convention after what it pairs', () => {
    const r = run({ 'api/a.controller.ts': '', 'api/a.controller.spec.ts': '' });
    expect(r.out).toContain('.specwarden/checks/tests/controller-has-spec.check.mjs');
  });

  it('reports each candidate convention on its own — controllers as well as services', () => {
    const r = run({ 'api/a.controller.ts': '', 'api/a.controller.spec.ts': '' });
    expect(r.out).toContain('**/*.controller.ts');
    expect(r.out).not.toContain('**/*.service.ts have');
  });
});

describe('what suggest refuses to propose', () => {
  it('stays silent below the threshold — 8 of 10 is a coincidence, not a convention', () => {
    const r = run(services(10, 8));
    expect(r.code).toBe(0);
    expect(r.out).not.toContain('siblingRequired');
    expect(r.out).toContain('No convention crossed the consistency threshold — nothing to suggest.');
  });

  it('says so when there is nothing to measure at all, rather than printing an empty report', () => {
    const r = run({});
    expect(r.out).toContain('nothing to suggest');
  });

  it('enables nothing, and says so, whether or not it proposed anything', () => {
    for (const tree of [{}, services(4, 4)]) {
      expect(run(tree).out).toContain('Nothing was enabled.');
    }
  });
});
