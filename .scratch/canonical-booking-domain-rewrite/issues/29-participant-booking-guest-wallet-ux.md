# T29: Migrate Participant, Booking, guest, family, Wallet, and cancellation UX

**Phase:** 5 — Frontend and read-model migration  
**Status:** ready-for-agent

## What to build

Move customer lesson workflows to canonical commands/read models so Participants, Bookings, guest actions, family composition, Wallet funding, and cancellation work without legacy runtime paths.

## Scope

- Container-level canonical data/command integration and narrow presentational contracts.
- Authenticated/guest Booking, Wallet/funding, family/group, cancellation, and linking views.
- Revision-aware loading, canonical errors, and authorized/sanitized state.

## Out of scope

- Relationship/proposal UI, Course UI, Administrator operations, and compatibility fallbacks.

## Authoritative references

- ADR-0001 — Participant/Booking/Payment topology.
- ADR-0002 — command errors/revisions.
- ADR-0003 — Wallet/funding semantics.
- Canonical rewrite specification and `CONTEXT.md` — lesson workflows.

## Acceptance criteria

- [ ] Supported lesson/customer workflows invoke only canonical commands.
- [ ] Presentational children receive focused inputs/IDs rather than broad domain/context dependencies.
- [ ] Guest and financial views reveal only authorized information and handle stale/replayed actions.

## Required tests

- Component/container integration tests for authenticated, guest, family, funding, cancellation, error, and stale-revision flows.

## Failure and edge cases

- Expired token, stale Booking, funding rejection, cancellation cutoff, blocked Participant, partial loading/retry.

## Blocked by

- T28 — Establish canonical frontend command and read-model boundary.

## Unlocks

Phase-5 gate and later legacy removal.

## Definition of done

- Targeted UI/E2E tests and repository typecheck/lint/format/build pass.
- Touched UI follows repository feature boundaries; no legacy fallback remains.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
