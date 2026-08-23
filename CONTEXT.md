# Carve Academy Domain Context

Carve Academy coordinates lessons, group courses, scheduling, learning progress, and simulated payments for a ski and snowboard school. This document defines the domain language and the rules that future product and engineering changes must preserve; it is not an implementation inventory.

## How to read this document

- **Intended invariant** — a rule the domain should preserve, even where enforcement is incomplete.
- **Current implementation** — behavior verified in the current repository.
- **Known inconsistency** — verified behavior that conflicts with an intended invariant or with another representation.
- **Open business question** — a choice the repository does not settle; do not silently choose an answer.

## Product overview

The product serves four human capabilities: a student books and follows training; a guest submits a booking or course request without an account; an instructor manages assigned training and student development; an administrator operates the school. System actors perform scheduled completion and other maintenance.

The main journeys are:

- selecting an instructor and booking an individual lesson;
- submitting a guest lesson request and optionally linking it to a registered student later;
- enrolling a registered student or guest in a group course;
- confirming, rescheduling, cancelling, or completing a booking;
- paying from a simulated wallet, refunding cancellations, and reviewing operation history;
- recording recommendations, skill progress, achievements, reviews, chat, and activity history.

The product owns school scheduling, enrollments, learning progress, and its internal wallet ledger. It does not currently model a real payment processor, payroll, accounting settlement, equipment rental, lift access, lodging, or resort operations beyond configurable public content.

## Language

### People and capabilities

**Student**:
An authenticated person who books training and owns a learning profile, wallet, progress, reviews, and personal booking history.
_Avoid_: User, client, customer, account — use these only when referring to an implementation field or authentication identity.

**Guest**:
A person who submits contact details for a lesson or course without an authenticated student profile. A guest may later have a booking linked to a student by an administrator.
_Avoid_: Anonymous student, temporary user.

**Instructor**:
A school professional who delivers assigned lessons or courses and may evaluate student skills and give recommendations. Instructor capability is linked from a user profile to an instructor profile; it is independent of administrative role.
_Avoid_: Coach where canonical domain terminology is required. The UI uses both names.

**Administrator**:
A user with school-wide operational authority over bookings, schedules, courses, instructors, students, settings, and finance views.
_Avoid_: Manager unless a distinct manager capability is introduced.

**System Owner**:
An administrator with the additional capability to manage administrative roles. Ownership is an administrative privilege, not a separate kind of student or instructor.

**System Actor**:
A non-human actor that performs scheduled or maintenance workflows, such as automatic booking completion.

### Training and scheduling

**Lesson**:
A scheduled period of individual instruction with one instructor. A lesson is represented by a booking whose target is an instructor rather than a course.
_Avoid_: Training when referring to one scheduled session; training is the broader learning activity.

**Booking**:
The durable record of a student's, guest's, or system block's claim on a training product. It carries ownership, schedule, price, lifecycle status, and snapshots needed to display historical context.
_Avoid_: Reservation, order.

**Course**:
A group training product with its own identity, schedule description, price, instructors, content, and capacity.
_Avoid_: Lesson, booking.

**Course Enrollment**:
A student's or guest's participation claim on a course. Semantically it is identified by a booking associated with a `courseId`; it is not an instructor lesson.
_Avoid_: Course booking when the distinction from an individual lesson matters.

**Availability Slot**:
A public, privacy-reduced projection of an individual instructor's occupied time. It is derived from an active individual booking or a system block.
_Avoid_: Booking — a slot deliberately omits ownership, price, and notes.

**Hour Lock**:
A derived concurrency guard for one instructor, date, and hourly start boundary. It prevents competing transactions from claiming the same instructor time.
_Avoid_: Availability; a lock is an enforcement artifact, not the instructor's full schedule.

**System Block**:
A zero-priced booking-shaped schedule block created by administration to make instructor time unavailable without representing a lesson.
_Avoid_: Lesson, student booking.

**Cancellation Request**:
A request to cancel a pending or confirmed booking, represented by the `pending_cancellation` status and an optional reason. It is not yet the terminal cancellation outcome.

**Completion**:
The terminal record that training is treated as delivered. Completion may be triggered by an authorized human or by the scheduled system actor.

