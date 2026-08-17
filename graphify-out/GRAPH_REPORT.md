# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 413 files · ~201,910 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2060 nodes · 7088 edges · 122 communities (101 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5e419c81`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useBookingActions.ts
- bookingTransactions.test.ts
- useBookingsStore
- bookingTransactions.ts
- Booking
- CoursesManager.tsx
- YourJourneySection.tsx
- useBookingModal.ts
- achievementConfig.ts
- ScheduleCalendar.tsx
- ResortSliderSection.tsx
- profile/index.ts
- CourseDetailsModal.tsx
- StudentCoachPanel.tsx
- handleFirestoreError
- useBookingChatUnread.ts
- firebase.ts
- StudentHistoryList.tsx
- scripts
- useLanguage
- studentCabinetUtils.ts
- useNotifications
- achievements.test.ts
- firestoreMappers.ts
- useProfileStore
- StudentCabinetHome.tsx
- ResortConditionsSidebar.tsx
- ChatMessage
- shell/index.ts
- courseLevelStyles.ts
- parseCourseDates
- compilerOptions
- authService.ts
- notificationService.ts
- useInstructorWorkspace.ts
- slotOverlap.ts
- trainingStreak.ts
- PushNotificationHub.tsx
- extract-coaches-manager.mjs
- Auth.test.tsx
- global-setup.ts
- bookingLogic.ts
- Instructor
- coachPhone.test.ts
- dependencies
- createBooking.ts
- compilerOptions
- StudentProfilePersonalSection.tsx
- ErrorBoundary.tsx
- devDependencies
- eslint
- useAuthStore
- courseTransactions.ts
- LanguageContext.tsx
- BookingChatModal.tsx
- extract-courses-manager.mjs
- UserProfile
- src/index.ts
- createBookingWithPayment
- extract-admin-sections.mjs
- AppBootstrap.tsx
- README.md
- chatSenderRole.ts
- functions/package.json
- autoComplete.ts
- package.json
- useCourseActions.ts
- skillData.ts
- lib/walletLedger.ts
- createGuestCourseEnrollment.ts
- walletCredit.ts
- patch-admin-return.mjs
- StudentTodaySection.tsx
- bookingsStore.ts
- HeroCarousel.tsx
- adminFirestore.test.ts
- balanceOptimisticMiddleware.ts
- eslint-plugin-react-hooks
- declarations.d.ts
- OnboardingModal.tsx
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- bookingService.ts
- @firebase/rules-unit-testing
- jsdom
- @playwright/test
- prettier
- SystemSettings.tsx
- @testing-library/jest-dom
- @testing-library/react
- StudentActivityRings.tsx
- typescript-eslint
- AdminPanel.tsx
- @vitejs/plugin-react
- vitest
- src/types.ts
- vitest.config.ts
- useCurrency
- eslint-plugin-react-refresh
- AGENTS.md
- tailwindcss
- logger.ts

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 236 edges
2. `Booking` - 166 edges
3. `UserProfile` - 135 edges
4. `Course` - 129 edges
5. `Instructor` - 101 edges
6. `useProfileStore` - 57 edges
7. `TranslationKey` - 49 edges
8. `useNotifications()` - 46 edges
9. `logger` - 42 edges
10. `Review` - 42 edges

## Surprising Connections (you probably didn't know these)
- `overlapCheck()` --calls--> `hasScheduleOverlap()`  [EXTRACTED]
  tests/unit/scheduleOverlap.test.ts → src/features/admin/components/admin/scheduleOverlap.ts
- `NavbarProps` --references--> `UserProfile`  [EXTRACTED]
  src/app/components/Navbar.tsx → src/types/user.ts
- `SkillConfigManagerProps` --references--> `SkillConfig`  [EXTRACTED]
  src/features/admin/components/SkillConfigManager.tsx → src/lib/skillData.ts
- `AdminRoleManagerProps` --references--> `UserProfile`  [EXTRACTED]
  src/features/admin/components/admin/AdminRoleManager.tsx → src/types/user.ts
- `CoursesManagerToolbarProps` --references--> `TranslationKey`  [EXTRACTED]
  src/features/admin/components/admin/courses_manager/CoursesManagerToolbar.tsx → src/lib/i18n/translations.ts

