# Carve Academy — Canonical Domain Mechanics (human-readable)

Source of truth for this document: `design-explorations/alpine-air-2/audit/code-domain-mechanics.json`
(machine-readable dump of the same facts). Nothing here is invented; every state below appears
in that dump, and each section cites the exact file that defines it.

Conventions used throughout:

- **Actor** — who is allowed to originate the operation (`student`, `guest`, `instructor`, `admin`, `system`).
- **Authority** — where the mutation is actually applied. In this codebase almost every authority is
  `cloud-function`; the only `client` authority is money *formatting*, and `rules` governs the legacy
  `/users` projection.
- Collections are Firestore top-level collections written as `/collection/{id}`; subdocuments use the
  full path (e.g. `/users/{accountId}/wallet/state`).

---

## 1. Booking lifecycle

### 1.1 The six canonical states

`Booking` (`/bookings/{bookingId}`) is defined in
`packages/shared-domain/src/canonical/bookingOccurrenceProposalChange.ts` (`BookingSchema`, `BookingLifecycleSchema`).

Six states, not five:

| State | Meaning | User-visible? |
|---|---|---|
| `pending` | Guest-only slot hold | yes — always with countdown to `reservationExpiresAt` |
| `confirmed` | The real booking | yes |
| `pending_cancellation` | Cancellation requested, awaiting admin decision | **yes — its own chip, never merged into `cancelled`** |
| `cancelled` | Terminal | yes, always renders `reasonCode` (7 possible codes) |
| `completed` | Terminal | yes |
| `no_show` | Terminal | yes |

Terminal states (`cancelled` / `completed` / `no_show`) are frozen: the UI must offer no actions.

Transitions (`packages/shared-domain/src/canonical/bookingOccurrenceProposalChange.ts`,
`packages/shared-domain/src/canonical/bookingCancellationPolicy.ts`,
`packages/shared-domain/src/canonical/bookingAttendancePolicy.ts`,
`functions/src/canonical/bookings/bookingCommands.ts`,
`functions/src/canonical/bookings/bookingCancellationCommands.ts`):

| From → To | Trigger | Guard |
|---|---|---|
| `pending` → `confirmed` | `create_guest_booking` / `confirm_guest_booking` | ONLY when `bookingOrigin === 'guest'` (`validateBookingOriginLifecycleConsistency`: *"Only guest-origin Bookings may be pending"*) |
| `pending` → `cancelled` | `expire_guest_reservation` | reasonCode `reservation_expired` |
| `confirmed` → `pending_cancellation` | `request_booking_cancellation` (client) | inside the 24h window |
| `pending_cancellation` → `confirmed` | `withdraw_booking_cancellation_request` | — |
| `pending_cancellation` → `cancelled` | `resolve_booking_cancellation` (admin: approve / direct_cancel) | — |
| `confirmed` → `completed` | `complete_booking` / `finalize_booking_attendance` | derived from Attendance evidence |
| `confirmed` → `no_show` | `record_booking_no_show` | derived from Attendance evidence |
| `confirmed` → `cancelled` | `resolve_booking_cancellation` direct path | administrator only |

Actor `student`, authority `cloud-function`.

### 1.2 The 24-hour boundary (the single most important constraint)

`packages/shared-domain/src/canonical/bookingCancellationPolicy.ts`,
`functions/src/canonical/bookings/bookingCancellationCommands.ts`.

Outcomes of a cancellation request are a three-value set:
`direct_cancel`, `pending_request`, `after_start_rejected`.

| Condition | Outcome |
|---|---|
| `requestAt >= startAt` | `after_start_rejected` — hard block, no cancellation possible |
| `timeUntilStart >= INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS` (24×60×60×1000 ms) | `direct_cancel`, full refund of retained amount |
| `0 < timeUntilStart < 24h` | `pending_request` — admin must approve; `refundPercentBasisPoints` 0..10000 applied |

Design consequence: show a live "cancel until HH:MM" deadline. Inside 24h the UI must **not** promise a
refund — it must say "request sent, awaiting admin". Never show an amount before the server returns
`refundDelta` / `writeOffDelta` from `projectCancellationFinancialEffects`.

### 1.3 Self-service reschedule

Entity: `Booking.clientSelfServiceRescheduleConsumedAt`.
`packages/shared-domain/src/canonical/bookingReschedulePolicy.ts`,
`functions/src/canonical/bookings/bookingRescheduleCommands.ts`.
Outcomes: `allowed`, `inside_window_rejected`, `after_start_rejected`.

- `requestAt >= startAt` → `after_start_rejected`.
- `timeUntilStart < INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS` (24h) → `inside_window_rejected`.
- `timeUntilStart >= 24h` **and** `clientSelfServiceRescheduleConsumedAt === undefined` → `allowed`.
- A second use is denied by `isClientSelfServiceRescheduleAllowanceAvailable`.

Self-service reschedule is **one-shot per booking**. The UI must reflect a consumed allowance
(hide/disable the affordance) rather than letting the server return 409.

### 1.4 Multi-participant party contract

`Booking.party = { kind: 'individual' | 'family_group', participantIds: ParticipantId[] }`.
`packages/shared-domain/src/canonical/bookingOccurrenceProposalChange.ts`,
`packages/shared-domain/src/canonical/bookingPartyPolicy.ts`,
`packages/shared-domain/src/canonical/bookingAttendancePolicy.ts`.

- `deriveBookingPartyKind(1) === 'individual'`; `deriveBookingPartyKind(n > 1) === 'family_group'`.
  Enforced by `validateBookingPartyKindConsistency` — `party.kind` must always match
  `participantIds.length`.
- `participantIds` are unique (`duplicateParticipantIndexes`); minimum length `BOOKING_PARTY_MIN = 1`.
- `party.participantIds` is superseded **per occurrence** by `occurrence.serviceParty.participantIds`
  (the FROZEN roster). `serviceParty` must be a subset of `party` (`validateServicePartySubset`).
- `occurrence.serviceParty.frozenAt` gates whether Attendance can be recorded at all
  (`resolveBookingAttendanceTargets` → `service_party_not_frozen`).

**One Booking = one lesson = one slot reservation = one payment for the whole party.** Never render N
bookings for N skiers. The booking card is a *party card*: an avatar stack of N Participants, each with
independent attendance. The kind label switches at exactly N = 2.

### 1.5 Additional-participant pricing is configuration, not a UI constant

`LessonPricingSettings` (`/lesson_pricing_settings/lesson_booking`) + `Booking.pricingSnapshot`.
`packages/shared-domain/src/canonical/lessonPricingSettings.ts`,
`packages/shared-domain/src/canonical/readModels/lessonPricingSettingsReadModel.ts`,
`functions/src/canonical/pricing/lessonPricingSettingsCommands.ts`,
`src/features/bookings/components/booking_modal/useBookingModal.ts`.
States: `configured`, `not_configured`.

