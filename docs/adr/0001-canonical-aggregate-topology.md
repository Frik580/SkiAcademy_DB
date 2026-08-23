---
status: accepted
date: 2026-08-23
amended: 2026-08-23
---

# ADR-0001: Canonical Aggregate Topology

Carve Academy will use separate canonical aggregate roots for lesson `Booking`, `CourseEnrollment`, `Participant`, `Payment`, and `Attendance`. `Course` owns stable `CourseDay` entities, while resource claims, uniqueness guards, capacity counters, and sanitized read models are server-owned enforcement or derived representations rather than competing business sources of truth. This topology preserves the approved rules in [CONTEXT.md](../../CONTEXT.md) while replacing the current overloaded Booking and UserProfile documents.

## Context and scope

The current implementation uses `Booking.userId` as Account owner, attendee, payer, and access key; represents Course Enrollment as a Booking with `instructorId = course_{courseId}`; stores participant progress on UserProfile; has no canonical Attendance or Payment State; and uses availability documents, hour locks, Wallet fields, and `availableSeats` as overlapping enforcement representations. Representative evidence is in:

- `src/types/booking.ts`
- `src/types/user.ts`
- `src/types/course.ts`
- `functions/src/courses/enrollInCourse.ts`
- `functions/src/courses/createGuestCourseEnrollment.ts`
- `functions/src/bookings/bookingLogic.ts`
- `functions/src/bookings/linkGuestBooking.ts`
- `firestore.rules`

The [canonical rewrite specification](../specs/canonical-booking-domain-rewrite.md) requires immutable unique Course Enrollment IDs, a separate active-enrollment guard, and a deep server command module. This ADR decides aggregate identity, ownership, references, and physical Firestore direction. It does not change canonical business rules.

## Amendment: clean canonical rewrite and cutover

The canonical aggregate topology in this ADR remains accepted and authoritative. In particular, this amendment does not change the decisions for:

- `Booking`;
- `CourseEnrollment`;
- `Participant` and Participant management;
- `Payment`;
- `Attendance`;
- `Course` and `CourseDay`;
- resource claims, uniqueness guards, and capacity enforcement representations;
- `bookedBy`, `bookingOrigin`, `payerAccountId`, Account/UserProfile, Participant, and Instructor identity boundaries.

After this ADR was accepted, the data-preservation constraint was clarified: the current Firestore data is development/test data, no production or user data must be preserved, and transactional collections may be reset. That new fact supersedes every compatibility-specific or historical-data-migration consequence previously stated in this ADR, including:

- legacy Course Booking projections and projection metadata;
- incremental backfill and historical reconstruction requirements;
- migration confidence, ambiguity classification, and manual review machinery;
- runtime fallback or compatibility readers;
- support for mixed legacy and canonical clients;
- the previous rejection of an immediate clean cutover.

The implementation will build and verify the canonical system separately, reset development/test transactional Firestore data, reseed only an explicit validated allowlist of reference and configuration data, and deploy the canonical schema, Rules, Functions, jobs, and frontend as one maintenance-window release. No runtime component may read, write, project, or preserve the legacy schema after cutover. Canonical reconciliation required by the new architecture itself, including Payment/Wallet reconciliation, resource-claim repair, and outbox reliability, is unaffected by this amendment.

This ADR deliberately does not decide the mechanics now resolved by these accepted follow-up ADRs:

- Payment accounting, event, correction, and reconciliation mechanics: [ADR-0003](./0003-payment-accounting-source.md).
- Attendance evidence, sufficiency, and correction mechanics: [ADR-0004](./0004-attendance-outcome-and-admin-issue-model.md).
- Resource-claim bucketing, Firestore transaction sizing, and conflict-guard mechanics: [ADR-0002](./0002-server-command-transaction-and-resource-model.md).
- Audit durability, immutable Activity Log, asynchronous outbox, and retention policy: [ADR-0005](./0005-audit-durability-and-transaction-policy.md).

## Decision overview

