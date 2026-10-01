# Instructor role — code audit (alpine-air-2)

Scope: the INSTRUCTOR role only. Static code reading of `D:\SkiAcademy_DB` (React/Vite/Firebase). No dev server, no deploy, no authenticated browser verification. Fixture staging probe results supplied by the requester are used as ground truth for visible copy.

---

## A. Routes / tabs / deep links

| Item | Value | Source |
|---|---|---|
| Instructor route | `/instructor` (exact, no sub-routes) | `src/app/routes/AppRoutes.tsx:43` — `<Route path="/instructor" element={<InstructorRouteContainer />} />` |
| Route container | `InstructorRouteContainer` | `src/app/routes/InstructorRouteContainer.tsx` |
| Guard | `<InstructorRoute userProfile={…}>` | `src/features/shell/RouteGate.tsx:58-61` → `RouteGate` with `gateType="instructor"` |
| Guard rule | `RouteGate.tsx:42-44`: `gateType === 'instructor' && !isInstructorWorkspaceUser(userProfile)` → `<Navigate to="/cabinet" replace />` |
| Workspace-user predicate | `profile.role === 'admin' \|\| !!profile.isInstructor` | `src/lib/workspaceRoutes.ts:26-27` |
| Default landing for an instructor | `/instructor` | `src/lib/workspaceRoutes.ts:29-30` (`getDefaultWorkspacePath`) |
| Deep-link params | **None.** There is no `:id`, no tab segment, no query param, no sub-route for the instructor surface. Everything is a single scrollable page with in-component section state (`selectedCourseId`, `selectedCourseDayId`, `statusFilter`, `selectedChatBooking`, `evalModalState`, `feedbackEditor`). | — |
| Nav entry | `Navbar.tsx:63` `{ to: '/instructor', label: t('instructorWorkspaceTab'), active: isInstructorView }` (RU `Панель инструктора` / EN `Instructor Workspace`). Also a mobile/desktop nav item at `Navbar.tsx:376-386`. | `src/app/components/Navbar.tsx` |
| Route-scoped sync gate | `isInstructorCollaborationPath = location.pathname === '/instructor' && Boolean(userProfile?.instructorId)` | `src/store/useStoreSync.ts:63-64`, used at `:86-91` for `useBookingCollaborationReadSync({ instructorEnabled: … })` |
| Participant-progress sync gate | `const isInstructorRoute = location.pathname === '/instructor'` | `src/features/participant-progress/useParticipantProgressSync.ts:27`, effect at `:40-52` |
| Default (instructor-in-instructor) landing | `getDefaultWorkspacePath` returns `/instructor`, but Navbar brand link for `role !== 'admin'` goes there; the workspace switcher offers both `/cabinet` (`t('clientCabinet')`) and `/instructor`. | `Navbar.tsx:58-65`, `:143-147` |

Top bar (shared shell, `src/app/components/Navbar.tsx`): workspace switcher trigger (active label = `instructorWorkspaceTab`), notification bell (`t('notifications')` / `newNotifications`, badge `9+`), theme toggle, language switcher (`useLanguage().setLanguage`), logout. Balance chip renders `t('balance')` + `formatPrice(useEffectiveBalance())` at `Navbar.tsx:211-214` (desktop) and `:407-409` (mobile), `data-testid="navbar-balance"`. This is the `Баланс: 250 ₸` in the probe — it is the *account* wallet, not instructor earnings.

Loading shell: `InstructorRouteContainer.tsx:20-28` `InstructorLoadingFallback` (`Skeleton` + `CardSkeleton count={3}`), wrapped in `LazyLoad` at `:50`. `RouteGate.tsx:30-32` renders `AppInitSkeleton label={t('checkingCredentials')}` while `authLoading || profileLoading`.

`InstructorWorkspace` is lazy-loaded: `const InstructorWorkspace = React.lazy(loadInstructorWorkspace)` (`InstructorRouteContainer.tsx:18`; loader in `src/features/instructor-workspace/index.ts`).

