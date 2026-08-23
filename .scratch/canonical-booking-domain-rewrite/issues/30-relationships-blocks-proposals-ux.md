# T30: Migrate relationships, blocks, proposals, and change-request UX

**Phase:** 5 — Frontend and read-model migration  
**Status:** ready-for-agent

## What to build

Expose canonical Participant relationships/blocks and Booking proposal/change-request workflows through focused, revision-aware frontend experiences.

## Scope

- Authorized relationship/block management views.
- Proposal/change-request creation and response views.
- Canonical command errors, stale revision handling, and sanitized state.

## Out of scope

- Generic Booking editing, Course UX, broad shared UI context, and legacy mutation paths.

## Authoritative references

- ADR-0001 — Participant/Booking ownership topology.
- ADR-0002 — command/revision/error behavior.
- ADR-0005 — sanitized access boundaries.
- `CONTEXT.md` — relationship and change-workflow policies.

## Acceptance criteria

- [ ] Every mutation uses the relevant canonical command and expected revision.
- [ ] Blocked/unauthorized users cannot see or perform protected actions.
- [ ] Accepted changes surface the authoritative Booking result without local patch emulation.

## Required tests

- Component/integration tests for authorization, block lifecycle, proposal states, concurrent responses, stale revisions, and stable errors.

## Failure and edge cases

- Request expires while open, underlying Booking changes, duplicate response, access revoked mid-flow.

## Blocked by

- T28 — Establish canonical frontend command and read-model boundary.

## Unlocks

Phase-5 gate and later legacy removal.

## Definition of done

- Targeted UI/integration tests and repository typecheck/lint/format/build pass.
- Feature contracts remain narrow and contain no legacy fallback.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
