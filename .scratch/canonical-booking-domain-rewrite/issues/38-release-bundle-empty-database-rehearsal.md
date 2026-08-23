# T38: Build canonical seed, cutover verifier, release manifest, and empty-database rehearsal

**Phase:** 6 — Rules, jobs, reliability, and cutover tooling  
**Status:** ready-for-agent

## What to build

Assemble and rehearse the exact canonical release bundle against an empty nonproduction database, including Rules/indexes, schedulers, outbox/reliability, guarded reset tooling, canonical seed, manifest, and end-to-end verification.

## Scope

- Minimal canonical seed and deterministic release manifest.
- Empty Firestore/Storage rehearsal using the guarded reset tooling.
- Deployment/verification of Rules, indexes, command services, scheduler adapters, outbox worker, projections, and observability.
- Canonical workflow and negative legacy-path verifier.

## Out of scope

- Production cutover, historical transactional migration/import, compatibility projections, whole-Course cancellation, and unresolved release exceptions.

## Authoritative references

- Canonical rewrite specification — clean reset/cutover, seven phases, release bundle, and legacy-removal sequence.
- ADR-0001 — canonical physical topology.
- ADR-0002 — command/transaction/resource guarantees.
- ADR-0003 — financial invariants.
- ADR-0004 — Attendance/outcome/AdminIssue invariants.
- ADR-0005 — audit/outbox/read-model durability and access.

## Acceptance criteria

- [ ] Rehearsal starts from verified empty Firestore and Storage and loads only canonical seed data.
- [ ] The exact bundle includes and verifies T34 Rules/indexes, T35 schedulers, T36 outbox/reliability/observability, and T37 reset/version tooling.
- [ ] Representative lesson, Course, finance, Attendance/AdminIssue, audit/outbox, and sanitized-history E2Es pass.
- [ ] Legacy reads/writes/queries are rejected; no dual mode or compatibility projection is present.
- [ ] Rehearsal evidence and release manifest are reproducible and release-ready.

## Required tests

- Full empty-database deployment/rehearsal suite, canonical E2Es, Rules authorization suite, scheduler/worker reliability checks, and legacy-negative scans.

## Failure and edge cases

- Missing index, scheduler disabled, outbox backlog, projection rebuild failure, nonempty target, manifest drift, seed above transaction budget.

## Blocked by

- T34 — Replace Firestore/Storage Rules and canonical indexes.
- T35 — Implement canonical-command scheduler adapters.
- T36 — Implement outbox worker, reliability policy, reconciliation, and observability.
- T37 — Build guarded export, Firestore reset, Storage reset, and release-version tooling.

## Unlocks

T39 and the Phase-6 gate.

## Definition of done

- The full rehearsal suite and repository typecheck/lint/format/build pass with recorded release evidence.
- No scheduler/outbox omission, compatibility behavior, migration, or saga fallback remains.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
