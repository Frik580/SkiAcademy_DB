# Known infrastructure blocker — canonical read-model callables

**Status:** STALE_DOC / NOT_REPRODUCED — transport blocker cleared in live verification on 2026-10-03 (Asia/Qyzylorda).

**Current scope:** production and staging canonical callable transport is reachable; authenticated product workflows remain unverified.

**Historical scope:** blocked production browser smoke for canonical lesson-booking and collaboration read sync; did not block T30A/T30B code completion.

## Live verification — 2026-10-03

Snapshot started: `2026-10-03T10:56:08.629Z`. No deploy, IAM change, authenticated mutation, commit, or merge was performed.

### Verdict

`NOT_REPRODUCED / STALE_DOC`. All 26 deployed canonical callables in `ski-school-8f3ca` and all 29 in `ski-school-staging` have an unconditional `allUsers` binding for `roles/run.invoker` and return correct preflight responses. This supersedes the open transport-blocker status, while preserving the historical evidence below. No current Function-layer CORS bug or Cloud Run IAM misconfiguration was observed.

### Functions inspected

All listed endpoints use Firebase v2 `onCall`, region `us-central1`, generation `GEN_2`, runtime `nodejs20`. Every deployed service has `INGRESS_TRAFFIC_ALL` and `invokerIamDisabled: false`; public access comes from its IAM binding. Canonical endpoints are not `onRequest`. The separate image endpoint `optimizeImage` uses `onRequest({ cors: true, ... })` and is outside this canonical audit.

| Function | Type | Environment | Preflight | Invoker | Cloud Run service basename |
|---|---|---|---|---|---|
| `executeCanonicalCommand` | onCall v2 | prod + staging | 204 / 204 | public / public | `executecanonicalcommand` |
| `executeGuestCanonicalCommand` | onCall v2 | prod + staging | 204 / 204 | public / public | `executeguestcanonicalcommand` |
| `queryLessonBookingReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `querylessonbookingreadmodels` |
| `queryManagedParticipantPickerReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `querymanagedparticipantpickerreadmodels` |
| `queryBookingProposalReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `querybookingproposalreadmodels` |
| `queryBookingChangeRequestReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `querybookingchangerequestreadmodels` |
| `queryParticipantInstructorAccessReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryparticipantinstructoraccessreadmodels` |
| `queryCourseEnrollmentReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `querycourseenrollmentreadmodels` |
| `queryCourseCatalogReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `querycoursecatalogreadmodels` |
| `queryCourseAttendanceReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `querycourseattendancereadmodels` |
| `queryInstructorCourseAssignmentReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryinstructorcourseassignmentreadmodels` |
| `queryAdminIssueReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryadminissuereadmodels` |
| `queryAdminFinanceReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryadminfinancereadmodels` |
| `queryAdminCourseReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryadmincoursereadmodels` |
| `queryAdminCourseEnrollmentReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryadmincourseenrollmentreadmodels` |
| `queryAdminIdentityReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryadminidentityreadmodels` |
| `queryAdminPlannerReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryadminplannerreadmodels` |
| `queryInstructorOccupancyReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryinstructoroccupancyreadmodels` |
| `queryParticipantOccupancyReadModels` | onCall v2 | staging; absent in prod | — / 204 | — / public | `queryparticipantoccupancyreadmodels` |
| `queryBookingInstructorCatalogueReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `querybookinginstructorcataloguereadmodels` |
| `queryLessonPricingSettingsReadModel` | onCall v2 | prod + staging | 204 / 204 | public / public | `querylessonpricingsettingsreadmodel` |
| `queryEmailDeliverySettingsReadModel` | onCall v2 | staging; absent in prod | — / 204 | — / public | `queryemaildeliverysettingsreadmodel` |
| `queryOutboxDeadLetterReadModel` | onCall v2 | staging; absent in prod | — / 204 | — / public | `queryoutboxdeadletterreadmodel` |
| `queryInstructorReviewReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryinstructorreviewreadmodels` |
| `queryParticipantProgressReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryparticipantprogressreadmodels` |
| `queryParticipantAchievementsReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryparticipantachievementsreadmodels` |
| `queryParticipantLessonFeedbackReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `queryparticipantlessonfeedbackreadmodels` |
| `queryTestSessionReadModels` | onCall v2 | prod + staging | 204 / 204 | public / public | `querytestsessionreadmodels` |
| `executeTestSessionLifecycle` | onCall v2 | prod + staging | 204 / 204 | public / public | `executetestsessionlifecycle` |

Service resources were read from the Cloud Functions API: `projects/<project>/locations/us-central1/services/<basename>`. Function URLs are `https://us-central1-<project>.cloudfunctions.net/<Function>`. Direct Cloud Run URLs from the same API are `https://<basename>-sl4d74zvka-uc.a.run.app` for production and `https://<basename>-lphsq4qxea-uc.a.run.app` for staging.

The three endpoints absent in production are a deployment-parity difference, not an IAM/CORS diagnosis. No production deployment was attempted to resolve it.

### HTTP, SDK, and browser results

