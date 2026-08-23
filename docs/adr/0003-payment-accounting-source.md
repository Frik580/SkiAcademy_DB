---
status: accepted
date: 2026-08-23
---

# ADR-0003: Payment Accounting Source

Carve Academy will represent current financial truth with one canonical `Payment` aggregate per `Booking` or `CourseEnrollment`, one non-negative Account-owned `Wallet`, and one global append-only `monetary_events` history. `Payment` is the sole numeric price and obligation authority, while monetary events are the sole canonical financial history. Obligation settlement and service funding are deliberately distinct: refunds do not erase the portion of an obligation previously settled, but service may start only while the full current price remains retained.

This ADR completes the Payment decision deferred by [ADR-0001](./0001-canonical-aggregate-topology.md) and fits the command, atomicity, idempotency, resource, and transaction-budget model in [ADR-0002](./0002-server-command-transaction-and-resource-model.md). It preserves the business rules in [CONTEXT.md](../../CONTEXT.md) and the clean-cutover direction in the [canonical rewrite specification](../specs/canonical-booking-domain-rewrite.md). [ADR-0005](./0005-audit-durability-and-transaction-policy.md) resolves Activity Log durability, outbox delivery, and retention while preserving the financial source separation decided here.

## Context and scope

The current implementation has no first-class canonical Payment State. Financial facts are spread across Booking price and status fields, Account Wallet fields, mutable Wallet ledger entries, guest settlement helpers, refund markers, idempotency records, and best-effort Activity Logs. Some cancellation paths calculate refunds from nominal Booking price rather than money actually paid, some administration paths can conflate debt with Wallet balance, and the synthetic school-guest Wallet gives unauthenticated payments a false stored-value owner.

This ADR replaces those overlapping representations for the clean canonical rewrite. No legacy financial document, ledger entry, or Activity Log becomes canonical Payment or monetary history. Canonical financial state is created through canonical commands after cutover or through explicit validated seed commands.

## Decision overview

```text
Booking or CourseEnrollment
  owns lifecycle, service configuration, pricing basis, and paymentId
                             |
                             v
Payment
  owns immutable identity and subject association
  owns originalPrice, current price, payment/refund totals,
  obligation allocation, write-off, outstanding amount, and paymentStatus
                             |
                  projected from / explained by
                             v
global monetary_events
  sole append-only canonical financial history
  records Payment effects, Wallet effects, provenance, and corrections
                             |
                   may atomically affect
                             v
Account Wallet
  owns only current spendable stored value
  never represents debt and never becomes negative

Activity Log
  owns immutable command/action audit history
  references monetary event IDs but is not a financial ledger

Domain outbox
  owns asynchronous external-delivery obligations
  may lag or retry independently after the authoritative commit
```

All authoritative financial mutations remain inside the deep server command module at the `CanonicalCommands.execute` seam established by ADR-0002. Callers submit business intent; the implementation owns authorization, price and refund calculations, Payment and Wallet projection updates, monetary event construction, service-funding evaluation, provider and command idempotency, transaction planning, required immutable Activity Log creation, and deterministic outbox planning. No separate public Wallet, ledger, refund, price-adjustment, or write-off mutation interface is canonical.

## Canonical source-of-truth hierarchy

| Concern                                                                                    | Canonical authority                                             | Explicit non-authorities                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Service lifecycle, schedule, Participants, Course, and service configuration               | `Booking` or `CourseEnrollment`                                 | Payment status, Wallet, monetary events                         |
| Pricing inputs and basis used to calculate an agreed price                                 | `Booking` or `CourseEnrollment`                                 | Wallet, Activity Log                                            |
| Numeric original and current agreed service price                                          | `Payment`                                                       | Booking/Enrollment numeric copies, tariff tables after creation |
| Current payment, refund, settlement, write-off, outstanding, and payment status projection | `Payment`                                                       | Booking lifecycle, Wallet ledger, Activity Log                  |
| Current spendable Account value                                                            | `Wallet`                                                        | Payment outstanding amount, monetary event queries              |
| Canonical financial history and provenance                                                 | `monetary_events`                                               | Activity Log, provider receipt, mutable ledger entry            |
| Provider callback deduplication                                                            | provider-event receipt                                          | Payment provenance, Activity Log                                |
| Command replay protection                                                                  | command idempotency record from ADR-0002                        | provider receipt alone                                          |
| Operational start restriction                                                              | deterministic Admin Issue and sanitized server-owned projection | Payment lifecycle or Booking lifecycle mutation                 |
| Immutable command/action audit history                                                     | Activity Log under ADR-0005                                     | monetary history, outbox delivery state                         |
| Asynchronous external-delivery obligations                                                 | Domain outbox under ADR-0005                                    | Activity Log, monetary history                                  |
| Financial query/read models                                                                | rebuildable projections of the authorities above                | independent sources of truth                                    |

