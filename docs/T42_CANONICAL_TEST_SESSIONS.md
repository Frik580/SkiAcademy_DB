# T42 Canonical Test Sessions

Date: 2026-09-21

Status: **IN PROGRESS / T42B-7 IMPLEMENTED + VALIDATED (source-only) / NEXT T42B-8**

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

DONE     T42B-5 — LIVE-only read isolation + TestSession-scoped read models
         IMPLEMENTED / VALIDATED (source-only; no deploy/migration/production writes)
         firestore.indexes.json unchanged (40 composites); index deploy = NO

DONE     T42B-6 — Admin System → Testing UI
         IMPLEMENTED / VALIDATED (source-only; no deploy/migration/production writes)

DONE     T42B-7 — TestSession lifecycle and maintenance engine
         IMPLEMENTED / VALIDATED (source-only; emulator/local only)
         deploy / migration / production writes = NO
         production Test Mode is NOT available

NEXT     T42B-8 — controlled production cutover
         T42B-9 authenticated isolation smoke

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
- **T42B-5** — read-model isolation is implemented (this slice)
- **T42B-8_DEFERRED** — Participant/Account/Instructor identity mutations;
  TEST client chat/notification Firestore reachability; Storage Rules deploy;
  optional `dataScope==live` query-equality after backfill
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

| Channel          | LIVE                       | TEST                                    |
| ---------------- | -------------------------- | --------------------------------------- |
| in_app           | existing                   | same-session TEST recipient only        |
| email            | existing/staged            | SUPPRESS                                |
| sms              | existing/future            | SUPPRESS                                |
| push             | existing/future            | SUPPRESS                                |
| payment_provider | existing                   | FORBIDDEN (no client sandbox flag)      |
| webhook          | existing/future            | SUPPRESS                                |
| image_fetch      | Yandex `/carve/` allowlist | same public allowlist; no private media |
| analytics        | NOT_IMPLEMENTED            | NOT_IMPLEMENTED                         |

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

| Path                     | LIVE                            | TEST                                            | Authority                     | Remaining       |
| ------------------------ | ------------------------------- | ----------------------------------------------- | ----------------------------- | --------------- |
| `chatService` messages   | client Firestore                | unreachable                                     | Firestore Rules               | T42B-8          |
| BookingChatModal media   | `chat/{id}/...` via path helper | unreachable until Rules deploy                  | Storage Rules + booking scope | T42B-8          |
| participant avatars      | `participant-avatars/...`       | `test-actors/...` contract; client LIVE wrapper | Storage Rules                 | T42B-8 identity |
| course cover upload      | `courses/{id}.webp`             | session namespace contract; client unreachable  | Storage Rules + Admin         | T42B-6/T42B-8   |
| instructor catalog photo | `instructors/{id}.jpg`          | `test-actors/...` contract                      | Storage Rules + Admin         | T42B-8          |
| notifications            | client `notifications/{id}`     | unreachable                                     | Firestore Rules               | T42B-8          |
| settings / error logs    | LIVE operational                | not session-reset data                          | existing                      | none            |

No hidden client-direct TEST mutation path.

Test Sessions are still not usable in production.

## T42B-5 implementation (source-only)

Implemented and validated. **Not production-usable.** No TestSession,
TestActor, production identity, Functions/Hosting/Rules/index deploy, or
`dataScope` backfill.

### Read-scope architecture

Server-authoritative `CanonicalReadScope` reuses `CanonicalExecutionScope`
plus a purpose:

| Purpose            | Who                                                                                    | Scope                | Session status                                                  |
| ------------------ | -------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| `live_product`     | guest, ordinary customer, live Admin without Test context                              | LIVE                 | n/a                                                             |
| `product_test`     | persistent TestActor assignment, or live Admin with validated `requestedTestSessionId` | TEST + exact session | **active** required                                             |
| `maintenance_test` | live Admin Testing inventory/preview                                                   | TEST + exact session | any known status, including `resetting` / `deleting` / `closed` |

