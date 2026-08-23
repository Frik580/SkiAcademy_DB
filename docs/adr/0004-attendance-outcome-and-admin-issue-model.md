---
status: accepted
date: 2026-08-23
---

# ADR-0004: Attendance, Outcome and Admin Issue Model

Carve Academy will store one independent, deterministic `Attendance` aggregate for each Participant occurrence and derive `completed` or `no_show` only from sufficient factual Attendance after delivery. Actor-driven commands and the delayed scheduler will use one internal outcome calculator, while missing or conflicting evidence remains unresolved through deterministic `AdminIssue` records rather than timestamp guesses. Current Attendance may be corrected, but every consequential correction is revision-checked and atomically coupled to lifecycle, Payment, issue, idempotency, one immutable Activity Log, and any required outbox obligations.

This ADR completes the Attendance decision deferred by [ADR-0001](./0001-canonical-aggregate-topology.md), uses the command and transaction model in [ADR-0002](./0002-server-command-transaction-and-resource-model.md), and preserves the Payment source and start gate in [ADR-0003](./0003-payment-accounting-source.md). It preserves the business language and lifecycle rules in [CONTEXT.md](../../CONTEXT.md) and refines the Attendance work in the [canonical rewrite specification](../specs/canonical-booking-domain-rewrite.md). [ADR-0005](./0005-audit-durability-and-transaction-policy.md) resolves the physical Activity Log, asynchronous outbox, and retention policy while satisfying the atomic audit obligations established here.

## Context and scope

The current implementation has no canonical Attendance aggregate. Timestamp-based automation can mark past Bookings `completed`, callable and UI actions can select completion without Participant evidence, and Course Enrollment is still represented through legacy Booking shapes. Those paths conflate elapsed time, actor intent, lifecycle, and actual participation.

This ADR decides:

- Attendance identity, evidence, authorization, timing, and correction;
- outcome sufficiency for Individual and Family/Group Bookings and Course Enrollments;
- actor-driven and scheduled outcome timing;
- the generic `AdminIssue` representation and its relationship to canonical state;
- Attendance/Payment conflicts, resource cleanup, concurrency, idempotency, security, reconciliation, and required verification.

This ADR does not add a whole-Course cancellation lifecycle, redesign Course capacity, define Payment accounting, implement an Attendance event ledger, or redefine ADR-0005's audit and delivery boundaries.

## Decision overview

```text
record/finalize/correct Attendance command       scheduled resolveOutcome command
                    |                                         |
                    +-------------------+---------------------+
                                        |
                                        v
                         one internal outcome calculator
                    Attendance + lifecycle + Payment blockers
                    + Admin Issues + authoritative server time
                                        |
                 +----------------------+----------------------+
                 |                      |                      |
                 v                      v                      v
          completed/no_show       remain unresolved      recorded_with_issue
          when sufficient         + create/reuse issue   for factual conflict
                 |                      |                      |
                 +----------------------+----------------------+
                                        |
                                        v
                           one ADR-0002 transaction
        canonical state + issues + idempotency + Activity Log + outbox
```

The outcome calculator is an internal seam of the deep canonical command module. Callers provide business intent and evidence; they never provide the target lifecycle status. Callable, administration, Instructor, scheduler, and test adapters must not duplicate outcome policy.

## Attendance aggregate

### One aggregate per Participant occurrence

`Attendance` remains an independent canonical aggregate at `/attendance/{attendanceId}`. There is exactly one current Attendance document for each logical Participant occurrence.

Canonical versioned identities are:

```text
Booking:
attendance:v1:booking:{occurrenceId}:{participantId}

CourseDay:
attendance:v1:course-day:{enrollmentId}:{courseDayId}
```

The deterministic identity prevents duplicate current evidence for the same logical occurrence. Identity and authorization use opaque canonical IDs and references. Names, labels, contact data, or display snapshots are never identity or authorization authority.

The canonical current document contains enough data to validate and query the evidence without making snapshots authoritative. Its conceptual fields are:

```text
attendanceId
subjectKind                 booking | course_enrollment
subjectRef                  canonical Booking or CourseEnrollment reference
occurrenceId?               required for Booking Attendance
participantId
courseId?                   required for CourseDay Attendance
courseDayId?                required for CourseDay Attendance
attendanceStatus            present | absent
recordedBy                  canonical actor reference and capability
recordedAt                  authoritative server time
lastChangedBy               canonical actor reference and capability
updatedAt                   authoritative server time
revision
correlationId
causationId?
```

Actor metadata explains the current evidence and supports authorization of Instructor corrections; it does not replace durable audit history and is not authority for future access.

### Evidence semantics

The only stored Attendance states are:

- `present`: factual evidence that the Participant was present;
- `absent`: factual evidence that the Participant was absent.

No Attendance document means unknown or not recorded. There is no explicit `unknown` Attendance document. Missing evidence never means absent, and timestamp passage, a form not being opened, a failed request, or an omitted Instructor action never creates Attendance evidence.

Attendance and lifecycle remain distinct. Attendance supplies factual participation evidence; an authorized lifecycle command derives and commits the outcome only when timing, lifecycle, Payment, and issue rules permit it.

### Booking occurrence identity

Each Booking has a server-generated `occurrenceId` representing one delivery attempt. An authorized reschedule that establishes a new delivery attempt also establishes a new `occurrenceId`. Attendance for the old occurrence remains historical evidence under the old identity and must never silently attach to the rescheduled occurrence.

Resource movement, schedule revision, new occurrence identity, and any applicable outcome or issue effects of a reschedule belong to the canonical reschedule command. A caller cannot choose or reuse an occurrence identity.

## Course and Enrollment projections

Each `CourseEnrollment` maintains a transactionally updated, rebuildable `attendanceSummary`:

```text
recordedDayCount
presentDayCount
absentDayCount
projectionRevision
```

The invariant is `recordedDayCount = presentDayCount + absentDayCount`, and no count may exceed the canonical number of CourseDays. The summary is derived solely from canonical CourseDay Attendance documents and is not an independent source of truth. Attendance add, correction, and invalidation commands update it in the same transaction as the current Attendance change.

`Course` maintains the following rebuildable schedule projections derived from canonical `CourseDay` records:

```text
courseDayCount
finalCourseDayEndsAt
courseScheduleRevision
```

CourseDay records remain authoritative. Canonical Course end is the final canonical CourseDay's `endsAt`; there is no separately authoritative free-form `courseEndsAt`. Pre-delivery schedule changes update the projections and schedule revision transactionally, and reconciliation verifies them.

## Attendance authorization

Clients never write Attendance directly. Every mutation goes through `CanonicalCommands.execute` and is authorized and revalidated transactionally against current canonical state.

For an Individual Booking, Attendance may be recorded by:

- the Instructor assigned to that Booking occurrence; or
- an Administrator.

For a Family/Group Booking:

- the Instructor assigned to that Booking occurrence may record Attendance separately for each Participant in the frozen `serviceParticipantIds` set;
- an Administrator may add, correct, or invalidate evidence.

For a CourseDay:

- only an actual Instructor assigned to that specific CourseDay may record Attendance for the Enrollment's Participant;
- an Administrator may add, correct, or invalidate evidence.

A historical Instructor Relationship does not grant Attendance authority. Booking occurrence assignment and actual CourseDay assignment are the delivery authority and must be read and verified inside the transaction. Account management relationships permit scoped reads where service access allows but never direct Attendance mutation.

## Attendance timing and frozen delivery facts

All timing uses ADR-0002 authoritative server time.

For a Booking occurrence, its assigned Instructor may enter or correct Attendance from `startsAt` through `endsAt + 24h`, inclusive of the deadline according to the canonical timestamp comparison policy.

For a CourseDay, an actual Instructor assigned to that day may enter or correct Attendance from `courseDay.startsAt` through `courseDay.endsAt + 24h`. An early CourseDay may therefore be completed and corrected within its own window; the Instructor is not forced to wait until the end of the whole Course.

