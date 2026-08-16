# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 424 files · ~201,589 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2072 nodes · 7042 edges · 136 communities (115 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eaa4448d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- bookingService.ts
- bookingTransactions.test.ts
- useBookingChatUnread.ts
- StudentCabinetPanels.tsx
- StudentCabinetHome.tsx
- Booking
- your_journey/YourJourneySection.tsx
- skillData.ts
- achievementConfig.ts
- TranslationKey
- SystemSettings.tsx
- PushNotificationHub.tsx
- useProfileStore
- StudentCoachPanel.tsx
- useInstructorWorkspace.ts
- useNotifications
- ClientBookingsList.tsx
- studentCabinetUtils.ts
- scripts
- StudentCabinetShell.tsx
- StudentProfilePersonalSection.tsx
- ErrorLogsPanel.tsx
- StudentTodaySection.tsx
- todayChecklist.ts
- chatService.ts
- courseTransactions.ts
- ui/ModalHost.tsx
- courses/components/GroupCourseCard.tsx
- course.ts
- courseLevelStyles.ts
- CurrencyContext.tsx
- compilerOptions
- firebase.ts
- useLanguage
- RouteGate.tsx
- lib/walletLedger.ts
- StudentDevelopmentPanel.tsx
- NotificationsPanel.tsx
- extract-coaches-manager.mjs
- walletStore.ts
- global-setup.ts
- bookingLogic.ts
- src/types.ts
- StudentHomeBottomSections.tsx
- bookings/components/BookingChatModal.tsx
- TodayChecklist.tsx
- bookingEndsAt.ts
- dependencies
- createBooking.ts
- compilerOptions
- settingsStore.ts
- courseService.ts
- ErrorBoundary.tsx
- devDependencies
- formatDurationLabel
- firestoreMappers.ts
- scheduleOverlap.ts
- bookingCreatedAt.ts
- admin/components/AdminPanel.tsx
- profile/components/OnboardingModal.tsx
- chatSenderRole.ts
- extract-courses-manager.mjs
- isCourseBooking
- src/index.ts
- createBookingWithPayment
- extract-admin-sections.mjs
- StudentCabinetUI.tsx
- bookingTransactions.ts
- README.md
- functions/package.json
- autoComplete.ts
- package.json
- CourseProgram.tsx
- useNotificationsSync.ts
- translations.ts
- createGuestCourseEnrollment.ts
- bodyScrollLock.ts
- patch-admin-return.mjs
- CourseEnrollmentModal
- your_journey/types.ts
- StudentHistoryList.tsx
- adminFirestore.test.ts
- balanceOptimisticMiddleware.ts
- Navbar.tsx
- declarations.d.ts
- booking.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- courseDates.ts
- SkillRadarChart.tsx
- createBookingCallable.ts
- Auth.test.tsx
- @firebase/rules-unit-testing
- activityLog.ts
- BookingCallCoachButton.tsx
- jsdom
- @playwright/test
- prettier
- translateInstructor
- @testing-library/jest-dom
- @testing-library/react
- ChatMessage
- StudentActivityRings.tsx
- typescript-eslint
- StudentProfilePreferencesSection.tsx
- @vitejs/plugin-react
- vitest
- FinancialOverview.tsx
- vitest.config.ts
- eslint-plugin-react-refresh
- CourseBackgroundImageField.tsx
- PaymentGateway
- AGENTS.md
- eslint
- eslint-plugin-react-hooks
- tailwindcss

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
- `overlapCheck()` --calls--> `hasScheduleOverlap()`  [EXTRACTED]
  tests/unit/scheduleOverlap.test.ts → src/features/admin/components/admin/scheduleOverlap.ts
- `NavbarProps` --references--> `UserProfile`  [EXTRACTED]
  src/components/Navbar.tsx → src/types/user.ts
- `SkillConfigManagerProps` --references--> `SkillConfig`  [EXTRACTED]
  src/features/admin/components/SkillConfigManager.tsx → src/lib/skillData.ts
- `AdminRoleManagerProps` --references--> `UserProfile`  [EXTRACTED]
  src/features/admin/components/admin/AdminRoleManager.tsx → src/types/user.ts
