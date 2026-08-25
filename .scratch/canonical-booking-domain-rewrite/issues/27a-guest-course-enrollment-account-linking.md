# T27A: Guest CourseEnrollment account linking

**Phase:** 4 — Course vertical slice  
**Status:** ready-for-agent

## What to build

Deliver the missing canonical **backend** command that links a guest-origin `CourseEnrollment` to an authenticated `Account` and an **explicitly selected** managed `Participant`, without name matching, provenance rewriting, or payer-based authority inference.

This ticket closes the backend contract gap between T23 guest enrollment creation and T31 guest Course UX.

T27A also owns the minimal T23 guest-creation extensions required for durable guest identity and link credentials (T23 is complete; these are additive corrections owned by this ticket).

## Scope

- Extend T23 guest `create_course_enrollments` to bind deterministic `GuestSubjectId`, persist immutable guest attribution, and issue enrollment-scoped link credentials.
- Extend T15 `guestCredential.ts` with a discriminated CourseEnrollment link payload (no parallel signing system).
- Add `guestSubjectIdFromCourseEnrollmentId` and `CourseEnrollment.guestAccountLink` durable link state.
- Add exactly one new command: `link_guest_course_enrollment_to_account`.
- Atomic Participant association, ParticipantManagement establishment/verification, active enrollment guard migration, and Participant CourseDay claim swap when `participantId` changes.
- Set `Payment.payerAccountId` to the linking Account on successful first link (financial association authority).
- Revision, idempotency, transaction-budget enforcement, Activity Log, and outbox staging.
- Unit and real Firestore Emulator coverage including concurrency matrix.

## Out of scope

- Frontend / T31 UX.
- Name, email, phone, or surname matching.
- Automatic Participant selection or deduplication.
- Guest Wallet creation.
- Generic enrollment patch/update commands.
- Admin silent relink override (separate AdminIssue/correction ticket if ever needed).
- Course Attendance, outcomes, reconciliation, scheduler adapters, Firestore Rules, production migration/import.
- Nested authoritative command calls inside the link transaction (compose pure planning primitives only).

## Authoritative references

- ADR-0001 — CourseEnrollment / Participant / Payment topology; immutable origin vs current authority; optional `CourseEnrollment.payerAccountId` exists but is not refund-routing authority.
- ADR-0002 — commands, guards, atomic planning, revisions, idempotency, errors, transaction budgets.
- ADR-0003 — Payment as numeric authority; `Payment.payerAccountId` as current financial association; guest refund destination rules.
- ADR-0004 — Attendance/outcome boundaries (no Attendance work here).
- ADR-0005 — Activity Log / outbox durability.
- `CONTEXT.md` — guest reservation/linking policy, active resource states (`pending`, `confirmed`, `pending_cancellation`), provenance immutability, refund destination after linking.
- `docs/specs/canonical-booking-domain-rewrite.md` — Phase 4 guest Course reservation/linking delivery checklist; clean reset/cutover.
- T15 — guest Booking reservation/linking (promote-guest ParticipantManagement compose pattern).
- T23 — atomic CourseEnrollment creation.
- T24 — CourseEnrollment lifecycle / cancellation / withdrawal / capacity freeze / guest expiry.
- T11 — ParticipantManagement (`create_participant`, `assign_participant_management` intent shapes and management semantics).
- T09 — resource claims / guards.
- T12 — Payment / Wallet / MonetaryEvent.
- T10 — audit / outbox.

## Problem statement

T23 creates guest CourseEnrollments using:

```
guest actor
+ unmanaged_guest Participant (on Enrollment.participantId)
+ pending or confirmed guest-origin CourseEnrollment
```

but there is **no** dedicated backend command to later associate that guest reservation with:

```
authenticated Account
+ explicit Participant choice
+ current ParticipantManagement authority
+ signed guest link proof
```

Without T27A, T31 would be forced to guess identity associations and could introduce forbidden behaviors (name matching, payer inference, provenance rewrite).

