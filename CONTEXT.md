# Carve Academy Domain Context

Carve Academy coordinates lessons, group courses, scheduling, attendance, participant development, and simulated payments for a ski and snowboard school. This document records the approved canonical domain model and separates it from known implementation gaps; it is not application-code documentation.

## How to read this document

- **Canonical rule** — approved business behavior that future implementation must preserve.
- **Current implementation gap** — verified repository behavior or missing representation that does not yet satisfy the canonical model.
- **Open design decision** — an implementation-shaping choice that still requires an ADR; it is not permission to change the business rule.

## Language

### People, ownership, and access

**Account Owner**:
An authenticated person who manages an account, its wallet, and one or more Participant profiles. An Account Owner may also be a Participant.
_Avoid_: Student when referring to login, wallet, or management authority.

**Parent/Guardian**:
The Account Owner capability used when managing a dependent Participant. Parent permissions and parent-created blocks apply in that managed-participant relationship rather than being inferred from payment alone.

**Participant**:
The person who attends training and owns progress, skills, level, achievements, Attendance, and no-show history. A Participant may be the Account Owner or a dependent without a login.
_Avoid_: User, account, child when the rule applies to every attendee.

**Booked By**:
The account or originating actor that initiated a Booking. It is distinct from the Participant and Payer.

**Payer Account**:
The optional account whose Wallet funds a Booking or Course Enrollment. Guest or manual external payments may have no `payerAccountId`, and later account linking does not rewrite historical payment provenance.
_Avoid_: Participant; the attendee and payer may differ.

**Booking Origin**:
The immutable source of a Booking: `account`, `guest`, `instructor`, or `admin`. Linking a Booking to an account never changes its origin.

**Instructor Relationship**:
Time-limited authority for an Instructor to access a Participant, created by confirmed training, explicit administration assignment, or Parent/Guardian permission. It lasts for 12 months after the latest qualifying interaction or permission unless revoked earlier, subject to minimum booking-scoped access for existing current or future Bookings.

**Participant Block**:
An independent prohibition created either by a Parent/Guardian against an Instructor for one managed Participant or by an Instructor against a Participant. Each block retains its own actor, reason, and timestamp; only its creator may remove it.

### Training and scheduling

**Booking**:
The lifecycle record for an individual or family/group lesson. It identifies who booked, who participates, who pays, the reserved service, its price snapshot, and its current lifecycle state.
_Avoid_: Course Enrollment.

**Individual Lesson**:
A Booking for exactly one Participant.

**Family/Group Lesson**:
A Booking for multiple Participants, priced by a dedicated participant-count tariff and carrying Attendance for each Participant.

**Course**:
A group training product with explicit Course Days, price, instructors, content, capacity, and a `startAt` equal to the start of its first Course Day.

**Course Day**:
One actual dated time interval in a multi-day Course. Scheduling conflicts use these intervals rather than one continuous first-day-to-last-day range.

**Course Enrollment**:
One Participant's lifecycle and seat claim on one Course. Every Participant has a separate enrollment, even when an Account Owner enrolls several Participants atomically.
_Avoid_: Synthetic instructor booking.

**Booking Proposal**:
A non-reserving invitation from an Instructor to create a specific Participant's Booking. Acceptance revalidates all resources and payment before atomically creating a confirmed Booking.

**Booking Change Request**:
An Instructor's request for administration to resolve unavailability without letting the Instructor cancel or reschedule the Booking directly.

**Active Resource Claim**:
A `pending`, `confirmed`, or `pending_cancellation` Booking or Course Enrollment that still reserves participant time, instructor time, or pre-start course capacity.

**Attendance**:
The independent record of whether a Participant was `present` or `absent` for an individual lesson, family/group lesson, or Course Day. Attendance—not timestamps or lifecycle guesses—is the source of truth for actual participation.

**Admin Issue**:
A blocking or operational record coupled to a canonical underlying condition, such as missing Attendance, incomplete payment at service start, or a rare fully funded Payment whose guest lifecycle is not durably aligned. An unresolved outcome-blocking Admin Issue prevents automatic completion. Guest confirmation is not a generic `guest_needs_approval` issue and has no generic “mark approved” action.

### Money, history, and visibility

**Payment State**:
The financial lifecycle `unpaid`, `partially_paid`, `paid`, `refunded`, or `partially_refunded`, supported by explicit `price`, `paidAmount`, `refundedAmount`, `retainedAmount`, `settledAmount`, `writtenOffAmount`, and `outstandingAmount` values. It is independent of Booking lifecycle. `paymentStatus` alone is never sufficient evidence that a service is funded.

The Payment aggregate owns current financial state and the numeric original and current agreed service price. Booking and Course Enrollment retain lifecycle and pricing basis but are not competing numeric price authorities. Service funding is the predicate `isPaymentFullyFundedForService`.

**Guest identity**:
The unmanaged Participant and guest origin of a pending or later-linked Booking or Course Enrollment. Guest email, phone, and display name may be diagnostic evidence but are not identity authority.

**Linked identity**:
The result of replacing a guest Participant reference with an eligible Participant actively managed by a selected Account. Linking is not payment and is not confirmation.

**Payment-funded confirmation**:
The canonical guest `pending → confirmed` transition. It occurs only after the required Payment is fully funded for service. Administrator discretion, Instructor acceptance, identity linking, partial payment, and frontend state are not confirmation authority.

