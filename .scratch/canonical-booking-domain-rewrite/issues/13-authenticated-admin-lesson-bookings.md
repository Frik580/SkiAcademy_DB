# T13: Create authenticated and Administrator lesson Bookings

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Create canonical individual lesson Bookings for authenticated Accounts and Administrators through one atomic command path that validates participants, funding, access, availability, claims, audit, and outbox obligations.

## Scope

- Account and Administrator creation commands and authorized read result.
- Participant/access/block and funding checks.
- Exact Instructor/resource claim acquisition.
- Revision, idempotency, deterministic records, audit, and outbox.

## Out of scope

- Guest flow, family/group mutation, CourseEnrollment, payment-start delivery gate, and UI migration.

## Authoritative references

- ADR-0001 — Booking/Participant/Payment topology.
- ADR-0002 — atomic command, claim, revision, idempotency, and safety-budget model.
- ADR-0003 — service-funding predicate.
- ADR-0005 — audit/outbox durability.

## Acceptance criteria

- [ ] A valid funded request creates one Booking and exact claims atomically.
- [ ] Unauthorized, blocked, unfunded, overlapping, stale, or oversized requests make no writes.
- [ ] Replay returns the original Booking result without duplicate claims/events.

## Required tests

- Emulator happy-path, conflict, authorization, funding, stale-revision, replay, rollback, and transaction-budget tests.

## Failure and edge cases

- Participant not managed, Instructor blocked, exact overlap, concurrent create, insufficient funding, command above safety budget.

## Blocked by

- T11 — Deliver Participant ownership, Instructor access, and block commands.
- T12 — Deliver Payment, Wallet, and monetary-event funding core.

## Unlocks

T14, T15, T16, T17, T18, T19, and T20.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass; canonical fixtures are added.
- No Course-shaped Booking, dual write, or saga fallback exists.
- Decisions are documented; Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