## Core canonical flow

```
Guest CourseEnrollment (attribution.bookingOrigin = 'guest')
        ↓
deterministic GuestSubjectId + signed scoped link credential (issued at guest create)
        ↓
authenticated Account (client_callable)
        ↓
link_guest_course_enrollment_to_account
        ↓
explicit discriminated participantTarget
        ↓
Enrollment managed via ParticipantManagement; guestAccountLink + Payment.payerAccountId updated; historical attribution immutable
```

---

## Command catalog (T06)

Add exactly one new command kind (closed catalog):

### `link_guest_course_enrollment_to_account`

#### Final command intent shape (`commandIntents.ts`)

Reuse the existing `participantAgeIntent` discriminated union from `create_participant` (do not invent a second age/profile contract).

```typescript
const linkGuestCourseEnrollmentParticipantTargetIntent = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('existing_managed'),
      participantId: ParticipantIdSchema,
    })
    .strict(),
  z.object({ kind: z.literal('promote_guest') }).strict(),
  z
    .object({
      kind: z.literal('create_managed'),
      participantId: ParticipantIdSchema,
      displayName: z.string().trim().min(1).max(200),
      age: participantAgeIntent,
      skillLevel: z.string().trim().min(1).max(64),
      discipline: z.enum(['ski', 'snowboard']),
      instructorComment: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
]);

link_guest_course_enrollment_to_account: z
  .object({
    enrollmentId: CourseEnrollmentIdSchema,
    guestLinkCredential: z
      .object({
        nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
        signature: z.string().regex(/^[0-9a-fA-F]{64}$/),
      })
      .strict(),
    participantTarget: linkGuestCourseEnrollmentParticipantTargetIntent,
  })
  .strict();
```

**Mutual exclusivity is enforced by the discriminated union.** The server never infers the target path from optional combinations.

| `participantTarget.kind` | Required intent fields | Meaning |
| --- | --- | --- |
| `existing_managed` | `participantId` (must differ from current guest `enrollment.participantId`) | Link to a Participant already managed by the authenticated Account. |
| `promote_guest` | none | Promote the Enrollment's current `unmanaged_guest` Participant in place under the linking Account. |
| `create_managed` | `participantId` + full `create_participant` profile fields | Create a new managed Participant under the linking Account and associate the Enrollment to it in the same transaction. |

#### Context requirements

- `source: 'client_callable'`
- `exercisedCapability`: `account_owner` or `parent_guardian`
- `actor`: authenticated `Account`
- `expectedRevision`: `CourseEnrollment.revision` (required)
- When `participantTarget.kind === 'existing_managed'`: `expectedRevision` on the target Participant's active `ParticipantManagement` document (required)

#### Participant target path rules

**Path A — `existing_managed`**

- `participantTarget.participantId` must not equal current `enrollment.participantId`.
- Target Participant must exist, be `lifecycle.status = 'active'`, and have `management.kind = 'managed'`.
- Active `ParticipantManagement` for `(accountId = actor.accountId, participantId = target)` must exist with `status = 'active'`.
- `exercisedCapability` must match management authority (`account_owner` ↔ `authority = 'self'`, `parent_guardian` ↔ `authority = 'parent_guardian'`).
- Atomically migrate Enrollment `participantId`, Participant CourseDay claims, and active Participant+Course guard from guest Participant to target Participant.

**Path B — `promote_guest`**

- Current `enrollment.participantId` Participant must exist and have `management.kind = 'unmanaged_guest'`.
- Compose the same Participant promotion primitive used by T15 `link_guest_booking_to_account`:
  - deterministic `participantManagementIdFromGuestLink({ participantId, accountId })`
  - create or reactivate `ParticipantManagement` under linking Account
  - update Participant `management` from `unmanaged_guest` → `managed`
  - clear `initialManagementEligibleAccountId` when present
  - acquire `participantManagementActiveOwnerGuard`
- `enrollment.participantId` does **not** change.
- No Participant CourseDay claim migration and no active enrollment guard key change.