Resolver: `resolveCanonicalReadScope`. Clients cannot pass `dataScope` or an
arbitrary `testSessionId` as authority. Callables peel
`requestedTestSessionId` **before** the strict input schema, then the server
revalidates. Ordinary Admin URLs that omit it stay LIVE even if the owner
used a TestSession elsewhere. There is no global mutable "test mode".

Guest/public = LIVE. TestActor without assignment = fail closed. TestActor
cannot request another session. Cross-scope known-ID reads use the
`not_found` abstraction (`CROSS_SCOPE_READ_VISIBILITY`); they do not reveal
"exists in another session".

### Compatibility window

Central helper: `documentMatchesReadScope` /
`identityDocumentMatchesReadScope` /
`LIVE_READ_COMPATIBILITY_MODE.missingDataScope = 'legacy_live'`.

- LIVE: missing `dataScope` is legacy LIVE until T42B-8
- TEST: missing `dataScope` is never accepted
- Flip the compatibility constant to `reject` after T42B-8 backfill to hide
  unstamped docs from LIVE

Identity graph (Account / Participant / Instructor / management): LIVE hides
explicit TEST identities; TEST product reads may see unstamped identity and
persistent TestActor identity (`dataScope=test` without a session stamp)
until the identity backfill. Email is not classification authority.

Query strategy during the window: **existing queries + bounded server-side
filter** (strategy A). No dual LIVE/missing queries. No `dataScope`
equality filters added to production LIVE queries (would explode indexes
and break unstamped docs). After T42B-8 backfill, catalog/list queries may
add single-field `dataScope==live` (auto-index; no composite) if TEST volume
would crowd `limit()` pages.

### Normal product isolation

All `query*ReadModels` callables resolve scope once per request and pass it
into `ReadModelRequestContext` (known-ID loaders hide out-of-scope as
`exists: false`) plus list mapping via `parseIfVisibleInReadScope`.

| Surface                            | LIVE                              | TEST product                | Notes                                                 |
| ---------------------------------- | --------------------------------- | --------------------------- | ----------------------------------------------------- |
| Admin Lessons                      | LIVE only                         | explicit Admin Test context | hot / history / pending guest / detail                |
| Planner / occupancy                | LIVE Bookings, blocks, CourseDays | selected session only       | no LIVE+TEST merge                                    |
| Finance                            | LIVE Payments/Events              | same-session TEST           | LIVE wallet never shown as TEST payer                 |
| Issue Center                       | LIVE issues                       | same-session TEST           | TEST cannot bump LIVE `admin_runtime` (T42B-2)        |
| People                             | LIVE identities                   | not this callable           | hardcoded LIVE; Test Actors have a separate directory |
| Student Cabinet                    | LIVE resources                    | TestActor assignment        | identity graph uses identity matching                 |
| Instructor                         | LIVE Booking/Course/Attendance    | assigned session            | TEST instructor catalog uses identity matching        |
| Catalog                            | LIVE courses                      | session clones only         | TEST clones hidden even if `lifecycle=active`         |
| Reviews                            | LIVE summary/reviews              | current-session TEST only   | TEST summary cannot contaminate LIVE                  |
| Progress / achievements / feedback | LIVE or matching session          | stale other-session → empty | fixed-path docs still check `testSessionId`           |
| Notifications                      | LIVE listener preserved           | unreachable until Rules     | prepare contract only                                 |
| Wallet client                      | own UID listener                  | deferred                    | Admin finance read models are scoped                  |
| Chat / homework                    | LIVE thread via Booking ID        | unreachable until Rules     | known-ID parent scope on server                       |

### TestSession read models

Callable `queryTestSessionReadModels` (Admin only):

- `test_session_list` — bounded metadata
- `test_session_inventory` — maintenance scope; counts via `count()` on
  `testSessionId` (bookings, course clones, enrollments, payments,
  attendance, issues) plus bounded assigned account IDs
- `test_actor_directory` — registry + `getAll` account/assignment
- `live_course_templates` — LIVE-only clone picker (shared read-only
  provenance; TEST clones excluded)

Inventory uses maintenance reads so T42B-7 preview is not blocked by
`resetting`.

