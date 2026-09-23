/**
 * `secret-scan` — a credential-shaped string anywhere in the tracked tree.
 *
 * An infrastructure repository is where connection strings, tokens and signing keys are
 * most likely to arrive by accident — pasted into a compose file "just to test". A match
 * means ROTATE first, delete second: the history keeps what the diff removes.
 */
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  id: 'secret-scan',
  title: 'no credential-shaped string is committed',
  tier: 'fast',
});
