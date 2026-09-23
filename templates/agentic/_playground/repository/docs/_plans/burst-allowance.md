# Burst allowance

**Status:** active
**Branch:** feat/burst-allowance

Let a tenant exceed its rate briefly after a quiet period, without raising the rate.

## Phase 1 — the bucket carries a burst capacity

The bucket's capacity becomes rate plus burst; refill is unchanged.

```bash
npx specwarden check --id doc-paths
```

## Phase 2 — the burst is per tenant

A tenant's burst is read from its plan, defaulting to zero, so nobody gets one by accident.

```bash
npx specwarden check --id plan-shape
```

### Decision: the burst refills at the normal rate

- Rejected: a separate, faster refill for the burst — two rates per tenant is a limit nobody
  can predict, and a limit a tenant cannot predict is one they route around.
