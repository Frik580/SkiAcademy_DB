# Staging Attendance migration — guarded execution plan

Scope: `ski-school-staging/(default)` only. Production unchanged. This document
prepares future execution; **no cloud writes, deploy or merge are authorized**.
Commit/push/PR for the guard are authorized. Execute this plan only after explicit
migration/cutover permission, approved source revision, green PR CI and an approved
maintenance window. Staging contains recoverable test data: backup/rehearsal is
optional. Production backup/recovery requirements remain mandatory.

Release validation: targeted unit 24/24 PASS; local emulator integration 48/48 PASS
(18 migration/actual CLI regressions and 30 Attendance command tests, zero skipped);
Functions TypeScript/build/provenance PASS; application TypeScript and full ESLint
PASS (0 errors, existing formatting warnings); independent review and diff check
PASS. CI now fails if the required emulator suites or actual CLI regression are
absent, skipped or failed; its verifier also passed against the local JSON report.
GitHub CI for the exact PR head is a separate required gate.

## Preconditions and fresh inventory

Release preparation read-only snapshot: **2026-10-18 18:58:05 Asia/Qyzylorda**:
52 Bookings, 52 work (46 complete / 6 pending / 0 blocked), marker absent.
All six passed current Booking/work schema, occurrence/revision/scope checks and
deterministic frozen Attendance verification: coverage 2/2, 4/4, 2/2, 3/3, 3/3,
4/4 respectively in the ID order below. Safe state remains
`complete / lifecycle_ineligible`; no staging documents were changed.

- Merge/deploy, if needed, require separate authorization. Use an approved guard
  source revision and build it locally before using the operator CLI. Do not call a
  deployed resolver or assume the deployed trigger contains this change.
- Suspend affected writers and the Attendance scheduler under a separately approved
  maintenance fence; wait for in-flight jobs/commands to finish. Keep the fence
  through read-only comparison, backfill and cutover. If this cannot be established,
  STOP. No Scheduler changes are authorized by the present PR task.
- Refresh the complete read-only work/Booking inventory and exact Attendance facts;
  preserve a local access-controlled snapshot. Inspect malformed/orphan work too.
  Do not use just `where(status == pending)` as the completeness proof.
- Expected baseline: 52 work = 46 complete + 6 overdue pending, no blocked; all six
  completed Bookings, Booking revision 2, work revision 3, source revision 2,
  schedule revision 1, LIVE, deadline `instructor_window`, attemptCount 0. Confirm
  exact occurrence/end/dueAt, full deterministic frozen Attendance coverage and
  scope, six successful `outcome` idempotency records, no instructor-window records
  or related Admin Issues. Missing Attendance remains unknown; never invent facts.
- Marker `system_migrations/booking_attendance_outcome_work_v1` must be absent.
  If present, STOP and inspect its source/counts before any operation.
- Hash all current Booking and Attendance document payloads using a stable typed
  manifest. Preserve counts and hashes for comparison after each write phase.

The bounded read-only diagnostic and raw evidence from preparation remain in the
task workspace under `.scratch/staging-backup-attendance/diagnose.mjs` and
`.scratch/attendance-guard-release/diagnosis.json`; they contain no write calls.
They use the existing local Firebase CLI account, staging-only REST guards and
fail on an inventory of 501+ rows. Do not publish the raw participant data in PRs.
Run read-only diagnostics again immediately before any approved migration:

```powershell
node --use-system-ca .scratch/staging-backup-attendance/diagnose.mjs
if ($LASTEXITCODE -ne 0) { throw 'Incomplete or invalid read-only diagnosis' }
$attendanceEvidence = Get-Content -Raw .scratch/staging-backup-attendance/diagnosis.json | ConvertFrom-Json
if ($attendanceEvidence.workCount -ne 52 -or $attendanceEvidence.workStatuses.complete -ne 46 -or $attendanceEvidence.workStatuses.pending -ne 6 -or $attendanceEvidence.workStatuses.blocked -ne 0 -or $null -ne $attendanceEvidence.marker) { throw 'Baseline changed; re-review required' }
```

