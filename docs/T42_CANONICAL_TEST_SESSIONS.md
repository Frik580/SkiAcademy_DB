# T42 Canonical Test Sessions

Date: 2026-09-21

Status: **IN PROGRESS / T42B-4 IMPLEMENTED + VALIDATED / NEXT T42B-5**

This document is the living T42 status and implementation plan. Architecture
authority is [ADR-0010](adr/0010-canonical-test-sessions-and-live-test-data-isolation.md).
Canonical migration closure is recorded in
[T32_CANONICAL_ADMIN_AUDIT.md](T32_CANONICAL_ADMIN_AUDIT.md).

Distinguish:

| Kind                            | Meaning                                           |
| ------------------------------- | ------------------------------------------------- |
| **IMPLEMENTED / CLOSED**        | Done. T42A is architecture/preflight only.        |
| **APPROVED ARCHITECTURE**       | Owner-accepted design. Not present in production. |
| **PLANNED T42B IMPLEMENTATION** | Future slices. Not started.                       |

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

DONE     T42B-2 — scoped writers and scoped canonical keys IMPLEMENTED / VALIDATED
         deploy / migration / production writes = NO

DONE     T42B-3 — Canonical Domain Isolation IMPLEMENTED / VALIDATED
         deploy / migration / production writes = NO

DONE     T42B-4 — Storage namespace + TestSideEffectPolicy IMPLEMENTED / VALIDATED
         deploy / migration / production writes = NO
         Storage Rules source changed; Storage Rules deploy = NO

NEXT     T42B-5 — LIVE-only default read models + TestSession-scoped reads
         T42B-6 ... T42B-9

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

## T42B-2 implementation (source-only)

Implemented and validated:

- one persisted-scope contract stamps LIVE as `dataScope=live` with no
  `testSessionId`, and TEST as `dataScope=test` with the authoritative
  `testSessionId`;
- canonical transaction writes for Booking, BookingProposal,
  BookingChangeRequest, Attendance, CourseEnrollment, claims/guards,
  idempotency, domain outbox, domain activity logs, AdminIssue, and
  administrative availability blocks pass through a common scope barrier;
- LIVE may read legacy missing-scope records during the bounded compatibility
  window; TEST requires explicit matching TEST scope and rejects LIVE,
  missing-scope, malformed, and other-session records;
- resource claim identity is `claim:v2 + scope + resource identity`; resource
  guard bucket identity is `guard:v2 + scope + bucket identity`; active
  enrollment guard keys are `aceg_v2_live_...` or
  `aceg_v2_test_<session-length>_<testSessionId>_...`;
- command identity is `command-key:v2 + scope + actor scope + idempotency key`,
  and `command-fingerprint:v2` also includes authoritative scope;
- booking and course-enrollment outcome work inherits trusted source scope;
  schedulers inherit work scope and process TEST work only while that
  TestSession is active;
- TEST commands do not bump LIVE `admin_runtime/*` revisions;
- T42B-2 originally fail-closed TEST writes to finance, Course/CourseDay
  capacity, Participant/Instructor state, progress, achievements, lesson
  feedback, reviews, and homework. T42B-3 replaced those temporary gaps with
  same-scope domain behavior (see below). Identity writes remain deferred to
  T42B-8.

Historical `command_idempotency` v1 documents remain unchanged. Production
claims and guards were empty at the T42B-0 baseline, so no v2 data migration
was needed. Missing persisted scope remains legacy LIVE compatibility only and
is scheduled for strict removal after the T42B-8 backfill.

T42B-2 made no production writes, created no TestSession/TestActor, changed no
Rules or indexes, and was not deployed. TEST commands remain non-user-accessible
in production; the feature is not usable until later T42B slices are approved
and completed.

## T42B-3 implementation (source-only)

Implemented and validated in emulator/unit fixtures. **Not production-usable.**
No TestSession, TestActor, or production identity (including
`F5mwFT8KvAOkYHxlElpagT1yftr1` / `ksusha@test.ru`) was created or mutated.

### Same-scope rule

Every mutable aggregate in one operation must have compatible scope via the
T42B-2 `assertSameCanonicalScope` contract. TEST requires `dataScope=test` and
the same `testSessionId`. LIVE accepts explicit LIVE or temporary missing-scope
LIVE compatibility. Missing scope is never accepted by TEST. Cross-session is
always `cross_scope_forbidden`. Command actor identity may remain LIVE admin
while operating a Test context; payer/subject identities must still match the
execution scope.

Resource classification lives in
`packages/shared-domain/src/canonical/testSessionDomainIsolation.ts`
(`TEST_SESSION_RESOURCE_CLASSIFICATION`). Mutable aggregates are never shared
across LIVE/TEST. Shared read-only references (skill definitions, achievement
definitions, lesson pricing READ, resort config, LIVE course clone templates)
may be read from LIVE during TEST. `settings/starter_credit` is not a TEST
funding authority.