- `UseCourseFormInput` --references--> `Course`  [EXTRACTED]
  src/features/admin/components/admin/courses_manager/useCourseForm.ts → src/types/course.ts

## Import Cycles
- None detected.

## Communities (136 total, 21 thin omitted)

### Community 0 - "bookingService.ts"
Cohesion: 0.17
Nodes (31): useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService(), createBookingForUser() (+23 more)

### Community 1 - "bookingTransactions.test.ts"
Cohesion: 0.05
Nodes (82): AVAILABILITY_SLOTS_COLLECTION, cancelBookingWithRefund(), adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit() (+74 more)

### Community 2 - "useBookingChatUnread.ts"
Cohesion: 0.22
Nodes (15): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), CourseChatBooking, getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey() (+7 more)

### Community 3 - "StudentCabinetPanels.tsx"
Cohesion: 0.19
Nodes (9): ActionButton(), ActionButtonProps, StateCard(), StateCardProps, BookingsPanel(), TRAINING_HUB_ITEMS, StudentPanelBackLink(), StudentWalletHistoryList() (+1 more)

### Community 4 - "StudentCabinetHome.tsx"
Cohesion: 0.16
Nodes (24): AchievementsManagerProps, SystemSettingsProps, SkillRadarChartProps, StudentCabinetContext, StudentCabinetHomeProps, StudentCabinetShellProps, NextSessionItem, StudentCabinetTab (+16 more)

### Community 5 - "Booking"
Cohesion: 0.09
Nodes (55): NotificationHubModalProps, BookingsLogProps, ClientsManagerProps, CoachesManagerProps, CoursesTableProps, CourseTableRowProps, CoursesManagerProps, LinkGuestBookingModalProps (+47 more)

### Community 6 - "your_journey/YourJourneySection.tsx"
Cohesion: 0.15
Nodes (30): AchievementGrid(), CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, EQUAL_MARKER_STOPS, JOURNEY_BG, JOURNEY_LEVELS, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND (+22 more)

### Community 7 - "skillData.ts"
Cohesion: 0.16
Nodes (19): SkillConfigManager(), SkillConfigManagerProps, getSectionProgress(), StudentSkillEvaluationModal(), StudentSkillEvaluationModalProps, calculateStudentLevel(), classifySkillItemToRadarDimension(), DEFAULT_RADAR_DIMENSION_BY_ITEM_ID (+11 more)

### Community 8 - "achievementConfig.ts"
Cohesion: 0.09
Nodes (49): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, formatActivityTimestamp(), getAchievements(), UpcomingSessionsStrip(), AchievementDefinition, AchievementRule (+41 more)

### Community 9 - "TranslationKey"
Cohesion: 0.09
Nodes (28): CoursesManagerToolbar(), CoursesManagerToolbarProps, ActiveSlotDetails(), saveBookingRecommendationsService(), LocalizedCompressionError, ChatUnreadIndicator(), ChatUnreadIndicatorProps, InstructorBookingCard() (+20 more)

### Community 10 - "SystemSettings.tsx"
Cohesion: 0.09
Nodes (31): buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps, resolveSlideBackground(), shuffleSlides(), ResortConditionsSidebarProps, ToggleSwitch() (+23 more)

### Community 11 - "PushNotificationHub.tsx"
Cohesion: 0.10
Nodes (19): Notification, NotificationContext, NotificationContextType, BodyScrollLock(), AuthModal(), AuthModalProps, InstructorReviewsModalProps, ConfirmActionModal() (+11 more)

### Community 12 - "useProfileStore"
Cohesion: 0.12
Nodes (29): useAvailabilityMigrationSync(), signOutService(), AuthState, useAuthStore, useSessionSync(), addUserService(), deleteUserService(), dismissReviewService() (+21 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.17
Nodes (26): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+18 more)

### Community 14 - "useInstructorWorkspace.ts"
Cohesion: 0.17
Nodes (16): InstructorWorkspace, updateBookingStatusService(), InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorNotLinked(), InstructorReviews() (+8 more)

### Community 15 - "useNotifications"
Cohesion: 0.17
Nodes (22): useNotifications(), createGuestBookingService(), getInstructorAvailabilitySlots(), AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, BookingSelectors() (+14 more)