After the applicable Instructor window closes, only an Administrator may add, correct, or invalidate Attendance. Administration may act after `startsAt`; every correction or invalidation requires a reason and durable audit, and every late or exceptional addition also requires a reason and durable audit.

No Attendance-based outcome may resolve before the relevant outcome threshold. Attendance recorded before the end remains evidence only until that threshold is reached.

Once a CourseDay starts, its delivery interval and actual Instructor assignment are immutable for delivery and Attendance authorization. Changing either would require a separate explicit audited Admin correction mechanism approved by a later decision; this ADR does not create that mechanism.

## Two outcome thresholds

Outcome eligibility and scheduler eligibility are deliberately separate:

| Subject            | `outcomeEligibleAt`    | `automationEligibleAt`       |
| ------------------ | ---------------------- | ---------------------------- |
| Booking occurrence | `endsAt`               | `endsAt + 24h`               |
| CourseEnrollment   | `finalCourseDayEndsAt` | `finalCourseDayEndsAt + 24h` |

`outcomeEligibleAt` allows an actor-driven canonical command to resolve sufficient evidence immediately after delivery. `automationEligibleAt` is the earliest time the scheduler may attempt fallback resolution.

For example, when a Booking has ended and the assigned Instructor records `present`, the same canonical transaction may resolve the Booking to `completed`; the actor does not wait 24 hours. Neither an Instructor nor an Administrator may produce `completed` or `no_show` before `endsAt`.

At or after `automationEligibleAt`, a scheduled command:

1. re-reads the canonical subject, revisions, schedule or occurrence identity, Attendance or summary, Payment restriction, and blocking Admin Issues;
2. invokes the same internal outcome calculator used by actor-driven commands;
3. resolves `completed` or `no_show` only from sufficient evidence and no blocker;
4. leaves missing evidence unresolved and creates or reuses `missing_attendance`;
5. never resolves `pending_cancellation`;
6. leaves Payment or other blocking issues for Admin resolution;
7. commits all applicable state, issue, idempotency, immutable Activity Log, required outbox obligations, and resource-cleanup effects atomically.

The scheduler must not create Attendance, turn missing into absent, or carry a second implementation of outcome policy.

## Deterministic outcome calculator

The internal calculator accepts canonical current state, Attendance sufficiency, relevant blockers, and authoritative time. It returns a decision such as:

```text
not_yet_eligible
resolve(completed)
resolve(no_show)
unresolved(missing_attendance)
blocked(pending_cancellation)
blocked(payment_or_admin_issue)
recorded_with_issue(attendance_payment_conflict)
```

The exact implementation type is not fixed by this ADR, but its policy is. The caller never supplies `completed`, `no_show`, or another target lifecycle status. Commands may translate the calculator decision into a stable ADR-0002 result or error, but may not reinterpret it.

## Individual Booking outcomes

For a confirmed Individual Booking at or after `endsAt`:

| Attendance and blockers            | Canonical result                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `present`, no blocker              | `completed`                                                                         |
| `absent`, no blocker               | `no_show`                                                                           |
| missing Attendance                 | remain `confirmed`; create or reuse `missing_attendance`                            |
| `pending_cancellation` lifecycle   | remain `pending_cancellation`; never automatically complete or no-show              |
| Payment/start restriction          | preserve evidence, do not automatically resolve lifecycle; require Admin resolution |
| other outcome-blocking Admin Issue | do not resolve until the underlying state and issue are resolved canonically        |

An Administrator has no early terminal-outcome override. Before `endsAt`, Attendance may exist, but the Booking cannot become `completed` or `no_show`. After `endsAt`, an Admin command may resolve or correct the outcome only from sufficient evidence and with the required audit.

`pending_cancellation` never times out. After delivery, an Administrator must first approve or reject the cancellation through the canonical lifecycle command. A rejection may resolve the Booking outcome in the same transaction when sufficient Attendance exists.

## Family/Group Booking outcomes

