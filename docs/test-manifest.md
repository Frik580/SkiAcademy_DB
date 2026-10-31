# Canonical test manifest вЂ” Phase 1

`npm test` executes every group in `scripts/testManifest.mjs` sequentially. CI calls
`node scripts/runManifestTests.mjs --group <id>` for the same groups, retaining the
existing job names and the `quality` aggregator. Test discovery, emulator dependencies,
Functions isolation, skip allowances and critical assertion guards live in the manifest.

Run the short checks with:

```powershell
npm run test:manifest
npm run test:manifest:unit
```

`scripts/testManifest.inventory.json` records every existing test file's required suite
or documented deferred classification. A new, deleted, reassigned or unclassified file
fails validation. Review intentional inventory edits together with the manifest; do not
regenerate this lock blindly to make a failing gate green. Runtime selections must
match the inventory exactly. Every selected file must report actual assertions; runner
failure, missing reports, empty runs, duplicate IDs and unexpected skips fail the gate.
Vitest IDs distinguish parameterized cases with equal titles. Node and Playwright retain
their native case results. Existing Playwright retries remain unchanged; successful
retries are recorded separately as retryAttempts, never as new unique coverage. The only allowed skips are the two named Hosting security
cases; these remain SKIPPED and require a separate Hosting gate in Phase 2.

Required groups:

| Group | Existing CI job | Firebase lifecycle |
| --- | --- | --- |
| lint | lint | None; lint plus translation parity |
| app | app-tests | None; coverage plus shared-domain |
| functions-unit | functions-tests | None; Functions build, units, Node guards |
| backend | functions-emulator | Auth, Firestore, Storage; no Functions |
| reset | functions-emulator | Fresh Auth, Firestore, Storage; no Functions |
| integration | emulator-integration | Fresh Auth, Firestore, Storage; includes Storage Rules |
| firestore | firestore | Fresh Firestore; all Firestore Rules |
| build | build | None |
| e2e | e2e | Fresh Auth, Firestore, Storage, real Functions |

The five lifecycles are intentional. Global cleanup and reset rehearsals must not share
mutable emulator state or background Functions. The separate Firestore status check is
preserved. All emulator launches explicitly use `demo-ski-school-e2e`; existing
Firestore network guards remain enabled. Start gates outside a pre-existing emulator
session. Never run two emulator groups concurrently on the configured ports.

Removed duplicate executions now have one owner:

- `tests/unit/translationsParity.test.ts`: `translations`, group `lint` (previously also in app coverage).
- `tests/firestore.rules.test.ts`: `firestore-rules`, group `firestore`.
- `dataReset.emulator.test.ts`, `dataResetLiveFixtures.emulator.test.ts`, and
  `guestConfirmationWork.emulator.test.ts`: `reset-rehearsal`, group `reset`.
- `dataResetAuthorization.emulator.test.ts` stays in the same reset rehearsal.

`test:functions:emulator`, `test:vitest:integration`, and `test:rules` now invoke their
isolated manifest groups. `test:under-emulators` is a deprecated alias to the safe full
runner and must be called outside an emulator session. `test:firestore-enrollment`
is retained as a compatibility alias to `test:rules`; it tests Firestore Rules, not
Course Enrollment. CI uses the explicit `firestore` group instead.

Existing coverage gaps are deferred explicitly: colocated app tests, booking cutover
Node tests, migration CJS tests, compile-only contracts, and browser fixture suites.
Their proposed groups and safety limitations are in `deferredSuites`; Phase 1 does not
auto-enable destructive migration CLI tests or expand required browser coverage.

Local reports remain under `.scratch/test-manifest/local-*/` on success and failure.
`summary.json` records group wall times, overall status and partial progress. Per-suite
JSON contains COLLECTED, EXECUTED, PASSED, SKIPPED and DUPLICATE separately; source
counts are inventory metadata, not execution evidence. Per-group `lifecycleMs` includes
startup, tests and shutdown, while suite durations measure runner/report verification.
CI uploads reports and egress ledgers. Firebase CLI lifecycle messages remain in console
logs. A Playwright failure retains existing traces, screenshots and browser diagnostics.
Do not infer a performance improvement from historical parallel CI job durations.
