import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planted, provePlayground } from '../../../scripts/playground-proof.mjs';

/**
 * `init --template node-ts` over a small TypeScript library with a `lint` and a `test`
 * script of its own — and the four checks that produces, each shown failing.
 *
 * The scripts are the point. The template wraps a linter and a test suite ONLY where the
 * manifest declares them, and the playground this replaced had a manifest with no
 * scripts, so neither wrapper had ever been written into any tree, let alone run. Here
 * both run for real: `npm run lint` and `npm test`, through the engine's shell, against
 * the library's own code.
 */

/** Assembled at run time, so no credential-shaped literal sits in this repository. */
const leakedKey = `AKIA${'Q7LMZX3RT2PWNB4V'}`;

provePlayground(
  'node-ts',
  {
    'secret-scan': {
      why: 'an access key pasted into a source file',
      edits: {
        'src/client.ts': `export const credentials = { accessKeyId: '${leakedKey}' };\n`,
      },
      says: 'src/client.ts',
    },
    'doc-paths': {
      // Only reachable because the pathspec now reads `**/*.md` as a glob: under git's
      // default reading this README was outside the corpus, and the dead path passed.
      why: 'the README naming a source file that was renamed',
      edits: {
        'README.md': '# slugline\n\nThe whole implementation is `src/slug.ts`.\n',
      },
      says: 'src/slug.ts',
    },
    lint: {
      why: 'a stray console.log the house linter refuses',
      // The behaviour is untouched — only the print is added — so the suite stays green
      // and this scene proves the LINTER caught it, not that something did.
      edits: {
        'src/slugify.ts': planted(
          readFileSync(new URL('repository/src/slugify.ts', import.meta.url), 'utf8'),
          "  if (slug === '')",
          "  console.log(`slug: ${slug}`);\n  if (slug === '')",
        ),
      },
      says: 'npm run lint',
    },
    unit: {
      why: 'a regression the library’s own tests catch',
      edits: {
        // Accents dropped instead of folded: `Crème brûlée` → `cr-me-br-l-e`.
        'src/slugify.ts': [
          'export class SlugError extends Error {}',
          'export function slugify(title: string): string {',
          "  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');",
          "  if (slug === '') throw new SlugError('empty');",
          '  return slug;',
          '}',
          '',
        ].join('\n'),
      },
      says: 'npm test',
    },
  },
  { describe, it, expect, beforeAll, afterAll },
);
