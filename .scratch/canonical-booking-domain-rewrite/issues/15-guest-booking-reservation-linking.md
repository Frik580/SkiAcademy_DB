# T15: Deliver guest Booking reservation, confirmation, token action, and linking

**Phase:** 3 — Complete lesson vertical slice  
**Status:** ready-for-agent

## What to build

Let a guest securely reserve and confirm a canonical lesson Booking, act through bounded tokens, expire an abandoned reservation, and later link it to an Account without weakening canonical ownership or funding rules.

## Scope

- Guest reservation/confirmation commands and bounded capability tokens.
- Canonical guest-expiry system command with eligibility, invariants, idempotency, claim/funding release, audit, and outbox.
- Authorized token actions and Account linking without identity duplication.

## Out of scope

- Scheduler candidate discovery, provider adapters, broad bearer access, and guest compatibility collections.

## Authoritative references

- ADR-0001 — Booking/Participant ownership topology.
- ADR-0002 — canonical/system commands, claims, revisions, idempotency, and errors.
- ADR-0003 — funding facts and release accounting.
- ADR-0005 — audit/outbox and access boundaries.
- Canonical rewrite specification and `CONTEXT.md` — guest workflow/security policy.

## Acceptance criteria

- [ ] Reservation, confirmation, expiry, and linking are replay-safe canonical commands.
- [ ] Tokens authorize only their intended Booking action and never reveal raw audit/financial data.
- [ ] Expiry atomically releases canonical claims/funding obligations and cannot expire an ineligible Booking.

## Required tests

- Emulator tests for token scope/expiry/replay, concurrent confirm-vs-expire, linking, claim release, and audit/outbox atomicity.

## Failure and edge cases

- Forged/reused token, already-linked guest, funding race, expired confirmation, concurrent scheduler/user action.

## Blocked by

- T12 — Deliver Payment, Wallet, and monetary-event funding core.
- T13 — Create authenticated and Administrator lesson Bookings.

## Unlocks

T29 and T35.

## Definition of done

- Targeted/Emulator tests and repository typecheck/lint/format/build pass.
- Guest expiry business logic lives in its canonical system command, not the later scheduler.
- No compatibility flow exists; Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
