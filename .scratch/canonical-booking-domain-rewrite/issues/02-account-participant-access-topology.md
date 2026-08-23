# T02: Model Account, Participant, management, relationships, and blocks

**Phase:** 1 — Canonical domain contracts  
**Status:** ready-for-agent

## What to build

Define the canonical Account/Participant ownership topology, management permissions, relationship records, and blocking state needed by lesson and Course workflows.

## Scope

- Account and Participant identities, ownership, lifecycle, and revision fields.
- Participant management authority and Instructor-facing access boundaries.
- Canonical relationship and block records with explicit actors and subjects.

## Out of scope

- Command implementations, UI migration, and legacy user/profile compatibility projections.

## Authoritative references

- ADR-0001 — ownership boundaries and Participant topology.
- Canonical rewrite specification and `CONTEXT.md` — access terminology and clean-cutover constraints.

## Acceptance criteria

- [ ] Ownership and management authority are unambiguous for every Participant.
- [ ] Relationship/block contracts cannot grant implicit access.
- [ ] Contracts contain revision/audit linkage required by canonical commands.

## Required tests

- Schema and type tests for owned, managed, blocked, and unauthorized combinations.
- Serialization/validation tests for relationship lifecycle edges.

## Failure and edge cases

- Orphan Participants, self-relationships, duplicate blocks, contradictory manager claims, cross-Account references.

## Blocked by

- T01 — Establish canonical primitives, IDs, paths, and validation.

## Unlocks

T11 and the participant-dependent Booking/Enrollment slices.

## Definition of done

- Targeted tests and repository typecheck/lint/format/build pass; canonical fixtures are added.
- No compatibility behavior or ADR/spec deviation is introduced; implementation decisions are documented.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