### Known-ID detail protection

List filtering is not sufficient. Detail loaders (`bookingId`,
`paymentId`, `issueId`, `courseId`, enrollment, progress path, etc.) hide
cross-scope resources as missing after load. Admin Test context does not
bypass session equality.

### Direct client readers

| Path                                        | LIVE                                       | TEST           | Can support TEST now? | Deferred                          |
| ------------------------------------------- | ------------------------------------------ | -------------- | --------------------- | --------------------------------- |
| `useCoursesSync` / `course_catalog_content` | LIVE filter via `isLiveCompatibleResource` | unreachable    | filter only           | T42B-6 callables for TEST catalog |
| `useBookingsSync` instructors               | LIVE identity filter                       | unreachable    | filter only           | T42B-6                            |
| `useUsersSync`                              | LIVE identity filter                       | unreachable    | filter only           | T42B-6 directory                  |
| `useNotificationsSync`                      | own `userId`                               | unreachable    | no (needs session)    | T42B-8 Rules                      |
| `useWalletSync`                             | own UID `/wallet/state`                    | unreachable    | no (same path)        | T42B-6/8                          |
| `chatService` messages                      | Booking thread                             | unreachable    | no                    | T42B-8 Rules                      |
| `useSettingsSync` / resort / error logs     | shared config                              | n/a            | no scope index        | none                              |
| `subscribeAdminRealtimeRevision`            | LIVE `admin_runtime/*`                     | not reused     | n/a                   | TEST = callable refresh           |
| `bookingHistoryService`                     | leftover, unused                           | n/a            | dead                  | none                              |
| `useProfileActivitySync`                    | own `userId`                               | unreachable    | no                    | T42B-8                            |
| `useCurrentUserProfileSync`                 | own profile                                | identity later | no                    | T42B-8                            |

Client may attach `requestedTestSessionId` only at an authorized Testing
boundary (T42B-6). Server peels and revalidates. Client helpers accept the
optional field and isolate in-flight/idempotency keys per session so LIVE
and TEST reads cannot share a transport slot. No client-controlled
`dataScope=test`.

### Realtime strategy

- LIVE realtime listeners preserved, with LIVE compatibility filters on
  mixed collections (courses, instructors, users).
- TEST product reads: callable refresh. Do not duplicate all realtime
  architecture.
- TEST realtime required later: chat, notifications (Rules-gated).
- `admin_runtime` TEST invalidation: **do not reuse** LIVE
  `admin_runtime/*`. Preferred later:
  `/test_sessions/{sessionId}/runtime/{surface}`. T42B-6 can start with
  explicit refresh after test commands. Not built in this slice.

### Index impact

Source composites remain **40**. Field overrides remain **2**. Proposed
additions = **none**. Proposed removals = **none**. Production deploy = **NO**.

TEST inventory `where('testSessionId','==',id).count()` uses single-field
auto-indexes. Session UI should keep using `testSessionId` / known IDs
rather than duplicating every LIVE composite.

T42B-8 deploy order if equality filters are added after backfill:

1. backfill `dataScope=live`
2. indexes READY (only if new composites are actually required)
3. Functions/Rules strict readers

No speculative indexes were added.

### Query cost

Scope is resolved once per callable. Related IDs use existing request
memo/`getAll`. List isolation is O(page) in-memory filter on the existing
bounded query. Inventory uses aggregation `count()` (one per collection,
not a drain). No N+1 TestActor lookups; actor directory batches account +
assignment refs.

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

## Reset Session History (implemented source-only in T42B-7)

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

If state changed: `TEST_MAINTENANCE_MANIFEST_STALE`. Admin must preview again. Client
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

## T42B-6 Admin Testing UI (source-only)

Admin now has a dedicated **System → Testing** surface. It uses only the
admin-authorized `queryTestSessionReadModels` scopes: bounded session list,
session inventory, Test Actor directory, and LIVE course templates. Once an
active session is opened, its Issues summary uses `requestedTestSessionId` at
the authenticated callable transport boundary. The panel does not scan
Firestore in the browser and it does not mount normal LIVE realtime
subscriptions inside the Testing panel.