**Path C — `create_managed`**

- **One-step, same authoritative transaction** (not a prior `create_participant` command).
- Reuse the exact `create_participant` profile field contract inside `participantTarget`; do not add a parallel payload type.
- `participantTarget.participantId` must not exist yet and must not equal current guest `enrollment.participantId`.
- In the same transaction as the link, compose:
  1. create Participant document with `management.kind = 'managed'` (not `unmanaged_guest`)
  2. create `ParticipantManagement` via `participantManagementIdFromGuestLink`
  3. acquire `participantManagementActiveOwnerGuard`
  4. migrate Enrollment `participantId`, Participant CourseDay claims, and active enrollment guard from guest Participant to the new Participant
- The prior guest `unmanaged_guest` Participant document remains unchanged (orphaned identity); it is not deleted and is not auto-promoted.

**Hard rule:** duplicate display names never imply selection. Two managed Participants both named "Alex Smith" require explicit `participantId` in `existing_managed` or a new `participantId` in `create_managed`.

**Do not** add generic `update_course_enrollment` / patch commands.

---

## Create-new Participant: one-step vs two-step

**Decision: one-step, same authoritative transaction.**

Existing architecture never nests authoritative commands. T15 `link_guest_booking_to_account` composes ParticipantManagement + Participant promotion primitives in one transaction. T27A `create_managed` follows that pattern: compose Participant create + ParticipantManagement + link side effects atomically.

`create_participant` as a standalone command always creates `unmanaged_guest` and is the wrong terminal state for a link target. Requiring a prior `create_participant` would force an extra command and an invalid intermediate state. **Two-step create-then-link is forbidden.**

---

## T27A-owned T23 guest creation extensions

T27A owns these additive changes to the T23 guest `create_course_enrollments` path:

1. **`guestSubjectIdFromCourseEnrollmentId(enrollmentId)`** in `deterministicIdentity.ts`:
   - hash inputs: `guest_subject:v1`, `course_enrollment`, `enrollmentId`
   - parallel to `guestSubjectIdFromBookingId`

2. **Persist immutable guest attribution on every guest Enrollment** using the shared `ImmutableBookingAttributionSchema` (same field names as Booking and account/admin CourseEnrollments):
   ```typescript
   attribution: {
     bookingOrigin: 'guest',
     bookedBy: { kind: 'guest', guestSubjectId: guestSubjectIdFromCourseEnrollmentId(enrollmentId) },
   }
   ```
   - `guestSubjectId` is derived from `enrollmentId`; it is **never** caller-supplied and never derived from contact fields.

3. **Issue and return a scoped link credential per guest Enrollment** in the `create_course_enrollments` command result (guest mode only):
   ```typescript
   guestLinkCredentials: Array<{
     enrollmentId: CourseEnrollmentId;
     guestSubjectId: GuestSubjectId;
     nonce: string;
     signature: string;
     expiresAt: CanonicalTimestamp;
   }>
   ```
   - Also stage the matching outbox template delivery for admin confirmation flows when applicable.
   - Credential `expiresAt` = `course.scheduleProjection.finalCourseDayEndsAt` (link proof is invalid after the Course service interval ends).

4. **Do not** introduce a parallel guest identity collection or second HMAC implementation.

---

## Provenance field (verified against T23 schema)

CourseEnrollment uses `attribution: ImmutableBookingAttributionSchema` from `bookingOccurrenceProposalChange.ts`:

- `attribution.bookingOrigin` — immutable workflow origin (`'guest'` for guest enrollments)
- `attribution.bookedBy` — immutable `ActorRef`; for guest enrollments `{ kind: 'guest', guestSubjectId }`

This is the **same** `bookedBy` field name used across Booking and CourseEnrollment by design (shared attribution type), not Booking-specific naming copied by mistake.

**GuestSubjectId persistence location:** `CourseEnrollment.attribution.bookedBy.guestSubjectId` when `bookedBy.kind = 'guest'`. No separate top-level `guestSubjectId` field.

