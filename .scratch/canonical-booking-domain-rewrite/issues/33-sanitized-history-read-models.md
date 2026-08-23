# T33: Deliver sanitized history and read-model projections

**Phase:** 5 — Frontend and read-model migration  
**Status:** ready-for-agent

## What to build

Deliver rebuildable, server-side sanitized Account, Participant, and Instructor history projections through an authorized query seam and corresponding frontend views.

## Scope

- Sanitized subject-specific history projection contracts and rebuild behavior.
- Authorized API/query seam and frontend history views.
- Subject, financial, and administrative redaction with stable pagination/order.

## Out of scope

- Raw Activity Log exposure to ordinary users/Instructors, canonical truth stored in projections, direct client audit queries, and compatibility history.

## Authoritative references

- ADR-0005 — raw Activity Logs are Administrator/internal only; sanitized read models, audit access, and rebuildable projection policy.
- ADR-0001 — subject/aggregate topology used for projection scoping.
- Canonical rewrite specification — canonical frontend/read-model cutover.

## Acceptance criteria

- [ ] Account, Participant, and Instructor histories expose only authorized sanitized facts.
- [ ] Raw Activity Log records never cross the ordinary frontend API boundary.
- [ ] Projections can be discarded/rebuilt deterministically without becoming transactional truth.
- [ ] Financial/admin/other-subject details are redacted by policy.

## Required tests

- Projection rebuild/equivalence tests, authorization/redaction matrices, pagination/order tests, and frontend integration tests.

## Failure and edge cases

- Shared event with multiple subjects, deleted/blocked relationship, partial rebuild, duplicate outbox delivery, unauthorized page cursor reuse.

## Blocked by

- T28 — Establish canonical frontend command and read-model boundary.

## Unlocks

Phase-5 gate, T34–T37, and legacy history removal.

## Definition of done

- Targeted projection/UI tests and repository typecheck/lint/format/build pass.
- ADR-0005 raw-log restriction is proven by tests; projection remains rebuildable.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