## Controlled completion of the six work documents

This is a separate approved cloud write phase. Use the existing reconcile function;
never directly patch work status or call Attendance/lifecycle/financial commands.
The current source reads canonical Booking and deterministic frozen Attendance in
a transaction and writes only the work projection. Preflight the whole six-document
set first; any unexpected state stops before the first reconciliation. Keep the
maintenance fence. No historical work document is deleted.

PowerShell, repository root, authenticated Admin SDK ADC for staging:

```powershell
if ($env:FIRESTORE_EMULATOR_HOST -or $env:FIREBASE_EMULATOR_HUB) { throw 'Unexpected emulator environment' }
npm run build:functions
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
# Execute the following block only with separate six-work reconciliation approval.
@'
const functionsRequire = require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
const {initializeApp} = functionsRequire('firebase-admin/app');
const {getFirestore} = functionsRequire('firebase-admin/firestore');
const {parseBooking} = require('./functions/lib/canonical/bookings/bookingStore');
const {parseBookingAttendanceOutcomeWork} = require('./functions/lib/canonical/bookings/bookingAttendanceOutcomeWork');
const {reconcileLessonBookingAttendanceOutcomeWork} = require('./functions/lib/canonical/bookings/bookingAttendanceOutcomeWorkSync');
const ids = [
 'booking_03b12713de754497b4ad6f41527d1971',
 'booking_14539b0988d24485af2327ceaf60ed55',
 'booking_1c198cd66b6d4b14a2fdd9be45459c17',
 'booking_2e7231c23547435997042bf930ecff22',
 'booking_7e06abe13d1943a28753e3e812061770',
 'booking_9b2c588ea0e84c16b333a2183e717b51',
];
initializeApp({projectId:'ski-school-staging'});
const db = getFirestore();
(async () => {
 if ((await db.doc('system_migrations/booking_attendance_outcome_work_v1').get()).exists) throw Error('Marker already exists');
 for (const id of ids) {
  const b = parseBooking((await db.doc(`bookings/${id}`).get()).data());
  const w = parseBookingAttendanceOutcomeWork((await db.doc(`booking_attendance_outcome_work/${id}`).get()).data());
  if (!b || !w || b.lifecycle.status!=='completed' || b.revision!==2 ||
      w.status!=='pending' || w.workRevision!==3 || w.sourceBookingRevision!==2 ||
      w.occurrenceId!==b.occurrence.occurrenceId || w.sourceScheduleRevision!==b.occurrence.scheduleRevision) throw Error(`Preflight changed: ${id}`);
 }
 for (const id of ids) {
  const outcome=await reconcileLessonBookingAttendanceOutcomeWork(db,id,new Date(),{preserveHistoricalWork:true});
  const w=(await db.doc(`booking_attendance_outcome_work/${id}`).get()).data();
  if (outcome!=='updated' || w.status!=='complete' || w.completedReason!=='lifecycle_ineligible' || w.workRevision!==4) throw Error(`Stop after reconcile: ${id}`);
  console.log(JSON.stringify({bookingId:id,outcome,status:w.status,completedReason:w.completedReason,workRevision:w.workRevision}));
 }
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.terminate());
'@ | node --use-system-ca
if ($LASTEXITCODE -ne 0) { throw 'Partial/blocked reconciliation: inspect before any retry' }
```

Require all six complete/lifecycle_ineligible revision 4; total 52 complete, zero
pending/blocked and unchanged Booking/Attendance manifests. On partial failure,
retain evidence; do not blindly rerun the six-document block (its preflight rejects
partially completed work). Re-review and separately authorize remaining operations.

## Guarded backfill, then separate cutover

The first invocation must not create a migration marker. A read-only dry-run counts
bookings; it is not an integrity validator. Full integrity is checked at cutover.