An active session is opened explicitly with `?tab=system&testSession={id}`.
The UI shows a persistent textual **TEST SESSION** banner, label, shortened ID,
status, and a visible return-to-LIVE action. The URL is UI selection only: the
server remains the scope authority. Selecting another normal Admin tab removes
the `testSession` parameter, so normal Lessons, Planner, Finance, and People
requests remain LIVE; no account/global/localStorage test mode exists. Separate
browser tabs therefore remain independent.

The panel displays KZT starting balance from the server read model, inventory
counts, approved Test Actors, and LIVE course templates as source-only
provenance. T42B-7 wires create, close, reset, and delete through
`executeTestSessionLifecycle`. The browser sends bounded intent only. It does
not write Firestore, does not send delete lists, and does not mark a session
active locally. Production Test Mode remains unavailable until T42B-8.

## T42B-7 lifecycle and maintenance (source-only)

Production Test Mode is **not** available. No production TestSession, TestActor,
Auth user, or Ksuscha identity conversion was created. All destructive proof is
emulator/local.

### Commands

Authenticated owner/admin callable `executeTestSessionLifecycle`. These are not
product `CommandKind` values. Unknown names fail closed as
`LIFECYCLE_FORBIDDEN` via `TEST_SESSION_LIFECYCLE_COMMAND_SUPPORT`.

```text
create_test_session
close_test_session
preview_test_session_reset
execute_test_session_reset
preview_test_session_delete
execute_test_session_delete
retry_test_session_maintenance
```

Create accepts only label, whole-KZT `startingBalanceKzt`, approved TestActor
account ids, one dedicated `test_instructor` account id, and LIVE course
template ids. The server generates `test_` session ids and every membership,
assignment, clone id, wallet seed, and audit field. Same idempotency key
resumes the existing session.

### State machine

```text
create:        none → provisioning → active
close:         active → closed
reset active:  active → locked → resetting → active
reset closed:  closed → locked → resetting → closed
delete:        active | closed | failed → locked → deleting → physical delete
failure:       provisioning | maintenance → failed
```

Invalid transitions fail closed (`TEST_SESSION_TRANSITION_FORBIDDEN`). A new
session is never created already `active`. `failed` keeps product TEST writes
disabled. Closed reset returns to `closed` and does not reopen the session.

### Active slot

`MAX_ACTIVE_TEST_SESSIONS = 1` is enforced by transactional document
`test_session_active_slots/v1`, not by the UI. Statuses that reserve the slot:
`provisioning`, `active`, `locked`, `resetting`, `deleting`, `failed`.
`closed` releases it. A provisioning session that intends to activate reserves
the slot before clone/seed, so two creates cannot both sit in provisioning.
The loser gets `TEST_SESSION_ACTIVE_LIMIT`.

### Provisioning

Requires existing allowed `/test_actors/{accountId}` fixtures. No email/UID
conversion. Provisions membership, server-owned assignment, wallet seed via
`seedTestActorWalletForSession`, and course clones via
`cloneLiveCourseIntoTestSession` with a persisted template→clone map. Persistent
TEST identities are session-bound before scoped reads. The session becomes
`active` only after the provisioning verifier passes.

### Maintenance lock, manifest, preflight

One operation owns the session. Lease is 5 minutes of server time and names
the operation. An expired lease does not mean the session is safe and does not let a
different operation take over. `retry_test_session_maintenance` resumes the
same operation after `failed`, or after `provisioning` / `locked` /
`resetting` / `deleting` once `leaseExpiresAt` has passed. A still-valid lease
returns `TEST_MAINTENANCE_LEASE_CONFLICT`.

Preview stores a fingerprint of path, revision, and scope, not counts alone.
Hash covers operation, session, `inventoryRevision`, and that fingerprint.
TTL is 10 minutes (`TEST_MAINTENANCE_MANIFEST_EXPIRED`). A later session
mutation makes execute return `TEST_MAINTENANCE_MANIFEST_STALE` with zero
deletes. The client sends `testSessionId`, `manifestId`, and confirmation
`RESET TEST DATA` or `DELETE TEST SESSION`. It never sends resource id lists.