- `update_lesson_pricing_settings` (admin) writes `additionalParticipantSurchargePerHourKzt`,
  `maxParticipantsPerLesson`, `revision`.
- `calculateLessonPartyPriceKzt = baseLessonPriceKzt + round(additionalParticipantSurchargePerHourKzt × (participantCount − 1) × lessonDurationMinutes / 60)`.
- `Booking.pricingSnapshot` freezes strategyVersion `lesson_party:v1`, `baseLessonPriceKzt`,
  `additionalParticipantSurchargePerHourKzt`, `settingsRevision`, `lessonDurationMinutes`,
  `participantCount`, `totalPriceKzt`.
- Server rejects create/change when `participantCount > maxParticipantsPerLesson`
  (`functions/src/canonical/bookings/bookingCommands.ts:371`, `bookingPartyCommands.ts:267`).
- Multi-participant pricing **requires** a surcharge snapshot; a snapshot without surcharge is valid
  only when `participantCount === 1`.

The booking modal must read surcharge and cap from the `queryLessonPricingSettingsReadModel` callable.
Existing client behaviour confirms this — `useBookingModal.ts:658` renders
`Можно выбрать не более ${maxParticipantsPerLesson} участников.` /
`Select no more than ${maxParticipantsPerLesson} participants.` When settings are not configured,
multi-participant selection is **blocked** in the UI (`useBookingModal.ts:410`).

### 1.6 Changing the party after booking

`Booking.party.participantIds` + `IncrementalRequirement[]` on the Payment.
`packages/shared-domain/src/canonical/bookingPartyPolicy.ts`,
`packages/shared-domain/src/canonical/bookingPartyFinance.ts`,
`functions/src/canonical/bookings/bookingPartyCommands.ts`.
Outcomes: `allowed`, `inside_window_rejected`, `after_start_rejected`.

- `change_booking_party`; `isPartyChangeEligibleBooking` requires `lifecycle.status === 'confirmed'`
  (`pending` / `pending_cancellation` / terminal are rejected).
- `requestAt >= startAt` → `after_start_rejected`; inside `BOOKING_PARTY_CHANGE_WINDOW_MS` (24h) →
  `inside_window_rejected`.
- **ADD**: `partitionAddedParticipantsByMarginalDelta` computes a per-participant `requiredPriceDelta`;
  each becomes an `IncrementalRequirement` with state `active` → `fully_funded`.
- **REMOVE (self-service)**: `calculateSelfServiceRemoveRefundBasisKzt` is the negative of the price
  delta and requires a strictly lower authoritative price.
- **REMOVE (admin, late)**: `calculateAdminLateRemoveRefundAmountKzt` applies
  `refundPercentBasisPoints` (0..10000), capped by `maxPartyRemoveRefundKzt = min(paid − refunded, tariffDifference)`.
- `rollback_unpaid_booking_party_additions` sets requirement state `rolled_back` and zeroes allocations.

Adding a participant can create a **partially funded** obligation: the party editor must show
per-participant "unpaid surcharge" rows and keep the booking usable while a requirement is `active`.
Removal is price-decrease-only — never allow a removal that would increase the price.

### 1.7 Guest lesson reservation

Booking with `attribution.bookingOrigin === 'guest'`.
`packages/shared-domain/src/canonical/guestBooking.ts`, `guestCredential.ts`, `guestContact.ts`,
`functions/src/canonical/bookings/guestBookingCommands.ts`,
`functions/src/canonical/commands/guestReservationAdmission.ts`,
`src/lib/canonical/canonicalCommandClient.ts`.
States: `pending (held)`, `confirmed`, `expired`.

- `create_guest_booking_request` goes through the `executeGuestCanonicalCommand` callable
  (`guestActionNonce` + `guestActionSignature` + `guestPhone` / `guestEmail` transport fields).
- `resolveGuestLessonReservationExpiresAt = min(createdAt + GUEST_LESSON_RESERVATION_TTL_MS (1 hour), serviceStartsAt)`
  — the hold is `min(1h, until start)`.
- `expire_guest_reservation` → `cancelled` with reasonCode `reservation_expired`.
- `confirm_guest_booking` when the Payment is fully funded and now < start
  (`evaluateGuestBookingFundedConfirmation`).
- `link_guest_booking_to_account` / `..._as_administrator` attaches the guest Booking to a real Account.
- Guest participant profile travels as transport metadata: `participant_display_name`,
  `participant_skill_level`, `participant_discipline` (`ski` | `snowboard`), `participant_age_years`.

Guest booking is a **hold with a 1-hour countdown**, not a booking. The guest checkout needs an explicit
reservation-expiry timer and an explicit "pay at the desk / pay online" choice
(`evaluateGuestManualPaymentAcceptance` allows money on a CONFIRMED guest booking while outstanding > 0).
Guest contact (phone/email) is required at the guest transport layer, not stored on the Booking UI form.

### 1.8 BookingProposal — an offer, not a hold

`BookingProposal` (`/booking_proposals/{proposalId}`).
`packages/shared-domain/src/canonical/bookingOccurrenceProposalChange.ts`,
`packages/shared-domain/src/canonical/bookingProposalPolicy.ts`,
`functions/src/canonical/bookings/bookingProposalCommands.ts`,
`packages/shared-domain/src/canonical/readModels/bookingProposalReadModel.ts`.
States: `open`, `accepted`, `declined`, `expired`, `unavailable`, `cancelled`.

- `create_booking_proposal` → `open`, carrying **no reservation authority**
  (`proposalCarriesNoReservationAuthority` forbids `resourceClaimId` / `reservationExpiresAt` / `hourLockId`).
- `accept_booking_proposal` → `accepted` (+ `resultingBookingId`) — this is what actually creates the slot lock.
- `cancel_booking_proposal` with reasonCode `instructor_withdrawn` | `instructor_blocked_by_owner`.
- `expire_booking_proposal` → `expired`; declined → `declined`; slot taken → `unavailable`.
- The proposal count is checked against `maxParticipantsPerLesson`
  (`packages/shared-domain/src/canonical/bookingProposalAuthorization.ts:89`).

Two distinct visual states are required: "awaiting instructor response" vs "slot held".

### 1.9 BookingChangeRequest — instructor unavailable

`BookingChangeRequest` (`/booking_change_requests/{requestId}`).
`packages/shared-domain/src/canonical/bookingChangeRequestPolicy.ts`,
`functions/src/canonical/bookings/bookingChangeRequestCommands.ts`.
States: `open`, `resolved`, `cancelled`.