At the service start gate, the canonical command rolls back every unpaid Family/Group addition according to ADR-0003 and freezes the resulting `serviceParticipantIds` for that Booking occurrence. Only that frozen set is an Attendance target. A Participant removed by the unpaid-addition rollback is not an Attendance target.

At or after `endsAt`, let:

```text
targetParticipantCount = serviceParticipantIds.length
presentCount            = explicit present records for that set and occurrence
absentCount             = explicit absent records for that set and occurrence
```

The outcome is:

```text
if presentCount >= 1:
    completed
else if absentCount == targetParticipantCount:
    no_show
else:
    remain confirmed
    create/reuse missing_attendance
```

Therefore `present, absent, absent` is `completed`; `absent, absent, absent` is `no_show`; and `absent, absent, missing` remains `confirmed` with an Admin Issue. Individual Participant absences remain independently queryable even when the Booking outcome is `completed`.

Payment and lifecycle blockers apply before this sufficiency result may be committed. Time never fills a missing Participant record.

## CourseEnrollment outcomes

Course Attendance is one record per Enrollment Participant per canonical CourseDay. At or after `finalCourseDayEndsAt`, the outcome calculator uses the Enrollment's verified Attendance summary and the Course's verified schedule projection:

```text
if presentDayCount >= 1:
    completed
else if absentDayCount == courseDayCount:
    no_show
else:
    remain confirmed
    create/reuse missing_attendance
```

One explicitly present day is sufficient for `completed`. `no_show` requires every canonical CourseDay to be explicitly absent. No present day plus one or more missing days remains unresolved; missing is never inferred as absent.

The resolver never overwrites `cancelled`, `withdrawn`, or `pending_cancellation`. Course Enrollment Attendance remains factual historical evidence if the Enrollment later becomes `cancelled` or `withdrawn`; lifecycle changes do not delete it.

CourseDay Attendance may be entered and corrected in the day-specific window, but no Enrollment outcome resolves before the final canonical CourseDay ends.

## Cancellation before service is not no-show

Before delivery, formally ending participation is a cancellation decision, not Attendance.

For an Individual Booking, a client who formally ends participation before `startsAt` uses the canonical cancellation workflow. The result is `cancelled`, and future Instructor and Participant time claims are released atomically. A late cancellation may retain part or all of the paid money, including a permitted zero-refund result; lifecycle cancellation and financial refund remain independent.

For example, if a client says three hours before a lesson that they will not come and administration formally resolves the Booking under the late-cancellation policy, the Booking becomes `cancelled`, Payment may legitimately retain the paid money, and the slot becomes available. The Booking does not become `no_show`.

If participation is not formally ended, the Booking remains `confirmed` and its time claims remain reserved through the interval. If delivery time is reached and the Participant is factually absent, explicit `absent` Attendance may produce `no_show` after `endsAt`.

`withdrawn` remains CourseEnrollment-only. It is not added to the Individual Booking lifecycle. For an Individual Booking:

- `cancelled` means the occurrence will not be delivered or participation formally ended;
- `no_show` means delivery time was reached and factual absence was recorded.

## Course Enrollment cancellation and withdrawal

CourseEnrollment retains `withdrawn`.

Before `course.startAt`, formally ended participation may:

- become `cancelled` and release a seat according to the cancellation/refund policy; or
- become `withdrawn` and release a seat where the approved zero-refund withdrawal semantics apply.

At and after `course.startAt`, neither `cancelled` nor `withdrawn` increases `availableSeats`. Eligible future Participant time claims may still be released according to the canonical lifecycle command. Course capacity remains governed independently from historical time claims and Attendance.

This ADR decides CourseEnrollment outcomes only and does not introduce whole-Course cancellation.

## Attendance correction model

Current Attendance is mutable, revisioned evidence. Immutable Activity Log history records every required mutation and correction. Any asynchronous delivery obligation is stored separately in the outbox and is not Attendance or audit history. There is no separate Attendance event ledger.

An Instructor correction is allowed only when all of these are true:

- the Instructor is authorized for the Booking occurrence or specific CourseDay;
- the Instructor is correcting Attendance they recorded;
- authoritative time remains inside the applicable Instructor window;
- the command supplies the expected Attendance revision;
- the correction does not require changing an already terminal overall outcome.

