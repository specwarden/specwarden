// `secret-scan` — no credential-shaped string in any tracked file.
// One scan for the whole workspace: a credential does not care which package it landed in.
// A match means rotate first, delete second.
// Add a format with `patterns.extra`; switch one off with `patterns.disable`, which takes a reason.
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  rule: 'A credential never enters the repository, not even a revoked one.',
});
