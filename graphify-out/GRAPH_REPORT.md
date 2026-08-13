# Graph Report - SkiAcademy_DB (2026-08-14)

## Corpus Check

- 323 files · ~194,054 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 1774 nodes · 5775 edges · 111 communities (81 shown, 30 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `de72175e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- courseLevelStyles.ts
- bookingLogic.ts
- your_journey/YourJourneySection.tsx
- studentCabinetUtils.ts
- ErrorBoundary.tsx
- Course
- useBookingChatUnread.ts
- StudentTodaySection.tsx
- uiStore.ts
- useCourses.ts
- bookingTransactions.test.ts
- firebase.ts
- achievementConfig.ts
- chatSenderRole.ts
- StudentCabinetShell.tsx
- StudentCoachPanel.tsx
- ScheduleCalendar.tsx
- UserProfile
- AdminPanel.tsx
- walletCredit.ts
- createBooking.ts
- useBookingModal.ts
- scripts
- Booking
- ClientBookingsList.tsx
- bookingTransactions.ts
- authStore.ts
- bookingStore.ts
- App.tsx
- coachPhone.test.ts
- compilerOptions
- BookingChatModal.tsx
- todayChecklist.ts
- lib/walletLedger.ts
- index.ts
- lessonRecommendations.ts
- extract-coaches-manager.mjs
- InstructorWorkspace.tsx
- TranslationKey
- global-setup.ts
- dependencies
- functions/package.json
- compilerOptions
- CourseDetailsModal.tsx
- src/types.ts
- autoComplete.ts
- InstructorBookingCard.tsx
- README.md
- StudentCabinetUI.tsx
- extract-courses-manager.mjs
- courseTransactions.ts
- LanguageContext.tsx
- extract-admin-sections.mjs
- ResortConditionsSidebar.tsx
- useNotifications
- createBookingCallable.ts
- devDependencies
- package.json
- eslint-config-prettier
- Auth.test.tsx
- formatDurationLabel
- BookingsLog.tsx
- activityLogHistory.test.ts
- ChatMessage
- patch-admin-return.mjs
- StudentActivityRings.tsx
- declarations.d.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- slotOverlap.ts
- parseCourseDates
- @eslint/js
- eslint-plugin-prettier
- adminFirestore.test.ts
- eslint-plugin-react-hooks
- eslint-plugin-react-refresh
- @firebase/rules-unit-testing
- firebase-tools
- globals
- jsdom
- @playwright/test
- prettier
- @testing-library/jest-dom
- @testing-library/react
- @testing-library/user-event
- @types/react
- @types/react-dom
- typescript
- typescript-eslint
- vite
- @vitejs/plugin-react
- vitest
- @vitest/coverage-v8
- vitest.config.ts
- skillData.ts
- LessonFilters.tsx
- BookingSelectors.tsx
- useLanguage
- eslint-plugin-react
- eslint-plugin-jsx-a11y

## God Nodes (most connected - your core abstractions)

1. `useLanguage()` - 220 edges
2. `Booking` - 151 edges
3. `UserProfile` - 130 edges
4. `Course` - 117 edges
5. `Instructor` - 85 edges
6. `TranslationKey` - 49 edges
7. `useNotifications()` - 42 edges
8. `Language` - 38 edges
9. `logger` - 38 edges
10. `SkillConfig` - 38 edges

## Surprising Connections (you probably didn't know these)

- `getTodaySessionCountdown()` --indirect_call--> `booking()` [INFERRED]
  src/components/personal_cabinet/student/studentCabinetUtils.ts → tests/unit/todayRecommendations.test.ts
- `findTwentyHoursTimestamp()` --indirect_call--> `booking()` [INFERRED]
  src/lib/achievementConfig.ts → tests/unit/todayRecommendations.test.ts
- `migrateAvailabilitySlots()` --indirect_call--> `booking()` [INFERRED]
  src/lib/availabilityMigration.ts → tests/unit/todayRecommendations.test.ts
- `backfillCompletedBookingActivityLogs()` --indirect_call--> `booking()` [INFERRED]
  src/lib/backfillActivityLog.ts → tests/unit/todayRecommendations.test.ts
- `buildSyntheticWalletOperations()` --indirect_call--> `booking()` [INFERRED]
  src/lib/walletLedger.ts → tests/unit/todayRecommendations.test.ts

## Import Cycles

- None detected.

## Communities (111 total, 30 thin omitted)

### Community 0 - "courseLevelStyles.ts"

Cohesion: 0.07
Nodes (37): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+29 more)

### Community 1 - "bookingLogic.ts"

Cohesion: 0.17
Nodes (22): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso(), createBookingWithPayment() (+14 more)

### Community 2 - "your_journey/YourJourneySection.tsx"

Cohesion: 0.10
Nodes (40): AchievementGrid(), CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, EQUAL_MARKER_STOPS, JOURNEY_BG, JOURNEY_LEVELS, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND (+32 more)

### Community 3 - "studentCabinetUtils.ts"

Cohesion: 0.08
Nodes (49): StudentCabinetHome(), StudentCabinetHomeProps, Achievement, buildLocalDateTime(), filterBookingsByScope(), getActiveCourseEnrollment(), getBookingDailyTimeWindow(), getCurrentSessions() (+41 more)

### Community 4 - "ErrorBoundary.tsx"

Cohesion: 0.20
Nodes (8): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 5 - "Course"

Cohesion: 0.11
Nodes (12): CourseDetailsModalProps, LessonDetailsModalProps, ActiveCourseEnrollment, StudentLatestRecommendationSectionProps, UpcomingSessionsStripProps, UseRescheduleBookingOptions, Course, instructor (+4 more)

### Community 6 - "useBookingChatUnread.ts"

Cohesion: 0.24
Nodes (14): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan() (+6 more)

### Community 7 - "StudentTodaySection.tsx"

Cohesion: 0.10
Nodes (47): BookingSelectors(), formatCourseCardDate(), GroupCourseCard(), ClientBookingsList(), RecommendationIndicator(), RecommendationIndicatorProps, HistoryLessonCard(), addMinutesToTime() (+39 more)

### Community 8 - "uiStore.ts"

Cohesion: 0.20
Nodes (13): InstructorSortBy, InstructorSpecialty, TWO_WEEKS_MS, useNotifications(), DESIGN_THEMES, DesignTheme, getNotificationTimestampMs(), isNotificationExpired() (+5 more)

### Community 9 - "useCourses.ts"

Cohesion: 0.32
Nodes (7): useCourses(), BilingualNotificationContent, buildNotification(), DbNotification, StoredNotificationFields, translateKey(), QUERY_LIMITS

### Community 10 - "bookingTransactions.test.ts"

Cohesion: 0.06
Nodes (66): CourseEnrollmentError, CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser() (+58 more)

### Community 11 - "firebase.ts"

Cohesion: 0.10
Nodes (24): FinancialOverviewProps, Auth(), PRESET_SEEDS, useAvailabilityMigration(), DEFAULT_CONFIG, migrateAvailabilitySlots(), Currency, CurrencyContext (+16 more)

### Community 12 - "achievementConfig.ts"

Cohesion: 0.09
Nodes (48): AchievementsManager(), AchievementsManagerProps, createEmptyAchievement(), RULE_TYPE_OPTIONS, formatActivityTimestamp(), getAchievements(), AchievementDefinition, AchievementRule (+40 more)

### Community 13 - "chatSenderRole.ts"

Cohesion: 0.18
Nodes (13): ChatMessageList(), ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole() (+5 more)

### Community 14 - "StudentCabinetShell.tsx"

Cohesion: 0.08
Nodes (37): StudentCabinetContext, PanelProps, getSwipeNeighborSequence(), StudentCabinetShell(), StudentCabinetTabBar(), StudentCabinetTabBarProps, buildStudentHistory(), getSeasonBookings() (+29 more)

### Community 15 - "StudentCoachPanel.tsx"

Cohesion: 0.15
Nodes (28): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+20 more)

### Community 16 - "ScheduleCalendar.tsx"

Cohesion: 0.12
Nodes (26): CourseInstructorSelection(), ScheduleCalendar(), ScheduleCalendarProps, ScheduleInstructorCell(), ScheduleInstructorCellProps, AvailableDurationsOptions, AvailableMoveTimesOptions, getAvailableMoveTimeSlots() (+18 more)

### Community 17 - "UserProfile"

Cohesion: 0.11
Nodes (25): BookingsLogProps, ClientsManagerProps, CoachesManagerProps, CoursesManagerProps, LinkGuestBookingModalProps, AuthProps, ChatMessageListProps, BookingModalHeader() (+17 more)

### Community 18 - "AdminPanel.tsx"

Cohesion: 0.05
Nodes (47): AdminCollapsibleSection(), AdminCollapsibleSectionProps, AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), FALLBACK_SLIDES, ResortDataSection(), ResortSliderSection() (+39 more)

### Community 19 - "walletCredit.ts"

Cohesion: 0.30
Nodes (13): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_KZT (+5 more)

### Community 20 - "createBooking.ts"

Cohesion: 0.16
Nodes (15): BookingRecord, BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler() (+7 more)

### Community 21 - "useBookingModal.ts"

Cohesion: 0.15
Nodes (22): AuthBookingForm(), AuthBookingFormProps, AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, BookingOverlapWarnings(), GuestBookingForm() (+14 more)

### Community 22 - "scripts"

Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 23 - "Booking"

Cohesion: 0.12
Nodes (30): AdminPanelProps, ClientSkillProgressViewProps, InstructorWorkspaceInput, InstructorWorkspaceProps, PersonalCabinetModals(), PersonalCabinetModalsProps, ReviewModal(), ReviewModalProps (+22 more)

### Community 24 - "ClientBookingsList.tsx"

Cohesion: 0.27
Nodes (10): LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, BookingListScope, STATUS_LABELS, MONTHS_EN, MONTHS_RU, MONTHS_SHORT_EN, MONTHS_SHORT_RU (+2 more)

### Community 25 - "bookingTransactions.ts"

Cohesion: 0.25
Nodes (19): blocksInstructorAvailability(), isCourseBooking(), BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), addBookingWithPayment() (+11 more)

### Community 26 - "authStore.ts"

Cohesion: 0.26
Nodes (10): optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState, selectEffectiveBalance() (+2 more)

### Community 27 - "bookingStore.ts"

Cohesion: 0.15
Nodes (31): AdminRouteWrapper(), HomeRoute(), PersonalCabinetPage(), useBookings(), useInstructorFilters(), stripUndefinedFields(), parseDesignTheme(), handleFirestoreError() (+23 more)

### Community 28 - "App.tsx"

Cohesion: 0.08
Nodes (30): AppContent(), BookingModal, CourseEnrollmentModal, AdminRoute(), AdminRouteProps, AppRoutes(), AppRoutesProps, CabinetRouteWrapper() (+22 more)

### Community 29 - "coachPhone.test.ts"

Cohesion: 0.38
Nodes (5): BookingCallCoachButton(), normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 30 - "compilerOptions"

Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 31 - "BookingChatModal.tsx"

Cohesion: 0.15
Nodes (17): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+9 more)

### Community 32 - "todayChecklist.ts"

Cohesion: 0.17
Nodes (18): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate(), buildRemoveTodayTaskUpdate() (+10 more)

### Community 33 - "lib/walletLedger.ts"

Cohesion: 0.13
Nodes (23): PaymentGatewayProps, StudentWalletHistoryList(), formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), cancelBookingWithRefund(), buildSyntheticWalletOperations(), buildWalletOperationHistory() (+15 more)

### Community 34 - "index.ts"

Cohesion: 0.42
Nodes (6): getAdminFirestore(), getOrInitApp(), createBooking, scheduledAutoCompleteBookings, scheduledPurgeExpiredNotifications, purgeExpiredNotifications()

### Community 35 - "lessonRecommendations.ts"

Cohesion: 0.26
Nodes (11): InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, CourseClient, createRecommendationId(), getRecommendationTasks(), isActiveBookingForRecommendations(), LatestCoachRecommendation, RecommendationTask (+3 more)

### Community 36 - "extract-coaches-manager.mjs"

Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "InstructorWorkspace.tsx"

Cohesion: 0.19
Nodes (13): InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorNotLinked(), InstructorNotLinkedProps, InstructorReviews(), InstructorReviewsProps (+5 more)

### Community 38 - "TranslationKey"

Cohesion: 0.14
Nodes (18): CoursesManagerToolbar(), CoursesManagerToolbarProps, CoursesTable(), CoursesTableProps, CourseTableRow(), CourseTableRowProps, ScheduleToolbar(), ScheduleToolbarProps (+10 more)

### Community 39 - "global-setup.ts"

Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 40 - "dependencies"

Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 41 - "functions/package.json"

Cohesion: 0.12
Nodes (16): firebase-admin, firebase-functions, dependencies, firebase-admin, firebase-functions, devDependencies, typescript, engines (+8 more)

### Community 42 - "compilerOptions"

Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 43 - "CourseDetailsModal.tsx"

Cohesion: 0.05
Nodes (41): CourseDetailsModal, InstructorReviewsModal, AuthModal(), AuthModalProps, CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview (+33 more)

### Community 44 - "src/types.ts"

Cohesion: 0.17
Nodes (13): CoursesManager(), StatusFilter, ACTIVITY_LOGS_COLLECTION, activityLogId, buildBookingCompletedMetadata(), logActivityForUser(), backfillCompletedBookingActivityLogs(), buildClonedCourse() (+5 more)

### Community 45 - "autoComplete.ts"

Cohesion: 0.36
Nodes (8): autoCompletePastBookings(), BookingRecord, completeBooking(), isActiveCourseEnrollment(), isCourseBooking(), isEligibleForAutoComplete(), resolveCourseId(), SYSTEM_AUTO_COMPLETE_ACTOR_ID

### Community 46 - "InstructorBookingCard.tsx"

Cohesion: 0.23
Nodes (9): ChatUnreadIndicator(), ChatUnreadIndicatorProps, InstructorBookingCard(), InstructorBookingCardProps, StudentAssessButton(), StudentAssessButtonProps, DisplayBooking, EnrichedBooking (+1 more)

### Community 47 - "README.md"

Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 48 - "StudentCabinetUI.tsx"

Cohesion: 0.09
Nodes (28): SC_TINT_CARD, SC_TINT_VALUE, ScProgressBar(), ScSectionTitle(), ScStatGrid(), ScTextButton(), ScTint, ScTintCard() (+20 more)

### Community 49 - "extract-courses-manager.mjs"

Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 50 - "courseTransactions.ts"

Cohesion: 0.27
Nodes (14): CourseEnrollmentModal(), withBookingCreatedAt(), finalizeBookingCompletion(), enrollInCourse(), isActiveCourseEnrollment(), releaseCourseSeatInTransaction(), resolveCourseIdFromBooking(), getGroupCourseEnrollmentNote() (+6 more)

### Community 51 - "LanguageContext.tsx"

Cohesion: 0.33
Nodes (8): isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageContext, LanguageProvider(), TranslatedBooking, UseTranslatedBookingsOptions

### Community 52 - "extract-admin-sections.mjs"

Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 53 - "ResortConditionsSidebar.tsx"

Cohesion: 0.29
Nodes (7): AnimatedNumber(), AnimatedNumberProps, ResortData, ResortConditionsSidebar(), ResortConditionsSidebarProps, getWeatherConditionKey(), ResortConfig

### Community 54 - "useNotifications"

Cohesion: 0.16
Nodes (16): CoachesManager(), CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), ErrorLogsPanel(), ErrorLogsPanelProps, PersonalCabinet(), Notification (+8 more)

### Community 55 - "createBookingCallable.ts"

Cohesion: 0.19
Nodes (11): BookingPaymentResult, BookingSlotOverlapError, InsufficientFundsError, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable(), isCreateBookingCallableInfrastructureError() (+3 more)

### Community 56 - "devDependencies"

Cohesion: 0.22
Nodes (9): eslint, devDependencies, eslint, tailwindcss, @tailwindcss/vite, @types/canvas-confetti, tailwindcss, @tailwindcss/vite (+1 more)

### Community 57 - "package.json"

Cohesion: 0.22
Nodes (8): engines, node, name, overrides, universal-analytics, private, type, version

### Community 59 - "Auth.test.tsx"

Cohesion: 0.22
Nodes (8): mockAddNotification, mockCreateUserWithEmailAndPassword, mockGetDoc, mockMigratePreExistingProfile, mockSendPasswordResetEmail, mockSetDoc, mockSignInWithEmailAndPassword, mockSignInWithPopup

### Community 60 - "formatDurationLabel"

Cohesion: 0.30
Nodes (9): NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain(), pointsWord() (+1 more)

### Community 61 - "BookingsLog.tsx"

Cohesion: 0.14
Nodes (16): BookingsLog(), shortenBookingId(), LinkGuestBookingModal(), BookingsLog, ApplePagination(), ApplePaginationProps, BadgeVariant, StatusBadge() (+8 more)

### Community 62 - "activityLogHistory.test.ts"

Cohesion: 0.40
Nodes (3): bookings, courses, userProfile

### Community 63 - "ChatMessage"

Cohesion: 0.43
Nodes (4): buildHomeworkForUserIds(), isHomeworkVisibleToStudent(), ChatMessage, GROUP_UIDS

### Community 64 - "patch-admin-return.mjs"

Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 65 - "StudentActivityRings.tsx"

Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 66 - "declarations.d.ts"

Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 67 - "firestoreRulesGuard.test.ts"

Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 72 - "slotOverlap.ts"

Cohesion: 0.31
Nodes (7): addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), buildHourLockIds(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap()

### Community 73 - "parseCourseDates"

Cohesion: 0.60
Nodes (5): UpcomingSessionsStrip(), hasGraduatedCourse(), getHourSuffix(), formatShortBookingDate(), parseCourseDates()

### Community 76 - "adminFirestore.test.ts"

Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 105 - "skillData.ts"

Cohesion: 0.10
Nodes (38): ClientSkillProgressView(), APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChart(), getLevelLabel() (+30 more)

### Community 108 - "BookingSelectors.tsx"

Cohesion: 0.60
Nodes (4): BookingSelectorsProps, EnrichedCourseBooking, DifficultyLabelVariant, LessonDifficulty

### Community 110 - "useLanguage"

Cohesion: 0.09
Nodes (36): FinancialOverview(), ChatWindow(), ChatWindowProps, CourseEnrollAction(), sortVisibleCourses(), GroupCoursesSection(), InstructorCard, InstructorCardProps (+28 more)

## Knowledge Gaps

- **386 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+381 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `courseLevelStyles.ts`, `your_journey/YourJourneySection.tsx`, `studentCabinetUtils.ts`, `StudentTodaySection.tsx`, `uiStore.ts`, `useCourses.ts`, `firebase.ts`, `achievementConfig.ts`, `chatSenderRole.ts`, `StudentCabinetShell.tsx`, `StudentCoachPanel.tsx`, `ScheduleCalendar.tsx`, `UserProfile`, `AdminPanel.tsx`, `useBookingModal.ts`, `Booking`, `ClientBookingsList.tsx`, `authStore.ts`, `bookingStore.ts`, `App.tsx`, `coachPhone.test.ts`, `BookingChatModal.tsx`, `todayChecklist.ts`, `lib/walletLedger.ts`, `InstructorWorkspace.tsx`, `TranslationKey`, `CourseDetailsModal.tsx`, `src/types.ts`, `InstructorBookingCard.tsx`, `StudentCabinetUI.tsx`, `courseTransactions.ts`, `LanguageContext.tsx`, `ResortConditionsSidebar.tsx`, `useNotifications`, `formatDurationLabel`, `BookingsLog.tsx`, `parseCourseDates`, `skillData.ts`, `LessonFilters.tsx`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `studentCabinetUtils.ts`, `Course`, `useBookingChatUnread.ts`, `StudentTodaySection.tsx`, `useCourses.ts`, `bookingTransactions.test.ts`, `firebase.ts`, `achievementConfig.ts`, `chatSenderRole.ts`, `StudentCabinetShell.tsx`, `StudentCoachPanel.tsx`, `ScheduleCalendar.tsx`, `UserProfile`, `AdminPanel.tsx`, `useBookingModal.ts`, `ClientBookingsList.tsx`, `bookingTransactions.ts`, `bookingStore.ts`, `coachPhone.test.ts`, `BookingChatModal.tsx`, `todayChecklist.ts`, `lib/walletLedger.ts`, `lessonRecommendations.ts`, `InstructorWorkspace.tsx`, `TranslationKey`, `src/types.ts`, `InstructorBookingCard.tsx`, `StudentCabinetUI.tsx`, `courseTransactions.ts`, `useNotifications`, `createBookingCallable.ts`, `BookingsLog.tsx`, `activityLogHistory.test.ts`, `slotOverlap.ts`, `parseCourseDates`, `useLanguage`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `your_journey/YourJourneySection.tsx`, `studentCabinetUtils.ts`, `Course`, `StudentTodaySection.tsx`, `useCourses.ts`, `firebase.ts`, `achievementConfig.ts`, `chatSenderRole.ts`, `StudentCabinetShell.tsx`, `StudentCoachPanel.tsx`, `ScheduleCalendar.tsx`, `AdminPanel.tsx`, `walletCredit.ts`, `useBookingModal.ts`, `Booking`, `ClientBookingsList.tsx`, `authStore.ts`, `bookingStore.ts`, `App.tsx`, `coachPhone.test.ts`, `BookingChatModal.tsx`, `todayChecklist.ts`, `InstructorWorkspace.tsx`, `TranslationKey`, `CourseDetailsModal.tsx`, `src/types.ts`, `InstructorBookingCard.tsx`, `StudentCabinetUI.tsx`, `courseTransactions.ts`, `useNotifications`, `BookingsLog.tsx`, `activityLogHistory.test.ts`, `skillData.ts`, `useLanguage`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _386 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `courseLevelStyles.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07358156028368794 - nodes in this community are weakly interconnected._
- **Should `your_journey/YourJourneySection.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1048265460030166 - nodes in this community are weakly interconnected._
- **Should `studentCabinetUtils.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0780399274047187 - nodes in this community are weakly interconnected._