Linking never changes `attribution.bookingOrigin` or `attribution.bookedBy`. Linking updates current management association (`guestAccountLink`, ParticipantManagement) and financial association (`Payment.payerAccountId`).

---

## Signed guest link credential (extend T15, not a second system)

Extend `guestCredential.ts` with a **discriminated subject** payload. Smallest extension that preserves Booking compatibility:

```typescript
const GuestActionTokenPayloadSchema = z.discriminatedUnion('subjectKind', [
  z.object({
    version: z.literal(GUEST_ACTION_TOKEN_VERSION),
    subjectKind: z.literal('booking'),
    bookingId: BookingIdSchema,
    guestSubjectId: GuestSubjectIdSchema,
    purpose: z.literal('cancel_pending_reservation'),
    expiresAt: CanonicalTimestampSchema,
    nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  }).strict(),
  z.object({
    version: z.literal(GUEST_ACTION_TOKEN_VERSION),
    subjectKind: z.literal('course_enrollment'),
    enrollmentId: CourseEnrollmentIdSchema,
    guestSubjectId: GuestSubjectIdSchema,
    purpose: z.literal('link_guest_course_enrollment'),
    expiresAt: CanonicalTimestampSchema,
    nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  }).strict(),
]);
```

Add `'link_guest_course_enrollment'` to purpose registry constants.

**Verification rules (`verifyGuestActionToken` / `verifyGuestActionCredentialParts`):**

- `subjectKind = 'course_enrollment'`
- `purpose = 'link_guest_course_enrollment'`
- `enrollmentId` matches intent `enrollmentId`
- `guestSubjectId` matches `enrollment.attribution.bookedBy.guestSubjectId`
- signature valid and `now < expiresAt`
- Booking-scoped tokens must not authorize CourseEnrollment linking; Enrollment A token must not authorize Enrollment B.

Reuse existing `signGuestActionCredential` / HMAC-SHA256 primitives unchanged.

---

## Authorization

Required dual proof:

1. Authenticated Account with `exercisedCapability` matching target Participant management authority.
2. Valid guest link credential for `(enrollmentId, guestSubjectId)` verified from `intent.guestLinkCredential`.

Forbidden authority sources:

- `Payment.payerAccountId` alone
- `CourseEnrollment.payerAccountId` (even when present on account-created enrollments)
- payment history alone
- email / phone / name similarity
- unrelated Instructor relationship

---

## Durable link state (`CourseEnrollment.guestAccountLink`)

Add optional immutable link record to `CourseEnrollmentSchema`:

```typescript
guestAccountLink: z
  .object({
    linkedAccountId: AccountIdSchema,
    linkedParticipantId: ParticipantIdSchema,
    credentialNonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    linkedAt: CanonicalTimestampSchema,
  })
  .strict()
  .optional();
```

- Written once on first successful link; never updated on replay.
- `guestAccountLink` is the authoritative durable "already linked" marker (do not infer link state from Participant management alone).

### Already-linked behavior

| Condition | Outcome |
| --- | --- |
| `guestAccountLink` undefined; all validations pass | First link succeeds |
| `guestAccountLink` defined; exact idempotent replay (same Account, same `linkedParticipantId`, same `credentialNonce`, matching revisions) | Stable success; no duplicate mutations |
| `guestAccountLink` defined; different Account | `forbidden` |
| `guestAccountLink` defined; different `linkedParticipantId` | `forbidden` / `validation` conflict |
| Valid credential but `guestAccountLink` already set with different `credentialNonce` | `unauthorized` (credential consumed) |

---

## Linkable lifecycle states (exact table)

Authoritative active resource states (`CONTEXT.md`): `pending`, `confirmed`, `pending_cancellation`.

