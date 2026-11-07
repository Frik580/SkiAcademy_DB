# Participant progress observation history

The instructor-only `queryParticipantProgressHistoryReadModels` callable reads the
existing immutable `participant_progress_events` collection. It does not write
history or alter assessment, levels, current progress, chats, or lesson feedback.
The lesson-context dialog includes an instructor-only, initially collapsed Learning
history section. It loads the first page on expansion and one further page per
explicit Show more action, using the existing client entry point. Items remain in
server order and are deduplicated by event ID, including empty continuation pages.

The section is owned by Participant × Booking × Booking status × auth/scope
generation; switching context or reopening the dialog discards its local cache.
Late results cannot populate a new context. Permission-denied/unauthenticated
responses clear all displayed history and stop pagination; transient errors retain
loaded pages and the cursor for explicit retry. No history listeners, polling,
eager reads, profile lookups or full-history drain are added.

Events group all score/comment changes, use the configured skill names/maxima and
preserve absent versus zero scores. Retired skills retain raw scores without an
invented maximum. Verified event Instructor IDs resolve names only from the
already available instructor list; unresolved names display Author unknown.
Dates use Asia/Almaty; previous comment versions are keyboard-accessible disclosures.
History belongs to the Participant across lessons, separately from current context.

UI changes require Hosting only; the API deployment prerequisites below belong to
the prior API slice. No backend, Rules, indexes, migration or settings change is
introduced by this integration.

UI validation (2026-11-07): targeted history/dialog/client/score tests, TypeScript,
app build, affected-file ESLint/Prettier, translations, manifest and manifest-runner
checks passed. Independent review found one focus-trap issue; the local summary
focusability fix and Dialog keyboard regression passed focused review. Isolated
Chromium checks passed RU/EN and light/dark at 375, 390, 768, 1024 and 1440 px,
including long comments, no horizontal overflow, keyboard disclosure, Escape and
focus restoration. These fixtures do not verify authenticated Firebase access:
AUTHENTICATED WORKFLOW: NOT VERIFIED. No commit, push, merge or deployment.

## Contract and access

Shared Zod contracts are exported by `@ski-academy/shared-domain`. Request:
`{ scope: 'instructor', participantId, cursor?, idempotencyKey? }`, with the existing
transport-level `requestedTestSessionId?` boundary. Client entry point:
`queryParticipantProgressHistoryReadModels` in `canonicalReadModelClient.ts`.
Response: `{ scope: 'instructor', participantId, items, nextCursor? }`.
Each item contains only ID, Participant ID, numeric revision, canonical timestamp,
assessment kind, optional verified event Instructor ID, score changes, and comment
changes. No actor/account/profile, audit, configuration, chat, or payment data is
projected. Missing scores remain absent; zero is preserved.

Every request authenticates an active Account and resolves its Instructor ID from
the same server-owned profile link as current progress reading. It checks the
active, scope-visible Participant, then reuses `instructorHasProgressAccess` and
its relationship/block/Booking policy. No authorization decision survives the
request. Cancellation or relationship withdrawal removes that basis; another
valid basis can remain. Per ADR-0011, a valid completed Booking retains access
without a fixed expiry, and blocks do not remove valid Booking-scoped access.
This API does not introduce additional rights or an Attendance requirement.

## Pagination and resource bounds

The query is `participantId == selected Participant`, `0 <= revision <=
Number.MAX_SAFE_INTEGER`, ordered by revision DESC and document ID DESC. The
composite index is checked by `firestoreIndexContracts.test.ts`. Canonical writes
use `{participantId}_{revision}` and OCC, so revisions are unique per Participant;
the document-ID tie-breaker also handles duplicate revisions in old records.

One request returns at most 20 observations and a JSON response under 2 MiB.
Physical event batches contain at most 21 documents. At most 100 event documents
are read in one request (at most five event queries); there is no full-history
drain. Normal first pages use one event query with at most 21 event reads. No
profile lookup per event, polling, subscription, scheduler, or eager history load
is introduced. A byte-limited page may contain fewer than 20 observations.

