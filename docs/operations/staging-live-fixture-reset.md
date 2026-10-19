# Staging LIVE fixture reset — data contract v3

Verdict: **BLOCKED for cloud execution**. Data adapters and local rehearsal are
prepared; staging cloud apply/bootstrap now require the [terminal authorization adapter](staging-reset-authorization.md), verified SDK ADC and separate owner confirmations. Operational deployment/window gates remain pending. Production is excluded.
No cloud reset, bootstrap, historical Attendance migration, deploy, Scheduler/IAM/
Rules changes, commit, push or merge was performed. Existing WIP is preserved.

The owner's October 19 decision classifies the old Booking and Enrollment in
ski-school-staging as disposable test history even though their stored scope is
LIVE. This document supersedes the earlier unsupported-LIVE-data findings in
[the operational window](staging-reset-operational-window.md). Its pause/drain/
approval procedure and production restrictions still apply.

## Strict contract

The existing activity-reset/full-test-reset modes remain. The scope JSON may now
contain `"contract": "staging-live-fixtures-v1"`, exact Account/Participant IDs,
`"testSessionIds": []`, exact document path/SHA-256 entries and exact Storage
generation/hash entries. Only ski-school-staging is eligible; demo projects are
permitted only for the existing loopback-only emulator rehearsal. Production and
other cloud projects are rejected. Nothing changes dataScope or ordinary canonical
authorization, Account identity or scope validation.

Every current old Booking/Enrollment root must be explicitly selected and parsed
with its canonical schema. The selected Account set must equal the complete Auth/
Account universe. Linked activity closes through operation/payment/command IDs,
not through a shared Course or Account ID. A path-shape allowlist alone does not
authorize deletion. Unknown schema, mixed ownership, omitted roots, stale hashes
or unknown dependencies stop the plan. Runtime FKs inside audit maps are checked;
only canonical command/correlation provenance fields are historical attribution.

Shared resource claims/guards use typed `(ownerKind, ownerId)` relationships.
Configuration reservations are preserved even if IDs collide with Booking IDs.
Mixed guards remove only selected claim entries; catalog/day reservations remain.
Pre-start Course capacity is recomputed from retained pending/confirmed/
pending_cancellation Enrollments. A started/completed Course blocks Enrollment
deletion; frozen capacity is never changed. The runtime/server-time freeze guard
also applies during resume.

## Exact current classification

Source: complete read-only staging snapshot, **2476 existing documents**, three
missing parent paths with children, five Auth identities and 27 Storage objects.
The latest private typed archive is
`.scratch/reset-live-20261019/final-review/recovery.json`, captured at
2026-10-19T12:27:52.583Z. Its canonical SHA-256 is
`1d51bb66ce8cf7484fa9a205a0b2af5d8972d2bcf2309014b8f71686545f2c02`.
The archive includes original Firestore values/types, retained profiles/roles/
configuration, all removed history and Auth fingerprints. It contains private
business data and is ignored by Git.

**1845 existing documents are selected for deletion; 631 are retained, including
21 exact patches and 610 unchanged documents.** No Storage object is selected for
deletion. Counts exclude the new reset journal and later bootstrap marker.
They are a reviewed proposal, not an executed cleanup. Refresh/review inside the
approved window; any drift requires a new manifest, not edited confirmations.

| Existing document family                                         |   Delete |  Patch | Keep unchanged |
| ---------------------------------------------------------------- | -------: | -----: | -------------: |
| Booking / nested messages                                        |       53 |      0 |              0 |
| Attendance / Booking outcome work                                |      137 |      0 |              0 |
| Enrollment / outcome work / active guards / chat access          |       33 |      0 |              0 |
| Payment / MonetaryEvent                                          |      135 |      0 |              0 |
| Resource claims / guards                                         |      769 |      0 |             70 |
| Activity logs / command idempotency                              |      505 |      0 |            140 |
| Outbox / Admin Issues / Booking change requests / guest contacts |      133 |      0 |              0 |
| Progress / achievements / progress events / lesson feedback      |       17 |      0 |              0 |
| Instructor reviews / rating summaries / revenue contributions    |       62 |      0 |              0 |
| Error logs                                                       |        1 |      0 |            320 |
| Fixture provenance manifest                                      |        0 |      1 |              0 |
| Account/User + Wallet + starter-grant documents                  |        0 |      8 |              7 |
| Course / CourseDay configuration                                 |        0 |      3 |             11 |
| Shared admin runtime / instructor revenue namespace              |        0 |      9 |              2 |
| Participant / ownership / Instructor / remaining configuration   |        0 |      0 |             60 |
| **Total**                                                        | **1845** | **21** |        **610** |

