# T32 Canonical Admin Audit Report

Date: 2026-08-30  
Amended: 2026-09-01 — T32.8A, T32.8B, and T32.8C PASS; guest confirmation policy recorded in [ADR-0007](adr/0007-guest-identity-payment-and-confirmation.md); T32.9 split and global UX preservation recorded in [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md)
Amended: 2026-09-07 — T32.9A.8 PASS/CLOSED; T32.9A.9 redefined as FINAL CANONICAL CUTOVER (9A–9E); T32.9A.9A core authority cutover recorded; F1/F2 required before 9A close; production Booking inventory and legacy Individual Booking callable cleanup recorded
Amended: 2026-09-07 — T32.9A.9A.F3 (Canonical Multi-Participant Lesson Booking) added to roadmap after F2; F2 F3-compatibility requirement recorded; 9A final integration / production smoke gated after F3
Amended: 2026-09-07 — T32.9A.9A.F2 funded-pending-after-deadline limbo policy documented; reservation deadline vs confirmation reconciliation distinction recorded in ADR-0007
Amended: 2026-09-08 — T32.9A.9A.F3 implemented for authenticated/managed Participants and moved to READY_FOR_MANUAL_SMOKE; guest creation remains single-participant by explicit boundary; canonical additional-participant surcharge is per hour of lesson duration and is snapshotted with duration
Amended: 2026-09-08 — T32.9A.9 cutover gates strengthened for incremental production: 9B Reviews/rating continuity; 9P Global Product Parity; 9D0 production-like incremental rehearsal; 9D Selective Destructive Legacy Data Cleanup (not full Firestore reset); 9E technical+product reachability; T40/T41 superseded from empty-database reset to rehearsed selective production cutover. F3 implementation/contract is unchanged.
Amended: 2026-09-09 — T32.9A.9A.F4 (Canonical Multi-Participant Lesson Attendance UX) documented; per-participant Instructor Attendance for individual and `family_group` lesson Booking; F4 READY_FOR_MANUAL_SMOKE; 9A final integration / production smoke gated after F4
Amended: 2026-09-09 — T32.9A.9A.F1 reconciled to PASS / DEPLOYED; F3 reconciled to PASS / CLOSED after manual acceptance; F4 remains READY_FOR_MANUAL_SMOKE

Status: historical Admin-runtime audit from 2026-08-30, with later T32.8A–T32.8C and T32.9A/T32.9B migration status below. Findings in this document that describe unpaid Administrator guest approval, missing guest CourseEnrollment confirmation, or identity linking as confirmation are superseded by ADR-0007. Sections below that still describe the 2026-08-30 Admin runtime as fully legacy are historical audit evidence; later migration status in this preamble supersedes them for T32.9A progress.

## Later migration status: T32.8A–T32.8C and T32.9

| Slice  | Name                                                                                                                    | Status |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| T32.8A | Canonical identity administration (Account, Participant, ParticipantManagement, Account → managed Participant selector) | PASS   |
| T32.8B | Admin-assisted guest identity linking (`existing_managed`)                                                              | PASS   |
| T32.8C | Payment-Driven Guest Confirmation                                                                                       | PASS   |

T32.8C was previously scoped as a deferred guest-approval policy review. That name and unpaid-approval reading are superseded. T32.8C implements payment-funded guest confirmation for Lesson Booking and CourseEnrollment.

Explicitly deferred after T32.8C:

- `pay_on_site`, cash-at-start, deferred payment, and unpaid Admin override;
- partially-paid pending guest rejection or refund policy;
- unused unmanaged guest Participant cleanup.

T32.9 remains split per [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md). T32.9A is Admin UX restoration and canonical integration plus final authority cutover (9A–9E, including 9P and 9D0); T32.9B is physical legacy-runtime cleanup after the 9E gate. Production cutover is selective/incremental. Full empty-database Firestore reset is a nonproduction architectural rehearsal only (T38 / original Phase 7 contract) and is not a production instruction.

### Status table (current)

| Slice                                          | Name                                                                     | Status                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| T32.9A.8A                                      | Canonical Courses UX — archived/reactivate foundations                   | PASS / CLOSED                             |
| T32.9A.8B                                      | Canonical Courses UX — edit / catalog ownership                          | PASS / CLOSED                             |
| T32.9A.8C                                      | Canonical Courses UX — archived courses + reactivate + cursor pagination | PASS / CLOSED                             |
| T32.9A.8                                       | Canonical Courses UX                                                     | PASS / CLOSED                             |
| T32.9A.9A core                                 | Individual Booking lifecycle cutover (authority)                         | PASS at source/production authority level |
| T32.9A.9A.F1                                   | Canonical Admin Guest Payment Capture                                    | PASS / DEPLOYED                           |
| T32.9A.9A.F2                                   | Guest Unpaid Reservation Expiry                                          | READY_FOR_MANUAL_SMOKE                    |
| T32.9A.9A.F3                                   | Canonical Multi-Participant Lesson Booking                               | PASS / CLOSED                             |
| T32.9A.9A.F4                                   | Canonical Multi-Participant Lesson Attendance UX                         | READY_FOR_MANUAL_SMOKE                    |
| T32.9A.9A final integration / production smoke | 9A close gate after F4                                                   | PENDING                                   |
| T32.9A.9A                                      | Individual Booking lifecycle cutover (overall)                           | NOT CLOSED — finalization in progress     |
| T32.9A.9B                                      | Student Booking Stats / Progress / Recommendations / Reviews Cutover     | PENDING                                   |
| T32.9A.9C                                      | Course Progress / Achievements Cutover                                   | PENDING                                   |
| T32.9A.9P                                      | Global Product Parity & Legacy Dependency Gate                           | PENDING                                   |
| T32.9A.9D0                                     | Production-like Incremental Cutover Rehearsal                            | PENDING                                   |
| T32.9A.9D                                      | Selective Destructive Legacy Data Cleanup                                | PENDING                                   |
| T32.9A.9E                                      | Canonical Authority / Reachability Gate                                  | PENDING                                   |
| T32.9B                                         | Final Legacy Write / Runtime Cleanup                                     | PENDING; blocked until T32.9A.9E PASS     |
| T40                                            | Execute Rehearsed Selective Production Cutover                           | PENDING; after T32.9B                     |
| T41                                            | Expanded Post-Cutover Verification                                       | PENDING; after T40                        |

Status labels used here: `PASS`, `PASS / CLOSED`, `PASS / DEPLOYED`, `REQUIRED`, `IN PROGRESS`, `PLANNED`, `READY_FOR_MANUAL_SMOKE`, `PENDING`, `NOT CLOSED`. F1 is `PASS / DEPLOYED`; F3 is `PASS / CLOSED`. Do not treat F2 or F4 as `PASS`, `CLOSED`, or `DEPLOYED` until production-smoked.

### T32.9A.8 — Canonical Courses UX — PASS / CLOSED

```text
T32.9A.8A — PASS / CLOSED
T32.9A.8B — PASS / CLOSED
T32.9A.8C — PASS / CLOSED
```

### T32.9A.9 — FINAL CANONICAL CUTOVER

T32.9A.9 is **not** “Admin Integration Smoke only.” It is the final canonical cutover sequence. There is **one** production path (selective/incremental). The original Phase 7 empty-database reset remains historical/reference and T38 nonproduction rehearsal only.

```text
T32.9A.9A — Individual Booking lifecycle cutover
  T32.9A.9A core
  T32.9A.9A.F1 — Canonical Admin Guest Payment Capture
  T32.9A.9A.F2 — Guest Unpaid Reservation Expiry
  T32.9A.9A.F3 — Canonical Multi-Participant Lesson Booking
  T32.9A.9A.F4 — Canonical Multi-Participant Lesson Attendance UX
  T32.9A.9A final integration / production smoke
T32.9A.9B — Student Booking Stats / Progress / Recommendations Cutover
         (includes Reviews / Instructor Rating Continuity)
T32.9A.9C — Course Progress / Achievements Cutover
T32.9A.9P — Global Product Parity & Legacy Dependency Gate
T32.9A.9D0 — Production-like Incremental Cutover Rehearsal
T32.9A.9D — Selective Destructive Legacy Data Cleanup
T32.9A.9E — Canonical Authority / Reachability Gate
THEN
T32.9B — Final Legacy Runtime Cleanup
THEN
T40 — Execute Rehearsed Selective Production Cutover
T41 — Expanded Post-Cutover Verification
```

Do not change the F3 multi-participant design in this sequence. F3 remains a 9A slice; later gates consume it, they do not reopen it.

Architectural principle (see also [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md)):

```text
LEGACY IMPLEMENTATION != LEGACY FEATURE

Preserve useful UX
  → replace backend authority
  → add canonical UX
  → prove parity
  → remove legacy implementation
```

Booking-specific rule for this cutover:

```text
Canonical Booking owns lifecycle,
not progress / presentation / feedback data by default.
```

#### T32.9A.9A — Individual Booking lifecycle cutover — PARTIAL / FINALIZATION IN PROGRESS

**9A overall is NOT CLOSED** until F2 + F4 + final integration / production smoke complete (F1 `PASS / DEPLOYED`; F3 `PASS / CLOSED`).

Core lifecycle cutover (authority level) — recorded as PASS at source/production authority level:

- canonical Booking is operational authority for current/future individual lessons;
- Student lifecycle reads/writes — canonical;
- Guest lifecycle — canonical;
- Admin / Planner lifecycle — canonical;
- Instructor lesson list/history/completion — canonical;
- proposals / change requests — canonical;
- resource claims / scheduling changes — canonical;
- legacy Booking realtime sync disabled;
- active reachable legacy Booking lifecycle writers = 0;
- legacy recommendation writer remains only in dead/unreachable code;
- recommendation editor temporarily removed from Instructor Workspace;
- completion goes through canonical `record_booking_attendance`;
- legacy `scheduledAutoCompleteBookings` removed from source export and deleted from production;
- legacy Individual Booking lifecycle callables deleted from production (see inventory below).

##### T32.9A.9A.F1 — Canonical Admin Guest Payment Capture — PASS / DEPLOYED

Goal: Administrator must have a canonical way to record money actually received from a guest for an individual lesson.

Required behavior:

```text
Guest Booking
  → Admin opens Booking
  → sees required amount / paid amount / remaining amount
  → «Зафиксировать оплату»
  → canonical finance/payment command
  → Payment remains numeric authority
  → full funding leads to canonical guest confirmation
```

Explicit rules:

- no legacy guest wallet authority;
- no direct Booking status patch;
- no dual write;
- KZT only;
- idempotent real-money write;
- audit required;
- server-side authorization;
- partial payment semantics follow current Payment domain ([ADR-0003](adr/0003-payment-accounting-source.md));
- payment success must not be reported as failure if confirmation is temporarily delayed;
- confirmation/reconciliation remains canonical ([ADR-0007](adr/0007-guest-identity-payment-and-confirmation.md)).

F1 is implemented and deployed to production. Admin guest lesson payment capture uses canonical `record_provider_payment_event` through `executeCanonicalCommand` on the Admin lesson Booking detail surface (`AdminLessonBookingDetail` / `useAdminLessonBookingCommands`). F1 is **PASS / DEPLOYED**.

##### T32.9A.9A.F2 — Guest Unpaid Reservation Expiry — READY_FOR_MANUAL_SMOKE

Goal: an unpaid guest individual Booking must not hold instructor/resource slots indefinitely.