### Money and learning progress

**Wallet**:
The product's simulated stored-value balance used to pay for lessons and courses. It is not an external bank or payment-provider account.

**Wallet Ledger Entry**:
An append-only record of a wallet operation such as credit, payment, refund, or adjustment. It explains balance movement but is not currently used to recompute the spendable balance.

**School Guest Wallet**:
The school's internal balance and ledger flow used to represent guest cash activity when no student wallet owns the payment.

**Skill Item**:
A configured learning competency that an instructor may score or comment on for a student.

**Recommendation**:
An instructor-authored action attached to a lesson that the student may mark complete.

**Achievement**:
A configured milestone evaluated from student activity and progress.

**Review**:
A student's rating and comment about an instructor, optionally associated with a booking.

**Activity Log Entry**:
An immutable historical event about student development, such as booking completion, skill changes, recommendations, reviews, levels, or achievements.

## Core entities and relationships

```text
Authentication Identity -> Student Profile -> Booking -> Instructor Profile
                                          \-> Course Enrollment -> Course
Student Profile -> Wallet Ledger Entry
Student Profile -> Skill Scores / Comments / Today Tasks
Booking -> Recommendations / Chat / Review / Activity Log Entry
Individual Booking -> Availability Slot + Hour Locks
```

- A `Booking` has one durable identifier and one owner identifier. The owner may be a student, a guest surrogate, or a system-block surrogate.
- An individual lesson points to an instructor identity and snapshots the instructor name and avatar for display and history.
- A course enrollment points semantically to a `Course`; the current booking representation also carries course presentation snapshots.
- A `Course` owns its published content, assigned instructors, total capacity, and mutable available-seat counter.
- A `UserProfile` owns student-facing progress and wallet fields. An instructor-capable user's profile also links to a public `Instructor` profile.
- Reviews, activity entries, wallet entries, notifications, and booking messages are separate records related by identifiers rather than child fields on the primary entities.

## Roles and permissions

Roles and capabilities are not mutually exclusive. In particular, `role: admin` and instructor capability may coexist on the same user profile.

### Student

- **Intended invariant:** a student controls personal data and student-owned actions, but cannot grant roles or choose privileged booking lifecycle transitions.
- **Current implementation:** a student can create and pay for an individual booking, enroll in a course, read owned bookings, update completed recommendation identifiers, create reviews, and use accessible chats.
- **Current implementation:** the booking-cancellation callable permits an owner to cancel directly; a separate workflow permits an owner to request cancellation. The intended distinction between these paths is unresolved.
- **Current implementation:** direct Firestore booking creation and lifecycle/schedule changes are denied; those operations are routed through server callables.

### Guest

- **Current implementation:** an unauthenticated guest can submit an individual lesson request or course request. These begin as `pending`, reserve time or a course seat, and carry guest contact snapshots.
- **Intended invariant:** a guest must not gain authenticated student permissions merely by knowing a booking identifier.

### Instructor

- **Current implementation:** instructor capability exists when a user profile links to an `instructorId`; it is independent of the `user`/`admin` role field.
- **Current implementation:** an assigned instructor can read the booking, confirm it, complete it, add recommendations, and participate in its chat.
- **Known inconsistency:** profile security rules allow any instructor-capable user to update student level, skill scores, and comments without visibly constraining the target to an assigned student. Whether school policy intentionally grants this breadth is unresolved.

### Administrator and System Owner

- **Current implementation:** administrators manage operational records and can add, reschedule, confirm, cancel, complete, link, and delete bookings.
- **Current implementation:** only the System Owner capability manages administrative roles; administrators and owners may also carry instructor capability.
- **Intended invariant:** UI visibility is not authority. Firestore rules and server callables are the enforcement boundary.

### System actors

- **Current implementation:** a scheduled actor completes eligible ended bookings and writes completion activity history.
- **Intended invariant:** system actions must be identifiable, idempotent where retried, and subject to the same lifecycle invariants as human-triggered actions.

## Booking lifecycle

Declared statuses are `pending`, `confirmed`, `pending_cancellation`, `cancelled`, and `completed`.

