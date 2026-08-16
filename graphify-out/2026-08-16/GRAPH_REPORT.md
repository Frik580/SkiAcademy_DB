# Graph Report - SkiAcademy_DB  (2026-08-16)

## Corpus Check
- 396 files · ~200,606 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1993 nodes · 6801 edges · 118 communities (98 shown, 20 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f292731a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- skillData.ts
- TranslationKey
- bookingLogic.ts
- studentCabinetUtils.ts
- firebase.ts
- achievementConfig.ts
- bookingsStore.ts
- UserProfile
- AdminPanel.tsx
- CourseEnrollmentModal.tsx
- LanguageContext.tsx
- Booking
- ClientBookingsList.tsx
- StudentCoachPanel.tsx
- src/types.ts
- bookingTransactions.test.ts
- AppRoutes.tsx
- StudentTodaySection.tsx
- PushNotificationHub.tsx
- useCourseForm.ts
- useNotifications
- BookingChatModal.tsx
- ScheduleCalendar.tsx
- useLanguage
- bookingTransactions.ts
- scripts
- useAuthStore
- compilerOptions
- settingsStore.ts
- HeroCarousel.tsx
- balanceOptimisticMiddleware.ts
- lib/walletLedger.ts
- useProfileStore
- useBookingChatUnread.ts
- callableTestEnv.ts
- bookingCreatedAt.ts
- extract-coaches-manager.mjs
- courseDates.ts
- StudentCabinetPanels.tsx
- global-setup.ts
- CourseDetailsModal.tsx
- dependencies
- compilerOptions
- chatSenderRole.ts
- ErrorBoundary.tsx
- StudentCabinetHome.tsx
- useInstructorWorkspace.ts
- devDependencies
- README.md
- useCourseActions.ts
- walletCredit.ts
- courseEnrollmentRegression.test.ts
- course.ts
- StudentHistoryList.tsx
- createBookingCallable.ts
- cancelBookingWithRefund
- extract-courses-manager.mjs
- extract-admin-sections.mjs
- InstructorWorkspace.tsx
- SystemSettings.tsx
- functions/package.json
- package.json
- bookingEndsAt.ts
- bookingService.ts
- Auth.tsx
- patch-admin-return.mjs
- coachPhone.test.ts
- StudentActivityRings.tsx
- createBooking.ts
- BookingModal.tsx
- walletStore.ts
- pluralize.ts
- declarations.d.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- courseTransactions.ts
- src/index.ts
- createBookingWithPayment
- eslint-plugin-react-refresh
- @firebase/rules-unit-testing
- autoComplete.ts
- jsdom
- @playwright/test
- prettier
- createGuestCourseEnrollment.ts
- @testing-library/jest-dom
- @testing-library/react
- TodayChecklist.tsx
- adminFirestore.test.ts
- typescript-eslint
- activityLogHistory.test.ts
- @vitejs/plugin-react
- vitest
- InstructorReviewsModal.tsx
- vitest.config.ts
- AGENTS.md
- eslint
- eslint-plugin-react-hooks
- tailwindcss

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 235 edges
2. `Booking` - 166 edges
3. `UserProfile` - 137 edges
4. `Course` - 129 edges
5. `Instructor` - 101 edges
6. `useProfileStore` - 49 edges
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
- `backfillCompletedBookingActivityLogs()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/backfillActivityLog.ts → tests/unit/todayRecommendations.test.ts
- `buildSyntheticWalletOperations()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/walletLedger.ts → tests/unit/todayRecommendations.test.ts

## Import Cycles
- None detected.

## Communities (118 total, 20 thin omitted)

### Community 0 - "skillData.ts"
Cohesion: 0.05
Nodes (82): ClientSkillProgressView(), ClientSkillProgressViewProps, APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChart() (+74 more)

### Community 1 - "TranslationKey"
Cohesion: 0.12
Nodes (23): CoursesManagerToolbar(), CoursesManagerToolbarProps, LocalizedCompressionError, InstructorBookingCard(), InstructorBookingCardProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, StudentAssessButton() (+15 more)

### Community 2 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 3 - "studentCabinetUtils.ts"
Cohesion: 0.06
Nodes (58): StudentCabinetHome(), Achievement, ActiveCourseEnrollment, addMinutesToTime(), buildLocalDateTime(), filterBookingsByScope(), formatActivityTimestamp(), getActiveCourseEnrollment() (+50 more)

### Community 4 - "firebase.ts"
Cohesion: 0.11
Nodes (18): FinancialOverviewProps, StudentProfilePreferencesSectionProps, DEFAULT_CONFIG, Currency, CurrencyContext, CurrencyContextType, CurrencyProvider(), isCurrency() (+10 more)

### Community 5 - "achievementConfig.ts"
Cohesion: 0.15
Nodes (29): AchievementRule, applySkillDeltas(), bookingTimestamp(), countExercisesMastered(), EvaluatedAchievement, findCourseGraduateTimestamp(), findExercisesMasteredTimestamp(), findFeedbackTimestamp() (+21 more)

### Community 6 - "bookingsStore.ts"
Cohesion: 0.11
Nodes (10): BookingsState, DeletedCompletedStats, useBookings(), LanguageFn, NotificationFn, TranslateFn, adminProfile, confirmedBooking (+2 more)

### Community 7 - "UserProfile"
Cohesion: 0.16
Nodes (26): BookingsLogProps, CoursesTableProps, CourseTableRowProps, LinkGuestBookingModalProps, ActiveSlotCreateFormProps, ScheduleCalendarProps, ActiveSlotDialogProps, ScheduleSlotActionModalProps (+18 more)

### Community 8 - "AdminPanel.tsx"
Cohesion: 0.10
Nodes (21): AdminPanel, AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), ClientsManagerProps, CoachesManager(), CoachesManagerProps, ScheduleInstructorCell() (+13 more)

