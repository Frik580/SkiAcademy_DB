# Staging reset release preparation

Git publication: **AUTHORIZED AFTER LOCAL PASS**. The owner separately authorized three logical commits, branch push and PR creation after the complete checks below. Merge and cloud execution remain prohibited; packages B/C require separate permissions. This release does not deploy, pause jobs, reset cloud data or install a migration marker. Production
is excluded. The staging-only terminal authorization adapter is implemented; operational execution remains separately gated. See [authorization contract and exact commands](staging-reset-authorization.md).

## Reviewed source and exact scope

At the October 19 pre-publication check, remote main, local main and feature HEAD all equaled
`e770656293ee1ad296a646d98f08f4ac42312842`. The remote feature branch was absent at that pre-publication check; resulting commit/PR/CI identities belong to the final release report. Remote refs were read with `git -c http.sslBackend=schannel ls-remote`;
certificate verification remained enabled. Recheck main/PR head before release.

Existing WIP is classified as follows; no existing product implementation was
rewritten during release preparation.
The original diff inventory contains 33 paths: 30 release files and three preserved,
excluded historical Attendance WIP files, with their hashes checked unchanged. This adapter slice adds six release paths: `functions/scripts/data-reset/authorization.cjs`, `adcIdentity.cjs` in the same directory, `functions/src/maintenance/dataResetAuthorization.test.ts`, `dataResetAuthorization.emulator.test.ts` beside it, `functions/testSupport/resetAuthorization.ts`, and `docs/operations/staging-reset-authorization.md`. Final release scope is 36 files; the same three historical WIP paths stay excluded.

| State                | Exact files / group                                                                                                                                                       | Release disposition                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| DONE                 | functions/src/canonical/courses/courseEnrollmentOutcomeWorkSync.ts; adjacent .test.ts; functions/src/canonical/guestConfirmation/guestConfirmationWork.ts                 | Event-source correctness fixes, package A commit 1                    |
| DONE                 | functions/scripts/data-reset/{adapters,cli,engine,inventory,policy,recovery,stagingFixtures,storage}.cjs                                                                  | Reset core, package A commit 2                                        |
| DONE                 | functions/scripts/resetStagingBusinessData.cjs; resetProductionBusinessData.cjs; inspectStagingResetFence.cjs                                                             | Exact entrypoints/read-only collector, commit 2                       |
| DONE                 | functions/src/maintenance/dataReset.test.ts; dataResetAdapters.test.ts; dataResetLiveFixtures.test.ts; dataReset.emulator.test.ts; dataResetLiveFixtures.emulator.test.ts | Core/ownership/resume/Storage/Auth/Attendance tests, commit 2         |
| DONE                 | functions/testSupport/dataResetLiveFixture.ts                                                                                                                             | Test fixture, commit 2                                                |
| DONE                 | docs/operations/data-reset-scope.example.json; reusable-data-reset.md; staging-data-reset-fence.md; staging-live-fixture-reset.md; staging-reset-operational-window.md    | Reset scope/runbooks, commit 3                                        |
| PREPARED THIS TURN   | .github/workflows/ci.yml; scripts/compareStagingResetRelease.mjs; scripts/compareStagingResetRelease.test.mjs                                                             | Required emulator execution and release comparator, commit 2          |
| PREPARED THIS TURN   | docs/operations/staging-reset-release.md; staging-reset-release-pr.md                                                                                                     | Release packages and PR body, commit 3                                |
| PRESERVED / EXCLUDED | docs/operations/staging-attendance-migration.md; staging-attendance-no-deny-fence.md; scripts/stagingAttendanceReadiness.mjs                                              | Earlier historical Attendance WIP; do not stage in this reset release |

Generated files, private snapshots, credentials, Firestore/Storage debug
logs and graph outputs are not release inputs. A private per-file WIP hash index
is `.scratch/staging-reset-release-file-inventory.json`; final release inventory
also records all newly prepared paths. Existing excluded WIP is retained, not
discarded. Staged diff must contain only the explicit files above.

Exactly five deployed exports reach the changed handlers:

1. `syncCourseEnrollmentOutcomeWork`: current Enrollment/work transactional check;
   stale afterData cannot recreate work after source deletion.
2. `syncGuestBookingConfirmationWork`.
3. `syncGuestEnrollmentConfirmationWork`.
4. `syncGuestPaymentConfirmationWork`: these three call syncGuestConfirmationWrite
   → syncGuestConfirmationWork; no new work without both existing authorities.
5. `scheduledReconcileGuestConfirmationMismatches`: scheduler → recovery page /
   quarantine repair → syncGuestConfirmationWork, plus existing queue processing.

Existing obligations and malformed existing authorities retain fail-closed
handling. LIVE records are never relabeled and ordinary canonical checks remain.
Source import/search and Graphify were verified against current source. No other
deployed export calls these changed write paths. The trigger fixes are necessary
for demonstrated delayed/own-event replay; they are sufficient for the reviewed
empty Guest-work fixture inventory plus drift checks/drain, not a claim of
absolute isolation. Existing LIVE Guest work remains unsupported and blocks a plan.

No deployed index export imports data-reset scripts or a staging-only contract.
Common handler fixes could affect production only through a future production
deploy, which this plan forbids. Staging apply is not enabled by deploying Functions.

## A — Authorized Git publication / separate merge approval

GO for release PR preparation: exact source review, green local checks, deliberate
file staging and preserved unrelated WIP. GO for merge additionally requires CI
on the exact PR head, approved independent review including the comparator fixes,
and the reviewed staging authorization adapter. Operational execution additionally requires package B/C gates and separate owner confirmations; merge permission never authorizes data mutation.

Three logical commits are separated above. The owner authorized their commit/push/PR sequence after local PASS. The commands below document that sequence; inspect each staged diff before its commit. No `git add .` or `git add -A`.

```powershell
git status --short
git diff --check
git add -- functions/src/canonical/courses/courseEnrollmentOutcomeWorkSync.ts functions/src/canonical/courses/courseEnrollmentOutcomeWorkSync.test.ts functions/src/canonical/guestConfirmation/guestConfirmationWork.ts
git diff --cached
git commit -m 'fix(functions): ignore stale deleted sources in outcome work'

git add -- functions/scripts/data-reset functions/scripts/resetStagingBusinessData.cjs functions/scripts/resetProductionBusinessData.cjs functions/scripts/inspectStagingResetFence.cjs functions/src/maintenance functions/testSupport/dataResetLiveFixture.ts functions/testSupport/resetAuthorization.ts scripts/compareStagingResetRelease.mjs scripts/compareStagingResetRelease.test.mjs .github/workflows/ci.yml
git diff --cached
git commit -m 'feat(maintenance): add manifest-bound staging reset authorization'

git add -- docs/operations/data-reset-scope.example.json docs/operations/reusable-data-reset.md docs/operations/staging-data-reset-fence.md docs/operations/staging-live-fixture-reset.md docs/operations/staging-reset-operational-window.md docs/operations/staging-reset-release.md docs/operations/staging-reset-release-pr.md docs/operations/staging-reset-authorization.md
git diff --cached
git commit -m 'docs(operations): prepare separate staging release approvals'
git diff main...HEAD --stat
git push -u origin codex/reusable-data-reset
gh pr create --base main --head codex/reusable-data-reset --title 'Add manifest-bound staging reset authorization' --body-file docs/operations/staging-reset-release-pr.md
```

After future PR creation attach its URL to this task. PR checks are a separate gate:

```powershell
gh pr checks codex/reusable-data-reset --watch
# ONLY after a separate merge approval; never combine with deploy/reset:
gh pr merge codex/reusable-data-reset --squash
```

Required CI: all existing lint/i18n, app/shared-domain/Functions unit, build,
Functions emulator, integration/Rules and E2E jobs. New mandatory emulator step
starts Auth+Firestore+Storage, requires 20 ordinary reset, 4 LIVE reset, 8 authorization and 24
Guest Confirmation tests with zero skipped, and archives JSON/egress evidence.
The Functions emulator job budget rises from 20 to 35 minutes because this adds
a separate sequential rehearsal (local exact command took about nine minutes).
Comparator/network guard tests are mandatory in the existing Functions unit job.
Do not substitute old local PASS for exact-head GitHub CI.