| `lifecycle.status` | Link on first execution | Idempotent replay of prior successful link | Notes |
| --- | --- | --- | --- |
| `pending` | **allowed** | **allowed** | Guest reservation; must not be past `reservationExpiresAt` at command time |
| `confirmed` | **allowed** | **allowed** | Post-admin confirmation |
| `pending_cancellation` | **allowed** | **allowed** | Active service holding resources |
| `cancelled` | **forbidden** | **forbidden** | Terminal; includes `reservation_expired`, `guest_cancelled`, etc. |
| `withdrawn` | **forbidden** | **forbidden** | Terminal; guest-origin cannot become `withdrawn` per schema consistency rules |
| `completed` | **forbidden** | **forbidden** | Terminal |
| `no_show` | **forbidden** | **forbidden** | Terminal |

Linking never resurrects a terminal service.

Additional first-link gate: current `enrollment.participantId` must reference a Participant with `management.kind = 'unmanaged_guest'` (not yet linked). After link, `guestAccountLink.linkedParticipantId` is the managed association regardless of path.

---

## Active Participant + Course guard (exact migration)

Guard document: `active_course_enrollment_guards/{activeCourseEnrollmentGuardKey(participantId, courseId)}` → `{ enrollmentId }`.

### When `participantId` changes (`existing_managed`, `create_managed`)

In one transaction, after target Participant conflict checks:

1. Read current guard at `activeCourseEnrollmentGuardKey(guestParticipantId, courseId)`; it must reference this `enrollmentId`.
2. Plan acquire guard at `activeCourseEnrollmentGuardKey(targetParticipantId, courseId)` for the same `enrollmentId`.
   - If target key already holds a different active `enrollmentId` → reject with `duplicate_active_enrollment`; **no merge**.
3. Plan release guard at `activeCourseEnrollmentGuardKey(guestParticipantId, courseId)`.
4. Update `CourseEnrollment.participantId` to `targetParticipantId`.

### When `participantId` unchanged (`promote_guest`)

- Active enrollment guard key is unchanged (`participantId` unchanged).
- Guard document continues to reference the same `enrollmentId`.
- Only ParticipantManagement / Participant management classification changes.

---

## Participant CourseDay claims (exact migration)

Guest Enrollment holds `participant_course_day_enrollment` claims with:

- `resourceId = participantId`
- `ownerKind = 'course_enrollment'`
- `ownerId = enrollmentId`

### When `participantId` changes (`existing_managed`, `create_managed`)

In the same transaction, in this order:

1. For each CourseDay: plan **acquire** target Participant `participant_course_day_enrollment` claim (`ownerId = enrollmentId`).
2. If **any** acquire fails with schedule conflict → abort entire transaction (`participant_conflict`); guest state unchanged.
3. For each CourseDay: plan **release** guest Participant `participant_course_day_enrollment` claims.
4. Proceed with guard migration and `participantId` update.

### When `participantId` unchanged (`promote_guest`)

- No Participant CourseDay claim acquire/release.
- Existing claims remain on the same `participantId` and same `ownerId = enrollmentId`.

**Never** change `enrollment.participantId` without completing claim migration when identities differ.

---

## Seat / capacity (exact rule)

`course_seat_pre_start` claim identity (`courseEnrollmentCreation.buildCourseSeatClaimIdentity`):

- `ownerKind = 'course_enrollment'`
- `ownerId = enrollmentId`

Because `enrollmentId` is immutable during linking:

- The seat claim **does not move**, **does not get released**, and **does not get reacquired**.
- `Course.capacity.availableSeats` is unchanged.
- No second seat is consumed.
- No seat claim owner-key update occurs.

Only Participant CourseDay claims and the active Participant+Course guard migrate when `participantId` changes.

---

## Payment / financial association (ADR-0003 authority)

**Authoritative financial routing field:** `Payment.payerAccountId` on the Payment referenced by `CourseEnrollment.paymentId`.

`CourseEnrollment.payerAccountId` exists in ADR-0001 topology for account/admin creation paths but is **not** a second financial authority. T24 cancellation/refund commands read **`Payment.payerAccountId` only** for Wallet vs external refund routing.

