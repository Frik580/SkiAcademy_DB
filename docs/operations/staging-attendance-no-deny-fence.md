# Staging Attendance: no-deny preparation and execution gate

Verdict: **BLOCKED**. Preparation only; no cloud mutations, deploy, reconciliation,
backfill, cutover, marker creation, commit, push or merge performed. Production is
outside scope. Staging backup is optional. No new IAM grants or deny policy are
proposed. Keep the Attendance scheduler in legacy mode until every gate below is
proved and cutover receives separate approval.

## Source and fresh evidence

Local main, origin/main and remote refs/heads/main:
`e770656293ee1ad296a646d98f08f4ac42312842`. Working tree was clean on entry.
Remote checked with `git -c http.sslBackend=schannel ls-remote origin refs/heads/main`;
TLS verification stayed enabled. Existing implementation: DONE; earlier no-deny
fence proof: MISSING; earlier first-backfill expectation in the runbook: BROKEN,
corrected to updated=10/unchanged=42. Domain code/guard remains unchanged.

Fresh Firestore snapshot readTime: **2026-10-18T17:44:48.970189Z**, or
**18 October 2026 22:44:48 Asia/Qyzylorda**. Local access-controlled evidence:
`.scratch/attendance-no-deny-live/`. Do not commit raw participant documents.

| Collection | Count | Typed payload comparison to 19:29:17 evidence |
|---|---:|---|
| bookings | 52 | identical |
| attendance | 85 | identical |
| booking_attendance_outcome_work | 52 | identical; 46 complete / 6 pending / 0 blocked |
| payments | 70 | identical |
| monetary_events | 65 | identical |
| command_idempotency | 321 | identical |
| admin_issues | 26 | identical |
| system_migrations | 0 | identical; marker absent |

`snapshot.json` retains full Firestore REST Value types, names and update times.
`readiness.json` contains per-document SHA-256 and full collection hashes (names +
typed payloads, ordered by document ID). All eight collections use one readTime.
The 501-document query bound is a fail-closed sentinel, not pagination or a silent
sample. This is a deliberate bounded full inventory for this maintenance task,
not background polling. No cost estimates are inferred. Nested Wallet documents
are not included; these eight hashes are not proof about every database document.

All six pending IDs and ten stale IDs exactly match the earlier typed snapshot.
All Booking, Attendance and work schemas parse; work ID, scope, occurrence, schedule
revision and source end time match. Pending Booking revision/source revision=2,
workRevision=3, completed lifecycle, instructor_window deadline, attemptCount=0;
deterministic frozen factual Attendance coverage is 2/2, 4/4, 2/2, 3/3, 3/3, 4/4 in
the original six-ID order. The ten cancelled Booking revisions=2 have complete
lifecycle_ineligible work with source revision=1/source lifecycle=pending/revision=1.
No work orphan or missing Booking coverage. Existing resolver/idempotency and issues
payloads match earlier evidence; do not invent new factual Attendance.

Read-only refresh, from repository root (each invocation needs a NEW directory):

```powershell
$attendanceSnapshot = '.scratch/attendance-readiness-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
node --use-system-ca scripts/stagingAttendanceReadiness.mjs $attendanceSnapshot
if ($LASTEXITCODE -ne 0) { throw 'STOP: incomplete inventory, drift or cloud read failure' }
```

This baseline checker intentionally rejects the post-reconciliation state. Do not
use it as a post-write checker or relax its baseline to make a phase pass.
It requires installed dependencies, current compiled Functions parsers, and previous
`.scratch/attendance-blockers/preflight.json`. Preserve those local evidence files.
It performs only OAuth refresh, GET, getIamPolicy and runQuery, never a commit.
`BASELINE_VERIFIED_FENCE_NOT_VERIFIED` is explicitly not migration approval.

## Relevant deployed revisions

Fresh `functions.json` retains all 47 Functions, build source generations, states,
service account and exact revisions. Per-writer `service-*.json` and `policy-*.json`
retain traffic configuration, ingress, IAM-check setting, IAM policy and etags.

