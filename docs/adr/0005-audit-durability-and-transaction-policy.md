---
status: accepted
date: 2026-08-23
---

# ADR-0005: Audit Durability and Transaction Policy

Carve Academy will create exactly one immutable Activity Log document for every successful authoritative state-changing canonical command and will stage it in the same Firestore transaction as the command's domain mutations, required financial and operational records, deterministic outbox obligations, and idempotency result. Activity Log is the durable authority for audit history, while a separate mutable outbox carries independently retryable external-delivery obligations. This separation makes a committed business decision impossible to report as audited without its audit record, without turning audit, delivery, or financial history into competing sources of current business state.

This ADR completes the final decision deferred by [ADR-0001](./0001-canonical-aggregate-topology.md), [ADR-0002](./0002-server-command-transaction-and-resource-model.md), [ADR-0003](./0003-payment-accounting-source.md), and [ADR-0004](./0004-attendance-outcome-and-admin-issue-model.md). It preserves the domain language in [CONTEXT.md](../../CONTEXT.md) and the clean canonical rewrite direction in the [canonical rewrite specification](../specs/canonical-booking-domain-rewrite.md).

## Context and scope

The current implementation has a mutable, client-visible Activity Log shape, permits broad client and Instructor writes, sometimes assigns random identities, uses presentation-oriented timestamps, and writes some audit records after the authoritative mutation with errors swallowed. Notification creation is also separate and uses nondeterministic identities. Those paths can leave successful state changes unaudited, duplicate effects on retry, expose mixed-subject details too broadly, or let delivery concerns drift into business policy.

The canonical rewrite needs one durable answer to five different concerns:

- what decision committed, who or what made it, and under which capability and reason;
- which current domain and operational records were atomically changed;
- where numeric financial history lives;
- how external delivery survives retries and failures;
- how authorized readers receive safe history without making a multi-subject audit envelope a client document.

This ADR decides the Activity Log and outbox topology, identity, atomicity, immutability, reason policy, access model, transaction limits, reconciliation, recovery, and trigger policy. It does not define whole-Course cancellation or freeze the product delivery matrix for every `CommandKind`.

## Decision overview

```text
CanonicalCommands.execute(command envelope)
                     |
        authorize + decide + preflight
                     |
                     v
           one Firestore transaction
  +---------------------------------------------+
  | domain aggregates and projections           |
  | Payment / Wallet / monetary_events           |
  | claims / guards / capacity                   |
  | Attendance / AdminIssue                      |
  | one immutable Activity Log                   |
  | zero through 32 deterministic outbox records |
  | one command idempotency result               |
  +---------------------------------------------+
                     |
                     v
               atomic commit
                 /       \
                v         v
       immutable audit   retryable delivery workers
                         (no business decisions)
```

The Activity Log and outbox builders are internal to the deep `CanonicalCommands` module established by ADR-0002. Callers submit business intent. They cannot submit an audit document, choose semantic effects, choose resulting revisions, or bypass the complete mutation-plan preflight.

## Canonical command and audit identity

ADR-0002's `commandKey` is the canonical `commandId`; there is no second command identity. The same `commandId` consistently identifies command idempotency and is used for Activity Log identity, monetary-event causation where applicable, outbox identity, and correlation or causation references.

The canonical Activity Log path and identity are:

```text
/activity_logs/{activityLogId}

activityLogId = hash("audit:v1", commandId)
```

`hash` uses an unambiguous canonical encoding and the repository's approved cryptographic hash implementation. The `audit:v1` namespace makes identity evolution explicit. A matching idempotent replay returns the stored command result and creates neither a second Activity Log nor second outbox obligations.

An Activity Log path that already exists when the command is not a matching replay, or whose contents are inconsistent with the expected command identity, is an internal integrity failure classified as `audit_integrity_violation`. The command performs no domain writes, never overwrites or merges the record, emits a critical operational alert, and returns only a sanitized generic internal failure to an unprivileged caller.

## One bounded command envelope

Each successful authoritative state-changing command creates one command-level Activity Log, even when it affects several aggregates or Participants. The conceptual v1 document is:

```text
schemaVersion                audit:v1
activityLogId
command
  commandId
  kind
actor
  kind                       account | guest_credential | system | provider
  actorKey                   normalized internal query key
  accountId?                 for account
  guestSubjectRef?           verified subject reference, never a signed token
  systemActorId?             named automation identity
  providerId?                named provider identity
exercisedCapability          closed capability value
source                       closed, sanitized invocation source
correlationId
causationId?
decidedAt
committedAt
reason
  registryVersion
  reasonCode
  explanation?
primarySubject
  kind
  id
  subjectKey
affectedSubjects[]           bounded canonical references
affectedSubjectKeys[]        deduplicated query tokens
effects[]                    bounded closed semantic effects
monetaryEventIds[]           references only
adminIssueIds[]              references only
outboxIds[]                  deterministic obligation references
resultingRevisions[]         subject reference plus resulting revision
correctsActivityLogId?
retentionPolicyVersion
```

The document contains references and semantic outcomes, not full aggregate snapshots. `effects.kind` is a closed, versioned vocabulary per `CommandKind`; there is no generic raw Firestore diff, arbitrary JSON patch, or caller-defined effect escape hatch. Effect payloads contain only the bounded facts needed to understand the command and must not duplicate another canonical history.

`affectedSubjectKeys` supports raw authorized audit queries such as `booking:{bookingId}`, `course_enrollment:{enrollmentId}`, `participant:{participantId}`, `payment:{paymentId}`, or `admin_issue:{issueId}`. Keys are derived by the server from the canonical affected-subject set, are deduplicated, and do not grant authorization.

## Commands that require Activity Log

Every successful authoritative state-changing canonical command requires one Activity Log. This includes creation, lifecycle, schedule, Participant composition, relationship, access, block, Payment, Wallet, Attendance, AdminIssue, proposal, request, archival, correction, reconciliation-issue, and system resolution commands whenever canonical state changes.

The following do not create canonical Activity Logs:

- read-only queries;
- rejected domain commands and failed validation;
- unauthorized or denied attempts;
- a matching idempotent replay of an already committed command;
- outbox lease, retry, delivery, or dead-letter metadata changes;
- rebuilds of sanitized history, reporting, analytics, or search projections that do not change canonical business state.

Security, abuse, transport, and operational telemetry may record denied attempts separately. Such telemetry is not canonical Activity Log history and cannot imply that a domain mutation committed.

## Actor identity and exercised capability

Identity and authority remain separate facts. The Activity Log records the trusted actor identity and the one exercised capability authorized by the command:

```text
Account acting as Administrator
  actor.kind = account
  actor.accountId = ...
  exercisedCapability = administrator

Scheduled outcome resolver
  actor.kind = system
  actor.systemActorId = system.resolveOutcome
  exercisedCapability = system

Provider callback
  actor.kind = provider
  actor.providerId = ...
  exercisedCapability = provider_callback
```

Automated actions are never represented as an Administrator Account. A guest actor stores only the verified canonical guest subject reference needed for accountability, not the signed guest token. Provider actors store bounded identifiers and canonical references, never raw callback payloads or credentials.

## Decision time and commit time

Both timestamps are mandatory and immutable:

- `decidedAt` is ADR-0002's authoritative command/domain decision time obtained from the injected command clock for the successful transaction attempt. Domain calculations use this value.
- `committedAt` is a Firestore server commit timestamp written with the immutable Activity Log. It records database commit time and never replaces `decidedAt` in lifecycle, cancellation, pricing, Attendance, scheduling, or other domain calculations.

## Structured reason policy

Every auditable command records a `reasonCode` from a closed, versioned registry for its `CommandKind`. System commands use structured machine reason codes and do not invent explanatory free text.

`reasonCode` and a normalized human `explanation` are both mandatory for exceptional or high-risk human actions, including:

- manual financial or price override;
- discretionary partial or zero late-cancellation refund;
- manual external refund;
- human write-off or financial correction;
- Administrator Attendance correction or invalidation;
- `completed <-> no_show` correction;
- exceptional `cancelled + present` resolution;
- AdminIssue dismissal;
- exceptional identity, access, or audit correction.