| Environment | OPTIONS status | Access-Control-Allow-Origin | Access-Control-Allow-Methods | Access-Control-Allow-Headers | Key callable POST result |
|---|---|---|---|---|---|
| production | 204 for 26 deployed callables | `https://ski-school-8f3ca.web.app` | `POST` | `content-type,authorization` | 401 / `UNAUTHENTICATED` |
| staging | 204 for 29 deployed callables | `https://ski-school-staging.web.app` | `POST` | `content-type,authorization` | 401 / `UNAUTHENTICATED` |

For both `executeCanonicalCommand` and `queryLessonBookingReadModels` in each environment:

- Historical `Origin: http://localhost:3000` also returns OPTIONS 204, with ACAO exactly matching that origin.
- Direct Cloud Run URL preflight returns 204 with the environment hosting origin; requested `content-type,authorization,x-firebase-appcheck` headers are allowed.
- Firebase JavaScript SDK 12.16.0 `httpsCallable` returns `functions/unauthenticated`, with HTTP 401, origin-specific ACAO, and `{"error":{"message":"Authentication is required.","status":"UNAUTHENTICATED"}}`.
- Headless Chromium, opened at each public hosting root, automatically performs OPTIONS 204 and can read the same callable POST JSON response without a CORS exception.

The safe SDK and browser inputs were an empty command payload `{}` and the read-model scope `{ scope: "account_hot" }`, both without Firebase Auth. The command handler rejects missing auth before parsing command input or accessing business data. No valid business command was submitted. Browser context was newly created without an authenticated session; no protected product route was opened.

`AUTHENTICATED WORKFLOW: NOT VERIFIED` — cabinet, instructor, and administrator workflows were not exercised with valid application credentials.

### Authorization boundary

Observed path: `browser → Cloud Run IAM (passes) → Functions framework/CORS (passes) → Firebase callable (passes) → application Auth (401 UNAUTHENTICATED)`. The response is an application-level callable error, not an edge IAM 403, invalid callable envelope, capability denial, or domain validation error.

`executeCanonicalCommandCallable.ts` requires `request.auth.uid`, resolves the server-side account/capability context, applies administrator and account lifecycle checks, resolves execution scope, and then dispatches canonical commands. `queryLessonBookingReadModelsCallable.ts` requires auth for account/instructor scopes, resolves administrators for admin scopes, and enforces account lifecycle and read scope. Guest access follows its separate credential contract; it was not changed or exercised.

No `enforceAppCheck` option is configured in the current callable options or global options. The successful handler-specific missing-Auth response without an App Check token confirms these tested deployments do not require an App Check token for transport. Allowing the App Check header in preflight does not prove token validation. App Check policy was not changed, and authenticated capability enforcement was not claimed as a live test.