---

## B. Daily workflow — list, grouping, "current lesson", actions before / during / after

### Section order (single page, `src/features/instructor-workspace/InstructorWorkspace.tsx:59-114`)
1. `InstructorDashboardHeader` (profile + 4 metric cards)
2. `InstructorCourseSection` (assigned courses / course days / course attendance)
3. `InstructorBookingList` (attention blocks → filters → lesson cards)
4. `InstructorStudents`
5. `InstructorReviews`
6. Portals/modals: `BookingChatModal`, `StudentSkillEvaluationModal`, `CreateProposalModal`, and the inline `InstructorParticipantLessonFeedbackEditor`.

### Listing / grouping
- Source: `useBookingCollaborationStore(selectInstructorLessonBookings)` (`InstructorRouteContainer.tsx:36`). Read model drained from **two** canonical scopes and revision-merged: `instructor_hot` + `instructor_history` — `src/features/booking-collaboration/useBookingCollaborationReadSync.ts:60-92`.
- Non-cancelled only for the visible list: `instructorBookings = mappedInstructorBookings.filter(b => b.status !== 'cancelled')` (`components/useInstructorWorkspace.ts:247-250`).
- Filter chips: `'all' | 'pending' | 'confirmed' | 'completed'` (`useInstructorWorkspace.ts:83`, rendered `InstructorBookingList.tsx:83-88`, `:206-230`; labels `allFilter` / `pending` / `confirmed` / `completed`).
- Visibility quirk (must be preserved): a booking whose lifecycle flipped to `completed` after one party marked present stays visible under the `confirmed` filter while any participant still has recordable attendance — `isInstructorBookingVisibleForStatusFilter` + `hasOutstandingInstructorLessonAttendance` (`useInstructorWorkspace.ts:85-104`, comment at `:100-102`).
- Grouping: **by lesson, not by day.** There is no date grouping/header. One `InstructorBookingCard` = one canonical Booking = one slot, rendered at `InstructorBookingList.tsx:243-286`, DOM id `instructor-lesson-${b.id}` (`InstructorBookingCard.tsx:233`).
- **Sort order = "current lesson first"**: `compareInstructorLessonDisplayOrder` ranks in-progress first (`now >= startsAt && now < endsAt` → rank 0), then upcoming (rank 1, ascending), then past (rank 2, **descending** so the most recent is first), tie-broken by `id.localeCompare` (`useInstructorWorkspace.ts:113-146`).
- "Current lesson" is **not a distinct object/flag**: it is derived from time (`getInstructorLessonScheduleRank` → rank 0). There is no "start"/"begin lesson" button.
- Clock that makes lessons "become current": `useLessonStartClock(lessonBookings)` — re-renders exactly at each lesson start (setTimeout to nearest `startsAtEpochMs`, capped at 2^31-1 ms) — `src/features/booking-collaboration/useLessonStartClock.ts`, consumed at `useInstructorWorkspace.ts:174`, `:443`.

### Attention blocks above the list (`InstructorBookingList.tsx:92-198`)
- "Needs attention / Attendance not recorded" list = `missingInWindowBookings`; each row has a **"Open attendance"** button (`instructorGoToAttendance`) that only `scrollIntoView` the lesson card (`InstructorBookingList.tsx:126-137`).
- "Needs attention / Attendance overdue" (amber) list = `overdueBookings`; each row shows `instructorAttendanceOverdueBadge`, `instructorAttendanceAdminRequired`, and a **"View lesson"** button (`instructorViewLessonReadOnly`) that likewise just scrolls (`InstructorBookingList.tsx:179-191`).

