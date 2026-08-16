# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 402 files · ~201,234 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2042 nodes · 6973 edges · 109 communities (89 shown, 20 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7f42f404`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- CoachesManager.tsx
- InstructorBookingCard.tsx
- bookingLogic.ts
- studentCabinetUtils.ts
- BookingChatModal.tsx
- achievementConfig.ts
- Auth.tsx
- LanguageContext.tsx
- useBookingModal.ts
- lib/walletLedger.ts
- useCourseActions.ts
- Booking
- useBookingChatUnread.ts
- StudentCoachPanel.tsx
- StudentProfilePersonalSection.tsx
- chatSenderRole.ts
- ui/ModalHost.tsx
- StudentTodaySection.tsx
- PushNotificationHub.tsx
- CoursesManager.tsx
- useBookingModal
- CurrencyContext.tsx
- useBookings.cancel.test.tsx
- useLanguage
- skillData.ts
- scripts
- logger.ts
- compilerOptions
- settingsStore.ts
- courseLevelStyles.ts
- balanceOptimisticMiddleware.ts
- CourseBackgroundImageField.tsx
- useProfileStore
- bookingTransactions.test.ts
- useNotifications
- extract-coaches-manager.mjs
- AdminPanel.tsx
- global-setup.ts
- CourseDetailsModal.tsx
- dependencies
- compilerOptions
- useInstructorWorkspace.ts
- ErrorBoundary.tsx
- courseTransactions.ts
- Navbar.tsx
- devDependencies
- README.md
- BookingsLog.tsx
- booking.ts
- ScheduleCalendar.tsx
- StudentHistoryList.tsx
- src/types.ts
- extract-courses-manager.mjs
- extract-admin-sections.mjs
- RouteGate.tsx
- functions/package.json
- package.json
- ResortConditionsSidebar.tsx
- bookingService.ts
- eslint-plugin-react-refresh
- patch-admin-return.mjs
- Auth.test.tsx
- StudentActivityRings.tsx
- createBooking.ts
- TodayChecklist.tsx
- declarations.d.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- chatService.ts
- src/index.ts
- createBookingWithPayment
- @firebase/rules-unit-testing
- autoComplete.ts
- @playwright/test
- prettier
- createGuestCourseEnrollment.ts
- @testing-library/jest-dom
- @testing-library/react
- ChatMessage
- adminFirestore.test.ts
- typescript-eslint
- @vitejs/plugin-react
- vitest
- vitest.config.ts
- AGENTS.md
- eslint-plugin-react-hooks
- tailwindcss
- bookingsStore.ts
- jsdom
- eslint

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 236 edges
2. `Booking` - 166 edges
3. `UserProfile` - 135 edges
4. `Course` - 129 edges
5. `Instructor` - 101 edges
6. `useProfileStore` - 56 edges
7. `TranslationKey` - 49 edges
8. `useNotifications()` - 45 edges
9. `logger` - 42 edges
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

## Communities (109 total, 20 thin omitted)

### Community 0 - "CoachesManager.tsx"
Cohesion: 0.20
Nodes (12): CoachesManager(), CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, ScheduleInstructorCell(), formatDateLocalYMD(), getSpecialtyLabel() (+4 more)

### Community 1 - "InstructorBookingCard.tsx"
Cohesion: 0.15
Nodes (16): InstructorBookingCard(), InstructorBookingCardProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, StudentAssessButton(), StudentAssessButtonProps, StudentLevelControls(), StudentLevelControlsProps (+8 more)

### Community 2 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 3 - "studentCabinetUtils.ts"
Cohesion: 0.06
Nodes (60): StudentCabinetHome(), StudentCabinetHomeProps, Achievement, addMinutesToTime(), BookingListScope, buildLocalDateTime(), filterBookingsByScope(), getActiveCourseEnrollment() (+52 more)

### Community 4 - "BookingChatModal.tsx"
Cohesion: 0.15
Nodes (17): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+9 more)

### Community 5 - "achievementConfig.ts"
Cohesion: 0.08
Nodes (48): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, formatActivityTimestamp(), getAchievements(), getTodayAchievements(), isTimestampOnLocalDate(), parseActivityTimestamp() (+40 more)

### Community 6 - "Auth.tsx"
Cohesion: 0.22
Nodes (15): Auth(), AuthProps, PRESET_SEEDS, AuthModal(), AuthModalProps, getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService() (+7 more)

### Community 7 - "LanguageContext.tsx"
Cohesion: 0.12
Nodes (24): CoursesManagerToolbar(), CoursesManagerToolbarProps, ScheduleInstructorCellProps, ScheduleToolbar(), ScheduleToolbarProps, ScheduleViewMode, LocalizedCompressionError, BookingModalHeaderProps (+16 more)

