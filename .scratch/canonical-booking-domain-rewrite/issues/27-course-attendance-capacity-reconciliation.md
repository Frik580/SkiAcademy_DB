# T27: Verify and reconcile Course, Attendance, capacity, and claims

**Phase:** 4 — Course vertical slice  
**Status:** ready-for-agent

## What to build

Provide read-only verification and explicit canonical repair commands that detect and reconcile CourseEnrollment, CourseDay, Attendance, capacity, claim, and financial inconsistencies without rewriting history.

## Scope

- Deterministic consistency checks and Administrator reports.
- Explicit authorized repair commands where the specification permits correction.
- Revision/idempotency, immutable audit, outbox, and sanitized result handling.

## Out of scope

- Historical migration, silent background repair, Activity Log mutation, whole-Course cancellation, and generic document patching.

## Authoritative references

- ADR-0001 — canonical aggregate topology.
- ADR-0002 — commands, guards, concurrency, and stable errors.
- ADR-0003 — financial reconciliation.
- ADR-0004 — Attendance/AdminIssue correctness.
- ADR-0005 — immutable audit and access boundaries.

## Acceptance criteria

- [ ] Verification detects orphan/duplicate/capacity/claim/Attendance/funding inconsistencies deterministically.
- [ ] Every permitted repair is an explicit canonical command with atomic audit/outbox.
- [ ] Unrepairable discrepancies are reported without silent mutation.

## Required tests

- Seeded inconsistency matrix and Emulator tests for reports, authorized repairs, replay, stale revisions, and preservation of history.

## Failure and edge cases

- Multiple simultaneous discrepancies, repair race, unknown aggregate reference, over-capacity state, mismatched financial projection.

## Blocked by

- T22, T23, T24, T25, and T26.

## Unlocks

T28 and the Phase-4 gate.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- Verification is canonical-only and does not become a migration/backfill path.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
