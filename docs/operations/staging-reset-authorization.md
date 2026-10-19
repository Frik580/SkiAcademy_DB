# Staging reset authorization adapter

Scope: `ski-school-staging`, Firestore `(default)`, bucket
`ski-school-staging.firebasestorage.app`. Production mutations are hard-denied
before SDK initialization; no force flag, environment assertion or approval can
unlock production. Demo loopback targets exist only for hermetic rehearsals.
No cloud action, deployment, Scheduler change or Git publication is authorized by
this document. The owner separately approves each future operation.

## Trust and approval

The owner chose terminal confirmation without KMS. The Google operator identity
is checked using tokens from the actual Admin credential, pinned Firestore
GoogleAuth and Storage authClient. All three must introspect to the same verified
Google subject/email. Token refresh to a different principal fails. Google ADC is
[distinct from gcloud CLI credentials](https://cloud.google.com/docs/authentication/application-default-credentials);
the implementation uses Google's
[token introspection endpoint](https://cloud.google.com/docs/authentication/token-types).
No access token, credential, email, document contents or raw subject is printed
in authorization evidence. The operator is recorded as a SHA-256 fingerprint.
Unverifiable tokens (including missing email verification) fail closed.

The human owner must be present at the operator's terminal and check the private
manifest, recovery archive and operational window. The operator may be the owner
or Codex using verified ADC. TTY presence and the exact typed ownership statement
are an explicit human attestation, not cryptographic proof of the human's identity.
There is no offline bearer token, `--yes`, pipeline approval or environment unlock.
Codex must not type the statement on the owner's behalf without separate explicit
authorization. A malicious privileged process can modify local code or write
directly with its IAM rights; this CLI does not revoke those rights.

Read-only preflight displays project/database, reset versus bootstrap, manifest
SHA-256, plan digest, current document count, checkpoint and approved changes
(kind/collection/path digest/before and after hashes/field names). Use the secured
private manifest to resolve digests to exact paths. It contains personal data and
must not be pasted into logs or committed. Bootstrap lists its marker/journal
changes separately from the original approved reset plan.

On an apply invocation the CLI repeats preflight, then asks for this exact line:

```text
OWNER APPROVES <reset|bootstrap> ski-school-staging (default) <manifest-sha256> <plan-sha256>
```

Typing confirms the independently reviewed recovery baseline, pause/drain checks,
no-use commitment and acceptance of bounded external-writer risk. The deadline
starts when the prompt opens and expires after 15 minutes. After confirmation,
manifest file, full preflight and journal fingerprint are checked again. The
in-process capability permits one engine invocation for exactly one operation,
target, manifest and plan. Failure/resume needs fresh owner confirmation.
No confirmation transfers from reset to bootstrap.

## Lease, drift and recovery

`system_data_resets/staging_authorization_v1` is a singleton transactional lease.
Every engine/bootstrap transaction reads it before writing. Session ID, operator,
operation, plan/manifest and expiry must match. Transaction read time is checked
along with the local clock. A stale holder conflicts with replacement of the lock;
an expired lease cannot be renewed by the old capability. Normal exit releases
only its own lock; a crash leaves it held until expiry. The capability cannot be
reused even if execution failed before its first business write.

The lease retains up to 100 non-PII session receipts, including checkpoint/journal
fingerprint and approval/expiry times. At capacity it stops for an independently
reviewed archive/recovery step; it never silently drops audit history. This fixed
metadata document is excluded from business inventory; unrelated journals and all
other documents remain part of drift checks. It is not an application writer fence.

A different manifest cannot replace an unfinished reset: the original journal
must be bootstrapped (or verified for an activity-only reset). Resume uses the
original v4 manifest and checkpoint, never a new inventory that legitimizes drift.
v1-v3 manifests need a new preview before starting; no cloud v1-v3 reset was enabled.
Missing applied revision evidence blocks authorized resume.

Cloud batches contain at most 100 manifest actions plus one journal update. Each
batch gets a fresh full bounded Firestore/Auth/Storage inventory, checks hashes,
counts, ancestors and unchanged document update times, then rechecks authorization.
Within the transaction all target hashes/update times and checkpoint are checked;
new update times for patched/created documents are recorded atomically with the
checkpoint. Final verification must match the complete expected state.

The existing inventory is a finite recursive full scan: at most 10,000 document
references and 5,000 metadata requests, pages of 100 and concurrency 4; Auth pages
of 1,000 with the same user cap. Scans occur during preflight, after confirmation,
at start/resume, before each cloud batch and at completion; there is no polling,
scheduler or background full drain. Full scans are deliberate operator costs.
The adapter currently rejects any cloud Storage deletion: the approved LIVE
fixture plan preserves all 27 objects. Emulator Storage saga/recovery stays intact.

External writers are still possible between inventory checks, including new
dependencies after a scan. A failed later check may leave earlier batches committed.
The lease is neither a global atomic reset nor proof of writer isolation. Keep the
approved operational window, observed drain, known retry-safe handler revisions
and recovery artifacts through final verification. Do not resume jobs on failure.

Bootstrap requires the verified reset journal and global empty activity checks.
The existing canonical transaction rechecks zero Booking and zero work before
publishing readiness, under the same lease. Subsequent verification is read-only;
it never invokes the Attendance scheduler to prove readiness. New factual
Booking → work → Attendance acceptance is a separate canonical smoke operation.
Cloud restore remains separately authorized and unimplemented by this adapter.

## Future PowerShell commands — do not run without the separate permissions

Use a clean approved release checkout for deployments and the private operational
artifacts for reset. No ADC login or identity change is performed automatically.
ADC must expose a verified subject/email and have required staging IAM permissions;
failure to identify any actual SDK client is a STOP, not a reason to substitute
`gcloud auth list` or claim an identity from an environment variable.

```powershell
# READ ONLY: fresh v4 manifest/recovery after the approved pause/drain procedure.
New-Item -ItemType Directory .scratch/staging-reset-authorized-window
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --mode full-test-reset --scope .scratch/reset-live-20261019/scope-proposal.json --out .scratch/staging-reset-authorized-window/manifest.json --recovery-out .scratch/staging-reset-authorized-window/recovery.json
if ($LASTEXITCODE -ne 0) { throw 'STOP: dry-run failed' }
$resetManifest = Get-Content .scratch/staging-reset-authorized-window/manifest.json -Raw | ConvertFrom-Json

# READ ONLY: review exact reset plan and operator identity fingerprint.
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --preflight --operation reset --manifest .scratch/staging-reset-authorized-window/manifest.json --confirm $resetManifest.sha256
if ($LASTEXITCODE -ne 0) { throw 'STOP: preflight failed' }

# FUTURE RESET ONLY, after separate owner permission; prompts interactively.
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --apply --manifest .scratch/staging-reset-authorized-window/manifest.json --confirm $resetManifest.sha256
if ($LASTEXITCODE -ne 0) { throw 'STOP: preserve journal/window; no bootstrap' }

# Resume is the SAME reset command/original manifest, with NEW confirmation.
# Never regenerate a manifest after a partial reset to accept changed documents.

# READ ONLY, after reset/drain verification; fails if reset is not complete.
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --preflight --operation bootstrap --manifest .scratch/staging-reset-authorized-window/manifest.json --confirm $resetManifest.sha256
if ($LASTEXITCODE -ne 0) { throw 'STOP: bootstrap preflight failed' }

# FUTURE BOOTSTRAP ONLY, after a separate LATER permission; new prompt.
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --bootstrap --manifest .scratch/staging-reset-authorized-window/manifest.json --confirm $resetManifest.sha256
if ($LASTEXITCODE -ne 0) { throw 'STOP: do not reopen writers' }
```

Approval order: exact release diff/review → commit/PR publication permission → CI
on exact PR head → merge permission → separately approved five-Function staging
deploy/config comparison → separate Scheduler/window approval → secured fresh
manifest/recovery and owner reset confirmation → verified reset/own-event drain →
separate bootstrap confirmation → acceptance checks and separately approved resume.
See [release sequence](staging-reset-release.md) and
[operational window](staging-reset-operational-window.md) for exact deployment and
seven saved-state Scheduler commands. Neither is executed by the reset CLI.

## Changed files in this adapter slice

| Disposition           | Paths                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Added adapter         | `functions/scripts/data-reset/authorization.cjs`, `functions/scripts/data-reset/adcIdentity.cjs`                                                                                                                                    |
| Added tests/support   | `functions/src/maintenance/dataResetAuthorization.test.ts`, `functions/src/maintenance/dataResetAuthorization.emulator.test.ts`, `functions/testSupport/resetAuthorization.ts`                                                      |
| Updated runner        | `functions/scripts/data-reset/cli.cjs`, `functions/scripts/data-reset/engine.cjs`, `functions/scripts/data-reset/policy.cjs` (comment only)                                                                                         |
| Updated acceptance/CI | `functions/src/maintenance/dataResetLiveFixtures.emulator.test.ts`, `.github/workflows/ci.yml`                                                                                                                                      |
| Added runbook         | `docs/operations/staging-reset-authorization.md`                                                                                                                                                                                    |
| Updated existing docs | `docs/operations/staging-reset-release.md`, `docs/operations/staging-reset-release-pr.md`, `docs/operations/staging-live-fixture-reset.md`, `docs/operations/reusable-data-reset.md`, `docs/operations/staging-data-reset-fence.md` |

The other original release paths retain their existing WIP. All 36 release paths
were independently reviewed. Preserve and exclude exactly these three historical
WIP paths: `docs/operations/staging-attendance-migration.md`,
`docs/operations/staging-attendance-no-deny-fence.md`, and
`scripts/stagingAttendanceReadiness.mjs`. Never stage private recovery/test evidence,
graph outputs or debug logs. Git publication requires separate owner permission; merge and all cloud actions remain separately gated.

## Validation and remaining infrastructure limits

41 unit and 19 comparator/network tests PASS. The final complete emulator run
after the ancestor fix: **56/56 PASS, zero skipped, wrapper exit 0**. A focused
rerun is not used in place of the full gate. The CI step requires all 56 on the
exact PR head with zero skips, and all 8 checkout steps explicitly pin that head.
Functions build, app TypeScript, lint, targeted lint, structural Graphify update and
independent review/focused rereviews PASS. Production CLI apply/bootstrap deny
before input/credential access; injected cloud test IO is denied before output.

Prior implementation-slice read-only ADC verification PASS for all three SDK clients on this workstation,
with only a principal digest saved privately. No cloud write-IAM check, reset,
bootstrap, deployment, Scheduler change or authenticated cabinet workflow ran.
Owner identity remains a human terminal attestation. External writers remain an
operational risk; full scans plus batch checkpoints do not make an atomic reset.
A failed bootstrap can leave a valid ready marker while its journal remains
verified; keep the window closed and investigate instead of masking drift.
Cloud Storage deletes and cloud restore are unsupported. Audit history stops at
100 approvals pending reviewed archival. No permanent staging PITR is assumed.
