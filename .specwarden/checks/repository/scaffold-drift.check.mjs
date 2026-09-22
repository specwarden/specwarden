/**
 * `scaffold-drift` — every generated file still equals what the registry generates.
 *
 * The logic is `scripts/scaffold.mjs`, which a person also runs directly. This wraps it
 * as a gate so it runs in the same list as everything else, at a tier the engine
 * decides, rather than in a shell chain where the order is whatever somebody typed.
 */
import { defineCheck } from 'specwarden';

import { generated, withPackageTable } from '../../../scripts/scaffold.mjs';

export const check = defineCheck({
  id: 'scaffold-drift',
  title: 'every generated file matches the registry it is generated from',
  tier: 'fast',
  rule: {
    id: 'generated-files-are-not-edited',
    statement: 'a generated file is changed by changing its source and regenerating, never by hand',
    owner: 'CONTRIBUTING.md',
  },
  // A hundred-odd files are generated. Matching none of them would mean the generator
  // returned an empty map, and a drift check over nothing is the shape of a green run
  // that looked at no files at all.
  corpus: { atLeast: 50, why: 'the scaffolder produced no files — the registry is empty or failed to load.' },
  when: { under: ['scripts/', 'core/', 'modules/', 'plugins/', 'templates/'], ending: ['README.md'] },
  hint: 'Change `scripts/registry.mjs` and run `pnpm scaffold`. A direct edit to a generated file does not survive the next run.',
  run: (ctx) => {
    const findings = [];
    const files = generated();

    for (const [rel, expected] of files) {
      const actual = ctx.files.tryRead(rel);
      if (actual === undefined) {
        findings.push({ severity: 'error', file: rel, message: `${rel} is missing — run \`pnpm scaffold\`.` });
        continue;
      }
      if (actual === expected) continue;
      const a = actual.split('\n');
      const b = expected.split('\n');
      const at = a.findIndex((line, i) => line !== b[i]);
      findings.push({
        severity: 'error',
        file: rel,
        line: at + 1,
        message: `${rel} differs from the registry at line ${at + 1}: committed ${JSON.stringify(a[at] ?? '(end)')}, generated ${JSON.stringify(b[at] ?? '(end)')}.`,
      });
    }

    const readme = ctx.files.tryRead('README.md');
    if (readme !== undefined && withPackageTable(readme) !== readme) {
      findings.push({
        severity: 'error',
        file: 'README.md',
        message: 'the package table is out of date — run `pnpm scaffold`.',
      });
    }

    return { findings, examined: files.size, unit: 'generated file(s)' };
  },
});