### Community 16 - "ClientBookingsList.tsx"
Cohesion: 0.13
Nodes (16): ApplePagination(), ApplePaginationProps, BadgeVariant, StatusBadge(), StatusBadgeProps, StyleConfig, VARIANT_MAP, LinkGuestBookingModal() (+8 more)

### Community 17 - "studentCabinetUtils.ts"
Cohesion: 0.07
Nodes (51): StudentCabinetHome(), StudentCoursesPanel(), Achievement, addMinutesToTime(), BookingListScope, buildLocalDateTime(), filterBookingsByScope(), getActiveCourseEnrollment() (+43 more)

### Community 18 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 19 - "StudentCabinetShell.tsx"
Cohesion: 0.12
Nodes (27): StudentCalendarPanel(), StudentTrainingPanel(), getSwipeNeighborSequence(), StudentCabinetShell(), StudentCabinetTabBar(), buildStudentHistory(), getSeasonBookings(), getStudentStats() (+19 more)

### Community 20 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.23
Nodes (8): optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary, StudentProfilePersonalSection(), StudentProfilePersonalSectionProps, useEffectiveBalance(), uploadImage()

### Community 21 - "ErrorLogsPanel.tsx"
Cohesion: 0.38
Nodes (8): TableSkeleton(), deleteErrorLog(), deleteErrorLogs(), subscribeErrorLogs(), ErrorLogsPanel(), ErrorLogsPanelProps, ErrorLogsPanel, ErrorLog

### Community 22 - "StudentTodaySection.tsx"
Cohesion: 0.17
Nodes (29): LessonDetailsModal(), HistoryLessonCard(), formatBookingDayMonth(), formatCountdownRemaining(), formatCourseDateRangeLabel(), formatRecentLessonDateLabel(), formatSessionDayLabel(), formatSessionTimeRange() (+21 more)

### Community 23 - "todayChecklist.ts"
Cohesion: 0.21
Nodes (15): getTodayTasks(), buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate(), buildRemoveTodayTaskUpdate(), buildToggleSkillTodayUpdate(), buildToggleTodayCompleteUpdate(), createCustomTodayTaskId(), customTodayTaskId() (+7 more)

### Community 24 - "chatService.ts"
Cohesion: 0.43
Nodes (6): createChatMessage(), messagesPath(), setChatMessageHomework(), subscribeToChatMessages(), InstructorMessage, useInstructorBookingMessages()

### Community 25 - "courseTransactions.ts"
Cohesion: 0.16
Nodes (20): AdminPanel, CourseTableRow(), AdminPanel(), getCourseEnrichedData(), CourseDetailsModal(), ClientBookingsList(), CourseDetailsModal, CourseEnrollmentError (+12 more)

### Community 26 - "ui/ModalHost.tsx"
Cohesion: 0.08
Nodes (42): AppShell(), FeaturePageShell(), FeaturePageShellProps, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), PersonalCabinet, HomeRouteContainer() (+34 more)

### Community 27 - "courses/components/GroupCourseCard.tsx"
Cohesion: 0.17
Nodes (17): formatCourseCardDate(), GroupCourseCard(), sortVisibleCourses(), RecommendationIndicator(), RecommendationIndicatorProps, ScDivider(), countPendingRecommendations(), enrichHistoryEventsWithActions() (+9 more)

### Community 28 - "course.ts"
Cohesion: 0.07
Nodes (14): CoursesTable(), CoursesManager(), CourseEnrollAction(), CourseHeader(), CourseHeaderProps, CoursesState, buildClonedCourse(), getCourseLevelModalClass() (+6 more)

### Community 29 - "courseLevelStyles.ts"
Cohesion: 0.18
Nodes (13): adminBadgeClass, cardTextClass, CourseLevel, courseLevelBadgeLabel, courseLevelColors, getCourseLevelBadgeClass(), getCourseLevelCardBadgeClass(), getCourseTrackLabel() (+5 more)

### Community 30 - "CurrencyContext.tsx"
Cohesion: 0.16
Nodes (13): BookingsLog(), shortenBookingId(), AuthBookingForm(), AuthBookingFormProps, BookingOverlapWarnings(), InstructorCard, InstructorCardProps, Currency (+5 more)

