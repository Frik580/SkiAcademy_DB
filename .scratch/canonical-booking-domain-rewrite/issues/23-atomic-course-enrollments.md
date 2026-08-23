# T23: Create atomic CourseEnrollments for account, guest, and admin flows

**Phase:** 4 — Course vertical slice  
**Status:** ready-for-agent

## What to build

Create canonical CourseEnrollments for authenticated, guest, and Administrator actors atomically across ownership, capacity, funding, claims/guards, audit, and outbox.

## Scope

- Account, guest-capability, and Administrator enrollment commands.
- Participant/ownership validation, exact capacity guard, and canonical Payment funding.
- Revision, idempotency, transaction-budget enforcement, audit/outbox, and sanitized results.

## Out of scope

- Whole-Course cancellation, CourseDay Attendance, provider adapters, UI, and compatibility enrollment projections.

## Authoritative references

- ADR-0001 — CourseEnrollment/Participant/Payment topology.
- ADR-0002 — commands, guards, atomic planning, revisions, idempotency, and errors.
- ADR-0003 — service funding/accounting.
- ADR-0005 — audit/outbox durability.
- Canonical rewrite specification and `CONTEXT.md` — enrollment workflows.

## Acceptance criteria

- [ ] Enrollment and exact capacity consumption commit atomically.
- [ ] Guest capability is bounded to the intended enrollment action.
- [ ] Unfunded, full, duplicate, unauthorized, stale, or oversized enrollment makes no partial writes.

## Required tests

- Emulator concurrency tests for last-seat races, guest token scope/replay, funding, revision, audit/outbox, and budget rejection.

## Failure and edge cases

- Concurrent final seat, duplicate Participant enrollment, invalid guest token, funding race, capacity freeze.

## Blocked by

- T11 through T21 — complete Phase-3 lesson gate.

## Unlocks

T24, T25, T26, and T27.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- No Course-shaped Booking, dual write, compatibility projection, or saga fallback exists.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