### Community 9 - "CourseEnrollmentModal.tsx"
Cohesion: 0.06
Nodes (36): AuthModal(), AuthModalProps, AuthModeSliderSwitch(), AuthModeSliderSwitchProps, CourseEnrollmentModal(), BAR_ROWS, BAR_TRACK, Camera (+28 more)

### Community 10 - "LanguageContext.tsx"
Cohesion: 0.35
Nodes (8): isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageContext, LanguageProvider(), TranslatedBooking, UseTranslatedBookingsOptions

### Community 11 - "Booking"
Cohesion: 0.10
Nodes (46): AchievementsManagerProps, ActiveSlotDetailsProps, ActiveSlotMoveFormProps, SystemSettingsProps, AdminPanelProps, ChatWindowProps, InstructorWorkspaceInput, LessonDetailsModalProps (+38 more)

### Community 12 - "ClientBookingsList.tsx"
Cohesion: 0.09
Nodes (25): BookingsLog(), shortenBookingId(), ActiveSlotDetails(), BookingSelectors(), ChatUnreadIndicator(), ChatUnreadIndicatorProps, ApplePagination(), ApplePaginationProps (+17 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.14
Nodes (29): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+21 more)

### Community 14 - "src/types.ts"
Cohesion: 0.10
Nodes (14): LinkGuestBookingModal(), UnreviewedCompletedBookingsNotice(), UnreviewedCompletedBookingsNoticeProps, instructors, pendingCancellationBooking, usersList, instructors, userProfile (+6 more)

### Community 15 - "bookingTransactions.test.ts"
Cohesion: 0.23
Nodes (20): seedBookings(), seedCourse(), seedCourse(), seedProdUser(), clearIntegrationFirestore(), INSTRUCTOR_ID, INSTRUCTOR_USER_ID, integrationTestEnv() (+12 more)

### Community 16 - "AppRoutes.tsx"
Cohesion: 0.11
Nodes (30): AppShell(), AdminRouteWrapper(), AppRoutes(), AppRoutesProps, CabinetRouteWrapper(), HomeRoute(), InstructorRouteWrapper(), PersonalCabinet (+22 more)

### Community 17 - "StudentTodaySection.tsx"
Cohesion: 0.16
Nodes (32): ChatWindow(), LessonDetailsModal(), LessonRecommendationsList(), HistoryLessonCard(), countPendingRecommendations(), enrichHistoryEventsWithActions(), formatBookingDayMonth(), formatCountdownRemaining() (+24 more)

### Community 18 - "PushNotificationHub.tsx"
Cohesion: 0.17
Nodes (17): Notification, NotificationContext, NotificationContextType, NotificationHubModal(), useNotificationsSync(), NotificationsState, TWO_WEEKS_MS, useNotifications() (+9 more)