### Community 31 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 32 - "firebase.ts"
Cohesion: 0.13
Nodes (20): getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService(), saveUserProfileService(), signInWithEmailService(), signInWithGoogleService(), signUpWithEmailService(), Auth() (+12 more)

### Community 33 - "useLanguage"
Cohesion: 0.19
Nodes (9): CoachesManager(), CourseGallery(), CourseGalleryProps, LessonFilters(), LessonFiltersProps, CurrentSessionsBlock, TodayTasksBlock, UnreviewedCompletedBookingsNotice() (+1 more)

### Community 34 - "RouteGate.tsx"
Cohesion: 0.33
Nodes (6): AdminRoute(), AuthRoute(), InstructorRoute(), RouteGate(), RouteGateProps, RouteGateRole

### Community 35 - "lib/walletLedger.ts"
Cohesion: 0.18
Nodes (16): PaymentGatewayProps, buildSyntheticWalletOperations(), buildWalletOperationHistory(), enrichWalletOperationWithBooking(), formatWalletSessionDate(), formatWalletSessionDuration(), ledgerBookingIds(), ledgerEntryToView() (+8 more)

### Community 36 - "StudentDevelopmentPanel.tsx"
Cohesion: 0.22
Nodes (15): ClientSkillProgressView(), ClientSkillProgressViewProps, SkillRadarChart(), getLevelLabel(), getLevelProgressPercent(), getNextStepAction(), getPrioritySkillItems(), getSkillItemRingCategory() (+7 more)

### Community 37 - "NotificationsPanel.tsx"
Cohesion: 0.20
Nodes (12): NotificationHubModal(), clearNotificationsService(), deleteNotificationService(), markNotificationsAsReadService(), NotificationsPanel(), useDbNotifications(), useUnreadNotificationCount(), useNotificationsStore (+4 more)

### Community 38 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 39 - "walletStore.ts"
Cohesion: 0.22
Nodes (10): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState, WalletState (+2 more)

### Community 40 - "global-setup.ts"
Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 41 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 42 - "src/types.ts"
Cohesion: 0.14
Nodes (17): ActiveSlotCreateForm(), ActiveSlotMoveForm(), ScheduleInstructorCell(), ScheduleInstructorCellProps, ActiveScheduleSlot, ScheduleSlotActionModal, ScheduleSlotActionModalHandle, ScheduleToolbar() (+9 more)

### Community 43 - "StudentHomeBottomSections.tsx"
Cohesion: 0.23
Nodes (10): AnimatedNumber(), AnimatedNumberProps, ResortConditionsSidebar(), ScSectionTitle(), ScTintCard(), StudentCabinetWeatherSection(), StudentCabinetWeatherSectionProps, StudentLatestRecommendationSection() (+2 more)

### Community 44 - "bookings/components/BookingChatModal.tsx"
Cohesion: 0.15
Nodes (17): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+9 more)

### Community 45 - "TodayChecklist.tsx"
Cohesion: 0.39
Nodes (7): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), ProfileState, TodayTaskRef

### Community 46 - "bookingEndsAt.ts"
Cohesion: 0.42
Nodes (7): BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), parseCourseEndDateTime(), baseLesson

### Community 47 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 48 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 49 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 50 - "settingsStore.ts"
Cohesion: 0.16
Nodes (20): App(), AppBootstrap(), AppBootstrapProps, NotificationProvider(), AppInitSkeleton(), saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled() (+12 more)

### Community 51 - "courseService.ts"
Cohesion: 0.22
Nodes (12): addCourseService(), enrollInCourseService(), notifyCourseModifiedService(), stripUndefinedFields(), enrollInCourse, EnrollInCourseResult, enrollInCourseViaCallable(), NotificationType (+4 more)

### Community 52 - "ErrorBoundary.tsx"
Cohesion: 0.21
Nodes (8): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, logErrorBoundaryFailure(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 53 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 54 - "formatDurationLabel"
Cohesion: 0.30
Nodes (9): NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain(), pointsWord() (+1 more)

### Community 55 - "firestoreMappers.ts"
Cohesion: 0.17
Nodes (16): DeletedCompletedStats, useBookingStore, useBookingsSync(), useCoursesSync(), DomainModel, FirestoreModel, toActivityLog(), toBooking() (+8 more)

### Community 56 - "scheduleOverlap.ts"
Cohesion: 0.08
Nodes (36): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+28 more)

