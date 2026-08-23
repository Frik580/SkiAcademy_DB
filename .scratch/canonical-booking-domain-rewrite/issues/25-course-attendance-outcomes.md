# T25: Extend Attendance and outcome calculation to CourseDays

**Phase:** 4 — Course vertical slice  
**Status:** ready-for-agent

## What to build

Record factual Attendance for CourseEnrollment participation on each CourseDay and derive normal Course delivery outcomes using the canonical Attendance model.

## Scope

- Authorized CourseDay Attendance recording and sanitized results.
- Normal completed/no-show derivation where Course policy permits.
- Missing-Attendance issue invocation using existing T14 infrastructure.
- Revisions, idempotency, audit, outbox, and transaction-budget enforcement.

## Out of scope

- Course payment-start gate, Course-side payment conflict, exceptional Admin correction, and whole-Course cancellation.

## Authoritative references

- ADR-0001 — CourseEnrollment and Attendance roots.
- ADR-0002 — command/concurrency/idempotency rules.
- ADR-0004 — factual Attendance and normal outcome derivation.
- ADR-0005 — audit/outbox and sanitized access.

## Acceptance criteria

- [ ] CourseDay Attendance facts remain independent of outcome.
- [ ] Normal eligible outcomes and missing-Attendance issues are deterministic and replay-safe.
- [ ] The slice reuses generic AdminIssue infrastructure rather than recreating it.

## Required tests

- CourseDay Attendance/outcome matrix tests and Emulator tests for concurrent records, missing Attendance, replay, authorization, and rollback.

## Failure and edge cases

- Participant not enrolled on day, duplicate record, late record, changed CourseDay, missing Attendance at resolver time.

## Blocked by

- T22 — Administer CourseDay schedules and Instructor claims.
- T23 — Create atomic CourseEnrollments for account, guest, and admin flows.

## Unlocks

T26 and T27.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- Factual Attendance is preserved and no duplicate AdminIssue core is added.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
