# T21: Deliver financial corrections, write-offs, refunds, and reconciliation

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Let authorized Administrators correct canonical financial state through explicit append-only refund, write-off, correction, and reconciliation commands without mutating historical monetary facts.

## Scope

- Refund, write-off, correction, and reconciliation commands/policies.
- Append-only monetary events, Payment/Wallet projections, revisions/idempotency.
- Discrepancy reporting, atomic audit/outbox, and sanitized results.

## Out of scope

- Provider adapters, editing/deleting monetary events, historical transaction migration, and frontend UX.

## Authoritative references

- ADR-0003 — refunds, write-offs, financial corrections, reconciliation, and KZT invariants.
- ADR-0002 — canonical commands, revisions, idempotency, and atomic budgets.
- ADR-0005 — audit/outbox durability and access boundaries.

## Acceptance criteria

- [ ] Corrections append canonical events and preserve KZT conservation/history.
- [ ] Reconciliation reports discrepancies without silently rewriting facts.
- [ ] Replays and stale revisions cannot double-refund or double-write-off.

## Required tests

- Property tests for conservation and Emulator tests for authorization, concurrency, replay, partial/full refund, and reconciliation mismatch.

## Failure and edge cases

- Refund above funded amount, repeated external reference, correction race, Wallet allocation already consumed, inconsistent projection.

## Blocked by

- T12 — Deliver Payment, Wallet, and monetary-event funding core.

## Unlocks

Phase-4 financial use and T32 Administrator operations UX.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- Monetary history remains append-only; no legacy transaction projection or backfill is introduced.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
