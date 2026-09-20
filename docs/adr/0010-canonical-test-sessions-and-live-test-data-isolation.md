---
status: accepted
date: 2026-09-20
---

# ADR-0010: Canonical Test Sessions and Live/Test Data Isolation

Carve Academy will keep one production Firebase project and isolate test work
through server-authoritative Test Sessions, not a separate staging project and
not a global test mode. Live product data and Test Session data share the same
canonical collections and are separated by `dataScope` plus `testSessionId`.

This ADR records an **approved architecture**. T42A is architecture/preflight
only. T42B is the planned implementation. Test Sessions, `dataScope`, test
actors, and isolation Rules **do not exist in production yet**.

## Status

Accepted — 2026-09-20 (T42A architecture/preflight COMPLETE; approved for T42B).

Implementation status lives in
[T42_CANONICAL_TEST_SESSIONS.md](../T42_CANONICAL_TEST_SESSIONS.md).
Canonical migration closure (T32.9A–T41) lives in
[T32_CANONICAL_ADMIN_AUDIT.md](../T32_CANONICAL_ADMIN_AUDIT.md).

## Context

Canonical migration is complete. Remaining live product testing must not
require mass production cleanup or mixing test history into live Bookings,
Payments, Attendance, progress, reviews, or finance.

T42A considered a separate Firebase staging project and rejected it. The owner
decision is one Firebase project:

```text
ski-school-8f3ca
```

with logically and server-isolated Test Sessions.

T42A also captured a pre-T40 production inventory (for example payments=69,
monetary_events=77, wallet_ledger=17, messages=25, live bookings). Those
counts are **historical / stale**. T40 and T41 ran afterward. They must not be
treated as current production state. Before any T42B `dataScope` migration,
T42B-0 must perform a fresh read-only production inventory.

## Decision

### One project, scoped data

Use one Firebase project. Do not create a parallel staging project for T42.

Canonical scope:

```text
dataScope = "live" | "test"
```

- LIVE records: `dataScope = "live"` and `testSessionId` absent.
- TEST transactional records: `dataScope = "test"` and `testSessionId` required.

Scope is **server-authoritative**. A client cannot assign `dataScope` or
`testSessionId`.

### TestSession aggregate

Canonical aggregate:

```text
/test_sessions/{testSessionId}
```

Conceptual statuses:

```text
provisioning
active
locked
resetting
deleting
closed
failed
```

Exact schema is T42B work. The aggregate itself is approved.

### No global test mode

There is no global `TEST_MODE = ON` that turns every system action into test
work. Live users continue to create LIVE data while a Test Session is active.

### Persistent Test Actors

Approved identity model:

- persistent dedicated Firebase Auth accounts;
- canonical test Accounts / Participants;
- `/test_actors` registry;
- server-owned assignment to the active Test Session.

Test identity persists across session reset. T42 does not create a disposable
Auth user per session.

Live owner/admin Account remains a LIVE identity. An Administrator may
explicitly open a Test Session. Only commands inside that chosen Test context
receive TEST scope. Ordinary Admin surfaces without Test context remain LIVE.

### Concurrent sessions

T42 v1: **MAX ACTIVE TEST SESSIONS = 1**.

Architecture must remain compatible with multiple `testSessionId` values later.
Multiple concurrent active sessions are a later enhancement, not a T42 v1
requirement.

### Same collections

Test and live data use the same canonical collections. Do not create parallel
`test_bookings`, `test_payments`, `test_attendance`, or equivalent domain
mirrors.

Separation is achieved through `dataScope`, `testSessionId`, scope-aware keys,
and server-side authorization/isolation.

### Guest flows

TEST guest flows are **deferred**. T42 v1 covers authenticated Owner/Admin,
Test Student, Test Parent, and Test Instructor. Existing LIVE guest flows must
continue to work. Guest Test Session support is **T43**.

## Invariants

### Server-authoritative scope

- Client cannot set `dataScope` or `testSessionId`.
- Client cannot arbitrarily request another Test Session.
- Product read models are LIVE-only by default.
- Test data is visible only through an explicitly validated Test context.

