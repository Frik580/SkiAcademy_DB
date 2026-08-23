# T41: Complete post-cutover verification and reject all legacy behavior

**Phase:** 7 — Clean cutover  
**Status:** ready-for-agent

## What to build

Verify the deployed canonical system end to end, confirm operational health and invariant preservation, and prove every legacy read/write/behavior remains rejected after cutover.

## Scope

- Production-safe canonical smoke journeys across lesson, Course, finance, Attendance/AdminIssue, audit/outbox, schedules, and sanitized history.
- Rules/access, scheduler, worker, projection, reconciliation, alert, and release-version verification.
- Negative checks for legacy APIs, collections, queries, jobs, and client mutations.

## Out of scope

- Reintroducing compatibility, migrating historical transactions, inventing new semantics, whole-Course cancellation, and unaudited hot fixes.

## Authoritative references

- Canonical rewrite specification — final verification, clean cutover, and legacy rejection.
- ADR-0001 through ADR-0005 — all canonical topology, command, finance, Attendance/AdminIssue, and durability invariants.

## Acceptance criteria

- [ ] Representative canonical workflows succeed with correct authorization, money, claims, Attendance/issues, audit, outbox, and read models.
- [ ] Schedulers/workers/reconciliation/alerts are healthy with no unexplained backlog or invariant violation.
- [ ] Every enumerated legacy endpoint/path/query/write fails or is absent.
- [ ] Release evidence records the final version, verification results, known non-blocking observations, and operational ownership.

## Required tests

- Production-safe smoke/verification suite, access checks, reconciliation reports, worker/scheduler health checks, and legacy-negative probes.

## Failure and edge cases

- Latent legacy client, delayed outbox obligation, projection lag, unexpected access, financial mismatch, stale scheduler deployment.

## Blocked by

- T40 — Execute the clean Firestore reset, seed, and canonical deployment.

## Unlocks

Completion of the canonical rewrite.

## Definition of done

- Verification evidence is complete and every release-blocking discrepancy is resolved through canonical procedures.
- No compatibility fallback, historical migration, whole-Course cancellation, or saga substitution is introduced.
- Graphify is best-effort and non-blocking; final changes/evidence are ready for `$code-review`.
