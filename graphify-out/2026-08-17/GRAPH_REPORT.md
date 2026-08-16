# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 402 files · ~200,789 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2042 nodes · 6956 edges · 123 communities (103 shown, 20 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7f42f404`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- firestoreMappers.ts
- TranslationKey
- bookingLogic.ts
- studentCabinetUtils.ts
- BookingChatModal.tsx
- achievementConfig.ts
- Auth.tsx
- LanguageContext.tsx
- booking.ts
- lib/walletLedger.ts
- useCourseActions.ts
- Booking
- useBookingChatUnread.ts
- StudentCoachPanel.tsx
- StudentProfilePersonalSection.tsx
- chatSenderRole.ts
- ui/ModalHost.tsx
- StudentTodaySection.tsx
- notificationService.ts
- CoursesManager.tsx
- useBookingModal.ts
- StudentCabinetPanels.tsx
- walletStore.ts
- useLanguage
- skillData.ts
- scripts
- firebase.ts
- compilerOptions
- settingsStore.ts
- courseLevelStyles.ts
- balanceOptimisticMiddleware.ts
- courseService.ts
- useProfileStore
- isCourseBooking
- bookingTransactions.test.ts
- CourseEnrollmentModal.tsx
- extract-coaches-manager.mjs
- SystemSettings.tsx
- bookingTransactions.ts
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
- coachPhone.test.ts
- bookingEndsAt.ts
- ScheduleCalendar.tsx
- StudentHistoryList.tsx
- src/types.ts
- useNotifications
- extract-courses-manager.mjs
- extract-admin-sections.mjs
- RouteGate.tsx
- createBookingCallable.ts
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
- Language
- slotOverlap.ts
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
- InstructorRecommendationsEditor.tsx
- autoComplete.ts
- @playwright/test
- prettier
- createGuestCourseEnrollment.ts
- @testing-library/jest-dom
- @testing-library/react
- ChatMessage
- adminFirestore.test.ts
- typescript-eslint
- OnboardingModal.tsx
- @vitejs/plugin-react
- vitest
- StudentProfilePreferencesSection.tsx
- vitest.config.ts
- AGENTS.md
- eslint-plugin-react-hooks
- tailwindcss
- BodyScrollLock.tsx
- ErrorLogsPanel.tsx
- bodyScrollLock.ts
- jsdom
- eslint

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 236 edges
2. `Booking` - 166 edges
3. `UserProfile` - 135 edges
4. `Course` - 129 edges
5. `Instructor` - 101 edges
6. `useProfileStore` - 51 edges
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

## Communities (123 total, 20 thin omitted)

### Community 0 - "firestoreMappers.ts"
Cohesion: 0.17
Nodes (16): useBookingStore, useBookingsSync(), useCoursesSync(), DomainModel, FirestoreModel, toActivityLog(), toBooking(), toCourse() (+8 more)

### Community 1 - "TranslationKey"
Cohesion: 0.16
Nodes (14): LocalizedCompressionError, BookingModalHeaderProps, InstructorBookingCard(), InstructorBookingCardProps, StudentAssessButton(), StudentAssessButtonProps, StudentLevelControls(), StudentLevelControlsProps (+6 more)

### Community 2 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 3 - "studentCabinetUtils.ts"
Cohesion: 0.06
Nodes (61): StudentCabinetHome(), StudentCabinetHomeProps, Achievement, addMinutesToTime(), BookingListScope, buildLocalDateTime(), filterBookingsByScope(), formatActivityTimestamp() (+53 more)

### Community 4 - "BookingChatModal.tsx"
Cohesion: 0.15
Nodes (17): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+9 more)

### Community 5 - "achievementConfig.ts"
Cohesion: 0.08
Nodes (52): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, getAchievements(), getTodayAchievements(), isTimestampOnLocalDate(), parseActivityTimestamp(), TodayProgressBlock (+44 more)

### Community 6 - "Auth.tsx"
Cohesion: 0.31
Nodes (12): Auth(), AuthProps, PRESET_SEEDS, getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService(), saveUserProfileService(), signInWithEmailService() (+4 more)

