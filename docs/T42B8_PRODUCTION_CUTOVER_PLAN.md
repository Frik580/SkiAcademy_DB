# T42B-8A production cutover plan

Date: 2026-09-22

Status: **T42B-8B EXECUTED** (2026-09-22). T42B-8C is **NOT STARTED**.
The inventory below is the approved 8A preflight. The execution record is at the end of this document.

Repository: `D:\SkiAcademy_DB`  
HEAD: `c944fce2e7da08c0d90b92680f9f8e0b1ca5612f` (`main`, even with `origin/main`)  
Worktree at preflight start: clean.  
Production project: `ski-school-8f3ca` (project number observed on function buckets: `782358732601`).

Do not run this plan from `E:\SkiAcademy_DB`.

## Inventory

Read-only Firestore REST + Identity Toolkit + Firebase Rules + Cloud Functions v2 + Hosting releases + Storage list.
Auth: Firebase CLI OAuth refresh, token not printed and not written back.
Timestamp: **2026-09-22 09:49:52 Asia/Almaty** (`2026-09-22T04:49:52.214Z`).
Index, zero-count, Storage Rules, and outbox spot checks were the same pass, a few minutes later.

`listCollectionIds` omits empty collections. Empty names below were confirmed with aggregation count `0`.

### Root counts

| Collection | Count | Scope |
| --- | ---: | --- |
| users | 4 | all MISSING_SCOPE |
| participants | 6 | all MISSING_SCOPE |
| participant_management | 6 | all MISSING_SCOPE |
| participant_management_active_owner | 6 | all MISSING_SCOPE |
| instructor_relationships | 2 | all MISSING_SCOPE |
| participant_blocks | 2 | all MISSING_SCOPE |
| instructors | 2 | all MISSING_SCOPE |
| courses | 6 | all MISSING_SCOPE |
| course days (`courses/*/days`, collection group `days`) | 15 | all MISSING_SCOPE |
| course_catalog_content | 6 | all MISSING_SCOPE |
| administrative_availability_blocks | 7 | all MISSING_SCOPE |
| activity_logs | 13 | all MISSING_SCOPE |
| command_idempotency | 13 | all MISSING_SCOPE |
| domain_outbox | 2 | all MISSING_SCOPE |
| error_logs | 62 | all MISSING_SCOPE |
| admin_runtime | 2 | all MISSING_SCOPE |
| settings | 8 | all MISSING_SCOPE |
| lesson_pricing_settings | 1 | MISSING_SCOPE |
| resort_data | 2 | MISSING_SCOPE |
| system_migrations | 1 | MISSING_SCOPE |

Explicit `dataScope=live`: **0**. Explicit `dataScope=test`: **0**. `testSessionId` present: **0**. Malformed scope: **0**.

Confirmed count 0: `bookings`, `booking_proposals`, `booking_change_requests`, `messages`, `course_enrollments`, `attendance`, `payments`, `monetary_events`, `wallet_ledger`, `provider_event_receipts`, `participant_progress`, `participant_achievements`, `participant_lesson_feedback`, `instructor_reviews`, `instructor_rating_summaries`, `admin_issues`, `resource_claims`, `resource_claim_guards`, `active_course_enrollment_guards`, `function_idempotency`, `notifications`, `homework`, `course_chat_access`, `booking_attendance_outcome_work`, `course_enrollment_outcome_work`, `test_sessions`, `test_actors`, `test_actor_assignments`, `test_session_active_slots`, `admin_maintenance_events`, `test_session_deletions`.

Collection group `CourseDays`: 0. Canonical days live at `courses/{courseId}/days`.

No unexpected TEST document. Migration planning continues.

## Ksuscha identity graph

Account `F5mwFT8KvAOkYHxlElpagT1yftr1`. Auth user exists, not disabled, password provider, email matches the approved test parent. Firestore `lifecycle.status=active`, `role=user`, `instructorId=""`, scope missing.

