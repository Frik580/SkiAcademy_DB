# T37: Build guarded export, Firestore reset, Storage reset, and release-version tooling

**Phase:** 6 — Rules, jobs, reliability, and cutover tooling  
**Status:** ready-for-agent

## What to build

Provide explicit, environment-guarded tooling to export for recovery, reset Firestore and Storage, and bind a canonical release version without acting as a historical migration path.

## Scope

- Pre-reset export/manifest, environment/project verification, confirmation gates, and dry-run reporting.
- Exact canonical Firestore/Storage reset scopes and release-version recording.
- Failure recovery instructions and auditable operator output.

## Out of scope

- Executing production reset in this ticket, transforming/importing historical transactional data, dual-read/write, and broad unverified deletion.

## Authoritative references

- Canonical rewrite specification — clean reset/cutover, no historical transactional migration, and legacy-removal sequence.
- ADR-0001 — physical canonical topology used to verify reset scope.
- ADR-0005 — audit/release evidence boundaries.

## Acceptance criteria

- [ ] Dry run prints exact project/environment/scopes and refuses ambiguous or unapproved targets.
- [ ] Export and release manifests are deterministic and independently verifiable.
- [ ] Reset tooling cannot be repurposed as a compatibility import/migration.
- [ ] Emulator/nonproduction drills prove Firestore and Storage scopes without touching production.

## Required tests

- Unit/integration tests for environment guards, target resolution, dry run, partial failure, rerun, export verification, and nonproduction reset drill.

## Failure and edge cases

- Wrong project, missing confirmation, incomplete export, Storage-only failure, interrupted reset, mismatched release version.

## Blocked by

- T29, T30, T31, T32, and T33 — complete Phase-5 frontend/read-model gate.

## Unlocks

T38.

## Definition of done

- Tooling tests and repository typecheck/lint/format/build pass; nonproduction rehearsal evidence is recorded.
- No production reset, compatibility import, or historical migration is performed.
- Graphify is best-effort and non-blocking; changes are ready for `$code-review`.
