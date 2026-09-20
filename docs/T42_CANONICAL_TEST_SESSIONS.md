# T42 Canonical Test Sessions

Date: 2026-09-20

Status: **IN PROGRESS / T42B-1 IMPLEMENTED + VALIDATED / NEXT T42B-2**

This document is the living T42 status and implementation plan. Architecture
authority is [ADR-0010](adr/0010-canonical-test-sessions-and-live-test-data-isolation.md).
Canonical migration closure is recorded in
[T32_CANONICAL_ADMIN_AUDIT.md](T32_CANONICAL_ADMIN_AUDIT.md).

Distinguish:

| Kind | Meaning |
| ---- | ------- |
| **IMPLEMENTED / CLOSED** | Done. T42A is architecture/preflight only. |
| **APPROVED ARCHITECTURE** | Owner-accepted design. Not present in production. |
| **PLANNED T42B IMPLEMENTATION** | Future slices. Not started. |

Do **not** read this document as meaning that `dataScope` exists in production,
that Test Sessions can already be created, that Rules already enforce test
isolation, that test-actor Auth users already exist, or that a `dataScope`
migration already ran.

## Current sequence

```text
DONE  Canonical migration — COMPLETE
        T32.9A PASS / CLOSED
        T32.9B PASS / CLOSED
        T39    PASS / CLOSED
        T40    PASS / CLOSED
        T41    PASS / CLOSED
        T41 release commit 908bb9676f0202605163edd70630b2d49bfc4176

DONE  T42A — architecture / preflight COMPLETE
        READY_FOR_OWNER_APPROVAL / APPROVED FOR T42B
        code changes = NO
        deploy = NO
        migration = NO
        production writes = NO

DONE     T42B-0 — fresh read-only production inventory (2026-09-20)

DONE     T42B-1 — core source plumbing IMPLEMENTED / VALIDATED
         deploy / migration / production writes = NO

NEXT     T42B-2 after owner approval
         T42B-3 ... T42B-9

THEN     T43 — Test Session Guest Support
```

Later, separate from T42 v1:

- multiple concurrent active Test Sessions;
- session-specific automation / smoke tooling;
- richer test fixture management.

## Why T42 exists

Testing must no longer require mass production cleanup or mixing test history
with live data. Owner decision: **do not** create a separate Firebase staging
project. Use one project, `ski-school-8f3ca`, with logically and server-isolated
Test Sessions.

## T42A — architecture / preflight — COMPLETE / APPROVED FOR T42B

T42A was documentation and owner decision only.

- code changes = NO
- deploy = NO
- migration = NO
- production writes = NO

Main architecture is approved. See [ADR-0010](adr/0010-canonical-test-sessions-and-live-test-data-isolation.md).

### Important correction: T42A production inventory is stale

T42A contained a pre-T40 production inventory and mentioned old counts such as:

```text
payments = 69
monetary_events = 77
wallet_ledger = 17
messages = 25
live bookings
```

Those numbers are **HISTORICAL / STALE**. T40 and T41 happened afterward. They
are not current production state.

Before T42B `dataScope` migration, **T42B-0 MUST perform a fresh read-only
production inventory**. Current production counts must not be inferred from
T42A.

## T42B-0 production baseline (2026-09-20, read-only)

Project `ski-school-8f3ca` ACTIVE (`782358732601`). `dataScope` /
`testSessionId` / `test_sessions` / `test_actors` are still absent.

Transactional collections after T40 are **empty**: bookings, messages,
enrollments, attendance, payments, monetary_events, wallet_ledger, claims,
guards, reviews, progress, achievements, feedback, admin_issues,
notifications, work queues = 0.

Preserved identity: users=4, participants=6, participant_management=6,
instructors=2, courses=6, CourseDays=15. Wallet `/state` docs=0 (lazy);
`starter_credit_grant` markers=4; `settings/starter_credit.amountKzt`=0.
Auth users=8 (4 canonical + 4 leftover test-like Auth without `/users`).
Indexes: source 40 composites, production READY 40.

T42B-8 backfill of empty transactional collections is currently **N=0**.
Identity/catalog/config docs still need explicit `dataScope=live` later.

## Owner correction: approved persistent Test Parent

Account `F5mwFT8KvAOkYHxlElpagT1yftr1` (`ksusha@test.ru`) is approved as the
future persistent `test_parent`. This supersedes the earlier product-policy
classification used during T42B-0 inventory; that inventory remains valid as
a historical observation of production state at the time.

Classification will be server-authoritative through `/test_actors` and the
server-owned assignment. Email, domain, display name, UID pattern, and role are
not classification authority. T42B-1 did not create the registry record,
change the Account/Participant graph, or perform any production write. The
Account ID above is recorded only as the bounded future migration target.