| Role | Id |
| --- | --- |
| self Participant | `29ea271f35c01d51545cd77e56c3d2fc5990712f40f49279d98a83eb127c67b2` |
| self management (`authority=self`, active) | `4d3f95a7179cdb8b82caf2a9c93326bbd18b39de3b88663d7dfdc385e17e5f56` |
| dependent Participant | `2df3b3f88bad9e47232a77a29813a5eb220bc2917f6495db87d3edc0d0323bd7` |
| guardian management (active) | `129acaacc22a86344d7e71198d51d52901317e8dfeb2b82a9e8f5631590d16c6` |
| dependent Participant | `b73191c9dfea69703c70e4be692abb9569f0af9cf17050e77a4ccfca9b5d4d5e` |
| guardian management (active) | `bafd6ee3e104d146ec477c91ea7160791bb7aade9e3d7a5f294e290a319902e8` |

Active-owner guards exist for all three participant ids and point only at this account. No other account manages these participants.

Wallet: subcollection `wallet` only. `/wallet/state` absent. `/wallet/starter_credit_grant` exists, `granted=true`, `amountKzt=0`, no scope. `settings/starter_credit.amountKzt=0`. No live balance to preserve.

Transactional residue for this graph: **zero** bookings, enrollments, attendance, payments, monetary events, progress, achievements, feedback, reviews, messages, claims, guards, notifications, course chat.

Historical edges, all terminal, all missing scope, schema has **no** `dataScope` field (strict parsers would reject one):

| Doc | Status | Other party |
| --- | --- | --- |
| relationship `bc357560b1c5a4626122253d6e2b3c046b4a7f3bfc389cc446decc7f03b1ea4b` | revoked | instructor `ins_elena` |
| relationship `fb1d4131125b04a54f9a6380cb4ce563ae431935d5108aefa420f24d5588a5e9` | revoked | instructor `ins_X9vUp3gIrbNFWUpWsEzvLCAEh7q2` |
| block `3edb9d7352b4f5b54a870ca2f51e9147c61669840bfcb71ac3e1d1589922960e` | removed | `ins_elena` |
| block `4d384626a621493a2ba498311474912096d7c52fcf06ac1b53b664e1c24ce7c0` | removed | `ins_X9vUp3gIrbNFWUpWsEzvLCAEh7q2` |

These four documents stay **DO_NOT_TOUCH**. They are not active authority. Deletion is an optional owner choice, not part of the scope backfill.

## Other identities — LIVE

| Account | Firestore role | Lifecycle | Participant |
| --- | --- | --- | --- |
| `GPuiedCnYKZF5DJMTXFdGYLSUvk2` | admin | active | `6ab000278178609cb9e50ce4a7e400f16e7fe12f24a712ff38379f590e30fb0e` (self) |
| `X9vUp3gIrbNFWUpWsEzvLCAEh7q2` | admin | active | `5cb4b31ef4d3a0cdae4bd039807f46b2180593942d22a4b8dcdf420257b4c837` (self); user field `instructorId=ins_X9vUp3gIrbNFWUpWsEzvLCAEh7q2` |
| `0lo2HWV5eeMbxqLx27QsEIfP3oA3` | user | **disabled** | `6ed1326c85ff01cb2d5e1b0ecd2240dc65cc8d8f2f600a2d2db782b3a802e319` (self) |

Instructors, both missing `linkedAccountId`, both LIVE backfill targets: `ins_X9vUp3gIrbNFWUpWsEzvLCAEh7q2` (revision 1, `pricePerHourKZT=30000`) and `ins_elena` (revision 5, `pricePerHourKZT=25000`). Neither is the Test Instructor.

Their management docs and active-owner guards are wholly inside those accounts. Do not add `dataScope` to management or guards.

Availability blocks are LIVE instructor schedule (`ins_elena`, `ins_X9v…`), not Ksuscha. Backfill `dataScope=live`.

## Auth

8 users. 4 have `/users`. Ksuscha confirmed. No Auth user is disabled.

DO_NOT_TOUCH orphans (no `/users`, not approved as Test Instructor):

