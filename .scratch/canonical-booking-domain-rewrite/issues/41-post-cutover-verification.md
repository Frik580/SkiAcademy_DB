# T41: Expanded Post-Cutover Verification

**Phase:** 7 — Incremental production cutover  
**Status:** ready-for-agent

## Supersession (2026-09-08)

Original T41 verified canonical workflows after a clean empty-database cutover. Production verification is now **incremental**: after T40 selective cutover, prove both technical leftover-rejection and full product reachability using 9P inventory rows.

Blocked by: **T40 — Execute Rehearsed Selective Production Cutover** (not a full Firestore reset).

## What to build

Verify the deployed canonical system end to end, confirm operational health and invariant preservation, prove leftover reads/writes remain rejected, and prove 9P-protected product journeys still work on the preserved data.

## Scope

### Product journeys (production-safe)

- Guest lesson
- Guest course enrollment
- payment / expiry
- Student lesson booking
- multi-participant lesson (F3 accepted design; do not change it here)
- course enrollment
- cancellation
- Student Cabinet current / history
- progress / recommendations / achievements
- Reviews / rating
- Chat
- Homework
- Notifications
- Profile
- Participants
- Instructor schedule / history
- Attendance
- Admin planner
- Admin Booking detail
- Admin Courses
- Admin Finance
- People / Instructors
- Wallet
- starter credit
- registration / login
- assets / images

### Technical / leftover-negative verification

- deleted old callable unavailable
- old direct writes rejected
- old scheduler absent
- no frontend still calling a deleted leftover path
- Rules/access, scheduler, worker, projection, reconciliation, alert, and release-version verification
- 9D0/9D preserve/delete manifest still holds (`expected preserved == actual preserved`, unexpected deletion = 0)

## Out of scope

- Reintroducing compatibility, migrating historical legacy lessons, inventing new semantics, whole-Course cancellation, unaudited hot fixes, and reopening F3 multi-participant design.

## Authoritative references

- Canonical rewrite specification — incremental production amendment and T41 checklist.
- [T32_CANONICAL_ADMIN_AUDIT.md](../../../docs/T32_CANONICAL_ADMIN_AUDIT.md) — 9P / 9E / T40 / T41.
- ADR-0001 through ADR-0008 — topology, command, finance, Attendance, durability, guest confirmation, UX preservation.

## Acceptance criteria

- [ ] Every listed product journey succeeds or is recorded as an explicit Product Owner exclusion on the 9P inventory.
- [ ] Representative canonical workflows succeed with correct authorization, money, claims, Attendance/issues, audit, outbox, and read models.
- [ ] Reviews/rating, Chat, Homework, Notifications, Profile, Auth, Participants, Finance, and assets remain reachable.
- [ ] Schedulers/workers/reconciliation/alerts are healthy with no unexplained backlog or invariant violation.
- [ ] Every enumerated leftover endpoint/path/query/write fails or is absent.
- [ ] No frontend bundle still imports or calls a deleted leftover path.
- [ ] Release evidence records the final version, verification results, known non-blocking observations, and operational ownership.

## Required tests

- Production-safe smoke/verification suite covering the journey list above.
- Access checks, reconciliation reports, worker/scheduler health checks, and leftover-negative probes.

## Failure and edge cases

- Latent leftover client, delayed outbox obligation, projection lag, unexpected access, financial mismatch, stale scheduler deployment, missing chat/homework after parent-document cleanup, review/rating drift, missing assets.

## Blocked by

- T40 — Execute Rehearsed Selective Production Cutover.

## Unlocks

Completion of the canonical rewrite production cutover.

## Definition of done

- Verification evidence is complete and every release-blocking discrepancy is resolved through canonical procedures.
- No compatibility fallback, historical legacy-lesson migration, whole-Course cancellation, or saga substitution is introduced.
- Graphify is best-effort and non-blocking; final changes/evidence are ready for `$code-review`.