Implemented facts (not newly invented policy):

- Command: existing `expire_guest_reservation` (server/system only). Scheduler is orchestrator only.
- Scheduler: `scheduledExpireGuestLessonReservations`, cadence `every 5 minutes`, timezone `UTC`.
- Authoritative deadline field: `Booking.lifecycle.reservationExpiresAt`.
- Created at guest lesson creation by `resolveGuestLessonReservationExpiresAt`: `min(createdAt + GUEST_LESSON_RESERVATION_TTL_MS, serviceStartsAt)` where TTL = 1 hour.
- Clock: server authoritative time. Inclusive boundary: `now >= reservationExpiresAt` is expired.
- Eligibility: guest origin, `pending`, Payment exists and matches Booking identity, Payment is not `isPaymentFullyFundedForService`, deadline reached.
- Lifecycle: `pending` → `cancelled` with `reasonCode: 'reservation_expired'`.
- Partial payment does not protect the reservation; Payment amounts are not refunded, retained, written off, or deleted by expiry.
- Payment after deadline is rejected by the F1 guest acceptance predicate even if the scheduler has not run yet.
- Fully funded pending Booking after `reservationExpiresAt` is a confirmation/reconciliation case, not unpaid expiry, while service has not started. Expiry returns `fully_funded`; reconciliation confirms and retains the claim.
- Resource claims are released once per Booking via `planReleaseBookingClaims` (one instructor occurrence claim, not per participant as the expiry authority).
- No expiry notification/outbox obligation. Audit: `activity_logs` with `scheduled_system_action`.
- Candidate query: guest + pending + `lifecycle.reservationExpiresAt.seconds <= now`, ordered by that seconds field then `bookingId`, page size 25, max 100 per invocation.
- F3 compatibility: expiry authority is the Booking aggregate. No `participantIds.length === 1` assumption. Payment.price is not recomputed from participant count.

**Limbo policy resolution (accepted).** Prior ambiguity: Payment fully funded, Booking `pending`, `now >= reservationExpiresAt`, service not started — expiry skipped the Booking, confirmation/reconciliation did not confirm, resource claim stayed active. Canonical policy:

- `reservationExpiresAt` governs unpaid reservation hold and new funding acceptance, not delayed reconciliation of an already fully funded Booking;
- `pending` + fully funded + service not started → eligible for canonical confirmation/reconciliation even after the reservation deadline; claim retained;
- `pending` + not fully funded + deadline passed → `cancelled` / `reservation_expired`; claim released;
- late funding after deadline → rejected server-side; no Payment mutation; no resurrection;
- fully funded + `pending` + past deadline must not remain a permanent canonical state — reconciliation must confirm when invariants are satisfied.

F2 does not introduce `fullyFundedAt`, a new event timestamp policy, or funding-time inference from `Payment.updatedAt`.

Requirements covered:

- use the existing canonical expiry policy/command (`expire_guest_reservation` / `reservationExpiresAt` domain policy);
- scheduler is orchestrator only, not a direct status writer;
- expired unpaid guest reservation releases resource claims;
- funded/confirmed Booking must never be incorrectly expired;
- payment vs expiry race must be safe;
- confirmation reconciliation vs expiry must be safe;
- bounded scheduler;
- indexed query;
- idempotent processing;
- no legacy scheduler/write.

Do not invent a new TTL in this document. Use the existing domain reservation-expiry policy already encoded by canonical Booking lifecycle. Concrete duration belongs to that policy, not to a migration invention.

**F3 compatibility requirement.** F2 does not implement multi-participant lesson booking. F2 remains **F3-compatible**: expiry is a lifecycle operation over the Booking/Payment reservation aggregate, not over a single Participant. After F3, one Booking still has one expiry decision, one lifecycle transition, one slot release, and one Payment outcome — regardless of participant count.

9A cannot close without F2 production smoke plus F4. F2 is not PASS/CLOSED/DEPLOYED. F3 is already `PASS / CLOSED`.

##### T32.9A.9A.F3 — Canonical Multi-Participant Lesson Booking — PASS / CLOSED

Goal: support booking one individual/private lesson for several managed Participants in a single canonical lesson reservation.

**Delivered scope boundary.** Multi-participant creation is available only for canonical authenticated/managed Participants. Guest lesson creation still accepts exactly one guest Participant/contact. F3 does not introduce several guest profiles, a multi-guest identity contract, multi-guest linking/claim semantics, or several guest contacts inside one Booking. This restriction exists only at the guest creation boundary: the canonical `Booking` aggregate and all Booking-level lifecycle, Payment, expiry, cancellation, and reconciliation workflows remain party-size independent over `participantIds[]`.

Aggregate semantics:

```text
several Participants
        ↓
ONE Lesson Booking
```

This is **not** several independent Bookings. A canonical lesson reservation represents one instructor lesson in one time slot with multiple participants.

**Canonical invariants** for multi-participant lesson:

```text
1 Lesson Booking
1 instructor/time-slot reservation
1 Booking lifecycle
1 Payment
1 cancellation workflow
N Participants
```

When selecting Participants A + B:

```text
Booking
  participantIds = [A, B]
```

Not:

```text
Booking A
Booking B
```

for the same slot. Do not create separate instructor slot locks, Payments, or Booking lifecycles per Participant. One instructor occurrence claim reserves the lesson; each Participant additionally receives the existing conflict claim needed to prevent that Participant from being double-booked.

**Participant model.** Canonical direction: `Booking.participantIds[]` must support at least `[A]` and `[A, B]` and is the source of truth for new canonical lesson writes. Do not document a specific migration implementation for legacy `participantId` until a code/schema audit defines a safe cutover/compatibility strategy.

Product/domain invariant: **multi-participant Booking cannot be represented by only the first `participantId`.** The following is forbidden as canonical truth for multi-participant lesson:

```text
participantId = participantIds[0]
```

**Frontend participant selection** (preserve approved semantics):

```text
participants.length === 1
→ picker hidden
→ participant determined automatically
→ booking submit uses its participantId

participants.length >= 2
→ show multi-select Participant Picker
→ user may select multiple Participants
→ booking submit uses full effectiveParticipantIds[]
```

Existing derived-state baseline:

```text
single participant → [singleParticipantId]
multiple participants → selected valid participant IDs
```

`0 participants` is not a normal product flow. It is a transitional/error state (loading, provisioning incomplete, read-model/provisioning error).

**CourseEnrollment — do not change.** Lesson and Course differ:

```text
Lesson:  Participants A + B → ONE Booking → participantIds = [A, B]
Course:  Participants A + B → Enrollment A + Enrollment B
```

CourseEnrollment remains a separate canonical enrollment per Participant. F3 must not merge multiple CourseEnrollments into one aggregate.

**Pricing rule.** Lesson total:

```text
totalPrice =
  baseLessonPrice
  + additionalParticipantSurchargePerHourKzt
    × (participantCount - 1)
    × lessonDurationMinutes / 60
```

for `participantCount >= 1`:

```text
1 participant, any duration → baseLessonPrice
2 participants, 60 min, surcharge 5000 → baseLessonPrice + 5000
2 participants, 90 min, surcharge 5000 → baseLessonPrice + 7500
3 participants, 90 min, surcharge 5000 → baseLessonPrice + 15000
2 participants, 30 min, surcharge 5000 → baseLessonPrice + 2500
```

Do not fix a concrete additional-participant fee amount in this document.

**Admin-configurable lesson settings.** The delivered canonical singleton `/lesson_pricing_settings/lesson_booking` contains `additionalParticipantSurchargePerHourKzt` and `maxParticipantsPerLesson`. Administrator changes use `update_lesson_pricing_settings`, expected-revision OCC, mandatory reason, server validation, idempotency, and immutable audit. The maximum is a positive safe integer with no hardcoded business upper bound or implicit default. The UI reads both values only for preview, picker, and validation UX; the booking transaction reads the current setting and remains final authority. Duration is taken from the canonical lesson/Booking schedule, not from a frontend total. New authenticated creation fails closed when the aggregate is absent or invalid. Guest creation remains its separate single-participant boundary.

**Server price authority.** Frontend may show estimated/display price; authoritative Booking cost is determined by backend. The canonical command uses base lesson price, participant count, canonical lesson duration, and current canonical additional-participant hourly surcharge to calculate total server-side. Frontend does not pass authoritative final price.

**Pricing snapshot.** Admin setting changes after Booking creation must not change cost of existing bookings. F3 requires Booking/Payment to retain sufficient immutable pricing snapshot / monetary facts to prove:

```text
base lesson price
+ surcharge per hour
+ duration
+ participant count
+ settings revision
= authoritative charged price
```

The delivered Booking pricing basis is `lesson_party:v1` with base lesson price, snapshotted per-hour surcharge and settings revision, lesson duration, Participant count, and calculated total. Payment retains numeric original/current price authority. A later Administrator setting change therefore affects only future creation; existing Booking/Payment facts do not drift.

**Authorization.** On multi-participant Booking creation, backend must verify authorization/ownership/managed-participant access for **every** `participantId`. If A is authorized and B is not, the whole command must fail atomically — no partial Booking.

**Atomicity.** Multi-participant lesson creation must be atomic relative to: Booking; slot reservation/occupancy; Payment; Wallet debit if applicable; participant relations/claims; idempotency; relevant ActivityLog/outbox effects. No partial results (Booking created but second Participant not attached; double debit; two slot locks).

**Cancellation.** Multi-participant lesson has one Booking and one shared lifecycle. F3 does not introduce per-Participant cancellation by default:

```text
cancel Booking → entire lesson reservation cancelled
```

Removing one Participant from an existing group lesson booking, if needed later, is a separate explicitly designed workflow — not a hidden part of F3.

**Attendance compatibility.** F3 must be compatible with participant-level attendance semantics. One Booking may have `participantIds = [A, B]` while attendance differs per participant (`A → present`, `B → absent`). Do not collapse multi-participant attendance to a single participant status. F3 need not redesign Attendance, but Booking/read-model architecture must not block per-participant attendance. **F4** implements the Instructor per-participant Attendance UX and operational path on top of this F3-compatible architecture; F4 does not change F3 Booking aggregates.

**Read models / UI.** F3 must update all lesson Booking read surfaces that assume `one Booking == one Participant`. Audit: client booking history; upcoming lessons; Instructor panel; Admin Lesson Booking; Admin Planner; booking monitor; participant-specific views; notifications; cancellation UI; Payment presentation; attendance UI; activity/audit presentation. UI must display all Participants of a Booking.

**Idempotency.** Replaying the same canonical create-booking command with the same idempotency intent must not create a second Booking, re-reserve slot, re-create Payment, re-debit Wallet, or lose/duplicate Participants.

**Maximum participant count.** `maxParticipantsPerLesson` in canonical Admin lesson settings is the business authority for new authenticated/managed Booking creation. There is no hardcoded Booking-schema business maximum. Creation validates the current setting inside the same authoritative transaction after Participant access checks and before Booking, Payment, Wallet, or claim writes. An existing Booking remains valid if the maximum is later reduced; its Payment/pricing snapshot and lifecycle remain unchanged, and reschedule with the same `participantIds[]` remains allowed. A composition addition applies the current maximum. Independently, the transaction planner may reject an operation that exceeds ADR-0002 technical read/write/payload budgets.

**Acceptance criteria.** F3 is complete only when proven:

| Scenario              | Expected outcome                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single participant    | Picker hidden; ONE Booking; `participantIds` contains A; ONE Payment; ONE slot reservation                                                                      |
| Two participants      | Select A + B; ONE Booking; `participantIds` exactly [A, B]; ONE Payment; ONE slot reservation                                                                   |
| Three participants    | Select A + B + C; ONE Booking; per-hour surcharge applied twice and scaled by duration; ONE Payment; ONE slot reservation                                       |
| Configurable maximum  | Current max admits parties up to that value; an over-max or forged request is rejected atomically with zero Booking/Payment/claim writes                        |
| Guest boundary        | A guest creation request with more than one Participant is rejected before Booking/Payment creation; authenticated multi-participant creation remains available |
| Authorization         | A allowed + B not allowed → whole command rejected; no partial Booking/Payment/slot mutation                                                                    |
| Pricing               | 2 participants → base price + one additional-participant fee                                                                                                    |
| Admin pricing setting | Admin changes fee → future bookings use new fee; existing bookings retain old financial truth                                                                   |
| Admin maximum setting | Admin reduces max → future oversized bookings fail; existing larger Booking and same-party reschedule remain valid                                              |
| Idempotency           | Same booking command replay → no duplicate Booking/Payment/debit/slot reservation                                                                               |
| Cancellation          | Multi-participant Booking cancelled → one canonical cancellation; slot released once; financial policy applied once                                             |
| Read models           | All affected lesson Booking read models show full participant set                                                                                               |
| Course regression     | CourseEnrollment multi-select still creates independent enrollment per Participant                                                                              |

F3 source, unit, Firestore Emulator, local browser E2E, and manual acceptance evidence are complete. The slice is **PASS / CLOSED**. 9A still cannot close without F2/F4 production-equivalent smoke and the final integration gate.

**F4 dependency.** F3 records the Booking/Payment/slot aggregate for multiple Participants. F4 completes the Instructor Attendance operational path F3 requires. F4 does **not** redesign F3 monetary, slot, or booking-aggregation semantics.

##### T32.9A.9A.F4 — Canonical Multi-Participant Lesson Attendance UX — READY_FOR_MANUAL_SMOKE

Goal: expose canonical factual Attendance to the assigned Instructor **per frozen service participant** for both individual lesson Booking and F3 `family_group` / multi-participant lesson Booking.

F4 does **not** redesign F3 Booking. One canonical Booking may contain multiple frozen `serviceParticipantIds`. Attendance remains a separate canonical aggregate per participant occurrence (`attendance:v1:booking:{occurrenceId}:{participantId}` per [ADR-0004](adr/0004-attendance-outcome-and-admin-issue-model.md)).

**Resolved gaps (pre-F4; documented as fixed, not current defects).**

1. `InstructorBookingCard` rendered `booking.participants[]` but the attendance action targeted only `booking.participantId` (effectively the first participant).
2. The action was lifecycle-oriented (“complete lesson”) and hardcoded `attendanceStatus = present`.
3. Instructor lesson Booking read models had no current Attendance status/revision/authorized-action projection per participant.
4. For `family_group`, one `present` could derive `Booking.lifecycle = completed`, after which existing authorization prevented the Instructor from filling missing Attendance for remaining participants.
5. Old attendance command idempotency identity was designed for a one-way “complete” action and could collide across factual corrections.
6. A `family_group` Booking could disappear from the Instructor `confirmed` filter after the first `present` even while remaining participants still needed Attendance.

**Canonical Attendance model (unchanged by F4).**

Stored Attendance statuses remain only `present` and `absent`. Missing Attendance document means **not recorded** — missing factual evidence. It is **not** `absent`, `present`, `no_show`, or `completed`.

F4 did **not** introduce: explicit `unknown` status; a booking-level attendance field; frontend direct Attendance Firestore writes; or legacy `completeBooking` lifecycle mutation. Attendance remains factual evidence. Booking lifecycle remains server-derived.

**Instructor read-model extension.**

Instructor scopes (`instructor_hot`, `instructor_history`) on `queryLessonBookingReadModels` now expose an optional top-level per-participant Attendance projection (`LessonBookingInstructorAttendancePresentation` in `lessonBookingReadModel.ts`):

```text
attendance: [
  {
    participantId,
    attendanceStatus?: 'present' | 'absent',
    revision?: number,
    authorizedActions: {
      canRecordPresent: boolean,
      canRecordAbsent: boolean
    }
  }
]
```

Semantics:

- every frozen `serviceParticipantId` is represented;
- missing Attendance → `attendanceStatus` and `revision` omitted together (schema-enforced pair);
- status and revision are loaded from canonical Attendance;
- `authorizedActions` are server-derived via `evaluateInstructorBookingAttendanceActions` / `bookingAttendancePolicy.ts`;
- Instructor list projection does not expose Admin-only correction reason/provenance unless already allowed elsewhere.

Admin continues to use `admin.attendance` on the Admin detail projection. Other read scopes remain contract-compatible.

**Instructor UX after F4.**

The Booking-level action “Mark completed” / “Complete lesson” was removed from Instructor lesson cards. Attendance is shown and acted on **per participant**.

For every rendered participant:

| Attendance state | Label        | Actions                         |
| ---------------- | ------------ | ------------------------------- |
| Not recorded     | Not recorded | Present / Absent when authorized |
| Present          | Present      | Absent only when correction authorized |
| Absent           | Absent       | Present only when correction authorized |

Submitting state is participant-specific (`instructorLessonAttendanceSubmissionId`). After success the canonical read model is refetched; the UI renders server-confirmed Attendance with no authoritative optimistic Attendance state.

**Frontend command contract.**

Conceptual helper: `recordLessonAttendance(...)` in `useBookingCollaborationCommands.ts` (replaces the old `recordLessonCompleted(...)` concept).

Input:

```text
{
  bookingId,
  participantId,
  attendanceStatus,
  expectedAttendanceRevision?
}
```

Canonical command:

```text
kind: record_booking_attendance
exercisedCapability: instructor
```

`record_booking_attendance` is **not** a standalone Firebase Function. It executes through `executeCanonicalCommand`. The frontend authenticated command surface is `executeCanonicalCommand`. The read-model callable is `queryLessonBookingReadModels`. Do **not** document a deploy target `functions:record_booking_attendance`.

**Revision / OCC semantics.**

- Missing Attendance → omit `expectedAttendanceRevision`.
- Changing existing Attendance → send exact current Attendance `revision`. The client does not invent revisions.
- On `stale_version` → refetch authoritative state; do not blindly replay the correction; the user may retry deliberately.

**Idempotency.**

Semantic attempt identity (`deriveRecordInstructorAttendanceIdempotencyKey`):

```text
attendance:{bookingId}:{participantId}:{attendanceStatus}:{expectedAttendanceRevision|missing}
```

Invariants:

- duplicate retry of the same deliberate action reuses the same identity;
- `missing → present` and later `present → absent` cannot collide;
- idempotency is not keyed by `bookingId` alone.

**`family_group` terminal Attendance policy (domain clarification).**

For `family_group` Booking, Attendance remains independent for every frozen `serviceParticipantId`. Example:

```text
A → present
→ server may derive Booking.lifecycle = completed
```

Even after Booking is terminal `completed`, the assigned Instructor may still, inside the existing Instructor Attendance window (`endsAt + 24h` per ADR-0004), **add missing** Attendance for remaining frozen participants when doing so does not change the already-derived terminal lifecycle (`instructorMayFillMissingFamilyGroupAttendanceOnTerminal`).

Example:

```text
A = present, Booking = completed
→ Instructor records B = absent, C = present
→ A = present, B = absent, C = present, Booking remains completed
```

**Terminal safety boundary (fail-closed).**

For terminal `family_group` Booking the Instructor may fill **currently missing** participant Attendance when server policy determines the projected lifecycle remains the current terminal lifecycle.

The Instructor may **not**:

- generically rewrite terminal Booking lifecycle;
- correct existing terminal `family_group` Attendance if that could undermine or alter the terminal outcome;
- perform `completed ↔ no_show` terminal corrections (Admin-controlled per existing Attendance correction policy).

Participant must belong to frozen `serviceParticipantIds`. All authorization remains server-side.

**Confirmed-filter retention rule (presentation only).**

Without special handling, a `family_group` Booking that becomes `completed` after the first `present` would leave the Instructor `confirmed` filter while B/C still need Attendance.

F4 adds `isInstructorBookingVisibleForStatusFilter` / `hasOutstandingInstructorLessonAttendance`: a `completed` Booking may remain visible on the Instructor `confirmed` view while at least one participant still has a server-authorized Attendance action. This does **not** fake or override lifecycle — `Booking.lifecycle` remains `completed`. The UI only keeps the item reachable while outstanding Attendance work remains.

**Auto-present policy — out of scope.**

F4 does **not** implement automatic `present` after 24 hours. If the Instructor does not record Attendance during the allowed window, missing Attendance remains missing; the system does not invent `present` or `absent`. Existing `missing_attendance` / AdminIssue policy remains authoritative. F4 does **not** change the existing 24-hour Instructor Attendance window.

**Lesson outcome finalization and Instructor routing.**

Deterministic lesson outcomes resolve at `endsAt`, not at `endsAt + 24h`:

- `>=1 present` → `completed`
- all absent → `no_show`
- `0 present + any missing` → remain `confirmed` / unresolved

Attendance recorded before `endsAt` is evidence only until `endsAt`. After `endsAt`, `scheduledResolveLessonBookingAttendanceOutcomes` invokes existing `resolve_attendance_outcome` (no duplicated calculator). Same-status Instructor `record_booking_attendance` on a still-`confirmed` Booking also reaches the calculator so a post-`endsAt` correction path can finalize if needed.

Instructor read routing (`isInstructorLessonBookingHot`):

- `ended + confirmed` stays in `instructor_hot` through `endsAt + 24h` (operational “Not recorded” / remaining Attendance actions);
- after resolution (`completed` / `no_show`) the Booking moves to `instructor_history`;
- after `endsAt + 24h`, unresolved `confirmed` leaves the operational view for history / Admin `missing_attendance`.

Instructor history follows the same page-cursor drain as `instructor_hot` (default page size 25). The first page is not a silent universe cap.

**Courses — unchanged.**

F4 is lesson-Booking-specific. CourseDay Attendance, `CourseEnrollment.attendanceSummary`, course attendance commands, course attendance UX, and course lifecycle policy are unchanged.

**Legacy boundary.**

F4 does **not** restore or use: legacy `completeBooking` lifecycle path; direct frontend `updateDoc` on canonical Booking lifecycle; or direct frontend Attendance Firestore writes.

`completeBookingService` / `completeBookingViaCallable` remain elsewhere in the repository for non-Instructor legacy paths and are **not** the current Instructor Attendance path. Unused i18n keys such as `instructorCompleteLesson` are cleanup/deferred, not active Instructor behavior.

**Historical data.**

Historical legacy lesson/training records do not need Attendance backfill. No new requirement to migrate historical attendance. Old legacy training/lesson history may be removed according to the accepted cutover policy (9D).

**Verified automated evidence (2026-09-09 worktree).**