```text
Account/UserProfile ──management relationship──> Participant
       │                                              │
       └──owns Wallet                                 └──owns learning identity

Booking (individual/family/group lesson)
  ├── owns lifecycle, lesson occurrence, participantIds[] and assigned Instructor
  ├── stores immutable bookingOrigin and bookedBy
  ├── stores optional payerAccountId
  └── references Payment

Course
  ├── owns product and capacity configuration
  ├── owns instructor roster
  └── owns CourseDay entities and their actual delivery assignments

CourseEnrollment
  ├── owns immutable enrollmentId and enrollment lifecycle
  ├── references exactly one Participant and one current Course
  ├── stores immutable bookingOrigin and bookedBy
  ├── stores optional payerAccountId
  └── references Payment

Attendance
  └── references Participant plus Booking occurrence,
      or Participant plus CourseEnrollment and CourseDay

Supporting server-owned representations
  ├── active Course Enrollment guard
  ├── active Participant owner guard
  ├── Instructor, Participant, Course Day, and seat resource claims
  └── capacity and sanitized availability projections
```

## Canonical command seam

All authoritative mutations cross a deep server command module. Its interface accepts actor identity, capability, intent, expected aggregate version, and idempotency information and returns a domain result or a stable domain error. Callers do not directly reserve seats, write locks, decrement Wallets, or choose lifecycle states.

The implementation hides authorization, lifecycle policy, Participant management checks, Payment coordination, Attendance sufficiency, resource claims, uniqueness guards, Firestore transaction assembly, immutable Activity Log creation, and deterministic outbox planning. Callable, scheduled, administration, and Firestore Emulator implementations are adapters at internal or external seams as appropriate. The command interface is the primary test surface.

## Decision 1: Booking and CourseEnrollment are separate aggregate roots

1. **Current model.** Course Enrollment is stored in `/bookings`. Authenticated enrollment normally uses `booking_course_{userId}_{courseId}` as the document ID, sets `instructorId = course_{courseId}`, and stores Course schedule and price in lesson-shaped Booking fields. Re-enrollment after cancellation writes the same deterministic path.
2. **Problem.** The representation conflates two lifecycle vocabularies, permits terminal history to be overwritten, ties enrollment identity and authorization to an Account-like `userId`, and makes capacity, Course Day Attendance, transfer, and Course Instructor rules branches inside every Booking caller.
3. **Viable alternatives.** Keep a discriminated `Booking` root with `kind = lesson | courseEnrollment`; nest enrollments at `/courses/{courseId}/enrollments/{enrollmentId}`; or persist independent top-level CourseEnrollment roots.
4. **Decision.** `Booking` is canonical only for individual and family/group lessons. `CourseEnrollment` is a first-class top-level aggregate at `/course_enrollments/{enrollmentId}`. Its ID is opaque, immutable, unique, and never derived from `participantId + courseId`.
5. **Why preferred.** Booking and CourseEnrollment have materially different lifecycle, capacity, occurrence, Attendance, Instructor, and transfer rules. Separate roots give callers leverage through smaller interfaces and concentrate Course-specific behavior with greater locality. A top-level path preserves identity during transfer and supports Course-, Participant-, and administration-oriented queries without treating either Course or Participant as the owner.
6. **Consequences.** CourseEnrollment owns one Participant's enrollment lifecycle and one-seat entitlement. It references exactly one Participant and one current Course. `withdrawn` remains Course-only. CourseEnrollment never uses or stores a synthetic Instructor identity canonically.
7. **Firestore implications.** Canonical enrollments use `/course_enrollments/{enrollmentId}`. A deterministic `/active_course_enrollment_guards/{participantId_courseId}` document points to the current active `enrollmentId`; the pair is a guard key, not enrollment identity. Recommended indexes include Participant, Course, lifecycle, and start/freeze eligibility.
8. **Clean-cutover implications.** Course-shaped legacy Booking documents are deleted during the transactional-data reset. They are not transformed, projected, archived for runtime access, or accepted by canonical readers.
9. **Seed implications.** Course Enrollment history is not reseeded. New Enrollment records are created only through canonical commands or canonical test fixtures after cutover.
10. **Transactions and security rules.** Enrollment creation and lifecycle commands are server-only and coordinate Enrollment, guard, seat/capacity state, Participant schedule claims, Payment, one immutable Activity Log, and any required outbox obligations atomically when the business operation affects them. Rules deny direct client mutation of enrollments and guards and do not reproduce Course lifecycle or uniqueness policy.
11. **Rejected alternatives.** A polymorphic Booking root preserves the overloaded shallow interface. Course-nested enrollment makes Course transfer imply a document-path move and biases ownership toward Course. A Participant/Course-derived enrollment ID destroys re-enrollment history and is explicitly prohibited.

