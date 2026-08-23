# Canonical Booking Domain Rewrite and Clean Cutover

Status: approved implementation strategy; ADR-0001 through ADR-0005 accepted; phase implementation may proceed

## Problem Statement

The current implementation overloads `Booking` and `UserProfile` with account identity, Participant identity, payer identity, course enrollment, schedule, Payment-like fields, Attendance-like outcomes, Wallet effects, and resource locking. Client and server entry points enforce different subsets of the canonical rules in [CONTEXT.md](../../CONTEXT.md), and current Firestore documents use shapes that cannot faithfully represent the approved domain.

No production or user data must be preserved. The current Firestore contents are development/test data and may be deleted. Historical test Bookings, course-shaped enrollment records, payments, Wallet movements, Attendance-like outcomes, Participants, reviews, chats, notifications, and audit records have no migration value.

The repository therefore requires a canonical rewrite followed by a clean maintenance-window cutover. The rewrite must preserve the accepted topology in [ADR-0001](../adr/0001-canonical-aggregate-topology.md), not the current document shapes.

## Non-negotiable constraints

- Canonical commands and readers accept only canonical documents.
- No runtime component supports the legacy schema after cutover.
- No historical Booking, Course Enrollment, Participant, Payment, Attendance, Wallet, review, chat, or audit data is transformed into canonical transactional data.
- No legacy Course Booking document is recreated after reset.
- Reference and configuration data is reseeded only from an explicit validated allowlist.
- The canonical implementation is built and verified separately while the current application remains deployable. The two implementations do not share a mutation path or synchronize records.
- The canonical schema, Rules, Functions, scheduled jobs, and frontend are released together during a maintenance window.
- Canonical reconciliation remains required where it is an architectural invariant: Payment/Wallet accounting, resource claims and capacity projections, idempotent commands, Activity Log completeness/integrity, and outbox delivery reliability.
- `CONTEXT.md` is authoritative for business rules. [ADR-0001](../adr/0001-canonical-aggregate-topology.md) through [ADR-0005](../adr/0005-audit-durability-and-transaction-policy.md) are accepted and authoritative for their respective architecture decisions.

## Canonical model and collection layout

### Aggregate roots and owned entities

| Concept                        | Canonical Firestore location                           | Ownership                                                                                 |
| ------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Account/UserProfile            | `/users/{accountId}`                                   | Authentication-facing identity, contact preferences, capabilities, and Wallet association |
| Instructor                     | `/instructors/{instructorId}`                          | Independent professional identity, optionally linked to an Account                        |
| Participant                    | `/participants/{participantId}`                        | Learning identity, progress, skills, level, achievements, and no-show history             |
| Participant Management         | `/participant_management/{relationshipId}`             | Account authority to manage one Participant                                               |
| Active Participant Owner Guard | `/participant_management_active_owner/{participantId}` | One active canonical-v1 managing owner                                                    |
| Instructor Relationship        | `/instructor_relationships/{relationshipId}`           | Time-bounded Instructor access to a Participant                                           |
| Participant Block              | `/participant_blocks/{blockId}`                        | Independent Parent/Guardian or Instructor prohibition                                     |
| Booking                        | `/bookings/{bookingId}`                                | Individual or Family/Group Lesson lifecycle and bounded `participantIds[]` party          |
| Course                         | `/courses/{courseId}`                                  | Product, content, capacity configuration, roster, and `startAt`                           |
| CourseDay                      | `/courses/{courseId}/days/{courseDayId}`               | Timezone-safe delivery interval and actual Instructor assignment                          |
| CourseEnrollment               | `/course_enrollments/{enrollmentId}`                   | One Participant's lifecycle and seat entitlement on one Course                            |
| Payment                        | `/payments/{paymentId}`                                | Current Payment State, explicit monetary fields, and financial provenance                 |
| Attendance                     | `/attendance/{attendanceId}`                           | Participant observation for a Booking occurrence or CourseDay                             |
| BookingProposal                | `/booking_proposals/{proposalId}`                      | Non-reserving Instructor proposal                                                         |
| BookingChangeRequest           | `/booking_change_requests/{requestId}`                 | Requested schedule, Instructor, or Course change and its resolution                       |
| Admin Issue                    | `/admin_issues/{issueId}`                              | Blocking operational issue requiring resolution                                           |