### Community 8 - "useBookingModal.ts"
Cohesion: 0.38
Nodes (10): useRescheduleBooking(), getInstructorAvailabilitySlots(), DEFAULT_LESSON_TIME_SLOTS, fitsLessonDaySchedule(), isBookingSlotInPast(), LESSON_DAY_END_MINUTES, timeStrToMinutes(), toAvailabilitySlot() (+2 more)

### Community 9 - "lib/walletLedger.ts"
Cohesion: 0.07
Nodes (47): ActiveSlotCreateForm(), PaymentGateway(), PaymentGatewayProps, NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, StudentWalletHistoryList(), TrainingStreak() (+39 more)

### Community 10 - "useCourseActions.ts"
Cohesion: 0.20
Nodes (14): getCurrentAuthenticatedUser(), deleteCourseService(), updateCourseService(), useNotificationsSync(), getNotificationTimestampMs(), isNotificationExpired(), purgeExpiredNotificationsForUser(), getNotificationRetentionMs() (+6 more)

### Community 11 - "Booking"
Cohesion: 0.07
Nodes (74): AchievementsManagerProps, BookingsLogProps, ClientsManagerProps, CoachesManagerProps, CoursesTableProps, CourseTableRowProps, CoursesManagerProps, LinkGuestBookingModalProps (+66 more)

### Community 12 - "useBookingChatUnread.ts"
Cohesion: 0.24
Nodes (14): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan() (+6 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.15
Nodes (28): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+20 more)

### Community 14 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.15
Nodes (10): optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary, StudentProfilePersonalSection(), StudentProfilePersonalSectionProps, StudentProfilePreferencesSection(), StudentProfilePreferencesSectionProps (+2 more)

### Community 15 - "chatSenderRole.ts"
Cohesion: 0.18
Nodes (13): ChatMessageList(), ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole() (+5 more)

### Community 16 - "ui/ModalHost.tsx"
Cohesion: 0.12
Nodes (28): AppShell(), AdminRouteContainer(), CabinetRouteContainer(), PersonalCabinet, HomeRouteContainer(), InstructorRouteContainer(), AppRoutesProps, ResortData (+20 more)

### Community 17 - "StudentTodaySection.tsx"
Cohesion: 0.11
Nodes (42): ChatUnreadIndicator(), ChatUnreadIndicatorProps, formatCourseCardDate(), GroupCourseCard(), ClientBookingsList(), LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, RecommendationIndicator() (+34 more)

### Community 18 - "PushNotificationHub.tsx"
Cohesion: 0.11
Nodes (22): FeaturePageShell(), FeaturePageShellProps, AppRoutes(), Notification, NotificationContext, NotificationContextType, NotificationHubModal(), NotificationProvider() (+14 more)

### Community 19 - "CoursesManager.tsx"
Cohesion: 0.14
Nodes (19): CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps, CourseInstructorSelection(), CourseInstructorSelectionProps, CourseRichDetailsSection(), CourseRichDetailsSectionProps (+11 more)

### Community 20 - "useBookingModal"
Cohesion: 0.21
Nodes (13): AuthBookingForm(), AuthBookingFormProps, BookingAuthShell(), BookingAuthShellProps, BookingModalHeader(), BookingOverlapWarnings(), BookingSelectors(), GuestBookingForm() (+5 more)

### Community 21 - "CurrencyContext.tsx"
Cohesion: 0.22
Nodes (9): FinancialOverview(), FinancialOverviewProps, FinancialOverview, saveUsdToKztRate(), Currency, CurrencyContext, CurrencyContextType, CurrencyProvider() (+1 more)

### Community 22 - "useBookings.cancel.test.tsx"
Cohesion: 0.15
Nodes (15): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState, useWalletStore (+7 more)

### Community 23 - "useLanguage"
Cohesion: 0.06
Nodes (66): ApplePagination(), ApplePaginationProps, sortVisibleCourses(), GroupCoursesSection(), InstructorReviewsModal(), BookInstructorPickerModal(), StudentBookNextFab(), StudentBookNextFabProps (+58 more)

### Community 24 - "skillData.ts"
Cohesion: 0.05
Nodes (77): ClientSkillProgressView(), APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChart(), getLevelLabel() (+69 more)

### Community 25 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 26 - "logger.ts"
Cohesion: 0.13
Nodes (26): AuthState, useAuthStore, useSessionSync(), useBookingsSync(), useCoursesSync(), useAchievementsSync(), useCurrentUserProfileSync(), useProfileActivitySync() (+18 more)

### Community 27 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 28 - "settingsStore.ts"
Cohesion: 0.19
Nodes (19): AppBootstrap(), AppBootstrapProps, saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled(), saveSkillConfig() (+11 more)