If an Instructor correction would make a terminal outcome unsupported or require a terminal lifecycle correction, including `completed <-> no_show`, the command must not change evidence or lifecycle independently. It creates or reuses `outcome_correction_required` and requires an Administrator.

An Admin correction:

- requires a reason;
- requires the expected Attendance revision, including an explicit expectation of absence when adding missing evidence;
- requires the expected Booking or CourseEnrollment revision;
- may add, change, or invalidate current evidence;
- uses one canonical correction command whenever the subject outcome changes.

Because explicit `unknown` documents are forbidden, invalidating current evidence removes the current Attendance document and thereby restores the canonical missing state. The same transaction records the immutable Activity Log, any required outbox obligations, and updates any derived summary.

Invalidation must not leave a terminal lifecycle unsupported. Under the currently approved lifecycle matrix, an Admin may invalidate evidence for a nonterminal subject, replace invalidated evidence with sufficient corrected evidence in the same command, or perform the approved `completed <-> no_show` correction with explicit opposite evidence. An attempt to remove the sole supporting evidence from a terminal subject without an approved resulting lifecycle transition fails with `invalid_transition`; this ADR does not silently invent `completed`/`no_show -> confirmed`.

An Admin terminal correction atomically keeps consistent:

- current Attendance;
- Booking or CourseEnrollment lifecycle;
- applicable Payment consequences;
- affected Admin Issues;
- idempotency state;
- the required immutable Activity Log and any required outbox obligations.

Direct Attendance or lifecycle status patching is forbidden. After a correction transaction commits, canonical state must not contain a normal `completed` subject supported only by absence or a `no_show` subject with present evidence. `completed <-> no_show` corrections are Admin-only.

## Attendance and Payment start-gate conflicts

Attendance preserves factual reality even when delivery violated Payment policy. If the ADR-0003 service-start gate says `Payment required — do not start`, but a Participant actually participates, the command must:

- preserve `Attendance.attendanceStatus = present`;
- create or reuse `attendance_payment_conflict`;
- retain the operational Payment violation;
- avoid automatically resolving `completed` or `no_show`;
- return a stable result such as `recorded_with_issue`.

It must never reject the factual evidence merely because delivery was prohibited and must never rewrite `present` to `absent`.

Administration may resolve the underlying conflict only through a canonical command that does one of the following:

1. corrects an erroneous Payment restriction or proves the service was fully funded at start, then applies the normal Attendance outcome;
2. corrects erroneous Attendance with mandatory reason and audit;
3. applies the canonical incomplete-payment cancellation resolution while preserving truthful Attendance;
4. for an Individual occurrence that did not actually happen, uses the approved reschedule workflow where appropriate.

Late Course payment never restores admission after Course start.

### Exceptional `cancelled + present`

`cancelled + present` is permitted only as an explicit exceptional Admin resolution of a real Attendance/Payment-policy breach. All of the following are required:

- prohibited delivery actually occurred;
- truthful `present` Attendance is preserved;
- `attendance_payment_conflict` exists;
- an Administrator uses an explicit canonical resolution command;
- a reason, immutable Activity Log, and any required outbox obligations are written;
- the resolution is identifiable as a Payment-policy violation.

The normal outcome calculator never creates `cancelled + present`. If the Payment restriction was incorrect, the command corrects the restriction and resolves the normal Attendance outcome instead.

## AdminIssue aggregate

`AdminIssue` is one generic typed aggregate at `/admin_issues/{issueId}`. It represents an unresolved operational inconsistency or human decision. It is not Booking or CourseEnrollment lifecycle, Attendance, Payment, or Activity Log.

Its lifecycle is:

```text
open | resolved | dismissed
```

Its conceptual fields are:

```text
issueId
kind
subjectRef
occurrenceRef?
participantId?
courseDayId?
status
severity                    normal | urgent | critical
blocksOutcome
blocksDelivery
dedupeKey
openedAt
lastDetectedAt
reopenedAt?
resolvedAt?
resolution?
assignedTo?
revision
correlationId
causationId?
```