| Suite | Result |
| ----- | ------ |
| Frontend F4 unit (`instructorLessonAttendanceCard`, `instructorWorkspaceCanonical`, `bookingCollaborationIntegration`, `bookingCollaborationViewModels`, `bookingAttendancePolicy`) | 32 passed |
| Shared-domain `lessonBookingReadModel.test.ts` | 11 passed |
| Functions `bookingAttendanceCommands.test.ts` + `lessonBookingReadModels.test.ts` | 33 passed (23 + 10) |
| Functions `bookingAttendanceCommands.emulator.test.ts` | 20 tests present; skipped without Firestore emulator in the documentation verification run — execute via `npm run test:functions:emulator` |
| `tests/firestore.rules.test.ts` | 67 tests present; not re-executed in this documentation session |
| i18n parity (`translationsParity.test.ts`) | 2 passed |
| `npx tsc --noEmit` (app) | pass |
| `functions` `tsc --noEmit` + build | pass |
| `npm run build` (app) | pass |
| `npm run i18n:check` | pass |

Do not mark F4 `DONE` from automated tests alone.

**Required manual smoke (before `DONE`).**

Individual:

- missing → present;
- missing → absent.

Family/group (`A`, `B`, `C` all start Not recorded):

- `A → present` → Booking becomes `completed`;
- `B` / `C` remain reachable on the Instructor lesson list;
- `B → absent`, `C → present` → Booking remains `completed`.

Confirmed filter:

- Booking remains reachable on `confirmed` while `B` / `C` still have server-authorized Attendance actions.

**Deployment surfaces.**

F4 backend changes require deployment of:

1. `executeCanonicalCommand` — `record_booking_attendance` handler/policy executes through the canonical authenticated command callable.
2. `queryLessonBookingReadModels` — Instructor Attendance projection changed.

Frontend changes require Firebase Hosting.

No Firestore rules/index deployment is required unless rules/index files change for this slice.

```bash
npx firebase deploy --only functions:executeCanonicalCommand,functions:queryLessonBookingReadModels
npx firebase deploy --only hosting
```

Do **not** deploy `functions:record_booking_attendance` — no such standalone callable exists.

F4 is **READY_FOR_MANUAL_SMOKE** — not PASS/CLOSED/DEPLOYED. 9A still cannot close without F2/F4 production-equivalent smoke and the final integration gate (F1 `PASS / DEPLOYED`; F3 `PASS / CLOSED`).

##### T32.9A.9A final integration / production smoke — PENDING

Gate after F2 + F4 (with F1 `PASS / DEPLOYED` and F3 `PASS / CLOSED` already recorded). Confirms end-to-end individual Booking lifecycle cutover (including guest payment capture, unpaid reservation expiry, multi-participant lesson booking, and per-participant Instructor Attendance) on production or production-equivalent smoke paths before 9A may close and 9B begins.

9A cannot close without this smoke block. It is not PASS/CLOSED/DEPLOYED until executed and recorded.

#### Production Booking inventory (ski-school-8f3ca) — PASS

Read-only inventory result for Individual Booking cutover:

| Classification             | Count |
| -------------------------- | ----- |
| CANONICAL_CURRENT_FUTURE   | 16    |
| LEGACY_ONLY_CURRENT_FUTURE | 0     |
| CANONICAL_PAST             | 1     |
| LEGACY_PAST_DISPOSABLE     | 11    |
| AMBIGUOUS                  | 0     |

Interpretation:

- current/future legacy-only Booking blockers = 0;
- ambiguous Booking docs = 0;
- current/future Booking migration/backfill NOT required;
- 11 leftover historical Booking docs may be deleted later in T32.9A.9D only if the 9P/9D0 manifest still classifies them disposable and they have no protected messages or other 9P-preserved children;
- historical legacy lesson/booking history is disposable;
- NO historical backfill required.

Document IDs are omitted here; inventory tooling lives under `scripts/individual-booking-cutover-inventory.mjs`.

#### Production legacy Individual Booking functions cleanup

After production cleanup, these **legacy Individual Booking lifecycle** functions are removed:

- `addBooking`
- `cancelBooking`
- `completeBooking`
- `confirmBooking`
- `createBooking`
- `createGuestBooking`
- `deleteBooking`
- `linkGuestBooking`
- `requestBookingCancellation`
- `scheduledAutoCompleteBookings`
- `updateBookingSchedule`

Production remains on canonical functions, including:

- `executeCanonicalCommand`
- `executeGuestCanonicalCommand`
- `queryLessonBookingReadModels`
- `queryBookingProposalReadModels`
- `queryBookingChangeRequestReadModels`
- and other canonical read models

This is **not** a claim that every legacy function in the project was removed — only the legacy Individual Booking lifecycle surface above.

#### Background jobs (Booking-related)

| Job                                             | Status                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `scheduledAutoCompleteBookings`                 | Removed (source export + production)                                                       |
| `scheduledReconcileGuestConfirmationMismatches` | Canonical / active                                                                         |
| `scheduledPurgeExpiredNotifications`            | Canonical / active                                                                         |
| Guest unpaid reservation expiry scheduler       | `scheduledExpireGuestLessonReservations` — READY_FOR_MANUAL_SMOKE (`every 5 minutes`, UTC) |

Do not confuse completion scheduling with payment-confirmation reconciliation.

#### T32.9A.9B — Student Booking Stats / Progress / Recommendations Cutover — PENDING

Mandatory scope:

- instructor recommendations;
- lesson feedback;
- student individual lesson stats;
- student history-derived progress;
- streaks;
- today checklist;
- related individual lesson achievement inputs;
- completed recommendation IDs, if they remain product-relevant after domain review;
- **Reviews / Instructor Rating Continuity** (see below).

Product decision:

```text
Recommendation / feedback / progress
must NOT be auto-added as fields on canonical Booking.

First determine the correct canonical progress/feedback authority.
```

During 9A, recommendation editing is temporarily disabled in Instructor Workspace.

In 9B:

- create or use the correct canonical authority;
- canonical write command(s);
- canonical read model;
- authorization / OCC / idempotency;
- restore Instructor recommendation editor;
- provide Student canonical read UX;
- active legacy recommendation writes = 0;
- no dual write;
- complete Reviews / Instructor Rating Continuity so Student Cabinet no longer depends on legacy Booking implementation for reviews.

This slice is documentation of required migration scope. It does not implement 9B.

##### Reviews / Instructor Rating Continuity — mandatory 9B scope

Verified current runtime (2026-09-08 worktree / `main`), not assumed:

- Student Cabinet create-review path: `CabinetRouteContainer` → `addReviewService` in `src/features/bookings/bookingService.ts`.
- Parallel path: `useBookingActions.handleAddReview` → the same `addReviewService`.
- `addReviewService` is a **client-direct** mutation: `setDoc` on `/reviews/{id}`, then `updateDoc` on `/instructors/{id}` for `rating` and `reviewsCount`. It is not a canonical command. Firestore Rules allow authenticated create on `/reviews` when `userId == auth.uid`.
- Review reminder / dismissed semantics: `users.dismissedReviewIds` via `profileService` `arrayUnion`; consumers include Student Cabinet history, `StudentNeedsAttention`, `AppShell`, `PersonalCabinet`, and notification hubs.
- Display surfaces: instructor cards (`rating`, `reviewsCount`), Student Coach panel sort, reviews modal (`setReviewsInstructor`).

9B must migrate this capability **before T32.9B may delete `bookingService` / `useBookingActions`**. Do not park reviews on canonical Booking merely because the current helper lives in `bookingService`. First determine the correct reviews/rating authority (existing `/reviews` + instructor projection, or a later accepted aggregate). Do not invent a new Reviews aggregate in this document.

Mandatory acceptance (create, relate, display, mutate, then drop legacy Booking dependency):

| Concern | Required outcome |
| --- | --- |
| Create review | Authenticated student can submit a review through a canonical/approved command path, not leftover Booking callable/service authority |
| Review → lesson/service | Review remains related to the lesson/service it is about; multi-participant lessons must not collapse to “first participant only” as the review subject |
| Review → instructor | Review remains related to the instructor who delivered the lesson |
| Instructor rating | `instructors.rating` (or its canonical replacement) stays consistent with accepted reviews |
| `reviewsCount` | Count stays consistent with accepted reviews |
| Review display | Instructor/Student surfaces that currently show rating and count keep equivalent information |
| Reviews modal | Existing reviews modal/list remains reachable |
| Review reminder | Post-lesson review reminder remains |
| Dismissed review semantics | `dismissedReviewIds` (or canonical equivalent) still suppresses reminder without deleting the review |
| Mutation authority | No client-direct `/reviews` or instructor rating write remains as the production authority; server authorization, OCC/idempotency as required by sibling commands |
| Legacy Booking decoupling | After 9B PASS, deleting leftover `bookingService` / `useBookingActions` must not remove reviews/rating |

9B is not PASS while Student Cabinet still requires `addReviewService` on the legacy Booking service for a working review.

#### T32.9A.9C — Course Progress / Achievements Cutover — PENDING

Separate Course-domain stage after individual-lesson progress cutover (9B). Do not expand Course progress scope here without existing product decisions.

9C PASS is required before 9P. 9P then proves Course progress/achievements together with the rest of the product, not as a substitute for 9C.

#### T32.9A.9P — Global Product Parity & Legacy Dependency Gate — PENDING

Purpose: before any destructive legacy data or leftover-implementation cleanup, prove that **every existing useful product capability** has a working canonical or explicitly approved path.

9P is an inventory-and-evidence gate. It does not implement F3, 9B, or 9C. It consumes their PASS evidence plus remaining product surfaces that those slices do not own.

Mandatory inventory (one row per capability; fill during 9P, do not invent PASS here):

| Feature / capability | Role(s) | Current UX | Current dependency | Canonical/approved replacement | Information parity | Action parity | Interaction parity | Status | Safe to remove legacy? |
| -------------------- | ------- | ---------- | ------------------ | ------------------------------ | ------------------ | ------------- | ------------------ | ------ | ---------------------- |

Status values:

```text
PASS
PARTIAL
MISSING
NEEDS_PRODUCT_DECISION
```

**9D is forbidden** while any in-scope row is `PARTIAL`, `MISSING`, or `NEEDS_PRODUCT_DECISION`, except an explicit Product Owner decision recorded for that row. 9D0 may run as a dry rehearsal only against a proposed manifest; it cannot authorize production 9D while 9P is not PASS.

Minimum capabilities that must appear in the inventory (add rows; do not treat this list as optional):

- Guest (lesson reservation, course enrollment, payment/expiry, confirmation, linking)
- Student (cabinet current/history, booking, enrollment, cancellation)
- Instructor (schedule, history, attendance, workspace)
- Admin (planner, Booking detail, Courses, Finance, People/Instructors)
- Lesson Booking (including authenticated multi-participant after F3 and per-participant Instructor Attendance after F4; guest remains the accepted single-participant creation boundary)
- Course / CourseEnrollment
- Planner / Schedule
- Finance
- Wallet (including starter credit)
- Attendance
- Profile / People
- Participants
- Reviews / instructor rating (9B continuity must already be PASS or an explicit PO decision)
- Recommendations / Feedback
- Progress / Achievements (lesson 9B and course 9C)
- Chat
- Homework
- Notifications
- Auth / Registration / login
- Settings
- assets / images (avatars, instructor/course media, chat media)

##### Chat / Homework — mandatory 9P element (do not delete with legacy Booking)

Verified current runtime (2026-09-08), not assumed:

- Message storage is `bookings/{threadId}/messages/{messageId}` (`src/features/chat/chatService.ts`).
- Lesson threads use the lesson Booking id. Course/shared chat uses `chatId` / `courseId` / synthetic `course_*` instructor id as `threadId` (`src/domain/chat/resolveChatId.ts`).
- Course unread/history still subscribes to **shared + per-enrollment legacy** thread ids (`getCourseChatThreadIds`).
- Homework flags are message fields: `isHomework`, `homeworkForUserIds`. Clients update those fields; Rules allow that narrow update (`firestore.rules` `bookings/{bookingId}/messages`).
- Unread behavior is client subscription over those thread ids (`useBookingChatUnread`).
- Message deletes are denied by Rules (`allow delete: if false`).

Forbidden outcome:

```text
legacy Booking cleanup
  → parent/thread document removed
  → messages / homework lost
```

9P must classify every `bookings/{id}` that has a `messages` subcollection (lesson thread, course shared thread, leftover per-enrollment thread). 9D must not delete a parent until that inventory has an approved preserve-or-relocate policy. This document does **not** require a new Chat aggregate. Keeping messages under `bookings/{threadId}/messages` is allowed if 9P proves access, unread, homework targeting, and Rules still work after selective parent deletion.

Chat/Homework rows in 9P cannot be `Safe to remove legacy? = yes` while messages still physically depend on uninventoried legacy Booking documents.

#### T32.9A.9D0 — Production-like Incremental Cutover Rehearsal — PENDING

Reason: original T37 / T38 / T40 tickets and Phase 7 describe a **clean/empty database** reset then seed. That is valid only as isolated nonproduction architectural rehearsal. Current production already holds canonical Booking, Payment, Attendance, claims, enrollments, and live product data. Production strategy is **selective/incremental**.

9D0 must rehearse the **exact** planned 9D cleanup against a production-like mixed state. It is not T38.

```text
production-like snapshot/export
        ↓
isolated nonproduction environment
        ↓
representative canonical + leftover-legacy mixed state
        ↓
EXACT planned 9D cleanup (same discriminator and manifest)
        ↓
preserve/delete manifest verification
        ↓
role-based E2E
        ↓
legacy-negative verification
        ↓
recovery drill
```

Must preserve (expected-preserved set):

- canonical Booking
- Payment
- Attendance
- Resource Claims
- Participants / relations
- CourseEnrollment
- canonical audit / history
- approved reviews / chat / homework / notifications / profile / assets / other 9P-approved product data

Manifest acceptance — any difference is FAIL:

```text
expected preserved == actual preserved
expected deleted   == actual deleted

unexpected deletion = 0
unexpected mutation = 0
ambiguous records   = 0
```

9D0 PASS is required before production 9D. A successful T38 empty-database rehearsal does **not** substitute for 9D0.

#### T32.9A.9D — Selective Destructive Legacy Data Cleanup — PENDING

9D means **selective destructive leftover-legacy data cleanup**. It does **not** mean:

```text
full Firestore reset
delete bookings collection
production clean-start
empty-database seed as the production procedure
```

Dependencies:

```text
9A PASS
9B PASS
9C PASS
9P PASS
9D0 PASS
        ↓
9D
```

Critical product decision (unchanged): historical **legacy** lesson/booking records are not required to be preserved or backfilled. That permission applies only to rows classified disposable by the proven discriminator **and** listed in the 9D0-rehearsed delete set.

Production inventory already proved (Individual Booking cutover):

- legacy-only current/future = 0
- ambiguous = 0
- legacy past disposable = 11

Those 11 rows may be deleted in 9D **only if** the 9D0 manifest still classifies them disposable and they have no protected `messages` / other 9P-preserved children. Canonical transactional/runtime records must not be deleted.

9D rules:

- deletion only by proven discriminator + rehearsed preserve/delete manifest;
- never “delete bookings collection”;
- preserve canonical Booking, Payment, Attendance, Resource Claims, Participants/relations, CourseEnrollment, canonical audit/history;
- preserve 9P-approved reviews, chat/homework, notifications, profile, and assets;
- `bookings/{id}/messages` requires an approved 9P policy before the parent or subcollection is deleted;
- unexpected deletion, unexpected mutation, or leftover ambiguous records = FAIL (same equalities as 9D0);
- do not migrate old historical legacy lessons into canonical Booking as a 9D action.

If 9D is held for a production maintenance window, that window is T40 and must execute this same rehearsed manifest. Do not run two independent deletion passes.

#### T32.9A.9E — Canonical Authority / Reachability Gate — PENDING

Final integration gate before T32.9B. 9E uses 9P inventory results: every 9P `PASS` row must still be reachable after 9D. 9E is not a substitute for 9P (9P is pre-deletion); 9E is post-9D proof that authority and product journeys still hold.

##### Technical reachability

- no active legacy writer
- no active legacy callable
- no legacy scheduler
- no forbidden client direct authority
- no runtime fallback
- no dual-read/write authority
- legacy scans clean, or every retained match is classified (test fixture / historical docs / explicit allowlist)
- authorization / OCC
- production deployment consistency with the 9D0/T40 manifest

##### Product reachability

After 9D, representative journeys still work for:

- Guest
- Student
- Instructor
- Admin

Those journeys must cover the 9P rows that those roles own (lesson, course, planner, finance, wallet, attendance, profile/people, reviews, chat/homework, notifications, auth, assets) rather than a reduced “happy path only” subset. T41 later expands the production-safe checklist; 9E must not be weaker than the 9P capabilities already marked PASS.

#### T32.9B — Final Legacy Write / Runtime Cleanup — PENDING

```text
T32.9B starts only after T32.9A.9E PASS.
```

T32.9B is physical legacy-runtime cleanup after authority cutover, not authority migration itself and not a product-feature deletion phase.

Physical cleanup candidates (only after 9P/9E prove a replacement):

- dead Booking services (`bookingService` leftovers, `useBookingActions`)
- callable adapters for removed Individual Booking lifecycle
- legacy Course services and old Course callables
- availability compatibility (`availability_slots` / `availability_hour_locks` runtime)
- `guest_wallet` compatibility
- USD / `balanceUSD` compatibility
- obsolete Rules / indexes
- temporary adapters
- V1 Course read-model compatibility
- dead tests / fixtures that keep forbidden writers alive
- unreachable leftover helpers (`confirmBooking` bundle, superseded unpaid-approval UI, unused legacy Guest linking UI)

If deletion discovers a useful capability without a canonical/approved replacement:

```text
STOP
→ parity inventory incomplete
→ return the problem to canonical migration (reopen 9P / the owning slice)
→ do not continue T32.9B against that capability
```

T32.9A recovers missing historical Admin UX, preserves useful information and interactions, integrates new canonical functionality, proves feature parity, and identifies leftover implementations safe for later removal. It is not broad leftover UI cleanup.

See [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md).

## Executive conclusion

The production `/admin` runtime is not connected to canonical read models and
does not invoke canonical commands. It remains a legacy administration surface
over raw `bookings`, `users`, `instructors`, `courses`, `wallet_ledger`,
`settings`, and related collections.

The canonical backend already covers substantial parts of lesson bookings,
CourseEnrollments, finance, Participant access, Course provisioning,
CourseDays, attendance, and AdminIssues. The principal migration blockers are:

1. no administrator read-model scopes;
2. missing administrator command wiring in the frontend;
3. callable routing gaps for some existing command handlers;
4. missing canonical commands for several Course and CourseDay amendments;
5. no production handler for `complete_booking`;
6. direct client money writes and destructive reset operations;
7. broad legacy Firestore permissions required by the current UI.

The first implementation slice should be **T32.1 — Safety containment**:

- prevent deletion or replacement of strict canonical Courses through the
  legacy Admin UI;
- disable or isolate direct balance and guest-wallet mutation;
- disable or isolate finance reset and bulk booking reset operations;
- add Firestore Rules and emulator regression coverage for these boundaries.

This removes immediate corruption paths before larger read-model and workflow
migrations begin.

## Scope and constraints

This audit covers the active Admin runtime and its dependencies. It does not:

- modify application code or production data;
- deploy;
- migrate hidden legacy courses;
- start T33 history work (T33 remains bound by the [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md) UX preservation contract);
- weaken `CourseSchema.strict()`;
- remove T31B.1 contamination guards;
- restore `instructorIds` as canonical authority;
- create a commit.

The audit used the current Graphify graph, targeted source inspection,
Firestore Rules, callable registration and authorization code, and the
available test suites.

## 1. Admin runtime architecture

### 1.1 Route and shell

The active route is:

```text
/admin
  -> AdminRoute
  -> AdminRouteContainer
  -> AdminPanel
```

The route is gated in the frontend by `userProfile.role === "admin"`.
`AdminRouteContainer` assembles data and actions from the legacy stores and
passes them into `AdminPanel`.

Relevant entry points:

- `src/app/routes/AdminRouteContainer.tsx`
- `src/features/shell/RouteGate.tsx`
- `src/features/admin/components/AdminPanel.tsx`
- `src/features/admin/adminNavigation.ts`
- `src/features/admin/useAdminActions.ts`

### 1.2 Active tabs

| Tab           | Active screens                                         | Current authority                                              |
| ------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Shared header | `FinancialOverview`                                    | Legacy `bookings` and `school_global_stats`                    |
| Operations    | `ScheduleCalendar`, `BookingsLog`                      | Legacy `Booking[]` and booking callables                       |
| Finance       | `GuestWalletPanel`, `CashFlowPanel`                    | `settings/guest_wallet`, `wallet_ledger`                       |
| People        | `ClientsManager`, `CoachesManager`, `AdminRoleManager` | `users`, `instructors`                                         |
| Product       | `CoursesManager`, resort content/settings              | Legacy Course shape, `resort_data`                             |
| System        | Settings, destructive reset tools, error logs          | `settings`, `bookings`, `wallet_ledger`, `users`, `error_logs` |

### 1.3 Data-plane split

The active Admin path is:

```text
Admin UI
  -> legacy Zustand stores
  -> legacy services or legacy callable wrappers
  -> raw Firestore collections
```

The canonical path is:

```text
Feature command hook
  -> executeCanonicalCommand
  -> server-side capability resolution
  -> canonical command handler
  -> canonical aggregate/event/read-model state
```

These paths are disconnected for `/admin`.

`src/store/useDataSyncScope.ts` enables canonical lesson booking and
CourseEnrollment reads for the cabinet, not for Admin. No active Admin
component calls the canonical read-model client or
`executeCanonicalCommand`.

Canonical lesson bookings can also be invisible to Admin because the legacy
Admin mapper expects the old booking document shape.

### 1.4 Strong coupling identified by Graphify

- `AdminPanel` is the central UI hub for all Admin features.
- `AdminRouteContainer` combines broad stores and workflow handlers into one
  prop surface.
- `src/features/bookings/bookingService.ts` is a legacy service hub shared by
  Admin, cabinet, and instructor workflows.
- Course administration is split between `CoursesManager`, form hooks,
  `courseService`, the course store, and presentation-content joins.
- Finance behavior is distributed across Admin panels, wallet helpers, legacy
  booking callables, and settings documents.

Clear unused or duplicate paths found during the audit include
`adminSelectors`, `useAvailabilityMigrationSync`, the deprecated
`SystemSettings` wrapper, and an unused `ResortConfigForm` wrapper. They should
not be removed as part of the first migration slices.

## 2. Mutation inventory

Classification:

- **Canonical** — mutation passes through the canonical command runtime.
- **Legacy direct** — browser writes directly to Firestore.
- **Hybrid legacy** — UI invokes a callable, but the callable implements legacy
  Firestore business logic rather than a canonical command.
