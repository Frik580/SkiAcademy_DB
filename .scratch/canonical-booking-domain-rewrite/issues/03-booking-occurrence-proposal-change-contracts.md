# T03: Model Booking, occurrence, proposals, and change requests

**Phase:** 1 — Canonical domain contracts  
**Status:** ready-for-agent

## What to build

Define the canonical individual/family Booking aggregate and its occurrence, proposal, and change-request contracts without retaining Course-shaped Booking behavior.

## Scope

- Booking identity, parties, service interval, status, funding references, and revision.
- Occurrence and family/group composition representation.
- BookingProposal and BookingChangeRequest identities and lifecycle contracts.

## Out of scope

- CourseEnrollment semantics, commands, UI, or whole-Course cancellation.

## Authoritative references

- ADR-0001 — Booking aggregate topology and ownership boundaries.
- Canonical rewrite specification and `CONTEXT.md` — Booking vocabulary and lifecycle.

## Acceptance criteria

- [ ] A Booking is structurally distinct from Course/CourseEnrollment.
- [ ] Proposal/change contracts cannot patch aggregate status generically.
- [ ] Revision, financial, Attendance, and claim references are explicit.

## Required tests

- Contract validation and serialization tests across Booking kinds and lifecycle states.
- Negative type/fixture tests proving legacy Course-shaped Booking data is rejected.

## Failure and edge cases

- Empty groups, duplicate Participants, invalid intervals, conflicting lifecycle fields, stale proposal versions.

## Blocked by

- T01 — Establish canonical primitives, IDs, paths, and validation.

## Unlocks

T13 and all lesson workflow tickets.

## Definition of done

- Targeted tests and repository typecheck/lint/format/build pass; canonical fixtures are added.
- Clean-cutover and no-compatibility constraints hold; decisions are documented.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
