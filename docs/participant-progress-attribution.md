# Participant progress authorship and future training reports

`participant_progress` remains the current authority. Optional `skillCommentAttribution[skillId]`
contains the authenticated instructor/account, server timestamp and successful aggregate revision
of the last actual change to that comment. Score-only saves preserve it; deletion removes it.
Historical comments without this evidence remain unattributed. No backfill is performed.

`participant_progress_events/{participantId}_{revision}` is the existing immutable history,
created atomically with the command and its idempotency record. Assessment events now include
server-derived `instructorId`. Together with `actor.accountId`, `at`, `revision`, `participantId`
and the union of keys in `oldScores/newScores/oldComments/newComments`, this identifies each
score/text change, including deletions and zero scores. Compare key presence as well as values.
Level-only events must not inherit an instructor from a previous assessment's `updatedBy`.

The current authorized `queryParticipantProgressReadModels` callable exposes current comment
attribution under opt-in `participantProgressContract: 3`. Contracts 1/2 omit the new field for
strict deployed clients. Authorization and participant scope remain unchanged. No additional read-model queries, subscriptions, polling, indexes or collections are introduced.
An assessment event-key create collision reported as ALREADY_EXISTS is retried once as a whole
atomic command; expectedRevision/idempotency then resolves the competing result. No event is overwritten.

A future report should read history on the server using Admin SDK after the same participant
management/instructor/admin authorization and live/test scope checks as current progress reads.
Use a participant-filtered, revision-cursor query with a bounded page (e.g. 50 events) and an
explicit period; add any required indexes when implementing that query. Do not expose raw audit
or event documents to clients. There is no authorized history/report callable in this slice;
current-state reading works through the existing callable. Implement that bounded projection
when the report is built, including instructor display names resolved from confirmed IDs.

Old events retain score/comment snapshots, dates, revisions and account actors, but do not
prove historical instructor IDs or the original author of preexisting text. Do not infer these
from current account links, aggregate `updatedBy`, or score history. Report these as unknown.
The report period and dynamics can be derived only from retained dated evidence.

Bounds remain 128 entries per map, 64-character skill IDs, 2,000 UTF-16 code units per comment,
and 128-character canonical account/instructor IDs. Current attribution is bounded by the
comment map. The aggregate write estimate reserves 850,000 bytes (including author metadata
and daily scores), below Firestore's 1 MiB document limit. History contains two text snapshots;
its serialized UTF-8 payload plus 16 KiB encoding headroom is checked before any writes. An
oversized event rejects the entire command with validation, preserving progress and history.
No content is truncated. Maximum-map Unicode coverage verifies atomic rejection.