### Mutable live aggregates must not be mutated by test work

LIVE Course / CourseDays remain mutable live aggregates. TEST enrollment must
not change a live Course.

For a Test Session:

- required Courses / CourseDays are cloned;
- the clone has TEST scope and `testSessionId`;
- TEST Enrollment may reference only a TEST Course clone;
- LIVE `Course.availableSeats` does not change because of a test enrollment.

Shared read-only reference data may be used without clone when it is immutable
for the operation: skill config, achievement definitions, lesson pricing read,
resort data, and selected immutable settings.

### Instructor isolation

T42 v1 forbids using a LIVE Instructor as a TEST booking target. Use a
dedicated TEST Instructor. Claims, guards, and idempotency still become
scope-aware as defense in depth. A TEST booking must not block live instructor
occupancy.

### Scope in uniqueness / idempotency namespace

Scope is part of the canonical uniqueness and idempotency namespace:

```text
LIVE key: live + resource identity
TEST key: test + testSessionId + resource identity
```

This applies at least to `resource_claims`, `resource_claim_guards`,
`active_course_enrollment_guards`, `command_idempotency`, and relevant
work/outbox records. A test claim must never conflict with a live claim.

### Finance isolation

Each test Account has its own canonical Wallet. A LIVE Wallet is never used
for a TEST operation. A Test Session carries `startingBalanceKzt`. Reset
deletes TEST Payments, TEST MonetaryEvents, and corresponding TEST financial
history; restores the test Wallet to `startingBalanceKzt`; and restores
canonical test seed/grant state when required. Live Wallet does not change.

A TEST Payment must not reference a LIVE Booking or Enrollment. The Admin
owner live Wallet must not pay a test Booking.

Production Starter Credit remains a separate canonical feature
(`settings/starter_credit.amountKzt`). A Test Session must not change live
starter-credit settings. Test funding is TestSession config or a separate
canonical test seed mechanism.

### Progress, achievements, reviews, homework

Test Sessions use dedicated TEST Participants. TEST data must not change live
ParticipantProgress, Achievements, LessonFeedback, learning hours, or streaks.

TEST review uses only a TEST Instructor and must not change live
`instructor_rating_summary`.

Canonical homework ownership is Participant-scoped
(`homeworkForParticipantIds`). Test chat/homework inherits TestSession scope
and must not appear for a live Participant.

### Storage namespace

Approved prefixes:

```text
test-sessions/{testSessionId}/...
test-actors/{id}/...
```

Session-owned disposable assets live under the session prefix. Persistent Test
Actor assets live under the actor prefix. Live Storage prefixes remain
separate. Reset/Delete may delete only
`test-sessions/{requestedSessionId}/...`. A test actor/session must not write
into a live Storage namespace.

### Side effects

`TestSideEffectPolicy`:

```text
TEST email  = suppress
TEST SMS    = suppress
TEST push   = suppress
TEST live payment provider = forbidden / sandbox only
TEST in-app notifications  = test actors only
```

A Test Session must never send side effects to a real live customer.

### Live hard safety for reset/delete

Every reset/delete target must satisfy:

```text
dataScope == "test"
AND
testSessionId == requestedTestSessionId
```

If any candidate is `dataScope == "live"` or has another session ID, **abort
the entire operation**. Never continue best-effort after discovering a live
target.

Client never sends arbitrary document IDs to delete. Reset/Delete uses Preview
→ `manifestId`/hash → counts → `expiresAt` → confirmation → server
rebuild/revalidation → execute. If state changed: `TEST_RESET_MANIFEST_STALE`;
Admin must preview again.

On crash, the Test Session remains locked, live data is unaffected, retry is
idempotent/resumable, a verifier determines remaining work, and audit records
failure/recovery. There is no blind manual cleanup.

## Alternatives considered

### Separate Firebase staging project — rejected

A second project would isolate data physically, but would duplicate Auth,
config, indexes, Rules, Functions, seed, and operational procedure. The owner
decision is one project (`ski-school-8f3ca`) with logical/server isolation.

### Global `TEST_MODE` switch — rejected

