# Staging backup and Attendance readiness — 2026-10-18

Base: `3c5e17407703d56069f9313ea4944522dcd6c574`.
Branch: `codex/staging-backup-attendance-readiness`.
Cloud work is read-only. Schedule, restore, migration, cutover, deploy and merge
remain unauthorized. Commit, push and PR creation are authorized for the guard
release. Production release remains BLOCKED.

## Release gate policy

The product owner confirmed this staging environment contains only recoverable test
data. Staging backup and restore rehearsal are **optional**, not migration or deploy
release gates. The backup/restore material below is an optional operational plan;
its backup, restore and isolation stop conditions apply only if those operations
are separately requested. No backup, restore or other cloud write is authorized.

Production has no such exemption: verified backup/recovery, preserved Rules/TTL/IAM,
restore rehearsal acceptance and all production release gates remain required.
Guard correctness, complete read-only diagnostics, local checks, independent review,
GitHub CI and separately approved staging writes remain mandatory. The current
Attendance-only execution plan is in `staging-attendance-migration.md`.

## Backup cost and retention

Verified source: `ski-school-staging`, `(default)`, Standard Native, `eur3`, UID
`6f45a668-400d-4f11-8dd3-fb8dceba03c1`. Read-only observation at
2026-10-18 17:23:38 Asia/Qyzylorda: no backup schedule and no backup.
Latest storage metric: **28,442,356 bytes = 0.02648900821805 GiB**,
sample time **2026-10-17 22:02 Asia/Qyzylorda**.