### Course transfer identity

A pre-start administrative Course A to Course B transfer preserves `enrollmentId`. `courseId` may change only through the canonical atomic transfer command, only before Course A starts, and, as required by `CONTEXT.md`, only while Course B has also not started.

The command atomically updates:

- current `courseId`;
- old and new active-enrollment guards;
- old and new seat claims;
- Participant Course Day schedule claims;
- Payment State and the price difference;
- Course A and Course B capacity projections;
- the required Activity Log and any required outbox obligations.

CourseEnrollment preserves immutable `originalCourseId`. Every transfer Activity Log records `fromCourseId`, `toCourseId`, actor, capability, reason, decision time, and correlation/command identity. Re-enrollment after `cancelled` or `withdrawn` is not a transfer and creates a new `enrollmentId`.

## Decision 2: Participant is persistent and independent from Account/UserProfile

1. **Current model.** UserProfile combines authenticated account identity, contact information, Wallet balance, Instructor linkage, level, skills, comments, achievements-related state, and other Participant-owned progress. Guest identity is embedded in Booking fields. Linking a guest Booking rewrites `Booking.userId`.
2. **Problem.** Children cannot have durable identity without fake accounts; one Account Wallet cannot safely pay for several distinct attendees; progress, Attendance, conflicts, blocking, and access cannot follow the Participant independently from login or payer; and account linking destroys historical role distinctions.
3. **Viable alternatives.** Embed Participant fields in each Booking/Enrollment; create synthetic UserProfile documents for dependents; use one Participant model for dependents but keep self-attendees as UserProfile; or persist every attendee as an independent Participant.
4. **Decision.** Every attendee is represented by `/participants/{participantId}` with an opaque immutable ID. A Participant may exist without authentication. An Account Owner who receives training has both an Account identity and a Participant identity linked through Participant management; the IDs are not canonically equal.
5. **Why preferred.** Participant owns longitudinal learning identity across Bookings, Course Enrollments, Attendance, progress, and access relationships. One model avoids permanent self-versus-dependent branching and supports children, guests, later linking, and one Account Wallet paying for several Participants.
6. **Consequences.** Participant owns minimum profile data, progress, skills, level, achievements, and no-show history. Account/UserProfile owns authentication-facing data, contact preferences, capabilities, and Wallet. Historical Booking, Enrollment, Attendance, and Payment records survive Participant management or login changes and are not cascade-deleted.
7. **Firestore implications.** Participants use `/participants/{participantId}`. Account management uses extensible `/participant_management/{relationshipId}` documents with Participant, Account, role, lifecycle/version, provenance, and timestamps. A deterministic `/participant_management_active_owner/{participantId}` guard points to the one active v1 owner relationship.
8. **Clean-cutover implications.** Legacy `Booking.userId` and Account-owned learning data are not transformed into canonical Participant identity or history. Transactional/test learner data is reset.
9. **Seed implications.** Allowlisted Account profiles may receive new Participant and Participant management records only through explicit validated seed input or canonical commands; no identity is inferred from legacy Booking, contact, or progress fields.
10. **Transactions and security rules.** Booking and Enrollment commands validate the active management relationship for book-for/manage actions. Participant reads require the managing Account relationship, an active Instructor Relationship, booking-scoped minimum access, or administration capability. `payerAccountId`, `bookedBy`, and historical Booking existence do not grant Participant access.
11. **Rejected alternatives.** Embedded Participant identity duplicates and fragments history. Synthetic UserProfile documents falsely imply login and Wallet ownership. A mixed self/dependent identity model preserves two rule sets indefinitely. A generalized Person supertype adds an unapproved abstraction without current leverage.

