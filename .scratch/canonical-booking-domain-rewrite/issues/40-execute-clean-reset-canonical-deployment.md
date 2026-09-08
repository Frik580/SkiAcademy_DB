# T40: Execute Rehearsed Selective Production Cutover

**Phase:** 7 — Incremental production cutover  
**Status:** ready-for-agent

## Supersession (2026-09-08)

**Previous title:** Execute the clean Firestore reset, seed, and canonical deployment.

That original T40 / Phase 7 full Firestore/Storage reset → empty seed is **superseded as a production instruction**. It remains a historical/reference contract and may still be executed only as **nonproduction architectural rehearsal** (T38).

Current production policy: **selective incremental cleanup**. Live canonical Booking, Payment, Attendance, claims, enrollments, audit, and 9P-approved product data (reviews, chat/homework, notifications, profile, assets) must be preserved.

Authoritative sequence: [T32_CANONICAL_ADMIN_AUDIT.md](../../../docs/T32_CANONICAL_ADMIN_AUDIT.md), [ADR-0008](../../../docs/adr/0008-ux-preservation-during-canonical-migration.md), rewrite spec incremental-production amendment.

```text
9A PASS (including F3 smoke; do not reopen F3 design)
→ 9B PASS (including Reviews / rating)
→ 9C PASS
→ 9P PASS
→ 9D0 PASS
→ 9D (selective leftover data cleanup; one rehearsed manifest)
→ 9E PASS
→ T32.9B / T39 physical legacy-runtime cleanup
→ T40 this ticket
→ T41 expanded verification
```

## What to build

Execute the approved guarded **selective** production cutover exactly as rehearsed in 9D0: verified export, preserve/delete manifest, canonical release deployment (T32.9B-cleaned runtime), and release-manifest capture.

If 9D already applied that manifest in the target environment, T40 verifies the manifest still holds and deploys runtime only. Do not run a second independent deletion pass. Do not full-reset Firestore or Storage. Do not empty-seed production.

## Scope

- Formal preflight/authorization, backup verification, maintenance coordination, and exact target confirmation.
- Confirm 9A–9E and T32.9B/T39 PASS evidence, including 9P inventory and 9D0 rehearsal report.
- Deploy the rehearsed canonical release bundle (Rules, indexes, Functions, jobs, frontend).
- Apply only remaining 9D-class deletions if they were held for this window — same discriminator and manifest as 9D0.
- Capture immutable operator evidence, versions, timestamps, and immediate smoke results.

## Out of scope

- Full Firestore/Storage reset on production
- Empty-database seed as the production migration
- Historical leftover-lesson backfill into canonical Booking
- Ad hoc repair, dual-read/write rollback mode, compatibility projection
- Unapproved target deletion, including `bookings/{id}/messages` without 9P policy
- Changing the accepted F3 multi-participant design

## Authoritative references

- Canonical rewrite specification — incremental production amendment; original clean-reset section is historical/nonproduction.
- T32.9A.9D0 rehearsal evidence and T32.9A.9D preserve/delete manifest.
- T37 guarded tooling (selective + nonproduction full-reset tools).
- ADR-0005 — audit/release evidence policy.
- ADR-0008 — UX preservation; 9P inventory.

## Acceptance criteria

- [ ] Explicit production authorization and verified recoverable export exist before any deletion.
- [ ] Exact project/environment identifiers and manifest match the successful 9D0 rehearsal.
- [ ] `expected preserved == actual preserved` and `expected deleted == actual deleted`; unexpected deletion/mutation/ambiguous records = 0.
- [ ] Canonical Booking, Payment, Attendance, Resource Claims, Participants/relations, CourseEnrollment, canonical audit/history, and 9P-approved reviews/chat/homework/notifications/profile/assets remain.
- [ ] Firestore/Storage were **not** collection-wide reset.
- [ ] Immediate Rules, command, scheduler, outbox, and smoke checks pass or the approved recovery procedure is invoked.

## Required tests

- Preflight/dry-run verification and the exact post-deploy smoke subset recorded by 9D0/T41.
- Independent manifest/version verification (not empty-before-seed).

## Failure and edge cases

- Wrong target, export mismatch, partial selective delete, deploy drift, unavailable worker/scheduler, failed smoke test, attempt to run T38 empty reset against production.

## Blocked by

- T32.9A.9E PASS
- T32.9B / T39 legacy-runtime cleanup PASS, or an explicit decision that T40 deploys that release in the same window
- T32.9A.9D0 PASS
- 9P PASS

## Unlocks

T41.

## Definition of done

- Approved selective cutover checklist and evidence are complete; deployed version matches the rehearsed manifest.
- No full reset, empty seed, historical legacy-lesson migration, compatibility mode, or unplanned mutation occurs.
- Graphify is best-effort and non-blocking; operational handoff is ready for `$code-review`/release review.

## Historical original contract (superseded for production)

The original T40 required: verified export, **Firestore/Storage reset**, canonical seed, and empty-before-seed verification so the environment contained only canonical seed/runtime data. Keep that text as the isolated T38 rehearsal contract. Do not execute it against production that already holds canonical transactional or 9P-protected product data.
