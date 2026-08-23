# T04: Model Course, CourseDay, CourseEnrollment, Attendance, and AdminIssue

**Phase:** 1 — Canonical domain contracts  
**Status:** ready-for-agent

## What to build

Define canonical Course delivery and enrollment topology together with factual Attendance and typed AdminIssue contracts shared by lesson and Course workflows.

## Scope

- Course, CourseDay, and CourseEnrollment identities, capacities, schedules, and revisions.
- Attendance as an independent factual root.
- Typed AdminIssue lifecycle, kind, blocking semantics, deterministic identity inputs, and subject references.

## Out of scope

- Command/repository behavior, full issue policies, whole-Course cancellation, and compatibility projections.

## Authoritative references

- ADR-0001 — CourseEnrollment, Payment, and Attendance topology.
- ADR-0004 — Attendance, outcome, and AdminIssue model.
- Canonical rewrite specification and `CONTEXT.md`.

## Acceptance criteria

- [ ] CourseEnrollment is distinct from Course and Booking.
- [ ] Attendance preserves facts independently of outcome/payment state.
- [ ] AdminIssue contracts support kind-governed open/reopen/resolve/dismiss behavior and blocking flags.

## Required tests

- Schema tests for capacity, CourseDay intervals, Attendance facts, and issue kinds/lifecycle.
- Negative tests for whole-Course cancellation fields and invalid cross-aggregate references.

## Failure and edge cases

- Duplicate CourseDays, invalid capacity, orphan enrollment, contradictory Attendance facts, unknown issue kinds.

## Blocked by

- T01 — Establish canonical primitives, IDs, paths, and validation.

## Unlocks

T14, T20, and Phase-4 Course slices.

## Definition of done

- Targeted tests and repository typecheck/lint/format/build pass; canonical fixtures are added.
- No compatibility behavior or ADR/spec deviation is introduced; decisions are documented.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
