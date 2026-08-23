# T08: Add revisions, deterministic identities, and transactional idempotency

**Phase:** 2 — Command and transaction infrastructure  
**Status:** ready-for-agent

## What to build

Enforce optimistic concurrency and replay-safe command execution with expected revisions, deterministic derived identities, and transactionally stored idempotency results.

## Scope

- Expected-revision checks and revision increments.
- Idempotency key ownership, request fingerprinting, stored result replay, and conflict errors.
- Deterministic identity helpers for command-created records.

## Out of scope

- Business-specific issue/event identities and best-effort post-commit deduplication.

## Authoritative references

- ADR-0002 — revisions, concurrency, idempotency, and stable errors.

## Acceptance criteria

- [ ] Exact replay returns the original canonical result without duplicate writes.
- [ ] Key reuse with different input fails deterministically.
- [ ] Stale revisions cannot mutate aggregates.

## Required tests

- Concurrent Emulator transactions, replay, fingerprint mismatch, and deterministic-ID tests.
- Tests proving idempotency state commits atomically with command effects.

## Failure and edge cases

- Concurrent first use, stale expected revision, lost response then retry, same key across actor boundaries.

## Blocked by

- T06 — Introduce CanonicalCommands.execute and the closed command catalog.

## Unlocks

T09, T10, and the Phase-2 gate.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- No generic patch or compatibility behavior is introduced; decisions are documented.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
