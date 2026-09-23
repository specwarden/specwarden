# Architecture

A request arrives at the relay, is checked against its tenant's limit, and is forwarded or
refused with `429`. The limiter is a token bucket per tenant, in `src/limits/bucket.ts`.

## Decisions

### Decision: a token bucket, not a fixed window

- Rejected: a fixed one-minute window — a tenant could send twice its limit across the
  boundary between two windows, which is exactly the burst the limit exists to stop.