Routine Administrator policy actions require `reasonCode`; explanation is optional unless the selected code is `other` or that command's versioned policy requires it. The exact closed reason and semantic-effect registries may be completed during implementation, but each implementation must validate its registry version before the transaction is staged.

## Separation from current and financial authority

Activity Log is the sole durable authority for audit history, but it is not event sourcing and never becomes current business-state authority.

### Payment, Wallet, and monetary events

ADR-0003's global append-only `monetary_events` remains the sole canonical financial history. Activity Log records the actor, capability, policy reason, affected subjects, semantic financial action, and `monetaryEventIds` created by the command. It does not duplicate monetary deltas, prices, paid/refunded/retained/written-off amounts, Wallet balances, or accounting history.

### Attendance and AdminIssue

Attendance remains canonical participation evidence. AdminIssue remains canonical current unresolved operational state. Activity Log records the commands that entered, corrected, invalidated, opened, resolved, dismissed, or otherwise affected those records. Normal runtime never reconstructs Attendance, AdminIssue, Booking lifecycle, or CourseEnrollment lifecycle by replaying Activity Logs.

### Domain aggregates

Booking, CourseEnrollment, Payment, Wallet, Attendance, AdminIssue, relationships, claims, guards, and capacity representations retain the authorities assigned by ADR-0001 through ADR-0004. An Activity Log references their identities and resulting revisions; it neither snapshots nor supersedes them.

## Atomic durability

For a command that requires audit, the complete ADR-0002 transaction stages, as applicable:

```text
domain mutation
+ Payment / Wallet / monetary_events
+ claims / guards / capacity
+ Attendance / AdminIssue
+ one immutable Activity Log
+ required outbox obligations
+ idempotency result
```

All required records commit atomically. A command fails before commit if its Activity Log, required outbox obligation, or any other required mutation cannot be staged. There is no best-effort audit, post-commit audit callback, required-audit trigger, or asynchronous Activity Log materialization.

The transaction callback performs no external delivery. Once commit succeeds, later notification or provider failure cannot roll back domain state, financial history, audit, or the durable obligation to deliver.

## Immutability, corrections, and retention

Activity Logs are create-only. Clients, Administrators, workers, maintenance tools, and generic data-management paths cannot update or delete them. Firestore Rules and server command implementations must enforce that policy independently.

Incorrect audit metadata is corrected by an explicit canonical correction command. That command creates a new Activity Log with `correctsActivityLogId` referencing the original and records closed correction effects and a mandatory reason. The original record remains immutable and visible; correction chains never rewrite history.

Canonical v1 retains Activity Logs indefinitely:

- no TTL;
- no automatic deletion;
- `retentionPolicyVersion` recorded on every Activity Log.

This is a technical default, not a statement of legal retention obligations. A future explicit legal or product decision may add archival or category-specific retention without changing audit identity or correction chains. Outbox delivery state, Notifications, analytics, and derived read models may use separate retention policies.

## Durable external-delivery outbox

The canonical outbox path is:

```text
/domain_outbox/{outboxId}

outboxId = hash("outbox:v1", commandId, deliveryEffectOrdinal)
```

One record represents one independently retryable delivery obligation. `deliveryEffectOrdinal` is assigned deterministically by the command's bounded, versioned delivery plan, so replay cannot create a duplicate or reorder identity.

The obligation's immutable decision data identifies the origin command and Activity Log, recipient reference, channel, predetermined template and version, bounded render inputs, and delivery semantics. Mutable delivery metadata uses this state machine:

```text
pending -> leased -> delivered
                 \-> pending       retry/backoff
                 \-> dead_letter   terminal delivery failure
```

Workers may lease, render the predetermined template, deliver, retry with backoff, and mark `delivered` or `dead_letter`. They may not decide Booking or CourseEnrollment lifecycle, Payment or refund policy, Attendance, AdminIssue business resolution, capacity, resource claims, relationships, or access policy. A worker also may not introduce hidden dynamic recipient or channel fan-out outside the committed delivery plan.

Delivery is at least once. Workers use the deterministic `outboxId` as a downstream idempotency key where supported. A Firestore Notification created from an obligation uses a deterministic ID derived from outbox identity where applicable.

