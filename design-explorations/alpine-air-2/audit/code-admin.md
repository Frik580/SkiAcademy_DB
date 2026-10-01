# Carve Academy — ADMIN code audit (assembled)

---

_tmp-schedule.md

# Capability-Preservation Audit вЂ” ADMIN в†’ OPERATIONS TAB (planner/schedule + realtime monitor)

Repo root: `D:\SkiAcademy_DB` В· Read-only audit В· no files modified except this report.

Scope covered: `src/features/admin/operations/*` (planner + monitor + metrics), `src/features/admin/components/schedule/*`, the shared-domain planner read model, the canonical command kinds, and the server-side planner read/claim path.

---

## 0. Where the schedule surface lives / who uses it

Grep results for `ScheduleCalendar` / `ScheduleSlotActionModal` / `ScheduleInstructorCell` / `ScheduleTimetableCells` / `ScheduleBookingCell` / `components/schedule`:

| Consumer | Location | Notes |
|---|---|---|
| `AdminPlannerBoard` | `src/features/admin/operations/AdminPlannerBoard.tsx:12,287` | **the only production consumer** |
| Barrel re-export | `src/features/admin/index.ts:8-16` | re-exports `ScheduleCalendar`, `ScheduleSlotActionModal`, `ScheduleToolbar`, `hasScheduleOverlap`, `getAvailableMoveTimeSlots`, `getAvailableScheduleDurations`, `SCHEDULE_TIME_SLOTS`, `SCHEDULE_CLOSING_TIME_MINUTES` |
| `src/features/admin/components/schedule/index.ts` | 4-10 | same re-export set |
| Non-component util import | `src/features/admin/people/AdminInstructorDirectory.tsx:19`, `src/features/admin/finance/CanonicalSchoolMovementPanel.tsx:12`, `src/features/admin/finance/вЂ¦`, `src/features/admin/operations/AdminFinancialOverviewHost.tsx:6` | import only `formatDateLocalYMD` from `scheduleUtils` |
| Internal | `ScheduleCalendar.tsx:10-12`, `ScheduleTimetableCells.tsx:8`, `components/schedule/index.ts` | intra-directory |

**There is NO instructor-surface usage.** `src/features/instructor-workspace/` contains no calendar; it has `InstructorBookingList` / `InstructorBookingCard` etc. `src/features/` has no `instructor/` directory. So the schedule grid is **admin-private**, but three helper exports (`hasScheduleOverlap`, `SCHEDULE_TIME_SLOTS`, `formatDateLocalYMD`) are cross-module and must survive a rebuild.

Tests that pin the current structure (rebuild will break these, and they document intent):
- `tests/unit/adminLessonBookingCanonicalBoundary.test.ts:20-21` вЂ” asserts `ScheduleCalendar` / `ScheduleSlotActionModal` filenames
- `tests/unit/adminPlannerUxBoundary.test.ts:19,22,25` вЂ” `slot-modal/ActiveSlotMoveForm.tsx`, `slot-modal/ActiveSlotCreateForm.tsx`, `ScheduleSlotActionModal.tsx`
- `tests/unit/adminReassignWiring.test.ts:17,23` вЂ” source-text assertions on `ScheduleSlotActionModal.tsx` + `ActiveSlotMoveForm.tsx`
- `tests/unit/adminPlannerMapping.test.ts`, `tests/unit/adminPlannerDayWindow.test.ts`, `tests/unit/scheduleDayViewPlacement.test.ts`
- `eslint.config.mjs:65-99` вЂ” `/src/features/admin/components/schedule/` is a "scoped component" dir that must use feature translation hooks; `ScheduleSlotActionModal.tsx`, `ActiveSlotCreateForm.tsx`, `ActiveSlotDetails.tsx`, `ActiveSlotMoveForm.tsx` are on the `legacyFiles` allow-list (they import `useLanguage()` directly)
- `eslint.config.mjs:450` вЂ” `src/features/admin/components/schedule/{ScheduleBookingCell,ScheduleTimetableCells}.tsx` referenced by another rule

Mount point: `src/features/admin/components/AdminPanel.tsx:187-284`. Section id `admin_planner`, title `t('scheduleBoardTitle')`, default open, `forceOpen` when `plannerBooking` or `plannerDate` query param present (`:201-209`). `AdminMonitorReadModelsProvider` wraps the whole operations tab (`:188`, `:283`).

---

## 1. DATA STRUCTURE

### 1.1 What the planner board loads

Single read call per window:

`src/features/admin/operations/useAdminPlannerReadModels.ts:28-34`
```
queryAdminIdentityReadModels? no вЂ”
queryAdminPlannerReadModels({
  scope: 'admin_planner',
  localDate, view, timeZone: resolveAdminTimeZone(), windowDays?
})
```
в†’ callable `queryAdminPlannerReadModels` (`src/lib/canonical/canonicalReadModelClient.ts:81,468-485`), idempotency key `read:admin_planner:<hash>`, `maxAttempts: 1`.

Result type `AdminPlannerReadModel` вЂ” `packages/shared-domain/src/canonical/readModels/adminPlannerReadModel.ts:84-96`:
```
{ view: 'day'|'week', localDate, timeZone, window: TimeInterval,
  instructors: AdminPlannerInstructorPresentation[] (max 64),
  occupancy: AdminPlannerOccupancyItem[] (max ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX = 500),
  truncated: boolean }
```

Hook state: `{ item, loading, error, refresh }` where `error: 'permission-denied' | 'read-failed'` (`useAdminPlannerReadModels.ts:9,66`).

### 1.2 Per-instructor vs per-day

**Both.** The board loads ONE read model per window containing `instructors[]` and `occupancy[]`, and then derives two grids client-side:

- Instructors: `mapPlannerInstructors(planner.item)` вЂ” `src/features/admin/operations/adminPlannerMapping.ts:52-68`. If the read model returns zero instructors, the board falls back to the container's `fallbackInstructors` prop (`AdminPlannerBoard.tsx:101-104`, prop passed from `AdminPanel.tsx:214`).
- Bookings: `mapPlannerOccupancyToBookings(occupancy, displayLocalDate?)` вЂ” `adminPlannerMapping.ts:70-133`.
- Courses: `mapPlannerCourses(occupancy, displayLocalDate?)` вЂ” `adminPlannerMapping.ts:135-163`.

`ScheduleCalendar` renders **instructor rows Г— time-slot columns** in day view (`ScheduleCalendar.tsx:336-382`) and **instructor rows Г— 7 weekday columns** in week view (`:383-549`). No instructor filter exists вЂ” `adminNavigation.ts:116-133` explicitly documents `instructorId` as "reserved for a future planner filter; intentionally unused today".

### 1.3 Date window logic

`src/features/admin/operations/adminPlannerDayWindow.ts`:

- `plannerDayWindow(localDate, timeZone)` (`:14-25`) вЂ” local midnight `00:00` +24h in that IANA zone via `localCalendarInputToUtcDate`. Note: fixed +24 h, not "next local midnight", so a DST day is 23 h or 25 h of window.
- `filterOccupancyForLocalDate(occupancy, localDate, timeZone)` (`:27-34`) вЂ” `intervalsOverlap(item.interval, window)`.
- `plannerFetchWindow(localDate, _view)` (`:41-47`) вЂ” **ignores the view**: always returns the Monday of the selected week with `view: 'week'`. The doc comment (`:36-40`) states both day and week render a MonвЂ“Sun grid, so the backend window is always a full week; day view filters client-side.
  - Monday computation: `getWeekRange` (`scheduleUtils.ts:52-62`, Sunday-adjusted to Monday) + `parsePlannerLocalDateInput` (`scheduleDateInput.ts:3-6`).

Server window: `functions/src/canonical/readModels/adminPlannerReadModels.ts:50-54` uses `instructorOccupancyWindow(localDate, timeZone, windowDays ?? (view === 'week' ? 7 : 1))`.

Client-side day clipping: `occupancyPresentationForDay` (`adminPlannerMapping.ts:35-45`) clips the occupancy interval to the day window and re-derives `date`/`time`/`durationMinutes` from UTC seconds in the item's own `timeZone` via `Intl.DateTimeFormat('en-CA')` (`:15-33`). `normalizeScheduleTime` maps hour `24` в†’ `00` (`:9-13`, duplicated in `scheduleUtils.ts:46-50`).

### 1.4 Exact timezone constant and file

- **`ADMIN_DEFAULT_TIMEZONE = 'Asia/Almaty'`** вЂ” `src/features/admin/operations/adminTimeZone.ts:1`.
- `resolveAdminTimeZone()` вЂ” `adminTimeZone.ts:3-9`: `Intl.DateTimeFormat().resolvedOptions().timeZone || ADMIN_DEFAULT_TIMEZONE`, wrapped in try/catch.
- `localDateTimeFromTimestamp(seconds, timeZone)` вЂ” `adminTimeZone.ts:11-29`.
- The board prefers the **server-returned** zone: `planner.item?.timeZone ?? resolveAdminTimeZone()` (`AdminPlannerBoard.tsx:87`).
- Each occupancy item carries its own `timeZone` (IANA-validated by `IanaTimeZoneSchema`, `adminPlannerReadModel.ts:52`); commands send `item.timeZone || resolveAdminTimeZone()` (`adminPlannerCommands.ts:221`).
- The toolbar/grid date formatting (`formatDateLocalYMD`, `getWeekRange`) uses the **browser's** local time, not the planner zone вЂ” a real edge case if admin browser в‰  Almaty.

### 1.5 How a "slot" and a "booking" are represented

**Slot** = a fixed hourly column, not a domain object:
- `SCHEDULE_TIME_SLOTS` = `['08:00' вЂ¦ '18:00']` (11 slots) вЂ” `scheduleOverlap.ts:5-17`.
- `SCHEDULE_CLOSING_TIME_MINUTES = 19 * 60` вЂ” `scheduleOverlap.ts:19`.
- `SCHEDULE_DURATIONS = [1,2,3,4]` hours вЂ” `scheduleOverlap.ts:21`.
- Day-view placement helpers: `scheduleDayViewPlacement.ts` вЂ” `scheduleBookingsForDay`, `scheduleBookingOverlapsSlot` (half-open `slotStart < bookingEnd && slotEnd > bookingStart`, `:27-33`), `scheduleBookingStartsAtSlot`, `dayViewBookingForSlot` (`:45-72`), `dayViewColSpanForBooking` (`:74-84`).

**Booking** = the legacy UI `Booking` type from `src/types`, produced as a *projection* from an occupancy item by `mapPlannerOccupancyToBookings` (`adminPlannerMapping.ts:70-133`):
- `id` = `item.bookingId ?? item.occupancyId`
- `userId` = `item.payerAccountId ?? item.participantId ?? item.occupancyId` в†ђ for blocks this is rewritten to the sentinel `system_block_break` / `system_block_day_off` (`:94`)
- `date` / `time` / `durationHours` (hours are **rounded**: `durationHours()` at `:5-7` = `Math.max(1, Math.round(minutes/60))`)
- `totalPrice` is hard-coded `0` on the board (`:120`) вЂ” price is not in the planner read model
- `status` from `item.lifecycleStatus`, defaulting to `'confirmed'` (`:82-89`)
- carries `difficulty`, `notes`, `isGuest`, `guestName`, `attendanceOverdue`, `missingAttendanceCount`
- `isDeleted` is never set by the mapping (so `!booking.isDeleted` guards in cells are always true on this board)

UI-facing narrow contract: `scheduleContracts.ts:9-42` вЂ” `ScheduleBooking`, `ScheduleClient`, `ScheduleInstructor`, `ScheduleCourse` (all `Pick<>`), plus `PlannerCreateOccupancyInput = Booking & { participantId?: string }`.

### 1.6 How course blocks and lesson bookings are unified

They are **NOT** unified into one type. `AdminPlannerOccupancyItem.occupancyKind` is a 3-way enum (`adminPlannerReadModel.ts:22-26`): `'lesson_booking' | 'course_day' | 'availability_block'`.

The unification is only at the **grid** level, and it is hacky:
- `mapPlannerOccupancyToBookings` returns `[]` for `occupancyKind === 'course_day'` (`adminPlannerMapping.ts:107-109`) вЂ” course days never become `Booking` rows.
- `mapPlannerCourses` returns `[]` for anything that is not `course_day` (`:139-141`).
- So the board has two parallel arrays, `bookings` and `courses`, merged visually in `ScheduleTimetableCells` (day view) and inline in `ScheduleCalendar` week view.
- **Courseв†”booking correlation is by a fabricated key**: course cells look up enrollments with `bookings.filter(b => b.instructorId === 'course_' + courseOverlap.id)` вЂ” `ScheduleTimetableCells.tsx:104-109` and `ScheduleCalendar.tsx:465-470`. But `mapPlannerCourses` sets `id: item.occupancyId` (`:151`) and the planner read model never produces a `Booking` whose `instructorId` starts with `course_`. **This enrolled-count/enrolled-names lookup therefore always yields an empty list on the canonical planner board** (the violet course tile always shows "0 enrolled"). Server does have `actualInstructorIds` for course days (`instructorOccupancyReadSupport.ts:219`) and `mapPlannerCourses` sets `instructorIds: [item.instructorId]` (`:155`), so the tile itself renders. Flagged as a current-behavior regression risk, not a capability to preserve.
- `isCourseBooking()` (`src/domain/availability`) is used by the cells/forms, but on the planner board it is always false (no `course_*` instructorId bookings).
- Availability blocks ARE converted into `Booking` rows so they share the same grid and modal (`adminPlannerMapping.ts:90-106`), using the `userId` sentinels `system_block_day_off` / `system_block_break`, which the whole UI keys off (`scheduleUtils.ts:3-5`, `ScheduleBookingCell.tsx:27,48`, `ActiveSlotDetails.tsx:41-44,99`).
- Server occupancy source (`functions/src/canonical/readModels/instructorOccupancyReadSupport.ts:185-400`): `bookings` collection (paginated), `administrative_availability_blocks` collection, and `collectionGroup('days')` for CourseDays. `truncated` propagates from any of the three (`:229,394`).

---

## 2. EVERY USER ACTION ON THE SCHEDULE

All mutations are canonical commands; the board never writes Firestore directly. Common wrapper: `runPlannerMutation` (`AdminPlannerBoard.tsx:44-60`) вЂ” on `CanonicalCommandClientError` with code `stale_version` or `concurrent_modification` it first re-reads, then rethrows; on success it calls `refreshAllProjections()`.

Refresh chain: `refreshAllProjections` (`AdminMonitorReadModelsContext.tsx:37-40`) = `refreshAll()` (hot lessons, history lessons, enrollment roster/pending/history) then the registered planner `refresh` (registered by `AdminPlannerBoard.tsx:82-85`).

| # | User action | Entry point (file:line) | Callable / command | Command layer |
|---|---|---|---|---|
| 1 | **Create lesson booking** | `ActiveSlotCreateForm` submit в†’ `handleSlotActionSubmit` `ScheduleSlotActionModal.tsx:291,369-443` в†’ `onAddBooking` в†’ `AdminPlannerBoard.handleAddBooking` `:138-150` | `createPlannerOccupancyFromLegacyBookingShape` `adminPlannerCommands.ts:155-208` | `create_confirmed_booking` via `executeAdminLessonBookingAttempt` `:193-207` в†’ `useAdminLessonBookingCommands.ts:50-72`; possibly preceded by `provision_self_participant_for_account` `:107-128` |
| 2 | **Create break block** | `ScheduleSlotActionModal.tsx:297-332` (tab `break`) | same fn, branch `userId === 'system_block_break'` `:161-186` | `create_administrative_availability_block` with `kind: 'break'` |
| 3 | **Create day-off block** | `ScheduleSlotActionModal.tsx:333-368` (tab `day_off`, hard-coded `08:00` / 11 h) | same fn, `kind: 'day_off'` | `create_administrative_availability_block` |
| 4 | **Re-time (same instructor)** | `ActiveSlotMoveForm` date+time selects `ActiveSlotMoveForm.tsx:88-126` в†’ `handleSlotMoveSubmit` `ScheduleSlotActionModal.tsx:456,557-559` в†’ `onRescheduleBooking` в†’ `AdminPlannerBoard.handleReschedule` `:152-167` | `reschedulePlannerOccupancy` `adminPlannerCommands.ts:210-279` | blocks в†’ `reschedule_administrative_availability_block`; course days в†’ `reschedule_course_day`; lessons в†’ `reschedule_booking` (after `loadPlannerLessonDetail` for revision) |
| 5 | **Reassign instructor (drag-free select)** | `ActiveSlotMoveForm.tsx:64-86` в†’ `ScheduleSlotActionModal.tsx:500-556` в†’ `onReassignInstructor` в†’ `AdminPlannerBoard.handleReassign` `:169-185` | `reassignPlannerOccupancy` `adminPlannerCommands.ts:281-341` | may first reschedule (`:296-304`), then `reassign_course_day_instructor` (`:305-321`) or `change_booking_instructor` (`:334-340`); availability blocks return early (`:322-324`) |
| 6 | **Change duration** | `ActiveSlotMoveForm.tsx:128-157` в†’ `ScheduleSlotActionModal.tsx:496-498` (shrink, before move) and `:561-563` (grow, after move) в†’ `onChangeBookingDuration` в†’ `AdminPlannerBoard.handleChangeDuration` `:187-201` | `changePlannerOccupancyDuration` `adminPlannerCommands.ts:343-365` | `change_booking_duration`; **only for `occupancyKind === 'lesson_booking'`** (`:350-352`) |
| 7 | **Delete / cancel** (X on cell, or red button in modal) | cell `ScheduleBookingCell.tsx:37,58,150` в†’ `ScheduleCalendar.handleSlotDeleteClick` `:146-148` в†’ `slotActionModalRef.current.requestDelete` в†’ `ScheduleSlotActionModal.tsx:791-814,816-818`; modal button `ActiveSlotMoveForm.tsx:191-199` | `onDeleteBooking` **and** `onCancelBooking` are BOTH wired to `handleRelease` (`AdminPlannerBoard.tsx:303-304`) в†’ `releasePlannerOccupancy` `adminPlannerCommands.ts:367-407` | blocks в†’ `release_administrative_availability_block`; lessons в†’ `resolve_booking_cancellation` with `decision: 'direct_cancel'`, `refundAmount: admin.cancellationFinancial.maximumRefund ?? 0` (`:397-406`). **CourseDay is rejected**: `'CourseDay occupancy is not deleted from the planner'` (`:391-393`) |
| 8 | **Mark lesson completed** | `ActiveSlotMoveForm.tsx:160-175` в†’ `onCompleteBooking` в†’ `AdminPlannerBoard.handleComplete` `:218-231` | `completePlannerLesson` `adminPlannerCommands.ts:409-444` | `finalize_booking_attendance`; **marks every service Participant `present`** (`:422-443`), using `booking.serviceParticipantIds` or all `admin.attendance` rows |
| 9 | **Link guest booking to a client account** | `ActiveSlotDetails.tsx:101-110` в†’ `LinkGuestBookingModal` `ScheduleSlotActionModal.tsx:736-750` в†’ `onLinkGuestBooking` в†’ `AdminPlannerBoard.handleLink` `:233-247` | `linkPlannerGuestBooking` `adminPlannerCommands.ts:446-466` | resolves payer self Participant (may provision), then `link_guest_booking_to_account_as_administrator` |
| 10 | **Open lesson detail (deep link)** | `ActiveSlotMoveForm.tsx:177-189` в†’ `onOpenLessonDetail` в†’ `AdminPlannerBoard.handleOpenLessonDetail` `:249-262` | none (navigation) | sets `tab=operations`, `booking=<id>`; consumed by `AdminLessonBookingPanel` |
| 11 | **Open chat about a booking** | `ActiveSlotDetails.tsx:111-118` в†’ `ScheduleSlotActionModal.tsx:833,881-889` | none | opens `BookingChatModal` (from `src/features/bookings`) with `adminProfile` as `currentUserProfile` |
| 12 | **View course block info** | click violet tile вЂ” `ScheduleTimetableCells.tsx:134-152` (day) and `ScheduleCalendar.tsx:491-514` (week) | none | `addNotification('info', ...)` with guides, schedule, seats, enrolled names |
| 13 | **Open empty slot** | `ScheduleTimetableCells.tsx:238-245` (+ button); mobile `ScheduleCalendar.tsx:291-305` | вЂ” | opens the create modal |
| 14 | **View / change dayв†”week** | `ScheduleToolbar.tsx:36-46` в†’ `ScheduleCalendar.tsx:326` в†’ `updatePlannerWindow` `:104-110` в†’ `onWindowChange` в†’ `AdminPlannerBoard.handleWindowChange` `:122-136` | re-fetch only | writes `plannerDate` query param (`replace: true`) |
| 15 | **Previous / next period** | `ScheduleToolbar.tsx:50-56,80-86` в†’ `adjustDate` `ScheduleCalendar.tsx:117-125` | re-fetch | В±1 day in day view, В±7 days in week view |
| 16 | **Today** | `ScheduleToolbar.tsx:88-93` в†’ `ScheduleCalendar.tsx:329` | re-fetch | `formatDateLocalYMD(new Date())` |
| 17 | **Pick a date (day view)** | `ScheduleToolbar.tsx:58-64` `<input type="date">` в†’ `ScheduleCalendar.tsx:327` | re-fetch | |
| 18 | **Pick a weekday (week view, mobile strip)** | `ScheduleCalendar.tsx:168-192` | re-fetch | |
| 19 | **Deep-link focus: open a specific booking's modal** | `ScheduleCalendar.tsx:89-102` (`focusBookingId` from `plannerBooking` query param) в†’ `onFocusConsumed` в†’ `AdminPlannerBoard.handleFocusConsumed` `:264-274` deletes the param | re-fetch + modal | |
| 20 | **Cell-level inline delete (hover X)** | `ScheduleBookingCell.tsx:34-43,55-64,147-157` вЂ” hidden for terminal statuses (`isCompleted || isNoShow`, `:146`) | same as #7 | |

**Filters:** there are **no** filters on the schedule board вЂ” no instructor filter, no status filter, no text search. The only "filtering" is the day/week client-side filter (`filterOccupancyForLocalDate`) and the display filters in cells (`status !== 'cancelled' && !isDeleted`). Confirm this is intentional (matches `adminNavigation.ts:131`).

### Command kinds used (exact)
`packages/shared-domain/src/canonical/commands/commandKinds.ts`:
- `create_confirmed_booking` (line 2)
- `link_guest_booking_to_account_as_administrator` (line 7)
- `resolve_booking_cancellation` (line 10)
- `reschedule_booking` (line 11)
- `change_booking_instructor` (line 12)
- `change_booking_duration` (line 13)
- `finalize_booking_attendance` (line 38)
- `provision_self_participant_for_account` (line 56)
- `reassign_course_day_instructor` (line 77)
- `reschedule_course_day` (line 87)
- `create_administrative_availability_block` (line 90)
- `reschedule_administrative_availability_block` (line 91)
- `release_administrative_availability_block` (line 92)

Not reachable from the board: `remove_course_day`, `create_course_day`, `record_booking_no_show`, `complete_booking`, `request_booking_cancellation`, `approve` variants of `resolve_booking_cancellation`.

### Command plumbing
- `assertSucceeded` `adminPlannerCommands.ts:30-39` вЂ” throws mapped error, then `applyAdminPlannerCommandResult` + `applyAdminFinanceCommandResult` + `applyAdminPeopleCommandResult`.
- `executePlannerLessonAttempt` `:41-46` вЂ” routes lesson commands through `executeAdminLessonBookingAttempt` (which additionally syncs issue-inbox / lesson-bookings / finance / change-request caches).
- `plannerIdempotency(action)` `:48-50` в†’ `createAdminLessonBookingAttemptId` (`lessonBookingAdminUtils.ts:29-31`) = `admin_lesson:<action>:<random>` вЂ” **a new random key per call, so retries are not idempotent across manual retries** (by design: each click is a new intent).
- `createAdminLogicalBookingId()` `:33-35` = `booking_admin_<random>`; the client-generated `id` in `PlannerCreateOccupancyInput` is **discarded** for lessons (the command mints its own) and is only used for blocks via `blockIdFromBooking` (`:62-66`: `block_<id>` or `block_admin_<id>`).
- Optimistic-concurrency: `expectedRevision` is sent for blocks (`:231,385`) and course days (`:250,254,316`); lessons go through `loadPlannerLessonDetail` в†’ `queryLessonBookingReadModels({scope:'admin_detail', bookingId})` (`:52-60`) to get a fresh revision. **Note: if that detail read fails, several actions throw** ('Lesson detail is required to reschedule' `:268`, 'вЂ¦to change duration' `:355`).

---

## 3. CONFLICT HANDLING

### 3.1 `scheduleOverlap.ts` вЂ” pure client-side, grid-time based

`hasScheduleOverlap({bookings, courses, instructorId, date, time, durationHours, excludeBookingId})` (`:33-76`):
1. Convert to minutes: `startMin = hourToMinutes(time)`, `endMin = startMin + durationHours*60`.
2. Booking pass: same `instructorId`, same `date`, `status !== 'cancelled'`, not excluded; overlap = `startMin < bookingEnd && endMin > bookingStart` (half-open, `:53`).
3. Course pass: `course.instructorIds.includes(instructorId)`, date within `[courseStartDate, courseEndDate]` derived by `parseCourseDates(course.dates)`, then minute overlap against `startTime`/`endTime` (`:58-75`).

Derived selectors:
- `getAvailableMoveTimeSlots` (`:87-109`) вЂ” `SCHEDULE_TIME_SLOTS` filtered by `endMinutes <= SCHEDULE_CLOSING_TIME_MINUTES` (19:00) and no overlap. Powers the "new start time" `<select>`.
- `getAvailableScheduleDurations` (`:120-144`) вЂ” `SCHEDULE_DURATIONS = [1,2,3,4]` filtered by closing time + no overlap. Powers break/lesson/move duration selects.

Known weaknesses (current behavior; a rebuild is a good moment to fix, but do not silently change):
- **Only whole-hour alignment is enforced for time slots**, but `newMoveDate`/duration are unconstrained; a booking at `09:00` with 3 h is allowed by the client if the server agrees.
- **Cancelling a booking does not free the slot for the client-side selector in a durable way** вЂ” it does (`status === 'cancelled'` skipped), but `no_show` / `completed` bookings are NOT skipped, so a completed lesson still blocks a new booking in the same slot on the client. This is intentional-looking.
- `isDeleted` is never true on the board (mapping never sets it), so the `!b.isDeleted` filters in `ScheduleTimetableCells.tsx:107` / `ScheduleCalendar.tsx:416,468` are no-ops here.
- The `admin_planner_visualization` booking scope on the server (`instructorOccupancyReadModels.ts:80`) may hide some lifecycle statuses that the client expects to display вЂ” `isBookingVisibleForOccupancyScope` (`instructorOccupancyReadSupport.ts:40`).

### 3.2 Client behavior on conflict

- **Pre-check before submit** (optimistic, no server round trip): `ScheduleSlotActionModal.tsx:299-311` (break), `:334-347` (day-off, checked at `08:00` for 11 h), `:389-402` (lesson), `:480-494` (move/reassign). On failure: `addNotification('error', t('conflictDetected'), t('conflictBreakDesc' | 'conflictDayOffDesc' | 'conflictBookingDesc' | 'conflictRescheduleDesc'))` and `return` вЂ” the form stays open, nothing is sent.
- **Availability guard (client)**: `ScheduleSlotActionModal.tsx:370-378` (create on unavailable instructor) and `:509-520` (reassign to unavailable instructor) в†’ `addNotification('error', t('instructorUnavailableTitle'), вЂ¦)`.
- **Price guard (client)**: `resolveInstructorHourlyRateKztForDisplay` returning `undefined` в†’ `addNotification('error', t('actionFailedTitle'), t('instructorPriceUnavailable'))` (`:414-419`, `:522-527`). `ActiveSlotCreateForm.tsx:64-67` also disables submit while rate is `undefined`.
- **Insufficient-funds prompt**: `ScheduleSlotActionModal.tsx:141-142, 536-555, 642-683, 579-603` catches `InsufficientFundsError` (imported from `src/features/bookings/bookingTransactions`, `:10`) and shows a two-button prompt (allow negative balance / cancel move). **This branch is currently DEAD on the planner board**: `AdminPlannerBoard.handleReassign` (`:169-185`) has no `options` parameter, so the `{ allowNegativeBalance: true }` argument from `:589` is discarded, and the canonical reassign path never throws `InsufficientFundsError`. Preserve or drop deliberately вЂ” do not half-port.
- **`skipLegacyBalanceGate`** is accepted by `ScheduleCalendar` (`:48,71,298`) and by `ScheduleSlotActionModal` (`:76,779`) but the modal destructures it as `_skipLegacyBalanceGate` and **never uses it**. It is a vestigial legacy gate (the old `addBooking` callable checked the payer's balance client-side). Do not re-add a balance gate.
- **Generic error mapping**: `mutationErrorMessage` (`:29-30`) в†’ `mapCanonicalErrorMessage(error.code)`; for `resource_conflict` / `participant_conflict` / `instructor_conflict` all three map to the single English string **"A scheduling conflict occurred."** (`src/lib/canonical/mapCanonicalCommandError.ts:53-56`). So a server-side race surfaces as a generic toast, not a specific message. `stale_version` в†’ "The record changed; refresh it before retrying." and `runPlannerMutation` already refreshed in that case.

### 3.3 Server behavior

- All schedule-affecting commands acquire a **ResourceClaim** inside the Firestore transaction: `functions/src/canonical/resourceClaims/resourceClaimEngine.ts` (`AcquireResourceClaimInput` `:44-49`, `MoveResourceClaimInput` `:51-55`, `ReleaseResourceClaimInput` `:57-59`, `commitResourceClaimPlan`).
- Conflicting claims are serialized by UTC guard buckets; the winner commits, losers get `conflictErrorCodeForResourceKind` в†’ `instructor_conflict` / `participant_conflict` / `resource_conflict`. Evidence: `resourceClaimEngine.test.ts:215-260`, `resourceClaimEngine.emulator.test.ts:137-219` ("serializes overlapping instructor claims so exactly one wins", "allows concurrent non-overlapping claims in the same bucket"), `bookingCommands.emulator.test.ts:447-499`.
- Instructor availability is enforced server-side too: `bookingCommands.ts:356` (create), `bookingRescheduleCommands.ts:542` (instructor change вЂ” `!instructorRecord || isAvailable === false` в†’ `validation`/`conflict`), `guestBookingCommands.ts:286`, `bookingProposalCommands.ts:599,804`, `bookingChangeRequestCommands.ts:465`.
- CourseDays claim the same instructor resource: `courseDayCommands.ts:189,203,399,420`; cross-kind tests in `courseDayCommands.emulator.test.ts:360-395` ("rejects overlapping CourseDay when Booking instructor claim exists" and the reverse).
- Availability blocks claim the instructor resource: `functions/src/canonical/availability/administrativeAvailabilityBlockCommands.ts:88-120+` via `planAcquireAdministrativeAvailabilityBlockClaim` (`:27-30`); overlap test at `administrativeAvailabilityBlockCommands.test.ts:123-148`.
- Admin authorization: block commands require `source === 'admin_callable'` and `administratorCapabilityExercisedByAccount(envelope)` (`administrativeAvailabilityBlockCommands.ts:59-73`); planner reads pass `ReadModelAdministratorActor`.
- **No server-side business-hours rule.** `resolveBookingScheduleFromCalendarInput` (`packages/shared-domain/src/canonical/bookingCreation.ts:76-90`) just converts localв†’UTC and adds duration. The 08:00вЂ“19:00 window and the `[1,2,3,4]h` duration set exist **only** in `scheduleOverlap.ts`.
- 19:00 is also not enforced for **breaks/day-offs**: `availableBreakDurations` is computed with `getAvailableScheduleDurations` (closing-time filtered) so the UI can't offer an over-long break, but day-off is hard-coded 11 h from 08:00 (`ScheduleSlotActionModal.tsx:340-341`) which is 08:00в†’19:00, exactly the closing time.

---

## 4. DIALOGS / STATE

### 4.1 Modal tree

`ScheduleSlotActionModal` (`ScheduleSlotActionModal.tsx:756-895`, `forwardRef`, imperative handle `requestDelete`) renders via `createPortal(..., document.body)` (`:605,752`):

```
ScheduleSlotActionModal
в”њв”Ђ ActiveSlotDialog (:107-754)                       [key = `${instructorId}-${time}-${bookingId||'empty'}` :824]
в”‚  в”њв”Ђ header: title t('manageScheduleBlock') | t('scheduleAction')  (:624-632)
в”‚  в”њв”Ђ [existing booking branch :634-707]
в”‚  в”‚   в”њв”Ђ ActiveSlotDetails (:636-641)
в”‚  в”‚   в”њв”Ђ insufficientFundsPrompt amber panel (:642-683)   [dead branch, see В§3.2]
в”‚  в”‚   в””в”Ђ ActiveSlotMoveForm (:684-706)
в”‚  в””в”Ђ [empty slot branch :708-733]
в”‚      в””в”Ђ ActiveSlotCreateForm  (3 tabs)
в”‚  в””в”Ђ LinkGuestBookingModal (:736-750, only when booking && guest)
в”њв”Ђ confirmModal (generic confirm dialog, :785-788, :844-879)
в””в”Ђ BookingChatModal (:881-889)
```

`BodyScrollLock` is used in all three portals (`:607,847`, and in `LinkGuestBookingModal.tsx:81`).

### 4.2 `ActiveSlotCreateForm` вЂ” every field

`src/features/admin/components/schedule/slot-modal/ActiveSlotCreateForm.tsx`

- **Tab switcher** `:71-93` вЂ” `'break' | 'day_off' | 'booking'` (`role="tablist"`, `role="tab"`). Default tab is `'break'` (`ScheduleSlotActionModal.tsx:127`).
- **Tab `break`** `:95-138`
  - `blockDuration` `<select>` вЂ” options from `availableBreakDurations` (label via `formatDurationLabel(duration, 'ru'|'en')`); empty state `<option>{t('noHoursAvailable')}</option>`; `disabled` when list empty (`:104`).
  - `blockNotes` `<input type="text">` вЂ” placeholder `t('lunchBreakPlaceholder')` (`:129-135`).
- **Tab `day_off`** `:140-148` вЂ” **no fields at all**; informational panel (`t('fullDayOff')`, `t('fullDayOffDesc')`). Date/time/duration are hard-coded in the submit handler.
- **Tab `booking`** `:150-245`
  - Unavailable-instructor warning panel `:152-159`.
  - `AdminManagedParticipantPicker` `:165-172` with `autoSelectUniqueSelf`, `onAccountIdChange`, `onReadyChange`, `additionalAccounts=clientAccounts`. Picker internals: `src/features/admin/identity/AdminManagedParticipantPicker.tsx` вЂ” account **search text** (`:205-210`, debounced by `ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS`), account `<select>` (`:211-239`), "load more" cursor button (`:240-249`), directory error + retry (`:250-274`), eligible-Participant `<select>` hidden when the account has exactly one `self` Participant (`:151,276`), "no eligible" hint (`:309-311`).
  - `bookingDuration` `<select>` from `availableBookingDurations` (`:180-201`).
  - `bookingDifficulty` `<select>` вЂ” 5 fixed values `beginner|intermediate|advanced|freeride|freestyle` (`:208-228`). **Not priced or validated server-side beyond pass-through.**
  - `bookingNotes` `<input type="text">` (`:236-242`).
- **Footer** `:247-267` вЂ” Cancel + `ActionButton type="submit"` with `pending`/`pendingLabel={t('saveSchedule')}`.
- `submitDisabled` `:64-67` = `isSlotActionSubmitting || (booking tab && (!instructor.isAvailable || !bookingIdentityReady || hourlyRateKzt === undefined))`.

### 4.3 `ActiveSlotDetails` вЂ” read-only detail

`slot-modal/ActiveSlotDetails.tsx`: current details header (`:36-38`); type line = break / day-off / "lesson with client <name>" (`:39-46`); client display-name resolution incl. guest badge (`:24-32`); training level (`:47-59`, hidden for course bookings); guest phone (`tel:`) and email (`mailto:`) links (`:60-85`); notes (`:86-92`); **cancellation reason** panel when `status === 'pending_cancellation' && cancellationReason` (`:93-97`); "link to client" button only when `isGuest || userId.startsWith('guest_')` (`:101-110`); "open chat" button for all non-block bookings (`:111-118`).

### 4.4 `ActiveSlotMoveForm` вЂ” every field + action

`slot-modal/ActiveSlotMoveForm.tsx`
- `newInstructorId` `<select>` вЂ” only when `canReassignInstructor` (`:64-86`); options from `availableInstructors` = available instructors with the current one force-included if unavailable (`ScheduleSlotActionModal.tsx:191-198`).
- `newMoveDate` `<input type="date" required>` (`:93-99`).
- `newMoveTime` `<select required>` from `availableMoveTimeSlots`; `disabled` when empty with `t('noSlotsAvailable')` (`:106-124`).
- `newMoveDuration` `<select>` from `availableMoveDurations`; `disabled`/empty option `t('noHoursAvailable')` (`:133-155`). Current duration is force-appended if not in the available list (`ScheduleSlotActionModal.tsx:222-225`).
- Auto-correction effects: if the chosen time/duration is no longer available it snaps to the first available (`:228-242`).
- Buttons: "mark lesson completed" (`:160-175`, gated by `canCompleteLesson`), "open lesson detail" (`:177-189`), **delete/cancel** (`:191-199`, always shown вЂ” no gating), **apply move** submit (`:201-211`).
- `canReassignInstructor` / `canChangeDuration` require `isReassignableBooking` (`ScheduleSlotActionModal.tsx:98-105`: not `course_*`, not `system_block_break`, not `system_block_day_off`, status not `cancelled`/`completed`/`no_show`, not deleted).
- `canCompleteLesson` (`:181-186`): planner lesson booking **and** `status === 'confirmed'`.
- **No confirm before "mark lesson completed"** and **no confirm before delete from this button** (delete does go through the confirm modal because it calls `onDeleteRequest` в†’ `handleSlotDeleteClick`).

### 4.5 Confirm dialog

`ScheduleSlotActionModal.tsx:785-788` + `:844-879`. One message key only: `t('deleteBlockConfirm')` (`:792`) вЂ” the same text is used for deleting a **break**, a **day-off**, and **cancelling a lesson booking with refund**. Buttons `t('cancel')` / `t('confirm')`. **There is no confirmation for: cancel-with-refund amount display, mark completed, create lesson/break/day-off, guest link.**

### 4.6 `LinkGuestBookingModal`

`src/features/admin/components/bookings/LinkGuestBookingModal.tsx` вЂ” booking summary (id, status badge, date/time/duration, instructor, cost `в‚ё`, guest name/phone/email), client search text (`:200-206`, filters non-instructor non-admin by name/email/phone/uid, `:34-46`), result list with select (`:208-263`), empty state `t('noClientsFoundForLink')` (`:209-212`), success screen with 1200 ms auto-close (`:111-124,61-67`), error banner (`:128-138`), confirm `t('confirmLinkToClient')` disabled without selection (`:281-292`). Note: also reachable from the monitor (`BookingsLog.tsx:117-127`) but there it only **navigates** (`onOpenLesson`/`onOpenEnrollment`), it does not link.

### 4.7 Empty / loading / error states

| Surface | State | Location |
|---|---|---|
| Planner board | error | `AdminPlannerBoard.tsx:278` вЂ” `<p className="text-xs font-mono text-rose-600">{planner.error}</p>` (raw enum `'permission-denied' \| 'read-failed'`, no i18n, no retry button) |
| Planner board | loading | `:279-281` вЂ” literal string **"Loading plannerвЂ¦"** (hard-coded English, not a translation key) |
| Planner board | truncated | `:282-286` вЂ” `t('plannerOccupancyTruncated')` amber warning when the server hit the 500-item page cap |
| Day grid | no instructors | `ScheduleCalendar.tsx:353-358` вЂ” `colSpan={12}`, `t('noInstructorsAvailable')` |
| Mobile | no instructors | `ScheduleCalendar.tsx:196-200` вЂ” same key, bordered card |
| Day grid | unavailable instructor slot | `ScheduleTimetableCells.tsx:218-231` вЂ” lock cell, `title={t('instructorUnavailableTitle')}` |
| Mobile | occupied / unavailable slot | `ScheduleCalendar.tsx:284-305` вЂ” disabled dashed button with `Lock` |
| Move form | no available time | `ActiveSlotMoveForm.tsx:113-116` вЂ” `t('noSlotsAvailable')` |
| Move form | no available duration | `ActiveSlotMoveForm.tsx:140-143` вЂ” `t('noHoursAvailable')` |
| Create form | no available duration | `ActiveSlotCreateForm.tsx:107-110,186-189` вЂ” `t('noHoursAvailable')` |
| Create form | no client selected | submit-time notification `t('missingParticipantTitle')` / `t('plannerSelectParticipantPlease')` (`ScheduleSlotActionModal.tsx:380-388,404-413`) |
| Picker | directory loading / error / retry | `AdminManagedParticipantPicker.tsx:231,250-274` |
| Picker | no eligible participants | `AdminManagedParticipantPicker.tsx:309-311` |
| Slot modal | no booking + no available durations | auto-correction effect snaps to first available (`ScheduleSlotActionModal.tsx:266-289`); if the list is empty the select shows `t('noHoursAvailable')` and submit stays enabled for break/booking |
| Monitor table | empty | `BookingsLog.tsx:62-70` вЂ” `t('noScheduledSessions')` |
| Monitor | per-status action column | `BookingsLog.tsx:177-300` |

**There is no explicit "no bookings this day" empty state on the grid** вЂ” empty slots simply render the dashed `+` cells.

---

## 5. REALTIME MONITOR + METRICS

### 5.1 Metrics (`AdminOperationalMetrics` / `AdminOperationalMetricsHost` / `adminOperationalOverview`)

- Host `src/features/admin/operations/AdminOperationalMetricsHost.tsx:14-36` reads the **shared** monitor context and computes `computeAdminOperationalOverview({ hotMonitorRows: bookings, lessonReadModels: [...lessonsHot.list.items, ...lessonsHistory.list.items], instructorsCount })` (`:18-26`).
- `src/features/admin/operations/adminOperationalOverview.ts:57-100`:
  - `activeBookings` вЂ” rows in the hot monitor with `status === 'confirmed' || 'pending_cancellation'` (`isHotOperationalStatus` `:53-55`), excluding `userId.startsWith('system_block_')` (`:37-38`).
  - `completedBookings` / `noShowBookings` / `occupiedBookings` вЂ” computed from canonical lifecycle status via `bookingIsCompletedService` / `bookingIsNoShowOutcome` / `bookingOccupiesInstructorSlot` over a revision-merged list (`mergeAdminOperationalLessonReads` `:40-51`).
  - `lessonCount` / `courseEnrollmentCount` split via `isCourseBooking` (`:66-73`).
  - Header comment (`:10-19`) states the windows must not be mixed and that **revenue is never derived here**.
- Presentational `src/features/admin/operations/AdminOperationalMetrics.tsx:12-73` renders exactly 3 tiles: `t('activeLessons')`, `t('completedLessons')` + `{noShowBookings} {t('noShowShort')}`, `t('allGuidesCount')`. The section header uses `t('financialOverview') || 'Р¤РёРЅР°РЅСЃРѕРІС‹Р№ РѕР±Р·РѕСЂ'` (`:23`) вЂ” **a mislabeled heading ("Financial overview") on an operations card that contains no money**; worth fixing in the rebuild but flagged as a product copy question.
- `instructorsCount` is passed from `AdminPanel.tsx:191` as `instructors.length` (legacy instructor list, not the planner read model).
- `occupiedBookings` is computed but **never rendered** вЂ” dead field.
- **Metrics has no actions.** Zero interactivity.

### 5.2 Shared monitor read models

- `AdminMonitorReadModelsContext.tsx:12-54` вЂ” provider wrapping the whole operations tab; `refreshAll()` fans out to 5 refreshers (`:19-33`): `lessonsHot.retryList()`, `lessonsHistory.retryList()`, `enrollmentsRoster.refreshList()`, `enrollmentsPending.refreshList()`, `enrollmentsHistory.refreshList()`. `registerPlannerRefresh` stores the planner refresher in a ref (`:34-36`); `refreshAllProjections` = monitor then planner (`:37-40`).
- `useAdminMonitorReadModels.ts:9-40` вЂ” 5 read models: lessons `hot` and `history` with **`drainAll: true`** (`:10-19`) and enrollment `roster` / `pending_guest` / `history` (`:20-22`). `bookings` = merged lessons(hot) + union(roster, pending) enrollments (`:24-30`).
  - **Cost flag**: `drainAll: true` on both lesson views + 3 enrollment views means the operations tab issues a fully-drained read of all lesson bookings and enrollments on every mount and after every planner mutation. This is the main server-cost item in this surface (AGENTS.md В§8). Not a capability, but a rebuild should not increase it and ideally should bound it.

### 5.3 Realtime refresh mechanism (planner)

This is a **custom revision-signal channel**, not Firestore `onSnapshot` on the data itself:

1. `subscribeAdminPlannerRevision.ts:8-17` вЂ” `onSnapshot` on a single document `{collection: ADMIN_PLANNER_REVISION_COLLECTION, documentId: ADMIN_PLANNER_REVISION_DOCUMENT_ID, schema: AdminPlannerRevisionDocumentSchema}`.
2. `src/lib/admin/subscribeAdminRealtimeRevision.ts:22-101` вЂ” resilient wrapper: exponential backoff 1 s в†’ 30 s, retries only for `cancelled|unknown|deadline-exceeded|resource-exhausted|internal|unavailable|unauthenticated` (`:12-20`); on a missing doc reports revision `0` (`:46-47`).
3. `adminPlannerRevisionCoordinator.ts` вЂ” single module-level subscription, ref-counted by listeners (`:12-26,36-45`), torn down at zero listeners (`:28-34`). `registerAdminPlannerRevisionFromCommand(rev)` (`:47-64`) lets a **command response payload** (`payload.adminPlannerRevision`) trigger a refresh without waiting for the Firestore signal, and de-dupes by `lastNotifiedRevision` so a locally-issued command doesn't double-refresh. `resetAdminPlannerRevisionCoordinatorForTests` (`:66-72`).
4. `adminPlannerLocalSync.ts:4-13` вЂ” `applyAdminPlannerCommandResult` parses `AdminPlannerRevisionPayloadSchema` out of the command result and feeds (3).
5. `useAdminPlannerReadModels.ts:59-64` вЂ” registers the listener; every revision signal triggers a **full re-query of the planner read model** (no diffing, no debounce).

Net effect: any canonical command that bumps the admin planner revision document (from any client, including student booking flows) causes the admin board to re-query `queryAdminPlannerReadModels` and re-render.

### 5.4 `AdminActiveBookingMonitor` вЂ” what it renders and its actions

`src/features/admin/operations/AdminActiveBookingMonitor.tsx:18-79` is a thin adapter: it takes `bookings` from the shared context and renders `BookingsLog` (`src/features/admin/components/bookings/BookingsLog.tsx`).

Row mapping: `src/features/admin/operations/adminBookingMonitorMapping.ts`
- `lessonBookingToMonitorRow` (`:27-65`): id, payer `accountId`, instructor name/avatar, local date/time from `occurrence.startsAt` in `occurrence.timeZone` (`:28-29`), `durationHours = minutes/60` (**fractional here**, unlike the board), `totalPrice` from `admin.payment.price` or `paymentPresentation.price` else `0` (`:32-34`), `status` via `asBookingStatus` (`:8-21`; `withdrawn в†’ cancelled`, unknown в†’ `confirmed`), plus `canonicalLifecycleStatus`, `occurrenceStartsAtSeconds/EndsAtSeconds`, `paymentOutstanding`, `paymentStatus`, `difficulty`, `notes`, `isGuest`, `guestName`, `guestPhone`, `guestEmail`, `createdAt`.
- `courseEnrollmentToMonitorRow` (`:67-91`): fabricates `instructorId: 'course_' + courseId` and `instructorName: course.title`, `durationHours: 0`, `status` from `lifecycleStatus`, `isGuest` from `guestState === 'pending_unlinked'`, `courseId`.
- `unionAdminMonitorCourseEnrollments` (`:93-107`) and `mergeAdminBookingMonitorRows` (`:109-117`).

Rendered columns (`BookingsLog.tsx:48-59`): booking id (truncated), created-at date, skier (with guest badge + `tel:`/`mailto:` + "link to client" button), coach, training level, date/time + notes + cancellation reason, fee (via `useCurrency().formatPrice`), status badge, actions.
System blocks are filtered out (`:39-42`).

**Actions (all navigation only, no mutations):**
- `handleOpenLesson` (`AdminActiveBookingMonitor.tsx:22-47`) вЂ” computes view: `'history'` if lifecycle/status is `completed|no_show|cancelled`, else `'hot'`; sets `tab=operations`, `booking=<id>`, `bookingView=<view>`.
- `handleOpenEnrollment` (`:49-70`) вЂ” `'history'` for completed/cancelled, `'pending_guest'` for guest+pending, else `'roster'`; sets `tab=operations`, `enrollment=<id>`, `enrollmentView=<view>`.
- Per-status buttons: `pending` в†’ "payment-driven guest confirmation" note + open lesson/enrollment (`:178-203`); `pending_cancellation` в†’ open cancellation detail (`:204-224`); `confirmed` в†’ open lesson detail (`:225-247`); `cancelled`/`completed` в†’ label + still-openable link (`:248-299`).
- "Link to client" button on guest rows (`:117-127`) вЂ” despite the label it **navigates** to the lesson/enrollment detail; it does not open `LinkGuestBookingModal`.

Status badge: `AdminMonitorLessonStatusBadge.tsx:22-38` в†’ `resolveAdminMonitorLessonStatusFromRow` (`lesson-bookings/lessonBookingAdminPresentation.ts:83-116`): `pending` + outstanding + unpaid status в†’ `awaiting_payment`; `confirmed` and now within `[startsAt, endsAt)` в†’ `in_progress` (`t('adminLessonStatusInProgress')`, `info` tone); otherwise lifecycle status via `LESSON_ADMIN_PRIMARY_STATUS_KEYS`. Falls back to plain `StatusBadge status={booking.status}` when there is no `canonicalLifecycleStatus` (i.e. for course-enrollment rows).

**The monitor itself performs no mutation.** All real lesson actions (cancel, attendance, payment, guest link) live in `AdminLessonBookingPanel` (the "Training records" section), reached only via query-param navigation. Preserve this handoff contract (`tab`, `booking`, `bookingView`, `enrollment`, `enrollmentView` keys in `adminNavigation.ts:17-36,59-63`).

---

## 6. JSON CAPABILITY LIST

```json
[
  {
    "id": "ops.planner.load",
    "tab": "operations",
    "screen": "Schedule board (admin_planner section)",
    "capability": "Load the week occupancy + instructor roster for the planner",
    "entryPoint": "src/features/admin/operations/AdminPlannerBoard.tsx:76 useAdminPlannerReadModels",
    "userAction": "Open Admin -> Operations; navigate days/weeks",
    "states": ["loading ('Loading plannerвЂ¦')", "error ('permission-denied'|'read-failed', red text)", "truncated (amber t('plannerOccupancyTruncated'))", "empty (t('noInstructorsAvailable'))"],
    "commandOrReadModel": "queryAdminPlannerReadModels scope=admin_planner (view always 'week' Monday window via plannerFetchWindow)",
    "currentResult": "AdminPlannerReadModel { instructors[], occupancy[]<=500, truncated, timeZone, window }",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/useAdminPlannerReadModels.ts", "src/features/admin/operations/adminPlannerDayWindow.ts", "packages/shared-domain/src/canonical/readModels/adminPlannerReadModel.ts", "functions/src/canonical/readModels/adminPlannerReadModels.ts", "functions/src/canonical/readModels/instructorOccupancyReadSupport.ts"]
  },
  {
    "id": "ops.planner.tz",
    "tab": "operations",
    "screen": "Schedule board",
    "capability": "Resolve the planner IANA timezone (Almaty default, per-item zone preferred)",
    "entryPoint": "src/features/admin/operations/adminTimeZone.ts:1-9",
    "userAction": "implicit for every load and every create/move",
    "states": ["browser zone", "fallback 'Asia/Almaty'"],
    "commandOrReadModel": "ADMIN_DEFAULT_TIMEZONE / resolveAdminTimeZone / IanaTimeZoneSchema",
    "currentResult": "timezone sent in every calendar command; item.timeZone used for rendering",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/adminTimeZone.ts", "src/features/admin/operations/adminPlannerMapping.ts:15-33", "packages/shared-domain/src/canonical/primitives.ts"]
  },
  {
    "id": "ops.planner.grid",
    "tab": "operations",
    "screen": "Schedule board",
    "capability": "Instructor x hourly-slot timetable (08:00-18:00), with colSpan merge for multi-hour bookings and course tiles",
    "entryPoint": "src/features/admin/components/schedule/ScheduleCalendar.tsx:336-382 + ScheduleTimetableCells.tsx",
    "userAction": "view day schedule",
    "states": ["normal", "instructor unavailable (lock cells)", "no instructors", "no slots available"],
    "commandOrReadModel": "SCHEDULE_TIME_SLOTS (scheduleOverlap.ts:5-17) + dayViewColSpanForBooking (scheduleDayViewPlacement.ts:74-84)",
    "currentResult": "dense table; booking cells, break/day-off cells, violet course tiles",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleCalendar.tsx", "src/features/admin/components/schedule/ScheduleTimetableCells.tsx", "src/features/admin/components/schedule/ScheduleBookingCell.tsx", "src/features/admin/components/schedule/scheduleOverlap.ts", "src/features/admin/components/schedule/scheduleDayViewPlacement.ts"]
  },
  {
    "id": "ops.planner.week",
    "tab": "operations",
    "screen": "Schedule board (week view)",
    "capability": "Instructor x 7-day grid; bookings and course events merged and sorted by time in each cell",
    "entryPoint": "src/features/admin/components/schedule/ScheduleCalendar.tsx:383-549",
    "userAction": "switch to week view; click a weekday in the mobile strip (:168-192)",
    "states": ["bookings", "course events", "combined", "empty cell"],
    "commandOrReadModel": "getWeekRange (scheduleUtils.ts:52-62), mapPlannerCourses (adminPlannerMapping.ts:135-163)",
    "currentResult": "per-day cell listing; course tile shows seats + enrolled count (enrolled lookup is currently always empty, see В§1.6)",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleCalendar.tsx", "src/features/admin/operations/adminPlannerMapping.ts"]
  },
  {
    "id": "ops.planner.mobile",
    "tab": "operations",
    "screen": "Schedule board (mobile < sm)",
    "capability": "Mobile card-per-coach day view with weekday strip, slot grid, course chips and inline +/lock states",
    "entryPoint": "src/features/admin/components/schedule/ScheduleCalendar.tsx:160-313",
    "userAction": "view and open slots on phone",
    "states": ["no instructors", "unavailable instructor (Lock icon, opacity-75)", "occupied slot (disabled)", "course chip", "booking cell"],
    "commandOrReadModel": "dayViewBookingForSlot + parseCourseDates",
    "currentResult": "same actions as desktop via handleOpenSlotAction",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleCalendar.tsx"]
  },
  {
    "id": "ops.planner.instructorCell",
    "tab": "operations",
    "screen": "Schedule board",
    "capability": "Instructor row header: avatar, name, specialty, KZT hourly rate, unavailable state (lock overlay, grayscale, strikethrough)",
    "entryPoint": "src/features/admin/components/schedule/ScheduleInstructorCell.tsx:14-59",
    "userAction": "view",
    "states": ["available", "unavailable (t('unavailableLabel'))", "rate undefined -> 'вЂ”/С‡'"],
    "commandOrReadModel": "resolveInstructorHourlyRateKztForDisplay (src/domain/pricing), getSpecialtyLabel (scheduleUtils.ts:64-87)",
    "currentResult": "pricePerHourKZT from mapPlannerInstructors (adminPlannerMapping.ts:52-68)",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleInstructorCell.tsx", "src/features/admin/operations/adminPlannerMapping.ts"]
  },
  {
    "id": "ops.planner.create.lesson",
    "tab": "operations",
    "screen": "Slot modal -> 'Lesson' tab",
    "capability": "Manually create a confirmed lesson booking for a selected Participant / payer Account",
    "entryPoint": "src/features/admin/components/schedule/ScheduleSlotActionModal.tsx:369-443 (ActiveSlotCreateForm.tsx:150-245)",
    "userAction": "click empty slot -> Lesson tab -> pick client/duration/level/notes -> Save",
    "states": ["submit disabled (unavailable instructor / no identity ready / no rate)", "missing participant notification", "conflictDetected", "instructorUnavailableTitle", "instructorPriceUnavailable", "success t('manualBookingAdded')", "error t('actionFailedTitle')"],
    "commandOrReadModel": "createPlannerOccupancyFromLegacyBookingShape -> create_confirmed_booking (plus provision_self_participant_for_account when the payer has no self Participant)",
    "currentResult": "new confirmed Lesson Booking; duration rounded from hours; price computed client-side for display only",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleSlotActionModal.tsx", "src/features/admin/components/schedule/slot-modal/ActiveSlotCreateForm.tsx", "src/features/admin/operations/adminPlannerCommands.ts:155-208", "src/features/admin/identity/AdminManagedParticipantPicker.tsx", "src/features/admin/lesson-bookings/useAdminLessonBookingCommands.ts:46-73"]
  },
  {
    "id": "ops.planner.create.break",
    "tab": "operations",
    "screen": "Slot modal -> 'Break' tab",
    "capability": "Create an instructor availability break block (duration + notes)",
    "entryPoint": "src/features/admin/components/schedule/ScheduleSlotActionModal.tsx:297-332 (ActiveSlotCreateForm.tsx:95-138)",
    "userAction": "click empty slot -> Break tab -> duration/notes -> Save",
    "states": ["conflictDetected + t('conflictBreakDesc')", "t('noHoursAvailable')", "success t('breakAdded')"],
    "commandOrReadModel": "create_administrative_availability_block (kind='break')",
    "currentResult": "AdministrativeAvailabilityBlock; notes default to t('breakLabel')",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleSlotActionModal.tsx", "src/features/admin/operations/adminPlannerCommands.ts:161-186", "functions/src/canonical/availability/administrativeAvailabilityBlockCommands.ts:88-120"]
  },
  {
    "id": "ops.planner.create.dayOff",
    "tab": "operations",
    "screen": "Slot modal -> 'Day off' tab",
    "capability": "Create a full-day instructor day-off block (hard-coded 08:00, 11 h)",
    "entryPoint": "src/features/admin/components/schedule/ScheduleSlotActionModal.tsx:333-368 (ActiveSlotCreateForm.tsx:140-148)",
    "userAction": "click empty slot -> Day off tab -> Save (no fields)",
    "states": ["conflictDetected + t('conflictDayOffDesc')", "success t('dayOffSet')"],
    "commandOrReadModel": "create_administrative_availability_block (kind='day_off')",
    "currentResult": "AdministrativeAvailabilityBlock 08:00-19:00",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleSlotActionModal.tsx", "src/features/admin/components/schedule/slot-modal/ActiveSlotCreateForm.tsx", "src/features/admin/operations/adminPlannerCommands.ts:161-186"]
  },
  {
    "id": "ops.planner.move.retime",
    "tab": "operations",
    "screen": "Slot modal (existing booking) -> Reschedule/move form",
    "capability": "Change date and/or start time of a booking, block or course day",
    "entryPoint": "src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx:88-126 -> ScheduleSlotActionModal.tsx:456-577",
    "userAction": "change date/time selects -> Apply move",
    "states": ["t('noSlotsAvailable')", "conflictDetected + t('conflictRescheduleDesc')", "success t('scheduleUpdated')", "error t('updateFailed')", "no-op -> just closes"],
    "commandOrReadModel": "reschedulePlannerOccupancy -> reschedule_booking | reschedule_administrative_availability_block | reschedule_course_day",
    "currentResult": "moved occupancy; success-path time options recomputed from hasScheduleOverlap",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx", "src/features/admin/operations/adminPlannerCommands.ts:210-279"]
  },
  {
    "id": "ops.planner.move.instructor",
    "tab": "operations",
    "screen": "Slot modal (existing booking) -> instructor select",
    "capability": "Reassign a lesson/course day to a different instructor (optionally combined with a move)",
    "entryPoint": "src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx:64-86 -> ScheduleSlotActionModal.tsx:500-556",
    "userAction": "pick a different instructor -> Apply move",
    "states": ["instructorUnavailableTitle", "instructorPriceUnavailable", "success t('lessonReassigned')", "insufficientFundsPrompt (DEAD branch on canonical planner)", "error t('updateFailed')"],
    "commandOrReadModel": "reassignPlannerOccupancy -> change_booking_instructor | reassign_course_day_instructor (blocks are a no-op, adminPlannerCommands.ts:322-324)",
    "currentResult": "instructor changed; reschedule runs first when date/time also changed, then the revision is re-read (:327-333)",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx", "src/features/admin/operations/adminPlannerCommands.ts:281-341"]
  },
  {
    "id": "ops.planner.duration",
    "tab": "operations",
    "screen": "Slot modal (existing booking) -> hours select",
    "capability": "Change lesson duration (1-4 h, closing-time constrained); ordering differs for shrink vs grow",
    "entryPoint": "src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx:128-157 -> ScheduleSlotActionModal.tsx:496-498,561-563",
    "userAction": "pick a new duration -> Apply move",
    "states": ["t('noHoursAvailable')", "success t('scheduleUpdated')", "no-op short-circuit when duration is unchanged (adminPlannerCommands.ts:357)"],
    "commandOrReadModel": "changePlannerOccupancyDuration -> change_booking_duration (lesson bookings only)",
    "currentResult": "duration in minutes = max(1, round(hours*60))",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx", "src/features/admin/operations/adminPlannerCommands.ts:343-365"]
  },
  {
    "id": "ops.planner.delete",
    "tab": "operations",
    "screen": "Schedule board cell hover X, or slot modal red button",
    "capability": "Release an availability block OR cancel a lesson booking with maximum refund",
    "entryPoint": "src/features/admin/components/schedule/ScheduleBookingCell.tsx:37,58,150 -> ScheduleCalendar.tsx:146-148 -> ScheduleSlotActionModal.tsx:791-818 (confirm) ; ActiveSlotMoveForm.tsx:191-199",
    "userAction": "hover the cell -> X (or modal red button) -> Confirm",
    "states": ["confirm modal t('deleteBlockConfirm') / t('confirm') / t('cancel')", "success t('blockRemoved')", "error t('configSaveError') + t('removeBlockFailed')", "not offered for completed/no_show cells (ScheduleBookingCell.tsx:146)"],
    "commandOrReadModel": "releasePlannerOccupancy -> release_administrative_availability_block | resolve_booking_cancellation(decision='direct_cancel', refundAmount=admin.cancellationFinancial.maximumRefund)",
    "currentResult": "block released / booking cancelled and refunded; CourseDay is explicitly refused server-call-side ('CourseDay occupancy is not deleted from the planner')",
    "destructive": true,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleBookingCell.tsx", "src/features/admin/components/schedule/ScheduleSlotActionModal.tsx:785-879", "src/features/admin/operations/adminPlannerCommands.ts:367-407"]
  },
  {
    "id": "ops.planner.complete",
    "tab": "operations",
    "screen": "Slot modal -> 'Mark lesson completed'",
    "capability": "Finalize attendance for the whole service party (all Participants marked present)",
    "entryPoint": "src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx:160-175 -> AdminPlannerBoard.tsx:218-231",
    "userAction": "click 'Mark lesson completed' (no confirmation)",
    "states": ["shown only when status==='confirmed' and booking is a planner lesson (ScheduleSlotActionModal.tsx:181-186)"],
    "commandOrReadModel": "completePlannerLesson -> finalize_booking_attendance",
    "currentResult": "every service participant set to 'present'; requires non-empty service party (adminPlannerCommands.ts:425-427)",
    "destructive": true,
    "sourceFiles": ["src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx", "src/features/admin/operations/adminPlannerCommands.ts:409-444"]
  },
  {
    "id": "ops.planner.guestLink",
    "tab": "operations",
    "screen": "Slot modal -> 'Link to client'",
    "capability": "Link a guest booking to a registered client Account (provisioning the payer self Participant if needed)",
    "entryPoint": "src/features/admin/components/schedule/slot-modal/ActiveSlotDetails.tsx:101-110 -> ScheduleSlotActionModal.tsx:736-750 -> src/features/admin/components/bookings/LinkGuestBookingModal.tsx",
    "userAction": "click 'Link to client' -> search + select a client -> Confirm",
    "states": ["success screen (1200 ms auto-close)", "error banner (client-side text reused from the insufficient-funds path)", "no clients found"],
    "commandOrReadModel": "linkPlannerGuestBooking -> link_guest_booking_to_account_as_administrator (+ provision_self_participant_for_account)",
    "currentResult": "booking bound to the Account/Participant",
    "destructive": true,
    "sourceFiles": ["src/features/admin/components/schedule/slot-modal/ActiveSlotDetails.tsx", "src/features/admin/components/bookings/LinkGuestBookingModal.tsx", "src/features/admin/operations/adminPlannerCommands.ts:446-466"]
  },
  {
    "id": "ops.planner.details",
    "tab": "operations",
    "screen": "Slot modal (existing booking)",
    "capability": "Read-only detail: type, client, difficulty, guest phone/email, notes, cancellation reason",
    "entryPoint": "src/features/admin/components/schedule/slot-modal/ActiveSlotDetails.tsx:17-122",
    "userAction": "open an occupied slot",
    "states": ["break", "day off", "lesson (with/without difficulty)", "guest contact", "notes", "pending_cancellation + reason"],
    "commandOrReadModel": "Booking projection from AdminPlannerOccupancyItem (adminPlannerMapping.ts:110-131)",
    "currentResult": "detail block; no edits",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/slot-modal/ActiveSlotDetails.tsx", "src/features/admin/operations/adminPlannerMapping.ts"]
  },
  {
    "id": "ops.planner.chat",
    "tab": "operations",
    "screen": "Slot modal -> 'Open chat discussion'",
    "capability": "Open the booking chat thread from the planner",
    "entryPoint": "src/features/admin/components/schedule/slot-modal/ActiveSlotDetails.tsx:111-118 -> ScheduleSlotActionModal.tsx:833,881-889",
    "userAction": "click 'Open chat discussion'",
    "states": ["chat modal open/close"],
    "commandOrReadModel": "BookingChatModal (src/features/bookings) with adminProfile as currentUserProfile",
    "currentResult": "chat UI; no planner-level mutation",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleSlotActionModal.tsx", "src/features/admin/components/schedule/slot-modal/ActiveSlotDetails.tsx"]
  },
  {
    "id": "ops.planner.lessonDetailLink",
    "tab": "operations",
    "screen": "Slot modal -> 'Open lesson detail'",
    "capability": "Navigate to the canonical lesson booking detail panel",
    "entryPoint": "src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm.tsx:177-189 -> AdminPlannerBoard.tsx:249-262",
    "userAction": "click 'Open lesson detail'",
    "states": ["shown only for planner lesson bookings (ScheduleSlotActionModal.tsx:187-189)"],
    "commandOrReadModel": "URL ?tab=operations&booking=<id> (adminNavigation.ts:17,28)",
    "currentResult": "AdminLessonBookingPanel opens on the booking",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/AdminPlannerBoard.tsx", "src/features/admin/components/schedule/ScheduleSlotActionModal.tsx", "src/features/admin/adminNavigation.ts"]
  },
  {
    "id": "ops.planner.courseInfo",
    "tab": "operations",
    "screen": "Course tile (day and week grid)",
    "capability": "Show course info notification: other guides, schedule, seats, enrolled names",
    "entryPoint": "src/features/admin/components/schedule/ScheduleTimetableCells.tsx:134-152 and ScheduleCalendar.tsx:491-514",
    "userAction": "click a violet course tile",
    "states": ["t('noClientsEnrolled') when no names (always, on canonical planner)"],
    "commandOrReadModel": "mapPlannerCourses output (Course projection) + bookings filter on 'course_<occupancyId>'",
    "currentResult": "info notification (addNotification); no mutation, no modal",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleTimetableCells.tsx", "src/features/admin/components/schedule/ScheduleCalendar.tsx", "src/features/admin/operations/adminPlannerMapping.ts:135-163"]
  },
  {
    "id": "ops.planner.overlap",
    "tab": "operations",
    "screen": "Slot modal (create + move)",
    "capability": "Client-side conflict pre-check and available time/duration suggestion lists",
    "entryPoint": "src/features/admin/components/schedule/scheduleOverlap.ts:33-144",
    "userAction": "open slot, change instructor/date/time/duration",
    "states": ["conflict blocked (no request sent)", "restricted option lists", "t('noSlotsAvailable')/t('noHoursAvailable')"],
    "commandOrReadModel": "hasScheduleOverlap / getAvailableMoveTimeSlots / getAvailableScheduleDurations (SCHEDULE_CLOSING_TIME_MINUTES=19:00)",
    "currentResult": "pre-validated options; server re-validates via resource claims",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/scheduleOverlap.ts", "src/features/admin/components/schedule/ScheduleSlotActionModal.tsx:200-289"]
  },
  {
    "id": "ops.planner.nav",
    "tab": "operations",
    "screen": "Schedule toolbar",
    "capability": "Navigation: day/week toggle, prev, next, today, date picker, mobile weekday strip; window state persisted in ?plannerDate=",
    "entryPoint": "src/features/admin/components/schedule/ScheduleToolbar.tsx:33-95 -> ScheduleCalendar.tsx:104-129,319-330 -> AdminPlannerBoard.tsx:122-136",
    "userAction": "click toolbar controls",
    "states": ["day mode", "week mode (shows 'Mon - Sun' range instead of a picker)"],
    "commandOrReadModel": "re-query of queryAdminPlannerReadModels with the new Monday window",
    "currentResult": "new window loaded; ?plannerDate= updated with replace:true",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleToolbar.tsx", "src/features/admin/components/schedule/ScheduleCalendar.tsx", "src/features/admin/operations/AdminPlannerBoard.tsx", "src/features/admin/adminNavigation.ts:59-60"]
  },
  {
    "id": "ops.planner.focusDeepLink",
    "tab": "operations",
    "screen": "Schedule board",
    "capability": "Deep link ?plannerBooking=<id> auto-opens that booking's slot modal and expands the section",
    "entryPoint": "src/features/admin/components/schedule/ScheduleCalendar.tsx:89-102 -> AdminPlannerBoard.tsx:264-274; AdminPanel.tsx:201-209",
    "userAction": "arrive with ?plannerBooking=<id> (or ?plannerDate=)",
    "states": ["modal opens when both booking and instructor are resolvable, then the param is deleted"],
    "commandOrReadModel": "URL params only",
    "currentResult": "focused slot modal; one-shot consumption",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/schedule/ScheduleCalendar.tsx", "src/features/admin/operations/AdminPlannerBoard.tsx", "src/features/admin/components/AdminPanel.tsx"]
  },
  {
    "id": "ops.planner.realtime",
    "tab": "operations",
    "screen": "Schedule board (background)",
    "capability": "Realtime refresh of the board when the admin planner revision document changes, or when a local command returns adminPlannerRevision",
    "entryPoint": "src/features/admin/operations/adminPlannerRevisionCoordinator.ts (subscribe :12-26, from-command :47-64) <- subscribeAdminPlannerRevision.ts <- src/lib/admin/subscribeAdminRealtimeRevision.ts",
    "userAction": "implicit (any client writes a booking/block/course day)",
    "states": ["listening", "backoff 1s->30s on retryable Firestore errors", "unsubscribed at zero listeners", "no visible offline state"],
    "commandOrReadModel": "onSnapshot(ADMIN_PLANNER_REVISION_COLLECTION/ADMIN_PLANNER_REVISION_DOCUMENT_ID) -> reduceAdminRealtimeRevisionSignal -> full re-query",
    "currentResult": "board re-renders with the new window; no diffing, no debounce, no user feedback",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/adminPlannerRevisionCoordinator.ts", "src/features/admin/operations/adminPlannerLocalSync.ts", "src/features/admin/operations/subscribeAdminPlannerRevision.ts", "src/features/admin/operations/useAdminPlannerReadModels.ts", "src/lib/admin/subscribeAdminRealtimeRevision.ts"]
  },
  {
    "id": "ops.planner.optimisticConcurrency",
    "tab": "operations",
    "screen": "All planner mutations",
    "capability": "On stale_version / concurrent_modification, refresh projections before rethrowing; expectedRevision sent for blocks/course days; lesson revision re-read via admin_detail",
    "entryPoint": "src/features/admin/operations/AdminPlannerBoard.tsx:44-60; adminPlannerCommands.ts:52-60,231,254,316,385",
    "userAction": "any planner mutation that raced with another writer",
    "states": ["refresh-then-throw -> error toast t('updateFailed')/t('actionFailedTitle')", "success -> refreshAllProjections"],
    "commandOrReadModel": "queryLessonBookingReadModels(scope='admin_detail') + AggregateRevisionSchema.parse",
    "currentResult": "consistent re-read; user must retry manually",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/AdminPlannerBoard.tsx", "src/features/admin/operations/adminPlannerCommands.ts", "src/features/admin/operations/AdminMonitorReadModelsContext.tsx"]
  },
  {
    "id": "ops.metrics.counters",
    "tab": "operations",
    "screen": "Top of the Operations tab",
    "capability": "Operational counters: active lessons, completed lessons (+ no-show sub-count), instructor count",
    "entryPoint": "src/features/admin/operations/AdminOperationalMetricsHost.tsx:14-36 -> AdminOperationalMetrics.tsx:12-73",
    "userAction": "view (no interaction)",
    "states": ["loading (Suspense fallback t('financialOverview'))", "zeros"],
    "commandOrReadModel": "computeAdminOperationalOverview over admin_hot + admin_history lesson read models (drainAll)",
    "currentResult": "3 read-only tiles; no revenue; heading text is t('financialOverview')",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/AdminOperationalMetrics.tsx", "src/features/admin/operations/AdminOperationalMetricsHost.tsx", "src/features/admin/operations/adminOperationalOverview.ts", "src/features/admin/operations/useAdminMonitorReadModels.ts"]
  },
  {
    "id": "ops.monitor.list",
    "tab": "operations",
    "screen": "Bookings log (admin_booking_monitor section)",
    "capability": "Realtime operational list of hot lessons + course enrollments (roster u pending_guest) with guest contact, payment/status badges",
    "entryPoint": "src/features/admin/operations/AdminActiveBookingMonitor.tsx:18-79 -> src/features/admin/components/bookings/BookingsLog.tsx",
    "userAction": "view",
    "states": ["empty (t('noScheduledSessions'))", "guest rows with badge + tel/mailto", "notes", "cancellation reason"],
    "commandOrReadModel": "useAdminMonitorReadModels (lessons hot/history drainAll + enrollments roster/pending_guest/history)",
    "currentResult": "table of Booking projections; system blocks filtered out",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/AdminActiveBookingMonitor.tsx", "src/features/admin/operations/adminBookingMonitorMapping.ts", "src/features/admin/operations/useAdminMonitorReadModels.ts", "src/features/admin/components/bookings/BookingsLog.tsx"]
  },
  {
    "id": "ops.monitor.statusBadge",
    "tab": "operations",
    "screen": "Bookings log status column",
    "capability": "Derived status badge incl. 'awaiting payment' and 'in progress' (now inside the occurrence window)",
    "entryPoint": "src/features/admin/operations/AdminMonitorLessonStatusBadge.tsx:22-38 -> lessonBookingAdminPresentation.ts:83-116",
    "userAction": "view",
    "states": ["awaiting_payment (pending + outstanding + unpaid status)", "in_progress (confirmed and now in [startsAt, endsAt))", "lifecycle status", "fallback plain StatusBadge when no canonicalLifecycleStatus (course rows)"],
    "commandOrReadModel": "Booking row fields canonicalLifecycleStatus / occurrenceStart- EndSeconds / paymentOutstanding / paymentStatus",
    "currentResult": "tone-mapped StatusBadge with translated label",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/AdminMonitorLessonStatusBadge.tsx", "src/features/admin/lesson-bookings/lessonBookingAdminPresentation.ts"]
  },
  {
    "id": "ops.monitor.navigate",
    "tab": "operations",
    "screen": "Bookings log action column + guest 'link to client' button",
    "capability": "Navigate to the canonical lesson/enrollment detail with a lifecycle-derived view (hot | history | pending_guest | roster)",
    "entryPoint": "src/features/admin/operations/AdminActiveBookingMonitor.tsx:22-70 (invoked from BookingsLog.tsx:117-127,178-299)",
    "userAction": "click 'open lesson detail' / 'open cancellation detail' / 'open enrollment attendance' / 'link to client'",
    "states": ["per-status label + button set"],
    "commandOrReadModel": "URL ?tab=operations&booking=<id>&bookingView=<v> | &enrollment=<id>&enrollmentView=<v>",
    "currentResult": "Training records panel opens at the right view; no mutation from the monitor",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/AdminActiveBookingMonitor.tsx", "src/features/admin/components/bookings/BookingsLog.tsx", "src/features/admin/adminNavigation.ts:17-36,59-63"]
  },
  {
    "id": "ops.monitor.refresh",
    "tab": "operations",
    "screen": "Operations tab (shared)",
    "capability": "One-shot refresh of all 5 monitor read models after any planner mutation, then the planner itself",
    "entryPoint": "src/features/admin/operations/AdminMonitorReadModelsContext.tsx:19-40",
    "userAction": "implicit after create/move/reassign/delete/complete/link",
    "states": ["no visible busy state for the background refresh"],
    "commandOrReadModel": "lessonsHot.retryList, lessonsHistory.retryList, enrollmentsRoster/Pending/History.refreshList, planner refresh",
    "currentResult": "all operations-tab data stays consistent after a planner write",
    "destructive": false,
    "sourceFiles": ["src/features/admin/operations/AdminMonitorReadModelsContext.tsx", "src/features/admin/operations/useAdminMonitorReadModels.ts", "src/features/admin/components/AdminPanel.tsx:188"]
  }
]
```

---

## 7. UNVERIFIABLE / THIN / DEAD ITEMS

**Thin aliases / vestigial plumbing (do not treat as capabilities):**
1. `skipLegacyBalanceGate` вЂ” accepted by `ScheduleCalendar.tsx:48,71,298` and `ScheduleSlotActionModal.tsx:76,779` but destructured as `_skipLegacyBalanceGate` and **never read**. Dead prop.
2. `allowNegativeBalance` option (`ScheduleCalendar.tsx:34-40`, `ScheduleSlotActionModal.tsx:32-38,589`) вЂ” `AdminPlannerBoard.handleReassign` (`:169-185`) takes no `options`, so the whole `InsufficientFundsError` в†’ amber prompt в†’ "allow negative balance" flow (`ScheduleSlotActionModal.tsx:141-142,536-555,579-603,642-683`) is **unreachable on the canonical planner**. It only works for legacy `addBooking`-style callers that no longer exist.
3. `adminFinancialOverview.ts` (203 bytes) and `AdminFinancialOverviewHost.tsx` import `formatDateLocalYMD` from the schedule folder вЂ” pure utility reuse, no coupling.
4. `courseCalendarUtils.ts` (`getDaysInMonth`, 42-cell month grid) is **not imported anywhere** in the audited code. Dead code.
5. `plannerLocalDateFromDate` (`scheduleDateInput.ts:8-10`) вЂ” 1-line alias of `formatDateLocalYMD`. Unused in this surface.
6. `occupancyRevision` (`adminPlannerMapping.ts:178-183`) вЂ” exported; not used by the planner board itself (commands use `occupancyForId`).
7. `occupancyKind === 'course_day'` branch in `reassignPlannerOccupancy` (`:305-321`) is reachable only if a course day is ever passed an `occupancyId` to a reassign call; the UI never offers reassign for course tiles (they are not `Booking` rows). The command is still exercised by emulator tests.
8. `SCHEDULE_CLOSING_TIME_MINUTES` and `getAvailableMoveTimeSlots` / `getAvailableScheduleDurations` / `hasScheduleOverlap` are re-exported from `src/features/admin/index.ts` but no other feature imports them today.
9. `normalizeScheduleTime` is defined **twice**: `scheduleUtils.ts:46-50` and `adminPlannerMapping.ts:9-13` (identical bodies).

**Behavior that looks broken / must be decided, not silently "preserved":**
10. Course tiles' "enrolled / clients" lookup uses `bookings.filter(b => b.instructorId === 'course_' + course.id)` (`ScheduleTimetableCells.tsx:104-109`, `ScheduleCalendar.tsx:465-470`), but the canonical planner never emits such bookings (`mapPlannerCourses` sets `id: item.occupancyId`, and the occupancy read model has no enrollment rows). The tile therefore always shows `0` enrolled / `t('noClientsEnrolled')`, and `availableSeats`/`totalSeats` are hard-coded `0 / 0` in `mapPlannerCourses` (`adminPlannerMapping.ts:157-158`). This is a current, user-visible gap вЂ” not something to re-implement, but it must not be mistaken for a working capability.
11. `AdminOperationalMetrics` heading uses `t('financialOverview')` (`AdminOperationalMetrics.tsx:23`) for a section that contains no financial data; the fallback literal is `'Р¤РёРЅР°РЅСЃРѕРІС‹Р№ РѕР±Р·РѕСЂ'`. Copy bug; product decision needed.
12. `occupiedBookings` is computed (`adminOperationalOverview.ts:86-88,95`) but never rendered.
13. Duration is lossy on the board: `durationHours()` rounds minutes to whole hours with `Math.max(1, вЂ¦)` (`adminPlannerMapping.ts:5-7`). A 30-minute or 90-minute lesson is displayed as 1 h or 2 h, and reschedule/duration selectors only offer `[1,2,3,4]`. Canonical supports arbitrary `durationMinutes`.
14. The grid is fixed to 08:00вЂ“18:00 columns and 19:00 closing. A canonical booking outside that range is fetched and drawn in the monitor but is **not placeable on the board** (no `+` cell, and the move-time list is empty в†’ `t('noSlotsAvailable')`).
15. The "delete" affordance on a lesson is a **paid cancellation with refund** (`resolve_booking_cancellation`, `direct_cancel`, `maximumRefund`), labeled `t('deleteCancelBlock')` and confirmed with the generic `t('deleteBlockConfirm')`. The refund amount is never shown to the admin.
16. "Mark lesson completed" finalizes **all** service participants as `present` with no per-participant choice and no confirmation (`adminPlannerCommands.ts:422-443`). Attendance policy risk вЂ” the real attendance editor lives in `AdminLessonBookingPanel`.
17. The board's `totalPrice` is always `0` (`adminPlannerMapping.ts:120`), yet the create dialog displays a computed price (`ScheduleSlotActionModal.tsx:414-420`) and the "insufficient funds" prompt uses it. Those are display-only computations; the canonical price is server-side.
18. "Loading plannerвЂ¦" is a hard-coded English literal (`AdminPlannerBoard.tsx:280`), and the error text is a raw enum (`:278`) with no retry affordance.

**Unverifiable from source alone (would need runtime/emulator/auth):**
19. Whether `admin_planner_visualization` booking visibility scope (`adminPlannerReadModels.ts:80`, `isBookingVisibleForOccupancyScope` at `instructorOccupancyReadSupport.ts:40`) hides any lifecycle status the board still renders styles for вЂ” the mapping accepts `pending|confirmed|pending_cancellation|completed|no_show` and silently coerces anything else to `'confirmed'` (`adminPlannerMapping.ts:82-89`).
20. Whether `booking.cancellationReason` is ever present on planner rows вЂ” `mapPlannerOccupancyToBookings` (`adminPlannerMapping.ts:110-131`) **never sets it**, so the cancellation-reason panel in `ActiveSlotDetails.tsx:93-97` is dead on the planner (it works in the monitor, where `BookingsLog.tsx:160-165` also depends on it вЂ” `lessonBookingToMonitorRow` also does not set it). Unverifiable without a data check.
21. Whether `booking.attendanceOverdue` / `missingAttendanceCount` are actually surfaced вЂ” they are mapped (`adminPlannerMapping.ts:126-129`) and rendered as `t('plannerAttendanceNotRecorded')` (`ScheduleBookingCell.tsx:140-144`), but depend on `loadOverdueAttendanceFacts` (`instructorOccupancyReadSupport.ts:257-262`).
22. `ADMIN_PLANNER_REVISION_COLLECTION` / `ADMIN_PLANNER_REVISION_DOCUMENT_ID` вЂ” exact Firestore collection/document names live in shared-domain; not printed in this audit, and not confirmed to be written by every command that changes occupancy.
23. Real end-to-end behavior of all five drained read models on a production-sized dataset (page bounds, cost) вЂ” requires an authenticated emulator run.
24. **No authenticated runtime verification was performed** (`AUTHENTICATED WORKFLOW: NOT VERIFIED`). This audit is source-only, per the read-only constraint.


---

_tmp-training-issues.md

# Capability-preservation audit вЂ” ADMIN unified training records + issue inbox

READ-ONLY audit. Repo: `D:\SkiAcademy_DB` (React/Vite/Firebase "Carve Academy", RU+EN, KZT).
Scope: `src/features/admin/training-records/*`, `src/features/admin/lesson-bookings/*`,
`src/features/admin/course-enrollments/*`, `src/features/admin/issues/*`, plus the mount point
`src/features/admin/components/AdminPanel.tsx` and shared-domain read models / issue policy.
No files were modified except this report.

---

## 0. TL;DR

* Lesson bookings AND course enrollments live in **ONE** section: `AdminTrainingRecordsPanel`
  (mounted at `src/features/admin/components/AdminPanel.tsx:252-281`, DOM id
  `canonical_training_records`, `adminNavigation.ts:31`).
* All list filters are **URL state**; only the issue-inbox **text search** is local React state.
* **No bulk/multi-select anywhere** in these screens. The only "multi-item" command is the
  per-booking attendance finalize.
* The issue inbox is **triage-only**: it fires **zero** commands. No issue of any kind can be
  dismissed, and none can be resolved without a coupled domain command
  (`packages/shared-domain/src/canonical/adminIssuePolicy.ts:49-99`).
* Legacy `BookingsLog` and `LinkGuestBookingModal` are **LIVE**. `AdminLessonBookingPanel` and
  `AdminCourseEnrollmentPanel` are **runtime-dead, test-only**.

---

## 1. UNIFIED SECTION

### 1.1 One section, two record kinds

| Fact | Value | Source |
|---|---|---|
| Section DOM id | `canonical_training_records` (`ADMIN_TRAINING_RECORDS_SECTION_ID`) | `adminNavigation.ts:31` |
| Compatibility aliases | `ADMIN_LESSON_BOOKINGS_SECTION_ID`, `ADMIN_COURSE_ENROLLMENTS_SECTION_ID` в†’ same id | `adminNavigation.ts:33-34` |
| Mounted component | `AdminTrainingRecordsPanel` (lazy, `../training-records`) | `AdminPanel.tsx:98-102`, mounted `:273-279` |
| Section props | `adminAccountId`, `instructors: AdminLessonInstructorOption[]` | `AdminTrainingRecordsPanel.tsx:84-87` |
| Open by default | `false`; forced open when `booking` / `enrollment` / `enrollmentCourse` is present | `AdminPanel.tsx:258-269` |
| Legacy scroll anchors | `<span id="canonical_lesson_bookings">` and `<span id="canonical_course_enrollments">` (sr-only) | `AdminPanel.tsx:271-272` |
| Scroll helper | `scrollAdminTrainingRecordsSectionIntoView(320)` в†’ alias of `scrollAdminLessonBookingsSectionIntoView` | `adminNavigation.ts:52-58` |

Layout: two-column grid `lg:grid-cols-[minmax(320px,38fr)_minmax(0,62fr)]` вЂ” left = master list
section (`aria-label` = `t('adminTrainingListLabel')`, `AdminTrainingRecordsPanel.tsx:426-430`),
right = detail `<aside>` (`aria-label` = `t('adminTrainingDetailLabel')`, `:694-698`).

The list is a single merged array:

* `mergeAdminTrainingRecords({kind, lessons, courses})` вЂ” `adminTrainingRecordUtils.ts:67-87`.
* `kind==='lesson'` в†’ lessons only; `kind==='course'` в†’ courses only; `kind==='all'` в†’ `[...lessons, ...courses]`.
* Sort: `updatedAt` descending via `compareCanonicalTimestamps`; tie-break `kind.localeCompare`, then `id.localeCompare` (`:78-86`).
* `AdminTrainingRecord` union: `{kind:'lesson', id: bookingId, data: LessonBookingReadModel}` |
  `{kind:'course', id: enrollmentId, data: AdminCourseEnrollmentRosterItem}` вЂ” `adminTrainingRecordContracts.ts:9-19`.

Lazy read enabling (avoids loading the other domain):

```
lessonEnabled = kind !== 'course' || Boolean(selectedBookingId)      // :175
courseEnabled = kind !== 'lesson'  || Boolean(selectedEnrollmentId)  // :176
```

Row component: `AdminTrainingRecordListRow` (22 lines) is a thin wrapper that adds
`data-admin-training-kind={recordKind}` around the shared `AdminLessonBookingListRow`
(`AdminTrainingRecordListRow.tsx:17-21`), which also sets `data-admin-lesson-booking-id` and
`data-admin-training-record-id` when `trainingRecordId` is present
(`AdminLessonBookingUi.tsx:136-144`). The course row is shaped by
`courseEnrollmentListCardInput()` (`adminTrainingRecordPresentation.ts:39-72`), which maps
`enrollmentId` в†’ `bookingId`, `course.title` в†’ `subtitle`, `attendanceSummary.recordedDayCount` в†’
`meta` ("Recorded days: n"), and `guestState !== 'not_guest' ? 'guest' : 'account'` в†’ origin.

### 1.2 `trainingKind` вЂ” exact values and semantics

Type: `AdminTrainingKindFilter = 'all' | 'lesson' | 'course'` (`adminTrainingRecordContracts.ts:6`).
UI: three pill buttons `['all','lesson','course']` (`:433-452`), labels
`adminTrainingFilterAll` / `adminTrainingFilterLessons` / `adminTrainingFilterCourses`.

`setKind(next)` (`:287-292`) writes `trainingKind` and **clears** `booking` + `enrollment`.

Derivation when the query param is absent вЂ” `resolveAdminTrainingKindFilter`
(`adminTrainingRecordUtils.ts:24-36`):

1. explicit `trainingKind` in `all|lesson|course` wins (`parseAdminTrainingKindFilter` `:10-15`);
2. else if `enrollment` selected **or** `enrollmentCourse` filter set в†’
   `'all'` when a `booking` is also selected, otherwise `'course'`;
3. else `'all'`.

### 1.3 `trainingScope` вЂ” exact values and semantics

Type: `AdminTrainingScope = 'current' | 'history' | 'pending_guest'` (`adminTrainingRecordContracts.ts:7`).
UI: three buttons `['current','history','pending_guest']` (`:454-472`), labels
`adminTrainingScopeCurrent` / `adminTrainingScopeHistory` / `adminTrainingScopePendingGuests`.

`setScope(next)` (`:294-301`) writes `trainingScope` **and** the two legacy view params, and
clears `booking` + `enrollment`:

| `trainingScope` | `bookingView` (`lessonViewForTrainingScope` `:55-59`) | `enrollmentView` (`courseViewForTrainingScope` `:61-65`) |
|---|---|---|
| `current` | `hot` | `roster` |
| `history` | `history` | `history` |
| `pending_guest` | `pending_guest` | `pending_guest` |

Derivation вЂ” `resolveAdminTrainingScope` (`adminTrainingRecordUtils.ts:38-53`):

1. explicit `trainingScope` wins (`parseAdminTrainingScope` `:17-22`);
2. else if `enrollmentView==='pending_guest'` **or** `bookingView==='pending_guest'` в†’ `pending_guest`;
3. else `kind==='lesson'` в†’ `bookingView==='history' ? 'history' : 'current'`;
4. else `kind==='course'` в†’ `enrollmentView==='history' ? 'history' : 'current'`;
5. else `history` only when **both** views are `history`; otherwise `current`.

### 1.4 What `'current'` actually means

`'current'` is **not** a time window. It is the canonical *active* read scope:

* lessons в†’ `queryLessonBookingReadModels({scope:'admin_hot'})` вЂ” `useAdminLessonBookingReadModels.ts:94-99`
  (views: `hot | history | pending_guest` в†’ `admin_hot | admin_history | admin_pending_guest`);
* enrollments в†’ `queryAdminCourseEnrollmentReadModels({scope:'admin_course_roster'})` вЂ” `useAdminCourseEnrollmentReadModels.ts:29-33`
  (views: `roster | pending_guest | history` в†’ `admin_course_roster | admin_pending_guest | admin_history`).

So: `current` = hot/roster (open, actionable records); `history` = canonical terminal-history
projection; `pending_guest` = unlinked guest reservations. Any rebuild must preserve both the
`trainingScope` pill and the paired legacy `bookingView`/`enrollmentView` params, because
`AdminActiveBookingMonitor` deep-links set only the legacy pair
(`AdminActiveBookingMonitor.tsx:35-44`, `:58-67`) and the derivation functions above read them.

### 1.5 Enroll-on-behalf inside the unified section

Rendered only when `kind !== 'lesson'` (`:496-553`): course select (filtered to
`lifecycle==='active' && availableSeats>0`, `:508`), `AdminManagedParticipantPicker` (`:515-518`),
reason input (`:519-525`), and a Create button disabled unless
`(createCourseId || courseId) && createSelection && createReason.trim()` (`:528-530`).
Fires `create_course_enrollments` with `courseId`, `courseRevision`, `participantId`,
`reasonExplanation`; confirm message `"<participant> в†’ <course> @ course rev <n>"` (`:531-546`).
The course catalog is `queryAdminCourseReadModels({scope:'admin_course_list', pageSize:50})`
(`:208`), refreshed on the courses revision coordinator when `kind !== 'lesson'` (`:215-217`),
with a generation counter to discard stale responses (`:205-214`, `:225-231`).

---

## 2. FILTERS / SEARCH / SORTING

### 2.1 URL state (shared, `replace:true`)

`updateQuery` writes through `setSearchParams(prev => вЂ¦, {replace:true})` and deletes a key when
the value is `undefined` **or empty string** (`AdminTrainingRecordsPanel.tsx:273-285`;
`AdminLessonBookingPanel.tsx:124-139`; `AdminCourseEnrollmentPanel.tsx:128-140`;
`AdminIssueCenter.tsx:134-149`).

| Query key | Constant (file:line) | Values | Written by | Read by |
|---|---|---|---|---|
| `tab` | `ADMIN_TAB_QUERY_KEY` `adminNavigation.ts:17` | `operations|finance|people|product|system` | tab nav, cross-section deep links | `AdminPanel.tsx:163` |
| `trainingKind` | `:35` | `all|lesson|course` | `setKind` `ATRP:288-291` | `resolveAdminTrainingKindFilter` |
| `trainingScope` | `:36` | `current|history|pending_guest` | `setScope` `ATRP:296` | `resolveAdminTrainingScope` |
| `booking` | `:28` | `BookingId` | list row select `ATRP:600`; close `:742`; planner/issue/CR deep links | `BookingIdSchema.safeParse` `ATRP:148` |
| `bookingView` | `:29` | `hot|history|pending_guest` | `setScope` `ATRP:297`; `AdminActiveBookingMonitor.tsx:40` | `parseAdminLessonBookingView` `lessonBookingAdminUtils.ts:21-27` |
| `enrollment` | `:61` | `CourseEnrollmentId` | `ATRP:652`, close `:840`; issue/monitor deep links | `ATRP:150-153` |
| `enrollmentView` | `:62` | `roster|pending_guest|history` | `setScope` `ATRP:298`; `AdminActiveBookingMonitor.tsx:63` | `parseAdminCourseEnrollmentView` `adminCourseEnrollmentUtils.ts:26-31` |
| `enrollmentCourse` | `:63` | `CourseId` | course select `ATRP:479`; `adminCourseEnrollmentSearchParams` `adminNavigation.ts:146` | `ATRP:154-157` |
| `issue` | `:18` | `AdminIssueId` | issue row `AdminIssueCenter.tsx:475`; booking/enrollment detail `ATRP:752`, `:827` | `AdminIssueCenter.tsx:110-112` |
| `issueView` | `:19` | `open|history` (`'resolved'` also в†’ history) | `AdminIssueCenter.tsx:266`, `:281` | `parseAdminIssueView` `adminNavigation.ts:167-169` |
| `issueSeverity` | `:20` | `normal|urgent|critical` | severity select `AdminIssueCenter.tsx:302` | `:108`, `parseAdminIssueSeverity` `:194-200` |
| `issueCategory` | `:21` | `attendance|payment|cancellation|reconciliation|change_request|guest` | category select `AdminIssueCenter.tsx:330` | `:109`, `parseAdminIssueCategory` `:171-192` |
| `changeRequest` | `:22` | `BookingChangeRequestId` | change-request row `AdminIssueCenter.tsx:434`; review button `:630-635` | `ATRP:170-172` в†’ `focusedChangeRequestId` |
| `payment` | `ADMIN_FINANCE_PAYMENT_QUERY_KEY` `:24` | `PaymentId` | `ATRP:746`, `:821`; issue destination `AdminIssueCenter.tsx:231` | finance tab |
| `plannerDate` / `plannerBooking` | `:59-60` | `YYYY-MM-DD` / `BookingId` | `ATRP:738-739` (onOpenPlanner) | `AdminPanel.tsx:202-208` forceOpen |

### 2.2 Local (non-URL) state вЂ” deep-link loss risk

| State | Owner | Note |
|---|---|---|
| issue-inbox free-text search | `AdminIssueCenter.tsx:106` `useState('')` | **not** in URL; filters client-side only |
| `actionReason`, `refundAmount`, `paymentAmount`, `linkSelection`, `linkReason`, `targetCourseId` | `AdminTrainingRecordsPanel.tsx:245-253` | drafts; re-seeded from detail on change (`:258-265`, `:267-271`) |
| `createCourseId`, `createSelection`, `createReason` | `:250-252` | enroll-on-behalf form |
| `courses` catalog | `:203` | `queryAdminCourseReadModels` page 50 |
| `lessonConfirmation` / `courseConfirmation` | `:233-240` | shared confirm dialog |
| `mutationError` / `mutationNotice` / `mutationPending` | `:241-244` | banner + dialog |
| `attendanceFinalizeSuccessNonce` | `:242` | used to clear the attendance draft (`AdminLessonBookingDetail.tsx:207-209`) |
| lesson drafts (`actionReason`, `refundAmount`, `paymentAmount`, `linkSelection`, `linkReason`, `attendanceConfirmOpen`) | `AdminLessonBookingDetail.tsx:161-166` | owned by the detail component in the unified panel (comment `:256-257`) |
| `activeSection` (detail tab) | `AdminLessonBookingDetail.tsx:156`, `AdminCourseEnrollmentDetail.tsx:146` | not in URL |

### 2.3 Every filter in the unified section (complete)

1. **Kind pills** вЂ” `all|lesson|course` (URL `trainingKind`).
2. **Scope buttons** вЂ” `current|history|pending_guest` (URL `trainingScope` + paired view keys).
3. **Course select** вЂ” rendered only when `kind !== 'lesson'`; options from the 50-item course
   catalog; first option `courseCopy.allCourses`; `onChange` sets `enrollmentCourse` and clears
   `enrollment` (`ATRP:473-492`).
4. **Load more** вЂ” one button, calls **both** `lessonReads.loadMore()` and
   `courseReads.loadMore?.()` when each has `hasMore`; disabled while either is `loadingMore`
   (`:674-688`).
5. **Retry** вЂ” a single error panel; `listError = lessonReads.list.error || courseReads.list.error`
   (`:323`); retry fires `lessonReads.retryList()` **and** `courseReads.retryList()` (`:568-577`).
   Error copy: `permission-denied` в†’ `adminLessonPermissionDenied`, else `adminLessonReadFailed`.

There is **no text search**, **no instructor filter**, **no date filter**, **no status filter**,
**no origin filter**, and **no sort control** in the training-records list. Sorting is fixed
(`updatedAt` desc). `trainingRecordHasAlert()` exists in
`adminTrainingRecordPresentation.ts:18-32` but is **not used** by the panel (grep-verified) вЂ” the
row attention highlight instead comes from `AdminLessonBookingUi.tsx:128-133`
(`awaiting_payment` в†’ amber left border, `pending_cancellation` в†’ rose left border).

### 2.4 Issue-inbox filters (complete)

* view toggle `open|history` (`:261-293`), both buttons also clear `issue` and `changeRequest`;
* severity `<select>` вЂ” server-side filter passed to `queryAdminIssueReadModels` (`useAdminIssueReadModels.ts:98-102`); on change clears `issue`;
* category `<select>` вЂ” **client-side only** (`AdminIssueCenter.tsx:184-191` via
  `adminIssueMatchesCategory`); on change clears `issue` + `changeRequest`;
  the `guest` option is conditionally hidden unless at least one inbox item has
  `presentationOrigin === 'guest'` (`:179-182`, `adminIssueHasGuestPresentation` `adminIssuePresentation.ts:109-113`);
* text search (local state) over `kind + subjectDisplayName + courseTitle` for issues
  (`adminIssueSearchHaystack` `adminIssuePresentation.ts:115-121`) plus the localized kind label, and over
  `instructor.displayName + participants[].displayName + reason` for change requests (`:194-207`);
* refresh button (`:358-365`) в†’ `retryInbox()` which retries both issue list and change-request list (`:218-221`);
* load more (`:527-536`).

---

## 3. ROW ACTIONS + BULK

### 3.1 Bulk / multi-select

**None.** There is no checkbox, no selection set, and no bulk command in
`training-records`, `lesson-bookings`, `course-enrollments`, or `issues`. Verified by reading every
list renderer: `AdminTrainingRecordsPanel.tsx:584-690`, `AdminLessonBookingMasterList.tsx:136-180`,
`AdminCourseEnrollmentPanel.tsx:320-337`, `AdminIssueCenter.tsx:426-538`.

The closest thing to a multi-item write is the **per-booking attendance finalize**, which writes
all target participants of one booking in a single command
(`finalize_booking_attendance`, `AdminLessonBookingDetail.tsx:305-319`).

### 3.2 The only per-row action: select

`AdminLessonBookingListRow` is a single `<button type="button">`
(`AdminLessonBookingUi.tsx:135-145`) whose `onClick` is the only handler. There is no
row-level kebab menu, no inline cancel, no inline confirm, no inline status change.

* Lesson row в†’ `updateQuery({booking: record.id, enrollment: undefined})` (`ATRP:598-603`).
* Course row в†’ `updateQuery({enrollment: record.id, booking: undefined})` (`ATRP:650-655`).
* `aria-current="true"` when selected; selection ring via `selected` prop (`AdminLessonBookingUi.tsx:140-144`).

Everything else (mutations) lives in the right-hand detail pane. The legacy
`BookingsLog` (live, different component) is the only place with per-row status-conditional
buttons вЂ” see В§9.

---

## 4. DIALOGS / DETAIL VIEWS / FORMS

### 4.1 Shared confirmation dialog (unified panel)

`AdminTrainingRecordsPanel.tsx:846-899` вЂ” `role="dialog" aria-modal="true"`, overlay
`fixed inset-0 z-60 bg-black/55`. Contents: title (`adminLessonConfirmTitle` or
`courseCopy.confirmTitle`), the attempt message, optional inline error, **Cancel** +
**Confirm / Retry Same** (`mutationError ? retrySame : confirm`), submit button shows
`pendingLabel` and is disabled while `mutationPending`.

* Lesson branch в†’ `lessonCommands.runAttempt(lessonConfirmation.attempt)` (`:344`).
* Course branch в†’ `courseCommands.runAttempt(courseConfirmation.attempt)` (`:363`).
* `stale_version` error в‡’ the dialog is closed automatically and the error surfaces as a page
  banner (`:358`, `:378`).
* On success with `refreshFailed` for `record_provider_payment_event` /
  `pay_service_from_wallet_as_administrator` в‡’ amber notice
  `adminLessonPaymentRecordedRefreshPending` / `courseCopy.paymentRecordedRefreshPending`
  (`:346-355`, `:365-375`).
* Editing `paymentAmount` / `linkSelection` / `linkReason` after a pending confirmation drops
  the confirmation so a stale attempt is never submitted (`:792-807`).

**Guard strength:** the dialog is a single generic "are you sure" with a one-line message. There
is **no** typed-to-confirm, **no** typed refund amount echo, and **no** second confirmation for
money. The legacy (dead) lesson panel additionally prints the exact optimistic-concurrency target
(`bookingId @ rev N`, or `вЂ¦ в†’ accountId/participantId` for guest links) вЂ”
`AdminLessonBookingPanel.tsx:420-427`. **The unified panel omits this target line в†’ parity gap
to restore.**

### 4.2 Lesson detail pane (tabs) вЂ” `AdminLessonBookingDetail.tsx`

Sections memo `:256-297`; tab bar `AdminLessonDetailTabs` (roving ArrowLeft/Right/Home/End,
`AdminLessonBookingUi.tsx:230-248`); inactive panels are rendered `hidden` for a11y
(`:1062-1072`).

| Tab | Rendered when | Fields / controls |
|---|---|---|
| `overview` | always | date, time range, duration, instructor, participant(s) (singular/plural label), guest phone `tel:` link, guest email `mailto:` link, payer (only if `shouldShowPayerRow` вЂ” hidden when payer == the only participant, `:503-508`), difficulty, notes; change-request card; planner hint / "no actions" note (`:608-621`) |
| `payment` | `payment` exists | price / paid / outstanding rows; conditional ancillary rows original (only if в‰  price) / refunded / retained / settled / written_off (`:639-646`, `lessonBookingAdminPresentation.ts:186-198`); payment status; `AdminPaymentCaptureSection`; "Open payment" в†’ `tab=finance&payment=вЂ¦` (`:697-703`) |
| `attendance` | `(admin.attendance ?? []).length > 0 \|\| attendancePending \|\| attendanceHasMutations` (`:243-244`) | per-participant status + Present/Absent buttons; finalize button; reason field; see В§5 |
| `cancellation` | `shouldShowCancellationSection` (`:223`) | refund input (default `suggestedRefund`, max `cancellationFinancial.maximumRefund`); reason; approve / reject / direct-cancel; see В§6 |
| `guest` | `shouldShowGuestSection` вЂ” `bookingOrigin==='guest' \|\| canLinkGuestToAccount` (`:899-972`) | participant list, picker, reason, review sentence, Link button; otherwise unavailability reason text |
| `issues` | `admin.relatedIssues.length > 0` (`:974-998`) | one row per issue: `severity В· kind В· lifecycleStatus` + "Open issue" в†’ `tab=operations&issue=вЂ¦` |
| `technical` | always (`<details>`) | bookingId, booking+schedule revisions, paymentId+revision, lifecycle, payment status, origin, instructorId, participantIds, payer accountId, timezone, updatedAt, cancellationFinancial timing/suggested/max, and the list of `true` authorized-action keys (`:1000-1059`) |

Header (sticky) contains: participants title, occurrence header + instructor, status chip, payment
indicator, origin badge; **Open in planner** button; **disabled "Send SMS"** button with
`aria-describedby="admin-lesson-sms-unavailable"` and explanatory text (`:362-377` вЂ” a permanent
capability stub); close (X) button; then up to 4 alert cards: awaiting payment (with amount + guest
note `adminLessonGuestApprovalUnavailable`), cancellation requested (jump to tab), critical open
issues count (jump to tab), and the focused instructor change request (jump to planner).

### 4.3 Course detail pane (tabs) вЂ” `AdminCourseEnrollmentDetail.tsx`

`layout` prop is `'tabs'` in the unified panel (`ATRP:778`) and `'stacked'` in the dead legacy
panel (`AdminCourseEnrollmentPanel.tsx:369`). Tabs (`:178-222`): `overview`, `payment`
(attention when `canRecordPayment || awaitingPayment`), `attendance`, `cancellation` (conditional,
attention on `pending_cancellation`), `guest` (always rendered), `issues` (conditional, attention on
any open), `technical`. Same `AdminLessonDetailTabs` with `idPrefix="admin-course"`.

Header: participant name, subtitle (`course.title В· schedule range` + instructor label), status
chip / payment indicator / origin badge / `AdminLessonKindChip(t.typeCourse)`; close button
(`showClose` default true); alert cards for awaiting payment, cancellation requested, critical
issues (only the jump-links are `tabs`-only, `:841-866`).

* overview: participant, course, instructor, schedule range, course-day count, recorded attendance
  (`presentDayCount present В· absentDayCount absent`), payer (if different from participant),
  seats `available/total`; **transfer** block (target-course select from
  `detail.transfer.targetOptions` + Transfer button, reason field in `tabs` layout) (`:275-319`);
  "no actions" note when no authorized action is true (`:320-326`).
* payment: primary + ancillary rows; `guestDeferred` note when awaiting payment and
  `guestState !== 'not_guest'` (`:365-367`); capture section; "Payment в†’" button.
* attendance: one block per course day (date, status label, recordedBy instructor/administrator,
  Present/Absent buttons) + "Resolve outcome" button + reason field (`tabs` layout).
* cancellation: `cancellationRequested` note, reason field (`tabs`), "Cancel unpaid guest"
  (direct_cancel, refund 0) and/or refund input + Approve / Reject.
* guest: guest-state label, participant, phone, email; link block when `canLinkGuest`; otherwise
  (only when `guestState !== 'not_guest'`) the unavailability reason.
* issues: one clickable row per issue `${t.issue}: ${kind} В· ${lifecycleStatus}` в†’ `onOpenIssue`.
* technical: enrollmentId, courseId, originalCourseId, participantId, payerAccountId, paymentId,
  revision, raw lifecycle, raw guestState, guest link unavailable reason, capacity raw +
  seatHeld/seatReleased, payment id+status+revision, `auditContext.bookingOrigin`, createdAt,
  updatedAt, `transfer.blockedReason`, `reconciliation.evidenceIssueIds`, true authorized-action
  keys, and the per-day `courseDayId:status@rev` list; plus a **Reconcile** button when
  `authorizedActions.canReconcile` (`:771-784`).

### 4.4 Attendance finalize dialog (the only bespoke modal)

`AdminLessonBookingDetail.tsx:1073-1133` вЂ” `role="dialog" aria-modal="true"`, title
`adminLessonConfirmAttendanceTitle`; a `<ul>` of every target participant with the drafted status;
present count (`adminLessonAttendancePresentCount {n}`) and absent count
(`adminLessonAttendanceAbsentCount {n}`); an explicit warning paragraph
`adminLessonConfirmAttendanceWarning`; **Back** + **Submit**. It commits **directly** through
`onCommitAttendanceFinalize` (bypassing the container confirmation dialog) and closes only on
`true` (`:1122-1126`). It is opened only when `attendanceHasMutations` (`:773-784`).

### 4.5 Destructive actions and their guards

| Action | Command | Guard |
|---|---|---|
| lesson direct cancel | `resolve_booking_cancellation` `decision:'direct_cancel'` | reason non-empty **and** `refundValid`; then generic confirm dialog |
| lesson approve cancellation | `resolve_booking_cancellation` `decision:'approve'` | same |
| lesson reject cancellation | `resolve_booking_cancellation` `decision:'reject'` | reason non-empty |
| course cancel unpaid guest | `resolve_course_enrollment_cancellation` `direct_cancel`, refund hardcoded `0` | reason non-empty |
| course approve / reject cancellation | same command, `approve` w/ refund / `reject` | reason (+ refund validity) |
| transfer enrollment | `transfer_course_enrollment` | reason non-empty + target course selected |
| reconcile enrollment | `reconcile_course_enrollment` | none beyond availability (`:771-784`) |
| resolve attendance outcome | `resolve_attendance_outcome` | none |
| record cash payment | `record_provider_payment_event` | amount integer в‰Ґ1 and в‰¤ outstanding (`AdminPaymentCaptureSection.tsx:44`) |
| pay from wallet | `pay_service_from_wallet_as_administrator` | `walletBalance >= outstanding` else button disabled with `insufficientFundsLabel` (`:46-48`) |
| link guest booking/enrollment | `link_guest_booking_to_account_as_administrator` / `link_guest_course_enrollment_to_account_as_administrator` | picker + reason non-empty |
| resolve change request | `resolve_booking_change_request` `booking_cancelled` | reason + refund valid; `no_change` needs no reason |
| finalize attendance | `finalize_booking_attendance` | all participants drafted + reason non-empty + warning dialog |
| **delete** | вЂ” | **no delete/destroy command exists anywhere in these files** |

All mutation buttons are `disabled` (not hidden) when the guard fails, so the capability surface
stays discoverable. Optimistic-concurrency is handled by `expectedRevision` on every command plus
the automatic `stale_version` projection refresh
(`useAdminLessonBookingCommands.ts:328-330`, `useAdminCourseEnrollmentCommands.ts:242-248`).

---

## 5. ATTENDANCE

### 5.1 Lesson bookings вЂ” participant-scoped, one hook, one confirm

Hook: **`useAdminLessonAttendanceDraft`** (`useAdminLessonAttendanceDraft.ts`), instantiated at
`AdminLessonBookingDetail.tsx:167-175`.

* Target participants: `detail.serviceParticipantIds ?? detail.participantIds`
  (`useAdminLessonAttendanceDraft.ts:14-16`, memo deps `[bookingId, participantIds, serviceParticipantIds]`).
* Draft statuses: `'present' | 'absent'` only (`AdminLessonAttendanceDraftStatus`, line 8).
* Seed: only from real server records whose `attendanceStatus` is `present`/`absent`
  (`:18-32`); re-seeded on booking change or when `serverSeedKey`
  (`participantId:status:revision|вЂ¦`, `:34-46`) changes, unless the draft is dirty (`:68-77`).
* `allTargetParticipantsDrafted` = every target participant has `present|absent` (`:87-94`);
  `presentCount` / `absentCount` (`:101-108`); `clearDraftAfterSuccess()` (`:96-99`) is invoked
  when the container bumps `attendanceFinalizeSuccessNonce`
  (`AdminLessonBookingDetail.tsx:207-209`).
* Per-participant buttons are gated by `record.authorizedActions.canRecordPresent` /
  `canRecordAbsent` (`AdminLessonBookingDetail.tsx:719-762`).
* Finalize (`:305-319`, `:773-784`) builds
  `{kind:'finalize_booking_attendance', reasonExplanation, attendance:[{participantId,
  attendanceStatus, expectedAttendanceRevision?}]}` в†’ command
  `finalize_booking_attendance` with `expectedRevision` = booking revision and
  `administratorContext: true` (`useAdminLessonBookingCommands.ts:185-209`).
* **Missing attendance is never invented.** Unrecorded participants show
  `adminLessonAttendanceMissing` (`lessonBookingAdminPresentation.ts:275-279`); the draft is not
  seeded with `absent`. The only hint is `attendanceUnavailableReason(detail) === 'pending'`
  (`:264-273`) в†’ `adminLessonAttendanceAfterConfirm`, shown only when lifecycle is `pending` and
  no record allows recording. Canonical statuses: `ATTENDANCE_STATUSES = ['present','absent']`
  (`packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:694-696`).
* **Gap:** `LessonBookingAdminAuthorizedActionsSchema` exposes `canResolveAttendanceOutcome`
  (`packages/shared-domain/src/canonical/readModels/lessonBookingReadModel.ts:268`) but the
  lesson detail renders **no** button for it (only the course detail does, В§5.2). The attempt
  kind `record_booking_attendance` and command exist
  (`lessonBookingAdminContracts.ts:78-83`, `useAdminLessonBookingCommands.ts:211-233`) but are
  fired by **no** admin UI in this section.

### 5.2 Course enrollments вЂ” day-scoped, immediate, no bulk finalize

* One block per `detail.attendanceDays` entry keyed by `courseDayId`; shows
  `formatCourseEnrollmentDate(day.startsAt.seconds)`, current status
  (`courseEnrollmentAttendanceStatusLabel`, undefined в†’ `attendanceMissing`), and `recordedBy`
  (`instructor` vs `administrator`) (`AdminCourseEnrollmentDetail.tsx:422-437`).
* Present/Absent buttons per day, each gated by that day's
  `authorizedActions.canRecordPresent` / `canRecordAbsent`, and **disabled unless
  `actionReason.trim()`** (`:440-470`). Each click is an individual confirmed command
  `record_course_day_attendance` (carrying `expectedAttendanceRevision` when the day has one);
  the confirm message echoes
  `"<participant>: <old status|missing> в†’ <new> @ enrollment rev N[, attendance rev M]"` (`:462`).
  The command additionally sends `expectedEnrollmentRevision`
  (`useAdminCourseEnrollmentCommands.ts:130-153`).
* `resolve_attendance_outcome` button when `detail.authorizedActions.canResolveAttendanceOutcome`
  (`:476-489`) в†’ command `{subjectKind:'course_enrollment', subjectId}` (`:155-166`).
* Row-level summary: `attendanceSummary.recordedDayCount` в†’ "Recorded days: n" chip
  (`ATRP:634-639`); detail overview shows `presentDayCount present В· absentDayCount absent`
  (`AdminCourseEnrollmentDetail.tsx:255-263`).
* Attendance is participant-scoped in the domain (one enrollment per participant); the admin
  course surface is *day*-scoped, not per participant вЂ” the participant is implied by the
  selected enrollment.

---

## 6. RESCHEDULE / CANCEL / REFUND / GUEST RESERVATION

### 6.1 Reschedule вЂ” no form here; deep-link to the planner

* The lesson detail header has **Open in planner** (`AdminLessonBookingDetail.tsx:353-361`) and
  the change-request card repeats it (`:562-567`).
* `onOpenPlanner` (`ATRP:734-741`) sets `tab=operations`, `plannerDate` = the booking's local date
  in the occurrence time zone (computed by `localParts`, `:89-104`, `Intl.DateTimeFormat('en-CA', вЂ¦)`),
  and `plannerBooking` = `bookingId`. `AdminPanel.tsx:201-209` force-opens the planner section.
* Reschedule / instructor change / duration change are implemented in
  `src/features/admin/operations/adminPlannerCommands.ts:270` (`reschedule_booking`), `:335`
  (`change_booking_instructor`), `:359` (`change_booking_duration`).
* The admin lesson command module still supports them
  (`useAdminLessonBookingCommands.ts:132-183`) and the contract declares them
  (`lessonBookingAdminContracts.ts:60-76`), but **no component in the training-records /
  lesson-bookings / course-enrollments folders constructs those attempts** (grep over `src`).
  Authorization flags `canReschedule` / `canChangeInstructor` / `canChangeDuration` are only used
  to render the planner hint `adminLessonScheduleInPlanner`
  (`lessonBookingAdminPresentation.ts:217-220`, shown at `AdminLessonBookingDetail.tsx:608-621`).
* `create_confirmed_booking` and `record_booking_attendance` are likewise declared in the admin
  contracts (`lessonBookingAdminContracts.ts:121-135`, `:78-83`) and handled by
  `useAdminLessonBookingCommands.ts:50-73`, `:211-233`, but no UI in this section fires them
  (the planner's `create_confirmed_booking` is at `adminPlannerCommands.ts:194`).

### 6.2 Cancel (lesson)

Buttons (`AdminLessonBookingDetail.tsx:828-893`), all inside the `cancellation` tab which is
shown when `shouldShowCancellationSection` вЂ” lifecycle `pending_cancellation` **or**
`canResolveCancellation` **or** `canDirectCancel` (`lessonBookingAdminPresentation.ts:248-256`):

| Button | attempt | Fired when |
|---|---|---|
| Approve cancellation | `{kind:'resolve_booking_cancellation', paymentId, paymentRevision, decision:'approve', refundAmount, reasonExplanation}` | `admin.authorizedActions.canResolveCancellation` |
| Reject cancellation | `{вЂ¦, decision:'reject', reasonExplanation}` (no refund, **no** `paymentRevision`) | same |
| Direct cancel | `{вЂ¦, decision:'direct_cancel', refundAmount, reasonExplanation}` | `admin.authorizedActions.canDirectCancel` |

Command mapping (`useAdminLessonBookingCommands.ts:111-130`): `expectedRevision` = booking revision;
for `approve` and `direct_cancel` it additionally sends `refundAmount` (`KztMinorUnitsSchema`) and
`expectedPaymentRevision` (`AggregateRevisionSchema.parse(paymentRevision)`); for `reject` it sends
neither. Unknown attempt kinds throw (`throw new Error('Unsupported admin lesson booking attempt: вЂ¦')`, `:283-285`).

**Refund/ledger side effects.** All refund math is server-authoritative; the client only supplies
an integer in `[0, cancellationFinancial.maximumRefund]` (`refundValid`,
`AdminLessonBookingDetail.tsx:237-240`; input `min=0 max=maximumRefund`, `:807-818`). The input is
seeded from `cancellationFinancial.suggestedRefund` (`:157`, `:162`, re-seed effect `:194-196`).
`cancellationFinancial.timing` в€€ `direct_cancel | pending_request | after_start_rejected`
(`packages/shared-domain/src/canonical/readModels/lessonBookingReadModel.ts:187-193`) is
**display-only**, and only inside the `technical` tab (`AdminLessonBookingDetail.tsx:1046-1055`) вЂ”
it is not used to disable or re-route the cancel buttons. Ledger effects are server-side in the
command; the client only re-reads: after any success `refreshBookingWithProjections` refreshes the
booking list+detail **and** `refreshAllProjections()` from the shared monitor context
(`ATRP:190-197`), and for cancellation/payment kinds additionally
`queryAdminFinanceReadModels({scope:'admin_payment_detail', paymentId})`
(`useAdminLessonBookingCommands.ts:306-315`).

### 6.3 Cancel (course)

`shouldShowCourseCancellationSection` = `pending_cancellation || canResolveCancellation || canCancelUnpaidGuest`
(`adminCourseEnrollmentPresentation.ts:103-111`).

* **Cancel unpaid guest** вЂ” `{kind:'resolve_course_enrollment_cancellation', decision:'direct_cancel', refundAmount: 0, reasonExplanation}`; the refund is **hardcoded 0** and there is no refund input on this button
  (`AdminCourseEnrollmentDetail.tsx:517-536`).
* **Approve** вЂ” `decision:'approve'`, `refundAmount` from the number input bounded by
  `cancellation.maximumRefund` (`:537-570`, validity `:171-174`).
* **Reject** вЂ” `decision:'reject'`, reason only (`:571-587`).
* Command (`useAdminCourseEnrollmentCommands.ts:97-114`): `expectedRevision` = enrollment
  revision; `refundAmount` is sent for every decision **except** `reject`
  (`:104-106`).
* Transfer is the other money-neutral structural move: `transfer_course_enrollment` with
  `targetCourseId` + reason (`:115-129`), target options from `detail.transfer.targetOptions`,
  blocked reason surfaced in the technical tab.

### 6.4 Guest reservations

* `pending_guest` is a first-class scope in both the unified section and the legacy
  `bookingView` / `enrollmentView`; `AdminActiveBookingMonitor` deep-links into it
  (`AdminActiveBookingMonitor.tsx:54-57`).
* Awaiting payment on a guest booking shows `adminLessonGuestApprovalUnavailable`
  (`AdminLessonBookingDetail.tsx:396-400`); on a guest enrollment, `guestDeferred`
  (`AdminCourseEnrollmentDetail.tsx:365-367`, `:830-832`).
* `canConfirmGuest` is literally `false` for bookings
  (`packages/shared-domain/src/canonical/readModels/lessonBookingReadModel.ts:259`) and
  `canApproveGuest` is literally `false` for enrollments
  (`packages/shared-domain/src/canonical/readModels/adminCourseEnrollmentReadModel.ts:128`) вЂ” there
  is no guest approval button anywhere.
* Linking a guest to an account is the only guest-identity mutation
  (`link_guest_booking_to_account_as_administrator`, `useAdminLessonBookingCommands.ts:267-281`;
  `link_guest_course_enrollment_to_account_as_administrator`,
  `useAdminCourseEnrollmentCommands.ts:167-182`). Both need picker + reason, and both require
  `target.bookingId` / `target.enrollmentId` + `expectedRevision`. In the unified panel the
  link selection/reason are reset whenever the selected record changes (`ATRP:267-271`).
* When linking is not allowed, the reason enum is rendered
  (lesson, `guestLinkUnavailableLabelKey`, `lessonBookingAdminPresentation.ts:281-300`):
  `already_linked`, `not_guest`, `ambiguous_guest_participant`, `expired_reservation`,
  `attendance_recorded`, `admin_account_inactive`, default `ineligible_lifecycle`;
  course adds `course_started` and has no `ambiguous_guest_participant`
  (`AdminCourseEnrollmentDetail.tsx:49-69`).

---

## 7. ISSUES / CHANGE REQUESTS

### 7.1 Exact vocabularies

* **Severities** (`ADMIN_ISSUE_SEVERITIES`,
  `packages/shared-domain/src/canonical/courseEnrollmentAttendanceAdminIssue.ts:913-915`):
  `'normal' | 'urgent' | 'critical'`.
* **Issue kinds** (`ADMIN_ISSUE_KINDS`, same file `:897-905`) вЂ” the complete list, 7:
  1. `missing_attendance`
  2. `payment_required_at_start`
  3. `unresolved_pending_cancellation`
  4. `attendance_payment_conflict`
  5. `resource_reconciliation_mismatch`
  6. `financial_reconciliation_mismatch`
  7. `outcome_correction_required`

  Label map: `ADMIN_ISSUE_KIND_LABEL_KEYS` (`adminIssuePresentation.ts:10-18`), re-exported
  through `issueKindLabelKey` in `lessonBookingAdminPresentation.ts:302-304`.
* **States** (`ADMIN_ISSUE_LIFECYCLE_STATUSES`, `:909-911`): `'open' | 'resolved' | 'dismissed'`.
  Label map `issueStatusLabelKey` (`lessonBookingAdminPresentation.ts:312-316`).
* **Categories** (`ADMIN_ISSUE_INBOX_CATEGORIES`, `adminIssuePresentation.ts:36-43`):
  `'attendance' | 'payment' | 'cancellation' | 'reconciliation' | 'change_request' | 'guest'`.
* **Guidance** (`ADMIN_ISSUE_RESOLUTION_GUIDANCE`,
  `packages/shared-domain/src/canonical/readModels/adminIssueReadModel.ts:128-137`):
  `record_attendance`, `fund_payment`, `resolve_cancellation`, `reconcile_subject`,
  `correct_finance`, `correct_attendance_outcome`.
* **Blocking conditions** (`:37-44`): `none`, `outcome`, `delivery`, `outcome_and_delivery`.
* **Action requirement** (`AdminIssueInboxItemSchema.actionRequirement`, `:65`):
  `action_required | informational`.

Kind в†’ category mapping (`adminIssuePresentation.ts:74-99`): `attendance` =
`{missing_attendance, outcome_correction_required}`; `payment` =
`{payment_required_at_start, attendance_payment_conflict}`; `cancellation` =
`{unresolved_pending_cancellation}`; `reconciliation` =
`{resource_reconciliation_mismatch, financial_reconciliation_mismatch}`; `guest` =
orthogonal (`presentationOrigin === 'guest'`); `change_request` = only the merged change-request
entries (issues never match it вЂ” `adminIssueMatchesCategory` returns `false` at `:97`).

### 7.2 Views and history

* `issueView=open` в†’ read scope `admin_open`; `issueView=history` в†’ `admin_history`
  (`AdminIssueCenter.tsx:121-126`). `'resolved'` is accepted as an alias of history
  (`adminNavigation.ts:168`).
* **The history view is open-only in practice**: it shows both `resolved` and `dismissed` records
  with no further state filter, and there is no per-issue lifecycle timeline, no `resolvedAt` /
  `reopenedAt` rendering, and no `resolution.reason` / `resolvedByAccountId` display. The detail
  renders only `lifecycle.openedAt` (`AdminIssueCenter.tsx:776-777`), plus `lessonEndsAt`,
  `attendanceDeadlineAt`, `missingAttendanceCount` when present.
* Page size 20 default / 50 max (`ADMIN_ISSUE_READ_MODEL_PAGE_SIZE_DEFAULT/MAX`,
  `adminIssueReadModel.ts:34-35`); cursor paginated (`AdminIssueReadModelCursorSchema` `:165-175`).
* Change requests are merged into the list **only in the `open` view**
  (`mergeAttentionInbox`, `AdminIssueCenter.tsx:71-93`, `:170-178`), sorted by
  `updatedAt.seconds` (issues) / `createdAt.seconds` (change requests) descending, tie-break by id.
  Their read hook is `useAdminAttentionChangeRequests` with
  `queryBookingChangeRequestReadModels({scope:'admin_open' | 'admin_detail'})`
  (`useAdminAttentionChangeRequests.ts:78`, `:109`).

### 7.3 Issue detail (all actions)

`AdminIssueCenter.tsx:683-875`:
* header: localized kind label, guest-origin chip when `presentationOrigin==='guest'`, close (X);
* requirement banner: `action_required` (amber + `ShieldAlert`) vs `informational`, plus the
  guidance text;
* `dl`: severity, blocking condition, subject (`courseTitle` ?? lesson/course context label),
  participant (if any), lesson start time, opened at, lesson end, attendance deadline,
  missing attendance count;
* **primary destination button** вЂ” `adminIssuePrimaryDestination`
  (`adminIssuePresentation.ts:101-107`): `'payment'` when kind в€€
  `{payment_required_at_start, financial_reconciliation_mismatch, attendance_payment_conflict}`
  **and** a payment projection exists, else `'lesson'` when `subjectRef.subjectKind==='booking'`,
  else `'enrollment'`. `openIssueDestination` (`:224-246`) writes
  `tab=finance&payment=вЂ¦` / `tab=operations&booking=вЂ¦` / `tab=operations&enrollment=вЂ¦`.
  (`change_request` is a declared destination but is never produced by this function.)
* secondary **Check payment** block with `paymentStatus` + `outstandingAmount` in KZT when the
  primary destination is not payment (`:807-830`); the plain payment summary without the button
  when it is (`:832-842`);
* attendance evidence list (`record.attendanceStatus` per `attendanceId`, max 64) or
  `adminIssueNoAttendanceEvidence` (`:844-859`);
* authorized-actions block (`:861-874`) вЂ” **text only**, one of
  `adminIssueNoCurrentAction` (informational) / `adminIssueActionsMissingContext`
  (`unavailableReason` set) / `adminIssueActionsDeferred`.

Change-request detail (`:586-641`): instructor, participants, lesson time (occurrence interval in
the booking's time zone), reason, created at; a single **Review request** button that writes
`tab=operations&booking=<bookingId>&changeRequest=<requestId>` (`:627-635`) вЂ” i.e. it hands off to
the lesson detail overview.

### 7.4 Which issues cannot be dismissed / require a coupled domain command

**All seven kinds.** `ADMIN_ISSUE_KIND_POLICIES`
(`packages/shared-domain/src/canonical/adminIssuePolicy.ts:49-99`):

| kind | severity | blocksOutcome | blocksDelivery | allowDismiss | requireCoupledDomainCommandToResolve |
|---|---|---|---|---|---|
| `missing_attendance` | normal | true | false | **false** | **true** |
| `payment_required_at_start` | urgent | true | true | **false** | **true** |
| `unresolved_pending_cancellation` | normal | true | true | **false** | **true** |
| `attendance_payment_conflict` | **critical** | true | true | **false** | **true** |
| `resource_reconciliation_mismatch` | urgent | false | false | **false** | **true** |
| `financial_reconciliation_mismatch` | urgent | false | false | **false** | **true** |
| `outcome_correction_required` | urgent | true | false | **false** | **true** |

Enforcement: `dismissAdminIssue` throws `invalid_transition` whenever `!policy.allowDismiss`
(`adminIssuePolicy.ts:659-672`) вЂ” so dismissal is **impossible for every kind today**.
`resolveAdminIssue` / `resolveAdminIssueForCoupledReconciliation` throw
`invalid_transition {reason:'unsupported'}` unless `input.coupledDomainCommand` is true
(`:562-593`); `resolveAdminIssueForCoupledAttendanceRecord` additionally requires kind
`missing_attendance` (`:611-633`). `resolveAttendanceIssueActorAccountId` permits
`administrator` **or** `instructor` accounts, or the system reconciliation account
(`:595-609`, `SYSTEM_RECONCILIATION_ACCOUNT_ID = 'account_system_reconciliation'`, `:548-550`).
Owner-side resolution exists only for `unresolved_pending_cancellation` withdrawal, for
`account_owner` / `parent_guardian` (`:404-454`, `:635-657`).
Read-model side matches: `AdminIssueReadModelAuthorizedActionsSchema`
(`readModelAuthorizedActions.ts:132-138`) has `canResolveDirectly: z.literal(false)` and every
entry `availability: z.literal('deferred')`.

**Therefore the rebuild must not add an issue-level "resolve"/"dismiss" button, and must not
remove the fact that the inbox is a *navigation* surface into the coupled domain commands
(attendance finalize, payment capture, cancellation resolution, reconciliation).** The only
"resolution" affordances in the whole product are: `finalize_booking_attendance`,
`record_course_day_attendance`, `resolve_attendance_outcome`, `record_provider_payment_event` /
`pay_service_from_wallet_as_administrator`, `resolve_booking_cancellation` /
`resolve_course_enrollment_cancellation`, `reconcile_course_enrollment`,
`resolve_booking_change_request`.

### 7.5 Change-request resolution (where the coupled command lives)

`AdminLessonBookingDetail.tsx:249-255` picks
`openChangeRequests.find(r => r.requestId === focusedChangeRequestId) ?? openChangeRequests[0]`
from `admin.relatedOpenChangeRequests` (max 8,
`packages/shared-domain/src/canonical/readModels/lessonBookingReadModel.ts:287`; `requestType` is
`'instructor_unavailable'`, `:212`). Rendered twice: a header card (`:436-451`) and an overview
card with the full reason + created-at + reason field + refund field + three buttons (`:525-607`):

* **Resolve в†’ cancel** вЂ” `{kind:'resolve_booking_change_request', bookingChangeRequestId,
  requestRevision, resolution:'booking_cancelled', refundAmount, reasonExplanation}`
  (disabled unless reason + `refundValid`);
* **Resolve в†’ reject (no change)** вЂ” `resolution:'no_change'`, no reason required;
* **Open in planner** вЂ” the only reschedule path.

The `rescheduled` resolution **is** in the contract (`lessonBookingAdminContracts.ts:97`) and the
command supports `calendarInput` for it (`useAdminLessonBookingCommands.ts:252-261`), but no
component fires it в†’ **capability gap to preserve as planner hand-off, not as a form**.
Command sends `expectedRevision` = request revision, plus `bookingRevision` = booking revision for
any resolution other than `no_change` (`:250-251`).

### 7.6 Realtime / local-sync behaviour (capability-relevant)

* **Issue inbox**: Firestore realtime revision doc
  (`ADMIN_ISSUE_INBOX_REVISION_COLLECTION` / `_DOCUMENT_ID`, `subscribeAdminIssueInboxRevision.ts:8-17`)
  в†’ `adminIssueInboxRevisionCoordinator.ts` (reduce + notify + idle teardown) в†’
  quiet list+detail reload (`useAdminIssueReadModels.ts:195-206`).
  Command results additionally produce an **optimistic local patch** that removes
  `resolvedAdminIssueIds` from the open list and clears the open detail, before any refetch
  (`adminIssueInboxLocalSync.ts:39-64`, `useAdminIssueReadModels.ts:180-193`).
  Patches are emitted whenever a lesson/enrollment command returns an
  `AttendanceAdminIssueResultPayload` вЂ” both command hooks call
  `applyAdminIssueInboxCommandResult` (`useAdminLessonBookingCommands.ts:39`,
  `useAdminCourseEnrollmentCommands.ts:34`). **This is the only way an admin-issued command
  updates the issue inbox without waiting for a read round-trip.**
* **Lesson bookings list**: `registerAdminLessonBookingsRevisionListener` (skipped when
  `view==='history'`, `useAdminLessonBookingReadModels.ts:216-225`) + finance revisions +
  booking-change-request revisions, both quiet detail refreshes gated on
  `enabled && view !== 'history' && selectedBookingId` (`:227-245`).
* **Course enrollments**: `useAdminCoursesRevisionRefresh` (list pages already loaded are
  re-read, `useAdminCourseEnrollmentReadModels.ts:94-143, 188-196`) and
  `useAdminFinanceRevisionRefresh` for the detail (`:198-205`); both skip `history`.
* **Change requests**: `adminBookingChangeRequestsRevisionCoordinator` +
  `subscribeAdminBookingChangeRequestsRevision` в†’ quiet list + detail
  (`useAdminAttentionChangeRequests.ts:161-167`).

---

## 8. DEAD vs LIVE legacy components

| Component | Status | Evidence |
|---|---|---|
| `src/features/admin/components/bookings/BookingsLog.tsx` | **LIVE** | imported by `src/features/admin/operations/AdminActiveBookingMonitor.tsx:4`, rendered `:73`; `AdminActiveBookingMonitor` is mounted in `AdminPanel.tsx:227` inside the `admin_booking_monitor` collapsible section (`defaultOpen`, `:219-229`) |
| `src/features/admin/components/bookings/LinkGuestBookingModal.tsx` | **LIVE** | imported by `src/features/admin/components/schedule/ScheduleSlotActionModal.tsx:17`, rendered `:737`; portal-based legacy guest-link flow (`onLinkBooking(bookingId, targetUserId)`, non-canonical) |
| `src/features/admin/lesson-bookings/AdminLessonBookingPanel.tsx` | **DEAD at runtime, TEST_ONLY** | no production import; only `src/features/admin/index.ts:4` and `src/features/admin/lesson-bookings/index.ts:1` re-export it. Consumers: `tests/unit/AdminLessonBookingPanel.test.tsx:110,395,453,546,726,747,821,854,923,990`; source-text assertions `tests/unit/adminBookingMonitorMapping.test.ts:221,236`, `tests/unit/adminLessonBookingCanonicalBoundary.test.ts:36`, `tests/unit/adminPlannerUxBoundary.test.ts:10` |
| `src/features/admin/course-enrollments/AdminCourseEnrollmentPanel.tsx` | **DEAD at runtime, TEST_ONLY** | no production import; only `src/features/admin/index.ts:5` + `course-enrollments/index.ts:1`. Consumers: `tests/unit/AdminCourseEnrollmentPanel.test.tsx:5,213вЂ¦678`. Intentional retention documented in `docs/T32_CANONICAL_ADMIN_AUDIT.md:143` ("Old `AdminCourseEnrollmentPanel` remains as compatibility/test source and was not deleted") |

Both dead panels are **capability sources for the rebuild**, not safe deletions вЂ” see the parity
gaps collected in В§10.

`BookingsLog` still carries real user-facing capabilities that the unified section does **not**
have: guest contact links (tel/mailto) per row, guest "Link to client" button, and
status-conditional deep-link buttons for `pending` ("Open lesson detail" / "Open enrollment
attendance"), `pending_cancellation` ("Open cancellation detail"), `confirmed`, `cancelled`
("Cancelled" label), `completed` ("Finished" label)
(`BookingsLog.tsx:90-127`, `:177-300`). Its `onOpenLesson` / `onOpenEnrollment` set
`tab=operations` plus `booking`/`bookingView` or `enrollment`/`enrollmentView`
(`AdminActiveBookingMonitor.tsx:22-70`) вЂ” i.e. the deep-link contract the unified section must
keep honouring.

---

## 9. JSON CAPABILITY LIST

```json
[
{"id":"TR-01","tab":"operations","screen":"canonical_training_records","capability":"Open the unified training-records section (lessons + course enrollments in one list)","entryPoint":"AdminPanel в†’ Operations в†’ section title adminTrainingRecordsTitle","userAction":"Expand the collapsible section","states":["collapsed","expanded"],"commandOrReadModel":"none (UI shell)","currentResult":"Renders AdminTrainingRecordsPanel; force-opens when booking/enrollment/enrollmentCourse is in the URL","destructive":false,"sourceFiles":["src/features/admin/components/AdminPanel.tsx:252-281","src/features/admin/adminNavigation.ts:31-36"]},
{"id":"TR-02","tab":"operations","screen":"canonical_training_records","capability":"Filter records by kind: all / lessons / courses","entryPoint":"Kind pills, AdminTrainingRecordsPanel","userAction":"Click pill","states":["all","lesson","course"],"commandOrReadModel":"URL trainingKind; toggles lessonReads.enabled / courseReads.enabled","currentResult":"Merged list re-sorts; booking and enrollment selection cleared","destructive":false,"sourceFiles":["src/features/admin/training-records/AdminTrainingRecordsPanel.tsx:433-452","adminTrainingRecordUtils.ts:24-36"]},
{"id":"TR-03","tab":"operations","screen":"canonical_training_records","capability":"Filter records by scope: current / history / pending guest","entryPoint":"Scope buttons, AdminTrainingRecordsPanel","userAction":"Click scope button","states":["current","history","pending_guest"],"commandOrReadModel":"URL trainingScope + bookingView + enrollmentView в†’ read scopes admin_hot|admin_history|admin_pending_guest and admin_course_roster|admin_history|admin_pending_guest","currentResult":"List shows the active set, the history set, or unlinked guest reservations; selection cleared","destructive":false,"sourceFiles":["AdminTrainingRecordsPanel.tsx:454-472,294-301","adminTrainingRecordUtils.ts:38-65","useAdminLessonBookingReadModels.ts:94-99","useAdminCourseEnrollmentReadModels.ts:29-33"]},
{"id":"TR-04","tab":"operations","screen":"canonical_training_records","capability":"Filter by course (enrollments only)","entryPoint":"Course select, shown when kind !== 'lesson'","userAction":"Choose a course / 'All courses'","states":["all courses","single course"],"commandOrReadModel":"URL enrollmentCourse в†’ queryAdminCourseEnrollmentReadModels({courseId})","currentResult":"Roster narrowed to that course; enrollment selection cleared","destructive":false,"sourceFiles":["AdminTrainingRecordsPanel.tsx:473-492"]},
{"id":"TR-05","tab":"operations","screen":"canonical_training_records","capability":"Load more records (cursor pagination, both domains)","entryPoint":"'Load more' button under the list","userAction":"Click","states":["more available","exhausted"],"commandOrReadModel":"lessonReads.loadMore() + courseReads.loadMore()","currentResult":"Appends one page from each enabled source; hasMore is the OR of both","destructive":false,"sourceFiles":["AdminTrainingRecordsPanel.tsx:324,674-688"]},
{"id":"TR-06","tab":"operations","screen":"canonical_training_records","capability":"Retry a failed list read","entryPoint":"Error panel button (RefreshCw)","userAction":"Click","states":["error","loading","loaded"],"commandOrReadModel":"lessonReads.retryList() + courseReads.retryList()","currentResult":"permission-denied shown as adminLessonPermissionDenied, else adminLessonReadFailed","destructive":false,"sourceFiles":["AdminTrainingRecordsPanel.tsx:563-578"]},
{"id":"TR-07","tab":"operations","screen":"canonical_training_records","capability":"Select a record (the only per-row action)","entryPoint":"Any list row (AdminLessonBookingListRow button)","userAction":"Click row","states":["unselected","selected"],"commandOrReadModel":"URL booking=вЂ¦ (clears enrollment) or enrollment=вЂ¦ (clears booking)","currentResult":"Right pane loads admin_detail / admin_enrollment_detail; aria-current + ring; data-admin-training-kind / -record-id attributes set","destructive":false,"sourceFiles":["AdminTrainingRecordListRow.tsx:17-21","AdminLessonBookingUi.tsx:135-145","AdminTrainingRecordsPanel.tsx:598-603,650-655"]},
{"id":"TR-08","tab":"operations","screen":"canonical_training_records","capability":"Create a course enrollment on behalf of a managed participant","entryPoint":"'Create' block (kind !== 'lesson')","userAction":"Pick course (active + seats>0), pick participant, type reason, click Create, confirm","states":["disabled","confirm dialog","success","error (stale_version closes dialog)"],"commandOrReadModel":"create_course_enrollments (courseId, courseRevision, participantId, reasonExplanation, administratorContext)","currentResult":"Enrollment created; list + course catalog refreshed","destructive":false,"sourceFiles":["AdminTrainingRecordsPanel.tsx:496-553","useAdminCourseEnrollmentCommands.ts:43-58"]},
{"id":"TR-09","tab":"operations","screen":"canonical_training_records","capability":"Close the detail pane","entryPoint":"X button in the detail header","userAction":"Click","states":["detail open","detail closed"],"commandOrReadModel":"URL booking / enrollment removed","currentResult":"Select-prompt text adminTrainingSelectPrompt shown","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:343-350","AdminCourseEnrollmentDetail.tsx:806-815","AdminTrainingRecordsPanel.tsx:742,840"]},
{"id":"TR-10","tab":"operations","screen":"training-record detail (lesson)","capability":"Lesson detail tabs: overview / payment / attendance / cancellation / guest / issues / technical","entryPoint":"AdminLessonDetailTabs in the lesson detail header","userAction":"Click tab; ArrowLeft/Right/Home/End keyboard nav","states":["overview","payment","attendance","cancellation","guest","issues","technical"],"commandOrReadModel":"read model only","currentResult":"attention dot on payment (outstanding>0), cancellation (pending_cancellation), issues (any open); active panel + hidden sibling panels for a11y","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:256-297,455-469","AdminLessonBookingUi.tsx:215-283"]},
{"id":"TR-11","tab":"operations","screen":"training-record detail (lesson)","capability":"Open the booking in the planner (reschedule hand-off)","entryPoint":"'Open in planner' header button; change-request card button","userAction":"Click","states":["idle","navigated"],"commandOrReadModel":"URL tab=operations&plannerDate=YYYY-MM-DD&plannerBooking=<bookingId>","currentResult":"Planner section force-opens focused on the booking's local date; actual reschedule/instructor/duration commands live in adminPlannerCommands","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:353-361,443-450,562-567","AdminTrainingRecordsPanel.tsx:89-104,734-741"]},
{"id":"TR-12","tab":"operations","screen":"training-record detail (lesson)","capability":"Send SMS to the guest (not implemented)","entryPoint":"Disabled 'Send SMS' button with aria-describedby","userAction":"None (button is disabled)","states":["unavailable"],"commandOrReadModel":"none","currentResult":"adminLessonSmsUnavailable hint text; capability stub must be preserved or consciously removed","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:362-377"]},
{"id":"TR-13","tab":"operations","screen":"training-record detail (lesson)","capability":"Record a cash payment (provider payment event)","entryPoint":"Payment tab в†’ AdminPaymentCaptureSection, when canRecordGuestPayment","userAction":"Enter integer amount 1..outstanding, click 'Record payment', confirm","states":["hidden","invalid amount","confirming","success / refreshFailed notice"],"commandOrReadModel":"record_provider_payment_event (sourceKind 'cash', manualReference admin-cash:<hash>, expectedRevision = payment revision)","currentResult":"Payment applied server-side; booking list+detail and all monitor projections refreshed; admin_payment_detail re-queried; warning notice adminLessonPaymentRecordedRefreshPending when refresh fails","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:650-696","AdminPaymentCaptureSection.tsx:44,63-94","useAdminLessonBookingCommands.ts:75-93,306-315"]},
{"id":"TR-14","tab":"operations","screen":"training-record detail (lesson)","capability":"Pay the service from the payer's wallet","entryPoint":"Payment tab, when canPayFromWallet","userAction":"Click 'Pay from wallet', confirm","states":["insufficient funds (disabled)","enabled","confirming","success"],"commandOrReadModel":"pay_service_from_wallet_as_administrator (subjectKind 'booking'; no expectedRevision)","currentResult":"Wallet debited server-side; projections refreshed","destructive":true,"sourceFiles":["AdminLessonBookingDetail.tsx:673-685","AdminPaymentCaptureSection.tsx:46-48,95-107","useAdminLessonBookingCommands.ts:95-106"]},
{"id":"TR-15","tab":"operations","screen":"training-record detail (lesson)","capability":"Open the related payment in the Finance tab","entryPoint":"'Open payment' button","userAction":"Click","states":["navigated"],"commandOrReadModel":"URL tab=finance&payment=<paymentId>","currentResult":"Canonical finance panel force-opens on that payment","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:697-703","AdminTrainingRecordsPanel.tsx:743-748"]},
{"id":"TR-16","tab":"operations","screen":"training-record detail (lesson)","capability":"Approve a pending cancellation with a refund","entryPoint":"Cancellation tab, when canResolveCancellation","userAction":"Enter refund 0..maximumRefund (default suggestedRefund), enter reason, click 'Approve', confirm","states":["pending_cancellation","approving","rejected","resolved"],"commandOrReadModel":"resolve_booking_cancellation decision 'approve' (refundAmount + expectedPaymentRevision, expectedRevision = booking revision)","currentResult":"Booking cancelled server-side with the requested refund; money effect computed server-side","destructive":true,"sourceFiles":["AdminLessonBookingDetail.tsx:829-850","useAdminLessonBookingCommands.ts:111-130"]},
{"id":"TR-17","tab":"operations","screen":"training-record detail (lesson)","capability":"Reject a pending cancellation","entryPoint":"Cancellation tab, when canResolveCancellation","userAction":"Enter reason, click 'Reject', confirm","states":["pending_cancellation","rejected"],"commandOrReadModel":"resolve_booking_cancellation decision 'reject' (reason only, no refund)","currentResult":"Booking returns to its active lifecycle; no money movement","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:851-869"]},
{"id":"TR-18","tab":"operations","screen":"training-record detail (lesson)","capability":"Directly cancel a booking with a refund","entryPoint":"Cancellation tab, when canDirectCancel","userAction":"Enter refund + reason, click 'Direct cancel' (rose button), confirm","states":["confirming","cancelled"],"commandOrReadModel":"resolve_booking_cancellation decision 'direct_cancel'","currentResult":"Immediate cancellation + refund; cancellationFinancial.timing is displayed only in the technical tab","destructive":true,"sourceFiles":["AdminLessonBookingDetail.tsx:871-891","lessonBookingAdminPresentation.ts:248-256"]},
{"id":"TR-19","tab":"operations","screen":"training-record detail (lesson)","capability":"Record attendance per participant (draft) then finalize the whole booking","entryPoint":"Attendance tab, per authorizedActions.canRecordPresent/canRecordAbsent","userAction":"Click Present/Absent per participant в†’ enter reason в†’ 'Finalize attendance' в†’ warning dialog в†’ Submit","states":["unrecorded","drafted","confirm dialog","committed"],"commandOrReadModel":"finalize_booking_attendance (per-participant attendanceStatus + expectedAttendanceRevision, administratorContext)","currentResult":"Attendance stored participant-scoped; draft cleared via attendanceFinalizeSuccessNonce; finalize requires ALL target participants drafted","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:707-794,305-319,1073-1133","useAdminLessonAttendanceDraft.ts","useAdminLessonBookingCommands.ts:185-209"]},
{"id":"TR-20","tab":"operations","screen":"training-record detail (lesson)","capability":"See that attendance is not yet available (pending confirmation)","entryPoint":"Attendance tab when attendanceUnavailableReason==='pending'","userAction":"Read hint","states":["pending","available"],"commandOrReadModel":"attendanceUnavailableReason (read model)","currentResult":"Shows adminLessonAttendanceAfterConfirm; no status is invented; unrecorded participants show adminLessonAttendanceMissing","destructive":false,"sourceFiles":["lessonBookingAdminPresentation.ts:264-279","AdminLessonBookingDetail.tsx:768-772"]},
{"id":"TR-21","tab":"operations","screen":"training-record detail (lesson)","capability":"Link a guest booking to an account + participant","entryPoint":"Guest tab, when canLinkGuestToAccount","userAction":"Pick managed participant, enter reason, click 'Link', confirm","states":["not eligible (reason text)","eligible","confirming","linked"],"commandOrReadModel":"link_guest_booking_to_account_as_administrator (targetAccountId, targetParticipantId, reasonExplanation, expectedRevision)","currentResult":"Guest identity linked; drafts reset when the selection changes","destructive":true,"sourceFiles":["AdminLessonBookingDetail.tsx:899-972","useAdminLessonBookingCommands.ts:267-281","lessonBookingAdminPresentation.ts:281-300"]},
{"id":"TR-22","tab":"operations","screen":"training-record detail (lesson)","capability":"Review related issues and jump to the issue inbox","entryPoint":"Issues tab (only when relatedIssues.length > 0)","userAction":"Click 'Open issue'","states":["no issues","list","navigated"],"commandOrReadModel":"URL tab=operations&issue=<issueId>","currentResult":"Each row shows severity В· kind В· lifecycleStatus","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:974-998","AdminTrainingRecordsPanel.tsx:749-754"]},
{"id":"TR-23","tab":"operations","screen":"training-record detail (lesson)","capability":"Inspect technical identifiers/revisions/authorized actions","entryPoint":"Technical tab (<details>)","userAction":"Expand","states":["collapsed","expanded"],"commandOrReadModel":"read model","currentResult":"bookingId, booking+schedule+payment revisions, lifecycle, origin, instructorId, participantIds, payer, timezone, updatedAt, cancellationFinancial, true authorized-action keys","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:1000-1059"]},
{"id":"TR-24","tab":"operations","screen":"training-record detail (lesson)","capability":"Resolve an instructor change request by cancelling the booking","entryPoint":"Overview change-request card","userAction":"Enter reason + refund, click 'Resolve в†’ cancel', confirm","states":["open request","confirming","resolved"],"commandOrReadModel":"resolve_booking_change_request resolution 'booking_cancelled' (bookingChangeRequestId, requestRevision, refundAmount, reasonExplanation)","currentResult":"Request resolved as booking_cancelled with refund; booking also cancelled","destructive":true,"sourceFiles":["AdminLessonBookingDetail.tsx:525-607","useAdminLessonBookingCommands.ts:235-265"]},
{"id":"TR-25","tab":"operations","screen":"training-record detail (lesson)","capability":"Reject an instructor change request (no change)","entryPoint":"Overview change-request card","userAction":"Click 'Resolve в†’ reject', confirm","states":["open request","no_change"],"commandOrReadModel":"resolve_booking_change_request resolution 'no_change' (no bookingRevision)","currentResult":"Request closed; booking untouched","destructive":false,"sourceFiles":["AdminLessonBookingDetail.tsx:588-604"]},
{"id":"TR-26","tab":"operations","screen":"training-record detail (course)","capability":"Course detail tabs: overview / payment / attendance / cancellation / guest / issues / technical","entryPoint":"AdminLessonDetailTabs (idPrefix 'admin-course')","userAction":"Click tab","states":["overview","payment","attendance","cancellation","guest","issues","technical"],"commandOrReadModel":"read model only","currentResult":"attention dots on payment (canRecordPayment || awaitingPayment), cancellation, issues; guest tab always present","destructive":false,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:178-222,884-893"]},
{"id":"TR-27","tab":"operations","screen":"training-record detail (course)","capability":"Transfer an enrollment to another course","entryPoint":"Overview, when canTransfer","userAction":"Pick target course (from transfer.targetOptions), enter reason, click Transfer, confirm","states":["blocked (transfer.blockedReason shown in technical)","available","confirming","transferred"],"commandOrReadModel":"transfer_course_enrollment (targetCourseId, reasonExplanation, expectedRevision)","currentResult":"Enrollment moved; originalCourseId retained and shown in technical","destructive":true,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:275-319","useAdminCourseEnrollmentCommands.ts:115-129"]},
{"id":"TR-28","tab":"operations","screen":"training-record detail (course)","capability":"Record a course-day attendance status","entryPoint":"Attendance tab, per day, per authorizedActions.canRecordPresent/canRecordAbsent","userAction":"Enter reason, click 'Record present'/'Record absent', confirm","states":["missing","present","absent"],"commandOrReadModel":"record_course_day_attendance (courseDayId, attendanceStatus, expectedAttendanceRevision, expectedEnrollmentRevision, administratorContext)","currentResult":"Day attendance stored; no bulk finalize exists for enrollments","destructive":false,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:422-474","useAdminCourseEnrollmentCommands.ts:130-153"]},
{"id":"TR-29","tab":"operations","screen":"training-record detail (course)","capability":"Resolve the attendance outcome for an enrollment","entryPoint":"Attendance tab, when canResolveAttendanceOutcome","userAction":"Click 'Resolve outcome', confirm","states":["outcome unresolved","resolved"],"commandOrReadModel":"resolve_attendance_outcome (subjectKind 'course_enrollment', subjectId)","currentResult":"Outcome correction applied; coupled admin-issue resolution may follow","destructive":true,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:476-489","useAdminCourseEnrollmentCommands.ts:155-166"]},
{"id":"TR-30","tab":"operations","screen":"training-record detail (course)","capability":"Cancel an unpaid guest enrollment","entryPoint":"Cancellation tab, when canCancelUnpaidGuest","userAction":"Enter reason, click 'Cancel unpaid guest' (rose), confirm","states":["confirming","cancelled"],"commandOrReadModel":"resolve_course_enrollment_cancellation decision 'direct_cancel' with refundAmount hardcoded 0","currentResult":"Enrollment cancelled with no refund","destructive":true,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:517-536"]},
{"id":"TR-31","tab":"operations","screen":"training-record detail (course)","capability":"Approve / reject an enrollment cancellation with a refund","entryPoint":"Cancellation tab, when canResolveCancellation","userAction":"Enter refund 0..maximumRefund + reason, click Approve or Reject, confirm","states":["pending_cancellation","approving","rejecting","resolved"],"commandOrReadModel":"resolve_course_enrollment_cancellation decision 'approve'|'reject'","currentResult":"Server-side cancellation + refund, or cancellation rejected","destructive":true,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:537-590","useAdminCourseEnrollmentCommands.ts:97-114"]},
{"id":"TR-32","tab":"operations","screen":"training-record detail (course)","capability":"Record payment / pay from wallet for an enrollment","entryPoint":"Payment tab в†’ AdminPaymentCaptureSection","userAction":"Enter amount, click 'Record payment' or 'Pay from wallet', confirm","states":["hidden","valid","confirming","success / refreshFailed notice"],"commandOrReadModel":"record_provider_payment_event (paymentId from target, manualReference admin-cash:<hash>) / pay_service_from_wallet_as_administrator (subjectKind 'course_enrollment')","currentResult":"Payment applied; enrollment detail + admin_payment_detail refreshed; paymentRecordedRefreshPending notice on refresh failure","destructive":true,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:368-403","useAdminCourseEnrollmentCommands.ts:60-93,206-236"]},
{"id":"TR-33","tab":"operations","screen":"training-record detail (course)","capability":"Link a guest enrollment to an account + participant","entryPoint":"Guest tab, when canLinkGuest","userAction":"Pick participant, enter reason, click 'Link', confirm","states":["not eligible","eligible","confirming","linked"],"commandOrReadModel":"link_guest_course_enrollment_to_account_as_administrator","currentResult":"Guest identity linked; link drafts reset on selection change","destructive":true,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:594-667","useAdminCourseEnrollmentCommands.ts:167-182"]},
{"id":"TR-34","tab":"operations","screen":"training-record detail (course)","capability":"Reconcile a course enrollment from reconciliation evidence","entryPoint":"Technical tab, when canReconcile","userAction":"Click 'Reconcile', confirm","states":["evidence present","reconciling","reconciled"],"commandOrReadModel":"reconcile_course_enrollment (courseEnrollmentId, expectedRevision)","currentResult":"Server reconciliation run against detail.reconciliation.evidenceIssueIds","destructive":true,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:771-784","useAdminCourseEnrollmentCommands.ts:183-190"]},
{"id":"TR-35","tab":"operations","screen":"training-record detail (course)","capability":"Inspect enrollment technical data (ids, raw lifecycle, guest state, capacity, payment, audit, actions)","entryPoint":"Technical tab","userAction":"Read","states":["visible"],"commandOrReadModel":"read model","currentResult":"Full identifier/revision/audit dump incl. seatHeld vs seatReleased and per-day attendance revisions","destructive":false,"sourceFiles":["AdminCourseEnrollmentDetail.tsx:688-770"]},
{"id":"TR-36","tab":"operations","screen":"admin_issue_inbox","capability":"Open the issue inbox / attention inbox (issues + change requests merged)","entryPoint":"AdminPanel в†’ Operations в†’ 'admin_issue_inbox' collapsible section (defaultOpen false)","userAction":"Expand section","states":["collapsed","expanded","auto-expanded via issue/changeRequest URL"],"commandOrReadModel":"none (shell)","currentResult":"AdminIssueCenter renders","destructive":false,"sourceFiles":["AdminPanel.tsx:231-250"]},
{"id":"TR-37","tab":"operations","screen":"admin_issue_inbox","capability":"Switch between the open inbox and the history view","entryPoint":"Two-button toggle (Actionable / Resolved)","userAction":"Click","states":["open","history"],"commandOrReadModel":"URL issueView; read scopes admin_open / admin_history","currentResult":"History shows resolved and dismissed issues with no further state filter; both buttons clear issue and changeRequest","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:261-293,121-126","adminNavigation.ts:167-169"]},
{"id":"TR-38","tab":"operations","screen":"admin_issue_inbox","capability":"Filter issues by severity (server-side)","entryPoint":"Severity select (All / Normal / Urgent / Critical)","userAction":"Choose value","states":["all","normal","urgent","critical"],"commandOrReadModel":"URL issueSeverity в†’ queryAdminIssueReadModels({severity})","currentResult":"List narrowed server-side; issue selection cleared","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:295-321","useAdminIssueReadModels.ts:98-102"]},
{"id":"TR-39","tab":"operations","screen":"admin_issue_inbox","capability":"Filter by category (client-side): attendance / payment / cancellation / reconciliation / change_request / guest","entryPoint":"Category select","userAction":"Choose value","states":["all","attendance","payment","cancellation","reconciliation","change_request","guest"],"commandOrReadModel":"local filter adminIssueMatchesCategory over the fetched page; issue + changeRequest cleared","currentResult":"Only matching entries remain; the 'guest' option is hidden unless at least one issue has presentationOrigin 'guest'","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:323-344,179-191","adminIssuePresentation.ts:74-113"]},
{"id":"TR-40","tab":"operations","screen":"admin_issue_inbox","capability":"Free-text search of the inbox (local state, not deep-linkable)","entryPoint":"Search input with magnifier icon","userAction":"Type","states":["empty","filtering","no matches"],"commandOrReadModel":"local; haystack = issue kind + subjectDisplayName + courseTitle + localized kind label, or instructor + participants + reason for change requests","currentResult":"Filtered entries; empty state adminIssueEmptySearch","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:106,346-356,184-209","adminIssuePresentation.ts:115-121"]},
{"id":"TR-41","tab":"operations","screen":"admin_issue_inbox","capability":"Refresh / retry the inbox (issues + change requests)","entryPoint":"Refresh button and per-error retry buttons","userAction":"Click","states":["ok","error","retrying"],"commandOrReadModel":"retryList on both useAdminIssueReadModels and useAdminAttentionChangeRequests","currentResult":"permission-denied vs read-failed copy differentiated","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:218-221,358-365,368-413"]},
{"id":"TR-42","tab":"operations","screen":"admin_issue_inbox","capability":"Page the issue list","entryPoint":"'Load more' button","userAction":"Click","states":["more","exhausted"],"commandOrReadModel":"useAdminIssueReadModels.loadMore (cursor)","currentResult":"Next page appended; page size default 20","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:527-536","useAdminIssueReadModels.ts:222-223","adminIssueReadModel.ts:34-35"]},
{"id":"TR-43","tab":"operations","screen":"admin_issue_inbox","capability":"Open an issue detail (severity, blocking, subject, participant, timings, payment summary, attendance evidence, authorized-actions state)","entryPoint":"Issue row click","userAction":"Click issue row","states":["no selection","invalid id (error + close)","loading","loading error","not found","detail"],"commandOrReadModel":"queryAdminIssueReadModels({scope:'admin_detail', issueId})","currentResult":"Detail pane is fixed-overlay on small screens, static on lg; banner distinguishes action_required vs informational and shows resolution guidance","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:470-525,541-876","useAdminIssueReadModels.ts:126-154"]},
{"id":"TR-44","tab":"operations","screen":"admin_issue_inbox","capability":"Navigate from an issue to the coupled domain surface (lesson / enrollment / payment)","entryPoint":"Primary destination button (+ 'Check payment' secondary button)","userAction":"Click","states":["lesson","enrollment","payment"],"commandOrReadModel":"URL tab=operations&booking=вЂ¦ | tab=operations&enrollment=вЂ¦ | tab=finance&payment=вЂ¦","currentResult":"Destination = payment for payment_required_at_start / financial_reconciliation_mismatch / attendance_payment_conflict (when a payment projection exists), else lesson or enrollment by subjectRef.subjectKind","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:224-246,798-830","adminIssuePresentation.ts:68-107"]},
{"id":"TR-45","tab":"operations","screen":"admin_issue_inbox","capability":"Review a booking change request and hand off to the lesson detail","entryPoint":"Change-request row в†’ detail panel","userAction":"Click row, then 'Review request'","states":["inbox","detail","handed off"],"commandOrReadModel":"queryBookingChangeRequestReadModels admin_open / admin_detail; hand-off URL tab=operations&booking=вЂ¦&changeRequest=вЂ¦","currentResult":"Shows instructor, participants, lesson time, reason, created at; the actual resolve_*_change_request happens in the lesson detail overview","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:428-468,586-641","useAdminAttentionChangeRequests.ts"]},
{"id":"TR-46","tab":"operations","screen":"admin_issue_inbox","capability":"Close the issue / change-request detail","entryPoint":"X button in either detail header","userAction":"Click","states":["open","closed"],"commandOrReadModel":"URL issue / changeRequest removed","currentResult":"Returns to the select-prompt state","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:591-598,694-700"]},
{"id":"TR-47","tab":"operations","screen":"admin_issue_inbox","capability":"Live inbox invalidation + optimistic removal of resolved issues","entryPoint":"Firestore revision doc + command payloads","userAction":"(automatic)","states":["live","stale","patched"],"commandOrReadModel":"subscribeAdminIssueInboxRevision + applyAdminIssueInboxCommandResult (AttendanceAdminIssueResultPayload.resolvedAdminIssueIds)","currentResult":"Resolved issues disappear from the open list and the open detail is cleared without waiting for a refetch; history views are excluded from realtime","destructive":false,"sourceFiles":["subscribeAdminIssueInboxRevision.ts","adminIssueInboxRevisionCoordinator.ts","adminIssueInboxLocalSync.ts:39-64","useAdminIssueReadModels.ts:180-206"]},
{"id":"TR-48","tab":"operations","screen":"admin_issue_inbox","capability":"Absence of issue-level resolve / dismiss (by design)","entryPoint":"AdminIssueCenter detail authorized-actions block","userAction":"None available","states":["informational","missing context","deferred"],"commandOrReadModel":"none вЂ” canResolveDirectly is literal false; every action is availability 'deferred'","currentResult":"Text-only state; all 7 kinds have allowDismiss:false and requireCoupledDomainCommandToResolve:true, so dismissal and standalone resolution are impossible by policy","destructive":false,"sourceFiles":["AdminIssueCenter.tsx:861-874","readModelAuthorizedActions.ts:95-142","adminIssuePolicy.ts:49-99,562-575,659-672"]},
{"id":"TR-49","tab":"operations","screen":"admin_booking_monitor (legacy, live)","capability":"Legacy bookings/enrollments log with per-row status-aware deep links and guest link entry","entryPoint":"'admin_booking_monitor' collapsible section","userAction":"Scroll, click 'Open lesson detail' / 'Open enrollment attendance' / 'Open cancellation detail' / 'Link to client'","states":["pending","pending_cancellation","confirmed","cancelled","completed"],"commandOrReadModel":"URL tab=operations + booking/bookingView or enrollment/enrollmentView","currentResult":"Boots AdminTrainingRecordsPanel to the right record; guest rows expose phone/email and a link-to-client entry","destructive":false,"sourceFiles":["src/features/admin/components/bookings/BookingsLog.tsx:90-300","src/features/admin/operations/AdminActiveBookingMonitor.tsx:22-78","AdminPanel.tsx:219-229"]},
{"id":"TR-50","tab":"operations","screen":"schedule slot action modal (legacy, live)","capability":"Legacy guestв†’account link modal from the planner","entryPoint":"ScheduleSlotActionModal","userAction":"Search user, select, submit","states":["closed","open","submitting","success (auto-close after 1.2s)","error (insufficient funds)"],"commandOrReadModel":"non-canonical onLinkBooking(bookingId, targetUserId)","currentResult":"Distinct from the canonical link_guest_booking_to_account_as_administrator flow in the training-records guest tab; both must be preserved","destructive":true,"sourceFiles":["src/features/admin/components/bookings/LinkGuestBookingModal.tsx","src/features/admin/components/schedule/ScheduleSlotActionModal.tsx:17,737"]}
]
```

---

## 10. PARITY GAPS / CAPABILITY-LOSS RISKS (rebuild checklist)

1. **Unified confirm dialog omits the target line.** `AdminLessonBookingPanel.tsx:420-427` printed
   `bookingId @ rev N` (and the link target `accountId/participantId`); the unified panel does not
   (`AdminTrainingRecordsPanel.tsx:846-899`). Restore.
2. **Unified panel loses lesson detail error states.** The legacy panel distinguishes
   `reads.detail.error` (`adminLessonDetailFailed` + retry) and a missing admin projection
   (`adminLessonProjectionMissing`) (`:360-378`); the unified panel renders only
   `adminLessonNotFound` (`ATRP:709-710`).
3. **No `resolve_attendance_outcome` for lessons** even though
   `admin.authorizedActions.canResolveAttendanceOutcome` exists
   (`lessonBookingReadModel.ts:268`) and the command/attempt exist
   (`useAdminLessonBookingCommands.ts:155-166` counterpart; contracts `:78-83`).
4. **`resolve_booking_change_request` with `resolution:'rescheduled'` is not exposed** in the
   admin UI (only via the planner).
5. **No in-section reschedule / instructor change / duration change**; only the planner
   hand-off. `hasSchedulingPlannerHint` (`lessonBookingAdminPresentation.ts:217-220`) is the only
   consumer of those three authorized-action flags.
6. **No `create_confirmed_booking` and no single `record_booking_attendance` entry point** in the
   admin training-records UI (planner / booking-collaboration own them).
7. **Issue inbox free-text search is not URL state** вЂ” deep links cannot restore it.
8. **No per-issue lifecycle history**: `dismissed` and `resolved` are indistinguishable in the
   history view; `resolvedAt`, `resolution.reason`, `resolvedByAccountId`, `reopenedAt` are not rendered.
9. **`cancellationFinancial.timing` is display-only in the technical tab** вЂ” it never gates or
   re-routes the cancel buttons.
10. **Course cancel-unpaid-guest hardcodes `refundAmount: 0`** with no way to override
    (`AdminCourseEnrollmentDetail.tsx:517-536`).
11. **`AdminCourseEnrollmentPanel` (dead) has a `layout="stacked"` code path** with section headings
    and a top-level shared reason field (`AdminCourseEnrollmentDetail.tsx:150`, `:905-912`) that the
    `tabs` layout does not use; the unified panel only ever uses `tabs`
    (`ATRP:778`).
12. **Dead-but-tested panels** must not be deleted without updating
    `tests/unit/AdminLessonBookingPanel.test.tsx`, `tests/unit/AdminCourseEnrollmentPanel.test.tsx`,
    `tests/unit/adminBookingMonitorMapping.test.ts`, `tests/unit/adminLessonBookingCanonicalBoundary.test.ts`,
    `tests/unit/adminPlannerUxBoundary.test.ts`.

---

## 11. UNVERIFIABLE ITEMS

* **Runtime rendering / visual behaviour** вЂ” no browser, no authenticated session, no dev server
  was started (read-only audit). Cannot verify: layout collapse animation, the ~320 ms scroll
  delay actually landing on the right row, sticky header behaviour, `z-60` overlay stacking, or
  RU copy rendering. `AUTHENTICATED WORKFLOW: NOT VERIFIED`.
* **Translation copy** вЂ” only translation *keys* were read; the actual RU/EN strings in
  `src/lib/i18n/translations.ts` were not enumerated, so wording parity is unverified.
* **Server-side scope semantics** вЂ” the exact record-selection rules behind `admin_hot`,
  `admin_history`, `admin_pending_guest`, `admin_course_roster` live in the Cloud Function
  implementation (not in the audited paths). Whether `history` includes `dismissed` issues, how
  `admin_hot` bounds by date, and how `pending_guest` treats expired reservations are unverified.
* **Which issues are actually reachable in each inbox state** вЂ” issue creation is driven by
  `createOpenAdminIssue` / `reuseOrReopenAdminIssue` in domain commands and scheduled jobs; the
  exact production issue population and reopen behaviour could not be observed.
* **Actual authorization values** вЂ” every button is gated on read-model `authorizedActions`
  flags whose server computation (`readModelAuthorization.ts`) was only skimmed; which flags are
  true for a given booking/enrollment/actor in production is unverified.
* **Firestore rules / callable authorization** for `queryAdminIssueReadModels`,
  `queryLessonBookingReadModels`, `queryAdminCourseEnrollmentReadModels`,
  `queryBookingChangeRequestReadModels` and the admin commands were not audited.
* **`resolve_booking_change_request` rescheduled-path correctness** вЂ” the contract and command
  branch exist but are exercised by no audited UI, so the runtime behaviour of
  `bookingRevision` + `calendarInput` together is unverified here.
* **Whether `ADMIN_LESSON_BOOKINGS_REVISION_COLLECTION` / `ADMIN_ISSUE_INBOX_REVISION_COLLECTION` /
  `ADMIN_BOOKING_CHANGE_REQUESTS_REVISION_COLLECTION` are deployed and written in production** вЂ”
  constant names were read, actual production documents were not.
* **Test suite status** вЂ” no tests were executed (read-only audit); the referenced test files were
  only located, not run.
* **Graph freshness** вЂ” `graphify-out/` was not consulted; findings are from direct source reads only.


---

_tmp-people.md

# ADMIN в†’ PEOPLE TAB вЂ” Capability-Preservation Audit

Repo: `D:\SkiAcademy_DB` (React/Vite/Firebase "Carve Academy", RU+EN, KZT)
Scope: `src/features/admin/people/**`, `src/features/admin/identity/**`, plus the specific shared-domain context files.
Read-only audit. No source file was modified. This file is the only file created.

---

## 1. PEOPLE TAB STRUCTURE

### 1.1 Surface dispatcher

`src/features/admin/people/AdminPeopleSection.tsx` (27 lines) is a **pure switch, no state**:

| Line | Branch | Component | Props |
|---|---|---|---|
| `AdminPeopleSection.tsx:18` | `surface === 'clients'` | `AdminClientDirectory` | `adminAccountId` only |
| `AdminPeopleSection.tsx:20` | `surface === 'instructors'` | `AdminInstructorDirectory` | `adminAccountId` only |
| `AdminPeopleSection.tsx:23` | `surface === 'admins'` | `AdminRoleDirectory` | `adminAccountId`, `onRequestConfirm` |

`onRequestConfirm` is accepted by the section but forwarded **only** to `AdminRoleDirectory`. Clients and Instructors do **not** use the shared confirm modal вЂ” they use `window.confirm` (Clients/Instructors) and an in-place typed confirmation (Instructor delete).

`surface: 'clients' | 'instructors' | 'admins'` вЂ” `AdminPeopleSection.tsx:8`.

### 1.2 Where the three surfaces are mounted (not tabs inside People; three collapsible sections)

`src/features/admin/components/AdminPanel.tsx:344-396` renders, when `activeTab === 'people'`, **three independent `AdminCollapsibleSection`s**, each wrapping its own `AdminPeopleSection` instance:

| Section id | `AdminCollapsibleSection` `id` | i18n title keys | surface | `defaultOpen` | `forceOpen` |
|---|---|---|---|---|---|
| Clients | `admin_clients` (`AdminPanel.tsx:348`) | `clientsManagerTitle` / `clientsManagerSub` | `"clients"` (`:359`) | `true` (`:352`) | `Boolean(searchParams.get(ADMIN_CLIENT_ACCOUNT_QUERY_KEY))` (`:353`) + `forceOpenToken` (`:354`) |
| Instructors | `admin_instructors` (`AdminPanel.tsx:366`) | `coachesDirectoryTitle` / `coachesDirectorySub` | `"instructors"` (`:375`) | `true` (`:370`) | вЂ” |
| Roles/Admins | `admin_roles` (`AdminPanel.tsx:382`) | `adminRoleManagementTitle` / `adminRoleManagementSub` | `"admins"` (`:391`) | `true` (`:386`) | вЂ” |

All three are `React.lazy` + `Suspense` with `SectionLoadingFallback`:
- `AdminPeopleSection` lazy at `AdminPanel.tsx:78-80`.
- Fallback labels: `t('clientsManagerTitle')` (`:346`), `t('coachesDirectoryTitle')` (`:364`), `t('adminRoleManagementTitle')` (`:380`).

**Capability note:** all three People sub-surfaces are *always mounted together on the People tab* вЂ” there is **no sub-tab switcher** between Clients / Instructors / Admins inside People. Preserving "People = 3 stacked sections" is a capability, as is the per-section collapse/expand and the deep-link `forceOpen`.

i18n strings: `src/lib/i18n/translations.ts:914` (`adminTabPeople: 'People'`) / `:3270` (`adminTabPeople: 'Р›СЋРґРё'`); section titles `:2275-2276`, `:1674-1675`, `:1932-1933` (EN) and `:4635-4636`, `:4034-4035`, `:4293-4294` (RU).

`ADMIN_TAB_IDS = ['operations','finance','people','product','system']` вЂ” `src/features/admin/adminNavigation.ts:11`. Tab read from `?tab=`, `DEFAULT_ADMIN_TAB = 'operations'` (`:15`, `:163`).

### 1.3 `onRequestConfirm` вЂ” the shared admin confirm modal

`AdminPanel.tsx:172-179` holds `{message, onConfirm}` state. Rendered as a portal modal at `AdminPanel.tsx:462-497` (cancel `:475-481`, confirm `:482-492`). Only `AdminRoleDirectory` receives it. Used by Finance (`:324`), People/Roles (`:358`, `:374`, `:390`), Product (`:410`), and `ErrorLogsPanel` (`:456`).

---

## 2. CLIENTS SURFACE

Files: `AdminClientDirectory.tsx` (602), `AdminClientAccountDetail.tsx` (201), `AdminClientParticipantList.tsx` (161), `AdminClientParticipantDetail.tsx` (185), `AdminClientContactEditor.tsx` (98), `AdminClientWalletSummary.tsx` (46), `adminClientContracts.ts` (97), `adminClientLabels.ts` (58), `useAdminClientTranslations.ts` (97).

### 2.1 Directory вЂ” search, sort, filter, columns

**Read model:** `useAdminIdentityReadModels({enabled:true, realtime:true, directory:'accounts', search: appliedSearch, pageSize: 20, selectedAccountId})` вЂ” `AdminClientDirectory.tsx:135-142`. Scope = `admin_account_list` (`useAdminIdentityReadModels.ts:96-101`). Page size `ADMIN_CLIENT_DIRECTORY_PAGE_SIZE = 20` (`adminClientContracts.ts:11`).

**Search** (`AdminClientDirectory.tsx:223-235`): single `<input type="search">`, `aria-label = text.search`, placeholder `text.searchHint` ("Name prefix, exact email, exact phone, or ID. Not a full-directory scan." / RU equivalent, `useAdminClientTranslations.ts:11-13`). Debounce `ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS = 1000` (`AdminClientDirectory.tsx:123-132`; constant at `identity/accountDirectorySearch.ts:9`). `appliedSearch` is `''` when the raw box is blank (`:134`).

**Sort: NOT AVAILABLE.** There is no sort control, no sort state, and no `orderBy` parameter anywhere in the Clients surface (grep for `sort|orderBy|Sort` in `src/features/admin/people` returns only `adminPeopleMapping.ts:37`, a localeCompare in a *test-only* helper). Ordering is whatever the server read model returns.

**Filter: NOT AVAILABLE.** No lifecycle filter, no role filter, no "coach only" toggle. Only free-text server search.

**Table columns** (`AdminClientDirectory.tsx:272-279`) вЂ” exactly 5:

| # | Header text key | Cell content | Line |
|---|---|---|---|
| 1 | `text.client` | `displayName || text.unnamed`; **"You" badge** when `accountId === adminAccountId`; **Owner** badge when `role.systemRole === 'owner'`; **Admin** badge when `role.role === 'admin'`; **Coach badge** when `instructorLink.isInstructor` | `:291-310` |
| 2 | `text.contact` | `email ?? 'вЂ”'` | `:311-313` |
| 3 | `text.lifecycle` | `adminClientLifecycleLabel(lifecycle, text)` в†’ Active / Disabled / Uninitialized | `:314-316`, `adminClientLabels.ts:6-13` |
| 4 | `text.participants` | `managedParticipantCount` (numeric, mono) | `:317-319` |
| 5 | `text.actions` (right-aligned) | `text.openDetail` button в†’ opens account detail | `:320-332` |

Row highlight for the selected account: `:285-290`. Table wrapper is horizontally scrollable: `:270`.

**Pagination:** "Load more" button when `list.hasMore` (`AdminClientDirectory.tsx:339-348`), disabled while `list.loadingMore`, label switches to `text.loading`. Cursor-based via `reads.loadMore()` (`useAdminIdentityReadModels.ts:227-235`), which only fires when both `hasMore` and `cursor` exist.

### 2.2 Deep link `?clientAccount=`

- Constant `ADMIN_CLIENT_CLIENT_ACCOUNT_QUERY_KEY` вЂ” actually `ADMIN_CLIENT_ACCOUNT_QUERY_KEY = 'clientAccount'` (`adminNavigation.ts:27`).
- Producer: `adminClientAccountSearchParams(previous, accountId)` sets `tab=people` + `clientAccount=<id>` (`adminNavigation.ts:105-113`). Called from `AdminRoleList` "Open client" (`AdminRoleDirectory.tsx:163-167`) and from `AdminInstructorDetail` "Open client" (`AdminInstructorDirectory.tsx:689-696`).
- Consumer effect: `AdminClientDirectory.tsx:104-121` вЂ” reads `searchParams.get('clientAccount')`, `AccountIdSchema.safeParse`; on success sets `selectedAccountId`, clears `selectedParticipantId`, `contactEditing=false`, then **deletes the param** with `{replace:true}`. Invalid id в†’ param is left in place, no selection.
- Two other sources: `AdminPanel.tsx:353-354` `forceOpen` + `forceOpenToken` so the `admin_clients` section auto-expands on a deep link.
- Covered by tests: `tests/unit/adminRoleIdentityBoundary.test.ts:58-75`, `tests/unit/AdminClientDirectory.test.tsx:392` ("opens Account detail from clientAccount deep-link without mutation") and `:414` ("deep-link Account B replaces stale Account A selection").

### 2.3 Account detail panel

Reads: `useAdminIdentityReadModels(... selectedAccountId)` в†’ `reads.accountDetail` (`admin_account_detail`), plus `useAdminParticipantDetail(selectedParticipantId, {realtime:true})` в†’ `participantRead.item` (`admin_participant_detail`), plus `useAdminWalletReadModel(selectedParticipantId ? undefined : walletAccountId)` (`AdminClientDirectory.tsx:143-147`). Note the wallet read is **suppressed while a participant sub-detail is open** (`:147`).

Layout: list `lg:col-span-7`, detail `<aside>` `lg:col-span-5` (`AdminClientDirectory.tsx:242-243`, `:351`).

Rendered by `AdminClientAccountDetail`:

- **Header** (`AdminClientAccountDetail.tsx:76-113`): name as `<h3>`, close `X` button (`aria-label = text.closeDetail`), email, phone or `text.noPhone`, `{text.lifecycle}: {label}`, and role badges (Owner / Admin / Coach).
- **Lifecycle action bar** (`:114-144`): `text.disable` (`:115-124`), `text.enable` (`:125-134`), `text.editContact` (`:135-143`, only when `canEditContact && !contactEditing`). Each gated by `detail.authorizedActions` (`:62-72`) and disabled while `pending`.
- **Contact details section** (`:145-179`): read-only `<dl>` of `displayName` / `email` / `phone` when not editing; `AdminClientContactEditor` when editing.
- **Participant list** (`:180-191`).
- **Wallet summary** (`:192-198`).

### 2.4 Wallet summary

`AdminClientWalletSummary.tsx`:
- Section title `text.finance` (`:22`).
- `text.loading` while `loading` (`:23`).
- Balance rendered `formatAdminClientKzt(wallet.balance, locale)` вЂ” `Intl.NumberFormat(locale, {style:'currency', currency:'KZT', minimumFractionDigits:0, maximumFractionDigits:0})` (`adminClientLabels.ts:51-58`), testid `admin-client-wallet-balance` (`:25`).
- `text.walletMissing` when `!wallet.exists`, testid `admin-client-wallet-missing` (`:30-32`). **No synthetic zero balance** (test `AdminClientDirectory.test.tsx:257`).
- `text.walletUnavailable` when `wallet === undefined` (`:35`).
- `text.openFinance` button always present (`:37-43`) в†’ `onOpenFinance`.

`onOpenFinance` (`AdminClientDirectory.tsx:528-537`) uses `adminFinanceAccountSearchParams(previous, accountId)` with `{replace:true}` в†’ sets `tab=finance`, `account=<id>`, and **deletes** `payment` and `movement` params (`adminNavigation.ts:88-99`; test `adminClientIdentityBoundary.test.ts:52-61`). Test coverage: `AdminClientDirectory.test.tsx:278`.

Wallet read model shape picked: `{accountId, exists, balance, currency, accountStatus}` (`adminClientContracts.ts:63-66`; source schema `AdminWalletReadModelSchema` at `packages/shared-domain/src/canonical/readModels/adminFinanceReadModel.ts:113-124`, `currency: z.literal('KZT')`, `accountStatus: enum('active','unavailable')`).

### 2.5 Contact editor

`AdminClientContactEditor.tsx` вЂ” form, `onSubmit` в†’ `onSave` (`:25-31`):
- `displayName` text input, `id="admin-client-display-name"`, **required** (`:39-46`).
- `email` input, `id="admin-client-email"`, **`disabled`** + explanatory note `text.emailReadOnly` ("Email is owned by sign-in identity and cannot be edited here." / RU) (`:55-64`). Asserted by `adminClientIdentityBoundary.test.ts:47` and `AdminClientDirectory.test.tsx:232`.
- `phoneNumber` `type="tel"`, `id="admin-client-phone"`, **optional** (`:73-80`).
- `ActionButton` submit `text.saveContact`, disabled when `!draft.displayName.trim()` (`:83-91`); `ActionButton` `text.cancel` (`:92-94`).
- Draft type `AdminClientContactDraft {displayName, phoneNumber}` (`adminClientContracts.ts:68-71`).
- Draft resync: `AdminClientDirectory.tsx:149-155` (skipped while `contactEditing`); cancel restores server values (`:492-500`).

**Command:** `update_account_contact_as_administrator` вЂ” `AdminClientDirectory.tsx:478-491`, payload `{accountId, displayName: trim(), phoneNumber: trim(), expectedRevision, idempotencyKey: adminClientAttemptKey('update_account_contact', accountId), reasonExplanation: ADMIN_CLIENT_CONTACT_REASON}`. Reason constant `'Admin client directory contact update'` (`adminClientContracts.ts:12`).

### 2.6 Participant list

`AdminClientParticipantList.tsx`:
- Section title `text.participants` (`:43`).
- **"Missing self participant" block** (`:44-56`): shown when `canProvisionSelf` вЂ” dashed-border box with `text.missingSelf` and a `text.provisionSelf` button.
- `text.noParticipants` when `participants.length === 0 && !canProvisionSelf` (`:57-59`).
- **Per-participant row** (`:61-97`): `displayName`; `adminClientRelationshipLabel(participant.authority)` (`self` | `parent_guardian`) + `adminClientParticipantLifecycleLabel(lifecycle)` (`active` | `archived`); age via `adminClientAgeLabel` (`birthDate` string or `"<n> <years>"`); `skillLevel`; `discipline`; and a `text.openParticipant` button в†’ `onOpenParticipant(participantId)`.
- **Add-participant form** (`:99-158`), shown when `canCreateDependent`:
  - `displayName` (required), `birthDate` `type="date"` (required), `skillLevel` (required), `discipline` `<select>` `ski|snowboard` (optional select, defaults `ski`), `ActionButton` submit `text.addParticipant`.

**Commands:**
- `create_managed_dependent_participant` вЂ” `AdminClientDirectory.tsx:539-569`. `participantId` is client-generated: `ParticipantIdSchema.parse(canonicalDeterministicHash(['participant:v1','dependent', accountId, entropy()]))` (`:544-551`); `participantManagementId = participantManagementIdFromGuestLink({participantId, accountId})` (`:552-555`); `expectedRevision = actionRevision('create_managed_dependent_participant')`; `idempotencyKey = adminClientAttemptKey('create_dependent', participantId)`; reason `ADMIN_CLIENT_DEPENDENT_REASON = 'Admin client directory add participant'` (`adminClientContracts.ts:15`). Guard: no-op unless `account && displayName.trim() && birthDate` (`:541-543`).
- `provision_self_participant_for_account` вЂ” `AdminClientDirectory.tsx:570-581`; reason `ADMIN_CLIENT_PROVISION_SELF_REASON = 'Admin client directory provision self participant'` (`adminClientContracts.ts:16-17`).

### 2.7 Participant detail

`AdminClientParticipantDetail.tsx`:
- `text.backToAccount` button в†’ `onBack` (`:54-60`); close `X` (`:61-68`).
- Header: name; relationship line = `managers[0].authority` if a manager exists, else derived from `classification` (`self`в†’`text.relationshipSelf`, `dependent`в†’`text.relationshipGuardian`, else raw `classification`) + `В· ` + `adminClientParticipantLifecycleLabel` (`:70-83`).
- `text.archiveBlocked` notice when `detail.archiveBlockedByCommitments` (`:84-86`).
- Read-only facts (`:87-105`): `participantSkillLevel` (via `adminClientSkillLevelLabel`, trims; `''`в†’undefined), `discipline`, `age` (`birthDate` or `"<years> <text.ageYears>"`), and `instructorComment` only when present.
- **Editable form** when `canEdit` (`:106-160`): `displayName` (required), `birthDate` `type="date"` (optional), `skillLevel` (required), `discipline` select, `instructorComment` textarea rows=3, submit `text.saveParticipant`.
- `text.archiveParticipant` when `canArchive` (`:162-171`); `text.restoreParticipant` when `canRestore` (`:172-181`).

**Commands** (`AdminClientDirectory.tsx`): `update_participant_profile` (`:405-425`, note `administratorContext: true` is set server-side in `useAdminIdentityCommands.ts:110`), `archive_participant` (`:426-437`), `reactivate_participant` (`:438-449`). Reason for all three: `ADMIN_CLIENT_PARTICIPANT_REASON = 'Admin client directory participant update'`. Revision lookup `participantActionRevision(kind)` (`:208-213`) falls back to `1`.

`birthDate` in the draft is omitted from the payload when empty (`:410-412`), and `instructorComment` likewise (`:415-417`) вЂ” so clearing instructor comment is **not** expressible from this form.

### 2.8 Full Clients command list

| Command kind | Entry point | Destructive | Guard |
|---|---|---|---|
| `update_account_contact_as_administrator` | Edit contact в†’ Save | no | `authorizedActions` |
| `disable_account` | Detail в†’ Disable | **yes** | `window.confirm(text.confirmDisable)` (`AdminClientDirectory.tsx:513-527`) |
| `enable_account` | Detail в†’ Enable | no | `authorizedActions` |
| `create_managed_dependent_participant` | Participant list form | no | field validation |
| `provision_self_participant_for_account` | Participant list "Create participant for this account" | no | `authorizedActions` |
| `update_participant_profile` | Participant detail form | no | `authorizedActions` |
| `archive_participant` | Participant detail в†’ Archive | **yes** | **no confirm** (only server-side `archiveBlockedByCommitments`) |
| `reactivate_participant` | Participant detail в†’ Restore | no | `authorizedActions` |

Error mapping (`AdminClientDirectory.tsx:179-190`): `stale_version` в†’ `text.stale` **and auto-refresh**; `forbidden` в†’ `text.permissionDenied`; else `clientError.message || text.mutationFailed`. Success в†’ `text.saved`, `contactEditing=false`, dependent draft reset, `Promise.all([reads.refresh(), participantRead.refresh()])`.

### 2.9 i18n inventory (Clients)

`useAdminClientTranslations.ts:9-95`, RU+EN inline ternaries; `locale` = `'ru-RU' | 'en-US'` (`:8`). Notable non-obvious keys: `searchHint` warns "Not a full-directory scan"; `emailReadOnly`; `confirmDisable`; `walletMissing` / `walletUnavailable`; `archiveBlocked`; `missingAccount` / `missingParticipant`; `stale`; `permissionDenied`.

---

## 3. INSTRUCTORS SURFACE

Files: `AdminInstructorDirectory.tsx` (720), `AdminInstructorList.tsx` (82), `AdminInstructorDetail.tsx` (387), `AdminInstructorProfileEditor.tsx` (248), `AdminInstructorAccountPicker.tsx` (133), `adminInstructorContracts.ts` (155), `useAdminInstructorTranslations.ts` (129).

### 3.1 Directory / list

**Read models** (`AdminInstructorDirectory.tsx:153-168`): two hooks вЂ”
- `reads` = `{directory:'instructors', search: appliedSearch, pageSize: 20, selectedInstructorId, realtime:true}` в†’ `admin_instructor_list` / `admin_instructor_detail`. Page size `ADMIN_INSTRUCTOR_DIRECTORY_PAGE_SIZE = 20` (`adminInstructorContracts.ts:12`).
- `accountReads` = `{enabled: accountPickerOpen, directory:'accounts', search: appliedAccountSearch, pageSize: 20, realtime:true}` в†’ `admin_account_list`. `accountPickerOpen = showAdd || linking` (`:151`).

**Search** (`:392-403`): `type="search"`, `aria-label=text.search`, hint "Name prefix or ID. Not a full-directory scan." (`useAdminInstructorTranslations.ts:15-16`), same 1000 ms debounce (`:127-136`).
**Account-picker search**: second debounced input inside `AdminInstructorAccountPicker` (`:138-147`, picker `:56-63`), hint "Name, email, or ID. Already-linked accounts are hidden."

**Sort / filter: NOT AVAILABLE** (same as Clients вЂ” no sort control, no specialty/lifecycle filter).

**Columns** (`AdminInstructorList.tsx:32-39`) вЂ” exactly 6:

| # | Header key | Cell | Line |
|---|---|---|---|
| 1 | `text.instructor` | `name || text.unnamed` | `:51-53` |
| 2 | `text.specialty` | `specialtyLabel(specialty)` в†’ `text.specialtySki` / `specialtySnowboard` / `specialtyBoth` / `вЂ”` | `:54`, `:12-20` |
| 3 | `text.rate` | `pricePerHourKZT.toLocaleString('ru-RU')` or `вЂ”` | `:55-59` |
| 4 | `text.availability` | `isAvailable ? text.available : text.paused` | `:60-62` |
| 5 | `text.account` | `linkedAccountDisplayName ?? (linkedAccountId ?? text.accountNotLinked)` | `:63-66` |
| 6 | `text.actions` | `text.openDetail` | `:67-75` |

**Toolbar** (`:404-425`): `text.addInstructor` button with `Plus` icon. On click (`:406-420`) it: `showAdd=true`, `selectedInstructorId=undefined`, `profileEditing=false`, `linking=false`, `createAccountId=undefined`, and pre-generates `createInstructorId = InstructorIdSchema.parse(canonicalDeterministicHash(['instructor_catalog:v1', entropy()]))` (so the Storage path is stable before upload), resets the draft, clears error/notice.

**Pagination** (`:506-515`): "Load more" when `list.hasMore`.

### 3.2 Instructor detail вЂ” all displayed fields

`AdminInstructorDetail.tsx`:
- **Header** (`:109-137`): optional 56Г—56 avatar `<img>`; `name`; `specialtyLabel` + ` В· <price> в‚ё/С‡` when `pricePerHourKZT !== undefined` (`:119-121`); `isAvailable ? text.available : text.paused` (`:123-125`); close `X`.
- **Account section** (`:138-152`): `linkedAccountDisplayName ?? linkedAccountId`, plus `text.linkedAccountLifecycle: lifecycleLabel(linkedAccountLifecycle)` (`active|disabled|uninitialized`); else `text.accountNotLinked`.
- **Commitments section** (`:154-172`): `text.futureLessons: futureLessonCommitmentCount`, `text.futureCourseDays: futureCourseDayAssignmentCount`, `text.availabilityBlocks: activeAvailabilityBlockCount`; when `unlinkBlockedByCommitments || deleteBlockedByCommitments` a `role="status"` line shows `text.mutationFailed` if `deleteBlockedReason === 'availability_cleanup_required'` else `text.unlinkBlocked` (`:165-171`).
- **Action bar** (`:174-243`, hidden while `profileEditing || linking`): `text.editProfile` (`:176-185`), `text.pauseNewBookings` (`:186-195`), `text.resumeNewBookings` (`:196-205`), `text.linkAccount` (`:206-215`), `text.stopBeingInstructor` (`:216-225`, also disabled when `unlinkBlockedByCommitments`), `text.openClient` (only when `linkedAccountId`, `:226-234`), `text.openPlanner` (**always shown**, `:235-241`).
- **Read-only detail `<dl>`** (`:337-384`, hidden while editing): `phone` (only when set), `languages` via `formatInstructorSpokenLanguageList` mapped to `text.spokenLanguageLabels`, `experienceYears`, `bioRu`, `bioEn`, and legacy `bio` fallback rendered under the `bioRu` label (`:377-382`).
- **Delete zone** (`:245-299`) вЂ” see В§3.5.
- `hasFutureCommitments` inline warning under the bar when `canPause && (futureLessonCommitmentCount>0 || futureCourseDayAssignmentCount>0)` (`:301-305`).
- `linking` sub-panel renders the shared `linkPicker` node + `text.cancel` (`:324-335`).

Navigation callbacks:
- `onOpenClient` в†’ `adminClientAccountSearchParams(previous, AccountIdSchema.safeParse(accountId))` (i.e. `?tab=people&clientAccount=вЂ¦`) (`:689-696`).
- `onOpenPlanner` в†’ `adminPlannerSearchParams(previous, {localDate: formatDateLocalYMD(new Date()), instructorId})` в†’ `?tab=operations&plannerDate=<today>` (`adminNavigation.ts:119-134`; note `instructorId` is **explicitly unused today**, `adminNavigation.ts:131-132`) (`:697-707`).

### 3.3 Profile editor вЂ” every editable field

`AdminInstructorProfileEditor.tsx` (shared by create + edit, `submitLabel` differs). Draft type `AdminInstructorProfileDraft` (`adminInstructorContracts.ts:65-75`), empty default `EMPTY_ADMIN_INSTRUCTOR_PROFILE_DRAFT` (`:77-87`).

| Field | Control | id / aria | Validation | Line |
|---|---|---|---|---|
| `name` | text | `admin-instructor-name` | `required`; submit disabled when blank | `:48-56` |
| `specialty` | select `ski\|snowboard\|both` | `admin-instructor-specialty` | вЂ” | `:62-78` |
| `pricePerHourKZT` | number, `min=1 step=1` | `admin-instructor-price` | `required`; submit disabled when blank | `:84-95` |
| `languages` | **checkbox group** over `INSTRUCTOR_SPOKEN_LANGUAGE_CODES` = `['ru','en','de','fr','it','es']` (`packages/shared-domain/src/canonical/instructorSpokenLanguage.ts:3`), labels from `text.spokenLanguageLabels` | `aria-label` per code | unknown/unnormalized tokens are preserved and re-appended (`:117-125`) | `:96-134` |
| `experienceYears` | number, `min=0 max=80 step=1` | `admin-instructor-experience` | optional | `:140-151` |
| `phoneNumber` | tel | `admin-instructor-phone` | optional | `:157-165` |
| `bioRu` | textarea rows=3 | `admin-instructor-bio-ru` | optional | `:171-179` |
| `bioEn` | textarea rows=3 | `admin-instructor-bio-en` | optional | `:185-193` |
| `avatarUrl` | text | `admin-instructor-avatar` | optional (manual URL) | `:200-207` |
| photo upload | `input type=file accept="image/*"` (sr-only, inside a styled `<label>`) | `admin-instructor-avatar-file` | disabled while `pending \|\| uploading`; label switches to `text.uploading` | `:208-227` |
| avatar preview | 64Г—64 `<img>` | вЂ” | вЂ” | `:228-230` |
| submit / cancel | `ActionButton` | вЂ” | submit disabled when `uploading \|\| !name.trim() \|\| !pricePerHourKZT.trim()` | `:232-245` |

**There is no availability/schedule editor in this surface.** Availability is a single boolean `isAvailable` toggled only through `deactivate_instructor_catalog` / `reactivate_instructor_catalog`. "Admin availability blocks" exist only as a **read-only counter** (`activeAvailabilityBlockCount`).

**There is no `skillLevel`/skills field for instructors** (skills exist only for Participants).

**Photo upload pipeline** (`AdminInstructorDirectory.tsx:55-103, 253-268`): `optimizeInstructorImage` rejects non-`image/*`; center-crops to a square; canvas `maxSize = 400`; encodes `image/jpeg` quality `0.8`; `uploadImage(blob, instructorAssetStoragePath(LIVE_CANONICAL_EXECUTION_SCOPE, instructorId))` (`src/infrastructure/firebase/storage.ts:5-9`; path builder `packages/shared-domain/src/canonical/testStoragePaths.ts:127-139` в†’ `<LIVE_INSTRUCTOR_ASSET_STORAGE_ROOT>/<instructorId>.jpg`). On success the URL is written into the **draft only** (`setProfileDraft`) (`:262`) вЂ” Storage is written **before** the catalog command, so an abandoned form leaves an orphan asset. Errors collapse to `text.mutationFailed` (`:264`). `uploading` state is a single global flag.

**Draft hydration:** `adminInstructorProfileDraftFromDetail` (`adminInstructorContracts.ts:89-115`) вЂ” `specialty ?? 'ski'`, languages joined `', '`, `bioRu: detail.bioRu?.trim() || detail.bio?.trim() || ''` (legacy fallback), price as string. Applied in `useEffect` unless `profileEditing` (`AdminInstructorDirectory.tsx:170-173`) and on cancel edit (`:588-593`).

**Field в†’ command payload mapping:**
- `localizedInstructorProfileFields(draft)` returns `{bioRu, bio}` when `bioRu` non-empty, and `{bioEn}` when non-empty (`adminInstructorContracts.ts:117-128`) вЂ” RU bio is mirrored into legacy `bio`.
- `parseInstructorLanguagesCsv(value)` = `normalizeInstructorSpokenLanguages(value.split(','))` (`:130-132`).
- `experienceYears` is sent only when finite **and** integer (create `:298-302`, update `:339-343`).
- `parsePriceKzt` (`:247-251`) requires a finite **integer в‰Ґ 1**, else `text.priceRequired`.
- `create` also guards `createAccountId` (`text.accountRequired`) and `name` (`text.nameRequired`) (`:271-283`).

### 3.4 Occupancy / commitments computation

The People tab does **not** compute occupancy locally. `src/features/admin/people/adminPeopleOccupancy.ts` (25 lines) exposes `bookingsBlockingInstructorDeactivation` and `mergeInstructorOccupancyBookings` operating on the **legacy** `Booking` type with legacy statuses `pending|confirmed|pending_cancellation` and a `system_block_` userId filter вЂ” and it is imported by **tests only** (`tests/unit/adminUxParity.test.ts:13`; the file has no `src/` importer). Classify: **TEST_ONLY / legacy residue**.

Authoritative occupancy is server-side in the `admin_instructor_detail` read model (`AdminInstructorDetailReadModelSchema`, `packages/shared-domain/src/canonical/readModels/adminIdentityReadModel.ts:141-159`):
`courseRosterCount`, `courseDayAssignmentCount`, `futureLessonCommitmentCount`, `futureCourseDayAssignmentCount`, `unlinkBlockedByCommitments`, `activeAvailabilityBlockCount`, `deleteBlockedByCommitments`, `deleteBlockedReason в€€ {'future_commitments','availability_cleanup_required'}`.

Server predicates (`packages/shared-domain/src/canonical/identityAdministration.ts`):
- `instructorUnlinkBlockedByFutureCommitments` (`:200-239`) вЂ” fail-closed on capped scans or unparsed commitments; ignores terminal statuses `cancelled|completed|no_show`; considers any booking/course day whose `occurrence.interval.endsAt > now`.
- `instructorCatalogDeletionBlockedByFutureCommitments` вЂ” **the same function aliased** (`:245-246`); do not fork.
- `countInstructorFutureCommitments` (`:248-280`) вЂ” the two UI counters.
- `instructorDeleteBlockedByAvailabilityCleanup` (`:293-301`) вЂ” blocked when `activeBlockCount > INSTRUCTOR_DELETE_AVAILABILITY_MUTATION_LIMIT = 8`, or scan capped, or unparsed blocks > 0.
- Scan bounds: `INSTRUCTOR_UNLINK_COMMITMENT_SCAN_LIMIT = INSTRUCTOR_CATALOG_COMMITMENT_SCAN_LIMIT = 32` (`:188-190`), `INSTRUCTOR_DELETE_AVAILABILITY_SCAN_LIMIT = 32` (`:195`).

Similarly `src/features/admin/people/adminPeopleMapping.ts` (93 lines: `accountListItemToUserProfile`, `mergeAdminClientDirectory`, `instructorListItemToInstructor`, `mergeAdminInstructorDirectory`, `filterPeopleBySearch`) is **imported by tests only** (`tests/unit/adminUxParity.test.ts:24`; no `src/` importer). Boundary tests explicitly assert the People surfaces must **not** contain `mergeAdminClientDirectory` / `mergeAdminInstructorDirectory` (`adminClientIdentityBoundary.test.ts:14`, `adminInstructorIdentityBoundary.test.ts:16`). Classify: **TEST_ONLY legacy adapters**.

### 3.5 Create / link / unlink / delete flows

**Create instructor** вЂ” `showAdd` panel (`AdminInstructorDirectory.tsx:434-464`): `AdminInstructorAccountPicker` + `AdminInstructorProfileEditor` with `submitLabel = text.createInstructor`. `handleCreate` (`:270-315`):
- guards: `!createAccountId` в†’ `text.accountRequired`; `!name.trim()` в†’ `text.nameRequired`; bad price в†’ `text.priceRequired`.
- `instructorId = createInstructorId ?? InstructorIdSchema.parse(canonicalDeterministicHash(['instructor_catalog:v1', entropy()]))`.
- `create_instructor_catalog_entry` with `{instructorId, accountId, name, pricePerHourKZT, specialty, languages?, experienceYears?, ...localizedFields, avatarUrl?, phoneNumber?, expectedRevision: createAccountRevision, idempotencyKey: adminInstructorAttemptKey('create_catalog', instructorId), reasonExplanation: ADMIN_INSTRUCTOR_CREATE_REASON}`. Reason = `'Admin instructor directory create'` (`adminInstructorContracts.ts:13`).
- On success: `selectedInstructorId = instructorId`, draft reset (`:310-314`).
- Note: `createAccountRevision` defaults to state `1` (`:119`) and is set from the picked option's `revision` (`:365`) вЂ” an un-`вЂ¦-adapter` revision path (contrast: `AdminRoleDirectory` is explicitly asserted to not use `expectedRevision ?? 1`, `adminRoleIdentityBoundary.test.ts:19`).
- Account picker options mark `linked` accounts (`:184`) and split **selectable** (`!linked && lifecycle === 'active'`) vs **unavailable** (`!linked && lifecycle !== 'active'`) вЂ” `AdminInstructorAccountPicker.tsx:48-49`; already-linked accounts are hidden entirely.

**Link account** вЂ” `linking` sub-panel; selecting an option immediately fires `link_account_instructor_catalog` (`:372-384`) with `expectedRevision = option.revision`, key `adminInstructorAttemptKey('link_account', instructorId)`, reason `ADMIN_INSTRUCTOR_LINK_REASON = 'Admin instructor directory account link'`. No confirmation dialog (there is an unused `text.confirmLink` string, `useAdminInstructorTranslations.ts:67`).

**Unlink ("Stop being instructor")** вЂ” `:641-662`. Client-side pre-guard: if `detail.unlinkBlockedByCommitments` в†’ `setError(text.unlinkBlocked)` and abort. Then `unlink_account_instructor_catalog` with `window.confirm(text.confirmStopBeingInstructor)` (`runAttempt` confirm path, `:192-194`). Reason `ADMIN_INSTRUCTOR_UNLINK_REASON`. Button additionally disabled when `unlinkBlockedByCommitments` (`AdminInstructorDetail.tsx:219`).

**Pause / Resume** вЂ” `:597-630`. `deactivate_instructor_catalog` with `window.confirm(hasFuture ? text.confirmPauseWithFuture : text.confirmPause)`; `reactivate_instructor_catalog` with **no** confirm. Both use reason `ADMIN_INSTRUCTOR_LIFECYCLE_REASON = 'Admin instructor directory lifecycle update'`.

**Delete instructor (hard delete)** вЂ” `AdminInstructorDetail.tsx:245-299`:
- Zone rendered only when `canDelete && !profileEditing && !linking`; red-bordered, red-tinted.
- **Two-step with typed confirmation**: button `text.deleteInstructor` в†’ `deleteConfirming=true` and `deleteConfirmText=''` (`:286-297`) в†’ alert `text.deleteInstructorConfirm(name)` ("вЂ¦cannot be undone."), hint `text.deleteInstructorConfirmHint` ("Type DELETE or the instructor name to confirm." / RU В«РЈР”РђР›РРўР¬В»), text input `aria-label = text.deleteInstructorConfirmHint`.
- Confirm button enabled when `deleteConfirmText.trim() === text.deleteInstructorConfirmToken || === detail.name` (`:101-103`), then `onDeleteInstructor`.
- Cancel resets both (`:272-278`).
- Handler `AdminInstructorDirectory.tsx:663-688`: client pre-guard `detail.deleteBlockedByCommitments` в†’ `setError(text.deleteBlocked)` and abort; else `delete_instructor_catalog_entry` with reason `ADMIN_INSTRUCTOR_DELETE_REASON = 'Admin instructor directory hard delete'`. On success: clears selection, `profileEditing`, `linking`, and `accountReads.refresh()`.
- Covered by `tests/unit/AdminInstructorDirectory.test.tsx:350`.

**Save profile (edit)** вЂ” `handleSaveProfile` (`:317-351`): `update_instructor_catalog_profile` with `expectedRevision = actionRevision('update_instructor_catalog_profile', detail.revision)` (i.e. the **read model's own revision as fallback**, so a `revision: 0` catalog still sends 0 вЂ” regression tests `AdminInstructorDirectory.test.tsx:199` and `:230`), key `adminInstructorAttemptKey('update_profile', ...)`, reason `ADMIN_INSTRUCTOR_PROFILE_REASON`.

### 3.6 Full Instructors command list

| Command kind | Entry | Destructive | Guard |
|---|---|---|---|
| `create_instructor_catalog_entry` | Add instructor в†’ Create | no | account + name + price validation |
| `update_instructor_catalog_profile` | Edit profile в†’ Save | no | `authorizedActions` + revision |
| `deactivate_instructor_catalog` | Pause new bookings | soft | `window.confirm` (stronger text when future commitments exist) |
| `reactivate_instructor_catalog` | Resume new bookings | no | `authorizedActions` |
| `link_account_instructor_catalog` | Link account в†’ pick option | no | picker only offers `active` + unlinked |
| `unlink_account_instructor_catalog` | Stop being instructor | **yes** | `unlinkBlockedByCommitments` pre-guard + `window.confirm` |
| `delete_instructor_catalog_entry` | Delete instructor | **yes (irreversible)** | typed token/name confirmation + `deleteBlockedByCommitments` pre-guard |

Error mapping (`AdminInstructorDirectory.tsx:211-227`): `stale_version` в†’ `text.stale` + refresh; `forbidden` в†’ `text.permissionDenied`; `invalid_transition` with `details.reason === 'conflict'` в†’ `text.deleteBlocked`; else message / `text.mutationFailed`. `runAttempt` returns `boolean` (unlike the Clients variant which returns void) and on success clears `profileEditing`, `linking`, `showAdd`, `createAccountId`, `createAccountRevision`, `createInstructorId`, `accountSearch` (`:200-210`).

---

## 4. ROLES / IDENTITIES (Admins surface)

Files: `AdminRoleDirectory.tsx` (271), `AdminRoleList.tsx` (131), `AdminRoleAccountPicker.tsx` (155), `adminRoleContracts.ts` (28), `useAdminRoleTranslations.ts` (54).

### 4.1 What a "role record" is

There is no separate Role entity/document. A role record is an **Account's role projection** carried in the canonical read model:

- `AdminIdentityAccountRoleProjectionSchema = { role: 'user' | 'admin', systemRole?: 'owner' }` вЂ” `packages/shared-domain/src/canonical/identityAdministration.ts:404-409`; `ACCOUNT_ROLES = ['user','admin']` (`:21-23`).
- So the **exact set of role values is: `user`, `admin`, plus the non-assignable `systemRole: 'owner'`**. There are no sub-roles (no manager, no reception, no instructor role).
- Stored inside `AdminAccountListItem.role` (`packages/shared-domain/src/canonical/readModels/adminIdentityReadModel.ts:55`).
- The Roles list is **not** a list of role definitions вЂ” it is a list of **Accounts filtered to `role === 'admin'`** via the server-side `role: 'admin'` filter (`AdminRoleDirectory.tsx:77`, schema `admin_account_list.role` at `adminIdentityReadModel.ts:186-191`).

### 4.2 Directory behaviour

- `adminReads` (`:71-79`): `{directory:'accounts', search: '', pageSize: ADMIN_ROLE_DIRECTORY_PAGE_SIZE (20, `adminRoleContracts.ts:3`), role: 'admin', realtime: true}` plus `selectedAccountId = parsed adminAccountId` when the actor's own id parses (`:56, :78`).
  - **`search` is hard-coded `''` вЂ” the current-administrators list has NO search box.** Search exists only inside the Add-Administrator candidate picker (`candidateSearch`, `:49`, `:58-69`, `:81-87`).
- `candidateReads` (`:81-87`): `{enabled: showAdd, directory:'accounts', search: appliedCandidateSearch, pageSize: 20, realtime:true}` вЂ” **no `role` filter**, so the candidate list shows all accounts and filters client-side.
- `toRow(item)` maps `{accountId, displayName, email?, lifecycle, role, instructorLink, authorizedActions, diagnosticCount, revision?}` (`:31-43`).
- `actorIsOwner = adminReads.accountDetail?.role.systemRole === 'owner'` (`:91`) вЂ” the actor's own account detail is read to determine ownership.
- `actorCanMutateRoles = Boolean(actorIsOwner) || adminRows.some(row => Boolean(changeAccountRoleAuthorizedAction(row.authorizedActions)))` (`:92-96`). When false, an informational shield banner `text.ownerOnlyMutations` ("Only the system owner can promote or demote administrators." / RU) is shown **and the Add button is hidden entirely** (`:178-185`, `:220`).

### 4.3 Current administrators list

`AdminRoleList.tsx`:
- Loading в†’ spinner + `text.loading` (`:38-45`); `rows.length === 0` в†’ dashed box `text.noAdministrators` (`:47-53`).
- Scrollable `<ul class="max-h-[360px] overflow-y-auto">` (`:57`).
- Per row: `displayName || text.unnamed` (`:70-72`); **Owner badge** when `role.systemRole === 'owner'` (`:73-77`); **Instructor badge** when `instructorLink.isInstructor || instructorLink.instructorId` (`:78-82`); `email` line (`:84-88`); a meta line with `text.roleAdmin` + `lifecycleLabel(lifecycle)` (`:89-92`).
- Per-row actions: `text.openClient` в†’ `onOpenClient(row.accountId)` в†’ `adminClientAccountSearchParams` (`:95-101`, `AdminRoleDirectory.tsx:163-167`); and `text.revokeAdmin` (`UserMinus` icon) **only when `canDemoteCanonicalAccountAdminRole(row)`** (`:60`, `:102-113`).
- `canDemoteCanonicalAccountAdminRole` (`identityAdministration.ts:159-167`): false if `role.role !== 'admin'` **or** `systemRole === 'owner'`; true only when `authorizedActions` includes `change_account_role`. в†’ **Owner row is never demotable; self-demotion is blocked server-side** (`evaluateChangeAccountRole` returns `self_demotion_forbidden`, `:114-131`).
- Pagination: "Load more" when `hasMore` (`:119-128`).

### 4.4 Grant (promote) flow

1. `text.addAdministrator` button (UserPlus) в†’ `showAdd = true`, error/notice cleared (`AdminRoleDirectory.tsx:220-235`).
2. `AdminRoleAccountPicker` (`:237-258`): search box (debounced 1000 ms), a **selectable** list and a dimmed **unavailable** list. Eligibility is `isCanonicalAccountEligibleForAdminRolePromotion(option)` (`identityAdministration.ts:140-156`): `lifecycle === 'active'` **AND** `role.role !== 'admin'` **AND** `systemRole !== 'owner'` **AND** `revision !== undefined` **AND** `authorizedActions` contains `change_account_role`. Selectable rows show `displayName`, `email`, `lifecycle В· text.roleUser`; unavailable rows show `lifecycle В· text.unavailableForPromote` (`AdminRoleAccountPicker.tsx:50-127`).
3. `onSelect` sets `selectedCandidateId`; `onSearchChange` **clears the selection** (`:246-250`) вЂ” a search change invalidates the chosen candidate.
4. `text.confirmPromote` is disabled until a selectable row is selected (`:139-148`).
5. `onConfirmPromote` (`AdminRoleDirectory.tsx:150-161`): finds the row, re-checks `changeAccountRoleAuthorizedAction` (else `text.mutationFailed`), builds `label = email || displayName || accountId`, and calls **`onRequestConfirm(`${text.promoteConfirmPrefix} ${label}?`, ...)`** вЂ” i.e. the shared AdminPanel portal modal.
6. On confirm: `runRoleChange(row, 'admin', ADMIN_ROLE_PROMOTE_REASON)`.
7. `text.cancelAdd` closes and resets (`:149-151`, `:253-257`).

### 4.5 Revoke (demote) flow

`onDemote` (`:143-148`): `label = row.email || row.displayName || row.accountId`; `onRequestConfirm(`${text.revokeConfirmPrefix} ${label}?`, вЂ¦)` в†’ `runRoleChange(row, 'user', ADMIN_ROLE_DEMOTE_REASON)`.

**Exact command вЂ” one single command for both directions** (`AdminRoleDirectory.tsx:103-141`):

```
kind: 'change_account_role'
intent: { accountId, role: 'admin' | 'user', reasonExplanation }
expectedRevision: changeAccountRoleAuthorizedAction(row.authorizedActions).expectedRevision
idempotencyKey: adminRoleAttemptKey('promote' | 'demote')   // `admin_role:<action>:<entropy>`
reasonExplanation: ADMIN_ROLE_PROMOTE_REASON / ADMIN_ROLE_DEMOTE_REASON
```
Reasons: `'Admin role directory promote administrator'` / `'Admin role directory revoke administrator'` (`adminRoleContracts.ts:4-5`).
Success в†’ `text.saved`, `showAdd=false`, selection + search reset, `refreshDirectories()` (which refreshes candidate reads only when `showAdd` was open вЂ” `:98-101`).
Error: `stale_version` в†’ `text.stale` + refresh; else `clientError.message || text.mutationFailed`. **No `forbidden` в†’ permissionDenied mapping here** (unlike the other two surfaces).

**Note on `expectedRevision`:** the Roles surface never uses a `?? 1` fallback вЂ” it hard-fails with `text.mutationFailed` if the authorized action is absent (`:108-112`, `:153-156`). This is asserted by `adminRoleIdentityBoundary.test.ts:19`.

### 4.6 Role-surface state summary

| State | Rendering |
|---|---|
| loading | spinner + `text.loading` in the list; spinner + `text.pending` at the bottom while a command is in flight (`:263-268`) |
| empty | `text.noAdministrators` (dashed box) |
| empty candidates | `text.emptyCandidates` (picker) |
| read error | `listError` block + Retry (`:187-198`); `read-failed` в†’ `text.readFailed` |
| permission denied | `list.error === 'permission-denied'` в†’ `text.permissionDenied` + Retry (`:169-174`) |
| not authorized to mutate | `text.ownerOnlyMutations` banner; Add button absent; per-row revoke hidden by `canDemoteCanonicalAccountAdminRole` |
| mutation error | inline `text-rose-600` paragraph (`:200`) |
| success | `text.saved` paragraph (`:201`) |

---

## 5. IDENTITY (`CanonicalIdentityManager` + identity infrastructure)

### 5.1 `CanonicalIdentityManager` is **DEAD CODE (unmounted)**

`src/features/admin/identity/CanonicalIdentityManager.tsx` (825 lines) is exported from `src/features/admin/identity/index.ts:1` and **imported by no `src/` file**. The only non-`src` matches are four tests that assert it is **absent** from `AdminPanel.tsx`:

- `tests/unit/adminClientIdentityBoundary.test.ts:21` вЂ” `expect(panel).not.toContain('CanonicalIdentityManager')`
- `tests/unit/adminInstructorIdentityBoundary.test.ts:28` вЂ” same
- `tests/unit/adminRoleIdentityBoundary.test.ts:29` вЂ” same
- `tests/unit/adminUxParity.test.ts:427` вЂ” same

Classification: **DEAD (unmounted legacy surface)**. It is a debug/repair console. It must **not** be re-mounted as part of the People tab, and its capabilities must not be treated as user-facing вЂ” but it documents the *intended* full identity command surface, so it is worth reading as a capability reference.

### 5.2 What it contained (reference only, not live)

- Directory switcher over `['accounts','participants','instructors']` (`:113-125`), a `Refresh` button (`:126-133`), a plain search box (no debounce, `:135-141`), list + detail two-column layout.
- **Mandatory `reason` textarea** (`:285-294`) вЂ” `requestAttempt` is a no-op unless `reason.trim()` is non-empty (`:74-78`). The attempt is then stored with `reasonExplanation: reason.trim()` (`:77`) вЂ” note several inner handlers pre-build attempts with `reasonExplanation: ''` which `requestAttempt` overwrites.
- **Generic confirmation card** (`:300-327`) showing the message, the `expectedRevision`, and Confirm / Cancel.
- `AccountDetail` (`:334-539`): lifecycle + `role.role` + `role.systemRole`; managed participant names; **diagnostics list** (`diagnosticType В· evidence`, `:359-367`); buttons for `disable_account`, `enable_account`, `change_account_role` (toggles adminв†”user), `provision_self_participant_for_account`, an inline `create_managed_dependent_participant` form (**hard-codes `skillLevel: 'beginner'`, `discipline: 'ski'`**), and an inline `link_account_instructor_catalog` form taking a raw `instructorId` string.
- `ParticipantDetail` (`:541-710`): classification + lifecycle; `archiveBlocked`; `managers` as `name (authority)`; diagnostics; `update_participant_profile` (displayName + birthDate only); `archive_participant`; `reactivate_participant`; **`assign_participant_management_as_administrator`** (raw `accountId` input в†’ `participantManagementIdFromGuestLink`); **`revoke_participant_management`** on `managers[0]`.
- `InstructorDetail` (`:712-825`): name + availability + `linkedAccountId`; `update_instructor_catalog_profile` (name only), `deactivate_instructor_catalog`, `reactivate_instructor_catalog`, `unlink_account_instructor_catalog`; plus a create-catalog box with `catalogPrice` defaulting to `'15000'` (`:63`).

### 5.3 Live identity capabilities elsewhere in the app (NOT in the People tab)

| Capability | Where it IS live |
|---|---|
| `assign_participant_management_as_administrator` | **No UI at all.** Only in `CanonicalIdentityManager` (dead). Command branch exists at `useAdminIdentityCommands.ts:115-132`. |
| `revoke_participant_management` | **No UI at all.** Dead manager only; command branch at `useAdminIdentityCommands.ts:133-149` (with `administratorContext: true`). |
| `repair_participant_management_owner_guard` | **No UI anywhere.** Command branch at `useAdminIdentityCommands.ts:185-198`; referenced only as a diagnostic `safeRepairKind` (`identityAdministration.ts:107`) and in the authorized-action enum (`:374`). |
| `admin_participant_list` scope | Only reachable through the dead `CanonicalIdentityManager`. No live People surface lists Participants globally. |
| `diagnostics` / `diagnosticCount` | Data is carried (`adminClientContracts.ts:42`, `adminInstructorContracts.ts:58`, `adminRoleContracts.ts:17`) but **never rendered** in the live People surfaces. |

**Capability-preservation risk:** `assign_participant_management_as_administrator`, `revoke_participant_management`, and `repair_participant_management_owner_guard` have **no replacement UI** after the People rebuild вЂ” they were already unreachable before it, so a rebuild does not regress them, but a "restore the debug console" step would re-introduce an out-of-boundary surface that the boundary tests actively forbid.

### 5.4 Participant search/picker вЂ” `AdminManagedParticipantPicker` (live, but outside People)

`src/features/admin/identity/AdminManagedParticipantPicker.tsx` (316 lines). Live importers: `course-enrollments/AdminCourseEnrollmentPanel.tsx:269`, `course-enrollments/AdminCourseEnrollmentDetail.tsx:609`, `training-records/AdminTrainingRecordsPanel.tsx:515`, `components/schedule/slot-modal/ActiveSlotCreateForm.tsx:165`, `lesson-bookings/AdminLessonBookingDetail.tsx:910`. **Not used by the People tab.**

Behaviour:
- Account `<select>` populated by `loadAccountDirectoryPage` (`identity/accountDirectorySearch.ts:106-137`) в†’ `queryAdminIdentityReadModels({scope:'admin_account_list', pageSize, search?, cursor?})`, filtered to `isBookableAccountLifecycle` = `active | uninitialized` (`:23-27`). Bounded one page at a time; `Load more` appends de-duplicated by `accountId` (`:106-131`).
- `mergeAccountDirectoryOptions(additionalAccounts, accountOptions, selectedAccountOption)` merges + sorts by displayName (`:46-67`; picker `:133-141`).
- Eligible-participant `<select>` from `useAdminEligibleParticipants(accountId)` в†’ scope `admin_eligible_participants` (`useAdminIdentityReadModels.ts:302-333`), options labelled `displayName В· authority`.
- `autoSelectUniqueSelf` (`:153-173`): auto-selects the only `authority === 'self'` participant and hides the participant field (`:148-151`, `:151`, `:276`).
- `onReadyChange` (`:175-198`): ready when a selection exists; **and**, with `autoSelectUniqueSelf` and an empty eligible list, reports ready so the planner submit can provision self for the Account (`:186-189`).
- States: loading placeholder option, `text.noEligible` when an account has zero active managed participants (`:309-311`), `directoryError` with a Retry button (`:250-274`).
- Selection shape `AdminManagedParticipantSelection {accountId, participantId, displayName, accountDisplayName?}` (`identity/identityContracts.ts:110-115`).
- Related shared-domain context: `managedParticipantPickerReadModel.ts` вЂ” `ManagedParticipantPickerItemSchema` (discipline, skillLevel, age, authority, revision, instructorComment, avatarUrl), `rejectSpoofedManagedParticipantPickerInput` (forbidden keys `accountId`/`payerAccountId`/`userId`/`bookedBy`), `parseManagedParticipantPickerAccountId` (authUid must equal accountId). This picker read model is **separate** from `admin_eligible_participants` and is not consumed by People.

### 5.5 Identity command transport (live)

`identity/useAdminIdentityCommands.ts:29-300` вЂ” `executeAdminIdentityAttempt(adminAccountId, attempt)`. All branches call `executeAuthenticatedCanonicalCommand(adminAccountId, {kind, intent, idempotencyKey, expectedRevision, вЂ¦})` в†’ callable `executeCanonicalCommand` (`src/lib/canonical/canonicalCommandClient.ts:16`, `:94`).

Notable transport details:
- `expectedRevision` is always `AggregateRevisionSchema.parse(...)` (`:33`).
- `update_participant_profile` sets **`administratorContext: true`** (`:110`); `revoke_participant_management` too (`:145`).
- `provision_self_participant_for_account` **deliberately omits `expectedRevision`** (`:172-184`) вЂ” the command is idempotent-by-state, not revision-guarded.
- `create_instructor_catalog_entry` omits `expectedRevision` unless `accountId` is supplied (`:223`).
- `update_participant_profile` converts `birthDate` в†’ `age: {kind:'birth_date', birthDate}` (`:99-101`).
- `create_instructor_catalog_entry` defaults `name ?? instructorId` and `pricePerHourKZT ?? 1` (`:205-206`).
- All errors pass through `toCanonicalCommandClientError(error, 'admin_identity')` (`:297-299`).

`AdminIdentityAttempt` (union, 13 kinds) вЂ” `identity/identityContracts.ts:18-106`. `AdminIdentityAuthorizedActionKindSchema` (server-advertised kinds) вЂ” `packages/shared-domain/src/canonical/identityAdministration.ts:362-386`; `changeAccountRoleAuthorizedAction` (`:398-402`); `AdminIdentityAuthorizedActionSchema = {kind, expectedRevision, expectedSecondaryRevision?}` (`:388-396`). **Note the authorized-action array is capped at 8** (`adminIdentityReadModel.ts:60`, `:85`, `:135`).

### 5.6 Identity read model + realtime refresh

`identity/useAdminIdentityReadModels.ts`:
- `useAdminIdentityReadModels` (`:43-251`) вЂ” three list states + three detail states, generation-guarded against races (`listGeneration`, `detailGeneration`), `loadMore` cursor append, `refresh()` = `Promise.all([loadList(), loadDetail()])`.
- `useAdminParticipantDetail(participantId, {realtime})` (`:253-300`) вЂ” single-item hook, its own generation guard; `refresh: load` (note: `refresh` here is a **sync function**, unlike the other hook where it is async).
- `useAdminEligibleParticipants(accountId)` (`:302-333`) вЂ” no `realtime` flag, no revision subscription.
- Error classification `classify()` (`:30-34`): `functions/permission-denied` в†’ `'permission-denied'`, everything else в†’ `'read-failed'`. Type `AdminIdentityReadError = 'permission-denied' | 'read-failed'`.
- `EMPTY_LIST` starts `loading: true` (`:36-41`) вЂ” surfaces should not read a transient empty list as "no data".

**Realtime refresh chain (a real capability вЂ” data freshness):**
1. `identity/subscribeAdminPeopleRevision.ts:8-17` subscribes to Firestore doc `admin_runtime/admin_people` (`ADMIN_PEOPLE_REVISION_COLLECTION` / `_DOCUMENT_ID` вЂ” `packages/shared-domain/src/canonical/adminPeopleRevision.ts:4-5`, schema `AdminPeopleRevisionDocumentSchema` `{revision, updatedAt}` at `:7-12`) through `subscribeAdminRealtimeRevision` (`src/lib/admin/subscribeAdminRealtimeRevision.ts:22`).
2. `identity/adminPeopleRevisionCoordinator.ts` (69 lines) вЂ” module-level singleton. `ensureRevisionSubscription` lazily subscribes on the first listener; `registerAdminPeopleRevisionListener` returns an unsubscribe; `teardownRevisionSubscriptionIfIdle` unsubscribes when the last listener leaves (`:12-45`). `lastNotifiedRevision` is tracked **separately** from `revisionState.lastRevision` so snapshot baselines and delivered invalidations stay distinct (`:8-9`, `:21`). `registerAdminPeopleRevisionFromCommand` (`:47-61`) is the in-process path. `resetAdminPeopleRevisionCoordinatorForTests` (`:63-69`).
3. `identity/adminPeopleLocalSync.ts:4-13` вЂ” `applyAdminPeopleCommandResult(result)` parses `payload.adminPeopleRevision` via `AdminPeopleRevisionPayloadSchema` and calls the coordinator. Called from `assertSucceeded` (`useAdminIdentityCommands.ts:25`), which also calls `applyAdminPlannerCommandResult` (`:26`).
4. `identity/useAdminPeopleRevisionRefresh.ts:4-13` вЂ” the React binding; stores `refresh` in a ref so the listener never re-registers.

`realtime: true` is set for all three People directory reads and for `useAdminParticipantDetail` вЂ” so a mutation from anywhere (or another admin) refreshes the People lists. `tests/unit/adminPeopleRevisionCoordinator.test.ts` and `tests/unit/useAdminIdentityReadModels.realtime.test.ts` cover this.

---

## 6. PROVISIONING вЂ” how clients / participants / instructors are created

### 6.1 There is **no Account-creation UI in the People tab**

- Grep for `'create_account' | "create_account" | createAccount` across `src/` returns **zero** command usages. Boundary tests assert `create_account` must not appear in any Clients file (`adminClientIdentityBoundary.test.ts:38`) and `AdminRoleDirectory` must not contain direct Firestore writes.
- So an admin **cannot create a new client Account** from People. Accounts come from sign-in/registration. The People tab can only: provision a self Participant for an existing Account, add a managed dependent, edit contacts, toggle lifecycle, and (Roles) change role.
- `docs/T32_CANONICAL_ADMIN_AUDIT.md:2383-2387` records the legacy capabilities deliberately removed: create client, edit client profile, edit account balance, delete client, promote/demote admin вЂ” all replaced by canonical commands. Preserve the *replacements*, not the legacy direct Firestore writes.

### 6.2 Add a dependent participant (Clients)

- **Form:** `AdminClientParticipantList.tsx:99-158` (fields in В§2.6). **Dialog: none** вЂ” an inline form inside the account detail.
- **Defaults:** `EMPTY_DEPENDENT` (`AdminClientDirectory.tsx:46-51`) = `{displayName:'', birthDate:'', skillLevel:'', discipline:'ski'}`. Reset after a successful attempt (`:177`).
- **Required at submit:** `displayName.trim()` and `birthDate` (`:541`); `skillLevel` is sent as `dependentDraft.skillLevel.trim()` even if empty (`:563`) вЂ” the form marks it `required` but the guard does not.
- **ID generation (client-side):** `canonicalDeterministicHash(['participant:v1','dependent', accountId, entropy()])` + `participantManagementIdFromGuestLink({participantId, accountId})` (`:544-555`).

### 6.3 Provision the self Participant (Clients)

- **Entry:** a dashed "no self participant" box with `text.provisionSelf` (`AdminClientParticipantList.tsx:44-56`), gated by `canProvisionSelf` from `authorizedActions`.
- **Command:** `provision_self_participant_for_account` with only `{accountId, reasonExplanation}` (`useAdminIdentityCommands.ts:172-184` вЂ” **no `expectedRevision`**). Idempotency key `adminClientAttemptKey('provision_self', accountId)`.
- **Server guard:** `provisionSelfParticipantForAccountHandler` requires administrator context and a non-empty `reasonExplanation` (`functions/src/canonical/participantAccess/selfParticipantProvisioningCommands.ts:545-563`).

### 6.4 Create an instructor (Instructors)

- **Form:** `AdminInstructorProfileEditor` inside the `showAdd` panel, preceded by `AdminInstructorAccountPicker` (`AdminInstructorDirectory.tsx:434-464`).
- **Defaults:** `EMPTY_ADMIN_INSTRUCTOR_PROFILE_DRAFT` (`adminInstructorContracts.ts:77-87`) вЂ” all empty, `specialty: 'ski'`. On account pick, if `name` is blank the account's `displayName` is auto-filled (`:366-371`).
- **ID:** pre-generated at "Add instructor" click (`:412-416`) so the avatar Storage path is deterministic; regenerated if absent (`:284-286`, `:454-458`).
- **Note:** `create_instructor_catalog_entry` **requires an existing Account** (`accountId` is sent with the Account's `revision` as `expectedRevision`). The picker only offers `active` + unlinked accounts; linked ones are hidden and non-active ones are dimmed/unselectable.
- **Cancel** resets `showAdd`, `createAccountId`, `createInstructorId`, draft, and account search (`:446-452`).

### 6.5 Wallet / starter-credit side effects on provisioning вЂ” **NONE from the People tab**

- No People-tab command is in `auditEffectRegistry` with a money effect. The only People-related effect tags are `participant_access_changed`, `resource_claim_changed`, `outbox_obligation_created` (`packages/shared-domain/src/canonical/auditEffectRegistry.ts:176-209`).
- `wallet_balance_changed` is declared **only** for `grant_starter_credit` (`:133`), `record_manual_wallet_funding` (`:132`) and `pay_service_from_wallet_as_administrator` (`:141-148`).
- `grant_starter_credit` is issued by the **self-signup bootstrap** path `ensureCanonicalSelfParticipant` (`src/lib/canonical/canonicalAccountProvisioningClient.ts:13-31`, which calls `provision_self_participant` then `grant_starter_credit` with fixed idempotency keys `provision-self-participant-v2` / `grant-starter-credit-v1`). That function is **not** referenced by anything in the People tab (grep: only its own definition).
- Server side, `provision_self_participant_for_account` performs **no wallet write** вЂ” grep for `wallet|starter|grant` in `functions/src/canonical/participantAccess/*.ts` returns only test fixtures.
- Amount policy lives in `packages/shared-domain/src/canonical/starterCredit.ts`: `DEFAULT_STARTER_CREDIT_KZT = 250`, `MIN = 0`, `MAX = 10_000` (matches Firestore Rules and the admin settings UI), `normalizeStarterCreditKzt`, `resolveStarterCreditAmountKzt` reading `settings/starter_credit.amountKzt`. The **admin setting UI** is in `src/features/settings/*` (`settingsStore.starterCreditKzt`, `saveStarterCreditKzt` в†’ `settingsService.ts:30`), **not** in People.
- `grant_starter_credit` is forbidden inside TestSessions (`packages/shared-domain/src/canonical/testSessionDomainIsolation.ts:151`).

**Conclusion for the rebuild:** the People tab has **no wallet mutation and no starter-credit side effect**. The wallet block is a **read-only KZT summary + a link to Finance**. Do not introduce, and do not "restore", any money-writing affordance here.

---

## 7. DIALOGS / CONFIRMATIONS вЂ” complete inventory

### 7.1 Portalled confirm modal (AdminPanel-level)

| Trigger | Message | Guard | Location |
|---|---|---|---|
| Roles в†’ Remove administrator rights | `${text.revokeConfirmPrefix} ${email \|\| displayName \|\| accountId}?` | 2 buttons (Cancel / Confirm), no typed token; Confirm disabled implicitly by modal semantics | `AdminRoleDirectory.tsx:143-148`; modal `AdminPanel.tsx:462-497` |
| Roles в†’ Make administrator | `${text.promoteConfirmPrefix} ${label}?` | same | `AdminRoleDirectory.tsx:150-161` |

### 7.2 `window.confirm` (blocking native confirm)

| Trigger | Message | Destructive? | Location |
|---|---|---|---|
| Clients в†’ Disable account | `text.confirmDisable` вЂ” "Disable this account? Participants and lessons are not deleted." | **yes** (access revocation) | `AdminClientDirectory.tsx:513-527`; string `useAdminClientTranslations.ts:62-64` |
| Instructors в†’ Pause new bookings (no future commitments) | `text.confirmPause` | soft | `AdminInstructorDirectory.tsx:603-615` |
| Instructors в†’ Pause new bookings (future lessons/course days) | `text.confirmPauseWithFuture` вЂ” stronger wording | soft | same call site (`:614`) |
| Instructors в†’ Stop being instructor (unlink) | `text.confirmStopBeingInstructor` вЂ” "Existing commitments are not deleted." | **yes** | `AdminInstructorDirectory.tsx:648-661` |

`window.confirm` is invoked inside `runAttempt` in **both** directories: clients `:167-169`, instructors `:192-194`. Cancelling returns early with no state change (clients: `void`; instructors: `false`).

### 7.3 Typed-confirmation zone (Instructor hard delete)

`AdminInstructorDetail.tsx:245-299` вЂ” the only multi-step, typed, in-surface confirmation. Requirements: type `text.deleteInstructorConfirmToken` (`'DELETE'` / `'РЈР”РђР›РРўР¬'`) **or** the exact instructor name (`:101-103`). Plus a pre-guard in the handler (`deleteBlockedByCommitments` в†’ `text.deleteBlocked`) and a red alert paragraph naming the instructor. **Irreversible.**

### 7.4 In-surface forms (not modals, no overlay)

| Form | Component | Cancel | Validation gate on submit |
|---|---|---|---|
| Edit account contact | `AdminClientContactEditor` | `ActionButton text.cancel` в†’ `onCancelContact` (restores server values) | `displayName` required + submit disabled when blank |
| Add dependent participant | `AdminClientParticipantList.tsx:99-158` | **no cancel button** вЂ” draft persists until a successful command or panel close | `displayName`, `birthDate` required in the handler |
| Create participant for this account | single button, no form | n/a | `authorizedActions` |
| Save participant profile | `AdminClientParticipantDetail.tsx:106-160` | **no cancel** вЂ” draft persists until refresh or selection change | `displayName`, `skillLevel` required |
| Add instructor | `AdminInstructorDirectory.tsx:434-464` | `ActionButton text.cancel` (`:446-452`, full reset) | account + name + price |
| Edit instructor profile | `AdminInstructorDetail.tsx:307-322` | `ActionButton text.cancel` в†’ `onCancelEdit` (re-hydrates draft from detail) | name + price; also disabled while `uploading` |
| Link account to instructor | `AdminInstructorDetail.tsx:324-335` | `text.cancel` button | selecting an option **immediately commits** the link вЂ” no confirm |
| Add administrator picker | `AdminRoleDirectory.tsx:237-258` | `ActionButton text.cancelAdd` | Confirm disabled until a selectable row is chosen |
| AdminPanel generic confirm | portal | Cancel button | вЂ” |

### 7.5 Destructive-marked actions summary

| Action | Guard strength |
|---|---|
| `delete_instructor_catalog_entry` | **Strongest**: typed token/name + blocked-by-commitments pre-guard + `authorizedActions` |
| `unlink_account_instructor_catalog` | `window.confirm` + blocked-by-commitments pre-guard + button disabled when blocked |
| `disable_account` | `window.confirm` only |
| `archive_participant` | **No confirm at all** вЂ” only server-side `archiveBlockedByCommitments`, shown as a passive notice (`AdminClientParticipantDetail.tsx:84-86`) |
| `revoke_participant_management` | No UI (dead surface) |
| `delete_instructor_catalog_entry` client pre-guard in `AdminInstructorDirectory.tsx:666-669`; server `deleteBlockedReason` also covers `availability_cleanup_required` |

---

## 8. STATES

### 8.1 Per surface

| | Clients | Instructors | Admins/Roles |
|---|---|---|---|
| **loading (list)** | spinner + `text.loading` (`:258-263`) | same (`:482-487`) | spinner inside `AdminRoleList` (`AdminRoleList.tsx:38-45`) |
| **loading (detail)** | spinner + close button when `detailLoading \|\| participantRead.loading` (`:352-367`) | spinner + close button when `detailLoading` (`:520-539`) | n/a |
| **loading (mutation)** | `ActionButton pending` + `pendingLabel=text.pending`; no global overlay | same + spinner on submit | spinner + `text.pending` paragraph (`AdminRoleDirectory.tsx:263-268`) |
| **empty (no search)** | `text.emptyDirectory` вЂ” "No clients yet." (`:264-268`) | `text.emptyDirectory` (`:488-492`) | `text.noAdministrators` (`AdminRoleList.tsx:47-53`) |
| **empty (with search)** | `text.emptySearch` вЂ” "No clients found." | `text.emptySearch` | n/a (no search on the admin list) |
| **empty (participants)** | `text.noParticipants` (`AdminClientParticipantList.tsx:57-59`) | `text.emptyAccounts` in the picker (`AdminInstructorAccountPicker.tsx:71-75`) | `text.emptyCandidates` (`AdminRoleAccountPicker.tsx:78-82`) |
| **empty (wallet)** | `text.walletMissing` / `text.walletUnavailable` | n/a | n/a |
| **empty (participants in picker)** | n/a | n/a | n/a вЂ” but `AdminManagedParticipantPicker` shows `text.noEligible` (`AdminManagedParticipantPicker.tsx:309-311`) |
| **read error** | `text.readFailed` + Retry (`:244-257`) | `text.readFailed` + Retry (`:468-481`) | `text.readFailed` + Retry (`:187-198`) |
| **detail error** | `text.detailFailed` + Retry + close (`:368-394`) | `text.detailFailed` + Retry + close (`:540-569`) | n/a |
| **permission denied (read)** | `list.error === 'permission-denied'` в†’ `text.permissionDenied` (`:247`) | same (`:471`) | same (`:169-171`) |
| **permission denied (detail)** | `detailError`/`participantRead.error` в†’ `text.permissionDenied` (`:372-375`) | same (`:544-546`) | n/a |
| **permission denied (mutation)** | `clientError.code === 'forbidden'` в†’ `text.permissionDenied` (`:184-185`) | same (`:220`) | **not mapped** вЂ” shows raw message (`:132-137`) |
| **stale version** | `text.stale` + auto-refresh of both reads (`:182-190`) | `text.stale` + `reads.refresh()` (`:216-227`) | `text.stale` + `refreshDirectories()` (`:132-134`) |
| **other mutation error** | `clientError.message \|\| text.mutationFailed` | same, plus `invalid_transition`+`reason:'conflict'` в†’ `text.deleteBlocked` (`:213-223`) | same |
| **success** | `text.saved` (`:175`) | `text.saved` (`:200`) | `text.saved` (`:125`) |
| **not-authorized banner** | n/a (silent) | n/a | `text.ownerOnlyMutations` (`AdminRoleDirectory.tsx:178-185`) |
| **missing entity** | `text.missingAccount` / `text.missingParticipant` (`:585-594`) | `text.missingInstructor` (`:710-712`) | n/a |
| **validation** | inline (native `required`) | `text.nameRequired` / `text.priceRequired` / `text.accountRequired` (`:275-283`, `:320-328`) | none beyond selection |

**Pattern to preserve:** all three surfaces independently render the same six states and use the same four error classes (`loading`, `empty-search`, `empty-directory`, `read-failed`, `permission-denied`, `stale`). They do **not** share a state component today вЂ” the rebuild may consolidate, but must not drop any state.

### 8.2 Entity lifecycles

**Account** вЂ” `lifecycle в€€ {'active','disabled','uninitialized'}` (`adminIdentityReadModel.ts:54`).
- Labels: `adminClientLifecycleLabel` в†’ `text.lifecycleActive` / `lifecycleDisabled` / `lifecycleUninitialized` (`adminClientLabels.ts:6-13`); identical logic duplicated in `AdminInstructorAccountPicker.tsx:27-34`, `AdminRoleAccountPicker.tsx:26-33`, `AdminRoleList.tsx:18-25`.
- Transitions: `active в‡„ disabled` via `enable_account` / `disable_account`. `uninitialized` is a **terminal-ish non-canonical state** вЂ” `isCanonicalAccountEligibleForAdminRolePromotion` rejects it (`identityAdministration.ts:146-148`) and the instructor account picker marks it "Unavailable for linking" (`AdminInstructorAccountPicker.tsx:48-49`).
- `disable_account` is blocked by `evaluateDisableAccount` when `targetSystemRole === 'owner'` (`system_owner_protected`) or a linked instructor is available (`active_instructor_linked`) (`identityAdministration.ts:169-180`).

**Participant** вЂ” `lifecycle в€€ {'active','archived'}` (`adminIdentityReadModel.ts:80`); `classification в€€ {'self','dependent','unmanaged_guest'}` (`:79`).
- `active в‡„ archived` via `archive_participant` / `reactivate_participant`.
- `archiveBlockedByCommitments` computed by `participantArchiveBlockedByCommitments` (`identityAdministration.ts:332-360`): fail-closed on capped scans / unparsed commitments; blocked by any booking not in `cancelled|completed|no_show` or any enrollment not in `cancelled|withdrawn|completed|no_show`. Scan bound `PARTICIPANT_ARCHIVE_COMMITMENT_SCAN_LIMIT = 32` (`:330`).
- `unmanaged_guest` Participants are **not** manageable by the Clients surface (they do not appear in `managedParticipants`).

**Instructor catalog** вЂ” `isAvailable: boolean` (`adminIdentityReadModel.ts:130`) plus hard existence.
- `isAvailable true в‡„ false` via `deactivate_instructor_catalog` / `reactivate_instructor_catalog` (labelled "Pause/Resume new bookings").
- `reactivate` blocked when the **linked Account is disabled**: `evaluateReactivateInstructorCatalog` в†’ `linked_account_disabled` (`identityAdministration.ts:182-186`).
- Hard delete: `delete_instructor_catalog_entry`; effects include `resource_claim_changed` (`auditEffectRegistry.ts:205`) вЂ” availability blocks are released inside the transaction, capped at `INSTRUCTOR_DELETE_AVAILABILITY_MUTATION_LIMIT = 8`.
- Read model also exposes `courseRosterCount`, `courseDayAssignmentCount`, `activeAvailabilityBlockCount`, `diagnostics`, `deleteBlockedReason`.

**Role** вЂ” `role в€€ {'user','admin'}` + `systemRole?: 'owner'`; `change_account_role` only. `evaluateChangeAccountRole` (`:114-131`): `actor_not_owner` (only the system owner may change roles), `target_is_owner` (never), `self_demotion_forbidden` (can't demote self).

**Wallet (read-only here)** вЂ” `exists: boolean`, `balance`, `currency: 'KZT'`, `accountStatus в€€ {'active','unavailable'}`.

---

## 9. JSON CAPABILITY LIST

```json
[
  {
    "id": "people.clients.directory.list",
    "tab": "people",
    "screen": "Clients directory (section id admin_clients)",
    "capability": "Paginated canonical Account directory with server-side search, badges, and per-row open",
    "entryPoint": "AdminPanel people tab -> AdminCollapsibleSection id=admin_clients -> AdminPeopleSection surface=clients -> AdminClientDirectory",
    "userAction": "Type in the search box (1000ms debounce) or click 'Load more' / row 'Open'",
    "states": ["loading", "emptyDirectory", "emptySearch", "read-failed+retry", "permission-denied", "hasMore/loadMore", "selectedRowHighlight"],
    "commandOrReadModel": "readModel admin_account_list via callable queryAdminIdentityReadModels (pageSize 20, cursor pagination)",
    "currentResult": "5-column table: Client(+You/Owner/Admin/Coach badges) | Contact(email) | Lifecycle | Participants(count) | Actions(Open)",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminClientDirectory.tsx:135-142,222-348", "src/features/admin/identity/useAdminIdentityReadModels.ts:69-164", "src/features/admin/identity/accountDirectorySearch.ts:9", "src/features/admin/people/adminClientContracts.ts:11"]
  },
  {
    "id": "people.clients.deeplink.clientAccount",
    "tab": "people",
    "screen": "Clients directory deep link",
    "capability": "Open an Account detail from ?tab=people&clientAccount=<accountId> and self-expand the section",
    "entryPoint": "AdminRoleList 'Open client' / AdminInstructorDetail 'Open client' -> adminClientAccountSearchParams -> AdminClientDirectory effect",
    "userAction": "Click 'Open client' on a Roles or Instructors row",
    "states": ["invalid id ignored (param retained)", "valid id selects account, clears participant selection and contact edit, removes param via replace:true", "forceOpen + forceOpenToken expand admin_clients"],
    "commandOrReadModel": "search param ADMIN_CLIENT_ACCOUNT_QUERY_KEY='clientAccount' -> readModel admin_account_detail",
    "currentResult": "Account detail aside opens; the deep-link param is consumed and removed from the URL",
    "destructive": false,
    "sourceFiles": ["src/features/admin/adminNavigation.ts:27,105-113", "src/features/admin/people/AdminClientDirectory.tsx:104-121", "src/features/admin/components/AdminPanel.tsx:353-354", "src/features/admin/people/AdminRoleDirectory.tsx:163-167", "src/features/admin/people/AdminInstructorDirectory.tsx:689-696"]
  },
  {
    "id": "people.clients.detail.view",
    "tab": "people",
    "screen": "Clients account detail aside",
    "capability": "Full Account card: identity, contact, role/instructor badges, lifecycle label, managed participants, wallet summary",
    "entryPoint": "AdminClientDirectory aside -> AdminClientAccountDetail",
    "userAction": "Click row 'Open' (or deep link)",
    "states": ["detailLoading+close", "detailError+retry+close", "loaded", "missingAccount", "missingParticipant"],
    "commandOrReadModel": "readModel admin_account_detail (AdminAccountDetailReadModel)",
    "currentResult": "Header (name, email, phone/noPhone, lifecycle, Owner/Admin/Coach badges) + lifecycle action bar + contact section + participant list + wallet summary",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminClientAccountDetail.tsx:74-199", "src/features/admin/people/adminClientContracts.ts:32-45", "packages/shared-domain/src/canonical/readModels/adminIdentityReadModel.ts:67-73"]
  },
  {
    "id": "people.clients.contact.edit",
    "tab": "people",
    "screen": "Clients account detail -> contact editor",
    "capability": "Edit displayName and phoneNumber; email is read-only (sign-in identity)",
    "entryPoint": "AdminClientAccountDetail 'Edit contact' -> AdminClientContactEditor",
    "userAction": "Edit name/phone, click 'Save contact' or 'Cancel'",
    "states": ["readOnly dl (not editing)", "editing form", "pending", "stale", "forbidden"],
    "commandOrReadModel": "command update_account_contact_as_administrator (reason 'Admin client directory contact update')",
    "currentResult": "Account contact updated; email shown disabled with explanatory note; cancel restores server values",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminClientContactEditor.tsx:24-97", "src/features/admin/people/AdminClientDirectory.tsx:478-500", "src/features/admin/identity/useAdminIdentityCommands.ts:62-77"]
  },
  {
    "id": "people.clients.lifecycle.disable_enable",
    "tab": "people",
    "screen": "Clients account detail action bar",
    "capability": "Toggle Account lifecycle active <-> disabled with an explicit warning confirm",
    "entryPoint": "AdminClientAccountDetail Disable/Enable buttons",
    "userAction": "Click Disable (window.confirm) or Enable",
    "states": ["confirm required on disable", "stale", "forbidden", "pending"],
    "commandOrReadModel": "commands disable_account / enable_account (reason 'Admin client directory lifecycle update')",
    "currentResult": "Account lifecycle toggled; participants and lessons are not deleted; owner accounts are server-protected",
    "destructive": true,
    "sourceFiles": ["src/features/admin/people/AdminClientDirectory.tsx:501-527", "src/features/admin/people/adminClientLabels.ts:6-13", "packages/shared-domain/src/canonical/identityAdministration.ts:169-180"]
  },
  {
    "id": "people.clients.wallet.summary",
    "tab": "people",
    "screen": "Clients account detail -> finance block",
    "capability": "Read-only KZT wallet balance summary plus a jump to Finance on the same Account",
    "entryPoint": "AdminClientAccountDetail -> AdminClientWalletSummary",
    "userAction": "Click 'Open Finance'",
    "states": ["loading", "balance (testid admin-client-wallet-balance)", "walletMissing (no synthetic zero)", "walletUnavailable"],
    "commandOrReadModel": "readModel admin_wallet (finance) -> navigation tab=finance&account=<id> (payment/movement params cleared)",
    "currentResult": "Formatted KZT balance or an explicit 'wallet is not created' state; Finance opens pre-filtered to that Account",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminClientWalletSummary.tsx:20-45", "src/features/admin/people/adminClientLabels.ts:51-58", "src/features/admin/people/AdminClientDirectory.tsx:144-147,528-537", "src/features/admin/adminNavigation.ts:88-99", "packages/shared-domain/src/canonical/readModels/adminFinanceReadModel.ts:113-124"]
  },
  {
    "id": "people.clients.participants.list",
    "tab": "people",
    "screen": "Clients account detail -> participants section",
    "capability": "List managed Participants with relationship, lifecycle, age, skill level, discipline; open each one",
    "entryPoint": "AdminClientAccountDetail -> AdminClientParticipantList",
    "userAction": "Click 'Open participant' on a row",
    "states": ["noParticipants", "provision-self block (canProvisionSelf)", "loaded"],
    "commandOrReadModel": "readModel admin_account_detail .managedParticipants",
    "currentResult": "Per-participant card + 'Open participant'; 'no managed participants' when empty; a 'create participant for this account' block when self is missing",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminClientParticipantList.tsx:41-98", "src/features/admin/people/adminClientLabels.ts:15-49"]
  },
  {
    "id": "people.clients.participants.add_dependent",
    "tab": "people",
    "screen": "Clients account detail -> add participant form",
    "capability": "Create a managed dependent Participant (child) under the Account",
    "entryPoint": "AdminClientParticipantList inline form (shown when canCreateDependent)",
    "userAction": "Fill displayName / birthDate / skillLevel / discipline and click 'Add participant'",
    "states": ["no cancel button (draft persists)", "pending", "stale", "forbidden", "noParticipants -> populated"],
    "commandOrReadModel": "command create_managed_dependent_participant (reason 'Admin client directory add participant'); client-generated participantId = canonicalDeterministicHash(['participant:v1','dependent',accountId,entropy()])",
    "currentResult": "New dependent Participant appears in the list with authority parent_guardian",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminClientParticipantList.tsx:99-158", "src/features/admin/people/AdminClientDirectory.tsx:46-58,539-569", "src/features/admin/identity/useAdminIdentityCommands.ts:150-171"]
  },
  {
    "id": "people.clients.participants.provision_self",
    "tab": "people",
    "screen": "Clients account detail -> missing-self block",
    "capability": "Provision the Account's own self Participant (identity repair)",
    "entryPoint": "AdminClientParticipantList 'provisionSelf' button (shown when canProvisionSelf)",
    "userAction": "Click 'Create participant for this account'",
    "states": ["pending", "stale", "forbidden"],
    "commandOrReadModel": "command provision_self_participant_for_account (no expectedRevision; reason 'Admin client directory provision self participant')",
    "currentResult": "Self Participant created; no wallet/starter-credit side effect",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminClientParticipantList.tsx:44-56", "src/features/admin/people/AdminClientDirectory.tsx:570-581", "functions/src/canonical/participantAccess/selfParticipantProvisioningCommands.ts:545-563"]
  },
  {
    "id": "people.clients.participants.profile_edit",
    "tab": "people",
    "screen": "Clients -> participant detail",
    "capability": "Edit a Participant's profile: displayName, birthDate, skillLevel, discipline, instructorComment",
    "entryPoint": "AdminClientParticipantDetail edit form (shown when canEdit)",
    "userAction": "Edit fields, click 'Save participant'",
    "states": ["archiveBlockedByCommitments notice", "pending", "stale", "forbidden", "no cancel (draft persists)"],
    "commandOrReadModel": "command update_participant_profile (administratorContext: true; reason 'Admin client directory participant update')",
    "currentResult": "Profile saved; birthDate omitted when blank (so age_years form cannot be written); instructorComment cannot be cleared from this form",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminClientParticipantDetail.tsx:87-160", "src/features/admin/people/AdminClientDirectory.tsx:60-78,157-160,405-425", "src/features/admin/identity/useAdminIdentityCommands.ts:92-114"]
  },
  {
    "id": "people.clients.participants.archive_restore",
    "tab": "people",
    "screen": "Clients -> participant detail action row",
    "capability": "Archive a Participant or reactivate an archived one",
    "entryPoint": "AdminClientParticipantDetail 'Archive' / 'Restore' buttons",
    "userAction": "Click 'Archive' or 'Restore' (NO confirmation dialog today)",
    "states": ["archiveBlockedByCommitments notice (server-enforced)", "pending", "stale", "forbidden"],
    "commandOrReadModel": "commands archive_participant / reactivate_participant (reason 'Admin client directory participant update')",
    "currentResult": "Participant lifecycle becomes archived/active; server blocks archive while commitments exist",
    "destructive": true,
    "sourceFiles": ["src/features/admin/people/AdminClientParticipantDetail.tsx:84-86,161-182", "src/features/admin/people/AdminClientDirectory.tsx:426-449", "packages/shared-domain/src/canonical/identityAdministration.ts:330-360"]
  },
  {
    "id": "people.clients.error_and_refresh",
    "tab": "people",
    "screen": "Clients surface (global behaviour)",
    "capability": "Canonical error mapping + automatic refresh on stale revision; success notice",
    "entryPoint": "AdminClientDirectory.runAttempt + error/notice paragraphs",
    "userAction": "Any mutation",
    "states": ["stale -> 'data was stale and refreshed' + reads.refresh() + participantRead.refresh()", "forbidden -> 'Administrator permission required.'", "other -> server message or 'The operation failed.'", "success -> 'Saved.'"],
    "commandOrReadModel": "toCanonicalCommandClientError(caught,'admin_clients') over command results",
    "currentResult": "Single inline error paragraph (role=alert) + inline notice paragraph; post-command refresh of both reads",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminClientDirectory.tsx:163-194,236-241", "src/lib/canonical/mapCanonicalCommandError.ts"]
  },
  {
    "id": "people.instructors.directory.list",
    "tab": "people",
    "screen": "Instructors directory (section id admin_instructors)",
    "capability": "Paginated canonical instructor-catalog directory with server-side search",
    "entryPoint": "AdminPanel people tab -> section id=admin_instructors -> AdminPeopleSection surface=instructors -> AdminInstructorDirectory",
    "userAction": "Type in the search box (1000ms debounce), click 'Load more' or row 'Open'",
    "states": ["loading", "emptyDirectory", "emptySearch", "read-failed+retry", "permission-denied", "hasMore/loadMore", "selectedRowHighlight"],
    "commandOrReadModel": "readModel admin_instructor_list via queryAdminIdentityReadModels (pageSize 20, cursor)",
    "currentResult": "6-column table: Instructor | Specialty | Rate (KZT, ru-RU grouping) | Availability | Account | Actions(Open)",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminInstructorDirectory.tsx:153-160,390-516", "src/features/admin/people/AdminInstructorList.tsx:28-81", "src/features/admin/people/adminInstructorContracts.ts:12,20-31"]
  },
  {
    "id": "people.instructors.detail.commitments",
    "tab": "people",
    "screen": "Instructors detail aside",
    "capability": "Show linked Account, Account lifecycle, future lessons, future course days, active availability blocks, and block reasons",
    "entryPoint": "AdminInstructorDetail account + commitments sections",
    "userAction": "Open an instructor",
    "states": ["accountNotLinked", "account lifecycle active/disabled/uninitialized", "unlinkBlocked/deleteBlocked status line", "deleteBlockedReason === 'availability_cleanup_required' shows a generic failure line"],
    "commandOrReadModel": "readModel admin_instructor_detail (AdminInstructorDetailReadModel)",
    "currentResult": "Account name + lifecycle; three counters; a block notice; 'Instructor is unavailable.' when the detail cannot load",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminInstructorDetail.tsx:138-172", "src/features/admin/people/adminInstructorContracts.ts:33-61", "packages/shared-domain/src/canonical/identityAdministration.ts:182-301"]
  },
  {
    "id": "people.instructors.profile.edit",
    "tab": "people",
    "screen": "Instructors detail -> Edit profile panel",
    "capability": "Edit every catalog profile field: name, specialty(ski/snowboard/both), rate KZT/hr, spoken languages (ru/en/de/fr/it/es checkboxes), experience years, phone, bioRu, bioEn, avatar URL",
    "entryPoint": "AdminInstructorDetail 'Edit profile' -> AdminInstructorProfileEditor (submitLabel = Save profile)",
    "userAction": "Edit fields, optionally upload a photo, click 'Save profile' or 'Cancel'",
    "states": ["pending", "stale", "forbidden", "nameRequired", "priceRequired", "uploading (submit disabled)", "cancel re-hydrates draft from detail"],
    "commandOrReadModel": "command update_instructor_catalog_profile (reason 'Admin instructor directory profile update'; expectedRevision falls back to detail.revision, so revision 0 is preserved)",
    "currentResult": "Catalog profile updated; bioRu also mirrors into legacy 'bio'; revision comes from the refreshed read model for the next save",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminInstructorProfileEditor.tsx:35-247", "src/features/admin/people/AdminInstructorDirectory.tsx:317-351", "src/features/admin/people/adminInstructorContracts.ts:63-144", "packages/shared-domain/src/canonical/instructorSpokenLanguage.ts:3"]
  },
  {
    "id": "people.instructors.photo.upload",
    "tab": "people",
    "screen": "Instructors profile editor -> avatar",
    "capability": "Upload a center-cropped 400x400 JPEG(0.8) instructor photo to Firebase Storage and set the returned URL into the profile draft",
    "entryPoint": "AdminInstructorProfileEditor file input -> AdminInstructorDirectory.handleUploadPhoto",
    "userAction": "Pick an image file (accept=image/*); preview appears; save is required to persist the URL",
    "states": ["uploading (button label 'Uploading photoвЂ¦', submit disabled)", "error -> text.mutationFailed", "preview img 64x64", "manual avatarUrl text field remains available"],
    "commandOrReadModel": "direct Firebase Storage uploadImage() at instructorAssetStoragePath(LIVE_CANONICAL_EXECUTION_SCOPE, instructorId) вЂ” no Firestore command",
    "currentResult": "URL lands in the draft only; an abandoned form leaves an orphan Storage object",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminInstructorDirectory.tsx:55-103,253-268,453-461,594-596", "src/features/admin/people/AdminInstructorProfileEditor.tsx:208-230", "src/infrastructure/firebase/storage.ts:5-9", "packages/shared-domain/src/canonical/testStoragePaths.ts:127-139"]
  },
  {
    "id": "people.instructors.create",
    "tab": "people",
    "screen": "Instructors -> Add instructor panel",
    "capability": "Create an instructor catalog entry linked to an existing active, not-yet-linked Account",
    "entryPoint": "AdminInstructorDirectory 'Add instructor' -> account picker + AdminInstructorProfileEditor (submitLabel = Create instructor)",
    "userAction": "Pick an account (name auto-fills if blank), fill profile, click 'Create instructor'",
    "states": ["accountRequired", "nameRequired", "priceRequired", "pending", "stale", "forbidden", "picker emptyAccounts / unavailable-for-link list / Load more"],
    "commandOrReadModel": "command create_instructor_catalog_entry with accountId and expectedRevision = picked account revision (reason 'Admin instructor directory create')",
    "currentResult": "Instructor created, auto-selected in the detail pane, draft reset; a new instructorId becomes the active selection",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminInstructorDirectory.tsx:270-315,404-464", "src/features/admin/people/AdminInstructorAccountPicker.tsx:36-132", "src/features/admin/people/adminInstructorContracts.ts:13"]
  },
  {
    "id": "people.instructors.lifecycle.pause_resume",
    "tab": "people",
    "screen": "Instructors detail action bar",
    "capability": "Pause/resume new bookings (isAvailable) with commitment-aware confirmation wording",
    "entryPoint": "AdminInstructorDetail 'Pause new bookings' / 'Resume new bookings'",
    "userAction": "Click Pause (window.confirm, wording depends on future commitments) or Resume (no confirm)",
    "states": ["confirmPause", "confirmPauseWithFuture (+ inline reminder paragraph)", "pending", "stale", "forbidden", "reactivate blocked when linked Account disabled (server)"],
    "commandOrReadModel": "commands deactivate_instructor_catalog / reactivate_instructor_catalog (reason 'Admin instructor directory lifecycle update')",
    "currentResult": "Availability toggled; existing commitments are preserved",
    "destructive": true,
    "sourceFiles": ["src/features/admin/people/AdminInstructorDirectory.tsx:597-630", "src/features/admin/people/AdminInstructorDetail.tsx:186-205,301-305", "packages/shared-domain/src/canonical/identityAdministration.ts:182-186"]
  },
  {
    "id": "people.instructors.link_unlink_account",
    "tab": "people",
    "screen": "Instructors detail -> link panel / action bar",
    "capability": "Link the instructor catalog entry to an Account, or unlink it (stop being an instructor)",
    "entryPoint": "AdminInstructorDetail 'Link account' -> account picker; 'Stop being instructor' in the action bar",
    "userAction": "Pick an account (link commits immediately) or click Stop being instructor (window.confirm)",
    "states": ["linking panel + cancel", "unlinkBlockedByCommitments (button disabled + pre-guard error)", "confirmStopBeingInstructor", "pending", "stale", "forbidden", "picker already-linked accounts hidden"],
    "commandOrReadModel": "commands link_account_instructor_catalog (reason 'Admin instructor directory account link') / unlink_account_instructor_catalog (reason 'Admin instructor directory account unlink')",
    "currentResult": "Accountв†”instructor link created/removed; existing commitments are not deleted; unlink refused while future lessons/course days exist",
    "destructive": true,
    "sourceFiles": ["src/features/admin/people/AdminInstructorDirectory.tsx:353-388,631-662", "src/features/admin/people/AdminInstructorDetail.tsx:206-235,324-335", "packages/shared-domain/src/canonical/identityAdministration.ts:200-246"]
  },
  {
    "id": "people.instructors.delete",
    "tab": "people",
    "screen": "Instructors detail -> red delete zone",
    "capability": "Irreversible hard delete of the instructor catalog entry (Account and past lesson history retained)",
    "entryPoint": "AdminInstructorDetail red zone -> 'Delete instructor' -> typed confirmation -> 'Delete permanently'",
    "userAction": "Click Delete, then type DELETE (or РЈР”РђР›РРўР¬) or the exact instructor name, then confirm",
    "states": ["armed (deleteConfirming)", "typed confirm required (deleteConfirmMatches)", "deleteBlockedByCommitments pre-guard -> 'Transfer or cancel future lessons and course days first.'", "conflict error -> text.deleteBlocked", "success closes the detail pane and refreshes account reads"],
    "commandOrReadModel": "command delete_instructor_catalog_entry (reason 'Admin instructor directory hard delete'; effect resource_claim_changed)",
    "currentResult": "Catalog entry deleted; linked Account and completed history preserved",
    "destructive": true,
    "sourceFiles": ["src/features/admin/people/AdminInstructorDetail.tsx:99-103,245-299", "src/features/admin/people/AdminInstructorDirectory.tsx:663-688", "packages/shared-domain/src/canonical/auditEffectRegistry.ts:205", "packages/shared-domain/src/canonical/identityAdministration.ts:245-301"]
  },
  {
    "id": "people.instructors.cross_navigation",
    "tab": "people",
    "screen": "Instructors detail action bar",
    "capability": "Jump to the linked client in People, or to today's Operations planner",
    "entryPoint": "AdminInstructorDetail 'Open client' / 'Open planner'",
    "userAction": "Click the button",
    "states": ["Open client hidden when no linkedAccountId", "planner always shown", "accountId must parse as AccountId or the navigation is skipped"],
    "commandOrReadModel": "adminClientAccountSearchParams / adminPlannerSearchParams (instructorId is reserved but unused today)",
    "currentResult": "navigates to ?tab=people&clientAccount=<id> or ?tab=operations&plannerDate=<today YYYY-MM-DD>",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminInstructorDirectory.tsx:689-707", "src/features/admin/people/AdminInstructorDetail.tsx:226-241", "src/features/admin/adminNavigation.ts:105-134", "src/features/admin/components/schedule/scheduleUtils.ts"]
  },
  {
    "id": "people.roles.list",
    "tab": "people",
    "screen": "Admins/Roles (section id admin_roles)",
    "capability": "List current administrators (Accounts filtered to role=admin) with Owner and Instructor badges, lifecycle, and open-client links",
    "entryPoint": "AdminPanel people tab -> section id=admin_roles -> AdminPeopleSection surface=admins -> AdminRoleDirectory -> AdminRoleList",
    "userAction": "Scroll, click 'Load more' or row 'Open client'",
    "states": ["loading", "noAdministrators", "read-failed+retry", "permission-denied", "hasMore/loadMore", "ownerBadge", "instructorBadge"],
    "commandOrReadModel": "readModel admin_account_list with server role='admin' filter (pageSize 20) + admin_account_detail of the actor's own account",
    "currentResult": "max-h-[360px] scrollable card list; name + Owner/Instructor badges + email + 'Administrator' + lifecycle label; 'Open client' per row",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminRoleDirectory.tsx:31-43,71-79,203-218", "src/features/admin/people/AdminRoleList.tsx:18-131", "src/features/admin/people/adminRoleContracts.ts:3,7-18"]
  },
  {
    "id": "people.roles.promote",
    "tab": "people",
    "screen": "Roles -> Add administrator picker",
    "capability": "Grant admin role to an eligible Account (server-authorized, owner-oriented)",
    "entryPoint": "AdminRoleDirectory 'Add administrator' -> AdminRoleAccountPicker -> shared onRequestConfirm modal -> change_account_role(role='admin')",
    "userAction": "Search, pick an eligible account, click 'Make administrator', then Confirm in the portal modal",
    "states": ["ownerOnlyMutations banner hides the whole Add flow for non-authorized actors", "emptyCandidates", "unavailableForPromote list (inactive / already admin / owner / no revision / unauthorized)", "selection cleared on search change", "confirm disabled until a selectable row is chosen", "pending", "stale", "mutationFailed"],
    "commandOrReadModel": "command change_account_role role='admin' (expectedRevision from changeAccountRoleAuthorizedAction; key admin_role:promote:<entropy>; reason 'Admin role directory promote administrator')",
    "currentResult": "Target Account becomes an administrator and appears in the current-administrators list",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/AdminRoleDirectory.tsx:143-161", "src/features/admin/people/AdminRoleAccountPicker.tsx:35-155", "packages/shared-domain/src/canonical/identityAdministration.ts:114-156,398-402", "src/features/admin/components/AdminPanel.tsx:462-497"]
  },
  {
    "id": "people.roles.demote",
    "tab": "people",
    "screen": "Roles -> current administrators list",
    "capability": "Revoke admin role (admin -> user); owner rows are never demotable",
    "entryPoint": "AdminRoleList 'Remove administrator rights' -> onRequestConfirm modal -> change_account_role(role='user')",
    "userAction": "Click revoke, then Confirm in the portal modal",
    "states": ["button hidden unless canDemoteCanonicalAccountAdminRole (not owner, authorizedActions has change_account_role)", "pending disables the button", "stale", "mutationFailed (raw server message; no forbidden->permissionDenied mapping)"],
    "commandOrReadModel": "command change_account_role role='user' (key admin_role:demote:<entropy>; reason 'Admin role directory revoke administrator')",
    "currentResult": "Account loses administrator rights; owner is protected and self-demotion is rejected server-side",
    "destructive": true,
    "sourceFiles": ["src/features/admin/people/AdminRoleDirectory.tsx:103-148", "src/features/admin/people/AdminRoleList.tsx:58-113", "packages/shared-domain/src/canonical/identityAdministration.ts:114-131,159-167"]
  },
  {
    "id": "people.identity.provisioning_and_resolution",
    "tab": "people",
    "screen": "Clients + Instructors (canonical identity provisioning)",
    "capability": "Create/link/unlink the canonical Participantв†”Account topology from the admin UI: self participant, dependent participant, instructor Account link",
    "entryPoint": "Clients participant section; Instructors account link/unlink",
    "userAction": "See people.clients.participants.provision_self / add_dependent and people.instructors.link_unlink_account",
    "states": ["IDs generated client-side via canonicalDeterministicHash + participantManagementIdFromGuestLink", "idempotency keys admin_clients:<action>:<subject>:<entropy>", "revision from authorizedActions; provision_self sends no expectedRevision", "no global participant directory exists in the live People tab"],
    "commandOrReadModel": "create_managed_dependent_participant, provision_self_participant_for_account, link/unlink_account_instructor_catalog via executeAdminIdentityAttempt -> callable executeCanonicalCommand",
    "currentResult": "Identity graph repaired/extended; effects participant_access_changed + outbox_obligation_created; NO wallet/starter-credit effect from any People command",
    "destructive": false,
    "sourceFiles": ["src/features/admin/identity/useAdminIdentityCommands.ts:29-300", "src/features/admin/identity/identityContracts.ts:18-106", "src/features/admin/people/AdminClientDirectory.tsx:544-581", "src/features/admin/people/AdminInstructorDirectory.tsx:353-384,641-662", "packages/shared-domain/src/canonical/auditEffectRegistry.ts:176-209"]
  },
  {
    "id": "people.identity.realtime_refresh",
    "tab": "people",
    "screen": "All three People surfaces (invisible infrastructure)",
    "capability": "Cross-client freshness: Firestore revision doc + in-process command-result signal refresh all People lists/details",
    "entryPoint": "useAdminIdentityReadModels(realtime:true) / useAdminParticipantDetail({realtime:true}) -> useAdminPeopleRevisionRefresh -> adminPeopleRevisionCoordinator",
    "userAction": "Any admin action anywhere in the product (including other tabs)",
    "states": ["subscribe on first listener, unsubscribe when the last listener leaves", "lastNotifiedRevision tracked separately from lastRevision", "unknown command payloads ignored (safeParse)", "non-realtime hooks (useAdminEligibleParticipants) do not subscribe"],
    "commandOrReadModel": "Firestore doc admin_runtime/admin_people (AdminPeopleRevisionDocumentSchema) + payload.adminPeopleRevision on every command result",
    "currentResult": "Lists and details re-query without a manual refresh button; CanonicalIdentityManager's Refresh button was the only manual one and it is dead code",
    "destructive": false,
    "sourceFiles": ["src/features/admin/identity/adminPeopleRevisionCoordinator.ts:1-69", "src/features/admin/identity/subscribeAdminPeopleRevision.ts:8-17", "src/features/admin/identity/adminPeopleLocalSync.ts:4-13", "src/features/admin/identity/useAdminPeopleRevisionRefresh.ts:4-13", "src/features/admin/identity/useAdminIdentityReadModels.ts:220-225,292-297", "packages/shared-domain/src/canonical/adminPeopleRevision.ts:1-26", "src/lib/admin/subscribeAdminRealtimeRevision.ts:22"]
  },
  {
    "id": "people.legacy.compat_reexports",
    "tab": "people",
    "screen": "Compatibility barrel (not a UI surface)",
    "capability": "Legacy import paths AdminRoleManager and ClientsManager still resolve to the canonical People surfaces",
    "entryPoint": "src/features/admin/components/users/{AdminRoleManager,ClientsManager}.tsx -> people/{AdminRoleDirectory,AdminClientDirectory}",
    "userAction": "none (no runtime consumer)",
    "states": ["DEAD as UI: no src/ file imports AdminRoleManager or ClientsManager; only src/features/admin/index.ts:18 re-exports them, and no consumer imports them from there (only FALLBACK_SLIDES and loadAdminPanel are consumed)"],
    "commandOrReadModel": "n/a (pure re-export alias)",
    "currentResult": "No user-visible capability; safe to drop from a rebuilt People tab without capability loss, but it is a live public barrel entry point of the admin feature",
    "destructive": false,
    "sourceFiles": ["src/features/admin/components/users/AdminRoleManager.tsx:1-2", "src/features/admin/components/users/ClientsManager.tsx:1", "src/features/admin/components/users/index.ts:1-2", "src/features/admin/index.ts:18", "tests/unit/adminUxParity.test.ts:479-503"]
  },
  {
    "id": "people.identity.debug_console.dead",
    "tab": "people",
    "screen": "CanonicalIdentityManager (never mounted)",
    "capability": "Reference console for the full identity command set: participants directory, diagnostics, management assign/revoke, catalog CRUD, repair owner guard",
    "entryPoint": "src/features/admin/identity/CanonicalIdentityManager.tsx (exported from identity/index.ts, imported by nothing)",
    "userAction": "none (unreachable)",
    "states": ["DEAD вЂ” four tests assert AdminPanel.tsx must NOT contain 'CanonicalIdentityManager' (adminClientIdentityBoundary.test.ts:21, adminInstructorIdentityBoundary.test.ts:28, adminRoleIdentityBoundary.test.ts:29, adminUxParity.test.ts:427)"],
    "commandOrReadModel": "assign_participant_management_as_administrator, revoke_participant_management, repair_participant_management_owner_guard, admin_participant_list/detail вЂ” command branches and read scopes exist in production code with no other UI caller",
    "currentResult": "Zero user-facing capability today. MUST NOT be re-mounted into People; if the rebuild needs these three commands it must add a boundary-compliant UI, not this console",
    "destructive": false,
    "sourceFiles": ["src/features/admin/identity/CanonicalIdentityManager.tsx:1-825", "src/features/admin/identity/index.ts:1", "src/features/admin/identity/useAdminIdentityCommands.ts:115-149,185-198", "src/features/admin/identity/useAdminIdentityReadModels.ts:99-101,179-192"]
  },
  {
    "id": "people.clients_and_instructors.test_only_helpers",
    "tab": "people",
    "screen": "Legacy adapters (no UI)",
    "capability": "Legacy UserProfile/Instructor merge + local booking-occupancy helpers kept alive only by parity tests",
    "entryPoint": "src/features/admin/people/adminPeopleMapping.ts, adminPeopleOccupancy.ts (imported only by tests/unit/adminUxParity.test.ts:13,24)",
    "userAction": "none",
    "states": ["TEST_ONLY / legacy residue; boundary tests assert the live People surfaces must not contain mergeAdminClientDirectory / mergeAdminInstructorDirectory"],
    "commandOrReadModel": "n/a (pure client-side mapping on legacy Booking/UserProfile types with legacy statuses pending|confirmed|pending_cancellation)",
    "currentResult": "No capability. Occupancy is authoritative server-side (admin_instructor_detail); do not re-introduce client-side occupancy logic in the rebuild",
    "destructive": false,
    "sourceFiles": ["src/features/admin/people/adminPeopleMapping.ts:1-93", "src/features/admin/people/adminPeopleOccupancy.ts:1-25", "tests/unit/adminUxParity.test.ts:13,24,486-488"]
  },
  {
    "id": "people.managed_participant_picker",
    "tab": "people (adjacent вЂ” NOT mounted in People)",
    "screen": "Lesson Booking / Course Enrollment / Planner slot modal",
    "capability": "Account search + eligible-Participant selection with self auto-select and ready-gating for provisioning",
    "entryPoint": "AdminManagedParticipantPicker (imported by course-enrollments, training-records, lesson-bookings, slot-modal вЂ” never by People)",
    "userAction": "Search an Account, pick a Participant",
    "states": ["loading option", "noEligible", "directoryError + retry", "Load more", "auto-select unique self hides the participant field", "ready when selection exists or (autoSelectUniqueSelf and zero eligible -> caller may provision self)"],
    "commandOrReadModel": "readModels admin_account_list (active|uninitialized only) + admin_eligible_participants; separate managedParticipantPickerReadModel with anti-spoofing guards",
    "currentResult": "Selection {accountId, participantId, displayName, accountDisplayName?}; no mutations",
    "destructive": false,
    "sourceFiles": ["src/features/admin/identity/AdminManagedParticipantPicker.tsx:1-316", "src/features/admin/identity/accountDirectorySearch.ts:9-137", "src/features/admin/identity/useAdminIdentityReadModels.ts:302-333", "src/features/admin/identity/identityContracts.ts:110-115", "packages/shared-domain/src/canonical/readModels/managedParticipantPickerReadModel.ts:1-102"]
  }
]
```
Count: **31 capability entries**.

---

## 10. UNVERIFIABLE / OUT-OF-SCOPE ITEMS

1. **Runtime behaviour вЂ” never executed.** Read-only audit; no dev server, no tests, no emulator, no deploy. All statements are from source. `AUTHENTICATED WORKFLOW: NOT VERIFIED`.
2. **Server-side enforcement details** in `functions/src/canonical/participantAccess/*` and `functions/src/canonical/readModels/adminIdentityReadModels.ts` were **not** read in full. I confirmed via grep: no `grant_starter_credit`/wallet write in the self-provisioning handler; bounded scans (`limit(33)`, `INSTRUCTOR_*_SCAN_LIMIT`) exist. The exact `authorizedActions` computation per command is unverified from source.
3. **`authorizedActions` computation is server-owned and unverified.** Every UI button in this tab is gated on it. The cap of **8** actions per item (`adminIdentityReadModel.ts:60,85,135`) is a real risk: if a server ever advertises > 8 relevant actions for one entity, buttons would silently disappear. Not observable from the client source.
4. **Starter-credit question is answered only negatively.** I confirmed no People-tab command has a `wallet_balance_changed` effect and that `provision_self_participant_for_account` performs no wallet write. I did **not** trace the full sign-up bootstrap chain, so "the gift is granted exactly once at registration" is inferred from `ensureCanonicalSelfParticipant` + `grant_starter_credit`'s own idempotency marker (`users/<accountId>/wallet/starter_credit_grant`, `functions/src/canonical/finance/starterCreditCommands.ts:45-46`), not verified end-to-end.
5. **Admin approval / who can see People at all.** `AdminRouteContainer.tsx` and the route guard were not read. Permission-denied handling is per-read/command, but I did not verify the top-level route guard or which system roles can reach the tab.
6. **Firestore rules** for `admin_runtime/admin_people`, `admin_account_list` reads, and Storage writes under `instructorAssetStoragePath` were not read. Instructor avatar upload is a **direct client Storage write** (no canonical command); whether the current rules allow it in all environments is unverified.
7. **`useAdminWalletReadModel` options** (`requestedTestSessionId`, `viewerAccountId`) are **not** passed by `AdminClientDirectory` (`:147`). Whether the People wallet summary is correct inside a TestSession context is unverified.
8. **Deep-link section auto-open** relies on `AdminCollapsibleSection`'s `forceOpen`/`forceOpenToken` props; I did not read that component, so the exact animation/scroll behaviour after a `clientAccount` deep link is unverified.
9. **`text.confirmLink`, `text.accountAlreadyLinked`, `text.deleteInstructorConfirmTitle`, `text.wallet`, `text.relationship`, `text.price`** are defined in the translation hooks but appear unused in the current components. Dead strings, not capabilities вЂ” noted in case the rebuild treats them as evidence of removed features.
10. **Cross-tab surface assumed, not verified:** I did not audit Operations/Finance/Product/System tabs beyond the two handoff functions the People tab calls (`adminFinanceAccountSearchParams`, `adminPlannerSearchParams`, `adminClientAccountSearchParams`).
11. **Legacy barrels (`AdminRoleManager`, `ClientsManager`)** are classified DEAD-as-UI from an import grep of `src/`. TypeScript path aliases or dynamic imports outside `src/` were not considered; the only other matches were `docs/` and one-shot `scripts/*.mjs` generators.
12. **The `docs/T32_CANONICAL_ADMIN_AUDIT.md` tables quoted above** are historical migration notes, not current behaviour; I used them only as a pointer to the legacy capabilities that were deliberately removed.


---

_tmp-product-system.md

# ADMIN в†’ PRODUCT TAB + SYSTEM TAB вЂ” Capability-Preservation Audit

Repo: `D:\SkiAcademy_DB` (React/Vite/Firebase "Carve Academy", RU+EN, KZT)
Scope: `src/features/admin/**` (Product + System tabs) plus dependency traces into
`src/app/routes/AdminRouteContainer.tsx`, `src/features/settings/**`, `src/domain/**`,
`packages/shared-domain/src/canonical/**`, `functions/src/canonical/**`.
Read-only. No file in `src/` was modified. (This report file itself is the only artifact written,
at the parent agent's explicit instruction.)

---

## 0. HEADLINE FINDINGS (read first)

1. **`CanonicalCoursesManager` is authoritative. The legacy `CoursesManager.tsx` is DEAD at the
   admin barrel** вЂ” `src/features/admin/components/courses/index.ts:1` exports
   `CanonicalCoursesManager as CoursesManager`, and `AdminPanel.tsx:103-107` lazy-imports
   `m.CoursesManager` from that barrel. `components/courses/CoursesManager.tsx` (146 lines) is
   never imported by the barrel. Rebuilding from the legacy file would **lose the entire canonical
   Course surface** (CourseDays, enrollment counts, archive/reactivate, revision OCC, planner
   availability checks).
2. **Additional-participant pricing is NOT hard-coded in the admin UI.** It is a canonical
   aggregate at Firestore `lesson_pricing_settings/lesson_booking`, edited only in
   `CanonicalLessonPricingSettings` (Product tab). See В§5. Three real risks exist but none is a
   hard-coded UI price constant; details and severity in В§5.4.
3. **There is NO Promotions feature and NO admin translation/content editor.** Both greps returned
   only unrelated hits (В§10). Nothing to preserve in those two areas because nothing exists.
4. **`ResortConfigForm` is mounted only inside `AdminProductSettings`** (Product tab), via direct
   import of `ResortDataSection` / `ResortSliderSection` вЂ” *not* via the `ResortConfigForm`
   component. `ResortConfigForm` itself is exported but unused by AdminPanel (В§10.3).
5. Three background subagents I dispatched to chunk-read the 3245-line manager **all failed**; I read
   the entire file myself. Coverage is complete, not partial.

---

## 1. COURSES вЂ” FULL CRUD SURFACE

### 1.1 Two managers, one authoritative

| | Legacy `CoursesManager.tsx` | `CanonicalCoursesManager.tsx` |
|---|---|---|
| Size | 146 lines | 3329 lines (146 KB) |
| Exported as | `CoursesManager` (own file) | `CoursesManager` via barrel `components/courses/index.ts:1` |
| Reached by AdminPanel | **NO** | **YES** (`AdminPanel.tsx:103-107`, mounted `:408-417`) |
| Data authority | legacy `courses` Firestore docs | canonical `admin_course_list` v2 / `admin_course_detail` read models |
| Write path | `onAddCourse` / `onUpdateCourse` / `onDeleteCourse` props (legacy service) | `executeAuthenticatedCanonicalCommand` (canonical commands) |
| Archiving | `onDeleteCourse` (hard delete intent) | `archive_course` / `reactivate_course` commands |
| CourseDays | none (only marketing `program[]` text array) | full `CanonicalCourseDaysEditor` |
| Capacity | direct `totalSeats`/`availableSeats` write | `change_course_capacity` command, range 1..64 |
| Availability check | none | per-day planner availability gate |
| Legacy guard | `isCanonicalCourseProtectedFromLegacyAdminWrites` (`useCourseForm.ts:255-268`) | n/a |

**Verdict: legacy file is orphaned.** It is retained only as reference/dead code. Its whole
`form/` folder is *partially* reused by the canonical manager вЂ” only
`form/CoursesManagerToolbar.tsx` is imported (`CanonicalCoursesManager.tsx:40`).
`form/useCourseForm.ts`, `form/CourseForm.tsx`, `form/CourseBasicInfoSection.tsx`,
`form/CourseRichDetailsSection.tsx`, `form/CourseInstructorSelection.tsx`,
`form/CourseTranslationsSection.tsx`, `form/CoursesTable.tsx`, `form/CourseTableRow.tsx` are
**only reachable from the dead legacy tree**.

### 1.2 Canonical Course fields (authoritative set)

`CreateFormState = CanonicalCourseCreateFormState` вЂ” `adminCourseCloneDraft.ts:10-40`,
`EMPTY_CREATE_FORM` вЂ” `CanonicalCoursesManager.tsx:372-402`.

| Field | Required on create | Validation | Edit form id |
|---|---|---|---|
| `title` | YES (`:1130`) | non-empty; в‰¤200 chars (`:1096`) | `course-edit-title` |
| `titleRu` | no (marked "Optional" `:2350`) | в‰¤200 chars (`:1115`) | `course-edit-title-ru` |
| `price` | YES (`:1133`) | integer в‰Ґ0; input `min=0 step=1` (`:2340`); edit revalidates `:1442` | `course-edit-price` |
| `totalSeats` | YES (`:1136`) | integer 1..64 (`:1170`); input `min=1 max=64` (`:2339`) | `course-edit-capacity` |
| `timeZone` | YES (`:1139`) | `IanaTimeZoneSchema` (`:1141`); default `Asia/Almaty` | (not in edit form) |
| `roster` | YES (`:1154`) | 1..16 instructor ids (`:1161`) | `course-instructors` fieldset checkboxes |
| `days` | YES | see В§3 | В§3 |
| `duration` | derived | auto `courseDurationSummary()` (`:287-306`) | in `<details>` presentation |
| `description` | вЂ” | в‰¤10 000 chars (`:1119`) | `course-edit-description` |
| `dates` | derived | auto `courseDayDateSummary()` (`:272-285`) | in `<details>` |
| `bgImageUrl` | YES (`:1174`) | `isValidCourseImageUrl` в†’ `new URL()` (`:363-370`) | `type=url` + uploader `:2958-2964` |
| `isHidden` | no | boolean | `course-edit-hidden` |
| `order` | no | `min=0 max=10000` (`:2739`); edit `min=0` | `course-edit-order` |
| `shortDescription` / `shortDescriptionRu` | no | вЂ” | `course-edit-short-en/ru` |
| `detailedDescription` / `detailedDescriptionRu` | no | вЂ” | `course-edit-detail-en/ru` |
| `badge` / `badgeRu` | no | вЂ” | `course-edit-badge-en/ru` |
| `level` | no | `''|beginner|intermediate|advanced|expert` | `course-edit-level` select |
| `levelLabel` | no | вЂ” | `course-edit-level-label` |
| `videoUrl` | no | вЂ” | `course-edit-video` |
| `benefits` / `benefitsRu` | no | newline list | textareas |
| `program` / `programRu` | no | `day \| title \| desc` lines | textareas |
| `faq` / `faqRu` | no | `q \| a` lines | textareas |
| `galleryPhotos` | no | one URL per line | textarea |

### 1.3 Create form structure (Product в†’ courses_manager)

`CanonicalCoursesManager.tsx:2270-2776`:
- Sticky header (`:2277-2289`) вЂ” title = `text.create` / `text.createClone`, X closes.
- **Basic information** group (`:2308-2355`): `title`, `titleRu`, `price`, `totalSeats`, `timeZone`, `bgImageUrl` driven by a `[['title','text'],['titleRu','text'],['price','number'],['totalSeats','number'],['timeZone','text'],['bgImageUrl','url']]` table (`:2310-2315`). `*` marker on all but `titleRu` (`:2321-2326`).
- **Instructors** fieldset (`:2356-2407`) вЂ” checkbox list from `useAdminIdentityReadModels({directory:'instructors', pageSize:50})`; unavailable instructors suffixed `text.unavailableInstructor` (`:2397`).
- **Course days** fieldset (`:2408-2630`) вЂ” see В§3.
- **Presentation / catalog** `<details>` (`:2631-2757`), summary `text.presentation` вЂ” `description` textarea + 15 more fields (`:2656-2673`), `level` select, `order` number, `isHidden` checkbox "Hide from public catalog".
- Sticky submit (`:2764-2775`) вЂ” label `text.create` or `text.createClone`.
- Validation issue list rendered as `role="alert"` `<ul>` (`:2291-2304`); auto-opens presentation `<details>` and focuses the first bad field (`:1024-1053`).
- Zod `ZodError` from `CourseProvisioningManifestSchema.parse` is mapped per-path into localized issues (`:1054-1126`, caught `:1406-1410`).

### 1.4 Edit form (`saveStructuredEdit`, `:1426-1539`)

Sequential command chain, each step re-reading authoritative detail so a later failure does not
re-queue persisted commands (`:1461-1464`):
1. `change_course_title` (`:1469`)
2. `change_course_price` (`:1478`)
3. `change_course_capacity` (`:1487`)
4. `remove_course_roster_instructor` for each removed id (`:1502`)
5. `add_course_roster_instructor` for each added id (`:1514`)
6. `update_course_catalog_content` only when `catalogContentInputsEqual` is false (`:1522-1531`)

Guards before submit: `editReason.trim()` non-empty (`:1430-1435`); `totalSeats` integer 1..64
(`:1438`); `price` integer в‰Ґ0 (`:1442`). Every step looks up its own `authorizedActions` entry and
shows `text.permissionDenied` if absent (`:1451-1455`).

### 1.5 Legacy `form/` sections (dead code, but list them for parity)

- `CourseBasicInfoSection.tsx` вЂ” title EN/RU, duration, `CourseDateRangePicker`, level select
  (`''|beginner|intermediate|advanced|expert`), totalSeats `min=1 required`, priceKZT `min=0 required`
  (writing also mirrors into legacy `price`), `CourseBackgroundImageField`.
- `CourseTranslationsSection.tsx` вЂ” badge/badgeRu, shortDescription EN/RU, detailedDescription EN/RU.
- `CourseInstructorSelection.tsx` вЂ” **max 2 instructors** (`:35-40`, replaces `[prev[1], ins.id]`),
  avatar + specialty chips.
- `CourseRichDetailsSection.tsx` вЂ” videoUrl, benefits EN/RU (newline), program days EN/RU
  (Add/Remove day buttons), FAQ 1вЂ“3 EN/RU, galleryPhotos.
- `useCourseForm.ts` вЂ” required: title, titleRu, duration, dates (`:213-221`); instructors 1..2
  (`:223-226`); legacy-write guard on edit (`:255-268`); recomputes `availableSeats` preserving
  occupancy on capacity change (`:133-139`).
- Hard-coded legacy defaults: `courseTotalSeats = 10`, `coursePrice = 199`, `coursePriceKZT = 99500`
  (`useCourseForm.ts:57-59`), fallback bg image Unsplash URL (`:175-177`), new-course fallback
  `totalSeats||5`, `price||150` (`:171-173`).

---

## 2. CANONICAL COURSES вЂ” what it actually manages

### 2.1 Reads

| Read | Where | Notes |
|---|---|---|
| `queryAdminCourseReadModels({scope:'admin_course_list', pageSize: ADMIN_COURSE_READ_MODEL_PAGE_SIZE_MAX, readModelVersion: 2, lifecycle, cursor?})` | `:525-531` | one bounded page; comment at `:524` "Never drain either Course list or enrollment rosters" |
| `queryAdminCourseReadModels({scope:'admin_course_detail', courseId})` | `:572-575` | full `AdminCourseReadModel` |
| `queryAdminPlannerReadModels({scope:'admin_planner', localDate, view:'day', timeZone, windowDays})` | `:646-652` | windowed в‰¤60-day chunks (`plannerDateWindows` `:232-256`) |
| `useAdminIdentityReadModels({directory:'instructors', pageSize:50})` | `:504-509` | enabled only when `showCreate \|\| selectedCourseId` |

### 2.2 Writes (all via `execute()`, `:726-834`)

Command kinds issued by the manager:
`apply_canonical_course_provisioning_manifest` (`:1399`), `change_course_title` (`:1469`),
`change_course_price` (`:1478`), `change_course_capacity` (`:1487`),
`add_course_roster_instructor` (`:1514`), `remove_course_roster_instructor` (`:1502`),
`update_course_catalog_content` (`:1526`, `:1776`, `:1802`),
`archive_course` (`:867`/`:953`), `reactivate_course` (`:953`),
`create_course_day` (`:1566`, `:1670`), `reschedule_course_day` (`:1608`, `:1718`),
`reassign_course_day_instructor` (`:1634`, `:1691`), `remove_course_day` (`:1733`, `:3262`).

Cross-cutting `execute()` behavior:
- Single-flight guard `commandInFlightRef` (`:735-736`, `:829`).
- `stale_version` в†’ `setStale(true)`, auto `refresh()` + `loadCourseDetail()` (`:753-757`).
- Errors в†’ `commandError(code)` localized banner (`:758-759`); course-day kinds also pin the
  message to the affected `courseDayId` (`:760-768`); provisioning kind sets `createFormError` (`:769-771`).
- `applyAdminCoursesCommandResult` + `applyAdminFinanceCommandResult` (`:774-775`).
- Archive/reactivate optimistically move the row between lifecycle buckets and reset the
  opposite bucket to `EMPTY_COURSE_LIST_STATE` (lazy re-fetch on tab open) (`:776-804`).
- Transport errors normalized via `toCanonicalCommandClientError(caught,'correlation_admin_course_command')` (`:809-812`).

### 2.3 The write path вЂ” `adminCourseCatalogWrite.ts` (48 lines)

- `compactCourseCatalogContentInput(input)` (`:17-38`) вЂ” strips `undefined`/`null`, drops
  `isHidden:false`, trims strings, keeps empty strings only for
  `REQUIRED_STRING_KEYS = {duration, description, dates, bgImageUrl}` (`:6`), drops empty arrays,
  then re-parses through `CourseCatalogContentInputSchema`. Rationale in the doc comment
  (`:8-16`): READ models may expose empty optionals; WRITE must omit them so an untouched Edit is
  not dirty, and so Firebase callable encoding (`undefined == null` в†’ `null`) cannot produce
  schema-invalid `null`.
- `catalogContentInputsEqual(left,right)` (`:40-47`) вЂ” JSON compare of the compacted forms.

### 2.4 Archived path вЂ” `adminCourseArchiveCommand.ts` (75 lines)

- `buildArchiveCourseCommandFromListItem(course, reasonExplanation='Admin course archive')`
  (`:29-51`) вЂ” throws `'Only an active Course can be archived.'` if `lifecycle !== 'active'`
  (`:33-35`); throws `'Course archive is not authorized.'` if no `archive_course` in
  `authorizedActions` (`:37-40`); takes `expectedRevision` **from the authorized action**, not
  from the row's own `revision` field (`:41`).
- `buildReactivateCourseCommandFromListItem(course, reason='Admin course reactivation')`
  (`:54-75`) вЂ” mirror: requires `lifecycle === 'archived'`, requires `reactivate_course` action,
  OCC from the action (`:69`).
- Consumers: `handleArchive` (`:1854-1874`), `handleReactivate` (`:1876-1896`), and the detail-pane
  action buttons (`:3296-3317`, `variant={kind==='archive_course' ? 'danger' : 'secondary'}`).
  Build failures surface as `mutationError` without opening the confirm (`:1860-1863`).

### 2.5 Dead/inactive legacy helpers inside the manager

`runCourseAction` (`:893-960`), `courseDayAction` (`:1649-1744`), `editCatalogContent` (`:1746-1788`)
are defined but explicitly voided at `:1932-1936`:
```
// Kept temporarily as inactive legacy helpers for T32.9B cleanup. All active
// edit and CourseDay controls below use the structured form paths instead.
void runCourseAction; void courseDayAction; void editCatalogContent;
```
They use `window.prompt` for every input. They are **not** reachable from any rendered control вЂ”
verify before deleting, but they carry no capability.

### 2.6 Detail workspace tabs

`courseWorkspaceSections` (`:2019-2030`): `overview`, `schedule`, `instructors`, `participants`,
`enrollment`, `settings`; rendered by `AdminLessonDetailTabs` (`:2822-2833`) with
`idPrefix="admin-course"`, `attentionLabel`. Visibility is CSS-hide via `showWorkspace()` (`:2016-2018`),
so all sections stay mounted вЂ” an easy thing to break in a rebuild.
- `overview` (`:2836-2877`): price KZT, `totalSeats - availableSeats` / `totalSeats` enrollments, duration, catalog state.
- `settings`/`instructors` (`:2890-3227`): the edit form.
- `schedule` (`:3230-3276`): `CanonicalCourseDaysEditor`.
- `enrollment`/`participants` (`:3278-3295`): active/total enrollment counts + "Open enrollments and attendance" button wired to `onOpenEnrollments` в†’ `adminCourseEnrollmentSearchParams` (`AdminPanel.tsx:411-416`).
- Archive/Restore buttons (`:3296-3317`).

### 2.7 Revision/live-refresh plumbing

- `subscribeAdminCoursesRevision.ts` вЂ” onSnapshot of
  `ADMIN_COURSES_REVISION_COLLECTION / ADMIN_COURSES_REVISION_DOCUMENT_ID` via shared
  `subscribeAdminRealtimeRevision`.
- `adminCoursesRevisionCoordinator.ts` вЂ” listener set, `reduceAdminRealtimeRevisionSignal`,
  separate `lastNotifiedRevision` from snapshot baseline (`:8-9`), lazy subscribe/unsubscribe on
  idle, `registerAdminCoursesRevisionFromCommand`, `resetAdminCoursesRevisionCoordinatorForTests`.
- `adminCoursesLocalSync.ts` вЂ” `applyAdminCoursesCommandResult` parses
  `AdminCoursesRevisionPayloadSchema` off the command payload and feeds the coordinator.
- `useAdminCoursesRevisionRefresh(refresh, enabled)` вЂ” ref-stable listener; wired at
  `CanonicalCoursesManager.tsx:600-605` with `enabled=true`, refreshing list **and** open detail.
- `queryAdminCourseReadModels` result `adminCoursesRevision` is **not** the same path as the
  finance one; both `applyAdminCoursesCommandResult` and `applyAdminFinanceCommandResult` run on
  every success (`:774-775`).

---

## 3. COURSE DAYS

### 3.1 Create-mode day grid (`CanonicalCoursesManager.tsx:2408-2630`)

- **Period picker (create mode only, `:2426-2458`)** вЂ” `Period starts` / `Period ends` date
  inputs; `updateCreatePeriod` (`:870-881`) regenerates one row per calendar date via
  `createCourseDayRowsForPeriod` (`:212-230`), capped at **65** (`:223`) and preserving rows whose
  date already exists. Error keys `period`, focus ids `canonical-course-period-start|end`.
- **Per-day row card** (`:2459-2605`): date (clone mode only, `:2500-2514`), `Starts`/`Ends` time
  inputs `step=60` (`:2516-2543`), computed duration line with overnight/full-day hints
  (`:2545-2558`), helper text "If the end time is earlier than the start, the interval continues
  into the next day." (`:2559-2563`), and an **availability-filtered** `Available instructor`
  `<select>` (`:2564-2602`).
- **Add day** (clone mode only, `:2608-2616`) вЂ” disabled at 64. **Remove day** per row
  (`:2490-2498`) вЂ” only when `createCourseDays.length > 1`.
- Live summary line (`:2618-2623`) вЂ” date range + total duration.

### 3.2 Day validation (create)

`createCourse` (`:962-1413`) per row (`:1225-1340`):
- `isValidCalendarDate` (`:338-353`) вЂ” regex `YYYY-MM-DD` + round-trip calendar check.
- `isValidCourseTime` (`:355-361`) вЂ” `HH:mm`, hour 0-23, minute 0-59.
- `minutesForDayTimes` (`:142-152`) вЂ” `(end-start+1440)%1440`; `0` в‡’ 1440 (full day).
- Duration must be 15..1440 minutes (`:1255`).
- `InstructorIdSchema.safeParse(row.instructorId)` (`:1266`) and must be in the roster (`:1274`).
- Planner availability (`:1286-1330`): blocks if `availability.loading` (`:1289`), blocks if
  `!item || error` with distinct copy for `error === 'incomplete'` (truncated) vs `read-failed`
  (`:1297-1310`), blocks if the instructor is not in `availableInstructorIdsForCourseDay` (`:1311-1329`).
- `availableInstructorIdsForCourseDay` (`:308-336`) вЂ” requires planner `item.instructors[].isAvailable`,
  rejects intervals overlapping existing `model.occupancy` via `intervalsOverlap`, and rejects
  overlaps against other rows in the same form for the same instructor.
- **Chronology**: valid days sorted by `interval.startsAt.seconds`; any non-strictly-increasing
  start в‡’ single issue "Give each CourseDay a distinct start time and keep the schedule
  chronological." (`:1342-1353`).
- **Max 64 days** (`:1217-1224`); zero days rejected in clone mode (`:1212`).
- Select is disabled while availability is loading/error or the interval can't be resolved (`:2570`),
  with a "Retry check" button bumping `availabilityRefreshToken` (`:2591-2597`).

### 3.3 Existing-course day editor вЂ” `CanonicalCourseDaysEditor.tsx` (272 lines)

- Header: `Course day editor` / `Р РµРґР°РєС‚РѕСЂ РґРЅРµР№ РєСѓСЂСЃР°` + `N days` (`:129-138`).
- **Add day** button gated on `can('create_course_day')` (`:140-158`); seeds
  `instructorId: course.instructorRosterIds[0] ?? ''` (`:151`).
- `ordered = [...course.courseDays].sort((l,r)=>l.dayOrder-r.dayOrder)` (`:122`).
- `CanonicalCourseDayForm` (`:161-183`) вЂ” heading `New day` / `Edit day`, `alertMessage` for
  unmatched issue, remove button only when editing an existing day with `can('remove_course_day')`.
- `DayLine` (`:218-271`) вЂ” `Day {dayOrder}`, `formatAdminCourseDayLocalDate(day)` (DD.MM.YYYY,
  from CourseDay timezone, `adminCourseTableMapping.ts:41-45`), weekday via `Intl.DateTimeFormat`
  with `day.timeZone` (`:70-78`), time range + `formatDurationHours` (`:62-68`), instructor names,
  raw `courseDayId`, status chip: `Conflict` / `Instructor unavailable` / `Scheduled`.
- `durationMinutes(day)` (`:34-39`) вЂ” `max(15, round((ends-starts)/60))`.
- `canEditDay = can('reschedule_course_day') || can('reassign_course_day_instructor')` (`:112`).

### 3.4 `CanonicalCourseDayForm.tsx` (138 lines)

Fields: `Date` (`type=date required`, `:65-74`), `Start time` (`type=time step=60 required`,
`:76-86`), `End time` (same, `:87-97`), `Actual day instructor` `<select required>` with
inactive instructors `disabled` and suffixed " (inactive)" (`:99-114`).
Buttons: `Save day` (submit, pending), `Cancel`, and `Remove day {n}` in `variant="danger"`
(`:115-133`). `CourseDayDraft.kind` = `create_course_day | reassign_course_day_instructor |
reschedule_course_day` (`:7`).

### 3.5 Day submit вЂ” `submitCourseDayDraft` (`:1541-1647`)

- Guard: `YYYY-MM-DD` regex + `durationMinutes !== undefined` + `в‰Ґ15` else `commandError('validation')` (`:1546-1552`).
- `create_course_day` в†’ `courseDayId: course_day_${newIdentity('day').split(':').at(-1)}`, `calendarInput {localDate, localTime, durationMinutes}`, `timezone: selectedCourse.courseDays[0]?.timeZone ?? 'Asia/Almaty'` (`:1566-1580`).
- Computes `scheduleChanged` / `instructorChanged`; no-op short-circuits (`:1591-1599`).
- `scheduleChanged` в‡’ `reschedule_course_day` with `expectedCourseDayRevision: day.revision` (`:1608-1623`).
- `instructorChanged` в‡’ `reassign_course_day_instructor` with `expectedRevision: day.revision` (`:1634-1643`).
- `reasonExplanation = editReason.trim() || 'Admin CourseDay edit'` (`:1556`).
- `remove_course_day` (from the editor, `:3252-3274`) goes through `onRequestConfirm` and passes
  `expectedCourseDayRevision: day.revision`, reason `editReason.trim() || 'Admin CourseDay removal'`.

---

## 4. ARCHIVING / LIFECYCLE

- Lifecycle is a two-tab switcher: `lifecycleScope: 'active' | 'archived'` (`:460`), rendered as
  `role="tablist"` buttons (`:2059-2087`). Switching clears selection, edit form, day draft,
  errors, and resets `workspaceSection` to `'overview'` (`:2066-2077`).
- Per-scope `CourseListState` (`:75-91`) is stored independently; the opposite bucket is never
  eagerly fetched.
- **Archive** вЂ” `handleArchive` (`:1854-1874`): builds submission first (throws в‡’ error, no
  confirm), then `onRequestConfirm` with message
  `` `${t('archiveCourseConfirmPrefix')} "${course.title}"? ${text.archiveHistoryPreserved}` ``
  (`:1865`). `text.archiveHistoryPreserved` (EN): *"The Course will leave the active list;
  enrollments, attendance, and payment history remain."* в†’ **archiving does not delete
  enrollments/attendance/payment history; it is a lifecycle state change only.**
- **Reactivate/Restore** вЂ” `handleReactivate` (`:1876-1896`): confirm message
  `` `${text.restoreConfirmPrefix} "${course.title}"? ${text.restoreExplanation}` `` (`:1887`);
  `text.restoreExplanation` (EN): *"The Course will return to the active list; its schedule and
  history will not change."*
- Guard chain: builder throws on wrong lifecycle (`:33`, `:58`) and on missing authorized action
  (`:37-40`, `:61-64`); manager additionally checks `authorizedActions` per course via
  `canArchive` / `canReactivate` (`:2228-2237`).
- Archived courses are also visually force-hidden: `mapAdminCourseToTableCourse` sets
  `isHidden: content?.isHidden === true || course.lifecycle === 'archived'` (`:106`).
- Post-command local reconciliation (`:776-804`): removes the row from the source bucket, resets
  target bucket, clears detail/edit state if the archived course was open.
- **There is no hard delete anywhere in the canonical surface.** `archiveInsteadOfDelete` is
  passed `true` (`:2247`) so the row menu reads `t('archiveCourse')` instead of `t('deleteCourse')`
  (`CanonicalCourseDatabaseList.tsx:103`, `:212-220`, marked `destructive: true`).
- `recover`/`unarchive` affordance appears only in the archived tab via `canReactivate` and the
  dedicated `RotateCcw` button (`:176-188`).
- Legacy `CoursesManager.tsx:72-87` still has a `deleteCourseConfirmPrefix` hard-delete path вЂ”
  dead code; do not port it.

---

## 5. CAPACITY & PRICING

### 5.1 Course capacity

- `totalSeats` on create: integer **1..64** (`CanonicalCoursesManager.tsx:1170`), input
  `min=1 max=64` (`:2339`), message `text.capacityRange` (EN *"Capacity must be between 1 and 64."*).
- `change_course_capacity` via `window.prompt` in the dead `runCourseAction` re-checks 1..64 (`:926-929`).
- Edit form: `min=1 max=64` (`:2938`), revalidated `:1438`.
- Read/display: `capacity.totalSeats`, `capacity.availableSeats`, `capacity.occupiedConfirmedSeats`
  (`:692`, `:101-102` in mapping, `:2796`, `:2851-2853`). Full-course row turns amber and shows
  a `Full` chip (`CanonicalCourseDatabaseList.tsx:100-110`, `:145-149`).
- Aggregate seat meter in the list header: sum of `occupiedConfirmedSeats` / sum of `totalSeats`
  over the **active** bucket only (`:689-695`, rendered `:2102-2107`).
- **Course capacity (1..64) and lesson party size (`maxParticipantsPerLesson`) are unrelated
  settings.** Do not conflate them in the rebuild.

### 5.2 Course price

- `price` is a whole-KZT integer в‰Ґ0 (`Course.price` в†’ `mapAdminCourseToTableCourse` `priceKZT`,
  `adminCourseTableMapping.ts:104`; legacy `price` is hard-zeroed at `:103`).
- `change_course_price` command; `Number.isInteger(price) && price >= 0` (`:914`).
- Display: `${price.toLocaleString()} в‚ё` (`CanonicalCourseDatabaseList.tsx:127`,
  `CourseTableRow.tsx:174`, detail `:2846`).

### 5.3 Additional-participant pricing вЂ” exact source of truth

**Source of truth: canonical Firestore aggregate singleton.**

| Concern | Exact location |
|---|---|
| Aggregate id | `LESSON_PRICING_SETTINGS_ID = 'lesson_booking'` вЂ” `packages/shared-domain/src/canonical/lessonPricingSettings.ts:12-13` |
| Document path | `lesson_pricing_settings/lesson_booking` вЂ” `functions/src/canonical/pricing/lessonPricingSettingsStore.ts:7-8` |
| Field | `additionalParticipantSurchargePerHourKzt` (whole KZT, `KztMinorUnitsSchema`) вЂ” `lessonPricingSettings.ts:37` |
| Second field | `maxParticipantsPerLesson` вЂ” `MaxParticipantsPerLessonSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)` (`:27-32`) вЂ” **no business upper bound** |
| Canonical price formula | `baseLessonPriceKzt + Math.round(surchargePerHour Г— (participantCount в€’ 1) Г— durationMinutes / 60)` вЂ” `calculateLessonPartyPriceKzt` (`:55-79`) |
| Duration constraint | `LessonDurationMinutesSchema` int >0 в‰¤1440 (`:20-25`) |
| Persisted schema | `.strict()`, `revision в‰Ґ 1` (`:15-18`, `:34-44`) |
| Legacy field migration | `additionalParticipantSurchargeKzt` в†’ `вЂ¦PerHourKzt` and legacy key deleted in `parseLessonPricingSettings` (`lessonPricingSettingsStore.ts:10-29`) |
| Write command | `update_lesson_pricing_settings` вЂ” `functions/src/canonical/pricing/lessonPricingSettingsCommands.ts:136-153` (deletes legacy key, requires admin + expectedRevision + reason + idempotency + audit) |
| Intent schema | `packages/shared-domain/src/canonical/commands/commandIntents.ts:984` |
| Read model | `lesson_pricing_settings` scope, discriminated union on `configured` вЂ” `packages/shared-domain/src/canonical/readModels/lessonPricingSettingsReadModel.ts:17-27` |
| Admin UI | `src/features/admin/components/settings/CanonicalLessonPricingSettings.tsx` (161 lines) вЂ” read `:26-28`, write `:69-79` |
| Server authority | transaction reads current settings: `bookingCommands.ts:379-380`, `:520-521`; `bookingPartyCommands.ts:247-287`; `bookingProposalCommands.ts:816-817`, `:1048-1049` |
| Fail-closed | multi-participant creation throws when the setting is absent/invalid (`bookingPartyCommands.ts:283`); one-participant creation does not require it (`:275-287`) |
| Staging promotion | `functions/src/staging/configPromotion{Contract,Export,Plan}.ts`; documented in `docs/operations/staging-config-promotion.md:27` |

**Admin UI field behavior** (`CanonicalLessonPricingSettings.tsx`):
- surcharge input `type=number min=0 step=1` (`:112-119`); max-participants input `type=number min=1 step=1` (`:123-130`).
- reason input, **mandatory** (`:58`, `:132-140`).
- `save()` validates `auth.currentUser?.uid`, non-empty amount, `KztMinorUnitsSchema.safeParse`,
  `MaxParticipantsPerLessonSchema.safeParse`, non-empty reason (`:49-62`) в†’ `text.invalid`.
- `idempotencyKey: \`lesson-pricing-${crypto.randomUUID().replaceAll('-','')}\`` (`:66-68`).
- `expectedRevision: revision ?? AggregateRevisionSchema.parse(0)` (`:77`).
- `administratorContext: true` (`:78`).
- `stale_version` в‡’ reload + `text.stale` (`:81-83`); other error в‡’ `text.failed` (`:85`).
- `configured === false` renders an amber warning `text.unconfigured` (*"Lesson settings are not
  configured. New authenticated booking is fail-closed."*) (`:105-109`, copy at
  `useAdminProductSettingsTranslations.ts:26-28`).
- Displays the aggregate `revision` (`:152-156`).

### 5.4 Hard-coded UI constants вЂ” risk assessment

**In the admin Product/System tabs: NONE.** Every additional-participant value is read from the
read model and written through the command. The numbers `6_000` you will see are **test fixtures
only**: `functions/testSupport/lessonPricingSettingsFixture.ts:18`, `e2e/global-setup.ts:388`,
`tests/unit/AuthBookingForm.participantPicker.test.tsx:83`, and several `*.test.ts` files. These
are not product code.

Risks found elsewhere in the booking UI (outside the audited tabs, but relevant to "must not be
hard-coded"):

- **R1 (low, preview-only, no hard-coded constant)** вЂ”
  `src/features/bookings/components/booking_modal/useBookingModal.ts:401-407` recomputes `totalCost`
  client-side from the read-model surcharge. It uses the read value, not a literal. However it
  duplicates the server formula instead of calling the shared
  `calculateLessonPartyPriceKzt` вЂ” a formula-drift risk if the canonical formula ever changes.
  The server transaction remains authoritative.
- **R2 (low)** вЂ” `AuthBookingForm.tsx:176` renders the surcharge with a `?? 0` fallback, so an
  unconfigured setting displays "0 в‚ё/hour" in the summary. The same component's
  `lessonSettingsUnavailable` flag (`useBookingModal.ts:408-410`) is the real guard; the label
  itself can mislead.
- **R3 (informational, correct)** вЂ” `CreateProposalModal.tsx:154-165` uses the shared
  `calculateLessonPartyPriceKzt` and `KztMinorUnitsSchema.parse`, wrapped in try/catch. This is the
  pattern the rebuild should follow.
- **R4 (must not regress)** вЂ” `CONTEXT.md:318` and `docs/adr/0003-payment-accounting-source.md:463-468`
  both state the max party size is a setting with no hard-coded business upper bound and that
  duration comes from canonical schedule, not a frontend total. Preserve that.

---

## 6. PRODUCT SETTINGS

`AdminProductSettings.tsx` (47 lines) вЂ” three `AdminCollapsibleSection`s, no props:

| id | title | default open | component |
|---|---|---|---|
| `lesson_pricing` | `text.lessonPricingTitle` | **true** | `CanonicalLessonPricingSettings` (`:14-22`) |
| `resort_data` | `t('resortDetailsTitle') \|\| 'Р”Р°РЅРЅС‹Рµ РєСѓСЂРѕСЂС‚Р° Рё РіРµРѕР»РѕРєР°С†РёСЏ РїРѕРіРѕРґС‹'` | false | `ResortDataSection` (`:24-32`) |
| `resort_slider` | `t('heroSliderTitle') \|\| 'РќР°СЃС‚СЂРѕР№РєР° СЂРµРєР»Р°РјРЅРѕРіРѕ Р±Р°РЅРЅРµСЂР° (РЎР»Р°Р№РґРµСЂ)'` | false | `ResortSliderSection` (`:34-44`) |

### 6.1 Lesson pricing вЂ” see В§5.3 for every field. Persistence: canonical command only.

### 6.2 Resort data вЂ” `sections/ResortDataSection.tsx` (252 lines)

Fields: `nameEn`, `nameRu`, `subNameEn`, `subNameRu` (all `required`), `latitude`, `longitude`
(`type=number step=0.0001 required`), `showLifts` ToggleSwitch, `openLifts` (`min=0 required`),
`totalLifts` (`min=0 required`), `liftsStatusEn`/`liftsStatusRu` driven by a single
`ToggleSwitch checked={liftsStatusEn.toUpperCase()==='OPEN'}` writing `OPEN/CLOSED` + `РћРўРљР Р«РўРћ/Р—РђРљР Р«РўРћ` (`:220-235`).
**Save**: `handleSaveResortData` (`:55-79`) в†’ `saveResortConfig({...})` в†’ `setDoc(doc(db,'resort_data','config'), update, {merge:true})` (`src/features/settings/resortService.ts:4`, `:56-58`).
**Read**: `subscribeResortConfig` onSnapshot, same doc (`resortService.ts:45-54`).
Client-side defaults when fields are absent: Chamonix-Mont-Blanc / РЁР°РјРѕРЅРё-РњРѕРЅР±Р»Р°РЅ, "French Alps
resort" / "РљСѓСЂРѕСЂС‚ РІ РђР»СЊРїР°С…", lat 45.9237, lon 6.8694, showLifts true, 13/14 lifts, OPEN/РћРўРљР Р«РўРћ (`:15-25`, `:33-43`).
States: loading в‡’ `FormSkeleton fields={4}` (`:83-85`); read error в‡’ logged, `setIsLoading(false)`, renders defaults (`:47-50`); save success/error в‡’ notification (`:72-75`).

### 6.3 Hero slider / banner вЂ” `sections/ResortSliderSection.tsx` (485 lines)

- Top: `slideIntervalSeconds` (`min=2 max=60 required`, default 6) and `slidesRandomOrder` ToggleSwitch (`:179-203`).
- `Active slides ({visible}/{total})` header (`:206-209`).
- Per-slide controls: move up/down (disabled at ends), `#index` badge, hidden badge, Eye/EyeOff visibility toggle, Trash2 delete (`:255-316`).
- `Reset to defaults` вЂ” **`window.confirm(t('resetSlidesConfirm'))`** then deep-copies `FALLBACK_SLIDES` and sets `slidesRandomOrder=false` (`:213-223`).
- `Add slide` seeds `{id:String(Date.now()), line1En:'New Offer', line1Ru:'РќРѕРІРѕРµ РїСЂРµРґР»РѕР¶РµРЅРёРµ', line2En:вЂ¦, line2Ru:вЂ¦, line3En:'', line3Ru:'', backgroundImage:'wall'}` (`:111-123`).
- Content grid: EN `Line 1 (Accent text)` / `Line 2 (Main heading)`, RU `РЎС‚СЂРѕРєР° 1 (РђРєС†РµРЅС‚РЅС‹Р№ С‚РµРєСЃС‚)` / `РЎС‚СЂРѕРєР° 2 (РћСЃРЅРѕРІРЅРѕР№ Р·Р°РіРѕР»РѕРІРѕРє)` вЂ” all `required` (`:318-386`). **`line3` is NOT editable in this form** (it is only in `FALLBACK_SLIDES`) вЂ” verify whether that is intentional; the `CustomHeroSlide` type has `line3En/line3Ru`.
- Background: `BannerBackgroundModeControl` (media mode) + wall `<select>` with
  `RESORT_SLIDE_RANDOM_IMAGE_KEY`, `RESORT_SLIDE_WALL_IMAGE_KEYS` (labelled `Preset Wall N (<description>)` from `RESORT_SLIDE_WALL_DESCRIPTIONS`, `:19-27`, `:417-427`), and `custom`; when custom, a `required` URL input appears (`:434-450`).
- `MobileBackgroundPositionControl` (`:29-81`, used `:453-463`) вЂ” `mobileFocalPointX` slider 0..100 step 1, `aria-valuenow`, resolved through `resolveBannerFocalPoint`.
- Save (`:149-169`): `saveResortConfig({slides (with mobileFocalPointX normalized), slideIntervalSeconds, slidesRandomOrder})` в†’ same `resort_data/config` doc, merge.
- Empty state: `t('noCustomSlides')` (`:235-238`). Loading: `FormSkeleton` (`:171-173`).
- Defaults: `FALLBACK_SLIDES` вЂ” 4 slides in `resortConfigDefaults.ts:3-48` (`wall`, `wall2`, `wall3`, `about`).
- Also present: `RESORT_CONFIG_STORAGE_KEY = 'alpine_glide_resort_config'` localStorage cache
  (`resortService.ts:6`, `readCachedResortConfig` `:21-34`, `writeCachedResortConfig` `:36-43`) вЂ”
  used to avoid painting defaults before the first snapshot. Not admin-writable, but keep in mind.

### 6.4 `SystemSettings.tsx` (11 lines) вЂ” **deprecated** wrapper rendering
`<AdminSystemSettings/>` then `<AdminProductSettings/>` (`:5-9`). Exported from
`components/settings/index.ts:6` and `features/admin/index.ts:27`. Not used by AdminPanel.

---

## 7. SYSTEM SETTINGS

`AdminSystemSettings.tsx` (282 lines). Props contract `AdminSystemSettingsProps` (`:22-33`);
every value is a prop drilled from `AdminRouteContainer` в†’ `AdminPanel` в†’ here. **No read logic
in this component** вЂ” it is pure presentational + local input state.

| Section id | Field | Control | Validation | Store command | Persistence |
|---|---|---|---|---|---|
| header (`:106-125`) | `filtersEnabled` (default `true`, `:37`) | `ToggleSwitch` `t('instructorFilters')` + `t('instructorFiltersDesc')` (`:118-123`) | none | `handleToggleFilters` | `setDoc(doc(db,'settings','instructor_filters'), {enabled})` (`settingsService.ts:15`) |
| `notification_retention` (default open) | `notificationRetentionDays` (default `DEFAULT_NOTIFICATION_RETENTION_DAYS`, `:39`) | number input + Save; **Enter key also saves** (`:153-158`) | `Number.isFinite` && within `MIN..MAX`; on failure the input is reverted (`:65-73`) | `handleSetNotificationRetentionDays` | `setDoc(doc(db,'settings','notification_retention'), {days: normalizedDays})` (`settingsService.ts:22`) |
| `starter_credit` (closed) | `starterCreditKzt` (default `DEFAULT_STARTER_CREDIT_KZT`, `:41`) | number input `step=1` + Save; Enter also saves (`:205-210`); Save `disabled={!onSetStarterCreditKzt}` (`:222`) | same min/max + revert (`:86-94`) | `handleSetStarterCreditKzt` | `setDoc(doc(db,'settings','starter_credit'), {...})` (`settingsService.ts:30`) |
| `skill_matrix` (closed) | `SkillConfig` в†’ `SkillConfigManager` (`:243-248`) | see 7.1 | see 7.1 | `handleUpdateSkillConfig` | `setDoc(doc(db,'settings','skill_config'), config)` (`settingsService.ts:37`) |
| `achievements_config` (closed) | `AchievementsConfig` в†’ `AchievementsManager` (`:258-264`) | see 7.2 | see 7.2 | `handleUpdateAchievementsConfig` | `setDoc(doc(db,'settings','achievements_config'), normalizedConfig)` (`settingsService.ts:43`) |
| `clear_student_bookings` (closed, "danger zone") | вЂ” | **disabled notice only**: `t('destructiveAdminToolsDisabled')` (`:267-279`) | вЂ” | вЂ” | вЂ” |

Bounds: `DEFAULT_NOTIFICATION_RETENTION_DAYS = 14`, `MIN = 1`, `MAX = 365`
(`src/domain/notifications/notificationConfig.ts:1-3`). Starter credit constants re-exported from
`src/domain/wallet/starterCredit.ts` (values themselves in `domain/wallet`).
`handleSetNotificationRetentionDays` / `handleSetStarterCreditKzt` / `handleUpdateSkillConfig` /
`handleUpdateAchievementsConfig` all emit an `info` notification on success
(`settingsStore.ts:52-71`).

### 7.1 `SkillConfigManager.tsx` (371 lines)

- Props `{config = DEFAULT_SKILL_CONFIG, onSaveConfig}`; local `items`, `passPercentage`
  (`config.passPercentage ?? 80`), `selectedLevelTransition` (1|2|3), `isSaving`, `editingItemId`
  (`:27-31`); re-syncs on `config` change (`:34-39`).
- **Pass percentage**: number `min=50 max=100` (`:141-150`), plus a read-only derived
  `transitionMaxPoints` and required score `Math.ceil(max * passPercentage/100)` (`:157-174`).
- **Level transition tabs** (`:178-209`): `1` Beginnerв†’Carve, `2` Carveв†’Performance, `3` Performanceв†’Expert.
- **Items filtered by `levelTarget === selectedLevelTransition`** (`:42`).
- `handleAddItem` (`:58-88`): id `item_${Date.now()}`, `levelTarget = selectedLevelTransition`,
  default section per transition (Balance / РўРµС…РЅРёРєР° / High Speed), `sectionEn` when EN, `num`
  = `filteredItems.length + 1`, title `New exercise` / `РќРѕРІРѕРµ СѓРїСЂР°Р¶РЅРµРЅРёРµ`, `maxPoints: 5`,
  `controlPoints/speedPoints/techniquePoints: 0`, `radarDimension: 'technique'`. Auto-enters edit.
- Table columns (`:229-240`): `numberCol`, `categoryCol`, `exerciseTitleCol`, `maxPointsCol`
  (number `min=1`), `radarAxisCol` (select over `RADAR_DIMENSION_KEYS`), `actionsCol` (edit-toggle + delete).
- Editing writes both `section`/`sectionEn` and `title`/`titleEn` (`:256-290`).
- `handleDeleteItem` (`:90-92`) вЂ” **no confirmation**.
- `handleResetToDefault` (`:94-99`) вЂ” **`window.confirm(t('resetSkillTableConfirm'))`**, then
  `DEFAULT_SKILL_CONFIG.items` and `passPercentage = 80`. Destructive-ish; must keep the confirm.
- `handleSave` (`:101-111`) в†’ `onSaveConfig({passPercentage, items})`.

### 7.2 `AchievementsManager.tsx` (287 lines)

- Props `{config = DEFAULT_ACHIEVEMENTS_CONFIG, skillConfig = DEFAULT_SKILL_CONFIG, onSaveConfig}`.
- `RULE_TYPE_OPTIONS` (`:21-31`), **9 types**: `lessons_completed`, `hours_completed`,
  `streak_weeks`, `exercises_mastered`, `level_up`, `feedback_given`, `homework_done`,
  `course_graduate`, `skill_items_max`.
- `createEmptyAchievement(order)` (`:33-40`): id `ach_${Date.now()}`, `labelRu:'РќРѕРІРѕРµ РґРѕСЃС‚РёР¶РµРЅРёРµ'`,
  `labelEn:'New achievement'`, `icon:'рџЏ†'`, rule `{type:'skill_items_max', skillItemIds: []}`.
- Per-achievement fields: `icon` (text, `:146-151`), `labelRu`, `labelEn`, `rule.type` select,
  `order` number (`:171-225`).
- Conditional `count` threshold number `min=1` shown only for
  `lessons_completed | hours_completed | streak_weeks | exercises_mastered` (`:227-245`).
- Conditional `skillItems` checkbox list (scrollable `max-h-48`) only for `skill_items_max`,
  built from `skillConfig.items` and cross-referenced to `skillItemIds` (`:247-275`,
  `toggleSkillItem` `:72-89` forces `type:'skill_items_max'`).
- `handleAdd` (`:91-94`) вЂ” order = max+1. `handleDelete` (`:96-99`) вЂ” **`window.confirm(t('achievementsDeleteConfirm'))`**. `handleSave` (`:101-108`) в†’ `onSaveConfig(normalizeAchievementsConfig({items}))`.
- `describeAchievementRule(item, skillItems, lang)` renders a human summary per card (`:157`).
- Empty state `t('achievementsEmpty')` (`:280-284`).
- Sorted by `order` (`:60`).

### 7.3 `AdminCollapsibleSection.tsx` (135 lines) вЂ” shared shell

- **Open state persists in `localStorage` under `admin_section_open_${id}`** (`:35-42`, `:54-64`).
  Preserving this key format preserves per-admin section layout across the rebuild.
- `forceOpen` + `forceOpenToken` effect expands and scrolls via `scrollAdminElementIntoView(id)`
  after 320 ms (`:44-52`) вЂ” used for deep links.
- `headerActions` slot, `badge` slot, `icon`, `subtitle`, `defaultOpen`.
- Toggle button shows `Eye/EyeOff` + `ChevronUp/ChevronDown` with `t('hideTable')/t('showTable')`
  and `t('hide')/t('show')` (`:97-117`).
- `AnimatePresence` height animation 0.25 s (`:120-132`).

---

## 8. TESTING / TestSession

### 8.1 `AdminTestingPanel.tsx` (797 lines)

A TestSession is an **isolated data scope**: a parallel actor/booking/course/identity namespace
with its own wallet seed, so QA data never touches production. The panel deliberately owns only
Testing read models and keeps the selection **in the URL**, not in account/global state
(doc comment `:83-86`).

**Reads** (`:125-148`, all via `queryTestSessionReadModels`):
`test_session_list`, `test_actor_directory`, `live_course_templates`; plus
`test_session_inventory` for the selected session (`:172-195`, `refreshInventory` `:110-123`);
plus `queryAdminIssueReadModels({scope:'admin_open', pageSize:20, requestedTestSessionId})` for the
test issue count (`:211-215`).

**Query key**: `ADMIN_TEST_SESSION_QUERY_KEY = 'testSession'`
(`adminNavigation.ts:65`, re-exported `AdminTestingPanel.tsx:27` and `testing/index.ts:1`).
Parsed by `parseAdminRequestedTestSessionId` via `TestSessionIdSchema` (`adminNavigation.ts:67-73`).
`adminTabSearchParams` deliberately **preserves** it across tab changes (`:75-86`).

**URL lifecycle**:
- `openTestContext()` (`:264-271`) sets `?testSession=<id>` вЂ” only when `status === 'active'`.
- `returnToLive()` (`:272-278`) deletes it.
- `selectSession()` (`:279-285`) clears preview/result/confirmation and calls `returnToLive()` if a test context was active.
- An effect (`:154-170`) **strips an invalid/deleted/non-active `?testSession=`** from the URL and falls back to the first session.
- `isTestContext` (`:201-204`) requires the URL param to match the selection **and** status `active`.

**Status vocabulary** (`:29-40`): `provisioning`, `active`, `locked`, `resetting`, `deleting`,
`closed`, `failed`. `maintenanceLocked` when in `provisioning|locked|resetting|deleting` (`:237-241`).
**Phase vocabulary** (`:42-52`): `PRECHECK`, `LOCKED`, `FIRESTORE_TRANSACTIONAL_DELETE`,
`IDENTITY_STATE_RESET`, `STORAGE_CLEANUP`, `COURSE_REPROVISION`, `WALLET_RESEED`, `VERIFY`, `COMPLETE`.

**Test-context banner** (`:291-313`): amber 2px banner, session label + short id, `StatusBadge`,
and a **Return to live** button. Must survive the rebuild вЂ” it is the only "you are in test data"
indicator.

**Blocks rendered**:
- Session list (`:360-399`): label, status badge, short id, created date, creator, starting balance, actor count. Disabled while `resetBusy`.
- Selected session detail (`:403-452`): sessionId, createdBy, createdAt, startingBalance, `Open` button (active only) or `adminTestingUnavailable` notice.
- Inventory grid (`:454-476`) from `inventory.counts`, or `adminTestingNoSessions`.
- `TestSessionResetSection` (`:478-489`) вЂ” only when `isTestContext && status === 'active'`.
- Test-scope metric strip (`:491-527`): `bookings`, `courseClones`, `payments`, `issues`.
- Actors list (`:534-568`): displayName, kind, participant count, instructor/allowed/not-allowed, assigned/not-assigned. Empty `adminTestingNoActors`.
- Course templates (`:569-590`): LIVE course titles with a `LIVE template` badge. Empty `adminTestingNoTemplates`.
- `<details>` **Create TestSession** (`:593-794`): label input, `startingBalanceKzt` number (`min=0 step=1`, default **`'1000000'`** вЂ” `:99`), template checkboxes, parent-actor checkboxes, instructor radio, plus three hint lines (`:704-706`).

**Lifecycle commands** (`executeTestSessionLifecycle`, `:243-262`, idempotency
`lifecycle_${crypto.randomUUID()}`):
`create_test_session` (`:712-719`), `close_test_session` (`:729-732`),
`preview_test_session_delete` (`:749-752`), `execute_test_session_delete` (`:762-768`),
`retry_test_session_maintenance` (`:783-787`).

**Delete confirmations вЂ” two-step, exact-token**:
1. `preview_test_session_delete` (danger button, enabled for `active|closed|failed`, `:737-756`).
2. The manifest renders `manifest.counts`, `manifest.preserve`, and an input that must equal
   `TEST_SESSION_DELETE_CONFIRMATION` (`:689-701`).
3. `execute_test_session_delete` button is enabled **only** when
   `confirmation === TEST_SESSION_DELETE_CONFIRMATION` (`:760`).

**Create guard** `creationInputValid` (`:230-236`): label non-empty, `Number.isSafeInteger(balance)`,
balance в‰Ґ 0, в‰Ґ1 template, в‰Ґ1 actor, 1 instructor.

**States**: `error` в‡’ rose `adminTestingLoadError` alert (`:340-346`); `loading` в‡’
`adminTestingLoading` block (`:347-350`); no sessions в‡’ `adminTestingEmptyTitle` +
`adminTestingEmptyDescription` (`:351-357`); `loadingInventory` в‡’ `adminTestingLoading` (`:458-459`).
`refresh` button in the header (`:328-337`).

### 8.2 `TestSessionResetSection.tsx` (477 lines) вЂ” the destructive reset flow

`TestSessionResetUiPhase` = `idle | preview_loading | preview_ready | preview_expired | executing | complete | failed` (`testSessionResetState.ts:3-10`).

- **`resetBlocked`** (`:65-69`): `maintenanceLocked || status !== 'active' || phase is preview_loading|executing`.
- **Preview**: `preview_test_session_reset` (`:107-131`), idempotency `preview_reset_${uuid}`.
- **Manifest display** (`:232-372`): expiry warning, remaining-validity minutes text, `manifestId`
  (copy button), `manifestHash` (shortened, copy button), createdAt, expiresAt, inventoryRevision,
  `destructiveTotal` = sum of `manifest.counts` (`manifestDestructiveTotal`, `testSessionResetState.ts:12-14`),
  per-key count grid, **live targets** and **foreign-session targets** safety tiles
  (`parseManifestSafetyMarkers` `:17-30`, parsed from `warnings` of the form `live_targets:N` /
  `foreign_session_targets:N`), a `adminTestingResetSafetyBlocked` alert if either is non-zero,
  plus Will-delete / Will-preserve (`manifest.preserve`) / Will-reseed lists.
- **Expiry**: 30 s tick (`:84-89`), `isManifestExpired` (`:32-34`), auto-transitions to
  `preview_expired` (`:91-95`), and the preview button relabels to "New preview" (`:197-199`).
- **Execution gate** `canExecute` (`:97-105`) в†’ `canExecuteResetPreview`
  (`testSessionResetState.ts:36-47`): requires bound session id === previewed session id, manifest
  not expired, **and** `liveTargetCount === 0 && foreignSessionTargetCount === 0`.
- **Confirm modal** (`:407-474`, `createPortal`, `role="dialog" aria-modal="true"`, `BodyScrollLock`):
  manifestId, manifestHash, destructiveTotal, reseed wallet amount, reseed course count; buttons
  `adminTestingResetConfirmCancel` and `adminTestingResetConfirmExecute` (`variant="danger"`).
  **DESTRUCTIVE.**
- **Execute** (`:133-157`): `execute_test_session_reset` with
  `confirmation: TEST_SESSION_RESET_CONFIRMATION` and idempotency
  `execute_reset_${manifest.manifestId}` (manifest-scoped в†’ replay-safe). On success clears the
  preview, sets `phase='complete'`, and calls `onAfterReset()`.
- **Complete block** (`:380-405`): status, verifier ok/failed, `verifier.failedChecks` list, "Done".
- `onBusyChange` propagates busy to the parent so the session list is disabled (`:71-73`).
- `testSessionResetState.ts:49-64` `lifecycleErrorMessageKey` maps 11 known server codes
  (`TEST_MAINTENANCE_IN_PROGRESS`, `TEST_MAINTENANCE_SCOPE_VIOLATION`,
  `TEST_MAINTENANCE_MANIFEST_STALE`, `TEST_MAINTENANCE_MANIFEST_EXPIRED`,
  `TEST_MAINTENANCE_LEASE_CONFLICT`, `TEST_MAINTENANCE_FAILED`,
  `TEST_MAINTENANCE_CONFIRMATION_INVALID`, `TEST_SESSION_NOT_FOUND`,
  `TEST_SESSION_NOT_ACTIVE`, `TEST_SESSION_TRANSITION_FORBIDDEN`, `LIFECYCLE_FORBIDDEN`)
  to `adminTestingLifecycleError_<code>`, defaulting to `..._TEST_MAINTENANCE_FAILED`.
- `useAdminTestingTranslations.ts` supplies `formatKzt` (`Intl.NumberFormat` with
  `currency:'KZT'`, `maximumFractionDigits:0`, locale `ru-KZ`/`en-US`) and `formatDate`.

---

## 9. ERROR LOGS вЂ” `ErrorLogsPanel.tsx` (240 lines)

- Mounted in **System tab**, section id `error_logs`, `defaultOpen={false}`
  (`AdminPanel.tsx:448-458`).
- **List**: `subscribeErrorLogs(onLogs, onError, pageSize)` from
  `src/features/admin/adminService.ts:17-34` вЂ” `onSnapshot(query(collection(db,'error_logs'),
  orderBy('timestamp','desc'), limit(pageSize + 1)))`; `hasMore = docs.length > pageSize`.
- **Pagination**: initial `pageSize = QUERY_LIMITS.errorLogs` (`:30`). **There is no cursor page
  token** вЂ” "Load more logs" simply increments `pageSize` by `QUERY_LIMITS.errorLogs`
  (`:99-108`, `:102`) and the subscription re-queries with the larger limit. This is a limit-based
  growth, not true pagination; a rebuild should preserve the button's behavior or deliberately
  improve it (flagged, not a capability to preserve verbatim).
- **Search** `logSearch` over `message`, `stack`, `userEmail`, `url` (case-insensitive) (`:72-86`).
- **Source filter** `<select>`: `all`, `firestore`, `global_error`, `unhandled_rejection`, `custom` (`:122-134`).
- **Counter**: `"{logsShowingPrefix} {n} {logsShowingOf} {total} {logsShowingSuffix}"` (`:137`).
- **Row** (`:147-235`): source chip color-coded (amber=firestore, rose=global_error, purple=other),
  localized timestamp, message, `userEmail || 'anonymous'`, URL, optional `operation` and `path`.
  Clicking the row toggles `selectedLog` (`:151`) revealing `stack` in a `<pre>` and a
  **Client env details** block with `User Agent` and `Full URL` (`:206-233`).
- **Delete single** вЂ” per-row Trash2 button with `e.stopPropagation()`, `title={t('deleteLog')}`
  (`:170-179`); `handleDeleteLog` (`:51-58`) calls `deleteErrorLog(logId)` в†’
  `deleteDoc(doc(db,'error_logs', logId))` (`adminService.ts:36-43`) and notifies
  `logDeleted`/`logDeletedDesc`. **NO confirmation.** Destructive.
- **Delete bulk** вЂ” "Clear all logs" danger button, rendered only when `errorLogs.length > 0`
  (`:90-97`); `handleClearAllLogs` (`:60-70`) calls `onRequestConfirm(t('clearLogsConfirm'), вЂ¦)`
  then `deleteErrorLogs(errorLogs.map(l=>l.id))` в†’ `Promise.all` of single deletes
  (`adminService.ts:45-47`), then notifies `logsCleared`/`logsClearedDesc`. **Confirmed, destructive.**
  Note: it deletes only the currently loaded page, not the whole collection.
- **States**: `errorLogsLoading` в‡’ `<TableSkeleton rows={5} cols={4}/>` (`:141-142`);
  `filteredLogs.length === 0` в‡’ `<StateCard title={t('noErrorLogsMatch')}/>` (`:143-144`);
  read error is only logged + loading cleared (`:41-44`) вЂ” **no user-visible error state**; flag.
  List container is `max-h-[500px] overflow-y-auto` (`:146`).

---

## 10. PROMOTIONS + TRANSLATIONS/CONTENT + RESORT/BANNER

### 10.1 Promotions вЂ” **DOES NOT EXIST**

`grep -i "promotion|promotions"` across `src` returned **5 hits, none a promotions feature**:
- `src/lib/mediaAssets.ts:6` вЂ” comment: *"Resort slide promotion supports only the logical keys in the shared-domain contract."* (about the **hero slide** wall images, i.e. the banner in В§6.3).
- `src/features/admin/people/useAdminRoleTranslations.ts:51` вЂ” `unavailableForPromote` copy.
- `src/features/admin/people/AdminRoleAccountPicker.tsx:2,51,54` вЂ” `isCanonicalAccountEligibleForAdminRolePromotion` (admin role promotion, People tab).

`grep -i "promo|discount|coupon"` across `src` returned only: the `promoVideoUrl` course field
(`translations.ts:1883`, `:4243`; `CourseRichDetailsSection.tsx:57`), admin role
promote/demote copy, and one hard-coded course FAQ string mentioning a "15% discount at the resort
rental shop" (`src/features/courses/components/course_details/courseEnrichedData.ts:221`).

**Conclusion: there is no Promotions feature, no promotions admin surface, and no promotions
query key. Nothing to preserve. Do not invent one; do not "restore" it.**

### 10.2 Translations / content management вЂ” **NO admin translation editor exists**

`grep "TranslationEditor|translationsAdmin|adminTranslat|ContentManager|i18nManager|TranslationManager"`
across `src` в†’ **no matches.**

What exists instead is **per-feature inline RU/EN field pairs**, all already inventoried above:
- Courses: `titleRu`, `shortDescriptionRu`, `detailedDescriptionRu`, `badgeRu`, `benefitsRu`,
  `programRu`, `faqRu` (create `:2656-2673`, edit `:3038-3197`).
- Resort: `nameRu`, `subNameRu`, `liftsStatusRu`; slides `line1Ru`, `line2Ru` (Ru section `:353-385`).
- Skill items: `section`/`sectionEn`, `title`/`titleEn` (dual-write while editing, `SkillConfigManager.tsx:256-290`).
- Achievements: `labelRu` / `labelEn` (`:172-191`).
- UI chrome: `useAdminCourseTranslations`, `useAdminProductSettingsTranslations`,
  `useAdminTestingTranslations`, `getSpecialtyLabel`, `translateInstructorName`, `formatCourseDates`,
  and the global `src/lib/i18n/translations.ts`.
- Content copy is edited **in place per record**, not via a separate screen. Preserve that model.

### 10.3 Resort / banner content

- **Mount point**: `AdminProductSettings.tsx:3` imports `{ ResortDataSection, ResortSliderSection }`
  from `'../resort/ResortConfigForm'` (i.e. the re-export at `ResortConfigForm.tsx:5`), and renders
  them in the `resort_data` and `resort_slider` collapsible sections (`:24-44`).
- `ResortConfigForm` (`ResortConfigForm.tsx:7-14`) itself вЂ” the wrapper rendering both sections
  sequentially вЂ” is exported (`components/resort/index.ts:1`, `features/admin/index.ts:17`) but is
  **not** mounted by `AdminPanel`. Only `FALLBACK_SLIDES` and the `ResortConfigForm` symbol are
  re-exported at the feature barrel. Treat the wrapper as unused; the two sections are live.
- Details in В§6.2 / В§6.3.

---

## 11. DIALOGS / CONFIRMATIONS (product + system), destructive marked

| # | Surface | Mechanism | Message / requirement | Destructive |
|---|---|---|---|---|
| 1 | **Course archive** (list row menu, `:2196`, `:2247`) | `onRequestConfirm` | `t('archiveCourseConfirmPrefix') + "В«titleВ»" + text.archiveHistoryPreserved` (`:1865`) | **YES** |
| 2 | **Course restore/reactivate** (archived tab, `:2197`) | `onRequestConfirm` | `text.restoreConfirmPrefix + "В«titleВ»" + text.restoreExplanation` (`:1887`) | no |
| 3 | **Course archive** (detail pane, `:3306-3311`) | `onRequestConfirm` | same as #1 (`variant="danger"`) | **YES** |
| 4 | **Course reactivate** (detail pane, `:3310`) | `onRequestConfirm` | same as #2 (`variant="secondary"`) | no |
| 5 | **Remove CourseDay** (days editor, `:3252-3274`) | `onRequestConfirm` | `В«РЈРґР°Р»РёС‚СЊ РґРµРЅСЊ РєСѓСЂСЃР° {dayOrder}?В»` / `В«Remove course day {dayOrder}?В»` | **YES** |
| 6 | **Remove CourseDay** (dead `courseDayAction`, `:1732`) | `onRequestConfirm` | `remove CourseDay {id}?` вЂ” **inactive** | (dead) |
| 7 | **Admin global confirm modal** (`AdminPanel.tsx:462-479+`, `createPortal` + `BodyScrollLock`) | shared shell used by all `onRequestConfirm` callers | `t('confirmAction')` + message + Confirm/Cancel | context |
| 8 | **TestSession reset confirm** (`TestSessionResetSection.tsx:407-474`) | `createPortal` modal, `role="dialog" aria-modal="true"` | manifest id/hash, destructiveTotal, reseed summary; two buttons | **YES** |
| 9 | **TestSession delete execute** (`AdminTestingPanel.tsx:757-773`) | inline, **no modal** | must type `TEST_SESSION_DELETE_CONFIRMATION` exactly; `variant="danger"` | **YES** |
| 10 | **Clear all error logs** (`ErrorLogsPanel.tsx:60-70`, `:92`) | `onRequestConfirm` | `t('clearLogsConfirm')`; `variant="danger"` | **YES** |
| 11 | **Delete single error log** (`:170-179`) | **none** | immediate delete + notification | **YES** (unconfirmed) |
| 12 | **Reset skill table** (`SkillConfigManager.tsx:94-99`, `:116-122`) | `window.confirm` | `t('resetSkillTableConfirm')`; rose styling | **YES** |
| 13 | **Delete skill item** (`:354-361`) | **none** | immediate local removal | **YES** (unconfirmed) |
| 14 | **Delete achievement** (`AchievementsManager.tsx:96-99`, `:161-168`) | `window.confirm` | `t('achievementsDeleteConfirm')` | **YES** |
| 15 | **Reset hero slides to defaults** (`ResortSliderSection.tsx:213-223`) | `window.confirm` | `t('resetSlidesConfirm')` | **YES** |
| 16 | **Delete hero slide** (`:308-315`) | **none** | immediate local removal; `title={t('deleteSlide')}` | **YES** (unconfirmed) |
| 17 | **Reason prompt** (every canonical mutation, `promptReason` `:836`) | `window.prompt` | `t('reason')`; **empty в‡’ abort** (`:900`, `:1749`) | no |
| 18 | **Dead `runCourseAction` / `courseDayAction` / `editCatalogContent`** (`:1934-1936`) | `window.prompt` chains | not reachable | (dead) |

**Hard-delete capability that does NOT exist:** there is no course delete, no enrollment purge, no
attendance purge anywhere in the audited tabs. `destructiveAdminToolsDisabled` (`:276`) is a
placeholder for the removed "clear student bookings" tool.

---

## 12. STATES per surface

| Surface | Loading | Empty | Error | Other |
|---|---|---|---|---|
| Course list | `Loader2` + `text.loading` when `!initialized && courses.length===0` (`:2160-2167`) | `text.activeEmpty` / `text.archivedEmpty` dashed block (`:2180-2183`) | `currentList.error` block + **Retry** button; or inline inline-error + Retry when items exist (`:2139-2156`, `:2168-2179`) | `pending` banner (`:2042-2046`), `stale` banner (`:2047-2051`), `aria-busy` (`:2035`) |
| Course list paging | `text.loadingMore` on the load-more button, `disabled` (`:2253-2262`) | n/a | n/a | `hasMore && cursor` gated |
| Course detail | n/a (no spinner on open) | `t('adminCourseDatabaseSelectPrompt')` centered min-h-52 (`:3320-3324`) | `mutationError` red banner, suppressed when it equals a course-day issue (`:2037-2041`) | `editFormError` + validation `<ul>` (`:2291-2304`) |
| Course day editor | instructor roster `text.loading` (`:2982-2984`); availability `В«РџСЂРѕРІРµСЂСЏРµРј СЂР°СЃРїРёСЃР°РЅРёРµвЂ¦В»` (`:2586-2587`) | `text.noSchedule` dashed block (`:185-188`) | `unmatchedIssue` alert; availability error + **Retry check** (`:2588-2598`) | per-day conflict message `role="alert"` (`:264-268`) |
| Create form | planner availability per day | `days` empty в‡’ date summary "No course dates selected" (`:2619`) | inline per-field red text; Zod-derived issue list | `noValidate` on the form (`:2274`) вЂ” all validation is JS/Zod |
| Lesson pricing | `text.loading` while `configured === undefined` (`:99-101`) | `text.unconfigured` amber warning (`:105-109`) | `text.failed`; `text.stale` on OCC conflict (`:81-86`) | revision display, `pending` |
| Resort data | `FormSkeleton fields={4}` (`:83-85`) | n/a | error logged only; defaults rendered (`:47-50`) | save success/error notifications |
| Resort slider | `FormSkeleton fields={4}` (`:171-173`) | `t('noCustomSlides')` (`:235-238`) | error logged only (`:103-106`) | `activeSlides (visible/total)` |
| Skill config | none | none | none | unsaved-edit state is local; save button `pending` |
| Achievements | none | `t('achievementsEmpty')` (`:280-284`) | none | per-rule-type conditional fields |
| Danger zone | n/a | n/a | n/a | disabled notice only |
| Testing panel | `adminTestingLoading` (`:347-350`, `:458-459`) | `adminTestingEmptyTitle/Description` (`:351-357`), `adminTestingNoSessions`, `adminTestingNoActors`, `adminTestingNoTemplates` | `adminTestingLoadError` rose alert (`:340-346`); `lifecycleError` in create block (`:666-670`) | `adminTestingUnavailable` for non-active (`:447-450`) |
| TestSession reset | `adminTestingResetPreviewLoading` (`:219-223`) | n/a | `data-testid="reset-error"` alert (`:225-230`) | `executing`, `complete` w/ verifier (`:374-405`), `preview_expired` |
| Error logs | `TableSkeleton rows={5} cols={4}` (`:141-142`) | `StateCard t('noErrorLogsMatch')` (`:143-144`) | **none rendered** вЂ” logged only (`:41-44`) | `hasMoreLogs` load-more, expanded `selectedLog` |

---

## 13. CAPABILITY LIST (JSON)

```json
[
 {"id":"P01","tab":"product","screen":"courses_manager","capability":"List canonical courses (active/archived)","entryPoint":"Product tab > courses_manager section","userAction":"Switch lifecycle tab; scroll list; paginate","states":["loading","empty active","empty archived","error+retry","load more"],"commandOrReadModel":"queryAdminCourseReadModels scope=admin_course_list v2","currentResult":"Bounded page of AdminCourseListItem cards with price, occupancy, chips","destructive":false,"sourceFiles":["src/features/admin/components/courses/CanonicalCoursesManager.tsx:2059-2263","CanonicalCourseDatabaseList.tsx"]},
 {"id":"P02","tab":"product","screen":"courses_manager","capability":"Search courses","entryPoint":"Search input in list header","userAction":"Type query (title/titleRu/dates)","states":["query","no match"],"commandOrReadModel":"client filter over loaded page","currentResult":"visibleTableCourses filtered","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:475,682-688,2115-2121"]},
 {"id":"P03","tab":"product","screen":"courses_manager","capability":"Open course detail (read-only)","entryPoint":"Row click / Info button","userAction":"Click course card","states":["detail open","select prompt"],"commandOrReadModel":"queryAdminCourseReadModels scope=admin_course_detail","currentResult":"6-tab workspace: overview/schedule/instructors/participants/enrollment/settings","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:1898-1913,2777-3319"]},
 {"id":"P04","tab":"product","screen":"courses_manager","capability":"Create canonical course (provisioning manifest)","entryPoint":"Toolbar Add course / Clone course copy","userAction":"Fill form incl. period + per-day instructor availability; submit","states":["form","validation issues","pending","success","error","permission denied"],"commandOrReadModel":"apply_canonical_course_provisioning_manifest (dryRun:false)","currentResult":"Course + CourseDays provisioned from one manifest","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:962-1413,2270-2776"]},
 {"id":"P05","tab":"product","screen":"courses_manager","capability":"Clone course into a new course","entryPoint":"Row menu > Clone","userAction":"Click Clone; review prefilled schedule; save","states":["draft ready","days removable","add day","error if source has no CourseDays/instructors"],"commandOrReadModel":"apply_canonical_course_provisioning_manifest","currentResult":"New course titled '(copy)' / '(РєРѕРїРёСЏ)' with cloned days","destructive":false,"sourceFiles":["adminCourseCloneDraft.ts:164-230","CanonicalCoursesManager.tsx:1915-1930"]},
 {"id":"P06","tab":"product","screen":"courses_detail/settings","capability":"Structured course edit (title, price, capacity, roster, catalog content)","entryPoint":"Edit button on row","userAction":"Edit fields, type reason, Save changes","states":["edit form","reason missing","capacity range error","price invalid","permission denied","stale"],"commandOrReadModel":"change_course_title, change_course_price, change_course_capacity, add/remove_course_roster_instructor, update_course_catalog_content","currentResult":"Sequential OCC-guarded command chain with per-step authoritative refresh","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:1426-1539,2890-3227"]},
 {"id":"P07","tab":"product","screen":"courses_detail/settings","capability":"Set course capacity (1..64)","entryPoint":"Capacity field in edit form","userAction":"Enter value 1-64, save","states":["valid","out of range error"],"commandOrReadModel":"change_course_capacity","currentResult":"capacity.totalSeats updated; occupied seats preserved server-side","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:1436-1441,1485-1493,2931-2942"]},
 {"id":"P08","tab":"product","screen":"courses_detail/settings","capability":"Set course price (whole KZT)","entryPoint":"Price (KZT) field","userAction":"Enter non-negative integer, save","states":["valid","invalid"],"commandOrReadModel":"change_course_price","currentResult":"course.price updated; displayed as 'N в‚ё'","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:1442-1445,1476-1484,2919-2930"]},
 {"id":"P09","tab":"product","screen":"courses_manager","capability":"Toggle course visibility (hide/show from catalog)","entryPoint":"Row menu > Show/Hide course","userAction":"Click","states":["action hidden unless active + authorized"],"commandOrReadModel":"update_course_catalog_content (isHidden)","currentResult":"content.isHidden flipped; 'Hidden' chip appears","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:1813-1828,2200-2207"]},
 {"id":"P10","tab":"product","screen":"courses_manager","capability":"Reorder courses (move up/down)","entryPoint":"Row menu > Move up / Move down (or arrow buttons)","userAction":"Click; two sequential catalog updates swap order","states":["disabled at ends","action hidden unless active + authorized"],"commandOrReadModel":"update_course_catalog_content (order) x2","currentResult":"Order values swapped between neighbours","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:1830-1852,2239-2246"]},
 {"id":"P11","tab":"product","screen":"courses_manager","capability":"Archive course (lifecycle, not delete)","entryPoint":"Row menu > Archive (Trash2, destructive styling)","userAction":"Click; confirm modal","states":["confirm","builder error","success removes from active","stale"],"commandOrReadModel":"archive_course via buildArchiveCourseCommandFromListItem","currentResult":"Course leaves active list; enrollments/attendance/payment history preserved","destructive":true,"sourceFiles":["adminCourseArchiveCommand.ts:29-51","CanonicalCoursesManager.tsx:1854-1874"]},
 {"id":"P12","tab":"product","screen":"courses_manager","capability":"Restore archived course","entryPoint":"Restore button in archived tab","userAction":"Click; confirm modal","states":["confirm","success moves to active"],"commandOrReadModel":"reactivate_course via buildReactivateCourseCommandFromListItem","currentResult":"Course returns to active; schedule and history unchanged","destructive":false,"sourceFiles":["adminCourseArchiveCommand.ts:54-75","CanonicalCoursesManager.tsx:1876-1896"]},
 {"id":"P13","tab":"product","screen":"courses_detail/schedule","capability":"List course days","entryPoint":"Schedule workspace tab","userAction":"View dayOrder, local date, weekday, time range, duration, instructor, status chip","states":["empty (noSchedule)","per-day conflict","instructor unavailable","scheduled"],"commandOrReadModel":"admin_course_detail courseDays","currentResult":"Chronologically ordered day cards","destructive":false,"sourceFiles":["CanonicalCourseDaysEditor.tsx:96-271"]},
 {"id":"P14","tab":"product","screen":"courses_detail/schedule","capability":"Add course day","entryPoint":"Add day button","userAction":"Set date/start/end/instructor; Save day","states":["draft","validation error","permission denied","conflict"],"commandOrReadModel":"create_course_day (calendarInput + timezone)","currentResult":"New CourseDay appended","destructive":false,"sourceFiles":["CanonicalCourseDayForm.tsx","CanonicalCoursesManager.tsx:1557-1583"]},
 {"id":"P15","tab":"product","screen":"courses_detail/schedule","capability":"Reschedule course day","entryPoint":"Edit on day line","userAction":"Change date/time/duration; Save day","states":["no-op short-circuit","conflict","error"],"commandOrReadModel":"reschedule_course_day with expectedCourseDayRevision","currentResult":"Day interval moved","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:1600-1625"]},
 {"id":"P16","tab":"product","screen":"courses_detail/schedule","capability":"Reassign course day instructor","entryPoint":"Edit on day line","userAction":"Pick instructor; Save day","states":["validation","error"],"commandOrReadModel":"reassign_course_day_instructor (expectedRevision = day.revision)","currentResult":"actualInstructorIds changed","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:1626-1645"]},
 {"id":"P17","tab":"product","screen":"courses_detail/schedule","capability":"Remove course day","entryPoint":"Remove day button inside day form","userAction":"Click; confirm modal","states":["confirm","permission denied","error"],"commandOrReadModel":"remove_course_day with expectedCourseDayRevision","currentResult":"CourseDay removed","destructive":true,"sourceFiles":["CanonicalCourseDayForm.tsx:128-132","CanonicalCoursesManager.tsx:3252-3274"]},
 {"id":"P18","tab":"product","screen":"courses_detail/enrollment","capability":"Open course enrollments & attendance","entryPoint":"Open enrollments and attendance button","userAction":"Click в†’ routes to Operations with course filter","states":["enabled when onOpenEnrollments provided"],"commandOrReadModel":"adminCourseEnrollmentSearchParams (URL)","currentResult":"Admin CourseEnrollment roster for that course","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:3278-3295","adminNavigation.ts:137-149"]},
 {"id":"P19","tab":"product","screen":"courses_detail/settings","capability":"Upload course background image (optimized)","entryPoint":"Upload image toggle в†’ drag/drop or file picker","userAction":"Drop or pick an image","states":["uploading spinner","invalid file error","upload failed"],"commandOrReadModel":"optimizeCourseImage (webp, max 800x600, q0.82) + uploadImage(liveCourseCoverStoragePath)","currentResult":"Optimized URL written into bgImageUrl; preview rendered","destructive":false,"sourceFiles":["CourseBackgroundImageField.tsx","courseImage.ts"]},
 {"id":"P20","tab":"product","screen":"lesson_pricing","capability":"Configure additional-participant surcharge (в‚ё/hour)","entryPoint":"Product tab > lesson_pricing section","userAction":"Enter non-negative whole KZT + reason; Save","states":["loading","unconfigured warning","invalid","stale (OCC reload)","saved","failed"],"commandOrReadModel":"update_lesson_pricing_settings via executeAuthenticatedCanonicalCommand","currentResult":"lesson_pricing_settings/lesson_booking.additionalParticipantSurchargePerHourKzt updated with revision, audit, idempotency","destructive":false,"sourceFiles":["src/features/admin/components/settings/CanonicalLessonPricingSettings.tsx:48-97","functions/src/canonical/pricing/lessonPricingSettingsCommands.ts"]},
 {"id":"P21","tab":"product","screen":"lesson_pricing","capability":"Configure max participants per lesson","entryPoint":"Same section","userAction":"Enter positive integer; Save","states":["same as P20"],"commandOrReadModel":"update_lesson_pricing_settings.maxParticipantsPerLesson","currentResult":"maxParticipantsPerLesson persisted; no business upper bound (safe integer)","destructive":false,"sourceFiles":["CanonicalLessonPricingSettings.tsx:121-131","packages/shared-domain/src/canonical/lessonPricingSettings.ts:27-32"]},
 {"id":"P22","tab":"product","screen":"resort_data","capability":"Edit resort identity, geolocation and lift status","entryPoint":"Product tab > resort_data section","userAction":"Edit name/sub (EN+RU), lat/lon, showLifts, open/total lifts, OPEN toggle; Save","states":["skeleton","save pending","success/failure notification"],"commandOrReadModel":"saveResortConfig / subscribeResortConfig (Firestore resort_data/config, merge)","currentResult":"Resort name, GPS and lift status persisted","destructive":false,"sourceFiles":["sections/ResortDataSection.tsx","src/features/settings/resortService.ts:4,56-58"]},
 {"id":"P23","tab":"product","screen":"resort_slider","capability":"Manage hero banner slides","entryPoint":"Product tab > resort_slider section","userAction":"Add / delete / reorder / show-hide slide; edit EN+RU line1/line2, background mode, wall or custom URL, mobile focal point; set interval 2-60 s; toggle random order; Save","states":["skeleton","no slides","save pending","reset-to-defaults confirm"],"commandOrReadModel":"saveResortConfig {slides, slideIntervalSeconds, slidesRandomOrder}","currentResult":"Homepage banner content and rotation persisted","destructive":false,"sourceFiles":["sections/ResortSliderSection.tsx","resortConfigDefaults.ts"]},
 {"id":"P24","tab":"product","screen":"resort_slider","capability":"Reset banner slides to 4 curated defaults","entryPoint":"Reset to defaults button","userAction":"Click; window.confirm","states":["confirm","applied"],"commandOrReadModel":"local state reset to FALLBACK_SLIDES + slidesRandomOrder=false","currentResult":"Slides replaced with the 4 built-in presets","destructive":true,"sourceFiles":["ResortSliderSection.tsx:213-223"]},
 {"id":"S01","tab":"system","screen":"system_settings header","capability":"Toggle instructor filters globally","entryPoint":"ToggleSwitch in System settings header","userAction":"Toggle","states":["on","off"],"commandOrReadModel":"useSettingsStore.handleToggleFilters","currentResult":"settings/instructor_filters {enabled} persisted","destructive":false,"sourceFiles":["AdminSystemSettings.tsx:117-124","settingsStore.ts:48-51","settingsService.ts:15"]},
 {"id":"S02","tab":"system","screen":"notification_retention","capability":"Set notification retention days (1..365, default 14)","entryPoint":"notification_retention section","userAction":"Enter value or press Enter; Save changes","states":["out of range в†’ input reverted","saving","info notification"],"commandOrReadModel":"useSettingsStore.handleSetNotificationRetentionDays","currentResult":"settings/notification_retention {days} persisted","destructive":false,"sourceFiles":["AdminSystemSettings.tsx:62-81,127-176","settingsStore.ts:52-56"]},
 {"id":"S03","tab":"system","screen":"starter_credit","capability":"Set starter wallet credit (KZT)","entryPoint":"starter_credit section","userAction":"Enter amount; Save changes (button disabled without handler)","states":["out of range в†’ reverted","saving","info notification"],"commandOrReadModel":"useSettingsStore.handleSetStarterCreditKzt","currentResult":"settings/starter_credit persisted","destructive":false,"sourceFiles":["AdminSystemSettings.tsx:83-102,178-229","settingsStore.ts:57-61"]},
 {"id":"S04","tab":"system","screen":"skill_matrix","capability":"Configure skill/level matrix","entryPoint":"skill_matrix section","userAction":"Set pass % (50-100); switch 3 level transitions; add/edit/delete items (category, title EN+RU, maxPoints, radar dimension); Save; Reset to defaults","states":["editing item","filter by transition","saving","reset confirm"],"commandOrReadModel":"useSettingsStore.handleUpdateSkillConfig","currentResult":"settings/skill_config persisted; required score auto-derived per transition","destructive":false,"sourceFiles":["SkillConfigManager.tsx","AdminSystemSettings.tsx:231-249"]},
 {"id":"S05","tab":"system","screen":"skill_matrix","capability":"Reset skill matrix to defaults","entryPoint":"Reset button","userAction":"Click; window.confirm","states":["confirm","applied (pass% back to 80)"],"commandOrReadModel":"local state в†’ DEFAULT_SKILL_CONFIG","currentResult":"Skill items replaced with domain defaults","destructive":true,"sourceFiles":["SkillConfigManager.tsx:94-99,116-122"]},
 {"id":"S06","tab":"system","screen":"achievements_config","capability":"Configure achievements","entryPoint":"achievements_config section","userAction":"Add/delete achievements; edit icon, labelRu, labelEn, rule type (9 types), order, count threshold, skill item selection; Save","states":["empty","saving","delete confirm"],"commandOrReadModel":"useSettingsStore.handleUpdateAchievementsConfig","currentResult":"settings/achievements_config persisted (normalized)","destructive":false,"sourceFiles":["AchievementsManager.tsx","AdminSystemSettings.tsx:251-265"]},
 {"id":"S07","tab":"system","screen":"danger_zone","capability":"(Former) clear student bookings вЂ” REMOVED","entryPoint":"clear_student_bookings section","userAction":"None вЂ” disabled notice","states":["notice only"],"commandOrReadModel":"none","currentResult":"t('destructiveAdminToolsDisabled') placeholder; no destructive admin tool remains","destructive":false,"sourceFiles":["AdminSystemSettings.tsx:267-279"]},
 {"id":"S08","tab":"system","screen":"testing","capability":"List TestSessions, actors and LIVE course templates","entryPoint":"System tab > AdminTestingPanel","userAction":"Refresh; select a session","states":["loading","load error","empty"],"commandOrReadModel":"queryTestSessionReadModels: test_session_list, test_actor_directory, live_course_templates","currentResult":"Session/actor/template panels rendered","destructive":false,"sourceFiles":["testing/AdminTestingPanel.tsx:125-152,360-591"]},
 {"id":"S09","tab":"system","screen":"testing","capability":"Open test data context (?testSession=)","entryPoint":"Open button on an active session","userAction":"Click Open; later click Return to live","states":["banner shown","invalid param auto-stripped"],"commandOrReadModel":"URL query key ADMIN_TEST_SESSION_QUERY_KEY='testSession'","currentResult":"All admin surfaces enter scoped test reads; amber banner visible","destructive":false,"sourceFiles":["AdminTestingPanel.tsx:264-285,291-313","adminNavigation.ts:65-86"]},
 {"id":"S10","tab":"system","screen":"testing","capability":"Create TestSession","entryPoint":"Create TestSession details block","userAction":"Enter label, starting balance, pick templates/parent actors/instructor; Create","states":["invalid (button disabled)","pending","phase report","lifecycle error"],"commandOrReadModel":"create_test_session","currentResult":"New isolated TestSession with wallet seed and course clones","destructive":false,"sourceFiles":["AdminTestingPanel.tsx:593-723"]},
 {"id":"S11","tab":"system","screen":"testing","capability":"Close TestSession","entryPoint":"Close button","userAction":"Click (active only)","states":["pending","error"],"commandOrReadModel":"close_test_session","currentResult":"Session status в†’ closed","destructive":false,"sourceFiles":["AdminTestingPanel.tsx:724-736"]},
 {"id":"S12","tab":"system","screen":"testing","capability":"Preview + execute TestSession deletion","entryPoint":"Delete в†’ type confirmation в†’ Execute delete","userAction":"Click Delete; read manifest counts/preserve; type TEST_SESSION_DELETE_CONFIRMATION; Execute","states":["manifest","confirmation invalid (disabled)","pending","error"],"commandOrReadModel":"preview_test_session_delete then execute_test_session_delete (manifestId)","currentResult":"TestSession data destroyed; session list refreshes","destructive":true,"sourceFiles":["AdminTestingPanel.tsx:737-773,689-701"]},
 {"id":"S13","tab":"system","screen":"testing","capability":"Retry stuck TestSession maintenance","entryPoint":"Retry maintenance button (failed/provisioning/locked/resetting/deleting)","userAction":"Click","states":["pending","error"],"commandOrReadModel":"retry_test_session_maintenance","currentResult":"Maintenance resumes","destructive":false,"sourceFiles":["AdminTestingPanel.tsx:774-792"]},
 {"id":"S14","tab":"system","screen":"testing/reset","capability":"Preview TestSession reset manifest","entryPoint":"TestSessionResetSection preview button","userAction":"Click preview","states":["preview_loading","preview_ready","preview_expired","failed"],"commandOrReadModel":"preview_test_session_reset","currentResult":"Manifest with counts, preserve list, live/foreign target safety counters, expiry","destructive":false,"sourceFiles":["TestSessionResetSection.tsx:107-131,232-372"]},
 {"id":"S15","tab":"system","screen":"testing/reset","capability":"Execute TestSession reset with confirmation modal","entryPoint":"Execute reset в†’ confirm modal в†’ Confirm execute","userAction":"Review destructiveTotal/preserve/reseed; click Confirm execute","states":["modal","executing","complete+verifier","failed"],"commandOrReadModel":"execute_test_session_reset (manifestId + TEST_SESSION_RESET_CONFIRMATION, idempotency execute_reset_<manifestId>)","currentResult":"Test bookings/identity/storage wiped; wallet reseeded; courses reprovisioned","destructive":true,"sourceFiles":["TestSessionResetSection.tsx:133-157,407-474"]},
 {"id":"S16","tab":"system","screen":"error_logs","capability":"List, search, filter and expand error logs","entryPoint":"error_logs section (System tab, collapsed)","userAction":"Search, choose source filter, click row to expand stack/UA/URL, Load more","states":["skeleton","no match","expanded row","hasMore"],"commandOrReadModel":"subscribeErrorLogs onSnapshot (error_logs, orderBy timestamp desc, limit pageSize+1)","currentResult":"Error log list with details","destructive":false,"sourceFiles":["ErrorLogsPanel.tsx","src/features/admin/adminService.ts:17-34"]},
 {"id":"S17","tab":"system","screen":"error_logs","capability":"Delete a single error log","entryPoint":"Per-row Trash2","userAction":"Click (no confirmation)","states":["success notification","error logged"],"commandOrReadModel":"deleteErrorLog в†’ deleteDoc error_logs/{id}","currentResult":"Log removed","destructive":true,"sourceFiles":["ErrorLogsPanel.tsx:51-58,170-179","adminService.ts:36-43"]},
 {"id":"S18","tab":"system","screen":"error_logs","capability":"Clear all loaded error logs","entryPoint":"Clear all logs danger button","userAction":"Click; confirm modal","states":["confirm","success","error"],"commandOrReadModel":"deleteErrorLogs(ids) в†’ Promise.all(deleteErrorLog)","currentResult":"All currently loaded logs removed","destructive":true,"sourceFiles":["ErrorLogsPanel.tsx:60-70,90-97","adminService.ts:45-47"]},
 {"id":"U01","tab":"shared","screen":"all collapsible sections","capability":"Per-section expand/collapse with persistence","entryPoint":"Section headers","userAction":"Click toggle","states":["open","closed"],"commandOrReadModel":"localStorage key admin_section_open_<id>","currentResult":"Layout remembered per admin per browser","destructive":false,"sourceFiles":["AdminCollapsibleSection.tsx:35-64"]},
 {"id":"U02","tab":"shared","screen":"all admin mutations","capability":"Mandatory reason for every canonical Course mutation","entryPoint":"window.prompt (reason) or the edit form reason field","userAction":"Type reason; empty aborts the command","states":["empty в†’ abort","provided"],"commandOrReadModel":"reasonExplanation in every Course intent","currentResult":"Audited reason recorded server-side","destructive":false,"sourceFiles":["CanonicalCoursesManager.tsx:836,900,1429-1435,1556,1749"]}
]
```

---

## 14. UNVERIFIABLE / OPEN ITEMS

1. **Runtime behavior was not exercised.** `AUTHENTICATED WORKFLOW: NOT VERIFIED`. No dev server
   was started, no emulator run, no tests executed. All findings are static reads of current source.
2. **Server-side implementation of each Course command** (`apply_canonical_course_provisioning_manifest`,
   `change_course_capacity`, day commands, archive/reactivate) was **not read** вЂ” only the shared-domain
   contracts and the client call sites. Specifically unverified: what `capacityPolicy:{kind:'seed_full'}`
   (`:1392`) does to `availableSeats`, and whether `change_course_capacity` can ever set capacity
   below the number of confirmed enrollments.
3. **What archive does to existing bookings/enrollments is inferred from UI copy only.** The client
   never deletes them and the confirm text says they are preserved; I did not read the
   `archive_course` function handler to confirm there is no cascade.
4. **Line numbers >3329 in `CanonicalCoursesManager.tsx`**: the file is 3329 lines. My earlier
   `Measure-Object -Line` returned 3245 (CRLF/LF counting discrepancy); the `read` tool's own
   end-of-file marker (3329) is authoritative. Section anchors are quoted from the actual read.
5. **Legacy `components/courses/CoursesManager.tsx` reachability**: no import of it exists in `src`.
   I did not check `tests/`, `e2e/`, or `functions/` for references, so I cannot say it is fully
   unreferenced repo-wide. It is definitively not mounted in Admin.
6. **Hero-slide `line3`**: `CustomHeroSlide` has `line3En`/`line3Ru` (used by `FALLBACK_SLIDES`) but
   `ResortSliderSection` renders **no line3 inputs**. Whether line3 is intentionally non-editable or
   a regression is a product decision, not a code fact. Flagged for the product owner.
7. **Error logs: no user-visible error state.** `subscribeErrorLogs`'s error callback only logs and
   clears the loading flag (`ErrorLogsPanel.tsx:41-44`). I cannot tell whether that is deliberate.
8. **"Load more logs" is limit growth, not pagination.** The UI says pagination but the
   implementation re-subscribes with a larger `limit`. Whether that is a known limitation is unverified.
9. **Translations coverage**: I verified no dedicated translation editor exists. I did not audit
   `src/lib/i18n/translations.ts` (в‰€4300+ lines) for missing or orphaned keys used by the
   rebuilt surfaces вЂ” a rebuild could silently drop keys.
10. **`getSpecialtyLabel`, `translateInstructorName`, `translateCourse`, `formatCourseDates`,
    `parseCourseDates`** were referenced but not read; their exact fallback behavior is unverified.
11. **Firestore security rules** for `resort_data/config`, `settings/*`, and `error_logs` were not read;
    whether an Admin-only role check exists for the legacy settings writes is unverified.
12. **`useAdminIdentityReadModels` instructor directory is page-size 50** (`:508`). If more than 50
    instructors exist, some are unreachable in the roster checkbox list. Unverified whether the
    component paginates.