**Wallet**:
The Account Owner's simulated stored-value balance used for lessons and Courses. It must never become negative.

**Monetary Event**:
An immutable entry in the append-only `monetary_events` history that records canonical financial effects and provenance. Monetary Events explain Payment and Wallet projections but do not replace their current-state authority.

**Payment Provenance**:
The historical origin of money applied to a Booking or Course Enrollment. Account linking may change future refund destination but never rewrites how earlier payment was made.

**Activity Log**:
An immutable audit record of an actor and an authoritative command or domain-significant action. It is written synchronously and atomically with the authoritative domain transaction, explains history, and is never the source of current lifecycle, financial, Attendance, or access state.

**Domain Outbox**:
A durable obligation for asynchronous external delivery. It may be pending, retried, delivered, or dead-lettered independently after commit and is neither Activity Log history nor current domain authority.

**Archived Booking**:
A terminal Booking hidden through `isDeleted` without changing lifecycle, money, capacity, or resource claims. Archival is not a lifecycle transition.

## Canonical relationships

- One Account Owner manages one or more Participant profiles and one Wallet.
- A Participant may exist without authentication and owns all learning and Attendance history.
- A Booking has one `bookedBy`, one optional `payerAccountId`, one immutable `bookingOrigin`, and either one Participant or a family/group participant composition.
- A Course Enrollment belongs to exactly one Participant and one Course and occupies at most one seat.
- A Booking Proposal targets exactly one Participant and can create exactly one Booking.
- Booking lifecycle, Payment State, Attendance, access relationships, and audit history are independent representations.

Minimum dependent Participant data is name, birth date or age, skill level, ski/snowboard discipline, and an optional Instructor comment. Phone and email are not required.

## Sources of truth

| Concern                                | Canonical source                                                             | Derived or enforcement representations                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Booking lifecycle                      | `Booking.status`                                                             | UI labels, timestamps, notifications, Activity Logs                                             |
| Course Enrollment lifecycle            | `CourseEnrollment.status`                                                    | UI labels, timestamps, notifications, Activity Logs                                             |
| Booking origin                         | Immutable `bookingOrigin`                                                    | Guest identifiers and linking state must not be used to infer it                                |
| Ownership and participation            | `bookedBy`, Participant references, optional `payerAccountId`                | Display names and contact snapshots                                                             |
| Course participation                   | Explicit Course Enrollment with `courseId` and `participantId`               | Synthetic `instructorId: course_{courseId}` is legacy technical debt                            |
| Current financial state and price      | Payment State and Payment numeric fields                                     | Booking/Enrollment pricing basis and read models do not replace Payment authority               |
| Canonical financial history            | Append-only `monetary_events`                                                | Activity Logs may reference events but are not a financial ledger                               |
| Current spendable Account balance      | Wallet                                                                       | Payment obligations and Monetary Event queries do not replace current Wallet state              |
| Actual participation evidence          | Attendance records                                                           | `completed` and `no_show` are lifecycle outcomes derived through authorized transitions         |
| Current operational inconsistencies    | Unresolved Admin Issues                                                      | Activity Logs explain issue actions but do not replace current issue state                      |
| Participant progress                   | Participant profile                                                          | Account Owner profile is not the Participant's progress record unless they are the same person  |
| Instructor schedule                    | Active Booking and Course Day scheduling intent plus administrative blocks   | Server-owned resource claims and guards enforce conflicts; sanitized read models may be derived |
| Participant schedule                   | Active lesson intervals and actual Course Day intervals for that Participant | Account Owner schedule is not a substitute                                                      |
| Scheduling enforcement                 | Server-owned resource claims and guards                                      | Owners retain lifecycle and schedule intent; sanitized availability is a read model             |
| Course admission capacity              | Pre-start active seat occupancy and `totalSeats`                             | `availableSeats` is the transactional admission counter and freezes at `course.startAt`         |
| Instructor access                      | Active Instructor Relationships and booking-scoped minimum access            | Booking history may establish or extend a relationship but is not itself an access grant query  |
| Mutual blocking                        | Independent active Participant Block records                                 | UI suppression is not enforcement                                                               |
| Immutable command/action audit history | Activity Logs                                                                | Written in the authoritative transaction; never determine current business state                |
| Asynchronous delivery obligations      | Domain Outbox                                                                | Delivery may lag or retry independently; outbox state is not audit or domain state              |

The UI must not infer canonical state from indirect signals. In particular, `endsAt < now` does not mean a Booking is completed; an authorized server transition must update lifecycle state.

Canonical scheduling enforcement uses the server-owned resource claims and guards defined by ADR-0001. The existing `/availability_slots` and `/availability_hour_locks` collections are legacy implementation details scheduled for removal; neither is canonical, a required future projection, nor a source of truth. Future derived scheduling read models may exist under a distinct canonical contract, but they must not be confused with those retired collections or used as enforcement authority.

## Booking origins and creation

### Account self-service

An Account Owner may create a confirmed Booking or Course Enrollment with `bookingOrigin = account` only when the selected resources are available, every Participant is conflict-free and unblocked, and the Wallet can atomically pay the full price. Self-service creation has no partial-payment path.

### Guest reservation