### Canonical v1 Participant management cardinality

A dependent Participant may have exactly one active managing owner Account. A self-Participant is explicitly linked to their Account through the same relationship model. A guest Participant may temporarily have no managing owner until an authorized linking workflow succeeds.

Administrator capability to manage a Participant operationally does not create a Participant management owner relationship. Multiple guardian Accounts are not permitted in canonical v1. The relationship collection is intentionally extensible so a future ADR can introduce additional guardian roles or multiple active grants without replacing Participant or relationship document identity; such support requires an explicit policy change and cannot be enabled by merely writing another active relationship.

## Decision 3: Booking owns a bounded participant-reference party

1. **Current model.** Booking has one `userId` and no Participant composition. Individual/family/group distinction, per-Participant Attendance, participant-count tariff, and Participant conflict claims are absent.
2. **Problem.** A scalar Account-like identity cannot represent one family/group lifecycle with several attendees, one price decision, and separate Attendance and schedule claims.
3. **Viable alternatives.** Create one Booking per Participant; create a separate BookingParty aggregate with membership documents; embed complete Participant profiles; or keep a versioned array of Participant references inside Booking.
4. **Decision.** Booking owns `participantIds[]`. It contains between 1 and 8 unique Participant IDs in canonical v1. One means an Individual Lesson; two through eight means a Family/Group Lesson. Participant data may be copied only as explicitly non-authoritative historical/display snapshots.
5. **Why preferred.** Composition, lifecycle, tariff, Payment delta, and resource acquisition change together. Keeping bounded membership in the root makes one atomic state transition natural and avoids a separate shallow aggregate with no independent lifecycle.
6. **Consequences.** Every party member receives an independent Participant schedule claim and Attendance record. Booking outcome still follows the canonical family/group rule. Composition versioning and audited add/remove operations preserve history without making Participant profiles part of Booking.
7. **Firestore implications.** `participantIds` is stored on `/bookings/{bookingId}` and supports participant-scoped queries through an array-membership index or prepared read model. The fixed maximum prevents unbounded document and transaction growth. Increasing the maximum requires transaction-capacity and tariff review, not a schema replacement.
8. **Clean-cutover implications.** Legacy scalar `userId` parties are not transformed. All canonical Bookings are created with `participantIds[]` through canonical commands or canonical test fixtures.
9. **Seed implications.** No Booking or family/group party is included in the reference-data seed.
10. **Transactions and security rules.** Create and composition-change commands validate all Participant management rights, blocks, conflicts, tariff changes, Payment deltas, and claims before committing. All participants succeed or none are written. Clients cannot directly change `participantIds`.
11. **Rejected alternatives.** One Booking per Participant breaks family tariff and lifecycle atomicity. A separate BookingParty aggregate adds cross-document consistency without independent behavior. Embedded authoritative profiles duplicate Participant identity and progress.

## Decision 4: Account/UserProfile, bookedBy, payerAccountId, and Instructor remain distinct