### Server-owned enforcement and reliability representations

| Representation                 | Canonical Firestore location                                | Purpose                                                                            |
| ------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Resource Claim                 | `/resource_claims/{claimId}`                                | Normalized Instructor, Participant, CourseDay, seat, or administrative-block claim |
| Resource Claim Guard           | `/resource_claim_guards/{bucketKey}`                        | Deterministic conflict enforcement selected by the command/resource ADR            |
| Active Course Enrollment Guard | `/active_course_enrollment_guards/{participantId_courseId}` | At most one active Enrollment per Participant and Course                           |
| Activity Log                   | `/activity_logs/{activityId}`                               | Immutable command/action audit written atomically with authoritative state         |
| Command Idempotency            | `/command_idempotency/{commandKey}`                         | Durable command replay result and request identity                                 |
| Domain Outbox                  | `/domain_outbox/{eventId}`                                  | Independently retryable asynchronous external-delivery obligations                 |
| Notification                   | `/notifications/{notificationId}`                           | User-facing delivery state, never domain authority                                 |

ADR-0001 through ADR-0005 define the accepted document, history, claim, transaction, accounting, Attendance, audit, outbox, and retention boundaries. If an accepted ADR changes a physical path listed above, this specification must be updated before implementation; code must not silently diverge.

## Delivery strategy

Phases 1 through 4 add and test the canonical implementation without routing the current frontend to it. The existing application remains buildable and deployable during that work. Canonical tests use a fresh emulator dataset and never depend on old Firestore documents.

Phase 5 produces a canonical frontend release candidate. Phase 6 produces the matching Rules, indexes, Functions, jobs, reset tooling, and release manifest. Phase 7 is the only shared-environment cutover. There is no interval in which a business operation updates both schemas or a canonical reader interprets an old document.

## Phase 1 — Canonical schema and shared domain foundation

### Objective

Create one canonical vocabulary, type system, validation boundary, collection-path module, and test fixture layer for the accepted topology.

### Scope

- Define shared domain types and schemas for every aggregate and representation listed above.
- Separate Account/UserProfile, Participant, Instructor, `bookedBy`, `bookingOrigin`, and optional `payerAccountId`.
- Define immutable opaque IDs and subject references.
- Define Booking parties with one to eight unique `participantIds`.
- Define CourseDay timezone, `startsAt`, `endsAt`, ordering, and actual Instructor assignments.
- Define lifecycle vocabularies without implementing transition authorization in UI code.
- Define canonical serialization and validation that rejects unknown legacy identity, schedule, enrollment, and finance fields.
- Provide canonical factories and fixtures for unit and Emulator tests.

### Tests and exit criteria

- Schema round-trip and rejection tests cover every canonical type.
- Booking and CourseEnrollment cannot be serialized as each other.
- Participant, Account, Instructor, payer, and actor references cannot be substituted for each other.
- No canonical fixture imports current Booking, availability, Wallet ledger, or course-enrollment fixture builders.
- Shared packages build and current application build remains green.

## Phase 2 — Canonical server command, transaction, and reliability layer

### Objective

Make the server command module the only authoritative mutation seam before implementing user flows.

### Scope

- Implement command envelopes with actor identity, exercised capability, intent, expected aggregate version, correlation ID, and idempotency key.
- Implement lifecycle transition policy and stable domain errors.
- Implement authorization for Account Owner, Parent/Guardian, Instructor, Administrator, guest token, scheduled system actor, and provider callback.
- Implement Firestore transaction assembly with bounded read/write preflight.
- Implement resource claims, guards, acquisition/move/release/freeze operations, and deterministic conflict results.
- Implement the atomic immutable Activity Log and any deterministic outbox obligations required by [ADR-0005](../adr/0005-audit-durability-and-transaction-policy.md).
- Implement idempotent outbox processing, retry, dead-letter or issue escalation, and canonical reconciliation.
- Implement secure guest action tokens with scope, purpose, expiry, nonce/version, revocation, and replay prevention.
- Deny direct client mutation of lifecycle, Payment, Attendance, Participant management, claims, guards, capacity, audit, and outbox state.

