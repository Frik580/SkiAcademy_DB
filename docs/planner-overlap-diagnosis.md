# Planner overlap diagnosis — 2026-10-22

Verdict: DONE for the source fixes and read-only incident diagnosis. The reported pair has no UTC overlap; the apparent conflict came from mixing timezones in one grid. Authenticated end-to-end workflow and historical deployed build versions remain NOT VERIFIED.

## Confirmed UI cause and changes

`ScheduleTimetableCells` used the first matching Booking/course and skipped every hour covered by its colSpan. Booking 08:00–11:00 therefore suppressed Booking 10:00–12:00; a CourseDay could suppress a Booking too. Mobile used a single `.find()` result per start slot, losing equal-start events. Week uses an event map and retains both.

`scheduleDayEvents` retains each entity, sorts intervals and marks conflicts with half-open `[start,end)` semantics. Days with conflicts, multiple entities in one hourly cell, or events outside 08:00–19:00 use a chronological list in natural document flow. Desktop uses one valid table cell spanning the eleven time columns; mobile uses the same list. Normal hourly days keep their grid. Each Booking keeps its object/ID and existing action handler; CourseDay uses the extracted existing course card and notification details. Conflict labels are RU/EN. Participant names from the existing projection and exact fractional-hour duration survive mapping. All Booking, block and CourseDay intervals now use the planner timezone in day/week mapping. Create, reschedule and reassignment use that same zone for entered wall times; reassignment compares the original UTC instant converted into the display zone, preventing an unintended schedule change.

## Confirmed backend defect

`planSwapBookingOccurrenceClaims` planned acquisition and release from the same persisted Guard snapshot. `commitPlannedBookingOccurrenceClaimSwap` wrote acquisition first, then release. When old and new occurrences shared a UTC Guard bucket, the final release overwrote the new entry. The new Claim remained active while its Guard occupancy disappeared. A subsequent canonical creation could therefore accept a conflicting Booking.

Regression: create a Booking, administratively reschedule it from 09:00 to 10:00 on the same date, then create a different participant Booking at 10:00 for the same instructor. Before the fix, creation incorrectly succeeded; after the fix it returns `instructor_conflict`.

The fix puts planned releases into the existing in-transaction overlay, plans acquisition against that overlay, and uses the existing batch planner/committer to write each final Guard once. Planning budget is coalesced too. The shared swap covers reschedule, instructor reassignment and duration changes. Authenticated and guest creation already acquire instructor Claims through the existing engine; no parallel conflict checker was added. Scope-derived Guard identities remain unchanged: LIVE and TEST intentionally do not reserve each other's capacity. UTC intervals remain authoritative. Completion/no_show attendance paths do not call `planReleaseBookingClaims`; visualization of terminal Booking is distinct from admission checks.

## Historical incident: verified by direct staging reads

Both IDs supplied by the user exist in `ski-school-staging`. Both use `dataScope: live`, no testSessionId, instructor `c12331929f72858f191cf26b5a043c9e2b3f0d4a150513a05ac6b131bd661087`, and scheduleRevision 1.

| Booking                                    | Canonical UTC interval on 2026-10-22 | Stored timezone/local interval | Current lifecycle/revision | Display in Asia/Qyzylorda |
| ------------------------------------------ | ------------------------------------ | ------------------------------ | -------------------------- | ------------------------- |
| `booking_9682fd1e850846cd946c3437b7049f1b` | 03:00–06:00                          | Asia/Qyzylorda / 08:00–11:00   | completed / 2              | 08:00–11:00               |
| `booking_ce7ae3207d90439d82bdee47751a3d9c` | 07:00–09:00                          | Europe/Istanbul / 10:00–12:00  | no_show / 4                | 12:00–14:00               |

There is a one-hour UTC gap. Both instructor Claims are active, match the Booking intervals and occur together in Guard `2b8d6a636b2d44bf177c92c9cf2e69ce47511b9db8c19395f00202e1d173e7fb`. Neither booking was rescheduled (scheduleRevision 1). This pair did not bypass ResourceClaimGuard; the independent swap bug above is not its cause. The second Booking currently has no_show status, differing from the initial description.

The first Booking has four participantIds; the second has one, equal to the fourth participant of the first. Raw scoped documents, exact participantIds/occurrenceIds/Claims/Guard and Audit evidence are saved locally in `.scratch/planner-overlap/staging-direct.json` (not added to Git).

Audit and idempotency documents confirm:

| Booking/action                                                    | commandId                                                          | Execution time UTC      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| A create_confirmed_booking                                        | `56ec16f21d645cfbd9c25f7045ca39e3b1da3cdd11f31f18c11e55ad575a7556` | 2026-10-21 15:56:59.964 |
| A record_booking_attendance / completed                           | `8e4924265dd58ce5aad6a8476e8426e0f00b3aea67193a34c9c7efdeeb056374` | 2026-10-22 11:41:01.859 |
| B create_confirmed_booking                                        | `78da6be70f3742919679abd4d3b24627a209239422af9c55eb576de5e54afb6a` | 2026-10-22 06:56:16.064 |
| B record_booking_attendance / administrator correction to no_show | `79b72f73a99a106463c1806de4560c06e6f9cb0e248ad9b8fb1d04787645e827` | 2026-10-22 12:57:31.712 |

