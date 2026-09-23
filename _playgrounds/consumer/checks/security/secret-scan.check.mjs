import { secretScan } from '@specwarden/security';

export const check = secretScan({ id: 'secret-scan', title: 'no credential in the tree', tier: 'fast' });
