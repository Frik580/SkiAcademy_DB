# H2 — Production dependency security remediation

> Current validation/status is recorded in [the final October 28 report](h2-final-validation-2026-10-28.md).
> The results below preserve the initial remediation history and are superseded where the final report differs.

Audits: 2026-10-27; validation and read-only cloud inventory continued on 2026-10-28 (Asia/Qyzylorda). Branch: `codex/h2-production-dependency-security`.
Base: freshly fetched `origin/main`, `1e7ca6f093e2b7ffa27a93fd74679726965ad970`.
Environment: Windows, Node 22.23.2, npm 10.9.8, Java 21.

## Verdict

**PARTIAL — production dependency advisories fixed; deployment parity gate remains blocked.**

No commit, push, merge, deploy, staging/production data operation, or cloud configuration change was performed.
Business logic, Rules, Firebase configuration, runtime selection and source Function options are unchanged.

## Fresh audit

All four audits were repeated against npm registry on October 27, before and after remediation.
These results do not reuse the October 26 audit.

| Scope | Before Critical | Before High | Before Moderate | After Critical | After High | After Moderate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Root, full | 5 | 19 | 16 | 0 | 0 | 5 |
| Root, `--omit=dev` | 0 | 5 | 0 | 0 | 0 | 0 |
| Functions, full | 0 | 3 | 11 | 0 | 0 | 0 |
| Functions, `--omit=dev` | 0 | 3 | 11 | 0 | 0 | 0 |

Counts are npm vulnerable package entries, including inherited metavulnerabilities, rather than unique CVEs.
Raw `before-*.json` and `after-*.json`, complete severity/scope classification, and package deltas are in
[the evidence directory](h2-2026-10-27/).
[audit-classification.json](h2-2026-10-27/audit-classification.json) lists every original package and its closure status.
[dependency-changes.json](h2-2026-10-27/dependency-changes.json) lists every added, removed or updated lockfile entry.

Initial sandbox DNS failures and Windows certificate-chain failures were retried with network access and
Node's `--use-system-ca`; TLS verification was never disabled. Successful JSON responses include
`metadata.vulnerabilities`. Full root audit still exits 1 because of the five residual Moderate entries;
the other three final audit commands exit 0.

## Dependency changes

| Package / chain | Before | After | Reason |
| --- | --- | --- | --- |
| Functions `firebase-admin` | 12.7.0 | 14.4.0 | Official upgraded Firestore/Storage/Auth chains remove vulnerable UUID and Forge dependencies |
| Functions `firebase-functions` | 5.1.1 | 7.3.0 | Peer-compatible with Admin 14, retains identical SDK discovery manifest |
| Root `firebase-tools` | 13.35.1 | 15.34.1 | Removes vulnerable old tar, proxy-agent, csv-parse and Zod 3 chains |
| `zod`, root/shared domain/Functions | 4.4.3 | 4.6.7, minimum `^4.6.6` | Oversized constrained collection memory exhaustion |
| Root `vite` | 5.4.21 | 6.4.5 | Patched Vite 6 line; compatible esbuild and Vitest peers |
| `vitest`, `@vitest/coverage-v8` | 2.1.9 | 4.1.12 | Critical UI server vulnerability, mocker issues, removal of vulnerable Tinypool |
| Root `@grpc/grpc-js` | 1.9.16 | 1.14.5 override | Certificate authorization and handler error disclosure; matches existing Functions override |
| `body-parser` | 1.20.6 | 1.20.9 | Compressed request trailing bytes DoS |
| Root `proxy-addr` | 2.0.7 | 2.0.8 | Critical advisory; Functions already pinned 2.0.8 |
| Root `qs` | 6.15.3 | 6.16.1 | Patched compatible transitive resolution |
| Functions `qs` override | 6.16.0 | 6.17.0 | Remove vulnerable fixed resolution |
| Functions `node-forge` | 1.4.0 | Removed with Admin upgrade | RSA signature validation advisory |

Firebase client remains **12.16.0**; no Firebase or Node downgrade. The obsolete
`universal-analytics:0.5.3` override was removed because the updated CLI no longer depends on it.
Other security patches in existing compatible ranges are recorded in the complete delta artifact.
No `npm audit fix --force`, `--legacy-peer-deps`, TLS bypass or lifecycle-script suppression in the final `npm ci` was used.

