# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 406 files · ~201,522 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2053 nodes · 7012 edges · 126 communities (105 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fc714179`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- StudentTodaySection.tsx
- TranslationKey
- bookingLogic.ts
- studentCabinetUtils.ts
- BookingChatModal.tsx
- achievementConfig.ts
- firebase.ts
- translations.ts
- useNotifications
- lib/walletLedger.ts
- logger.ts
- src/types.ts
- useBookingChatUnread.ts
- StudentCoachPanel.tsx
- StudentProfilePersonalSection.tsx
- chatSenderRole.ts
- useProfileStore
- skillData.ts
- PushNotificationHub.tsx
- ScheduleCalendar.tsx
- UserProfile
- bookingTransactions.test.ts
- useCurrency
- useLanguage
- JourneyProgress.tsx
- scripts
- firestoreMappers.ts
- compilerOptions
- SystemSettings.tsx
- StudentCabinetHome.tsx
- balanceOptimisticMiddleware.ts
- walletStore.ts
- profileStore.ts
- your_journey/YourJourneySection.tsx
- callableTestEnv.ts
- useCourseForm.ts
- extract-coaches-manager.mjs
- AdminPanel.tsx
- bookingTransactions.ts
- global-setup.ts
- CourseDetailsModal.tsx
- dependencies
- compilerOptions
- useInstructorWorkspace.ts
- ErrorBoundary.tsx
- bookingSelectors.ts
- Booking
- devDependencies
- README.md
- StatusBadge.tsx
- LanguageContext.tsx
- slotOverlap.ts
- translateCourse
- StudentHistoryList.tsx
- walletCredit.ts
- extract-courses-manager.mjs
- extract-admin-sections.mjs
- eslint
- OnboardingModal.tsx
- functions/package.json
- package.json
- StudentDevelopmentPanel.tsx
- bookingService.ts
- eslint-plugin-react-refresh
- patch-admin-return.mjs
- pluralize.ts
- StudentActivityRings.tsx
- createBooking.ts
- TodayChecklist.tsx
- ClientBookingsList.tsx
- BookingSelectors.tsx
- declarations.d.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- ChatMessage
- src/index.ts
- createBookingWithPayment
- @firebase/rules-unit-testing
- courseLevelStyles.ts
- autoComplete.ts
- useCourseDateRange.ts
- StudentHomeBottomSections.tsx
- @playwright/test
- prettier
- createGuestCourseEnrollment.ts
- @testing-library/jest-dom
- @testing-library/react
- courseDates.ts
- adminFirestore.test.ts
- typescript-eslint
- bookingEndsAt.ts
- @vitejs/plugin-react
- vitest
- coachPhone.test.ts
- vitest.config.ts
- AGENTS.md
- bodyScrollLock.ts
- RouteGate.tsx
- tailwindcss
- activityLogHistory.test.ts
- Navbar.tsx
- chatService.ts
- CourseBackgroundImageField.tsx
- createGuestCourseEnrollmentCallable.ts
- jsdom
- eslint-plugin-react-hooks
- StudentNextStepCard.tsx

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 236 edges
2. `Booking` - 166 edges
3. `UserProfile` - 135 edges
4. `Course` - 129 edges
5. `Instructor` - 101 edges
6. `useProfileStore` - 58 edges
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
- `backfillCompletedBookingActivityLogs()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/backfillActivityLog.ts → tests/unit/todayRecommendations.test.ts
- `buildSyntheticWalletOperations()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/walletLedger.ts → tests/unit/todayRecommendations.test.ts

## Import Cycles
- None detected.

## Communities (126 total, 21 thin omitted)

### Community 0 - "StudentTodaySection.tsx"
Cohesion: 0.14
Nodes (36): LessonDetailsModal(), RecommendationIndicator(), RecommendationIndicatorProps, HistoryLessonCard(), ScDivider(), ScTextButton(), countPendingRecommendations(), enrichHistoryEventsWithActions() (+28 more)

### Community 1 - "TranslationKey"
Cohesion: 0.09
Nodes (27): CoursesManagerToolbar(), CoursesManagerToolbarProps, LocalizedCompressionError, InstructorBookingCard(), InstructorBookingCardProps, InstructorNotLinked(), InstructorNotLinkedProps, InstructorRecommendationsEditor() (+19 more)

