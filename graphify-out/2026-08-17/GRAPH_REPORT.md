# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 404 files · ~201,076 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2008 nodes · 6883 edges · 118 communities (97 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f292731a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- your_journey/YourJourneySection.tsx
- useInstructorWorkspace.ts
- bookingLogic.ts
- studentCabinetUtils.ts
- useLanguage
- achievementConfig.ts
- StudentTodaySection.tsx
- StudentCabinetPanels.tsx
- useNotifications
- StudentProfilePersonalSection.tsx
- PushNotificationHub.tsx
- StudentCabinetHome.tsx
- bookingSelectors.ts
- StudentCoachPanel.tsx
- src/types.ts
- CabinetRouteContainer.tsx
- HomeRouteContainer.tsx
- HistoryLessonCard.tsx
- ui/ModalHost.tsx
- courseLevelStyles.ts
- booking.ts
- skillData.ts
- AppBootstrap.tsx
- StudentCabinetShell.tsx
- UserProfile
- scripts
- useAuthStore
- compilerOptions
- settingsStore.ts
- Navbar.tsx
- balanceOptimisticMiddleware.ts
- courseTransactions.ts
- useProfileStore
- bookingTransactions.test.ts
- lib/walletLedger.ts
- extract-coaches-manager.mjs
- HeroCarousel.tsx
- isCourseBooking
- global-setup.ts
- CourseDetailsModal.tsx
- dependencies
- compilerOptions
- chatSenderRole.ts
- CurrencyContext.tsx
- StudentHomeBottomSections.tsx
- TodayChecklist.tsx
- devDependencies
- README.md
- bookingsStore.ts
- CourseBackgroundImageField.tsx
- @types/canvas-confetti
- Booking
- StudentHistoryList.tsx
- bookingScheduleScope.test.ts
- extract-courses-manager.mjs
- extract-admin-sections.mjs
- instructor.ts
- firebase.ts
- functions/package.json
- package.json
- bookingEndsAt.ts
- bookingService.ts
- Auth.tsx
- patch-admin-return.mjs
- StudentActivityRings.tsx
- createBooking.ts
- CourseEnrollmentModal.tsx
- BookingAuthShell.tsx
- bookingTransactions.ts
- declarations.d.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- src/index.ts
- createBookingWithPayment
- eslint-plugin-react-refresh
- @firebase/rules-unit-testing
- autoComplete.ts
- @playwright/test
- prettier
- createGuestCourseEnrollment.ts
- @testing-library/jest-dom
- @testing-library/react
- ScheduleCalendar.tsx
- adminFirestore.test.ts
- typescript-eslint
- OnboardingModal.tsx
- @vitejs/plugin-react
- vitest
- formatDurationLabel
- vitest.config.ts
- AGENTS.md
- eslint-plugin-react-hooks
- tailwindcss
- LanguageContext.tsx
- InstructorWorkspace.tsx
- BodyScrollLock.tsx
- GroupCourseCard.tsx
- eslint

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 238 edges
2. `Booking` - 166 edges
3. `UserProfile` - 137 edges
4. `Course` - 129 edges
5. `Instructor` - 101 edges
6. `useProfileStore` - 51 edges
7. `TranslationKey` - 49 edges
8. `useNotifications()` - 46 edges
9. `logger` - 46 edges
10. `Review` - 42 edges

## Surprising Connections (you probably didn't know these)
- `getTodaySessionCountdown()` --indirect_call--> `booking()`  [INFERRED]
  src/components/personal_cabinet/student/studentCabinetUtils.ts → tests/unit/todayRecommendations.test.ts