- `1538faobuaPjDOrBJ8Ogpd5mK8r1`
- `JMjM7y2FRRO3DKVHmONIDaqhDYf1`
- `XZUEPZ4umoOkVJfOvxKSCd3WJn52`
- `jyXJzZ2nqpW57fWv9nmdo6A0nSx1`

Test Instructor candidate: **NONE**.

## TestActor documents to create later

Not created in 8A. Create them in the same 8B step as the first session, immediately before `create_test_session`.

`assertPersistentTestIdentity` requires `dataScope=test` and allows `testSessionId` to be absent. Persistent identity must omit `testSessionId`.

### Test Parent

`/test_actors/F5mwFT8KvAOkYHxlElpagT1yftr1` matching `TestActorSchema`:

- `accountId`: `F5mwFT8KvAOkYHxlElpagT1yftr1`
- `kind`: `test_parent`
- `allowed`: true
- `dataScope`: `test`
- `participantIds`: the three ids above, unique
- `instructorId`: absent
- `revision`, `createdAt`, `updatedAt`, `audit`: command metadata

No assignment until session provisioning writes `/test_actor_assignments/{accountId}`.

### Test Instructor

No product command can provision this yet (`provision_self_participant`, `create_participant`, `assign_participant_management` are `T42B-8_DEFERRED`). 8B needs a guarded Admin SDK write, not the admin UI.

Required graph, all `dataScope=test`, `testSessionId` absent, except management/guard which cannot carry scope:

1. New Firebase Auth user. Do not reuse an orphan.
2. `/users/{newAccountId}` canonical account fields (`lifecycle.status=active`) plus the profile fields the current user document shape requires, including `instructorId`.
3. Self Participant.
4. Active `participant_management` with `authority=self` and the active-owner guard. No `dataScope` field.
5. `/instructors/{newInstructorId}` satisfying `InstructorCatalogEntrySchema` (`name`, price, `isAvailable`, `revision`, `linkedAccountId`, `dataScope=test`).
6. `/test_actors/{newAccountId}` with `kind=test_instructor`, `allowed=true`, `instructorId`, `participantIds=[self]`, `dataScope=test`.

`create_test_session` fails with `TEST_INSTRUCTOR_INVALID` until 5 and 6 exist.

Until assignment exists, either actor's login resolves `TEST_ACTOR_NO_SESSION` and must not fall through to LIVE. Do not write the registry and then wait.

## Course clone readiness

`CreateTestSessionIntentSchema.sourceCourseIds` has `min(1)`. The first session always clones at least one course. Enrollment can wait.

Structurally eligible (capacity, roster, lifecycle, price, schedule, 5 days with instructor ids, catalog doc present):

- `course_1784217360616` — lifecycle `active`, roster `ins_X9v…`, seats 8/8
- `course_1784218471756` — lifecycle `active`, same shape

`course_44347d3b4e8742df9d7a72f2d6f22c84` has the same canonical keys but lifecycle `archived`. Do not use it for the first session.

NON_BLOCKING debt, do not repair in 8B, do not select as a clone source:

- `course_carving_pro`
- `course_freeride_foundations`
- `course_snowboard_park`

They lack `capacity`, `instructorRosterIds`, `lifecycle`, `startAt`, `scheduleProjection`, days, and a catalog doc at the same id. `parseCourse` will not clone them.

## Scope backfill manifest

Script requirements for 8B: Admin SDK, default dry-run, `--apply` plus exact project `ski-school-8f3ca` or refuse, expected counts, before-image JSON, abort on unexpected shape. No console edits.

Idempotency for every stamped doc:

- expected now: `dataScope` absent and `testSessionId` absent
- target: `dataScope` set, `testSessionId` still absent
- already migrated: target already true → skip
- abort: `dataScope=test` outside the approved graph, any `testSessionId`, any other scope value, unknown Ksuscha participant, cross-account management

### LIVE (`dataScope=live`, no `testSessionId`)