Firebase SDK `onCall` already implements CORS: the installed Functions SDK 5.1.1 uses `onCallHandler({ cors: { origin, methods: "POST" }, ... })` with default `origin: true`. No explicit canonical CORS middleware is needed. See the [Firebase callable protocol](https://firebase.google.com/docs/functions/callable-reference) and [Cloud Run invocation authentication](https://docs.cloud.google.com/functions/docs/securing/authenticating) for the distinct protocol and infrastructure layers.

### Deploy provenance and hardening risk

| Environment | Function | Ready Cloud Run revision | commit_sha | Function update time (UTC) |
|---|---|---|---|---|
| ski-school-8f3ca | `executeCanonicalCommand` | `executecanonicalcommand-00079-lot` | `c0284f655efb5a35fb91bde39660985fa1469a28` | 2026-09-30T19:44:09.833204819Z |
| ski-school-8f3ca | `queryLessonBookingReadModels` | `querylessonbookingreadmodels-00051-zen` | `c0284f655efb5a35fb91bde39660985fa1469a28` | 2026-09-30T19:44:10.772083581Z |
| ski-school-staging | `executeCanonicalCommand` | `executecanonicalcommand-00012-rol` | `66a615925762ee53639b622f070a2883f1a1bd7e` | 2026-10-02T14:31:40.205939476Z |
| ski-school-staging | `queryLessonBookingReadModels` | `querylessonbookingreadmodels-00013-qib` | `66a615925762ee53639b622f070a2883f1a1bd7e` | 2026-10-02T14:31:42.620694400Z |

Both environments have `commit_dirty: false` for these functions. Production and staging commits differ from each other and local HEAD `1b4ae896e83e7a091f5514de2de5c6fc231c8dbf`; existing provenance verification correctly reports `Functions MISMATCH` in each environment. That mismatch is not a CORS failure.

Current source already declares `CANONICAL_CALLABLE_OPTIONS = { region: "us-central1", invoker: "public" }`; that declaration originated in commit `c9c8f06f4` and is also present in both deployed commits. However, the installed Functions SDK 5.1.1 emits `callableTrigger: {}` without an invoker in its v2 endpoint manifest even when `invoker: "public"` is supplied. Installed firebase-tools 13.35.1 explicitly calls `run.setInvokerCreate(..., ["public"])` for new v2 callables, but its `updateV2Function` IAM update branches do not include `isCallableTriggered`. Therefore source options alone do not guarantee repair of externally introduced callable IAM drift on subsequent updates with this toolchain. This is a separate deployment-hardening risk, not a reproduced current outage.

`scripts/deploymentRelease.mjs` runs `scripts/deploymentVerification.mjs` after release, but that verification compares provenance labels and does not validate IAM or preflight. `scripts/fix-canonical-callable-invoker.mjs` is a historical production-only one-off repair for four services, not part of the release path. It was not executed. Its policy builder replaces existing `roles/run.invoker` bindings, so it should not be treated as a general additive IAM reconciler.

If hardening is separately accepted, add scoped read-only IAM/preflight post-deploy checks; an IAM repair must preserve existing principals/conditions and target only a confirmed broken environment. No runtime or IAM fix is necessary for this incident now.

### Regression / verification

- PASS — `graphify query "canonical callable cors invoker iam deployment blocker query lesson booking command" --budget 1800`, followed by verification against current source. Graph navigation identified the historical blocker and repair script; it was not used as live infrastructure authority.
- PASS — `gcloud functions list --v2 --project=<project>` for both projects and bounded Cloud Functions v2 API inventory (`pageSize=100`, no next page), plus Cloud Run service metadata and `getIamPolicy` for each deployed canonical callable. Requests were read-only, with four concurrent workers and no polling/history scan.
- PASS — real OPTIONS probes, installed Firebase SDK calls, and Playwright Chromium browser probes described above.
- PASS — `node node_modules/vitest/vitest.mjs run --config vitest.config.ts --environment node functions/src/canonical/readModels/queryLessonBookingReadModelsCallable.test.ts functions/src/canonical/commands/resolveCallableAccountContext.test.ts --reporter=dot`: 2 files, 39 tests.
- FAIL (deployed commit differs from HEAD) — `node --use-system-ca scripts/verifyDeployment.mjs --environment production --functions-only --function executeCanonicalCommand,queryLessonBookingReadModels`, and the same command with `--environment staging`. Both completed their metadata checks and reported deployed SHA != local HEAD.
- NOT RUN — emulator integration suite, Functions build, frontend typecheck, and authenticated product smoke; no runtime source was changed.

The sandbox process launcher was unavailable (`setup refresh had errors`), so approved direct CLI execution was used. Initial gcloud TLS trust failed; a process-local CA bundle from the Windows trusted root stores restored verification without disabling TLS checks or changing global gcloud config. The Codex browser launcher had the same sandbox failure; existing Playwright Chromium completed the browser probes instead.

### Changes and deployment impact

Only this historical blocker document was updated. Runtime source, authorization, App Check, Firestore Rules, and infrastructure were unchanged.

- Functions deploy: NO for this CORS/IAM investigation.
- IAM change: NO.
- Hosting deploy: NO.
- Firestore Rules / Indexes: NO / NO.
- Migration / Settings / Schedulers / triggers: NO.

No original infrastructure fix event or date is inferred from healthy current state. Remaining limits are authenticated workflow coverage, deployment parity, and absent IAM/CORS post-deploy gates.

## Historical incident summary

The historical incident blocked `queryLessonBookingReadModels` in production through Cloud Run invocation permissions. It is not reproduced in the live verification above.

The same `CANONICAL_CALLABLE_OPTIONS` (`invoker: 'public'`) applies to all browser-facing canonical callables in `functions/src/index.ts`:

- `executeCanonicalCommand`
- `executeGuestCanonicalCommand`
- `queryLessonBookingReadModels`
- `queryManagedParticipantPickerReadModels`
- `queryBookingProposalReadModels`
- `queryBookingChangeRequestReadModels`
- `queryParticipantInstructorAccessReadModels`

## Historical observed behavior

- Browser origin: `http://localhost:3000`
- Preflight `OPTIONS` → `403 Forbidden`
- No `Access-Control-Allow-Origin` header
- Browser consequently reports `POST ... net::ERR_FAILED`

This is an infrastructure/IAM blocker occurring **before** the Firebase callable handler executes.

## Frontend policy (do not work around)

Frontend code must not work around this failure. In particular:

- do not add Firestore fallback reads;
- do not modify `functionsClient.ts` to bypass the callable;
- do not introduce legacy read paths;
- do not weaken canonical authorization.

## Code expectation

`functions/src/index.ts` already declares browser callables with public Cloud Run invoker; auth is enforced inside each handler. Production Cloud Run services must match this deployment configuration.

## Historical required follow-up

1. Correct Cloud Run invocation access for the canonical callable services (region: `us-central1`).
2. Redeploy functions if the deployed revision predates `invoker: 'public'` on canonical callables.
3. Rerun browser smoke tests for:
   - `/cabinet/calendar` (customer lesson bookings + collaboration reads)
   - `/instructor` (instructor_hot + proposal/change-request reads)
   - coach participant-access panel (participant/instructor access read model)

## Historical verification

After IAM fix, confirm in browser devtools:

- `OPTIONS` preflight returns `204`/`200` with `Access-Control-Allow-Origin`
- `POST` to the callable succeeds (or returns an application-level auth/error, not `403` at the edge)