### Test Wallet session semantics

Persistent TestActor Account keeps `/users/{accountId}/wallet/state`. Wallet
transactional state is session-bound:

- LIVE wallet: `dataScope=live`, `testSessionId` absent
- TEST wallet: `dataScope=test`, `testSessionId` = active TestSession
- a previous-session TEST wallet is rejected until
  `seedTestActorWalletForSession` explicitly rebinds it
- no implicit cross-session balance carryover
- seed uses `TestSession.config.startingBalanceKzt` and writes a canonical TEST
  `MonetaryEvent` (`sourceKind=system`, `reasonCode=test_wallet_seed`)
- production `settings/starter_credit` is not mutated; `grant_starter_credit`
  is TEST_FORBIDDEN and is also forbidden for an `allowed` TestActor even in
  LIVE context

### Payment / MonetaryEvent / refund

Payment inherits subject/execution scope. TEST Payment requires a same-session
TEST Booking or CourseEnrollment and a same-session TEST payer Account/Wallet.
LIVE wallet → TEST payment, TEST wallet → LIVE payment, and TEST-A → TEST-B are
forbidden. MonetaryEvent scope equals Payment/Wallet/subject. Admin
`pay_service_from_wallet_as_administrator` in TEST context debits the TEST
resource's linked TEST wallet, never the live owner/admin wallet. Refunds and
price adjustments cannot select a different scope; they follow the original
Payment. `record_provider_payment_event` with `sourceKind=provider` is TEST_FORBIDDEN.
Manual/canonical capture (`manual_external`) remains TEST_SUPPORTED.

### Test Course clone semantics

`cloneLiveCourseIntoTestSession` reads a LIVE course as an immutable template
and creates a new TEST Course + CourseDays:

- new `CourseId` / CourseDay IDs (deterministic from live source + session)
- `sourceCourseId` is provenance only, never mutation/capacity authority
- cloned product fields: title, lifecycle, price, capacity totals, schedule
  projection, timezone/intervals, roster rewritten to the dedicated TEST
  instructor
- fresh capacity: `availableSeats = totalSeats`
- live `availableSeats`, enrollment counters, live instructor IDs, live claims,
  live chat access, and live mutable residue are not copied
- Course catalog content is cloned under the TEST Course when present; TEST
  catalog is not exposed on live catalog reads (T42B-5)
- TEST enrollment mutates only the TEST clone; LIVE `availableSeats` stays
  unchanged. LIVE Course as a TEST mutation target is forbidden.

### Attendance / Progress / Achievements / Feedback

Lesson Attendance scope = Booking scope. Course Attendance scope =
CourseEnrollment/Course scope. The recorded Participant must be same-scope
TEST identity for TEST operations. TEST Attendance cannot target a LIVE
Participant, and LIVE Attendance cannot target a TEST Participant.

`ParticipantProgress` / `ParticipantAchievements` remain at
`/participant_progress/{participantId}` and
`/participant_achievements/{participantId}`. Because persistent Test
Participants reuse that path, TEST records carry `testSessionId`. Stale
session A state is fail-closed in session B until reset:

- `resetTestParticipantProgress`
- `resetTestParticipantAchievements`

deletes TEST-scoped records only (never LIVE). Next session recreates them
with the new `testSessionId`. Achievement definitions stay shared read-only.
TEST course graduate issuance writes only the TEST Participant record.

`ParticipantLessonFeedback` requires same-scope Participant + Booking.

### Test rating summary reset semantics

TEST review may target only a dedicated TEST Instructor. TEST Review never
updates `instructor_rating_summaries/{liveInstructorId}`. The TEST Instructor
summary is `dataScope=test` + current `testSessionId`. Persistent TEST
Instructor reuse requires `resetTestInstructorRatingSummary` before a new
session; stale previous-session summary is fail-closed.

### Homework same-scope semantics

Canonical homework targeting remains `homeworkForParticipantIds`
(Participant-scoped). TEST homework requires a TEST parent Booking/thread,
TEST party Participants, and the same `testSessionId`. LIVE/cross-session
targets are forbidden. `homeworkForUserIds` stays forbidden.

**TEST homework domain support = implemented** via
`assertHomeworkTargetsSameScope`. **Client TEST chat reachability =
intentionally deferred** (`TEST_CHAT_CLIENT_REACHABILITY =
deferred_until_firestore_rules`). Storage path helpers now derive TEST
attachment prefixes from authoritative Booking/TestSession scope
(`test-sessions/{testSessionId}/booking-chat/{bookingId}/...`). Booking
messages remain client-direct Firestore writes; Firestore Rules belong to
T42B-8. TEST chat is not user-reachable and must not be opened as an insecure
client path.