### Community 57 - "bookingCreatedAt.ts"
Cohesion: 0.80
Nodes (4): formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt()

### Community 58 - "admin/components/AdminPanel.tsx"
Cohesion: 0.20
Nodes (10): AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), AdminRoleManager, ClientsManager, CoachesManager, CoursesManager, ScheduleCalendar (+2 more)

### Community 59 - "profile/components/OnboardingModal.tsx"
Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 60 - "chatSenderRole.ts"
Cohesion: 0.20
Nodes (12): ChatMessageList(), ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole() (+4 more)

### Community 61 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 62 - "isCourseBooking"
Cohesion: 0.25
Nodes (11): isCourseBooking(), clearCancelledBookings(), clearStudentBookings(), commitBatchDeletes(), deleteBookingMessages(), isStudentBooking(), resetCourseSeats(), finalizeBookingCompletion() (+3 more)

### Community 63 - "src/index.ts"
Cohesion: 0.35
Nodes (8): getAdminFirestore(), getOrInitApp(), createBooking, createGuestCourseEnrollment, enrollInCourse, scheduledAutoCompleteBookings, scheduledPurgeExpiredNotifications, purgeExpiredNotifications()

### Community 64 - "createBookingWithPayment"
Cohesion: 0.31
Nodes (9): createBookingWithPayment(), EnrollCourseInput, enrollInCourseHandler(), parseInput(), recordWalletLedgerEntryInTransaction(), WALLET_LEDGER_COLLECTION, WalletLedgerEntry, walletLedgerEntryId() (+1 more)

### Community 65 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 66 - "StudentCabinetUI.tsx"
Cohesion: 0.13
Nodes (14): StudentBookNextFab(), StudentBookNextFabProps, SC_TINT_CARD, SC_TINT_VALUE, ScProgressBar(), ScStatGrid(), ScTint, STUDENT_BOTTOM_LEFT_TABS (+6 more)

### Community 67 - "bookingTransactions.ts"
Cohesion: 0.19
Nodes (21): migrateAvailabilitySlots(), AVAILABILITY_MIGRATION_SETTING, blocksInstructorAvailability(), addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, createBookingWithPayment(), createGuestBooking() (+13 more)

### Community 68 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 70 - "functions/package.json"
Cohesion: 0.12
Nodes (16): firebase-admin, firebase-functions, dependencies, firebase-admin, firebase-functions, devDependencies, typescript, engines (+8 more)

### Community 71 - "autoComplete.ts"
Cohesion: 0.36
Nodes (8): autoCompletePastBookings(), BookingRecord, completeBooking(), isActiveCourseEnrollment(), isCourseBooking(), isEligibleForAutoComplete(), resolveCourseId(), SYSTEM_AUTO_COMPLETE_ACTOR_ID

### Community 72 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, universal-analytics, private, type, version

### Community 73 - "CourseProgram.tsx"
Cohesion: 0.25
Nodes (8): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, CourseFAQ(), CourseFAQProps, CourseProgram(), CourseProgramProps

### Community 74 - "useNotificationsSync.ts"
Cohesion: 0.50
Nodes (6): useNotificationsSync(), getNotificationTimestampMs(), isNotificationExpired(), purgeExpiredNotificationsForUser(), getNotificationRetentionMs(), getLanguage()

### Community 75 - "translations.ts"
Cohesion: 0.50
Nodes (5): isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageProvider()

### Community 76 - "createGuestCourseEnrollment.ts"
Cohesion: 0.43
Nodes (6): CourseRecord, createGuestCourseEnrollmentHandler(), GuestCourseEnrollmentInput, optionalText(), parseInput(), requireText()

### Community 78 - "bodyScrollLock.ts"
Cohesion: 0.48
Nodes (5): applyBodyScrollLock(), BODY_SCROLL_LOCK_CLASS, lockBodyScroll(), releaseBodyScrollLock(), useBodyScrollLock()

