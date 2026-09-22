/**
 * `secret-scan` — a credential-shaped string anywhere in the tracked tree.
 *
 * The built-in library covers a few common vendor formats. It is a PRESET, not a
 * mandate: add your own with `patterns.extra`, switch one off with `patterns.disable`
 * (a reason is required, and it is reported), or supply the whole library with
 * `patterns.replace`. A match means ROTATE first, delete second.
 */
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  id: 'secret-scan',
  title: 'no credential-shaped string is committed',
  tier: 'fast',
});