TEST Course clones do not reuse LIVE `course_chat_access`. Enrollment chat
access writes inherit TEST scope/session. Full Rules/read enforcement is later.

### Shared settings

TEST may read shared config. TEST may not mutate `settings/*` or
`lesson_pricing_settings`. Admin settings mutation in TEST context is
`update_lesson_pricing_settings` → TEST_FORBIDDEN /
`cross_scope_forbidden`.

### TEST command support matrix

Exhaustive source of truth:
`TEST_SESSION_COMMAND_SUPPORT` in
`packages/shared-domain/src/canonical/testSessionDomainIsolation.ts`.
Unknown command kinds cannot default to allowed.

Notable groups:

- **TEST_SUPPORTED** — Booking/Proposal/ChangeRequest, Attendance/outcome,
  TEST Course clone mutations, TEST Enrollment, TEST finance (wallet pay,
  manual capture, price adjust, financial correction), reviews, progress,
  achievements, lesson feedback, availability blocks
- **TEST_FORBIDDEN** — `grant_starter_credit`, `update_lesson_pricing_settings`,
  `record_audit_correction`, live `provision_canonical_course` /
  `apply_canonical_course_provisioning_manifest`; `sourceKind=provider` on
  `record_provider_payment_event` (command kind stays TEST_SUPPORTED for
  `manual_external`)
- **T42B-5_DEFERRED** — no write commands; read-model isolation remains later
- **T42B-8_DEFERRED** — Participant/Account/Instructor identity mutations;
  TEST client chat/notification Firestore reachability; Storage Rules deploy
- **T43_DEFERRED** — guest booking/enrollment/link/expiry commands

Test Sessions are still not usable in production. No deploy, Rules, indexes,
Storage, read-model rollout, or live migration in this slice.

## T42B-4 implementation (source-only)

Implemented and validated. **Not production-usable.** No TestSession,
TestActor, or production identity (including
`F5mwFT8KvAOkYHxlElpagT1yftr1` / `ksusha@test.ru`) was created or mutated.
Storage Rules source changed; Storage Rules deploy = NO. Firestore Rules
source unchanged.

### Storage namespaces

```text
LIVE booking chat        chat/{bookingId}/...
LIVE course cover        courses/{courseId}.webp
LIVE instructor asset    instructors/{instructorId}.jpg
LIVE account avatar      avatars/{accountId}
LIVE participant avatar  participant-avatars/{participantId}/avatar.jpg
LIVE image cache         image-cache/{fileName}   (server write only)

TEST session disposable  test-sessions/{testSessionId}/...
  booking chat           test-sessions/{testSessionId}/booking-chat/{bookingId}/...
  course assets          test-sessions/{testSessionId}/course-assets/{courseId}/...
  misc                   test-sessions/{testSessionId}/misc/...

persistent TestActor     test-actors/{accountOrParticipantOrInstructorId}/...
  account avatar         test-actors/{accountId}/avatar
  participant avatar     test-actors/{participantId}/avatar.jpg
```

Path builders live in
`packages/shared-domain/src/canonical/testStoragePaths.ts`. The client cannot
choose `isTest` / `testSessionId` / an arbitrary prefix. Scope is parsed from
the trusted Booking/Course/identity record (`allowLegacyLive` for missing
LIVE fields). TEST client uploads remain unreachable
(`TEST_STORAGE_CLIENT_REACHABILITY = deferred_until_rules_rollout`) until
Storage Rules are deployed in T42B-8.

Course clone catalog `bgImageUrl` is a **shared immutable public reference**
(typically Yandex `/carve/`). Mutable TEST course uploads must use the session
namespace and must never overwrite `courses/{liveCourseId}/...`.

Persistent TestActor avatars survive Reset Session History. Retire TestActor
(future) may delete `test-actors/...`. Session cleanup deletes only
`test-sessions/{testSessionId}/`.

### Storage cleanup primitive

`deleteTestSessionStorage(testSessionId)` (Functions, not invoked in
production):

- exact prefix `test-sessions/{testSessionId}/` only
- rejects malformed session IDs
- idempotent; missing objects are safe
- never lists/deletes the parent `test-sessions/` prefix or LIVE/actor paths
- result `{ listed, deleted, absent, failed, errors, complete }`
- if Storage cleanup is incomplete, `complete=false` so T42B-7 must keep the
  session maintenance-incomplete / retryable

### Storage Rules source (undeployed)

TEST session read/write requires an **active** TestSession plus membership
(`test_sessions/{id}/membership/{uid}`) and either an allowed TestActor or
Admin. Cross-session is denied. Live customers cannot access TEST prefixes.
TestActors cannot write LIVE protected prefixes. Admin without membership
cannot write the TEST session prefix. Leftover `course_*` instructorId chat
authorization was removed from `storage.rules`; canonical
`course_chat_access` remains. The same leftover still exists in
`firestore.rules` (deferred to T42B-8 because TEST chat Firestore writes stay
unreachable).

