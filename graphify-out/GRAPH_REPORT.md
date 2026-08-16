# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 405 files · ~201,495 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2052 nodes · 7017 edges · 120 communities (98 shown, 22 thin omitted)
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
- walletCredit.ts
- Review
- Booking
- YourJourneySection.tsx
- skillData.ts
- achievementConfig.ts
- InstructorBookingCard.tsx
- ResortSliderSection.tsx
- LanguageContext.tsx
- firebase.ts
- StudentCoachPanel.tsx
- useInstructorWorkspace.ts
- useNotifications
- instructor.ts
- studentCabinetUtils.ts
- scripts
- StudentCabinetShell.tsx
- Navbar.tsx
- ErrorLogsPanel.tsx
- StudentTodaySection.tsx
- useProfileStore
- chatService.ts
- courseTransactions.ts
- ModalHost.tsx
- src/types.ts
- GroupCourseCard.tsx
- CourseDetailsModal.tsx
- compilerOptions
- authService.ts
- useLanguage
- InstructorRecommendationsEditor.tsx
- lib/walletLedger.ts
- AppShell.tsx
- extract-coaches-manager.mjs
- useBookings.cancel.test.tsx
- global-setup.ts
- bookingLogic.ts
- TranslationKey
- ResortConditionsSidebar.tsx
- BookingChatModal.tsx
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
- ScheduleCalendar.tsx
- bookingCreatedAt.ts
- PushNotificationHub.tsx
- chatSenderRole.ts
- extract-courses-manager.mjs
- SystemSettings.tsx
- src/index.ts
- createBookingWithPayment
- extract-admin-sections.mjs
- bookingTransactions.ts
- README.md
- adminSelectors.ts
- functions/package.json
- autoComplete.ts
- package.json
- courseEnrichedData.ts
- translations.ts
- createGuestCourseEnrollment.ts
- bodyScrollLock.ts
- patch-admin-return.mjs
- courses/index.ts
- StudentHistoryList.tsx
- adminFirestore.test.ts
- balanceOptimisticMiddleware.ts
- declarations.d.ts
- bookingSelectors.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- LessonDifficulty
- createBookingCallable.ts
- @firebase/rules-unit-testing
- BookingCallCoachButton.tsx
- jsdom
- @playwright/test
- prettier
- @testing-library/jest-dom
- @testing-library/react
- StudentActivityRings.tsx
- typescript-eslint
- @vitejs/plugin-react
- vitest
- vitest.config.ts
- eslint-plugin-react-refresh
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
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetHome.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetPanels.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCoachPanel.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`

## Communities (120 total, 22 thin omitted)

### Community 0 - "bookingService.ts"
Cohesion: 0.23
Nodes (23): useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService(), createBookingForUser() (+15 more)

### Community 1 - "bookingTransactions.test.ts"
Cohesion: 0.05
Nodes (74): AVAILABILITY_SLOTS_COLLECTION, addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap(), CALLABLE_INSTRUCTOR_ID (+66 more)

### Community 2 - "useBookingChatUnread.ts"
Cohesion: 0.27
Nodes (14): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan() (+6 more)

### Community 3 - "walletCredit.ts"
Cohesion: 0.30
Nodes (13): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_KZT (+5 more)

### Community 4 - "Review"
Cohesion: 0.18
Nodes (20): AchievementsManagerProps, InstructorReviewsModalProps, StudentCabinetContext, StudentCabinetShellProps, NextSessionItem, StudentHistoryPanelProps, StudentCabinetResortSnapshot, StudentNeedsAttentionProps (+12 more)

### Community 5 - "Booking"
Cohesion: 0.10
Nodes (50): BookingsLogProps, ClientsManagerProps, CoachesManagerProps, CoursesTableProps, CourseTableRowProps, CoursesManagerProps, LinkGuestBookingModalProps, ActiveSlotCreateFormProps (+42 more)

### Community 6 - "YourJourneySection.tsx"
Cohesion: 0.07
Nodes (55): PersonalCabinet, InstructorReviewsModal(), BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG (+47 more)

### Community 7 - "skillData.ts"
Cohesion: 0.08
Nodes (43): AdminPanel, AdminPanel(), SkillConfigManager(), SkillConfigManagerProps, ClientSkillProgressView(), ClientSkillProgressViewProps, APPLE, DIMENSION_CONFIGS (+35 more)

### Community 8 - "achievementConfig.ts"
Cohesion: 0.10
Nodes (41): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, AchievementDefinition, AchievementRule, AchievementRuleType, applySkillDeltas(), bookingTimestamp() (+33 more)

### Community 9 - "InstructorBookingCard.tsx"
Cohesion: 0.15
Nodes (13): ChatUnreadIndicator(), ChatUnreadIndicatorProps, InstructorBookingCard(), InstructorBookingCardProps, InstructorBookingList(), InstructorBookingListProps, StudentAssessButton(), StudentAssessButtonProps (+5 more)

### Community 10 - "ResortSliderSection.tsx"
Cohesion: 0.12
Nodes (23): buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps, resolveSlideBackground(), shuffleSlides(), ToggleSwitch(), ToggleSwitchProps (+15 more)

### Community 11 - "LanguageContext.tsx"
Cohesion: 0.09
Nodes (24): BodyScrollLock(), AuthModalProps, ChatWindowProps, BookingModalHeader(), BookingModalHeaderProps, BookingModal(), PaymentGateway(), ConfirmActionModal() (+16 more)

### Community 12 - "firebase.ts"
Cohesion: 0.10
Nodes (30): AppBootstrap(), AppBootstrapProps, useAvailabilityMigrationSync(), signOutService(), AuthState, useAuthStore, useSessionSync(), useAchievementsSync() (+22 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.17
Nodes (26): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+18 more)

### Community 14 - "useInstructorWorkspace.ts"
Cohesion: 0.15
Nodes (17): saveBookingRecommendationsService(), updateBookingStatusService(), InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews(), InstructorReviewsProps, InstructorStudents(), InstructorStudentsProps (+9 more)

### Community 15 - "useNotifications"
Cohesion: 0.14
Nodes (25): useNotifications(), createGuestBookingService(), getInstructorAvailabilitySlots(), AuthBookingFormProps, AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps (+17 more)

### Community 16 - "instructor.ts"
Cohesion: 0.09
Nodes (25): BadgeVariant, StatusBadge(), StatusBadgeProps, StyleConfig, VARIANT_MAP, BookingsLog(), shortenBookingId(), LinkGuestBookingModal() (+17 more)

### Community 17 - "studentCabinetUtils.ts"
Cohesion: 0.06
Nodes (58): StudentCabinetHome(), StudentCabinetHomeProps, Achievement, addMinutesToTime(), BookingListScope, buildLocalDateTime(), filterBookingsByScope(), getActiveCourseEnrollment() (+50 more)

### Community 18 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 19 - "StudentCabinetShell.tsx"
Cohesion: 0.08
Nodes (43): getSwipeNeighborSequence(), StudentCabinetShell(), SC_TINT_CARD, SC_TINT_VALUE, ScProgressBar(), ScStatGrid(), ScTint, STUDENT_BOTTOM_LEFT_TABS (+35 more)

### Community 20 - "Navbar.tsx"
Cohesion: 0.09
Nodes (21): Logo(), LogoProps, Navbar(), NavbarProps, CoachesManager(), CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage() (+13 more)

### Community 21 - "ErrorLogsPanel.tsx"
Cohesion: 0.22
Nodes (12): deleteErrorLog(), deleteErrorLogs(), saveUsdToKztRate(), subscribeErrorLogs(), ErrorLogsPanel(), ErrorLogsPanelProps, FinancialOverview(), FinancialOverviewProps (+4 more)

### Community 22 - "StudentTodaySection.tsx"
Cohesion: 0.12
Nodes (42): LessonDetailsModal(), RecommendationIndicator(), RecommendationIndicatorProps, HistoryLessonCard(), ScDivider(), ScSectionTitle(), ScTextButton(), ScTintCard() (+34 more)

### Community 23 - "useProfileStore"
Cohesion: 0.15
Nodes (20): addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService(), updateUserRoleService(), ProfileState, useProfileStore (+12 more)

### Community 24 - "chatService.ts"
Cohesion: 0.22
Nodes (10): createChatMessage(), messagesPath(), setChatMessageHomework(), subscribeToChatMessages(), InstructorMessage, useInstructorBookingMessages(), buildHomeworkForUserIds(), isHomeworkVisibleToStudent() (+2 more)

### Community 25 - "courseTransactions.ts"
Cohesion: 0.19
Nodes (19): ClientBookingsList(), CourseEnrollmentError, enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), STATUS_LABELS, getGroupScheduleLabel(), MONTHS_EN (+11 more)

### Community 26 - "ModalHost.tsx"
Cohesion: 0.10
Nodes (37): AdminRouteContainer(), CabinetRouteContainer(), HomeRouteContainer(), InstructorRouteContainer(), InstructorWorkspace, AppRoutesProps, ResortData, LazyLoad() (+29 more)

### Community 28 - "src/types.ts"
Cohesion: 0.10
Nodes (15): CoursesTable(), CourseTableRow(), CoursesManager(), CoursesState, buildClonedCourse(), getCourseLevelBadgeClass(), instructor, mockAddNotification (+7 more)

### Community 29 - "GroupCourseCard.tsx"
Cohesion: 0.16
Nodes (17): formatCourseCardDate(), GroupCourseCard(), adminBadgeClass, cardTextClass, CourseLevel, courseLevelBadgeLabel, courseLevelColors, getCourseLevelCardBadgeClass() (+9 more)

### Community 30 - "CourseDetailsModal.tsx"
Cohesion: 0.19
Nodes (10): AuthBookingForm(), CourseProgramStep, CourseEnrollAction(), CourseHeader(), CourseHeaderProps, CourseProgram(), CourseProgramProps, InstructorCardProps (+2 more)

### Community 31 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 32 - "authService.ts"
Cohesion: 0.14
Nodes (21): getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService(), saveUserProfileService(), signInWithEmailService(), signInWithGoogleService(), signUpWithEmailService(), Auth() (+13 more)

### Community 33 - "useLanguage"
Cohesion: 0.09
Nodes (30): AdminCollapsibleSection(), AdminCollapsibleSectionProps, CourseGallery(), CourseGalleryProps, BookingsPanel(), InstructorCard, BookInstructorPickerModal(), StudentBookNextFab() (+22 more)

### Community 34 - "InstructorRecommendationsEditor.tsx"
Cohesion: 0.36
Nodes (7): InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, CourseClient, createRecommendationId(), LatestCoachRecommendation, sanitizeRecommendations(), LessonRecommendation

### Community 35 - "lib/walletLedger.ts"
Cohesion: 0.15
Nodes (19): PaymentGatewayProps, StudentWalletHistoryList(), buildSyntheticWalletOperations(), buildWalletOperationHistory(), enrichWalletOperationWithBooking(), formatWalletOperationLabel(), formatWalletSessionDate(), formatWalletSessionDuration() (+11 more)

### Community 37 - "AppShell.tsx"
Cohesion: 0.11
Nodes (22): AppShell(), FeaturePageShell(), FeaturePageShellProps, AppRoutes(), NotificationHubModal(), NotificationProvider(), clearNotificationsService(), deleteNotificationService() (+14 more)

### Community 38 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 39 - "useBookings.cancel.test.tsx"
Cohesion: 0.15
Nodes (15): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState, useWalletStore (+7 more)

### Community 40 - "global-setup.ts"
Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 41 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 42 - "TranslationKey"
Cohesion: 0.19
Nodes (13): CoursesManagerToolbar(), CoursesManagerToolbarProps, ScheduleInstructorCellProps, ScheduleToolbarProps, LocalizedCompressionError, BookingOverlapWarningsProps, BookingSelectorsProps, InstructorNotLinked() (+5 more)

### Community 43 - "ResortConditionsSidebar.tsx"
Cohesion: 0.33
Nodes (6): AnimatedNumber(), AnimatedNumberProps, ResortConditionsSidebar(), ResortConditionsSidebarProps, getWeatherConditionKey(), ResortConfig

### Community 44 - "BookingChatModal.tsx"
Cohesion: 0.15
Nodes (17): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+9 more)

### Community 45 - "TodayChecklist.tsx"
Cohesion: 0.53
Nodes (5): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef()

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
Cohesion: 0.13
Nodes (29): useNotificationsSync(), saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled(), saveSkillConfig(), SettingsState (+21 more)

### Community 51 - "courseService.ts"
Cohesion: 0.23
Nodes (12): addCourseService(), enrollInCourseService(), notifyCourseModifiedService(), stripUndefinedFields(), enrollInCourse, EnrollInCourseResult, enrollInCourseViaCallable(), createNotificationForUser() (+4 more)

### Community 52 - "ErrorBoundary.tsx"
Cohesion: 0.18
Nodes (9): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, logErrorBoundaryFailure(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk() (+1 more)

### Community 53 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 54 - "formatDurationLabel"
Cohesion: 0.30
Nodes (9): NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain(), pointsWord() (+1 more)

### Community 55 - "firestoreMappers.ts"
Cohesion: 0.21
Nodes (14): useBookingsSync(), useCoursesSync(), DomainModel, FirestoreModel, toActivityLog(), toBooking(), toCourse(), toDocumentModel() (+6 more)

### Community 56 - "ScheduleCalendar.tsx"
Cohesion: 0.07
Nodes (43): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+35 more)

### Community 57 - "bookingCreatedAt.ts"
Cohesion: 0.80
Nodes (4): formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt()

### Community 58 - "PushNotificationHub.tsx"
Cohesion: 0.10
Nodes (20): Notification, NotificationContext, NotificationContextType, NotificationHubModalProps, ActionButton(), ActionButtonProps, ApplePagination(), ApplePaginationProps (+12 more)

### Community 60 - "chatSenderRole.ts"
Cohesion: 0.18
Nodes (14): ChatMessageList(), ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole() (+6 more)

### Community 61 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 62 - "SystemSettings.tsx"
Cohesion: 0.18
Nodes (16): SystemSettings(), SystemSettingsProps, SystemSettings, ACTIVITY_LOGS_COLLECTION, activityLogId, buildBookingCompletedMetadata(), logActivityForUser(), backfillCompletedBookingActivityLogs() (+8 more)

### Community 63 - "src/index.ts"
Cohesion: 0.35
Nodes (8): getAdminFirestore(), getOrInitApp(), createBooking, createGuestCourseEnrollment, enrollInCourse, scheduledAutoCompleteBookings, scheduledPurgeExpiredNotifications, purgeExpiredNotifications()

### Community 64 - "createBookingWithPayment"
Cohesion: 0.31
Nodes (9): createBookingWithPayment(), EnrollCourseInput, enrollInCourseHandler(), parseInput(), recordWalletLedgerEntryInTransaction(), WALLET_LEDGER_COLLECTION, WalletLedgerEntry, walletLedgerEntryId() (+1 more)

### Community 65 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 67 - "bookingTransactions.ts"
Cohesion: 0.26
Nodes (19): blocksInstructorAvailability(), isCourseBooking(), addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, cancelBookingWithRefund(), createBookingWithPayment(), createGuestBooking() (+11 more)

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

### Community 73 - "courseEnrichedData.ts"
Cohesion: 0.28
Nodes (7): CourseEnrichedData, CourseFaqItem, CourseReview, getCourseEnrichedData(), CourseFAQ(), CourseFAQProps, CourseDetailsModal()

### Community 75 - "translations.ts"
Cohesion: 0.44
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

### Community 80 - "courses/index.ts"
Cohesion: 0.18
Nodes (11): CourseEnrollmentModal(), sortVisibleCourses(), GroupCoursesSection(), LessonFilters(), LessonFiltersProps, CourseDetailsModal, CourseEnrollmentModal, createGuestCourseEnrollment (+3 more)

### Community 82 - "StudentHistoryList.tsx"
Cohesion: 0.17
Nodes (13): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+5 more)

### Community 83 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 86 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 88 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 93 - "LessonDifficulty"
Cohesion: 0.40
Nodes (5): EnrichedCourseBooking, ActivityLogMetadata, ActivityLogType, SkillDeltaMeta, LessonDifficulty

### Community 95 - "createBookingCallable.ts"
Cohesion: 0.27
Nodes (8): BookingPaymentResult, BookingSlotOverlapError, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable(), mapCallableError(), toCallableInput()

### Community 99 - "BookingCallCoachButton.tsx"
Cohesion: 0.39
Nodes (5): BookingCallCoachButton(), normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 107 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

## Knowledge Gaps
- **412 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+407 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `Review`, `Booking`, `YourJourneySection.tsx`, `skillData.ts`, `achievementConfig.ts`, `InstructorBookingCard.tsx`, `ResortSliderSection.tsx`, `LanguageContext.tsx`, `firebase.ts`, `StudentCoachPanel.tsx`, `useInstructorWorkspace.ts`, `useNotifications`, `instructor.ts`, `studentCabinetUtils.ts`, `StudentCabinetShell.tsx`, `Navbar.tsx`, `ErrorLogsPanel.tsx`, `StudentTodaySection.tsx`, `courseTransactions.ts`, `ModalHost.tsx`, `src/types.ts`, `GroupCourseCard.tsx`, `CourseDetailsModal.tsx`, `authService.ts`, `lib/walletLedger.ts`, `AppShell.tsx`, `ResortConditionsSidebar.tsx`, `BookingChatModal.tsx`, `TodayChecklist.tsx`, `formatDurationLabel`, `ScheduleCalendar.tsx`, `PushNotificationHub.tsx`, `chatSenderRole.ts`, `SystemSettings.tsx`, `courseEnrichedData.ts`, `courses/index.ts`, `StudentHistoryList.tsx`, `BookingCallCoachButton.tsx`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `bookingService.ts`, `bookingTransactions.test.ts`, `useBookingChatUnread.ts`, `Review`, `achievementConfig.ts`, `InstructorBookingCard.tsx`, `LanguageContext.tsx`, `firebase.ts`, `StudentCoachPanel.tsx`, `useInstructorWorkspace.ts`, `useNotifications`, `instructor.ts`, `studentCabinetUtils.ts`, `StudentCabinetShell.tsx`, `StudentTodaySection.tsx`, `courseTransactions.ts`, `ModalHost.tsx`, `src/types.ts`, `GroupCourseCard.tsx`, `useLanguage`, `InstructorRecommendationsEditor.tsx`, `lib/walletLedger.ts`, `useBookings.cancel.test.tsx`, `BookingChatModal.tsx`, `TodayChecklist.tsx`, `bookingEndsAt.ts`, `courseService.ts`, `firestoreMappers.ts`, `ScheduleCalendar.tsx`, `bookingCreatedAt.ts`, `PushNotificationHub.tsx`, `chatSenderRole.ts`, `SystemSettings.tsx`, `bookingTransactions.ts`, `adminSelectors.ts`, `StudentHistoryList.tsx`, `bookingSelectors.ts`, `createBookingCallable.ts`, `BookingCallCoachButton.tsx`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `Booking` to `bookingService.ts`, `walletCredit.ts`, `Review`, `YourJourneySection.tsx`, `skillData.ts`, `achievementConfig.ts`, `InstructorBookingCard.tsx`, `LanguageContext.tsx`, `StudentCoachPanel.tsx`, `useInstructorWorkspace.ts`, `useNotifications`, `instructor.ts`, `studentCabinetUtils.ts`, `StudentCabinetShell.tsx`, `Navbar.tsx`, `StudentTodaySection.tsx`, `useProfileStore`, `courseTransactions.ts`, `ModalHost.tsx`, `src/types.ts`, `GroupCourseCard.tsx`, `CourseDetailsModal.tsx`, `authService.ts`, `useLanguage`, `lib/walletLedger.ts`, `useBookings.cancel.test.tsx`, `BookingChatModal.tsx`, `firestoreMappers.ts`, `ScheduleCalendar.tsx`, `PushNotificationHub.tsx`, `chatSenderRole.ts`, `adminSelectors.ts`, `StudentHistoryList.tsx`, `BookingCallCoachButton.tsx`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _412 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bookingTransactions.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.053650326109825376 - nodes in this community are weakly interconnected._
- **Should `Booking` be split into smaller, more focused modules?**
  _Cohesion score 0.1012987012987013 - nodes in this community are weakly interconnected._
- **Should `YourJourneySection.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06862745098039216 - nodes in this community are weakly interconnected._