- `create_booking_change_request` — `requestType` is the single literal `instructor_unavailable`.
- `resolve_booking_change_request` → `resolved` with resolution `rescheduled` | `booking_cancelled` | `no_change`.
- `withdraw_booking_change_request` → `cancelled`.
- The request **must not** carry a direct Booking lifecycle mutation
  (`changeRequestCarriesNoDirectBookingMutation` forbids `bookingStatus` / `targetBookingStatus` /
  `lifecyclePatch` / `setStatus` / `transitionTo`).

This is an independent state machine from the Booking lifecycle — never render them as one status.
The booking UI needs an "instructor requested a change" banner with three admin outcomes.

---

## 2. Participant model (person vs login)

`Participant` (`/participants/{participantId}`) and `Account` (`/users/{accountId}`).
`packages/shared-domain/src/canonical/accountParticipantAccess.ts`,
`packages/shared-domain/src/canonical/participantAccess/`,
`packages/shared-domain/src/canonical/readModels/adminIdentityReadModel.ts`,
`firestore.rules:488`.

**Participant is the PERSON. Account is the LOGIN.**

- `Participant.lifecycle`: `active` | `archived`
  (`archive_participant` sets `archived` + `archivedAt`; `reactivate_participant` returns to `active`).
- `Participant.identityClassification` (admin read model): `self` | `dependent` | `unmanaged_guest`.
- `Participant.management`: `{ kind: 'unmanaged_guest' }` or `{ kind: 'managed', participantManagementId }`.
- `ParticipantManagement` (`/participant_management/{id}`): status `active` → `ended`; authority
  `self` | `parent_guardian`; role is always the literal `owner`.
- A managed Participant must have **exactly one** active owner relationship (`ParticipantAccessTopologySchema`).
- Commands: `assign_participant_management`, `revoke_participant_management`,
  `assign_participant_management_as_administrator`.
- Account lifecycle: `active` | `disabled` (`disable_account` / `enable_account`).

`firestore.rules` makes `/participants` fully server-only: the UI gets participants **only** through
read-model callables, never direct Firestore reads.

Design consequence: build a **person switcher**, not a single "user profile" form. One login can manage
self + several dependents.

### 2.1 Provisioning

`src/lib/canonical/canonicalAccountProvisioningClient.ts`,
`functions/src/canonical/participantAccess/`,
`packages/shared-domain/src/canonical/readModels/adminIdentityReadModel.ts:54`.

- `provision_self_participant` / `provision_self_participant_for_account` bind the self Participant to the Account.
- `grant_starter_credit` seeds the wallet.
- `create_managed_dependent_participant` creates a dependent under an Account's management authority.
- `create_participant` / `update_participant_profile` (participant-scoped identity fields only).
- Admin identity projection distinguishes account lifecycle `active` | `disabled` | `uninitialized`.

`ensureCanonicalSelfParticipant()` is called with a **fixed idempotency key**
(`provision-self-participant-v2`), so it is safe to call on every app bootstrap. New accounts always have
exactly one self Participant and a starter credit; onboarding may assume the self Participant exists.

### 2.2 Avatars

`Participant.avatarUrl` — `packages/shared-domain/src/canonical/accountParticipantAccess.ts:221-230,980-998`.

- `ParticipantAvatarUrlSchema`: trimmed string, 1..2000 chars, **must not** be a `data:` URL.
- Each Participant has an **independent** `avatarUrl`; changing one never mutates another.
- `sanitizeParticipantProfileForInstructor()` deliberately **drops** `avatarUrl` (and account contact) —
  instructors see only `participantId`, `displayName`, `age`, `skillLevel`, `discipline`, `instructorComment`.
- The lesson-booking read model **does** project participant `avatarUrl`
  (`packages/shared-domain/src/canonical/readModels/lessonBookingReadModel.ts:64-75`), so party avatar
  stacks are renderable; the instructor detail view is not.

Every person row (self **and** each dependent) needs its own avatar slot and fallback. Reject data-URL
uploads client-side with a clear message.

### 2.3 Instructor access to a Participant

`InstructorRelationship` (`/instructor_relationships/{id}`) + `ParticipantBlock` (`/participant_blocks/{id}`).
`packages/shared-domain/src/canonical/accountParticipantAccess.ts:327-511,1000-1052`,
`packages/shared-domain/src/canonical/readModels/participantInstructorAccessReadModel.ts`.
Relationship status: `active` | `revoked` | `expired`.

- Relationship basis kinds: `confirmed_booking` | `confirmed_course_enrollment` |
  `administration_assignment` | `guardian_permission`.
- `instructorRelationshipExpiresAt(validFrom) = validFrom + 12 months` (automatic expiry).
- `revoke_instructor_relationship` / `create_instructor_relationship`; `revokedBy` is a
  `participant_manager` or an administrator.
- `block_participant` / `unblock_participant` create a **directional** (participant, instructor) block;
  only the creator may remove it.
- `evaluateInstructorParticipantAccess` → scope `relationship` (long-lived) or `booking_scoped`
  (from a confirmed booking or course day, with `blockedForNewActivity`).

Instructor views of a student range from narrow (booking-scoped, read-only progress) to long-lived (full).
Drive the UI from the read model's `authorizedActions`, never from an assumption of full access. A blocked
pair must show an explicit "student requested not to be taught by you" state, not an empty screen.

---

## 3. Money model

Canonical currency is **KZT**, stored in **minor units** (integers, `KztMinorUnitsSchema`).
Authority for every money-affecting operation is `cloud-function`. The client never writes money.

### 3.1 Wallet

`Wallet` (`/users/{accountId}/wallet/state`) + `MonetaryEvent` (`/monetary_events/{eventId}`).
`packages/shared-domain/src/canonical/paymentWallet.ts`,
`packages/shared-domain/src/canonical/paymentWalletOperations.ts`,
`functions/src/canonical/finance/`, `firestore.rules:471-475`.

MonetaryEvent kinds (11):

| Kind | Direction | Notes |
|---|---|---|
| `wallet_credit` | credit | top-up |
| `wallet_adjustment` | ± | admin |
| `booking_charge` | debit | lesson |
| `course_charge` | debit | course |
| `external_payment` | credit | provider callback |
| `manual_payment` | credit | cash at desk |
| `refund_to_wallet` | credit | `destinationKind: 'wallet'` |
| `manual_external_refund` | credit | `destinationKind: 'manual_external'` |
| `admin_price_adjustment` | ± | |
| `write_off` | ± | debt forgiven |
| `correction` | ± | audit / financial correction |

- Top-up: `record_manual_wallet_funding` (admin) or `record_provider_payment_event` (provider callback);
  `sourceKind` ∈ `provider` | `cash` | `bank_transfer` | `manual_external`.
- Spend: `booking_charge` / `course_charge` debit the payer wallet **inside the same canonical transaction**.
- Refund destination: `resolveRefundDestination` → `wallet` when the Booking has `payerAccountId`,
  otherwise `manual_external`.
