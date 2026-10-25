# Cloud Functions: Node.js 22 migration

Initial audit: 2026-10-16; blocker follow-up: 2026-10-16–17 (Asia/Qyzylorda). Repository: `Frik580/SkiAcademy_DB`.
Branch: `chore/functions-node22-migration`; starting HEAD: `a9d75c60dde49a2728b3ebd5ef08fdaa78bca527`.

## Verdict

**BLOCKED — prepared for isolated CI validation, not staging deployment.**

**FULL E2E: BLOCKED BY LOCAL RUNNER RESOURCES.** By the user's explicit instruction, do not repeat full E2E on this Windows host. The next authoritative gate is the existing GitHub Actions `Playwright E2E` job on `ubuntu-latest`. Current changes have not been published or tested there; baseline CI success does not certify this patch. No Node.js22 regression is confirmed.

No commit, push, merge, deploy, Firestore migration, or staging/production data mutation has been performed.

## Root cause and scope

The Functions package still selected Node.js 20 while the root package, `.nvmrc`, `.node-version`, and every CI Node setup already selected Node.js 22. `firebase.json` has no Functions runtime override. The installed Firebase CLI resolves the updated package to `nodejs22`.

Google lists Node.js 20 decommission on **2026-10-30**, after deprecation on 2026-04-30. Decommission prevents creating/updating workloads on that runtime; existing workloads may be disabled. This is not a guaranteed simultaneous shutdown time. Node.js 22 decommission is currently 2027-10-31. See [Google runtime lifecycle](https://docs.cloud.google.com/functions/docs/runtime-support) and [Firebase runtime selection](https://firebase.google.com/docs/functions/manage-functions#set_nodejs_version).

Changed files, including the blocker follow-up:

- `functions/package.json`, `functions/package-lock.json`: engine `20` -> `22`; dependency resolutions/integrities unchanged.
- `README.md`, `docs/functions-node22-migration.md`: runtime description and migration evidence/runbook.
- `package.json`: guarded Vitest entry points, explicit demo emulator projects and E2E build.
- `scripts/runVitest.mjs`, `scripts/testFirestoreNetworkGuard.cjs`, `scripts/testFirestoreNetworkGuard.test.mjs`: test preload, immutable violation ledger, loopback preflight and safety tests.
- `scripts/runE2E.mjs`, `playwright.config.ts`: preview of built E2E assets, guarded single-session emulator execution and bounded, masked failure-state capture under the existing CI artifact path. Experimental heap caps and per-spec emulator restarts were removed.
- `vitest.config.ts`, `functions/vitest.config.ts`, `packages/shared-domain/vitest.config.ts`, `tests/setup.ts`, `tests/helpers/firestoreNetworkGuard.ts`: demo configuration and test-worker safety setup.
- `eslint.config.mjs`: Node/CommonJS lint configuration for the new `.cjs` test preload.
- `src/infrastructure/firebase/firebase.ts`, `src/infrastructure/firebase/firebaseEnvironmentGuard.ts`: reject real-project configuration before SDK initialization in `test`/`e2e` modes; deployed modes retain their behavior.
- `tests/unit/adminLessonBookingCommands.test.ts`: missing revision-coordinator mock.
- `tests/unit/firebaseEnvironment.test.ts`, `tests/unit/firebaseTestEnvironmentGuard.test.ts`: runner-contract alignment and test-environment safety checks.

Firebase config, backend business source, exports, generation, regions, deployed secrets/resource options/schedules, authorization, money/booking calculations, schemas, Rules and indexes are unchanged. Root lock file and all dependency versions are unchanged. The Node 20 reference in `docs/T32_CANONICAL_ADMIN_AUDIT.md` remains historical deployment evidence.

## Dependency compatibility

Versions are from the committed lock files, not latest registry versions. Every declared Node engine in both lock files accepts the tested Node.js v22.23.2; no incompatible engine was found. Packages without an engine are additionally exercised by build/tests. This does not replace Linux Cloud runtime smoke testing.

| Dependency | Locked version | Node engine / evidence |
| --- | --- | --- |
| firebase-functions | 5.1.1 | `>=14.10.0`; v2 exports load and callable tests |
| firebase-admin | 12.7.0 | `>=14`; Firestore emulator tests |
| firebase-tools | 13.35.1 | `>=18.0.0 || >=20.0.0 || >=22.0.0`; selects `nodejs22` |
| sharp | 0.33.5 | `^18.17.0 || ^20.3.0 || >=21.0.0`; native Windows PNG/rotate/resize/WebP smoke passes, libvips 8.15.3 |
| zod | 4.4.3 | No Node engine declared; schema/domain tests |
| TypeScript | 5.9.3 (root and Functions) | `>=14.17`; both builds |
| @noble/hashes | 1.8.0 | `^14.21.3 || >=16`; command/token tests |
| @google-cloud/firestore | 7.11.6 | `>=14.0.0`; emulator transactions |
| @google-cloud/storage | 7.21.0 | `>=14`; module loading; real cache smoke remains staging gate |
| @ski-academy/shared-domain | local 0.1.0 | Build and shared-domain tests |
| alpine-glide-bookings | local root package | Existing `file:..` dependency retained; `>=22` |

No dependency versions were changed. The Functions audit snapshot contains **17 affected package entries (11 moderate, 5 high, 1 critical)**; inherited entries are not 17 independent CVEs. All 17 are in the runtime dependency tree (including optional SDK packages), not dev-only. They enter the Functions artifact; installed presence does not by itself prove an exploitable application path. No `npm audit fix` was run.

### Audit triage of all 17 entries

`D` = direct Functions dependency; `T` = transitive. Every row is runtime / deployed Functions **YES**. Versions come from `functions/package-lock.json`, advisories and suggested parent upgrades from `.scratch/node22-validation/audit-before.json`. Candidate fixes below have **not** been installed or regression-tested; “patch allowed” describes the existing parent range, not approval to deploy.

| Package / installed version | Severity | D/T | Cause and application relevance | Fix availability |
| --- | --- | --- | --- | --- |
| `@fastify/busboy` 3.2.0 | high | T | Multipart boundary/header DoS and header injection; SDK response parsing is present; public multipart ingress through this parser was not established | >=3.2.2; patch allowed by parent `^3` |
| `@google-cloud/firestore` 7.11.6 | moderate | T | Inherits `google-gax` / retry / UUID advisories; Firestore client is used | Parent upgrade suggested: `firebase-admin` 14.5.0; major, separate validation |
| `@google-cloud/storage` 7.21.0 | moderate | T | Inherits `retry-request` / `teeny-request`; Storage client is used | Parent upgrade suggested: Admin 14.5.0; major |
| `@grpc/grpc-js` 1.14.4 | high | T | Certificate/auth-context and server-error disclosure; application uses Firestore client, no application gRPC server found | >=1.14.5; patch allowed by parent range |
| `body-parser` 1.20.6 | moderate | T | Inherited `qs`; HTTP Functions stack present | Parent patch with updated `qs` range required; current `~6.15.1` excludes fixed 6.16.0 |
| `express` 4.22.2 | moderate | T | Inherited `qs`; HTTP Functions stack present | Same parent-range constraint; audit “fix available” is not sufficient evidence for a lock-only fix |
| `firebase-admin` 12.7.0 | high | D | Inherits Firestore, Storage, forge, UUID entries; server SDK used throughout | Audit suggests 14.5.0, major; separate SDK migration |
| `firebase-functions` 5.1.1 | moderate | D | Inherited Admin entry; all exports use this SDK | Audit suggests 7.4.0, major; preserve v2 options in separate SDK migration |
| `gaxios` 6.7.1 | moderate | T | Inherited UUID; SDK HTTP transport | Parent upgrade to a tree using fixed UUID; no safe override proved |
| `google-gax` 4.6.1 | moderate | T | Inherited retry / UUID; Firestore transport | Admin 14.5.0 suggested; major parent upgrade |
| `node-forge` 1.4.0 | high | T | RSA PKCS#1 verification advisory; inspected Admin signing path uses `privateKeyFromPem`, affected verification sink not established | Audit range `*`; no fixed forge release established in snapshot; suggested Admin 14.5.0 removes/replaces affected path |
| `proxy-addr` 2.0.7 | critical | T | Malformed IPv4-mapped trust subnet causes fail-open proxy trust; installed via HTTP stack, affected application trust-subnet configuration not found | >=2.0.8; patch allowed by `~2.0.7`; reachability uncertainty is not a security dismissal |
| `qs` 6.15.3 | moderate | T | Bracket/comma and `isBuffer` DoS; HTTP parsing stack present | >=6.16.0; current Express/body-parser `~6.15.1` excludes it; parent update or explicit reviewed override needed |
| `retry-request` 7.0.2 | moderate | T | Inherited `teeny-request` / UUID | Parent SDK migration suggested, not a tested isolated fix |
| `sharp` 0.33.5 | high | D | Bundled libvips/libheif/librsvg issues; `optimizeImage` actually decodes allowlisted upstream images, so decoder exposure is relevant | >=0.35.5 resolves the listed ranges; breaking 0.x minor, needs Linux conversion/cache smoke |
| `teeny-request` 9.0.0 | moderate | T | Inherited UUID | Parent transport / SDK update needed |
| `uuid` 9.0.1 (3 copies), 10.0.0 | moderate | T | Buffer bounds in v3/v5/v6; inspected SDK paths call v4 | >=11.1.1; current `^9` / `^10` parents exclude it; do not force-major override |

Primary advisories: [busboy](https://github.com/advisories/GHSA-gxm5-99cw-xjw9), [gRPC auth context](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [gRPC errors](https://github.com/advisories/GHSA-f596-whhp-79r4), [forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [qs bracket/comma](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [qs isBuffer](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), [sharp/libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [UUID](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

Security residual: these pre-existing findings remain open. Runtime compatibility does not remediate them. Before production approval, explicitly resolve/accept each risk, prioritizing `proxy-addr` and the reachable image-decoder surface; test compatible patch candidates separately and validate breaking SDK/native upgrades in their own slice.

## Follow-up investigation: guest E2E and memory

The two cases are `same browser guest changes from Petr to Ars on a new course application` (`e2e/course-enrollment-smoke.spec.ts:16`) and `guest course request appears live for admin and cancellation refreshes both browsers` (line 258). The original first failure was the Admin region at line 124; its later isolated reproduction failed at `Complete profile` at line 136. The second original failure was a missing newly seeded course card at line 313.

`Complete profile` is expected because the guest participant has no age/skill yet. The current component exposes it for an active guest reservation with those missing fields. The retained failed screenshot shows the guest landing page with **no enrollment dialog**, not a different button label. The separate Admin screenshot contains Ars, so the request existed and the Admin saw it. The current Admin region translation matches the test exactly. No selector was weakened and no booking/finance/product logic was changed. The original full-run traces were overwritten by an earlier default Playwright output cleanup; that evidence cannot be reconstructed. A default-page snapshot cannot establish the separate Admin context's authentication state. The exact historical modal-close cause therefore remains unproven; neither a business defect nor a Node.js 22 regression should be asserted from it.

Controlled comparison uses a managed detached `origin/main` worktree at `C:\Users\geras\.codex\worktrees\node22-baseline\SkiAcademy_DB`, commit `a9d75c60dde49a2728b3ebd5ef08fdaa78bca527`. Remote `main` was reconfirmed at that commit read-only. Baseline application/backend source is untouched; the same test harness is applied to both trees. Node v22.23.2, npm10.9.8, Java21, root dependency specs/lock, Functions dependency resolutions (only root engine metadata differs), guest test and seed fixtures match. Baseline engine remains20; the CLI explicitly falls back to the same installed Node22 host. Each comparison starts fresh demo emulators, with no other suite running.

Evidence before the final lifecycle fix:

- Original harness on baseline: first guest case **1 PASS**. Original harness on branch: **2 PASS**, but a Vitest-config edit caused emulator reload during that run; it is not the clean controlled comparison.
- Identical preview/heap128 harness, two repeats of both guest cases: baseline **4 PASS / 0 FAIL**, branch **4 PASS / 0 FAIL**, retries0. Both normal shutdowns leave **0 task-owned processes**. Browser traces contain 739 requests per tree, **0 cloud Firestore requests**; Node egress ledgers are empty.
- Passing first-case assertions include real emulator Firestore reads: same Participant, distinct Enrollments, updated name `Ars`, then `{age:{kind:'age_years',years:43},skillLevel:'intermediate',discipline:'ski'}` after the successful `complete_guest_participant_profile` callable. These are durable-state assertions, not just screenshots. The live/cancellation case also checks both browsers and canonical lifecycle state.

Memory source is confirmed in Firebase CLI13.35.1's `functionsRuntimeWorker.js`: AUTO-mode pools retain idle workers by trigger until refresh/emulator shutdown; each worker imports the complete backend. This is retained live-session capacity, not evidence of orphaned processes after normal teardown. Browser contexts in the two guest cases close in `finally`; the guest-lesson shared Admin context closes in `afterAll`.

Task-only process-tree sampling every5s (`.scratch/node22-validation/monitor-e2e.ps1`) separates Functions workers, Java, preview/dev server, Chromium and Playwright. Original dev-server run peaked at **7.42 GiB aggregate private memory**, including **29 Functions workers / 4.76 GiB**, ~598 MiB Vite and ~784 MiB Java at that sample. Minimum OS free RAM131 MiB / free virtual memory451 MiB demonstrates runner pressure. The initial full run had actual host/diagnostic OOM. Preview/heap128 alone still peaked at **6.92 GiB**, **30 workers / 4.68 GiB** on baseline; it did not solve accumulated worker growth.

Rejected experiment: Functions old-space96 MiB/semi-space2 MiB caused **two V8 worker OOMs before the first guest test completed**. The Playwright tree was stopped, Firebase shut down normally, temporary files were removed, and the process monitor reached0. This experiment is **FAIL**, not a product/Node22 regression or a passed test. Its log/artifacts remain `current-bounded-*`.

Another experimental profile (Node heap128 MiB /semi-space2 MiB, each JVM512 MiB) gave branch **2 PASS /0 FAIL**, but a later clean baseline on the same profile gave **0 PASS /2 FAIL**. Its peak task-private memory was5.94 GiB (32 Functions workers /4.19 GiB at that sample), minimum OS free RAM410 MiB /free virtual memory291 MiB. The branch's passing run peaked at6.51 GiB. All normal teardowns reached0 processes. Thus the profile did not establish stable execution on this shared host. `jcmd` confirmed the JVM cap, but this was an experiment, not a retained production/test setting.

The new baseline failure is preserved in `baseline-final-target-*`: first case at line86 (missing `Request created` status), second at line345 (Admin live record count0). The first trace shows `executeGuestCanonicalCommand` HTTP200/success (~4s), then a pending `queryCourseEnrollmentReadModels` request when the15s assertion expired. Its screenshot still shows the modal with `Submitting…`. Current `CourseEnrollmentModal` awaits `loadGuestSingleCourseEnrollment` before clearing submitting state; successful command response alone does not mean UI hydration is complete. In the same run, CLI logs show multiple `Failed to load function` errors; installed `waitForSocketReady()` has a30s worker-discovery deadline. This supports resource/startup delays, not a proven domain defect. The exact historical disappearance before `Complete profile` is still not reconstructible. No post-failure raw Firestore snapshot was retained from these older runs; durable-state assertions from passing runs and command responses must not be presented as such a snapshot.

**Final candidate:** use built preview, fail-closed test configuration and retained diagnostics; preserve the original single emulator session, function concurrency, timeouts, SDK versions and heap defaults. The128/96 MiB Node caps, JVM cap and proposed20 emulator restarts are **not present in the final patch**. A restart per spec would add substantial startup/global-setup overhead to the existing20-minute CI job and was not validated. No timeout or host memory limit is increased. Dedicated CI is the appropriate resource-isolation gate, as explicitly directed by the user.

On a future failed Playwright run, before emulator shutdown, the runner captures only `participants`, `course_enrollments` and `courses` from the validated loopback/demo Firestore REST endpoint: at most100 documents per collection, explicit non-secret field mask,5s per-request deadline, no pagination drain, and a truncation flag. The file `test-results/emulator-firestore-failure.json` (or the caller's explicit output directory) accompanies existing traces/screenshots. Snapshot failure cannot turn the test verdict into PASS. This path is verified with mocked transport; no new local E2E was started to exercise it after the user's stop instruction.

Classification: **runner resource insufficiency and emulator pool retention CONFIRMED**; a Node22 regression **NOT CONFIRMED**. Guest-selector error, application defect, Firestore emulator correctness defect and the exact historical UI race are **NOT PROVEN**. Catalogue limits were inspected but are not established as the old missing-card cause. No query bound, product policy, booking or financial logic was changed.

## Follow-up investigation: external Firestore

The unsafe command was the original `npm run test:coverage`. `tests/unit/adminLessonBookingCommands.test.ts` mocked two revision coordinators but omitted `adminBookingChangeRequestsRevisionCoordinator`. The actual hook `useAdminBookingChangeRequestsRevisionRefresh` invoked `subscribeAdminBookingChangeRequestsRevision` -> `src/lib/admin/subscribeAdminRealtimeRevision.ts` -> Firebase `onSnapshot`, inheriting ignored local Vite Firebase configuration. The ignored root `.env` selects **production `ski-school-8f3ca`** (file unchanged since2026-08-27; no `.env.test` overrides were present). This was an unsafe production-configured listener attempt. Saved `app-coverage.log` records `Name resolution failed for target dns:firestore.googleapis.com`. No successful external connection/read/write was observed in that log; historical logs cannot prove more. No real Firestore query was issued to investigate it; only local configuration/logs were inspected.

The missing mock is fixed. Test/e2e Firebase initialization now rejects production/staging project IDs; E2E additionally requires emulator opt-in. Integration entry points validate required explicit loopback emulator host:port values before spawning Vitest. Node test preloads block known cloud Firestore authorities before DNS/HTTP2/HTTP(S)/fetch transport, normalize case/trailing dots, and record denied attempts. A parent-owned append-only ledger forces a failed wrapper verdict even if an SDK catches an error or a late attempt occurs after test assertions. Unit/Functions/shared-domain worker setup also checks violations. Emulator commands explicitly use a demo project. Signal handling cleans up only owned child processes.

This is a test SDK/configuration and transport guard, **not an OS firewall or universal network isolation**. Node hooks do not intercept Chromium. Browser safety relies on the before-SDK demo/emulator guard and existing synchronous emulator connections; recorded browser network traces are separately audited. Reproduction logs/trace summaries remain in `.scratch/node22-validation/`; no credentials or tokens are copied into this report.

## Initial validation (historical; follow-up results below supersede relevant rows)

All runs use Node.js **v22.23.2**, npm **10.9.8**, Java **21** on Windows. Logs and read-only inventory snapshots are local ignored files under `.scratch/node22-validation/`.

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| `node -v` | PASS | v22.23.2 |
| `npm ci` | PASS | Sandbox attempt failed EPERM; unrestricted retry installed 1057 packages |
| `npm ci --prefix functions` | PASS | Initial npm failures traced to TLS trust; retry with `NODE_OPTIONS=--use-system-ca` installed 251 packages; TLS verification remained enabled |
| `npm run build:functions` | PASS | Shared-domain sync, TypeScript and provenance check |
| `npm run test:unit:shared-domain` | PASS | 50 files, 369 tests |
| `npm run test:unit:functions` | PASS | 120 files, 1380 tests |
| `npm run test:firestore-enrollment` | PASS | 94 tests, emulator and wrapper exit 0; explicit demo project forwarded through nested npm scripts |
| `npm run test:storage-rules` | PASS | 14 tests, emulator and wrapper exit 0 |
| `npm run test:e2e` | FAIL | 36 tests scheduled; at least two guest-course scenarios failed; run interrupted for host memory exhaustion, wrapper exit 1; no final 36-test summary |
| Isolated first guest-course scenario | FAIL | Correctly selected 1 test; 1 failed at `course-enrollment-smoke.spec.ts:136`, waiting for `Complete profile`; 180000ms overall timeout; wrapper exit 1; emulators stopped normally |
| `npm run build:prod` | PASS | TypeScript and production Vite build; existing large-chunk warning |
| `npm run lint` | PASS | Exit 0; existing 90889 warnings, 0 errors; no autofix |
| `npm run i18n:check` | PASS | 2 parity tests |
| `npm run test:coverage` | FAIL | Optional extra run interrupted for safety after SDK attempted external Firestore DNS; no successful connection observed; see safety note below |
| Functions Firestore emulator suite | PASS | 51 files, 464 tests; 1672.22s; assertions and wrapper exit 0 |
| Native sharp conversion | PASS | Generated PNG -> rotate/resize -> WebP, output 50x30 |
| Functions module discovery | PASS | 47 endpoints; all `gcfv2` |
| `git diff --check` | PASS | Intended four-file patch only; no whitespace errors |
| Independent review | PASS | One independent reviewer; two runbook P1 findings fixed and rechecked (full identity/region preflight and production source gate); no remaining actionable findings |
| Graphify update | PASS | `graphify update .`: code graph rebuilt (15188 nodes, 44067 edges); CLI does not semantically index changed prose without a configured semantic provider |
| Deployed Node.js 22 / live smoke | NOT RUN | Deploy explicitly deferred |
| Automatic scheduled dispatch | NOT RUN | Existing E2E runner starts no Pub/Sub emulator, so all seven scheduled exports are skipped by Functions emulator; sweep/work handlers are covered separately; actual schedule delivery is a staging gate |
| Hosted GitHub CI | NOT RUN | No commit/push/PR was authorized; check identities/ruleset inspected read-only; both required contexts remain release gates |

E2E failure evidence:

- `e2e/course-enrollment-smoke.spec.ts:124`: `same browser guest changes from Petr to Ars on a new course application` could not find the Admin region `Lessons and course enrollments`; retry exceeded 180000ms. The default snapshot showed the guest fixture page with `Sign In`; it did not capture the separate Admin browser context, so it cannot establish that Admin auth was lost.
- `e2e/course-enrollment-smoke.spec.ts:313`: `guest course request appears live for admin and cancellation refreshes both browsers` failed because the expected newly seeded course card count was 0 instead of 1 (15000ms). Cause is not established. Full console failure details remain in `.scratch/node22-validation/e2e.log`. The first targeted runner cleaned the original default `test-results/` artifacts; original screenshots/traces are no longer retained. A subsequent reproduction uses a separate output directory.
- The region's current `adminTrainingListLabel` **does match** the expected English string; a different section heading is not evidence of a stale selector. No selector was loosened or changed. Admin-region visibility failure and runtime causality remain unresolved.
- At resource failure, the host had 16119104 KiB total visible RAM, only 805808 KiB physical and 636600 KiB virtual free. Diagnostic Node and PowerShell reported OOM. Only this task's E2E process tree was stopped; after cleanup, 5735896 KiB physical and 7730352 KiB virtual were free. This is a host observation, not a measured Cloud Functions memory requirement.
- Full E2E assertions have no final aggregate result; wrapper/process result is **exit 1**. Do not count the suite as PASS or infer 34 passes from the two reported failures. Task-owned emulators/dev server/browser processes and the unchanged test secret were cleaned up.
- An initial targeted command using a spaced grep expression selected no tests on Windows (`No tests found`, exit 1); it is not a reproduction result. The corrected command below selected exactly one test and failed later at line 136, waiting for `Course Enrollment` -> `Complete profile` until the 180000ms overall timeout. It progressed past the original Admin-region assertion; this does not establish the cause of the original failures or validate the full suite. Log: `.scratch/node22-validation/e2e-targeted-retry.log`. Screenshot/video/context: `.scratch/node22-validation/e2e-targeted-results/course-enrollment-smoke-sa-29939-on-a-new-course-application-chromium/`. All task-owned listeners and the test secret were absent after normal targeted-run cleanup.

```powershell
npm run test:e2e -- course-enrollment-smoke --grep=same.browser.guest.changes --retries=0 --reporter=line --output=.scratch/node22-validation/e2e-targeted-results
```

Coverage of critical processes is provided by the existing suites (unit PASS; full emulator result is recorded separately above):

| Process | Existing test families / evidence |
| --- | --- |
| Authenticated and guest canonical callables, authorization, secret-dependent credentials | `executeCanonicalCommandCallable`, `executeGuestCanonicalCommandCallable`, account-context resolution, guest course transport/confirmation tests; both exported callables load under v2 |
| Lesson create/reschedule/cancel | Booking command, reschedule and cancellation unit/emulator tests |
| Instructor double-booking prevention | Resource claim and booking contention/transaction emulator tests |
| Wallet, Payment, MonetaryEvent, refunds and replay | Finance/correction command, payment-start gate and idempotent-command unit/emulator tests |
| Group courses | Enrollment command, lifecycle, attendance, reconciliation and guest enrollment tests |
| Guest confirmation | Guest confirmation work/reconciliation and reservation-expiry tests |
| Domain Outbox and recovery | Delivery trigger/worker unit tests and audit/outbox staging emulator tests |
| Attendance and Course Outcome schedulers | Booking/course attendance command tests, outcome sweep/work unit tests; scheduler exports load with unchanged options |
| Instructor lesson revenue | Projection unit tests and revenue emulator tests; the two revenue triggers remain excluded from production |
| Images | Allowlist/query/cache-path unit tests and real native sharp conversion; upstream fetch, Storage cache and Linux binaries require staging smoke |
| Firestore triggers and secrets | v2 endpoint discovery, emulator startup/E2E; production Secret Manager IAM and automatic scheduler delivery require staging verification |

Emulator commands used from repository root in PowerShell:

```powershell
$env:NODE_OPTIONS = '--use-system-ca' # local trust-store workaround only
$env:GCLOUD_PROJECT = 'demo-ski-school-e2e'
$env:GOOGLE_CLOUD_PROJECT = 'demo-ski-school-e2e'
npm run test:firestore-enrollment -- -- --project demo-ski-school-e2e
npm run test:storage-rules -- --project demo-ski-school-e2e
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --project demo-ski-school-e2e --only firestore 'npm run test:functions:emulator'
npm run test:e2e # runner hardcodes demo project, local secret override and four emulators
```

The first Firestore invocation had an incorrect nested npm forwarding argument and exited 2 before tests; the corrected invocation above passed. Required integration/E2E runs use localhost emulators. Rules tests use their own project namespaces. The default Firebase alias is production, so do not omit the explicit demo project on standalone emulator commands.

Safety note: an optional full app-coverage run (beyond the requested commands) inherited local Vite configuration and logged a Firestore SDK attempt to `firestore.googleapis.com` during `adminLessonBookingCommands.test.ts`. It failed DNS (`UNAVAILABLE`, name resolution failed), and that task-owned process tree was stopped. No successful external connection/read/write was observed; this run is not counted as PASS. Do not repeat local coverage with real-project environment files; use an isolated demo/CI configuration with external-network denial. The planned read-only staging/production inspection in this task otherwise uses **Functions control-plane metadata only**.

## Final local follow-up validation (2026-10-17)

All commands below use Node.js **v22.23.2**. These results supersede the corresponding initial-validation rows. Logs and retained diagnostics are indexed in `.scratch/node22-validation/diagnostics-index.md` (local, ignored artifacts).

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Guard, environment, runner and missing-mock tests | PASS | 35/35, 3 files; includes mocked bounded failure snapshot and preservation of exit failure |
| Native network guard self-tests | PASS | 7/7; expected rejections occur before transport |
| `npm run build:functions` | PASS | Exit 0 |
| `npm run build:prod` | PASS | TypeScript and Vite production build exit 0; existing chunk-size warnings remain |
| `npx vite build --mode e2e --outDir .scratch/e2e-dist` | PASS | Built demo emulator assets for Playwright preview, exit 0; no browser test or emulator started |
| `npm run lint` | PASS | TypeScript and ESLint exit 0; 0 errors, 90889 existing warnings; no broad cleanup |
| `npm run i18n:check` | PASS | Exit 0; translation parity 2/2 |
| Shared-domain unit tests, 2 workers | PASS | 369/369, 50 files; egress ledger 0 attempts |
| Functions unit tests, 2 workers | PASS | 1380/1380, 120 files; CI placeholder environment; egress ledger 0 attempts |
| `npm run test:firestore-enrollment` | PASS | 94/94; explicit demo Firestore emulator; assertions and wrapper exit 0; egress ledger 0 |
| `npm run test:storage-rules` | PASS | 14/14; explicit demo Storage emulator; assertions and wrapper exit 0; egress ledger 0 |
| `npm run test:coverage -- --maxWorkers=2 --minWorkers=1` | **FAIL** | 2851 PASS / 1 FAIL, 351 passing / 1 failing file, exit 1, 2115.33 s; egress ledger 0 |
| Final full E2E on Windows | **NOT RUN** | **FULL E2E: BLOCKED BY LOCAL RUNNER RESOURCES**; user explicitly stopped further full local runs |
| Current patch on GitHub Actions | **NOT RUN** | Requires separately authorized publication and PR; old baseline success is not patch validation |
| Independent focused review | PASS | Final single-session runner, emulator snapshot, preflight, ledger and cleanup reviewed independently; no remaining actionable findings |
| `graphify update .` | PASS | Exit 0; 15222 nodes / 44104 edges / 425 communities; code graph refreshed. Semantic prose/labels require a configured provider and were not regenerated. |
| `git diff --check` | PASS | Exit 0; intended branch retained; no unrelated changes introduced |

Coverage's remaining failure is `tests/unit/CoursesManager.delete.test.tsx` → `reuses the same creation identity after an unconfirmed attempt`: the existing 5000 ms test timeout elapsed (5221 ms). The unchanged file previously passed all 17 tests without coverage in 13.394 s; this coverage run spent 59.850 s in that file. This is consistent with local instrumentation/resource pressure, but its exact timing cause is not proven. No assertion, timeout, business logic or coverage threshold was relaxed. Coverage percentages/threshold completion were not reported by the failed run and are **not certified**. An earlier four-worker attempt had three UI timeouts and no recovered aggregate result after session interruption; it is not a PASS.

The final patch has no full E2E result. Targeted comparative E2E evidence above belongs to explicitly described experimental harnesses and does not substitute for validating the final single-session CI candidate. Absence of cloud Firestore attempts is supported for the guarded runs by the Node ledgers and for the retained browser traces by host inspection; this is not an OS-wide network capture or a retrospective guarantee for the original unsafe run.

### Original blocker disposition

| BLOCKER | ROOT CAUSE | FIX | VERIFICATION | STATUS |
| --- | --- | --- | --- | --- |
| Two guest-course E2E failures / missing `Complete profile` | Original exact disappearance remains unproven; same-Node baseline also fails under Windows worker-startup/memory pressure. Retained trace shows a successful command followed by pending read-model hydration and `Submitting`; worker 30 s startup deadline failures are logged. | Preserve assertions/product behavior; built preview; retain traces and add bounded masked emulator failure-state capture for CI. | Controlled repeat: baseline 4/4 and branch 4/4 pass; later identical experiment: branch 2/2 pass, baseline 0/2. Final candidate still needs isolated CI. | **BLOCKED: CI result required; Node22 regression NOT CONFIRMED** |
| E2E memory exhaustion | Firebase CLI retains many idle Functions workers importing the backend within one session; roughly 4.7 GiB worker private memory, up to 7.42 GiB task-tree private memory, minimum 131 MiB free RAM. No orphan leak after normal teardown. | Built preview reduces Vite load; stop full Windows reruns; use existing isolated Ubuntu CI. Reject heap caps and per-spec restarts as unvalidated final fixes. | Process-tree profiles and cleanup evidence retained; CI's final candidate memory/stability is not yet measured. | **FULL E2E: BLOCKED BY LOCAL RUNNER RESOURCES** |
| External Firestore DNS | Missing revision-coordinator mock let original coverage call `onSnapshot` using production-configured ignored `.env`. DNS failed; no successful connection was observed. | Add mock, demo-only test configuration, emulator preflight, Node transport guard and parent-owned failure ledger. | 35 targeted + 7 native guard tests pass; fresh unit/rules/coverage ledgers contain 0 attempts. No real Firestore diagnostics. | **FIXED for identified path; guard scope documented** |
| Coverage failure | Initial unsafe listener fixed. Final run has one existing UI test hitting its unchanged 5 s timeout; exact timing cause unproven. | Safe guarded runner and reduced local worker concurrency; keep timeout and assertions. | 2851 PASS / 1 FAIL; isolated-file earlier 17/17 without coverage; current-patch CI coverage pending. | **BLOCKED: full coverage not successful** |
| 17 dependency audit entries | Locked runtime dependency tree includes inherited advisories; no evidence these were caused by Node22. | Complete per-package triage above; avoid mass upgrades and unsafe force fix. | 17/17 classified, 11 moderate / 5 high / 1 critical; versions unchanged. | **TRIAGED, OPEN: production security gate** |

## CI and Protect main

Read-only GitHub API inspection found active ruleset `Protect main` (ID24159900), targeting the default branch. Required contexts are `Playwright E2E` and `quality`, both GitHub Actions integration15368. Job names, triggers, existing20-minute E2E timeout, retries, workers and rule configuration remain unchanged. `quality` depends on lint, app-tests, functions-tests, Firestore and build. Every setup-node uses22; Java jobs use21. The E2E job still runs `npm run test:e2e` and uploads `test-results/` on failure.

Read-only checks on baseline `a9d75c60` show [Playwright E2E PASS](https://github.com/Frik580/SkiAcademy_DB/actions/runs/38782544910/job/116586178605) (job7m16s), [App unit coverage PASS](https://github.com/Frik580/SkiAcademy_DB/actions/runs/38782544910/job/116586178847) (job6m17s) and [quality PASS](https://github.com/Frik580/SkiAcademy_DB/actions/runs/38782544910/job/116589202879). Other baseline jobs also succeeded. These are previous source checks, **not validation of the current working-tree diff**. No workflow was started or rerun in this task.

The current workflow triggers on push to `main` or a PR targeting `main`; it has **no `workflow_dispatch`**. Pushing only `chore/functions-node22-migration` will not trigger it. After separate user authorization, publish the reviewed commit and open/update the PR to `main`, then require current-revision `Playwright E2E` and `quality` success. Do not rerun the old baseline and call it a migration result. No commit, push or PR is currently authorized. Do not alter timeout, product behavior or Ruleset to obtain a green check.

In CI, `vitest.config.ts`'s explicit demo `test.env` overrides placeholder/ignored Vite configuration. Installed Vitest2.1.9 merges `config.env` after `viteConfig.env` and applies it before worker execution; this keeps the new test initialization guard compatible with the existing jobs. Emulator suites use explicit demo projects and loopback preflight. The candidate's hosted CI checks remain **NOT RUN**.

After publication/PR is explicitly authorized, these are read-only tracking commands (not executed here):

```powershell
gh run list --workflow ci.yml --branch chore/functions-node22-migration --event pull_request --limit 5 --json databaseId,headSha,status,conclusion,url
# Select the run for the reviewed revision/PR merge revision, not a9d75c60 baseline.
gh run view <RUN_ID> --json headSha,jobs,status,conclusion,url
```

CI acceptance: report the full E2E PASS/FAIL/skipped/retry counts and current SHA; inspect saved traces and the masked emulator snapshot on failure; confirm the egress ledger has no denied real-Firestore attempts; require coverage thresholds without raising timeouts. Real Cloud Node22/Linux, Secret Manager and scheduled-dispatch smoke are subsequent staging gates.

## Live inventory and deploy boundary

Read-only `gcloud functions list` on 2026-10-16:

- **Staging:** 47 Functions, all `nodejs20`, names exactly match local 47 exports.
- **Production:** 43 Functions, all `GEN_2` / `nodejs20`; no deployed-only names.
- Four source/staging Functions are absent from production: `queryAccountWalletHistory`, `resolveInstructorLessonRevenue`, `syncInstructorLessonRevenueBooking`, `syncInstructorLessonRevenuePayment`.
- Cloud Run provenance labels: all staging47 have clean commit `a9d75c60dde49a2728b3ebd5ef08fdaa78bca527`; all production43 have clean commit `b335d934266c6e8641dca2f47304317c2cb40e3e`. Between those commits, `functions/src` and `packages/shared-domain/src` differ in **50 files** (3826 insertions, 134 deletions), including existing command/progress behavior. These are pre-existing changes, untouched by this task. Thus **production runtime-only deployment from this branch is currently BLOCKED**, even with a 43-name selector. A separate approved source-baseline/release decision is required. Labels are provenance evidence, not a byte-for-byte artifact audit.

Changing the engine does not itself change any exported name or trigger. A broad production `--only functions` would nevertheless create those four previously undeployed functions. **Do not use `npm run deploy:functions:prod` for this runtime-only rollout:** its current wrapper deploys all Functions. Production runtime migration is limited to the existing 43 Functions; rolling out those four features is a separate release decision.

Exact staging impact is all 47 names below. Production impact is the same list excluding the four named above:

```text
deliverDomainOutboxOnCreate
executeCanonicalCommand
executeGuestCanonicalCommand
executeTestSessionLifecycle
optimizeImage
queryAccountWalletHistory
queryAdminCourseEnrollmentReadModels
queryAdminCourseReadModels
queryAdminFinanceReadModels
queryAdminIdentityReadModels
queryAdminIssueReadModels
queryAdminPlannerReadModels
queryBookingChangeRequestReadModels
queryBookingInstructorCatalogueReadModels
queryBookingProposalReadModels
queryCourseAttendanceReadModels
queryCourseCatalogReadModels
queryCourseEnrollmentReadModels
queryEmailDeliverySettingsReadModel
queryInstructorCourseAssignmentReadModels
queryInstructorOccupancyReadModels
queryInstructorReviewReadModels
queryLessonBookingReadModels
queryLessonPricingSettingsReadModel
queryManagedParticipantPickerReadModels
queryOutboxDeadLetterReadModel
queryParticipantAchievementsReadModels
queryParticipantInstructorAccessReadModels
queryParticipantLessonFeedbackReadModels
queryParticipantOccupancyReadModels
queryParticipantProgressReadModels
queryTestSessionReadModels
resolveInstructorLessonRevenue
scheduledDeliverDomainOutbox
scheduledExpireGuestCourseReservations
scheduledExpireGuestLessonReservations
scheduledPurgeExpiredNotifications
scheduledReconcileGuestConfirmationMismatches
scheduledResolveCourseEnrollmentOutcomes
scheduledResolveLessonBookingAttendanceOutcomes
syncCourseEnrollmentOutcomeWork
syncGuestBookingConfirmationWork
syncGuestEnrollmentConfirmationWork
syncGuestPaymentConfirmationWork
syncInstructorLessonRevenueBooking
syncInstructorLessonRevenuePayment
syncLessonBookingAttendanceOutcomeWork
```

## Rollout runbook (commands prepared, not executed)

Use a **clean, reviewed, committed checkout** of this branch. Committing requires separate user authorization; no commit is created by this task. Retain before/after inventory and the actual known-good deployed artifact/source SHA. Do not assume starting HEAD proves deployed provenance. Ensure gcloud and Firebase CLI use the intended account and valid CA trust; never disable certificate validation. Stop on any failed native command (`$LASTEXITCODE -ne 0` in PowerShell).

1. Complete all local checks above, independent review, and CI gates.
2. Reconfirm names/generation/regions against fresh staging metadata; inventory drift stops the release.
3. After explicit staging deploy authorization, from repository root:

```powershell
npm run build:functions
if ($LASTEXITCODE -ne 0) { throw 'Functions build failed' }
$taskLocalNames = @(node -e "console.log(Object.keys(require('./functions/lib/index.js')).filter(k=>require('./functions/lib/index.js')[k].__endpoint).sort().join('\n'))")
if ($LASTEXITCODE -ne 0 -or $taskLocalNames.Count -ne 47) { throw 'Unexpected source inventory' }
$taskStagingBeforeJson = gcloud functions list --project ski-school-staging --format='json(name,environment,buildConfig.runtime)' --quiet
if ($LASTEXITCODE -ne 0) { throw 'Cannot read staging inventory' }
$taskStagingBefore = @($taskStagingBeforeJson | ConvertFrom-Json)
if ($taskStagingBefore.Count -ne 47 -or @($taskStagingBefore | Where-Object environment -ne 'GEN_2').Count -ne 0) { throw 'Staging inventory drift' }
$taskExpectedStaging = @($taskLocalNames | ForEach-Object { "projects/ski-school-staging/locations/us-central1/functions/$_" } | Sort-Object)
if (Compare-Object $taskExpectedStaging @($taskStagingBefore.name | Sort-Object)) { throw 'Staging identity/region drift' }
npm run deploy:functions:staging
if ($LASTEXITCODE -ne 0) { throw 'Staging deploy or provenance verification failed' }
$taskStagingAfterJson = gcloud functions list --project ski-school-staging --format='json(name,environment,buildConfig.runtime)' --quiet
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify staging runtime' }
$taskStagingAfter = @($taskStagingAfterJson | ConvertFrom-Json)
if (Compare-Object @($taskStagingBefore.name | Sort-Object) @($taskStagingAfter.name | Sort-Object)) { throw 'Function identity/region changed' }
if ($taskStagingAfter.Count -ne 47 -or @($taskStagingAfter | Where-Object { $_.environment -ne 'GEN_2' -or $_.buildConfig.runtime -ne 'nodejs22' }).Count -ne 0) { throw 'Not all staging functions are GEN_2/nodejs22' }
$taskStagingAfter | Select-Object name,environment,@{n='runtime';e={$_.buildConfig.runtime}}
```

4. Staging smoke with explicitly approved test accounts/operations: authenticated command allow/deny; guest callable/token confirmation; create/reschedule/cancel lesson; two simultaneous competing instructor bookings (one winner); payment/refund and replay (one monetary effect); course enrollment/cancellation for distinct Participants; guest confirmation reconciliation; outbox delivery/recovery/replay; Attendance unknown/deadline/escalation; Course Outcome resolution; instructor revenue booking/payment projections. Exercise actual `optimizeImage` through `/api/img` on a known allowlisted image, checking WebP content/dimensions and cold/cache-hit requests on Linux Node 22. Verify callable error codes, Firestore event deliveries and secret access without logging values.
5. Observe scheduled work over its existing cadence; do not manually drain production queues or run migrations. Compare Cloud Logging errors, retries, execution failures, latency, and Firestore read metrics against the pre-release baseline, including a quiet/no-op interval and a due-work interval. Do not invent numerical read costs. Scheduler intervals, query bounds, pagination and transaction behavior are unchanged by this diff.

```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' --project ski-school-staging --freshness=1h --limit=100 --format='table(timestamp,resource.labels.service_name,severity,textPayload)'
gcloud scheduler jobs list --project ski-school-staging --location us-central1 --format='table(name,schedule,timeZone,state)'
```

6. Production readiness gate: all required local/CI checks pass; staging47 inventory/runtime verified; smoke and background observations pass; dependency vulnerability triage accepted; known-good recovery artifact available; fresh production43 identity list reconfirmed. **Reconcile the actually deployed source/artifact and function options with the reviewed checkout for all 43 Functions**, using deployed provenance/source artifacts and pre-release metadata. Only runtime and generated build-provenance differences may pass this runtime-only gate. Equal names do not prove equal application source: shared code behind existing callables may contain other unreleased behavior. Any unverified provenance or non-runtime source/options drift blocks production until separately reviewed/authorized; excluding four exports alone does not resolve it. Production remains a separate explicit authorization.
7. The following production template is **not executable until the source gate above is resolved and separately authorized**. Either prepare/review a production-baseline Node 22 artifact in a separate approved task, or explicitly approve the additional application release; the latter is no longer a runtime-only rollout. Re-derive source names/regions from the resulting reviewed artifact rather than reusing an old session. Preserve the release provenance guard and run scoped provenance verification manually. Only after evidence and approval may the operator set `$taskProdSourceGatePassed = $true`; the default below fails closed:

```powershell
if ($taskProdSourceGatePassed -ne $true) { throw 'BLOCKED: production source/provenance gate unresolved' }
$taskExcluded = @('queryAccountWalletHistory','resolveInstructorLessonRevenue','syncInstructorLessonRevenueBooking','syncInstructorLessonRevenuePayment')
$taskProdNames = @($taskLocalNames | Where-Object { $_ -notin $taskExcluded } | Sort-Object)
$taskProdBeforeJson = gcloud functions list --project ski-school-8f3ca --format='json(name,environment,buildConfig.runtime)' --quiet
if ($LASTEXITCODE -ne 0) { throw 'Cannot read production inventory' }
$taskProdBefore = @($taskProdBeforeJson | ConvertFrom-Json)
if ($taskProdNames.Count -ne 43 -or $taskProdBefore.Count -ne 43 -or @($taskProdBefore | Where-Object environment -ne 'GEN_2').Count -ne 0) { throw 'Production inventory drift' }
$taskExpectedProd = @($taskProdNames | ForEach-Object { "projects/ski-school-8f3ca/locations/us-central1/functions/$_" } | Sort-Object)
if (Compare-Object $taskExpectedProd @($taskProdBefore.name | Sort-Object)) { throw 'Production identity/region drift' }
$taskProdSelector = ($taskProdNames | ForEach-Object { "functions:$_" }) -join ','
$taskOldRelease = $env:CARVE_RELEASE
try {
  $env:CARVE_RELEASE = '1'
  npx firebase deploy --project ski-school-8f3ca --only "$taskProdSelector"
  if ($LASTEXITCODE -ne 0) { throw 'Production deploy failed; inspect partial completion' }
} finally {
  $env:CARVE_RELEASE = $taskOldRelease
}
npm run deploy:verify -- --environment production --functions-only --function ($taskProdNames -join ',')
if ($LASTEXITCODE -ne 0) { throw 'Production provenance mismatch' }
$taskProdAfterJson = gcloud functions list --project ski-school-8f3ca --format='json(name,environment,buildConfig.runtime)' --quiet
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify production runtime' }
$taskProdAfter = @($taskProdAfterJson | ConvertFrom-Json)
if (Compare-Object @($taskProdBefore.name | Sort-Object) @($taskProdAfter.name | Sort-Object)) { throw 'Production identity/region changed' }
if ($taskProdAfter.Count -ne 43 -or @($taskProdAfter | Where-Object { $_.environment -ne 'GEN_2' -or $_.buildConfig.runtime -ne 'nodejs22' }).Count -ne 0) { throw 'Not all production functions are GEN_2/nodejs22' }
```

Do not use `--force` or approve function deletions. Stop on unexpected create/delete prompts or deployment quota failures. A 43/47-function rollout is not atomic; inspect every function after partial failure. Firebase recommends groups of at most ten when quotas require it: split the same reviewed selector, retain `CARVE_RELEASE=1`, and verify every batch before continuing. Do not add names to bypass failures.

8. Post-release: repeat scoped inventory/runtime/provenance checks, authorized production smoke and monitoring. Hosting deploy is **not required**. Check the existing `/api/img` rewrite (`optimizeImage`, `us-central1`) and current Hosting client/callable compatibility; do not require unchanged Hosting to have the Functions release SHA. No Hosting, Rules, indexes or data migration accompany this rollout.

## Recovery

Before deploying, retain the actual known-good deployed source/artifact identity, lock files, runtime/options/secret-reference metadata, and scheduler inventory outside the Git worktree. Recovery is a separate explicitly authorized deploy; do not reset this worktree or revert unrelated work. Stop rollout on repeated new 5xx, broken command auth, duplicate monetary effects, lost resource exclusivity, background retry storms, or image codec failures. Preserve diagnostic correlation IDs and compare durable state before retrying money commands; do not repair balances manually.

- **Before 2026-10-30:** if Google still permits updates to Node.js 20, redeploy the verified prior source/runtime from a separate clean checkout with its original locked dependencies, using the same reviewed environment-specific function-name selector and unchanged generation/options/secrets. Recheck all names, runtime, provenance, callables and background work. This is an available contingency only after verifying runtime availability, not a guaranteed rollback.
- **On/after 2026-10-30, or if Node.js 20 updates are refused:** do not attempt a Node.js 20 redeploy. Restore the last known-good application source on Node.js 22 with a reviewed minimal compatibility fix, validate it on staging, then separately authorize the same scoped production deploy. Prior Cloud Run revisions/artifacts are useful evidence but automatic traffic rollback is not promised for Firebase callable/event/scheduled Functions.
- No data migration is involved. Recovery must not delete/recreate Functions, change scheduler cadence, clear queues, reset fixtures, or roll back Firestore data. Partial deploy recovery inventories successful/failed functions first and completes/redeploys only the approved names.

## Server impact

- Functions: staging47 / production43, exact names above; runtime only.
- Hosting: NO.
- Firestore/Storage Rules: NO.
- Firestore Indexes: NO.
- Migration/data migration: NO.
- Settings/manual setup: no application settings/secrets changes; operator needs Node 22, trusted CA, existing Firebase/gcloud access and a clean reviewed artifact.
- Schedulers/triggers: existing seven schedulers and eight staging/six production event triggers are redeployed under the same identities/options; no new schedule or trigger definition. Four source-only functions remain excluded from production.
- Firestore cost: query shapes, batch/page bounds, scheduler frequencies and full-scan/drain behavior are unchanged; no new reads/polling are introduced by the runtime diff.

## Next

The candidate is prepared for the existing isolated GitHub Actions gate; available local checks and independent review are recorded above. **FULL E2E: BLOCKED BY LOCAL RUNNER RESOURCES** until the current patch's `Playwright E2E` result is available. Local full coverage also remains FAIL. Do not repeat full E2E on the shared Windows host or weaken assertions, increase timeouts or change business logic to obtain green checks. Publication and PR creation require separate user authorization. After both current-revision required checks pass, reassess `READY FOR STAGING`; staging deploy still needs explicit authorization. Production additionally requires source-baseline alignment and vulnerability risk resolution/acceptance; staging success alone cannot approve it.