1. **Current model.** `Booking.userId` drives ownership, Wallet charging, history, refunds, and participant association. UserProfile can also point to Instructor identity. Guest linking overwrites the same field.
2. **Problem.** Identity, capability, participation, payment, and historical attribution become indistinguishable. Payment can accidentally grant learning-data access; account linking can erase origin; and Instructor or Administrator actions can be confused with separate identities.
3. **Viable alternatives.** Continue using role-dependent scalar IDs; store only Account IDs plus inferred capability; duplicate Account, Participant, and Instructor data; or store explicit references with separate origin and capability evidence.
4. **Decision.** Booking and CourseEnrollment store immutable `bookingOrigin`, immutable `bookedBy: ActorRef`, and optional `payerAccountId`. Account/UserProfile, Participant, and Instructor are separate identities. `ActorRef` identifies an authenticated Account actor or a guest actor; Administrator and Instructor are capabilities exercised by an Account and recorded separately in command/audit metadata.
5. **Why preferred.** `bookedBy` answers who initiated the commitment, `bookingOrigin` answers which workflow created it, `payerAccountId` identifies the optional Account Wallet association, and Participant answers who receives the service. These questions have different lifecycles and authorization effects.
6. **Consequences.** Account linking changes neither `bookedBy` nor `bookingOrigin`. Payer Account may be absent for guest/manual payment. Payment provenance records the actual historical source even if later account linking or refund routing changes. One Account Wallet may fund multiple Participants.
7. **Firestore implications.** `/users/{uid}` remains the physical Account/UserProfile collection. `/instructors/{instructorId}` remains an independent professional aggregate and may reference an Account. Booking and Enrollment store IDs plus only explicitly non-authoritative display snapshots.
8. **Clean-cutover implications.** `userId`, `isGuest`, guest prefixes, and synthetic Instructor IDs are rejected legacy fields after cutover. They are not projected or accepted as identity evidence.
9. **Seed implications.** Only explicitly allowlisted administration and Instructor Account profiles are reseeded. Canonical `bookedBy`, `bookingOrigin`, Participant, and payer facts begin with newly created canonical commitments.
10. **Transactions and security rules.** Server commands authorize actor identity and exercised capability separately. Managing-owner authority, financial visibility, Instructor access, and Administrator capability are evaluated independently. Payer access is financial-only; bookedBy is historical and is not a permanent access grant.
11. **Rejected alternatives.** A scalar `userId` preserves conflation. Role-typed identities make mutable capability part of identity. Payer-derived Participant access violates least privilege. Synthetic Instructor IDs are legacy data only.

## Decision 5: Course owns CourseDay; CourseDay owns actual delivery assignment

1. **Current model.** Course stores a free-form `dates` string, duration text, a mutable `availableSeats` counter, and optional Instructor IDs. Course Enrollment copies dates into Booking-shaped `date`, `time`, and `durationHours` and uses the Course as a synthetic Instructor.
2. **Problem.** Scheduling cannot reliably evaluate actual Course intervals or timezones; Attendance has no stable day identity; Instructor claims may be duplicated or omitted; and transfer/capacity logic depends on parsed display text.
3. **Viable alternatives.** Keep free-form dates; embed structured Course Days as an array; store Course-owned day documents; or create independent top-level CourseDay aggregates.
4. **Decision.** Course owns product configuration, capacity configuration, instructor roster, and stable Course Days. Course Days use `/courses/{courseId}/days/{courseDayId}` and own timezone-safe intervals, actual Instructor delivery assignments, and resulting Instructor claims.
5. **Why preferred.** CourseDay has no meaningful lifecycle outside Course but needs stable identity for Attendance, claims, rescheduling, and reconciliation. Child documents avoid rewriting a large Course document for day-level operations and keep ownership clear.
6. **Consequences.** `course.startAt` equals the first Course Day start. CourseEnrollment references Course but does not copy or own Course Days or Instructor identity. A CourseDay creates an Instructor claim once regardless of enrollment count; each Enrollment creates Participant claims for the relevant Course Days.
7. **Firestore implications.** Course remains `/courses/{courseId}`; Course Days are `/courses/{courseId}/days/{courseDayId}` with immutable IDs, timezone, `startsAt`, `endsAt`, actual Instructor IDs, version, and ordering. `availableSeats` remains a transactional admission projection with canonical freeze semantics.
8. **Clean-cutover implications.** Free-form Course schedule fields and `instructorId = course_{courseId}` are never emitted for runtime readers. Legacy Course schedules are not parsed into canonical delivery facts.
9. **Seed implications.** Preserved Course catalog data receives explicitly validated CourseDay seed records with timezone-safe intervals and actual Instructor assignments. An unvalidated Course is omitted from the seed until corrected.
10. **Transactions and security rules.** CourseDay schedule changes use server commands that coordinate Course version, Instructor claims, affected Participant claims, audit, and projections according to the Server Command, Transaction and Resource Model ADR. Course reads may remain public where appropriate; CourseDay and claim mutations are server/admin-command owned.
11. **Rejected alternatives.** Free-form dates cannot enforce canonical scheduling. Embedded arrays weaken stable day references and operational updates. Top-level CourseDay implies independence it does not have. CourseEnrollment-owned Instructor identity duplicates Course delivery configuration.