### Tests and exit criteria

- Command contract tests prove authorization, transition, optimistic-concurrency, and idempotency matrices.
- Emulator concurrency tests prove duplicate enrollment, overlapping claims, duplicate commands, and replayed guest actions cannot violate invariants.
- Every successful authoritative state-changing command has exactly one required atomic Activity Log and any required deterministic outbox obligations.
- Transaction-size preflight rejects unsupported parties or CourseDay counts without partial writes.
- Command handlers do not read or write legacy collections or fields.

## Phase 3 — Booking, Participant, Payment, and relationship flows

### Objective

Deliver the complete canonical lesson vertical slice for authenticated, guest, administration, Instructor-origin, and Family/Group use cases.

### Scope

- Create and manage Participant and Participant Management records, including self and dependent Participants.
- Implement Instructor Relationships and Participant Blocks with canonical access and removal rules.
- Implement authenticated self-service Booking with atomic full Wallet payment.
- Implement guest pending reservation, expiration deadline, administration confirmation/cancellation, secure guest action, and later account linking without changing origin or provenance.
- Implement administration-created confirmed Booking with explicit underpayment reason and Payment State.
- Implement BookingProposal create, revoke, expire, and accept; acceptance rechecks every invariant and creates the Booking atomically.
- Implement Individual and Family/Group parties, tariff calculation, per-Participant claims, and all-or-nothing party changes.
- Implement cancellation, `pending_cancellation`, rescheduling, Instructor change, price change, refund, and BookingChangeRequest workflows.
- Implement Payment State, Wallet effects, monetary history, provider idempotency, corrections, and Payment/Wallet reconciliation according to the Payment ADR.
- Implement participant-level Attendance entry and lesson outcome commands needed by the Booking lifecycle.

### Tests and exit criteria

- Emulator tests cover authenticated, guest, administration, proposal, self/dependent, and Family/Group creation.
- Payment tests cover full payment, permitted underpayment, partial state, refund bounds, provider replay, no payer, Wallet recipient, and reconciliation repair.
- Authorization tests separate management access, financial visibility, booked-by history, Instructor access, and administration capability.
- Cancellation/reschedule tests prove atomic old-claim release and new-claim acquisition.
- Family/Group tests prove tariff and all Participant claims commit together or not at all.
- The complete canonical Booking API passes without any current `/bookings` test fixture.

### Legacy deletion gate

After this phase is complete, delete or replace the old lesson-mutation family, including client Firestore transactions, old Booking callables, guest linking that rewrites `userId`, legacy Wallet settlement/refund inference, timestamp completion, and their tests. The current frontend remains on the old release until Phase 7; removed runtime modules must therefore be removed only when the canonical release branch/build no longer imports them.

## Phase 4 — Course Enrollment, Course Days, capacity, and Attendance

### Objective

Deliver the complete canonical Course vertical slice without representing Enrollment as Booking.

### Scope

- Implement Course and CourseDay administration using structured timezone-safe intervals.
- Implement authenticated, guest, and administration CourseEnrollment commands with opaque immutable IDs.
- Enforce the active Enrollment guard, pre-start seat claim, Participant CourseDay claims, and actual Instructor CourseDay claims.
- Keep `availableSeats` as the canonical transactional admission projection with freeze behavior at `course.startAt`.
- Implement atomic multi-Participant Course enrollment as one Enrollment per Participant.
- Implement pre-start transfer while preserving `enrollmentId` and `originalCourseId` according to ADR-0001.
- Implement cancellation, withdrawal, refunds, capacity release, admission freeze, and post-start outcome rules.
- Implement CourseDay Attendance, sufficiency evaluation, Admin Issues, corrections, and the delayed outcome resolver according to the Attendance ADR.
- Implement Course Payment behavior and Payment/Wallet reconciliation according to the Payment ADR.
- Update chat and Instructor access to use canonical Enrollment and relationship evidence rather than deterministic Booking paths.

### Tests and exit criteria

