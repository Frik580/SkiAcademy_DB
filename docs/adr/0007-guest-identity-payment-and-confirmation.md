---
status: accepted
date: 2026-09-01
---

# ADR-0007: Guest Identity, Payment, and Confirmation Architecture

Guest Lesson Booking and Guest CourseEnrollment confirmation is payment-driven. A guest application remains `pending` until the required canonical Payment is fully funded for service; only then may the subject become `confirmed`. Identity linking, Administrator discretion, Instructor acceptance, partial payment, and frontend state are not confirmation authority.

This ADR records the implemented canonical architecture after T32.8A, T32.8B, and T32.8C. It preserves the aggregate topology in [ADR-0001](./0001-canonical-aggregate-topology.md), the command/transaction model in [ADR-0002](./0002-server-command-transaction-and-resource-model.md), Payment accounting in [ADR-0003](./0003-payment-accounting-source.md), AdminIssue coupling in [ADR-0004](./0004-attendance-outcome-and-admin-issue-model.md), and audit/outbox atomicity in [ADR-0005](./0005-audit-durability-and-transaction-policy.md). It updates the previously published guest-confirmation business rule in [CONTEXT.md](../../CONTEXT.md).

## Supersession

This ADR supersedes every earlier authoritative statement equivalent to:

- Administrator approval confirms an unpaid guest Booking or CourseEnrollment;
- guest confirmation is independent of payment;
- identity linking is confirmation;
- Guest CourseEnrollment approval policy is unresolved or missing a canonical confirmation command;
- `confirm_guest_booking` is an unpaid Admin override;
- guest confirmation is represented by a generic `guest_needs_approval` AdminIssue or a generic “mark approved” action.

Those readings are obsolete. Where they remain in historical audit snapshots, they are not current policy.

## Decision overview

```text
identity linking ≠ payment ≠ confirmation

Guest application
  → pending subject
  → unpaid Payment + reserved claims/capacity
  → required canonical Payment becomes fully funded for service
  → confirmed

Main confirmation path
  canonical financial mutation
  → Payment becomes fully funded
  → guest subject confirmation in the same Firestore transaction

Rare divergence recovery
  immediate post-check
  → canonical AdminIssue
  → idempotent reconciliation sweep
```

## Domain invariant

For both Guest Lesson Booking (`bookingOrigin = guest`) and Guest CourseEnrollment (`bookingOrigin = guest`):

```text
guest application → pending → required canonical Payment fully funded for service → confirmed
```

Therefore:

- identity linking is not payment and is not confirmation;
- Administrator discretion is not confirmation authority;
- Instructor acceptance is not confirmation authority;
- partial payment is not confirmation;
- frontend state is not confirmation authority.

`confirm_guest_booking` and `confirm_guest_course_enrollment` exist as canonical `pending → confirmed` lifecycle transitions. Both require a fully funded Payment. Their existence must not be read as permission for an Administrator to confirm an unpaid guest application. Unpaid Admin override has been intentionally removed.

## Canonical definition of “fully funded”

The authoritative predicate is `isPaymentFullyFundedForService` from ADR-0003. Whole-KZT canonical accounting remains authoritative. The implemented invariant is:

```text
retainedAmount === price
settledAmount === price
writtenOffAmount === 0
outstandingAmount === 0
```

`paymentStatus` alone is never sufficient evidence of payment satisfaction. A Payment may have a status such as `partially_refunded` while still requiring the accounting fields to determine whether the service remains fully funded.

## Guest Lesson Booking lifecycle

Guest creation remains:

```text
guest request
  → unmanaged guest Participant
  → Booking = pending
  → price fixed
  → unpaid Payment created
  → instructor, time, and participant claims reserved
```

Confirmation is:

```text
pending
  + isPaymentFullyFundedForService(Payment)
  + lifecycle and time guards satisfied
  → confirmed
```

Lesson confirmation must not:

- charge again;
- create a second Payment;
- reacquire claims;
- change price;
- change instructor;
- change schedule;
- modify Attendance.

The confirmation write changes only the lifecycle, revision, audit, and the Booking service-party freeze required by the canonical model.

## Guest CourseEnrollment lifecycle

Guest enrollment creation remains:

```text
guest enrollment creation
  → Enrollment = pending
  → unpaid Payment created
  → one Course seat consumed/reserved
  → seat and day claims created
  → active-enrollment/uniqueness guards created
```