| Function | Revision |
|---|---|
| executeCanonicalCommand | executecanonicalcommand-00027-vom |
| executeGuestCanonicalCommand | executeguestcanonicalcommand-00030-lef |
| executeTestSessionLifecycle | executetestsessionlifecycle-00024-zit |
| syncLessonBookingAttendanceOutcomeWork | synclessonbookingattendanceoutcomework-00023-nuj |
| scheduledResolveLessonBookingAttendanceOutcomes | scheduledresolvelessonbookingattendanceoutcomes-00023-zaj |
| scheduledExpireGuestLessonReservations | scheduledexpireguestlessonreservations-00023-wav |
| scheduledReconcileGuestConfirmationMismatches | scheduledreconcileguestconfirmationmismatches-00024-wit |
| scheduledResolveCourseEnrollmentOutcomes | scheduledresolvecourseenrollmentoutcomes-00023-puz |
| scheduledExpireGuestCourseReservations | scheduledexpireguestcoursereservations-00023-buj |
| queryParticipantProgressReadModels | queryparticipantprogressreadmodels-00025-lor |

The last function was updated at 15:30:27Z on October 18; no redeploy is needed or
proposed. Migration operates through the local compiled reconciler/guard, not a
deployed callable. The corrected local guard includes same-revision terminal-work
frozen-Attendance validation and transactionally rechecks full Booking/work coverage
before ready. Build and regression verification are separate from deployed revision
inventory: the October 17 deployed scheduler/trigger archives have not been inspected
here and are not claimed to contain the later guard patch.

## Writer inventory and closure matrix

Canonical path: `index.ts` callables → canonical command handlers → scoped server
transaction executor; only that path owns Booking/Attendance/money mutations.
Work reconciliation is a projection-only transaction in
`bookingAttendanceOutcomeWorkSync.ts`. No new authority or persistence path is added.

All deployed Functions share runtime SA
`1005648185457-compute@developer.gserviceaccount.com`. Fresh project policy grants
it `roles/editor` and `roles/run.invoker`. Other direct-data-access candidates are
`ski-school-staging@appspot.gserviceaccount.com`,
`1005648185457@cloudservices.gserviceaccount.com`, Firebase Admin SDK SA,
the human Owner, and managed service agents. An allow-policy inventory does not
prove every effective permission, active credential or external process.