Official [Firestore pricing](https://cloud.google.com/firestore/pricing), explicitly
selected **Europe 3 (eur3), Monthly**, verified 2026-10-18:

| Item                                  |         Rate USD |                             Cost at measured size |
| ------------------------------------- | ---------------: | ------------------------------------------------: |
| Backup storage                        | 0.03 / GiB-month |                      0.00079467025 / backup-month |
| Daily, retention 7 days, steady state |  7 × size × 0.03 |                         **0.00556269173 / month** |
| One restore                           |       0.40 / GiB |                                 **0.01059560329** |
| Restored named DB storage             | 0.18 / GiB-month |  0.00015893405 / 24h using a 30-day approximation |
| Restore + 24h target storage          |   above combined | **0.01075453734**, plus verification reads/egress |

With one equally sized backup per day, a simple first-30-day ramp model gives
189 backup-days / 30 × size × 0.03 = **0.00500642255**. Actual backup timing,
size changes and billing-day boundaries determine the invoice. No free backup or
restore quota applies; named database reads/storage are billable. Verification
reads in eur3 are $0.06 / 100,000 documents, plus applicable index reads/egress.
These are exact rate calculations for the measured size, **not an exact invoice
or proof of the instantaneous current size**: the metric is delayed, and the first
actual backup does not exist yet. Recompute from latest available metric before
approval and reconcile actual charges against billing afterwards. No KZT conversion
is asserted; billing currency, taxes and discounts were not inspected.

Use daily retention `7d`. There is at most one daily schedule per database, and its
time of day cannot be chosen. This gives a daily recovery point, not continuous
protection. Backup includes documents and index configuration, but excludes Rules
and TTL policies. See [backup documentation](https://docs.cloud.google.com/firestore/native/docs/backups).

## Approval A — create schedule and wait for a usable backup

The following commands are prepared only. Execute in PowerShell **after explicit
approval for this cloud operation**, with working Google Cloud authentication/TLS:

```powershell
$stagingProject = 'ski-school-staging'
$sourceDatabase = '(default)'
gcloud firestore backups schedules list --project=$stagingProject --database=$sourceDatabase --format=json
# STOP if a daily schedule already exists; reconcile instead of creating a duplicate.
gcloud firestore backups schedules create --project=$stagingProject --database=$sourceDatabase --recurrence=daily --retention=7d
if ($LASTEXITCODE -ne 0) { throw 'Schedule creation failed' }
gcloud firestore backups schedules list --project=$stagingProject --database=$sourceDatabase --format=json
gcloud firestore backups list --project=$stagingProject --location=eur3 --format=json
```

Record the schedule resource name, creation time and source database UID. Check
backups every 15 minutes (bounded operational deadline: 36h; this is a stop/escalation
threshold, not a Google completion SLA). Do not start migration just because the
schedule exists. Select only a backup with matching `database`, matching
`databaseUid`, `snapshotTime` after schedule creation, sufficient remaining retention,
and **`state=READY`**. `CREATING` and `NOT_AVAILABLE` do not pass.

```powershell
# Use the actual ID returned by list, never an invented/default ID.
$backupId = '<READY_BACKUP_ID>'
gcloud firestore backups describe --project=$stagingProject --location=eur3 --backup=$backupId --format=json
```

If no READY backup appears by the operational deadline, STOP and inspect service
status/permissions. Preserve failed-operation evidence. Never delete source data.

## Approval B — isolated restore rehearsal

Restore approval is separate from schedule approval. Target ID reserved in the plan:
`attendance-restore-20261018` (if occupied, stop and select a new ID explicitly).
Do not create the database first: restore creates it. Never use `(default)`.

### Preserve configuration outside the backup

Read-only captures are in `.scratch/staging-backup-attendance/`:
`rules-release.json`, `ruleset.json`, `fields.json`, `iam.json`, `indexes.json`,
`triggers.json`, `database` metadata within `diagnosis.json`, `schedules.json`,
`backups.json`. Keep these local access-controlled artifacts; they are not committed.
Before any approved operation, refresh the captures and hash all files with SHA-256;
store the manifest and copies in an approved durable restricted location. A local
scratch capture alone is not a durable disaster-recovery backup. Include all
single-field overrides as well as TTL-filtered fields (earlier inventory includes
`.scratch/staging-preflight-3c5e1740/before/field-overrides.json`). Follow pagination
and fail if any API response is incomplete/unreachable.

Preserve the **deployed** ruleset and release name, not only repository Rules.
TTL currently has one ACTIVE policy: collection group `guest_reservation_admission`,
field `deleteAt`. Save full IAM bindings/conditions/etag, service accounts, effective
inherited grants and relevant deny policies. The project allow-policy snapshot does
not establish the entire inherited/deny-policy state. Preserve needed Firestore
service-agent and Firebase Rules service-agent bindings. Do not replay the whole
project IAM policy onto a rehearsal database.

### Isolation gate, before restore

All eight observed Firestore Eventarc triggers have exact database filter
`(default)`. Recheck all regions with pagination immediately before restore; STOP on
wildcard/missing database filters or any target database filter. Deploy no Functions,
triggers, schedulers or application configuration for the target. Application/Admin
SDK default database selection remains `(default)`; verifier must use the explicit
target ID. No user application receives that ID.

**IAM isolation is required as well.** Current compute, appspot and cloudservices
accounts have project-wide Editor. A separate database ID and Security Rules do
not prevent their server SDK access. Prepare a dedicated verifier principal and
database-scoped read-only allow grant; use an IAM **deny policy conditioned on a
dedicated quarantine resource tag** to deny `datastore.googleapis.com/entities.*`
to other principals, including runtime accounts and ordinary users. Attach the tag
at database creation via restore `--tags`, avoiding a post-restore access window.
Explicit exceptions must be reviewed: verifier/operator, and only the service agents
actually required for managed restore. Runtime accounts must never be exceptions.
Do not remove broad project roles as an incidental part of this task.

Policy shape to review (placeholders deliberately prevent immediate application):

```json
{
  "displayName": "Isolate restored rehearsal data",
  "rules": [
    {
      "denyRule": {
        "deniedPrincipals": ["principalSet://goog/public:all"],
        "exceptionPrincipals": [
          "<APPROVED_VERIFIER_PRINCIPAL>",
          "<REQUIRED_MANAGED_RESTORE_SERVICE_AGENT>"
        ],
        "deniedPermissions": ["datastore.googleapis.com/entities.*"],
        "denialCondition": {
          "title": "rehearsal quarantine",
          "expression": "resource.matchTagId('<TAG_KEY_ID>', '<QUARANTINE_TAG_VALUE_ID>')"
        }
      }
    }
  ]
}
```

Create/review tags and policy only under separate IAM authorization. Confirm support
and effective policy propagation before restore; test denials for runtime and user
principals, and allowed verifier access in an explicitly approved disposable tagged
probe database. Probe creation/deletion also needs approval. STOP if tag support,
exception principals, inherited grants, deny-policy permissions or negative-access
tests cannot be established. This IAM gate has **not been executed** in this task.
Sources: [supported deny permissions](https://docs.cloud.google.com/iam/docs/deny-permissions-support),
[deny policies](https://docs.cloud.google.com/iam/docs/deny-access),
[database access conditions](https://cloud.google.com/firestore/docs/manage-databases).

Firebase client access must also be closed. Validate in the probe that a new/restored
named database with no Rules release rejects clients. Publish explicit deny-all Rules
to the target only, after restore, and verify unauthenticated and authenticated reads
and writes are denied. Never deploy source allow-rules to the rehearsal target.
Keep source Rules archived for disaster recovery; target Rules are deliberately
quarantine rules. IAM deny remains the protection for server SDKs throughout.

### Restore command, only after all isolation gates and restore approval

```powershell
$restoreDatabase = 'attendance-restore-20261018'
$sourceBackup = "projects/ski-school-staging/locations/eur3/backups/$backupId"
# Resolve and review actual resource tag IDs before approval; do not run placeholders.
$quarantineTag = '<TAG_KEY_ID>=<QUARANTINE_TAG_VALUE_ID>'
gcloud firestore databases restore --project=ski-school-staging --source-backup=$sourceBackup --destination-database=$restoreDatabase --tags=$quarantineTag
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; inspect operation without retrying blindly' }
gcloud firestore operations list --project=ski-school-staging --database=$restoreDatabase --format=json
gcloud firestore databases describe --project=ski-school-staging --database=$restoreDatabase --format=json
gcloud firestore indexes composite list --project=ski-school-staging --database=$restoreDatabase --format=json
```

Wait for the returned operation to finish with `done=true`, no error, and matching
target response; database is unavailable during restore. Wait for every expected
index to be READY. See [restore command](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/databases/restore).

### Data and index acceptance

Capture a typed document manifest at the selected backup's exact `snapshotTime`
(recursive collection discovery, document-name cursors, pages <=500, include
subcollections beneath missing parent documents). Canonicalize Firestore REST value
types, field ordering, reference paths, bytes, timestamp precision and arrays; record
per-document SHA-256, per-collection counts and total. Compare to a manifest from
the explicit restored database. Do not treat equality with a changing live database
as a restore proof. Source PITR is disabled: arbitrary historical readTime is limited;
if the backup snapshot is outside supported readTime retention, STOP and wait for a
new backup while capturing a timely consistent source manifest, or obtain approval
for a source write fence covering the snapshot. No integrity success is asserted now.

Compare normalized composite index definitions and single-field overrides, excluding
resource names/operation IDs/state metadata; require all expected definitions and
READY states. Current source has **67/67 READY**. Check Booking/occurrence identity,
participant-scoped Attendance deterministic IDs, frozen service-party coverage,
work revisions/scopes/deadlines, idempotency references and AdminIssue subjects.
Run read-only monetary reconciliation too: Booking/payment/wallet/MonetaryEvent links,
KZT and debit/credit consistency. No resolver or outbox worker runs on restored data.

Keep TTL disabled during document equality checks: enabling it may delete restored
expired admission documents. Afterwards, under explicit authorization, rehearse TTL
configuration on the target and wait for ACTIVE, recording expected TTL deletions:

```powershell
gcloud firestore fields ttls update deleteAt --project=ski-school-staging --database=$restoreDatabase --collection-group=guest_reservation_admission --enable-ttl
gcloud firestore fields ttls list --project=ski-school-staging --database=$restoreDatabase --format=json
```

Repeat negative-access checks and trigger inventory after restore. Save comparison,
operation, configuration and access-test evidence. Target database deletion is a
separate approved cleanup operation; no automatic deletion command is supplied.
Budget continues until that approved cleanup is complete.

## Six pending Attendance work — read-only classification

Observation: 52 work, 46 complete, 6 pending; bounded complete inventories (limit 501)
included 321 command idempotency documents and 26 Admin Issues. All six Bookings:
`completed`, Booking revision 2, work source revision 2, schedule revision 1,
work revision 3, deadline `instructor_window`, attempt count 0, LIVE scope.
Each work occurrence ID, source end and schedule revision matches its Booking;
dueAt is endsAt + canonical instructor window (24h), and is overdue.

| Booking ID                                 | occurrenceId                                                       | dueAt UTC        | Frozen facts            | Safe work result                |
| ------------------------------------------ | ------------------------------------------------------------------ | ---------------- | ----------------------- | ------------------------------- |
| `booking_03b12713de754497b4ad6f41527d1971` | `1c577e3d85fcf355cd3baaf33d37079c6dfebb16c6561bf8dc72e82ddbb9c338` | 2026-10-04 09:00 | 2/2 present             | complete / lifecycle_ineligible |
| `booking_14539b0988d24485af2327ceaf60ed55` | `0e517c5f7745d9bc90c2c63913f81e71907cf7020b7411d4647cfeb8d2bb0f59` | 2026-10-06 14:00 | 4/4 present             | complete / lifecycle_ineligible |
| `booking_1c198cd66b6d4b14a2fdd9be45459c17` | `386d5bfcf64e54bede6d6f6e1f3077ee034d1ade158cb440c1a2a93f1931e8ad` | 2026-10-04 07:00 | 2/2 present             | complete / lifecycle_ineligible |
| `booking_2e7231c23547435997042bf930ecff22` | `19363c43ed1baaf30b6e3b401d115ba84dfe199c8fc94c04b01b20c91e442388` | 2026-10-07 05:00 | 3/3 present             | complete / lifecycle_ineligible |
| `booking_7e06abe13d1943a28753e3e812061770` | `99812dac87de0c52e2b16eb0bc96d16dd0c1b2a54b392db156c2b445385fceda` | 2026-09-30 06:00 | 2 present, 1 absent / 3 | complete / lifecycle_ineligible |
| `booking_9b2c588ea0e84c16b333a2183e717b51` | `0cf4163503c091f59348954af4d5dfbb26c33c70fe6489169787043f059d7161` | 2026-10-06 07:00 | 2 present, 2 absent / 4 | complete / lifecycle_ineligible |

All six have the exact scoped deterministic `outcome` idempotency record with success;
all six lack the `instructor_window` idempotency record. No related Admin Issues.
Attendance was checked through current schema parsing, deterministic ID, exact
Booking/occurrence/participant subject and scope. One feedback command record for
`booking_2e...` is unrelated, not a duplicate resolver. Full raw evidence and exact
idempotency paths remain in local `diagnosis.json`; avoid copying participant PII
into this report. Duplicate-fingerprint check is recorded in the final evidence.

Cause: outcome succeeded, work advanced to instructor window; subsequent complete
Attendance did not retire it. With marker absent, legacy sweep considers only
confirmed Bookings, so these completed Bookings are unreachable there. Reconcile's
same-source-revision shortcut previously returned unchanged before checking terminal
pending work. No new product policy is needed for the six: the existing canonical
rule completes terminal work when all frozen factual Attendance exists.

## Local changes and guarded future procedure

Changes: terminal pending work is rechecked even at the same Booking revision;
fully evidenced work completes once, repeated backfill stays unchanged. Missing
facts stay pending and block readiness. Migration backfill preserves malformed
historical work instead of deleting it. Pagination uses document ID, including
documents missing `bookingId`. CLI requires explicit staging/demo project; demo
writes require an emulator; cloud `--now` writes are rejected.

`--apply` only backfills. **`--apply --cutover`** is separately explicit and performs
a fresh whole backfill followed by transactional verification and marker write.
Evidence must be complete, arithmetically consistent and blocked=0. Transaction
checks every Booking/work, missing/orphan/blocked/malformed records, scope,
occurrence/schedule/end/lifecycle integrity, canonical dueAt, overdue work, frozen
Attendance identities, successful schema/fingerprint-matching idempotency proof for
processed deadlines and prior outcome proof for future instructor-window work.
Retry-adjusted deadlines fail closed until drained. Per-collection verification cap:
1,000 documents (+1 sentinel); exceeding it blocks rather than certifying a prefix.

Future cloud procedure, **not authorized by this report**:

1. Approve the exact migration diff and execution separately after PR CI passes.
   Recheck all six read-only. Staging backup/rehearsal is optional for recoverable
   test data; production backup/recovery requirements are unchanged.
2. Establish an approved write fence for affected Booking/Attendance paths and
   automation, or STOP. Multi-page backfill is not one transaction; source writers
   must not race the rehearsal/cutover. No fence was changed in this task.
3. Run from repository root in PowerShell, with no emulator variables present:

```powershell
if ($env:FIRESTORE_EMULATOR_HOST -or $env:FIREBASE_EMULATOR_HUB) { throw 'Cloud procedure has emulator environment' }
npm run build:functions
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
node functions/scripts/backfillBookingAttendanceOutcomeWork.cjs --project ski-school-staging --page-size 100
if ($LASTEXITCODE -ne 0) { throw 'Dry inventory failed' }
# Separate explicit cloud backfill permission required below.
node functions/scripts/backfillBookingAttendanceOutcomeWork.cjs --project ski-school-staging --page-size 100 --apply
if ($LASTEXITCODE -ne 0) { throw 'Backfill blocked; do not cut over' }
# Inspect all counts and six work results; assert Booking/Attendance hashes unchanged.
# Separate explicit cutover permission required below.
node functions/scripts/backfillBookingAttendanceOutcomeWork.cjs --project ski-school-staging --page-size 100 --apply --cutover
if ($LASTEXITCODE -ne 0) { throw 'Cutover blocked; inspect before retry' }
```

4. Require zero blocked, full inventory, all six complete and unchanged Booking /
   Attendance hashes. Read marker back and record verified counts. Repeat backfill
   to demonstrate unchanged results only if that repeat execution was approved.
5. Observe approved scheduler runs, check projection source, failures/issues and
   restore the approved fence. Never manufacture Attendance, lifecycle changes,
   resolver idempotency records or an empty success marker to bypass a stop.

Backfill is a deliberate full drain using document-ID cursor pages 1–500 (default
100); each Booking has a transaction with work plus frozen Attendance reads when
needed. Cutover is a one-time bounded full verification transaction, at most 1,001
Booking and 1,001 work rows plus per-participant Attendance/idempotency reads. No
new polling, subscription, index or scheduler was added. Existing attendance
scheduler runs every five minutes; resource behavior of that scheduler is unchanged.

## Validation and deployment impact

| Check                                     | Result                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Targeted work/sync/sweep unit tests       | PASS — 24/24                                                                             |
| Attendance command emulator integration   | PASS — 30/30                                                                             |
| Migration guard emulator regressions      | PASS — 15/15, including actual CLI dry-run, backfill and repeated cutover                |
| Functions TypeScript / build / provenance | PASS                                                                                     |
| Application TypeScript                    | PASS (full lint TypeScript stage)                                                        |
| Full repository lint                      | PASS — exit 0, 0 errors; 95,008 warnings, predominantly existing CRLF formatting         |
| Independent review                        | PASS — initial skipped-outcome finding fixed and reviewed again in affected areas        |
| Graphify update                           | PASS — graph rebuilt; source remains authoritative; community naming refresh is optional |
| git diff --check                          | PASS                                                                                     |
| Real backup / restore / cloud migration   | NOT RUN — separate authorization required                                                |

The initial combined emulator wrapper failed only because a negative regression
expected the word `identity` while schema rejection correctly produced `missing
Attendance`. The assertion now accepts those two integrity rejection reasons; the
final 15-test guard run and emulator wrapper both exit 0. The 30 command integration
assertions passed independently of that wrapper result. All task-started emulator
processes were shut down by their wrapper.

Historical preparation verdict was READY FOR BACKUP APPROVAL. Staging no longer
requires a backup as a release gate. Current migration release readiness depends on
the guard PR CI and the staging-only plan; no cloud action or deployment is authorized.

No deployment is authorized. Source impact if later deployed: Functions
`syncLessonBookingAttendanceOutcomeWork` and
`scheduledResolveLessonBookingAttendanceOutcomes` depend on the changed sync module.
The marker/backfill CLI itself is operator tooling, not a callable. Shared source
build/provenance means partial deploy safety must be rechecked at deployment time.
Hosting NO; Firestore Rules NO; Indexes NO. Migration YES, separately approved only.
Settings YES only for proposed backup schedule / restore IAM / quarantine Rules /
TTL rehearsal; none applied. No scheduler/trigger configuration changed.

## Stop conditions

- Any cloud operation lacks its separate permission; production remains blocked.
- For optional backup/restore only: missing READY backup, wrong database UID/project/location, expired backup,
  failed restore LRO, incomplete inventory, missing durable configuration copies.
- For optional restore only: IAM quarantine tag/deny not validated before target creation; broad runtime
  access remains possible; clients can read target; trigger targets/wildcards unclear.
- For optional restore only: no exact snapshot manifest, document/hash/index mismatch, TTL changes data during
  equality checks, unclear monetary or participant identity integrity.
- blocked > 0, malformed/missing/orphan work, truncated verification, stuck cursor,
  source coverage change, overdue/retry work, missing frozen facts, scope mismatch,
  or unproven resolver result. Do not delete historical work to pass the guard.
- Unexpected lifecycle/Attendance/history change, changed six-document evidence,
  or a new product decision. Stop and ask one specific question in Russian.
- Any required validation failure or unresolved independent review finding.

Next: guard PR CI, then separate authorization for the staging Attendance migration
plan. Backup remains optional for staging. Restore, IAM setup, migration/cutover and
deployment remain separately authorized operations; production recovery stays mandatory.