Confirmation is:

```text
pending
  + isPaymentFullyFundedForService(Payment)
  + lifecycle and start guards satisfied
  → confirmed
```

The implemented canonical command is `confirm_guest_course_enrollment`. This transition changes only the lifecycle, revision, and audit state required by the canonical model.

Confirmation does not:

- consume another seat;
- recreate claims;
- create another Payment;
- charge Wallet again;
- modify Attendance.

Capacity was already consumed during guest enrollment creation. Before `course.startAt`, `pending` already occupies one seat; confirmation does not occupy a second seat.

## Payment → confirmation transaction

The implemented architecture is known. Primary confirmation is not an undecided choice between “same transaction or outbox.”

Main path:

```text
canonical financial mutation
  → Payment becomes fully funded
  → guest subject confirmation occurs in the same Firestore transaction
```

The shared planner is `functions/src/canonical/guestConfirmation/guestPaymentConfirmation.ts`. Financial commands that fund a Payment plan guest confirmation against the projected fully funded Payment before commit. If the subject is already confirmed, confirmation is a no-op. If the subject is cancelled, expired, or otherwise ineligible, the financial mutation fails closed rather than resurrecting it.

Standalone `confirm_guest_booking` and `confirm_guest_course_enrollment` reuse the same planner for compatibility and canonical transition reuse. They still require fully funded Payment.

## Rare cross-transaction divergence

Normal confirmation is atomic with the financial mutation. The reconciliation path is recovery, not the primary confirmation mechanism.

For rare inter-transaction or concurrency divergence:

```text
immediate post-check
  → canonical AdminIssue
  → idempotent reconciliation sweep
```

The sweep module is `guestConfirmationReconciliationSweep` (`sweepGuestConfirmationLifecycleMismatches`). The scheduled job currently runs every five minutes.

The sweep must:

- be idempotent;
- never resurrect cancelled or expired terminal subjects to `confirmed`;
- deduplicate open issues;
- safely reopen a resolved issue if the underlying mismatch genuinely reappears.

Duplicate financial events or confirmation delivery must not duplicate lifecycle transition, audit, outbox, Payment effects, claims, or capacity.

## Concurrency and no-resurrection

Payment settlement versus expiry, and payment settlement versus cancellation, are serialized by canonical server transaction and revision semantics.

Fundamental invariant:

```text
a terminal cancelled or expired subject
must never be resurrected to confirmed
by delayed settlement or reconciliation
```

If Payment is fully funded but the guest subject is already cancelled, expired, started, or otherwise ineligible, confirmation is refused. The mismatch may produce a reconciliation AdminIssue. It must not become a confirmation.

## T32.8B identity linking

Admin-assisted guest identity linking is independent of confirmation. It uses `existing_managed` semantics.

```text
Guest record
  → Administrator selects a canonical Account
  → Administrator selects an eligible Participant actively managed by that Account
  → guest occurrence/reference is replaced with the selected Participant
```

For Lesson Booking:

- the unique unmanaged guest occurrence is derived server-side;
- Booking party and service-party references are updated;
- participant occurrence claims are migrated atomically.

For CourseEnrollment:

- `participantId` is replaced;
- existing T27A payer-account routing semantics may update `Payment.payerAccountId`;
- Payment amounts and status remain unchanged.

Linking must not:

- confirm;
- fund Payment;
- consume or release capacity;
- alter Attendance;
- create ParticipantManagement;
- promote a guest Participant to self;
- create a dependent Participant;
- act as arbitrary relink or identity transfer.

Already-linked records cannot be silently relinked.

## Orphan guest Participant

After `existing_managed` linking, the original unmanaged guest Participant may become unreferenced. T32.8B does not automatically delete, archive, merge, promote, or assign management to that Participant. Cleanup of unused unmanaged guest Participants requires a separately established canonical cleanup or repair policy. This ADR does not imply automatic cleanup.

## Guest identity authority

T32.8A remains in force. Account, Participant, and ParticipantManagement are distinct canonical concepts. Admin guest linking uses the canonical Account → managed Participant selector. Eligibility is based on active ParticipantManagement.

Guest email, phone, and display name may be diagnostic evidence. They are not identity authority.

A disabled Account and an archived or otherwise ineligible Participant cannot be used as new linking targets.

## Unpaid cancellation and rejection

Established policy only:

**Fully unpaid pending Lesson Booking.** Existing canonical cancellation semantics apply. There is no refund because nothing was paid. Applicable reservation and claims are released according to Booking cancellation policy.

**Fully unpaid pending CourseEnrollment.** Canonical cancellation is `pending → cancelled`. Capacity is released exactly once. Seat and day claims are released. The outstanding unpaid obligation is written off or voided canonically. Wallet refund is 0.

This is cancellation of an unpaid pending application. It is not reversal of a manual approval.

## Explicitly deferred

The following are not defined by this ADR and are not supported:

- `pay_on_site`;
- cash-at-start;
- deferred payment;
- unpaid Admin override of a guest application;
- partially-paid pending guest rejection or cancellation refund, retention, or write-off policy;
- automatic cleanup of unused unmanaged guest Participants.

Current implementation of partially-paid pending guest rejection is fail-closed. A separate product and domain policy is required before automatic refund, retention, or write-off behavior is added. This ADR does not invent a refund percentage, cancellation fee, Wallet credit, external refund, or paid-amount write-off.

Supporting pay-on-site or unpaid Admin override later requires a dedicated product and domain decision. Current policy remains: required Payment fully funded → confirmation.

## Payment start gate

The intended current guest flow is:

```text
unpaid → pending
fully funded → confirmed
```

Existing `payment_required_at_start` / payment-start-gate mechanisms remain defensive canonical protection for legacy, inconsistent, exceptional, or other applicable states, including Administrator-created confirmed subjects that may still be underfunded before start. They are not the normal mechanism used to approve unpaid guest requests.

## AdminIssue semantics

Guest confirmation is not represented by a generic `guest_needs_approval` issue. There is no generic AdminIssue “mark approved.” AdminIssue remains coupled to canonical underlying conditions and actions.

The T32.8C reconciliation issue is a `financial_reconciliation_mismatch` with reconciliation scope `guest_confirmation_lifecycle`. It represents:

```text
Payment fully funded
but guest lifecycle confirmation not durably aligned
```

It is not discretionary Administrator approval. Resolving it requires a coupled canonical command that either confirms an eligible pending fully funded subject or records the genuine ineligible mismatch. It must not confirm a cancelled or expired subject.

## T32.9 boundary

T32.9 is split. See [ADR-0008](./0008-ux-preservation-during-canonical-migration.md).

- **T32.9A — Admin UX Restoration & Canonical Integration** recovers and preserves useful Admin UX on canonical read models and commands. It is not broad legacy UI cleanup.
- **T32.9B — Final Legacy Write / Runtime Cleanup** may remove leftover implementation only after canonical replacement and UX parity. Unreachable leftover helpers such as old bundled `confirmBooking`, superseded unpaid-approval terminology, and unused legacy Guest linking UI remain T32.9B after that gate.

This ADR does not delete those files. Unpaid Administrator guest approval remains forbidden product policy and must not be restored as “historical UX.”

## Consequences

- Guest pending is a payment-held reservation, not an Admin approval queue.
- Payment remains the numeric funding authority; Booking and CourseEnrollment remain lifecycle authorities; confirmation coordinates them atomically when funding is satisfied.
- Course capacity and claims stay attached to guest creation, not confirmation.
- Identity linking can occur before or after confirmation without changing origin, Payment amounts, or Attendance.
- Rare funding/lifecycle divergence is observable and recoverable without becoming a second confirmation authority.

## Rejected alternatives

- **Administrator confirms unpaid guest applications.** Rejected. Confirmation authority is fully funded Payment, not Admin discretion.
- **Identity linking confirms the subject.** Rejected. Linking changes Participant association, not lifecycle or funding.
- **CourseEnrollment confirmation consumes another seat.** Rejected. Capacity is reserved at guest creation.
- **Primary confirmation via outbox or later sweep.** Rejected. The implemented main path is the same financial Firestore transaction; the sweep is recovery only.
- **`paymentStatus == paid` as the funding predicate.** Rejected by ADR-0003. Accounting fields are authoritative.
- **Generic `guest_needs_approval` AdminIssue.** Rejected. Issues remain coupled to underlying canonical conditions.
- **Pay-on-site or unpaid Admin override in this architecture.** Rejected as in-scope support. They remain deferred.
- **Silent resurrection after cancellation or expiry.** Rejected. Terminal guest subjects stay terminal.
