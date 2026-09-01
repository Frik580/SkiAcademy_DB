---
status: accepted
date: 2026-08-23
---

# ADR-0002: Server Command, Transaction and Resource Model

Carve Academy will place every authoritative business mutation behind one deep server command module whose interface is `CanonicalCommands.execute`. Commands express a closed set of business intents, authorize and revalidate against current state, and commit every invariant-related state change in one Firestore transaction. Deterministic resource claims, versioned bucket guards, aggregate revisions, and durable idempotency make conflicts and retries explicit without allowing clients, transport wrappers, schedulers, or triggers to implement lifecycle policy independently.

This ADR refines the canonical topology in [ADR-0001](./0001-canonical-aggregate-topology.md) and the Phase 2 direction in the [canonical rewrite specification](../specs/canonical-booking-domain-rewrite.md). It decides command, transaction, concurrency, resource-conflict, capacity, scheduling, and error mechanics. [ADR-0003](./0003-payment-accounting-source.md) resolves Payment accounting, [ADR-0004](./0004-attendance-outcome-and-admin-issue-model.md) resolves Attendance evidence and correction, [ADR-0005](./0005-audit-durability-and-transaction-policy.md) resolves Activity Log durability, asynchronous outbox delivery, and retention within the transaction constraints established here, and [ADR-0007](./0007-guest-identity-payment-and-confirmation.md) resolves guest identity linking and payment-funded confirmation.

## Decision overview

```text
Callable / administration / instructor / guest / scheduler / seed adapter
                                  |
                                  v
                  CanonicalCommands.execute(envelope)
                                  |
                 authenticate + authorize capability
                 load current canonical state
                 validate intent and lifecycle
                 build and verify mutation plan
                                  |
                                  v
                       one Firestore transaction
                 aggregate + Payment/Wallet effects
                 claims/guards + capacity/relationships
                 Activity Log + required outbox + idempotency
                                  |
                                  v
                    stable result or canonical error
```

The module is deliberately deep: callers learn one interface while authorization, time policy, lifecycle transitions, concurrency, resource acquisition, capacity, financial coordination, audit durability, and Firestore mechanics remain local to its implementation. Transport and test adapters use the same seam.

## Canonical command interface

The conceptual interface is:

```ts
CanonicalCommands.execute<K extends CommandKind>(
  envelope: CommandEnvelope<K>,
): Promise<CommandResult<K>>
```

`CommandKind` is a closed discriminated union of intent-oriented operations. It includes intents in the following families:

- Booking creation and payment-funded guest confirmation (`confirm_guest_booking`);
- Booking cancellation request, withdrawal, and resolution;
- Booking reschedule, Instructor change, duration change, party change, completion, and no-show;
- Course Enrollment creation, transfer, withdrawal, cancellation request, `resolveCourseEnrollmentCancellation`, and payment-funded guest confirmation (`confirm_guest_course_enrollment`);
- Booking Proposal creation, acceptance, cancellation, and expiration;
- Booking Change Request creation, withdrawal, and resolution;
- guest reservation expiration, payment-start enforcement, and Attendance/outcome resolution;
- Participant management, block, Payment, Wallet, and correction intents approved by their applicable domain decisions.

The union must not contain generic mutation operations such as `setStatus`, `transitionTo`, `patchBooking`, or `adjustWallet`. A caller submits business intent and the command chooses the allowed transition and effects. Client-controlled target lifecycle state, price delta, capacity delta, claim set, `bookingOrigin`, or audit record is invalid input.

Whole-Course cancellation is not a `CommandKind` in this ADR. Only Course Enrollment cancellation is currently defined. A school-wide Course cancellation requires a future decision covering Course status, every Enrollment, refunds, capacity, notifications, and whether the operation can remain atomic.

### Command context

Every envelope has a trusted command context and an intent payload. The context carries:

- actor identity: Account, guest-token subject, or named system actor;
- exactly one exercised capability for the operation, such as Account Owner/Participant manager, Instructor, Administrator, or a named system capability;
- mandatory idempotency key and request fingerprint inputs;
- optional `expectedRevision` for an existing target aggregate, mandatory for interactive mutation;
- correlation ID and optional causation ID;
- sanitized transport/source metadata for diagnostics, never as authorization evidence;
- calendar input and an IANA timezone only when an authorized creation or schedule-change intent requires them;
- access to an injected authoritative clock.

Identity and capability are different facts. An Account can exercise an Instructor or Administrator capability only when trusted claims and/or current canonical relationship documents authorize it. A guest identity is the verified subject and scope of a guest action token. A system actor names its job or provider-callback purpose; it is not an unrestricted bypass.

Authentication and payload decoding belong in transport adapters. The command implementation validates the exercised capability and all state-dependent authorization. Where authorization depends on a Participant management relationship, Instructor Relationship, block, aggregate assignment, or similar canonical document, the command reads it in the transaction that performs the mutation. Administrator SDK access bypasses Firestore Rules, so possession of server credentials alone is never treated as domain authorization.

`bookingOrigin` is derived by server policy from the authenticated actor, exercised capability, and initiating intent. The caller cannot submit or override it. The command clock is injected by trusted server composition, not supplied in a client payload. Each Firestore transaction attempt obtains one `decidedAt` value from that clock and uses it consistently for that attempt; a retry re-evaluates time-sensitive rules. Commands validate any supplied timezone as an IANA identifier and reconcile it with authoritative Course/resource configuration; they never infer calendar semantics from the server locale. Persisted intervals use UTC Firestore `Timestamp` values, use half-open semantics, and retain the authoritative IANA timezone needed for calendar interpretation and future schedule changes.

### Responsibilities inside and outside the module

Inside `CanonicalCommands`:

- authorization and state-dependent capability checks;
- lifecycle and domain-invariant validation;
- authoritative price, refund, Payment, Wallet, capacity, and outcome calculations delegated to deterministic internal modules;
- aggregate revision checks;
- resource claim and guard planning;
- bounded transaction preflight;
- transaction assembly, retry-safe execution, idempotency, and canonical error translation;
- the immutable Activity Log and any required deterministic outbox obligations defined by ADR-0005.

Outside `CanonicalCommands`:

- authentication protocol, transport decoding, response serialization, and rate limiting;
- scheduler candidate discovery;
- external notification or provider delivery after a durable outbox entry exists;
- read-model projection and presentation formatting;
- reference/configuration export and destructive reset orchestration.

Callable, guest, administration, Instructor, scheduled, provider-callback, and seed adapters must remain thin. Seed tooling uses commands whenever it creates canonical business state such as Course Days and their claims. The clean reset may delete explicitly approved development/test collections as infrastructure work; it must not imitate domain cancellation or create historical business records.

No Firestore trigger may implement a canonical lifecycle, financial, capacity, claim, or relationship mutation. Triggers may only support non-authoritative observability or delivery work that cannot feed back into domain state.

## One business operation, one transaction

One approved business operation uses one Firestore transaction for every state change whose partial completion could violate a canonical invariant. Depending on the intent, the atomic set can include:

- Booking or one or more Course Enrollments;
- Payment State, Wallet balance/ledger effects, and monetary history required by the Payment ADR;
- Participant management or relationship changes;
- active Course Enrollment guard;
- resource claims and guard entries;
- pre-start Course seat claims and `availableSeats` projection;
- Attendance-dependent lifecycle outcome or Admin Issue;
- one required immutable Activity Log and any required domain outbox obligations;
- command idempotency record.

The transaction reads every document used to authorize, validate, calculate, or detect conflict before issuing writes. Its callback performs no external I/O, sends no notifications, calls no payment provider, and emits no best-effort side effect because Firestore may retry the callback.

This rule preserves, in particular:

- all-or-nothing creation of up to eight Course Enrollments in one multi-Participant enrollment command;
- atomic release of old and acquisition of new resources during reschedule;
- atomic Course transfer, including old/new capacity, guards, claims, Payment/Wallet difference, and durable audit evidence;
- atomic Booking party changes and their per-Participant claims and Payment effects.