## Import Cycles
- 3-file cycle: `src/features/shell/index.ts -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts`
- 4-file cycle: `src/features/shell/ModalHost.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx`
- 5-file cycle: `src/features/bookings/components/BookingChatModal.tsx -> src/features/bookings/components/booking_chat/ChatWindow.tsx -> src/features/profile/index.ts -> src/features/profile/components/InstructorWorkspace.tsx -> src/features/bookings/index.ts -> src/features/bookings/components/BookingChatModal.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetHome.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetPanels.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCoachPanel.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentHistoryPanel.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/notifications/NotificationsPanel.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx -> src/features/notifications/NotificationsPanel.tsx`
- 5-file cycle: `src/features/profile/OnboardingFlow.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx -> src/features/profile/OnboardingFlow.tsx`

## Communities (122 total, 21 thin omitted)

### Community 0 - "useBookingActions.ts"
Cohesion: 0.16
Nodes (32): useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService(), deleteBookingService() (+24 more)

### Community 1 - "bookingTransactions.test.ts"
Cohesion: 0.06
Nodes (69): AVAILABILITY_MIGRATION_SETTING, addHourLocksToBatch(), CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore() (+61 more)

### Community 2 - "useBookingsStore"
Cohesion: 0.22
Nodes (19): AppShell(), FeaturePageShell(), FeaturePageShellProps, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), HomeRouteContainer(), InstructorRouteContainer() (+11 more)

### Community 3 - "bookingTransactions.ts"
Cohesion: 0.19
Nodes (27): AVAILABILITY_SLOTS_COLLECTION, blocksInstructorAvailability(), isCourseBooking(), BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt() (+19 more)

### Community 4 - "Booking"
Cohesion: 0.12
Nodes (44): AchievementsManagerProps, SystemSettingsProps, AdminPanelProps, BookingsState, ChatMessageListProps, BookingModalInput, BookingChatModalProps, NotificationHubModalProps (+36 more)

### Community 5 - "CoursesManager.tsx"
Cohesion: 0.17
Nodes (10): CoursesManagerToolbar(), CoursesManagerToolbarProps, CoursesTable(), CoursesManager(), CoursesManagerProps, CoursesManager, buildClonedCourse(), mockAddNotification (+2 more)

### Community 6 - "YourJourneySection.tsx"
Cohesion: 0.07
Nodes (50): AchievementGrid(), CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, EQUAL_MARKER_STOPS, JOURNEY_BG, JOURNEY_LEVELS, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND (+42 more)

### Community 7 - "useBookingModal.ts"
Cohesion: 0.18
Nodes (20): createGuestBookingService(), getInstructorAvailabilitySlots(), AuthBookingFormProps, AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, GuestBookingForm() (+12 more)

### Community 8 - "achievementConfig.ts"
Cohesion: 0.20
Nodes (23): applySkillDeltas(), bookingTimestamp(), countExercisesMastered(), evaluateEarnedAchievements(), findCourseGraduateTimestamp(), findExercisesMasteredTimestamp(), findFeedbackTimestamp(), findHomeworkDoneTimestamp() (+15 more)

### Community 9 - "ScheduleCalendar.tsx"
Cohesion: 0.11
Nodes (25): CoachesManager(), CoachesManagerProps, ScheduleCalendarProps, ScheduleInstructorCell(), AvailableDurationsOptions, AvailableMoveTimesOptions, getAvailableMoveTimeSlots(), getAvailableScheduleDurations() (+17 more)

### Community 10 - "ResortSliderSection.tsx"
Cohesion: 0.20
Nodes (14): ResortDataSection(), ResortSliderSection(), getResortWeatherCache(), resortCacheRef, resortConfigRef, ResortWeatherCache, saveResortConfig(), saveResortWeatherCache() (+6 more)

### Community 11 - "profile/index.ts"
Cohesion: 0.08
Nodes (25): AdminPanel, PersonalCabinet, InstructorWorkspace, AdminPanel(), AuthModal(), PaymentGateway(), GroupCoursesSection(), LessonFilters() (+17 more)