Each `CommandKind` implementation declares a bounded, versioned delivery plan that participates in the complete ADR-0002 preflight. This ADR does not freeze which product command sends which message, recipient, or channel. If notification fan-out alone would exceed a safety budget, the delivery plan must reduce or coalesce obligations without changing canonical business atomicity; otherwise the command returns `operation_too_large` before writes.

## Access and query model

Raw `/activity_logs` documents are server-owned and available only to authorized Administrator/internal tooling. They are never exposed directly to Account Owners, Participants, or Instructors. A single command envelope may contain several affected subjects, internal reason codes or explanations, Administrator context, and references to financial or operational entities; Firestore document-level authorization cannot safely reveal only selected fields or effects.

Account Owner and Participant history uses a prepared, sanitized read model or server interface. Instructor history uses a prepared, sanitized operational read model or server interface. These projections apply subject-level authorization and field minimization, are rebuildable from Activity Logs, and are not part of audit durability.

Canonical v1 uses bounded `affectedSubjectKeys[]` rather than separate subject-index documents. Primary raw Administrator/internal query indexes are:

- `affectedSubjectKeys ARRAY_CONTAINS + decidedAt DESC`;
- `actor.actorKey + decidedAt DESC`;
- `command.kind + decidedAt DESC`;
- `correlationId + decidedAt DESC`;
- `exercisedCapability + decidedAt DESC`;
- `actor.kind + decidedAt DESC`.

Separate subject-index documents are deferred unless measurement proves the bounded array strategy insufficient.

## Sensitive-data minimization

Activity Logs and outbox records store only canonical identifiers, structured reasons, closed bounded effects, and the minimum delivery inputs required by the predetermined template. They do not store unnecessary:

- guest email or phone snapshots;
- signed tokens, credentials, nonces usable as credentials, or App Check/security material;
- provider raw payloads;
- private chat contents;
- full Participant or Account profiles;
- Wallet balances;
- raw financial or accounting details.

Human explanation normalization enforces the size limit and must reject or sanitize forbidden sensitive fields before transaction assembly. Sanitization must not silently turn required structured audit facts into unstructured free text.

## Reconciliation and failure boundaries

Audit reconciliation is read-only. It may detect at least:

- a successful authoritative mutation with no deterministic Activity Log;
- duplicate or inconsistent audit identity;
- missing actor, capability, or required reason;
- invalid subject or revision references;
- missing referenced monetary event or AdminIssue;
- an orphaned outbox obligation;
- delivered outbox state without a durable origin;
- a forbidden sensitive audit field.

A mismatch may create or reuse `audit_reconciliation_mismatch` through a separate bounded canonical system command. That command is itself audited and follows the same atomicity rule. If the audit subsystem is unavailable such that this AdminIssue command cannot commit with its own required Activity Log, reconciliation emits a critical out-of-band operational alert and creates no weakened or unaudited issue.

Reconciliation never silently backfills a fake historical Activity Log, rewrites audit, deletes duplicates, repairs canonical domain state from audit, or treats a later mismatch issue as the missing original audit record.

## Recovery and derived projections

Canonical business recovery never depends on replaying Activity Logs. Booking, CourseEnrollment, Payment, Wallet, Attendance, and AdminIssue recover from their own canonical records and applicable dedicated histories or reconciliation policies.

The following may be rebuilt from Activity Logs:

- sanitized Account Owner, Participant, and Instructor history;
- audit search and subject projections;
- reporting and analytics.

Rebuilding these projections neither mutates historical Activity Logs nor makes the projections audit authority.

## Trigger policy

No Firestore trigger may create required audit, decide a canonical business mutation, or change lifecycle, Payment, Attendance, capacity, resource claims, relationships, or access policy. Canonical v1 prefers explicit command execution and explicit outbox workers over hidden trigger behavior.

A trigger may support optional non-authoritative wakeup, analytics, export, or observability when justified, but its failure cannot make a successful command unaudited or change canonical state.

## Versioned safety limits

Canonical v1 uses these application safety limits:

| Item                                                         |    v1 limit |
| ------------------------------------------------------------ | ----------: |
| Unique affected subjects and deduplicated subject query keys |          64 |
| Semantic effects                                             |          32 |
| Monetary-event references                                    |          32 |
| AdminIssue references                                        |          32 |
| Resulting revision references                                |          64 |
| Outbox obligations per command                               |          32 |
| Normalized human explanation                                 |       1 KiB |
| Target serialized Activity Log document size                 |      64 KiB |
| Target serialized outbox obligation size                     | 32 KiB each |

These are versioned technical safety limits, not business cardinalities, legal rules, Firestore platform limits, or permission to consume the entire transaction budget. A command whose full plan exceeds a limit returns `operation_too_large` before writes unless a more specific stable validation error applies. A future audit schema version may revise them without weakening an already accepted business invariant.

## Revised ADR-0002 transaction budget

The Activity Log adds one mutation and no normal transaction read. Each outbox obligation adds one mutation and no normal transaction read. The idempotency mutation and read already belong to ADR-0002's published planning estimates. At the maximum delivery plan, audit and delivery therefore reserve 33 mutations:

```text
1 Activity Log + 32 outbox obligations = 33 mutations
```

For conservative final sizing, the following table adds the full 33-mutation reservation to ADR-0002's published upper representative estimates without taking credit for the unspecified Activity Log and outbox allowance already present in those estimates. This intentionally overstates rather than hides overlap:

| Representative operation                                                                                        | ADR-0002 published upper estimate | Maximum Activity Log and outbox addition | Conservative revised planning ceiling | Read ceiling |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------: | ---------------------------------------: | ------------------------------------: | -----------: |
| Individual Booking                                                                                              |                      30 mutations |                                       33 |                          63 mutations |     35 reads |
| Eight-Participant Booking                                                                                       |                      80 mutations |                                       33 |                         113 mutations |    100 reads |
| Multi-Participant Course enrollment (`P=8`, `D=10`, two buckets per interval, four actual roster relationships) |                     330 mutations |                                       33 |                         363 mutations |    330 reads |
| Course transfer (ten-Day old and new Courses, two buckets per interval)                                         |                     180 mutations |                                       33 |                         213 mutations |    200 reads |

The revised illustrative worst case is about 363 mutations and 330 reads, below ADR-0002's 400-mutation and 400-read application budgets. It leaves approximately 37 mutation slots of headroom in that fixture. Actual delivery plans usually contain fewer than 32 obligations.

At their target serialized sizes, one Activity Log plus 32 outbox obligations contribute at most approximately 1.063 MiB of document payload before index impact. A full-fan-out plan therefore has at most approximately 4.9 MiB of the 6 MiB application estimate available for all other documents and affected index entries; that arithmetic is planning guidance, not a substitute for the estimator.

ADR-0002's complete mutation-plan preflight remains authoritative. Every command must use actual subject, CourseDay, relationship, bucket, financial, audit, delivery, document-size, and index estimates. Any plan above 400 reads, 400 mutations, approximately 6 MiB, a stricter discovered SDK/Emulator limit, or a v1 Activity Log or outbox limit returns `operation_too_large` before writes. Business atomicity is never weakened and an approved operation is never silently converted to a saga merely to fit notification fan-out.

## Required verification

Implementation is not complete until automated verification covers:

- exactly one deterministic Activity Log for every successful state-changing `CommandKind`;
- no Activity Log for rejection, denial, failed validation, read-only work, or matching replay;
- transaction rollback when required Activity Log or outbox staging fails;
- `audit_integrity_violation` on collision or inconsistent identity, with no overwrite or domain write;
- create-only Rule and server enforcement, including denial to client, Instructor, Administrator client, worker, and maintenance paths that lack the explicit canonical correction command;
- actor identity and exercised capability separation for Account, guest credential, system, and provider actors;
- reason registry and mandatory explanation matrices;
- `decidedAt` versus server `committedAt` behavior under transaction retry;
- absence of monetary duplication, sensitive fields, raw provider payloads, and generic diffs;
- deterministic outbox and Notification identities, at-least-once delivery, leasing, retry, backoff, and dead-letter behavior;
- proof that workers cannot mutate canonical business state or add hidden fan-out;
- sanitized subject and Instructor history authorization;
- raw Administrator/internal queries and required indexes;
- correction chains that leave original Activity Logs unchanged;
- read-only reconciliation and the out-of-band alert boundary when audited issue creation cannot commit;
- transaction preflight at 0, typical, and 32 outbox obligations, including the near-budget multi-Participant Course fixture;
- payload and affected-index estimation against Firestore Emulator and representative production SDK behavior.