```text
pending ---------> confirmed ---------> completed
   \                   \
    \                   +-------------> pending_cancellation
     +---------------------------------> pending_cancellation

pending / confirmed / pending_cancellation -----> cancelled
confirmed / pending_cancellation --after end----> completed (scheduled)
```

The diagram expresses supported normal paths, not every transition the current implementation happens to permit.

### Creation

- **Intended invariant:** each creation workflow must choose its canonical initial status on the server. A client must not arbitrarily select `confirmed`, `cancelled`, `completed`, or any other lifecycle state.
- **Current implementation:** guest lesson and guest course requests start `pending`.
- **Current implementation:** the primary authenticated lesson UI and authenticated course enrollment start `confirmed` after charging the wallet.
- **Known violation:** the authenticated individual-booking callable accepts any declared status supplied by the client, including `cancelled` and `completed`, and still executes pricing/payment logic. The server does not own the initial transition.
- **Open business question:** should a successfully paid authenticated lesson/course be created directly as `confirmed`, or should all user-created bookings begin `pending` and require confirmation?

### Confirmation, cancellation, completion, and deletion

- **Current implementation:** an assigned instructor or administrator can confirm a booking unless it is already `cancelled` or `completed`.
- **Current implementation:** the booking owner or administrator can request cancellation only from `pending` or `confirmed`; the result is `pending_cancellation` with a reason.
- **Current implementation:** while `pending_cancellation`, an individual lesson retains its availability slot and locks, and a course enrollment continues to consume a seat.
- **Open business question:** retaining those resources during a cancellation request is observed behavior, not yet a confirmed business rule.
- **Current implementation:** the owner or administrator can invoke cancellation. Cancellation releases lesson availability or course capacity and normally refunds up to the paid price; cancelling an already completed booking produces no refund.
- **Current implementation:** an assigned instructor or administrator can invoke completion. The scheduled actor completes only `confirmed` or `pending_cancellation` bookings whose `endsAt` has passed.
- **Known violation:** manual completion does not enforce that the lesson has ended and does not reject every invalid source status; privileged callers can therefore bypass the normal lifecycle shape.
- **Current implementation:** completion removes individual availability. For an active course enrollment it also increments `availableSeats` up to `totalSeats`.
- **Open business question:** it is unresolved whether completing a course should return capacity. Do not treat the current counter update as the canonical course-capacity rule.
- **Current implementation:** the administrator deletion workflow hard-deletes a booking and cleans related availability. `isDeleted` remains in the model for legacy or alternative flows, including course-enrollment checks.

### Rescheduling

- **Current implementation:** only administrators can change date, time, or instructor through the server workflow; course enrollments cannot be rescheduled as lessons.
- **Intended invariant:** rescheduling must atomically release the old instructor claim, validate and acquire the new claim, recalculate trusted price, settle the balance difference, and retain booking identity.

## Course lifecycle and capacity

- A course is a group product; a course enrollment is a participation record for one student or guest.
- **Intended invariant:** `courseId` is the semantic association from enrollment to course wherever it is available.
- **Current implementation:** course enrollment is encoded as a booking and commonly identified by both `courseId` and a synthetic `instructorId` beginning with `course_`.
- **Known inconsistency / technical debt:** several paths fall back to parsing `courseId` from the synthetic instructor identifier, so enrollment identity depends on a string convention rather than an explicit domain type.
- **Current implementation:** authenticated enrollment charges the student's wallet and begins `confirmed`; guest enrollment begins `pending` and uses the school guest-wallet settlement path.
- **Intended invariant:** one student cannot hold more than one active enrollment for the same course, and capacity cannot be reserved below zero or released above `totalSeats`.
- **Current implementation:** normal enrollment and release paths update the booking and `availableSeats` in one transaction. A deterministic booking identifier supports one current enrollment per student/course and reuses a cancelled record for reenrollment.
- **Open business question:** define precisely when a seat is consumed and released—on request, confirmation, cancellation, deletion, completion, course end, or another event.

## Availability model

