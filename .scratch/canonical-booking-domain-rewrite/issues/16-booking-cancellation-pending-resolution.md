# T16: Implement Booking cancellation and pending-cancellation resolution

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Apply the authoritative individual Booking cancellation matrix, including deterministic pending-cancellation escalation and AdminIssue-backed resolution, with atomic claim, funding, audit, and outbox effects.

## Scope

- Client, Administrator, and eligible system cancellation commands.
- Pre-start cancellation policy and pending-cancellation issue creation/reuse.
- Approved Administrator/system exceptional-resolution paths after start.
- Atomic claim/funding adjustments, revisions, idempotency, audit, and outbox.

## Out of scope

- Whole-Course cancellation; unrestricted issue dismissal; blanket prohibition on Administrator/system exceptional resolution after start.

## Authoritative references

- `CONTEXT.md` — authoritative cancellation matrix.
- ADR-0002 — command/revision/idempotency/transaction rules.
- ADR-0003 — cancellation financial effects.
- ADR-0004 — AdminIssue lifecycle.
- Canonical rewrite specification — no whole-Course cancellation or compatibility path.

## Acceptance criteria

- [ ] Client-initiated individual Booking cancellation after `startAt` is rejected unless an already-approved Administrator/system exceptional-resolution path applies.
- [ ] Pending cancellation creates/reuses the correct typed issue and resolves only through canonical commands.
- [ ] Claims, money, state, audit, and outbox commit atomically.

## Required tests

- Matrix-driven tests for actor/time/state combinations, replay, stale revision, issue dedupe, and transaction rollback.

## Failure and edge cases

- Client cancellation after start, concurrent start/cancel, already completed/no-show Booking, unresolved issue, partial refund boundary.

## Blocked by

- T13 — Create authenticated and Administrator lesson Bookings.
- T14 — Implement AdminIssue core and Booking payment-start gate.

## Unlocks

T20 and the complete Phase-3 gate.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- The `CONTEXT.md` cancellation matrix is covered without whole-Course semantics or saga fallback.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