### Community 2 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 3 - "studentCabinetUtils.ts"
Cohesion: 0.06
Nodes (45): BookInstructorPickerModal(), StudentCoursesPanel(), StudentInstructorsPanel(), Achievement, getAvailableCourses(), getEnrolledCourses(), getInstructorPickerGroups(), getInstructorsForStudent() (+37 more)

### Community 4 - "BookingChatModal.tsx"
Cohesion: 0.14
Nodes (18): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageList() (+10 more)

### Community 5 - "achievementConfig.ts"
Cohesion: 0.09
Nodes (44): AchievementsManager(), AchievementsManagerProps, createEmptyAchievement(), RULE_TYPE_OPTIONS, AchievementDefinition, AchievementEvaluationContext, AchievementRule, AchievementRuleType (+36 more)

### Community 6 - "firebase.ts"
Cohesion: 0.09
Nodes (32): Auth(), AuthProps, PRESET_SEEDS, getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService(), saveUserProfileService(), signInWithEmailService() (+24 more)

### Community 7 - "translations.ts"
Cohesion: 0.50
Nodes (5): isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageProvider()

### Community 8 - "useNotifications"
Cohesion: 0.13
Nodes (27): ScheduleCalendar(), AuthBookingFormProps, AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, GuestBookingForm(), GuestBookingFormProps (+19 more)

### Community 9 - "lib/walletLedger.ts"
Cohesion: 0.12
Nodes (24): PaymentGateway(), PaymentGatewayProps, StudentWalletHistoryList(), formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt(), buildSyntheticWalletOperations() (+16 more)

### Community 10 - "logger.ts"
Cohesion: 0.09
Nodes (27): App(), AppBootstrap(), AppBootstrapProps, CourseGallery(), CourseGalleryProps, NotificationProvider(), useNotificationsSync(), Currency (+19 more)

### Community 11 - "src/types.ts"
Cohesion: 0.10
Nodes (18): ConfirmActionModal(), ConfirmActionModalProps, LessonDetailsModalProps, LessonRecommendationsList(), LessonRecommendationsListProps, LevelUpModal(), LevelUpModalProps, PersonalCabinetModalsProps (+10 more)

### Community 12 - "useBookingChatUnread.ts"
Cohesion: 0.24
Nodes (14): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan() (+6 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.17
Nodes (26): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+18 more)

### Community 14 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.15
Nodes (10): optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary, StudentProfilePersonalSection(), StudentProfilePersonalSectionProps, StudentProfilePreferencesSection(), StudentProfilePreferencesSectionProps (+2 more)

### Community 15 - "chatSenderRole.ts"
Cohesion: 0.18
Nodes (14): ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole(), resolveProfileSenderRole() (+6 more)

### Community 16 - "useProfileStore"
Cohesion: 0.08
Nodes (44): AppShell(), FeaturePageShell(), FeaturePageShellProps, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), HomeRouteContainer(), InstructorRouteContainer() (+36 more)

### Community 17 - "skillData.ts"
Cohesion: 0.12
Nodes (27): APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChartProps, SkillConfigManager(), SkillConfigManagerProps (+19 more)

### Community 18 - "PushNotificationHub.tsx"
Cohesion: 0.08
Nodes (31): ErrorLogsPanel(), ErrorLogsPanelProps, FinancialOverview(), FinancialOverviewProps, ErrorLogsPanel, FinancialOverview, Notification, NotificationContext (+23 more)

### Community 19 - "ScheduleCalendar.tsx"
Cohesion: 0.09
Nodes (32): CoachesManager(), CoachesManagerProps, ActiveSlotDetails(), ActiveSlotDetailsProps, ActiveSlotMoveForm(), ActiveSlotMoveFormProps, ScheduleCalendarProps, ScheduleInstructorCell() (+24 more)

