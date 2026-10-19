# Staging reset: operational maintenance window

Scope: **ski-school-staging / (default) / ski-school-staging.firebasestorage.app**.
Production is excluded. Preparation only: no pause, reset, bootstrap, deploy,
Rules/IAM changes or other cloud mutations were performed.

The owner confirms nobody will use the application, create bookings or start test
scripts during the window. For staging this replaces the earlier requirement to
develop an admission maintenance mode or prove that every possible external
writer is technically disabled. No IAM deny is required. An unobserved writer is
a residual risk to accept explicitly, not a writer we claim to have stopped.
Ownership, schema, manifest, money, frozen capacity and recovery checks remain.

**Current data-gate update:** the separately reviewed
[staging LIVE fixture contract](staging-live-fixture-reset.md) now classifies all
2476 documents and 27 Storage objects, with 1845 deletions, 21 patches and no data
blockers. It supplies a typed local recovery archive without requiring permanent
staging PITR. Earlier unsupported-LIVE, unclassified-data and absent-baseline
findings below describe the earlier diagnosis, not the current adapter state.
The cloud runner remains disabled; the Enrollment replay correction requires a
separately approved deployment. Pause/drain checks are still future window gates.

## Read-only diagnosis, October 19, 2026

Evidence is private, ignored local data under:

- `.scratch/reset-window-20261019-metadata/`: fresh 47 Functions, seven enabled
  Scheduler jobs, eight Eventarc triggers/subscriptions; 101 artifacts, no API errors.
- `.scratch/reset-window-20261019-data/`: metrics, recent logs, service accounts,
  backup metadata and bounded Firestore/Auth/Storage inventory.

The observation is not an execution-window certificate. Refresh after pausing jobs.
The 30-minute metric interval ends at 2026-10-19 16:27:02 Asia/Qyzylorda (11:27:02Z).
All observed Functions are in us-central1, with configured timeout at most 60s.
The seven jobs have 180s attempt deadlines. The eight subscriptions have 600s ack
deadlines, retry backoff 10–600s, retention 86400s and no configured dead-letter
policy. These are configuration bounds, not a proof that no delivery is pending.

Latest samples for all eight subscriptions report zero undelivered messages and
zero oldest-unacked age. Push request metric returned no series; this is missing
telemetry, not a measured zero. Run pending queue samples report zero on six
Scheduler services; the metric does not enumerate every running request on all 47
Functions. Cloud Monitoring is sampled/delayed, not a live lock.

Three service accounts are listed; their USER_MANAGED key lists are empty. This
does not exclude ADC, impersonation, workload identity, human credentials or
processes elsewhere. The owner's commitment covers known human/test-script use;
other external writers are not certified stopped.
Read-only GitHub checks returned no in-progress or queued Actions for this
repository. This excludes neither other repositories nor external CI systems.

The bounded canonical Course/identity audit found **five users and 18 Enrollments,
all dataScope=live; zero TEST accounts and zero TestSessions**. The current CLI
requires verified TEST accounts and explicit sessions; the owner's no-use window
does not reclassify live-scoped documents. Do not fabricate a session, relabel data
or bypass scope checks. A future staging fixture reset needs a separately reviewed
ownership contract for these exact live-scoped staging fixtures.

All three Course documents pass the current canonical schema; none of the 18
linked Enrollments currently touches frozen capacity. Recheck at execution time.
Top-level count audit found 39 collection IDs / 2449 existing documents, including
52 Booking, 85 Attendance, 52 attendance work, 70 Payment and 80 outbox documents.
It is not an empty database. There are 321 error_logs and one
staging_fixture_manifests record requiring explicit adapter/classification review;
their names alone do not authorize deletion. The count audit is top-level only;
the recursive inventory is the authority for child/ghost documents.

The recursive inventory completed at **16:39:20 Asia/Qyzylorda (11:39:20Z)**:
2476 existing documents, three missing course_chat_access parent documents with
children, five Auth users, 27 Storage objects, 2549 bounded metadata requests.
Missing parent documents are reported, not automatically classified as orphan
business records or selected for deletion. Exact path classification found 322
review records (321 error_logs and one fixture manifest) and five unsupported
`users/{uid}/wallet/starter_credit_grant` documents. Schema/ownership adapters are
required before a reset can claim complete closure; none was bypassed.

Independent complete Storage inventory found **27 objects**: six
participant-avatars, one instructor resource and 20 image-cache objects; no
test-sessions booking-chat objects. No objects were selected/deleted. Current
Storage ownership allowlist does not classify image-cache; preserve its contents
pending reference/ownership review rather than adding a name-based delete rule.

The engine dry-run refused the proposed empty TEST scope with `BLOCKED: explicit
accounts/sessions and unique paths required`. No executable apply manifest exists.
The collector wrapper exited nonzero: recent writer-log reads received HTTP 429,
scope was refused, and a supplemental display-audit hash encountered an undefined
optional field. The complete inventory's recorded hash was independently verified;
the corrected separate course-identity-audit.json is authoritative for Enrollment
lifecycle.status. The log gap remains explicit; it cannot establish writer quiet.

