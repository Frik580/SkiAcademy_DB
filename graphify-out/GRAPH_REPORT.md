# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 406 files · ~201,338 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2022 nodes · 6931 edges · 125 communities (102 shown, 23 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f292731a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- your_journey/YourJourneySection.tsx
- InstructorBookingCard.tsx
- bookingLogic.ts
- studentCabinetUtils.ts
- BookingChatModal.tsx
- achievementConfig.ts
- bookingTransactions.test.ts
- useLanguage
- AdminPanel.tsx
- firestoreMappers.ts
- PushNotificationHub.tsx
- StudentCabinetHome.tsx
- bookingSelectors.ts
- StudentCoachPanel.tsx
- src/types.ts
- coursesStore.ts
- HomeRouteContainer.tsx
- StudentTodaySection.tsx
- ui/ModalHost.tsx
- useCourseForm.ts
- useInstructorWorkspace.ts
- skillData.ts
- useBookingChatUnread.ts
- StudentCabinetShell.tsx
- UserProfile
- scripts
- useAuthStore
- compilerOptions
- settingsStore.ts
- courseLevelStyles.ts
- balanceOptimisticMiddleware.ts
- translateCourse
- useProfileStore
- useCourseActions.ts
- callableTestEnv.ts
- lib/walletLedger.ts
- extract-coaches-manager.mjs
- SystemSettings.tsx
- bookingTransactions.ts
- global-setup.ts
- CourseDetailsModal.tsx
- dependencies
- compilerOptions
- chatSenderRole.ts
- ErrorBoundary.tsx
- ResortConditionsSidebar.tsx
- TodayChecklist.tsx
- devDependencies
- README.md
- bookingsStore.ts
- useNotifications
- walletStore.ts
- ScheduleCalendar.tsx
- StudentHistoryList.tsx
- useInstructorWorkspace
- courseEnrollmentRegression.test.ts
- extract-courses-manager.mjs
- extract-admin-sections.mjs
- TranslationKey
- firebase.ts
- functions/package.json
- package.json
- bookingEndsAt.ts
- bookingService.ts
- Auth.test.tsx
- patch-admin-return.mjs
- slotOverlap.ts
- StudentActivityRings.tsx
- createBooking.ts
- LanguageContext.tsx
- createBookingCallable.ts
- walletCredit.ts
- declarations.d.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- coachPhone.test.ts
- src/index.ts
- createBookingWithPayment
- eslint-plugin-react-refresh
- @firebase/rules-unit-testing
- autoComplete.ts
- ChatMessage
- @playwright/test
- prettier
- createGuestCourseEnrollment.ts
- @testing-library/jest-dom
- @testing-library/react
- StatusBadge.tsx
- adminFirestore.test.ts
- typescript-eslint
- OnboardingModal.tsx
- @vitejs/plugin-react
- vitest
- formatDurationLabel
- vitest.config.ts
- AGENTS.md
- chatSenderRole.test.ts
- eslint-plugin-react-hooks
- tailwindcss
- Booking
- bodyScrollLock.ts
- activityLogHistory.test.ts
- achievements.test.ts
- jsdom
- eslint

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 238 edges
2. `Booking` - 166 edges
3. `UserProfile` - 136 edges
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

## Communities (125 total, 23 thin omitted)

### Community 0 - "your_journey/YourJourneySection.tsx"
Cohesion: 0.11
Nodes (40): AchievementGrid(), CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, EQUAL_MARKER_STOPS, JOURNEY_BG, JOURNEY_LEVELS, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND (+32 more)

### Community 1 - "InstructorBookingCard.tsx"
Cohesion: 0.15
Nodes (16): InstructorBookingCard(), InstructorBookingCardProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, StudentAssessButton(), StudentAssessButtonProps, StudentLevelControls(), StudentLevelControlsProps (+8 more)

### Community 2 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 3 - "studentCabinetUtils.ts"
Cohesion: 0.06
Nodes (61): StudentCabinetHome(), Achievement, addMinutesToTime(), buildLocalDateTime(), filterBookingsByScope(), formatActivityTimestamp(), formatCountdownRemaining(), getAchievements() (+53 more)

### Community 4 - "BookingChatModal.tsx"
Cohesion: 0.15
Nodes (17): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+9 more)

### Community 5 - "achievementConfig.ts"
Cohesion: 0.08
Nodes (49): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, UpcomingSessionsStrip(), AchievementDefinition, AchievementRule, AchievementRuleType, applySkillDeltas() (+41 more)