Rollback A: before publication, review/correct staged files without resetting WIP.
After merge, separately approve `git revert <release-merge-sha>` and a revert PR;
this does not reverse a deployment or data reset. No destructive checkout/clean.

## B — Targeted staging Functions deploy (not executed)

Fresh read-only capture: `.scratch/staging-reset-release-20261019-fresh/`,
12:45:21–12:46:15Z, 101 registered artifacts, zero API errors. Collector wrapper
returns nonzero intentionally because evidence is not a fence certificate. Verify
`fence-report.json.errors=[]` and hashes; never infer diagnostic failure from the
intentional BLOCKED status alone. Seven jobs are ENABLED, 47 Functions, eight
Eventarc triggers and eight subscriptions. No production API was queried.

All five: GEN_2/nodejs22, us-central1, memory 256Mi, timeout 60s, service account
`1005648185457-compute@developer.gserviceaccount.com`. Four triggers: CPU 1,
maxInstances 10, concurrency 80, retry enabled. Scheduler Function: CPU 0.1666,
maxInstances 1, concurrency 1. Preserve both Functions and Run template/service caps.
Invoker IAM, ingress, environment values/secrets, runtime, build service account,
VPC, Scheduler OIDC identity/target/schedule/retry and Eventarc filters are unchanged
in source; actual post-deploy equality is a required gate, not assumed.

| Function                                      | Captured revision                                       |
| --------------------------------------------- | ------------------------------------------------------- |
| syncCourseEnrollmentOutcomeWork               | synccourseenrollmentoutcomework-00023-paf               |
| syncGuestBookingConfirmationWork              | syncguestbookingconfirmationwork-00007-har              |
| syncGuestEnrollmentConfirmationWork           | syncguestenrollmentconfirmationwork-00007-vor           |
| syncGuestPaymentConfirmationWork              | syncguestpaymentconfirmationwork-00007-ric              |
| scheduledReconcileGuestConfirmationMismatches | scheduledreconcileguestconfirmationmismatches-00024-wit |

GO: approved committed clean release checkout with exact provenance SHA; package A
CI/review PASS; re-captured baseline; approved package B only. Excluded WIP means
the current dirty checkout is **not** a deploy workspace. Use an isolated checkout
of the approved commit later; do not alter this workspace to make it clean.

```powershell
# In the future clean approved release checkout; keep these variables for B only.
$approvedReleaseSha = git rev-parse HEAD
if (git status --porcelain) { throw 'STOP: dirty deploy checkout' }
if ($approvedReleaseSha -notmatch '^[0-9a-f]{40}$') { throw 'STOP: invalid source SHA' }
node --use-system-ca functions/scripts/inspectStagingResetFence.cjs .scratch/reset-deploy-before
# Collector intentionally returns nonzero; inspect report/errors and hashes.
npm run build:functions
if ($LASTEXITCODE -ne 0) { throw 'STOP: Functions build' }
firebase deploy --project ski-school-staging --only "functions:syncCourseEnrollmentOutcomeWork,functions:syncGuestBookingConfirmationWork,functions:syncGuestEnrollmentConfirmationWork,functions:syncGuestPaymentConfirmationWork,functions:scheduledReconcileGuestConfirmationMismatches"
if ($LASTEXITCODE -ne 0) { throw 'STOP: partial deploy; no reset' }
node --use-system-ca functions/scripts/inspectStagingResetFence.cjs .scratch/reset-deploy-after
node scripts/compareStagingResetRelease.mjs .scratch/reset-deploy-before .scratch/reset-deploy-after $approvedReleaseSha
if ($LASTEXITCODE -ne 0) { throw 'STOP: revision/configuration/routing drift' }
```