- Corrections: `record_financial_correction` / `record_audit_correction` / `adjust_service_price`.
- Every event carries signed deltas in `paymentEffect` (`priceDelta`, `paidAmountDelta`,
  `refundedAmountDelta`, `settledAmountDelta`, `writtenOffAmountDelta`, `outstandingAmountDelta`) and
  `walletBalanceDelta`.

`firestore.rules:471-475` gives the client **GET-only** on `/users/{uid}/wallet/state`
(create/update/delete = false). Never compute a balance locally — always render the server balance.

### 3.2 Payment aggregate and outstanding balance

`Payment` (`/payments/{paymentId}`) —
`packages/shared-domain/src/canonical/paymentWallet.ts:51-139`,
`packages/shared-domain/src/canonical/readModels/lessonBookingReadModel.ts:123-137,169-184`.

Statuses (5): `unpaid`, `partially_paid`, `paid`, `refunded`, `partially_refunded`.
`derivePaymentStatus(fields)`:

1. `refundedAmount > 0` → `refunded` if retained == 0, else `partially_refunded`.
2. `price == 0` → `paid`.
3. `settled == 0` → `unpaid`.
4. `settled == price && writtenOff == 0 && outstanding == 0` → `paid`.
5. otherwise → `partially_paid`.

- **Partial payment is first class**: `partially_paid` with a non-zero `outstandingAmount`.
- Subject is exactly one of `{ subjectType: 'booking' }` or `{ subjectType: 'course_enrollment' }`.
- `GuestPaymentSummary` exposes currency KZT, `price`, `outstandingAmount`, `paymentSatisfied`,
  `unpaidCancellationEligible`.
- Read-model presentation is a discriminated union:
  `{ kind: 'visible', paymentStatus, paymentRevision, price }` | `{ kind: 'withheld' }`.

UI must render partial payment as e.g. "partially paid 8 000 / 12 000 ₸" with an outstanding badge, and must
branch on `kind: 'withheld'` (an instructor, or a party member who is not the payer, sees **no** money figures).

### 3.3 Cancellation financial effects

`packages/shared-domain/src/canonical/bookingCancellationPolicy.ts:52-100`.
Outcomes: `refund`, `write_off`.

`projectCancellationFinancialEffects(payment, refundAmount)` asserts the approved refund is capped at
`paid − refunded`, applies `applyRefundDelta`, then applies `applyWriteOffAmount` for any remaining
`outstandingAmount`. Every cancellation therefore produces **both** a `refundDelta` and a `writeOffDelta` —
outstanding debt is written off, never left dangling.

The cancellation receipt must show two lines (refunded + written-off) when both are non-zero; conflating
them hides that a partially-paid guest's remainder was forgiven.

### 3.4 Command idempotency (all money-affecting flows)

`CommandIdempotencyRecord` (`/command_idempotency/{commandId}`).
`packages/shared-domain/src/canonical/commandIdempotency.ts`, `commandActorScope.ts`, `commandFingerprint.ts`,
`functions/src/canonical/commands/idempotentCommandExecution.ts`, `firestore.rules:696`
(`/function_idempotency = false`).

- `COMMAND_IDEMPOTENCY_SCHEMA_VERSION = 'idempotency:v2'`; key prefixes `command-key:v2`, `command-fingerprint:v2`.
- `commandKey = canonicalDeterministicHash(['command-key:v2', ...scopeParts, actorScope, idempotencyKey])`.
- `actorScope = encodeCommandActorScope(actor)` — account / guest / system / provider are separate namespaces.
- A fingerprint mismatch on the same key is an idempotency **conflict**, not a re-execution.
- `shouldPersistIdempotencyOutcome`: successes are persisted; errors only when **not** retryable.

Every mutation form needs a stable idempotency key (same key on retry of the same intent, new key on a
genuinely new intent), otherwise double-taps create duplicate Bookings. Retryable errors must not be cached —
show a retry affordance.

### 3.5 KZT display rules

`src/domain/pricing/kztDisplay.ts`, `src/domain/wallet/walletLedger.ts`, `src/types/user.ts:6-30`,
`packages/shared-domain/src/canonical/paymentWallet.ts`. Authority: `client` (formatting only).

- Canonical storage is KZT minor units; display converts minor → major.
- Legacy wallet ledger projection types: `top_up` | `starter_credit` | `lesson_payment` | `course_payment` |
  `refund` | `admin_adjustment` | `guest_payment`.
- Legacy `WalletCurrency` is `USD` | `KZT`, and a missing currency is treated as KZT — **USD is legacy only**;
  every canonical schema pins `currency: z.literal('KZT')`.

New UI is KZT-only; remove USD affordances. Always format through `kztDisplay.ts`, never ad-hoc
`toLocaleString()`.

---

## 4. Attendance

### 4.1 Lesson attendance (participant-scoped evidence)

`Attendance` (`/attendance/{attendanceId}`).
`packages/shared-domain/src/canonical/bookingAttendancePolicy.ts`,
`functions/src/canonical/bookings/bookingAttendanceCommands.ts`.
Statuses: `present`, `absent` — plus the mandatory third visual state *not recorded* (see 4.2).

- `record_booking_attendance` (instructor, capability `instructor`) writes **one Attendance row per
  participant** — never one per booking.
- Window: `evaluateInstructorAttendanceWindow` → `before_start` | `in_window` | `after_instructor_window`.
  In-window = `[startsAt, endsAt + BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS (24h)]`.
- Correction: `instructorMayCorrectAttendance` lets the **same** instructor flip their own row
  (`present`↔`absent`) while lifecycle is `confirmed` or `pending_cancellation`; once recorded `present`
  it cannot be re-set to `present`.
- Terminal exception: `instructorMayFillMissingFamilyGroupAttendanceOnTerminal` allows back-filling a
  **missing** row on a `family_group` booking already `completed` / `no_show` — but only if the projection
  does not change the outcome.
- `finalize_booking_attendance` / `evaluateBookingOutcomeCalculator` derive the Booking lifecycle.

The roster is a list with a present/absent toggle **per person**, not a single checkbox. The edit affordance
is disabled outside `[start, end+24h]` and must reflect `canRecordPresent` / `canRecordAbsent` exactly.

### 4.2 Missing means UNKNOWN, never absent

`packages/shared-domain/src/canonical/bookingAttendancePolicy.ts:86-97,184-228,376-392`,
`packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:893-895`.

- `missingAttendanceIsDocumentAbsence(): true` — the absence of an Attendance row **is** the unknown state.
- `missingAttendanceParticipantIds` treats any participant whose status is neither `present` nor `absent`
  as missing.
- Individual booking: no row → `missing_attendance`; `present` → `completed`; `absent` → `no_show`.
- Group booking (`deriveGroupBookingAttendanceOutcomeFromStatuses`): ≥1 present → `completed`;
  all absent → `no_show`; otherwise → `missing_attendance` with `missingParticipantIds`.
