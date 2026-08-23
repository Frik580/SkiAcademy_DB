# T19: Deliver BookingProposal and BookingChangeRequest workflows

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Let authorized parties propose and respond to Booking changes through explicit versioned workflows that ultimately invoke canonical Booking commands rather than patching state.

## Scope

- Create/accept/reject/expire proposal and change-request commands.
- Deterministic workflow identity, revision/idempotency, authorization, and sanitized read models.
- Accepted workflows invoke existing reschedule/service-change behavior atomically.

## Out of scope

- Generic Booking patching, Course change requests, and frontend migration.

## Authoritative references

- ADR-0001 — Booking ownership/topology.
- ADR-0002 — command, revision, idempotency, transaction, and error model.
- ADR-0005 — audit/outbox and sanitized access boundaries.
- `CONTEXT.md` — proposal/change-request policy.

## Acceptance criteria

- [ ] Only eligible actors can create/respond to a current request version.
- [ ] Accepting a request uses the canonical Booking service-change command and its claims/funding checks.
- [ ] Expired, stale, rejected, or replayed requests cannot apply twice.

## Required tests

- Workflow state-table tests plus Emulator tests for concurrent responses, stale versions, replay, authorization, and atomic acceptance.

## Failure and edge cases

- Two simultaneous accepts, underlying Booking changed, expired proposal, blocked participant, new interval conflict.

## Blocked by

- T13 — Create authenticated and Administrator lesson Bookings.
- T17 — Implement Booking reschedule and Administrator service changes.

## Unlocks

T30 and the complete Phase-3 gate.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- No generic patch or compatibility workflow exists; decisions are documented.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