### On every successful first link

Always execute:

```
Payment.payerAccountId = linking Account.accountId
```

regardless of `participantTarget` path.

Do **not** set or update `CourseEnrollment.payerAccountId` during guest linking. Guest enrollments created before link have `CourseEnrollment.payerAccountId` absent; it remains absent after link.

### Never on link

- change `paidAmount`, `refundedAmount`, `retainedAmount`, `settledAmount`, `writtenOffAmount`, `outstandingAmount`, or `paymentStatus`
- fabricate Wallet debits/credits
- append or rewrite `MonetaryEvent` documents
- make external/manual guest payments appear Wallet-funded retroactively

### Refund consequences (deterministic, T24-facing)

| Situation | Refund routing authority | Behavior |
| --- | --- | --- |
| Guest Enrollment; `Payment.payerAccountId` absent at refund decision | `Payment.payerAccountId` absent | T24 uses attested `manual_external_refund`; no Wallet credit |
| Guest Enrollment linked before refund decision | `Payment.payerAccountId = linkedAccountId` | T24 uses `refund_to_wallet` to that Account Wallet |
| Refund already recorded before link | historical `MonetaryEvent` documents | **No retroactive redirect**; later refunds follow current `Payment.payerAccountId` |
| Account is `Payment.payerAccountId` but does not manage Participant | N/A | Link command still `forbidden` when management proof fails; payer alone grants no authority |

T24 must **not** use `attribution.bookingOrigin`, `attribution.bookedBy`, or `guestAccountLink` as refund-routing authority.

Explicit test: Account is `Payment.payerAccountId` but does not manage selected Participant → `forbidden`.

---

## Guest credential consumption (post-link security)

After first successful link:

1. Persist `guestAccountLink.credentialNonce` from the consumed credential.
2. Any subsequent link attempt with a **different** `guestLinkCredential.nonce` → `unauthorized`, even if the Participant is already managed.
3. Exact idempotent replay of the original successful command (same nonce, same target, same revisions) → success without duplicate side effects.

Credential consumption is **not** inferred from `participantId` or Participant `management.kind` alone; `guestAccountLink` is required.

---

## Atomic link transaction algorithm (all paths)

When any step fails, **no durable mutation** occurs to:

- Enrollment (except idempotent replay),
- guest Participant claims,
- active guard,
- Payment,
- seat/capacity,
- `guestAccountLink`.

**ONE transaction must execute these steps in order:**

1. Validate authenticated Account active.
2. Validate scoped guest link credential (`link_guest_course_enrollment`).
3. Validate Enrollment revision, `bookingOrigin = 'guest'`, linkable lifecycle state, and not past pending expiry when `pending`.
4. Validate `guestAccountLink` idempotency rules.
5. Validate current guest Participant is `unmanaged_guest`.
6. Resolve `participantTarget` path-specific ParticipantManagement proof.
7. When `participantId` changes: validate no `duplicate_active_enrollment` on target Participant+Course; acquire target CourseDay claims; release guest CourseDay claims; migrate active guard.
8. When `promote_guest`: promote Participant + create/reactivate ParticipantManagement + acquire owner guard (no claim/guard key migration).
9. When `create_managed`: create managed Participant + ParticipantManagement + owner guard; then step 7 migrations.
10. Update `CourseEnrollment.participantId` when required.
11. Write `guestAccountLink` on first link.
12. Set `Payment.payerAccountId = actor.accountId` on first link.
13. Activity Log + outbox via registered audit plan.
14. Idempotency record commit.

Seat/capacity unchanged throughout.

---

## Pre-T27A guest enrollments (clean reset policy)

Per ADR-0001 clean-cutover amendment and T37/T38/T40 reset tooling:

- **No production migration** reconstructs `GuestSubjectId` or issues retroactive link credentials.
- Transactional dev/test data is reset before cutover; legacy guest enrollments are discarded.
- **Only guest enrollments created after the T27A schema/command extension are linkable.**
- Guest enrollments created by pre-extension T23 code (ephemeral actor `guestSubjectId`, no link credential, no `guestAccountLink`) are **not linkable** and must be rejected with `validation` / `unsupported`.