A guest request with `bookingOrigin = guest` is the only normal source of `pending`. It may be created up to `startAt` and temporarily reserves the resource until `min(createdAt + TTL, startAt)`: at most one hour for a lesson and 24 hours for a Course Enrollment.

The authoritative guest invariant, detailed in [ADR-0007](docs/adr/0007-guest-identity-payment-and-confirmation.md), is:

```text
guest application → pending → required canonical Payment fully funded for service → confirmed
```

Guest creation reserves instructor, time, and participant claims, fixes price, and creates an unpaid Payment. A Course Enrollment also consumes one seat and creates seat, day, and uniqueness guards at creation. Confirmation does not charge again, create another Payment, reacquire claims, change price, schedule, or instructor, or modify Attendance. CourseEnrollment confirmation does not consume another seat.

Confirmation is payment-driven. Identity linking, Administrator discretion, Instructor acceptance, partial payment, and frontend state are not confirmation authority. Unpaid Admin override, pay-on-site, cash-at-start, and deferred payment are out of scope.

The intended current guest flow is unpaid → pending, then fully funded → confirmed. Existing `payment_required_at_start` mechanisms remain defensive protection for legacy, inconsistent, or exceptional states, including Administrator-created confirmed underpayment. They are not the normal way to approve an unpaid guest request.

Unconfirmed expiration of a still-unpaid pending reservation produces `cancelled` with `reservation_expired`. Payment settlement versus expiry or cancellation is serialized by canonical transaction and revision semantics. A terminal cancelled or expired subject must never be resurrected to `confirmed` by delayed settlement or reconciliation.

A guest may cancel only through a signed, booking-scoped, action-limited token that does not rely on Booking ID alone and becomes invalid after expiration, use, or status change. Guest cancellation produces `cancelled` with `guest_cancelled`. Fully unpaid pending cancellation refunds nothing because nothing was paid and releases the applicable reservation, claims, and, for Course Enrollment, the seat exactly once.

Admin-assisted identity linking uses `existing_managed` semantics: an Administrator selects a canonical Account and an eligible Participant actively managed by that Account, then replaces the guest Participant reference. Linking preserves `bookingOrigin = guest`, does not rewrite payment provenance or Payment amounts, and does not confirm. Already-linked records cannot be silently relinked. The original unmanaged guest Participant may become unreferenced and is not automatically cleaned up.

### Administrator creation

An Administrator may create a confirmed Booking or Course Enrollment with `bookingOrigin = admin` for an authenticated or unauthenticated person despite insufficient Wallet funds. The Wallet remains non-negative; underpayment is represented in Payment State, requires a reason, and is audited. Financial override never bypasses instructor or Participant conflicts, blocks, or full payment by service start.

### Instructor proposal acceptance

An Instructor never charges a Wallet or directly creates a confirmed client Booking. Acceptance of an open Booking Proposal rechecks availability, Participant conflicts, blocks, and full Wallet funding, then atomically charges and creates a confirmed Booking with `bookingOrigin = instructor`.

## Scheduling and resource invariants

- Conflicts are checked per Participant, not per Account Owner.
- A Participant cannot overlap active individual lessons, family/group lessons, or actual Course Day intervals.
- Every Participant in a family/group Booking must be conflict-free.
- Instructor conflicts and either party's active block can never be overridden, including by an Administrator.
- Active resource statuses are `pending`, `confirmed`, and `pending_cancellation`.
- Inactive or terminal statuses are `cancelled`, `completed`, `no_show`, and, for Courses, `withdrawn`.
- Booking mutation, old-resource release, new-resource acquisition, Participant checks, and price/payment changes belonging to one operation are atomic. The operation is also audited.

## Individual Booking lifecycle

### State-transition matrix

| From                   | To                       | Actor                              | Required conditions and effects                                                                                                   |
| ---------------------- | ------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| —                      | `pending`                | Guest                              | Secure guest request; reserve resource until lesson TTL or `startAt`                                                              |
| —                      | `confirmed`              | Account Owner                      | Full payment, all Participant and instructor checks pass                                                                          |
| —                      | `confirmed`              | Administrator                      | Checks pass; underpayment allowed separately with reason and audit                                                                |
| —                      | `confirmed`              | Account Owner accepting a proposal | Proposal checks and full charge succeed; origin remains `instructor`                                                              |
| `pending`              | `confirmed`              | System or lifecycle command        | Payment-funded guest confirmation: pending + `isPaymentFullyFundedForService` + time/lifecycle guards; unpaid Admin override is forbidden |
| `pending`              | `cancelled`              | Guest, Administrator, System       | Token cancellation, admin decision, or TTL/start expiration with explicit reason                                                  |
| `confirmed`            | `cancelled`              | Account Owner                      | At least 24 hours before `startAt`; refund 100% of actually paid amount                                                           |
| `confirmed`            | `cancelled`              | Administrator                      | Approved Booking Change Request or incomplete-payment resolution; required reason, audit, and refund no greater than `paidAmount` |
| `confirmed`            | `pending_cancellation`   | Account Owner                      | Less than 24 hours but before `startAt`; never allowed after `startAt`                                                            |
| `pending_cancellation` | `confirmed`              | Account Owner                      | Withdraw unprocessed request                                                                                                      |
| `pending_cancellation` | `confirmed`              | Administrator                      | Reject request before `endsAt`                                                                                                    |
| `pending_cancellation` | `cancelled`              | Administrator                      | Approve after choosing a 0–100% refund of actually paid amount                                                                    |
| `confirmed`            | `completed`              | Instructor                         | After `endsAt` and within 24 hours; sufficient Attendance proves presence                                                         |
| `confirmed`            | `no_show`                | Instructor                         | After `endsAt` and within 24 hours; sufficient Attendance proves absence                                                          |
| `confirmed`            | `completed` or `no_show` | Administrator                      | After `endsAt`; sufficient Attendance and an audited resolution, override, or correction                                          |
| `confirmed`            | `completed` or `no_show` | System                             | At least 24 hours after `endsAt`, no payment issue, and sufficient Attendance determines the outcome                              |
| `pending_cancellation` | `completed` or `no_show` | Administrator                      | After `endsAt`, cancellation rejected, and sufficient Attendance determines the outcome                                           |
| `completed`            | `no_show`                | Administrator                      | Audited error correction only                                                                                                     |
| `no_show`              | `completed`              | Administrator                      | Audited error correction only                                                                                                     |

