# Graph Report - SkiAcademy_DB  (2026-08-13)

## Corpus Check
- 323 files · ~192,661 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1758 nodes · 5715 edges · 118 communities (89 shown, 29 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d70e7c8f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- courseLevelStyles.ts
- bookingLogic.ts
- your_journey/YourJourneySection.tsx
- studentCabinetUtils.ts
- ErrorBoundary.tsx
- skillData.ts
- bookingScheduleScope.test.ts
- StudentTodaySection.tsx
- useStoreSync.ts
- bookingStore.ts
- bookingTransactions.test.ts
- firebase.ts
- achievementConfig.ts
- useLanguage
- StudentCabinetUI.tsx
- StudentCoachPanel.tsx
- PushNotificationHub.tsx
- CoursesManager.tsx
- clearStudentBookings.ts
- ProfileSettings.tsx
- StudentCabinetShell.tsx
- useNotifications
- scripts
- UserProfile
- ClientBookingsList.tsx
- bookingTransactions.ts
- src/types.ts
- App.tsx
- AppRoutes.tsx
- Booking
- compilerOptions
- BookingChatModal.tsx
- authStore.ts
- lib/walletLedger.ts
- useBookingChatUnread.ts
- TranslationKey
- extract-coaches-manager.mjs
- useInstructorWorkspace.ts
- Language
- global-setup.ts
- dependencies
- functions/package.json
- compilerOptions
- CourseDetailsModal.tsx
- BookingAuthShell.tsx
- PersonalCabinetModals.tsx
- chatSenderRole.ts
- README.md
- StudentHistoryList.tsx
- extract-courses-manager.mjs
- courseTransactions.ts
- LanguageContext.tsx
- extract-admin-sections.mjs
- StudentHomeBottomSections.tsx
- ErrorLogsPanel.tsx
- createBookingCallable.ts
- devDependencies
- package.json
- bookingEndsAt.ts
- Auth.test.tsx
- formatDurationLabel
- useCurrency
- coachPhone.test.ts
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
- OnboardingModal.tsx
- @eslint/js
- eslint-plugin-prettier
- eslint-plugin-react
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
- SkillRadarChart.tsx
- lessonRecommendations.ts
- walletCredit.ts
- StudentProfilePersonalSection.tsx
- TodayChecklist.tsx
- bodyScrollLock.ts
- GroupCourseCard.tsx
- activityLog.ts
- Instructor
- eslint-plugin-jsx-a11y
- formatBookingDayMonth
- BookingSelectors.tsx
- eslint

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 220 edges
2. `Booking` - 151 edges
3. `UserProfile` - 129 edges
4. `Course` - 117 edges
5. `Instructor` - 85 edges
6. `TranslationKey` - 49 edges
7. `useNotifications()` - 42 edges
8. `Language` - 38 edges
9. `logger` - 38 edges
10. `SkillConfig` - 38 edges

## Surprising Connections (you probably didn't know these)
- `getTodaySessionCountdown()` --indirect_call--> `booking()`  [INFERRED]
  src/components/personal_cabinet/student/studentCabinetUtils.ts → tests/unit/todayRecommendations.test.ts
- `findTwentyHoursTimestamp()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/achievementConfig.ts → tests/unit/todayRecommendations.test.ts
- `migrateAvailabilitySlots()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/availabilityMigration.ts → tests/unit/todayRecommendations.test.ts
- `backfillCompletedBookingActivityLogs()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/backfillActivityLog.ts → tests/unit/todayRecommendations.test.ts
- `buildSyntheticWalletOperations()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/walletLedger.ts → tests/unit/todayRecommendations.test.ts

## Import Cycles
- None detected.

## Communities (118 total, 29 thin omitted)

### Community 0 - "courseLevelStyles.ts"
Cohesion: 0.07
Nodes (37): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+29 more)

### Community 1 - "bookingLogic.ts"
Cohesion: 0.06
Nodes (55): getAdminFirestore(), getOrInitApp(), ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp, autoCompletePastBookings(), BookingRecord (+47 more)