- **Read-only** — no mutation.
- **Unused/dead** — no evidence of an active runtime path.

### 2.1 Lesson booking and schedule mutations

| Capability                       | UI to writer                                                                     | Destination/effect                                         | Class                            | Risk     |
| -------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------- | -------- |
| Create lesson, break, or day-off | `ScheduleSlotActionModal` -> `useAdminActions` -> `addBooking` callable          | `bookings`, balances, availability and ledger state        | Hybrid legacy                    | HIGH     |
| Confirm pending lesson           | `BookingsLog` -> `confirmBookingService` -> `confirmBooking` callable            | Legacy booking lifecycle and availability                  | Hybrid legacy                    | HIGH     |
| Complete lesson                  | `BookingsLog`/Schedule -> `completeBookingService` -> `completeBooking` callable | Legacy bookings, activity and availability                 | Hybrid legacy                    | HIGH     |
| Cancel/refund lesson             | `BookingsLog`/Schedule -> `cancelBookingService` -> `cancelBooking` callable     | Booking state, user/guest balance, ledger and availability | Hybrid legacy                    | CRITICAL |
| Approve cancellation request     | `BookingsLog` -> `cancelBooking`                                                 | Legacy cancellation and refund logic                       | Semantic mismatch; hybrid legacy | CRITICAL |
| Reject cancellation request      | `BookingsLog` -> `confirmBooking`                                                | Restores legacy confirmed status                           | Semantic mismatch; hybrid legacy | CRITICAL |
| Reschedule lesson                | `ScheduleSlotActionModal` -> `updateBookingSchedule` callable                    | Booking schedule and availability locks                    | Hybrid legacy                    | HIGH     |
| Reassign lesson instructor       | Same schedule callable                                                           | Booking, pricing/balance and availability                  | Hybrid legacy                    | CRITICAL |
| Link guest lesson to account     | `LinkGuestBookingModal` -> `linkGuestBooking` callable                           | Rewrites booking ownership and related legacy data         | Hybrid legacy                    | HIGH     |
| Delete booking or block          | Schedule -> `deleteBooking` callable                                             | Booking, availability, course/stats side effects           | Hybrid legacy/destructive        | HIGH     |

### 2.2 Course mutations

| Capability               | UI to writer                                               | Destination/effect                                  | Class                                   | Risk     |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- | -------- |
| Create or clone course   | `CoursesManager`/`useCourseForm` -> `courseService.setDoc` | Flat legacy `/courses/{id}` document                | Legacy direct                           | HIGH     |
| Edit course              | `CoursesManager` -> `courseService.updateDoc`              | Legacy operational and presentation fields          | Legacy direct; canonical update guarded | HIGH     |
| Hide/show or reorder     | `CoursesManager` -> `courseService.updateDoc`              | Legacy course fields                                | Legacy direct; canonical update guarded | HIGH     |
| Delete course            | `CoursesManager` -> `courseService.deleteDoc`              | Deletes `/courses/{id}` without a canonical cascade | Legacy direct/destructive               | CRITICAL |
| Assign course instructor | Course form -> legacy `instructorIds` update               | Legacy course authority                             | Legacy direct                           | HIGH     |
| Change dates/schedule    | Course form -> legacy `dates` update                       | Legacy course authority                             | Legacy direct                           | HIGH     |
| Change capacity          | Course form -> `totalSeats`/`availableSeats` update        | Legacy course authority                             | Legacy direct                           | HIGH     |
| Change price             | Course form -> `priceKZT` update                           | Legacy course authority                             | Legacy direct                           | HIGH     |
| Edit presentation        | Course form -> mixed course payload                        | Presentation can target the wrong aggregate         | Legacy direct                           | MEDIUM   |

T31B.1 blocks legacy updates to provisioned canonical Courses, but creation and
deletion remain separate risk paths.

### 2.3 Participant, account, instructor, and role mutations

| Capability           | UI to writer                                        | Destination/effect                                                  | Class                      | Risk     |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | -------------------------- | -------- |
| Create client        | `ClientsManager` -> profile store/service `setDoc`  | `users/client_*` without canonical Account/Participant provisioning | Legacy direct              | HIGH     |
| Edit client profile  | `ClientsManager` -> profile service                 | `users/{id}`                                                        | Legacy direct              | HIGH     |
| Edit account balance | `ClientsManager` -> wallet transaction helper       | `users.balanceUSD` and `wallet_ledger`                              | Legacy direct money write  | CRITICAL |
| Delete client        | `ClientsManager` -> `profileService.deleteDoc`      | User deletion without Auth/Participant topology cleanup             | Legacy direct/destructive  | HIGH     |
| Promote/demote Admin | `AdminRoleManager` -> `profileService.updateDoc`    | `users/{id}.role`                                                   | Legacy direct; owner-gated | CRITICAL |
| Create instructor    | Clients/Coaches manager -> booking service `setDoc` | `instructors/{id}`                                                  | Legacy direct              | HIGH     |
| Edit instructor      | `CoachesManager` -> `setDoc` and batch propagation  | Instructor and denormalized legacy booking state                    | Legacy direct              | HIGH     |
| Delete instructor    | Clients/Coaches manager -> `deleteDoc`              | Instructor catalog deletion without canonical relationship cleanup  | Legacy direct              | HIGH     |

These paths maintain a dual authority:

- canonical `Participant`, `ParticipantManagement`, and relationships;
- legacy `users` and `instructors`.

The existing customer Participant panel uses canonical commands, but there is
no equivalent Admin Participant topology UI.

### 2.4 Finance and destructive system mutations

| Capability                                 | UI to writer                                                     | Destination/effect                                                     | Class                            | Risk     |
| ------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------- | -------- |
| Adjust guest wallet                        | `GuestWalletPanel` -> `adminService` -> guest wallet transaction | `settings/guest_wallet`, `wallet_ledger`                               | Legacy direct money write        | CRITICAL |
| Reset school finances                      | System settings -> `resetSchoolFinances`                         | Deletes ledger, resets balances, guest wallet and stats                | Legacy direct bulk destructive   | CRITICAL |
| Clear student bookings                     | System settings -> `clearStudentBookings`                        | Deletes bookings/messages/availability and rewrites course seats/stats | Legacy direct bulk destructive   | CRITICAL |
| Clear cancelled bookings                   | System settings -> clear helper                                  | Deletes bookings/messages/availability                                 | Legacy direct bulk destructive   | HIGH     |
| Edit starter credit and retention settings | Settings UI -> settings service                                  | `settings/*`                                                           | Legacy direct configuration      | MEDIUM   |
| Edit currency/USD-KZT rate                 | Financial overview/context -> merged config write                | `resort_data/config`                                                   | Presentation/config direct write | LOW      |

### 2.5 Other mutations

| Capability                   | UI to writer                                        | Destination/effect   | Class                            | Risk   |
| ---------------------------- | --------------------------------------------------- | -------------------- | -------------------------------- | ------ |
| Edit resort metadata/content | Product settings -> resort service                  | `resort_data/config` | Presentation/config direct write | LOW    |
| Delete error logs            | `ErrorLogsPanel` -> `adminService.deleteDoc`        | `error_logs/*`       | Operational cleanup              | LOW    |
| Post-action notification     | Admin actions/course service -> notification helper | `notifications/{id}` | Legacy direct side effect        | MEDIUM |

## 3. Course and CourseDay administration

### 3.1 Required topology

The migration must preserve:

```text
/courses/{courseId}
  strict canonical operational aggregate

/course_catalog_content/{courseId}
  presentation and translated content

/courses/{courseId}/days/{courseDayId}
  canonical CourseDays
```

The canonical Course document must not regain:

- `instructorIds`;
- `dates`;
- `totalSeats`;
- `availableSeats`;
- `priceKZT`;
- presentation or translation fields.

### 3.2 Existing canonical coverage

Available:

- `provision_canonical_course`;
- `apply_canonical_course_provisioning_manifest`;
- `create_course_day`;
- `reassign_course_day_instructor`;
- public/authenticated Course catalog read model;
- strict Course validation and legacy contamination guards.

The T31B pilot page exercises canonical provisioning, but it is not an active
production Admin workflow.

### 3.3 Exact gaps

Missing backend commands:

- amend canonical Course price;
- amend capacity;
- amend operational title or lifecycle metadata where required;
- hide/archive/reactivate a canonical Course;
- add instructor to `Course.instructorRosterIds`;
- remove instructor from `Course.instructorRosterIds`;
- reschedule a CourseDay;
- remove/cancel a CourseDay with resource-claim, enrollment, and attendance
  policy;
- safely delete or retire a canonical Course.

Missing read model:

- Admin Course aggregate metadata;
- catalog-content status/content;
- CourseDays;
- roster and actual instructor assignment;
- enrollment/capacity summary;
- revisions and allowed Admin actions.

The correct solution is intent-specific commands and an Admin projection, not
reintroducing a generic Course document editor.

## 4. Instructor assignment

Canonical authority is:

- `Course.instructorRosterIds` for the Course roster;
- `CourseDay.actualInstructorIds` for actual day assignment.

`instructorIds` must remain legacy-only and non-authoritative.

Coverage:

| Capability                              | Canonical status |
| --------------------------------------- | ---------------- |
| Create CourseDay with actual assignment | Exists           |
| Reassign CourseDay instructor           | Exists           |
| Add Course roster instructor            | Missing          |
| Remove Course roster instructor         | Missing          |
| Reschedule CourseDay                    | Missing          |
| Delete/cancel CourseDay                 | Missing          |
| Admin assignment read model             | Missing          |

The Admin UI still edits `instructorIds` through the legacy Course form and
uses legacy instructor documents. It has no canonical roster or CourseDay
assignment workflow.

## 5. CourseEnrollment administration

### 5.1 Current UI

There is no canonical Admin enrollment roster. `BookingsLog` displays legacy
`course_*` booking-shaped rows and applies generic booking actions to them.
Canonical `/course_enrollments` are not loaded for Admin.

### 5.2 Existing canonical commands

- `create_course_enrollments`;
- `withdraw_course_enrollment`;
- `request_course_enrollment_cancellation`;
- `resolve_course_enrollment_cancellation`;
- `transfer_course_enrollment`;
- `link_guest_course_enrollment_to_account`;
- `confirm_guest_course_enrollment` (added by T32.8C; payment-funded, not unpaid approval);
- `reconcile_course_enrollment`;
- `record_course_day_attendance`;
- `resolve_attendance_outcome`.

### 5.3 Read-model coverage

Existing scopes:

- `account_hot`;
- `account_history`;
- `instructor_roster`;
- `guest_single`.

Missing:

- school-wide Admin roster;
- enrollment detail by ID;
- guest pending-payment queue (historical audit said “guest approval queue”; that unpaid-approval reading is superseded by ADR-0007);
- Admin-authorized action flags;
- cancellation/refund/reconciliation summary;
- transfer target eligibility.

### 5.4 Exact command gaps

- `transfer_course_enrollment` has a handler whose authorization requires
  `admin_callable`, but the callable account-context allowlist does not route
  this command kind as an administrator command.
- Guest enrollment linking is account-owner self-service; no canonical
  administrator-assisted linking path exists. **Superseded after T32.8B PASS:**
  Admin-assisted `existing_managed` linking exists and is not confirmation.
- No explicit guest enrollment approval command/UI was found.
  **Superseded after T32.8C PASS:** payment-funded confirmation is the
  canonical policy, and `confirm_guest_course_enrollment` is the implemented
  lifecycle transition. Unpaid Administrator approval is not a supported
  command.