### Community 7 - "LanguageContext.tsx"
Cohesion: 0.33
Nodes (8): isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageContext, LanguageProvider(), TranslatedBooking, UseTranslatedBookingsOptions

### Community 8 - "booking.ts"
Cohesion: 0.13
Nodes (6): ApplePagination(), ApplePaginationProps, StudentWalletHistoryListProps, WalletPanelProps, WalletLedgerEntry, course

### Community 9 - "lib/walletLedger.ts"
Cohesion: 0.13
Nodes (20): PaymentGateway(), PaymentGatewayProps, StudentWalletHistoryList(), buildSyntheticWalletOperations(), buildWalletOperationHistory(), enrichWalletOperationWithBooking(), formatWalletOperationLabel(), formatWalletSessionDate() (+12 more)

### Community 10 - "useCourseActions.ts"
Cohesion: 0.22
Nodes (15): getCurrentAuthenticatedUser(), deleteCourseService(), updateCourseService(), useCourseActions(), useNotificationsSync(), getNotificationTimestampMs(), isNotificationExpired(), purgeExpiredNotificationsForUser() (+7 more)

### Community 11 - "Booking"
Cohesion: 0.07
Nodes (78): AchievementsManagerProps, BookingsLogProps, ClientsManagerProps, CoachesManagerProps, CoursesTableProps, CourseTableRowProps, CoursesManagerProps, LinkGuestBookingModalProps (+70 more)

### Community 12 - "useBookingChatUnread.ts"
Cohesion: 0.24
Nodes (14): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan() (+6 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.15
Nodes (28): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+20 more)

### Community 14 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.23
Nodes (11): CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary, StudentProfilePersonalSection() (+3 more)

### Community 15 - "chatSenderRole.ts"
Cohesion: 0.18
Nodes (13): ChatMessageList(), ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole() (+5 more)

### Community 16 - "ui/ModalHost.tsx"
Cohesion: 0.08
Nodes (35): AppShell(), FeaturePageShell(), FeaturePageShellProps, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), PersonalCabinet, HomeRouteContainer() (+27 more)

### Community 17 - "StudentTodaySection.tsx"
Cohesion: 0.10
Nodes (45): ChatWindow(), ChatWindowProps, ChatUnreadIndicator(), ChatUnreadIndicatorProps, formatCourseCardDate(), GroupCourseCard(), ClientBookingsList(), LIST_SCOPE_FILTERS (+37 more)

### Community 18 - "notificationService.ts"
Cohesion: 0.22
Nodes (10): clearNotificationsService(), deleteNotificationService(), markNotificationsAsReadService(), useDbNotifications(), useUnreadNotificationCount(), useNotificationsStore, NotificationsState, useNotificationActions() (+2 more)

### Community 19 - "CoursesManager.tsx"
Cohesion: 0.09
Nodes (29): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+21 more)

### Community 20 - "useBookingModal.ts"
Cohesion: 0.15
Nodes (24): AuthBookingForm(), AuthBookingFormProps, BookingAuthShell(), BookingAuthShellProps, BookingModalHeader(), BookingOverlapWarnings(), BookingSelectors(), GuestBookingForm() (+16 more)

### Community 21 - "StudentCabinetPanels.tsx"
Cohesion: 0.19
Nodes (17): sortVisibleCourses(), GroupCoursesSection(), BookInstructorPickerModal(), StudentCalendarPanel(), StudentCoursesPanel(), StudentInstructorsPanel(), TRAINING_HUB_ITEMS, getAvailableCourses() (+9 more)

### Community 22 - "walletStore.ts"
Cohesion: 0.22
Nodes (10): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState, WalletState (+2 more)

### Community 23 - "useLanguage"
Cohesion: 0.07
Nodes (54): InstructorReviewsModal(), PersonalCabinetModals(), StudentBookNextFab(), StudentBookNextFabProps, StudentTrainingPanel(), getSwipeNeighborSequence(), SC_TINT_CARD, SC_TINT_VALUE (+46 more)