- The Booking **stays** `confirmed` during the instructor window even with zero attendance; only the
  scheduler acts at end+24h.
- Escalation: `attendanceIsOverdue` → AdminIssue kind `missing_attendance`
  (`missingBookingAttendanceIssueIdentity`).

A third visual state "Not recorded" is mandatory. Never grey out a booking as "Absent" just because time
passed. For a group lesson, 1 present + 2 unrecorded means `completed` but the card must still show two
"Not recorded" rows plus an open-issue badge — do not silently fill them in.

### 4.3 Course day attendance

`Attendance` with `subjectKind: 'course_enrollment'` + `/courses/{courseId}/days/{courseDayId}`.
`packages/shared-domain/src/canonical/courseEnrollmentAttendancePolicy.ts`,
`packages/shared-domain/src/canonical/readModels/courseAttendanceReadModel.ts`,
`functions/src/canonical/courses/`.

- `record_course_day_attendance` (instructor) targets a course day; attendance is per Participant per course day.
- `CourseEnrollmentAttendanceSummary = { recordedDayCount, presentDayCount, absentDayCount, projectionRevision }`.
- `courseProgressPresentation` derives lifecycle + progress; the CourseEnrollment stays `confirmed`
  while evidence is incomplete.
- `missing_attendance` AdminIssues are raised per course enrollment.

Progress is a ratio of **recorded** days, never of total scheduled days — show "x of y days recorded" plus
a separate progress bar so a partially-attended course is not displayed as 0%.

### 4.4 AdminIssue escalation inbox

`AdminIssue` (`/admin_issues/{adminIssueId}`).
`packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:897-917`,
`packages/shared-domain/src/canonical/adminIssuePolicy.ts`,
`packages/shared-domain/src/canonical/bookingAttendancePolicy.ts:274-286`,
`packages/shared-domain/src/canonical/readModels/adminIssueReadModel.ts`,
`packages/shared-domain/src/canonical/readModels/adminIssueInboxProjection.ts`.

Statuses: `open`, `resolved`, `dismissed`.
Kinds (7): `missing_attendance`, `payment_required_at_start`, `unresolved_pending_cancellation`,
`attendance_payment_conflict`, `resource_reconciliation_mismatch`, `financial_reconciliation_mismatch`,
`outcome_correction_required`.
Severities (3): `normal`, `urgent`, `critical`.

- `open → resolved` (admin action); `open → dismissed` **requires** a reason (*"reason is required"*).
- Dedupe: `ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION 'issue:v1'` + `kind` + `subjectKind` + `subjectId` +
  `occurrenceId` (+ `participantId`) → one issue per fact.
- `hasOpenOutcomeBlockingAdminIssue`: an open issue with `blocksOutcome` and kind in
  `{payment_required_at_start, unresolved_pending_cancellation, attendance_payment_conflict, outcome_correction_required}`
  **blocks** outcome resolution.

The inbox is severity-sorted; each of 7 kinds needs its own icon + remediation action. Issues carry
`blocksOutcome` — visually distinguish "advisory" from "this booking is frozen". Dismissal requires a typed
reason.

---

## 5. Progress & skills

`ParticipantProgress` (`/participant_progress/{participantId}`).
`packages/shared-domain/src/canonical/participantProgress.ts`,
`packages/shared-domain/src/canonical/participantProgressAccessPolicy.ts`,
`packages/shared-domain/src/canonical/readModels/participantProgressReadModel.ts`,
`firestore.rules:438-440,523-525`.

- `update_participant_progress` (instructor capability) writes the canonical progress aggregate.
- Reads go through `queryParticipantProgressReadModels` under `participantProgressAccessPolicy`:
  self, parent_guardian, or instructor-with-relationship.
- Legacy progress fields (`level`, `skillScores`, `skillComments`, `hideProgressTracking`,
  `todaySkillItemIds`, `completedTodayTaskIds`) still live on `/users` but `firestore.rules:438-440`
  marks them read-only legacy and non-authoritative.

The **Today checklist** (`customTodayTasks`, `todaySkillItemIds`, `completedTodayTaskIds`,
`dismissedTodayTaskIds`, `completedTodayDate`) is still a **client-writable** `/users` field
(`firestore.rules:447-462` allows exactly these keys). It is the one progress surface the client owns
directly — keep it, but do not treat it as canonical skill assessment.

---

## 6. Courses

### 6.1 Course lifecycle

`Course` (`/courses/{courseId}`) —
`packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:162-163`,
`packages/shared-domain/src/canonical/courseDayScheduling.ts`,
`packages/shared-domain/src/canonical/courseCatalogContent.ts`,
`packages/shared-domain/src/canonical/paths.ts:279-282`, `firestore.rules:626`.

`COURSE_LIFECYCLE_STATUSES = ['active', 'archived']`; `archive_course` / `reactivate_course`.

- Bilingual catalog content lives in a **separate collection**: `change_course_title`, `change_course_price`,
  `change_course_capacity`, `update_course_catalog_content`.
- Course days are a **subcollection**: `/courses/{courseId}/days/{courseDayId}` (`canonicalPaths.courseDay`).
- Course-day ops: `create_course_day`, `reschedule_course_day`, `remove_course_day`,
  `reassign_course_day_instructor`.
- Legacy Course docs carry `isHidden` and `availableSeats`; canonical capacity is enforced via
  `active_course_enrollment_guards`. **`isHidden` is NOT the canonical archive flag.**

Archived courses must disappear from the public catalog but stay readable in the admin archive with their
enrollments intact. Course days are a first-class schedule, not a text field.

### 6.2 CourseEnrollment lifecycle (participant-scoped)

`CourseEnrollment` (`/course_enrollments/{courseEnrollmentId}`) —
`packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:285-353`,
`packages/shared-domain/src/canonical/courseEnrollmentCancellationPolicy.ts:23-59`,
`packages/shared-domain/src/canonical/courseEnrollmentCreation.ts`,
`packages/shared-domain/src/canonical/courseEnrollmentReconciliationPolicy.ts`.

**Seven states** — one more than the Booking's six; the extra one is `withdrawn`:

| State | Note |
|---|---|
| `pending` | |
| `confirmed` | |
| `pending_cancellation` | |
| `cancelled` | carries a reasonCode |
| `withdrawn` | distinct from `cancelled`; carries `withdrawnAt`, **no** reasonCode |
| `completed` | terminal |
| `no_show` | terminal |

Terminal set = `cancelled` | `withdrawn` | `completed` | `no_show`.

- `create_course_enrollments` (admin bulk) / guest transport (`guestCourseEnrollmentTransport`)
  → `pending` or `confirmed`.
