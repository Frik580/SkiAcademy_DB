# H2 — final dependency validation, 2026-10-28

Branch: `codex/h2-production-dependency-security`. Base: `1e7ca6f093e2b7ffa27a93fd74679726965ad970`.
This report supersedes the validation/status sections of [the initial remediation report](h2-production-dependency-remediation.md).

## H2 VERDICT: PARTIAL

All required emulator runs passed. H2 is ready for a **draft PR with an explicit deployment-parity gate**,
not an unconditional H2-ready declaration. Declared options and offline effective configuration are compared;
literal CLI payloads differ, and live prepare, real env/Secret-version resolution and post-deploy parity are not certified.

No business logic, package versions, cloud configuration or application data were changed in this continuation.
No commit, push, deploy or merge was performed. Cloud requests were read-only operational metadata requests;
secret payloads were not requested and environment values were not exported.

## Production audit results

All four commands were repeated against npm registry on October 28. TLS verification remained enabled.

| Audit | Critical | High | Moderate | Command result |
| --- | ---: | ---: | ---: | --- |
| Root, full | 0 | 0 | 5 | exit 1, expected residual dev findings |
| Root, `--omit=dev` | 0 | 0 | 0 | PASS, exit 0 |
| Functions, full | 0 | 0 | 0 | PASS, exit 0 |
| Functions, `--omit=dev` | 0 | 0 | 0 | PASS, exit 0 |

Raw registry responses: [fresh evidence](h2-2026-10-28/).

## Full emulator suite and final checks

Authoritative commands are the two `functions-emulator` groups in `.github/workflows/ci.yml`.
Environment: native Windows outside the process-restricted sandbox, Node 22.23.2, npm 10.9.8,
Temurin Java 21. Demo project `demo-ski-school-e2e`; only Auth, Firestore and Storage emulators,
without background Functions triggers. CI memory/CPU settings were retained:
Java `-Xms512m -Xmx2g -XX:ActiveProcessorCount=2`, Node heap 3072 MB, one test worker and sequential files.
Ubuntu execution itself is not claimed.

| Check | Result |
| --- | --- |
| Full main Functions emulator group | PASS — 57 files, 550/550 tests, zero skipped; 2403.36 s; wrapper exit 0 |
| Full reset/authorization group | PASS — 4 files, 56/56 tests, zero skipped; 473.41 s; wrapper exit 0 |
| Attendance migration CLI guard | PASS — 18, including actual CLI twice and explicit cutover |
| Attendance commands | PASS — 30 |
| Guest confirmation | PASS — all 24 in both complete groups |
| `bookingChatMedia` | PASS — all 32 media regressions |
| TEST/LIVE isolation | PASS — domain isolation 3, lifecycle/reset/delete 8; zero skipped |
| Firestore cloud egress | PASS — 0 attempts across all 235 ledgers, including both complete emulator groups |
| Full app coverage, final rerun | PASS — 363 files, 2965/2965 tests, zero skipped, exit 0; coverage thresholds unchanged |
| Functions unit tests | PASS — 130 files, 1489/1489 |
| Shared-domain unit tests | PASS — 50 files, 370/370 |
| Configuration, provenance and egress guards | PASS — 25/25 |
| Functions build | PASS |
| Production and staging builds | PASS; existing bundle-size/annotation warnings |
| Changed executable/config ESLint | PASS — zero errors/warnings; ignored `.mjs` test separately exercised by Node tests |
| Independent code review | PASS; includes fixture, timeout, snapshot and CI budget changes |
| Graphify | PASS — code graph refreshed once; semantic report refresh not claimed |
| Final diff check / task emulator cleanup | PASS — `git diff --check`; all task emulator ports closed |
| GitHub CI execution | NOT RUN for this uncommitted diff |
| Full Playwright / published staging workflow | NOT RUN in this continuation |

AUTHENTICATED WORKFLOW: NOT VERIFIED for the published staging client.

The two groups cover all **58 unique emulator files and 558 unique tests** (606 executions including repeated
reset/guest rehearsals). Both JSON reports have `success:true`, no failed/pending assertions and wrapper exit 0.
The actual CI result guards were extracted from YAML and executed, including the real migration-CLI and parallel
authorization/resume test-title guards. [Complete reports and guard output](h2-2026-10-28/).
The 47m56.77s combined test duration exceeds the previous 45-minute job budget before setup, so CI now allows 60 minutes.

The initial sandbox attempt failed before tests because the emulator hub could not open loopback port 4400.
Sandbox Vitest temp renames and temporary clone writes also produced EPERM/permission failures. These were
rerun outside the sandbox; they are not counted as product failures or successful tests.

