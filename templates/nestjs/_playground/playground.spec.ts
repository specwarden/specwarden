import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planted, provePlayground } from '../../../scripts/playground-proof.mjs';

/**
 * `init --template nestjs` over a NestJS + TypeORM service — a module with a controller,
 * a service, an entity and a repository — and the checks that produces.
 *
 * This playground found a defect the moment it was written: the generated conventions
 * check allowed `typeorm` only under `repositories/`, and an entity cannot exist without
 * importing it. Every real TypeORM service was red on its first run. The repository below
 * carries an entity precisely so that can never come back unnoticed.
 *
 * The compose file is here for the same reason: it is what makes the template ask for
 * `@specwarden/ops` and write the env-file example, which a repository without one never
 * sees.
 */

const read = (rel: string): string => readFileSync(new URL(`repository/${rel}`, import.meta.url), 'utf8');
const SERVICE = 'src/modules/invoices/invoices.service.ts';

/** Assembled at run time, so no credential-shaped literal sits in this repository. */
const leakedKey = `AKIA${'Z4MB7QK2XW9PLR5T'}`;

provePlayground(
  'nestjs',
  {
    'nestjs/db-access-through-repositories': {
      why: 'a service that builds its own query instead of asking the repository',
      edits: { [SERVICE]: `import { DataSource } from 'typeorm';\n${read(SERVICE)}` },
      says: SERVICE,
    },
    'secret-scan': {
      why: 'a committed .env with a real access key in it',
      edits: { '.env': `DATABASE_URL=postgres://ledger@db/ledger\nAWS_ACCESS_KEY_ID=${leakedKey}\n` },
      says: '.env',
    },
    unit: {
      why: 'a total that stopped rounding each line — the service’s own test catches it',
      edits: {
        'src/modules/invoices/invoice-total.ts': planted(
          read('src/modules/invoices/invoice-total.ts'),
          'Math.round(l.quantity * l.unitPrice * (1 + l.taxRate / 100))',
          'l.quantity * l.unitPrice * (1 + l.taxRate / 100)',
        ),
      },
      says: 'npm test',
    },
  },
  { describe, it, expect, beforeAll, afterAll },
);
