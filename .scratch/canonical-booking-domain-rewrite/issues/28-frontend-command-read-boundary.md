# T28: Establish canonical frontend command and read-model boundary

**Phase:** 5 — Frontend and read-model migration  
**Status:** ready-for-agent

## What to build

Give frontend containers one typed boundary for invoking canonical commands and consuming authorized read models, including stable error and stale-revision behavior.

## Scope

- Typed command client/result mapping and authenticated context propagation.
- Authorized read-model/query seam and revision-aware cache/update behavior.
- Stable command-error presentation contracts for feature containers.

## Out of scope

- Feature-specific UI migration, direct Firestore writes, raw Activity Log access, and compatibility adapters.

## Authoritative references

- ADR-0002 — command seam, revisions, and stable errors.
- ADR-0005 — sanitized read-model/access boundaries.
- Canonical rewrite specification — canonical-only frontend phase.

## Acceptance criteria

- [ ] Frontend mutations can only use the canonical command client.
- [ ] Stale revisions and stable errors map predictably without exposing internals.
- [ ] Read models are explicit, authorized, and do not expose raw canonical storage indiscriminately.

## Required tests

- Client contract, error mapping, stale/retry, authorization, and container integration tests.

## Failure and edge cases

- Offline retry, stale cached revision, unknown stable error, expired auth, malformed read model.

## Blocked by

- T27 — Verify and reconcile Course, Attendance, capacity, and claims.

## Unlocks

T29, T30, T31, T32, and T33.

## Definition of done

- Targeted UI/integration tests and repository typecheck/lint/format/build pass.
- No direct-write or dual-read compatibility seam exists; feature contracts remain narrow.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