- `findTwentyHoursTimestamp()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/achievementConfig.ts → tests/unit/todayRecommendations.test.ts
- `migrateAvailabilitySlots()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/availabilityMigration.ts → tests/unit/todayRecommendations.test.ts
- `buildSyntheticWalletOperations()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/walletLedger.ts → tests/unit/todayRecommendations.test.ts
- `overlapCheck()` --calls--> `hasScheduleOverlap()`  [EXTRACTED]
  tests/unit/scheduleOverlap.test.ts → src/components/admin/scheduleOverlap.ts

## Import Cycles
- None detected.

## Communities (118 total, 21 thin omitted)

### Community 0 - "your_journey/YourJourneySection.tsx"
Cohesion: 0.11
Nodes (40): AchievementGrid(), CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, EQUAL_MARKER_STOPS, JOURNEY_BG, JOURNEY_LEVELS, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND (+32 more)

### Community 1 - "useInstructorWorkspace.ts"
Cohesion: 0.10
Nodes (26): InstructorBookingCard(), InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, InstructorReviews() (+18 more)

### Community 2 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 3 - "studentCabinetUtils.ts"
Cohesion: 0.07
Nodes (35): Achievement, formatActivityTimestamp(), formatBookingDayMonth(), getAchievements(), getHistoryEvents(), getLegacyHistoryEvents(), getLessonAgeDays(), getNextCalendarSession() (+27 more)

### Community 4 - "useLanguage"
Cohesion: 0.10
Nodes (22): AdminCollapsibleSection(), AdminCollapsibleSectionProps, LinkGuestBookingModal(), ActiveSlotCreateForm(), ActiveSlotMoveForm(), ScheduleSlotActionModal, ScheduleSlotActionModalHandle, ChatInput() (+14 more)

### Community 5 - "achievementConfig.ts"
Cohesion: 0.09
Nodes (46): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, AchievementDefinition, AchievementRule, AchievementRuleType, applySkillDeltas(), bookingTimestamp() (+38 more)

### Community 6 - "StudentTodaySection.tsx"
Cohesion: 0.13
Nodes (19): ChatUnreadIndicator(), ChatUnreadIndicatorProps, LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, RecommendationIndicator(), RecommendationIndicatorProps, ScTextButton(), BookingListScope (+11 more)

### Community 7 - "StudentCabinetPanels.tsx"
Cohesion: 0.14
Nodes (22): FinancialOverview(), CourseEnrollAction(), sortVisibleCourses(), GroupCoursesSection(), InstructorCard, InstructorCardProps, BookInstructorPickerModal(), StudentCoursesPanel() (+14 more)

### Community 8 - "useNotifications"
Cohesion: 0.11
Nodes (21): AdminPanel, AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), CoachesManager(), ErrorLogsPanelProps, AdminPanel(), AdminRoleManager (+13 more)

### Community 9 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.18
Nodes (9): optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary, StudentProfilePersonalSection(), StudentProfilePersonalSectionProps, StudentSettingsCompactProps, useEffectiveBalance() (+1 more)

### Community 10 - "PushNotificationHub.tsx"
Cohesion: 0.17
Nodes (16): SystemSettings(), Notification, NotificationContext, NotificationContextType, NotificationHubModal(), useNotificationsSync(), TWO_WEEKS_MS, useNotifications() (+8 more)

### Community 11 - "StudentCabinetHome.tsx"
Cohesion: 0.16
Nodes (29): AchievementsManagerProps, SystemSettingsProps, AdminPanelProps, InstructorWorkspaceInput, InstructorReviewsModalProps, PersonalCabinetModalsProps, HistoryLessonCardProps, StudentCabinetContext (+21 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.06
Nodes (65): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatMessageRow, ChatWindow(), MediaUploader() (+57 more)

### Community 14 - "src/types.ts"
Cohesion: 0.07
Nodes (19): CoursesTable(), CoursesManager(), ModalState, ModalType, buildClonedCourse(), bookings, courses, userProfile (+11 more)

### Community 15 - "CabinetRouteContainer.tsx"
Cohesion: 0.17
Nodes (10): PersonalCabinet, InstructorWorkspace, LazyLoad(), LazyLoadProps, AppInitSkeleton(), CardSkeleton(), Skeleton(), SkeletonProps (+2 more)

### Community 16 - "HomeRouteContainer.tsx"
Cohesion: 0.18
Nodes (23): AppShell(), FeaturePageShell(), FeaturePageShellProps, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), HomeRouteContainer(), InstructorRouteContainer() (+15 more)

### Community 17 - "HistoryLessonCard.tsx"
Cohesion: 0.22
Nodes (23): ClientBookingsList(), LessonDetailsModal(), HistoryLessonCard(), ScDivider(), countPendingRecommendations(), enrichHistoryEventsWithActions(), formatCourseDateRangeLabel(), formatRecentLessonDateLabel() (+15 more)

### Community 18 - "ui/ModalHost.tsx"
Cohesion: 0.14
Nodes (14): ModalHostHandleDeleteNotification, ModalSkeleton(), clearNotificationsService(), deleteNotificationService(), markNotificationsAsReadService(), useDbNotifications(), useUnreadNotificationCount(), useNotificationsStore (+6 more)

### Community 19 - "courseLevelStyles.ts"
Cohesion: 0.06
Nodes (50): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+42 more)

### Community 20 - "booking.ts"
Cohesion: 0.19
Nodes (20): useBookingModal(), BookingModal(), useRescheduleBooking(), migrateAvailabilitySlots(), AVAILABILITY_MIGRATION_SETTING, AVAILABILITY_SLOTS_COLLECTION, blocksInstructorAvailability(), DEFAULT_LESSON_TIME_SLOTS (+12 more)

### Community 21 - "skillData.ts"
Cohesion: 0.10
Nodes (39): ClientSkillProgressView(), APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChart(), getLevelLabel() (+31 more)

### Community 22 - "AppBootstrap.tsx"
Cohesion: 0.29
Nodes (8): AppBootstrap(), AppBootstrapProps, useSettingsSync(), applyDesignThemeToDOM(), DESIGN_THEMES, parseDesignTheme(), registerFirestoreErrorListener(), setStoreContext()

### Community 23 - "StudentCabinetShell.tsx"
Cohesion: 0.08
Nodes (40): StudentCalendarPanel(), getSwipeNeighborSequence(), StudentCabinetShell(), SC_TINT_CARD, SC_TINT_VALUE, ScProgressBar(), ScStatGrid(), ScTint (+32 more)

### Community 24 - "UserProfile"
Cohesion: 0.08
Nodes (32): BookingsLogProps, ClientsManagerProps, CoachesManagerProps, CoursesManagerProps, LinkGuestBookingModalProps, ActiveSlotCreateFormProps, ActiveSlotDetailsProps, ActiveSlotMoveFormProps (+24 more)

### Community 25 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 26 - "useAuthStore"
Cohesion: 0.15
Nodes (18): ErrorLogsPanel(), signOutService(), AuthState, useAuthStore, useSessionSync(), useBookingsSync(), useCoursesSync(), useCurrentUserProfileSync() (+10 more)

### Community 27 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 28 - "settingsStore.ts"
Cohesion: 0.36
Nodes (9): useAchievementsSync(), saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled(), saveSkillConfig(), useSettingsStore (+1 more)

### Community 29 - "Navbar.tsx"
Cohesion: 0.17
Nodes (13): Logo(), LogoProps, Navbar(), NavbarProps, AdminRoute(), AuthRoute(), InstructorRoute(), RouteGate() (+5 more)

### Community 31 - "courseTransactions.ts"
Cohesion: 0.23
Nodes (18): enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), STATUS_LABELS, translateCourse(), getGroupScheduleLabel(), MONTHS_EN, MONTHS_RU (+10 more)

### Community 32 - "useProfileStore"
Cohesion: 0.20
Nodes (20): useAvailabilityMigrationSync(), addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService(), updateUserRoleService(), useProfileStore (+12 more)

### Community 34 - "bookingTransactions.test.ts"
Cohesion: 0.06
Nodes (68): CourseEnrollmentError, CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser() (+60 more)

### Community 35 - "lib/walletLedger.ts"
Cohesion: 0.16
Nodes (20): PaymentGatewayProps, formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt(), buildSyntheticWalletOperations(), buildWalletOperationHistory(), enrichWalletOperationWithBooking() (+12 more)

### Community 36 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "HeroCarousel.tsx"
Cohesion: 0.31
Nodes (9): FALLBACK_SLIDES, buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps, resolveSlideBackground(), shuffleSlides(), Theme (+1 more)

### Community 38 - "isCourseBooking"
Cohesion: 0.44
Nodes (6): isCourseBooking(), cancelBookingWithRefund(), finalizeBookingCompletion(), isActiveCourseEnrollment(), releaseCourseSeatInTransaction(), resolveCourseIdFromBooking()

### Community 39 - "global-setup.ts"
Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 40 - "CourseDetailsModal.tsx"
Cohesion: 0.18
Nodes (13): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseFAQ(), CourseFAQProps, CourseGallery() (+5 more)

### Community 41 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 42 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 43 - "chatSenderRole.ts"
Cohesion: 0.18
Nodes (13): ChatMessageList(), ChatMessageListProps, ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName() (+5 more)

### Community 44 - "CurrencyContext.tsx"
Cohesion: 0.13
Nodes (14): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, NotificationProvider(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk() (+6 more)

### Community 45 - "StudentHomeBottomSections.tsx"
Cohesion: 0.21
Nodes (11): AnimatedNumber(), AnimatedNumberProps, ScSectionTitle(), ScTintCard(), StudentCabinetWeatherSection(), StudentCabinetWeatherSectionProps, StudentLatestRecommendationSection(), ResortConditionsSidebar() (+3 more)

### Community 46 - "TodayChecklist.tsx"
Cohesion: 0.48
Nodes (6): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), TodayTaskRef

### Community 47 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, jsdom (+23 more)

### Community 48 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 49 - "bookingsStore.ts"
Cohesion: 0.15
Nodes (7): DeletedCompletedStats, useBookingStore, useWalletStore, adminProfile, confirmedBooking, firebaseUser, {
  mockCancelBookingWithRefund,
  mockAddNotification,
  mockCreateNotificationForUser,
  mockHandleFirestoreError,
}

### Community 50 - "CourseBackgroundImageField.tsx"
Cohesion: 0.60
Nodes (3): CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage()

### Community 52 - "Booking"
Cohesion: 0.17
Nodes (19): AvailableDurationsOptions, AvailableMoveTimesOptions, ScheduleOverlapOptions, BookingChatModalProps, CourseEnrollActionProps, GroupCourseCardProps, GroupCoursesSectionProps, LessonDetailsModalProps (+11 more)

### Community 53 - "StudentHistoryList.tsx"
Cohesion: 0.27
Nodes (10): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+2 more)

### Community 55 - "bookingScheduleScope.test.ts"
Cohesion: 0.16
Nodes (25): StudentCabinetHome(), addMinutesToTime(), buildLocalDateTime(), filterBookingsByScope(), getActiveCourseEnrollment(), getBookingDailyTimeWindow(), getCurrentSessions(), getFirstName() (+17 more)

### Community 56 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 57 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 58 - "instructor.ts"
Cohesion: 0.18
Nodes (15): CoursesManagerToolbar(), CoursesManagerToolbarProps, CoursesTableProps, CourseTableRow(), CourseTableRowProps, ScheduleInstructorCellProps, ScheduleToolbarProps, LocalizedCompressionError (+7 more)

### Community 59 - "firebase.ts"
Cohesion: 0.11
Nodes (19): FinancialOverviewProps, ResortDataSection(), ResortSliderSection(), StudentProfilePreferencesSectionProps, ToggleSwitch(), ToggleSwitchProps, FormSkeleton(), DEFAULT_CONFIG (+11 more)

### Community 60 - "functions/package.json"
Cohesion: 0.12
Nodes (16): firebase-admin, firebase-functions, dependencies, firebase-admin, firebase-functions, devDependencies, typescript, engines (+8 more)

### Community 61 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, universal-analytics, private, type, version

### Community 62 - "bookingEndsAt.ts"
Cohesion: 0.42
Nodes (7): BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), parseCourseEndDateTime(), baseLesson

### Community 63 - "bookingService.ts"
Cohesion: 0.06
Nodes (75): useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService(), createBookingForUser() (+67 more)

### Community 64 - "Auth.tsx"
Cohesion: 0.15
Nodes (13): Auth(), AuthProps, PRESET_SEEDS, googleProvider, migratePreExistingProfile(), mockAddNotification, mockCreateUserWithEmailAndPassword, mockGetDoc (+5 more)

### Community 65 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 67 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 68 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 69 - "CourseEnrollmentModal.tsx"
Cohesion: 0.36
Nodes (6): CourseEnrollmentModal(), CourseEnrollmentModal, createGuestCourseEnrollment, createGuestCourseEnrollmentViaCallable(), GuestCourseEnrollmentInput, GuestCourseEnrollmentResult

### Community 70 - "BookingAuthShell.tsx"
Cohesion: 0.15
Nodes (13): AuthBookingForm(), AuthBookingFormProps, AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, BookingOverlapWarnings(), BookingSelectors() (+5 more)

### Community 71 - "bookingTransactions.ts"
Cohesion: 0.18
Nodes (26): addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, createBookingWithPayment(), createGuestBooking(), loadInstructorSlotRefs(), rescheduleBooking(), resolveBookingTotalPrice() (+18 more)

### Community 72 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 73 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 79 - "src/index.ts"
Cohesion: 0.35
Nodes (8): getAdminFirestore(), getOrInitApp(), createBooking, createGuestCourseEnrollment, enrollInCourse, scheduledAutoCompleteBookings, scheduledPurgeExpiredNotifications, purgeExpiredNotifications()

### Community 80 - "createBookingWithPayment"
Cohesion: 0.31
Nodes (9): createBookingWithPayment(), EnrollCourseInput, enrollInCourseHandler(), parseInput(), recordWalletLedgerEntryInTransaction(), WALLET_LEDGER_COLLECTION, WalletLedgerEntry, walletLedgerEntryId() (+1 more)

### Community 83 - "autoComplete.ts"
Cohesion: 0.36
Nodes (8): autoCompletePastBookings(), BookingRecord, completeBooking(), isActiveCourseEnrollment(), isCourseBooking(), isEligibleForAutoComplete(), resolveCourseId(), SYSTEM_AUTO_COMPLETE_ACTOR_ID

### Community 88 - "createGuestCourseEnrollment.ts"
Cohesion: 0.43
Nodes (6): CourseRecord, createGuestCourseEnrollmentHandler(), GuestCourseEnrollmentInput, optionalText(), parseInput(), requireText()

### Community 91 - "ScheduleCalendar.tsx"
Cohesion: 0.14
Nodes (20): BookingsLog(), shortenBookingId(), ActiveSlotDetails(), ScheduleCalendar(), ScheduleToolbar(), ScheduleViewMode, getWeekRange(), BookingsLog (+12 more)

### Community 92 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 94 - "OnboardingModal.tsx"
Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 97 - "formatDurationLabel"
Cohesion: 0.30
Nodes (9): NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain(), pointsWord() (+1 more)

### Community 118 - "LanguageContext.tsx"
Cohesion: 0.13
Nodes (18): ConfirmActionModal(), ConfirmActionModalProps, LevelUpModal(), LevelUpModalProps, PersonalCabinetModals(), RescheduleModal(), RescheduleModalProps, ReviewModal() (+10 more)

### Community 119 - "InstructorWorkspace.tsx"
Cohesion: 0.14
Nodes (4): InstructorNotLinked(), InstructorNotLinkedProps, BookingsPanelProps, InstructorWorkspaceProps

### Community 120 - "BodyScrollLock.tsx"
Cohesion: 0.14
Nodes (14): AuthModal(), AuthModalProps, ChatWindowProps, InstructorReviewsModal(), PaymentGateway(), LessonRecommendationsList(), LessonRecommendationsListProps, BodyScrollLock() (+6 more)

### Community 123 - "GroupCourseCard.tsx"
Cohesion: 0.36
Nodes (7): formatCourseCardDate(), GroupCourseCard(), formatCourseCardDuration(), getCourseEnrollmentBooking(), getRecommendationTasks(), isActiveBookingForRecommendations(), RecommendationTask

## Knowledge Gaps
- **401 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+396 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `your_journey/YourJourneySection.tsx`, `useInstructorWorkspace.ts`, `studentCabinetUtils.ts`, `achievementConfig.ts`, `StudentTodaySection.tsx`, `StudentCabinetPanels.tsx`, `useNotifications`, `StudentProfilePersonalSection.tsx`, `PushNotificationHub.tsx`, `StudentCabinetHome.tsx`, `StudentCoachPanel.tsx`, `src/types.ts`, `CabinetRouteContainer.tsx`, `HomeRouteContainer.tsx`, `HistoryLessonCard.tsx`, `ui/ModalHost.tsx`, `courseLevelStyles.ts`, `booking.ts`, `skillData.ts`, `AppBootstrap.tsx`, `StudentCabinetShell.tsx`, `UserProfile`, `useAuthStore`, `Navbar.tsx`, `HeroCarousel.tsx`, `CourseDetailsModal.tsx`, `chatSenderRole.ts`, `StudentHomeBottomSections.tsx`, `TodayChecklist.tsx`, `CourseBackgroundImageField.tsx`, `Booking`, `StudentHistoryList.tsx`, `bookingScheduleScope.test.ts`, `firebase.ts`, `Auth.tsx`, `CourseEnrollmentModal.tsx`, `ScheduleCalendar.tsx`, `OnboardingModal.tsx`, `formatDurationLabel`, `LanguageContext.tsx`, `InstructorWorkspace.tsx`, `BodyScrollLock.tsx`, `GroupCourseCard.tsx`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `useInstructorWorkspace.ts`, `studentCabinetUtils.ts`, `useLanguage`, `achievementConfig.ts`, `StudentTodaySection.tsx`, `StudentCabinetPanels.tsx`, `useNotifications`, `PushNotificationHub.tsx`, `StudentCabinetHome.tsx`, `bookingSelectors.ts`, `StudentCoachPanel.tsx`, `src/types.ts`, `HistoryLessonCard.tsx`, `courseLevelStyles.ts`, `booking.ts`, `StudentCabinetShell.tsx`, `UserProfile`, `useAuthStore`, `courseTransactions.ts`, `bookingTransactions.test.ts`, `lib/walletLedger.ts`, `isCourseBooking`, `chatSenderRole.ts`, `StudentHomeBottomSections.tsx`, `TodayChecklist.tsx`, `bookingsStore.ts`, `StudentHistoryList.tsx`, `bookingScheduleScope.test.ts`, `instructor.ts`, `bookingEndsAt.ts`, `bookingService.ts`, `bookingTransactions.ts`, `ScheduleCalendar.tsx`, `LanguageContext.tsx`, `InstructorWorkspace.tsx`, `BodyScrollLock.tsx`, `GroupCourseCard.tsx`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `your_journey/YourJourneySection.tsx`, `useInstructorWorkspace.ts`, `studentCabinetUtils.ts`, `useLanguage`, `achievementConfig.ts`, `StudentTodaySection.tsx`, `StudentCabinetPanels.tsx`, `useNotifications`, `StudentProfilePersonalSection.tsx`, `PushNotificationHub.tsx`, `StudentCabinetHome.tsx`, `StudentCoachPanel.tsx`, `src/types.ts`, `booking.ts`, `skillData.ts`, `StudentCabinetShell.tsx`, `useAuthStore`, `Navbar.tsx`, `courseTransactions.ts`, `useProfileStore`, `CourseDetailsModal.tsx`, `chatSenderRole.ts`, `bookingsStore.ts`, `Booking`, `instructor.ts`, `firebase.ts`, `bookingService.ts`, `Auth.tsx`, `CourseEnrollmentModal.tsx`, `bookingTransactions.ts`, `ScheduleCalendar.tsx`, `LanguageContext.tsx`, `InstructorWorkspace.tsx`, `BodyScrollLock.tsx`, `GroupCourseCard.tsx`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _401 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `your_journey/YourJourneySection.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10558069381598793 - nodes in this community are weakly interconnected._
- **Should `useInstructorWorkspace.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10160427807486631 - nodes in this community are weakly interconnected._
- **Should `studentCabinetUtils.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07439024390243902 - nodes in this community are weakly interconnected._