### Community 6 - "bookingTransactions.test.ts"
Cohesion: 0.20
Nodes (21): CourseEnrollmentError, seedBookings(), seedCourse(), seedCourse(), seedProdUser(), clearIntegrationFirestore(), INSTRUCTOR_ID, INSTRUCTOR_USER_ID (+13 more)

### Community 7 - "useLanguage"
Cohesion: 0.11
Nodes (29): AdminCollapsibleSection(), AdminCollapsibleSectionProps, formatCourseCardDate(), GroupCourseCard(), sortVisibleCourses(), GroupCoursesSection(), InstructorCard, InstructorCardProps (+21 more)

### Community 8 - "AdminPanel.tsx"
Cohesion: 0.14
Nodes (15): AdminRoleManager(), AdminRoleManagerProps, BookingsLogProps, ClientsManager(), ClientsManagerProps, LinkGuestBookingModal(), AdminRoleManager, BookingsLog (+7 more)

### Community 9 - "firestoreMappers.ts"
Cohesion: 0.18
Nodes (15): useBookingsSync(), useCoursesSync(), handleFirestoreError(), DomainModel, FirestoreModel, toActivityLog(), toBooking(), toCourse() (+7 more)

### Community 10 - "PushNotificationHub.tsx"
Cohesion: 0.16
Nodes (19): Notification, NotificationContext, NotificationContextType, NotificationHubModal(), NotificationProvider(), useNotificationsSync(), NotificationsState, TWO_WEEKS_MS (+11 more)

### Community 11 - "StudentCabinetHome.tsx"
Cohesion: 0.15
Nodes (30): AchievementsManagerProps, SystemSettingsProps, AdminPanelProps, InstructorWorkspaceInput, InstructorReviewsModalProps, HistoryLessonCardProps, StudentCabinetContext, StudentCabinetHomeProps (+22 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.15
Nodes (28): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+20 more)

### Community 14 - "src/types.ts"
Cohesion: 0.09
Nodes (18): CoursesTable(), CoursesManager(), instructors, pendingCancellationBooking, usersList, instructor, mockAddNotification, mockDeleteCourse (+10 more)

### Community 16 - "HomeRouteContainer.tsx"
Cohesion: 0.12
Nodes (29): AppShell(), FeaturePageShell(), FeaturePageShellProps, AdminPanel, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), PersonalCabinet (+21 more)

### Community 17 - "StudentTodaySection.tsx"
Cohesion: 0.10
Nodes (46): ChatUnreadIndicator(), ChatUnreadIndicatorProps, ClientBookingsList(), LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, LessonDetailsModal(), RecommendationIndicator(), RecommendationIndicatorProps (+38 more)

### Community 18 - "ui/ModalHost.tsx"
Cohesion: 0.15
Nodes (12): ModalHostHandleDeleteNotification, clearNotificationsService(), deleteNotificationService(), markNotificationsAsReadService(), useDbNotifications(), useUnreadNotificationCount(), useNotificationsStore, useNotificationActions() (+4 more)

### Community 19 - "useCourseForm.ts"
Cohesion: 0.11
Nodes (27): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+19 more)

### Community 20 - "useInstructorWorkspace.ts"
Cohesion: 0.13
Nodes (25): AuthBookingForm(), AuthBookingFormProps, AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, BookingOverlapWarnings(), BookingSelectors() (+17 more)

### Community 21 - "skillData.ts"
Cohesion: 0.09
Nodes (40): ClientSkillProgressView(), APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChart(), getLevelLabel() (+32 more)

### Community 22 - "useBookingChatUnread.ts"
Cohesion: 0.24
Nodes (14): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan() (+6 more)

### Community 23 - "StudentCabinetShell.tsx"
Cohesion: 0.06
Nodes (42): StudentBookNextFab(), StudentBookNextFabProps, StudentCalendarPanel(), getSwipeNeighborSequence(), StudentCabinetShell(), SC_TINT_CARD, SC_TINT_VALUE, ScProgressBar() (+34 more)

### Community 24 - "UserProfile"
Cohesion: 0.10
Nodes (33): CoachesManagerProps, CoursesTableProps, CourseTableRowProps, CoursesManagerProps, ActiveSlotCreateForm(), ActiveSlotCreateFormProps, ChatMessageListProps, BookingModalHeader() (+25 more)