The first full app coverage run had 2963 passing tests and two real 5000 ms timeout failures:
ESLint cold configuration loading (8.98 s) and the two-hour fake-clock scenario (6.29 s).
Only the positive ESLint public-subpath group and that clock scenario now have explicit 30-second budgets.
All assertions, timer cleanup and the global default remain intact. The complete coverage rerun passed;
the separate 56-test diagnostic rerun is not used as its substitute.

## Firebase CLI operational comparison

Compared CLI **13.35.1 → 15.34.1**, SDK **5.1.1 → 7.3.0**, against the saved baseline and fresh
read-only staging/production Functions, Scheduler, Eventarc and Cloud Run service/IAM inventories.
The old CLI was loaded from the existing local Node 22 baseline checkout; no package update was needed.

[Deployment evidence](h2-2026-10-28/deployment-parity.json) records all 50 per-Function rows.

| Field | Before/after dependency change and inventory result |
| --- | --- |
| Source export set | PASS — the same 50 SDK endpoints; discovery manifest equal |
| Runtime | Source remains `nodejs22`; staging 50 × Node 22; production still 43 × Node 20 |
| `maxInstances` / `maxInstanceCount` | PASS — 50 numerical caps; **zero null maxInstanceCount**; serialized limits asserted |
| `minInstances` | Unchanged reset-to-default declarations; effective zero matches inventories |
| Memory / timeout / concurrency / CPU | Unchanged; offline effective values match staging and existing production Functions |
| Function region | All 50 resolve to `us-central1` under both CLI paths |
| IAM / invoker | Declarations unchanged; direct Cloud Run IAM read for all 50/43 services; HTTPS/Scheduler checks 42/37 match |
| Secrets | Same 33 source references; staging matches; 25 existing production Functions lack the current source reference |
| Environment | Old/new local dotenv parsing returns no user variables; Firebase-generated env comparison equal; CLI adds `FUNCTION_REGION` |
| Eventarc | Fresh inventory: staging 8, production 6, in `eur3`; source filters/retry declarations unchanged and observed filters match |
| Scheduler | Seven jobs per environment; schedules, time zones and account fixtures match; deadline serializer difference below |

The Functions API omits caps for three production read models (`queryOutboxDeadLetterReadModel`,
`queryParticipantOccupancyReadModels`, `queryEmailDeliverySettingsReadModel`); their Cloud Run service caps are
explicitly 20. This response omission is not a null limit in the generated deployment payload.

The real CLI default changed from `us-central1` to `REGION_TBD`. The original wire helper explicitly supplied
`us-central1`, so that helper alone could not prove deployment-region parity. Additional offline checks use each CLI's
actual default, the new region resolver, existing endpoints and a Firestore database-location fixture `eur3`, inferred
from matching Function/Eventarc trigger locations. All 50 regions still match. The two revenue handlers absent from
production specify `us-central1` explicitly. The helper now exposes its fixed-region limitation in its metadata.

**Literal wire equality remains DIFF**, not an unqualified PASS:

- All 50 Function payloads add `FUNCTION_REGION=us-central1`.
- All 50 add `directVpcNetworkInterface:null` and `directVpcEgress:null`. Fresh Cloud Run metadata shows no
  configured VPC connector/network interfaces in either environment; this does not authorize clearing future external settings.
- Seven Scheduler payloads add `attemptDeadline:null`. Current deadlines are 180 s, matching the documented HTTP default.
  Both serializers omit explicit OIDC audience; the API defaults audience to the target URI.
  [Cloud Scheduler reference](https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs).

The new CLI resolves the default Compute account through an API lookup and falls back to the project-number-derived
account on failure. The reviewed fallback matches the inventoried Scheduler identities; offline serialization supplies
that account explicitly and does not prove a live IAM rollout. Full prepare can enable APIs/change IAM and was not
executed against staging/production. Cloud env values, latest Secret version resolution, inherited project/org IAM and
post-deploy behavior are not certified by these fixtures. No cloud configuration was changed to make the comparison pass.

Production/source drift is a separate release gate: seven absent exports (`bookingChatMedia`, `claimGuestProfile`,
`reportClientErrors`, `queryAccountWalletHistory`, `resolveInstructorLessonRevenue`,
`syncInstructorLessonRevenueBooking`, `syncInstructorLessonRevenuePayment`), Node 20 → 22 for the existing 43,
and 25 additional Secret references. These are present before the H2 dependency delta. A blanket deployment would
include them; matching names/options does not authorize that rollout or prove a partial deployment safe.

## Five remaining Moderate dev entries

Five npm entries represent **two primary advisories**. None is in either production dependency audit.
They can affect local/CI/deployment tooling, so absence from runtime is not a claim of zero indirect operational risk.
For every row the recommendation is **accept bounded dev-tool risk temporarily**, awaiting a supported upstream chain;
this is a recommendation, not a recorded product-owner risk acceptance.