- **Intended invariant:** active individual lessons and system blocks for the same instructor must not overlap.
- **Current implementation:** `pending`, `confirmed`, and `pending_cancellation` individual bookings that are not deleted block availability. Course enrollments do not use instructor availability.
- **Current implementation:** a booking-derived availability slot supports public schedule reads and arbitrary-duration overlap checks.
- **Current implementation:** deterministic hour locks provide transactional conflict detection for each occupied hourly boundary.
- **Known limitation:** lock identifiers are hourly while durations are numeric hours; the model assumes hour-aligned scheduling and does not establish general fractional-duration locking.
- **Known inconsistency risk:** booking schedule, availability slot, and hour locks duplicate the same claim. Normal transactions update them together, but legacy data, partial migrations, or bypass paths may drift.
- **Current implementation:** the standard displayed lesson day uses hourly starts from 08:00 through 18:00 and requires the lesson to end by 19:00. Treat these as current product settings, not an immutable domain law.

## Wallet and payment model

- **Current implementation:** lesson price is derived from the instructor's current hourly rate and duration; course price is derived from the course. Client-supplied totals are not authoritative.
- **Intended invariant:** price calculation, debit, booking/enrollment creation, seat/availability reservation, and ledger recording must succeed atomically or not at all.
- **Current implementation:** `balanceUSD` is the spendable balance used by booking workflows. `walletBalances` adds currency-specific balances but coexists with the legacy USD field.
- **Current implementation:** wallet ledger entries record credits and debits and are append-only for ordinary users. Some UI history can synthesize missing legacy payment/refund operations from bookings.
- **Intended invariant:** a normal student purchase cannot create a negative balance; only an explicit privileged adjustment may bypass this rule.
- **Intended invariant:** a payment or refund for the same booking event must be idempotent and must never be applied twice.
- **Current implementation:** guests have no student wallet; school guest-wallet records represent guest cash collection, settlement, and refunds.
- **Known inconsistency risk:** the spendable balance, currency balances, ledger, and synthesized legacy operations are overlapping representations. Their reconciliation policy is not fully expressed as one domain rule.

## Learning progress and communication

- Student skill scores, instructor comments, level, checklist state, and preferences live with the student profile.
- Recommendations belong to a booking; the student's completed recommendation identifiers are stored on that booking.
- Achievements are evaluated from configured criteria and student activity; earned achievements and activity history are durable records.
- Reviews relate a student to an instructor and may reference the lesson that made the review eligible.
- Booking chat is scoped to booking participants and administrators; course chat additionally depends on course enrollment or instructor assignment.
- Notifications are user-owned delivery records, not the source of truth for the domain event they describe.

## Sources of truth

| Concept                     | Canonical representation                                                                                                                                                                         | Derived or denormalized representations                                                  | Classification notes                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Booking                     | The booking record identified by booking ID; its persisted status and schedule are the current operational state, even when a deficient creation path accepted an invalid client-selected status | Instructor name/avatar, display labels, and historical presentation fields are snapshots | Intended invariant: lifecycle and schedule values enter this canonical record only through authorized server transitions.     |
| Course enrollment           | The booking's explicit `courseId` plus its owner and lifecycle                                                                                                                                   | Synthetic `instructorId: course_{courseId}` and copied course title/image/date/duration  | Prefix detection is a current compatibility convention and technical debt, not the desired model.                             |
| Course capacity             | `Course.totalSeats` defines maximum capacity; stored `Course.availableSeats` is the current operational counter                                                                                  | Active enrollment records provide evidence from which occupancy could be audited         | The counter is authoritative for current admission checks, but its release semantics—especially on completion—are unresolved. |
| Instructor availability     | Active individual bookings and system blocks are the durable scheduling commitments                                                                                                              | Availability slots are public projections                                                | A slot must correspond to its source booking/block while that source blocks time.                                             |
| Hour locks                  | No independent business fact; they are deterministic guards derived from an active scheduling commitment                                                                                         | Lock documents duplicate instructor/date/time/booking identity                           | They are authoritative for transactional conflict acquisition, not for explaining the schedule.                               |
| Student wallet              | `UserProfile.balanceUSD` is the current spendable USD balance; currency-specific balances are authoritative only for their represented currencies                                                | Ledger entries audit operations; legacy history may be synthesized from bookings         | Multiple balance representations require care; the ledger is not currently the sole balance source.                           |
| Instructor identity/profile | The Instructor profile is canonical for public professional data; the UserProfile-to-`instructorId` link grants instructor capability                                                            | Booking instructor name/avatar and translated UI fields are snapshots                    | Authentication identity, instructor capability, and admin role are independent dimensions.                                    |

