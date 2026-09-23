// `secret-scan` — no credential-shaped string in any tracked file.
// Connection strings and tokens arrive here by accident, pasted into a compose file "just to test".
// A match means rotate first, delete second: the history keeps what the diff removes.
// Add a format with `patterns.extra`; switch one off with `patterns.disable`, which takes a reason.
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  rule: 'A credential never enters the repository, not even a revoked one.',
});
