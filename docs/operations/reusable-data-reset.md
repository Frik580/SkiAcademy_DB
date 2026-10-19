> Current authorization update: the earlier cloud-disabled statements below
> describe historical preparation. The [staging-only authorization adapter](staging-reset-authorization.md)
> now supports separately confirmed Firestore-only staging reset/bootstrap with
> actual SDK ADC verification and a transactional lease. Production stays denied;
> operational window/deployment/drain/recovery gates remain. No execution occurred.

# Reusable data reset safety — v3

For separate Git, five-Functions deploy and operational reset/bootstrap approvals,
use [the release preparation packages](staging-reset-release.md).

Verdict: **BLOCKED for staging reset approval**. Existing branch
`codex/reusable-data-reset`, base `e7706562`. Earlier v1 core: 21 local tests passed.
This continuation preserves that WIP and extends its adapters; no new branch,
commit, push, merge, deployment, IAM/Rules/Scheduler change or cloud data mutation
was performed. Production was not queried or changed. Migration markers were
created only inside the explicitly requested emulator tests.

The current owner-approved staging LIVE fixture contract, complete classification,
recovery archive, trigger corrections and prepared commands are documented in
[staging LIVE fixture reset](staging-live-fixture-reset.md). That document supersedes
earlier unsupported-LIVE/legacy/Storage findings below. Ordinary TEST scope checks
and the production hard block remain unchanged. Manifest version is now 3.

## Implemented contract

Operator entrypoints are `functions/scripts/resetStagingBusinessData.cjs` and
`resetProductionBusinessData.cjs`. Both remain technically unable to apply cloud
mutations. There is no public UI, callable, deployed export or force flag.

`data-reset/engine.cjs` builds/revalidates exact-path manifests, applies checkpointed
Firestore steps, runs the Storage saga, verifies retained state and supports a
separate empty Attendance bootstrap. `adapters.cjs` owns capacity/revenue/revision
and known legacy adapters. `storage.cjs` owns bucket inventory, ownership/reference
closure and generation fingerprints. `inventory.cjs` recursively inventories
Firestore, including children below missing documents, and fingerprints Auth.
`stagingFixtures.cjs` supplies the separately selected staging-only ownership
contract. `recovery.cjs` exports typed data through dry-run `--recovery-out` and
permits exact, conflict-checked restoration only on the emulator.

Canonical authority stays unchanged: Account is `users/{accountId}`, person is
Participant, finance is KZT Wallet/Payment/MonetaryEvent, and Attendance is factual
Participant evidence. Reset is offline maintenance, not a cancellation/refund
command. It never fabricates balancing events or writes legacy balances.

## Modes and retained identity

| Area                                                                                                                                                                                               | activity-reset                               | full-test-reset                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Reviewed TEST Booking/Attendance/Enrollment, money events, work, claims, idempotency, issues, outbox, notifications and disposable provenance                                                      | Delete exact approved paths                  | Same                                                                                        |
| Selected canonical Wallet                                                                                                                                                                          | Preserve document; empty balance/event epoch | Same                                                                                        |
| Known money projections on selected TEST Account                                                                                                                                                   | Remove known fields only                     | Same                                                                                        |
| XP/progress/achievements/rating aggregate                                                                                                                                                          | Preserve; orphan references still block      | Delete reviewed TEST paths                                                                  |
| Legacy level/skill projection and checklist completion                                                                                                                                             | Preserve                                     | Clear completion/derived state; keep manual tasks/configuration                             |
| Course capacity                                                                                                                                                                                    | Rebuild pre-start only                       | Same                                                                                        |
| Instructor revenue/admin revisions                                                                                                                                                                 | Rebuild/invalidate affected shared state     | Same                                                                                        |
| Reviewed disposable Booking media                                                                                                                                                                  | Exact generation-bound deletion              | Same                                                                                        |
| Auth, UID, email, password, claims, roles, Account/UserProfile, Participants, instructor bindings, access/management records, school settings, levels, disciplines, prices, catalog and CourseDays | Preserve                                     | Preserve                                                                                    |
| Attendance ready marker                                                                                                                                                                            | Preserve                                     | Invalidate exact singleton only for globally empty selected activity; keep for subset reset |
| Empty bootstrap                                                                                                                                                                                    | Forbidden                                    | Separate approval/invocation after global verification                                      |

