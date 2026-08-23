# T31: Migrate CourseEnrollment, CourseDay, and Attendance UX

**Phase:** 5 — Frontend and read-model migration  
**Status:** ready-for-agent

## What to build

Move customer and Instructor Course enrollment, schedule, Attendance, transfer, cancellation, and withdrawal experiences to canonical commands and authorized read models.

## Scope

- Course/CourseDay discovery and authorized schedule views.
- Account/guest CourseEnrollment and transfer/withdrawal/cancellation flows.
- Instructor CourseDay Attendance recording and normal outcome state.
- Canonical error/stale-revision handling with focused feature contracts.

## Out of scope

- Whole-Course cancellation, Administrator correction UI, raw Activity Logs, and compatibility views.

## Authoritative references

- ADR-0001 — CourseEnrollment/CourseDay/Attendance topology.
- ADR-0002 — command/revision/error behavior.
- ADR-0003 — Course funding effects.
- ADR-0004 — Attendance/outcome semantics.
- Canonical rewrite specification and `CONTEXT.md`.

## Acceptance criteria

- [ ] Course interactions use canonical commands/read models exclusively.
- [ ] Factual Attendance is presented independently from derived outcome.
- [ ] UI exposes no whole-Course cancellation action or legacy Course-shaped Booking path.

## Required tests

- Component/integration/E2E tests for enroll, last-seat rejection, guest action, transfer, withdrawal, schedule, Attendance, stale/error states.

## Failure and edge cases

- Full/frozen Course, expired guest token, stale enrollment, cancelled CourseDay, missing Attendance, access revoked.

## Blocked by

- T28 — Establish canonical frontend command and read-model boundary.

## Unlocks

Phase-5 gate and later legacy removal.

## Definition of done

- Targeted UI/E2E tests and repository typecheck/lint/format/build pass.
- Touched UI follows feature boundaries; no compatibility flow or whole-Course cancellation exists.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
