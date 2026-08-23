# T12: Deliver Payment, Wallet, and monetary-event funding core

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Provide the coherent canonical funding core for services: Payment projection, Wallet accounting, immutable monetary events, funding eligibility, external/manual receipts, idempotency, and price-change calculations.

## Scope

- Payment projection and service-funding predicate.
- Wallet balances/allocations and append-only `monetary_events`.
- Manual/external funding and provider-receipt idempotency core.
- Price increase/decrease calculations and atomic financial/audit effects.

## Out of scope

- Provider adapters, UI, legacy transaction compatibility, refunds/write-offs/corrections beyond core price adjustment.

## Authoritative references

- ADR-0001 — Payment aggregate root/topology.
- ADR-0002 — transaction, revision, idempotency, and safety-budget model.
- ADR-0003 — Payment/Wallet accounting source, KZT invariants, service funding, and corrections.
- ADR-0005 — atomic financial audit/outbox obligations.

## Acceptance criteria

- [ ] Service funding is determined only from canonical financial facts.
- [ ] KZT conservation holds across Wallet allocation and every monetary event.
- [ ] Exact receipt replay is idempotent; conflicting reuse fails without financial mutation.
- [ ] Price increases/decreases produce deterministic balances and events.

## Required tests

- Unit/property tests for KZT conservation and price deltas.
- Emulator concurrency/replay/atomicity tests for Wallet and receipts.

## Failure and edge cases

- Duplicate receipt, currency mismatch, insufficient Wallet funds, concurrent allocation, negative adjustment, stale Payment revision.

## Blocked by

- T09 — Implement exact interval claims and uniqueness guards.
- T10 — Stage immutable Activity Logs and deterministic outbox obligations.

## Unlocks

T13, T14, T15, T18, T20, and T21.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass; financial fixtures prove conservation.
- No provider adapter or legacy transaction projection is introduced.
- Decisions are documented; Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