`Booking.status` and `CourseEnrollment.status` are never financial inputs. Payment lifecycle and service lifecycle remain independent, although one canonical command updates them atomically when one business decision affects both.

## Currency and amount representation

Canonical v1 currency is `KZT`. Every monetary value is an integer number of KZT minor units. `Payment` and every monetary event store an explicit `currency = KZT`; Wallet state also records KZT. Floating-point monetary arithmetic is forbidden.

V1 has no currency conversion, foreign-currency balance, exchange-rate capture, or FX gain/loss behavior. A future multi-currency decision may extend the model but cannot reinterpret existing KZT amounts.

Percentages used for refunds are normalized before the transaction and evaluated with deterministic integer arithmetic. A refund target is clamped to `0..paidAmount`, and cumulative refunds can never exceed `paidAmount`.

## Payment aggregate

Each `Booking` and each `CourseEnrollment` has exactly one `/payments/{paymentId}` document. The subject and Payment are created atomically, reference each other, and agree on subject kind and ID. `paymentId`, `subjectType`, and `subjectId` are immutable. Course transfer preserves both Enrollment and Payment identity. A Payment document is a mutable current-state projection; “immutable Payment” means immutable aggregate identity and subject association, not an immutable projection document.

The canonical Payment fields are:

```text
paymentId
subjectType                 Booking | CourseEnrollment
subjectId
currency                    KZT

originalPrice               immutable numeric price at creation
price                       current agreed numeric service price
paidAmount                  accepted funding applied to the obligation
refundedAmount              money subsequently returned
retainedAmount              paidAmount - refundedAmount
settledAmount               current price satisfied by payment for
                            obligation-accounting purposes
writtenOffAmount            unpaid obligation explicitly waived
outstandingAmount           remaining collectible obligation
paymentStatus               unpaid | partially_paid | paid |
                            refunded | partially_refunded

payerAccountId?             current associated/funding Account Wallet,
                            when applicable; not historical provenance

incrementalRequirements[]   bounded family/group obligation allocations
revision                    aggregate command revision
eventRevision               last applied Payment event sequence
createdAt
updatedAt
```

`originalPrice`, `price`, and the current monetary fields are stored because they are required for transactional decisions and bounded reads. They must also be exactly reproducible by folding the Payment's monetary events. `retainedAmount` and `paymentStatus` are stored projections even though they are deterministic, so commands and Rules-facing read models do not need unbounded event scans. Every command validates their derivation before commit.

`payerAccountId` is optional. It identifies the Account Wallet currently associated with or funding the Payment where applicable. It does not claim that every historical payment came from that Account. Account linking or a later refund destination may establish or change this association without rewriting any earlier payment event.

Booking and CourseEnrollment retain their pricing basis and service configuration, such as tariff identity/version, duration, Instructor choice, Course choice, and party composition. They store `paymentId` but do not duplicate an authoritative numeric `originalPrice` or current `price`. “Price snapshot” therefore means the immutable pricing basis on the service subject plus `Payment.originalPrice`; the numeric Payment fields are authoritative.

## Financial equations and invariants

Two equations describe different dimensions of the Payment:

```text
retainedAmount = paidAmount - refundedAmount
```

```text
price = settledAmount + writtenOffAmount + outstandingAmount
```

The first is cash retention. The second is current obligation allocation. A refund changes returned and retained money; it does not silently turn a previously paid obligation into an unpaid or written-off obligation.

Every committed Payment must satisfy:

```text
0 <= refundedAmount <= paidAmount
0 <= retainedAmount <= settledAmount
0 <= settledAmount <= paidAmount
0 <= settledAmount <= price
0 <= writtenOffAmount
0 <= outstandingAmount
retainedAmount = paidAmount - refundedAmount
price = settledAmount + writtenOffAmount + outstandingAmount
```

A canonical command rejects any plan whose final projection violates these constraints. A write-off closes only unpaid obligation. It is not income, payment, refund, or Wallet movement, and it never includes a refunded amount.

### Obligation settlement is not service funding

`settledAmount` records the portion of the current agreed price that has been satisfied by payment for obligation-accounting purposes. Later refunds do not reduce `settledAmount` unless a price decrease itself reduces the size of the current obligation.

The full-payment-before-service gate uses money still retained against the current price:

```text
isFullyFundedForService =
    retainedAmount == price
 && settledAmount == price
 && writtenOffAmount == 0
 && outstandingAmount == 0
```

The command evaluates this predicate when deciding whether a service may start. Consequently:

- a write-off never authorizes service;
- an active service refunded below its current price cannot start;
- a legitimate price decrease followed by refund of the excess remains fully funded when both `retainedAmount` and `settledAmount` equal the new price;
- a post-completion goodwill refund does not retroactively invalidate delivered service or change completed lifecycle state;
- `paymentStatus` alone is never a service-start decision.

Lifecycle eligibility is checked independently. A terminal cancelled service cannot start even if its Payment once satisfied the funding predicate.

If an active service was refunded below its unchanged price, later replacement funding restores retained money without settling the same obligation twice. For accepted funding `f`, the command allocates money in this order:

```text
replacementFunding = min(f, settledAmount - retainedAmount)
paidAmount += replacementFunding
f -= replacementFunding
settledAmount unchanged
outstandingAmount unchanged

obligationFunding = min(f, outstandingAmount)
paidAmount += obligationFunding
settledAmount += obligationFunding
outstandingAmount -= obligationFunding
f -= obligationFunding
```

The command rejects an unexplained remainder. It cannot apply payment to `writtenOffAmount`; Administration must first explicitly reverse the applicable write-off into outstanding obligation through a correction. This allocation permits `paidAmount` to exceed `price` after refund and replacement funding while preserving `retainedAmount <= settledAmount <= price`.

## Payment status derivation

The approved statuses are sufficient because they describe payment/refund state, not service lifecycle or collectibility. Commands derive `paymentStatus` in this order:

```text
if refundedAmount > 0:
    if retainedAmount == 0:
        refunded
    else:
        partially_refunded

else if price == 0:
    paid

else if settledAmount == 0:
    unpaid

else if settledAmount == price
     and writtenOffAmount == 0
     and outstandingAmount == 0:
    paid

else:
    partially_paid
```

`paid` cannot coexist with an outstanding amount or write-off. `partially_paid` includes an active underpayment and a partially paid obligation later closed by write-off. `refunded` means all recorded paid money was returned; it does not claim that the whole price had been paid. Refund statuses take precedence and make no service-funding claim.

Cancelled, withdrawn, no-show, and completed remain Booking/CourseEnrollment lifecycle states and are never added to Payment status.

### Approved accounting examples

All values below are KZT integer minor units. Cancellation percentages apply to the amount actually paid.

| Scenario                                        |   Price |    Paid | Refunded | Retained | Settled | Written off | Outstanding | Payment status       | Funded for service now                                            |
| ----------------------------------------------- | ------: | ------: | -------: | -------: | ------: | ----------: | ----------: | -------------------- | ----------------------------------------------------------------- |
| Partially paid active service                   | 100,000 |  30,000 |        0 |   30,000 |  30,000 |           0 |      70,000 | `partially_paid`     | no                                                                |
| Cancellation; 100% of paid amount refunded      | 100,000 |  30,000 |   30,000 |        0 |  30,000 |      70,000 |           0 | `refunded`           | no                                                                |
| Cancellation; 50% of paid amount refunded       | 100,000 |  30,000 |   15,000 |   15,000 |  30,000 |      70,000 |           0 | `partially_refunded` | no                                                                |
| Completed service; later 20,000 goodwill refund | 100,000 | 100,000 |   20,000 |   80,000 | 100,000 |           0 |           0 | `partially_refunded` | no longer fully funded, but the gate is not applied retroactively |

The completed-service example preserves full historical obligation settlement while truthfully recording that only 80,000 remains retained after goodwill. Its completed lifecycle does not change.

## Wallet model

An Account owns exactly one canonical Wallet at `/users/{accountId}/wallet/state`. V1 Wallet state contains:

```text
accountId
currency = KZT
balance
revision
eventRevision
createdAt
updatedAt
```

Wallet is stored value available to fund future services. It is not a Payment, debt account, Booking lifecycle, revenue ledger, provider settlement statement, or historical payer record. One Wallet can fund services for multiple Participants without changing Participant ownership or service identity.

Every Wallet balance change is explained by the same global `monetary_events` history used for Payment effects. There is no second Wallet ledger collection. The current Wallet balance is stored for transactional concurrency and must equal the fold of Wallet-affecting monetary events, including any explicit seed credit. Wallet balance never becomes negative; a command that would do so fails without creating or changing the service subject.

There is no school, guest, anonymous, or synthetic Wallet. External/manual money can fund a Payment without any Wallet movement.

## Canonical monetary history

`/monetary_events/{eventId}` is the sole canonical financial history. Events are append-only and immutable. An event can affect at most one Payment and at most one Wallet, allowing one money movement to be represented once rather than duplicated into Payment and Wallet ledgers. A command with distinct economic effects, such as a refund plus a write-off, appends distinct events in the same transaction.

V1 event kinds include:

- `wallet_credit` and reasoned `wallet_adjustment`;
- `booking_charge` and `course_charge`;
- `external_payment` and `manual_payment`;
- `refund_to_wallet` and `manual_external_refund`;
- `admin_price_adjustment`;
- `write_off`;
- compensating `correction`.

Each event stores the applicable subset of:

```text
eventId
eventKind
currency
paymentId?
subjectType?
subjectId?
walletAccountId?

paymentEffect?              signed deltas for price, paidAmount,
                            refundedAmount, settledAmount,
                            writtenOffAmount, outstandingAmount
walletBalanceDelta?         signed KZT minor-unit movement

sourceKind                  wallet | provider | cash | bank_transfer |
                            manual_external | admin_adjustment | system
payerAccountIdAtEvent?
providerKind?
providerEventId?
providerTransactionRef?
manualReference?
refundDestinationKind?      wallet | manual_external
refundAccountIdAtEvent?

actor
reason?
commandKey
correlationId
causationId?
correctsEventId?
paymentEventRevision?
walletEventRevision?
occurredAt
recordedAt
```

Sensitive provider data and personal information are never placed in document IDs. `eventId` is opaque or deterministically hashed from versioned non-personal command/effect identity. Provider and manual reference fields hold only the minimum safe reconciliation identifiers.

Events carry signed effects sufficient to fold Payment and Wallet projections in event-revision order. `retainedAmount` and `paymentStatus` are recomputed during the fold rather than independently changed by an event. Multiple events from one command receive consecutive event revisions even though each affected aggregate's command `revision` increments once.

Activity Logs may reference the command, Payment, Wallet, and monetary event IDs and describe actor/capability/reason. They do not repeat signed monetary effects as another ledger. ADR-0005 requires the immutable Activity Log to commit synchronously and atomically with the financial command and assigns only asynchronous delivery obligations to the separate outbox; neither may introduce a second canonical monetary history.

## Atomic funding flows

### Self-service creation

Authenticated Account self-service and accepted Instructor proposals require enough Wallet balance for the full calculated price. The command transaction reads the Wallet, calculates the authoritative price from the subject's pricing basis, creates the subject and Payment, decrements Wallet, appends the charge event, writes required claims/guards/capacity, and commits idempotency, one immutable Activity Log, and any required outbox obligations.

The created Payment has `paidAmount = settledAmount = retainedAmount = price`, zero refund, zero write-off, zero outstanding amount, and `paymentStatus = paid`. If Wallet funds are insufficient, the command returns `insufficient_funds`; no Booking, Enrollment, Payment, claim, capacity mutation, Wallet mutation, monetary event, or successful audit record is created. Partial self-service funding is forbidden.

### Administrative underpayment

Administration may create a confirmed Booking or CourseEnrollment despite insufficient funds only with a mandatory reason, one immutable Activity Log, and any required outbox obligations. If an Account Wallet is selected, the command applies at most `min(wallet.balance, price)` and never makes the Wallet negative. Manual or external funds attested in the same intent may also be applied with their own provenance event.

The Payment records the amount actually applied in `paidAmount`, `retainedAmount`, and `settledAmount`; `outstandingAmount` contains the unsatisfied price and `writtenOffAmount` remains zero while the obligation is collectible. Zero funding produces `unpaid`; some funding below price produces `partially_paid`. Outstanding debt never appears as negative Wallet value.

Underpayment remains temporary before `startAt`. Administrator capability, reason, or audit does not override the service-start funding predicate.

### Guest, manual, and external funding

An unauthenticated guest service may have no `payerAccountId`. Administration records a manual or externally settled payment only after it has evidence that the money was received. The canonical command updates Payment and appends an `external_payment` or `manual_payment` event without changing any Wallet.

Historical provenance belongs to each immutable event through `sourceKind`, `payerAccountIdAtEvent`, provider/manual references, timestamps, and command/actor information. Later Account linking never rewrites those fields. A linked Account may become the destination for a later Wallet refund, which is recorded on the new refund event without changing original payment provenance.

## Refund model

Refund policy percentages apply to money actually paid, never nominal price. For a normalized refund fraction `p`, the command calculates a deterministic integer target from `paidAmount`, clamps it to `0..paidAmount`, and applies only the cumulative difference:

```text
targetRefund = monetaryRound(paidAmount * p)
refundDelta = max(0, targetRefund - refundedAmount)
```

An explicit administrative refund amount is likewise limited to `paidAmount - refundedAmount`. The final invariant `refundedAmount <= paidAmount` is checked in the transaction.

For a linked Account, every system-managed refund goes to that Account Wallet. One transaction reads Payment and Wallet and atomically:

- increments `refundedAmount` and recomputes `retainedAmount` and `paymentStatus`;
- credits Wallet by the same `refundDelta` without changing `settledAmount`;
- appends one `refund_to_wallet` event containing both Payment and Wallet effects and destination provenance;
- appends any separate write-off or price-adjustment event required by the business decision;
- performs any lifecycle correction required by that same decision;
- writes or completes command idempotency, the required Activity Log, and any required outbox obligations.

For an unlinked guest, administration returns money outside the system. After the external return has actually occurred, an authorized attestation command records the Payment refund and a `manual_external_refund` event with destination/reference provenance, idempotency, one immutable Activity Log, and any required outbox obligations. It creates no synthetic Wallet. If linking occurred before the refund decision, the linked Account Wallet receives the refund instead.

## Terminal financial behavior

Terminal lifecycle decisions apply these Payment effects atomically with the lifecycle change when both are part of one business decision:

| Lifecycle result   | Refund                                                              | Obligation result                                                           |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `cancelled`        | selected policy amount, never above actually paid money             | write off the remaining `outstandingAmount` after the refund decision       |
| Course `withdrawn` | zero                                                                | retain paid money and write off all remaining outstanding obligation        |
| `no_show`          | zero                                                                | retain paid money and write off all remaining outstanding obligation        |
| `completed`        | normally none; service-start gate should have required full funding | preserve Payment; later goodwill/correction is a separate financial command |

Refunds do not reduce `settledAmount`. Closing cancellation debt transfers only `outstandingAmount` to `writtenOffAmount`. For example, a price of 100,000 with 30,000 paid and then fully refunded results in `settledAmount = 30,000`, `retainedAmount = 0`, `writtenOffAmount = 70,000`, and `outstandingAmount = 0`.

A post-completion goodwill refund changes Payment/refund state and history but never reopens, cancels, or otherwise rewrites the completed lifecycle. The already delivered service is not retroactively subjected to the start gate.

Course `withdrawn -> cancelled` is permitted only when Administration later issues a refund greater than zero. The lifecycle correction, Payment refund, Wallet credit or attested external refund, monetary events, command idempotency, immutable Activity Log, and any required outbox obligations commit through the same canonical command transaction.

## Service-start enforcement

An individual Booking must satisfy `isFullyFundedForService` by its `startAt`; a CourseEnrollment must satisfy it by the first Course `startAt`. `confirmed` with `unpaid` or `partially_paid` is permitted only before that instant.

The scheduled payment-start adapter discovers candidates but the canonical command transaction reloads the subject and Payment, rechecks authoritative time, lifecycle, revisions, and the full funding predicate, then creates or reuses the deterministic payment Admin Issue and operational restriction. Payment remains financial state and does not mutate lifecycle merely because the gate failed.

Instructors receive only the sanitized instruction “Payment required—do not start.” They do not receive Wallet balance, price, outstanding, write-off, payment, refund, or provenance detail. Delivery, Attendance, and automated outcome commands recheck the operational restriction and current authoritative state.

Full funding received before `startAt` clears the restriction transactionally. Payment after a missed start does not by itself authorize the missed service. Administration may, with client agreement, reschedule an individual Booking to a future valid slot and establish a new gate. A CourseEnrollment cannot join a Course that has already started; late payment does not override the no-late-admission rule.

## Price snapshots and explicit price changes

Global tariff changes never alter existing Payments. An explicit authorized modification recalculates from the service subject's canonical pricing basis, requires expected revisions and any mandatory reason, and atomically updates the subject basis, Payment projection, monetary events, funding effects, idempotency, the immutable Activity Log, and any required outbox obligations.

`originalPrice` never changes. `price` changes only through such an explicit command.

### Price increase

For `delta = newPrice - oldPrice > 0`:

```text
price += delta
outstandingAmount += delta
settledAmount unchanged
writtenOffAmount unchanged
```

If funding amount `f` is accepted in the same command:

```text
apply f through the canonical replacement-then-obligation funding order
```

For the normal no-prior-refund case, the replacement portion is zero, so funding increases `paidAmount` and `settledAmount` and decreases `outstandingAmount` by the same value. Self-service changes require full funding. Administration may leave an underpayment before the applicable start with a mandatory reason; the Wallet remains non-negative and the start gate remains authoritative.

### Price decrease

For `reduction = oldPrice - newPrice > 0`, the command removes the reduced obligation in this order:

1. outstanding obligation;
2. written-off obligation;
3. settled obligation.

```text
cut = min(reduction, outstandingAmount)
outstandingAmount -= cut
reduction -= cut

cut = min(reduction, writtenOffAmount)
writtenOffAmount -= cut
reduction -= cut

settledAmount -= reduction
price = newPrice
```

If the revised settled portion is below retained money, the command refunds only the excess:

```text
additionalRefund =
    max(0, retainedAmountBeforeAdjustment - settledAmountAfterAdjustment)
```

The refund updates `refundedAmount` and `retainedAmount`, not `settledAmount`. Thus reducing an underpaid price first reduces debt, reducing a previously waived price first reduces the write-off after debt, and reducing below the paid portion returns only money no longer required by the current price. A linked Account receives the excess in Wallet; an unlinked guest uses attested manual external refund provenance.

Instructor change, duration change, Course transfer, family/group composition change, and manual price override all use this same model. A more expensive Course transfer adds and funds or leaves the difference outstanding; a cheaper transfer reduces the obligation and refunds only resulting retained excess. The CourseEnrollment and Payment identities remain unchanged.

## Family/group obligation allocations

One family/group Booking retains one Payment aggregate. The Payment may contain at most seven active `incrementalRequirements`, corresponding to additions after the initial Participant in the approved maximum party of eight. Each allocation contains an immutable requirement ID, Participant ID, creation command/time, required price delta, `allocatedSettledAmount`, `allocatedRetainedAmount`, and current allocation state. Monetary events that fund or refund an addition reference its requirement ID.

These allocations are not Wallets, independent Payments, or independent financial balances. They are bounded obligation-allocation metadata inside the one Payment. Root Payment fields remain authoritative, every allocation mutation occurs in the same command as the root projection and events, and reconciliation verifies `0 <= allocatedRetainedAmount <= allocatedSettledAmount <= requiredPriceDelta`, the allocation sums do not exceed the corresponding root totals, and every referenced event agrees with the allocation. Payments are allocated deterministically to the targeted requirement; a command cannot silently take retained or settled funding allocated to an already fully funded Participant to satisfy another addition.

An addition is fully funded only when both allocated settled and retained amounts equal its required price delta and no part is written off or outstanding. At the applicable `startAt`, every active addition that is not fully funded is rolled back under the approved party-change rules. Fully funded Participants are preserved. Rollback is deterministic, newest requirement first where ordering affects tariff recalculation, removes the affected Participant and claims, recalculates the pricing basis and Payment price for the remaining party, and applies the canonical price-decrease/refund rules. It does not block or penalize already fully funded Participants merely because another addition was underfunded. After all required rollbacks, the root `isFullyFundedForService` predicate is evaluated for the remaining Booking.

## Write-offs and corrections

A write-off explicitly waives collectible unpaid obligation:

```text
writtenOffAmount += amount
outstandingAmount -= amount
```

It preserves `originalPrice`, does not change Wallet, `paidAmount`, `refundedAmount`, `retainedAmount`, or `settledAmount`, and requires authorized actor, reason, causation, monetary event, idempotency, an immutable Activity Log, and any required outbox obligations. A write-off can close collection but never satisfy the service-start gate.

Historical monetary events are never edited or deleted to correct a financial mistake. Administration issues an explicit correction command that appends one or more compensating `correction` events. Each correction records the corrected event ID where applicable, actor, mandatory reason, command/correlation/causation identity, signed effects, and resulting revisions. The transaction recomputes and validates Payment and Wallet projections and refuses any correction that would make Wallet negative or violate a financial invariant.

If monetary history is correct but a current projection is corrupt, an explicit audited projection-rebuild command may fold the events and replace only the projection. Because no economic event occurred, that rebuild does not invent a monetary event; its audit record identifies the prior and rebuilt projection hashes and event revision. If history itself is wrong, only compensating monetary events may correct it.

## Command and provider idempotency

ADR-0002 command idempotency applies to every financial command. The completed command record, Payment and Wallet mutations, monetary events, lifecycle effects when applicable, immutable Activity Log, and any required outbox obligations commit atomically. A retry with the same normalized actor scope, command kind, key, and fingerprint returns the recorded result without repeating effects; a mismatched reuse returns `idempotency_conflict`.

Provider callbacks add `/provider_event_receipts/{receiptKey}`. `receiptKey` is a deterministic hash of provider/merchant scope plus the provider's immutable event ID. The receipt stores the provider identity, safe event fingerprint, Payment/Wallet references, canonical command key, applied monetary event IDs, outcome, and timestamps. It is an enforcement record, not financial provenance or a ledger.

The provider event ID deterministically supplies the command idempotency key. In one transaction the callback command:

- checks the provider receipt and request fingerprint;
- checks canonical command idempotency;
- reloads and validates Payment and Wallet as applicable;
- creates the receipt if absent;
- updates projections and appends monetary events;
- completes command idempotency, the immutable Activity Log, and any required outbox obligations.