## Legacy replacement targets

This is a clean canonical rewrite. The implementation must replace, not wrap or preserve, the current best-effort and mutable audit/delivery paths, including:

- the existing Activity Log types and helpers in `src/types/activity.ts` and `src/domain/activity/activityLog.ts`;
- client, Instructor, profile-sync, booking, and achievement code that writes or mutates Activity Logs directly;
- completion and scheduled paths that mutate domain state before writing audit;
- Firestore Rules that permit direct client or Instructor Activity Log creation or update;
- nondeterministic Notification creation and cleanup assumptions where a canonical outbox obligation is the origin;
- legacy optional `/function_idempotency` behavior for authoritative mutations.

No legacy Activity Log is transformed into canonical audit history during the clean cutover.

## Deliberately deferred decisions

The following are non-blocking implementation or product decisions and must remain consistent with this ADR:

- exhaustive versioned reason-code and semantic-effect registries for each `CommandKind`;
- the versioned command-to-recipient/channel/template delivery matrix;
- exact sanitized Account Owner, Participant, and Instructor history projection schemas and refresh mechanics;
- lease duration, retry schedule, dead-letter operational response, and provider-specific downstream idempotency adapters;
- legal review and any future archival or category-specific retention policy;
- measured payload/index estimator calibration and whether later evidence justifies separate subject-index projections.

Whole-Course cancellation remains out of scope. This ADR neither introduces nor approves its lifecycle, refund, capacity, Attendance, notification, or transaction semantics.

## Considered alternatives

### One Activity Log per affected aggregate

Rejected. It duplicates one decision, creates ambiguous correction and causation chains, increases transaction growth with aggregate count, and can partially represent a multi-aggregate command. One bounded command envelope preserves the actual decision boundary.

### Best-effort or asynchronously materialized Activity Log

Rejected. A successful domain mutation could then exist without required audit, and reconciliation could only invent later history. Required audit is part of the authoritative transaction.

### Activity Log as financial or current-state event source

Rejected. It would compete with monetary events, Payment, Attendance, AdminIssue, and lifecycle aggregates and would make recovery depend on a schema optimized for accountability rather than state reconstruction.

### Put delivery attempts in Activity Log

Rejected. Delivery has mutable leases, retries, and terminal operational state, while audit history is immutable. The outbox owns delivery state and references its durable origin.

### Expose raw multi-subject logs to subject readers

Rejected. Firestore document authorization cannot redact unrelated subjects, internal reasons, or financial and operational references. Sanitized prepared read models provide the correct seam.

### Generic Firestore diff or full snapshots

Rejected. They increase sensitive-data and payload risk, bind audit to storage implementation, and create an unversioned escape hatch around the closed semantic model.

### Trigger-created required audit or business effects

Rejected. Hidden post-commit behavior cannot satisfy atomic audit durability and spreads canonical policy outside `CanonicalCommands`.

## Consequences

### Benefits

- A committed authoritative mutation and its audit record cannot diverge through normal command execution.
- One identity ties command replay, audit, financial causation, and delivery obligations together without duplicating the business decision.
- Mutable external delivery remains retryable without mutating audit or rolling back canonical state.
- Financial, Attendance, AdminIssue, and lifecycle authorities remain explicit and recover independently.
- Closed bounded effects, deterministic identities, and preflight limits keep the command interface deep and transaction growth measurable.
- Sanitized read models can enforce subject-specific visibility without weakening internal audit detail.

### Costs

- Every state-changing command must build and validate an audit envelope and delivery plan before commit.
- The maximum outbox plan reserves 33 transaction mutations and approximately 1.063 MiB of target document payload before index impact.
- Administration requires explicit audit correction workflows instead of document edits.
- Outbox workers, reconciliation, critical alerting, sanitized history projections, Rules, and indexes require dedicated implementation and verification.
- Indefinite retention requires operational storage planning and future legal review.