| Path | Count | Skip |
| --- | ---: | --- |
| `/users/{id}` | 3 | Ksuscha account |
| `/participants/{id}` | 3 | her three participants |
| `/instructors/{id}` | 2 | future Test Instructor does not exist yet |
| `/courses/{id}` | 6 | includes the three legacy courses so strict mode cannot hide them |
| `/courses/{id}/days/{dayId}` | 15 | |
| `/course_catalog_content/{id}` | 6 | |
| `/administrative_availability_blocks/{id}` | 7 | all reference live instructors |
| `/activity_logs/{id}` | 13 | canonical `audit:v1`, scope field optional |
| `/domain_outbox/{id}` | 2 | both `outbox:v1`, `delivery.status=pending`; set scope only, do not change delivery |

Do **not** stamp: `participant_management`, `participant_management_active_owner`, `instructor_relationships`, `participant_blocks` (strict schemas omit `dataScope`).

Do **not** stamp shared config: `settings` (8, including `starter_credit`), `lesson_pricing_settings`, `resort_data`, `system_migrations`, `skill_config` / `achievements_config` inside settings.

Do **not** stamp `admin_runtime` (`admin_people` revision 7, `admin_planner` revision 2). No other runtime revision docs exist. Session-local runtime is not required yet.

Do **not** stamp `error_logs` (62).

Do **not** rewrite `command_idempotency`. Sampled record is `schemaVersion=idempotency:v1` with no scope. Current source writes `idempotency:v2` under new ids. Historical v1 stays. No in-flight v2 rows exist.

Empty transactional collections: backfill N=0. New writes after the functions deploy stamp explicit scope.

`/users/*/wallet/starter_credit_grant`: four markers, all `granted=true`, `amountKzt=0`. Leave them. They are not spendable balance. Session seed creates `/wallet/state` later with test scope. Do not reset a zero grant.

### TEST identity (same step as registry + first session)

| Path | Future |
| --- | --- |
| `/users/F5mwFT8KvAOkYHxlElpagT1yftr1` | `dataScope=test`, no `testSessionId` |
| three participant docs above | `dataScope=test`, no `testSessionId` |
| new instructor user, self participant, instructor catalog | `dataScope=test`, no `testSessionId` |
| two `/test_actors/{accountId}` | `dataScope=test` by schema |

Management and guards for that graph stay unscoped.

## Compatibility

`LIVE_READ_COMPATIBILITY_MODE.missingDataScope` is `'legacy_live'`. `parsePersistedCanonicalScope` and `assertSameCanonicalScope` accept missing scope as LIVE. TEST never accepts missing scope. `resolveWorkerExecutionScope` uses `allowLegacyLive: true`, so a pending unscoped outbox is LIVE work. With no TestSession, schedulers have nothing TEST to process.

`identityDocumentMatchesReadScope` / `documentMatchesReadScope` hide explicit `test` from LIVE and treat missing as LIVE while the constant stays `legacy_live`.

Client direct listeners that already call `isLiveCompatibleIdentity` / `isLiveCompatibleResource` (users, instructors, courses, catalog) follow the same rule. Bookings are callable-owned (`allow create: if false`).

| Pair | Result |
| --- | --- |
| Old Hosting + old Functions | Current production. Safe. No test mode. |
| Old Hosting + new Functions | Safe for LIVE. Omitted `requestedTestSessionId` resolves LIVE. Missing docs remain readable. New writes stamp `dataScope=live`. Old clients ignore the new field. Testing callables are simply unused. |
| New Hosting + old Functions | Unsafe. Testing calls `queryTestSessionReadModels` and `executeTestSessionLifecycle`, which are not deployed. `:rs:live` keys match the existing idempotency regex, so ordinary LIVE calls would likely still parse, but this order is not the cutover. |
| New Hosting + new Functions | Required pair. LIVE filters still show missing-scope rows until backfill, then explicit live. |

Firestore client updates on `/users` cannot add or remove `dataScope` (`affectedKeys` allow-list). Instructor and participant client writes are already false. Canonical course writes are command-only; the three legacy courses can still be admin-written and could drop a stamped field. Do not use them as clone sources, and do not treat a later missing scope on those three ids as a failed identity migration.

Cached old JS has no client filter. It will show TEST courses, TEST instructors, and Ksuscha after they are stamped, for as long as that bundle stays loaded. Rules do not hide `dataScope=test`. Therefore the first TestSession is forbidden until the new Hosting release is the live release and the operator has loaded that bundle.