| Writer | Proposed restriction / restoration | Required proof; current result |
|---|---|---|
| Client SDK/REST Firebase users | Temporarily replace entire staging Firestore ruleset with deny-all; restore saved release/source | Anonymous/self/instructor/admin create/update/delete canaries. Local Rules test only; live NOT RUN |
| executeCanonicalCommand | Require Run IAM check, remove only allUsers run.invoker binding; restore exact binding/settings | Both cloudfunctions.net and run.app URLs, unauthenticated + valid Firebase user + privileged IAM caller; no protected writes. Public restriction alone leaves inherited invocation: NOT CLOSED |
| executeGuestCanonicalCommand | Same service-specific public restriction/restore | Valid guest admission canary on disposable fixtures, distinct command IDs; malformed token rejection is not evidence. NOT CLOSED |
| executeTestSessionLifecycle | Same restriction/restore; contains bootstrap/reset/delete paths | Valid disposable TEST lifecycle request; inherited invokers still exist. NOT CLOSED |
| resolveInstructorLessonRevenue | Same restriction/restore; ancillary financial projection writer | Valid disposable request, manifests and authorization results. NOT CLOSED |
| Other canonical mutations | Through the two command callables: create/reschedule/party/cancel/guest link/payment start/profile sync, record/finalize/resolve Attendance, course Attendance/reconciliation | Same closure must cover all command families, not just one command name. No separate exported Booking/Attendance callable found in current index; old deployed source identity remains a verification gate |
| scheduledResolveLessonBookingAttendanceOutcomes | Pause job, retain original ENABLED state/config; restore after cutover | Data resolver and direct work writes; HTTP endpoint still invokable by shared SA. Pause alone NOT CLOSED |
| scheduledExpireGuestLessonReservations | Pause/restore exact job | Expiry canonical Booking mutation; manual HTTP invocation remains. NOT CLOSED |
| scheduledReconcileGuestConfirmationMismatches | Pause/restore exact job | Can confirm funded guest Booking/payment; manual invocation remains. NOT CLOSED |
| scheduledResolveCourseEnrollmentOutcomes, scheduledExpireGuestCourseReservations | Pause/restore exact two jobs | Shared Attendance/finance/idempotency/AdminIssue surfaces; manual invocation remains. NOT CLOSED |
| scheduledDeliverDomainOutbox, scheduledPurgeExpiredNotifications | Optional whole-window pause/restore, explicitly included if all staging writers are frozen | Ancillary outbox/notification writes/side effects, not claimed direct Booking writers; all seven jobs currently ENABLED |
| syncLessonBookingAttendanceOutcomeWork | No safe closure established by service-local invoker removal | bookings/{bookingId} → work reconcile set/delete; project Run Invoker still authorizes Eventarc SA. NOT CLOSED |
| syncGuestBookingConfirmationWork, syncGuestEnrollmentConfirmationWork, syncGuestPaymentConfirmationWork | Drain and preserve three Eventarc subscriptions; do not delete triggers | Other confirmation projections and upstream scheduler paths. Not misclassified as three independent direct Attendance writers; NOT DRAINED |
| syncInstructorLessonRevenueBooking, syncInstructorLessonRevenuePayment, syncCourseEnrollmentOutcomeWork, deliverDomainOutboxOnCreate | Drain four remaining subscriptions; preserve retry delivery | Other projections/outbox; shared runtime and retry visibility required. NOT DRAINED |
| Direct Admin SDK / console / REST / fixture, owner, backfill and migration scripts | Obtain process/credential inventory, stop every non-operator writer and prevent restart using existing narrowly scoped controls | Rules and public-invoker restrictions do not affect this class. External writers cannot be enumerated from repo or logs alone: UNKNOWN → NO-GO |
| In-flight Run requests, transactions, import/restore/bulk-delete operations | Close new admission, enumerate active operations, await terminal completion without loss | Zero visible active work plus effective closure and fresh manifests; fixed sleep/quiet logs insufficient. UNKNOWN → NO-GO |
| Approved operator | Existing separate human credentials, no runtime-SA exception or new IAM grant | Verify effective read + rollback control access before fence; permit only approved work and guarded marker writes after later approval. No cloud probes run |