The comparator verifies captured artifact hashes, target presence, new approved
clean commit labels, matching latestReady/latestCreated/Functions revision,
actual 100% traffic on each new revision, and unchanged other 42 revisions/IAM.
It rejects configuration drift across service caps/SA/env/ordered arguments,
Run persistent options, build options, Scheduler, Eventarc and subscriptions.
Conservative array-order differences may cause NO-GO; review evidence, never
bypass a failure. The older compareFunctionConfig CLI assumes 43 Functions/six
Eventarc triggers and must not be used to certify this 47/eight baseline.

Dependency order: five deploys may run concurrently; reset is forbidden until all
five are ACTIVE, ready and configuration-verified. Deploying the Scheduler export
may reconcile its job even with unchanged source options: compare saved job
configuration exactly. No new function, schedule, IAM policy, index, Rule, Hosting
or maintenance mode is requested. Jobs remain at their captured state in B.

Rollback B, only before reset: separately approve redeployment of the same five
exports from the verified pre-release source `e770656293ee1ad296a646d98f08f4ac42312842`
in a clean rollback checkout, then repeat before/after configuration verification
and require old-source provenance. Source comparison with captured deployed
commit c10038d4 shows no intervening selected handler/options changes; index
differences affect other callables/purge job, excluded from this deploy selector.
Do not use Cloud Run traffic edits as a Functions rollback shortcut.

```powershell
# FUTURE separate rollback approval, no reset may have started.
git worktree add --detach D:\SkiAcademy_DB-reset-rollback e770656293ee1ad296a646d98f08f4ac42312842
Set-Location D:\SkiAcademy_DB-reset-rollback
npm ci --ignore-scripts
npm ci --prefix functions --ignore-scripts
npm run build:functions
if ($LASTEXITCODE -ne 0) { throw 'STOP: rollback build' }
firebase deploy --project ski-school-staging --only "functions:syncCourseEnrollmentOutcomeWork,functions:syncGuestBookingConfirmationWork,functions:syncGuestEnrollmentConfirmationWork,functions:syncGuestPaymentConfirmationWork,functions:scheduledReconcileGuestConfirmationMismatches"
```

After reset starts, automatic source rollback is NO-GO: old handlers can recreate
deleted work. Keep the approved handlers/window, inspect journal, and approve a
data recovery or forward fix first. Code rollback never restores deleted history.

## C — Operational window / reset / separate bootstrap (currently NO-GO)

The [staging authorization adapter](staging-reset-authorization.md) now consistently
protects CLI, engine and transaction ports. It requires actual SDK ADC identity,
read-only preflight and separate interactive owner confirmations for reset and
bootstrap. A one-use capability expires within 15 minutes. A singleton Firestore
lease fences each transaction and retains bounded audit receipts. Full inventory,
hash/updateTime, checkpoint and original-manifest resume checks remain mandatory.
This is authorization under the accepted bounded-risk operational window; it does
not certify absence of external writers. Production remains hard-denied. No
manual Console/Admin SDK bypass or Scheduler operation is part of this adapter.
Cloud Storage deletes remain unsupported; this LIVE plan preserves every object.
Fresh v4 manifests are required. No cloud reset/bootstrap has occurred.

The [operational window](staging-reset-operational-window.md) supplies exact seven
job IDs and independent pause/resume commands. Save the complete fresh scheduler.json
before pause; restore only jobs whose saved state was ENABLED, never all jobs
blindly. Check that pause succeeded on each job; preserve partial-paused list on
failure. Pause/resume permissions do not authorize reset or bootstrap.

Fresh subscriptions: all eight ACTIVE; ack 600s, retry 10–600s, retention 86400s,
no DLQ configured. Config inventory does **not** observe backlog/drain. Before
apply wait at least 15 minutes after last observed writer/pause, then require two
complete observations at least three minutes apart: all eight undelivered/oldest
unacked metrics zero and no unexplained invocations/in-flight/Firestore operations/
leases/outbox deliveries. Missing/delayed telemetry or logging 429 means STOP or
an explicitly reviewed bounded exception, never a fabricated zero. Watch new
source/queue records and own-trigger effects through post-reset drain. Scheduler
pause does not stop accepted requests, retries, image-cache writes or external ADC.