`pending_cancellation` never auto-completes and remains unresolved until administration acts. Missing Attendance leaves `confirmed` and creates an Admin Issue; automation never guesses.

### Rescheduling

An Account Owner has exactly one lifetime self-service reschedule for a confirmed individual lesson, available at least 24 hours before `startAt`. Only date/time may change; instructor, duration, and price remain fixed, and the new slot must pass every conflict and block check. Administrator reschedules neither consume nor restore this allowance.

Inside 24 hours, administration decides whether to reschedule without financial change or apply late-cancellation rules. Every reschedule atomically releases old locks, acquires new locks, updates the Booking, and writes audit history.

When only date/time changes, the existing price and payment remain unchanged: the workflow neither refunds nor charges the Booking again.

An Instructor uses a Booking Change Request rather than cancelling or rescheduling. Administration obtains client agreement before an instructor-initiated reschedule.

### Administrator modifications

Only administration may change instructor, duration, or manually override price. Changing instructor rechecks availability and blocks, charges a positive price difference or returns a negative difference to the Wallet, and may represent insufficient funds only as temporary underpayment. Changing duration rechecks adjacent availability and recalculates price. Every manual price change requires a reason and audit entry.

Existing price is a snapshot and does not follow later global tariff changes. Only an explicit Booking modification may recalculate it.

## Family/group lessons

Attendance is recorded per Participant. At least one present Participant produces `completed`; all absent produces `no_show`. The approved rules do not introduce a separate family/group automation schedule.

Entire Booking cancellation follows the Individual Booking policy: at least 24 hours before `startAt` it becomes `cancelled` with a 100% refund of actually paid money; inside 24 hours it becomes `pending_cancellation`.

### Composition changes

Adding a second Participant converts an Individual Lesson to a Family/Group Lesson; returning to one Participant converts it back. The dedicated tariff is recalculated for every composition change, while instructor and time remain unchanged unless separately modified through an authorized workflow.

At least 24 hours before `startAt`, the Account Owner may add a conflict-free Participant with full incremental payment or remove one with a full Wallet refund of the calculated difference. Inside 24 hours only administration may change composition; removal permits a reasoned 0–100% refund, and addition may create temporary underpayment.

Each addition has its own payment obligation. An unpaid addition at `startAt` is rolled back without blocking fully paid Participants, after which type and tariff are recalculated.

## Course Enrollment lifecycle

Each Participant has a separate Course Enrollment. Enrolling several Participants in one operation is atomic: all seats, schedules, blocks, and funds pass or no enrollment is created. A `participantId + courseId` pair has at most one active enrollment; re-enrollment after `cancelled` or `withdrawn` creates a new record at current price before Course start.

### State-transition matrix