Server clients bypass Security Rules: [Firestore security overview](https://firebase.google.com/docs/firestore/security/overview).
Run IAM-check disablement and public grants are separate controls:
[Cloud Run access control](https://docs.cloud.google.com/run/docs/securing/managing-access).
Removing a resource-local allow cannot subtract a project-level allow. These facts
are why the candidate is incomplete; do not replace that gap with an IAM deny,
new broad permissions, SA deletion, broad Editor-role removal or silent risk acceptance.

## Candidate configuration commands — separate future action only

These commands prepare only the closed portions of the matrix. They are **not an
approved complete fence**. Do not run them while privileged-writer coverage remains
unknown. All writes below require separate permission and verified recovery access.
Save fresh policies/config before the window, including etags and original job states.
Evidence captured today is an inspection snapshot, not permission to overwrite later
configuration. Abort if the effective policy or source revision drifts.

Read-only inspection examples (PowerShell):

```powershell
gcloud functions describe executeCanonicalCommand --gen2 --region=us-central1 --project=ski-school-staging --format=json
gcloud run services describe executecanonicalcommand --region=us-central1 --project=ski-school-staging --format=json
gcloud run services get-iam-policy executecanonicalcommand --region=us-central1 --project=ski-school-staging --format=json
gcloud projects get-iam-policy ski-school-staging --format=json
gcloud scheduler jobs list --location=us-central1 --project=ski-school-staging --format=json
gcloud eventarc triggers list --location=eur3 --project=ski-school-staging --format=json
gcloud pubsub subscriptions list --project=ski-school-staging --format=json
```

Temporary Rules source, full ruleset replacement (never append an ineffective deny
match to existing allow rules):

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

The local tested copy is `.scratch/attendance-no-deny-replay/fence.rules`. Prepared
local files in `.scratch/attendance-fence-approved/` contain the same `fence.rules`,
the complete deployed original source as `original.rules`, `firebase.json` referencing
only the fence, and `rollback.firebase.json` referencing only the original source.
The directory name does not confer approval. The source/release, service settings,
policies, job configurations and these files are sealed in
`.scratch/attendance-no-deny-evidence-sha256.json`. Before future execution refresh
and re-review all configurations and validate exact rollback source. Run no broad
Firebase deploy. Example target after those files are reviewed:

```powershell
# FUTURE WRITE, separate Rules approval; config contains ONLY firestore.rules.
node node_modules/firebase-tools/lib/bin/firebase.js deploy --project ski-school-staging --config .scratch/attendance-fence-approved/firebase.json --only firestore:rules
if ($LASTEXITCODE -ne 0) { throw 'Uncertain Rules result; inspect deployed release' }
```

Public admission candidate; repeat only for the four inventoried callable services
`executecanonicalcommand`, `executeguestcanonicalcommand`,
`executetestsessionlifecycle`, `resolveinstructorlessonrevenue`. Verify current CLI
supports the IAM-check flag before approval. Neither command closes privileged callers:

```powershell
# FUTURE WRITES, separate service-settings and IAM approval.
gcloud run services update executecanonicalcommand --invoker-iam-check --region=us-central1 --project=ski-school-staging
if ($LASTEXITCODE -ne 0) { throw 'STOP: invoker check update failed' }
gcloud run services remove-iam-policy-binding executecanonicalcommand --member=allUsers --role=roles/run.invoker --region=us-central1 --project=ski-school-staging
if ($LASTEXITCODE -ne 0) { throw 'STOP: public binding removal failed' }
```

Pause only exact reviewed ENABLED jobs. Example for Attendance; full relevant list
is the five scheduled mutation rows above (seven only if the broader short freeze
is separately approved). Keep every job JSON and original state:

```powershell
# FUTURE WRITE, separate Scheduler approval.
gcloud scheduler jobs pause firebase-schedule-scheduledResolveLessonBookingAttendanceOutcomes-us-central1 --location=us-central1 --project=ski-school-staging
if ($LASTEXITCODE -ne 0) { throw 'STOP: pause failed' }
```

No trigger/subscription disable/delete, seek, purge, pull-and-ack or success/no-op
handler replacement is proposed. Those would either fail to block inherited access
or lose evidence/events. No command to revoke runtime/editor/project-wide access is
prepared: that is outside a demonstrated minimal fence and could break recovery.

## Drain and live canary acceptance

1. Obtain complete writer/credential/process inventory and stop external testing,
   fixtures, callbacks and console mutations, with evidence they cannot restart.
   Verify existing operator can restore Rules, service IAM/settings and Scheduler;
   retain independently tested recovery access. Do not change that access or any SA.
2. After separate fence approval, restrict new mutations, pause exact scheduled
   sources, read back effective configuration. Require meaningful negative probes:
   IAM 403 before handler for public callable canaries, valid client role writes
   denied, privileged credential/endpoint paths explicitly covered. Failed auth,
   malformed input or idempotent success is not isolation evidence. Restrict probes
   to separately approved disposable documents; never real Booking/Attendance.
   If only an impossible-precondition commit is used, FAILED_PRECONDITION proves
   neither denial nor closure; create permission remains untested.
3. All eight live Eventarc subscriptions are in triggers/subscriptions JSON. Fresh
   subscription payloads retain retry/retention. Read per-subscription regional
   `pubsub.googleapis.com/subscription/num_unacked_messages_by_region` and
   `pubsub.googleapis.com/subscription/oldest_unacked_message_age_by_region`, delivery
   attempts/retries and any dead-letter state, accounting for sampling/ingestion lag.
   Require fresh zero values; missing series is UNKNOWN. An HTTP-blocked retained
   backlog is not drained. Never wait through retention expiration.
4. Enumerate active Firestore managed operations and accepted Run/Functions requests;
   correlate start/terminal request IDs and data commits across all writers, including
   earlier revisions receiving traffic. Current listed Functions timeout=60s and job
   attemptDeadline=180s are bounds to inspect, not proof that activity ended.
5. Repeat full typed snapshots after effective closure, after canaries finish, and
   beyond relevant metric ingestion windows; compare payload hashes and document
   update times. Equal payloads alone do not rule out intervening writes. Quiet logs
   do not rule out unlogged writers. Any unobserved writer, retry, backlog or active
   operation is NO-GO. No partial-drain exception is accepted by this plan.

Monitoring and live permission probes are NOT RUN in this preparation; drain is
NOT VERIFIED. Retry semantics: [Eventarc retries](https://docs.cloud.google.com/eventarc/docs/retry-events).

## Data phases after all gates and separate approvals

Exact canonical reconciliation command and the six IDs remain in
[the migration runbook](staging-attendance-migration.md#controlled-completion-of-the-six-work-documents).
The inline block there is an execution primitive, not a full phase runner. Do not
execute its unattended six-row loop until a reviewed runner adds the following
per-operation evidence gates (currently MISSING): repeat full Booking/work/Attendance
preflight immediately before EACH operation; compare complete protected manifests
and all work payloads after EACH operation; stop before the next write on uncertainty.
The emulator replay demonstrates those checks locally; no cloud runner is claimed ready.
Never patch status directly. Each result must be updated, complete/lifecycle_ineligible,
workRevision 3→4; exactly the chosen work changes. At partial completion retain IDs,
before/after and errors, stop, and inspect committed state before authorizing remaining IDs.

After six: all 52 complete, pending=blocked=0. Only then, separate backfill action:

```powershell
# FUTURE DATA WRITES; require proven fence/drain and explicit backfill approval.
node functions/scripts/backfillBookingAttendanceOutcomeWork.cjs --project ski-school-staging --page-size 100
if ($LASTEXITCODE -ne 0) { throw 'Dry inventory failed' }
node functions/scripts/backfillBookingAttendanceOutcomeWork.cjs --project ski-school-staging --page-size 100 --apply
if ($LASTEXITCODE -ne 0) { throw 'Partial/blocked backfill: STOP' }
```

Require complete cursor exhaustion, scannedBookings=52, updated=10, unchanged=42,
created=deleted=blocked=0, exact four-field diff in the ten, unchanged protected
manifests, absent marker. Repeat as a separate explicit action, requiring unchanged=52,
all other outcomes zero and byte-identical typed work payloads. Inspect all 52 source
revision/lifecycle/scope/occurrence relationships and absence of orphan/missing work.
Dry-run is a Booking counter, not an integrity validator.

Cutover remains a separately approved command after the repeated backfill and full
verification, never chained to diagnosis or other mutation phases:

```powershell
# FUTURE DATA WRITE; separate user cutover approval is mandatory.
node functions/scripts/backfillBookingAttendanceOutcomeWork.cjs --project ski-school-staging --page-size 100 --apply --cutover
if ($LASTEXITCODE -ne 0) { throw 'Cutover uncertain/blocked: inspect before retry' }
```

The existing transaction guard must pass unchanged. Expected marker path
`system_migrations/booking_attendance_outcome_work_v1`, status=ready,
verifiedBookings=verifiedWorks=52, lookbackMs=604800000. Never directly create/delete
or patch the marker. Check canonical hashes and work revisions again afterward.

## Restore and two natural Scheduler runs

No rollback is currently needed: nothing was applied. Future rollback restores
configuration, not canonical history. On uncertain results inspect actual state;
do not blindly rerun. Use the saved current etag, check that only approved deltas
occurred, and reverse only those deltas; do not overwrite others' changes.

1. Stop/abort the data phase while preserving evidence. Confirm pending events and
   retention before releasing anything. Never leave blocked retries until expiry.
2. Restore exact original Rules via the preserved original source and reviewed
   Rules-only rollback config:
   `node node_modules/firebase-tools/lib/bin/firebase.js deploy --project ski-school-staging --config .scratch/attendance-fence-approved/rollback.firebase.json --only firestore:rules`.
3. For services where only allUsers was removed, restore that exact binding, e.g.
   `gcloud run services add-iam-policy-binding executecanonicalcommand --member=allUsers --role=roles/run.invoker --region=us-central1 --project=ski-school-staging`.
   Restore IAM-check state only if it changed, from saved settings, and verify both
   function and run.app endpoints. Restore the other three services similarly.
4. Resume only originally ENABLED jobs actually paused in this window, e.g.
   `gcloud scheduler jobs resume firebase-schedule-scheduledResolveLessonBookingAttendanceOutcomes-us-central1 --location=us-central1 --project=ski-school-staging`.
   Keep originally paused jobs paused. Read back every restored setting.
5. After restoring the original configuration, observe two natural successive
   five-minute Attendance Scheduler executions. Use the read-only logging commands
   in the main runbook. Require candidateSource=projection, no integrity failure,
   no reselection/revision change of completed work, no unexpected AdminIssue or
   duplicate idempotency effects. Distinguish new legitimate Booking activity by
   IDs/timestamps; do not require global zero activity.

Restoration order must be reviewed against the established fence: restoring Rules
or public ingress permits user writes again. It cannot be used during an unfinished
data phase. If cutover did not happen, restored scheduler stays legacy via absent
marker. If it happened and acceptance fails, STOP and investigate; automatic marker
deletion/data rollback is not authorized.

## Approval boundary and remaining blockers

Before requesting execution approval, supply a proven closure for shared-SA and
external Admin writers, effective-policy/canary evidence, tested recovery access,
fresh drain metrics/operations evidence, deployed-source identity assessment, and
a per-operation cloud reconciliation runner. No additional broad IAM permission is
requested. If existing narrowly scoped controls cannot prove closure, remain BLOCKED
and preserve legacy mode. Any proposed weaker risk acceptance requires a new explicit
user decision; it is not implicit in approval of these commands.

Later permissions must separately name: exact staging Rules replacement/restore;
four service admission IAM/settings deltas/restore; exact Scheduler pause/resume;
disposable canary probes and cleanup; six canonical projection reconciliations;
first and repeat backfill; guarded cutover; controlled release and two-run observation.
Deploy, production, commit/push/merge and policy broadening remain unauthorized.

## Current local validation

- PASS: Functions build/TypeScript/provenance and application `tsc --noEmit`.
- PASS: 24 targeted work/sync/sweep unit assertions, zero Firestore egress attempts.
- PASS: 32 local replay/Rules assertions, zero skipped: fresh snapshot replay, six
  completion/idempotency cases, ten exact four-field repairs, first backfill 10/42,
  repeat 52 unchanged, local guarded cutover; 36 client write denials plus explicit
  Admin bypass control. Protected eight-collection payloads stayed unchanged.
- PASS: 48 Attendance command/migration guard emulator assertions, zero skipped,
  including actual CLI repeat and explicit cutover; zero Firestore egress attempts.
- PASS: explicit `eslint --no-ignore scripts/stagingAttendanceReadiness.mjs` and
  `node --check` (the repository's normal ESLint configuration ignores root .mjs).
- PASS: one independent review of the script/runbooks and offline recomputation of
  all per-document and collection digests; no actionable findings.
- PASS: full ESLint (0 errors; existing formatting warnings), `git diff --check`,
  one `graphify update .` (15,306 nodes, 44,230 edges; generated graph refreshed).
- NOT RUN: live mutation probes, applied-fence verification, drain, cloud migration
  and two natural post-cutover Scheduler runs. These remain execution blockers.

Local replay/guard reproduction from repository root, with port 8189 free and no
other task's emulators running:

```powershell
npm run build:functions
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --project demo-attendance-blockers --config .scratch/attendance-no-deny-replay/firebase.json --only firestore "node .scratch/attendance-no-deny-replay/run.cjs"
if ($LASTEXITCODE -ne 0) { throw 'Emulator assertions or wrapper failed; inspect log separately' }
```

All locally seeded data and ready markers belong only to demo emulator projects.
The emulator wrapper exited 0 and shut down its services; no background emulator is
required. Product source and migration guard were not modified.