### Community 25 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 26 - "useAuthStore"
Cohesion: 0.18
Nodes (14): useAvailabilityMigrationSync(), signOutService(), AuthState, useAuthStore, useSessionSync(), useAchievementsSync(), useCurrentUserProfileSync(), useProfileActivitySync() (+6 more)

### Community 27 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 28 - "settingsStore.ts"
Cohesion: 0.20
Nodes (16): AppBootstrap(), AppBootstrapProps, saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled(), saveSkillConfig() (+8 more)

### Community 29 - "courseLevelStyles.ts"
Cohesion: 0.06
Nodes (36): CourseHeader(), CourseHeaderProps, Logo(), LogoProps, Navbar(), NavbarProps, optimizeProfileImage(), ProfileSettings() (+28 more)

### Community 31 - "translateCourse"
Cohesion: 0.25
Nodes (16): AdminPanel(), enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), STATUS_LABELS, translateCourse(), getGroupScheduleLabel(), MONTHS_EN (+8 more)

### Community 32 - "useProfileStore"
Cohesion: 0.19
Nodes (22): addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService(), updateUserRoleService(), ProfileState, useProfileStore (+14 more)

### Community 33 - "useCourseActions.ts"
Cohesion: 0.23
Nodes (12): addCourseService(), deleteCourseService(), enrollInCourseService(), notifyCourseModifiedService(), updateCourseService(), useCourseActions(), buildClonedCourse(), stripUndefinedFields() (+4 more)

### Community 34 - "callableTestEnv.ts"
Cohesion: 0.10
Nodes (37): CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser(), getCallableAuth() (+29 more)

### Community 35 - "lib/walletLedger.ts"
Cohesion: 0.13
Nodes (24): BookingsLog(), shortenBookingId(), PaymentGatewayProps, StudentWalletHistoryList(), formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt() (+16 more)

### Community 36 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "SystemSettings.tsx"
Cohesion: 0.09
Nodes (26): ErrorLogsPanelProps, ResortDataSection(), ResortSliderSection(), FALLBACK_SLIDES, SystemSettings(), ErrorLogsPanel, SystemSettings, buildBackgroundImage() (+18 more)

### Community 38 - "bookingTransactions.ts"
Cohesion: 0.29
Nodes (20): blocksInstructorAvailability(), isCourseBooking(), addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, cancelBookingWithRefund(), createBookingWithPayment(), createGuestBooking() (+12 more)

### Community 39 - "global-setup.ts"
Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 40 - "CourseDetailsModal.tsx"
Cohesion: 0.17
Nodes (14): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseEnrollAction(), CourseFAQ(), CourseFAQProps (+6 more)

### Community 41 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 42 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 43 - "chatSenderRole.ts"
Cohesion: 0.31
Nodes (10): ChatMessageList(), ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole() (+2 more)

### Community 44 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (8): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 45 - "ResortConditionsSidebar.tsx"
Cohesion: 0.31
Nodes (6): AnimatedNumber(), AnimatedNumberProps, StudentCabinetWeatherSection(), ResortConditionsSidebar(), ResortConditionsSidebarProps, getWeatherConditionKey()

### Community 46 - "TodayChecklist.tsx"
Cohesion: 0.53
Nodes (5): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef()

### Community 47 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 48 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 49 - "bookingsStore.ts"
Cohesion: 0.12
Nodes (11): DeletedCompletedStats, useBookingStore, useBookings(), LanguageFn, NotificationFn, setStoreContext(), TranslateFn, adminProfile (+3 more)

### Community 50 - "useNotifications"
Cohesion: 0.24
Nodes (9): CoachesManager(), CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), ErrorLogsPanel(), CoachesManager, PaymentGateway(), useNotifications() (+1 more)

### Community 51 - "walletStore.ts"
Cohesion: 0.18
Nodes (12): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, TODO: реализовать применение кредита в Firestore, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState (+4 more)

### Community 52 - "ScheduleCalendar.tsx"
Cohesion: 0.11
Nodes (24): ActiveSlotDetails(), ActiveSlotDetailsProps, ActiveSlotMoveForm(), ActiveSlotMoveFormProps, ScheduleCalendarProps, AvailableDurationsOptions, AvailableMoveTimesOptions, getAvailableMoveTimeSlots() (+16 more)

### Community 53 - "StudentHistoryList.tsx"
Cohesion: 0.27
Nodes (10): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+2 more)

