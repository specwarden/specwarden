/**
 * `secret-scan` — a credential-shaped string anywhere in the tracked tree.
 *
 * One scan for the whole workspace: a credential does not care which package it landed
 * in, and a per-package scan is a per-package chance to forget one.
 */
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  id: 'secret-scan',
  title: 'no credential-shaped string is committed',
  tier: 'fast',
});