### Community 24 - "skillData.ts"
Cohesion: 0.05
Nodes (77): ClientSkillProgressView(), APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChart(), getLevelLabel() (+69 more)

### Community 25 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 26 - "firebase.ts"
Cohesion: 0.11
Nodes (27): useAvailabilityMigrationSync(), signOutService(), AuthState, useAuthStore, useSessionSync(), useAchievementsSync(), useCurrentUserProfileSync(), useProfileActivitySync() (+19 more)

### Community 27 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 28 - "settingsStore.ts"
Cohesion: 0.16
Nodes (20): AppBootstrap(), AppBootstrapProps, saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled(), saveSkillConfig() (+12 more)

### Community 29 - "courseLevelStyles.ts"
Cohesion: 0.16
Nodes (15): CourseHeader(), CourseHeaderProps, adminBadgeClass, cardTextClass, CourseLevel, courseLevelBadgeLabel, courseLevelColors, getCourseLevelCardBadgeClass() (+7 more)

### Community 31 - "courseService.ts"
Cohesion: 0.18
Nodes (13): addCourseService(), enrollInCourseService(), notifyCourseModifiedService(), buildClonedCourse(), stripUndefinedFields(), enrollInCourse, EnrollInCourseResult, enrollInCourseViaCallable() (+5 more)

### Community 32 - "useProfileStore"
Cohesion: 0.18
Nodes (22): addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService(), updateUserRoleService(), useProfileStore, buildAddCustomTodayTaskUpdate() (+14 more)

### Community 33 - "isCourseBooking"
Cohesion: 0.24
Nodes (12): isCourseBooking(), clearCancelledBookings(), clearStudentBookings(), commitBatchDeletes(), deleteBookingMessages(), isStudentBooking(), resetCourseSeats(), finalizeBookingCompletion() (+4 more)

### Community 34 - "bookingTransactions.test.ts"
Cohesion: 0.06
Nodes (69): AVAILABILITY_SLOTS_COLLECTION, cancelBookingWithRefund(), CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore() (+61 more)

### Community 35 - "CourseEnrollmentModal.tsx"
Cohesion: 0.20
Nodes (11): AuthModeSliderSwitch(), AuthModeSliderSwitchProps, CourseEnrollAction(), CourseEnrollmentModal(), InstructorCard, CourseEnrollmentModal, createGuestCourseEnrollment, createGuestCourseEnrollmentViaCallable() (+3 more)

### Community 36 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "SystemSettings.tsx"
Cohesion: 0.10
Nodes (28): ResortDataSection(), ResortSliderSection(), FALLBACK_SLIDES, SystemSettings(), SystemSettings, buildBackgroundImage(), HERO_SCRIM, HeroCarousel() (+20 more)

### Community 38 - "bookingTransactions.ts"
Cohesion: 0.20
Nodes (25): blocksInstructorAvailability(), addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, createBookingWithPayment(), createGuestBooking(), loadInstructorSlotRefs(), rescheduleBooking() (+17 more)

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

### Community 43 - "useInstructorWorkspace.ts"
Cohesion: 0.12
Nodes (25): InstructorWorkspace, InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorNotLinked(), InstructorNotLinkedProps, InstructorReviews() (+17 more)

### Community 44 - "ErrorBoundary.tsx"
Cohesion: 0.18
Nodes (9): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, logErrorBoundaryFailure(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk() (+1 more)

### Community 45 - "courseTransactions.ts"
Cohesion: 0.23
Nodes (17): CourseEnrollmentError, enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), STATUS_LABELS, translateCourse(), getGroupScheduleLabel(), MONTHS_EN (+9 more)

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
Cohesion: 0.15
Nodes (17): BookingsLog(), shortenBookingId(), LinkGuestBookingModal(), BadgeVariant, StatusBadge(), StatusBadgeProps, StyleConfig, VARIANT_MAP (+9 more)

### Community 50 - "coachPhone.test.ts"
Cohesion: 0.38
Nodes (5): BookingCallCoachButton(), normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 51 - "bookingEndsAt.ts"
Cohesion: 0.42
Nodes (7): BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), parseCourseEndDateTime(), baseLesson