- `request_course_enrollment_cancellation` (client): **≥ 7 d** → direct cancel; **≥ 2 d** → pending request;
  **< 2 d** → later tier (`COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS`, `COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS`).
- `resolve_course_enrollment_cancellation` (admin); `withdraw_course_enrollment` (self-service exit)
  → `withdrawn`.
- `transfer_course_enrollment` moves a seat between Participants.
- `reconcile_course_enrollment` repairs drift (refuses when `isTerminalCourseEnrollmentLifecycle`).
- `link_guest_course_enrollment_to_account` / `..._as_administrator`.

Cancellation reason codes (6): `reservation_expired`, `guest_cancelled`, `account_owner_cancelled`,
`administrator_cancelled`, `incomplete_payment`, `system_expired`.

Two hard UI rules: the booking status chip component cannot be reused without adding `withdrawn`, and the
course deadline copy must **not** reuse the booking's single-24h wording — courses use 7d/2d tiers.

---

## 7. Reviews, achievements, certificates

### 7.1 InstructorReview (instructor → participant)

`InstructorReview` (`/instructor_reviews/{reviewId}`) —
`packages/shared-domain/src/canonical/instructorReview.ts`,
`packages/shared-domain/src/canonical/readModels/instructorReviewReadModel.ts`,
`functions/src/canonical/reviews/instructorReviewCommands.ts`, `firestore.rules:515-521`.

- `create_instructor_review` (instructor capability; requires an instructor↔participant relationship).
- Aggregates roll up to `/instructor_rating_summaries/{instructorId}`.
- Reads: `queryInstructorReviewReadModels`; public aggregates via `queryPublicInstructorRatingSummaries`;
  account-scoped via `queryAccountInstructorReviewReadModels`.
- Participant-side gate: `participantLessonFeedbackAccessPolicy` / `instructorReview.ts`.

Reviews are **public in aggregate** (`instructor_rating_summaries` are readable) while the underlying
`instructor_reviews` collection is rules-denied. The instructor card shows a rating summary (aggregate
only); the review body is visible only to authorized scopes.

### 7.2 Lesson feedback / recommendations (instructor homework)

`ParticipantLessonFeedback` (`/participant_lesson_feedback/{feedbackId}`) —
`packages/shared-domain/src/canonical/participantLessonFeedback.ts`,
`participantLessonFeedbackAccessPolicy.ts`,
`packages/shared-domain/src/canonical/readModels/participantLessonFeedbackReadModel.ts`,
`firestore.rules:531-533`.

States: `assigned`, `item_completed`.

- `save_participant_lesson_feedback` (instructor) writes the feedback + items.
- `set_participant_lesson_feedback_item_completion` (participant, self) ticks an individual item.
- Separate idempotency: `participantLessonFeedbackCommandIdempotency`, `participantAchievementCommandIdempotency`.
- Access via `participantLessonFeedbackAccessPolicy`; `participantLessonStatsSemantics` defines what counts.

The **participant** ticks items — the cabinet checklist is writable by the learner, the lesson report is
read-only. Do not merge the instructor's authoring view with the student's completion view.

### 7.3 Achievements

`ParticipantAchievements` (`/participant_achievements/{participantId}`) —
`packages/shared-domain/src/canonical/participantAchievements.ts`,
`src/domain/achievements/canonicalAchievementEvaluation.ts`,
`src/domain/achievements/trainingStreak.ts`, `firestore.rules:527-529`.

- `record_participant_achievements` (system/instructor) writes achievement state.
- Evaluation is deterministic (`canonicalAchievementEvaluation` + `trainingStreak`).
- Reads: `queryParticipantAchievementsReadModels` / `queryManagedParticipantAchievementsReadModels`.

Achievements are a **per-Participant** badge wall and must render inside the person switcher, not the account
header — two participants in one family each need their own wall.

### 7.4 Certificate — NOT IMPLEMENTED

There is **no** Certificate model, command, collection, or storage path:
`packages/shared-domain/src/canonical/paths.ts:102-138` (`CANONICAL_COLLECTIONS` has no certificate entry)
and `packages/shared-domain/src/canonical/commands/commandKinds.ts` (no certificate command kind).

Do not design a certificate screen against current code. Closest canonical substitutes are
`ParticipantAchievements` and the `completed` CourseEnrollment lifecycle. If the redesign shows certificates,
flag it as **NEW BUILD**, not a migration.

---

## 8. Commands & read models

### 8.1 Transport

Two command callables — `executeCanonicalCommand` (authenticated) and `executeGuestCanonicalCommand` (guest) —
plus 24 read-model callables.
`src/lib/canonical/canonicalCommandClient.ts:16-19`,
`packages/shared-domain/src/canonical/commands/commandKinds.ts`, `capabilities.ts`, `authorization.ts`,
`functions/src/canonical/commands/canonicalCommands.ts`.

- Every mutation is wrapped in a `CommandEnvelope { kind, intent, context, idempotencyKey, correlationId }`.
- `correlationId` is auto-generated per submission (`correlation_<uuid>`); `causationId` links a follow-up
  to its predecessor; `expectedRevision` provides optimistic concurrency (`expectedRevision` / `bookingRevision`).
- `exercisedCapability` ∈ `account_owner` | `parent_guardian` | `instructor` | `administrator` (account
  actors), or `guest` | `system` | `provider_callback`.
- `systemActorCannotMasqueradeAsAdministrator` — a system actor claiming `administrator` is `forbidden`.
- The client may declare only a **subset**: `ClientCallableCapability` = `account_owner` | `parent_guardian` |
  `instructor`; `administratorContext` is a separate boolean.
- `requestedTestSessionId` switches execution into the isolated test data scope; omitting it means **LIVE**.

**There are no generic setters.** `setStatus`, `updateStatus`, `patchBooking`, `adjustWallet`,
`changeBalance`, `setCapacity`, `transitionTo`, `update_course` are explicitly forbidden
(`FORBIDDEN_GENERIC_COMMAND_KINDS`). Every button in a redesign must map to exactly one named command
kind, and optimistic UI must carry `correlationId` + `idempotencyKey` so retries are safe.

### 8.2 Authorization matrix

`packages/shared-domain/src/canonical/commands/capabilities.ts` and `authorization.ts`,
`packages/shared-domain/src/canonical/identityAdministration.ts:21-22`,
`packages/shared-domain/src/canonical/bookingOccurrenceProposalChange.ts:225-252`.

- `ACTOR_CAPABILITY_MATRIX`: `account` → `[account_owner, parent_guardian, administrator, instructor]`;
  `guest` → `[guest]`; `system` → `[system]`; `provider` → `[provider_callback]`.
- `evaluateCommandContextAuthorization` first checks `isSourceCompatibleWithActorKind(context.source, actor.kind)`,
  then the actor/capability pairing.
