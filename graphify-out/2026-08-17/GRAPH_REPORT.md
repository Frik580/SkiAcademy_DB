# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 412 files · ~201,912 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2059 nodes · 7080 edges · 133 communities (109 shown, 24 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5e419c81`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useBookingActions.ts
- callableTestEnv.ts
- YourJourneySection.tsx
- bookingTransactions.ts
- StudentCabinetHome.tsx
- course.ts
- JourneyProgress.tsx
- useBookingModal.ts
- achievementConfig.ts
- scheduleOverlap.ts
- useNotifications
- ModalHost.tsx
- UserProfile
- StudentCoachPanel.tsx
- bookingTransactions.test.ts
- formatDurationLabel
- ClientBookingsList.tsx
- StudentHistoryList.tsx
- scripts
- useLanguage
- studentCabinetUtils.ts
- StudentProfilePersonalSection.tsx
- achievements.ts
- LanguageContext.tsx
- todayChecklist.ts
- StudentTodaySection.tsx
- ResortConditionsSidebar.tsx
- InstructorBookingCard.tsx
- Navbar.tsx
- courseLevelStyles.ts
- formatBookingDayMonth
- compilerOptions
- firebase.ts
- skillData.ts
- useInstructorWorkspace.ts
- slotOverlap.ts
- firestore.rules.test.ts
- useNotificationsSync.ts
- extract-coaches-manager.mjs
- Auth.test.tsx
- global-setup.ts
- bookingLogic.ts
- Instructor
- BookingCallCoachButton.tsx
- courseEnrichedData.ts
- bodyScrollLock.ts
- CourseGallery.tsx
- dependencies
- createBooking.ts
- compilerOptions
- RescheduleModal.tsx
- walletStore.ts
- ErrorBoundary.tsx
- devDependencies
- eslint
- firestoreMappers.ts
- courseTransactions.ts
- StudentCabinetUI.tsx
- src/types.ts
- useBreakpoint.ts
- HomeworkPanel.tsx
- extract-courses-manager.mjs
- TranslationKey
- src/index.ts
- createBookingWithPayment
- extract-admin-sections.mjs
- AppBootstrap.tsx
- coachUtils.test.ts
- README.md
- BookingChatModal.tsx
- functions/package.json
- autoComplete.ts
- package.json
- useCourseActions.ts
- SkillRadarChart.tsx
- lib/walletLedger.ts
- createGuestCourseEnrollment.ts
- getMyInstructors
- walletCredit.ts
- patch-admin-return.mjs
- TodayChecklist.tsx
- useProfileStore
- HeroCarousel.tsx
- adminFirestore.test.ts
- balanceOptimisticMiddleware.ts
- eslint-plugin-react-hooks
- declarations.d.ts
- profile/index.ts
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
- settingsStore.ts
- @testing-library/jest-dom
- @testing-library/react
- StudentActivityRings.tsx
- typescript-eslint
- SystemSettings.tsx
- @vitejs/plugin-react
- vitest
- Booking
- vitest.config.ts
- activity.ts
- eslint-plugin-react-refresh
- AGENTS.md
- BookingAuthShell.tsx
- tailwindcss
- CourseEnrollmentModal.tsx
- StudentProfilePreferencesSection.tsx
- isTimestampOnLocalDate

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
- `UseCourseFormInput` --references--> `Course`  [EXTRACTED]
  src/features/admin/components/admin/courses_manager/useCourseForm.ts → src/types/course.ts

## Import Cycles
- 3-file cycle: `src/features/shell/index.ts -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts`
- 4-file cycle: `src/features/shell/ModalHost.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx`
- 5-file cycle: `src/features/notifications/NotificationsPanel.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx -> src/features/notifications/NotificationsPanel.tsx`
- 5-file cycle: `src/features/profile/OnboardingFlow.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx -> src/features/profile/OnboardingFlow.tsx`
- 5-file cycle: `src/features/bookings/components/BookingChatModal.tsx -> src/features/bookings/components/booking_chat/ChatWindow.tsx -> src/features/profile/index.ts -> src/features/profile/components/InstructorWorkspace.tsx -> src/features/bookings/index.ts -> src/features/bookings/components/BookingChatModal.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetHome.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetPanels.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCoachPanel.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentHistoryPanel.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`

## Communities (133 total, 24 thin omitted)