The per-path authoritative proposal is in `.scratch/reset-live-20261019/`:
`classification.json` (all 2476 paths/hashes/decisions), `manifest-proposal.json`
(exact actions and hashes), `scope-proposal.json` (explicit targets). The final
read-only CLI refresh is stored separately under `final-review/`; never mix hashes
from distinct captures. Operator manifests expire after one hour.

`final-review/reviewed-manifest.json` is regenerated locally from that fresh typed
archive with the current source, including contribution-first deletion ordering.
Canonical manifest SHA-256:
`e6bd4bb53020fe3514d6f3b6e7a96947e8e159c432ac185f67e789ad3acfcd62`.
Its file-byte SHA-256 is
`c41a74dce35ad59e9092bbc1479adad2ba4751c5441c0f1419879c5e9efaaf4f`;
the recovery file-byte SHA-256 is
`2d8478e8211508a7a8b81110fe351cd58e33ed2442b9133de704394b72a93d9a`.
`final-review/evidence.json` records both kinds of hash. The earlier CLI-captured
manifest has a different canonical hash because it predates that ordering fix;
it is capture evidence, not the current reviewed execution proposal.

### The 322 review documents

All **321 error_logs** pass the known client-error schema, including owner/anonymous
identity, date and string-only fields. References are checked even when embedded
inside logged JSON/text. **One** references an approved deleted Booking and is
deleted; **320** have no proven operation relationship and are preserved. Log text
is not a general authority to expand deletion scope. Full per-record owner/type/
entity-reference decisions are in `manifest.fixtureClassification`.

The one `staging_fixture_manifests/carve_academy_staging_v2` is valid staging seed
provenance. It is **patched**, not removed: four obsolete operation-ownership paths
are removed from ownedFirestorePaths, while 18 retained identity/configuration
paths, authUids and storagePrefixes remain. Mixed claim ownership is filtered
similarly if present. The old fixture seed/reset CLI expects its original complete
plan and will fail closed after this maintenance patch; it must not be used to
reseed or recover this new empty state without a separate reviewed plan.

Three additional source-verified historical progress activity records are handled
explicitly: level/skill events with strict field/owner/number/date validation.
Full reset deletes them; activity-reset preserves them and schema-verified progress.
Other historical schemas remain unsupported and block the plan.

### The five starter_credit_grant documents

Each marker has the canonical granted/amountKzt/grantedAt shape, belongs to one
of the five retained Accounts and has one corresponding system wallet_credit
event. The event and old wallet ledger epoch are removed; the Wallet is patched
to balance=0/eventRevision=0 with an increased revision. **All five granted=true
markers remain byte-for-byte unchanged.** They are lifetime consumption barriers,
not current balance projections. Their old amount is preserved provenance.

The existing canonical grant_starter_credit command reads the marker first and
does not credit again, even with a new idempotency key. Emulator rehearsal invokes
it for all five Accounts after reset: all succeed without money events or balance
increases. New approved funding/Booking continues through canonical commands in KZT.
No fake offsetting money events or legacy balance writes are introduced.

### The 20 image-cache objects

Metadata sourceUrl/width/quality/contentType and the SHA-256-derived filename match
the existing public catalog image proxy. **All 20 are preserved**: seven have
references from retained resort/course catalog resources; 13 have no current
Firestore reference, which does not prove exclusive ownership by removed history.
Their public cache provenance is known; no name-based cache purge is permitted.
Per-object generation/hash/source/reference lists are in manifest.storage.classification.
The other seven permanent avatar/instructor objects are also retained.

The Storage saga still uses exact generations, durable intent/checkpoint and
conditional deletion for genuinely disposable TEST booking media. Existing emulator
tests cover outage, drift, lost response after deletion and resume. This LIVE plan
has zero Storage deletes, so there is no cross-service byte deletion to roll back.