- Enrollment identity, re-enrollment history, active guard, capacity, transfer, and freeze tests pass under concurrency.
- CourseDay Instructor and Participant conflicts are enforced for actual intervals.
- Attendance/outcome tests cover missing evidence, partial Course attendance, `completed`, `no_show`, `withdrawn`, payment gate, correction, timezone, and the 24-hour resolver.
- Storage and chat authorization no longer depend on `booking_course_*`, synthetic Instructor IDs, or course-shaped `/bookings` documents.
- The complete canonical Course API passes with `/course_enrollments` and never creates a Course record under `/bookings`.

### Legacy deletion gate

After this phase is complete, delete or replace old Course enrollment callables, synthetic-course helpers, deterministic Enrollment ID builders, Course-shaped Booking query paths, availability migration code, hour-lock code, and their tests.

## Phase 5 — Frontend migration to canonical API and model

### Objective

Build one frontend that consumes canonical command and read contracts only.

### Scope

- Replace Booking stores, queries, history, selectors, status maps, and forms with canonical Booking contracts.
- Add Participant selection and management, payer separation, guest state, Family/Group composition, and relationship/block UI.
- Replace course-shaped Booking UI with explicit CourseEnrollment and CourseDay views.
- Add Payment State, Attendance, Admin Issue, BookingProposal, and BookingChangeRequest views and actions.
- Replace direct document writes with canonical commands.
- Replace schedule and capacity inference with canonical claims/read models and CourseDay data.
- Replace chat authorization and thread resolution with canonical Booking or CourseEnrollment subject references.
- Remove stale persisted client stores on the canonical release boundary.

### Tests and exit criteria

- Frontend unit/contract tests use only canonical types and prepared view models.
- Critical UI paths run against a fresh canonical Emulator dataset.
- A canonical production build contains no imports from deleted legacy transaction, availability, enrollment, or Wallet modules.
- Hosting cache/version behavior forces an old frontend build to reload or fail closed at cutover.
- The canonical frontend release candidate is not routed to the shared environment before Phase 7.

## Phase 6 — Firestore Rules, indexes, scheduled jobs, and release automation

### Objective

Produce the deployable infrastructure and operational tooling required for the clean cutover.

### Scope

- Replace Firestore Rules for the canonical collection layout and relationship-based access.
- Reject legacy Booking payloads, Course-shaped documents in `/bookings`, synthetic Instructor identity, and direct writes to server-owned fields and collections.
- Replace Storage Rules that authorize chat or media through legacy Booking paths.
- Add canonical indexes for Participant membership, Booking and Enrollment lifecycle, Course, CourseDay, Payment, Attendance, relationships, proposals, requests, Admin Issues, claims, outbox, and notifications.
- Implement guest expiration, outcome resolution, outbox processing, notification cleanup, and canonical reconciliation jobs.
- Delete or disable old completion and availability-migration jobs before the maintenance window.
- Implement the reset, seed, storage cleanup, and verification scripts defined below.
- Produce one versioned release manifest identifying the Rules, indexes, Functions, jobs, frontend build, seed schema, and minimum supported client release.

### Tests and exit criteria

- Firestore and Storage Rules tests prove least privilege and denial of stale legacy writes.
- Callable and scheduled-job Emulator tests prove idempotency, Activity Log completeness/integrity, outbox retry/delivery durability, and safe duplicate execution.
- Required indexes are deployed and fully built before the maintenance window.
- A full reset/seed/deploy rehearsal succeeds in an isolated Firebase development project.
- Unit, integration, Emulator, Rules, Storage Rules, callable, and critical E2E suites pass from an empty database.

## Phase 7 — Legacy removal, Firestore reset, canonical deployment, and verification

### Objective

Perform one clean cutover and leave no runtime support for the old schema.

### Pre-cutover gates

- ADR-0001 through ADR-0005 are accepted and this specification matches them.
- Phases 1–6 exit criteria pass on the exact release commit.
- Canonical indexes are built.
- Reset, seed, snapshot restore, and legacy-seed rollback are rehearsed.
- The reference-data manifest is reviewed and checksum-locked.
- The repository-wide legacy-reference scan has no unexplained runtime matches.
- A maintenance window, release owner, rollback owner, and target Firebase project ID are recorded.