| From                   | To                       | Actor                        | Required conditions and effects                                                                        |
| ---------------------- | ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| —                      | `pending`                | Guest                        | Reserve one seat until course TTL or first `startAt`                                                   |
| —                      | `confirmed`              | Account Owner                | Seats, Course Day conflicts, blocks, and full payment pass                                             |
| —                      | `confirmed`              | Administrator                | Same nonfinancial checks; temporary underpayment allowed with reason and audit                         |
| `pending`              | `confirmed`              | System or lifecycle command  | Payment-funded guest confirmation; seat already reserved at creation; unpaid Admin override is forbidden |
| `pending`              | `cancelled`              | Guest, Administrator, System | Token cancellation, admin decision, or TTL/start expiration                                            |
| `confirmed`            | `cancelled`              | Account Owner                | At least 7 days before `startAt`; refund 100% of actually paid amount                                  |
| `confirmed`            | `cancelled`              | Account Owner                | From exactly 2 days to less than 7 days before `startAt`; refund 50% of actually paid amount           |
| `confirmed`            | `cancelled`              | Administrator                | Incomplete-payment resolution with required reason/refund decision; post-start capacity remains frozen |
| `confirmed`            | `pending_cancellation`   | Account Owner                | Less than 2 days before or any time after `startAt`                                                    |
| `pending_cancellation` | `confirmed`              | Account Owner                | Withdraw unprocessed request                                                                           |
| `pending_cancellation` | `confirmed`              | Administrator                | Reject before Course completion                                                                        |
| `pending_cancellation` | `cancelled`              | Administrator                | Approve with any refund greater than zero                                                              |
| `pending_cancellation` | `withdrawn`              | Administrator                | Approve with zero refund                                                                               |
| `confirmed`            | `withdrawn`              | Administrator                | Participation ends with zero refund                                                                    |
| `confirmed`            | `completed`              | Instructor                   | After final Course Day and within 24 hours; at least one explicit `present`                            |
| `confirmed`            | `no_show`                | Instructor                   | After final Course Day and within 24 hours; every Course Day explicitly `absent`                       |
| `confirmed`            | `completed` or `no_show` | Administrator                | During the 24-hour window or later Admin Issue/correction; sufficient Attendance decides               |
| `confirmed`            | `completed` or `no_show` | System                       | After 24 hours, no payment issue, and sufficient Attendance determines the outcome                     |
| `pending_cancellation` | `completed`              | Administrator                | Request rejected after Course end and at least one explicit `present`                                  |
| `pending_cancellation` | `no_show`                | Administrator                | Request rejected after Course end and all days explicitly `absent`                                     |
| `withdrawn`            | `cancelled`              | Administrator                | Audited terminal correction when a later refund greater than zero is issued                            |
| `completed`            | `no_show`                | Administrator                | Audited Attendance/error correction only                                                               |
| `no_show`              | `completed`              | Administrator                | Audited Attendance/error correction only                                                               |

`withdrawn` exists only for Courses, always means zero refund, and never returns to `confirmed`. `pending_cancellation` never auto-resolves. If there is no explicit `present` and any Course Day lacks Attendance, the enrollment remains `confirmed` with an Admin Issue; one explicit `present` is sufficient for `completed` even if other day records are missing.

### Capacity

Before `course.startAt`, `pending`, `confirmed`, and `pending_cancellation` occupy one seat; `cancelled` and `withdrawn` release one seat exactly once. `completed` and `no_show` are not valid pre-start capacity-release mechanisms.

Admission capacity freezes at `course.startAt`. After that instant, `cancelled`, `withdrawn`, `completed`, `no_show`, and `isDeleted` never increase `availableSeats`. No normal joining of an already-started Course is allowed.

Capacity updates are transactional and keep `availableSeats` within `0..totalSeats` before start. The counter represents pre-start admission availability, not historical or post-start participant count.

### Course transfer

Only administration may transfer an enrollment from Course A to Course B, and only before Course A and Course B have started. Course B must have capacity and the Participant must be conflict-free and unblocked. One atomic operation releases A's seat, occupies B's seat, charges the difference when B is more expensive or refunds the difference to the Wallet when B is cheaper, updates the enrollment, and audits the transfer. Insufficient funds may create temporary underpayment but it must be cleared by B's `startAt`.

After Course A starts, direct transfer is forbidden; the old enrollment is closed under its lifecycle and any new enrollment is a separate operation subject to the no-late-join rule.

## Booking Proposal matrix

| From   | To            | Actor                    | Required conditions and effects                                                                                                  |
| ------ | ------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| —      | `open`        | Instructor               | Instructor proposes only their own service to one authorized Participant; no resource reservation                                |
| `open` | `accepted`    | Account Owner            | Participant cannot change; recheck availability, conflicts, blocks, and full Wallet funding; atomically create confirmed Booking |
| `open` | `declined`    | Account Owner            | No Booking or financial effect                                                                                                   |
| `open` | `expired`     | System                   | At `min(createdAt + 24h, proposed startAt)`                                                                                      |
| `open` | `unavailable` | System during acceptance | Proposed instructor slot became unavailable                                                                                      |
| `open` | `cancelled`   | Instructor               | Instructor withdraws proposal                                                                                                    |
| `open` | `cancelled`   | System                   | New Parent/Guardian block invalidates proposal with `instructor_blocked_by_owner`                                                |

Insufficient funds leave the proposal `open` until expiry so the Account Owner can top up and retry. Proposals may overlap and never reserve time. A failed Participant-conflict or block recheck cannot create a Booking; the approved rules do not assign an additional Proposal status beyond the explicit Parent/Guardian-block cancellation rule.

## Booking Change Request matrix

| From   | To          | Actor               | Required conditions and effects                                                                        |
| ------ | ----------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| —      | `open`      | Assigned Instructor | Type `instructor_unavailable`, Booking remains confirmed, reason required                              |
| `open` | `resolved`  | Administrator       | Resolution is `rescheduled`, `booking_cancelled`, or `no_change`; reschedule requires client agreement |
| `open` | `cancelled` | Instructor          | Instructor withdraws the request; Booking remains unchanged                                            |

School/instructor rescheduling never consumes the Account Owner's self-service reschedule allowance.

## Payment model and service-start gate