Separate commands, from a future authorized checkout. The paths are examples for
new private artifacts and must not reuse an expired manifest (one-hour preview TTL).

```powershell
# C0 READ ONLY: fresh manifest and full typed recovery export, after observed drain.
New-Item -ItemType Directory .scratch/staging-reset-window
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --mode full-test-reset --scope .scratch/reset-live-20261019/scope-proposal.json --out .scratch/staging-reset-window/manifest.json --recovery-out .scratch/staging-reset-window/recovery.json
if ($LASTEXITCODE -ne 0) { throw 'STOP: inventory/blocker' }
# C1 FUTURE RESET approval must name this exact newly reviewed hash.
$windowManifest = Get-Content .scratch/staging-reset-window/manifest.json -Raw | ConvertFrom-Json
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --apply --manifest .scratch/staging-reset-window/manifest.json --confirm $windowManifest.sha256
if ($LASTEXITCODE -ne 0) { throw 'STOP: preserve window and journal; no bootstrap' }
```

**C1 requires its own interactive owner confirmation and verified SDK ADC identity.** The C0 scope is a private proposal
from the existing operator workstation; securely copy/review it in a future clean
checkout, never fabricate TEST scope or silently add new paths. Expected current
counts 1845 delete / 21 patch / 610 unchanged are a baseline, not authorization to accept
new rows. Changed document count/hash, new dependency/schema, frozen Course,
Auth/profile drift, Storage outage or unexplained writes require NO-GO/new review.

After C1 and observed own-event drain, compare the entire expected result:
610 retained original document hashes must match exactly; 21 retained patches
must match the manifested afterHash, plus the separately allowed reset journal.
Verify all five Auth UID/email/provider/claims/disabled/credential fingerprints
where exposed, all Account/role/access/Participant/config ownership unchanged,
zero KZT Wallet/event epoch with correct grants, revenue/capacity/revisions correct,
and zero orphan runtime references. Do not compare all631 to their original hash:
21 have explicitly approved field changes. Recheck empty activity globally.

Only after a separate C2 approval, invoke bootstrap on its own:

```powershell
# C2 separate approval: re-read original verified manifest, never rebuild after partial reset.
$windowManifest = Get-Content .scratch/staging-reset-window/manifest.json -Raw | ConvertFrom-Json
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --bootstrap --manifest .scratch/staging-reset-window/manifest.json --confirm $windowManifest.sha256
if ($LASTEXITCODE -ne 0) { throw 'STOP: no reopen/resume' }
```

C2 requires a new, separate interactive owner confirmation. Parser rejects --apply plus --bootstrap and bootstrap
requires a verified reset journal and transactional global empty guard. A shell
can sequence commands, so operator approval boundaries still matter; no claim that
software can prevent an operator from composing separate authorized commands.
No historical Attendance migration/backfill is part of C.

Acceptance: zero old Booking, linked Attendance, Booking/Enrollment outcome work
and stale money/outbox obligations; five Auth identities and retained projections
verified; transactional ready marker verifiedBookings=0/verifiedWorks=0; Scheduler
logs candidateSource=projection; separately approved canonical new LIVE Booking →
work → factual Attendance; no repeated old-event effects. Resume only saved-enabled
jobs after integrity/bootstrap checks; observe Scheduler output, then perform the
approved booking smoke and student/instructor/admin sign-in checks. Do not invoke
a scheduler manually merely to collect a log without explicit write permission.

Recovery C: full typed archive, manifest hashes, all retained identity/roles/profile
data and journal must be independently secured before mutation. Five actual critical
documents were restored twice on emulator with exact hashes. Staging does not
require permanent PITR for this test-data operation. The archive is not a consistent
cross-service managed backup or Auth password/Storage-byte backup; external sends,
deleted history without the archive and missing object bytes cannot be reconstructed
from hashes. Current plan deletes zero Storage objects. Lost archive means lost
test history. No complete cloud restore procedure is implemented/approved: if
resume cannot prove its exact journal state, keep jobs paused and approve recovery;
never recreate identities, automatically unpause, or run bootstrap to conceal failure.