## T42B-1 implementation (source-only)

Implemented and validated:

- canonical `DataScope`, `CanonicalExecutionScope`, `TestSessionId`,
  TestSession/TestActor/assignment/membership schemas, and canonical paths;
- authenticated callable `requestedTestSessionId` request plumbing and
  fail-closed `resolveCanonicalExecutionScope`;
- registry/assignment classification for persistent Test Actors, explicit
  active-session Admin context, deterministic LIVE default, and LIVE-only
  guest runtime;
- `MAX_ACTIVE_TEST_SESSIONS = 1` policy and active-status command gate;
- rejection of client-authoritative `intent.dataScope` and
  `intent.testSessionId`.

Only `active` consumes the v1 active-session slot. `provisioning`, `locked`,
`resetting`, `deleting`, `closed`, and `failed` do not. A future create/activate
command must enforce the limit transactionally; T42B-1 defines policy only and
does not implement lifecycle commands.

No Booking, Payment, Attendance, CourseEnrollment, claim/guard, idempotency,
outbox/work, read-model, Rules, index, Auth, Storage, or production-data change
was made. Test Sessions are not yet usable in production.

## Approved architecture (not implemented)

Summary only. Full decision text is ADR-0010.

1. **Scope model.** `dataScope = "live" | "test"`. LIVE: `dataScope = "live"`,
   `testSessionId` absent. TEST transactional data: `dataScope = "test"`,
   `testSessionId` required. Server-authoritative. Client cannot assign scope.
2. **TestSession.** `/test_sessions/{testSessionId}` with conceptual statuses
   provisioning / active / locked / resetting / deleting / closed / failed.
   Exact schema is T42B.
3. **No global test mode.** Live users keep creating LIVE data while a Test
   Session is active.
4. **Test Actors.** Persistent dedicated Firebase Auth accounts + canonical
   test Accounts/Participants + `/test_actors` registry + server-owned
   assignment. Identity persists across reset. No disposable Auth user per
   session.
5. **Admin context.** Live owner/admin Account stays LIVE. Admin may explicitly
   open a Test Session. Only commands inside that context get TEST scope.
6. **Concurrency.** T42 v1 max active Test Sessions = 1. Keys remain compatible
   with multiple `testSessionId` later.
7. **Guests.** TEST guest flows = DEFERRED to T43. T42 v1 = authenticated
   Owner/Admin, Test Student, Test Parent, Test Instructor. LIVE guest flows
   keep working.
8. **Collections.** Same canonical collections. No `test_bookings` /
   `test_payments` / `test_attendance` mirrors.

### Course strategy

LIVE Course / CourseDays are mutable live aggregates. TEST enrollment must not
change a live Course. Required Courses/CourseDays are cloned into TEST scope.
TEST Enrollment may reference only a TEST Course clone. LIVE
`Course.availableSeats` is unchanged by test enrollment.

Shared read-only reference data may be used without clone: skill config,
achievement definitions, lesson pricing read, resort data, selected immutable
settings.

### Instructor strategy

T42 v1: LIVE Instructor as TEST booking target = **FORBIDDEN**. Use a dedicated
TEST Instructor. Claims/guards/idempotency still become scope-aware. TEST
booking must not block live instructor occupancy.

### Claims / guards / idempotency

Scope is part of the uniqueness/idempotency namespace:

```text
LIVE key: live + resource identity
TEST key: test + testSessionId + resource identity
```

Applies at least to `resource_claims`, `resource_claim_guards`,
`active_course_enrollment_guards`, `command_idempotency`, and relevant
work/outbox records. A test claim must never conflict with a live claim.

### Finance

Persistent test-actor Wallet. LIVE Wallet is never used for a TEST operation.
Test Session has `startingBalanceKzt`. Reset deletes TEST Payments /
MonetaryEvents / TEST financial history, restores the test Wallet to
`startingBalanceKzt`, and restores canonical test seed/grant state when
needed. Live Wallet does not change.

TEST Payment must not reference a LIVE Booking/Enrollment. Admin owner live
Wallet must not pay a test Booking.

Production Starter Credit (`settings/starter_credit.amountKzt`) is a separate
canonical feature. Test Session must not change live starter-credit settings.
Test funding is TestSession config or a separate canonical test seed.

### Progress / achievements / reviews / homework

Dedicated TEST Participants. TEST data must not change live
ParticipantProgress, Achievements, LessonFeedback, learning hours, or streaks.
TEST review uses only a TEST Instructor and must not change live
`instructor_rating_summary`. Homework ownership is Participant-scoped
(`homeworkForParticipantIds`). Test chat/homework inherits TestSession scope
and must not appear for a live Participant.

