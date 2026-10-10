# Conversion analytics event contract

Carve Firebase emits conversion facts from **already-committed** canonical command outcomes. The log line is operational telemetry. It is not a store of booking, enrollment, or money state.

Authoritative state remains the canonical Booking, CourseEnrollment, Payment, and MonetaryEvent documents written by the command. Analytics failure does not roll back a committed command. Idempotent replay of the same command does not emit again. TEST-scope commands do not emit.

Dedupe key for a delivered event: `name + commandId + subjectId`.

Join key for Carve Dev client events: `correlationId` (the command correlation id) and `subjectId` (booking id or course enrollment id). `commandId` exists only after the server commits.

## Server events

Log line: `conversion_analytics` followed by one JSON object.

Shared fields:

| Field             | Type                                                                         | Meaning                                                 |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `name`            | `booking_complete` \| `paid`                                                 | Event name. Use these exact strings.                    |
| `source`          | `canonical_command`                                                          | Always this value for server events.                    |
| `occurredAt`      | ISO-8601 UTC                                                                 | Command `decidedAt`, not a client clock.                |
| `commandKind`     | canonical command kind                                                       | Command that committed the outcome.                     |
| `commandId`       | string                                                                       | Canonical idempotency command id. Stable across replay. |
| `correlationId`   | string                                                                       | Command correlation id.                                 |
| `subjectType`     | `booking` \| `course_enrollment`                                             | Commercial subject.                                     |
| `subjectId`       | string                                                                       | Booking id or course enrollment id.                     |
| `paymentId`       | string                                                                       | Canonical payment id for that subject.                  |
| `currency`        | `KZT`                                                                        | Product currency. Amounts are minor units (tiyn).       |
| `priceMinor`      | number                                                                       | Committed service price snapshot. Not an authority.     |
| `paidAmountMinor` | number                                                                       | Committed paid amount snapshot. Not an authority.       |
| `paymentStatus`   | `unpaid` \| `partially_paid` \| `paid` \| `refunded` \| `partially_refunded` | Committed payment status snapshot.                      |
| `accountId`       | string, optional                                                             | Payer account when the command has one.                 |
| `guestSubjectId`  | string, optional                                                             | Guest subject when the command is a guest create.       |
| `dataScope`       | `live`                                                                       | Only live commands are emitted.                         |

### `booking_complete`

Fired when a command **creates** a lesson booking or course enrollment:

| Command                                                     | `subjectLifecycle`                  |
| ----------------------------------------------------------- | ----------------------------------- |
| `create_confirmed_booking`                                  | `confirmed`                         |
| `create_guest_booking_request`                              | `pending`                           |
| `accept_booking_proposal` (booking created)                 | `confirmed`                         |
| `create_course_enrollments` (each newly created enrollment) | `confirmed`, or `pending` for guest |

Extra field: `subjectLifecycle`: `pending` \| `confirmed`.

Not fired for:

- `complete_booking` (lesson attendance completion)
- `confirm_guest_booking` / `confirm_guest_course_enrollment` (the subject already exists)
- idempotent enrollment replay (`already_exists` / `alreadyApplied`)
- proposal acceptance that only marks the proposal unavailable

When the new payment snapshot is already `paid`, the same command also emits `paid` after `booking_complete`.

### `paid`

Fired when a committed payment projection **enters** `paymentStatus = paid` and was not already `paid`:

- the create commands above, when the new payment is paid
- `record_provider_payment_event`
- `pay_service_from_wallet_as_administrator` (skipped when the wallet charge was already applied)
- `adjust_service_price` when the committed projection becomes `paid`

Partial payments, wallet top-ups (`record_manual_wallet_funding`), starter credit, and financial corrections do not emit `paid`. A second command against an already-paid payment does not emit `paid` again.

`paid` uses the shared fields only (no `subjectLifecycle`).

## Not emitted: `auth_*`

No `auth_*` event is emitted. Sign-in and sign-up are Firebase Auth client outcomes, not canonical command results. `provision_self_participant` is identity provisioning after auth and is not an auth conversion event.

If Carve Dev emits client auth events, prefix them with `auth_` and do not reuse `booking_complete` or `paid`.

## Carve Dev client events (not implemented here)

These stay on the client. Do not send them from Functions. When Dev adds them, keep the server names above unchanged:

| Client event             | When                                      |
| ------------------------ | ----------------------------------------- |
| landing / session source | session start                             |
| instructor / course view | catalog view                              |
| `booking_start`          | user opens the booking or enrollment flow |

Suggested client payload fields so they can join to server facts: `correlationId`, `subjectType`, `subjectId`, `occurredAt`. Do not treat client payloads as payment or booking authority.
