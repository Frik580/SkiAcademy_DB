# T34: Replace Firestore/Storage Rules and canonical indexes

**Phase:** 6 — Rules, jobs, reliability, and cutover tooling  
**Status:** ready-for-agent

## What to build

Replace production Firestore/Storage authorization and indexes with canonical-topology rules that permit approved reads and command infrastructure while rejecting legacy/direct client mutation paths.

## Scope

- Canonical Firestore and Storage Rules for Account, Participant, Booking, CourseEnrollment, Attendance, financial, issue, audit, outbox, and projection data.
- Required canonical query indexes and Emulator authorization matrix.
- Explicit denial of raw audit/internal and client-direct canonical mutation access.

## Out of scope

- Permissive transitional Rules, scheduler/business logic, compatibility collections, and deployment execution.

## Authoritative references

- ADR-0001 — physical canonical topology and ownership boundaries.
- ADR-0002 — server command boundary and trusted command context.
- ADR-0005 — audit/outbox/read-model access boundaries.
- Canonical rewrite specification — clean cutover and no dual-read/write.

## Acceptance criteria

- [ ] Authorized canonical reads succeed and unauthorized/cross-subject reads fail.
- [ ] Client-direct domain, financial, AdminIssue, Activity Log, and outbox writes fail.
- [ ] Raw Activity Logs remain Administrator/internal only.
- [ ] Required canonical queries pass with committed indexes; no legacy index is relied upon.

## Required tests

- Comprehensive Firestore/Storage Emulator allow/deny matrix and canonical query/index tests.
- Regression tests proving earlier command adapters still work without permissive production Rules.

## Failure and edge cases

- Cross-Account Participant, Instructor overreach, guest token misuse, raw audit read, client financial write, obsolete legacy query.

## Blocked by

- T29, T30, T31, T32, and T33 — complete Phase-5 frontend/read-model gate.

## Unlocks

T38.

## Definition of done

- Rules/index Emulator suites and repository typecheck/lint/format/build pass.
- No permissive transition rule, compatibility collection, or raw-log exposure exists.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
