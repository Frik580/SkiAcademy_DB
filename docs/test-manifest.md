# Canonical test workflow — Phase 2

All levels use `scripts/testManifest.mjs` and the single file inventory
`scripts/testManifest.inventory.json`. No test files were removed or reassigned.
The `deferred:*` inventory labels now identify release-only owners; their runtime
selections are promoted through `releaseSuites` and validated against that same lock.
Compile-only contracts are checked with TypeScript, not counted as runtime assertions.

| Command                         | Selection                                                                                                                                                             | Firebase lifecycle                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `npm run test:quick`            | Translation parity, frontend logic/source-contract tests without coverage instrumentation, shared-domain, Functions pure units, Node guards, app/Functions typechecks | None                                         |
| `npm test`                      | Every Phase 1 mandatory non-browser suite, production build, E2E smoke                                                                                                | Isolated lifecycles below                    |
| `npm run test:e2e:smoke`        | Explicit eight-file smoke view of existing Playwright bodies                                                                                                          | Auth, Firestore, Storage, real Functions     |
| `npm run test:e2e`              | All regular application E2E bodies; Hosting bodies belong to the separate gate                                                                                        | Same real Functions lifecycle                |
| `npm run test:hosting-security` | Both existing Hosting security bodies, no skip allowance                                                                                                              | Auth, Firestore, Storage, Functions, Hosting |
| `npm run test:full`             | PR non-browser stages, full E2E once, release units, migration, compile contracts, six browser fixture suites, Hosting gate                                           | Fresh isolated stages                        |

QUICK derives a conservative frontend logic selection from the canonical app owner:
`.test.ts` files without React mounting/hook imports or browser API dependencies.
Static local imports are followed recursively; browser storage/locale adapters, cycles and
unresolved imports conservatively remain in the complete PR suite. JSX,
render/hook and browser-shaped tests belong to the complete PR coverage stage. This
is a source-layer rule, not a measured slow-test blacklist or a fixed file count; new
UI-shaped/unknown cases remain mandatory in PR. An explicit Vitest include keeps
discovery aligned with runtime validation. Selected logic runs in Node, while the
complete PR frontend project retains jsdom. QUICK also removes V8 coverage
collection and all emulator/browser work. The three-minute budget remains a target.
It builds shared-domain, generates the existing Functions provenance module required
by a clean checkout, and runs app and Functions TypeScript checks without emitting
Functions. Manifest validation and egress guards remain mandatory.

## Mandatory PR coverage

| Group          | Existing CI job      | Contents / isolation                                                     |
| -------------- | -------------------- | ------------------------------------------------------------------------ |
| lint           | lint                 | Typecheck, ESLint, translation parity                                    |
| app            | app-tests            | Complete frontend coverage plus shared-domain                            |
| functions-unit | functions-tests      | Functions build, all pure units and Node guards                          |
| backend        | functions-emulator   | All canonical backend tests; Auth, Firestore, Storage, no Functions      |
| reset          | functions-emulator   | Fresh data emulators; separate reset authorization/restoration rehearsal |
| integration    | emulator-integration | Fresh data emulators; integration and Storage Rules                      |
| firestore      | firestore            | Fresh Firestore; complete Firestore Rules                                |
| build          | build                | Production frontend build                                                |
| e2e            | e2e                  | Smoke with real Auth/Functions and trigger delivery                      |

Financial, authorization, concurrency, booking, course, Attendance, reset, Rules and
migration guard ownership is unchanged. Local stages remain sequential. No test-data
parallelism or backend sharding is introduced: global cleanup, fixed accounts/wallets,
instructors and dates still prevent safe shared-state concurrency. Existing independent
CI jobs use separate machines/emulator state. All launches select
`demo-ski-school-e2e` explicitly and reject an inherited emulator session.

Smoke selects `auth-smoke`, `booking-flow`, `booking-invariants`,
`course-enrollment-smoke`, `admin-smoke`, `instructor-smoke`,
`guest-lesson-booking`, and the three non-Hosting `prelaunch-security` cases.
Keeping these complete files retains overlap protection, canonical failure handling,
selected Participant persistence, both guest disciplines and guest identity changes,
as well as all eleven requested product/security paths. A separate canonical API booking scenario
also polls its new `booking_attendance_outcome_work/{bookingId}` projection to prove
real Firestore trigger delivery. It uses an isolated date/Booking ID and canonically
cancels the Booking afterward. It never invokes the trigger handler directly.
Workers stay at one and retries retain the existing policy; no sleeps/retries added.
PR Smoke serves a prebuilt emulator-mode bundle through Vite preview, avoiding
dev-time module compilation while browser scenarios execute. The `build:e2e` check
forces demo project/emulator routing and writes `.scratch/e2e-app`; it is a different
artifact from the required production build in `dist`, which remains intact for Hosting.
FULL also builds and serves the demo preview on port 5173. It starts a separate
development server on port 5174 for `hero-cta-layout`, `participant-level-progression`
and `student-next-step` only. Their file-level baseURL keeps hero fixture routes and
browser imports of live `/src/` stores in the same origin/module graph as that app.
The test-only dev config warms the real cabinet route; readiness checks its transformed
module within the existing server startup deadline. Runtime hydration assertions remain.
Both managed servers use one global seed and the same demo emulators; one Chromium
project/worker preserves scenario order. Smoke starts only preview; Hosting starts neither.
No scenario is removed or run against an incompatible root-only preview bundle.