### Community 20 - "UserProfile"
Cohesion: 0.08
Nodes (34): BookingsLog(), BookingsLogProps, shortenBookingId(), ClientsManagerProps, LinkGuestBookingModal(), LinkGuestBookingModalProps, ActiveSlotCreateForm(), ActiveSlotCreateFormProps (+26 more)

### Community 21 - "bookingTransactions.test.ts"
Cohesion: 0.18
Nodes (25): CourseEnrollmentError, buildProdCourseSeed(), seedBookings(), seedCourse(), seedCourse(), bookingId, seedLegacyCancelledBooking(), seedProdCourse() (+17 more)

### Community 22 - "useCurrency"
Cohesion: 0.31
Nodes (6): AuthBookingForm(), CourseEnrollAction(), CourseEnrollActionProps, InstructorCard, InstructorCardProps, useCurrency()

### Community 23 - "useLanguage"
Cohesion: 0.07
Nodes (53): AuthModal(), InstructorReviewsModal(), StudentBookNextFab(), StudentBookNextFabProps, StudentCalendarPanel(), StudentTrainingPanel(), getSwipeNeighborSequence(), StudentCabinetShell() (+45 more)

### Community 24 - "JourneyProgress.tsx"
Cohesion: 0.12
Nodes (20): AchievementGrid(), CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, JOURNEY_BG, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND, SUMMARY_STATS, JourneyPathStrip() (+12 more)

### Community 25 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 26 - "firestoreMappers.ts"
Cohesion: 0.12
Nodes (26): signOutService(), AuthState, useAuthStore, useSessionSync(), useBookingsSync(), useCoursesSync(), useCurrentUserProfileSync(), useProfileActivitySync() (+18 more)

### Community 27 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 28 - "SystemSettings.tsx"
Cohesion: 0.17
Nodes (18): SystemSettings(), SystemSettings, saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled(), saveSkillConfig() (+10 more)

### Community 29 - "StudentCabinetHome.tsx"
Cohesion: 0.16
Nodes (26): StudentCabinetHome(), StudentCabinetHomeProps, addMinutesToTime(), buildLocalDateTime(), filterBookingsByScope(), getActiveCourseEnrollment(), getBookingDailyTimeWindow(), getCurrentSessions() (+18 more)

### Community 31 - "walletStore.ts"
Cohesion: 0.18
Nodes (11): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, TODO: реализовать применение кредита в Firestore, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState (+3 more)

### Community 32 - "profileStore.ts"
Cohesion: 0.20
Nodes (17): addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService(), updateUserRoleService(), buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate() (+9 more)

### Community 33 - "your_journey/YourJourneySection.tsx"
Cohesion: 0.25
Nodes (19): EQUAL_MARKER_STOPS, JOURNEY_LEVELS, JourneyPath(), buildWavyPath(), createPathSampler(), getFirstUnlockedJourneyLevelId(), getJourneyLevelUpZones(), getJourneyPathProgress() (+11 more)

### Community 34 - "callableTestEnv.ts"
Cohesion: 0.10
Nodes (37): CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser(), getCallableAuth() (+29 more)

### Community 35 - "useCourseForm.ts"
Cohesion: 0.19
Nodes (15): CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps, CourseInstructorSelection(), CourseInstructorSelectionProps, CourseRichDetailsSection(), CourseRichDetailsSectionProps (+7 more)

### Community 36 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "AdminPanel.tsx"
Cohesion: 0.06
Nodes (43): AdminPanel, AdminCollapsibleSection(), AdminCollapsibleSectionProps, AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), ResortDataSection(), ResortSliderSection() (+35 more)

### Community 38 - "bookingTransactions.ts"
Cohesion: 0.20
Nodes (24): migrateAvailabilitySlots(), AVAILABILITY_MIGRATION_SETTING, AVAILABILITY_SLOTS_COLLECTION, blocksInstructorAvailability(), isCourseBooking(), toAvailabilitySlot(), addBookingWithPayment(), assertNoSlotOverlap() (+16 more)

### Community 39 - "global-setup.ts"
Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 40 - "CourseDetailsModal.tsx"
Cohesion: 0.18
Nodes (14): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseFAQ(), CourseFAQProps, CourseHeader() (+6 more)

