import { defineConfig } from 'specwarden';

import { rules } from './rules.mjs';
import { source as specSource } from './spec-source.mjs';

// Only what the tree cannot say: every *.check.mjs under checks/ is found without being named here.
export default defineConfig({
  rules,

  // Where requirements and tasks come from; `specwarden sync-invariants` prints what to deposit,
  // against where invariants are deposited and how one is marked:
  specSource,
  // invariants: { docs: 'docs/**/*.md', idPattern: /<!--\s*invariant:\s*([^\s>]+)\s*-->/g },
});
