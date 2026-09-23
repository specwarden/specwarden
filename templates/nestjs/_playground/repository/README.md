# ledger-api

Invoices and their totals, behind a NestJS HTTP API on PostgreSQL.

The architecture rule that matters most is in `docs/architecture.md`: a module reaches the
database only through its repository, so a query is written, reviewed and tested in one
place. Local development runs from `compose.yaml`; copy `.env.example` to `.env` first.
