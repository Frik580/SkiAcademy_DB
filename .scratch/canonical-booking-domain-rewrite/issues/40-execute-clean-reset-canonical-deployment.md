# T40: Execute the clean Firestore reset, seed, and canonical deployment

**Phase:** 7 — Clean cutover  
**Status:** ready-for-agent

## What to build

Execute the approved guarded production cutover exactly as rehearsed: verified export, Firestore/Storage reset, canonical release deployment, seed, and release-manifest capture.

## Scope

- Formal preflight/authorization, backup verification, maintenance coordination, and exact target confirmation.
- Execute approved reset and deploy the T38 release bundle.
- Capture immutable operator evidence, versions, timestamps, and immediate smoke results.

## Out of scope

- Historical transactional migration/import, ad hoc repair, dual-read/write rollback mode, compatibility projection, and unapproved target deletion.

## Authoritative references

- Canonical rewrite specification — clean reset/cutover and release sequence.
- T37 guarded tooling and T38 exact rehearsed release manifest.
- ADR-0005 — audit/release evidence policy.

## Acceptance criteria

- [ ] Explicit production authorization and verified recoverable export exist before reset.
- [ ] Exact project/environment identifiers and manifest match the successful T38 rehearsal.
- [ ] Firestore/Storage contain only canonical seed/runtime data after deployment.
- [ ] Immediate Rules, command, scheduler, outbox, and smoke checks pass or the approved recovery procedure is invoked.

## Required tests

- Preflight/dry-run verification and the exact post-deploy smoke subset recorded by T38.
- Independent manifest/version and empty-before-seed verification.

## Failure and edge cases

- Wrong target, export mismatch, partial reset, deploy drift, failed seed, unavailable worker/scheduler, failed smoke test.

## Blocked by

- T39 — Remove all legacy runtime paths and prove the repository scan clean.

## Unlocks

T41.

## Definition of done

- Approved cutover checklist and evidence are complete; deployed version matches the rehearsed manifest.
- No historical migration, compatibility mode, or unplanned mutation occurs.
- Graphify is best-effort and non-blocking; operational handoff is ready for `$code-review`/release review.