Known Account projection fields cleared: `balanceUSD`, `walletBalances`,
`pendingWalletCredit`, `lastRefundBookingId`, `dismissedReviewIds`. Full mode also
clears `level`, `levelState`, `skillScores`, `skillComments`,
`completedTodayTaskIds`, `completedTodayDate`. Only selected Participant checklist
completion IDs/date are cleared; custom tasks and recommendations remain.

TEST Account identity must match path UID and optional `uid`; a persistent TestActor
requires its allowed registry entry and matching `activeTestSessionId` assignment.
Selected TestSessions must exist and be closed/locked/failed. Exactly one active
selected owner must manage each selected Participant. Foreign ownership/session
membership or conflicting LIVE scope blocks the entire plan.

## Inventory and adapters

Collection names authorize only path shape, never ownership. Every delete still
needs an explicit reviewed path/hash and proven TEST scope or the documented
source-inheritance rule. All subcollections are inventoried; an unselected child
of a deleted parent blocks apply.
The explicit `staging-live-fixtures-v1` exception uses its separate ownership/schema
closure; it neither relabels LIVE data nor changes canonical scope validation.

| Paths                                                                                                                                                                                                                     | Disposition and dependency closure                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                                                                                                                                                                                                                      | Read/fingerprint only. No mutation methods in reset; credentials never persisted in the manifest.                                                                                                                         |
| users, participants, instructors, participant_management, participant_management_active_owner, participant_blocks, instructor_relationships                                                                               | Retain exact identity/access data; narrow Account patches above only.                                                                                                                                                     |
| settings, lesson_pricing_settings, email_delivery_settings, resort_data, courses, courses/*/days, course_catalog_content, administrative_availability_blocks                                                              | Retain configuration/catalog/schedule. Only affected Course capacity/revision/updatedAt can change.                                                                                                                       |
| bookings, bookings/*/messages, attendance, course_enrollments, guest_contacts, booking_proposals, booking_change_requests                                                                                                 | Exact TEST deletes. Unscoped messages may inherit only from the selected TEST Booking; contradictory scope blocks.                                                                                                        |
| payments, monetary_events, provider_event_receipts, users/*/wallet/state                                                                                                                                                  | Exact TEST accounting closure; all selected wallet events must go. Wallet keeps KZT and identity, balance/eventRevision become zero, aggregate revision increases. Foreign payer/refund beneficiary blocks.               |
| resource_claims, resource_claim_guards, active_course_enrollment_guards                                                                                                                                                   | Exact TEST reservations/uniqueness closure.                                                                                                                                                                               |
| booking_attendance_outcome_work, course_enrollment_outcome_work, guest_confirmation_reconciliation_work                                                                                                                   | Exact work records; unscoped confirmation work may inherit only from its selected TEST subjectPath.                                                                                                                       |
| command_idempotency, domain_outbox, activity_logs, notifications, admin_issues, participant_progress_events, participant_lesson_feedback, instructor_reviews                                                              | Exact TEST disposable history/obligations. No retained references to deleted authorities.                                                                                                                                 |
| participant_progress, participant_achievements, instructor_rating_summaries                                                                                                                                               | Full reset only. Projection ID reuse does not delete Participant/Instructor identity; full projection-path references still block deletion.                                                                               |
| instructor_lesson_revenue_contributions, instructor_lesson_revenue/_/instructors/_, instructor_lesson_revenue/state                                                                                                       | Rebuild retained contributions and all affected sums from remaining canonical Booking/Payment; source/schema errors block. Selected source contributions must be explicitly included. Unknown/orphan contributions block. |
| admin_runtime/admin_people, admin_courses, admin_finance, admin_planner, admin_lesson_bookings, admin_issue_inbox, admin_booking_change_requests                                                                          | Preserve/create known revision documents; increment monotonic revisions after mutations/rebuild. Unknown fields/IDs block.                                                                                                |
| course_chat_access/_/courses/_                                                                                                                                                                                            | Exact TEST child cleanup; no parent/other child deletion.                                                                                                                                                                 |
| wallet_ledger                                                                                                                                                                                                             | Only source-verified explicit TEST KZT schema from src/types/user.ts: identity, selected userId/session, known fields/type, integer amount/balance, valid createdAt. Unknown, USD or unscoped rows block.                 |
| test_sessions, membership, maintenance manifests, test_actors, test_actor_assignments, admin_maintenance_events, test_session_deletions, migration_control, system_migrations                                             | Preserve control/identity/audit; references to removed operations must still reconcile. Exact Attendance singleton is the only conditional marker invalidation.                                                           |
| system_data_resets                                                                                                                                                                                                        | Preserve valid journals. Running journal blocks a different plan; resume the original immutable manifest.                                                                                                                 |
| reviews, availability_slots, availability_hour_locks, function_idempotency, guest_reservation_admission, quarantine, homework, error_logs, staging fixture manifests, test_session_active_slots, all unknown paths/shapes | Fail closed. No speculative cleanup of unsupported mixed/legacy data.                                                                                                                                                     |

Course pre-start occupancy uses pending, confirmed and pending_cancellation
Enrollment, matching `adminCourseReadModels.ts`. All relevant Enrollment schemas,
IDs, scopes and remaining uniqueness must be valid; count may not exceed totalSeats.
Catalog fields/prices/roster/days remain unchanged. **Owner decision: started Course
capacity stays frozen; such reset is BLOCKED.** This is checked at preview and
before every mutation/resume using the current clock and transactional server
readTime, so an old manifest cannot cross startAt unnoticed.

Revenue uses the existing `completedLessonRevenueContribution` helper, not a
subtraction from a guessed cache. The unrestricted full reconciler is not called:
all derived writes are explicit manifest actions. Admin caches get seven known
revision bumps. Student/instructor Booking and Enrollment views query canonical
sources; reopen/refresh clients after maintenance. Supported empty Account,
Instructor and Admin query surfaces are verified in emulator tests; UI contracts
are covered by cabinet regression tests. Cloud authenticated browser workflow is
**NOT VERIFIED**; no protected route was opened without a session.

Source anchors: shared-domain canonical paths, courseEnrollmentCancellationPolicy,
admin revision schemas and testStoragePaths; Functions financeStore,
adminCourseReadModels, instructorLessonRevenueProjection, lessonBookingReadModels,
testSessionMaintenanceInventory and testSessionLifecycleEngine; src/types/user.ts,
src/features/chat/chatService.ts and storage.rules. Graph is navigation only.

## Storage ownership and non-atomic recovery

Explicit `--bucket` is required for cloud dry-run; only the two project-owned
Firebase default bucket forms are allowed. Both Storage emulator env variables
must agree with loopback, and the actual SDK endpoint is checked. Cloud dry-run
rejects leftover emulator endpoints. No credentials are printed or stored.

All objects are inventoried, including generation, metageneration, content checksum
and metadata fingerprint. Only exact reviewed
`test-sessions/{session}/booking-chat/{deletedBooking}/{file}` objects can be deleted,
with matching selected TEST Booking ownership. Selected-session media without a
Booking blocks reset; it is never deleted merely by prefix. Permanent avatars,
profile/test-actor assets and catalog/course assets remain. Unknown namespaces,
missing referenced files, foreign ownership, retained references to disposable
media and changed/new objects block the plan. Firebase URLs, gs:// and both GCS
URL forms are normalized for retained-reference checks.

| Step                                                | Actual atomicity / failure behavior                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Firestore target mutation + appliedCount        | One transaction; before-hash, journal position and freeze window checked. A failed transaction changes neither target nor checkpoint.                         |
| Multiple Firestore deletes/patches/rebuilds         | NOT globally atomic. Journal retains a verified step prefix. A rebuild error leaves running state and admission must stay closed.                             |
| Storage deletion                                    | No shared transaction with Firestore. Persist exact pendingStorage intent, delete with generation/metageneration preconditions, then checkpoint storageCount. |
| Lost Storage response before checkpoint             | Resume may accept absence only for the exact durable pending intent. Missing unstarted objects or metadata drift block.                                       |
| Full reset, trigger delivery, external side effects | NOT atomic. Scheduler/Eventarc/backlog/in-flight isolation and recovery remain separate mandatory gates.                                                      |

Resume rechecks the complete expected partial Firestore/Auth/Storage state. It never
infers successful Firestore deletion from an absent document without its atomic
checkpoint. Storage unavailability blocks preview/verification and preserves the
running journal. Immutable manifest v2 includes adapter versions; a missing or
changed adapter blocks apply/resume. v1 manifests must be regenerated for v2; never
edit or discard a running old journal. No v1 cloud apply was enabled.

Wallet invariants hold at the verified empty epoch (zero balance and events).
Intermediate history can be incomplete under the fence; never expose a partial
reset. A global restore/reseed is not a substitute for journal resume.

## Staging maintenance fence

The owner has accepted operational exclusion of application users and known test
scripts for staging. Follow [the operational window and fresh diagnosis](staging-reset-operational-window.md).
It supersedes the earlier [technical closure assessment](staging-data-reset-fence.md)
for staging: no new maintenance mode, IAM deny, exhaustive external-credential
proof or mandatory write canaries are required merely to bound human activity.
Unobserved external writers remain an explicitly accepted risk, not stopped writers.

Scheduler pause, observed queue/request drain, repeat inventory, trigger effects,
ownership/schema/financial/frozen-course checks and recoverable baseline remain
execution gates. No cloud pause or mutation occurred. Existing CLI cloud apply and
bootstrap stay disabled; an operational plan/evidence file cannot unlock them.

## Production safety

Production apply/bootstrap are unconditionally blocked, including an empty database,
provided backup paths, changed confirmations or emulator variables. Staging entrypoint
rejects the production ID; demo targets require explicit loopback Firestore/Auth/
Storage and the actual matching transport. Manifest binds project, database,
entrypoint, bucket, paths, hashes and adapter versions. Unknown flags are rejected.

Future production eligibility would require fresh proof of no real/unclassified
client transactions, a usable consistent backup and isolated restore rehearsal,
recovery access/config snapshots and two separate explicit approvals. Any real or
unclassified activity forbids an all-test launch reset. There is no implemented
production unlock/certificate verifier: prerequisites cannot currently enable
apply, even if an operator claims they passed. No production inspection was run.

## Future staging commands — approval required

From D:\SkiAcademy_DB. Bucket is verified against the local staging configuration.
Use a new ignored evidence directory and new output file for each preview.

```powershell
New-Item -ItemType Directory -Path .scratch/data-reset-review-v2
Copy-Item docs/operations/data-reset-scope.example.json .scratch/data-reset-review-v2/scope.json
# Review actual TEST account/Participant/session IDs; start documents/storageObjects empty.
node functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --mode full-test-reset --scope .scratch/data-reset-review-v2/scope.json --out .scratch/data-reset-review-v2/inventory.json
```

Review ownership and copy only approved document path/SHA-256 entries and exact
Storage name/generation/SHA-256 entries into the selection. Repeat to a new file:

```powershell
node functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --mode full-test-reset --scope .scratch/data-reset-review-v2/scope.json --out .scratch/data-reset-review-v2/reviewed.json
```

Use `--mode activity-reset` for the other mode; do not silently switch modes to
bypass a blocker. Dry-run uses ADC read access and exclusive-create local evidence.
Manifest contains UID/path and narrow checklist patch fragments; keep it private.
Exit 0 is a blocker-free local plan, NOT cloud approval; 2 is a report with blockers;
1 is a hard refusal/error. The following cloud commands **currently refuse safely**;
they document future syntax only, after implemented/verified fence and new approval:

```powershell
$resetManifest = Get-Content .scratch/data-reset-review-v2/reviewed.json -Raw | ConvertFrom-Json
node functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --apply --manifest .scratch/data-reset-review-v2/reviewed.json --confirm $resetManifest.sha256
# Separate later bootstrap invocation/approval; never combine with apply:
node functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --bootstrap --manifest .scratch/data-reset-review-v2/reviewed.json --confirm $resetManifest.sha256
```

## Empty-state and Attendance acceptance

Under a proven fence: complete the exact reset/resume, compare all retained hashes
and Auth fingerprints, verify zero old selected Booking, linked Attendance/work,
selected Wallet events and no dangling Firestore/Storage dependencies. Shared
capacity/revenue/revisions must match the manifest. Subset reset preserves unrelated
activity and the global ready marker; it does not qualify for empty bootstrap.

For empty bootstrap, require globally zero Booking, Attendance, Booking work,
Enrollment/outcome work, Payment, outbox and confirmation work, no pending Storage
step, plus no active external operations/writers. Invoke the existing transactional
`markLessonBookingAttendanceOutcomeWorkMigrationReady` zero-evidence guard. It
rechecks Booking/work inside the marker transaction. Then require actual
`sweepLessonBookingAttendanceOutcomes.candidateSource=projection`, without an
override. Reopen a valid TestSession only after bootstrap for new smoke traffic.
The emulator test runs new canonical funding, Booking, recorded Attendance and
projection outcome. No cloud marker was created in this task.

## Rollback and recovery

Keep admission closed on any error. Preserve manifest/journal and failure evidence;
resume the same immutable manifest. Expired manifests can resume only an existing
matching journal and exact partial state; freeze deadlines still apply. If startAt
passes, source/Storage drift occurs or an adapter is unavailable, STOP for a separate
recovery decision. Do not manually delete residual data or the journal, reseed,
recreate Auth users, or merge old money events into a zeroed Wallet.

Before any future production window, retain a usable consistent Firestore backup/
PITR checkpoint and a separately recoverable, generation-specific copy/version
history for every disposable Storage object. A Firestore backup does not contain
Storage bytes, Auth passwords or IAM/Rules/job configuration. Preserve exact backup
identities, manifest, Auth fingerprints, Rules/index/runtime/IAM/job/trigger etags,
Storage generation/content checksums and recovery credentials. Rehearse restore in
an isolated environment. Staging needs an approved recovery baseline too.

Recovery order: preserve fence/evidence → restore consistent Firestore and required
Storage generations in isolation → verify counts, content hashes, ownership,
financial event/balance invariants, idempotency/outbox and Attendance/work → obtain
separate target restore approval → restore exact configuration/dependency order →
role-specific login/read smoke → reopen admission last. Old outbox/provider effects
and event backlog require reconciliation; never blindly replay or discard them.
The CLI automates none of backup, restore, external side effects or cloud fencing.

## Validation and operational impact

Current results: 20 emulator reset/integration cases; 12 pure safety/adapter cases;
62 cabinet/revision regression cases and 26 existing Attendance guard/revenue
emulator regressions — PASS. Emulator wrappers exited 0 and the egress ledger
recorded 0 attempts. Assertions include preserved login,
UID/email/password/claims/roles/profiles/config, empty KZT epoch, no selected orphan
Firestore/Storage references, known legacy cleanup/unknown refusal, repeated reset,
partial FS prefix, failed capacity/revenue rebuild, Storage outage/drift and lost
delete response, runtime freeze, project/production/adapter guards, and new Booking
plus full Attendance after guarded empty bootstrap. Independent review findings
(endpoint override, apply-time freeze and orphan media) were fixed and rechecked.
Independent focused rereview found no remaining findings. Graphify update PASS;
targeted formatting/lint and diff checks PASS.

Functions build and staging app build/TypeScript PASS. Full lint PASS with 0 errors
and 95008 style warnings, predominantly CRLF formatting; no unrelated
formatting was applied. Full cloud auth/browser smoke, canaries, backup/restore,
real data dry-run and backlog drain: NOT RUN. Cloud readiness remains BLOCKED.

Inventory is a finite operator full scan: Firestore metadata/document pages 100,
Auth pages 1000, Storage pages 100; caps 10000 documents/ghosts, 10000 objects,
5000 metadata requests and depth 20. No background polling. Per FS action: target+
journal transaction. Per Storage action: full partial-state validation, durable
intent transaction, one exact conditional delete, checkpoint transaction. The
inventory spans services and is not a consistent cross-service snapshot; a fence
is mandatory. No speculative cloud cost estimates.

Functions: NO deployed export/source changed. Hosting: NO deployment required.
Rules: NO. Indexes: NO. Migration: future maintenance, NOT EXECUTED. Settings/IAM:
NO changes. Schedulers/triggers: NO changes. Existing Attendance WIP is preserved.

Current staging blockers and measured data findings are recorded in
[the operational window](staging-reset-operational-window.md). The earlier absolute
writer-isolation requirement is superseded for staging by the owner's bounded
operational risk acceptance; integrity and recovery gates remain mandatory.
Production stays hard blocked. **Verdict: BLOCKED.**