### Community 12 - "CourseDetailsModal.tsx"
Cohesion: 0.22
Nodes (9): CourseProgramStep, CourseEnrollAction(), CourseEnrollActionProps, CourseHeader(), CourseHeaderProps, CourseProgram(), CourseProgramProps, CourseDetailsModalProps (+1 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.11
Nodes (36): BookInstructorPickerModal(), findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds() (+28 more)

### Community 14 - "handleFirestoreError"
Cohesion: 0.18
Nodes (14): deleteErrorLog(), deleteErrorLogs(), subscribeErrorLogs(), ErrorLogsPanel(), ErrorLogsPanelProps, useCoursesSync(), handleFirestoreError(), QUERY_LIMITS (+6 more)

### Community 15 - "useBookingChatUnread.ts"
Cohesion: 0.24
Nodes (14): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), CourseChatBooking, getCourseChatThreadIds(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan() (+6 more)

### Community 16 - "firebase.ts"
Cohesion: 0.15
Nodes (14): CourseEnrollmentModal(), createGuestCourseEnrollment, createGuestCourseEnrollmentViaCallable(), GuestCourseEnrollmentInput, GuestCourseEnrollmentResult, app, auth, ErrorListener (+6 more)

### Community 17 - "StudentHistoryList.tsx"
Cohesion: 0.27
Nodes (10): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+2 more)

### Community 18 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 19 - "useLanguage"
Cohesion: 0.09
Nodes (37): ChatUnreadIndicator(), ChatUnreadIndicatorProps, StudentBookNextFab(), StudentBookNextFabProps, isProfileTab(), PROFILE_TABS, resolveStudentBottomNavTab(), StudentCalendarPanel() (+29 more)

### Community 20 - "studentCabinetUtils.ts"
Cohesion: 0.07
Nodes (56): StudentCabinetHome(), StudentCoursesPanel(), getFirstName(), getGreeting(), getLevelName(), LEVEL_LABEL_EN, LEVEL_LABEL_RU, LEVEL_NAMES_EN (+48 more)

### Community 21 - "useNotifications"
Cohesion: 0.23
Nodes (10): App(), AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), NotificationProvider(), useNotifications(), PersonalCabinet(), useReviewFlow() (+2 more)

### Community 22 - "achievements.test.ts"
Cohesion: 0.13
Nodes (17): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, AchievementDefinition, AchievementRule, AchievementRuleType, DEFAULT_ACHIEVEMENTS_CONFIG, describeAchievementRule() (+9 more)

### Community 23 - "firestoreMappers.ts"
Cohesion: 0.27
Nodes (12): useBookingsSync(), DomainModel, FirestoreModel, toActivityLog(), toBooking(), toCourse(), toDocumentModel(), toInstructor() (+4 more)

### Community 24 - "useProfileStore"
Cohesion: 0.20
Nodes (21): NotificationsPanel(), addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService(), updateUserRoleService(), ProfileState (+13 more)

### Community 25 - "StudentCabinetHome.tsx"
Cohesion: 0.10
Nodes (34): ChatWindow(), ChatWindowProps, ClientBookingsList(), LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, RecommendationIndicator(), RecommendationIndicatorProps, HistoryLessonCard() (+26 more)

### Community 26 - "ResortConditionsSidebar.tsx"
Cohesion: 0.29
Nodes (6): ResortConditionsSidebar(), ResortConditionsSidebarProps, getWeatherConditionKey(), ResortConfig, AnimatedNumber(), AnimatedNumberProps

### Community 27 - "ChatMessage"
Cohesion: 0.43
Nodes (4): buildHomeworkForUserIds(), isHomeworkVisibleToStudent(), ChatMessage, GROUP_UIDS

### Community 28 - "shell/index.ts"
Cohesion: 0.20
Nodes (13): Navbar(), StudentCabinetShell(), AdminRoute(), AuthRoute(), InstructorRoute(), RouteGate(), RouteGateProps, RouteGateRole (+5 more)

### Community 29 - "courseLevelStyles.ts"
Cohesion: 0.07
Nodes (38): Logo(), LogoProps, NavbarProps, CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection() (+30 more)

### Community 30 - "parseCourseDates"
Cohesion: 0.13
Nodes (28): ActiveSlotDetails(), ScheduleCalendar(), LessonDetailsModal(), LessonRecommendationsList(), LessonRecommendationsListProps, countPendingRecommendations(), formatActivityTimestamp(), formatBookingDayMonth() (+20 more)

### Community 31 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 32 - "authService.ts"
Cohesion: 0.35
Nodes (11): getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService(), saveUserProfileService(), signInWithEmailService(), signInWithGoogleService(), signUpWithEmailService(), Auth() (+3 more)

