# T24: Implement Course transfer, cancellation, withdrawal, and capacity freeze

**Phase:** 4 — Course vertical slice  
**Status:** ready-for-agent

## What to build

Change or end an individual CourseEnrollment through explicit transfer, enrollment-cancellation, withdrawal, and capacity-freeze policies with atomic financial/capacity effects.

## Scope

- CourseEnrollment transfer, eligible cancellation, withdrawal, and capacity-freeze commands.
- Atomic old/new capacity guards and Payment/Wallet adjustments.
- Revision/idempotency, audit/outbox, and sanitized outcomes.

## Out of scope

- Whole-Course cancellation semantics, generic status patching, UI, and saga compensation.

## Authoritative references

- ADR-0001 — CourseEnrollment/Payment topology.
- ADR-0002 — atomic commands, guards, revisions, idempotency, and safety budgets.
- ADR-0003 — refunds, funding, and financial corrections.
- Canonical rewrite specification and `CONTEXT.md` — explicit exclusion of whole-Course cancellation.

## Acceptance criteria

- [ ] Transfer moves capacity/funding atomically or changes nothing.
- [ ] Cancellation/withdrawal follows the authoritative enrollment policy and preserves immutable financial history.
- [ ] Capacity freeze prevents ineligible new enrollment without fabricating cancellation behavior.

## Required tests

- Policy-matrix and Emulator tests for capacity races, transfer rollback, funding delta, replay, stale revision, and freeze boundaries.

## Failure and edge cases

- Target Course full, transfer after cutoff, already withdrawn enrollment, concurrent freeze/enroll, oversized transfer plan.

## Blocked by

- T23 — Create atomic CourseEnrollments for account, guest, and admin flows.

## Unlocks

T26 and T27.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- Whole-Course cancellation, compatibility behavior, and saga fallback remain absent.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