- No Admin frontend wiring exists for cancellation resolution,
  reconciliation, transfer, or financial correction.

The frontend must not recreate transfer, cancellation, refund, or eligibility
rules.

## 6. Lesson booking administration

### 6.1 Current UI

Admin uses:

- `BookingsLog` for filtering, confirmation, cancellation, completion, and
  guest linking;
- `ScheduleCalendar` and `ScheduleSlotActionModal` for creation, movement,
  instructor reassignment, cancellation, completion, and deletion.

All active mutations use legacy callables.

### 6.2 Existing canonical coverage

Canonical command kinds/handlers cover:

- confirmed booking creation;
- guest booking requests;
- guest booking confirmation (`confirm_guest_booking` requires fully funded
  Payment; it is not an unpaid Admin override — see ADR-0007);
- cancellation request and resolution;
- change-request resolution;
- rescheduling;
- instructor, duration, and party changes;
- attendance recording and resolution;
- payment start gate;
- guest self-linking.

### 6.3 Exact gaps

- No Admin lesson booking read-model scope exists.
- `complete_booking` is declared as a command kind but has no registered
  production handler.
- Admin callable routing does not assign `admin_callable` to reschedule or
  instructor-change command kinds.
- Canonical guest linking is account-owner self-service; the current Admin
  target-account linking workflow has no equivalent canonical command.
  **Superseded after T32.8B PASS:** Admin-assisted `existing_managed` linking
  exists and is not confirmation.
- Admin approval/rejection of cancellation requests invokes legacy
  cancel/confirm callables instead of `resolve_booking_cancellation`.
- Admin guest confirmation invokes legacy `confirmBooking` instead of
  `confirm_guest_booking`. **Policy superseded by ADR-0007 / T32.8C:** the
  canonical command is a payment-funded `pending → confirmed` transition, not
  unpaid Administrator approval. Removal of unreachable leftover
  `confirmBooking` wiring remains T32.9B after T32.9A proves the useful
  guest-confirmation capability is preserved on the canonical path.

## 7. Payments and Wallet

### 7.1 Current UI

Admin currently reads or mutates:

- `users.balanceUSD`;
- `settings/guest_wallet`;
- `wallet_ledger`;
- old booking payment and refund fields;
- calculated financial totals over legacy bookings.

It does not use canonical Payment, Wallet, or MonetaryEvent projections.

### 7.2 Existing canonical commands

- `record_manual_wallet_funding`;
- `record_provider_payment_event`;
- `adjust_service_price`;
- `record_financial_correction`;
- `record_audit_correction`;
- `enforce_payment_start_gate`.

### 7.3 Gaps

Missing Admin projections and UI for:

- account Wallet balance and revision;
- Payment lifecycle and provider state;
- MonetaryEvent history;
- retained and settled amounts;
- manual funding;
- refunds and corrections;
- payment reconciliation;
- links from AdminIssue to Payment, booking, enrollment, and attendance.

Direct balance editing, guest-wallet adjustment, ledger deletion, and
legacy cancellation refunds are CRITICAL until replaced.

## 8. AdminIssue and attendance

The canonical backend can create `attendance_payment_conflict`,
`payment_required_at_start`, and other policy-defined AdminIssues. It supports
attendance outcome and financial/audit correction commands.

Current Admin UI has:

- no AdminIssue inbox;
- no issue detail;
- no severity/status filtering;
- no subject deep links;
- no issue-driven authorized actions;
- no attendance correction UI;
- no payment-start issue UI.

The AdminIssue policy intentionally couples issue resolution to the domain
action that resolves the underlying problem. A generic “mark resolved” button
should not bypass those policies.

Required read model:

- open and historical issues;
- severity and lifecycle;
- subject references;
- evidence and payment/attendance summary;
- current revisions;
- blocking conditions;
- allowed coupled resolution actions.

## 9. Participant and account administration

### 9.1 Current state

`ClientsManager` directly manages `users` documents. `CoachesManager` directly
manages `instructors`. The Admin UI does not understand:

- canonical Participants;
- account ownership;
- `ParticipantManagement`;
- assignment and revocation;
- duplicate identities;
- damaged management topology;
- blocked Participants;
- instructor relationships.

### 9.2 Existing canonical coverage

Commands exist for:

- Participant creation and profile update;
- management assignment and revocation;
- instructor relationship creation and revocation;
- Participant block/unblock.

The customer cabinet already uses canonical Participant commands, but Admin
does not.

### 9.3 Gaps

- Admin account/Participant directory read model;
- account-to-Participant ownership and management topology;
- damaged/duplicate-state diagnostics;
- safe repair workflows;
- Admin UI for management assignment/revocation;
- canonical account role command;
- canonical instructor catalog CRUD separated from instructor relationships,
  Course roster, and CourseDay assignment.

## 10. Read-model audit

| Admin screen          | Current source                               | Canonical availability                   | Required extension                                                        |
| --------------------- | -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Schedule/BookingsLog  | Raw legacy bookings plus paged history       | Account/instructor/guest lesson scopes   | Admin hot/history/detail, authorized actions, payment and issue summaries |
| CoursesManager        | Client join of `courses` and catalog content | Public catalog only                      | Aggregate, content, CourseDays, roster, revisions and provisioning state  |
| Enrollment roster     | Legacy course-shaped booking rows            | Account/instructor/guest scopes          | Admin roster/detail and actions                                           |
| Finance               | Ledger, `balanceUSD`, guest-wallet settings  | No Admin finance projection              | Payment, Wallet, MonetaryEvent and reconciliation                         |
| AdminIssue            | None                                         | No Admin projection                      | Inbox, history, detail, subject links and coupled actions                 |
| People                | Raw `users` and `instructors`                | Account-scoped managed Participant reads | Admin account/Participant topology and diagnostics                        |
| Instructor assignment | Legacy `instructorIds` and raw instructors   | Instructor-scoped assignment projection  | Admin Course roster and CourseDay assignment                              |

Admin currently mixes multiple pagination models:

- client pagination over separately paged booking history;
- client pagination over a growing user collection limit;
- client pagination over a growing wallet-ledger limit.

Snapshot errors are often logged without screen-level recovery. The canonical
Admin shell should standardize:

- server cursor pagination;
- loading, empty, error, and retry states;
- revision-aware merging;
- stale-response protection;
- server-authorized action flags;
- URL-addressable list/detail state.

## 11. Security and authorization

### 11.1 Existing sound boundaries

- Canonical collections are protected by default-deny Firestore Rules.
- Canonical callables resolve authenticated account and capability server-side.
- Administrator command kinds are explicitly allowlisted.
- T31B.1 blocks legacy updates to provisioned canonical Courses.
- System-owner Rules protect Admin role changes.

### 11.2 Legacy permissions preserving current UI

The Admin UI currently works because Rules allow:

- broad updates of non-Admin `users`, including legacy balances;
- Admin create/delete access to `wallet_ledger`;
- Admin CRUD on `instructors`;
- broad Admin writes to `settings`;
- Admin Course creation and deletion;
- presentation/configuration writes to `resort_data`.

Legacy booking callables use Admin SDK and their own role checks rather than
canonical command authorization.

Rules must not be weakened. They should be tightened collection by collection
after each canonical replacement is live. Immediate containment should close
strict canonical Course deletion and destructive/money risks first.

## 12. Test inventory

| Layer           | Existing coverage                                                                                                          | High-risk gap                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unit/domain     | Strong canonical policy coverage for booking, enrollment, finance, attendance, Participants, claims, revisions, AdminIssue | Sparse Admin component behavior; several wiring tests are source-string assertions                          |
| Component       | Booking log cancellation, Course delete, non-Admin Participant panel                                                       | No meaningful Schedule, wallet, cash flow, client, coach, role, issue, or canonical Admin workflow coverage |
| Callable        | Legacy booking callables and canonical transport                                                                           | No Admin UI-to-canonical callable integration                                                               |
| Emulator        | Strong canonical finance, cancellation, CourseDay, enrollment, attendance and reconciliation suites                        | No end-to-end Admin projection and command workflow                                                         |
| Firestore Rules | Booking denial, roles, ledger, resort and Course contamination cases                                                       | Existing tests preserve Admin balance inflation and ledger deletion; no post-migration denial suite         |
| E2E             | Customer booking and canonical invariants                                                                                  | No `/admin` navigation or critical Admin workflow                                                           |

High-priority missing tests:

1. strict canonical Course cannot be deleted through the client;
2. Admin cannot directly mutate canonical or legacy monetary authority;
3. destructive reset controls cannot affect canonical production state;
4. AdminIssue inbox and coupled resolution workflow;
5. canonical lesson cancellation/refund from Admin;
6. canonical CourseEnrollment cancellation/transfer;
7. Course roster and CourseDay assignment revisions;
8. Participant management assignment/revocation and damaged state;
9. one browser E2E per critical Admin vertical slice.

## 13. Capability matrix