### Community 33 - "notificationService.ts"
Cohesion: 0.80
Nodes (4): clearNotificationsService(), deleteNotificationService(), markNotificationsAsReadService(), useNotificationActions()

### Community 34 - "useInstructorWorkspace.ts"
Cohesion: 0.06
Nodes (46): saveBookingRecommendationsService(), CourseEnrichedData, CourseFaqItem, CourseReview, getCourseEnrichedData(), CourseFAQ(), CourseFAQProps, CourseDetailsModal() (+38 more)

### Community 35 - "slotOverlap.ts"
Cohesion: 0.36
Nodes (5): AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap()

### Community 36 - "trainingStreak.ts"
Cohesion: 0.80
Nodes (4): collectTrainingWeekTimestamps(), findStreakWeeksTimestamp(), getTrainingStreakWeeks(), toIsoWeekKey()

### Community 37 - "PushNotificationHub.tsx"
Cohesion: 0.15
Nodes (17): useDbNotifications(), useUnreadNotificationCount(), useNotificationsStore, Notification, NotificationContext, NotificationContextType, NotificationHubModal(), useNotificationsSync() (+9 more)

### Community 38 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 39 - "Auth.test.tsx"
Cohesion: 0.22
Nodes (8): mockAddNotification, mockCreateUserWithEmailAndPassword, mockGetDoc, mockMigratePreExistingProfile, mockSendPasswordResetEmail, mockSetDoc, mockSignInWithEmailAndPassword, mockSignInWithPopup

### Community 40 - "global-setup.ts"
Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 41 - "bookingLogic.ts"
Cohesion: 0.21
Nodes (17): assertNoSlotOverlap(), AvailabilitySlot, blocksInstructorAvailability(), BookingPaymentResult, BookingRecord, buildHourLockId(), buildHourLockIds(), computeBookingEndsAtIso() (+9 more)

### Community 42 - "Instructor"
Cohesion: 0.11
Nodes (13): ClientsManagerProps, ActiveSlotMoveForm(), ActiveSlotMoveFormProps, BookingModalHeader(), BookingModalHeaderProps, BookingModalProps, BookingCallCoachButtonProps, ModalState (+5 more)

### Community 43 - "coachPhone.test.ts"
Cohesion: 0.40
Nodes (4): normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 47 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 48 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 49 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 51 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.07
Nodes (28): CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), PersonalCabinetModals(), optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary (+20 more)

### Community 52 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (8): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, logErrorBoundaryFailure(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 53 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 55 - "useAuthStore"
Cohesion: 0.18
Nodes (15): signOutService(), AuthState, useAuthStore, useSessionSync(), useCurrentUserProfileSync(), useProfileActivitySync(), useUsersSync(), useSettingsSync() (+7 more)

### Community 56 - "courseTransactions.ts"
Cohesion: 0.15
Nodes (24): formatCourseCardDate(), GroupCourseCard(), CourseEnrollmentError, enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), getHourSuffix(), STATUS_LABELS (+16 more)

### Community 58 - "LanguageContext.tsx"
Cohesion: 0.10
Nodes (23): AuthModalProps, CourseEnrollmentModalProps, InstructorReviewsModal(), InstructorReviewsModalProps, ConfirmActionModal(), ConfirmActionModalProps, LevelUpModal(), LevelUpModalProps (+15 more)

### Community 60 - "BookingChatModal.tsx"
Cohesion: 0.14
Nodes (21): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+13 more)

### Community 61 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 62 - "UserProfile"
Cohesion: 0.14
Nodes (20): CoursesTableProps, CourseTableRow(), CourseTableRowProps, ActiveSlotDetailsProps, ScheduleInstructorCellProps, ScheduleToolbar(), ScheduleToolbarProps, ScheduleViewMode (+12 more)

### Community 63 - "src/index.ts"
Cohesion: 0.35
Nodes (8): getAdminFirestore(), getOrInitApp(), createBooking, createGuestCourseEnrollment, enrollInCourse, scheduledAutoCompleteBookings, scheduledPurgeExpiredNotifications, purgeExpiredNotifications()

### Community 64 - "createBookingWithPayment"
Cohesion: 0.31
Nodes (9): createBookingWithPayment(), EnrollCourseInput, enrollInCourseHandler(), parseInput(), recordWalletLedgerEntryInTransaction(), WALLET_LEDGER_COLLECTION, WalletLedgerEntry, walletLedgerEntryId() (+1 more)

