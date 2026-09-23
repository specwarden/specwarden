// `lockfile` — the lockfile still describes the manifests.
// A drifted lockfile installs FINE on the machine that drifted it and differently everywhere else.
import { commandCheck } from 'specwarden';

export const check = commandCheck({
  cmd: 'pnpm install --frozen-lockfile',
  rule: 'The lockfile describes the manifests, so every workspace resolves the same tree.',
  hint: "Run 'pnpm install' from the repository root and commit the updated lockfile.",
});
