# T39: Remove all legacy runtime paths and prove the repository scan clean

**Phase:** 7 — Clean cutover  
**Status:** ready-for-agent

## Production policy (2026-09-08 alignment)

T39 is the Phase-7 ticket for **physical legacy-runtime cleanup**. It aligns with `T32.9B` and starts only after `T32.9A.9E PASS` (which itself requires 9P / 9D0 / 9D).

If deletion discovers a useful product capability without a canonical/approved replacement:

```text
STOP
→ parity inventory incomplete
→ return the problem to canonical migration
```

T39 must not become a product-feature deletion phase. Chat/Homework under `bookings/{threadId}/messages`, reviews/rating, notifications, profile, auth, participants, finance, and assets remain in-scope 9P protections.

Empty-database T38 rehearsal does not unlock T39 on its own.

## What to build

Delete the remaining legacy Booking/Course, transaction, availability-lock, mutation, Rules/index, scheduler, and compatibility runtime paths, then prove only canonical behavior remains.

## Scope

- Remove legacy types/services/stores/callables/jobs/Rules/indexes/tests and dead dependencies, including availability compatibility, guest_wallet/USD compatibility, V1 adapters, and dead fixtures.
- Replace remaining callers with already-completed canonical seams or delete obsolete behavior.
- Automated forbidden-symbol/path/query scan and full canonical regression suite.

## Out of scope

- Adding compatibility shims, historical transactional leftover-lesson migration, new domain semantics, whole-Course cancellation, production full reset, and deleting a useful capability that 9P has not marked PASS.

## Authoritative references

- Canonical rewrite specification — incremental production amendment, no dual-read/write, leftover-removal sequence.
- [T32_CANONICAL_ADMIN_AUDIT.md](../../../docs/T32_CANONICAL_ADMIN_AUDIT.md) — T32.9B / 9E / 9P.
- ADR-0008 — UX preservation; STOP rule.

## Acceptance criteria

- [ ] Repository scan finds no unapproved leftover collection, type, command, callable, query, lock, or projection usage; retained matches are classified.
- [ ] Application builds and canonical unit/Emulator/E2E suites pass after deletion.
- [ ] No compatibility alias, fallback, or dormant dual-write path remains.
- [ ] 9P PASS rows still work after deletion (reviews, chat/homework, notifications, profile, auth, participants, finance, assets included).

## Required tests

- Full repository typecheck/lint/format/build and test suite.
- Forbidden-token/import/query scan plus canonical smoke/E2E and Rules tests.

## Failure and edge cases

- Dynamic leftover path, test-only leftover helper, stale scheduled export, dead-but-bundled code, hidden direct Firestore write, useful capability without replacement.

## Blocked by

- T32.9A.9E PASS
- T32.9A.9P PASS
- T38 remains useful nonproduction evidence but is not a production unlock.

## Unlocks

T40.

## Definition of done

- Full suite and repository scan pass; removed paths and retained canonical replacements are documented.
- No compatibility work, whole-Course cancellation, historical legacy-lesson migration, or saga substitution is introduced.
- Graphify update is attempted if available; failure is documented but non-blocking; changes are ready for `$code-review`.