## Rules and indexes

Firestore Rules: local `firestore.rules` SHA-256 prefix `237f307b9cde79ab` **equals** production release `cloud.firestore` ruleset `caff92bb-c6c7-4bb9-912c-dbb023987b34` (updated 2026-09-20T12:01:02Z). **No Firestore Rules deploy.** Current rules do not enforce scope. TEST chat and TEST notifications stay client-unreachable. Do not invent a rules change inside 8B.

Storage Rules: local file differs (99 insertions, 28 deletions versus deployed ruleset `d0a4ce1a-ef2d-4670-bd3f-2c6ad68342c5`, updated 2026-09-18T13:32:21Z, bucket `ski-school-8f3ca.firebasestorage.app`).

Deployed matches: `avatars`, `participant-avatars`, `courses`, `instructors`, `chat`, `image-cache`, deny-all.

Local adds `test-sessions/{id}/booking-chat|course-assets|misc` and `test-actors/{id}`, and blocks an allowed TestActor from writing LIVE prefixes. `resourceScopeIsLive` treats missing `dataScope` as live, so LIVE chat keeps working before backfill. Test paths require an **active** session plus membership, so they deny everyone until the first session. Classification: **SAFE_BEFORE_BACKFILL**, **SAFE_BEFORE_TESTACTORS**, **SAFE_WITHOUT_ACTIVE_TESTSESSION**. Deploy Storage Rules before the TestActor registry so the live-prefix block exists first.

Storage data: `test-sessions/` and `test-actors/` empty. `chat/` has objects (sample 2), `instructors/` sample 1, `participant-avatars/` sample 3, `courses/` and `avatars/` empty at the prefix sample. No deletes.

Indexes: source `firestore.indexes.json` unchanged since the last functions deploy baseline, 40 composites, 2 field overrides (`days.actualInstructorIds`, `days.interval.startsAt.seconds`). Production: 40 composite indexes **READY**, 0 BUILDING, 0 ERROR. Field API shows those two overrides plus the default wildcard. **NO INDEX DEPLOY.**

## Functions

Production functions were last updated 2026-09-20 about 12:03–13:27 UTC, which is after commit `66ce4b0` and before `244e31b`. All T42 commits are newer. Deployed set has 32 functions and does **not** include `queryTestSessionReadModels` or `executeTestSessionLifecycle`.

Schedulers keep the same cron. Their sweep code is scope-aware and must be redeployed. With zero bookings/enrollments/notifications work, a no-op sweep does not grow with history. `scheduledPurgeExpiredNotifications` and `optimizeImage` changed only by comments.

MUST_DEPLOY (callable or trigger code changed, or new):

- `executeCanonicalCommand`
- `executeGuestCanonicalCommand`
- `queryLessonBookingReadModels`
- `queryManagedParticipantPickerReadModels`
- `queryBookingProposalReadModels`
- `queryBookingChangeRequestReadModels`
- `queryParticipantInstructorAccessReadModels`
- `queryCourseEnrollmentReadModels`
- `queryCourseCatalogReadModels`
- `queryCourseAttendanceReadModels`
- `queryInstructorCourseAssignmentReadModels`
- `queryAdminIssueReadModels`
- `queryAdminFinanceReadModels`
- `queryAdminCourseReadModels`
- `queryAdminCourseEnrollmentReadModels`
- `queryAdminIdentityReadModels`
- `queryAdminPlannerReadModels`
- `queryInstructorOccupancyReadModels`
- `queryLessonPricingSettingsReadModel`
- `queryInstructorReviewReadModels`
- `queryParticipantProgressReadModels`
- `queryParticipantAchievementsReadModels`
- `queryParticipantLessonFeedbackReadModels`
- `queryTestSessionReadModels` (new)
- `executeTestSessionLifecycle` (new)
- `scheduledReconcileGuestConfirmationMismatches`
- `scheduledExpireGuestLessonReservations`
- `scheduledExpireGuestCourseReservations`
- `scheduledResolveLessonBookingAttendanceOutcomes`
- `scheduledResolveCourseEnrollmentOutcomes`
- `syncLessonBookingAttendanceOutcomeWork`
- `syncCourseEnrollmentOutcomeWork`

