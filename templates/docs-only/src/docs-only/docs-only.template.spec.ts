import { describe, expect, it } from 'vitest';

import type { ITemplateContext } from 'specwarden';

import { docsOnly } from './docs-only.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: '**/*.md',
  tier: 'fast',
  workspaces: [],
  scripts: [],
  composeFiles: [],
  ...over,
});

const paths = (c = ctx()) => docsOnly.files(c).map((f) => f.path);

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
    const body = docsOnly.files(ctx()).find((f) => f.path.endsWith('.example'))?.body ?? '';
    for (const option of ['hedge', 'ordinalLead', 'numberPattern', 'dated']) expect(body).toContain(option);
    expect(body).toContain('ENGLISH');
  });

  it('and ships with an empty noun list rather than a guessed one', () => {
    const body = docsOnly.files(ctx()).find((f) => f.path.endsWith('.example'))?.body ?? '';
    expect(body).toContain('countableNouns: []');
  });
});

describe('the tree it emits is the convention', () => {
  it('every real check file names the id its file name promises', () => {
    for (const f of docsOnly.files(ctx()).filter((f) => f.path.endsWith('.check.mjs'))) {
      const id = f.path
        .split('/')
        .pop()
        ?.replace(/\.check\.mjs$/, '');
      expect(f.body).toContain(`id: '${id}'`);
    }
  });

  it('imports only from the package it declares it requires', () => {
    const allowed = new Set(['specwarden', ...docsOnly.requires]);
    for (const f of docsOnly.files(ctx())) {
      for (const [, pkg] of f.body.matchAll(/^import .* from '([^']+)';$/gm)) expect(allowed.has(pkg)).toBe(true);
    }
  });

  it('defaults to the whole tree, since documentation IS the product here', () => {
    expect(docsOnly.files(ctx()).find((f) => f.path.includes('doc-paths'))?.body).toContain("docs: '**/*.md'");
  });
});

describe('every generated check is named by a rule', () => {
  it('so a fresh tree has no orphan, and no rule points at a file it did not write', () => {
    const ids = new Set(
      paths()
        .filter((p) => p.endsWith('.check.mjs'))
        .map((p) =>
          p
            .split('/')
            .pop()
            ?.replace(/\.check\.mjs$/, ''),
        ),
    );
    const named = new Set(
      docsOnly.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds),
    );
    expect([...named].sort()).toEqual([...ids].sort());
  });
});

describe('placement ships as an example, and the reason is not caution', () => {
  it('writes it, so the reader meets the check and its caveat together', () => {
    expect(docsOnly.files(ctx()).map((f) => f.path)).toContain('checks/docs/doc-placement.check.mjs.example');
  });

  it('names the failure DIRECTION, because this one fails loudly rather than silently', () => {
    // An empty contract matches nothing, so every document is a finding. That is the
    // right way round for a check waiting on a decision — but a reader who runs it
    // unedited must know why their whole corpus lit up.
    const body = docsOnly.files(ctx()).find((f) => f.path.includes('doc-placement'))?.body ?? '';
    expect(body).toMatch(/EMPTY list matches nothing/i);
  });

  it('declares no rule for either example — nothing loads them until they are renamed', () => {
    const named = new Set(
      docsOnly.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds),
    );
    expect(named.has('doc-placement')).toBe(false);
    expect(named.has('doc-counts')).toBe(false);
  });
});