### Community 19 - "useCourseForm.ts"
Cohesion: 0.19
Nodes (15): CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps, CourseInstructorSelection(), CourseInstructorSelectionProps, CourseRichDetailsSection(), CourseRichDetailsSectionProps (+7 more)

### Community 20 - "useNotifications"
Cohesion: 0.27
Nodes (14): useRescheduleBooking(), UseRescheduleBookingOptions, PersonalCabinet(), useNotifications(), useReviewFlow(), AVAILABILITY_MIGRATION_SETTING, AVAILABILITY_SLOTS_COLLECTION, DEFAULT_LESSON_TIME_SLOTS (+6 more)

### Community 21 - "BookingChatModal.tsx"
Cohesion: 0.12
Nodes (21): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+13 more)

### Community 22 - "ScheduleCalendar.tsx"
Cohesion: 0.11
Nodes (31): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, ActiveSlotMoveForm(), ScheduleCalendar(), AvailableDurationsOptions, AvailableMoveTimesOptions (+23 more)

### Community 23 - "useLanguage"
Cohesion: 0.09
Nodes (38): AdminCollapsibleSection(), AdminCollapsibleSectionProps, ActiveSlotCreateForm(), CourseGallery(), CourseGalleryProps, LessonFilters(), LessonFiltersProps, BookInstructorPickerModal() (+30 more)

### Community 24 - "bookingTransactions.ts"
Cohesion: 0.20
Nodes (21): migrateAvailabilitySlots(), blocksInstructorAvailability(), toAvailabilitySlot(), addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, createBookingWithPayment(), createGuestBooking() (+13 more)

### Community 25 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 26 - "useAuthStore"
Cohesion: 0.17
Nodes (16): signOutService(), AuthState, useAuthStore, useSessionSync(), useBookingsSync(), useCoursesSync(), useAchievementsSync(), useCurrentUserProfileSync() (+8 more)

### Community 27 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 28 - "settingsStore.ts"
Cohesion: 0.16
Nodes (19): App(), AppBootstrap(), AppBootstrapProps, NotificationProvider(), saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays() (+11 more)

### Community 29 - "HeroCarousel.tsx"
Cohesion: 0.06
Nodes (40): CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), FALLBACK_SLIDES, buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps (+32 more)

### Community 31 - "lib/walletLedger.ts"
Cohesion: 0.19
Nodes (15): buildSyntheticWalletOperations(), buildWalletOperationHistory(), enrichWalletOperationWithBooking(), formatWalletSessionDate(), formatWalletSessionDuration(), ledgerBookingIds(), ledgerEntryToView(), ledgerHasBookingAction() (+7 more)

### Community 32 - "useProfileStore"
Cohesion: 0.13
Nodes (22): useAvailabilityMigrationSync(), addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService(), updateUserRoleService(), ProfileState (+14 more)

### Community 33 - "useBookingChatUnread.ts"
Cohesion: 0.24
Nodes (14): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan() (+6 more)

### Community 34 - "callableTestEnv.ts"
Cohesion: 0.10
Nodes (37): CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser(), getCallableAuth() (+29 more)

### Community 35 - "bookingCreatedAt.ts"
Cohesion: 0.80
Nodes (4): formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt()

### Community 36 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "courseDates.ts"
Cohesion: 0.18
Nodes (14): BookingSelectorsProps, EnrichedCourseBooking, DifficultyLabelVariant, STATUS_LABELS, MONTHS_EN, MONTHS_RU, MONTHS_SHORT_EN, MONTHS_SHORT_RU (+6 more)

### Community 38 - "StudentCabinetPanels.tsx"
Cohesion: 0.11
Nodes (28): FinancialOverview(), formatCourseCardDate(), GroupCourseCard(), sortVisibleCourses(), GroupCoursesSection(), InstructorCard, InstructorCardProps, StudentCalendarPanel() (+20 more)

### Community 39 - "global-setup.ts"
Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 40 - "CourseDetailsModal.tsx"
Cohesion: 0.10
Nodes (26): CourseTableRow(), CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseEnrollAction(), CourseEnrollActionProps (+18 more)

### Community 41 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 42 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 43 - "chatSenderRole.ts"
Cohesion: 0.18
Nodes (14): ChatMessageList(), ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole() (+6 more)

