# T20: Record Booking Attendance and resolve lesson outcomes

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Record factual Attendance for individual/family Bookings and derive normal `completed`/`no_show` outcomes while preserving Attendance and raising a deterministic issue when a payment-start restriction was violated.

## Scope

- Authorized factual Attendance recording with revisions/idempotency.
- Normal `completed`/`no_show` outcome derivation and missing-Attendance issue creation/reuse.
- Booking-side `attendance_payment_conflict` detection: when the payment/start restriction is active and Attendance is `present`, preserve `present`, create/reuse the conflict issue, block normal automatic outcome, and return the canonical recorded-with-issue result.
- Eligibility/invariants for the canonical outcome-resolver system command.

## Out of scope

- Full exceptional Administrator resolution policy, Course-side conflicts, Course Attendance, scheduler candidate discovery, and rewriting factual Attendance to satisfy payment state.

## Authoritative references

- ADR-0004 — factual Attendance, outcome derivation, AdminIssue, and payment/Attendance conflict.
- ADR-0002 — canonical/system commands, concurrency, idempotency, and atomic execution.
- ADR-0003 — service-funding/payment facts consumed by conflict detection.
- ADR-0005 — audit/outbox durability and sanitized results.

## Acceptance criteria

- [ ] Present/absent facts are stored independently of Booking outcome and cannot be discarded because payment is restricted.
- [ ] Eligible normal paths deterministically produce `completed` or `no_show`.
- [ ] Missing Attendance creates/reuses its typed issue and blocks automatic outcome as specified.
- [ ] Active payment/start restriction plus `present` preserves `present`, creates/reuses exactly one `attendance_payment_conflict`, blocks normal automatic outcome, and returns recorded-with-issue.
- [ ] T20 owns Booking-side conflict detection only; it does not implement exceptional Admin resolution.

## Required tests

- Matrix tests across Attendance fact, payment restriction, time, and current outcome.
- Emulator tests for concurrent/replayed Attendance, deterministic issue reuse, rollback, sanitized result, and outcome-system-command eligibility.
- A complete normal individual/family lesson E2E covering create, fund, reserve, gate, cancel/reschedule/composition prerequisites, Attendance, outcome, audit, outbox, and idempotency.

## Failure and edge cases

- Concurrent Instructor records, late Attendance, missing Attendance, payment arrives after violated start gate, cancelled-plus-present, attempted fact erasure.

## Blocked by

- T12 — Deliver Payment, Wallet, and monetary-event funding core.
- T13 — Create authenticated and Administrator lesson Bookings.
- T14 — Implement AdminIssue core and Booking payment-start gate.
- T16 — Implement Booking cancellation and pending-cancellation resolution.
- T17 — Implement Booking reschedule and Administrator service changes.
- T18 — Implement Family/Group composition and unpaid-addition rollback.

## Unlocks

The first complete normal lesson E2E milestone; T26 reuses this conflict infrastructure without recreating detection.

## Definition of done

- Targeted/Emulator/E2E tests and repository typecheck/lint/format/build pass.
- Factual Attendance preservation and single-owner conflict detection are proven.
- Graphify is best-effort and non-blocking; decisions are documented; changes are ready for `$code-review`.