UNCHANGED behavior, omit from the selector: `optimizeImage`, `scheduledPurgeExpiredNotifications`.

These new functions can deploy **before** backfill. They read missing scope as LIVE and stamp explicit LIVE on new canonical writes. Old Hosting can call them. Do not deploy Hosting first.

## Hosting

Last live release: `sites/ski-school-8f3ca/releases/1789911320249000` at 2026-09-20T13:35:20Z.

Hosting must ship the T42 client: `:rs:live` read keys, `requestedTestSessionId` only when a session is selected, live listener filters, Admin Testing workspace, coach-picker `authGeneration` resubscribe, lifecycle UI, test storage path helpers.

Deploy Hosting only after the functions above are serving. It is safe before backfill because missing scope still counts as LIVE.

## Exact 8B order

1. Fresh before-images (see Backup). Abort if counts or Ksuscha ids moved since this preflight.
2. Deploy the MUST_DEPLOY functions. Confirm new revisions and that the two new names exist. Do not create a session.
3. Deploy Storage Rules. Confirm the release ruleset changed and LIVE `chat/` / `courses/` / `instructors/` rules remain.
4. Deploy Hosting. Confirm the new release id. Operator reloads admin and sees System → Testing. No session yet.
5. LIVE smoke (below) while Ksuscha is still unscoped. She must still log in as normal.
6. Dry-run, then apply, the LIVE backfill only. Verify zero missing scope on that manifest and zero `dataScope=test`.
7. One coordinated script, still not a long pause:
   - create the Test Instructor Auth + identity graph + both `/test_actors` docs
   - stamp Ksuscha account and three participants `dataScope=test`
   - immediately call `create_test_session`
   If session create fails, delete the new registry docs and remove the `dataScope` field from the stamped identity docs in the same script.
8. Phase 1 session smoke only.
9. Strict mode is a **later** deploy. Flip `LIVE_READ_COMPATIBILITY_MODE.missingDataScope` to `'reject'` only after step 6 and step 7 verify zero required missing fields. Do not flip it in the first functions binary.

Firestore Rules: do not deploy. Indexes: do not deploy.

## Commands (do not run in 8A)

`firebase` is not on PATH in the preflight shell. Use `npx firebase`. PowerShell: quote the functions selector.

```powershell
npx firebase deploy --project ski-school-8f3ca --only "functions:executeCanonicalCommand,functions:executeGuestCanonicalCommand,functions:queryLessonBookingReadModels,functions:queryManagedParticipantPickerReadModels,functions:queryBookingProposalReadModels,functions:queryBookingChangeRequestReadModels,functions:queryParticipantInstructorAccessReadModels,functions:queryCourseEnrollmentReadModels,functions:queryCourseCatalogReadModels,functions:queryCourseAttendanceReadModels,functions:queryInstructorCourseAssignmentReadModels,functions:queryAdminIssueReadModels,functions:queryAdminFinanceReadModels,functions:queryAdminCourseReadModels,functions:queryAdminCourseEnrollmentReadModels,functions:queryAdminIdentityReadModels,functions:queryAdminPlannerReadModels,functions:queryInstructorOccupancyReadModels,functions:queryLessonPricingSettingsReadModel,functions:queryInstructorReviewReadModels,functions:queryParticipantProgressReadModels,functions:queryParticipantAchievementsReadModels,functions:queryParticipantLessonFeedbackReadModels,functions:queryTestSessionReadModels,functions:executeTestSessionLifecycle,functions:scheduledReconcileGuestConfirmationMismatches,functions:scheduledExpireGuestLessonReservations,functions:scheduledExpireGuestCourseReservations,functions:scheduledResolveLessonBookingAttendanceOutcomes,functions:scheduledResolveCourseEnrollmentOutcomes,functions:syncLessonBookingAttendanceOutcomeWork,functions:syncCourseEnrollmentOutcomeWork"
```