### Community 79 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 80 - "CourseEnrollmentModal"
Cohesion: 0.29
Nodes (6): CourseEnrollmentModal(), CourseEnrollmentModal, createGuestCourseEnrollment, createGuestCourseEnrollmentViaCallable(), GuestCourseEnrollmentInput, GuestCourseEnrollmentResult

### Community 81 - "your_journey/types.ts"
Cohesion: 0.19
Nodes (10): DesktopSkillCards(), LevelCardBody(), MobileSkillCards(), Breakpoint, JourneyEarnedSkill, JourneyLevel, LevelShape, YourJourneySectionProps (+2 more)

### Community 82 - "StudentHistoryList.tsx"
Cohesion: 0.24
Nodes (11): ScTextButton(), filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS (+3 more)

### Community 83 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 85 - "Navbar.tsx"
Cohesion: 0.33
Nodes (7): Logo(), LogoProps, Navbar(), NavbarProps, CABINET_TABS, getDefaultWorkspacePath(), isInstructorWorkspaceUser()

### Community 86 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 87 - "booking.ts"
Cohesion: 0.09
Nodes (10): ChatWindow(), ChatWindowProps, LessonRecommendationsList(), LessonRecommendationsListProps, instructors, userProfile, bookings, courses (+2 more)

### Community 88 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 93 - "courseDates.ts"
Cohesion: 0.18
Nodes (14): BookingSelectorsProps, EnrichedCourseBooking, DifficultyLabelVariant, STATUS_LABELS, MONTHS_EN, MONTHS_RU, MONTHS_SHORT_EN, MONTHS_SHORT_RU (+6 more)

### Community 94 - "SkillRadarChart.tsx"
Cohesion: 0.24
Nodes (7): APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, RadarDimensionKey, SkillItem

### Community 95 - "createBookingCallable.ts"
Cohesion: 0.27
Nodes (8): BookingPaymentResult, BookingSlotOverlapError, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable(), mapCallableError(), toCallableInput()

### Community 96 - "Auth.test.tsx"
Cohesion: 0.22
Nodes (8): mockAddNotification, mockCreateUserWithEmailAndPassword, mockGetDoc, mockMigratePreExistingProfile, mockSendPasswordResetEmail, mockSetDoc, mockSignInWithEmailAndPassword, mockSignInWithPopup

### Community 98 - "activityLog.ts"
Cohesion: 0.43
Nodes (6): SystemSettings(), ACTIVITY_LOGS_COLLECTION, activityLogId, buildBookingCompletedMetadata(), logActivityForUser(), backfillCompletedBookingActivityLogs()

### Community 99 - "BookingCallCoachButton.tsx"
Cohesion: 0.39
Nodes (5): BookingCallCoachButton(), normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 103 - "translateInstructor"
Cohesion: 0.39
Nodes (8): BookInstructorPickerModal(), StudentInstructorsPanel(), getInstructorPickerGroups(), getInstructorsForStudent(), getMyInstructors(), getRecommendedInstructors(), resolveNextLessonBookingTarget(), translateInstructor()

### Community 106 - "ChatMessage"
Cohesion: 0.43
Nodes (4): buildHomeworkForUserIds(), isHomeworkVisibleToStudent(), ChatMessage, GROUP_UIDS

### Community 107 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 109 - "StudentProfilePreferencesSection.tsx"
Cohesion: 0.40
Nodes (3): StudentProfilePreferencesSection(), StudentProfilePreferencesSectionProps, StudentSettingsCompactProps

### Community 112 - "FinancialOverview.tsx"
Cohesion: 0.50
Nodes (4): saveUsdToKztRate(), FinancialOverview(), FinancialOverviewProps, FinancialOverview

### Community 130 - "CourseBackgroundImageField.tsx"
Cohesion: 0.60
Nodes (3): CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage()