### Community 29 - "courseLevelStyles.ts"
Cohesion: 0.16
Nodes (15): CourseHeader(), CourseHeaderProps, adminBadgeClass, cardTextClass, CourseLevel, courseLevelBadgeLabel, courseLevelColors, getCourseLevelCardBadgeClass() (+7 more)

### Community 31 - "CourseBackgroundImageField.tsx"
Cohesion: 0.29
Nodes (5): CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), storage, uploadImage()

### Community 32 - "useProfileStore"
Cohesion: 0.15
Nodes (20): addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService(), updateUserRoleService(), ProfileState, useProfileStore (+12 more)

### Community 34 - "bookingTransactions.test.ts"
Cohesion: 0.05
Nodes (78): useAvailabilityMigrationSync(), migrateAvailabilitySlots(), AVAILABILITY_MIGRATION_SETTING, AVAILABILITY_SLOTS_COLLECTION, cancelBookingWithRefund(), addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId() (+70 more)

### Community 35 - "useNotifications"
Cohesion: 0.17
Nodes (14): AuthModeSliderSwitch(), AuthModeSliderSwitchProps, CourseEnrollAction(), CourseEnrollmentModal(), InstructorCard, PersonalCabinet(), useNotifications(), useReviewFlow() (+6 more)

### Community 36 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "AdminPanel.tsx"
Cohesion: 0.06
Nodes (45): AdminPanel, AdminCollapsibleSection(), AdminCollapsibleSectionProps, AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), ResortDataSection(), ResortSliderSection() (+37 more)

### Community 39 - "global-setup.ts"
Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 40 - "CourseDetailsModal.tsx"
Cohesion: 0.06
Nodes (38): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseFAQ(), CourseFAQProps, CourseGallery() (+30 more)

### Community 41 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 42 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 43 - "useInstructorWorkspace.ts"
Cohesion: 0.14
Nodes (21): InstructorWorkspace, CoursesTable(), CourseTableRow(), InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews() (+13 more)

### Community 44 - "ErrorBoundary.tsx"
Cohesion: 0.18
Nodes (9): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, logErrorBoundaryFailure(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk() (+1 more)

### Community 45 - "courseTransactions.ts"
Cohesion: 0.20
Nodes (18): CourseEnrollmentError, enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), STATUS_LABELS, getGroupScheduleLabel(), MONTHS_EN, MONTHS_RU (+10 more)

### Community 46 - "Navbar.tsx"
Cohesion: 0.24
Nodes (10): Logo(), LogoProps, Navbar(), NavbarProps, StudentCabinetShell(), CABINET_TABS, cabinetPathForTab(), getDefaultWorkspacePath() (+2 more)

### Community 47 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 48 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 49 - "BookingsLog.tsx"
Cohesion: 0.16
Nodes (14): BookingsLog(), shortenBookingId(), LinkGuestBookingModal(), BookingsLog, BadgeVariant, StatusBadge(), StatusBadgeProps, StyleConfig (+6 more)

### Community 50 - "booking.ts"
Cohesion: 0.08
Nodes (23): ChatWindow(), ChatWindowProps, LessonDetailsModal(), LessonRecommendationsList(), LessonRecommendationsListProps, PersonalCabinetModals(), BookingCallCoachButton(), normalizeTelHref() (+15 more)

### Community 52 - "ScheduleCalendar.tsx"
Cohesion: 0.15
Nodes (22): ActiveSlotDetails(), ActiveSlotMoveForm(), ScheduleCalendar(), getAvailableMoveTimeSlots(), getAvailableScheduleDurations(), hasScheduleOverlap(), SCHEDULE_CLOSING_TIME_MINUTES, SCHEDULE_DURATIONS (+14 more)

### Community 53 - "StudentHistoryList.tsx"
Cohesion: 0.17
Nodes (13): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+5 more)

### Community 54 - "src/types.ts"
Cohesion: 0.10
Nodes (10): ActiveSlotCreateFormProps, EnrichedCourseBooking, InstructorCardProps, InstructorReviewsModal, ActivityLogMetadata, ActivityLogType, SkillDeltaMeta, LessonDifficulty (+2 more)

### Community 56 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 57 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 58 - "RouteGate.tsx"
Cohesion: 0.33
Nodes (6): AdminRoute(), AuthRoute(), InstructorRoute(), RouteGate(), RouteGateProps, RouteGateRole

### Community 60 - "functions/package.json"
Cohesion: 0.12
Nodes (16): firebase-admin, firebase-functions, dependencies, firebase-admin, firebase-functions, devDependencies, typescript, engines (+8 more)

### Community 61 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, universal-analytics, private, type, version

### Community 62 - "ResortConditionsSidebar.tsx"
Cohesion: 0.43
Nodes (4): AnimatedNumber(), AnimatedNumberProps, ResortConditionsSidebar(), getWeatherConditionKey()