### Community 54 - "useInstructorWorkspace"
Cohesion: 0.17
Nodes (12): CourseTableRow(), InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews(), InstructorReviewsProps, InstructorStudents() (+4 more)

### Community 55 - "courseEnrollmentRegression.test.ts"
Cohesion: 0.27
Nodes (10): buildCourseEnrollmentBooking(), buildProdCourseSeed(), PROD_COURSE_ID, PROD_USER_ID, prodBookingId(), prodInstructorId(), RulesBookingSeed, bookingId (+2 more)

### Community 56 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 57 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 58 - "TranslationKey"
Cohesion: 0.12
Nodes (18): CoursesManagerToolbar(), CoursesManagerToolbarProps, ScheduleInstructorCellProps, ScheduleToolbar(), ScheduleToolbarProps, ScheduleViewMode, LocalizedCompressionError, BookingSelectorsProps (+10 more)

### Community 59 - "firebase.ts"
Cohesion: 0.08
Nodes (31): FinancialOverview(), FinancialOverviewProps, FinancialOverview, Auth(), AuthProps, PRESET_SEEDS, CourseEnrollmentModal(), DEFAULT_CONFIG (+23 more)

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
Cohesion: 0.13
Nodes (41): useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService(), createBookingForUser() (+33 more)

### Community 64 - "Auth.test.tsx"
Cohesion: 0.22
Nodes (8): mockAddNotification, mockCreateUserWithEmailAndPassword, mockGetDoc, mockMigratePreExistingProfile, mockSendPasswordResetEmail, mockSetDoc, mockSignInWithEmailAndPassword, mockSignInWithPopup

### Community 65 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 66 - "slotOverlap.ts"
Cohesion: 0.23
Nodes (8): migrateAvailabilitySlots(), AVAILABILITY_MIGRATION_SETTING, addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap()

### Community 67 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 68 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 69 - "LanguageContext.tsx"
Cohesion: 0.33
Nodes (8): isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageContext, LanguageProvider(), TranslatedBooking, UseTranslatedBookingsOptions

### Community 70 - "createBookingCallable.ts"
Cohesion: 0.36
Nodes (7): BookingPaymentResult, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable(), mapCallableError(), toCallableInput()

### Community 71 - "walletCredit.ts"
Cohesion: 0.30
Nodes (13): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_KZT (+5 more)

### Community 72 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 73 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 78 - "coachPhone.test.ts"
Cohesion: 0.38
Nodes (5): BookingCallCoachButton(), normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 79 - "src/index.ts"
Cohesion: 0.35
Nodes (8): getAdminFirestore(), getOrInitApp(), createBooking, createGuestCourseEnrollment, enrollInCourse, scheduledAutoCompleteBookings, scheduledPurgeExpiredNotifications, purgeExpiredNotifications()

### Community 80 - "createBookingWithPayment"
Cohesion: 0.31
Nodes (9): createBookingWithPayment(), EnrollCourseInput, enrollInCourseHandler(), parseInput(), recordWalletLedgerEntryInTransaction(), WALLET_LEDGER_COLLECTION, WalletLedgerEntry, walletLedgerEntryId() (+1 more)

### Community 83 - "autoComplete.ts"
Cohesion: 0.36
Nodes (8): autoCompletePastBookings(), BookingRecord, completeBooking(), isActiveCourseEnrollment(), isCourseBooking(), isEligibleForAutoComplete(), resolveCourseId(), SYSTEM_AUTO_COMPLETE_ACTOR_ID

### Community 85 - "ChatMessage"
Cohesion: 0.43
Nodes (4): buildHomeworkForUserIds(), isHomeworkVisibleToStudent(), ChatMessage, GROUP_UIDS

### Community 88 - "createGuestCourseEnrollment.ts"
Cohesion: 0.43
Nodes (6): CourseRecord, createGuestCourseEnrollmentHandler(), GuestCourseEnrollmentInput, optionalText(), parseInput(), requireText()

### Community 91 - "StatusBadge.tsx"
Cohesion: 0.32
Nodes (7): BadgeVariant, StatusBadge(), StatusBadgeProps, StyleConfig, VARIANT_MAP, getBookingStatusLabel(), BookingStatus

### Community 92 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 94 - "OnboardingModal.tsx"
Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 97 - "formatDurationLabel"
Cohesion: 0.30
Nodes (9): NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain(), pointsWord() (+1 more)