npm 10's resolver crashed with `Cannot read properties of null (reading 'edgesOut')` while changing
Vitest's peer graph. Temporary npm 11.21.1 in ignored `.scratch/h2-npm` generated the lockfile.
Both final clean installs used the original npm 10.9.8 on Node 22.23.2.

## Production usage and advisory closure

- Zod is used by shared canonical contracts, client validation and Functions. All declared shared-domain copies
  and the Functions sync generator now require the patched minimum.
- Functions Express/body-parser serve HTTP/callable requests. Their patched compatible resolutions remove the
  request DoS. Functions Firestore uses gRPC; its existing 1.14.5 override remains in place.
- Root Firebase's Node Firestore dependency also contains gRPC. It appears in production-tree audit even though
  the web SDK uses its browser transport. The root tree is patched rather than dismissing this finding.
- Forge was in Admin's production tree. Upgrading Admin removes that chain without an unsupported cross-major override.
- Root proxy-addr, tar, Vite, Vitest, Tinypool and Firebase CLI findings are dev/build tooling, not Functions runtime packages.

Closed priority advisories include
[body-parser GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828),
[Zod GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[Forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
[gRPC certificate verification GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j),
[gRPC error disclosure GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4),
[Vitest GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp),
[Tinypool GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) and
[Tinypool GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).
The classification artifact includes the exact GHSA IDs, ranges and closure status for all remaining original findings,
including proxy-addr, tar, Vite/mocker, qs, compression, brace-expansion, fast-uri, YAML and undici.

## Residual Moderate advisories — dev only

Five npm package entries represent two primary advisories. The UUID advisory was already present. The OpenTelemetry chain is newly introduced by the required CLI upgrade; it is explicitly recorded as an introduced Moderate dev advisory, not described as a pre-existing finding.

1. `firebase-tools -> @google-cloud/pubsub -> @opentelemetry/core`,
   [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf): unbounded Baggage allocation.
   PubSub requires core `^1.30.1`; the fixed line starts at 2.8.0. Forcing OpenTelemetry 2 across that contract
   would be an unsupported major override requiring separate compatibility work.
2. `firebase-tools / google-auth-library -> gaxios 6.7.1 -> uuid 9.0.1`,
   [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): bounds checking in v3/v5/v6 with caller buffers.
   Current `gaxios/build/src/gaxios.js` uses only `uuid.v4()` for multipart boundaries. The advisory remains visible;
   a global UUID major override is not justified solely to clear the audit.

The five entries are `@google-cloud/pubsub`, `@opentelemetry/core`, `firebase-tools`, `gaxios`, `uuid`.
The current CLI release still declares the affected dependency ranges. npm proposes CLI **14.23.0** as a force-fix;
that downgrade was rejected. Revisit when upstream CLI/dependencies support the patched lines; otherwise use a separately
reviewed, scoped compatibility patch. These packages are absent from both production audit results.

## Runtime and deployment compatibility

`scripts/snapshotFunctionsWire.cjs` captures SDK discovery, CLI endpoint conversion, Function API serialization
and Scheduler serialization offline. The SDK manifest and all **50 endpoints** are deep-equal before/after,
including runtime `nodejs22`, numeric `maxInstances`, memory/CPU options, invokers, Secrets, schedules and event filters.
No source Function options, IAM configuration, Rules, Hosting rewrites, Firebase aliases or Node engine selection changed.

**Literal wire equality FAILS.** CLI 15.34.1 adds:

- `FUNCTION_REGION=us-central1` to each Function's serialized environment;
- `directVpcNetworkInterface:null` and `directVpcEgress:null` to all 50 Function service configs;
- `attemptDeadline:null` to the seven Scheduler job payloads.

See [wire-comparison.json](h2-2026-10-27/wire-comparison.json) and both complete `*-functions-wire.json` snapshots.
These deltas are not silently normalized away. In particular, null fields may reset externally managed configuration.
The new Scheduler serializer also looks up the default Compute service account, whereas the old CLI derived it from
the project number. The offline snapshot deliberately supplies a deterministic demo account fixture, so equality of
its Scheduler identity is **not evidence of deployed IAM parity**.

**BLOCKER H2-WIRE:** before any staging deployment, finish the operational inventory (separate Eventarc and Run IAM evidence) and evaluate the full CLI deployment-prepare result against it.
Confirm the null fields preserve the intended network/deadline configuration and the resolved service account retains
the intended identity. Any required policy/configuration decision is a separate change. This task does not patch CLI internals
or change Function options to hide serializer differences. The observations below are read-only evidence; the complete prepare phase and post-deployment parity are not certified.

Read-only deployed inventory on October 28 is summarized in
[deployed-inventory-summary.json](h2-2026-10-27/deployed-inventory-summary.json).
Staging has **50 GEN_2/nodejs22 Functions**, the same export set and numerical caps as source.
Production has **43 GEN_2/nodejs20 Functions**. Forty expose their caps in the Functions API;
three expose a matching **20-instance service cap in Cloud Run** instead. The Functions API returned no VPC fields in either environment; externally managed Cloud Run network settings were not inventoried. Both environments have seven Scheduler jobs with 180-second deadlines. Compute API is disabled in both projects; the new CLI's
reviewed error path falls back to the legacy project-number-derived default account. No API was enabled.
Separate Eventarc inventory and Run IAM policies were not established. Raw operational metadata stays in ignored
`.scratch`; application data, environment values and secret values were not exported.

**BLOCKER H2-PROD-SCOPE:** production has seven fewer Functions than source:
`bookingChatMedia`, `claimGuestProfile`, `reportClientErrors`, `queryAccountWalletHistory`,
`resolveInstructorLessonRevenue`, `syncInstructorLessonRevenueBooking`, `syncInstructorLessonRevenuePayment`.
A blanket source deployment would add those exports and migrate existing production runtime from Node 20 to 22.
That rollout requires the separately reviewed runtime/source/provenance gate; it is not authorized by dependency remediation.
Do not assume a partial deploy is safe solely from matching names, because these Functions share SDK and application source.

References: [Admin release notes](https://firebase.google.com/support/release-notes/admin/node),
[Vitest 4 migration](https://v4.vitest.dev/guide/migration.html).

## Validation

Completed results and outstanding runs are recorded below.

| Check | Result |
| --- | --- |
| Root `npm ci`, npm 10.9.8 / Node 22.23.2 | PASS |
| `npm ci --prefix functions` | PASS |
| Production TypeScript + build | PASS |
| Staging TypeScript + build | PASS |
| Functions TypeScript + build | PASS |
| SDK discovery / 50 endpoint options | PASS |
| Literal CLI wire equality | FAIL — H2-WIRE |
| App unit tests | Initial full run: 2964 PASS, 1 FAIL (5s ESLint cold-start timeout); isolated suite retry: 13/13 PASS with 30s local limit |
| Shared-domain unit tests | PASS — 370 tests / 50 files |
| Functions unit tests | PASS — 1489 tests / 130 files |
| Full Functions emulator suite | INTERRUPTED — no final suite result retained after user interruption; two reset failures observed under 30s default |
| Focused Functions emulator regressions | PASS — Attendance + chatMedia 62/62; failed reset cases 2/2 at existing CI 90s budget (18 unrelated cases intentionally filtered) |
| Integration / Firestore and Storage Rules | PASS — all 5 discovered files, 149/149 tests; wrapper exit 0 |
| bookingChatMedia regressions | PASS — included in 62 focused Functions assertions and Storage Rules; authenticated image upload/reload and video browser E2E PASS |
| Focused E2E (Auth/security/chat media) | PASS — 5 passed, 2 intentionally skipped (Hosting emulator required); runner exit 0, cloud Firestore egress 0 |
| Full E2E | NOT RUN locally — existing Windows runner resource restriction; required in CI |
| Full `npm run lint` | FAIL — also linted ignored nested `.worktrees` checkouts and built assets |
| Current-checkout ESLint (`--ignore-pattern **/.worktrees/**`) | PASS — 0 errors; 102209 existing warnings, largely CRLF formatting |
| ESLint on changed executable/config files | PASS — 0 errors/warnings |
| `git diff --check` | PASS — final inspection |
| Independent security review | PASS for dependency changes; deployment gate BLOCKED |
| Graphify update | PASS — code graph refreshed once; community names regenerated from hubs where labels became stale |

The initial unit attempt inside sandbox hit `EPERM` on Vitest's temporary-file rename and was interrupted.
The authoritative rerun uses the same guarded runner outside sandbox. A focused Attendance smoke test passes 20/20
with zero cloud Firestore attempts. Benign JSDOM media-method warnings do not by themselves constitute test failures.
Builds report bundle-size warnings and Zod comment annotation warnings; both builds exit successfully.

## Independent review

One independent read-only security reviewer examined manifests/locks, Node compatibility, audit classification,
Vitest environment selection, egress protection and deployment snapshots. A discovered helper-file test-discovery
regression was fixed by narrowing Node test includes while preserving broad app excludes. The reviewer confirmed
the corrected code, HTTPS registry URLs, untouched Firebase client, matching 50 endpoints and numeric caps,
and residual advisory classification. No actionable implementation defect remained. Test execution was still ongoing
at review time; the review does not certify pending test results or deployed IAM/VPC/Scheduler parity. The same reviewer also checked the final asynchronous Scheduler fixture, JSON discovery-boundary handling and two-line CI argument compatibility change; no new defect was found.

## Changed files and server impact

Product dependency files: root and Functions `package.json` / `package-lock.json`,
`packages/shared-domain/package.json`, `functions/shared-domain/package.json`, and its generator
`functions/scripts/syncSharedDomain.cjs`. Test configuration: `vitest.config.ts`; `.github/workflows/ci.yml` removes the two unsupported Vitest 4 `--minWorkers=1` arguments while retaining serial workers and all suite guards.
New verification script: `scripts/snapshotFunctionsWire.cjs`. Documentation/evidence: this report and `h2-2026-10-27/`.

- Functions: **all 50 exported Functions**, because the common runtime dependency tree changes.
  Exact names, per-Function caps and trigger groups: [server-impact.json](h2-2026-10-27/server-impact.json).
- Hosting: **YES** — client Zod and build-tool changes affect generated assets.
- Firestore Rules / Storage Rules: **NO**.
- Firestore Indexes: **NO**.
- Migration / data migration: **NO**.
- Settings/manual setup: **NO application setting changes**; H2-WIRE inventory/comparison remains required.
- Schedulers: the seven exact handlers are listed in `server-impact.json`; source schedules/options are unchanged,
  but CLI serialization differs as described above.
- Eventarc: eight event-handler names are listed in `server-impact.json`; source trigger configuration is unchanged.

No new queries, polling, scans or scheduler frequency changes were introduced.

## Staging and next release gate

1. Complete passing local/CI validation and resolve H2-WIRE using the recorded read-only inventory plus missing Eventarc/IAM and prepare evidence. Record an explicit
   disposition for the five Moderate dev-only entries; do not declare a zero full audit.
2. After separate deployment authorization, build from this exact reviewed lockfile on Node 22, deploy the complete
   shared Functions dependency change and Hosting in a controlled staging release. No new Rules, indexes or migration
   deployment is required by this diff.
3. Compare deployed Functions/Scheduler/Eventarc/Run IAM against the pre-deploy inventory. Verify numerical caps,
   runtime, Secrets, identities, trigger/deadline/network configuration and provenance.
4. Run the existing published staging client against updated staging Functions: Auth/guest claim,
   canonical Booking/Attendance, participant scope, Wallet duplicate/retry idempotency, and bookingChatMedia.
5. Next production release gate: passing existing CI quality/Playwright jobs on the exact final diff,
   resolved deployment parity evidence, staging compatibility smoke and the explicit H2-PROD-SCOPE/runtime gate. Production requires separate authorization.

The first combined Functions/emulator attempt was interrupted after five Attendance failures with background triggers active. The subsequent isolated full attempt was also interrupted before a final summary. The authoritative focused rerun passed Attendance/media 62/62, the two reset cases 2/2 under the existing CI budget, and all discovered integration/Rules files 149/149. This does not certify the uncompleted full Functions emulator suite.

Final local runtime result: all 5 integration/Rules/callable files passed (149 assertions); Attendance/chatMedia passed 62 assertions; the two reset retries passed under the existing 90-second CI budget. Browser E2E passed Auth cabinet, private chat image/video, verified guest claim/idempotent retry and public-operation rate-limit isolation (5 tests). Two Hosting-only tests were intentionally skipped because the existing runner uses Vite rather than a Hosting emulator. Full Functions emulator certification and full Playwright remain required CI gates. All task-started runtime servers stopped and the temporary test secret was removed.

AUTHENTICATED WORKFLOW: NOT VERIFIED for the published staging client; the authenticated workflow above was verified only on local demo emulators.