### Community 0 - "useBookingActions.ts"
Cohesion: 0.17
Nodes (32): AdminPanel, useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), confirmBookingService(), deleteBookingService() (+24 more)

### Community 1 - "callableTestEnv.ts"
Cohesion: 0.10
Nodes (37): CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser(), getCallableAuth() (+29 more)

### Community 2 - "YourJourneySection.tsx"
Cohesion: 0.25
Nodes (19): CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, JOURNEY_LEVELS, JourneyPath(), buildWavyPath(), createPathSampler(), getFirstUnlockedJourneyLevelId(), getJourneyLevelUpZones(), getJourneyPathProgress() (+11 more)

### Community 3 - "bookingTransactions.ts"
Cohesion: 0.17
Nodes (25): AVAILABILITY_SLOTS_COLLECTION, isCourseBooking(), BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), addBookingWithPayment() (+17 more)

### Community 4 - "StudentCabinetHome.tsx"
Cohesion: 0.14
Nodes (29): AchievementsManagerProps, SystemSettingsProps, AdminPanelProps, InstructorWorkspaceInput, InstructorWorkspaceProps, StudentCabinetContext, StudentCabinetHomeProps, StudentCabinetTab (+21 more)

### Community 5 - "course.ts"
Cohesion: 0.13
Nodes (14): CoursesTable(), CoursesTableProps, CourseTableRow(), CourseTableRowProps, CoursesManager(), CoursesManagerProps, buildClonedCourse(), getCourseLevelBadgeClass() (+6 more)

### Community 6 - "JourneyProgress.tsx"
Cohesion: 0.13
Nodes (18): AchievementGrid(), EQUAL_MARKER_STOPS, JOURNEY_BG, LEVEL_MARKER_X, SUMMARY_STATS, JourneyPathStrip(), UserPathMarker(), getJourneyMarkerXpFontSize() (+10 more)

### Community 7 - "useBookingModal.ts"
Cohesion: 0.25
Nodes (17): createGuestBookingService(), getInstructorAvailabilitySlots(), updateBookingStatusService(), useBookingModal(), BookingModal(), useRescheduleBooking(), migrateAvailabilitySlots(), AVAILABILITY_MIGRATION_SETTING (+9 more)

### Community 8 - "achievementConfig.ts"
Cohesion: 0.17
Nodes (28): applySkillDeltas(), bookingTimestamp(), countExercisesMastered(), evaluateEarnedAchievements(), findCourseGraduateTimestamp(), findExercisesMasteredTimestamp(), findFeedbackTimestamp(), findHomeworkDoneTimestamp() (+20 more)

### Community 9 - "scheduleOverlap.ts"
Cohesion: 0.21
Nodes (13): AvailableDurationsOptions, AvailableMoveTimesOptions, getAvailableMoveTimeSlots(), getAvailableScheduleDurations(), hasScheduleOverlap(), SCHEDULE_CLOSING_TIME_MINUTES, SCHEDULE_DURATIONS, SCHEDULE_TIME_SLOTS (+5 more)

### Community 10 - "useNotifications"
Cohesion: 0.06
Nodes (47): deleteErrorLog(), deleteErrorLogs(), subscribeErrorLogs(), AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), CourseBackgroundImageField(), CourseBackgroundImageFieldProps (+39 more)

### Community 11 - "ModalHost.tsx"
Cohesion: 0.09
Nodes (41): AppShell(), FeaturePageShell(), FeaturePageShellProps, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), HomeRouteContainer(), InstructorRouteContainer() (+33 more)

