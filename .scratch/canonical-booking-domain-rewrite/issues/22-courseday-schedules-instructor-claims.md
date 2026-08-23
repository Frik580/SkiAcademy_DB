# T22: Administer CourseDay schedules and Instructor claims

**Phase:** 4 — Course vertical slice  
**Status:** ready-for-agent

## What to build

Let Administrators create and change canonical CourseDay schedules while atomically protecting Instructor/resource intervals with the existing exact-claim infrastructure.

## Scope

- CourseDay create/reschedule commands and authorized read results.
- Exact claim acquisition/replacement/release, revisions, idempotency, audit, and outbox.
- Course schedule validation within transaction safety budgets.

## Out of scope

- CourseEnrollment, whole-Course cancellation, legacy hour locks, UI, and saga scheduling.

## Authoritative references

- ADR-0001 — Course/CourseDay physical topology.
- ADR-0002 — commands, exact claims, revisions, idempotency, and safety budgets.
- ADR-0005 — audit/outbox durability.
- Canonical rewrite specification — Course phase and clean-cutover constraints.

## Acceptance criteria

- [ ] Valid CourseDay schedules acquire exact claims atomically.
- [ ] Conflicting, stale, unauthorized, or oversized changes leave schedule/claims unchanged.
- [ ] No whole-Course cancellation command is introduced.

## Required tests

- Emulator tests for create/reschedule, overlap/adjacency, concurrent claim race, replay, rollback, and budget rejection.

## Failure and edge cases

- Duplicate day, Instructor conflict, invalid day ordering, changed Course revision, multi-day plan above budget.

## Blocked by

- T11 through T21 — complete Phase-3 lesson gate.

## Unlocks

T25, T26, and T27.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- No legacy lock, compatibility projection, whole-Course cancellation, or saga fallback exists.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
