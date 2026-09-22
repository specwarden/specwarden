/**
 * `lockfile` — the lockfile still describes the manifests.
 *
 * A drifted lockfile installs FINE on the machine that drifted it and differently
 * everywhere else, which is the shape of bug that costs an afternoon per person.
 */
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  id: 'lockfile',
  title: 'the lockfile is in sync with the manifests',
  tier: 'fast',
  cmd: 'pnpm install --frozen-lockfile',
  when: () => true,
  hint: "Run 'pnpm install' from the repository root and commit the updated lockfile.",
});