Initial issue kinds are:

- `missing_attendance`;
- `payment_required_at_start`;
- `unresolved_pending_cancellation`;
- `attendance_payment_conflict`;
- `resource_reconciliation_mismatch`;
- `financial_reconciliation_mismatch`;
- `outcome_correction_required`.

Each issue has a deterministic, versioned dedupe identity. The `issueId` is derived from a versioned `dedupeKey` containing the kind, canonical subject, and the narrowest applicable occurrence, Participant, CourseDay, schedule revision, or reconciliation scope. Repeated detection updates or reopens that logical issue rather than creating a duplicate. Reopening preserves the original `openedAt`, records `reopenedAt`, advances `lastDetectedAt` and `revision`, writes the required immutable Activity Log, and creates any required outbox obligations.

Issue severity and blocking flags are explicit operational policy. They are not inferred by clients from issue age or kind labels.

## AdminIssue resolution

Changing an AdminIssue to `resolved` never mutates canonical business state by implication. A canonical domain command must either:

1. fix the underlying state and resolve the issue atomically; or
2. dismiss or record no action only when that issue kind explicitly permits it, with a mandatory reason.

For example, resolving `missing_attendance` requires one transaction that records Attendance, derives and commits the outcome when eligible, updates projections, and resolves the issue. Missing Attendance cannot be dismissed to permit automatic completion.

An issue-resolution command validates that its expected issue and subject revisions still match and that its resolution is compatible with the issue kind. Direct issue status patching is forbidden.

### Pending cancellation issue

When a Booking or CourseEnrollment enters `pending_cancellation`, the lifecycle command creates or reuses `unresolved_pending_cancellation`. It begins at normal severity and may become urgent after service end. It never times out.

Approval, rejection, or owner withdrawal resolves the issue atomically with the corresponding canonical lifecycle command. Lifecycle must never be mutated merely to clear the issue.

## Resource-claim release

Time resource claims represent scheduling exclusivity, not certainty that lifecycle resolution has finished. Booking and CourseDay time claims remain active through their actual scheduling interval. After the interval ends, historical time claims may be pruned or released even when a subject remains `confirmed` because Attendance is missing.

Missing Attendance must not keep past scheduling resources locked. Resource cleanup and outcome resolution may share a scheduled command, but cleanup eligibility derives from the ended interval rather than from a guessed lifecycle outcome.

For future CourseDays, CourseEnrollment cancellation or withdrawal releases eligible future Participant claims according to canonical lifecycle rules. Course admission capacity remains governed independently and retains its start-time freeze behavior.

## Concurrency and failure semantics

Every Attendance, outcome, and AdminIssue mutation uses ADR-0002 optimistic concurrency, transaction retry, and stable errors. There is no last-write-wins path.

Required race behavior includes:

- Instructor `present` versus Admin `absent`: one commits; the other receives `stale_version`;
- Attendance versus outcome resolver: a transaction retry re-reads the committed evidence and derives the result;
- cancellation versus Attendance: subject revision and lifecycle revalidation produce `stale_version` or `invalid_transition`;
- Payment resolution versus Attendance: retry observes the final Payment restriction state;
- CourseDay schedule change versus Attendance: CourseDay revision and authoritative time determine the winner;
- competing Admin corrections: one commits and the stale revision fails;
- exhausted Firestore contention: return `concurrent_modification`.

Commands that read a missing Attendance document still carry an explicit missing-document precondition so concurrent creation cannot be silently overwritten.

## Idempotency and scheduled keys

Every authoritative Attendance, outcome, and AdminIssue mutation follows ADR-0002 idempotency. Repeated `recordAttendance`, Attendance finalization, `resolveOutcome`, correction, and create-or-reuse issue intents are safe and return the stored equivalent result when the command identity and payload match.

Scheduled idempotency keys are deterministic and scoped to:

- the subject;
- the Booking occurrence or Course schedule revision;
- the applicable automation deadline;
- the command kind.

