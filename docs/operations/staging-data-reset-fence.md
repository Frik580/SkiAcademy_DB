> Current authorization update: the earlier cloud-disabled statements below
> describe historical preparation. The [staging-only authorization adapter](staging-reset-authorization.md)
> now supports separately confirmed Firestore-only staging reset/bootstrap with
> actual SDK ADC verification and a transactional lease. Production stays denied;
> operational window/deployment/drain/recovery gates remain. No execution occurred.

# Staging reset maintenance fence — execution gate

**Historical technical-isolation assessment.** For staging reset, the owner's
October 19 operational-window instruction supersedes the mandatory full admission
closure, exhaustive credential/process proof and rejection-canary requirements
below. Use [the current operational plan](staging-reset-operational-window.md).
This historical matrix still identifies writer families and residual risks; it is
not a requirement to develop a new maintenance mode or IAM deny. Integrity, drain,
recovery and explicit cloud-mutation approvals are retained.

Status: **BLOCKED**. Scope: `ski-school-staging/(default)` only. This is a
procedure/evidence checklist for later approval, not authorization to change IAM,
Rules, Scheduler, Eventarc, traffic, credentials or data. No IAM deny is proposed.
Production must never be a target of this procedure.

## Fresh read-only evidence

The October 19, 2026 capture uses the existing Firebase CLI identity and Node's
system certificate store, without disabling TLS verification:

```powershell
node --use-system-ca functions/scripts/inspectStagingResetFence.cjs .scratch/reset-fence-NEW_TIMESTAMP
```

The script has a fixed staging project, guarded HTTPS API allowlist, GET/list and
getIamPolicy only, pagination/caps, exclusive-create local files and SHA-256 hashes.
OAuth refresh is the only identity operation. It does not call application routes,
acknowledge PubSub messages, mutate IAM, or unlock reset. Its exit 2 / BLOCKED result
is deliberate: even a complete inspection is not writer isolation evidence.

Observed: 47 Functions, seven Scheduler jobs ENABLED, eight Eventarc triggers and
eight subscriptions. All Functions use
`1005648185457-compute@developer.gserviceaccount.com`; project allow policy grants
that identity `roles/editor`, `roles/eventarc.eventReceiver`, `roles/run.invoker`.
The operation list contained 72 completed operations, none visibly active. This
does not prove zero in-flight requests, transactions, Storage uploads or credentials.
Raw evidence stays in ignored `.scratch/reset-fence-20261019-complete/`; it is not
committed and must be refreshed for the actual approved window.

An earlier `gcloud` read failed on local CA verification; no SSL verification was
disabled. The first Node capture used an incorrect POST for Run IAM policy reads;
retain that failed evidence separately, never treat it as complete. The corrected
collector uses GET for Run IAM policies. The existing Attendance no-deny assessment
remains applicable; this document does not supersede its safety restrictions.

## Writer closure matrix