### Maintenance-window deployment ordering

1. Serve a maintenance build that stops new mutations and forces a client release check.
2. Disable legacy scheduled jobs and legacy callable/HTTP mutation endpoints; wait for in-flight work to finish.
3. Record the deployed git revision, Firebase project ID, Rules/index versions, Functions revision, Hosting revision, and seed-manifest checksum.
4. Save a development Firestore snapshot and export the allowlisted reference seed. Save the legacy test seed or confirm it can be recreated from the tagged pre-cutover revision.
5. Deploy canonical Firestore and Storage Rules so stale clients are denied before destructive reset begins.
6. Run the reset script against the explicitly confirmed project and verify that every reset target is empty.
7. Run transactional Storage cleanup and verify that no removed Firestore subject retains chat or derived media.
8. Deploy canonical Functions with scheduled handlers disabled until smoke checks complete.
9. Run the canonical reference/configuration seed and asset validation scripts. CourseDay creation uses the canonical server command module so required Instructor claims and audit/reliability records are created consistently.
10. Deploy the canonical frontend and release/version configuration.
11. Run schema, Rules, callable, smoke, and critical E2E verification against the deployed environment.
12. Enable canonical scheduled jobs and verify idempotency, Activity Log completeness/integrity, outbox pending/delivery/retry/dead-letter health, claims, capacity, and Payment/Wallet reconciliation.
13. End maintenance only after all exit checks pass. Remove the remaining legacy code and deployment definitions after the agreed verification window.

### Final exit criteria

- Canonical authenticated, guest, administration, Instructor proposal, Family/Group, Course Enrollment, Payment, Attendance, cancellation/reschedule, and change-request E2E paths pass.
- Security tests prove old clients cannot write old shapes or call removed mutation endpoints.
- No Course Enrollment exists in `/bookings`.
- No document exists in a retired collection.
- Claims, guards, capacity, Payment/Wallet, Activity Log completeness/integrity, outbox pending/delivery/retry/dead-letter, and scheduled-job health checks pass.
- The canonical frontend is the only supported client release.
- Remaining legacy code, Rules, indexes, fixtures, jobs, and scripts meet the deletion criteria below and are removed.

## Firestore reset contract

The reset is destructive by design and runs only after exact project-ID confirmation and snapshot creation. It recursively deletes every document and subcollection in the following existing top-level collections:

- `/users`
- `/instructors`
- `/reviews`
- `/bookings`
- `/availability_slots`
- `/availability_hour_locks`
- `/settings`
- `/courses`
- `/notifications`
- `/activity_logs`
- `/wallet_ledger`
- `/error_logs`
- `/function_idempotency`
- `/resort_data`

To make repeated rehearsals deterministic, it also clears any canonical test documents written during Phases 1–6 from:

- `/participants`
- `/participant_management`
- `/participant_management_active_owner`
- `/instructor_relationships`
- `/participant_blocks`
- `/course_enrollments`
- `/payments`
- `/attendance`
- `/booking_proposals`
- `/booking_change_requests`
- `/resource_claims`
- `/resource_claim_guards`
- `/active_course_enrollment_guards`
- `/admin_issues`
- `/command_idempotency`
- `/domain_outbox`

The reset does not attempt to interpret, copy, or classify any deleted transactional document. After reset, `/bookings` is reserved for canonical lesson Bookings and `/course_enrollments` is reserved for canonical CourseEnrollments.

## Reference/configuration seed contract

The reference export is an allowlist, not a generic Firestore export. Every selected document and Storage object must appear in a versioned manifest with source path, target path, expected schema, checksum, and reviewer.

### Firestore data allowed to be reseeded

- `/users/{accountId}` only for explicitly selected Administrator, operator, and Instructor Account profiles. Wallet state is initialized according to the Payment ADR and must not be copied from current balances or ledgers.
- `/instructors/{instructorId}` for validated professional profile, public description, qualifications, pricing/configuration, media references, and validated Account link.
- `/courses/{courseId}` for validated product/catalog content, price, `totalSeats`, Instructor roster, and visibility/order fields.
- `/courses/{courseId}/days/{courseDayId}` only from explicitly reviewed timezone-safe `startsAt`, `endsAt`, ordering, and actual Instructor assignment. Free-form legacy dates are not parsed into CourseDays.
- `/settings/instructor_filters`
- `/settings/notification_retention`
- `/settings/starter_credit`
- `/settings/skill_config`
- `/settings/achievements_config`
- `/settings/runtime_release` for the canonical minimum client release and maintenance state.
- `/resort_data/config`

