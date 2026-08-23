# T10: Stage immutable Activity Logs and deterministic outbox obligations

**Phase:** 2 — Command and transaction infrastructure  
**Status:** ready-for-agent

## What to build

Make every canonical command atomically stage immutable audit facts and deterministic outbox obligations alongside its domain writes.

## Scope

- Command-to-Activity-Log staging contract and immutable persistence.
- Deterministic outbox identity, payload envelope, and delivery-state initialization.
- Audit/outbox contribution to transaction safety-budget planning.

## Out of scope

- Outbox delivery worker, raw log frontend access, and mutable audit correction.

## Authoritative references

- ADR-0005 — immutable Activity Log, atomic durability, outbox, and access boundaries.
- ADR-0002 — atomic transaction planning/idempotency.

## Acceptance criteria

- [ ] Successful state changes atomically include their required audit and outbox records.
- [ ] Failed/rejected commands leave neither misleading audit nor outbox records.
- [ ] Replay cannot duplicate deterministic obligations.

## Required tests

- Emulator atomicity, replay, injected-failure, immutability, and transaction-budget tests.

## Failure and edge cases

- Duplicate delivery intent, transaction retry, oversized audit payload, attempted Activity Log mutation.

## Blocked by

- T07 — Build atomic transaction planning and safety-budget preflight.
- T08 — Add revisions, deterministic identities, and transactional idempotency.

## Unlocks

Phase-3 domain commands and T36.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- Audit durability matches ADR-0005; decisions are documented.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