### Community 63 - "bookingService.ts"
Cohesion: 0.05
Nodes (92): useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService(), createBookingForUser() (+84 more)

### Community 65 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 66 - "Auth.test.tsx"
Cohesion: 0.22
Nodes (8): mockAddNotification, mockCreateUserWithEmailAndPassword, mockGetDoc, mockMigratePreExistingProfile, mockSendPasswordResetEmail, mockSetDoc, mockSignInWithEmailAndPassword, mockSignInWithPopup

### Community 67 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 68 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 69 - "TodayChecklist.tsx"
Cohesion: 0.53
Nodes (5): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef()

### Community 72 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 73 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 78 - "chatService.ts"
Cohesion: 0.43
Nodes (6): InstructorMessage, useInstructorBookingMessages(), createChatMessage(), messagesPath(), setChatMessageHomework(), subscribeToChatMessages()

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

### Community 91 - "ChatMessage"
Cohesion: 0.43
Nodes (4): buildHomeworkForUserIds(), isHomeworkVisibleToStudent(), ChatMessage, GROUP_UIDS

### Community 92 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 119 - "bookingsStore.ts"
Cohesion: 0.30
Nodes (9): ErrorLogsPanel(), ErrorLogsPanelProps, deleteErrorLog(), deleteErrorLogs(), subscribeErrorLogs(), DeletedCompletedStats, useBookingStore, QUERY_LIMITS (+1 more)

## Knowledge Gaps
- **410 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+405 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `CoachesManager.tsx`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `Auth.tsx`, `LanguageContext.tsx`, `useBookingModal.ts`, `lib/walletLedger.ts`, `Booking`, `StudentCoachPanel.tsx`, `StudentProfilePersonalSection.tsx`, `chatSenderRole.ts`, `ui/ModalHost.tsx`, `StudentTodaySection.tsx`, `PushNotificationHub.tsx`, `CoursesManager.tsx`, `useBookingModal`, `CurrencyContext.tsx`, `skillData.ts`, `settingsStore.ts`, `courseLevelStyles.ts`, `CourseBackgroundImageField.tsx`, `useNotifications`, `AdminPanel.tsx`, `CourseDetailsModal.tsx`, `useInstructorWorkspace.ts`, `Navbar.tsx`, `BookingsLog.tsx`, `booking.ts`, `ScheduleCalendar.tsx`, `StudentHistoryList.tsx`, `src/types.ts`, `ResortConditionsSidebar.tsx`, `TodayChecklist.tsx`, `bookingsStore.ts`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `CoachesManager.tsx`, `InstructorBookingCard.tsx`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `useBookingModal.ts`, `lib/walletLedger.ts`, `useBookingChatUnread.ts`, `StudentCoachPanel.tsx`, `chatSenderRole.ts`, `StudentTodaySection.tsx`, `PushNotificationHub.tsx`, `CoursesManager.tsx`, `useBookingModal`, `useBookings.cancel.test.tsx`, `useLanguage`, `logger.ts`, `useProfileStore`, `bookingTransactions.test.ts`, `AdminPanel.tsx`, `CourseDetailsModal.tsx`, `useInstructorWorkspace.ts`, `courseTransactions.ts`, `BookingsLog.tsx`, `booking.ts`, `ScheduleCalendar.tsx`, `StudentHistoryList.tsx`, `src/types.ts`, `bookingService.ts`, `TodayChecklist.tsx`, `bookingsStore.ts`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `Booking` to `InstructorBookingCard.tsx`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `Auth.tsx`, `useBookingModal.ts`, `lib/walletLedger.ts`, `useCourseActions.ts`, `StudentCoachPanel.tsx`, `StudentProfilePersonalSection.tsx`, `chatSenderRole.ts`, `StudentTodaySection.tsx`, `PushNotificationHub.tsx`, `CoursesManager.tsx`, `useBookingModal`, `useBookings.cancel.test.tsx`, `useLanguage`, `skillData.ts`, `logger.ts`, `useProfileStore`, `useNotifications`, `AdminPanel.tsx`, `CourseDetailsModal.tsx`, `useInstructorWorkspace.ts`, `courseTransactions.ts`, `Navbar.tsx`, `BookingsLog.tsx`, `booking.ts`, `ScheduleCalendar.tsx`, `StudentHistoryList.tsx`, `src/types.ts`, `RouteGate.tsx`, `bookingService.ts`, `profileSelectors.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _410 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `studentCabinetUtils.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0629399585921325 - nodes in this community are weakly interconnected._
- **Should `achievementConfig.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08311688311688312 - nodes in this community are weakly interconnected._
- **Should `LanguageContext.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11711711711711711 - nodes in this community are weakly interconnected._