### Community 44 - "ErrorBoundary.tsx"
Cohesion: 0.23
Nodes (7): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 45 - "StudentCabinetHome.tsx"
Cohesion: 0.08
Nodes (30): AnimatedNumber(), AnimatedNumberProps, RecommendationIndicator(), RecommendationIndicatorProps, StudentBookNextFab(), StudentBookNextFabProps, StudentCabinetHomeProps, SC_TINT_CARD (+22 more)

### Community 46 - "useInstructorWorkspace.ts"
Cohesion: 0.13
Nodes (22): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, StatusFilter, getAchievements(), AchievementDefinition, AchievementRuleType, DEFAULT_ACHIEVEMENTS_CONFIG (+14 more)

### Community 47 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 48 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 49 - "useCourseActions.ts"
Cohesion: 0.17
Nodes (16): addCourseService(), deleteCourseService(), enrollInCourseService(), notifyCourseModifiedService(), updateCourseService(), useCourseActions(), TODO: реализовать применение кредита в Firestore, withOptimisticBalance() (+8 more)

### Community 50 - "walletCredit.ts"
Cohesion: 0.30
Nodes (13): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_KZT (+5 more)

### Community 51 - "courseEnrollmentRegression.test.ts"
Cohesion: 0.27
Nodes (10): buildCourseEnrollmentBooking(), buildProdCourseSeed(), PROD_COURSE_ID, PROD_USER_ID, prodBookingId(), prodInstructorId(), RulesBookingSeed, bookingId (+2 more)

### Community 52 - "course.ts"
Cohesion: 0.16
Nodes (8): CoursesTable(), CoursesManager(), CoursesManagerProps, buildClonedCourse(), mockAddNotification, mockDeleteCourse, sampleCourse, course

### Community 53 - "StudentHistoryList.tsx"
Cohesion: 0.27
Nodes (10): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+2 more)

### Community 54 - "createBookingCallable.ts"
Cohesion: 0.36
Nodes (7): BookingPaymentResult, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable(), mapCallableError(), toCallableInput()

### Community 55 - "cancelBookingWithRefund"
Cohesion: 0.39
Nodes (5): cancelBookingWithRefund(), finalizeBookingCompletion(), isActiveCourseEnrollment(), releaseCourseSeatInTransaction(), resolveCourseIdFromBooking()

### Community 56 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 57 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 58 - "InstructorWorkspace.tsx"
Cohesion: 0.19
Nodes (13): InstructorWorkspace, InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorNotLinked(), InstructorNotLinkedProps, InstructorReviews() (+5 more)

### Community 59 - "SystemSettings.tsx"
Cohesion: 0.11
Nodes (19): ErrorLogsPanel(), ErrorLogsPanelProps, ResortDataSection(), ResortSliderSection(), SystemSettings(), ErrorLogsPanel, ToggleSwitch(), ToggleSwitchProps (+11 more)

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
Cohesion: 0.17
Nodes (34): useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService(), createBookingForUser() (+26 more)

### Community 64 - "Auth.tsx"
Cohesion: 0.15
Nodes (13): Auth(), AuthProps, PRESET_SEEDS, googleProvider, migratePreExistingProfile(), mockAddNotification, mockCreateUserWithEmailAndPassword, mockGetDoc (+5 more)

### Community 65 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 66 - "coachPhone.test.ts"
Cohesion: 0.40
Nodes (4): normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 67 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 68 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 69 - "BookingModal.tsx"
Cohesion: 0.21
Nodes (12): AuthBookingForm(), AuthBookingFormProps, BookingAuthShell(), BookingAuthShellProps, BookingModalHeader(), BookingModalHeaderProps, BookingOverlapWarnings(), GuestBookingForm() (+4 more)

### Community 70 - "walletStore.ts"
Cohesion: 0.21
Nodes (11): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState, useWalletStore (+3 more)

### Community 71 - "pluralize.ts"
Cohesion: 0.31
Nodes (8): NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatPointsCount(), formatPointsGain(), pointsWord(), russianPlural()

### Community 72 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 73 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 78 - "courseTransactions.ts"
Cohesion: 0.40
Nodes (10): CourseEnrollmentError, enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), translateCourse(), getGroupScheduleLabel(), parseDurationHours(), splitCourseDates() (+2 more)

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

### Community 91 - "TodayChecklist.tsx"
Cohesion: 0.53
Nodes (5): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef()