- A Booking's own actors are constrained by attribution: `bookingOrigin 'guest'` requires a guest `bookedBy`
  actor; `'account'` / `'instructor'` require an Account actor; `'admin'` may be either.
- Canonical `AccountRole` is only `['user', 'admin']` (`ACCOUNT_ROLES`). **Instructor is not a role** — it is
  a separate `/instructors` catalog entity plus an `instructor` capability.

Route guards must not branch on `role === 'instructor'`. Branch on `(role === 'admin') || (isInstructor)`.
Legacy `UserProfile.systemRole === 'owner'` is a separate super-admin concept and must remain visually
distinct from plain admin.

### 8.3 Canonical role model vs legacy profile

`UserProfile` (`/users/{accountId}`) vs canonical Account —
`src/types/user.ts:32-71`, `firestore.rules:441-476`,
`packages/shared-domain/src/canonical/accountParticipantAccess.ts:96-130`,
`src/lib/i18n/translations.ts:25-26`.

- Canonical: `AccountLifecycle` `active` | `disabled`; role `['user','admin']`; instructor is `/instructors`
  catalog membership, not a role.
- Legacy projection fields still on `/users`: `isInstructor`, `instructorId`, `level`, `skillScores`,
  `skillComments`, `balanceUSD`, `walletBalances`, `pendingWalletCredit`, `lastRefundBookingId`.
- `firestore.rules:447-462` permits client updates to **only** (11 keys): `displayName`, `avatarUrl`,
  `hideProgressTracking`, `hasCompletedOnboarding`, `todaySkillItemIds`, `completedTodayTaskIds`,
  `completedTodayDate`, `customTodayTasks`, `dismissedTodayTaskIds`, `dismissedReviewIds`.
- `canonicalAccountAuthorityFieldsUnchanged()` + `authoritativeMoneyFieldsUnchanged()` guard the `/users`
  update path.
- The Navbar reads a role-derived label ('Manager' / 'Skier' — `src/lib/i18n/translations.ts:25-26`).

The client-writable field list is the **hard ceiling** on any profile/settings screen: only those 11 keys can
be saved from the browser. Everything else (dependent name edits, progress, money) must go through a canonical
command. A profile form that writes `skillScores` or `balance` will be rejected by Firestore rules.

---

## 9. Canonical status enum table (exact strings)