```powershell
npx firebase deploy --project ski-school-8f3ca --only storage
npx firebase deploy --project ski-school-8f3ca --only hosting
```

NO INDEX DEPLOY. NO `firestore.rules` DEPLOY.

After deploy, record function `updateTime` newer than 2026-09-20T13:27:34Z, Hosting release id newer than `1789911320249000`, and Storage ruleset id different from `d0a4ce1a-ef2d-4670-bd3f-2c6ad68342c5`. CLI exit alone is not proof.

## Rollback

| Layer | How |
| --- | --- |
| Functions | Gen2 keeps the 2026-09-20 revisions. Shift each service back to that revision. Do not only git-revert. The two new functions can be deleted if no session exists. |
| Hosting | Roll the live channel back to release `1789911320249000`. |
| Firestore Rules | No deploy, so no rollback. If a no-op deploy happens, ruleset `caff92bb-c6c7-4bb9-912c-dbb023987b34` is the current source. |
| Storage Rules | Redeploy archived ruleset `d0a4ce1a-ef2d-4670-bd3f-2c6ad68342c5` source, saved before the deploy. |
| LIVE `dataScope` | Delete the field where the before-image had it absent. Do not delete the document. |
| TEST identity stamp | Same, only if no TestSession has written session-scoped wallet/booking/course clones. |
| TestActor registry | Delete the two `/test_actors` docs if assignment is still absent. |
| Test Instructor | Delete the new Auth user and the new user/participant/management/guard/instructor docs only if no session references them. Nontrivial after the first session. |
| First session | `preview_test_session_reset` then execute reset. Delete stays optional until reset is clean. |
| Strict flag | Redeploy the previous functions bundle with `missingDataScope: 'legacy_live'`. |

## Backup before 8B writes

8A did not export Firestore (an export writes a GCS object).

Before any 8B write:

- rerun the read-only counts and Ksuscha graph
- save before-images of every document the manifest will update
- save Auth uid / disabled / provider metadata, not passwords
- archive ruleset ids above and Hosting release `1789911320249000`
- archive function update times
- record index state READY 40
- if a full snapshot is required, `gcloud firestore export` for `ski-school-8f3ca` into a new prefix, then the before-images still govern field rollback

## Smoke

LIVE, after functions + storage rules + hosting, before any TestActor:

- admin login, Lessons, Planner, Finance, People
- public catalog
- student login if a non-test account is used
- instructor login via `X9v…` / `ins_X9v…`
- guest booking entry
- signed-in booking picker
- Ksuscha still in normal LIVE context
- Testing screen loads and shows no session

First session, only after that LIVE smoke:

- label such as `T42 first controlled session`
- `startingBalanceKzt`: owner confirms; 100000 is enough for one 30000 KZT lesson and is not live money
- actors: Ksuscha plus the new Test Instructor
- `sourceCourseIds`: exactly one of the two active ids above

Phases after create:

1. Open session, persistent TEST banner, LIVE admin lists exclude the clone and the test identities.
2. One TEST booking and wallet payment.
3. Attendance present, then progress.
4. Enrollment on the already-cloned course.
5. Review only if eligibility is actually reached.
6. Reset preview, then reset. Delete stays optional.

Ksuscha must not be left on `TEST_ACTOR_NO_SESSION`. The registry write and `create_test_session` are one operator step.

## Owner decisions still open

1. Confirm `0lo2HWV5eeMbxqLx27QsEIfP3oA3` stays LIVE. It is a real `/users` account with lifecycle disabled. It was not designated as a TestActor.
2. Pick the first clone course: `course_1784217360616` or `course_1784218471756`.
3. Confirm `startingBalanceKzt` (proposal 100000).
4. Supply a new Test Instructor login. Orphans stay untouched.
5. Optional later deletion of the four revoked/removed edges. Default is leave them.
6. Strict-mode deploy waits until after the first successful session smoke.

## 8A boundary

Writes performed during 8A: none. Deploy during 8A: none. The 8B execution record below supersedes this boundary.