### Community 52 - "ScheduleCalendar.tsx"
Cohesion: 0.13
Nodes (25): ActiveSlotDetails(), ActiveSlotMoveForm(), ScheduleCalendar(), getAvailableMoveTimeSlots(), getAvailableScheduleDurations(), hasScheduleOverlap(), SCHEDULE_CLOSING_TIME_MINUTES, SCHEDULE_DURATIONS (+17 more)

### Community 53 - "StudentHistoryList.tsx"
Cohesion: 0.17
Nodes (13): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+5 more)

### Community 54 - "src/types.ts"
Cohesion: 0.11
Nodes (20): AdminPanel, AdminCollapsibleSection(), AdminCollapsibleSectionProps, CoachesManager(), CourseInstructorSelection(), CourseInstructorSelectionProps, CourseTableRow(), ScheduleInstructorCell() (+12 more)

### Community 55 - "useNotifications"
Cohesion: 0.17
Nodes (16): AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), AdminRoleManager, ClientsManager, PersonalCabinet(), Notification, NotificationContext (+8 more)

### Community 56 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 57 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 58 - "RouteGate.tsx"
Cohesion: 0.33
Nodes (6): AdminRoute(), AuthRoute(), InstructorRoute(), RouteGate(), RouteGateProps, RouteGateRole

### Community 59 - "createBookingCallable.ts"
Cohesion: 0.29
Nodes (9): createBookingForUser(), BookingPaymentResult, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable(), isCreateBookingCallableInfrastructureError(), mapCallableError() (+1 more)

### Community 60 - "functions/package.json"
Cohesion: 0.12
Nodes (16): firebase-admin, firebase-functions, dependencies, firebase-admin, firebase-functions, devDependencies, typescript, engines (+8 more)

### Community 61 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, universal-analytics, private, type, version

### Community 62 - "ResortConditionsSidebar.tsx"
Cohesion: 0.33
Nodes (6): AnimatedNumber(), AnimatedNumberProps, ResortConditionsSidebar(), ResortConditionsSidebarProps, getWeatherConditionKey(), ResortConfig

### Community 63 - "bookingService.ts"
Cohesion: 0.21
Nodes (23): useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), confirmBookingService(), deleteBookingService(), deleteInstructorService() (+15 more)

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
Cohesion: 0.39
Nodes (7): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), ProfileState, TodayTaskRef

### Community 70 - "Language"
Cohesion: 0.16
Nodes (18): ActiveSlotCreateForm(), ActiveSlotCreateFormProps, BookingOverlapWarningsProps, BookingSelectorsProps, EnrichedCourseBooking, NextStepAction, StudentNextStepCard(), StudentNextStepCardProps (+10 more)