```powershell
# Separate guarded backfill approval required.
node functions/scripts/backfillBookingAttendanceOutcomeWork.cjs --project ski-school-staging --page-size 100
if ($LASTEXITCODE -ne 0) { throw 'Dry inventory failed' }
node functions/scripts/backfillBookingAttendanceOutcomeWork.cjs --project ski-school-staging --page-size 100 --apply
if ($LASTEXITCODE -ne 0) { throw 'Blocked/incomplete backfill; no cutover' }
```

Inspect all page summaries: advancing document-ID cursors, final page exhausted,
sum(outcomes)=scannedBookings=full Booking count, blocked=deleted=0. With the six
already repaired, require unchanged=full Booking count and no new work changes;
otherwise STOP and review the additional rows. Verify all 52 work schemas, scopes,
identities and source relationships, six results, unchanged domain manifests and
absent marker with a fresh read-only snapshot. Original pre-write baseline
assertions above intentionally no longer apply after completion.

```powershell
# Separate cutover approval required; this invocation rechecks an idempotent full
# backfill and transactionally verifies all Booking/work rows before writing ready.
node functions/scripts/backfillBookingAttendanceOutcomeWork.cjs --project ski-school-staging --page-size 100 --apply --cutover
if ($LASTEXITCODE -ne 0) { throw 'Cutover blocked; inspect evidence before retry' }
```

No direct marker write is permitted. The transaction blocks on >1,000 documents
per collection, incomplete evidence, missing/orphan/blocked work, overdue/retry work,
unproven deadlines, scope/identity mismatch or source coverage change.

## Marker and Scheduler acceptance

Read the marker with authenticated read-only Firestore REST/Admin SDK; require
`status=ready`, `verifiedBookings=verifiedWorks=52`, canonical lookbackMs and a
completedAt within the approved window. Recheck full work counts and unchanged
Booking/Attendance manifests. Confirm no new Admin Issues or resolver idempotency
records were manufactured by projection reconciliation.

Restore the Scheduler only after separately approved fence release. Existing job
`firebase-schedule-scheduledResolveLessonBookingAttendanceOutcomes-us-central1`
runs every five minutes. Do not manually invoke it as part of a read-only check.
Read-only PowerShell commands for the approved observation period:

```powershell
gcloud scheduler jobs describe firebase-schedule-scheduledResolveLessonBookingAttendanceOutcomes-us-central1 --project=ski-school-staging --location=us-central1 --format=json
$attendanceFunction = gcloud functions describe scheduledResolveLessonBookingAttendanceOutcomes --gen2 --region=us-central1 --project=ski-school-staging --format=json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $attendanceFunction.serviceConfig.service) { throw 'Cannot resolve deployed Scheduler function service' }
$attendanceService = ($attendanceFunction.serviceConfig.service -split '/')[-1]
$attendanceLogFilter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="{0}"' -f $attendanceService
gcloud logging read $attendanceLogFilter --project=ski-school-staging --freshness=20m --limit=100 --format=json
```

Use the exact deployed service name from the Functions inventory if it differs.
Require at least two successive scheduled executions after fence release with
`candidateSource=projection`, no failures/invalid integrity, no selection of the six
completed rows, unchanged work revisions and no duplicate resolver/AdminIssue
effects. New legitimate Booking activity must be distinguished using timestamps
and IDs; do not assert a global zero candidate count if new activity exists.

## Stop conditions and success

STOP on changed baseline, incomplete read, missing factual Attendance, mismatched
scope/revision/occurrence/deadline, new unresolved policy, existing unexpected marker,
failed/blocked backfill or cutover, manifest difference, absent fence, failed checks
or CI, unexpected scheduler processing, cloud operation without its authorization.
Do not delete work, change lifecycle/history, fabricate idempotency records or relax
the guard to continue. Staging backup absence alone is not a stop condition.

Success: all six retained work documents complete/lifecycle_ineligible exactly once;
all inventories complete; blocked=0; marker ready with verified counts; domain hashes
unchanged; repeated approved verification/backfill idempotent; two clean Scheduler
runs. Production, merge and staging deploy remain separately gated.