### Community 41 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 42 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 43 - "useInstructorWorkspace.ts"
Cohesion: 0.13
Nodes (20): InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews(), InstructorReviewsProps, InstructorStudents(), InstructorStudentsProps (+12 more)

### Community 44 - "ErrorBoundary.tsx"
Cohesion: 0.21
Nodes (8): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, logErrorBoundaryFailure(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 46 - "Booking"
Cohesion: 0.12
Nodes (36): PersonalCabinet, ChatWindowProps, InstructorWorkspaceInput, InstructorReviewsModalProps, ReviewModalProps, HistoryLessonCardProps, StudentCabinetContext, PanelProps (+28 more)

### Community 47 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 48 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 49 - "StatusBadge.tsx"
Cohesion: 0.32
Nodes (7): BadgeVariant, StatusBadge(), StatusBadgeProps, StyleConfig, VARIANT_MAP, getBookingStatusLabel(), BookingStatus

### Community 50 - "LanguageContext.tsx"
Cohesion: 0.13
Nodes (20): CoursesTable(), CoursesTableProps, CourseTableRow(), CourseTableRowProps, CoursesManager(), CoursesManagerProps, ScheduleToolbarProps, BookingOverlapWarnings() (+12 more)

### Community 51 - "slotOverlap.ts"
Cohesion: 0.16
Nodes (12): addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap(), buildCourseEnrollmentBooking(), PROD_COURSE_ID (+4 more)

### Community 52 - "translateCourse"
Cohesion: 0.26
Nodes (14): formatCourseCardDate(), GroupCourseCard(), enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), translateCourse(), formatCourseCardDuration(), getGroupScheduleLabel() (+6 more)

### Community 53 - "StudentHistoryList.tsx"
Cohesion: 0.27
Nodes (10): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+2 more)

### Community 55 - "walletCredit.ts"
Cohesion: 0.30
Nodes (13): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_KZT (+5 more)

### Community 56 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 57 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 59 - "OnboardingModal.tsx"
Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 60 - "functions/package.json"
Cohesion: 0.12
Nodes (16): firebase-admin, firebase-functions, dependencies, firebase-admin, firebase-functions, devDependencies, typescript, engines (+8 more)

### Community 61 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, universal-analytics, private, type, version

### Community 62 - "StudentDevelopmentPanel.tsx"
Cohesion: 0.23
Nodes (15): ClientSkillProgressView(), ClientSkillProgressViewProps, SkillRadarChart(), getLevelLabel(), getLevelProgressPercent(), getNextStepAction(), getPrioritySkillItems(), getSkillItemRingCategory() (+7 more)

### Community 63 - "bookingService.ts"
Cohesion: 0.08
Nodes (56): SystemSettingsProps, useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService() (+48 more)

### Community 65 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 66 - "pluralize.ts"
Cohesion: 0.47
Nodes (5): TrainingStreak(), formatPointsCount(), formatPointsGain(), pointsWord(), russianPlural()

### Community 67 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 68 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 69 - "TodayChecklist.tsx"
Cohesion: 0.39
Nodes (7): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), ProfileState, TodayTaskRef

### Community 70 - "ClientBookingsList.tsx"
Cohesion: 0.19
Nodes (10): BookingSelectors(), ChatUnreadIndicator(), ChatUnreadIndicatorProps, ApplePagination(), ApplePaginationProps, ClientBookingsList(), LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS (+2 more)

### Community 71 - "BookingSelectors.tsx"
Cohesion: 0.31
Nodes (7): BookingSelectorsProps, EnrichedCourseBooking, DifficultyLabelVariant, ActivityLogMetadata, ActivityLogType, SkillDeltaMeta, LessonDifficulty

### Community 72 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 73 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 78 - "ChatMessage"
Cohesion: 0.43
Nodes (4): buildHomeworkForUserIds(), isHomeworkVisibleToStudent(), ChatMessage, GROUP_UIDS

### Community 79 - "src/index.ts"
Cohesion: 0.35
Nodes (8): getAdminFirestore(), getOrInitApp(), createBooking, createGuestCourseEnrollment, enrollInCourse, scheduledAutoCompleteBookings, scheduledPurgeExpiredNotifications, purgeExpiredNotifications()