The existing two Hosting bodies have `@hosting` metadata. Smoke/full application E2E
exclude that tag; the Hosting gate includes it and accepts **zero skips**. FULL
therefore executes each body once. Discovery regressions compare the full plus Hosting
union to the original unfiltered suite and require all three security transport cases
in smoke. Runtime validation still rejects missing files, empty reports, duplicate case
IDs, failures and unexpected skips. The historical named skip metadata remains only
for Phase 1 compatibility regression tests; active profile views allow no skips.

## Release additions and safety

FULL promotes both colocated app tests using exact absolute selections, the Node
booking cutover tests, pure migration CLI guards and the isolated migration rehearsal.
The rehearsal requires explicit demo project variables and a localhost Firestore
endpoint before loading Admin SDK. A fresh Firestore-only lifecycle has no Functions.
Its Node preload blocks cloud Firestore in both the test and CLI descendants and checks
the egress ledger. Existing beforeEach/final cleanup is limited to `bookings`,
`course_enrollments`, `payments`, `monetary_events`,
`guest_confirmation_reconciliation_work`,
`guest_confirmation_reconciliation_quarantine`, and
`migration_control/guest_confirmation_reconciliation_v1` in that disposable emulator.
The existing rehearsal tests durable evidence, repeat/idempotent execution, cutover,
rollback and restart; no migration CLI is run against cloud data.

Browser fixture servers and their staging-mode build inherit forced demo project /
emulator routing, so promotion into FULL cannot fall through to staging Firebase.
Six browser fixture configs cover admin modals, admin Attendance, level modals,
Participant levels, journey geometry and planner overlap. The planner harness is built
before execution. Every selected fixture file must produce actual successful bodies;
all reports are combined for inventory/result validation. Shared Functions/frontend
builds are reused only within a single local invocation after successful completion,
never inferred from stale disk artifacts or reused across independent CI jobs.

Hosting uses request-only tests without the application Vite server or unrelated
account/course seeding. It runs against local port 5000 and the current `firebase.json` headers and
`/api/img` Functions rewrite. The image test primes local Storage and saturates the
miss limit before requesting the allowlisted upstream URL, so a cache fixture error
fails rather than fetching an external image. This base revision has **one** Hosting
configuration; production provenance lists two origins, but there is no dual-target
Hosting configuration in this branch to validate. No production/staging origin is
requested. Revalidate site/target-specific configuration when the dual-target change
is present; this workflow does not synthesize deployment topology.

## CI and evidence

Existing PR job names and the fail-closed `quality` dependencies remain intact.
`workflow_dispatch` with `full_validation: true` runs full E2E in place of smoke,
then requires `release-validation` after quality. Its release-only composition
shares successful builds within one invocation, matching the local FULL release stages. A release is valid only when **both**
quality and release additions succeed. No critical job has `continue-on-error`.
No required status check was removed or renamed; branch protection was not changed.
Run this full dispatch before production release; no deployment is performed by tests.
There is no added nightly workflow.

Reports remain under `.scratch/test-manifest/`. Local `summary.json` records profile,
group wall times and zero-egress evidence; checks have separate durations/status even
on failure. Data-emulator groups record startup and shutdown separately from inner
stage execution. E2E timing JSON separates CLI startup, fixture setup, Functions
readiness, Playwright wall time and shutdown (including diagnostic overhead on failure).
Vitest reports retain their own transform/setup/collection/test timing. These intervals
overlap where the framework does work concurrently; do not add them as exclusive costs.
Failed runs preserve partial progress, egress ledgers, traces and screenshots.

Use `.scratch/test-workflow-phase2-report.md` for this run's measured results and
limitations. The historical Phase 1 baseline is 80m30s. Targets are QUICK under three
minutes and smoke five to ten minutes; only completed measurements establish actual
budgets. CI wall time requires a real GitHub run and is not inferred from local parallelism.

The promoted Journey geometry fixture measures the current cabinet contract:
XP is in the summary, while marker captions are absent in cabinet appearance.
All 18 body identities and circle/avatar size checks remain. Summary containment,
positive bounds, marker/avatar centering and dev/preview parity replace the obsolete
caption-under-avatar measurement; the transform-owner check follows the marker.

Admin modal fixtures use their own built preview artifact instead of dev-time
module loading. FULL builds this artifact before fixture execution, with explicit
demo client flags. Their 78 bodies are unchanged. Journey geometry still compares
real dev and preview builds independently.

Standalone Admin modal fixtures (PowerShell):

```powershell
$env:VITE_FIREBASE_PROJECT_ID = 'demo-ski-school-e2e'
$env:VITE_USE_FIREBASE_EMULATORS = 'true'
npm run test:fixture:admin-modals:build
npx playwright test --config playwright.admin-modals.config.ts
```

The manifest's FULL fixture group supplies those demo flags and build automatically.
