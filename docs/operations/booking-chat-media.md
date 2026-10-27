# Private booking and course chat media

H1 uses `bookingChatMedia` (HTTP, us-central1) for uploads and downloads. Direct
Storage SDK reads, metadata access and writes under `chat/**` and
`test-sessions/*/booking-chat/**` are denied. Storage Rules cannot implement the
full canonical policy within their two-Firestore-document access limit.

Each HTTP request verifies the Firebase ID token with revocation checking, then
reads current account lifecycle, Booking party, active owner guards and current
occurrence instructor in a Firestore transaction. Payer and bookedBy are not
access authorities. Canonical records never fall back to legacy fields or a
colliding course ID. Admin/Owner authority requires an active principal. Legacy
accounts without lifecycle retain the existing LIVE signup compatibility.

TEST requests additionally use the existing canonical execution scope resolver
(actor, active assignment and active session) plus session membership. Explicit
administrator session access also requires membership. TEST actors cannot access
LIVE media; requested paths are never accepted as scope authority.

Uploads use at most seven 8 MiB requests, with authorization on every chunk and
again before publish. The strict existing limits remain: image/* <5 MiB and
video/* <50 MiB. Final objects retain existing chat paths and MIME metadata, have
no Firebase download token, and cannot overwrite an existing object. A single
temporary slot per account and context bounds abandoned chunks to seven objects
(at most 56 MiB). LIVE temporary objects use `_chat-media-uploads/{uid}/`; TEST
temporary objects stay in `test-sessions/{session}/_chat-media-uploads/{uid}/`.
Concurrent uploads from the same account/context may conflict and fail safely.
Finished/cancelled uploads clean matching generations; after revocation the
remaining bounded slot is inaccessible and is reused by the next authorized
upload. No history scan, polling, cleanup scheduler or new ACL authority exists.
Optional bucket lifecycle retention for those temporary prefixes can remove
abandoned slots; no lifecycle settings were changed by this implementation.

Downloads return at most 8 MiB per authorized request, with `private, no-store`.
The browser assembles a local Blob URL, releases it on unmount, and loads videos
on demand. There are no signed URLs or authorization grace periods. Already
downloaded bytes cannot be revoked; a subsequent server request always rechecks
authority. Video controls/seek operate on the local Blob.

The coach video/homework galleries use the same authenticated media renderer.
Before an image Blob URL is exposed in the DOM, off-DOM decoding and canvas PNG
encoding remove active formats such as SVG. The temporary original URL is always
released, including decode failure and cancellation; failures never fall back to
the original URL. Gallery zoom opens a passive image viewer, and native image
navigation also receives only PNG. Server MIME-family acceptance is unchanged.
Messages labeled as video reject a non-video response MIME before exposing any
Blob URL, so an image cannot bypass rasterization through the video branch.

New messages store `chat-media:{storagePath}`. Historical Firebase download URLs
for the configured bucket are parsed into paths and read through the gateway;
their token is never used by the updated client. Existing Booking/course media
does not need to be copied and existing chat messages need not be rewritten.
Historical Booking compatibility is isolated to records without canonical party
or occurrence; group course membership continues to use `course_chat_access`
and the assigned instructor roster. Cancellation/revocation removes that access.

## Historical media acceptance gate

Previously issued Firebase download tokens bypass Storage Rules. Closing Rules
and updating the client does **not** invalidate saved historical bearer URLs.
The emulator regression deliberately proves why token retirement is required.

The read-only inventory on 2026-10-26 covered all four production buckets,
LIVE/TEST private chat and temporary prefixes, including object versions. It
found two LIVE chat object versions (51,972 bytes total) in
`ski-school-8f3ca.firebasestorage.app`; both have the download-token metadata key.
Other inspected scopes were empty. No content or token values were inspected,
and no cloud metadata or object was changed.

On 2026-10-26 the product owner confirmed that both historical production tokens
were subsequently retired, old URLs return 403 and both objects were preserved.
This follow-up did not repeat revocation, inventory or any cloud mutation.
The earlier inventory describes the state before that authorized retirement.

Deployment, when separately authorized, must coordinate gateway availability,
updated Hosting client and closed Storage Rules; older open clients using direct
SDK uploads must reload. Prepare the gateway and updated client artifacts before
cutover. Strict fail-closed cutover closes Rules first, temporarily disabling
media in old tabs, then publishes the endpoint and updated client. Never publish
the updated client before its gateway is available. Rollback must not reopen
private SDK access. Verify an
authenticated browser workflow before that gate. No deployment commands were run.

## Staging rollout (plan only)

Use a clean checkout of the accepted release commit and stop after any failed
command. `CARVE_RELEASE=1` intentionally rejects the current dirty WIP before
deployment. Before the first deploy command, confirm that staging has no remaining
private chat bearer URLs; production's two-object result does not establish
staging's historical state. If tokens remain, stop for a separate approved
retirement plan. Do not repeat production token retirement.

There are no separate/manual IAM or Secrets commands, metadata changes or bucket
lifecycle changes in this plan. First publication of an HTTP Function can create
the standard invocation policy through Firebase deployment. Unexpected IAM or
Secrets prompts are a stop boundary, not permission to change those settings.

Build both artifacts before beginning the fail-closed interval. Announce that
old tabs must reload: closing Rules blocks their direct SDK operations, including
in-flight legacy uploads. Already downloaded bytes remain on the client.

```powershell
$env:CARVE_RELEASE = '1'
npm run build:functions
if ($LASTEXITCODE -ne 0) { throw 'Functions build failed' }
npm run build:staging
if ($LASTEXITCODE -ne 0) { throw 'Hosting build failed' }

# Close private SDK access first; temporary media unavailability is intentional.
node node_modules/firebase-tools/lib/bin/firebase.js deploy --project ski-school-staging --only storage
if ($LASTEXITCODE -ne 0) { throw 'Storage Rules deploy failed' }
node node_modules/firebase-tools/lib/bin/firebase.js deploy --project ski-school-staging --only "functions:bookingChatMedia"
if ($LASTEXITCODE -ne 0) { throw 'Gateway deploy failed' }

# Endpoint must exist before publishing the client; unauthenticated result is 401.
$endpoint = 'https://us-central1-ski-school-staging.cloudfunctions.net/bookingChatMedia'
$status = curl.exe -s -o NUL -w '%{http_code}' "$endpoint`?path=chat/probe/photo.jpg"
if ($LASTEXITCODE -ne 0 -or $status -ne '401') { throw 'Gateway unavailable or auth check failed' }
node --use-system-ca scripts/verifyDeployment.mjs --environment staging --functions-only --function bookingChatMedia
if ($LASTEXITCODE -ne 0) { throw 'Gateway provenance verification failed' }

node node_modules/firebase-tools/lib/bin/firebase.js deploy --project ski-school-staging --only hosting
if ($LASTEXITCODE -ne 0) { throw 'Hosting deploy failed' }
node --use-system-ca scripts/verifyDeployment.mjs --environment staging
if ($LASTEXITCODE -ne 0) { throw 'Hosting provenance verification failed' }
Remove-Item Env:CARVE_RELEASE
```

Then run the authorized staging smoke with fresh student/instructor/admin tabs,
JPEG/video upload and reload, an outsider denial and TEST/LIVE isolation. Keep
old tabs open during cutover to verify they fail closed and recover after reload.
Stop if the deployment proposes unrelated Functions or configuration changes.
Only `bookingChatMedia` source/export changes, so other Functions need no deploy.
There are no new Firestore Rules, indexes, schedulers or data migration.

Rollback keeps private Rules closed and preserves the gateway for updated tabs.
Use a reviewed gateway-compatible Hosting artifact or a maintenance state and
forward fix. Do not reopen SDK access, restore old tokens or publish the legacy
client alone. Endpoint-first deployment is not the strict fail-closed sequence
unless a separately enforced media freeze already exists.

Local authenticated check:
`npm run test:e2e -- --config playwright.chat-media.config.ts`.
This builds an isolated `.scratch/chat-media-dist` in `e2e` mode and starts
preview only after compilation. It uses only the demo emulator project.

## Resource shape

Run `npm run test:chat-media` for Storage Rules and gateway Auth/Firestore/Storage
emulator tests, including repeat-download revocation and exact size boundaries.

All reads are document-ID reads, with no queries or scans. LIVE authorization
reads account, actor marker, Booking and course collision guard, then at most
eight owner guards. TEST adds a bounded assignment/session/membership check.
The existing admission counter uses one bounded transaction per request and
limits media operations to 120/minute/account. Function concurrency is one per
512 MiB instance, max ten instances. No Firestore index is required. Auth token
revocation checking also uses Firebase Auth. One download request is made per
8 MiB chunk; no background polling is introduced.

Server impact: new Function `bookingChatMedia`; Hosting YES; Storage Rules YES;
Firestore Rules/Indexes NO; schedulers/triggers NO; canonical data migration NO.
Staging historical bearer-token state remains a rollout preflight. Production
token retirement was confirmed by the product owner as described above.

Finalization records private upload identity and returns the same successful
result when its response is lost and the same request is retried. Conflicting
uploads cannot overwrite final objects. Admission precedes canonical reads,
including denied requests. Server MIME checks preserve the existing Rules families
(`image/*`, `video/*`); they do not validate magic bytes or decode media.
