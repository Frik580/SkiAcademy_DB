# T14: Implement AdminIssue core and Booking payment-start gate

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Provide the generic typed AdminIssue command/repository infrastructure and enforce the individual Booking payment-at-start delivery gate through a canonical system command and sanitized delivery result.

## Scope

- Typed AdminIssue repository and command primitives.
- Deterministic versioned issue identity/dedupe and revision/idempotency behavior.
- Kind-governed open, reopen, resolve, and dismiss plumbing; `blocksOutcome`/`blocksDelivery` semantics.
- `payment_required_at_start` detection for individual Bookings, deterministic issue identity, operational restriction, and sanitized Instructor result.
- Eligibility/invariants for the canonical Booking payment-gate system command; resolution only through canonical domain commands.

## Out of scope

- Attendance exceptional-resolution policy, Course gates/conflicts, unrestricted generic dismissal, generic status patching, and scheduler candidate discovery.

## Authoritative references

- ADR-0002 — canonical/system commands, revisions, idempotency, errors, and atomic execution.
- ADR-0003 — canonical service-funding facts.
- ADR-0004 — AdminIssue lifecycle and blocking semantics.
- ADR-0005 — audit/outbox and sanitized access boundaries.

## Acceptance criteria

- [ ] Eligible unpaid individual Booking delivery creates/reuses exactly one versioned `payment_required_at_start` issue and restricts delivery.
- [ ] Funded/ineligible/replayed invocations do not create duplicate issues.
- [ ] Instructor output exposes the canonical restriction without raw financial/admin data.
- [ ] Every transition uses kind policy, expected revision, idempotency, and atomic audit/outbox staging.

## Required tests

- Unit/Emulator tests for create/reuse/reopen/resolve/dismiss policy, stale revision, replay, funded/unfunded eligibility, sanitized output, and rollback.
- Command-adapter authorization tests using the minimal canonical Emulator harness.

## Failure and edge cases

- Concurrent gate checks, funding arriving during evaluation, reused issue key with changed version, unauthorized resolution, dismissal forbidden by kind.

## Blocked by

- T12 — Deliver Payment, Wallet, and monetary-event funding core.
- T13 — Create authenticated and Administrator lesson Bookings.

## Unlocks

T16 and T20; T26 extends this infrastructure and T35 schedules its system command.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- No generic status patch or duplicate issue mechanism exists; ADR-0004 policies are explicit.
- Decisions are documented; Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