### Community 65 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 66 - "AppBootstrap.tsx"
Cohesion: 0.11
Nodes (17): AppBootstrap(), AppBootstrapProps, useAchievementsSync(), TODO: реализовать применение кредита в Firestore, useWalletStore, syncAchievementActivityLogs(), applyDesignThemeToDOM(), registerFirestoreErrorListener() (+9 more)

### Community 68 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 69 - "chatSenderRole.ts"
Cohesion: 0.19
Nodes (13): ChatMessageList(), ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole() (+5 more)

### Community 70 - "functions/package.json"
Cohesion: 0.12
Nodes (16): firebase-admin, firebase-functions, dependencies, firebase-admin, firebase-functions, devDependencies, typescript, engines (+8 more)

### Community 71 - "autoComplete.ts"
Cohesion: 0.36
Nodes (8): autoCompletePastBookings(), BookingRecord, completeBooking(), isActiveCourseEnrollment(), isCourseBooking(), isEligibleForAutoComplete(), resolveCourseId(), SYSTEM_AUTO_COMPLETE_ACTOR_ID

### Community 72 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, universal-analytics, private, type, version

### Community 73 - "useCourseActions.ts"
Cohesion: 0.29
Nodes (12): getCurrentAuthenticatedUser(), addCourseService(), deleteCourseService(), enrollInCourseService(), notifyCourseModifiedService(), updateCourseService(), useCourseActions(), stripUndefinedFields() (+4 more)

### Community 74 - "skillData.ts"
Cohesion: 0.09
Nodes (43): SkillConfigManager(), SkillConfigManagerProps, ClientSkillProgressView(), ClientSkillProgressViewProps, APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension (+35 more)

### Community 75 - "lib/walletLedger.ts"
Cohesion: 0.14
Nodes (21): PaymentGatewayProps, formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt(), buildSyntheticWalletOperations(), buildWalletOperationHistory(), enrichWalletOperationWithBooking() (+13 more)

### Community 76 - "createGuestCourseEnrollment.ts"
Cohesion: 0.43
Nodes (6): CourseRecord, createGuestCourseEnrollmentHandler(), GuestCourseEnrollmentInput, optionalText(), parseInput(), requireText()

### Community 78 - "walletCredit.ts"
Cohesion: 0.30
Nodes (13): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_KZT (+5 more)

### Community 79 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 80 - "StudentTodaySection.tsx"
Cohesion: 0.13
Nodes (20): BookingCallCoachButton(), isTimestampOnLocalDate(), parseActivityTimestamp(), formatCountdownRemaining(), getTodayAchievements(), MiniCalendarDay, NextSessionItem, NextStepAction (+12 more)

### Community 82 - "HeroCarousel.tsx"
Cohesion: 0.29
Nodes (9): buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps, resolveSlideBackground(), shuffleSlides(), FALLBACK_SLIDES, Theme (+1 more)

### Community 83 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 86 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 87 - "OnboardingModal.tsx"
Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 88 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 96 - "bookingService.ts"
Cohesion: 0.22
Nodes (12): createBookingForUser(), updateBookingStatusService(), BookingPaymentResult, BookingSlotOverlapError, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable() (+4 more)

### Community 103 - "SystemSettings.tsx"
Cohesion: 0.17
Nodes (16): AdminCollapsibleSection(), AdminCollapsibleSectionProps, SystemSettings(), saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled() (+8 more)

### Community 107 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 109 - "AdminPanel.tsx"
Cohesion: 0.13
Nodes (14): BookingsLog(), BookingsLogProps, shortenBookingId(), LinkGuestBookingModal(), LinkGuestBookingModalProps, AdminRoleManager, BookingsLog, ClientsManager (+6 more)

### Community 112 - "src/types.ts"
Cohesion: 0.10
Nodes (16): CoursesState, BookingsPanel(), PanelProps, TRAINING_HUB_ITEMS, StudentPanelBackLink(), StudentWalletHistoryList(), formatWalletOperationLabel(), bookings (+8 more)

### Community 123 - "useCurrency"
Cohesion: 0.15
Nodes (16): ActiveSlotCreateForm(), ActiveSlotCreateFormProps, AuthBookingForm(), BookingOverlapWarnings(), BookingOverlapWarningsProps, BookingSelectors(), BookingSelectorsProps, InstructorCard (+8 more)

