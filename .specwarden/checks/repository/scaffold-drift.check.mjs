/**
 * `scaffold-drift` — every generated file still equals what the registry generates.
 *
 * The logic is `scripts/scaffold.mjs`, which a person also runs directly. This wraps it
 * as a gate so it runs in the same list as everything else, at a tier the engine
 * decides, rather than in a shell chain where the order is whatever somebody typed.
 */
import { defineCheck } from 'specwarden';

import { driftProblems } from '../../../scripts/check-scaffold-drift.mjs';
import { generated } from '../../../scripts/scaffold.mjs';

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
    const files = generated();
    // ONE definition of drift, shared with `node scripts/check-scaffold-drift.mjs`. This
    // body used to carry its own copy, and the copy kept a bug the script had fixed: a file
    // differing only by a dropped final newline was reported at "line 0", naming nothing.
    const findings = driftProblems(files, (rel) => ctx.files.tryRead(rel)).map((problem) => ({
      severity: 'error',
      file: problem.slice(0, problem.indexOf(':')),
      line: Number(/at line (\d+)/.exec(problem)?.[1]) || undefined,
      message: problem.replace(/\n\s+/g, ' — '),
    }));
    return { findings, examined: files.size, unit: 'generated file(s)' };
  },
});