## Current validation and remaining gates

Exact new CI emulator command: 47/47 PASS, wrapper exit 0, zero cloud egress. New release
comparator + existing comparator/egress tests: 19/19 PASS. Prior reset unit/build/
staging web build and independent source review remain as recorded in the LIVE
runbook. Those earlier checks are historical baseline results. The adapter slice additionally changes CLI/engine authorization and adds dedicated security/lease tests; final results are recorded below. Independent release review found comparator
traffic/target/persistent-field gaps; fixes have regression tests and focused
post-fix independent rereview PASS. Exact-head GitHub CI is NOT RUN.
Targeted ESLint with --no-ignore and diff check PASS. Graphify update PASS.

Server impact: five named Functions only; Hosting/Rules/Indexes NO; future data
migration/reset YES under C; Scheduler job redeploy reconciliation under B must
preserve configuration; seven pause/resume operations under C only. No IAM changes.
Authenticated cabinet browser workflow NOT VERIFIED. Production not queried.
Operational NO-GO: exact-head CI, deployment/window evidence and separate reset/bootstrap owner approvals are pending;
B/C actions remain unexecuted and require separate approval.

## Authorization adapter validation

Local validation: **PASS**. Reset/domain/authorization unit tests: 41 PASS;
comparator/network tests: 19 PASS. A new single complete emulator invocation after
the final ancestor-guard correction executed all 56 cases: **56/56 PASS, zero
skipped, wrapper exit 0** (about 8.5 minutes). No isolated rerun substitutes for this
release gate. The egress ledger records zero cloud Firestore attempts.
Exact-head GitHub CI remains a post-publication merge gate. All 8 checkout steps
are pinned to `github.event.pull_request.head.sha || github.sha`; the existing
Functions build runs before unit tests that consume compiled `functions/lib/`.
The owner requires all 9 workflow jobs, including `quality`, to succeed on the exact
PR head. The legacy branch-protection endpoint returns 404, but active repository ruleset 24159900 requires `Playwright E2E` and `quality`; all 9 jobs remain the release gate. This task does not change repository settings or enable auto-merge.
Functions build and app TypeScript PASS. Full lint exits 0: 95,008 existing
warnings, zero errors; final targeted lint and diff check PASS. Graphify update
PASS (structural code graph; current source remains authority).
Actual read-only ADC verification PASS: Admin credential, pinned Firestore
GoogleAuth and Storage authClient introspected to one Google principal; evidence
contains only its SHA-256 fingerprint. No data inventory or cloud mutation was
performed by that check. This does not verify staging IAM permissions for writes.
AUTHENTICATED WORKFLOW: NOT VERIFIED (cloud reset/bootstrap and cabinet UI).
Review covered all 30 baseline release paths and the six adapter additions. Three
findings were fixed: mandatory authorization emulator CI coverage, durable
approval history, and read-only bootstrap verification (no scheduler invocation).
Independent review and focused rereviews of checkpoint revisions, one-use invocation, read-only bootstrap and expected-ancestor guard: PASS, no remaining actionable finding.
The three excluded Attendance WIP paths remain outside the proposed staging commands.
Package A publication is separately authorized after these local checks; resulting commit/PR/CI identities are recorded in GitHub and the final report. Merge, deploy, cloud mutations, reset/bootstrap and Scheduler changes remain forbidden.

Production CLI apply and bootstrap hard-deny were executed locally against
nonexistent input/ADC paths: both rejected before input/credential access and
before any cloud call. Cloud fake-IO prompt injection for reset and bootstrap is
covered inside the existing 41-unit-test gate; no production path auto-answers.
Independent final security and focused CI checkout/build-order review PASS.
All 36 release paths were checked; all three excluded historical WIP SHA-256 values
match the original index. No Firebase/IAM resource configuration changes or private
credentials/manifests/recovery exports/logs are release inputs.