| npm entry | Advisory ID | Dependency chain | Safe fix assessment |
| --- | --- | --- | --- |
| `@google-cloud/pubsub@5.3.1` | GHSA-8988-4f7v-96qf | `firebase-tools → pubsub → @opentelemetry/core@1.30.1` | Pub/Sub 6.3.1 uses fixed core `^2.8.0`; outside CLI's `^5.2.0` contract |
| `@opentelemetry/core@1.30.1` | GHSA-8988-4f7v-96qf | Same Pub/Sub chain | Fixed at 2.8.0; installed Pub/Sub requires `^1.30.1`; no compatible drop-in fix |
| `firebase-tools@15.34.1` | Both IDs in this table | Inherits Pub/Sub/core and Gaxios/UUID chains | Latest CLI still declares affected major ranges; npm's force proposal is a CLI downgrade to 14.23.0 |
| `gaxios@6.7.1` | GHSA-w5hq-g745-h8pq | `firebase-tools → [google-auth-library@9.15.1] → gaxios → uuid@9.0.1` | Patched newer major chains exist; CLI still declares Gaxios `^6.7.0` and Auth `^9.11.0` |
| `uuid@9.0.1` | GHSA-w5hq-g745-h8pq | Same Gaxios chain | Fixed at 11.1.1 (also 12.0.1/13.0.1), outside Gaxios's `^9.0.1` contract; inspected Gaxios call uses `v4()` |

[OpenTelemetry advisory](https://github.com/advisories/GHSA-8988-4f7v-96qf),
[UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
Fresh npm metadata confirms CLI 15.34.1 is latest; Pub/Sub 6.3.1 and Gaxios 8.3.2 exist, but forcing their major
versions across the current CLI contracts is not established safe. No `npm audit fix --force` was used.
Machine-readable details: [remaining advisories](h2-2026-10-28/remaining-advisories.json).

## Changed files and PR recommendation

Existing H2 dependency changes remain in root and Functions `package.json` / `package-lock.json`,
`packages/shared-domain/package.json`, `functions/shared-domain/package.json`, and its sync generator.
Existing Vitest 4 migration changes remain in `vitest.config.ts` and `.github/workflows/ci.yml`.

This continuation changes:

- `scripts/syncSharedDomain.test.mjs`: keep the committed provenance fixture internally consistent and separately
  verify the working-tree generator/manifest, generation from scratch and LF/CRLF/mtime preservation.
- `tests/unit/featurePublicStartupBoundaries.test.ts` and `tests/unit/studentNextCourseShell.test.tsx`: narrow timeout budgets.
- `scripts/snapshotFunctionsWire.cjs`: explicit serializer-fixture scope/default-region metadata and numerical API-limit assertion.
- `.github/workflows/ci.yml`: emulator job budget 45 → 60 minutes, based on the measured 48-minute combined runs plus setup/build.
- This report, its evidence directory and the supersession note in the initial report.

PR recommendation: use a **draft PR while operational parity/release gates remain qualified**, attach this report,
the fresh audit responses, deployment comparison and both complete emulator results. Stage exact reviewed files and
curated evidence; do not include ignored `.scratch`, raw cloud inventories or the large historical diagnostic logs by default.
Commit/push/PR publication require the user's separate authorization. Keep production runtime/source rollout approval
and published staging compatibility verification explicit; do not convert this dependency PR into a blanket deploy.
Exact curated candidate paths are listed in [pr-file-manifest.txt](h2-2026-10-28/pr-file-manifest.txt).

## Server impact

- Functions: all 50 share the changed runtime dependency tree. Exact names/caps are in
  [server-impact.json](h2-2026-10-27/server-impact.json).
- Hosting: YES, client Zod/build dependency changes affect assets.
- Firestore/Storage Rules: NO. Firestore Indexes: NO. Migration/data migration: NO.
- Settings/manual setup: no application settings changed; deployment-prepare/rollout gate remains.
- Schedulers: `scheduledDeliverDomainOutbox`, `scheduledPurgeExpiredNotifications`,
  `scheduledReconcileGuestConfirmationMismatches`, `scheduledExpireGuestLessonReservations`,
  `scheduledExpireGuestCourseReservations`, `scheduledResolveLessonBookingAttendanceOutcomes`,
  `scheduledResolveCourseEnrollmentOutcomes`; source frequencies unchanged, CLI deadline serialization differs.
- Eventarc: the same eight source handlers, listed in `server-impact.json`; no trigger was changed in the cloud.

No product query shape, page/batch bound, polling, scheduler frequency or full-history scan behavior changed.
