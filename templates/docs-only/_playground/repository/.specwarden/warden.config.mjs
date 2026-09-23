import { defineConfig } from 'specwarden';

import { rules } from './rules.mjs';

// Only what the tree cannot say: every *.check.mjs under checks/ is found without being named here.
export default defineConfig({
  rules,
});