An existing matching receipt replays the same result. The same provider event ID with different semantic content is a conflict and produces no financial effect. Provider network calls never occur inside the retryable Firestore transaction. No provider event, command retry, or transaction retry can duplicate a credit, charge, or refund.

## Reconciliation

Scheduled reconciliation is read-only with respect to financial truth. It emits a report and creates or reuses deterministic Admin Issues; it never silently changes a Payment, Wallet, or historical event.

Reconciliation checks at minimum:

- every Wallet balance equals its ordered Wallet-affecting monetary-event fold;
- every Payment projection equals its ordered Payment-event fold;
- all equations, non-negativity constraints, and `refundedAmount <= paidAmount` hold;
- Wallet never becomes negative at any event revision;
- each Booking/CourseEnrollment has exactly one matching Payment and each Payment has one matching subject;
- Payment and Wallet event revisions are continuous and projections point to their last applied sequence;
- monetary events have valid currency, provenance, command identity, and non-orphan references;
- provider receipts and command idempotency records map uniquely to their recorded effects;
- no provider event, command, refund, or correction effect is applied twice;
- family/group allocation projections agree with root Payment totals;
- service-funding and operational-restriction projections agree with current authoritative inputs.

When history is wrong, Administration uses a compensating correction command. When events are correct but a projection is wrong, Administration uses the explicit audited rebuild command. When intent is ambiguous or external evidence is missing, the Admin Issue remains unresolved. Reconciliation does not infer a correction or silently repair financial history.

## Transaction budget under ADR-0002

`settledAmount` is another field in the existing Payment projection and adds no document read or mutation. The global event layout uses one event document per distinct economic effect and no duplicate Wallet ledger document.

Representative finance-only increments are:

| Operation                                  | Additional reads | Additional mutations | Financial documents                                                                        |
| ------------------------------------------ | ---------------: | -------------------: | ------------------------------------------------------------------------------------------ |
| Fully funded Booking creation              |                1 |                    3 | Wallet read; Payment create, Wallet update, charge event                                   |
| Admin underpaid Booking                    |              0–1 |                  1–3 | Payment plus optional Wallet movement and source event(s)                                  |
| Cancellation with refund                   |                2 |                  3–4 | Payment and Wallet reads; Payment, optional Wallet, refund event, optional write-off event |
| Family/group composition change            |                2 |              up to 4 | Payment, Wallet, price-adjustment event, and charge/refund event                           |
| Eight-Participant atomic Course enrollment |                1 |                   17 | one Wallet update plus eight Payments and eight charge events                              |
| Course transfer                            |                2 |              up to 4 | Payment, optional Wallet, price-adjustment event, and charge/refund event                  |

Combining these constants with ADR-0002's representative planning estimates gives:

| Operation                                                 | Combined representative reads | Combined representative mutations |
| --------------------------------------------------------- | ----------------------------: | --------------------------------: |
| Individual Booking                                        |                         16–36 |                             18–33 |
| Illustrative eight-Participant, ten-Day Course enrollment |                       221–331 |                           267–347 |
| Illustrative ten-Day to ten-Day Course transfer           |                       112–202 |                           104–184 |

All remain below the v1 limits of 400 reads and 400 mutations. The eight-Participant Course fixture retains at least 53 mutation slots for the ADR-0005 Activity Log, outbox obligations, and other operation-specific constants. These are planning estimates, not guarantees or new domain limits. The ADR-0002 authoritative preflight must count the actual Payment, Wallet, event, provider receipt, idempotency, Activity Log, outbox, claim, guard, capacity, and aggregate plan. Any complete plan over a configured read, mutation, or byte budget fails with `operation_too_large`; it is not weakened into a saga or partial financial commit.

## Security and visibility

Clients cannot directly create, update, or delete:

- Payment documents or numeric price fields;
- Wallet state or balance;
- monetary events;
- provider receipts or command idempotency records;
- refunds, write-offs, corrections, projection rebuilds, or price adjustments;
- payment Admin Issues or operational restriction projections.

Firestore Rules deny those mutations as defense in depth; Administrator SDK possession is not domain authorization. Account Owners use canonical commands and receive only authorized Wallet and service-scoped Payment views. Guest access is token- and subject-scoped. Administration receives financial-management capabilities through canonical commands with mandatory reason and expected revision where required.

Instructors never receive Wallet balance, outstanding amount, write-off, price, payment/refund history, provenance, or monetary events. They receive only the sanitized operational permission or restriction needed to deliver the service.

## Required verification

The implementation is not complete without:

- deterministic unit tests for every financial equation, constraint, status branch, percentage/refund boundary, integer rounding rule, and price-adjustment order;
- explicit tests distinguishing `settledAmount` from `retainedAmount` and `isFullyFundedForService`, including post-completion goodwill refunds;
- Firestore Emulator tests proving atomic subject + Payment + Wallet + event + idempotency + Activity Log + required outbox-obligation outcomes;
- self-service insufficient-funds and concurrent Wallet-spend races that create no partial subject;
- administrative unpaid and partially paid creation with mandatory reason and non-negative Wallet;
- linked Wallet refunds and unlinked manual external refunds, including link-before-refund provenance;
- duplicate command retry, fingerprint conflict, duplicate provider event, and provider-event mismatch tests;
- cancellation, withdrawal, no-show, completed goodwill-refund, write-off, and withdrawn-to-cancelled correction scenarios;
- price increase/decrease, Instructor/duration/manual override, and Course transfer difference tests;
- family/group allocation, fully funded Participant preservation, underfunded addition rollback, tariff recalculation, and resulting refund tests;
- append-only compensating correction and explicit projection-rebuild tests;
- reconciliation fold, revision continuity, orphan, uniqueness, invariant, and deterministic Admin Issue tests;
- Rules and read-model tests proving forbidden direct writes and Instructor financial privacy;
- mutation-plan tests for representative and near-limit individual, eight-Participant Booking, eight-Participant Course enrollment, cancellation, party change, and Course transfer operations;
- production-SDK request-size and retry verification where Emulator behavior is insufficient.

Tests use `CanonicalCommands.execute` as the primary interface. Tests that mutate a legacy Wallet helper, Booking financial field, or ledger directly do not verify the canonical model and are replaced rather than layered beneath the new seam.

## Considered alternatives

- **Booking or CourseEnrollment owns numeric price and Payment mirrors it.** Rejected because two mutable numeric authorities can diverge. The service subject owns pricing basis; Payment alone owns numeric original/current price.
- **Payment embedded in the service subject.** Rejected by ADR-0001 and because financial corrections, provenance, visibility, and lifecycle evolve independently.
- **Wallet ledger plus Payment event history.** Rejected because one movement would have two competing histories. A single global monetary event may carry both Payment and Wallet effects.
- **Payment events only under each Payment.** Rejected because Wallet-only credits and cross-Payment Wallet reconciliation would require another history or unbounded fan-out conventions.
- **Negative Wallet represents debt.** Rejected because stored value and collectible service obligation have different ownership and invariants.
- **Synthetic guest or school Wallet.** Rejected because it invents stored value and payer ownership for externally handled money.
- **Refund reduces settled amount.** Rejected because it confuses returned cash with whether an obligation was previously satisfied and would make goodwill refunds rewrite settlement history.
- **Settled amount alone authorizes service.** Rejected because refunded money may no longer fund an active service. The start gate also requires full retained money and no write-off or outstanding amount.
- **Write-off absorbs refunded or unpaid-and-refunded price.** Rejected because write-off means only unpaid obligation explicitly waived.
- **Payment status authorizes service.** Rejected because refund state, obligation settlement, retained funding, and service lifecycle are separate facts.
- **Mutable financial history or reconciliation auto-repair.** Rejected because silent history changes destroy provenance and make correction intent unauditable.
- **Activity Log as financial ledger.** Rejected because action audit and signed economic effects have different schemas, invariants, retention, and reconciliation responsibilities.

## Consequences

- Callers receive a small command interface while accounting, provenance, refund, correction, and funding-gate complexity stays local to one deep implementation.
- Current Payment and Wallet projections support bounded transactional decisions; append-only events make every value reproducible and correctable without rewriting history.
- Payment and service lifecycle remain independent. A command may coordinate them atomically without letting either aggregate become the other's source of truth.
- `settledAmount` preserves obligation history across refunds, while `retainedAmount` prevents refunded active services from passing the start gate.
- One global event collection requires deliberate indexes and retention/archival decisions later, but neither an index nor an archive may become another financial authority.
- Financial commands contend intentionally on the affected Payment and Wallet. Firestore retries remain safe because calculations, events, receipts, and idempotency commit atomically.
- ADR-0005 defines Activity Log and outbox constants and mechanics without duplicating monetary effects into a second ledger or permitting best-effort audit.
- The current overlapping Wallet ledger, Booking refund, guest Wallet, optional idempotency, and mutable/best-effort Activity Log implementations are incompatible with this ADR and are replaced during the clean rewrite rather than migrated as canonical history.
- This ADR refines the phrase “Booking/CourseEnrollment price snapshot” into service-owned pricing basis plus Payment-owned numeric `originalPrice` and `price`; it does not change the approved fixed-price business rule.
- No contradiction with CONTEXT.md, ADR-0001, ADR-0002, or the rewrite specification is introduced. This ADR supplies the financial model those documents intentionally deferred and preserves ADR-0002 atomicity and safety budgets.