| # | Enum / field | Exact values | File |
|---|---|---|---|
| 1 | `BookingLifecycleSchema.status` | `pending`, `confirmed`, `pending_cancellation`, `cancelled`, `completed`, `no_show` | `packages/shared-domain/src/canonical/bookingOccurrenceProposalChange.ts` |
| 2 | Booking cancellation outcome | `direct_cancel`, `pending_request`, `after_start_rejected` | `packages/shared-domain/src/canonical/bookingCancellationPolicy.ts` |
| 3 | Reschedule outcome | `allowed`, `inside_window_rejected`, `after_start_rejected` | `packages/shared-domain/src/canonical/bookingReschedulePolicy.ts` |
| 4 | `Booking.party.kind` | `individual`, `family_group` | `packages/shared-domain/src/canonical/bookingPartyPolicy.ts` |
| 5 | LessonPricingSettings availability | `configured`, `not_configured` | `packages/shared-domain/src/canonical/lessonPricingSettings.ts` |
| 6 | Party-change outcome | `allowed`, `inside_window_rejected`, `after_start_rejected` | `packages/shared-domain/src/canonical/bookingPartyPolicy.ts` |
| 7 | `IncrementalRequirement.state` | `active`, `fully_funded`, `rolled_back` | `packages/shared-domain/src/canonical/bookingPartyFinance.ts` |
| 8 | Guest reservation state | `pending (held)`, `confirmed`, `expired` | `packages/shared-domain/src/canonical/guestBooking.ts` |
| 9 | `BookingProposal.status` | `open`, `accepted`, `declined`, `expired`, `unavailable`, `cancelled` | `packages/shared-domain/src/canonical/bookingProposalPolicy.ts` |
| 10 | Proposal cancellation reason | `instructor_withdrawn`, `instructor_blocked_by_owner` | `packages/shared-domain/src/canonical/bookingProposalPolicy.ts` |
| 11 | `BookingChangeRequest.status` | `open`, `resolved`, `cancelled` | `packages/shared-domain/src/canonical/bookingChangeRequestPolicy.ts` |
| 12 | Change request `requestType` | `instructor_unavailable` (single literal) | `packages/shared-domain/src/canonical/bookingChangeRequestPolicy.ts` |
| 13 | Change request `resolution` | `rescheduled`, `booking_cancelled`, `no_change` | `packages/shared-domain/src/canonical/bookingChangeRequestPolicy.ts` |
| 14 | `Participant.lifecycle` | `active`, `archived` | `packages/shared-domain/src/canonical/accountParticipantAccess.ts` |
| 15 | `Participant.identityClassification` | `self`, `dependent`, `unmanaged_guest` | `packages/shared-domain/src/canonical/readModels/adminIdentityReadModel.ts` |
| 16 | `Participant.management.kind` | `unmanaged_guest`, `managed` | `packages/shared-domain/src/canonical/participantAccess/` |
| 17 | `ParticipantManagement.status` | `active`, `ended` | `packages/shared-domain/src/canonical/participantAccess/` |
| 18 | `ParticipantManagement.authority` | `self`, `parent_guardian` | `packages/shared-domain/src/canonical/participantAccess/` |
| 19 | `ParticipantManagement.role` | `owner` (single literal) | `packages/shared-domain/src/canonical/participantAccess/` |
| 20 | `Account.lifecycle` | `active`, `disabled` | `packages/shared-domain/src/canonical/accountParticipantAccess.ts` |
| 21 | Admin identity projection state | `active`, `disabled`, `uninitialized` | `packages/shared-domain/src/canonical/readModels/adminIdentityReadModel.ts:54` |
| 22 | `InstructorRelationship.status` | `active`, `revoked`, `expired` | `packages/shared-domain/src/canonical/accountParticipantAccess.ts` |
| 23 | Relationship basis kind | `confirmed_booking`, `confirmed_course_enrollment`, `administration_assignment`, `guardian_permission` | `packages/shared-domain/src/canonical/accountParticipantAccess.ts` |
| 24 | Instructor participant access scope | `relationship`, `booking_scoped` | `packages/shared-domain/src/canonical/readModels/participantInstructorAccessReadModel.ts` |
| 25 | `MonetaryEvent.kind` | `wallet_credit`, `wallet_adjustment`, `booking_charge`, `course_charge`, `external_payment`, `manual_payment`, `refund_to_wallet`, `manual_external_refund`, `admin_price_adjustment`, `write_off`, `correction` | `packages/shared-domain/src/canonical/paymentWallet.ts` |
| 26 | Monetary `sourceKind` | `provider`, `cash`, `bank_transfer`, `manual_external` | `packages/shared-domain/src/canonical/paymentWallet.ts` |
| 27 | Refund `destinationKind` | `wallet`, `manual_external` | `packages/shared-domain/src/canonical/paymentWallet.ts` |
| 28 | `Payment.status` | `unpaid`, `partially_paid`, `paid`, `refunded`, `partially_refunded` | `packages/shared-domain/src/canonical/paymentWallet.ts:51-139` |
| 29 | `Payment.subject.subjectType` | `booking`, `course_enrollment` | `packages/shared-domain/src/canonical/paymentWallet.ts` |
| 30 | Idempotency record outcome | `completed`, `rejected` | `packages/shared-domain/src/canonical/commandIdempotency.ts` |
| 31 | `Attendance.status` | `present`, `absent` (+ `missing_attendance` outcome / *not recorded*) | `packages/shared-domain/src/canonical/bookingAttendancePolicy.ts` |
| 32 | Attendance window phase | `before_start`, `in_window`, `after_instructor_window` | `packages/shared-domain/src/canonical/bookingAttendancePolicy.ts` |
| 33 | Booking attendance outcome | `completed`, `no_show`, `missing_attendance` | `packages/shared-domain/src/canonical/bookingAttendancePolicy.ts` |
| 34 | `AdminIssue.status` | `open`, `resolved`, `dismissed` | `packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:897-917` |
| 35 | `ADMIN_ISSUE_KINDS` | `missing_attendance`, `payment_required_at_start`, `unresolved_pending_cancellation`, `attendance_payment_conflict`, `resource_reconciliation_mismatch`, `financial_reconciliation_mismatch`, `outcome_correction_required` | `packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:897-917` |
| 36 | `ADMIN_ISSUE_SEVERITIES` | `normal`, `urgent`, `critical` | same |
| 37 | Blocking issue kinds (subset of #35) | `payment_required_at_start`, `unresolved_pending_cancellation`, `attendance_payment_conflict`, `outcome_correction_required` | `packages/shared-domain/src/canonical/adminIssuePolicy.ts` |
| 38 | `COURSE_LIFECYCLE_STATUSES` | `active`, `archived` | `packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:162-163` |
| 39 | `CourseEnrollment.lifecycle.status` | `pending`, `confirmed`, `pending_cancellation`, `cancelled`, `withdrawn`, `completed`, `no_show` | `packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:285-353` |
| 40 | `COURSE_ENROLLMENT_CANCELLATION_REASON_CODES` | `reservation_expired`, `guest_cancelled`, `account_owner_cancelled`, `administrator_cancelled`, `incomplete_payment`, `system_expired` | `packages/shared-domain/src/canonical/courseEnrollmentCancellationPolicy.ts:23-59` |
| 41 | `ParticipantLessonFeedback` item state | `assigned`, `item_completed` | `packages/shared-domain/src/canonical/participantLessonFeedback.ts` |
| 42 | `AccountRole` (`ACCOUNT_ROLES`) | `user`, `admin` | `packages/shared-domain/src/canonical/identityAdministration.ts:21-22` |
| 43 | Actor kind | `account`, `guest`, `system`, `provider` | `packages/shared-domain/src/canonical/commands/capabilities.ts` |
| 44 | `exercisedCapability` | `account_owner`, `parent_guardian`, `instructor`, `administrator`, `guest`, `system`, `provider_callback` | `packages/shared-domain/src/canonical/commands/capabilities.ts` |
| 45 | `ClientCallableCapability` (client-declarable subset) | `account_owner`, `parent_guardian`, `instructor` | `packages/shared-domain/src/canonical/commands/capabilities.ts` |
| 46 | Authorization verdict | `authorized`, `forbidden`, `unauthorized` | `packages/shared-domain/src/canonical/commands/authorization.ts` |
| 47 | `bookingOrigin` | `guest`, `account`, `instructor`, `admin` | `packages/shared-domain/src/canonical/bookingOccurrenceProposalChange.ts:225-252` |
| 48 | Guest participant `discipline` | `ski`, `snowboard` | `packages/shared-domain/src/canonical/guestBooking.ts` |
| 49 | Guest booking expiry reasonCode | `reservation_expired` | `packages/shared-domain/src/canonical/guestBooking.ts` |
| 50 | Legacy wallet ledger type (projection only) | `top_up`, `starter_credit`, `lesson_payment`, `course_payment`, `refund`, `admin_adjustment`, `guest_payment` | `src/domain/wallet/walletLedger.ts`, `src/types/user.ts:6-30` |
| 51 | Legacy `WalletCurrency` (USD is legacy) | `USD`, `KZT` | `src/types/user.ts:6-30` |
| 52 | Pricing strategy version | `lesson_party:v1` | `packages/shared-domain/src/canonical/bookingOccurrenceProposalChange.ts` |
| 53 | Legacy profile `systemRole` | `owner` (optional, legacy only) | `src/types/user.ts:32-71` |

### 9.1 Forbidden generic command kinds

`FORBIDDEN_GENERIC_COMMAND_KINDS` — `packages/shared-domain/src/canonical/commands/commandKinds.ts`:
`setStatus`, `updateStatus`, `patchBooking`, `adjustWallet`, `changeBalance`, `setCapacity`,
`transitionTo`, `update_course`.

---

## 10. Top design constraints (one page)

1. **One Booking per lesson, not per person.** A party booking is one card with an avatar stack, one
   reservation, one payment. Never fan out to N bookings.
2. **Participant ≠ Account.** Identity, avatar, progress, attendance, achievements are person-scoped;
   login is account-scoped. Build a person switcher.
3. **The server owns status.** Six booking states, seven course-enrollment states, five payment statuses —
   none of them are computable client-side. `FORBIDDEN_GENERIC_COMMAND_KINDS` means every button maps to one
   named command.
4. **Missing attendance is UNKNOWN.** Never render "Absent" by default; a "Not recorded" third state is
   mandatory, with an open AdminIssue behind it.
5. **Money is read-only in the client, KZT-only, minor units.** Server returns `refundDelta` +
   `writeOffDelta`; never compute a balance or a refund locally.
6. **The 24h window governs cancel/reschedule/party-change** for bookings (cancel and reschedule are also
   one-shot); courses use 7d/2d tiers. Deadlines must be shown as live countdowns.
7. **Partial payment is first class** (`partially_paid` + `outstandingAmount`), and payment presentation is a
   `{kind:'visible'} | {kind:'withheld'}` union that the UI must branch on.
8. **Idempotency keys on every mutation**, stable across retries of the same intent, and retryable errors
   must not be cached.
9. **`pending_cancellation` and `withdrawn` are distinct user-visible states** and cannot be folded into
   `cancelled`.
10. **No certificates exist** — any certificate UI is NEW BUILD.