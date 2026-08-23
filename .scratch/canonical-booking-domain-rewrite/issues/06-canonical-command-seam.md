# T06: Introduce CanonicalCommands.execute and the closed command catalog

**Phase:** 2 — Command and transaction infrastructure  
**Status:** ready-for-agent

## What to build

Provide the single server-side canonical command seam through which every domain mutation executes with authenticated context, typed input/output, and stable failures.

## Scope

- Closed command catalog and `CanonicalCommands.execute` dispatch boundary.
- Trusted actor/system command context and authorization handoff.
- Stable command-result and error envelopes.
- Test adapter for exercising authorization before final production Rules land.

## Out of scope

- Individual business commands, generic status patching, client-direct canonical writes, and compatibility mutations.

## Authoritative references

- ADR-0002 — command seam, context, and stable errors.
- Canonical rewrite specification — canonical-only execution.

## Acceptance criteria

- [ ] Unknown commands and untrusted contexts fail deterministically.
- [ ] All mutation handlers receive one normalized command context.
- [ ] The catalog prevents arbitrary document/status patch commands.

## Required tests

- Dispatch, authorization-context, error-contract, and Emulator-backed adapter tests.
- Type-level exhaustiveness tests for the closed command catalog.

## Failure and edge cases

- Unknown command, absent actor, forged system context, malformed payload, internal error sanitization.

## Blocked by

- T02, T03, T04, and T05 (Phase 1 gate).

## Unlocks

T07 and T08.

## Definition of done

- Targeted tests and repository typecheck/lint/format/build pass.
- No direct-write escape hatch, compatibility command, or ADR/spec deviation exists.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