### Community 2 - "your_journey/YourJourneySection.tsx"
Cohesion: 0.11
Nodes (38): AchievementGrid(), CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, EQUAL_MARKER_STOPS, JOURNEY_BG, JOURNEY_LEVELS, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND (+30 more)

### Community 3 - "studentCabinetUtils.ts"
Cohesion: 0.07
Nodes (35): StudentInstructorsPanel(), Achievement, BookingListScope, formatActivityTimestamp(), getAchievements(), getInstructorPickerGroups(), getInstructorsForStudent(), getLessonAgeDays() (+27 more)

### Community 4 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (8): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 5 - "skillData.ts"
Cohesion: 0.14
Nodes (24): ClientSkillProgressView(), getSectionProgress(), getSkillItemRingCategory(), matchesSkillRingFilter(), SkillConfigManager(), SkillConfigManagerProps, StudentSkillEvaluationModal(), StudentSkillEvaluationModalProps (+16 more)

### Community 6 - "bookingScheduleScope.test.ts"
Cohesion: 0.16
Nodes (25): StudentCabinetHome(), addMinutesToTime(), buildLocalDateTime(), filterBookingsByScope(), getActiveCourseEnrollment(), getBookingDailyTimeWindow(), getCurrentSessions(), getFirstName() (+17 more)

### Community 7 - "StudentTodaySection.tsx"
Cohesion: 0.14
Nodes (33): LessonDetailsModal(), RecommendationIndicator(), RecommendationIndicatorProps, HistoryLessonCard(), ScDivider(), ScTextButton(), countPendingRecommendations(), enrichHistoryEventsWithActions() (+25 more)

### Community 8 - "useStoreSync.ts"
Cohesion: 0.11
Nodes (27): NotificationHubModal(), InstructorSortBy, InstructorSpecialty, TWO_WEEKS_MS, useNotifications(), DEFAULT_ACHIEVEMENTS_CONFIG, normalizeAchievementsConfig(), syncAchievementActivityLogs() (+19 more)

### Community 9 - "bookingStore.ts"
Cohesion: 0.20
Nodes (20): AdminRouteWrapper(), HomeRoute(), PersonalCabinetPage(), useBookings(), useCourses(), useInstructorFilters(), buildClonedCourse(), stripUndefinedFields() (+12 more)

### Community 10 - "bookingTransactions.test.ts"
Cohesion: 0.06
Nodes (66): CourseEnrollmentError, CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser() (+58 more)

### Community 11 - "firebase.ts"
Cohesion: 0.09
Nodes (27): FinancialOverview(), FinancialOverviewProps, FinancialOverview, Auth(), AuthProps, PRESET_SEEDS, DEFAULT_CONFIG, Currency (+19 more)

### Community 12 - "achievementConfig.ts"
Cohesion: 0.06
Nodes (51): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, AdminCollapsibleSection(), AdminCollapsibleSectionProps, FALLBACK_SLIDES, ResortDataSection(), ResortSliderSection() (+43 more)

### Community 13 - "useLanguage"
Cohesion: 0.14
Nodes (19): AuthModal(), CourseGallery(), CourseGalleryProps, InstructorCard, InstructorCardProps, InstructorReviewsModal(), LessonFilters(), LessonFiltersProps (+11 more)

### Community 14 - "StudentCabinetUI.tsx"
Cohesion: 0.12
Nodes (16): StudentBookNextFab(), StudentBookNextFabProps, SC_TINT_CARD, SC_TINT_VALUE, ScProgressBar(), ScStatGrid(), ScTint, STUDENT_BOTTOM_LEFT_TABS (+8 more)

### Community 15 - "StudentCoachPanel.tsx"
Cohesion: 0.15
Nodes (28): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+20 more)

### Community 16 - "PushNotificationHub.tsx"
Cohesion: 0.14
Nodes (18): LinkGuestBookingModal(), getAvailableMoveTimeSlots(), getAvailableScheduleDurations(), hasScheduleOverlap(), SCHEDULE_CLOSING_TIME_MINUTES, SCHEDULE_TIME_SLOTS, ActiveScheduleSlot, ActiveSlotDialog() (+10 more)