Creation sources are client_callable / parent_guardian. Audit schema is audit:v1; command records are idempotency:v2. Historical deployed function build/version is not recorded in those documents and was not verified from Cloud Logging; no inference about a deployed build is made.

Diagnostics used direct GETs and bounded queries (limit 101, abort on cap) by exact owner/resource. No scan, drain, polling or write. Audit IDs were derived using `activityLogIdFromCommandId`. Initial range query incorrectly used Firestore timestampValue against canonical map-shaped `{seconds,nanoseconds}` fields and returned zero; that result was invalid as evidence of absence and is superseded by direct reads. Follow-up range diagnostics must query the numeric `.seconds` field.

## Safe reconciliation / remaining diagnostic plan

No reconciliation is needed for this pair: authoritative intervals and Guards agree. Do not change stored timezone, interval, terminal lifecycle, financial data or Attendance to match the old mixed-zone display.

If auditing other historical reschedules is separately approved, preserve snapshots, derive scoped Claim/Guard IDs and produce a read-only dry-run manifest of missing/stale Guard entries. Any writes require a separate approved slice; real overlapping historical claims need an explicit product decision before reconstruction. Never replay money-affecting commands. Historical deployed versions can be investigated from execution logs if required; source findings alone do not establish deployment state.

## Changed files / purpose

- `src/features/admin/components/schedule/scheduleDayViewPlacement.ts`, `scheduleUtils.ts`, `scheduleOverlap.ts`: common half-open overlap rule, all-event enumeration, conflict marks and alternate-layout selection.
- `ScheduleConflictDay.tsx`, `ScheduleCourseCell.tsx`, `ScheduleTimetableCells.tsx`, `ScheduleCalendar.tsx`: shared conflict list for desktop/mobile, preserved course card and ordinary grid/week behavior.
- `ScheduleBookingCell.tsx`, `scheduleContracts.ts`, `scheduleCoursePresentation.ts`, `src/lib/i18n/translations.ts`: wrapping participant title, focused label contract, safe minimal course translation adapter, RU/EN conflict text.
- `src/features/admin/operations/AdminPlannerBoard.tsx`, `adminPlannerMapping.ts`, `adminPlannerCommands.ts`: one display/mutation timezone, exact duration and Participant title projection.
- `functions/src/canonical/bookings/bookingClaimOperations.ts`, `functions/src/canonical/resourceClaims/resourceClaimEngine.ts`: existing overlay/batch Guard swap and coalesced mutation budget.
- `functions/src/canonical/bookings/bookingRescheduleCommands.test.ts`, `bookingRescheduleCommands.emulator.test.ts`: Guard regression and concurrent admission tests.
- `tests/unit/scheduleDayViewPlacement.test.ts`, `scheduleOverlapRendering.test.tsx`, `adminPlannerMapping.test.ts`, `adminPlannerCommands.test.ts`: placement/render/click/zone regression tests.
- `tests/browser/planner-overlap/`: isolated compiled real-component Playwright fixture/config/spec. Run `npx vite build --config tests/browser/planner-overlap/vite.config.ts --mode e2e`, then `npx playwright test --config tests/browser/planner-overlap/playwright.config.ts`.
- This report records incident evidence and safe diagnostic/reconciliation boundaries.

## Validation

- Backend unit: 191 PASS across booking creation, guest creation, reschedule, resource engine and attendance command tests.
- UI unit: 66 PASS in six files (`.scratch/planner-overlap/ui-final-complete.log`); interval edge cases, actual day/week rendering, independent IDs, CourseDay, sub-hour cells, mixed-zone mapping and mutation-zone regression.
- Firestore emulator: 22 PASS in three files; same-day swap regression, canonical instructor/participant races, idempotency and rollback. Wrapper exited 0 and emulator shut down.
- Playwright: 17 PASS on compiled real Calendar components, 1440/768/390/320, RU/EN, light/dark, independent modal Booking IDs, no page overflow and long labels. Test-only modal replacement displays the selected ID; real modal mutations/authenticated workflow are NOT VERIFIED. No production route/fixture data replacement.
- TypeScript app and Functions build: PASS. Final production build after timezone changes: PASS (existing large-chunk warning).
- Full `npm run lint`: FAIL, 26,563 errors / 97,149 warnings, including nested `.worktrees` and generated code. Changed-file ESLint: zero errors; existing card click accessibility warnings remain. No unrelated lint cleanup.
- Independent code review completed; findings corrected and rechecked, including mutation timezone consistency. Screenshot 320px RU Dark visually inspected: both cards and conflict labels fit without overlap/clipping.
- Graphify update: PASS (15,639 nodes); community labels were reused/renamed by the tool.

## Data safety, resources and deployment impact

Historical Booking, Payment, Wallet, MonetaryEvent and Attendance data were not written. Payment/Attendance business logic was not changed. No new Firestore reads, subscriptions, scheduler work or polling in product code.

Deployment has NOT been performed. Code impact: Hosting YES; canonical command runtime callables `executeCanonicalCommand` and `executeGuestCanonicalCommand` share the changed booking/Claim modules. The corrected schedule mutations are dispatched through `executeCanonicalCommand`; guest creation continues using the same resource engine. Rules NO; indexes NO; migration NO; settings/manual setup NO; schedulers/triggers NO. Historical Guard reconciliation, if justified by direct evidence, requires a separately reviewed manifest and authorization.

Branch: `fix/planner-overlapping-bookings`, based on fetched `origin/main`. No commit, push, PR, merge or deploy.
