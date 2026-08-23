# T09: Implement exact interval claims and uniqueness guards

**Phase:** 2 — Command and transaction infrastructure  
**Status:** ready-for-agent

## What to build

Provide transaction-plannable claims and guards that prevent overlapping Instructor/resource use and duplicate canonical ownership without broad locks.

## Scope

- Exact interval claim identity, acquisition, replacement, and release operations.
- Deterministic uniqueness guards and conflict reporting.
- Claim operations integrated into atomic command plans.

## Out of scope

- Booking/Course scheduling policy, approximate hour locks, and cleanup schedulers.

## Authoritative references

- ADR-0002 — resource claims/guards and transaction model.
- Canonical rewrite specification — removal of legacy availability/hour-lock behavior.

## Acceptance criteria

- [ ] Overlapping protected intervals cannot both commit.
- [ ] Adjacent non-overlapping intervals remain valid.
- [ ] Reschedule-style claim replacement is atomic and replay-safe.

## Required tests

- Emulator concurrency tests for overlap, adjacency, release/reacquire, and deterministic guard collision.

## Failure and edge cases

- Zero-length interval, timezone/DST boundary, same-resource concurrent acquisition, stale release.

## Blocked by

- T07 — Build atomic transaction planning and safety-budget preflight.
- T08 — Add revisions, deterministic identities, and transactional idempotency.

## Unlocks

Phase-3 Booking reservations and Phase-4 CourseDay scheduling.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- Legacy slot/hour-lock compatibility is absent; decisions are documented.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