### Community 17 - "CoursesManager.tsx"
Cohesion: 0.17
Nodes (11): CoursesTable(), CoursesTableProps, CourseTableRow(), CourseTableRowProps, CoursesManager(), CoursesManagerProps, CoursesManager, getCourseLevelBadgeClass() (+3 more)

### Community 18 - "clearStudentBookings.ts"
Cohesion: 0.44
Nodes (7): clearCancelledBookings(), clearStudentBookings(), commitBatchDeletes(), deleteBookingMessages(), isStudentBooking(), resetCourseSeats(), booking()

### Community 19 - "ProfileSettings.tsx"
Cohesion: 0.18
Nodes (13): CoachesManager(), CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary (+5 more)

### Community 20 - "StudentCabinetShell.tsx"
Cohesion: 0.14
Nodes (23): BookInstructorPickerModal(), getSwipeNeighborSequence(), StudentCabinetShell(), StudentCabinetTabBar(), getSeasonBookings(), getStudentStats(), isProfileTab(), resolveStudentBottomNavTab() (+15 more)

### Community 21 - "useNotifications"
Cohesion: 0.22
Nodes (18): ScheduleCalendar(), useBookingModal(), BookingModal(), useRescheduleBooking(), PersonalCabinet(), useNotifications(), useAvailabilityMigration(), migrateAvailabilitySlots() (+10 more)

### Community 22 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 23 - "UserProfile"
Cohesion: 0.13
Nodes (30): AchievementsManagerProps, AdminPanelProps, AdminRoute(), AdminRouteProps, AuthRoute(), AuthRouteProps, ClientSkillProgressViewProps, InstructorWorkspaceInput (+22 more)

### Community 24 - "ClientBookingsList.tsx"
Cohesion: 0.13
Nodes (22): ChatUnreadIndicator(), ChatUnreadIndicatorProps, LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, UpcomingSessionsStrip(), BadgeVariant, StatusBadge(), StatusBadgeProps (+14 more)

### Community 25 - "bookingTransactions.ts"
Cohesion: 0.38
Nodes (14): blocksInstructorAvailability(), isCourseBooking(), addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, cancelBookingWithRefund(), createBookingWithPayment(), createGuestBooking() (+6 more)

### Community 26 - "src/types.ts"
Cohesion: 0.09
Nodes (24): AdminRoleManager(), AdminRoleManagerProps, BookingsLog(), BookingsLogProps, shortenBookingId(), ClientsManager(), ClientsManagerProps, CoachesManagerProps (+16 more)

### Community 27 - "App.tsx"
Cohesion: 0.12
Nodes (18): AppContent(), BookingModal, CourseDetailsModal, CourseEnrollmentModal, InstructorReviewsModal, NotificationProvider(), useResortStats(), applyDesignThemeToDOM() (+10 more)

### Community 28 - "AppRoutes.tsx"
Cohesion: 0.14
Nodes (16): AdminPanel, AppRoutes(), AppRoutesProps, CabinetRouteWrapper(), InstructorRouteWrapper(), PersonalCabinet, InstructorRoute(), InstructorRouteProps (+8 more)

### Community 29 - "Booking"
Cohesion: 0.08
Nodes (32): LinkGuestBookingModalProps, AvailableDurationsOptions, AvailableMoveTimesOptions, SCHEDULE_DURATIONS, ScheduleOverlapOptions, ChatMessageListProps, BookingOverlapWarningsProps, BookingModalInput (+24 more)

### Community 30 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 31 - "BookingChatModal.tsx"
Cohesion: 0.14
Nodes (18): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageList() (+10 more)

### Community 32 - "authStore.ts"
Cohesion: 0.19
Nodes (20): buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate(), buildRemoveTodayTaskUpdate(), buildToggleSkillTodayUpdate(), buildToggleTodayCompleteUpdate(), createCustomTodayTaskId(), getNewlyPinnedSkillTitles(), resolveCompletedTodayTaskIds() (+12 more)

