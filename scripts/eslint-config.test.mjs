/**
 * Pins `eslint.config.mjs` on the one rule in it that is not a style question: the engine
 * imports no module, plugin or template.
 *
 * WHY A TEST AND NOT TRUST. The rule's pattern named the packages' OLD prefix for as long
 * as it existed, so it matched nothing and `core/src` could import `@specwarden/docs` with
 * lint green. A lint rule is a check like any other, and a check nobody has seen fail is a
 * hope — so this lints the forbidden line and expects the refusal, from every place under
 * `core/` that a relaxation could have reached.
 */
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { PACKAGES, pkgName } from './registry.mjs';

const eslint = new ESLint({ cwd: process.cwd() });

/** The rule ids that fired on one line of source, linted as if it lived at `filePath`. */
async function firedAt(filePath, code) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId);
}

const opinions = PACKAGES.filter((p) => p.kind !== 'core').map(pkgName);

describe('the engine imports nothing', () => {
  it('knows at least one opinion to refuse — a roster read wrong would make every case below vacuous', () => {
    expect(opinions.length).toBeGreaterThanOrEqual(8);
  });

  it.each(opinions)('refuses %s from core/src', async (name) => {
    expect(await firedAt('core/src/probe/probe.util.ts', `import { x } from '${name}';\nexport { x };\n`)).toContain(
      'no-restricted-imports',
    );
  });

  it.each([
    ['a unit spec', 'core/src/probe/probe.util.spec.ts'],
    ['the playground', 'core/_playground/probe.ts'],
    ['the CLI shim', 'core/bin/probe.mjs'],
    ['a build-free script', 'core/scripts/probe.mjs'],
  ])('refuses a module from %s as well — no relaxation reaches the barrier', async (_where, filePath) => {
    // The spec override once switched this rule off under a comment saying it did not.
    expect(await firedAt(filePath, "import { docPaths } from '@specwarden/docs';\nexport { docPaths };\n")).toContain(
      'no-restricted-imports',
    );
  });

  it('lets core import itself, and lets a module import the engine', async () => {
    // The other half: a barrier that refused everything would be switched off by the
    // first person it blocked for no reason.
    expect(
      await firedAt('core/src/probe/probe.util.ts', "import { x } from '../x/x.util';\nexport { x };\n"),
    ).not.toContain('no-restricted-imports');
    expect(
      await firedAt(
        'modules/docs/src/probe/probe.util.ts',
        "import { defineCheck } from 'specwarden';\nexport { defineCheck };\n",
      ),
    ).not.toContain('no-restricted-imports');
  });
});