Do not reconstruct `GuestSubjectId` from name, email, or phone.

---

## Idempotency / revisions

Use `executeAuthoritativeIdempotentCanonicalCommand`.

**Revision targets (minimum):**

- `CourseEnrollment.revision` (required expected)
- Target `Participant.revision` (all paths touching Participant)
- Target / created `ParticipantManagement.revision`
- `Payment.revision` on first link (`payerAccountId` change)
- Resource claim documents / guard buckets touched by swap
- `expectedParticipantManagementRevision` when `participantTarget.kind === 'existing_managed'`

Fingerprint mismatch → canonical idempotency conflict.

---

## Concurrency acceptance matrix (Firestore Emulator required)

| ID | Scenario | Required outcome |
| --- | --- | --- |
| A | Happy path — `existing_managed` | Association + claim swap + guard migration + `guestAccountLink` + `Payment.payerAccountId` + audit/idempotency; attribution unchanged; seat unchanged |
| B | Invalid / wrong-scope guest credential | No durable mutation |
| C | Account does not manage selected Participant | `forbidden`; no mutation |
| D | Duplicate-name ambiguity | No auto-selection; explicit `participantId` required |
| E | Target Participant Booking conflict | `participant_conflict`; guest state unchanged |
| F | Half-open adjacency | Adjacent Booking allowed; link succeeds |
| G | Target already has active Enrollment same Course | `duplicate_active_enrollment`; no merge |
| H | Two Accounts race same guest Enrollment | Exactly one succeeds |
| I | Same Account races two different Participants | Exactly one succeeds |
| J | Link vs overlapping Booking creation | No overlapping active Participant services |
| K | Exact replay | No duplicate claims/guards/audit/outbox/`guestAccountLink`/Payment mutation |
| L | Transaction retry (`simulateRetry` + real contention) | No duplicate writes |
| M | Undefined serialization boundary | No Firestore undefined failures |
| N | Link vs guest expiry/cancellation (T24) | Serializable; no double capacity release |
| O | `promote_guest` happy path | Same `participantId`; management promoted; no claim migration; seat unchanged |
| P | `create_managed` happy path | New Participant + management + claim/guard migration atomically |
| Q | Credential reuse after successful link by different Account | `unauthorized`; `guestAccountLink` unchanged |
| R | Pre-extension guest Enrollment without durable `bookedBy.guestSubjectId` | `validation` / `unsupported`; no mutation |

---

## Required unit tests

- Identity/security: valid proof, invalid signature, wrong Enrollment scope, wrong purpose, Booking token on Enrollment, missing Account, missing guest proof.
- Participant selection: `existing_managed` success, unrelated Participant forbidden, duplicate names without auto-match, `promote_guest`, `create_managed` compose.
- Provenance: `attribution.bookingOrigin` / `attribution.bookedBy` immutable after link.
- Resource migration: acquire new claims, release old claims, conflict rollback, half-open adjacency, seat claim untouched.
- Active guard: migrate/reject `duplicate_active_enrollment`.
- Finance: no Guest Wallet; `Payment.payerAccountId` set; `CourseEnrollment.payerAccountId` unchanged; MonetaryEvents unchanged.
- Credential consumption + idempotent replay.
- Retry safety.
- T23 guest create returns link credential with deterministic `guestSubjectId`.

---

## Cross-ticket Emulator regressions (closure gate)

Rerun real Emulator suites for:

- T09 `resourceClaimEngine.emulator.test.ts`
- T13 `bookingCommands.emulator.test.ts`
- T15 guest linking / `guestCredential` if shared credential code changes
- T17 `bookingRescheduleCommands.emulator.test.ts` (if shared helpers change)
- T22 `courseDayCommands.emulator.test.ts`
- T23 `courseEnrollmentCommands.emulator.test.ts`
- T24 CourseEnrollment lifecycle emulator tests (when available)