Authorization adds one Account read, one Participant read, three relationship/
block reads, and one management read for a managed Participant. Existing read-scope
resolution also reads the TestActor and, for TEST actors, their assignment/session.
Booking evidence is loaded only when relationship access fails: existing
Instructor/Participant/status-filtered pages of 50 stop at the first valid Booking.
That inherited authorization loader may traverse further pages if matches are
malformed/deleted; it has no fixed total scan cap. The callable admission wrapper
also performs its existing rate-limit transaction. These counts describe query
shapes, not measured billing or latency.

With 100, 1,000, or 10,000 ordinary observations, each page retains the same bounds;
exhausting the history takes approximately 5, 50, or 500 client requests. Empty,
malformed, out-of-scope, or level-only rows can require additional requests. An
empty page with `nextCursor` is not the end. The cursor is a scan position, so a
terminal continuation may produce one final empty page. New head revisions do not
shift older positions or cause duplicates; refresh the first page to see them.

Cursors use AES-256-GCM with a namespaced key derived from the existing callable
`guestActionTokenSecret`. They bind the Participant and execution scope, hide raw
scan positions (including skipped TEST records), and reject tampering. They do not
grant access. No cursor-anchor document lookup is needed. Rotating that secret
invalidates old cursors; callers must restart from the first page. There is no new
secret or manual setup requirement.

## Legacy compatibility and diagnostics

LIVE visibility follows the existing canonical compatibility mode: unstamped
legacy documents are LIVE, never TEST. Because Firestore cannot query missing
scope fields as an equality, the bounded Participant/revision query filters scope
before projection. Skipped scopes never enter items or visible cursor metadata.

Only `update_participant_progress` observations are returned. Other kinds,
including level-only events, are skipped. Each score/comment dimension is compared
only when both snapshots were recorded; a missing snapshot does not establish an
addition or deletion. No current-state fallback is used. Missing/invalid event
Instructor IDs produce unattributed observations; current attribution, neighboring
events, and Account profiles are never used to reconstruct authorship.

Malformed observations are skipped with a structured warning containing only a
count, not personal data. Unknown kinds and incomplete old snapshots remain
compatible non-observations. Records without a numeric nonnegative sortable
revision, or above the safe-integer bound, cannot participate in this query and
are excluded; no full scan or migration attempts to recover them. Historical
documents remain untouched.

## Validation and deployment

Coverage includes server projection/pagination tests, real Firestore integration
for shared authorization and LIVE/TEST scope, client and index contract tests, and
`e2e/participant-progress-history-api.spec.ts`, which signs in through the Auth
emulator and invokes the actual Functions callable over HTTP, including revocation
before the next page. No browser interaction is required by that transport test.

Deployment order: deploy Firestore indexes, wait for READY/Enabled, then deploy
`queryParticipantProgressHistoryReadModels`. Hosting, Rules, migration, new
settings, and schedulers are not required for this API slice. The existing current
progress callable's authorization behavior is unchanged.

Validated locally on 2026-11-06:

- PASS: 94 server unit/regression tests and 49 client/index contract tests.
- PASS: 19 Firestore integration tests, including per-page revocation and TEST isolation.
- AUTHENTICATED CALLABLE WORKFLOW: PASS (one real Auth/Functions HTTP test).
- PASS: shared-domain/Functions build, app and Functions TypeScript, canonical contracts.
- PASS: ESLint on affected code, Prettier on affected files other than `CONTEXT.md`,
  `git diff --check`, manifest validation, and 28 manifest-runner assertions.
- `CONTEXT.md` already fails Prettier at HEAD; unrelated formatting is preserved.
- PASS: independent review and focused review of the fixes; Graphify code update.

Changed implementation files: shared `participantProgressHistoryReadModel.ts` and
read-model barrel; server `participantProgressHistoryReadModels.ts`, its callable,
the exported existing access helper and Functions entry point; the canonical read
client; the new history unit/integration and HTTP tests; existing client/index
tests; `firestore.indexes.json`; test inventory; this document and the narrow API
status paragraph in `CONTEXT.md`. No commit, push, merge, or deploy was performed.