## Recovery without permanent staging backup/PITR

`--recovery-out NEW_PATH` writes a complete typed local archive using exclusive
create, with a canonical SHA-256. No permanent backup/PITR is required for this
staging operation. Production receives no such exception and cannot use this contract.

`recovery.cjs` validates the archive and can restore **only emulator** documents:
exact paths, maximum 100, a single transaction, no overwrite of changed documents,
and no Auth writes. Tests restore Account, Participant, Wallet, starter marker and
the corresponding monetary event, compare hashes, repeat the restore, and reject
conflicting or production targets. Larger/local source archives are evidence;
cloud restore remains a separate authorized recovery operation.

The archive is not a Firebase managed backup, consistent cross-service snapshot,
Storage-byte backup, or Auth password backup. Without the archive/another backup,
deleted test transaction history cannot be reconstructed from its hashes. Full
cloud restore and external side-effect rollback are not rehearsed. No object bytes
are being deleted in this plan. Preserve the archive, exact manifest and journal
through the whole maintenance window; do not recreate Auth identities.

## Own events and Attendance acceptance

Revenue contributions are deleted in phase -1 **before** source Booking/Payment
deletion. Their collection has no deployed source trigger; subsequent source
delete handlers see no contribution and do not race the manifested sum/revision
rebuild. Emulator tests execute actual delete handlers between journal steps,
inject a failure, resume, and replay old events after completion.

Enrollment work sync now ignores stale afterData when the current Enrollment is
missing. Before every work write it transactionally rechecks current source/work,
preventing deletion between planning reads and commit from recreating work. This
is a correctness fix, not a lifecycle change or new maintenance mode. It requires
a separately authorized deployment of **syncCourseEnrollmentOutcomeWork** before
claiming the deployed handler has this protection; no deployment happened here.

The interleaved deletion rehearsal also exposed Guest Confirmation synthesizing
blocked work from a delayed event after an authority was deleted. New work is now
ignored when either authority is absent; existing obligations still fail closed,
and malformed existing sources retain their original handling. The transaction
reads sources and work before writing, so concurrent deletion retries the check.
This also requires separately approved deployment/verification of
**syncGuestBookingConfirmationWork**, **syncGuestEnrollmentConfirmationWork** and
**syncGuestPaymentConfirmationWork**. None was deployed.
The changed helper is also reached by
**scheduledReconcileGuestConfirmationMismatches** through the scheduler/recovery
path; future deployment scope must include this export as well.
The captured LIVE inventory contains no existing Guest Confirmation work. This
contract deliberately rejects such records; supporting them later requires a
separate adapter and work-before-authority deletion ordering, rather than letting
delete handlers mutate a later exact-hash target. Ordinary TEST behavior is unchanged.

After future reset, global Booking, Attendance, Booking work, Enrollment/work,
Payment, outbox and confirmation work must be empty; retained fingerprints,
financial state and runtime references must match the exact expected result.
Then separately invoke the existing transactional empty guard: verifiedBookings=0,
verifiedWorks=0, ready marker, and actual candidateSource=projection. No historical
Attendance backfill/migration is run. The emulator then performs a fresh LIVE
Booking → work → factual Attendance → completed Booking. Old Booking/Payment/
Enrollment/outbox events must not recreate activity or repeat delivery/money effects.

## Prepared PowerShell commands

From `D:\SkiAcademy_DB`. Scope proposal and current hashes require review; a future
window must create new private output paths and a fresh manifest.

```powershell
# READ ONLY: new inventory, manifest and full local recovery archive.
New-Item -ItemType Directory -Path .scratch/staging-live-approved-window
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --mode full-test-reset --scope .scratch/reset-live-20261019/scope-proposal.json --out .scratch/staging-live-approved-window/manifest.json --recovery-out .scratch/staging-live-approved-window/recovery.json
if ($LASTEXITCODE -ne 0) { throw 'STOP: blocked/incomplete dry-run' }

# FUTURE RESET: separate approval of the fresh exact manifest.
$liveResetManifest = Get-Content .scratch/staging-live-approved-window/manifest.json -Raw | ConvertFrom-Json
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --apply --manifest .scratch/staging-live-approved-window/manifest.json --confirm $liveResetManifest.sha256
if ($LASTEXITCODE -ne 0) { throw 'STOP: preserve journal/window; no bootstrap' }

# FUTURE EMPTY BOOTSTRAP: separate later approval, only after verified reset/drain.
node --use-system-ca functions/scripts/resetStagingBusinessData.cjs --project ski-school-staging --database '(default)' --bucket ski-school-staging.firebasestorage.app --bootstrap --manifest .scratch/staging-live-approved-window/manifest.json --confirm $liveResetManifest.sha256
if ($LASTEXITCODE -ne 0) { throw 'STOP: do not reopen writers' }
```

