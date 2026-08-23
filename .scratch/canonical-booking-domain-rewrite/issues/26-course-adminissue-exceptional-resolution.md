# T26: Extend AdminIssue workflows for Course and Attendance exceptions

**Phase:** 4 — Course vertical slice  
**Status:** ready-for-agent

## What to build

Extend the existing T14/T20 issue and conflict infrastructure with Course payment gates and the approved Administrator exceptional-resolution policies for Booking and Course Attendance.

## Scope

- CourseEnrollment/CourseDay payment-start gate and deterministic issue behavior.
- Course-side `attendance_payment_conflict` detection.
- Administrator resolution policy for Booking/Course attendance-payment conflicts.
- Exceptional `cancelled + present`, `completed` ↔ `no_show` correction, Course pending-cancellation escalation/resolution, and remaining Course/Attendance exceptional policies.
- Kind-governed commands, revisions/idempotency, audit/outbox, and sanitized outcomes.

## Out of scope

- AdminIssue repository, dedupe, revisions infrastructure, generic lifecycle plumbing, Booking-side conflict detection, unrestricted generic dismissal that bypasses issue-kind policy, and whole-Course cancellation.

## Authoritative references

- ADR-0004 — Attendance, outcome, AdminIssue, conflicts, and corrections.
- ADR-0002 — canonical commands, concurrency, idempotency, and atomic execution.
- ADR-0003 — payment/funding facts and financial correction effects.
- ADR-0005 — audit/outbox and sanitized access boundaries.
- `CONTEXT.md` — exceptional policy matrices.

## Acceptance criteria

- [ ] Course payment/start violations use T14’s issue lifecycle and deterministic identity machinery.
- [ ] Course-side conflict preserves factual `present`, creates/reuses its issue, and blocks normal automatic outcome.
- [ ] Administrator conflict/cancelled-present/outcome corrections are explicit kind-policy commands with auditable results.
- [ ] Booking-side conflict detection remains solely in T20 and is not duplicated here.
- [ ] Generic persistence, dedupe, revision, and lifecycle behavior are reused unchanged.

## Required tests

- Cross-aggregate policy matrices for Course gates/conflicts and all exceptional corrections.
- Emulator tests proving reuse/dedupe, stale/replay handling, concurrent funding/Attendance, authorization, audit/outbox, and rollback.
- Regression test proving T20 remains the only Booking-side conflict detector.

## Failure and edge cases

- Concurrent Admin resolutions, forbidden dismissal, payment correction during resolution, cancelled-plus-present, stale issue/Attendance revisions.

## Blocked by

- T24 — Implement Course transfer, cancellation, withdrawal, and capacity freeze.
- T25 — Extend Attendance and outcome calculation to CourseDays.

## Unlocks

T27 and T32.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- No duplicate AdminIssue core or Booking-side conflict detection exists; whole-Course cancellation remains absent.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
