# T32: Deliver Administrator canonical operations UX

**Phase:** 5 — Frontend and read-model migration  
**Status:** ready-for-agent

## What to build

Give Administrators focused canonical operations for Booking, CourseEnrollment, AdminIssue, Attendance/outcome correction, and schedule/calendar management.

## Scope

- Administrator Booking and CourseEnrollment management.
- AdminIssue resolution UI governed by issue-kind policy.
- Attendance/outcome correction and schedule/calendar administration.
- Canonical error, authorization, conflict, and stale-revision handling.

## Out of scope

- Raw Activity Log/history delivery, generic status/document patching, unrestricted issue dismissal, and compatibility admin tools.

## Authoritative references

- ADR-0001 — aggregate ownership/topology.
- ADR-0002 — command/revision/error behavior.
- ADR-0003 — financial correction semantics.
- ADR-0004 — AdminIssue and Attendance correction policy.
- ADR-0005 — administrative access/audit boundaries.

## Acceptance criteria

- [ ] Every operation invokes an explicit canonical command with expected revision.
- [ ] AdminIssue actions offered by the UI are limited by issue-kind policy.
- [ ] Attendance/payment conflict resolution preserves factual Attendance and shows sanitized canonical results.

## Required tests

- Component/integration tests for Booking/Enrollment operations, issue policies, corrections, schedules, stale revisions, authorization, and stable errors.

## Failure and edge cases

- Issue resolves concurrently, forbidden dismissal, stale Attendance, schedule conflict, financial correction required, partial read authorization.

## Blocked by

- T28 — Establish canonical frontend command and read-model boundary.

## Unlocks

Phase-5 gate and later legacy-admin removal.

## Definition of done

- Targeted UI/integration tests and repository typecheck/lint/format/build pass.
- No generic patch or compatibility admin route remains in the migrated slice.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