No other Firestore document is eligible for the seed artifact. In particular, it contains no Booking, CourseEnrollment, Participant, Participant management relationship, Payment, Attendance, Wallet ledger entry, historical Activity Log, notification, review, chat message, Admin Issue, claim, guard, proposal, request, or idempotency/outbox record. Canonical CourseDay seed commands may create new claims, Activity Logs, and outbox records required by the accepted command and audit policies; those records are new cutover actions, not preserved data.

### Storage assets allowed to be retained

- `avatars/{accountId}` only for an allowlisted Account referenced by the seed.
- `instructors/{instructorId}` and `instructors/{instructorId}/**` only for an allowlisted Instructor and only when referenced by its seeded document.
- `courses/{courseId}` and `courses/{courseId}/**` only for an allowlisted Course and only when referenced by its seeded document.

All `chat/**` objects, derived `image-cache/**` objects, orphaned avatars, and non-allowlisted Course/Instructor objects are deleted. Asset validation fails the seed if a referenced object is missing, has an unexpected content type, or does not match its checksum.

## Required operational scripts

Implementation must provide these scripts before Phase 7:

1. `scripts/export-canonical-reference-seed.mjs`
   - accepts an explicit Firebase project ID and allowlist manifest;
   - exports only the permitted Firestore fields and Storage object metadata;
   - rejects transactional references, legacy fields, missing CourseDay structure, and nonzero copied Wallet state;
   - writes a deterministic seed artifact and checksum report.
2. `scripts/reset-canonical-firestore.mjs`
   - requires the project ID twice or an equivalent explicit confirmation;
   - refuses an unapproved project ID;
   - verifies the saved snapshot metadata before deletion;
   - recursively deletes only the exact collection list in this specification;
   - verifies all targets are empty and emits a signed/count report.
3. `scripts/reset-transactional-storage.mjs`
   - deletes `chat/**`, `image-cache/**`, and every non-allowlisted asset;
   - verifies each resolved target remains inside the configured Firebase Storage bucket and allowlist scope;
   - reports retained and deleted object checksums.
4. `scripts/seed-canonical-reference-data.mjs`
   - validates the seed schema before writing;
   - writes allowlisted Account, Instructor, Course, settings, and resort configuration, then creates validated CourseDays through the canonical server command module;
   - is idempotent and fails on conflicting existing documents;
   - verifies Firestore documents and referenced Storage assets after write.
5. `scripts/verify-canonical-cutover.mjs`
   - proves retired collections are empty;
   - validates canonical document schemas and seed checksums;
   - checks required Rules/index/Functions/Hosting release identifiers;
   - runs canonical claims/capacity, Payment/Wallet, Activity Log completeness/integrity, and outbox pending/delivery/retry/dead-letter health checks without comparing against legacy data.

These scripts are implementation work for later phases; this specification does not create or execute them.

## Stale legacy client and write prevention

- Legacy callable and HTTP mutation endpoints are disabled before reset and removed from the canonical deployment.
- Canonical Firestore Rules use strict field allowlists and deny Course-shaped documents in `/bookings`, synthetic Instructor identity, scalar Booking ownership, and direct writes to server-owned collections.
- Canonical command validation rejects unknown legacy fields even when invoked by an authenticated client.
- `/settings/runtime_release` identifies the minimum supported frontend build. The maintenance and canonical builds force reload when the local build is older.
- The canonical release changes persisted client-store keys and clears old offline Firestore persistence before subscribing to canonical queries.
- Hosting assets use content-hashed names and non-stale HTML cache headers so the canonical shell is fetched promptly.
- Post-cutover monitoring alerts on calls to removed endpoints and Rules denials matching known old payload shapes. Monitoring does not provide a compatibility path.

## Repository-wide legacy-reference scan