### Before a lesson
- Only two mutations are possible before start: **create proposal** (a new booking proposal for a party — `canCreateProposal` from `selectInstructorProposalPartyCandidates`, `InstructorBookingList.tsx:42-57`, `:265-283`) and **create change request** (only if `b.authorizedActions.canCreateChangeRequest`, `InstructorBookingCard.tsx:337-346`).
- Attendance buttons are rendered but **disabled** before start by server-provided `canRecordPresent/canRecordAbsent`; the client gate is `evaluateInstructorAttendanceWindow` → `before_start` → `invalid_transition` server-side.
- Progress assessment / level set / recommendations are all disabled before start with the tooltip `instructorAssessAfterLessonStart` ("Доступно после начала занятия") — `InstructorBookingCard.tsx:84-88`, `:194-225`, gate `src/features/instructor-workspace/instructorLessonProgressAssessment.ts`.

### During a lesson (rank 0)
- Attendance Present / Absent per participant; Chat with student; collaboration panel.

### After a lesson
- Attendance can be edited **only inside a 24 h window** after `endsAt` (see §C).
- Progress assessment stays enabled for `status === 'confirmed' || 'completed'` and `now >= startsAt` — i.e. it never expires client-side (`instructorLessonProgressAssessment.ts`).
- **There is no instructor "complete lesson" or "confirm lesson" action.** Translation keys `instructorConfirmLesson` ("Подтвердить занятие") and `instructorCompleteLesson` ("Завершить занятие") exist in `src/lib/i18n/translations.ts:719-720 / 3073-3074` but have **zero component references** (verified by grep across `src/`). Lifecycle terminalisation is `resolve_attendance_outcome`, which is **system/administrator only** (`functions/src/canonical/bookings/bookingAttendanceAuthorization.ts:152-166`).

---

## C. Lesson detail — every field and action

`InstructorBookingCard.tsx` renders `EnrichedBooking` (type: `useInstructorWorkspace.ts:46-79`).

### Fields rendered
| Field | Render | Key |
|---|---|---|
| `date` | header, `Calendar` icon | — |
| `time` + `durationHours` | header | — |
| `status` | `<StatusBadge status={b.status} size="xs" />` | `src/ui/StatusBadge` |
| attendance follow-up badge | amber `overdue_admin_required` / grey `missing_in_window` | `instructorAttendanceOverdueBadge`, `instructorAttendanceNotRecordedBadge`, `instructorAttendanceMissingParticipants`, `instructorAttendanceAdminRequired` (`InstructorBookingCard.tsx:248-263`) |
| participants (one row each) | avatar, name, `guestBadge` if `bookingOrigin === 'guest'`, attendance label | `instructorLessonAttendance`, `guestBadge` (`:124-132`) |
| attendance label | Present / Absent / Not recorded | `instructorAttendancePresent` / `instructorAttendanceAbsent` / `instructorAttendanceMissing` (`:78-83`) |
| `difficulty` | `formatLessonDifficultyOrUnspecified(b.difficulty, language, t('difficultyUnspecified'), 'compact')` | `instructorDifficulty` (`:280-293`) |
| `notes` (booking-level student notes, **read-only**) | italic, fallback `instructorNoNotes` | `instructorStudentNotes` (`:294-301`) |
| party: `partyKind` `individual | family_group` | not displayed; only carried in the contract (`bookingCollaborationContracts.ts:70`) |
| revision, authorizedActions | not displayed; used for optimistic concurrency | `bookingCollaborationContracts.ts:51-84` |