### Community 12 - "UserProfile"
Cohesion: 0.12
Nodes (18): ClientsManagerProps, LinkGuestBookingModalProps, ActiveSlotDetails(), ActiveSlotDetailsProps, AuthModalProps, BookingModalProps, CourseProgramStep, CourseEnrollAction() (+10 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.07
Nodes (57): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, MediaUploader(), MediaUploaderProps, BookingChatModal() (+49 more)

### Community 14 - "bookingTransactions.test.ts"
Cohesion: 0.20
Nodes (24): buildProdCourseSeed(), seedBookings(), seedCourse(), seedCourse(), bookingId, seedLegacyCancelledBooking(), seedProdCourse(), seedProdUser() (+16 more)

### Community 15 - "formatDurationLabel"
Cohesion: 0.27
Nodes (10): mapActivityLogToHistoryEvent(), NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain() (+2 more)

### Community 16 - "ClientBookingsList.tsx"
Cohesion: 0.14
Nodes (20): LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, BookingListScope, UpcomingSessionsStrip(), getBookingStatusLabel(), getHourSuffix(), STATUS_LABELS, formatShortBookingDate() (+12 more)

### Community 17 - "StudentHistoryList.tsx"
Cohesion: 0.31
Nodes (8): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, FILTER_LABEL_KEYS, HISTORY_FILTERS, StudentHistoryList()

### Community 18 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 19 - "useLanguage"
Cohesion: 0.13
Nodes (30): ChatInput(), ChatInputProps, sortVisibleCourses(), BookingsPanel(), StudentCalendarPanel(), StudentCoursesPanel(), StudentTrainingPanel(), TRAINING_HUB_ITEMS (+22 more)

### Community 20 - "studentCabinetUtils.ts"
Cohesion: 0.08
Nodes (44): StudentCabinetHome(), Achievement, addMinutesToTime(), buildLocalDateTime(), filterBookingsByScope(), getActiveCourseEnrollment(), getBookingDailyTimeWindow(), getCurrentSessions() (+36 more)

### Community 21 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.23
Nodes (9): CoachesManager(), optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary, StudentProfilePersonalSection(), StudentProfilePersonalSectionProps, useEffectiveBalance() (+1 more)

### Community 22 - "achievements.ts"
Cohesion: 0.16
Nodes (17): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, formatActivityTimestamp(), getAchievements(), AchievementDefinition, AchievementRule, AchievementRuleType (+9 more)

### Community 23 - "LanguageContext.tsx"
Cohesion: 0.27
Nodes (9): LessonFiltersProps, isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageContext, LanguageProvider(), TranslatedBooking (+1 more)

### Community 24 - "todayChecklist.ts"
Cohesion: 0.18
Nodes (17): getTodayTasks(), getRecommendationTasks(), isActiveBookingForRecommendations(), buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate(), buildRemoveTodayTaskUpdate(), buildToggleSkillTodayUpdate(), buildToggleTodayCompleteUpdate() (+9 more)

### Community 25 - "StudentTodaySection.tsx"
Cohesion: 0.13
Nodes (35): LessonDetailsModal(), RecommendationIndicator(), RecommendationIndicatorProps, HistoryLessonCard(), ScDivider(), ScSectionTitle(), ScTextButton(), countPendingRecommendations() (+27 more)

### Community 26 - "ResortConditionsSidebar.tsx"
Cohesion: 0.36
Nodes (5): ResortConditionsSidebar(), ResortConditionsSidebarProps, getWeatherConditionKey(), AnimatedNumber(), AnimatedNumberProps

### Community 27 - "InstructorBookingCard.tsx"
Cohesion: 0.13
Nodes (19): ChatUnreadIndicator(), ChatUnreadIndicatorProps, InstructorBookingCard(), InstructorBookingCardProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, StudentAssessButton(), StudentAssessButtonProps (+11 more)

### Community 28 - "Navbar.tsx"
Cohesion: 0.16
Nodes (14): Logo(), LogoProps, Navbar(), NavbarProps, StudentCabinetShell(), RouteGate(), RouteGateProps, RouteGateRole (+6 more)

### Community 29 - "courseLevelStyles.ts"
Cohesion: 0.07
Nodes (37): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+29 more)

### Community 30 - "formatBookingDayMonth"
Cohesion: 0.23
Nodes (10): formatBookingDayMonth(), getHistoryEvents(), getLegacyHistoryEvents(), getLessonAgeDays(), isBookingInTodayRecommendationWindow(), RECOMMENDATION_TODAY_WINDOW_DAYS, resolveBookingStartDate(), StudentLatestRecommendationSection() (+2 more)

### Community 31 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 32 - "firebase.ts"
Cohesion: 0.14
Nodes (21): getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService(), saveUserProfileService(), signInWithEmailService(), signInWithGoogleService(), signUpWithEmailService(), Auth() (+13 more)

### Community 33 - "skillData.ts"
Cohesion: 0.17
Nodes (20): SkillConfigManager(), SkillConfigManagerProps, RadarDimension, StudentSkillEvaluationModal(), StudentSkillEvaluationModalProps, calculateStudentLevel(), classifySkillItemToRadarDimension(), DEFAULT_RADAR_DIMENSION_BY_ITEM_ID (+12 more)

