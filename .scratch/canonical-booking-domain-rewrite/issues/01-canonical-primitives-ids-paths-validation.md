# T01: Establish canonical primitives, IDs, paths, and validation

**Phase:** 1 — Canonical domain contracts  
**Status:** ready-for-agent

## What to build

Establish the shared canonical vocabulary for aggregate identifiers, timestamps, revisions, money, collection paths, validation results, and stable command errors so every later slice speaks the same language without importing legacy shapes.

## Scope

- Branded canonical identifiers and aggregate-reference rules.
- KZT-safe monetary primitives and timestamp/interval conventions.
- Canonical collection/path vocabulary and validation boundaries.
- Stable command-error taxonomy and transport-safe error representation.

## Out of scope

- Aggregate-specific behavior; compatibility aliases, dual-read/write, or migration adapters.

## Authoritative references

- ADR-0001 — aggregate identities and physical canonical topology.
- ADR-0002 — stable command errors.
- Canonical rewrite specification — clean-cutover constraints.

## Acceptance criteria

- [ ] Canonical primitives reject malformed IDs, paths, revisions, intervals, and non-KZT money.
- [ ] Stable errors are deterministic and do not expose internal data.
- [ ] New contracts have no dependency on legacy transaction or Course-shaped Booking models.

## Required tests

- Unit/property tests for validation boundaries, money, interval ordering, paths, and error serialization.
- Typecheck and contract compilation tests.

## Failure and edge cases

- Empty/cross-type IDs, invalid timestamps, negative or fractional minor units, reversed intervals, unknown error codes.

## Blocked by

None (can start immediately).

## Unlocks

T02, T03, T04, and T05.

## Definition of done

- Targeted tests and repository typecheck/lint/format/build pass; canonical fixtures are added.
- No compatibility behavior or ADR/spec deviation is introduced; implementation decisions are documented.
- Graphify is updated when available and useful; launcher failure is documented and is not blocking.
- Changes are ready for `$code-review`.