### Community 80 - "createBookingWithPayment"
Cohesion: 0.31
Nodes (9): createBookingWithPayment(), EnrollCourseInput, enrollInCourseHandler(), parseInput(), recordWalletLedgerEntryInTransaction(), WALLET_LEDGER_COLLECTION, WalletLedgerEntry, walletLedgerEntryId() (+1 more)

### Community 82 - "courseLevelStyles.ts"
Cohesion: 0.19
Nodes (12): adminBadgeClass, cardTextClass, CourseLevel, courseLevelBadgeLabel, courseLevelColors, getCourseLevelCardBadgeClass(), getCourseTrackLabel(), getUserLevelBadgeClass() (+4 more)

### Community 83 - "autoComplete.ts"
Cohesion: 0.36
Nodes (8): autoCompletePastBookings(), BookingRecord, completeBooking(), isActiveCourseEnrollment(), isCourseBooking(), isEligibleForAutoComplete(), resolveCourseId(), SYSTEM_AUTO_COMPLETE_ACTOR_ID

### Community 84 - "useCourseDateRange.ts"
Cohesion: 0.33
Nodes (8): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, formatDateLocalYMD(), CourseDateRangeState, useCourseDateRange(), formatCourseDates()

### Community 85 - "StudentHomeBottomSections.tsx"
Cohesion: 0.29
Nodes (8): AnimatedNumber(), AnimatedNumberProps, StudentCabinetWeatherSection(), StudentCabinetWeatherSectionProps, StudentLatestRecommendationSection(), ResortConditionsSidebar(), getLatestCoachRecommendation(), getWeatherConditionKey()

### Community 88 - "createGuestCourseEnrollment.ts"
Cohesion: 0.43
Nodes (6): CourseRecord, createGuestCourseEnrollmentHandler(), GuestCourseEnrollmentInput, optionalText(), parseInput(), requireText()

### Community 91 - "courseDates.ts"
Cohesion: 0.27
Nodes (10): UpcomingSessionsStrip(), getHourSuffix(), STATUS_LABELS, formatShortBookingDate(), MONTHS_EN, MONTHS_RU, MONTHS_SHORT_EN, MONTHS_SHORT_RU (+2 more)

### Community 92 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 94 - "bookingEndsAt.ts"
Cohesion: 0.42
Nodes (7): BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), parseCourseEndDateTime(), baseLesson

### Community 97 - "coachPhone.test.ts"
Cohesion: 0.38
Nodes (5): BookingCallCoachButton(), normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 108 - "bodyScrollLock.ts"
Cohesion: 0.48
Nodes (5): applyBodyScrollLock(), BODY_SCROLL_LOCK_CLASS, lockBodyScroll(), releaseBodyScrollLock(), useBodyScrollLock()

### Community 109 - "RouteGate.tsx"
Cohesion: 0.33
Nodes (6): AdminRoute(), AuthRoute(), InstructorRoute(), RouteGate(), RouteGateProps, RouteGateRole

### Community 118 - "activityLogHistory.test.ts"
Cohesion: 0.15
Nodes (3): bookings, courses, userProfile

### Community 119 - "Navbar.tsx"
Cohesion: 0.33
Nodes (7): Logo(), LogoProps, Navbar(), NavbarProps, CABINET_TABS, getDefaultWorkspacePath(), isInstructorWorkspaceUser()

### Community 120 - "chatService.ts"
Cohesion: 0.43
Nodes (6): InstructorMessage, useInstructorBookingMessages(), createChatMessage(), messagesPath(), setChatMessageHomework(), subscribeToChatMessages()

### Community 121 - "CourseBackgroundImageField.tsx"
Cohesion: 0.53
Nodes (4): CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), uploadImage()

### Community 122 - "createGuestCourseEnrollmentCallable.ts"
Cohesion: 0.40
Nodes (5): CourseEnrollmentModal(), createGuestCourseEnrollment, createGuestCourseEnrollmentViaCallable(), GuestCourseEnrollmentInput, GuestCourseEnrollmentResult

