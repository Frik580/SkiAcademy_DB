# T36: Implement outbox worker, reliability policy, reconciliation, and observability

**Phase:** 6 — Rules, jobs, reliability, and cutover tooling  
**Status:** ready-for-agent

## What to build

Reliably deliver deterministic outbox obligations with explicit retry/dead-letter policy, projection reconciliation, and operational observability while keeping Activity Logs immutable.

## Scope

- Outbox claim/delivery/retry/dead-letter lifecycle and idempotent handler contract.
- Sanitized projection rebuild/reconciliation integration.
- Metrics, structured diagnostics, alert thresholds, and Administrator/internal tooling.

## Out of scope

- Mutating Activity Logs, treating projections as truth, silent domain repair, provider-specific business adapters, and direct frontend log access.

## Authoritative references

- ADR-0005 — immutable Activity Log, atomic outbox durability, sanitized projections, access, and reliability policy.
- ADR-0002 — idempotency/concurrency and stable operational errors.

## Acceptance criteria

- [ ] At-least-once delivery cannot duplicate externally visible canonical effects.
- [ ] Retry/dead-letter state is observable and recoverable by an explicit operation.
- [ ] Projection reconciliation detects/rebuilds drift without modifying Activity Logs or domain truth.
- [ ] Raw audit payloads remain internal.

## Required tests

- Worker concurrency, lease expiry, duplicate delivery, poison message, retry/dead-letter, projection rebuild, and observability integration tests.

## Failure and edge cases

- Worker crash after side effect, lease theft, permanently failing obligation, out-of-order projection event, partial rebuild.

## Blocked by

- T29, T30, T31, T32, and T33 — complete Phase-5 frontend/read-model gate.

## Unlocks

T38.

## Definition of done

- Targeted worker/reconciliation tests and repository typecheck/lint/format/build pass.
- Audit remains immutable/internal and projections remain rebuildable.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