### Community 92 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 94 - "activityLogHistory.test.ts"
Cohesion: 0.40
Nodes (3): bookings, courses, userProfile

### Community 97 - "InstructorReviewsModal.tsx"
Cohesion: 0.50
Nodes (3): InstructorReviewsModal(), InstructorReviewsModalProps, InstructorReviewsModal

## Knowledge Gaps
- **401 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+396 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `skillData.ts`, `studentCabinetUtils.ts`, `firebase.ts`, `UserProfile`, `AdminPanel.tsx`, `CourseEnrollmentModal.tsx`, `LanguageContext.tsx`, `Booking`, `ClientBookingsList.tsx`, `StudentCoachPanel.tsx`, `src/types.ts`, `AppRoutes.tsx`, `StudentTodaySection.tsx`, `PushNotificationHub.tsx`, `useCourseForm.ts`, `useNotifications`, `BookingChatModal.tsx`, `ScheduleCalendar.tsx`, `settingsStore.ts`, `HeroCarousel.tsx`, `StudentCabinetPanels.tsx`, `CourseDetailsModal.tsx`, `chatSenderRole.ts`, `StudentCabinetHome.tsx`, `useInstructorWorkspace.ts`, `course.ts`, `StudentHistoryList.tsx`, `InstructorWorkspace.tsx`, `SystemSettings.tsx`, `Auth.tsx`, `BookingModal.tsx`, `pluralize.ts`, `TodayChecklist.tsx`, `InstructorReviewsModal.tsx`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `TranslationKey`, `studentCabinetUtils.ts`, `achievementConfig.ts`, `bookingsStore.ts`, `UserProfile`, `AdminPanel.tsx`, `ClientBookingsList.tsx`, `StudentCoachPanel.tsx`, `src/types.ts`, `bookingTransactions.test.ts`, `StudentTodaySection.tsx`, `PushNotificationHub.tsx`, `useNotifications`, `BookingChatModal.tsx`, `ScheduleCalendar.tsx`, `useLanguage`, `bookingTransactions.ts`, `useAuthStore`, `lib/walletLedger.ts`, `useBookingChatUnread.ts`, `callableTestEnv.ts`, `bookingCreatedAt.ts`, `StudentCabinetPanels.tsx`, `CourseDetailsModal.tsx`, `chatSenderRole.ts`, `StudentCabinetHome.tsx`, `useInstructorWorkspace.ts`, `useCourseActions.ts`, `course.ts`, `StudentHistoryList.tsx`, `createBookingCallable.ts`, `cancelBookingWithRefund`, `InstructorWorkspace.tsx`, `SystemSettings.tsx`, `bookingEndsAt.ts`, `bookingService.ts`, `coachPhone.test.ts`, `BookingModal.tsx`, `courseTransactions.ts`, `TodayChecklist.tsx`, `activityLogHistory.test.ts`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `skillData.ts`, `TranslationKey`, `studentCabinetUtils.ts`, `firebase.ts`, `achievementConfig.ts`, `bookingsStore.ts`, `AdminPanel.tsx`, `CourseEnrollmentModal.tsx`, `Booking`, `ClientBookingsList.tsx`, `StudentCoachPanel.tsx`, `src/types.ts`, `StudentTodaySection.tsx`, `PushNotificationHub.tsx`, `useNotifications`, `BookingChatModal.tsx`, `ScheduleCalendar.tsx`, `useLanguage`, `useAuthStore`, `HeroCarousel.tsx`, `lib/walletLedger.ts`, `useProfileStore`, `StudentCabinetPanels.tsx`, `CourseDetailsModal.tsx`, `chatSenderRole.ts`, `StudentCabinetHome.tsx`, `useInstructorWorkspace.ts`, `useCourseActions.ts`, `walletCredit.ts`, `course.ts`, `InstructorWorkspace.tsx`, `bookingService.ts`, `Auth.tsx`, `coachPhone.test.ts`, `BookingModal.tsx`, `courseTransactions.ts`, `activityLogHistory.test.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _401 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `skillData.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050637730820483534 - nodes in this community are weakly interconnected._
- **Should `TranslationKey` be split into smaller, more focused modules?**
  _Cohesion score 0.11576354679802955 - nodes in this community are weakly interconnected._
- **Should `studentCabinetUtils.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06241519674355495 - nodes in this community are weakly interconnected._