The entire destructive candidate set is preflighted before the first delete.
`dataScope=live`, missing `dataScope`, or another `testSessionId` aborts with
`TEST_MAINTENANCE_SCOPE_VIOLATION` and zero deletes. Membership documents are
deletable only on `test_sessions/{requested}/membership/{account}`.

Reset phases are checkpointed: `PRECHECK`, `LOCKED`,
`FIRESTORE_TRANSACTIONAL_DELETE`, `IDENTITY_STATE_RESET`, `STORAGE_CLEANUP`,
`COURSE_REPROVISION`, `WALLET_RESEED`, `VERIFY`, `COMPLETE`. Deletes are
batched. Storage uses `deleteTestSessionStorage` on
`test-sessions/{testSessionId}/` only. Incomplete storage leaves the session
`failed` and retry finishes the same operation without a second seed or clone.
`inventoryRevision` advances when activate, close, or reset completes. Ordinary
product writes are detected by the manifest fingerprint.

### Preserve / delete

Reset keeps the TestSession, `test_actors`, Auth, TEST identities, membership,
active assignment, `test-actors/` avatars, LIVE data, shared config, and
`admin_maintenance_events/{operationId}`. It removes session transactional
state, then reclones courses and reseeds wallets to
`config.startingBalanceKzt`.

Delete removes that residue plus membership, session assignment pointers,
session storage, and the session document. Audit survives outside the session
subtree. `test_session_deletions/{testSessionId}` records completion so a
retry returns `already_completed` and cannot resolve as an active session.
No new composite index. Firestore Rules and Storage Rules source were not
changed for this slice.

### UI

System → Testing calls the lifecycle callable, shows server manifest counts
and phase labels, and requires the confirmation token before execute. During
`provisioning`, `locked`, `resetting`, and `deleting`, lifecycle product
actions stay disabled. `failed` exposes retry with the safe error code. Lists
refresh after the callable. No polling and no browser cleanup.

## T42B implementation plan

| Slice  | Name                                                                                                    | Status                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T42B-0 | Post-T41 Rebase: fresh production inventory, current canonical graph, exact migration/index baseline    | **COMPLETE** (2026-09-20; transactional collections empty after T40; `dataScope` still absent) |
| T42B-1 | Core: TestSession, test actors, assignments, CanonicalExecutionScope, resolver, max active sessions = 1 | **IMPLEMENTED / VALIDATED** (source-only; no deploy/migration/production writes)               |
| T42B-2 | Write propagation: writers, claims, guards, idempotency, outbox/work, cross-scope assertions            | **IMPLEMENTED / VALIDATED** (source-only; no deploy/migration/production writes)               |
| T42B-3 | Domain isolation: finance, progress, achievements, reviews, attendance, homework, CourseEnrollment      | **IMPLEMENTED / VALIDATED** (source-only; no deploy/migration/production writes)               |
| T42B-4 | Storage + side effects                                                                                  | **IMPLEMENTED / VALIDATED** (source-only; Storage Rules source YES, deploy NO)                 |
| T42B-5 | Read-model isolation                                                                                    | **IMPLEMENTED / VALIDATED** (source-only; indexes unchanged 40; deploy NO)                     |
| T42B-6 | Admin Testing UI                                                                                        | **IMPLEMENTED / VALIDATED** (source-only; lifecycle actions wired in T42B-7)                   |
| T42B-7 | Lifecycle, provisioning, reset/delete engine, manifests, locks, audit, verifier, Testing UI wiring      | **IMPLEMENTED / VALIDATED** (source-only; emulator gates; deploy/migration/production = NO)    |
| T42B-8 | Existing LIVE data backfill; Firestore Rules; Storage Rules; indexes; strict dataScope contract         | **NEXT**                                                                                       |
| T42B-9 | Authenticated isolation smoke                                                                           | PLANNED                                                                                        |

Future after T42B: **T43 — Test Session Guest Support**.