## Decision 6: Payment and Attendance are independent aggregate roots

1. **Current model.** Booking carries `totalPrice` and lifecycle, UserProfile carries Wallet balance, Wallet ledger records movements, and cancellation infers refunds from Booking price. Canonical Attendance does not exist; completion is inferred from timestamps or privileged status changes.
2. **Problem.** Payment State, financial provenance, Wallet movement, lifecycle, and actual participation are conflated or missing. A Booking status cannot prove payment or attendance, and a ledger cannot replace current Payment State.
3. **Viable alternatives.** Embed Payment and Attendance inside Booking/Enrollment; treat Wallet ledger and lifecycle as authority; store child documents under each commitment; or use independent aggregate roots with explicit subject references.
4. **Decision.** `/payments/{paymentId}` owns Payment State and explicit monetary fields for exactly one Booking or CourseEnrollment. `/attendance/{attendanceId}` owns the current participation observation for a Participant and service occurrence. Booking/Enrollment reference these roots and retain separate lifecycle authority.
5. **Why preferred.** Payment and Attendance change under different actors, evidence, correction rules, visibility, and timing. Independent roots preserve their separate sources of truth while allowing a server command to update affected roots atomically for one business event.
6. **Consequences.** Payment owns status, `price`, `paidAmount`, `refundedAmount`, `outstandingAmount`, and financial provenance mechanics defined by the Payment Accounting Source ADR. Attendance owns `present` or `absent`, recorder/evidence, and correction mechanics defined by the Attendance, Outcome and Admin Issue Model ADR. Outcome commands consume sufficient Attendance and Payment restrictions but neither source writes Booking/Enrollment lifecycle directly.
7. **Firestore implications.** Payment uses `/payments/{paymentId}` with canonical financial history defined by [ADR-0003](./0003-payment-accounting-source.md). Attendance uses `/attendance/{attendanceId}` and references Participant plus Booking occurrence, or Participant plus CourseEnrollment and CourseDay. Deterministic uniqueness or separate guards may be used without conflating Attendance identity with Enrollment identity.
8. **Clean-cutover implications.** Legacy amount/status fields, Wallet ledger entries, and `completed` records are not converted into Payment or Attendance. Existing transactional financial and participation data is reset.
9. **Seed implications.** No Payment, monetary history, Attendance, or Admin Issue is reseeded. Allowlisted Account Wallets start from the explicit balance selected by [ADR-0003](./0003-payment-accounting-source.md) and the seed contract.
10. **Transactions and security rules.** Payment and Attendance mutation is server-command owned. Commands that affect lifecycle and Payment together update both atomically. Instructors can record Attendance only through authorized commands and see only operational payment-gate information, not financial detail. Direct client writes to current Payment State are denied.
11. **Rejected alternatives.** Embedded Payment couples finance to service lifecycle. Wallet ledger as authority contradicts `CONTEXT.md`. Embedded Attendance permits lifecycle mutations to overwrite participation evidence and makes Course Day history unbounded.

## Decision 7: Resource claims and uniqueness guards are server-owned enforcement representations