Before Phase 7, search runtime code, Rules, indexes, Functions, scripts, and positive-path tests for at least:

- `availability_slots`
- `availability_hour_locks`
- `availability_slots_migration`
- `booking_course_`
- synthetic `course_` Instructor identity
- Booking-owned `userId`
- Booking-owned `isGuest`
- Course Enrollment writes to `/bookings`
- `balanceUSD`
- `pendingWalletCredit`
- `lastRefundBookingId`
- `legacySourcePath`
- `canonicalEnrollmentId`
- `legacy_course_enrollment_projection`
- old completion, availability migration, and direct client transaction entry points

Every runtime match must be removed. Tests may retain old payloads only in a clearly named stale-write rejection fixture that proves canonical Rules or command validation deny them. Documentation may describe the retired shapes historically but must not prescribe runtime support.

The scan is an exit gate, not a data-migration metric. Its report records file, line, classification, owner, and resolution for every match and fails the release on any unexplained runtime dependency.

## Legacy code deletion criteria

A legacy module, Rule, index, fixture, or job may be deleted when:

- its corresponding canonical vertical slice passes unit and Emulator integration tests;
- the canonical frontend and server release no longer imports or deploys it;
- no scheduled job, callable export, Storage Rule, Firestore Rule, or index refers to it;
- the repository scan has no unexplained dependency on it;
- the pre-cutover tag and recreated legacy test seed are available for operational rollback;
- deletion does not remove a canonical domain rule or canonical reconciliation mechanism.

The final deletion set includes old direct Booking/Course mutations, course-shaped Enrollment code, availability slots/hour locks and migration code, legacy Wallet/guest settlement, timestamp completion, compatibility fields and mappers, legacy Rules/indexes, and old fixtures. Reference-data export logic is removed after the seed artifact is approved unless it remains useful as an explicit development reseed tool.

## Test and verification strategy

### Unit and contract tests

- Lifecycle, Payment, Attendance, capacity, identity, authorization, relationship, block, proposal, and change-request matrices from `CONTEXT.md`.
- Schema rejection for all known legacy payload shapes.
- Pure pricing, outcome sufficiency, CourseDay interval, refund, and claim calculations.

### Emulator and concurrency tests

- Auth, Functions, Firestore, Storage, scheduled jobs, and provider callbacks.
- Duplicate commands, duplicate Enrollment, overlapping claims, Payment callback replay, expiration/outcome races, outbox retries, and party-size limits.
- Atomic aggregate, Payment, claims/guards, capacity, Activity Log, and required outbox-obligation writes.

### Security tests

- Direct mutation denial for all server-owned aggregates and representations.
- Relationship-scoped Participant reads, payer-only financial access, booking-scoped Instructor minimum access, administration capability, guest token scope, and block enforcement.
- Explicit rejection of stale legacy writes and removed endpoint calls.

### E2E tests

- Account self/dependent Booking.
- Guest lesson and Course reservation, administration resolution, token action, and account linking.
- Administration-created underpaid commitment and payment resolution.
- Instructor proposal acceptance.
- Family/Group Booking and multi-Participant Course enrollment.
- Attendance entry, missing-evidence Admin Issue, outcome resolution, and correction.
- Cancellation, `pending_cancellation`, reschedule, Course transfer, withdrawal, refund, and BookingChangeRequest.
- Chat/media access through canonical Booking and CourseEnrollment references.

The release requires all suites to pass from an empty database seeded only by the canonical reference artifact.

## Canonical reconciliation and observability

The system must observe and repair its own canonical representations without consulting deleted data:

- Payment current state, monetary history, Wallet movement, and provider events reconcile according to the Payment ADR.
- Resource claims, guards, CourseDay assignments, and capacity projections reconcile against canonical owners.
- Activity Log health verifies completeness and integrity against successful authoritative state-changing commands. Activity Logs are written synchronously and atomically in the authoritative transaction, so there is no Activity Log materialization lag.
- Outbox health separately exposes pending age, leasing/delivery state, retry count, dead-letter state, and Admin Issue escalation according to [ADR-0005](../adr/0005-audit-durability-and-transaction-policy.md). Delivery is asynchronous and may lag or retry independently without weakening audit completeness.
- Command idempotency exposes replay, conflict, expiry/retention, and duplicate-provider outcomes.
- Guest expiration and outcome jobs expose overdue eligible records and processing lag.