### Attendance marking (the core capability)
- **Canonical statuses: exactly `'present' | 'absent'`.** No third value. Defined client-side in `useInstructorWorkspace.ts:66` (`attendanceStatus?: 'present' | 'absent'`), in `src/features/instructor-workspace/instructorAttendanceOverdue.ts:6`, in `bookingCollaborationContracts.ts:77` and `:79-82`, and server-side as `AttendanceStatus` in `packages/shared-domain/src/canonical/bookingAttendancePolicy.ts`.
- **Missing ≠ absent.** `instructorLessonMissingAttendanceParticipantIds` filters rows where `attendanceStatus !== 'present' && !== 'absent'` — unknown factual status stays unknown (`instructorAttendanceOverdue.ts:12-18`).
- Command: `record_booking_attendance`, `exercisedCapability: 'instructor'`, intent `{ bookingId, participantId, attendanceStatus, expectedAttendanceRevision? }`, idempotency key derived from booking+participant+status+revision — `src/features/booking-collaboration/useBookingCollaborationCommands.ts:248-285`, `deriveRecordInstructorAttendanceIdempotencyKeys`.
- Per-row submission state key: `instructorLessonAttendanceSubmissionId(bookingId, participantId)` drives the `pending` spinner on both buttons (`InstructorBookingCard.tsx:75-77`, `:146`, `:164`).
- Success toast differentiates first record vs update: `instructorAttendanceRecorded` when `expectedAttendanceRevision === undefined`, else `instructorAttendanceUpdated`; body `instructorAttendanceSavedDesc` — `useInstructorBookingCollaboration.ts:158-164`.
- **Editable after recording?** Yes, but bounded. Server rules (`functions/src/canonical/bookings/bookingAttendanceAuthorization.ts`):
  - Instructor must be the assigned instructor (`assertInstructorCapability(envelope, booking.occurrence.instructorId)`, `:98`).
  - Booking lifecycle must be `confirmed` or `pending_cancellation`, unless terminal correction / family-group missing fill (`:65-75`).
  - Terminal correction (completed→absent, no_show→present) is **individual bookings only and explicitly forbidden for instructors** — instructors get `invalid_transition` (`:51-55`, `:92-97`).
  - Window: `evaluateInstructorAttendanceWindow`; `before_start` and `after_instructor_window` → `invalid_transition` (`:99-109`).
  - Window length: `BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS = 24h` after `endsAt` — `packages/shared-domain/src/canonical/bookingAttendancePolicy.ts:13`.
  - Re-recording an existing attendance row is allowed only if `instructorMayCorrectAttendance(...)` else `forbidden` (`:110-120`).
- **Escalation.** Client mirrors it: `instructorLessonAttendanceFollowUp` returns `none | missing_in_window | overdue_admin_required` — `none` unless status is `confirmed|completed|no_show` and something is missing; `overdue_admin_required` when `now >= endsAt + 24h`; before start → `none`; otherwise `missing_in_window` (`instructorAttendanceOverdue.ts:20-41`). Action mapping: `instructorAttendanceAction → 'record' | 'admin_required' | 'none'` (`:57-63`). When overdue, the Present/Absent buttons are **replaced** by the text `instructorAttendanceAdminRequired` — instructor has no path forward; only an administrator can resolve (`InstructorBookingCard.tsx:137-141`).
- Client enablement comes from the read model, not from a local rule: `canRecordPresent` / `canRecordAbsent` per attendance row (`bookingCollaborationContracts.ts:79-82`) → `disabled={!participant.canRecordPresent}` (`InstructorBookingCard.tsx:148`, `:167`).

### Lesson progress assessment (skill scoring)
- Command: `update_participant_progress` with `{ participantId, level, skillScores, skillComments }`, `expectedRevision`, `exercisedCapability: 'instructor'` — `src/features/participant-progress/participantProgressService.ts:55-100`.
- Idempotency: `update-participant-progress:${participantId}:${expectedRevision}` (`:21-26`).
- Called from two places: the modal save (`handleSaveStudentScores`) and the level `<select>` (`handleUpdateStudentLevel`) — `useInstructorWorkspace.ts:331-396`.
- Comment merge semantics (must be preserved): on save, old comments are merged with new ones; a comment is dropped if its item is missing from `updatedScores` **or** scored 0 (`useInstructorWorkspace.ts:341-351`).
- Notifications: `instructorRatingsSaved` + `instructorRatingsSavedDesc`; `instructorLevelUpdated` + `instructorLevelUpdatedPrefix` / `instructorLevelUpdatedTo` (`:362-366`, `:388-392`). Errors are only logged (`logger.error`), **no error toast** — `:368`, `:394`.
- Read model: `queryInstructorParticipantProgressReadModels` (`participantProgressService.ts:47-53`); store `useParticipantProgressStore.byId`, fallback `emptyParticipantProgressView(participantId)` with level 1 (`useInstructorWorkspace.ts:328-329`, `InstructorBookingCard.tsx:70-73`).
- Which participants get progress loaded (scoping rule): `instructorProgressParticipantIds` — participants of the instructor's `confirmed|completed` bookings whose `startsAtEpochMs <= now`, **plus** participants with an active, in-date, non-blocked instructor relationship (`src/features/participant-progress/instructorProgressParticipantIds.ts:7-45`). Server-side equivalent requires booking-scoped evidence: `loadInstructorProgressBookingScopedEvidence` (`functions/src/canonical/progress/participantProgressAuthorization.ts:45-77`).

