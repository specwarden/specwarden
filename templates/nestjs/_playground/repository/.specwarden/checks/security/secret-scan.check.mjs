/**
 * `secret-scan` — a credential-shaped string anywhere in the tracked tree.
 *
 * A backend is where connection strings, signing keys and provider tokens live, so this
 * is the one check worth having before any other. The built-in vendor library is a
 * PRESET: add your own formats with `patterns.extra`, and switch one off with
 * `patterns.disable` — which requires a reason, and reports it.
 */
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  id: 'secret-scan',
  title: 'no credential-shaped string is committed',
  tier: 'fast',
});
