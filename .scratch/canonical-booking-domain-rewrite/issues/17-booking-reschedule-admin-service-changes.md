# T17: Implement Booking reschedule and Administrator service changes

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Reschedule a Booking or apply an authorized Administrator service change atomically across interval claims, pricing/funding, revision, audit, and outbox state.

## Scope

- Client-eligible reschedule and Administrator service-change commands.
- Atomic old-claim release/new-claim acquisition.
- Canonical price delta and funding validation.
- Revision/idempotency and sanitized results.

## Out of scope

- Proposal/request UX, CourseDay rescheduling, generic field patching, and saga compensation.

## Authoritative references

- ADR-0001 — Booking/Payment topology.
- ADR-0002 — claims, atomic planning, concurrency, idempotency, and errors.
- ADR-0003 — price-change accounting.
- ADR-0005 — audit/outbox durability.

## Acceptance criteria

- [ ] Successful reschedule cannot leave both old and new claims active.
- [ ] Funding/price changes are conserved and atomic with Booking state.
- [ ] Conflict, stale revision, or over-budget operation leaves the original Booking unchanged.

## Required tests

- Emulator concurrency tests for claim swap, price changes, replay, stale revision, and rollback.

## Failure and edge cases

- New slot conflict, funding shortfall, concurrent reschedules, same interval request, service change beyond safety budget.

## Blocked by

- T13 — Create authenticated and Administrator lesson Bookings.

## Unlocks

T19 and T20.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- No legacy availability lock, generic patch, or saga fallback exists.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
