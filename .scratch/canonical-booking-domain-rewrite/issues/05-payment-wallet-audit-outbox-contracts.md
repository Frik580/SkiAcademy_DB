# T05: Model Payment, Wallet, monetary history, claims, audit, and outbox

**Phase:** 1 — Canonical domain contracts  
**Status:** ready-for-agent

## What to build

Define the canonical financial, resource-claim, immutable audit, and outbox contracts required for atomic service workflows.

## Scope

- Payment and Wallet identities, states, balances, funding allocation, and revisions.
- Append-only monetary event contracts using KZT invariants.
- Exact interval/resource claims and uniqueness guards.
- Immutable Activity Log and deterministic outbox obligation contracts.

## Out of scope

- Provider adapters, command execution, workers, schedulers, and legacy transaction projections.

## Authoritative references

- ADR-0001 — Payment root and physical topology.
- ADR-0003 — accounting source, Wallet, monetary events, and KZT invariants.
- ADR-0005 — audit durability, outbox, and access boundaries.

## Acceptance criteria

- [ ] Financial state is derivable from canonical Payment/Wallet/monetary-event contracts.
- [ ] Audit and outbox records have deterministic linkage to their command.
- [ ] Claims express exact protected resources and intervals.

## Required tests

- Contract tests for money conservation, append-only events, claim identity, and deterministic audit/outbox keys.
- Negative fixtures for mutable audit and legacy transaction shapes.

## Failure and edge cases

- Currency mismatch, duplicate event IDs, negative balances outside policy, claim collisions, mutable audit fields.

## Blocked by

- T01 — Establish canonical primitives, IDs, paths, and validation.

## Unlocks

T12 and the Phase-2 transaction, claim, audit, and outbox infrastructure.

## Definition of done

- Targeted tests and repository typecheck/lint/format/build pass; canonical fixtures are added.
- No compatibility behavior or ADR/spec deviation is introduced; decisions are documented.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