- Payment State and Booking lifecycle change independently but atomically when one business event affects both.
- For guest origin, confirmation is payment-driven: a pending guest subject becomes confirmed only when `isPaymentFullyFundedForService` is true. Primary confirmation occurs in the same financial Firestore transaction. A rare funding/lifecycle divergence produces a coupled AdminIssue and an idempotent reconciliation sweep; the sweep is recovery, not the primary confirmation mechanism.
- `paymentStatus` alone never authorizes service or guest confirmation. Whole-KZT accounting fields are authoritative.
- Refund percentages apply to `paidAmount`, never to nominal price, and total refunds never exceed money actually paid.
- Refunds go to the Account Wallet. An unlinked guest refund is handled manually outside the system and recorded; after linking, the account may receive future Wallet refunds without changing historical payer provenance.
- `cancelled` writes off unpaid remainder after the selected refund. `withdrawn` and `no_show` retain paid money, refund zero, and write off unpaid remainder.
- Financial history preserves original/current price, paid, refunded, retained, and written-off amounts.
- Global tariff changes never alter an existing price snapshot; only an explicit audited modification recalculates it.
- An Administrator may create temporary underpayment but never a negative Wallet.

A Participant cannot attend unless the Booking or Course Enrollment is fully paid by its applicable `startAt`. Underpayment at that instant creates an Admin Issue, blocks service and automation, and exposes only a “Payment required—do not start” message to the Instructor. This payment-start gate is defensive protection for confirmed or otherwise start-eligible underfunded states. It is not the normal mechanism used to approve unpaid guest requests; those remain `pending` until `isPaymentFullyFundedForService`.

Full payment received before `startAt` clears the payment restriction automatically.

There is no grace period. Late payment does not make the missed occurrence deliverable. For an individual lesson, administration may cancel or, with client agreement, reschedule the same Booking to a future fully paid slot. For a Course, late payment never reactivates admission; administration resolves it under incomplete-payment cancellation rules.

When administration cancels for incomplete payment at `startAt`, it selects a refund from zero through `paidAmount`, writes off the unpaid remainder, records a mandatory reason, and audits the decision.

## Instructor relationships, privacy, and blocking

- An Instructor sees only Participants covered by an active Instructor Relationship or minimum booking-scoped access.
- Confirmed individual training, confirmed Course Enrollment, explicit admin assignment, and explicit Parent/Guardian permission create qualifying access.
- General access and Parent/Guardian permission expire 12 months after the latest qualifying interaction or permission.
- Parent/Guardian revocation stops new access and proposals immediately but preserves minimum data required to deliver existing current or future confirmed Bookings until completion.
- Parent/Guardian-to-Instructor and Instructor-to-Participant blocks are independent; removing one never removes the other.
- Neither administration nor financial override bypasses a block.
- Existing confirmed Bookings survive a new block, but no new Booking is created while either applicable block is active.
- A new Parent/Guardian block cancels affected open proposals with an explicit reason.

## Roles and permissions matrix

| Capability                       | Account Owner                                | Guest                  | Instructor                               | Administrator                   | System                                                    |
| -------------------------------- | -------------------------------------------- | ---------------------- | ---------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| Manage Participant profiles      | Own account                                  | No                     | Authorized learning fields only          | Operational administration      | No                                                        |
| Create lesson                    | Confirmed, fully paid                        | Pending request        | Proposal only                            | Confirmed; underpayment allowed | No independent authority                                  |
| Create Course Enrollment         | Confirmed, fully paid                        | Pending request        | No                                       | Confirmed; underpayment allowed | No                                                        |
| Confirm guest request            | No                                           | No                     | No                                       | Lifecycle command only after Payment is fully funded; unpaid override forbidden | Same-transaction payment confirmation; rare reconciliation |
| Link guest identity              | Self-service where already authorized        | No                     | No                                       | `existing_managed` to an eligible managed Participant; does not confirm | No                                                        |
| Cancel guest pending             | No                                           | Through secure token   | No                                       | Yes                             | On expiry                                                 |
| Cancel/request cancellation      | Policy-bound owned records                   | Pending token only     | No                                       | Decide/correct with audit       | Expiry only                                               |
| Record Attendance                | No                                           | No                     | Assigned/authorized training             | Yes/correct                     | No guessing                                               |
| Set `completed`/`no_show`        | No                                           | No                     | After service with sufficient Attendance | Yes with audit                  | After 24h with sufficient Attendance and no payment issue |
| Set Course `withdrawn`           | No                                           | No                     | No                                       | Yes, zero refund only           | No                                                        |
| Reschedule                       | One eligible self-service lesson change      | No                     | Change Request only                      | Yes with checks/audit           | No                                                        |
| Change instructor/duration/price | No                                           | No                     | No                                       | Yes with reason/checks/audit    | No                                                        |
| Change participant composition   | Policy-bound add/remove                      | No                     | No                                       | Yes with reason/checks/audit    | Roll back an unpaid addition at `startAt`                 |
| Transfer Course Enrollment       | No                                           | No                     | No                                       | Before both Courses start       | No                                                        |
| Create proposal                  | No                                           | No                     | For self and authorized Participant      | No                              | No                                                        |
| Manage own block/permission      | As Parent/Guardian for a managed Participant | No                     | Instructor block                         | Cannot override                 | Expiry enforcement                                        |
| View financial detail            | Own account                                  | Booking-scoped summary | Payment-required operational flag only   | Yes                             | Automation only                                           |
| Archive terminal record          | No                                           | No                     | No                                       | Yes                             | No                                                        |

Instructor capability and administrative role are independent dimensions and may coexist. When one person has both, each action is still authorized and audited under the capability used.