Canonical mismatch alerts block release or automation when they threaten an invariant. They are not evidence for retaining the old schema.

## Rollback procedure

Rollback is operational recovery, not runtime schema compatibility.

Before reset, Phase 7 saves:

- a development Firestore snapshot;
- the allowlisted canonical seed and checksum;
- a reproducible legacy test seed or the exact pre-cutover tag that produces it;
- deployed Rules, indexes, Functions, scheduled-job, Hosting, and configuration revisions.

If verification fails after reset:

1. Keep maintenance mode active.
2. Disable canonical scheduled jobs and mutation endpoints.
3. Save failure evidence and the partially created canonical dataset for diagnosis.
4. Either restore the saved development snapshot or recreate the legacy test dataset from the tagged seed.
5. Redeploy the matching pre-cutover Rules, Storage Rules, Functions, jobs, and frontend as one old-release bundle.
6. Run the old release's smoke tests before ending maintenance.

No canonical component reads the restored old data. No old component is deployed against canonical data. After the canonical release has passed the agreed verification window and legacy code is deleted, rollback requires the tagged source/release artifacts plus the saved snapshot or recreated seed.

## Architecture ADR status

All required architecture ADRs are accepted:

1. [ADR-0001: Canonical Aggregate Topology](../adr/0001-canonical-aggregate-topology.md)
2. [ADR-0002: Server Command, Transaction and Resource Model](../adr/0002-server-command-transaction-and-resource-model.md)
3. [ADR-0003: Payment Accounting Source](../adr/0003-payment-accounting-source.md)
4. [ADR-0004: Attendance, Outcome and Admin Issue Model](../adr/0004-attendance-outcome-and-admin-issue-model.md)
5. [ADR-0005: Audit Durability and Transaction Policy](../adr/0005-audit-durability-and-transaction-policy.md)

The canonical rewrite has no remaining blocking architecture ADRs. Implementation may proceed phase-by-phase under ADR-0001 through ADR-0005.

No Compatibility/Cutover ADR or Participant legacy identity migration ADR is required. This architecture completion does not claim that all implementation or product decisions are complete.

### Remaining non-blocking implementation and product decisions

- exact versioned `reasonCode` and semantic-effect registries;
- notification recipient/channel/template delivery matrix;
- sanitized audit/history read-model schemas and refresh mechanics;
- outbox lease, retry, and dead-letter operating policy;
- provider adapters and downstream idempotency details;
- legal retention review and any later archival policy;
- measured Firestore payload and index calibration;
- whole-Course cancellation semantics.

## Risks

- A forgotten reader, direct write, scheduled job, or Storage Rule can reintroduce the old shape after reset.
- Cloud deployment is not physically atomic; maintenance ordering and fail-closed Rules must prevent writes during intermediate states.
- A stale browser with offline persistence may retry an old payload unless Rules, endpoint removal, release checks, and local-store invalidation all work.
- Incorrectly seeded CourseDay timezones, Instructor assignments, capacity, or asset references can make a clean database unusable.
- Family/Group and multi-day Course operations may exceed Firestore transaction limits unless ADR-defined bounds are enforced before reads/writes.
- Relationship-based security is more complex than scalar Account ownership and requires complete Emulator coverage.
- Snapshot restore and recreated-seed rollback can fail if they are not rehearsed against the exact release tools.
- Removing old code too early can make pre-cutover rollback unavailable; retaining it too long can let it leak into the canonical bundle.

## Out of Scope

- Preserving or displaying historical development/test transactions.
- Reconstructing Participant identity, origin, Payment, Attendance, or CourseDays from old Booking documents.
- Running the reset or seed as part of specification authoring.
- Modifying application code, Rules, indexes, Functions, Storage, or Firestore data in this documentation change.
- Creating tickets or implementing the remaining non-blocking implementation/product decisions in this documentation change.
- Changing the canonical domain rules in `CONTEXT.md` or the topology decisions in ADR-0001.
