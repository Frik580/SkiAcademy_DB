# T18: Implement Family/Group composition and unpaid-addition rollback

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Change family/group Booking composition atomically with Participant authority, capacity, pricing, funding, claims, and a canonical system command that rolls back an eligible unpaid addition.

## Scope

- Add/remove Participant commands with ownership/access/capacity validation.
- Atomic price/funding/monetary effects and revisions/idempotency.
- Canonical unpaid-addition rollback system command with deterministic eligibility and outcome.
- Audit/outbox staging and sanitized results.

## Out of scope

- Scheduler candidate discovery, unbounded groups, partial saga compensation, and legacy group projections.

## Authoritative references

- ADR-0001 — Participant/Booking/Payment topology.
- ADR-0002 — atomic planning, revisions, idempotency, and safety budgets.
- ADR-0003 — service funding and price-change accounting.
- ADR-0005 — audit/outbox durability.
- `CONTEXT.md` — family/group policy.

## Acceptance criteria

- [ ] Composition, price, funding, claims, audit, and outbox change atomically.
- [ ] The rollback command affects only eligible unpaid additions and is replay-safe.
- [ ] Oversized group mutations are rejected before writes, never converted to a saga.

## Required tests

- Emulator tests for add/remove/rollback races, capacity, funding, authorization, replay, and transaction budgets.

## Failure and edge cases

- Duplicate Participant, unauthorized child, removal after delivery, payment arriving during rollback, group above safety budget.

## Blocked by

- T11 — Deliver Participant ownership, Instructor access, and block commands.
- T12 — Deliver Payment, Wallet, and monetary-event funding core.
- T13 — Create authenticated and Administrator lesson Bookings.

## Unlocks

T20 and T35.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- Rollback business logic lives in its canonical system command, not the later scheduler.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
