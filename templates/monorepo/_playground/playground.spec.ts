import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planted, provePlayground } from '../../../scripts/playground-proof.mjs';

/**
 * `init --template monorepo` over a pnpm workspace of three packages with its own lockfile,
 * lint, tests and CI workflow.
 *
 * The playground this replaced was a bare directory with no `pnpm-workspace.yaml`, so its
 * `lockfile` check — `pnpm install --frozen-lockfile` — walked UP to the nearest workspace
 * and verified the lockfile of the specwarden repository instead. It was green, for a
 * repository it was not describing. Here the workspace is its own root, and the check
 * reads the lockfile it was written for.
 */

const read = (rel: string): string => readFileSync(new URL(`repository/${rel}`, import.meta.url), 'utf8');

/** Assembled at run time, so no credential-shaped literal sits in this repository. */
const leakedKey = `AKIA${'T2KQ9ZR4WM7LXN5P'}`;

provePlayground(
  'monorepo',
  {
    'secret-scan': {
      why: 'a deploy key committed inside one of the packages',
      edits: { 'packages/api/src/deploy.ts': `export const deployKey = '${leakedKey}';\n` },
      says: 'packages/api/src/deploy.ts',
    },
    'doc-paths': {
      // In `docs/`, not the README: with a docs directory the template scans `docs/**`, and
      // the corpus is the template's decision rather than this scene's.
      why: 'the architecture note naming a source file that was split and renamed',
      edits: {
        'docs/architecture.md': planted(
          read('docs/architecture.md'),
          '`packages/money/src/index.ts`',
          '`packages/money/src/allocate.ts`',
        ),
      },
      says: 'packages/money/src/allocate.ts',
    },
    lint: {
      why: 'a package reaching into another’s src by path instead of importing it by name',
      edits: {
        'packages/api/src/split-bill.ts': planted(
          read('packages/api/src/split-bill.ts'),
          "from '@acme/money'",
          "from '../../money/src/index.ts'",
        ),
      },
      says: 'pnpm run lint',
    },
    lockfile: {
      // The defect CI meets first: a dependency added to a manifest, and `pnpm install`
      // never run, so the committed lockfile no longer describes the workspace.
      why: 'a manifest that gained a dependency its lockfile does not know about',
      edits: {
        'packages/web/package.json': planted(
          read('packages/web/package.json'),
          '"type": "module"',
          '"type": "module",\n  "dependencies": {\n    "@acme/money": "workspace:*"\n  }',
        ),
      },
      says: 'pnpm install --frozen-lockfile',
    },
    unit: {
      why: 'an allocation that loses a cent — the workspace’s own test catches it',
      edits: {
        'packages/money/src/index.ts': planted(read('packages/money/src/index.ts'), '(i < remainder ? 1 : 0)', '0'),
      },
      says: 'pnpm test',
    },
  },
  { describe, it, expect, beforeAll, afterAll },
);