### Community 125 - "StudentNextStepCard.tsx"
Cohesion: 0.67
Nodes (3): NextStepAction, StudentNextStepCard(), StudentNextStepCardProps

## Knowledge Gaps
- **413 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+408 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `StudentTodaySection.tsx`, `TranslationKey`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `firebase.ts`, `useNotifications`, `lib/walletLedger.ts`, `logger.ts`, `src/types.ts`, `StudentCoachPanel.tsx`, `StudentProfilePersonalSection.tsx`, `useProfileStore`, `skillData.ts`, `PushNotificationHub.tsx`, `ScheduleCalendar.tsx`, `UserProfile`, `useCurrency`, `JourneyProgress.tsx`, `SystemSettings.tsx`, `StudentCabinetHome.tsx`, `your_journey/YourJourneySection.tsx`, `useCourseForm.ts`, `AdminPanel.tsx`, `CourseDetailsModal.tsx`, `useInstructorWorkspace.ts`, `Booking`, `StatusBadge.tsx`, `LanguageContext.tsx`, `translateCourse`, `StudentHistoryList.tsx`, `OnboardingModal.tsx`, `StudentDevelopmentPanel.tsx`, `pluralize.ts`, `TodayChecklist.tsx`, `ClientBookingsList.tsx`, `useCourseDateRange.ts`, `StudentHomeBottomSections.tsx`, `courseDates.ts`, `coachPhone.test.ts`, `Navbar.tsx`, `CourseBackgroundImageField.tsx`, `createGuestCourseEnrollmentCallable.ts`, `StudentNextStepCard.tsx`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `StudentTodaySection.tsx`, `TranslationKey`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `useNotifications`, `lib/walletLedger.ts`, `src/types.ts`, `useBookingChatUnread.ts`, `StudentCoachPanel.tsx`, `chatSenderRole.ts`, `useProfileStore`, `PushNotificationHub.tsx`, `ScheduleCalendar.tsx`, `UserProfile`, `bookingTransactions.test.ts`, `useLanguage`, `firestoreMappers.ts`, `SystemSettings.tsx`, `StudentCabinetHome.tsx`, `callableTestEnv.ts`, `AdminPanel.tsx`, `bookingTransactions.ts`, `useInstructorWorkspace.ts`, `bookingSelectors.ts`, `LanguageContext.tsx`, `slotOverlap.ts`, `translateCourse`, `StudentHistoryList.tsx`, `bookingService.ts`, `TodayChecklist.tsx`, `ClientBookingsList.tsx`, `StudentHomeBottomSections.tsx`, `bookingEndsAt.ts`, `coachPhone.test.ts`, `activityLogHistory.test.ts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `StudentTodaySection.tsx`, `TranslationKey`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `firebase.ts`, `useNotifications`, `lib/walletLedger.ts`, `src/types.ts`, `StudentCoachPanel.tsx`, `StudentProfilePersonalSection.tsx`, `chatSenderRole.ts`, `useProfileStore`, `skillData.ts`, `PushNotificationHub.tsx`, `ScheduleCalendar.tsx`, `useCurrency`, `useLanguage`, `JourneyProgress.tsx`, `firestoreMappers.ts`, `StudentCabinetHome.tsx`, `profileStore.ts`, `your_journey/YourJourneySection.tsx`, `AdminPanel.tsx`, `bookingTransactions.ts`, `CourseDetailsModal.tsx`, `useInstructorWorkspace.ts`, `Booking`, `LanguageContext.tsx`, `walletCredit.ts`, `StudentDevelopmentPanel.tsx`, `bookingService.ts`, `TodayChecklist.tsx`, `ClientBookingsList.tsx`, `coachPhone.test.ts`, `RouteGate.tsx`, `activityLogHistory.test.ts`, `Navbar.tsx`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _413 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `StudentTodaySection.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14390243902439023 - nodes in this community are weakly interconnected._
- **Should `TranslationKey` be split into smaller, more focused modules?**
  _Cohesion score 0.0907563025210084 - nodes in this community are weakly interconnected._
- **Should `studentCabinetUtils.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05725490196078432 - nodes in this community are weakly interconnected._