| Writer                                                                                                                                                                                                                                                                                                   | Exact closure/drain requirement before any reset                                                                                                                                                                                                                                                                                                                                                 | Restoration and acceptance                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client Firestore + Storage SDK/REST                                                                                                                                                                                                                                                                      | Approved full replacement of both staging rulesets with deny-all; save exact original releases/source. Test valid anonymous/self/instructor/admin reads/writes against both services on disposable canaries. Rules do not close server SDK access.                                                                                                                                               | Restore saved Rules releases only after verification; fresh login and role-scoped smoke. No such Rules change/canary was performed here.                                                            |
| `executeCanonicalCommand`, `executeGuestCanonicalCommand`, `executeTestSessionLifecycle`                                                                                                                                                                                                                 | Close all deployed callable URLs, direct run.app URLs and privileged invocation. Removing allUsers is insufficient with inherited Run Invoker. Existing IAM allows do not provide an approved narrow complete closure; BLOCKED until a reviewed staging-only admission barrier/effective permission control is supplied and valid requests prove rejection.                                      | Restore exact original admission settings/etag after no pending operation and successful reset verification; replay canaries with new idempotency keys.                                             |
| `resolveInstructorLessonRevenue`, any deployed query callable with write/lazy-hydration behavior                                                                                                                                                                                                         | Include in admission fence. Pin deployed source/build generation; read-like names cannot establish read-only behavior. Compare all 47 deployed exports with approved source.                                                                                                                                                                                                                     | Restore only source-matched revisions. An unclassified export is BLOCKED.                                                                                                                           |
| `scheduledResolveLessonBookingAttendanceOutcomes`, `scheduledExpireGuestLessonReservations`, `scheduledReconcileGuestConfirmationMismatches`, `scheduledResolveCourseEnrollmentOutcomes`, `scheduledExpireGuestCourseReservations`, `scheduledDeliverDomainOutbox`, `scheduledPurgeExpiredNotifications` | Save full job payload, schedule, target, identity, retry config and original state; pause each originally enabled job after separate approval. Also close manual invocation of scheduler HTTP services. Await existing runs/retries. Pausing the seven jobs alone does not fence them.                                                                                                           | Restore only originally enabled jobs, after trigger/backlog decision and data verification. Never enable jobs that were originally disabled.                                                        |
| `syncLessonBookingAttendanceOutcomeWork`                                                                                                                                                                                                                                                                 | Block new Booking admission, prove old deliveries terminal and subscription backlog/oldest-unacked state. Protect against manual privileged service invocation. No approved effective service closure exists with the current shared privileges; BLOCKED.                                                                                                                                        | Verify current-source reread behavior and frozen Attendance compatibility, then source-matched replay on disposable emulator fixtures before restoration.                                           |
| `syncGuestBookingConfirmationWork`, `syncGuestEnrollmentConfirmationWork`, `syncGuestPaymentConfirmationWork`                                                                                                                                                                                            | Same admission/invoker closure plus complete Eventarc/PubSub drain. Event before/after payloads are routing hints; inspect the exact deployed handler and current-source rereads.                                                                                                                                                                                                                | No blind ack/drop/delete/recreate subscription. Replayed old events must not confirm a removed Payment or create new side effects.                                                                  |
| `syncInstructorLessonRevenueBooking`, `syncInstructorLessonRevenuePayment`, `syncCourseEnrollmentOutcomeWork`, `deliverDomainOutboxOnCreate`                                                                                                                                                             | Same closure/drain, including outbox delivery/leases and external adapters. Do not assume all projections share the same retry safety.                                                                                                                                                                                                                                                           | Revenue replay must reread current canonical sources; old outbox obligations must not resend notifications/providers. Unknown handler revision/backlog stays BLOCKED.                               |
| Direct Admin SDK/console/REST, CI, fixture/owner/reset/backfill scripts, human and service credentials                                                                                                                                                                                                   | Inventory effective Firestore/Storage write authority, active processes, keys and workload identities. Stop and prevent restart of every non-operator writer using a separately approved narrow control. Rules/public-invoker controls do not affect this class. The shared Editor grant prevents claiming least-privilege closure; do not silently remove broad roles or disable/delete the SA. | Separate operator recovery access must be proven before closure. Restore exact saved config/permissions only after verification. Current effective writer/process inventory is incomplete: BLOCKED. |
| In-flight HTTP requests/transactions, Firestore import/restore/bulk operations, Storage uploads                                                                                                                                                                                                          | First close new admission, then observe terminal operations and pending leases/requests/uploads using authoritative inventories. A fixed sleep or quiet logs does not prove drain.                                                                                                                                                                                                               | Any new operation, unknown running request, unreadable metrics, stale evidence or config drift is STOP/BLOCKED.                                                                                     |

## Ordered gate for a future approved window

1. Pin exact reset source/build, manifest hash, project/database/bucket, backup or
   staging recovery baseline, operator identity and original configuration etags.
2. Reconcile the complete deployed export list, service revisions/traffic, Scheduler
   regions, Eventarc trigger destinations, subscriptions and all effective privileged
   writers. Missing source or unknown writer: STOP. Current code inspection does
   not prove the historical deployed archives match it.
3. Close client and callable admission using approved mechanisms above; stop new
   Scheduler dispatch and manual invocation; maintain a separate recovery operator.
4. Drain in-flight requests and active operations, then the eight event delivery
   paths. Require authoritative PubSub backlog **and oldest-unacked age**, retry/DLQ
   inventory, trigger revisions and a handling decision for every pending event.
   Subscription configuration alone is not a backlog metric. This task captured
   configuration only; complete backlog proof is still missing.
5. Perform valid rejection canaries for all writer families and privileged routes,
   against separately owned disposable data, followed by fresh exact data manifests.
   Canaries are writes and require separate permission; none were sent here.
6. Continuously recheck the effective fence and config etags before every batch and
   before publishing reset verification/Attendance readiness. Any drift stops apply,
   keeps admission closed, and enters checkpoint/recovery. A JSON boolean or an
   operator assertion cannot be the implementation of this control.
7. Only after a later reset approval: apply the immutable manifest, verify the
   expected empty/retained state, then obtain separate empty bootstrap approval.
8. Establish safe handling of deletion-trigger events generated by reset itself.
   Firestore and Storage deletion events are not atomically included in the reset
   journal. No old event may recreate removed activity or emit old side effects.
   Unknown backlog means do not reopen writers.
9. Run approved role-specific smoke, restore traffic/trigger delivery and originally
   enabled Scheduler jobs in dependency order, and restore client access last.

The current reset CLI therefore retains its hard cloud mutation prohibition.
There is **no claim of a complete minimal working fence** under the current allow
policy. Replacing missing isolation with IAM deny, changing production IAM, deleting
subscriptions, discarding backlog, or trusting the test nature of data is forbidden.

## Remaining evidence for approval

An effective narrow staging-only closure for privileged callable/trigger/Admin SDK
writers; complete active credential/process inventory; pinned deployed-source
provenance; valid rejection canaries; in-flight/Storage upload proof; complete
backlog/retry/DLQ drain and safe restoration; fresh target data manifest. These
gates cannot be closed by repository tests or by this read-only capture alone.