### Community 71 - "slotOverlap.ts"
Cohesion: 0.31
Nodes (7): addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), buildHourLockIds(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap()

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

### Community 82 - "InstructorRecommendationsEditor.tsx"
Cohesion: 0.43
Nodes (6): InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, CourseClient, createRecommendationId(), sanitizeRecommendations(), LessonRecommendation

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

### Community 94 - "OnboardingModal.tsx"
Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 97 - "StudentProfilePreferencesSection.tsx"
Cohesion: 0.40
Nodes (3): StudentProfilePreferencesSection(), StudentProfilePreferencesSectionProps, StudentSettingsCompactProps

### Community 118 - "BodyScrollLock.tsx"
Cohesion: 0.15
Nodes (12): AuthModal(), AuthModalProps, ConfirmActionModal(), ConfirmActionModalProps, LevelUpModal(), LevelUpModalProps, RescheduleModal(), RescheduleModalProps (+4 more)

### Community 119 - "ErrorLogsPanel.tsx"
Cohesion: 0.23
Nodes (12): ErrorLogsPanel(), ErrorLogsPanelProps, FinancialOverview(), FinancialOverviewProps, ErrorLogsPanel, FinancialOverview, TableSkeleton(), deleteErrorLog() (+4 more)

### Community 120 - "bodyScrollLock.ts"
Cohesion: 0.53
Nodes (4): applyBodyScrollLock(), BODY_SCROLL_LOCK_CLASS, lockBodyScroll(), releaseBodyScrollLock()

## Knowledge Gaps
- **410 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+405 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `TranslationKey`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `Auth.tsx`, `LanguageContext.tsx`, `booking.ts`, `lib/walletLedger.ts`, `Booking`, `StudentCoachPanel.tsx`, `StudentProfilePersonalSection.tsx`, `chatSenderRole.ts`, `ui/ModalHost.tsx`, `StudentTodaySection.tsx`, `CoursesManager.tsx`, `useBookingModal.ts`, `StudentCabinetPanels.tsx`, `skillData.ts`, `settingsStore.ts`, `courseLevelStyles.ts`, `CourseEnrollmentModal.tsx`, `SystemSettings.tsx`, `CourseDetailsModal.tsx`, `useInstructorWorkspace.ts`, `Navbar.tsx`, `BookingsLog.tsx`, `coachPhone.test.ts`, `ScheduleCalendar.tsx`, `StudentHistoryList.tsx`, `src/types.ts`, `useNotifications`, `ResortConditionsSidebar.tsx`, `TodayChecklist.tsx`, `Language`, `OnboardingModal.tsx`, `StudentProfilePreferencesSection.tsx`, `BodyScrollLock.tsx`, `ErrorLogsPanel.tsx`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `firestoreMappers.ts`, `TranslationKey`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `booking.ts`, `lib/walletLedger.ts`, `useBookingChatUnread.ts`, `StudentCoachPanel.tsx`, `chatSenderRole.ts`, `ui/ModalHost.tsx`, `StudentTodaySection.tsx`, `CoursesManager.tsx`, `useBookingModal.ts`, `StudentCabinetPanels.tsx`, `useLanguage`, `firebase.ts`, `courseService.ts`, `useProfileStore`, `isCourseBooking`, `bookingTransactions.test.ts`, `SystemSettings.tsx`, `bookingTransactions.ts`, `useInstructorWorkspace.ts`, `courseTransactions.ts`, `BookingsLog.tsx`, `coachPhone.test.ts`, `bookingEndsAt.ts`, `ScheduleCalendar.tsx`, `StudentHistoryList.tsx`, `src/types.ts`, `useNotifications`, `createBookingCallable.ts`, `bookingService.ts`, `TodayChecklist.tsx`, `slotOverlap.ts`, `BodyScrollLock.tsx`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `Booking` to `firestoreMappers.ts`, `TranslationKey`, `studentCabinetUtils.ts`, `BookingChatModal.tsx`, `achievementConfig.ts`, `Auth.tsx`, `lib/walletLedger.ts`, `useCourseActions.ts`, `StudentCoachPanel.tsx`, `StudentProfilePersonalSection.tsx`, `chatSenderRole.ts`, `ui/ModalHost.tsx`, `StudentTodaySection.tsx`, `CoursesManager.tsx`, `useBookingModal.ts`, `StudentCabinetPanels.tsx`, `useLanguage`, `skillData.ts`, `useProfileStore`, `CourseEnrollmentModal.tsx`, `bookingTransactions.ts`, `CourseDetailsModal.tsx`, `useInstructorWorkspace.ts`, `courseTransactions.ts`, `Navbar.tsx`, `BookingsLog.tsx`, `coachPhone.test.ts`, `ScheduleCalendar.tsx`, `StudentHistoryList.tsx`, `src/types.ts`, `useNotifications`, `RouteGate.tsx`, `bookingService.ts`, `TodayChecklist.tsx`, `Language`, `profileSelectors.ts`, `StudentProfilePreferencesSection.tsx`, `BodyScrollLock.tsx`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _410 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `studentCabinetUtils.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05955734406438632 - nodes in this community are weakly interconnected._
- **Should `achievementConfig.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07704918032786885 - nodes in this community are weakly interconnected._
- **Should `booking.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._