## T42B-8B execution record

Executed 2026-09-22 against `ski-school-8f3ca` from `D:\SkiAcademy_DB` at HEAD `c944fce2e7da08c0d90b92680f9f8e0b1ca5612f`. T42B-8C was not started.

### Deploy

- Functions: 32 updated. New callables `queryTestSessionReadModels` and `executeTestSessionLifecycle` are ACTIVE. Unchanged: `optimizeImage`, `scheduledPurgeExpiredNotifications`.
- Storage ruleset: `projects/ski-school-8f3ca/rulesets/a3f61d02-d4c2-43c0-a7bf-2c3fb9679f9f` (`2026-09-22T06:15:31.256602Z`). Previous ruleset kept: `d0a4ce1a-ef2d-4670-bd3f-2c6ad68342c5`.
- Hosting release: `sites/ski-school-8f3ca/releases/1790057861667000` (`2026-09-22T06:17:41.667Z`). Previous release kept: `1789911320249000`.
- Firestore Rules: not deployed. Indexes: not deployed. `missingDataScope` remains `legacy_live`.

### LIVE backfill

Applied 2026-09-22T06:38:34Z. 57 documents stamped `dataScope=live` only. Ksuscha account and her three participants stayed missing-scope at that step. Two activity logs created during the authenticated admin smoke were already `dataScope=live` with no `testSessionId` and were not rewritten.

### Identity and first session

Canonical `create_test_session` via `executeTestSessionLifecycle`. No Admin UI create. No password was set or recorded.

| Item | Value |
| --- | --- |
| Test Instructor Auth uid | `woWpzp2rm9OV6nemoesgENkKTA93` |
| Email | `testinstructor@carveacademy.ru` |
| Password provider | absent |
| Instructor id | `ins_woWpzp2rm9OV6nemoesgENkKTA93` |
| Self participant | `75b90e7663cc79b1c45aa37da586480eccab4183abb6e5b1443ba282237f225e` |
| TestSession | `test_b9b6a1a349d9d993d4cb50ab0bb7ce64` |
| Status | `active` |
| Label | `T42 First Production Test Session` |
| startingBalanceKzt | `100000` |
| Source course | `course_1784217360616` (still `live`, revision 14, roster unchanged) |
| TEST clone | `7413e9ba6503e4f4d6e4903786707b9fac78d67925f1b6ba55a2a2fafeab74b5` |
| Clone | `dataScope=test`, roster `ins_woWpzp2rm9OV6nemoesgENkKTA93`, seats 8/8, 5 CourseDays all `test` |
| Wallet | Ksuscha `/wallet/state` balance `100000`, `dataScope=test`, this session |
| Actors | `test_parent` + `test_instructor`, both `dataScope=test`, no `testSessionId` on the actor docs |
| Assignments | both `activeTestSessionId` = this session |
| Membership | parent and instructor |

Ksuscha account `F5mwFT8KvAOkYHxlElpagT1yftr1` is `dataScope=test` with no `testSessionId`. Her three participants are `dataScope=test` and carry this `testSessionId` because `create_test_session` binds persistent participant identity. Management and active-owner guards were not stamped. `starter_credit_grant` remains `granted=true`, `amountKzt=0`, no scope. Account `0lo2HWV5eeMbxqLx27QsEIfP3oA3` remains `live`.

Course counts after create: 6 `live`, 1 `test`. Instructor catalog: 2 `live`, 1 `test`. One session. One active slot.

### Smoke

Authenticated LIVE admin smoke before backfill: owner-verified PASS (Lessons & Courses, Planner, Finance, People, System → Testing, LIVE templates, no TestSession, no Test Actors, no unexpected TEST context, signed-in booking picker).

Public catalog after the session: BASE and CARVE at 250000, Arsenii Gerasimchuk and Elena Rostova. Test Instructor absent. TEST banner absent.

Not run: Reset, Delete, guest TEST, booking, payment, attendance, Ksuscha login, Test Instructor interactive login.

### Next

T42B-8C end-to-end TEST smoke. Reset is not part of that slice until its own gate.