### Skill assessment model
- File: `src/features/profile/components/StudentSkillEvaluationModal.tsx` (shared with cabinet; instructor opens it).
- Model: `SkillConfig` / `SkillItem` from `src/domain/achievements/skillData.ts` (`id`, `levelTarget`, `maxPoints`, section, RU/EN titles, radar dimension). `DEFAULT_SKILL_CONFIG = { passPercentage: 80, items: [...] }` (`skillData.ts:838-844`); admin-configurable via `useSettingsStore().skillConfig` (`InstructorRouteContainer.tsx:44`, passed as `skillConfig`).
- **Three stage tabs** (`levelTarget`), hard-coded labels:
  - 1 → "Beginner → Carve (Ур. 1 → 2)"
  - 2 → "Carve → Performance (Ур. 2 → 3)"
  - 3 → "Performance → Expert (Ур. 3 → 4)"
  (`StudentSkillEvaluationModal.tsx:174-206`)
- **Levels are 1–4**; level selector offers only 1/2/3/4 (`StudentLevelControls.tsx:39-42`, `InstructorStudents.tsx:89-92`). Level badge image: `https://storage.yandexcloud.net/carve/level/{b|w}/{level}.png` (`b` = light theme, `w` = dark).
- **Rating scale per item is integer points `0..maxPoints`** — `[...Array(item.maxPoints + 1)].map(...)` buttons (`:294-309`), clamped `Math.max(0, Math.min(maxPoints, val))` (`:83`).
- Level derivation: `calculateStudentLevel(scores, items, passPercentage)` — cumulative pass per stage (`:76-78`; impl `skillData.ts:846-878`). Progress bar uses `calculateSkillProgress` (`earned / max / required / pointsLeft`) (`:71-73`, impl `skillData.ts:902-950`).
- **Comment per item, shown only when score > 0** (`:322-330`), placeholder `instructorExerciseCommentPlaceholder`. Empty/whitespace comments are pruned (`:97-107`); setting score 0 deletes the comment (`:88-94`).
- Bulk actions: "Fill max" (`handleFillAllMax`) and "Clear stage" (`handleClearStage`) (`:116-133`, keys `fillMax` / `clear`).
- Summary bar keys: `earnedPoints`, `requiredToLevelUp`, `advancementStatus`, `readyToAdvance`, `pointsLeft`, `studentLevelAfterSaving`, `projectedLevel`, `levelStage`, `studentSkillEvaluation`, `saveRatings`, `clear`, `fillMax`, `noSkillItemsForLevel`.
- Toolbar: `t('cancel')`, `ActionButton` with `pending={isSaving}`, `pendingLabel={t('saving')}`.