1. **Current model.** Instructor availability uses `/availability_slots/{bookingId}` and deterministic `/availability_hour_locks/{instructor_date_time}`. Course capacity uses `availableSeats`. Participant conflicts and explicit Course Day claims do not exist. Course Bookings are excluded from Instructor availability by synthetic ID convention.
2. **Problem.** Current locks cover only part of scheduling, use display-oriented time fields, expose Booking-linked documents, and can drift from Booking, Enrollment, Course Day, and capacity state. Querying active records without a deterministic guard does not safely prevent concurrent duplicate enrollment or overlap.
3. **Viable alternatives.** Query active aggregates without claims; make legacy availability documents canonical; embed claims only in each aggregate; or maintain normalized claim/guard documents through one transactional claim module.
4. **Decision.** Semantic resource intent remains owned by Booking, CourseEnrollment, CourseDay, or an administrative block. A server-owned claim module maintains normalized claims and deterministic conflict/uniqueness guards as enforcement representations. Exact bucketing and transaction mechanics are defined by [ADR-0002](./0002-server-command-transaction-and-resource-model.md).
5. **Why preferred.** Cross-aggregate conflicts require a shared enforcement seam, while lifecycle authority must remain local to the owning aggregate. The claim module hides collision and projection complexity from callers and provides rebuild/reconciliation locality.
6. **Consequences.** Booking causes Instructor and Participant interval claims. CourseDay causes actual Instructor claims once. CourseEnrollment causes Participant Course Day claims and a pre-start seat claim. Administrative blocks cause block claims. Claims cannot be edited as independent lifecycle records.
7. **Firestore implications.** Logical collections include `/resource_claims/{claimId}`, internal `/resource_claim_guards/{bucketKey}`, `/active_course_enrollment_guards/{pairKey}`, and `/participant_management_active_owner/{participantId}`. `availableSeats` and sanitized availability are canonical projections with reconciliation metadata.
8. **Clean-cutover implications.** `/availability_slots`, `/availability_hour_locks`, synthetic Course branching, and old capacity writes are deleted and are never populated by canonical commands.
9. **Seed implications.** Claims and guards are not backfilled from legacy transactions. They begin empty except for claims deterministically created from validated seeded Course Days or administrative blocks through canonical seed commands.
10. **Transactions and security rules.** Owner commands acquire, move, freeze, or release claims and guards atomically with the owning business change. Claims and guards are server-write-only and need no public visibility. Public schedule reads use sanitized projections without Participant identity or Booking-linked private detail.
11. **Rejected alternatives.** Query-only enforcement is race-prone. Legacy hour locks cannot express Participant or Course Day conflicts. Aggregate-embedded claims cannot prevent another aggregate from claiming the same resource. Independently editable claims would create a competing lifecycle source.

## Decision 8: Legacy course Bookings are discarded at clean cutover

1. **Current model.** Course-shaped Booking documents are authoritative for enrollment lifecycle, history, chat access, capacity effects, and UI queries. Rules address deterministic paths directly.
2. **Problem.** Keeping them authoritative would preserve synthetic identity, overwrite history on re-enrollment, and create bidirectional synchronization with no deterministic conflict winner.
3. **Viable alternatives.** Transform legacy Booking records; retain a bounded compatibility projection; keep legacy Booking authoritative while adding Enrollment as a read model; or reset transactional data and cut over directly to CourseEnrollment.
4. **Decision.** CourseEnrollment is the only canonical write and lifecycle source. Legacy course Booking documents are deleted during the development/test Firestore reset and are never recreated.
5. **Why preferred.** No production or user data requires preservation. A clean reset removes synthetic identity and deterministic-path assumptions without adding runtime compatibility behavior or fabricated history.
6. **Consequences.** Old clients cannot read or mutate course enrollment after cutover. Every new enrollment is created through the canonical command layer with a new opaque identity.
7. **Firestore implications.** `/bookings` contains only canonical lesson Bookings after cutover. `/course_enrollments` contains canonical enrollments. Neither root stores migration source paths, projection versions, legacy aliases, or compatibility metadata.
8. **Client implications.** Canonical Rules reject legacy course Booking payloads and direct CourseEnrollment writes. The release prevents stale legacy clients from reintroducing old documents.
9. **Cutover implications.** The canonical schema, Rules, Functions, jobs, and frontend deploy together after the transactional-data reset and allowlisted seed. No backfill, fallback, or mixed-client interval exists.
10. **Transactions and security rules.** Canonical commands write only canonical aggregates and enforcement representations. Rules replace authorization that previously depended on deterministic aliases.
11. **Rejected alternatives.** Transforming or projecting disposable test data would add permanent complexity without preserving user value. Keeping Booking authoritative makes CourseEnrollment a shallow read model and defeats the topology.