### Community 33 - "lib/walletLedger.ts"
Cohesion: 0.16
Nodes (19): StudentWalletHistoryList(), formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt(), buildSyntheticWalletOperations(), buildWalletOperationHistory(), enrichWalletOperationWithBooking() (+11 more)

### Community 34 - "useBookingChatUnread.ts"
Cohesion: 0.22
Nodes (15): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), CourseChatBooking, getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey() (+7 more)

### Community 35 - "TranslationKey"
Cohesion: 0.11
Nodes (24): CoursesManagerToolbar(), CoursesManagerToolbarProps, LocalizedCompressionError, InstructorBookingCard(), InstructorBookingCardProps, InstructorNotLinked(), InstructorNotLinkedProps, InstructorRecommendationsEditor() (+16 more)

### Community 36 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "useInstructorWorkspace.ts"
Cohesion: 0.15
Nodes (15): getCourseEnrichedData(), CourseDetailsModal(), InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews(), InstructorReviewsProps (+7 more)

### Community 38 - "Language"
Cohesion: 0.24
Nodes (9): CourseInstructorSelection(), ScheduleInstructorCell(), ScheduleInstructorCellProps, ScheduleToolbar(), ScheduleToolbarProps, ScheduleViewMode, getSpecialtyLabel(), getWeekRange() (+1 more)

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
Cohesion: 0.20
Nodes (11): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, CourseEnrollAction(), CourseEnrollActionProps, CourseFAQ(), CourseFAQProps (+3 more)

### Community 44 - "BookingAuthShell.tsx"
Cohesion: 0.24
Nodes (7): AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, BookingSelectors(), GuestBookingForm(), GuestBookingFormProps

### Community 45 - "PersonalCabinetModals.tsx"
Cohesion: 0.13
Nodes (13): LazyLoad(), LazyLoadProps, ConfirmActionModal(), ConfirmActionModalProps, LevelUpModal(), LevelUpModalProps, PersonalCabinetModals(), PersonalCabinetModalsProps (+5 more)

### Community 46 - "chatSenderRole.ts"
Cohesion: 0.21
Nodes (12): ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole(), translateInstructor() (+4 more)

### Community 47 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 48 - "StudentHistoryList.tsx"
Cohesion: 0.17
Nodes (13): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+5 more)

### Community 49 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 50 - "courseTransactions.ts"
Cohesion: 0.24
Nodes (15): AdminPanel(), CourseEnrollmentModal(), ClientBookingsList(), finalizeBookingCompletion(), enrollInCourse(), isActiveCourseEnrollment(), releaseCourseSeatInTransaction(), resolveCourseIdFromBooking() (+7 more)

### Community 51 - "LanguageContext.tsx"
Cohesion: 0.33
Nodes (8): isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageContext, LanguageProvider(), TranslatedBooking, UseTranslatedBookingsOptions

### Community 52 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 53 - "StudentHomeBottomSections.tsx"
Cohesion: 0.21
Nodes (12): AnimatedNumber(), AnimatedNumberProps, ResortData, ScTintCard(), StudentCabinetWeatherSection(), StudentCabinetWeatherSectionProps, StudentLatestRecommendationSection(), ResortConditionsSidebar() (+4 more)

### Community 54 - "ErrorLogsPanel.tsx"
Cohesion: 0.17
Nodes (10): ErrorLogsPanel(), ErrorLogsPanelProps, ErrorLogsPanel, AppInitSkeleton(), CardSkeleton(), FormSkeleton(), ModalSkeleton(), SkeletonProps (+2 more)

### Community 55 - "createBookingCallable.ts"
Cohesion: 0.19
Nodes (11): BookingPaymentResult, BookingSlotOverlapError, InsufficientFundsError, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable(), isCreateBookingCallableInfrastructureError() (+3 more)

### Community 56 - "devDependencies"
Cohesion: 0.22
Nodes (9): eslint-config-prettier, devDependencies, eslint-config-prettier, tailwindcss, @tailwindcss/vite, @types/canvas-confetti, tailwindcss, @tailwindcss/vite (+1 more)