## Major workflows

### Authenticated individual booking

`student submits selection -> server validates identity, instructor, price, funds, and conflicts -> booking, availability, locks, debit, and ledger entry are committed -> UI and notifications reflect the result`

### Guest lesson request

`guest submits contact details -> server validates the request and conflicts -> pending guest booking and availability claim are committed -> administrator later confirms, links, cancels, or otherwise resolves it`

### Course enrollment

`student or guest selects course -> server validates course and capacity -> enrollment booking and seat decrement are committed -> student wallet is charged or guest settlement is tracked`

### Confirmation

`assigned instructor or administrator confirms -> server rejects terminal bookings -> any unpaid guest/system settlement is applied -> status and required availability are committed`

### Rescheduling

`administrator chooses a new schedule/instructor -> server recalculates price and validates conflicts -> old claims are released and new claims acquired -> balance difference and booking update are committed`

### Cancellation

`owner or administrator cancels -> server determines permitted refund -> status, refund/ledger, availability or capacity release, and guest settlement are committed`

### Manual completion

`assigned instructor or administrator invokes completion -> server validates authority but currently does not fully enforce source status or elapsed end time -> status changes -> individual availability is removed or current course-capacity release behavior runs -> activity history is recorded where applicable`

### Automatic completion

`scheduled actor selects confirmed or pending-cancellation bookings whose endsAt has passed -> status changes to completed -> individual availability is removed or current course-capacity release behavior runs -> completion activity history is recorded`

### Guest-account linking

`administrator selects guest booking and target student -> server validates both -> booking ownership changes and guest markers are cleared -> payment/profile-related legacy data is reconciled where supported`

## Critical invariants

Future `$implement` and `$code-review` work should use this checklist:

- A booking has exactly one owner identifier at any given time: student, guest surrogate, or system-block surrogate. Authorized guest-account linking may transfer that ownership.
- The server, not an unprivileged client, chooses and changes lifecycle status.
- Invalid lifecycle transitions must be rejected even for privileged workflows unless an explicit recovery operation says otherwise.
- A booking ID cannot be reused to overwrite a different request; retries must be idempotent.
- Individual instructor commitments cannot overlap, and their slot/lock projections must match the booking.
- Course enrollment uses explicit `courseId` as its semantic link; synthetic instructor identifiers are compatibility data only.
- Course capacity remains within `0..totalSeats`, and one enrollment event reserves or releases a seat at most once.
- Prices come from the canonical instructor or course record, never from client-supplied totals.
- Booking/enrollment mutation, wallet mutation, ledger entry, and availability/capacity mutation are atomic where they belong to one business event.
- Ordinary student spending cannot make the spendable balance negative; credits and refunds cannot be applied twice.
- Instructor snapshots on bookings never override the canonical Instructor profile for current professional data.
- Instructor capability, student identity, administrator role, and System Owner privilege remain independent unless the domain explicitly introduces exclusivity.
- UI visibility is never treated as security enforcement.
- Terminal or deleted bookings do not continue blocking individual instructor availability.
- Notifications and projections never become the source of truth for the event or entity they describe.

## System boundaries

- **Frontend:** gathers intent, presents domain state, and may calculate previews; it is not trusted to authorize lifecycle, price, balance, capacity, or schedule changes.
- **Shared domain package:** holds cross-runtime booking vocabulary and deterministic pricing, overlap, identity, and time helpers. It is the preferred seam for rules that must agree between frontend and server.
- **Firebase Authentication:** establishes authenticated identity; the domain profile supplies school capabilities and data.
- **Firestore:** persists domain records, projections, ledgers, configuration, and security rules.
- **Cloud Functions:** enforce privileged workflows, trusted pricing, transaction boundaries, idempotency, and lifecycle authorization.
- **Scheduled jobs:** perform time-based completion and retention work as identifiable system actors.
- **Storage:** stores media governed by ownership and administrative rules; it is not a source of domain identity.
- **External integrations:** no real payment-provider settlement is represented; wallet top-up is currently simulated.

