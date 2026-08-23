# T35: Implement canonical-command scheduler adapters

**Phase:** 6 — Rules, jobs, reliability, and cutover tooling  
**Status:** ready-for-agent

## What to build

Run scheduled canonical maintenance by discovering eligible candidates and invoking the already-implemented system commands for guest expiry, payment gates, unpaid-addition rollback, and Attendance outcomes.

## Scope

- Bounded candidate discovery, pagination/checkpointing, invocation, retry, metrics, and least-privilege system context.
- Adapters for T15 guest expiry, T14 payment gate, T18 unpaid-addition rollback, and T20 outcome resolution.
- Operational handling of stable command results/errors.

## Out of scope

- Reimplementing eligibility/invariants/transitions, direct document mutation, issue creation logic, financial logic, or silent repair.

## Authoritative references

- ADR-0002 — system command context, idempotency, stable errors, and transaction model.
- ADR-0003 — funding facts owned by invoked commands.
- ADR-0004 — payment gate/Attendance/outcome policies owned by invoked commands.
- ADR-0005 — outbox/audit and operational observability boundaries.

## Acceptance criteria

- [ ] Each job performs only `candidate discovery -> invoke existing canonical system command`.
- [ ] Duplicate/overlapping runs are safe because the invoked commands own idempotency and eligibility.
- [ ] Failures are observable/retryable without direct corrective writes.
- [ ] Tests prove scheduler adapters contain no duplicated domain transition logic.

## Required tests

- Fake-clock and Emulator tests for pagination, overlapping runs, retry, poison candidates, system authorization, and each command adapter.

## Failure and edge cases

- Candidate becomes ineligible before invocation, duplicate page, job timeout, stable conflict error, one failing candidate among many.

## Blocked by

- T29, T30, T31, T32, and T33 — complete Phase-5 frontend/read-model gate.

## Unlocks

T38.

## Definition of done

- Targeted scheduler/Emulator tests and repository typecheck/lint/format/build pass.
- No business-rule duplication or direct-write escape hatch exists.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