Administrator-created confirmed underpayment applies only to `bookingOrigin = admin` creation. It is not unpaid guest confirmation. Guest confirmation remains payment-funded as defined in ADR-0007.

## Archival, terminal states, and audit

`cancelled` is irreversible; an erroneous cancellation requires a new Booking. `completed` and `no_show` may be corrected into each other only by audited administration. Course `withdrawn` may become `cancelled` only when a later refund greater than zero is issued. No terminal state returns to `confirmed`.

Only administration may set `isDeleted`, and only on `cancelled`, `completed`, `no_show`, or `withdrawn`. Archival never changes status, money, capacity, or resources and never repeats release/refund effects.

Every action affecting money, lifecycle, schedule, participant composition, access, blocks, or corrections writes an Activity Log synchronously and atomically in the authoritative domain transaction. This includes creation, confirmation, cancellation decisions, completion/no-show/withdrawal and corrections, rescheduling, instructor/duration/price/participant changes, overrides, refunds, blocks, proposals, change requests, and account linking. Automatic actions use `actor = system`; a successful action must not commit when its required log cannot be written. Any required outbox obligations are distinct records that commit in the same transaction alongside that log, then are delivered asynchronously and may lag or retry without creating Activity Log materialization lag.

## Critical invariants

Future `$implement` and `$code-review` work must verify:

- `bookingOrigin` is explicit, immutable, and never inferred from identifiers or linking state.
- `bookedBy`, Participant, and optional `payerAccountId` remain separate.
- Participant-owned progress and Attendance never attach to the Account Owner merely because the owner paid.
- The server owns every lifecycle transition; unprivileged clients submit intent, not target status.
- Active Participant, instructor, Course Day, and block conflicts are checked atomically and cannot be overridden.
- Account self-service creation is confirmed and fully paid; normal pending is guest-only, expires safely while unpaid, and becomes confirmed only when the required Payment is fully funded.
- Identity linking, Payment, and confirmation remain distinct. Linking a guest record does not confirm it or fund it.
- Wallet balance never becomes negative; underpayment is explicit and blocks service at `startAt`. Administrator-created confirmed underpayment is not an unpaid guest-approval path.
- A terminal cancelled or expired guest subject is never resurrected to confirmed by delayed settlement or reconciliation.
- An unresolved Attendance or payment Admin Issue blocks automatic completion.
- Automation waits 24 hours, never guesses Attendance, and never auto-completes `pending_cancellation`.
- Attendance sufficient for the service determines `completed` versus `no_show`.
- Refunds never exceed `paidAmount`; seat/resource release and refund amount are independent decisions.
- One Course Enrollment represents one Participant and one seat; multi-Participant enrollment creation is all-or-nothing.
- Before Course start, capacity mutations are transactional and idempotent; at `startAt`, admission capacity freezes.
- Course Enrollment uses explicit `courseId`; synthetic instructor identifiers are legacy implementation details scheduled for removal and are rejected after canonical cutover.
- Rescheduling releases old resources and acquires new resources atomically.
- Existing price is a snapshot; only an explicit audited modification changes it.
- Terminal transitions never reactivate a record except the explicitly allowed terminal corrections.
- `isDeleted` is visibility-only and never repeats lifecycle, money, or capacity effects.
- Instructor access is relationship-scoped, time-bounded, revocable, and reduced to minimum booking access when needed.
- Independent blocks remain non-overridable and removable only by their creator.
- Activity Logs are synchronous, atomic, complete audit history but never current-state authority; outbox delivery is asynchronous and independently retryable.

## Current implementation gaps

The following gaps were verified against the pre-canonical repository and must not be mistaken for canonical behavior. They are not current guest-confirmation, identity-linking, or Payment-authority policy; see ADR-0007 and the accepted ADRs above.

- Booking supports only `pending`, `confirmed`, `pending_cancellation`, `cancelled`, and `completed`; `no_show`, `withdrawn`, Attendance, Admin Issues, and terminal correction rules are absent.
- `Booking.userId` conflates owner, Participant, and payer. `bookingOrigin`, `bookedBy`, Participant references, and `payerAccountId` are absent; guest linking overwrites identity markers and loses origin.
- Authenticated creation accepts client-selected lifecycle status. Administrator creation requires full Wallet funds, while some rescheduling paths can write a negative balance.
- Participant profiles without login, family/group composition, per-Participant progress/Attendance, participant tariffs, and participant conflict checks do not exist.
- Server scheduling protects individual instructor slots but does not enforce Participant conflicts or Course Day conflicts. Course dates are free-form strings rather than explicit intervals.
- Guest pending reservations have no TTL expiration workflow, signed action token, guest self-cancellation, or explicit expiration/cancellation reason and may hold resources indefinitely.
- Current cancellation callables do not enforce the 24-hour lesson policy or 7-day/2-day Course policy and calculate refunds from price rather than actual paid amount.
- Assigned Instructors can confirm states that canonically require administration. Manual completion lacks sufficient source-status, time, Attendance, and outcome checks; assigned Course Instructors cannot complete enrollments because authorization compares their profile ID with a synthetic course identifier.
- Scheduled completion runs at `endsAt`, includes `pending_cancellation`, and does not consult Attendance or payment issues. Normal Course Enrollment creation omits `endsAt`, so those enrollments usually do not enter automatic completion at all.
- Booking Proposal, Booking Change Request, Instructor Relationship, Parent/Guardian permission, and mutual block records/workflows are absent.
- Client self-rescheduling is absent. Administrator rescheduling is not comprehensively audited and does not enforce Participant rules.
- Course Enrollment remains booking-shaped, often identified through `instructorId = course_{courseId}`. Authenticated re-enrollment reuses a deterministic ID and can overwrite cancelled history.
- Current Course completion/cancellation can increase `availableSeats` after Course start. The cancellation callable also permits `completed → cancelled`, risking a second capacity release; Course transfer and atomic multi-Participant enrollment do not exist.
- Payment State and explicit paid/refunded/outstanding/retained/written-off amounts are absent; balances, ledgers, guest settlement, and synthesized history overlap.
- `isDeleted` currently mixes soft deletion and hard deletion and may release resources or alter statistics instead of acting only as archival visibility.
- Activity Logs cover only a subset of required events, may be written outside the domain transaction, and current rules permit overly broad client/instructor audit writes. Separate Participant-profile and Booking read permissions are broader than canonical Instructor Relationships.