| Capability                                         | Current write source               | Canonical backend                                                                                           | Canonical Admin read model | Risk     | Main gap                                                                                   | Slice                   |
| -------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------- | -------- | ------------------------------------------------------------------------------------------ | ----------------------- |
| Safety/destructive controls                        | Direct writes and batches          | Partial guards only                                                                                         | No                         | CRITICAL | Canonical Course delete and direct money/reset paths                                       | T32.1                   |
| AdminIssue inbox/detail                            | None                               | Issue policy/store exists                                                                                   | No                         | HIGH     | List/detail and coupled actions                                                            | T32.2                   |
| Manual Wallet funding                              | Direct balance/guest-wallet writes | Exists                                                                                                      | No                         | CRITICAL | Wallet projection and command UI                                                           | T32.3                   |
| Refund/correction                                  | Legacy booking cancellation        | Exists                                                                                                      | No                         | CRITICAL | Payment/Wallet/MonetaryEvent detail                                                        | T32.3                   |
| Lesson Admin list/detail                           | Legacy raw bookings                | Commands mostly exist                                                                                       | No                         | HIGH     | Admin read scope                                                                           | T32.4                   |
| Admin lesson create                                | Legacy `addBooking`                | Exists with Admin context                                                                                   | No                         | HIGH     | Frontend hook and read scope                                                               | T32.4                   |
| Guest lesson pending-payment confirmation          | Legacy `confirmBooking`            | Payment-funded `confirm_guest_booking` (T32.8C PASS)                                                        | Partial                    | HIGH     | Unpaid Admin override is forbidden; leftover unreachable UI is T32.9B after T32.9A parity  | T32.4 / T32.8C          |
| Lesson cancellation                                | Legacy cancel/confirm              | Exists                                                                                                      | No                         | CRITICAL | Canonical resolve/refund UX                                                                | T32.3/T32.4             |
| Lesson reschedule/reassign                         | Legacy schedule callable           | Handlers exist                                                                                              | No                         | HIGH     | Admin callable routing                                                                     | T32.4                   |
| Lesson completion                                  | Legacy callable                    | Command kind only                                                                                           | No                         | HIGH     | Missing production handler                                                                 | T32.4                   |
| Guest lesson linking                               | Legacy Admin callable              | Admin `existing_managed` (T32.8B PASS)                                                                      | Partial                    | HIGH     | Linking is not confirmation                                                                | T32.8B                  |
| Canonical Course create                            | Direct `setDoc` legacy form        | Provisioning exists                                                                                         | No                         | HIGH     | Production Admin workflow                                                                  | T32.5                   |
| Course operational amend                           | Direct `updateDoc`                 | Missing                                                                                                     | No                         | HIGH     | Intent-specific commands                                                                   | T32.5                   |
| Catalog content edit                               | Mixed legacy Course payload        | Missing dedicated command                                                                                   | No                         | LOW      | Isolate `course_catalog_content`                                                           | T32.5                   |
| Course roster assignment                           | Legacy `instructorIds`             | Missing                                                                                                     | No                         | HIGH     | Add/remove roster commands                                                                 | T32.5                   |
| CourseDay create/reassign                          | Legacy date/instructor fields      | Exists                                                                                                      | No                         | HIGH     | UI and Admin projection                                                                    | T32.5                   |
| CourseDay reschedule/remove                        | Legacy date edits                  | Missing                                                                                                     | No                         | HIGH     | Commands and policy                                                                        | T32.5                   |
| Enrollment roster/detail                           | Legacy course-shaped bookings      | Domain exists                                                                                               | No                         | HIGH     | Admin roster scope                                                                         | T32.6                   |
| Enrollment cancellation                            | Legacy booking actions             | Exists                                                                                                      | No                         | CRITICAL | Canonical resolve/refund UX                                                                | T32.6                   |
| Enrollment transfer                                | None                               | Handler exists                                                                                              | No                         | HIGH     | Admin callable routing                                                                     | T32.6                   |
| Guest enrollment pending-payment confirmation/link | Legacy/none                        | Payment-funded `confirm_guest_course_enrollment` (T32.8C PASS); Admin `existing_managed` link (T32.8B PASS) | Partial                    | HIGH     | Unpaid Admin approval is not policy; leftover unreachable UI is T32.9B after T32.9A parity | T32.6 / T32.8B / T32.8C |
| Attendance correction                              | Instructor UI only                 | Exists                                                                                                      | No                         | HIGH     | Admin correction workflow                                                                  | T32.7                   |
| Participant/account Admin                          | Direct `users` CRUD                | Mostly exists                                                                                               | No                         | HIGH     | Admin topology/diagnostics                                                                 | T32.8                   |
| Management assignment/revoke                       | None                               | Exists                                                                                                      | No                         | HIGH     | Admin UI/read model                                                                        | T32.8                   |
| Instructor catalog CRUD                            | Direct `instructors` CRUD          | Missing                                                                                                     | No                         | HIGH     | Separate catalog commands/read model                                                       | T32.8                   |
| Resort/settings content                            | Direct configuration writes        | Not a canonical business domain                                                                             | Not required               | LOW      | Keep isolated; leftover write cleanup is T32.9B after parity                               | T32.9B                  |

## 14. Recommended implementation slices

### T32.1 — Safety containment

Scope:

- prevent legacy client deletion or replacement of strict canonical Courses;
- disable or isolate direct user balance and guest-wallet adjustment;
- disable or isolate finance reset and bulk booking reset tools;
- add Rules and emulator regression tests;
- preserve T31B.1 strict validation and contamination guards.

Reason for first position:

- the current UI can corrupt authoritative money and Course state today;
- containment does not depend on new projections;
- later work can proceed behind a safer boundary.

### T32.2 — Canonical Admin data shell and AdminIssue inbox

Scope:

- common Admin query client and authorization contract;
- cursor pagination, loading/error/retry and revision handling;
- AdminIssue list, detail, filters and deep links;
- server-provided authorized actions;
- no frontend joining of raw canonical collections.

Reason:

- creates the read/authentication spine used by every later slice;
- immediately exposes conflicts already produced by the canonical backend.

### T32.3 — Canonical Payment/Wallet vertical slice

Scope:

- Payment, Wallet, and MonetaryEvent Admin projections;
- manual wallet funding;
- canonical cancellation refunds and financial corrections;
- audit correction and reconciliation UX;
- remove direct `balanceUSD`, guest-wallet, and ledger mutations from Admin.

Reason:

- money is the highest-risk authoritative domain after containment;
- booking and enrollment Admin actions need canonical financial effects.

### T32.4 — Canonical lesson booking administration

Scope:

- Admin hot/history/detail lesson projections;
- create-on-behalf;
- guest pending-payment confirmation (not unpaid Admin approval);
- cancellation resolution;
- reschedule and instructor change;
- completion;
- guest identity linking (`existing_managed`; not confirmation);
- fix administrator callable routing;
- implement/register `complete_booking` or deliberately replace its contract.

Reason:

- removes the large legacy booking callable surface;
- depends on the read shell and finance workflows.

### T32.5 — Canonical Course and CourseDay administration

Scope:

- manifest-based Course creation;
- Admin Course aggregate/content/day projection;
- named operational amendments;
- roster add/remove commands;
- CourseDay create/reassign/reschedule/remove;
- presentation editing only in `course_catalog_content`;
- archive/retire policy instead of raw delete.

Reason:

- replaces the currently blocked legacy Course form without compromising strict
  Course topology.

### T32.6 — Canonical CourseEnrollment administration

Scope:

- Admin enrollment roster/detail;
- create-on-behalf;
- guest identity linking (`existing_managed`; not confirmation);
- payment-funded guest confirmation (`confirm_guest_course_enrollment`; does not consume another seat);
- cancellation resolution;
- transfer callable routing;
- reconciliation and related financial actions.

Reason:

- depends on canonical Course/CourseDay and finance projections.

### T32.7 — Attendance and issue resolution UX

Scope:

- Admin attendance correction;
- reason/evidence capture;
- payment-start issue handling;
- `resolve_attendance_outcome`;
- reconciliation actions driven by AdminIssue and read-model permissions.

Reason:

- depends on canonical booking/enrollment detail screens and the issue inbox.

### T32.8 — Participant, account, and instructor administration

Scope:

- canonical account/Participant topology directory;
- management assignment/revocation;
- blocked and damaged-state diagnostics;
- safe repair workflows;
- canonical account role mutation;
- instructor catalog commands separated from relationships and assignments.

Reason:

- replaces broad `users`/`instructors` permissions without conflating identity,
  management, catalog, and assignment authorities.

#### T32.8A — Canonical identity administration — PASS

Account administration, Participant administration, ParticipantManagement
topology, Account → managed Participant selection, identity/instructor
authority, and Firestore Rules containment. Guest email, phone, and display
name remain diagnostic evidence, not identity authority.

#### T32.8B — Admin-assisted guest identity linking — PASS

`existing_managed` linking for Guest Lesson Booking and Guest CourseEnrollment.
Linking is not confirmation, does not fund Payment, and does not consume or
release capacity. Unused unmanaged guest Participant cleanup is deferred.

#### T32.8C — Payment-Driven Guest Confirmation — PASS

Formerly: Deferred Guest Approval Policy Review. That name and unpaid
Administrator-approval reading are superseded.

Payment-funded confirmation for Guest Lesson Booking and Guest CourseEnrollment:
`isPaymentFullyFundedForService` in the same financial Firestore transaction,
with rare divergence recovered by AdminIssue plus the idempotent
`guestConfirmationReconciliationSweep`. `confirm_guest_booking` and
`confirm_guest_course_enrollment` reuse the lifecycle transition and cannot
confirm unpaid subjects. CourseEnrollment confirmation does not consume another
seat.

### T32.9A — Admin UX Restoration & Canonical Integration

Purpose: recover missing historical Admin UX; preserve useful information and
interactions; integrate new canonical functionality; prove feature parity;
identify legacy implementations safe for later removal; complete FINAL
CANONICAL CUTOVER under T32.9A.9 (9A–9E, including 9P and 9D0).

T32.9A is **not** broad legacy UI cleanup. Specific Admin capability inventories
belong here, not in the global [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md)
rule.

Current structure (authoritative for later status; see preamble):

- **T32.9A.8** Canonical Courses UX — PASS / CLOSED (8A/8B/8C)
- **T32.9A.9** FINAL CANONICAL CUTOVER
  - **9A** Individual Booking lifecycle cutover — NOT CLOSED (core PASS at
    authority level; F1 PASS/DEPLOYED; F2 READY_FOR_MANUAL_SMOKE; F3 PASS/CLOSED;
    F4 READY_FOR_MANUAL_SMOKE; final integration/production smoke PENDING after F4)
  - **9B** Student Booking Stats / Progress / Recommendations Cutover, including Reviews / Instructor Rating Continuity — PENDING
  - **9C** Course Progress / Achievements Cutover — PENDING
  - **9P** Global Product Parity & Legacy Dependency Gate — PENDING
  - **9D0** Production-like Incremental Cutover Rehearsal — PENDING
  - **9D** Selective Destructive Legacy Data Cleanup — PENDING (proven legacy rows only;
    never delete the bookings collection; never full Firestore reset)
  - **9E** Canonical Authority / Reachability Gate — PENDING (technical + product)

Scope:

- restore useful historical Admin screens, information density, planner,
  finance, People, monitoring, filtering, and operational workflows on
  canonical read models and commands;
- add new canonical UX where required (AdminIssue actions, Payment detail,
  Account / Participant topology; Admin guest payment capture under 9A.F1 is PASS/DEPLOYED);
- complete individual Booking, progress/recommendations, and Course progress
  authority cutovers, then 9P global parity, then 9D0 rehearsal, before selective leftover data disposal;
- prove information, action, and interaction parity before any leftover
  implementation is treated as removable;
- record the 9P UX parity inventory (`PASS` / `PARTIAL` / `MISSING` /
  `NEEDS_PRODUCT_DECISION`). 9D is forbidden on non-PASS rows without an
  explicit Product Owner decision.

Reason:

- Admin migration must preserve product capability while replacing legacy
  authority. A canonical backend without the previous useful Admin UX is not
  a finished Admin slice.

### T32.9B — Final Legacy Write / Runtime Cleanup

T32.9B starts only after **T32.9A.9E PASS**. It may remove a leftover
implementation only after its useful product capability has a canonical
replacement **and** UX parity is proven. If deletion discovers a useful
capability without a replacement: STOP, treat 9P as incomplete, and return
the problem to canonical migration. It must not become a product-feature
deletion phase. T32.9B is physical legacy-runtime cleanup after authority
cutover, not authority migration itself.

Scope:

- remove Admin dependencies on legacy booking, Course, profile, instructor, and
  wallet wrappers that T32.9A has replaced with proven-parity canonical paths;
- dead leftover Booking services, `useBookingActions`, old callable adapters,
  leftover Course services/callables, availability compatibility,
  `guest_wallet` / USD compatibility, V1 Course read-model compatibility,
  temporary adapters, obsolete Rules/indexes, and dead tests/fixtures;
- tighten Firestore Rules for each migrated collection;
- retire unreachable leftover helpers, including superseded unpaid-approval
  terminology/UI, unused legacy Guest linking UI, and old bundled
  `confirmBooking` helpers where they remain after the useful confirmation
  capability is preserved on the canonical path;
- retain only explicitly non-canonical presentation/configuration writes.

Reason:

- all replacement workflows must be live and UX-parity verified before final
  denial and removal.

## 15. Start recommendation

Start **T32.1 — Safety containment**.

The current runtime can directly change money, delete financial history,
perform bulk destructive resets, and delete a strict canonical Course despite
the T31B.1 update guard. These are higher-priority risks than missing Admin
features. T32.1 is small, independent of new read models, and provides a safe
base for T32.2 and every subsequent vertical slice.