### TestSideEffectPolicy

`resolveTestSideEffectPolicy(scope, channel)`:

| Channel           | LIVE                         | TEST                                      |
| ----------------- | ---------------------------- | ----------------------------------------- |
| in_app            | existing                     | same-session TEST recipient only          |
| email             | existing/staged              | SUPPRESS                                  |
| sms               | existing/future              | SUPPRESS                                  |
| push              | existing/future              | SUPPRESS                                  |
| payment_provider  | existing                     | FORBIDDEN (no client sandbox flag)        |
| webhook           | existing/future              | SUPPRESS                                  |
| image_fetch       | Yandex `/carve/` allowlist   | same public allowlist; no private media   |
| analytics         | NOT_IMPLEMENTED              | NOT_IMPLEMENTED                           |

Unknown channel/scope fails closed. TEST email/SMS/push are staged as
`delivery.status=suppressed` with reason `TEST_EXTERNAL_CHANNEL_SUPPRESSED`.
Future workers must call `assertOutboxDeliveryMayProceed` (also re-exported
from `functions/src/canonical/auditOutbox/outboxDeliveryGuard.ts`). A leaked
pending TEST email record is still undeliverable.

Live Admin operating a TestSession is the actor, not the default TEST
recipient/payer. TEST in-app notifications must not target the live admin
account.

Client `createNotificationForUser` remains LIVE-only
(`TEST_NOTIFICATION_CLIENT_REACHABILITY = deferred_until_firestore_rules`).
Scheduled notification purge deletes expired documents by timestamp and does
not infer other users; session cleanup uses `testSessionId` when present.

No email/SMS/FCM/webhook worker exists in current source. Policy exists so a
future worker cannot send TEST work. `optimizeImage` stays on the public
Yandex `/carve/` allowlist (no SSRF broadening). External analytics is
NOT_IMPLEMENTED (`universal-analytics` is a lockfile override only).

### Client-direct writers after T42B-4

| Path | LIVE | TEST | Authority | Remaining |
| --- | --- | --- | --- | --- |
| `chatService` messages | client Firestore | unreachable | Firestore Rules | T42B-8 |
| BookingChatModal media | `chat/{id}/...` via path helper | unreachable until Rules deploy | Storage Rules + booking scope | T42B-8 |
| participant avatars | `participant-avatars/...` | `test-actors/...` contract; client LIVE wrapper | Storage Rules | T42B-8 identity |
| course cover upload | `courses/{id}.webp` | session namespace contract; client unreachable | Storage Rules + Admin | T42B-6/T42B-8 |
| instructor catalog photo | `instructors/{id}.jpg` | `test-actors/...` contract | Storage Rules + Admin | T42B-8 |
| notifications | client `notifications/{id}` | unreachable | Firestore Rules | T42B-8 |
| settings / error logs | LIVE operational | not session-reset data | existing | none |

No hidden client-direct TEST mutation path.

Test Sessions are still not usable in production.

## Approved architecture (partially implemented)

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

| Slice  | Name                                                                                                    | Status                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T42B-0 | Post-T41 Rebase: fresh production inventory, current canonical graph, exact migration/index baseline    | **COMPLETE** (2026-09-20; transactional collections empty after T40; `dataScope` still absent) |
| T42B-1 | Core: TestSession, test actors, assignments, CanonicalExecutionScope, resolver, max active sessions = 1 | **IMPLEMENTED / VALIDATED** (source-only; no deploy/migration/production writes)               |
| T42B-2 | Write propagation: writers, claims, guards, idempotency, outbox/work, cross-scope assertions            | **IMPLEMENTED / VALIDATED** (source-only; no deploy/migration/production writes)               |
| T42B-3 | Domain isolation: finance, progress, achievements, reviews, attendance, homework, CourseEnrollment      | **IMPLEMENTED / VALIDATED** (source-only; no deploy/migration/production writes)               |
| T42B-4 | Storage + side effects                                                                                  | **IMPLEMENTED / VALIDATED** (source-only; Storage Rules source YES, deploy NO)                 |
| T42B-5 | Read-model isolation                                                                                    | **NEXT**                                                                                       |
| T42B-6 | Admin Testing UI                                                                                        | PLANNED                                                                                        |
| T42B-7 | Reset/Delete engine: preview, manifests, locks, audit, verifier                                         | PLANNED                                                                                        |
| T42B-8 | Existing LIVE data backfill; Firestore Rules; Storage Rules; indexes; strict dataScope contract         | PLANNED                                                                                        |
| T42B-9 | Authenticated isolation smoke                                                                           | PLANNED                                                                                        |

Future after T42B: **T43 — Test Session Guest Support**.