### Community 34 - "useInstructorWorkspace.ts"
Cohesion: 0.13
Nodes (21): completeBookingService(), saveBookingRecommendationsService(), InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews(), InstructorReviewsProps (+13 more)

### Community 35 - "slotOverlap.ts"
Cohesion: 0.31
Nodes (7): addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), buildHourLockIds(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap()

### Community 36 - "firestore.rules.test.ts"
Cohesion: 0.33
Nodes (6): buildCourseEnrollmentBooking(), PROD_COURSE_ID, PROD_USER_ID, prodBookingId(), prodInstructorId(), RulesBookingSeed

### Community 37 - "useNotificationsSync.ts"
Cohesion: 0.17
Nodes (13): clearNotificationsService(), deleteNotificationService(), markNotificationsAsReadService(), useDbNotifications(), useUnreadNotificationCount(), useNotificationsStore, NotificationsState, useNotificationActions() (+5 more)

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
Cohesion: 0.09
Nodes (25): BookingsLogProps, CoachesManagerProps, LinkGuestBookingModal(), ActiveSlotCreateForm(), ActiveSlotCreateFormProps, ActiveSlotMoveForm(), ActiveSlotMoveFormProps, ScheduleCalendarProps (+17 more)

### Community 43 - "BookingCallCoachButton.tsx"
Cohesion: 0.33
Nodes (6): BookingCallCoachButton(), BookingCallCoachButtonProps, normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 44 - "courseEnrichedData.ts"
Cohesion: 0.28
Nodes (7): CourseEnrichedData, CourseFaqItem, CourseReview, getCourseEnrichedData(), CourseFAQ(), CourseFAQProps, CourseDetailsModal()

### Community 45 - "bodyScrollLock.ts"
Cohesion: 0.48
Nodes (5): applyBodyScrollLock(), BODY_SCROLL_LOCK_CLASS, lockBodyScroll(), releaseBodyScrollLock(), useBodyScrollLock()

### Community 47 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 48 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 49 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 51 - "walletStore.ts"
Cohesion: 0.15
Nodes (12): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, TODO: реализовать применение кредита в Firestore, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState (+4 more)

### Community 52 - "ErrorBoundary.tsx"
Cohesion: 0.18
Nodes (9): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, logErrorBoundaryFailure(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk() (+1 more)

### Community 53 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 55 - "firestoreMappers.ts"
Cohesion: 0.12
Nodes (28): signOutService(), AuthState, useAuthStore, useSessionSync(), useBookingsSync(), useCoursesSync(), useNotificationsSync(), useCurrentUserProfileSync() (+20 more)

### Community 56 - "courseTransactions.ts"
Cohesion: 0.22
Nodes (17): AdminPanel(), formatCourseCardDate(), GroupCourseCard(), ClientBookingsList(), getCourseLevelCardBadgeClass(), CourseEnrollmentError, enrollInCourse(), getGroupCourseEnrollmentNote() (+9 more)

### Community 57 - "StudentCabinetUI.tsx"
Cohesion: 0.11
Nodes (19): StudentBookNextFab(), StudentBookNextFabProps, isProfileTab(), PROFILE_TABS, resolveStudentBottomNavTab(), getSwipeNeighborSequence(), SC_TINT_CARD, SC_TINT_VALUE (+11 more)

### Community 58 - "src/types.ts"
Cohesion: 0.08
Nodes (22): ConfirmActionModal(), ConfirmActionModalProps, LevelUpModal(), LevelUpModalProps, PersonalCabinetModals(), PersonalCabinetModalsProps, ReviewModal(), UnreviewedCompletedBookingsNotice() (+14 more)

### Community 60 - "HomeworkPanel.tsx"
Cohesion: 0.50
Nodes (3): CourseChatClient, HomeworkPanel(), HomeworkPanelProps

### Community 61 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 62 - "TranslationKey"
Cohesion: 0.12
Nodes (20): CoursesManagerToolbar(), CoursesManagerToolbarProps, ScheduleCalendar(), ScheduleInstructorCellProps, ScheduleToolbar(), ScheduleToolbarProps, ScheduleViewMode, getWeekRange() (+12 more)

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
Cohesion: 0.16
Nodes (14): AppBootstrap(), AppBootstrapProps, useAchievementsSync(), applyDesignThemeToDOM(), registerFirestoreErrorListener(), getLanguage(), LanguageFn, NotificationFn (+6 more)

### Community 68 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 69 - "BookingChatModal.tsx"
Cohesion: 0.12
Nodes (21): ChatMessageList(), ChatMessageListProps, ChatMessageRow, ChatWindow(), BookingChatModalProps, CourseChatClient, buildHomeworkForUserIds(), ChatSenderRole (+13 more)

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
Nodes (9): getCurrentAuthenticatedUser(), addCourseService(), deleteCourseService(), enrollInCourseService(), updateCourseService(), stripUndefinedFields(), enrollInCourse, EnrollInCourseResult (+1 more)

### Community 74 - "SkillRadarChart.tsx"
Cohesion: 0.15
Nodes (20): ClientSkillProgressView(), ClientSkillProgressViewProps, APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimensionFilter, SkillRadarChart(), ScProgressBar() (+12 more)

### Community 75 - "lib/walletLedger.ts"
Cohesion: 0.12
Nodes (23): PaymentGateway(), PaymentGatewayProps, StudentWalletHistoryList(), formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt(), buildSyntheticWalletOperations() (+15 more)

### Community 76 - "createGuestCourseEnrollment.ts"
Cohesion: 0.43
Nodes (6): CourseRecord, createGuestCourseEnrollmentHandler(), GuestCourseEnrollmentInput, optionalText(), parseInput(), requireText()

### Community 77 - "getMyInstructors"
Cohesion: 0.43
Nodes (7): StudentInstructorsPanel(), getInstructorPickerGroups(), getInstructorsForStudent(), getMyInstructors(), getRecommendedCourses(), getRecommendedInstructors(), resolveNextLessonBookingTarget()

### Community 78 - "walletCredit.ts"
Cohesion: 0.30
Nodes (13): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_KZT (+5 more)

### Community 79 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 80 - "TodayChecklist.tsx"
Cohesion: 0.48
Nodes (6): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), TodayTaskRef

### Community 81 - "useProfileStore"
Cohesion: 0.16
Nodes (12): useAvailabilityMigrationSync(), DeletedCompletedStats, useBookingStore, addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService() (+4 more)

### Community 82 - "HeroCarousel.tsx"
Cohesion: 0.27
Nodes (10): buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps, resolveSlideBackground(), shuffleSlides(), applyThemeToDOM(), getInitialTheme() (+2 more)

### Community 83 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 86 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 87 - "profile/index.ts"
Cohesion: 0.12
Nodes (17): PersonalCabinet, InstructorWorkspace, InstructorReviewsModal(), BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc() (+9 more)

### Community 88 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 96 - "bookingService.ts"
Cohesion: 0.23
Nodes (11): createBookingForUser(), BookingPaymentResult, BookingSlotOverlapError, InsufficientFundsError, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable() (+3 more)

### Community 103 - "settingsStore.ts"
Cohesion: 0.24
Nodes (12): saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled(), saveSkillConfig(), SettingsState, useSettingsSync() (+4 more)

### Community 107 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 109 - "SystemSettings.tsx"
Cohesion: 0.21
Nodes (11): AdminCollapsibleSection(), AdminCollapsibleSectionProps, SystemSettings(), SystemSettings, getNotificationTimestampMs(), isNotificationExpired(), purgeExpiredNotificationsForUser(), DEFAULT_NOTIFICATION_RETENTION_DAYS (+3 more)

### Community 112 - "Booking"
Cohesion: 0.11
Nodes (25): ChatWindowProps, BookingModalInput, CourseEnrollmentModalProps, GroupCourseCardProps, GroupCoursesSectionProps, CoursesState, BookingsPanelProps, ClientBookingsListProps (+17 more)

### Community 123 - "activity.ts"
Cohesion: 0.50
Nodes (3): ActivityLogMetadata, ActivityLogType, SkillDeltaMeta

### Community 134 - "BookingAuthShell.tsx"
Cohesion: 0.19
Nodes (9): AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, BookingModalHeader(), BookingModalHeaderProps, BookingSelectors(), GuestBookingForm() (+1 more)

### Community 136 - "CourseEnrollmentModal.tsx"
Cohesion: 0.10
Nodes (23): saveUsdToKztRate(), BookingsLog(), shortenBookingId(), FinancialOverview(), FinancialOverviewProps, FinancialOverview, AuthBookingForm(), AuthBookingFormProps (+15 more)

### Community 138 - "StudentProfilePreferencesSection.tsx"
Cohesion: 0.40
Nodes (3): StudentProfilePreferencesSection(), StudentProfilePreferencesSectionProps, StudentSettingsCompactProps

### Community 139 - "isTimestampOnLocalDate"
Cohesion: 0.67
Nodes (4): getTodayAchievements(), isTimestampOnLocalDate(), parseActivityTimestamp(), TodayProgressBlock

## Knowledge Gaps
- **408 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+403 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `YourJourneySection.tsx`, `StudentCabinetHome.tsx`, `course.ts`, `JourneyProgress.tsx`, `useBookingModal.ts`, `CourseEnrollmentModal.tsx`, `scheduleOverlap.ts`, `useNotifications`, `ModalHost.tsx`, `UserProfile`, `StudentCoachPanel.tsx`, `StudentProfilePreferencesSection.tsx`, `formatDurationLabel`, `ClientBookingsList.tsx`, `StudentHistoryList.tsx`, `isTimestampOnLocalDate`, `studentCabinetUtils.ts`, `StudentProfilePersonalSection.tsx`, `achievements.ts`, `LanguageContext.tsx`, `StudentTodaySection.tsx`, `ResortConditionsSidebar.tsx`, `InstructorBookingCard.tsx`, `Navbar.tsx`, `courseLevelStyles.ts`, `formatBookingDayMonth`, `firebase.ts`, `skillData.ts`, `useInstructorWorkspace.ts`, `Instructor`, `BookingCallCoachButton.tsx`, `courseEnrichedData.ts`, `CourseGallery.tsx`, `RescheduleModal.tsx`, `courseTransactions.ts`, `StudentCabinetUI.tsx`, `src/types.ts`, `HomeworkPanel.tsx`, `TranslationKey`, `AppBootstrap.tsx`, `BookingChatModal.tsx`, `SkillRadarChart.tsx`, `lib/walletLedger.ts`, `getMyInstructors`, `TodayChecklist.tsx`, `HeroCarousel.tsx`, `profile/index.ts`, `SystemSettings.tsx`, `Booking`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `useBookingActions.ts`, `callableTestEnv.ts`, `bookingTransactions.ts`, `StudentCabinetHome.tsx`, `course.ts`, `useBookingModal.ts`, `achievementConfig.ts`, `scheduleOverlap.ts`, `useNotifications`, `UserProfile`, `StudentCoachPanel.tsx`, `bookingTransactions.test.ts`, `ClientBookingsList.tsx`, `StudentHistoryList.tsx`, `useLanguage`, `studentCabinetUtils.ts`, `StudentTodaySection.tsx`, `InstructorBookingCard.tsx`, `formatBookingDayMonth`, `useInstructorWorkspace.ts`, `slotOverlap.ts`, `Instructor`, `BookingCallCoachButton.tsx`, `firestoreMappers.ts`, `courseTransactions.ts`, `src/types.ts`, `AppBootstrap.tsx`, `coachUtils.test.ts`, `BookingChatModal.tsx`, `useCourseActions.ts`, `lib/walletLedger.ts`, `TodayChecklist.tsx`, `useProfileStore`, `bookingService.ts`, `SystemSettings.tsx`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `Course` connect `Booking` to `useBookingActions.ts`, `bookingTransactions.ts`, `StudentCabinetHome.tsx`, `course.ts`, `uiSelectors.ts`, `useBookingModal.ts`, `CourseEnrollmentModal.tsx`, `scheduleOverlap.ts`, `achievementConfig.ts`, `ModalHost.tsx`, `UserProfile`, `StudentCoachPanel.tsx`, `ClientBookingsList.tsx`, `StudentHistoryList.tsx`, `useLanguage`, `studentCabinetUtils.ts`, `LanguageContext.tsx`, `StudentTodaySection.tsx`, `courseLevelStyles.ts`, `useInstructorWorkspace.ts`, `Instructor`, `BookingCallCoachButton.tsx`, `firestoreMappers.ts`, `courseTransactions.ts`, `src/types.ts`, `TranslationKey`, `coachUtils.test.ts`, `BookingChatModal.tsx`, `useCourseActions.ts`, `lib/walletLedger.ts`, `useProfileStore`, `SystemSettings.tsx`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _408 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `callableTestEnv.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10465116279069768 - nodes in this community are weakly interconnected._
- **Should `StudentCabinetHome.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14444444444444443 - nodes in this community are weakly interconnected._
- **Should `course.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12681159420289856 - nodes in this community are weakly interconnected._