### Notes / feedback to participant
- Two distinct features, do not conflate:
  1. **Booking notes** (`b.notes`) — the student's own booking notes. **Read-only** in the instructor card (`InstructorBookingCard.tsx:294-301`).
  2. **Lesson recommendations** (`/participant_lesson_feedback`) — instructor-authored, written *in the lesson context*, per participant. `InstructorParticipantLessonFeedbackButton` → `InstructorParticipantLessonFeedbackEditor` (`components/InstructorParticipantLessonFeedbackEditor.tsx`, portal + `BodyScrollLock`, `role="dialog"`, `aria-modal`, `aria-labelledby`).
     - Enabled only when `isLessonContextProgressAssessmentEnabled` **and** `attendanceStatus === 'present'`; otherwise tooltip `instructorAssessMarkAttendanceFirst` / `instructorAssessAfterLessonStart` (`InstructorBookingCard.tsx:207-217`).
     - List editor: numbered rows, `input type="text"` with `maxLength={PARTICIPANT_LESSON_FEEDBACK_ITEM_TEXT_MAX_LENGTH}`, Add item (`instructorAddRecommendation`) capped at `PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX`, per-row delete (`instructorRemoveRecommendation`), Save (`saveChanges` / `saving`) — `InstructorParticipantLessonFeedbackEditor.tsx:33-151`.
     - Load: `queryInstructorLessonParticipantFeedback`; Save: `saveInstructorParticipantLessonFeedback` (`save_participant_lesson_feedback`, `expectedRevision`) — `useInstructorParticipantLessonFeedbackEditor.ts:44-82`, `src/features/participant-lesson-feedback/participantLessonFeedbackService.ts:30,51-64`.
     - Save is re-entrancy guarded (`saveInFlightRef`) and generation-guarded; on `shouldRefresh` it re-queries (`:65-119`).
     - Load states: `loading | ready | error`; error shows `requestFailed` + message + `retry` (`:83-97`); save error/success inline (`instructorRecommendationsSaved`) (`:153-161`).
     - The account id used for the save comes from `useAuthStore(s => s.firebaseUser?.uid)` inside the editor (`InstructorParticipantLessonFeedbackEditor.tsx:26`) — **not** from `userProfile.uid` used elsewhere.
     - Server authorization requires booking-scoped evidence incl. recorded `present` attendance: `bookingProvidesInstructorLessonFeedbackEvidence` — `functions/src/canonical/lessonFeedback/participantLessonFeedbackAuthorization.ts:34-52`, `:54-119`.
     - Student-side copy: `instructorRecommendationsSavedDesc` = "Ученик увидит их в личном кабинете."

### Start / end transitions
- **None exposed to the instructor.** `instructorConfirmLesson` / `instructorCompleteLesson` are dead keys. Booking lifecycle is callable-only server-side; instructors can only create a proposal or a change request. Start/end are purely temporal facts used for ordering, gating and windows.

### Other lesson-scoped actions
- **Chat with student** — `instructorChatStudent` (the `instructorChatGroup` key exists but is unused, `:79`). Opens `BookingChatModal ... fromInstructorPanel` (`InstructorWorkspace.tsx:71-81`), unread dot from `ChatUnreadIndicator` + `useBookingChatUnread` (`InstructorBookingCard.tsx:306-313`, `useInstructorWorkspace.ts:252-255`), marked read on open (`:421-425`).
- In-panel instructor chat affordances: outgoing role `instructor`, "send as homework" with `homeworkAllStudents` / per-participant targeting when the party has >1 participant (`src/features/bookings/components/BookingChatModal.tsx:66-102`, `:278-316`, `:355-383`).
- **Create proposal** — `InstructorCollaborationPanel` (`components/InstructorCollaborationPanel.tsx:63-75`), gated by `canCreateProposal`; when not permitted shows `copy.proposalNotPermitted` instead of the button (`:71-75`).
- **Withdraw proposal** — only if `proposal.authorizedActions.canWithdraw` (`:88-98`); command `cancel_booking_proposal` with `exercisedCapability: 'instructor'`.
- **Create change request** — textarea + submit, only rendered when `b.authorizedActions.canCreateChangeRequest`; button disabled while `changeReason.trim()` is empty (`:124-143`). Command `create_booking_change_request` with `expectedRevision: b.revision`.
- **Withdraw change request** — if `openChangeRequest.authorizedActions.canWithdraw` (`:112-122`); command `withdraw_booking_change_request`.
- Open proposals are scoped to the booking's party (`:40-49`); empty state `collabNoOpenProposals` (`:77-79`).