A changed occurrence or Course schedule revision therefore cannot accidentally replay the result for an obsolete delivery attempt or deadline.

## Atomic command boundaries and transaction budget

Examples of one-command atomic plans are:

| Command intent                    | Atomic state                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final Attendance entry            | Attendance, Booking/CourseEnrollment outcome, Attendance summary, issue resolution or creation, applicable Payment consequence, idempotency, Activity Log, required outbox obligations |
| Admin terminal outcome correction | Attendance correction, lifecycle correction, applicable financial consequence, issue resolution, idempotency, Activity Log, required outbox obligations                                |
| Course final outcome              | CourseEnrollment lifecycle, applicable Attendance/schedule projections, resource cleanup, issue resolution or creation, idempotency, Activity Log, required outbox obligations         |
| Pending-cancellation resolution   | lifecycle, refunds or retained funds, claims/capacity effects, AdminIssue resolution, idempotency, Activity Log, required outbox obligations                                           |

All plans are subject to ADR-0002 read/write preflight budgets. The bounded Booking party makes Family/Group Attendance operations preflightable. CourseDay Attendance updates one current record and one Enrollment summary; final Course outcome uses that verified summary and the Course schedule projection rather than an unbounded transaction-time scan of all Attendance documents.

Reconciliation may scan outside a transaction because it is read-only, but repair requires explicit bounded canonical commands. This ADR does not approve a saga or allow atomicity to be weakened when a plan exceeds budget; the command must reject before mutation until a separate design is approved.

## Security and read visibility

Accounts may read Attendance for Participants they canonically manage when the relevant service-access policy permits it. Assigned Instructors may read operational Attendance for their assigned Booking occurrences and CourseDays. Instructors may read only sanitized, delivery-related Admin Issues needed for their work.

Instructor views must not expose Wallet balance, outstanding amount, financial history, sensitive Payment details, or unrestricted issue resolution data. An Attendance/Payment conflict may be presented as a delivery restriction or Admin action requirement without exposing financial amounts.

Clients cannot directly mutate Attendance, Admin Issues, Booking or CourseEnrollment outcomes, summaries, or schedule projections. Administrators also act through canonical commands. Firestore Rules are defense-in-depth, not the sole policy implementation.

## Reconciliation

Reconciliation is read-only and must detect at least:

- a completed Booking without supporting present Attendance;
- a no-show Booking with present Attendance;
- a completed CourseEnrollment with no present CourseDay;
- a no-show CourseEnrollment with present or missing Attendance;
- duplicate logical Attendance;
- Attendance summary drift;
- Course final-end or CourseDay-count projection drift;
- a confirmed service long after its outcome deadline;
- an open AdminIssue whose underlying inconsistency no longer exists;
- a resolved AdminIssue while its inconsistency still exists;
- exceptional `cancelled + present` without the required `attendance_payment_conflict` resolution trail.

Reconciliation never silently repairs Attendance or lifecycle history. It creates or reuses deterministic Admin Issues where appropriate, or reports the mismatch for an explicit Admin correction command.

## Required verification

Implementation is not complete until automated verification covers:

- pure Attendance sufficiency and outcome-calculator tests;
- Individual `present`/`absent`/missing matrices;
- Family/Group mixed Attendance matrices;
- CourseDay Attendance matrices;
- explicit proof that missing is not absent;
- immediate actor-driven resolution after `endsAt`;
- scheduler fallback at `endsAt + 24h` and final CourseDay `endsAt + 24h`;
- `pending_cancellation` exclusion and issue escalation;
- client cancellation before service releasing resource claims;
- proof that `no_show` cannot occur before delivery;
- Attendance/Payment start-gate conflict handling;
- exceptional `cancelled + present` resolution;
- `missing_attendance` issue deduplication and reopening;
- Admin-only `completed <-> no_show` correction;
- Attendance correction races;
- cancellation versus Attendance races;
- scheduled resolver idempotency;
- CourseDay schedule-revision races;
- CourseDay Instructor authorization and correction-window enforcement;
- transaction-budget preflight and maximum-cardinality tests;
- Firestore Emulator authorization and direct-write-denial tests;
- reconciliation invariant tests.

