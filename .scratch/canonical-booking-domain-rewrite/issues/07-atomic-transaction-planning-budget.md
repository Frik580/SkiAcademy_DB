# T07: Build atomic transaction planning and safety-budget preflight

**Phase:** 2 — Command and transaction infrastructure  
**Status:** ready-for-agent

## What to build

Make canonical commands declare and preflight their complete atomic read/write plan before committing, rejecting operations that exceed Firestore application safety budgets instead of silently becoming sagas.

## Scope

- Transaction-plan representation and deterministic operation accounting.
- Read-before-write discipline, safety-budget preflight, and atomic commit adapter.
- Explicit rejection result for oversized atomic commands.

## Out of scope

- Saga substitution, partial commits, command-specific business rules, and platform-maximum guessing at runtime.

## Authoritative references

- ADR-0002 — transaction planning and Firestore application safety budgets.
- Canonical rewrite specification — no saga replacement for approved atomic commands.

## Acceptance criteria

- [ ] Commands over budget fail before any write.
- [ ] A successful plan commits all aggregate, claim, audit, and outbox writes atomically.
- [ ] Operation counts are observable and deterministic.

## Required tests

- Boundary tests immediately below/at/above each application budget.
- Emulator tests for rollback on conflict and injected failure.

## Failure and edge cases

- Late reads, duplicate planned writes, oversized family/group command, retry after transaction conflict.

## Blocked by

- T06 — Introduce CanonicalCommands.execute and the closed command catalog.

## Unlocks

T09, T10, and the Phase-2 gate.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- No partial-write or saga fallback is introduced; decisions are documented.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