## Global transaction consequences

Canonical commands may coordinate several aggregate roots and supporting representations in one Firestore transaction when a single approved business operation requires atomicity. A Course Enrollment operation can touch Enrollment, active guard, Participant management/access evidence, Course and Course Days, seat and schedule claims, Payment, Wallet and monetary events, capacity projection, one immutable Activity Log, required outbox obligations, and idempotency. Multi-Participant Course enrollment repeats the Participant-specific portions for each enrollment and remains all-or-nothing.

The implementation must preflight bounded operation size. Canonical v1 Booking party size is limited to eight Participants. [ADR-0002](./0002-server-command-transaction-and-resource-model.md) defines claim encoding and supported Course Day/enrollment transaction bounds. If an operation cannot satisfy Firestore limits while preserving approved atomicity, the command fails safely; it does not silently degrade into a partially committed saga.

## Global security consequences

- Clients submit intent to server commands rather than target lifecycle, Payment, Attendance, ownership, or claim state.
- Direct client mutation of CourseEnrollment, Participant ownership relationships, Payment State, Attendance outcomes, resource claims, guards, and capacity projections is denied.
- Account management authority, payer financial visibility, bookedBy provenance, Instructor access, and Administrator capability are evaluated separately.
- A dependent Participant has exactly one active owner relationship in canonical v1; Administrator capability does not create one.
- Payer identity does not grant Participant learning-data access.
- Instructor access requires an Instructor Relationship or booking-scoped minimum access and exposes only the operational payment restriction required to deliver service.
- Rules use narrow access/read projections where necessary and do not attempt to reimplement the complete domain evaluator.

## Consequences of the topology

### Benefits

- Booking and CourseEnrollment lifecycles can evolve independently without synthetic Instructor conventions.
- Participant identity survives account linking and supports dependents without authentication.
- One Wallet can fund multiple Participants without conflating payer and attendee.
- Payment, Attendance, lifecycle, and audit remain separate sources of truth.
- Course Days provide stable schedule, Instructor claim, and Attendance references.
- Clean cutover avoids a permanent compatibility adapter and preserves a single canonical runtime model.
- A small command interface provides leverage to callers and locality for invariant enforcement and testing.

### Costs

- Canonical reads assemble data from several roots or prepared read models.
- Transactions and indexes become more explicit and require bounded-size design.
- Security can no longer rely on `userId == request.auth.uid`; it requires relationship and access projections.
- Cutover requires a coordinated maintenance window, transactional-data reset, validated seed, and stale-client prevention.
- ADR-0002 through ADR-0005 define Payment, Attendance, resource-claim/transaction, audit, and outbox mechanics without changing the ownership decided here.

## Accepted follow-up decisions

The four required follow-up architecture decisions are accepted, and no blocking architecture ADR remains:

- [ADR-0002: Server Command, Transaction and Resource Model](./0002-server-command-transaction-and-resource-model.md).
- [ADR-0003: Payment Accounting Source](./0003-payment-accounting-source.md).
- [ADR-0004: Attendance, Outcome and Admin Issue Model](./0004-attendance-outcome-and-admin-issue-model.md).
- [ADR-0005: Audit Durability and Transaction Policy](./0005-audit-durability-and-transaction-policy.md).