## Architecture decision status

The canonical rewrite's architecture ADRs are accepted:

1. [ADR-0001: Canonical Aggregate Topology](docs/adr/0001-canonical-aggregate-topology.md)
2. [ADR-0002: Server Command, Transaction and Resource Model](docs/adr/0002-server-command-transaction-and-resource-model.md)
3. [ADR-0003: Payment Accounting Source](docs/adr/0003-payment-accounting-source.md)
4. [ADR-0004: Attendance, Outcome and Admin Issue Model](docs/adr/0004-attendance-outcome-and-admin-issue-model.md)
5. [ADR-0005: Audit Durability and Transaction Policy](docs/adr/0005-audit-durability-and-transaction-policy.md)
6. [ADR-0006: Lazy Canonical Self-Participant Provisioning](docs/adr/0006-lazy-canonical-self-participant-provisioning.md)
7. [ADR-0007: Guest Identity, Payment, and Confirmation Architecture](docs/adr/0007-guest-identity-payment-and-confirmation.md)
8. [ADR-0008: UX Preservation During Canonical Migration](docs/adr/0008-ux-preservation-during-canonical-migration.md)

ADR-0007 supersedes the earlier guest rule that an Administrator confirms pending guest requests independently of payment. Compatibility/Cutover and legacy Participant migration are not separate ADRs under the clean canonical rewrite strategy.

Explicitly deferred by ADR-0007 and not current supported policy:

- `pay_on_site`, cash-at-start, deferred payment, and unpaid Admin override of a guest application;
- partially-paid pending guest rejection or refund policy;
- automatic cleanup of unused unmanaged guest Participants.

## UX preservation during migration

Canonical migration changes implementation and authority, not product capability by default.

Legacy implementation is not a legacy feature.

Existing useful screens, information, filters, interactions, and workflows must be preserved or restored unless explicitly superseded by a product decision. New canonical UX is additive where necessary.

Before removing a legacy frontend or runtime implementation, canonical replacement and UX feature parity must be proven.

Details, the parity inventory, role coverage, and the T32.9A / T32.9B boundary are in [ADR-0008](docs/adr/0008-ux-preservation-during-canonical-migration.md). This does not reopen accepted domain or security decisions.

## Clean-rewrite and cutover risks

- Incomplete legacy-code removal could leave a reader, direct writer, callable, index dependency, or Storage authorization path that expects or recreates a retired shape.
- Stale browser clients or offline persistence may retry old writes unless canonical Rules, endpoint removal, release checks, and local-store invalidation all fail closed.
- Deployment ordering is safety-critical because Rules, Functions, scheduled jobs, reset, seed, and frontend deployment are not physically atomic.
- An incorrect allowlisted seed may introduce invalid Account, Instructor, Course, Course Day, capacity, timezone, assignment, or asset-reference data into an otherwise clean database.
- Resetting Firestore does not reset Firebase Auth or Storage; stale identities, claims, chat/media objects, and orphaned assets require explicit handling and verification.
- Family/Group and multi-day Course operations may exceed Firestore transaction or write limits unless the command/resource model defines and enforces bounded operation sizes.
- Security-rule regressions may allow direct mutation of server-owned state or broaden Participant, financial, Attendance, or audit access beyond canonical authorization.
- A scheduled legacy job or undeleted legacy endpoint could recreate retired documents after reset or mutate canonical data with old assumptions.
- Incomplete frontend migration could retain old queries, payloads, status maps, persisted stores, or course-shaped Booking behavior despite a canonical backend.

## Evidence map

Repository evidence used for the gap analysis includes:

- `packages/shared-domain/src/booking.ts`
- `packages/shared-domain/src/entities.ts`
- `src/types/booking.ts`
- `src/types/user.ts`
- `src/types/course.ts`
- `src/types/activity.ts`
- `src/domain/availability/`
- `src/domain/wallet/`
- `src/features/bookings/`
- `src/features/courses/`
- `functions/src/bookings/`
- `functions/src/courses/`
- `functions/src/schoolGuestWallet.ts`
- `functions/src/walletLedger.ts`
- `firestore.rules`
- unit, callable, emulator, and security-rule tests

Repository behavior is evidence for migration and gap analysis, not automatic endorsement of the canonical business model.