## Exact evidence hashes

These are canonical SHA-256 hashes using the reset inventory serializer, not apply
confirmations. The ignored `.scratch/reset-window-20261019-evidence-hashes.json`
index records both canonical and file-byte SHA-256 for all 127 evidence JSON files.
Its canonical hash is
`c2a27fd6408d1fdce7b0c15be7e23b56a296cd8d880d2e180cf5d22feb1280e5`.

| Evidence                                  | Canonical SHA-256                                                  |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Complete inventory                        | `533eab51efb3a084851461027c8734f3488cbbb9fe26dd6690d5e4db3edd36cb` |
| Sorted Auth fingerprints                  | `b11a6048174cf57708d0b64e2df73f2951188a083d347860c6e3c6e0c5c180fe` |
| Storage inventory, two identical captures | `2e36f101bc156e83f80a0d7557c3b4334dc855f06a6182bceb6ae57976dc4411` |
| Dry-run refusal report                    | `52dc2afcb5a8f35a8a7d4449a16da0059b9181d480b08fd191bfc708606e3ff6` |
| Executable apply manifest                 | **ABSENT — scope refused**                                         |

Evidence is observational and already aging; hashes must be regenerated inside
the approved quiet window. Do not pass inventory/refusal/index hashes to --confirm.

## Recovery baseline

Firestore configured backup schedules/backups are absent and PITR is disabled.
The ordinary 3600s version retention is not a verified recovery plan. Storage has
604800s soft delete; no generation restore rehearsal was performed. The inventory
and hashes are evidence, not a backup of document values, Auth credentials or
Storage bytes. A matching recoverable staging baseline is not yet established.

## Minimal future window

1. Obtain separate approval for this staging window and the exact mutation plan.
   Record owner acceptance of unobserved external-writer and telemetry-lag risks.
   Close app tabs/devices; stop known local/CI test, seed, backfill and Admin SDK
   jobs. Record the known jobs/processes stopped; do not claim an exhaustive list.
2. Save current job configuration/state, deployed revision identifiers, database,
   bucket and manifest hashes. Confirm a recoverable baseline for the exact reset
   scope, or a separately approved and demonstrated fixture reconstruction plan.
3. Pause the seven originally enabled jobs using the commands below. Leave
   Eventarc/subscriptions running for natural drain; do not pull/ack/seek/drop
   messages, delete subscriptions, disable shared service accounts or change IAM.
4. Observe drain for at least 15 minutes after the last known writer stops: this
   operational allowance covers the observed 600s retry/ack settings and delayed
   samples. Then require two fresh read-only observations at least three minutes
   apart: all eight subscriptions covered, backlog/age zero, no delivery errors,
   no relevant pending requests/leases/active Firestore operations and no new
   unexplained writer activity. A fixed wait alone is insufficient. Unavailable
   log coverage is recorded as a risk; positive backlog or unknown active work
   is a stop condition, not waived by owner inactivity.
5. Build a fresh full inventory and exact scope, review every target and retained
   identity/config fingerprint. Repeat the inventory; reject unexplained drift.
   Require no manifest blockers, no frozen Course dependency, no unknown legacy
   data and an explicit decision on any retained live activity. A subset reset
   cannot qualify for globally empty Attendance bootstrap.
6. Obtain separate reset approval naming the fresh canonical manifest hash and
   its file SHA-256. Current CLI cloud apply remains hard disabled: no flag or
   edited evidence can unlock it. A future staging-only execution implementation
   must accommodate reset-generated trigger writes before approving execution;
   no new general maintenance mode or IAM deny is implied.
7. Execute reset only with the reviewed runner. On a partial failure keep the
   window closed and use its immutable manifest/journal recovery path. Do not
   manually clear residual documents or reset journal checkpoints.
8. Drain events generated by deletion, then verify retained Auth/users/roles/
   profiles/config, wallet invariants, projection consistency and no orphan
   Firestore/Storage references. Trigger-induced projection changes require
   explicit reconciliation and new verified hashes, never ignoring stale hashes.
9. Obtain separate empty bootstrap approval. Require global zero Booking,
   Attendance, attendance work, Enrollment/outcome work, Payment/outbox/
   confirmation work and no active operation. Use only the existing transactional
   guard; verify actual candidateSource=projection. No marker is written here.
10. Restore only jobs originally enabled, then perform separately approved
    student/instructor/admin and new Booking → Attendance smoke. Reopen app access
    last. Keep evidence and journal for recovery.

## Prepared commands — do not execute mutations yet

PowerShell, from `D:\SkiAcademy_DB`. The job IDs are exact observed IDs in
us-central1. These commands require a separately approved window and working
verified TLS/auth on the operator workstation; do not disable certificate checks.

