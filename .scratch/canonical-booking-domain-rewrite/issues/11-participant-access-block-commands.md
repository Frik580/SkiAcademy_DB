# T11: Deliver Participant ownership, Instructor access, and block commands

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Let authorized Accounts manage Participants and relationship/block state through canonical commands while exposing only the access needed for later Booking delivery.

## Scope

- Create/update Participant and management-assignment commands.
- Relationship and block lifecycle commands with revisions/idempotency.
- Authorized Account/Instructor read models and command-adapter authorization.
- Atomic audit/outbox obligations for state changes.

## Out of scope

- Booking creation, broad shared UI context, legacy UserProfile mutations, and permissive production Rules.

## Authoritative references

- ADR-0001 — Account/Participant ownership topology.
- ADR-0002 — canonical commands, revisions, idempotency, and errors.
- ADR-0005 — audit/outbox durability and access boundaries.

## Acceptance criteria

- [ ] Only an authorized manager can mutate a Participant or relationship.
- [ ] A block has deterministic lifecycle behavior and immediately affects access decisions.
- [ ] Instructor results contain only authorized Participant data.

## Required tests

- Unit and Emulator-backed command-adapter tests for owner, manager, Instructor, blocked, stale, and replay paths.
- Audit/outbox atomicity assertions.

## Failure and edge cases

- Orphan/cross-Account Participant, conflicting manager, duplicate block, stale unblock, unauthorized Instructor lookup.

## Blocked by

- T09 — Implement exact interval claims and uniqueness guards.
- T10 — Stage immutable Activity Logs and deterministic outbox obligations.

## Unlocks

T13 and T18.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- No legacy user/profile write or compatibility projection remains in the slice.
- Decisions are documented; Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