### Community 57 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, universal-analytics, private, type, version

### Community 58 - "bookingEndsAt.ts"
Cohesion: 0.42
Nodes (7): BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), parseCourseEndDateTime(), baseLesson

### Community 59 - "Auth.test.tsx"
Cohesion: 0.22
Nodes (8): mockAddNotification, mockCreateUserWithEmailAndPassword, mockGetDoc, mockMigratePreExistingProfile, mockSendPasswordResetEmail, mockSetDoc, mockSignInWithEmailAndPassword, mockSignInWithPopup

### Community 60 - "formatDurationLabel"
Cohesion: 0.26
Nodes (10): BookingOverlapWarnings(), NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain() (+2 more)

### Community 61 - "useCurrency"
Cohesion: 0.31
Nodes (6): PaymentGateway, AuthBookingForm(), AuthBookingFormProps, PaymentGateway(), PaymentGatewayProps, useCurrency()

### Community 62 - "coachPhone.test.ts"
Cohesion: 0.38
Nodes (5): BookingCallCoachButton(), normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

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
Cohesion: 0.29
Nodes (8): addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), buildHourLockIds(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap(), AvailabilitySlot

### Community 73 - "OnboardingModal.tsx"
Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 105 - "SkillRadarChart.tsx"
Cohesion: 0.19
Nodes (15): APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChart(), getLevelLabel(), getLevelProgressPercent() (+7 more)

### Community 106 - "lessonRecommendations.ts"
Cohesion: 0.24
Nodes (7): ChatWindow(), ChatWindowProps, LessonRecommendationsList(), LessonRecommendationsListProps, getRecommendationTasks(), isActiveBookingForRecommendations(), RecommendationTask

### Community 107 - "walletCredit.ts"
Cohesion: 0.36
Nodes (9): applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_USD, recordWalletLedgerEntryInTransaction() (+1 more)

### Community 108 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.24
Nodes (6): ScSectionTitle(), StudentProfilePersonalSection(), StudentProfilePersonalSectionProps, StudentProfilePreferencesSection(), StudentProfilePreferencesSectionProps, StudentSettingsCompactProps

### Community 109 - "TodayChecklist.tsx"
Cohesion: 0.53
Nodes (5): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef()

### Community 110 - "bodyScrollLock.ts"
Cohesion: 0.48
Nodes (5): applyBodyScrollLock(), BODY_SCROLL_LOCK_CLASS, lockBodyScroll(), releaseBodyScrollLock(), useBodyScrollLock()

### Community 111 - "GroupCourseCard.tsx"
Cohesion: 0.46
Nodes (6): formatCourseCardDate(), GroupCourseCard(), sortVisibleCourses(), GroupCoursesSection(), formatCourseCardDuration(), getCourseEnrollmentBooking()

### Community 112 - "activityLog.ts"
Cohesion: 0.43
Nodes (6): ACTIVITY_LOGS_COLLECTION, activityLogId, buildBookingCompletedMetadata(), logActivityForUser(), backfillCompletedBookingActivityLogs(), ActivityLogType

### Community 113 - "Instructor"
Cohesion: 0.14
Nodes (14): ScheduleCalendarProps, ActiveSlotDialogProps, ScheduleSlotActionModalProps, BookingModalHeader(), BookingModalHeaderProps, BookingChatModalProps, BookingModalProps, InstructorReviewsModalProps (+6 more)

### Community 115 - "formatBookingDayMonth"
Cohesion: 0.43
Nodes (7): formatBookingDayMonth(), getHistoryEvents(), getLegacyHistoryEvents(), getNextCalendarSession(), getNextSession(), resolveBookingStartDate(), StudentTodaySection

### Community 116 - "BookingSelectors.tsx"
Cohesion: 0.60
Nodes (4): BookingSelectorsProps, EnrichedCourseBooking, DifficultyLabelVariant, LessonDifficulty

## Knowledge Gaps
- **387 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+382 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `courseLevelStyles.ts`, `your_journey/YourJourneySection.tsx`, `studentCabinetUtils.ts`, `skillData.ts`, `bookingScheduleScope.test.ts`, `StudentTodaySection.tsx`, `useStoreSync.ts`, `bookingStore.ts`, `firebase.ts`, `achievementConfig.ts`, `StudentCabinetUI.tsx`, `StudentCoachPanel.tsx`, `PushNotificationHub.tsx`, `CoursesManager.tsx`, `ProfileSettings.tsx`, `StudentCabinetShell.tsx`, `useNotifications`, `UserProfile`, `ClientBookingsList.tsx`, `src/types.ts`, `App.tsx`, `AppRoutes.tsx`, `Booking`, `BookingChatModal.tsx`, `lib/walletLedger.ts`, `useInstructorWorkspace.ts`, `Language`, `CourseDetailsModal.tsx`, `PersonalCabinetModals.tsx`, `StudentHistoryList.tsx`, `courseTransactions.ts`, `LanguageContext.tsx`, `StudentHomeBottomSections.tsx`, `ErrorLogsPanel.tsx`, `formatDurationLabel`, `useCurrency`, `coachPhone.test.ts`, `OnboardingModal.tsx`, `SkillRadarChart.tsx`, `lessonRecommendations.ts`, `StudentProfilePersonalSection.tsx`, `TodayChecklist.tsx`, `GroupCourseCard.tsx`, `Instructor`, `formatBookingDayMonth`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `studentCabinetUtils.ts`, `bookingScheduleScope.test.ts`, `StudentTodaySection.tsx`, `useStoreSync.ts`, `bookingStore.ts`, `bookingTransactions.test.ts`, `firebase.ts`, `achievementConfig.ts`, `useLanguage`, `StudentCoachPanel.tsx`, `PushNotificationHub.tsx`, `CoursesManager.tsx`, `clearStudentBookings.ts`, `StudentCabinetShell.tsx`, `useNotifications`, `UserProfile`, `ClientBookingsList.tsx`, `bookingTransactions.ts`, `src/types.ts`, `App.tsx`, `BookingChatModal.tsx`, `lib/walletLedger.ts`, `useBookingChatUnread.ts`, `TranslationKey`, `useInstructorWorkspace.ts`, `PersonalCabinetModals.tsx`, `chatSenderRole.ts`, `StudentHistoryList.tsx`, `courseTransactions.ts`, `StudentHomeBottomSections.tsx`, `createBookingCallable.ts`, `bookingEndsAt.ts`, `coachPhone.test.ts`, `slotOverlap.ts`, `lessonRecommendations.ts`, `TodayChecklist.tsx`, `GroupCourseCard.tsx`, `activityLog.ts`, `Instructor`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `your_journey/YourJourneySection.tsx`, `studentCabinetUtils.ts`, `skillData.ts`, `StudentTodaySection.tsx`, `useStoreSync.ts`, `bookingStore.ts`, `firebase.ts`, `achievementConfig.ts`, `useLanguage`, `StudentCoachPanel.tsx`, `PushNotificationHub.tsx`, `CoursesManager.tsx`, `ProfileSettings.tsx`, `StudentCabinetShell.tsx`, `useNotifications`, `ClientBookingsList.tsx`, `src/types.ts`, `App.tsx`, `AppRoutes.tsx`, `Booking`, `BookingChatModal.tsx`, `authStore.ts`, `TranslationKey`, `useInstructorWorkspace.ts`, `CourseDetailsModal.tsx`, `PersonalCabinetModals.tsx`, `chatSenderRole.ts`, `StudentHistoryList.tsx`, `courseTransactions.ts`, `coachPhone.test.ts`, `SkillRadarChart.tsx`, `StudentProfilePersonalSection.tsx`, `GroupCourseCard.tsx`, `Instructor`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _387 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `courseLevelStyles.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07358156028368794 - nodes in this community are weakly interconnected._
- **Should `bookingLogic.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05625 - nodes in this community are weakly interconnected._
- **Should `your_journey/YourJourneySection.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1110204081632653 - nodes in this community are weakly interconnected._