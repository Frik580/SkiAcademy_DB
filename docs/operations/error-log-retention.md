# Error log deletion and retention

`error_logs` is written only by `reportClientErrors`. Its SHA-256 document ID
is the deletion identity; the stored client `id` remains compatibility data.
New logs have a Firestore Timestamp `deleteAt`, exactly 30 days after their
server-generated ISO `timestamp`. Repeated telemetry does not extend retention.

## Administrator cleanup

`deleteErrorLog` confirms a transactional deletion or returns `not-found`.
`clearErrorLogs` first captures Firestore read time,
without deleting anything. Subsequent calls read at most 200 documents ordered
by document ID and atomically delete only those created by the initial cutoff.
The signed continuation is tied to the administrator UID. Neither endpoint can
select another collection. Every invocation checks the active LIVE administrator
Account, verifies that Firebase Auth has not revoked the session, and requires a
sign-in within the past 10 minutes. This applies to each continuation as well.
Firestore Rules block direct deletion. Committed deletions are recorded in Cloud
Logging outside the collection, with a shared correlation ID for each cleanup.

The UI keeps confirmation, displays confirmed deletion counts and only announces
completion after the server returns `done: true`. A failure leaves a continuation
button. Keep the panel open until completion; continuation is held in memory,
so reloading starts a new, explicitly confirmed cleanup. Lost-response retries
are safe; the displayed count can undercount deletions whose responses were lost.
New logs may remain after a successful cleanup.
The traversal uses live ascending ID pages; sustained high-volume new writes can
extend the traversal, but cannot cause an incomplete cleanup to report success.

The initial query reads at most one document, followed by pages of up to 200.
Authorization uses up to two Firestore document reads and one Firebase Auth lookup
per call, alongside existing callable admission. Deletion transactions recheck
the Account in one additional document read.
There is an explicit full collection traversal for administrator cleanup, with
no polling, scheduler, recursive deletion or job persistence. A rate-limit or
network failure interrupts visibly and permits continuation after recovery.

## Retention deployment

The commands below are for the original retention rollout. Administrator
step-up and the direct-delete Rules change are covered by CA-SEC-07B.
[Administrator security audit](../audits/CA-SEC-07B-administrator-security.md)

From PowerShell in the repository root, after normal release approval:

```powershell
firebase deploy --project ski-school-8f3ca --only firestore:indexes
gcloud firestore fields ttls list --project=ski-school-8f3ca --collection-group=error_logs
firebase deploy --project ski-school-8f3ca --only "functions:reportClientErrors,functions:deleteErrorLog,functions:clearErrorLogs"
```

Verify that the `deleteAt` TTL policy is ACTIVE before relying on retention.
The installed Firebase CLI supports `ttl: true` field overrides, so deploying
the checked-in indexes configuration enables the policy; a separate Console
activation is normally unnecessary. If activation must be done manually:

```powershell
gcloud firestore fields ttls update deleteAt --collection-group=error_logs --enable-ttl --project=ski-school-8f3ca
```

Deploy Hosting through the existing approved project release workflow after
the Functions are available. Rules are unchanged. No scheduler or new secret
is required; the existing callable admission secret signs continuations.

TTL is asynchronous, typically deleting expired documents within 24 hours;
expired records can still appear in queries until deletion. Emulator tests
verify the field/type/value and access contracts, not the managed TTL worker.
See [Firestore TTL documentation](https://firebase.google.com/docs/firestore/ttl).

## Existing logs without deleteAt

No historical data is changed automatically. Missing `deleteAt` leaves a log
outside TTL; it remains readable and deletable by administrators. Enabling TTL
alone does not retrofit existing documents.

If historical retention is wanted, use a separately approved one-time backfill:

1. Export/backup the collection and rehearse on an emulator or staging copy.
2. Dry-run bounded pages ordered by document ID (at most 200 per page), recording
   a continuation. Count missing fields, valid server ISO timestamps, invalid
   timestamps, and records whose calculated expiry is already in the past.
3. Review that report before writing anything. Old dates become immediately
   eligible for asynchronous deletion once `deleteAt` is populated.
4. Apply only missing `deleteAt` values, calculated from the existing validated
   `timestamp` plus 30 days. Use document update-time preconditions or transactions
   so concurrent changes/deletions are skipped, never recreated or overwritten.
   Leave invalid/missing creation dates untouched for explicit manual review.
5. Checkpoint each successful bounded batch and verify sample Timestamp values;
   never reset existing expiry times or write to other collections.

This task does not execute or authorize that production backfill. An administrator
may instead use the explicitly confirmed full cleanup when retention is unwanted.
