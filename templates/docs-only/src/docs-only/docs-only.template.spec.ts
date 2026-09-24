import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import type { ITemplateContext } from 'specwarden';

import { docsOnlyTemplate } from './docs-only.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: '**/*.md',
  tier: 'fast',
  workspaces: [],
  scripts: [],
  composeFiles: [],
  ...over,
});

const paths = (c = ctx()) => docsOnlyTemplate.files(c).map((f) => f.path);
const bodyOf = (fragment: string, c = ctx()) =>
  docsOnlyTemplate.files(c).find((f) => f.path.includes(fragment))?.body ?? '';

describe('a documentation repository gets a smaller tree, on purpose', () => {
  it('enables the two checks that need no code to compare against', () => {
    expect(paths().filter((p) => p.endsWith('.check.mjs'))).toEqual([
      'checks/docs/doc-paths.check.mjs',
      'checks/docs/doc-hygiene.check.mjs',
    ]);
  });

  it('leaves out the symbol check, which would have nothing to resolve against', () => {
    expect(paths().some((p) => p.includes('doc-symbols'))).toBe(false);
  });
});

describe('the count check ships disabled, and says why', () => {
  it('is written as .example rather than as a check', () => {
    // A check whose vocabulary does not match the language finds nothing and reports
    // green — indistinguishable from clean documentation, which is the failure mode
    // this whole engine exists against. So it arrives switched off and explained.
    expect(paths()).toContain('checks/docs/doc-counts.check.mjs.example');
    expect(paths()).not.toContain('checks/docs/doc-counts.check.mjs');
  });

  it('the example names the four grammars a non-English repository must replace', () => {
    const body = bodyOf('doc-counts');
    for (const option of ['hedge', 'ordinalLead', 'number', 'dated']) expect(body).toContain(option);
    expect(body).toContain('English');
  });

  it('ships a guessed noun list that constructs, marked REPLACE — an empty one is refused at load', () => {
    // An empty list matched every number, not none; it is a configuration error now, so
    // the example that shipped `countableNouns: []` did not even load once renamed.
    const body = bodyOf('doc-counts');
    expect(body).not.toContain('countableNouns: []');
    expect(body).toMatch(/REPLACE[^\n]*\n\s+countableNouns: \['/);
  });
});

describe('the tree it emits is the convention', () => {
  it('no live check names an id — its file name is its id; an example names the one its rule names', () => {
    for (const f of docsOnlyTemplate.files(ctx()).filter((x) => x.path.endsWith('.check.mjs')))
      expect(f.body, f.path).not.toMatch(/^\s+id: '/m);
    for (const f of docsOnlyTemplate.files(ctx()).filter((x) => x.path.endsWith('.example')))
      expect(f.body, f.path).toMatch(/^ {2}id: 'doc-(counts|placement)',$/m);
  });

  it('imports only from the package it declares it requires', () => {
    const allowed = new Set(['specwarden', ...(docsOnlyTemplate.requires as readonly string[])]);
    for (const f of docsOnlyTemplate.files(ctx())) {
      for (const [, pkg] of f.body.matchAll(/^import .* from '([^']+)';$/gm)) expect(allowed.has(pkg)).toBe(true);
    }
  });

  it('reads every tracked document whatever directory init found — the root README is the index', () => {
    // A docs-directory glob left the handbook's own README unread, and a dead path in the
    // page that promises "a moved runbook breaks the build" passed.
    for (const f of docsOnlyTemplate.files(ctx({ docs: 'docs/**/*.md' })))
      expect(f.body, f.path).toContain("docs: '**/*.md'");
  });
});

describe('every rule lives where it can be read', () => {
  it('each live check states its own rule, so a fresh tree has no orphan', () => {
    for (const f of docsOnlyTemplate.files(ctx()).filter((x) => x.path.endsWith('.check.mjs')))
      expect(f.body, `${f.path} states no rule`).toMatch(/^\s+rule: '/m);
  });

  it("each example's rule is declared, naming the example, for init to write commented out", () => {
    // Declared nowhere, the rule an example enforces lived nowhere the repository could read.
    expect(docsOnlyTemplate.rules(ctx()).map((r) => [r.id, r.enforcement])).toEqual([
      ['doc-counts', { enforcedBy: ['doc-counts'] }],
      ['doc-placement', { enforcedBy: ['doc-placement'] }],
    ]);
  });
});

describe('placement ships as an example, and the reason is not caution', () => {
  it('writes it, so the reader meets the check and its caveat together', () => {
    expect(paths()).toContain('checks/docs/doc-placement.check.mjs.example');
  });

  it('names the failure DIRECTION, because this one fails loudly rather than silently', () => {
    // A document no row describes is a finding. That is the right way round for a check
    // waiting on a decision — but a reader who runs it unedited must know why.
    expect(bodyOf('doc-placement')).toMatch(/A document\s+(\/\/ )?no row matches is a finding/);
  });
});

/**
 * A template emits STRINGS, and a typechecker never reads them: an option renamed in a
 * module leaves the template compiling and the tree throwing on its first run. So every
 * file is written and IMPORTED — examples included, renamed as a consumer would rename
 * them, because the day an example is switched on is the worst day to find it does not parse.
 *
 * Written inside the package so the generated imports resolve as a consumer's would.
 */
const scratch = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.tmp-generated-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the generated tree actually loads', () => {
  it('every live check and every example, renamed, imports and constructs a check', async () => {
    const files = docsOnlyTemplate.files(ctx()).filter((f) => /\.check\.mjs(\.example)?$/.test(f.path));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const abs = join(scratch, file.path.replace(/\//g, '-').replace(/\.example$/, ''));
      writeFileSync(abs, file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { run: unknown } };
      expect(typeof mod.check?.run, `${file.path} does not load as a check`).toBe('function');
    }
  });
});
