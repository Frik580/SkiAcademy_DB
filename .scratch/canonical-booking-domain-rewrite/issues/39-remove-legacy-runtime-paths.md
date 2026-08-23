# T39: Remove all legacy runtime paths and prove the repository scan clean

**Phase:** 7 — Clean cutover  
**Status:** ready-for-agent

## What to build

Delete the remaining legacy Booking/Course, transaction, availability-lock, mutation, Rules/index, scheduler, and compatibility runtime paths, then prove only canonical behavior remains.

## Scope

- Remove legacy types/services/stores/callables/jobs/Rules/indexes/tests and dead dependencies.
- Replace remaining callers with already-completed canonical seams or delete obsolete behavior.
- Automated forbidden-symbol/path/query scan and full canonical regression suite.

## Out of scope

- Adding compatibility shims, historical transactional migration, new domain semantics, whole-Course cancellation, and production reset.

## Authoritative references

- Canonical rewrite specification — clean cutover, no dual-read/write, and legacy-removal sequence.
- All ADRs — canonical topology and invariant boundaries that remain after removal.

## Acceptance criteria

- [ ] Repository scan finds no approved legacy collection, type, command, callable, query, lock, or projection usage.
- [ ] Application builds and canonical unit/Emulator/E2E suites pass after deletion.
- [ ] No compatibility alias, fallback, or dormant dual-write path remains.

## Required tests

- Full repository typecheck/lint/format/build and test suite.
- Forbidden-token/import/query scan plus canonical smoke/E2E and Rules tests.

## Failure and edge cases

- Dynamic legacy path, test-only legacy helper, stale scheduled export, dead-but-bundled code, hidden direct Firestore write.

## Blocked by

- T38 — Build canonical seed, cutover verifier, release manifest, and empty-database rehearsal.

## Unlocks

T40.

## Definition of done

- Full suite and repository scan pass; removed paths and retained canonical replacements are documented.
- No compatibility work, whole-Course cancellation, historical migration, or saga substitution is introduced.
- Graphify update is attempted if available; failure is documented but non-blocking; changes are ready for `$code-review`.