Business logic currently exists in both frontend transaction modules and Cloud Functions. Server callables are the security boundary, but duplicated rules—especially booking lifecycle, course seats, availability cleanup, wallet settlement, and identifiers—must remain aligned until consolidated.

## Known architectural and domain problems

### Verified

- The authenticated lesson-creation server accepts client-selected lifecycle status.
- Manual completion can bypass time-based completion rules and does not fully constrain source status.
- Course enrollment is encoded through a booking plus a synthetic instructor identifier; `courseId` is not uniformly required.
- Booking, availability slot, and hour locks duplicate scheduling state.
- Course-seat release currently occurs on completion as well as cancellation/deletion.
- `balanceUSD`, currency balances, wallet ledger, and synthesized legacy history overlap.
- `isDeleted` remains part of lifecycle checks although the primary administrator deletion workflow hard-deletes records.
- The code and UI use `student`, `client`, `user`, `instructor`, and `coach` inconsistently.

### Suspected risks requiring product or security confirmation

- Instructor-wide profile update permission may be broader than the intended assigned-student relationship.
- Direct owner cancellation and cancellation-request workflows may represent competing policies.
- Legacy or partially migrated availability projections may disagree with bookings.
- Free-form course date/duration strings and fixed booking fields can disagree about actual course end time.

## Potential ADRs

No ADRs currently exist. Do not create one until the underlying business choice is made and the decision satisfies the project's ADR threshold.

- **Booking initial state and transition authority:** decide whether paid authenticated bookings begin `pending` or `confirmed`, and establish one server-owned transition model.
- **Course capacity release policy:** decide whether a seat is released on completion, only on cancellation/withdrawal, at course end, or under another policy. Current completion behavior must not be normalized before this decision.
- **Explicit Course Enrollment model:** decide whether to introduce a first-class enrollment entity/type and retire `instructorId.startsWith("course_")` as a domain discriminator.
- **Availability representation:** decide the long-term canonical/projection/lock relationship and repair strategy for drift.
- **Wallet source and reconciliation:** decide whether balances or the ledger become the accounting source of truth across currencies and guest settlement.

## Open questions

- What is the canonical initial status for a paid authenticated individual lesson and for a paid course enrollment?
- Should students cancel immediately, request approval, or use different policies based on time, product, or refund eligibility?
- Should `pending_cancellation` continue reserving instructor time and course capacity?
- Which source statuses may an instructor or administrator complete, and must manual completion require the scheduled end time?
- When exactly should course capacity be released? In particular, should completion increment `availableSeats`?
- Does `availableSeats` mean capacity open for new enrollment, active unconsumed participation, or something else after a course starts?
- May one instructor-capable user evaluate every student, or only students linked through assigned lessons/courses?
- Is a guest request a reservation, an unpaid lead, or a financially committed booking before confirmation?
- Which representation should ultimately reconcile wallet truth: stored balances, ledger totals, or an external payment system?
- Should deleted bookings remain as soft-deleted audit records instead of being hard-deleted?
- Are fractional lesson durations supported, or is hour alignment a deliberate domain constraint?

## Evidence map

The principal evidence for this model is the shared booking vocabulary, domain types, booking/course transaction workflows, Cloud Function handlers, Firestore security rules, scheduled completion, and tests covering callables, transactions, availability migration, and course enrollment. Key entry points include:

- `packages/shared-domain/src/booking.ts`
- `packages/shared-domain/src/entities.ts`
- `src/types/`
- `src/domain/availability/`
- `src/domain/wallet/`
- `src/features/bookings/bookingTransactions.ts`
- `src/features/courses/courseTransactions.ts`
- `functions/src/bookings/`
- `functions/src/courses/`
- `firestore.rules`

Repository behavior is evidence, not automatic endorsement. Where the implementation does not establish product intent, this document labels the point as an open question rather than inventing a rule.