Writing an aggregate, then separately changing Wallet, capacity, a lock, or audit state is forbidden when partial completion would violate an invariant. An approved atomic operation is never silently converted to a saga. If it cannot fit safely, it fails before any mutation. Splitting is permitted only for work that is not part of the approved business invariant, such as outbox delivery after the outbox record was committed atomically.

## Firestore transaction safety budgets

Firestore currently documents a 10 MiB maximum API request size, a 270-second transaction limit with 60-second idle expiration, and 500 field transformations on a single document in a Commit or transaction. The 500 figure is not a documented limit on the number of document writes. Firestore transaction documentation also describes automatic retries, reads-before-writes, a 20-second lock deadline, and request-size effects from document and index entries. See the official [Firestore quotas](https://firebase.google.com/docs/firestore/quotas) and [transaction documentation](https://firebase.google.com/docs/firestore/manage-data/transactions).

Carve Academy therefore adopts conservative application-level v1 budgets with operational headroom:

- at most 400 document reads;
- at most 400 document mutations, counting creates, updates, and deletes;
- approximately 6 MiB estimated request and affected-index payload;
- any stricter limit discovered in the deployed production SDK or Emulator/integration testing.

These are technical safety budgets, not Firestore platform limits or permanent domain cardinality rules. The implementation must centralize them in versioned configuration and verify the estimator against Emulator-backed integration tests and representative production-SDK behavior before release.

### Preflight and cardinality

Every command builds an internal mutation plan. A cheap static preflight rejects payloads that are necessarily too large. The authoritative preflight occurs after reading the actual Course Days, Instructor assignments, Participant relationships/blocks, bucket spans, existing guard contents, and required financial/audit effects inside the transaction. The command proceeds only when the complete plan fits every budget.

The approved canonical cardinalities are:

- a Booking party contains 1 through 8 unique Participants;
- an atomic multi-Participant Course enrollment command creates 1 through 8 Enrollments.

This ADR does not cap `Course.totalSeats`, the Course Instructor roster, or the number of Course Days. Total Course capacity does not determine transaction size when a command mutates only a bounded enrollment batch. Course Day and Instructor-related growth is calculated from the actual command plan. If operational evidence later proves that a technical Course-Day maximum is unavoidable, that evidence must be surfaced for a separate approval; it is not inferred from the v1 safety budgets.

Let:

- `P` be Participants mutated by the command (`P <= 8`);
- `D` be the actual Course Days affected;
- `R` be the actual Instructor relationships/block checks required;
- `B(i)` be the number of active guard buckets spanned by interval `i` under the current guard strategy;
- `F` and `A` be the financial documents and the Activity Log plus outbox documents required by their accepted ADRs.

The principal transaction growth is:

| Operation                           | Principal growth                                                                                                                                                                                                                                               | Representative v1 planning estimate                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Individual Booking                  | one Booking, one Instructor claim, one Participant claim, their bucket guards, Payment/Wallet, idempotency, Activity Log, and required outbox obligations                                                                                                      | commonly 15–30 mutations and 15–35 reads                                                                                                       |
| Eight-Participant Booking           | one Booking, one Instructor claim, eight Participant claims, up to `sum(B(i))` guard mutations, Participant authorization/block checks, Payment/Wallet, idempotency, Activity Log, and required outbox obligations                                             | commonly 35–80 mutations and 40–100 reads                                                                                                      |
| Multi-Participant Course enrollment | `P` Enrollments, active guards, seat claims and Payments; `P * D` Participant/Course-Day claims; their bucket guards; actual `P * R` block checks; Course projection; idempotency; Activity Log; and required outbox obligations                               | for an illustrative `P=8`, `D=10`, two buckets per interval, and four actual roster relationships: roughly 250–330 mutations and 220–330 reads |
| Course transfer                     | one Enrollment; old/new active guards and seat claims; old/new Course projections; Participant claims and guards across `D_old + D_new`; actual new-Course block checks; Payment/Wallet difference; idempotency; Activity Log; and required outbox obligations | for illustrative ten-Day old and new Courses with two buckets per interval: roughly 100–180 mutations and 110–200 reads                        |

The examples are sizing fixtures, not guaranteed document counts and not domain limits; ADR-0003 and ADR-0005 define the financial, Activity Log, and outbox constants that complete these estimates. The normative worst supported command is the largest actual plan that stays at or below 400 reads, 400 mutations, and approximately 6 MiB with all accepted-ADR effects included. Tests must cover representative plans near each rejection threshold. A budget failure returns `operation_too_large` without a partial write.

The accepted Payment, Attendance, and Audit decisions in ADR-0003 through ADR-0005 participate in the complete preflight and preserve this headroom. If their required atomic documents make multi-Participant enrollment, reschedule swap, Course transfer, Payment atomicity, or audit durability exceed the budgets, implementation stops and surfaces the constraint for approval instead of weakening those guarantees.

## Optimistic concurrency and revisions

Every mutable canonical aggregate has an integer `revision`. Creation establishes the initial revision; every successful mutation increments it exactly once even if the command also changes dependent documents.

Interactive mutation of an existing aggregate requires `expectedRevision`. A mismatch returns `stale_version` with the current revision when it is safe to expose. Create commands assert that their opaque target ID is absent. Scheduled/system commands discover candidates outside the transaction but do not trust a candidate revision; they reload current state and revalidate eligibility in the transaction.

Revision protects a caller's intent relative to the target aggregate. Firestore transaction read/write conflicts protect dependent documents such as claims, guard buckets, Course capacity, Wallet, Payment, relationships, and idempotency records. Firestore `updateTime` may be used internally as an adapter optimization but is not part of the command interface.

When commands race:

- two acquisitions of the same Instructor or Participant interval serialize on the same guard document; one succeeds and the other receives the applicable conflict;
- two admissions for the final Course seat serialize on the Course capacity document; one succeeds and the other receives `course_full`;
- cancellation racing with completion, or an administration edit racing with a client reschedule, fails the losing interactive intent with `stale_version` or `invalid_transition` after retry;
- a party addition racing with `startAt` or payment enforcement re-evaluates authoritative time and Payment state and cannot commit using stale preflight data;
- exhaustion of retryable Firestore contention becomes `concurrent_modification`, not a raw SDK error or last-write-wins update.

## Idempotency

Every authoritative mutation requires an idempotency key, including administration, guest, Instructor, scheduled, financial, capacity-changing, and provider-callback commands. Read-only queries do not.

The server derives the record path `/command_idempotency/{commandKey}` where `commandKey` is `SHA-256` over an unambiguous canonical encoding of the normalized actor scope and caller-provided key. The document stores the actor scope, `CommandKind`, a canonical request fingerprint, completion state, stable result/error representation, aggregate references, correlation information, and timestamps without placing personal data in the path.

The fingerprint covers every semantic payload field and command kind after canonical normalization. It excludes transport noise and server-derived fields such as `decidedAt` and `bookingOrigin`.

Idempotency behavior is:

- same key, actor scope, command kind, and fingerprint after a committed outcome returns the exact stored result without repeating effects;
- the same scoped key with a different kind or fingerprint returns `idempotency_conflict`;
- the domain mutation and its completed idempotency record commit in the same Firestore transaction;
- deterministic domain rejections reached after command dispatch may be committed as replayable outcomes; authentication, malformed transport, and transient platform failures that commit no record may be retried;
- a transaction retry observes an existing matching record before planning new writes.

There is no automatic idempotency TTL in v1. A later retention decision may archive or remove records only after it defines a command-specific replay horizon and proves that an old financial, capacity, or lifecycle request cannot be executed again as new work.

## Resource claims and time conflicts

Resource claims are server-owned enforcement representations. They are not editable business aggregates and never replace the Booking, Course, Course Day, Course Enrollment, or administrative intent that owns them.

### Claims

`/resource_claims/{claimId}` holds a normalized claim with:

- claim strategy version and claim kind;
- resource kind and opaque resource ID;
- owner kind, owner ID, and occurrence ID;
- exact UTC `startAt` and `endsAt` for time claims;
- enforcement lifecycle needed for active, released, or frozen behavior;
- aggregate revision/correlation metadata sufficient for reconciliation.

The claim ID is a deterministic hash of versioned, canonical identity inputs such as claim kind, resource, owner, and occurrence. It contains no personal data. Replaying acquisition for the same occurrence addresses the same claim. Moving to another resource or occurrence produces the correct new identity and atomically removes/releases the old one.

The canonical claim set is:

- one Instructor time claim per Booking occurrence;
- one Participant time claim per Booking Participant;
- one actual Instructor time claim per Course Day assignment, acquired when that Course Day is created or reassigned, not once per Enrollment;
- one Participant time claim per Course Enrollment and Course Day;
- one pre-start Course seat claim per capacity-occupying Enrollment;
- administrative availability-block claims for the resource and exact interval they block;
- the separate deterministic `/active_course_enrollment_guards/{participantId_courseId}` uniqueness guard.

Time-claim release follows the owner's remaining schedule obligation and is independent of Course capacity. A cancellation, withdrawal, reschedule, reassignment, or party change releases each obsolete interval that has not started in the same transaction that changes the owner. An interval already in progress remains claimed through its `endsAt` and may be pruned afterward by non-domain maintenance. Thus a post-start Course Enrollment cancellation or withdrawal may release that Participant's future Course Day claims, but it never releases the frozen seat or increases `availableSeats`; past and in-progress Course Day claims are not reopened. Pre-start seat claims release exactly once for `cancelled` or `withdrawn`; at/after Course start they freeze. Empty guard documents may be deleted. Historical truth remains in canonical aggregates and Activity Logs, not in released claims.

### Versioned hybrid bucket guards

Time conflicts use a hybrid of deterministic bucket guards and exact interval comparison:

1. Interpret all intervals as half-open `[startAt, endsAt)` with `endsAt > startAt`. Therefore adjacent intervals are allowed.
2. Expand the candidate interval into every UTC bucket touched by the active guard strategy.
3. Read every corresponding `/resource_claim_guards/{bucketKey}` document in the transaction.
4. Compare the candidate against every active entry using the exact overlap predicate `a.startAt < b.endsAt && b.startAt < a.endsAt`.
5. If no prohibited overlap exists, write the claim and its compact entry into every touched guard document atomically.

The v1 strategy uses 12-hour UTC buckets. Bucket size is a versioned technical parameter, not a Booking or Course domain invariant and not a maximum service duration. A bucket key encodes or hashes `strategyVersion`, resource kind, resource ID, and bucket start. An interval may span any number of buckets that its complete command plan can afford.

Changing the bucket strategy requires an explicit guard migration or dual-read/dual-write window. A deployment must never stop checking a version that still has active claims. Guard-entry count and document/request byte estimates are also versioned technical safety settings; saturation is rejected before mutation rather than allowing an unchecked interval.

For reschedule, reassignment, or party change, the command reads the union of old and new guard documents, ignores only claims owned by the exact occurrence being replaced, validates the final set, and applies release plus acquisition atomically. Course seat capacity does not use time-bucket contention: the Course projection document serializes admission, while deterministic seat claims make occupancy reconcilable.

Fixed one-hour locks are rejected because they cannot represent arbitrary duration or Course Days. Bucket occupancy without exact comparison is rejected because it would create false conflicts. Interval queries alone are rejected because Firestore cannot predicate-lock an empty query result against a concurrent overlapping insert. The hybrid makes contenders mutate a shared deterministic document while preserving exact time semantics.

## Course capacity

Before `course.startAt`, each `pending`, `confirmed`, or `pending_cancellation` Course Enrollment owns one seat claim and contributes one unit of active pre-start occupancy. Guest CourseEnrollment creation therefore consumes the seat while the enrollment is still `pending`. Payment-funded confirmation does not consume another seat, recreate claims, or create another Payment; see [ADR-0007](./0007-guest-identity-payment-and-confirmation.md). `cancelled` and `withdrawn` release that claim exactly once. In the same transaction, the server maintains:

```text
availableSeats = totalSeats - active pre-start seat occupancy
```

The projection must remain within `0..totalSeats`. Admission reads and writes the Course capacity document, so competing requests for the final seat serialize. The active Course Enrollment guard is acquired or moved in the same transaction and prevents two active Enrollments for the same Participant/Course pair.

The active Enrollment guard follows lifecycle uniqueness rather than capacity accounting: it is acquired for active states, moved atomically on transfer, and released on the applicable terminal transition. Releasing it after Course start cannot enable re-enrollment because the independent no-late-admission rule is still rechecked by every enrollment command.

At and after `course.startAt`, normal admission is closed and capacity freezes. Later `cancelled`, `withdrawn`, `completed`, `no_show`, or `isDeleted` changes do not increase `availableSeats`. `availableSeats` is never client-controlled and is not a second business source of truth; it is a transactionally maintained projection that is checked against seat claims by reconciliation.

Neither `totalSeats` nor Instructor roster size is capped by this ADR. High total capacity can create many Enrollment documents over time without making one bounded enrollment command mutate them all.

## Full-payment start gate

The payment-start gate is defensive canonical protection for confirmed or otherwise start-eligible subjects that are underfunded at `startAt`, including Administrator-created confirmed underpayment and other exceptional states. It is not the normal guest-approval mechanism. The intended guest flow remains unpaid → pending, then fully funded → confirmed, as decided in [ADR-0007](./0007-guest-identity-payment-and-confirmation.md).

A scheduled system adapter discovers Bookings and Course Enrollments that may have reached their applicable `startAt` while underpaid and invokes the payment-start command with a deterministic idempotency key. The command transactionally and idempotently:

- reloads the aggregate and current Payment State;
- rechecks authoritative time and full-payment status;
- creates or reuses the deterministic payment Admin Issue;
- establishes the operational restriction that blocks service and automatic completion;
- writes the required immutable Activity Log, any required outbox obligations, and idempotency record.

The deterministic issue identity includes the subject and applicable start-gate occurrence so repeated scheduler runs converge. Instructors receive only the operational restriction, such as “Payment required—do not start,” and not private financial details.

Payment completed before `startAt` clears the restriction through the same transactional command model. Payment after a missed start does not itself make the occurrence deliverable. If an Administrator later reschedules an underpaid individual Booking to a future `startAt` with client agreement, the reschedule transaction also resolves or supersedes the old payment-start issue, clears the obsolete restriction, and establishes the correct gate identity for the new time. Late Course payment never permits joining a Course that has already started; administration resolves the Enrollment under the approved incomplete-payment cancellation rules.

## Scheduled commands and external effects

Schedulers discover candidates only. They may query expiration, start-gate, or outcome indexes and batch candidate IDs, but every decision is revalidated inside a system command. Duplicate delivery, stale query results, and overlapping scheduler runs are expected and safe through transactional idempotency and current-state checks.

The canonical patterns are:

- guest reservation expiration: discover due unpaid pending reservations, then execute an expiration intent that rechecks lifecycle, TTL, start time, current confirmation, and that Payment is not fully funded;
- guest confirmation reconciliation: recover rare fully funded Payment / pending-or-ineligible lifecycle divergence; the sweep is not the primary confirmation path;
- payment start gate: discover possibly due underpayment, then execute the transactional gate described above;
- 24-hour Attendance/outcome resolution: discover due subjects, then execute a command that rechecks time, Attendance sufficiency, payment restriction, cancellation state, and unresolved Admin Issues;
- outbox retry and notification processing: claim delivery work idempotently, perform the external effect outside the domain transaction, and transactionally record delivery outcome or escalation without rewriting domain history.

Firestore triggers do not perform lifecycle mutations. A trigger or queue consumer may wake delivery infrastructure after an outbox write, but the committed outbox is the durable handoff.

## Stable command errors

Adapters receive canonical errors rather than raw Firestore, provider, or Rules failures. An error contains a stable code, sanitized structured details, correlation ID, retryability, and current revision when safe and relevant. The v1 taxonomy includes:

- `unauthorized` — no valid actor authentication or guest token;
- `forbidden` — authenticated actor cannot exercise the requested capability;
- `validation` — malformed or domain-invalid payload;
- `insufficient_funds`;
- `payment_required`;
- `resource_conflict`;
- `participant_conflict`;
- `instructor_conflict`;
- `course_full`;
- `duplicate_active_enrollment`;
- `stale_version`;
- `concurrent_modification`;
- `invalid_transition`;
- `blocked_relationship`;
- `expired`;
- `unavailable`;
- `idempotency_conflict`;
- `operation_too_large` — the complete plan exceeds an internal transaction or document safety budget.

Expected invariant failures use the most specific code. Infrastructure failures are mapped to a retryable canonical error without leaking collection paths, stack traces, token contents, financial detail, or SDK messages.

## Authorization and direct client writes

Canonical mutation authorization belongs to server commands. Firestore Rules remain defense in depth for client access and the primary enforcement for permitted reads, but Rules do not duplicate the complete lifecycle or transaction policy.

Clients must not directly mutate:

- Booking lifecycle, schedule, party, price, or server-owned provenance;
- Course Enrollment, capacity, seat state, or active guard;
- Payment, Wallet, financial history, or payment restrictions;
- Attendance outcomes or Admin Issues;
- Participant management and Instructor Relationships;
- resource claims or guard documents;
- Activity Logs, domain outbox, or command idempotency;
- proposals, change requests, and blocks where a command must coordinate authorization or effects.

Only strictly allowlisted, user-owned, non-authoritative Account profile presentation preferences may remain direct writes, for example locale, theme, notification preferences, and validated display/avatar fields. Identity, role/capability claims, Wallet data, Participant learning state, management relationships, and any field consumed by a canonical invariant require an authorized server command or dedicated trusted identity adapter. Sanitized read models are server-owned even when their source is user-editable.

## Activity Log and outbox transaction seam

[ADR-0005](./0005-audit-durability-and-transaction-policy.md) resolves this seam. Every successful authoritative state-changing command writes exactly one immutable Activity Log in the same transaction as its domain mutation and writes zero or more deterministic outbox obligations required by its delivery plan in that transaction.

A successful domain mutation followed only by a best-effort or asynchronously materialized audit write is forbidden. There is no Activity Log materialization lag. External effects occur after commit from the durable outbox; delivery may lag, retry, or dead-letter independently without changing audit completeness. ADR-0005's Activity Log and outbox documents participate in this ADR's complete command preflight budget.

## Testing seam

`CanonicalCommands.execute` is the primary command test surface. Contract tests exercise each `CommandKind` with actor identity, capability, revision, idempotency, and clock variations. Callable, guest, administration, Instructor, scheduled, and provider adapters have thinner authentication/serialization tests and selected end-to-end tests proving that they invoke the same module.

Pure unit tests cover deterministic lifecycle decisions, interval expansion and exact overlap, price/refund math, fingerprints, error translation, and mutation-plan estimation. Important invariants require Firestore Emulator transaction tests that assert observable aggregate state plus Payment/Wallet, claims/guards, capacity, Admin Issues, immutable Activity Log, required outbox obligations, idempotency, and authorization.

Concurrency tests must force overlapping transactions for final-seat admission, Instructor and Participant conflicts, cancellation versus completion, administration edit versus client reschedule, duplicate active Enrollment, duplicate idempotency keys, and time/payment races. Budget tests exercise representative individual, eight-person Booking, multi-Participant Course enrollment, and transfer plans near the configured thresholds. A production-SDK verification suite confirms request sizing and retry behavior that the Emulator may not reproduce exactly.

## Legacy replacement and deletion implications

This is a clean canonical rewrite. The command and resource model provides no compatibility mode for `availability_slots`, `availability_hour_locks`, client Firestore lifecycle transactions, synthetic Course Instructor IDs, or Course Enrollments represented as Bookings.

Current modules that are eventually deleted, replaced, or reduced to thin adapters include:

- `src/features/bookings/bookingTransactions.ts` and `src/features/courses/courseTransactions.ts`;
- direct mutation wrappers such as `addBookingCallable.ts`, `createBookingCallable.ts`, `createGuestBookingCallable.ts`, and `updateBookingScheduleCallable.ts`;
- `src/domain/availability/availabilitySlots.ts`, `availabilityMigration.ts`, and legacy availability exports;
- fixed-hour-lock helpers in `packages/shared-domain/src/booking.ts`;
- legacy server mutation paths in `functions/src/bookings/bookingLogic.ts`, `autoComplete.ts`, and `completeBooking.ts`;
- legacy Course Enrollment callables including `functions/src/courses/enrollInCourse.ts` and `createGuestCourseEnrollment.ts`;
- the existing isolated idempotency implementation in `functions/src/idempotency.ts` where it is not already compatible with transactional command replay;
- overlapping Wallet/ledger mutation helpers in `src/domain/wallet/`, `functions/src/walletLedger.ts`, and `functions/src/schoolGuestWallet.ts` once the Payment command implementation replaces them.

Frontend modules such as `bookingService.ts`, `useBookingActions.ts`, and `useCourseActions.ts` may remain only as presentation-facing adapters that submit canonical intents; they cannot retain independent transaction or lifecycle logic. Old scheduled exports are disabled before canonical jobs are enabled. Legacy tests are replaced with command contract, Emulator transaction, Rules, and adapter tests rather than preserved as compatibility assertions.

## Considered alternatives

- **Separate command modules per transport.** Rejected because lifecycle and authorization policy would drift across callable, administration, guest, and scheduler paths.
- **Generic aggregate patch or lifecycle transition methods.** Rejected because callers would need to know and reproduce the implementation's invariants, making the interface shallow.
- **Client transactions plus Firestore Rules.** Rejected because Rules cannot safely coordinate the full multi-document domain operation and untrusted clients must not choose authoritative effects.
- **Firestore triggers for follow-up mutations.** Rejected because partial completion becomes observable and retries cannot restore the promised atomic business operation.
- **Saga by default for large operations.** Rejected for approved atomic enrollment, reschedule, transfer, financial, and audit effects. Unsupported plans fail preflight.
- **Firestore consistency without aggregate revisions.** Rejected because a transaction can be internally consistent while still applying a stale interactive intention to a newer aggregate.
- **Fixed one-hour locks, bucket-only conflicts, or interval-query-only conflicts.** Rejected respectively for incorrect duration semantics, false conflicts, and concurrent phantom-overlap risk.
- **Computing Course availability only by querying Enrollments.** Rejected because final-seat admission needs one deterministic contention document and bounded transactional enforcement.

## Consequences

- Callers and tests receive high leverage from one stable interface; complex domain and Firestore behavior remains local to one implementation.
- Every authoritative write path depends on the server command module, so its availability, observability, and rollout are critical.
- Contention is intentional on a resource bucket, Course capacity document, Wallet, or active Enrollment guard when commands compete for the same invariant.
- Large but valid Course shapes may require several command attempts or administration UX that chooses smaller independent business operations; an operation promised as atomic is never partially processed.
- Bucket-strategy changes require explicit migration compatibility, but do not change domain time semantics.
- Reconciliation detects drift in projections, claims, capacity, Payment/Wallet, Activity Log completeness/integrity, outbox delivery state, and idempotency; repair follows the applicable accepted correction policy only when the correction is unambiguous and authorized.
- No contradiction with `CONTEXT.md`, ADR-0001, or the canonical rewrite specification is introduced. This ADR supplies the mechanics those documents intentionally deferred, and explicitly leaves whole-Course cancellation unresolved.