## Legacy replacement targets

This is a clean canonical rewrite. The implementation must replace rather than preserve compatibility with:

- timestamp-based completion in `functions/src/bookings/autoComplete.ts` and its scheduler registration in `functions/src/index.ts`;
- arbitrary completion mutation in `functions/src/bookings/completeBooking.ts` and `functions/src/bookings/bookingLogic.ts`;
- the completion callable and client adapter reached through `src/features/bookings/bookingService.ts`;
- Instructor completion selection in `src/features/instructor-workspace/components/InstructorBookingCard.tsx` and `useInstructorWorkspace.ts`;
- Admin completion selection in `src/features/admin/components/bookings/BookingsLog.tsx` and `useAdminActions.ts`;
- legacy Course-shaped Booking and Enrollment paths with no per-CourseDay Attendance;
- status- or timestamp-derived UI assumptions that treat elapsed time or `completed` as Attendance evidence.

These paths are replacement and deletion targets under the canonical rewrite specification. They are not constraints on the canonical model and receive no compatibility layer from this ADR.

## Audit and outbox boundary

This ADR decides which Attendance, outcome, and AdminIssue changes require durable audit. [ADR-0005](./0005-audit-durability-and-transaction-policy.md) resolves the boundary by requiring exactly one immutable Activity Log to commit synchronously and atomically with every successful authoritative state-changing command, alongside any deterministic outbox obligations required by the delivery plan.

There is no Activity Log materialization lag. Outbox delivery is asynchronous and may lag, retry, or dead-letter independently. Neither Activity Log nor outbox data becomes current Attendance, lifecycle, Payment, or AdminIssue authority, and no second Attendance audit or event system may be introduced.

## Considered alternatives

### Infer absence or completion from elapsed time

Rejected. Time establishes eligibility, not factual participation. This would convert operational omission and failed requests into false evidence.

### Store explicit `unknown` Attendance

Rejected. Absence of the deterministic current document already expresses missing evidence and avoids two physical representations of the same state.

### Put Attendance inside Booking or CourseEnrollment lifecycle

Rejected. Participant-level and CourseDay-level evidence has a different identity, authorization window, correction history, and query shape from lifecycle.

### Let callers choose `completed` or `no_show`

Rejected. It would spread policy across UI, callables, Admin tools, and schedulers and permit outcomes unsupported by evidence.

### Give the scheduler a separate delayed policy

Rejected. Actor-driven and scheduler-driven resolution differ only in eligibility and actor context; they must share one calculator to prevent drift.

### Use an append-only Attendance event ledger

Rejected. A revisioned current projection plus mandatory immutable Activity Log history preserves current evidence and correction accountability without creating a competing event source; any asynchronous delivery obligation remains separate in the outbox.

### Keep ended resource claims until lifecycle becomes terminal

Rejected. Past time exclusivity has ended even when operational evidence is unresolved; retaining claims would confuse scheduling with outcome certainty.

## Consequences

### Benefits

- Factual participation is explicit, Participant-scoped, and cannot be manufactured by time.
- Immediate post-delivery workflows and delayed automation share one policy.
- Family/Group and multi-day Course sufficiency are deterministic and testable.
- Missing evidence and policy conflicts remain visible without corrupting lifecycle or Payment truth.
- Corrections preserve atomic consistency and reject last-write-wins races.
- Deterministic identities and projections keep normal transactions bounded and idempotent.

### Costs

- Booking occurrences, frozen service parties, Course schedule projections, Enrollment Attendance summaries, and Admin Issues require new canonical schema and reconciliation.
- Attendance commands must coordinate more aggregates and preflight transaction size.
- Administration needs explicit resolution interfaces for missing evidence, pending cancellations, Payment conflicts, and terminal corrections.
- ADR-0005 supplies the required atomic Activity Log history and separate asynchronous outbox without becoming a competing source of current state.