### Storage

```text
test-sessions/{testSessionId}/...
test-actors/{id}/...
```

Reset/Delete may delete only `test-sessions/{requestedSessionId}/...`. Test
actor/session must not write to live Storage prefixes.

### Side effects

```text
TEST email  = suppress
TEST SMS    = suppress
TEST push   = suppress
TEST live payment provider = forbidden / sandbox only
TEST in-app notifications  = test actors only
```

Never send side effects to a real live customer.

### Read models

Normal product read models are LIVE ONLY by default. Test records must not
appear in ordinary Admin Lessons & Courses, Planner, Finance, Issue Center,
Student cabinet, Instructor dashboard, Reviews, Progress, Achievements,
Notifications, or public/live catalog where inappropriate. Test data is
available only through an explicitly validated Test context.

### Admin Testing UI (planned)

```text
Admin → System → Testing
```

Create / Open / Close Test Session; Reset Session History; Delete Test Session.
While Test context is open, a persistent visible TEST banner is required. Live
and Test UI must not be visually mixed.

## Reset Session History (approved semantics; not implemented)

Reset **preserves**:

- TestSession
- persistent test Auth accounts
- test Accounts / Participants
- test Instructor identity
- test actor registry
- membership/assignment as designed
- persistent test actor avatars
- maintenance audit

Reset **deletes or resets** session-owned:

- Bookings
- messages / homework
- proposals
- change requests
- Attendance
- CourseEnrollments
- TEST Course clones / CourseDays as designed
- Payments / MonetaryEvents
- claims / guards
- Issues
- outbox / work
- Notifications
- Feedback / Reviews
- Progress / Achievements
- session Storage prefix
- session idempotency records
- other exact session-owned transactional state

Wallet resets to `TestSession.startingBalanceKzt`. Course clones are preferably
re-provisioned cleanly.

## Delete Test Session (separate from Reset)

Delete Session:

- locks the session and prevents new writes;
- previews an exact manifest;
- deletes all session-owned docs, session Storage prefix, and session-owned
  fixtures;
- removes membership/assignment for that session;
- verifies zero residue;
- preserves persistent test actors unless separately retired;
- preserves maintenance audit.

## Live hard safety

Every reset/delete target must satisfy:

```text
dataScope == "test"
AND
testSessionId == requestedTestSessionId
```

If **any** candidate is `dataScope == "live"` or has another session ID:

```text
ABORT THE ENTIRE OPERATION
```

Never continue best-effort after discovering a live target.

## Preview / manifest

```text
Preview
  → manifestId / hash
  → counts
  → expiresAt
  → confirmation
  → server rebuild / revalidation
  → execute
```

If state changed: `TEST_RESET_MANIFEST_STALE`. Admin must preview again. Client
never sends arbitrary document IDs to delete.

## Failure recovery

Maintenance state: `resetting` / `deleting` + `operationId` + lease.

On crash:

- Test Session remains locked;
- live data is unaffected;
- retry is idempotent / resumable;
- verifier determines remaining work;
- audit records failure / recovery.

No blind manual cleanup.

## T42B implementation plan

| Slice | Name | Status |
| ----- | ---- | ------ |
| T42B-0 | Post-T41 Rebase: fresh production inventory, current canonical graph, exact migration/index baseline | **COMPLETE** (2026-09-20; transactional collections empty after T40; `dataScope` still absent) |
| T42B-1 | Core: TestSession, test actors, assignments, CanonicalExecutionScope, resolver, max active sessions = 1 | **IMPLEMENTED / VALIDATED** (source-only; no deploy/migration/production writes) |
| T42B-2 | Write propagation: writers, claims, guards, idempotency, outbox/work, cross-scope assertions | **NEXT / WAIT FOR OWNER APPROVAL** |
| T42B-3 | Domain isolation: finance, progress, achievements, reviews, attendance, homework, CourseEnrollment | PLANNED |
| T42B-4 | Storage + side effects | PLANNED |
| T42B-5 | Read-model isolation | PLANNED |
| T42B-6 | Admin Testing UI | PLANNED |
| T42B-7 | Reset/Delete engine: preview, manifests, locks, audit, verifier | PLANNED |
| T42B-8 | Existing LIVE data backfill; Firestore Rules; Storage Rules; indexes; strict dataScope contract | PLANNED |
| T42B-9 | Authenticated isolation smoke | PLANNED |

Future after T42B: **T43 — Test Session Guest Support**.
