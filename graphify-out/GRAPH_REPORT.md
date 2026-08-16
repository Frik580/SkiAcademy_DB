# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 406 files · ~201,466 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2053 nodes · 7009 edges · 121 communities (100 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fc714179`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- GroupCourseCard.tsx
- InstructorBookingCard.tsx
- bookingLogic.ts
- studentCabinetUtils.ts
- BookingChatModal.tsx
- achievementConfig.ts
- firebase.ts
- translations.ts
- useNotifications
- lib/walletLedger.ts
- useCourseActions.ts
- LanguageContext.tsx
- useBookingChatUnread.ts
- StudentCoachPanel.tsx
- StudentProfilePersonalSection.tsx
- chatSenderRole.ts
- ui/ModalHost.tsx
- skillData.ts
- PushNotificationHub.tsx
- ScheduleCalendar.tsx
- Instructor
- bookingTransactions.test.ts
- UserProfile
- StudentCabinetShell.tsx
- your_journey/YourJourneySection.tsx
- scripts
- useProfileStore
- compilerOptions
- settingsStore.ts
- AdminPanel.tsx
- balanceOptimisticMiddleware.ts
- walletStore.ts
- todayChecklist.ts
- TranslationKey
- callableTestEnv.ts
- useCourseForm.ts
- extract-coaches-manager.mjs
- SystemSettings.tsx
- bookingTransactions.ts
- global-setup.ts
- CourseDetailsModal.tsx
- dependencies
- compilerOptions
- useInstructorWorkspace
- CourseEnrollmentModal.tsx
- ErrorLogsPanel.tsx
- Booking
- devDependencies
- README.md
- StatusBadge.tsx
- src/types.ts
- courseEnrollmentRegression.test.ts
- translateCourse
- StudentHistoryList.tsx
- StudentCabinetPanels.tsx
- walletCredit.ts
- extract-courses-manager.mjs
- extract-admin-sections.mjs
- eslint
- OnboardingModal.tsx
- functions/package.json
- package.json
- slotOverlap.ts
- bookingService.ts
- LessonFilters.tsx
- patch-admin-return.mjs
- StudentDevelopmentPanel.tsx
- StudentActivityRings.tsx
- createBooking.ts
- @types/canvas-confetti
- useLanguage
- booking.ts
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
- @playwright/test
- prettier
- createGuestCourseEnrollment.ts
- @testing-library/jest-dom
- @testing-library/react
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
- Navbar.tsx
- chatService.ts
- CourseBackgroundImageField.tsx
- jsdom
- eslint-plugin-react-hooks

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
- `clearStudentBookings()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/clearStudentBookings.ts → tests/unit/todayRecommendations.test.ts
- `clearCancelledBookings()` --indirect_call--> `booking()`  [INFERRED]
  src/lib/clearStudentBookings.ts → tests/unit/todayRecommendations.test.ts

## Import Cycles
- None detected.

## Communities (121 total, 21 thin omitted)

### Community 0 - "GroupCourseCard.tsx"
Cohesion: 0.13
Nodes (34): formatCourseCardDate(), GroupCourseCard(), LessonDetailsModal(), HistoryLessonCard(), countPendingRecommendations(), enrichHistoryEventsWithActions(), formatBookingDayMonth(), formatCourseDateRangeLabel() (+26 more)

### Community 1 - "InstructorBookingCard.tsx"
Cohesion: 0.15
Nodes (16): InstructorBookingCard(), InstructorBookingCardProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, StudentAssessButton(), StudentAssessButtonProps, StudentLevelControls(), StudentLevelControlsProps (+8 more)

### Community 2 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 3 - "studentCabinetUtils.ts"
Cohesion: 0.07
Nodes (51): ClientBookingsList(), StudentCabinetHome(), Achievement, addMinutesToTime(), buildLocalDateTime(), filterBookingsByScope(), formatSessionTimeRange(), getActiveCourseEnrollment() (+43 more)

### Community 4 - "BookingChatModal.tsx"
Cohesion: 0.14
Nodes (18): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageList() (+10 more)

### Community 5 - "achievementConfig.ts"
Cohesion: 0.09
Nodes (48): AchievementsManager(), AchievementsManagerProps, createEmptyAchievement(), RULE_TYPE_OPTIONS, formatActivityTimestamp(), getAchievements(), AchievementDefinition, AchievementRule (+40 more)

### Community 6 - "firebase.ts"
Cohesion: 0.09
Nodes (29): Auth(), AuthProps, PRESET_SEEDS, getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService(), saveUserProfileService(), signInWithEmailService() (+21 more)

### Community 7 - "translations.ts"
Cohesion: 0.50
Nodes (5): isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageProvider()

### Community 8 - "useNotifications"
Cohesion: 0.15
Nodes (26): AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, GuestBookingForm(), GuestBookingFormProps, useBookingModal(), BookingModal() (+18 more)

### Community 9 - "lib/walletLedger.ts"
Cohesion: 0.11
Nodes (26): BookingsLog(), shortenBookingId(), PaymentGateway(), PaymentGatewayProps, StudentWalletHistoryList(), formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt() (+18 more)

### Community 10 - "useCourseActions.ts"
Cohesion: 0.31
Nodes (11): getCurrentAuthenticatedUser(), addCourseService(), deleteCourseService(), enrollInCourseService(), notifyCourseModifiedService(), updateCourseService(), useCourseActions(), enrollInCourse (+3 more)

### Community 11 - "LanguageContext.tsx"
Cohesion: 0.11
Nodes (21): LinkGuestBookingModal(), LinkGuestBookingModalProps, AuthModalProps, ChatWindowProps, ConfirmActionModal(), ConfirmActionModalProps, LessonDetailsModalProps, LessonRecommendationsList() (+13 more)

### Community 12 - "useBookingChatUnread.ts"
Cohesion: 0.24
Nodes (14): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan() (+6 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.17
Nodes (26): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+18 more)

### Community 14 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.17
Nodes (12): PersonalCabinetModals(), optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary, StudentProfilePersonalSection(), StudentProfilePersonalSectionProps, useEffectiveBalance() (+4 more)

### Community 15 - "chatSenderRole.ts"
Cohesion: 0.18
Nodes (14): ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole(), resolveProfileSenderRole() (+6 more)

### Community 16 - "ui/ModalHost.tsx"
Cohesion: 0.07
Nodes (39): AppShell(), FeaturePageShell(), FeaturePageShellProps, AdminPanel, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), HomeRouteContainer() (+31 more)

### Community 17 - "skillData.ts"
Cohesion: 0.10
Nodes (37): ClientSkillProgressView(), ClientSkillProgressViewProps, APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChart() (+29 more)

### Community 18 - "PushNotificationHub.tsx"
Cohesion: 0.14
Nodes (18): Notification, NotificationContext, NotificationContextType, NotificationHubModal(), NotificationHubModalProps, clearNotificationsService(), deleteNotificationService(), markNotificationsAsReadService() (+10 more)

### Community 19 - "ScheduleCalendar.tsx"
Cohesion: 0.12
Nodes (23): ActiveSlotDetails(), ActiveSlotDetailsProps, ScheduleCalendarProps, ScheduleInstructorCell(), AvailableDurationsOptions, AvailableMoveTimesOptions, getAvailableMoveTimeSlots(), getAvailableScheduleDurations() (+15 more)

### Community 20 - "Instructor"
Cohesion: 0.09
Nodes (22): ActiveSlotMoveForm(), ActiveSlotMoveFormProps, BookingModalHeader(), BookingModalHeaderProps, BookingModalInput, BookingChatModalProps, BookingModalProps, InstructorReviewsModalProps (+14 more)

### Community 21 - "bookingTransactions.test.ts"
Cohesion: 0.23
Nodes (20): seedBookings(), seedCourse(), seedCourse(), seedProdUser(), clearIntegrationFirestore(), INSTRUCTOR_ID, INSTRUCTOR_USER_ID, integrationTestEnv() (+12 more)

### Community 22 - "UserProfile"
Cohesion: 0.14
Nodes (20): CoursesTableProps, CourseTableRow(), CourseTableRowProps, ChatMessageListProps, CourseEnrollAction(), CourseEnrollActionProps, CourseEnrollmentModalProps, GroupCourseCardProps (+12 more)

### Community 23 - "StudentCabinetShell.tsx"
Cohesion: 0.07
Nodes (42): StudentBookNextFab(), StudentBookNextFabProps, getSwipeNeighborSequence(), StudentCabinetShell(), SC_TINT_CARD, SC_TINT_VALUE, ScProgressBar(), ScSectionTitle() (+34 more)

### Community 24 - "your_journey/YourJourneySection.tsx"
Cohesion: 0.10
Nodes (41): AchievementGrid(), CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, EQUAL_MARKER_STOPS, JOURNEY_BG, JOURNEY_LEVELS, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND (+33 more)

### Community 25 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 26 - "useProfileStore"
Cohesion: 0.11
Nodes (36): useAvailabilityMigrationSync(), AuthState, useAuthStore, useSessionSync(), useBookingsSync(), useCoursesSync(), useNotificationsSync(), addUserService() (+28 more)

### Community 27 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 28 - "settingsStore.ts"
Cohesion: 0.13
Nodes (24): AppBootstrap(), AppBootstrapProps, useAchievementsSync(), saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled() (+16 more)

### Community 29 - "AdminPanel.tsx"
Cohesion: 0.14
Nodes (15): AdminRoleManager(), AdminRoleManagerProps, BookingsLogProps, ClientsManager(), ClientsManagerProps, CoachesManagerProps, AdminPanelProps, AdminRoleManager (+7 more)

### Community 31 - "walletStore.ts"
Cohesion: 0.18
Nodes (11): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, TODO: реализовать применение кредита в Firestore, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState (+3 more)

### Community 32 - "todayChecklist.ts"
Cohesion: 0.17
Nodes (18): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), ProfileState, buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate() (+10 more)

### Community 33 - "TranslationKey"
Cohesion: 0.14
Nodes (17): CoursesManagerToolbar(), CoursesManagerToolbarProps, ScheduleInstructorCellProps, ScheduleToolbar(), ScheduleToolbarProps, ScheduleViewMode, LocalizedCompressionError, BookingOverlapWarningsProps (+9 more)

### Community 34 - "callableTestEnv.ts"
Cohesion: 0.10
Nodes (37): CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser(), getCallableAuth() (+29 more)

### Community 35 - "useCourseForm.ts"
Cohesion: 0.18
Nodes (14): CoachesManager(), CourseForm(), CourseFormProps, CourseInstructorSelection(), CourseInstructorSelectionProps, CourseRichDetailsSection(), CourseRichDetailsSectionProps, CourseTranslationsSection() (+6 more)

### Community 36 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "SystemSettings.tsx"
Cohesion: 0.05
Nodes (45): AdminCollapsibleSection(), AdminCollapsibleSectionProps, ResortDataSection(), ResortSliderSection(), FALLBACK_SLIDES, SystemSettings(), SystemSettings, AnimatedNumber() (+37 more)

### Community 38 - "bookingTransactions.ts"
Cohesion: 0.23
Nodes (19): isCourseBooking(), addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, cancelBookingWithRefund(), createBookingWithPayment(), createGuestBooking(), loadInstructorSlotRefs() (+11 more)

### Community 39 - "global-setup.ts"
Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 40 - "CourseDetailsModal.tsx"
Cohesion: 0.15
Nodes (16): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseFAQ(), CourseFAQProps, CourseGallery() (+8 more)

### Community 41 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 42 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 43 - "useInstructorWorkspace"
Cohesion: 0.16
Nodes (12): InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews(), InstructorReviewsProps, InstructorStudents(), InstructorStudentsProps (+4 more)

### Community 44 - "CourseEnrollmentModal.tsx"
Cohesion: 0.07
Nodes (31): App(), FinancialOverview(), FinancialOverviewProps, FinancialOverview, AuthBookingForm(), AuthBookingFormProps, BookingOverlapWarnings(), CourseEnrollmentModal() (+23 more)

### Community 45 - "ErrorLogsPanel.tsx"
Cohesion: 0.16
Nodes (14): ErrorLogsPanel(), ErrorLogsPanelProps, ErrorLogsPanel, ActionButton(), ActionButtonProps, StateCard(), StateCardProps, deleteErrorLog() (+6 more)

### Community 46 - "Booking"
Cohesion: 0.11
Nodes (27): PersonalCabinet, ReviewModal(), ReviewModalProps, StudentCabinetContext, StudentCabinetShellProps, NextSessionItem, StudentCabinetTab, StudentCoachPanelProps (+19 more)

### Community 47 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, eslint-plugin-react-refresh, firebase-tools, globals (+23 more)

### Community 48 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 49 - "StatusBadge.tsx"
Cohesion: 0.32
Nodes (7): BadgeVariant, StatusBadge(), StatusBadgeProps, StyleConfig, VARIANT_MAP, getBookingStatusLabel(), BookingStatus

### Community 50 - "src/types.ts"
Cohesion: 0.06
Nodes (18): CoursesTable(), CoursesManager(), CoursesManagerProps, CoursesManager, CoursesState, buildClonedCourse(), bookings, courses (+10 more)

### Community 51 - "courseEnrollmentRegression.test.ts"
Cohesion: 0.27
Nodes (10): buildCourseEnrollmentBooking(), buildProdCourseSeed(), PROD_COURSE_ID, PROD_USER_ID, prodBookingId(), prodInstructorId(), RulesBookingSeed, bookingId (+2 more)

### Community 52 - "translateCourse"
Cohesion: 0.21
Nodes (18): AdminPanel(), enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), STATUS_LABELS, translateCourse(), getGroupScheduleLabel(), MONTHS_EN (+10 more)

### Community 53 - "StudentHistoryList.tsx"
Cohesion: 0.27
Nodes (10): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+2 more)

### Community 54 - "StudentCabinetPanels.tsx"
Cohesion: 0.16
Nodes (18): sortVisibleCourses(), GroupCoursesSection(), BookInstructorPickerModal(), StudentCalendarPanel(), StudentCoursesPanel(), StudentInstructorsPanel(), StudentTrainingPanel(), TRAINING_HUB_ITEMS (+10 more)

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

### Community 62 - "slotOverlap.ts"
Cohesion: 0.29
Nodes (8): addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), buildHourLockIds(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap(), AvailabilitySlot

### Community 63 - "bookingService.ts"
Cohesion: 0.12
Nodes (46): SystemSettingsProps, useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService() (+38 more)

### Community 65 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 66 - "StudentDevelopmentPanel.tsx"
Cohesion: 0.19
Nodes (15): BookingSelectors(), getLevelProgressPercent(), getNextStepAction(), getPrioritySkillItems(), NextStepAction, StudentDevelopmentPanel(), StudentDevelopmentPanelProps, StudentNextStepCard() (+7 more)

### Community 67 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 68 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 70 - "useLanguage"
Cohesion: 0.11
Nodes (28): AuthModal(), ChatUnreadIndicator(), ChatUnreadIndicatorProps, InstructorReviewsModal(), LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, RecommendationIndicator(), RecommendationIndicatorProps (+20 more)

### Community 71 - "booking.ts"
Cohesion: 0.16
Nodes (13): ActiveSlotCreateForm(), ActiveSlotCreateFormProps, EnrichedBooking, EnrichedCourseBooking, InstructorWorkspaceInput, StatusFilter, ACTIVITY_LOGS_COLLECTION, activityLogId (+5 more)

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
Cohesion: 0.26
Nodes (10): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, ScheduleCalendar(), formatDateLocalYMD(), getWeekRange(), CourseDateRangeState (+2 more)

### Community 88 - "createGuestCourseEnrollment.ts"
Cohesion: 0.43
Nodes (6): CourseRecord, createGuestCourseEnrollmentHandler(), GuestCourseEnrollmentInput, optionalText(), parseInput(), requireText()

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

### Community 119 - "Navbar.tsx"
Cohesion: 0.33
Nodes (7): Logo(), LogoProps, Navbar(), NavbarProps, CABINET_TABS, getDefaultWorkspacePath(), isInstructorWorkspaceUser()

### Community 120 - "chatService.ts"
Cohesion: 0.43
Nodes (6): InstructorMessage, useInstructorBookingMessages(), createChatMessage(), messagesPath(), setChatMessageHomework(), subscribeToChatMessages()

### Community 121 - "CourseBackgroundImageField.tsx"
Cohesion: 0.33
Nodes (6): CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), CourseBasicInfoSection(), CourseBasicInfoSectionProps, getCourseLevelCardClass()

## Knowledge Gaps
- **413 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+408 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `GroupCourseCard.tsx`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `firebase.ts`, `useNotifications`, `lib/walletLedger.ts`, `LanguageContext.tsx`, `StudentCoachPanel.tsx`, `StudentProfilePersonalSection.tsx`, `ui/ModalHost.tsx`, `skillData.ts`, `PushNotificationHub.tsx`, `ScheduleCalendar.tsx`, `Instructor`, `UserProfile`, `StudentCabinetShell.tsx`, `your_journey/YourJourneySection.tsx`, `settingsStore.ts`, `AdminPanel.tsx`, `todayChecklist.ts`, `useCourseForm.ts`, `SystemSettings.tsx`, `CourseDetailsModal.tsx`, `useInstructorWorkspace`, `CourseEnrollmentModal.tsx`, `ErrorLogsPanel.tsx`, `Booking`, `StatusBadge.tsx`, `src/types.ts`, `translateCourse`, `StudentHistoryList.tsx`, `StudentCabinetPanels.tsx`, `OnboardingModal.tsx`, `LessonFilters.tsx`, `StudentDevelopmentPanel.tsx`, `booking.ts`, `useCourseDateRange.ts`, `coachPhone.test.ts`, `Navbar.tsx`, `CourseBackgroundImageField.tsx`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `GroupCourseCard.tsx`, `InstructorBookingCard.tsx`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `useNotifications`, `lib/walletLedger.ts`, `useCourseActions.ts`, `LanguageContext.tsx`, `useBookingChatUnread.ts`, `StudentCoachPanel.tsx`, `chatSenderRole.ts`, `ui/ModalHost.tsx`, `PushNotificationHub.tsx`, `ScheduleCalendar.tsx`, `Instructor`, `bookingTransactions.test.ts`, `UserProfile`, `StudentCabinetShell.tsx`, `useProfileStore`, `settingsStore.ts`, `AdminPanel.tsx`, `todayChecklist.ts`, `callableTestEnv.ts`, `SystemSettings.tsx`, `bookingTransactions.ts`, `src/types.ts`, `translateCourse`, `StudentHistoryList.tsx`, `StudentCabinetPanels.tsx`, `slotOverlap.ts`, `bookingService.ts`, `useLanguage`, `booking.ts`, `bookingEndsAt.ts`, `coachPhone.test.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `GroupCourseCard.tsx`, `InstructorBookingCard.tsx`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `firebase.ts`, `useNotifications`, `lib/walletLedger.ts`, `useCourseActions.ts`, `LanguageContext.tsx`, `StudentCoachPanel.tsx`, `StudentProfilePersonalSection.tsx`, `chatSenderRole.ts`, `ui/ModalHost.tsx`, `skillData.ts`, `PushNotificationHub.tsx`, `ScheduleCalendar.tsx`, `Instructor`, `StudentCabinetShell.tsx`, `your_journey/YourJourneySection.tsx`, `useProfileStore`, `settingsStore.ts`, `AdminPanel.tsx`, `todayChecklist.ts`, `SystemSettings.tsx`, `bookingTransactions.ts`, `CourseDetailsModal.tsx`, `CourseEnrollmentModal.tsx`, `Booking`, `src/types.ts`, `StudentCabinetPanels.tsx`, `walletCredit.ts`, `bookingService.ts`, `useLanguage`, `booking.ts`, `coachPhone.test.ts`, `RouteGate.tsx`, `Navbar.tsx`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _413 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `GroupCourseCard.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1337126600284495 - nodes in this community are weakly interconnected._
- **Should `studentCabinetUtils.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07199032062915911 - nodes in this community are weakly interconnected._
- **Should `BookingChatModal.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1383399209486166 - nodes in this community are weakly interconnected._