### Community 136 - "logger.ts"
Cohesion: 0.13
Nodes (16): saveUsdToKztRate(), FinancialOverview(), FinancialOverviewProps, FinancialOverview, useAvailabilityMigrationSync(), CourseGallery(), CourseGalleryProps, ACTIVITY_LOGS_COLLECTION (+8 more)

## Knowledge Gaps
- **408 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+403 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `useBookingsStore`, `Booking`, `CoursesManager.tsx`, `YourJourneySection.tsx`, `useBookingModal.ts`, `logger.ts`, `ScheduleCalendar.tsx`, `ResortSliderSection.tsx`, `profile/index.ts`, `CourseDetailsModal.tsx`, `StudentCoachPanel.tsx`, `handleFirestoreError`, `firebase.ts`, `StudentHistoryList.tsx`, `studentCabinetUtils.ts`, `useNotifications`, `achievements.test.ts`, `StudentCabinetHome.tsx`, `ResortConditionsSidebar.tsx`, `shell/index.ts`, `courseLevelStyles.ts`, `parseCourseDates`, `authService.ts`, `useInstructorWorkspace.ts`, `PushNotificationHub.tsx`, `Instructor`, `StudentProfilePersonalSection.tsx`, `courseTransactions.ts`, `LanguageContext.tsx`, `BookingChatModal.tsx`, `UserProfile`, `AppBootstrap.tsx`, `chatSenderRole.ts`, `skillData.ts`, `lib/walletLedger.ts`, `StudentTodaySection.tsx`, `HeroCarousel.tsx`, `OnboardingModal.tsx`, `SystemSettings.tsx`, `AdminPanel.tsx`, `src/types.ts`, `useCurrency`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `useBookingActions.ts`, `bookingTransactions.test.ts`, `bookingTransactions.ts`, `CoursesManager.tsx`, `useBookingModal.ts`, `achievementConfig.ts`, `ScheduleCalendar.tsx`, `logger.ts`, `StudentCoachPanel.tsx`, `useBookingChatUnread.ts`, `StudentHistoryList.tsx`, `useLanguage`, `studentCabinetUtils.ts`, `achievements.test.ts`, `firestoreMappers.ts`, `StudentCabinetHome.tsx`, `parseCourseDates`, `useInstructorWorkspace.ts`, `slotOverlap.ts`, `trainingStreak.ts`, `PushNotificationHub.tsx`, `Instructor`, `coachPhone.test.ts`, `courseTransactions.ts`, `LanguageContext.tsx`, `BookingChatModal.tsx`, `UserProfile`, `AppBootstrap.tsx`, `chatSenderRole.ts`, `useCourseActions.ts`, `lib/walletLedger.ts`, `StudentTodaySection.tsx`, `bookingsStore.ts`, `bookingService.ts`, `SystemSettings.tsx`, `AdminPanel.tsx`, `src/types.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `Course` connect `Booking` to `useBookingActions.ts`, `useBookingsStore`, `bookingTransactions.ts`, `CoursesManager.tsx`, `uiSelectors.ts`, `useBookingModal.ts`, `achievementConfig.ts`, `ScheduleCalendar.tsx`, `logger.ts`, `profile/index.ts`, `CourseDetailsModal.tsx`, `StudentCoachPanel.tsx`, `StudentHistoryList.tsx`, `useLanguage`, `studentCabinetUtils.ts`, `achievements.test.ts`, `firestoreMappers.ts`, `StudentCabinetHome.tsx`, `courseLevelStyles.ts`, `parseCourseDates`, `useInstructorWorkspace.ts`, `Instructor`, `coachPhone.test.ts`, `courseTransactions.ts`, `LanguageContext.tsx`, `BookingChatModal.tsx`, `UserProfile`, `chatSenderRole.ts`, `useCourseActions.ts`, `lib/walletLedger.ts`, `StudentTodaySection.tsx`, `bookingsStore.ts`, `SystemSettings.tsx`, `AdminPanel.tsx`, `src/types.ts`, `useCurrency`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _408 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bookingTransactions.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05967540574282147 - nodes in this community are weakly interconnected._
- **Should `Booking` be split into smaller, more focused modules?**
  _Cohesion score 0.12081632653061225 - nodes in this community are weakly interconnected._
- **Should `YourJourneySection.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07374890254609306 - nodes in this community are weakly interconnected._