## Knowledge Gaps
- **413 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+408 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `CourseBackgroundImageField.tsx`, `PaymentGateway`, `StudentCabinetPanels.tsx`, `Booking`, `StudentCabinetHome.tsx`, `skillData.ts`, `achievementConfig.ts`, `TranslationKey`, `SystemSettings.tsx`, `PushNotificationHub.tsx`, `your_journey/YourJourneySection.tsx`, `StudentCoachPanel.tsx`, `useInstructorWorkspace.ts`, `useNotifications`, `ClientBookingsList.tsx`, `studentCabinetUtils.ts`, `StudentCabinetShell.tsx`, `StudentProfilePersonalSection.tsx`, `ErrorLogsPanel.tsx`, `StudentTodaySection.tsx`, `courseTransactions.ts`, `ui/ModalHost.tsx`, `courses/components/GroupCourseCard.tsx`, `course.ts`, `CurrencyContext.tsx`, `firebase.ts`, `StudentDevelopmentPanel.tsx`, `NotificationsPanel.tsx`, `src/types.ts`, `StudentHomeBottomSections.tsx`, `bookings/components/BookingChatModal.tsx`, `TodayChecklist.tsx`, `settingsStore.ts`, `formatDurationLabel`, `scheduleOverlap.ts`, `admin/components/AdminPanel.tsx`, `profile/components/OnboardingModal.tsx`, `chatSenderRole.ts`, `StudentCabinetUI.tsx`, `CourseProgram.tsx`, `CourseEnrollmentModal`, `your_journey/types.ts`, `StudentHistoryList.tsx`, `Navbar.tsx`, `booking.ts`, `SkillRadarChart.tsx`, `activityLog.ts`, `BookingCallCoachButton.tsx`, `translateInstructor`, `StudentProfilePreferencesSection.tsx`, `FinancialOverview.tsx`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `bookingService.ts`, `bookingTransactions.test.ts`, `useBookingChatUnread.ts`, `StudentCabinetPanels.tsx`, `StudentCabinetHome.tsx`, `achievementConfig.ts`, `TranslationKey`, `SystemSettings.tsx`, `PushNotificationHub.tsx`, `useProfileStore`, `StudentCoachPanel.tsx`, `useInstructorWorkspace.ts`, `useNotifications`, `ClientBookingsList.tsx`, `studentCabinetUtils.ts`, `StudentCabinetShell.tsx`, `StudentTodaySection.tsx`, `courseTransactions.ts`, `courses/components/GroupCourseCard.tsx`, `course.ts`, `lib/walletLedger.ts`, `src/types.ts`, `StudentHomeBottomSections.tsx`, `bookings/components/BookingChatModal.tsx`, `TodayChecklist.tsx`, `bookingEndsAt.ts`, `courseService.ts`, `firestoreMappers.ts`, `scheduleOverlap.ts`, `bookingCreatedAt.ts`, `admin/components/AdminPanel.tsx`, `chatSenderRole.ts`, `isCourseBooking`, `bookingTransactions.ts`, `adminSelectors.ts`, `StudentHistoryList.tsx`, `booking.ts`, `createBookingCallable.ts`, `activityLog.ts`, `BookingCallCoachButton.tsx`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `Course` connect `Booking` to `StudentCabinetPanels.tsx`, `StudentCabinetHome.tsx`, `achievementConfig.ts`, `SystemSettings.tsx`, `PushNotificationHub.tsx`, `StudentCoachPanel.tsx`, `useInstructorWorkspace.ts`, `useNotifications`, `ClientBookingsList.tsx`, `studentCabinetUtils.ts`, `StudentCabinetShell.tsx`, `StudentTodaySection.tsx`, `courseTransactions.ts`, `ui/ModalHost.tsx`, `courses/components/GroupCourseCard.tsx`, `course.ts`, `courseLevelStyles.ts`, `lib/walletLedger.ts`, `src/types.ts`, `StudentHomeBottomSections.tsx`, `bookings/components/BookingChatModal.tsx`, `courseService.ts`, `firestoreMappers.ts`, `scheduleOverlap.ts`, `admin/components/AdminPanel.tsx`, `chatSenderRole.ts`, `isCourseBooking`, `bookingTransactions.ts`, `adminSelectors.ts`, `CourseProgram.tsx`, `StudentHistoryList.tsx`, `booking.ts`, `activityLog.ts`, `BookingCallCoachButton.tsx`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _413 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bookingTransactions.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05153099327856609 - nodes in this community are weakly interconnected._
- **Should `Booking` be split into smaller, more focused modules?**
  _Cohesion score 0.08633879781420765 - nodes in this community are weakly interconnected._
- **Should `your_journey/YourJourneySection.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1465149359886202 - nodes in this community are weakly interconnected._