**The future cloud mutation commands require separate interactive owner confirmations.** The staging-only adapter checks actual SDK ADC identity, fresh v4 manifest/preflight and a transactional lease. Non-TTY invocation, production, drift, expired or reused authorization fails closed. See the [authorization procedure](staging-reset-authorization.md) for read-only preflight commands and exact confirmation contract; this document does not grant execution permission.

Follow [the seven exact Scheduler pause/resume commands and observed drain procedure](staging-reset-operational-window.md).
No new IAM deny/maintenance system or absolute external-writer proof is required.
Owner no-use commitment bounds known human/test activity; it does not stop timers,
admitted requests/uploads, public image proxy cache writes, retries or credential
use elsewhere. Zero queue samples are delayed observations. Repeat all checks
inside the approved window; new records, stale hashes, leases, backlog, active
operations, unexpected trigger effects, unknown schemas, profile/Auth drift or
failed verification are STOP conditions. Never weaken scope checks or silently
recompute a partial-reset manifest to accept unexpected writes.

## Validation / remaining execution blockers

Validation: 31 unit tests PASS; 27 final emulator tests PASS (3 LIVE reset and 24
Guest Confirmation regression), including actual delete handlers interleaved with
failure/resume and old outbox replay. Earlier ordinary reset emulator: 20 PASS.
All emulator wrappers exited 0 and test egress ledgers report zero cloud attempts.
Five real critical documents from the fresh staging archive were also restored
to the demo emulator, hashes matched, repeated restore passed, Auth writes=0;
private proof: `final-review/restore-proof.json`.
Functions build/TypeScript and staging web build PASS. Full lint exits 0 with
95008 existing warnings and zero errors; targeted lint PASS. Independent focused
review and diff check PASS. Graphify update PASS; current source remains authority.
Cloud browser sign-in is NOT VERIFIED; five preserved sign-ins are verified only
on emulator. Admin/instructor/student read-model consistency is checked through
domain/projection tests; authenticated cabinet browser workflows are NOT VERIFIED.

Remaining: the new staging authorization adapter needs exact-head release CI and actual operator identity/window verification; the new
Enrollment/Guest Confirmation trigger protections are not deployed/verified against the deployed build;
the approved window, paused jobs, current in-flight/backlog observations and final
fresh manifest confirmation have not occurred. These are execution gates, not
unresolved ownership classification or a demand for absolute writer isolation.

Deployment impact of the source corrections (not deployed): Functions
`syncCourseEnrollmentOutcomeWork`, `syncGuestBookingConfirmationWork`,
`syncGuestEnrollmentConfirmationWork`, `syncGuestPaymentConfirmationWork`,
`scheduledReconcileGuestConfirmationMismatches`.
Hosting/Rules/Indexes: NO. Future data reset/bootstrap: YES, separately approved.
Settings/manual: operational window and recovery artifacts. Schedulers: the seven
listed in the operational procedure, pause/resume only after separate permission.

## Authorization adapter release validation

Source: READY FOR PR APPROVAL; execution remains separately gated. Current
validation and exact release sequence are in [the release plan](staging-reset-release.md).
Actual read-only verification of all three SDK ADC identities PASS (same Google
principal, only hashed evidence). Forty-one unit and 19 comparator/network tests
PASS. Final complete emulator run after the ancestor fix: **56/56 PASS, zero skipped, wrapper exit 0**, including authorized LIVE Booking → work → Attendance. Exact-head CI must repeat the complete gate after PR publication; no isolated rerun substitutes for it.
Functions build, app TypeScript, lint and independent review/rereviews PASS.
No cloud apply/bootstrap, write-IAM verification, deploy or Scheduler action ran.
