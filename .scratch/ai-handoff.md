# Handoff — main
_Last updated: 2026-08-27T15:22:00+05:00 · Tool: cursor · Session: default_

## Closure Status
- **T27A:** COMPLETE
- **Production committed:** yes
- **Coverage committed:** yes
- **Real Firestore Emulator:** 25/25
- **Cross-domain Emulator:** 156/156
- **Canonical `npm run test:unit`:** root 625 + functions 223
- **Push to origin:** not yet
- **Working tree:** only unrelated `.gitignore` and `.scratch/ai-handoff.md`

## Active Task
T27A (guest CourseEnrollment account linking) is closed; the last blocker was a real post-link authority proof, now committed. Do not start T28 or T31 unless the user explicitly requests them.

## Ticket
- Id: T27A
- Artifact: `.scratch/canonical-booking-domain-rewrite/issues/27a-guest-course-enrollment-account-linking.md`

## Local-Ahead Commit Chain (5 commits, not pushed)
```
0a12cad  feat(courses): implement enrollment reconciliation
0b57a4d  test(courses): complete reconciliation emulator coverage
df0d614  feat(courses): link guest enrollments to accounts
f8158c5  test(courses): complete guest enrollment linking emulator coverage
8b753be  test(courses): prove linked guest account authority
```

## Current State
**Done:**
- Production: `link_guest_course_enrollment_to_account` command + shared-domain extensions (`df0d614`)
- Emulator matrix A–Z + unit coverage (`f8158c5`)
- Post-link authority proof via `request_course_enrollment_cancellation` — Account A succeeds, Account B forbidden, provenance stays guest (`8b753be`, test at `guestCourseEnrollmentLinkCommands.emulator.test.ts` ~1915)
- T27A emulator: **25 passed / 0 skipped / 0 failed** (canonical gate: `firebase emulators:exec`)
- Cross-domain regressions run isolated/sequential (156 total); lifecycle emulator fix: `guestActionTokenSecret` in `courseEnrollmentLifecycleCommands.emulator.test.ts:createCommands`
- `npm run test:unit`: root **625** + functions **223** passed; ESLint clean on T27A files
- Builds: `packages/shared-domain` + `functions` succeed

**In flight:**
- Nothing required for T27A closure

**Tried and rejected:**
- Link idempotent replay as post-link authority proof — insufficient; link command has guest-credential/first-link semantics, not normal Account CourseEnrollment authority
- `withdraw_course_enrollment` for authority test — wrong lifecycle (`invalid_transition`)
- Mega-batch cross-domain emulator (9 suites in one `emulators:exec`) — one flake on T27 reconciliation test D; per-suite runs are green

## Next Steps
1. If user wants remote backup, push from `main` (branch is **ahead 5** of `origin/main`; includes T27A commits — do not amend `df0d614`, `f8158c5`, `8b753be`):

```powershell
git push
```

2. Do **not** start T28/T31 unless explicitly requested
3. If resuming course-domain work, confirm ticket with user before picking the next implementation artifact

## Key Decisions
- **Decision:** Credential expiry = `course.scheduleProjection.finalCourseDayEndsAt`; `now >= expiresAt` expired · **Why:** T27A artifact · **Alternative considered:** Extend linkability for `pending_cancellation` past course end — rejected; lifecycle may be linkable in principle but credential validity is an additional gate
- **Decision:** Post-link authority proven with `request_course_enrollment_cancellation` (`client_callable`) · **Why:** Normal Account-authorized lifecycle command; routes through `assertAuthenticatedCourseCancellationAuthorization` → `assertAuthorizedParticipantManager` · **Alternative considered:** Link replay — rejected as insufficient
- **Decision:** `promote_guest` allowed after course start; participant-changing link forbidden at/after start or when attendance exists · **Why:** participant identity unchanged vs migration semantics
- **Architectural invariant:** Historical provenance != current authority: `bookingOrigin`/`bookedBy` stay guest permanently; after linking, Account authority comes from ParticipantManagement.

## Open Questions
- [ ] Should `main` (5 commits ahead) be pushed to `origin/main`?
- [ ] What ticket follows T27A if not T28/T31?

## Verification
- Commands run:

T27A emulator (25/25 pass):

```powershell
npx firebase emulators:exec --only firestore "npx vitest run --config functions/vitest.config.ts functions/src/canonical/courses/guestCourseEnrollmentLinkCommands.emulator.test.ts --no-file-parallelism --testTimeout=30000 --hookTimeout=30000 --reporter=verbose"
```

Cross-domain emulator suites (isolated) → **156/156 pass**

Unit gate (625 + 223 pass):

```powershell
npm run test:unit
```

Build (shared-domain + functions) → pass

ESLint on T27A changed files → pass

- Result: pass (T27A complete)

## Working Environment
- Branch: `main` · Base: `origin/main` (**ahead 5**)
- Commands to run:

T27A emulator:

```powershell
npx firebase emulators:exec --only firestore "npx vitest run --config functions/vitest.config.ts functions/src/canonical/courses/guestCourseEnrollmentLinkCommands.emulator.test.ts --no-file-parallelism --testTimeout=30000 --hookTimeout=30000 --reporter=verbose"
```

Unit gate:

```powershell
npm run test:unit
```

- Known broken / skipped: Do not run T27A emulator via bare `vitest` + `FIRESTORE_EMULATOR_HOST` — hooks timeout without `firebase emulators:exec`
- Changed files (`git diff --stat HEAD`):

```
 .gitignore | 4 +++-
 1 file changed, 3 insertions(+), 1 deletion(-)
```

- Untracked: `.scratch/ai-handoff.md` only (do not commit unless user asks)

## Context for the next tool (3-5 sentences)
Cursor wrote this handoff after closing T27A guest CourseEnrollment linking. All production and test work is committed on `main` (five local-ahead commits: reconciliation + T27A link/authority); the working tree only has an unrelated `.gitignore` edit and this handoff file. The final authority regression lives in `guestCourseEnrollmentLinkCommands.emulator.test.ts` and proves that after `promote_guest` link, Account A can run `request_course_enrollment_cancellation` while historical `bookingOrigin`/`bookedBy` remain guest and Account B is forbidden. Authorization for that command uses ParticipantManagement via `courseEnrollmentLifecycleAuthorization.ts` and `participantAccessAuthorization.ts` — no production fix was required. Do not start T28/T31; ask the user before picking the next ticket or pushing.