### Community 108 - "chatSenderRole.test.ts"
Cohesion: 0.33
Nodes (4): instructorProfile, instructors, lessonBooking, studentProfile

### Community 118 - "Booking"
Cohesion: 0.09
Nodes (27): LinkGuestBookingModalProps, AuthModal(), AuthModalProps, ChatWindow(), ChatWindowProps, ConfirmActionModal(), ConfirmActionModalProps, LessonDetailsModalProps (+19 more)

### Community 120 - "bodyScrollLock.ts"
Cohesion: 0.48
Nodes (5): applyBodyScrollLock(), BODY_SCROLL_LOCK_CLASS, lockBodyScroll(), releaseBodyScrollLock(), useBodyScrollLock()

### Community 121 - "activityLogHistory.test.ts"
Cohesion: 0.40
Nodes (3): bookings, courses, userProfile

## Knowledge Gaps
- **404 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+399 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `your_journey/YourJourneySection.tsx`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `AdminPanel.tsx`, `PushNotificationHub.tsx`, `StudentCabinetHome.tsx`, `StudentCoachPanel.tsx`, `src/types.ts`, `HomeRouteContainer.tsx`, `StudentTodaySection.tsx`, `ui/ModalHost.tsx`, `useCourseForm.ts`, `useInstructorWorkspace.ts`, `skillData.ts`, `StudentCabinetShell.tsx`, `UserProfile`, `settingsStore.ts`, `courseLevelStyles.ts`, `translateCourse`, `lib/walletLedger.ts`, `SystemSettings.tsx`, `CourseDetailsModal.tsx`, `chatSenderRole.ts`, `ResortConditionsSidebar.tsx`, `TodayChecklist.tsx`, `useNotifications`, `ScheduleCalendar.tsx`, `StudentHistoryList.tsx`, `useInstructorWorkspace`, `TranslationKey`, `firebase.ts`, `LanguageContext.tsx`, `coachPhone.test.ts`, `StatusBadge.tsx`, `OnboardingModal.tsx`, `formatDurationLabel`, `Booking`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `InstructorBookingCard.tsx`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `bookingTransactions.test.ts`, `useLanguage`, `AdminPanel.tsx`, `firestoreMappers.ts`, `PushNotificationHub.tsx`, `StudentCabinetHome.tsx`, `bookingSelectors.ts`, `StudentCoachPanel.tsx`, `src/types.ts`, `StudentTodaySection.tsx`, `useInstructorWorkspace.ts`, `useBookingChatUnread.ts`, `StudentCabinetShell.tsx`, `UserProfile`, `translateCourse`, `useCourseActions.ts`, `callableTestEnv.ts`, `lib/walletLedger.ts`, `SystemSettings.tsx`, `bookingTransactions.ts`, `TodayChecklist.tsx`, `bookingsStore.ts`, `useNotifications`, `ScheduleCalendar.tsx`, `StudentHistoryList.tsx`, `bookingEndsAt.ts`, `bookingService.ts`, `slotOverlap.ts`, `createBookingCallable.ts`, `coachPhone.test.ts`, `chatSenderRole.test.ts`, `activityLogHistory.test.ts`, `achievements.test.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `your_journey/YourJourneySection.tsx`, `InstructorBookingCard.tsx`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `useLanguage`, `AdminPanel.tsx`, `firestoreMappers.ts`, `PushNotificationHub.tsx`, `StudentCabinetHome.tsx`, `StudentCoachPanel.tsx`, `src/types.ts`, `StudentTodaySection.tsx`, `useInstructorWorkspace.ts`, `skillData.ts`, `StudentCabinetShell.tsx`, `courseLevelStyles.ts`, `useProfileStore`, `useCourseActions.ts`, `bookingTransactions.ts`, `CourseDetailsModal.tsx`, `chatSenderRole.ts`, `bookingsStore.ts`, `ScheduleCalendar.tsx`, `firebase.ts`, `bookingService.ts`, `walletCredit.ts`, `coachPhone.test.ts`, `chatSenderRole.test.ts`, `Booking`, `profileSelectors.ts`, `activityLogHistory.test.ts`, `achievements.test.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _404 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `your_journey/YourJourneySection.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10558069381598793 - nodes in this community are weakly interconnected._
- **Should `studentCabinetUtils.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.060041407867494824 - nodes in this community are weakly interconnected._
- **Should `achievementConfig.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08282828282828283 - nodes in this community are weakly interconnected._