---

## Transaction budget (T07)

Linking touches `CourseDay` count × claim guards. Respect existing enrollment CourseDay limits and T07 `operation_too_large` rejection before writes. No multi-transaction saga for all-or-none link.

---

## Audit / outbox

Register command in:

- `commandKinds.ts`
- `commandIntents.ts`
- `auditReasonRegistry.ts` → `['participant_management', 'other']`
- `auditEffectRegistry.ts` → `['guest_course_enrollment_linked', 'participant_access_changed', 'resource_claim_changed', 'payment_association_changed', 'outbox_obligation_created']`

Add `guest_course_enrollment_linked` to `AUDIT_EFFECT_KINDS` if not present.

Activity Log: no monetary amounts/balances; reference `monetaryEventIds` only when applicable.

---

## Acceptance criteria

- [ ] `guestSubjectIdFromCourseEnrollmentId` bound at guest create; attribution persisted on `CourseEnrollment.attribution.bookedBy`.
- [ ] Guest `create_course_enrollments` returns per-enrollment link credentials.
- [ ] `link_guest_course_enrollment_to_account` uses discriminated `participantTarget`; no ambiguous optional fields.
- [ ] `create_managed` is one-step same-transaction compose (not prior `create_participant`).
- [ ] Authenticated Account + signed guest proof required; no name/contact matching.
- [ ] `guestAccountLink` written on first link; credential consumption enforced.
- [ ] Guest provenance immutable; current authority becomes management-based.
- [ ] Participant CourseDay claims migrate atomically when `participantId` changes.
- [ ] Active Participant+Course guard migrates safely; `duplicate_active_enrollment` on conflict.
- [ ] Seat/capacity unchanged by linking.
- [ ] `Payment.payerAccountId` set to linking Account on first link; `CourseEnrollment.payerAccountId` not updated; MonetaryEvents immutable.
- [ ] Idempotent replay and serialized concurrent link races.
- [ ] Link vs Booking creation preserves Participant conflict invariants.
- [ ] Pre-extension guest enrollments rejected as not linkable.
- [ ] Real Firestore Emulator matrix (A–R) green.
- [ ] Cross-ticket Emulator regressions green.
- [ ] T31 can implement guest Course linking UX without identity guessing.

---

## Failure and edge cases

- Forged/reused/consumed link credential, expired credential, expired guest reservation, concurrent link vs expiry/cancellation, target Participant schedule conflict, `duplicate_active_enrollment`, stale revision, oversized claim migration plan, `guestAccountLink` conflict, payer-without-management Account, pre-extension Enrollment without durable guest attribution.

---

## Depends on

- T23 — Create atomic CourseEnrollments for account, guest, and admin flows.
- T24 — Implement Course transfer, cancellation, withdrawal, and capacity freeze (guest expiry/eligibility semantics).

## Blocks

- T31 — Migrate CourseEnrollment, CourseDay, and Attendance UX (guest CourseEnrollment linking UX).

## Related

- T15 — guest Booking reservation/linking (promote-guest compose reference).
- T11 — ParticipantManagement.
- T09 — resource claims.
- T12 — Payment / Wallet.
- T10 — audit / outbox.
- T27 — Course reconciliation (read-only; does not replace linking).

## Unlocks

- T31 guest CourseEnrollment account-linking backend contract.
- Phase-4 guest Course vertical completeness before Phase-5 UX.

## Definition of done

- Targeted unit tests + full Emulator matrix (A–R) pass on real Firestore.
- Cross-ticket Emulator regressions listed above pass.
- Repository typecheck/lint/format/build pass.
- No name matching, no Guest Wallet, no provenance rewrite, no nested authoritative commands.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.

## Blocking spec decisions

**None.** All business-policy decisions required for `/implement` are resolved in this artifact from ADR-0001/0003, `CONTEXT.md`, T11/T15/T23 contracts, and clean-reset policy.