```powershell
$stagingProject = 'ski-school-staging'
$stagingJobs = @(
  'firebase-schedule-scheduledExpireGuestLessonReservations-us-central1'
  'firebase-schedule-scheduledReconcileGuestConfirmationMismatches-us-central1'
  'firebase-schedule-scheduledExpireGuestCourseReservations-us-central1'
  'firebase-schedule-scheduledResolveLessonBookingAttendanceOutcomes-us-central1'
  'firebase-schedule-scheduledDeliverDomainOutbox-us-central1'
  'firebase-schedule-scheduledResolveCourseEnrollmentOutcomes-us-central1'
  'firebase-schedule-scheduledPurgeExpiredNotifications-us-central1'
)
# FUTURE PAUSE, separate approval; recheck saved original state first:
foreach ($stagingJob in $stagingJobs) {
  gcloud scheduler jobs pause $stagingJob --project $stagingProject --location us-central1
  if ($LASTEXITCODE -ne 0) { throw "STOP: pause failed: $stagingJob" }
}
# FUTURE RESTORE only after verified reset/bootstrap/recovery:
foreach ($stagingJob in $stagingJobs) {
  gcloud scheduler jobs resume $stagingJob --project $stagingProject --location us-central1
  if ($LASTEXITCODE -ne 0) { throw "STOP: resume failed: $stagingJob" }
}
```

The pause and restore blocks are separate stages, not one script to run together.
If approval stops after some jobs pause, retain that exact paused-job list and
decide recovery explicitly; do not automatically reopen admission on an error.

The following are separate future invocations, from the repository root. The
approved scope/manifest paths do not exist yet. The current live-scoped staging
fixtures do not qualify for the TEST-session CLI; resolve that contract first.

```powershell
# Future read-only preview after supported exact scope is reviewed:
node functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --mode full-test-reset --scope .scratch/staging-reset-approved/scope.json --out .scratch/staging-reset-approved/reviewed.json

# Future RESET invocation, separate approval naming the new manifest hash:
$stagingResetManifest = Get-Content .scratch/staging-reset-approved/reviewed.json -Raw | ConvertFrom-Json
node functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --apply --manifest .scratch/staging-reset-approved/reviewed.json --confirm $stagingResetManifest.sha256

# Future EMPTY BOOTSTRAP invocation, separate later approval:
node functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --bootstrap --manifest .scratch/staging-reset-approved/reviewed.json --confirm $stagingResetManifest.sha256
```

The current apply/bootstrap commands refuse all cloud mutations. They describe
the invocation contract, not a currently executable approval-ready cloud runner.
Stop on every nonzero exit; never run the next stage as recovery by default. See
[the reusable runbook](reusable-data-reset.md) for journal resume semantics.

## Retained identity and stop conditions

Before reset retain sorted UID/Auth fingerprints and all retained document hashes.
After reset compare UID/email/claims/disabled state/provider/password fingerprints
where the API exposes them; do not store password hashes or recreate users.
Compare users, roles/rights, Participants/ownership, instructors, profiles, catalog,
prices and school configuration; allow only exact manifested derived-field patches.
Actual sign-in is a separately approved smoke because it may update auth metadata.
Read-only diagnostics do not prove password sign-in after a future operation.

STOP for wrong project/database/bucket, incomplete inventory, any schema/ownership/
adapter/frozen-course blocker, unapproved manifest drift, positive or uncovered
backlog, active leases/requests/operations, newly observed writers, unresolved
trigger effects, missing recovery baseline, partial verification, Auth/profile
drift, financial mismatch or orphan references. Never bootstrap on a failed check.

No user activity does not prevent Scheduler work, delayed Eventarc delivery,
already admitted requests/uploads, external credential use or events generated by
reset itself. Current Enrollment sync can fall back to event afterData when its
source is missing; delayed pre-delete updates can recreate outcome work. Revenue
triggers can revise shared summaries. These require drain/reconciliation handling,
not a claim that a quiet application makes the multi-service reset atomic.

Sources: [Pub/Sub monitoring](https://docs.cloud.google.com/pubsub/docs/monitoring),
[Cloud Run monitoring](https://docs.cloud.google.com/run/docs/monitoring),
[Firestore backups](https://cloud.google.com/firestore/docs/backups).

**Current verdict: BLOCKED:** the cloud runner is disabled and the Enrollment
trigger correction has not been deployed/verified. Data ownership, legacy/Storage
classification and the local recoverable baseline are covered by the LIVE fixture
contract linked above. Scheduler pause and in-window drain are future separately
approved actions. Absolute proof that no external writer exists is not a
prerequisite of this revised staging procedure.

Historical validation for the earlier preparation: complete inventory/fingerprint verification,
stable Storage captures, canonical Course audit, syntax checks, documentation
format/diff checks and focused independent review PASS. Writer-log capture:
INCOMPLETE (429). Apply dry-run: REFUSED (scope). Cloud execution/bootstrap:
NOT RUN. Existing reset emulator/build results in the reusable runbook are prior
validation; this documentation/read-only diagnostic task did not rerun them.
No product source, deployed Function, Hosting, Rules, indexes, IAM or Scheduler
configuration changed. Existing branch and unrelated WIP are preserved.
