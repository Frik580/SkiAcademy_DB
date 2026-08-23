# Payment, Wallet, audit, and outbox decisions

T05 adds strict canonical contracts for Payment, Wallet, append-only monetary events,
resource claims and guards, immutable Activity Logs, and deterministic outbox obligations.

- Canonical currency is `KZT` only. Every monetary value is a non-negative safe integer in
  minor units. Floating-point and foreign-currency values are invalid.
- Payment is the sole authoritative numeric financial state for a Booking or CourseEnrollment.
  `payerAccountId` identifies the current associated/funding Account and is not historical
  payment provenance; provenance belongs on immutable monetary events.
- Wallet is only the Account's current spendable balance at `/users/{accountId}/wallet/state`.
  There is no guest, school, or synthetic Wallet. Wallet balance never becomes negative.
- `/monetary_events` is the sole canonical append-only financial history. There is no second
  Wallet or payment ledger collection.
- Payment accounting enforces `retainedAmount = paidAmount - refundedAmount` and
  `price = settledAmount + writtenOffAmount + outstandingAmount`, with
  `0 <= retainedAmount <= settledAmount <= paidAmount` and `0 <= settledAmount <= price`.
  `paymentStatus` is derived and must remain independent from service lifecycle.
- `isPaymentFullyFundedForService` requires full retained and settled coverage with no
  write-off or outstanding amount. A write-off never authorizes service.
- Incremental family/group requirements are bounded metadata inside one Payment (max seven
  active allocations). They are not independent Payments or Wallets.
- Resource claims are server-owned enforcement records with deterministic `claimId` hashes over
  versioned non-personal identity inputs. Guards use versioned 12-hour UTC bucket keys with
  exact half-open interval entries. Legacy `availability_slots` and `availability_hour_locks`
  are rejected.
- Activity Log identity is `hash("audit:v1", commandId)` and is create-only. The envelope
  stores semantic effects and references only; it must not duplicate monetary deltas, balances,
  or accounting history. Cardinality limits follow ADR-0005 (64 subjects, 32 effects, 32
  monetary-event references, 32 outbox obligations per command).
- Outbox identity is `hash("outbox:v1", commandId, deliveryEffectOrdinal)`. Outbox is delivery
  infrastructure, not audit or business-state authority.

This slice contains no command execution, Firestore transactions, provider adapters, workers,
schedulers, frontend migration, legacy compatibility, or dual read/write behavior.