A process-wide test switch would turn live customer actions into test writes
or suppress live behavior globally. Live users must keep creating LIVE data
while a Test Session is active.

### Duplicated `test_*` domain collections — rejected

Parallel `test_bookings` / `test_payments` / `test_attendance` would fork
canonical writers, Rules, indexes, and read models. Isolation belongs in
scope fields and server authorization, not a second topology.

### Real customers as test actors — rejected

Using live customer Accounts/Participants would mix test history into live
progress, reviews, finance, and notifications. Test identity is dedicated and
persistent.

### Client-authoritative `testSessionId` — rejected

If the client could choose scope or session ID, a buggy or hostile client
could write test data into live surfaces or live data into a Test Session.
Scope is assigned only by the server from a validated Test context.

### Disposable Auth user per session — rejected

Recreating Auth users on every reset is operationally fragile and unnecessary.
Persistent test Auth accounts plus canonical test Accounts/Participants are
the approved model.

## Consequences

- T42B must introduce `CanonicalExecutionScope`, a server resolver, TestSession
  lifecycle, test-actor registry/assignment, and scope-aware writers before
  product test UX can be used.
- Existing LIVE data requires a later T42B-8 backfill of `dataScope = "live"`
  plus Rules, Storage Rules, and indexes. That backfill has not run.
- Admin Testing UI (`Admin → System → Testing`) is planned T42B-6 work, not
  current product UX.
- T43 (Test Session Guest Support), multiple concurrent active sessions,
  session-specific automation/smoke tooling, and richer fixture management are
  later enhancements. They are not T42 v1 requirements.
- Production Starter Credit, live Wallets, live Courses, live Instructors, and
  live Participant progress remain independent of Test Sessions.

## Security implications

- Scope and session ID are server-owned authorization data, not client
  request decoration.
- Read models must default to LIVE-only. An authenticated test actor must not
  see another session. An ordinary live user must not see test records.
- Reset/Delete is fail-closed: one live or foreign-session candidate aborts
  the whole operation.
- Storage writes from test context are confined to test prefixes.
- External side effects to live customers are forbidden from TEST operations.
- Firestore and Storage Rules must eventually enforce the same isolation; T42A
  did not change Rules.

## Migration strategy

T42B is sliced:

```text
T42B-0  Post-T41 rebase; fresh read-only production inventory; current
        canonical graph; exact migration/index baseline
T42B-1  Core: TestSession, test actors, assignments,
        CanonicalExecutionScope, resolver, max active sessions = 1
T42B-2  Write propagation: writers, claims, guards, idempotency,
        outbox/work, cross-scope assertions
T42B-3  Domain isolation: finance, progress, achievements, reviews,
        attendance, homework, CourseEnrollment
T42B-4  Storage + side effects
T42B-5  Read-model isolation
T42B-6  Admin Testing UI
T42B-7  Reset/Delete engine: preview, manifests, locks, audit, verifier
T42B-8  Existing LIVE data backfill; Firestore Rules; Storage Rules;
        indexes; strict dataScope contract
T42B-9  Authenticated isolation smoke
```

Then T43 — Test Session Guest Support.

Do not infer current production counts from T42A. T42B-0 is mandatory before
dataScope migration.

## Rejected alternatives

| Option | Why rejected |
| ------ | ------------ |
| Separate Firebase staging project | Owner decision: one project; duplicated ops/config; not required for T42 |
| Global `TEST_MODE` | Would convert live user actions or globally suppress live behavior |
| Duplicated `test_*` collections | Forks canonical topology, writers, Rules, and indexes |
| Real customers as test actors | Contaminates live progress, reviews, finance, and notifications |
| Client-authoritative `testSessionId` | Breaks isolation and authorization |
| Disposable Auth users per session | Fragile; identity should persist across reset |
| Using live Instructor occupancy for test bookings | Blocks live instructor schedule |
| Mutating live Course capacity from test enrollment | Changes live product inventory |
| Funding test bookings from the owner live Wallet | Mixes live money with test operations |
| Changing live `settings/starter_credit` for tests | Production Starter Credit is a separate canonical feature |
