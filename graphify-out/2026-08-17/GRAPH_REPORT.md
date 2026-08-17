# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 417 files · ~202,008 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2068 nodes · 7164 edges · 131 communities (110 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aba23286`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useBookingActions.ts
- bookingTransactions.test.ts
- courseLevelStyles.ts
- slotOverlap.ts
- Booking
- studentCabinetUtils.ts
- profile/index.ts
- useBookingModal.ts
- toYMD
- parseCourseDates
- ResortSliderSection.tsx
- ModalHost.tsx
- AppBootstrap.tsx
- StudentCoachPanel.tsx
- ErrorLogsPanel.tsx
- useBookingChatUnread.ts
- callableTestEnv.ts
- journeyUtils.ts
- scripts
- StudentCabinetShell.tsx
- studentBookingSchedule.ts
- skillData.ts
- Course
- StudentCabinetUI.tsx
- todayChecklist.ts
- ClientBookingsList.tsx
- walletStore.ts
- ChatMessage
- courseEnrollmentRegression.test.ts
- ScheduleCalendar.tsx
- formatDurationLabel
- compilerOptions
- firebase.ts
- TranslationKey
- InstructorBookingCard.tsx
- notifications/index.ts
- useInstructorWorkspace
- bookingsStore.ts
- extract-coaches-manager.mjs
- Auth.test.tsx
- global-setup.ts
- bookingLogic.ts
- src/types.ts
- BookingCallCoachButton.tsx
- CourseDetailsModal.tsx
- useCourseActions.ts
- StudentCabinetHome.tsx
- dependencies
- createBooking.ts
- compilerOptions
- useNotifications
- StudentProfilePersonalSection.tsx
- ErrorBoundary.tsx
- devDependencies
- eslint
- firestoreMappers.ts
- GroupCourseCard.tsx
- OnboardingModal.tsx
- BodyScrollLock.tsx
- HeroCarousel.tsx
- BookingChatModal.tsx
- extract-courses-manager.mjs
- LanguageContext.tsx
- src/index.ts
- createBookingWithPayment
- extract-admin-sections.mjs
- lib/walletLedger.ts
- useProfileStore
- README.md
- chatSenderRole.ts
- functions/package.json
- autoComplete.ts
- package.json
- Navbar.tsx
- SkillRadarChart.tsx
- settings/index.ts
- createGuestCourseEnrollment.ts
- courseDates.ts
- walletCredit.ts
- patch-admin-return.mjs
- StudentTodaySection.tsx
- achievementConfig.ts
- adminFirestore.test.ts
- balanceOptimisticMiddleware.ts
- eslint-plugin-react-hooks
- declarations.d.ts
- adminSelectors.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- StatusBadge.tsx
- ResortConditionsSidebar.tsx
- useTheme
- @firebase/rules-unit-testing
- bookingEndsAt.ts
- jsdom
- @playwright/test
- prettier
- bookingService.ts
- @testing-library/jest-dom
- @testing-library/react
- UserProfile
- StudentActivityRings.tsx
- typescript-eslint
- instructor.ts
- @vitejs/plugin-react
- vitest
- vitest.config.ts
- eslint-plugin-react-refresh
- AGENTS.md
- tailwindcss
- useLanguage

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 236 edges
2. `Booking` - 170 edges
3. `UserProfile` - 135 edges
4. `Course` - 132 edges
5. `Instructor` - 101 edges
6. `useProfileStore` - 57 edges
7. `TranslationKey` - 50 edges
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
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetPanels.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetHome.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCoachPanel.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentHistoryPanel.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/bookings/components/BookingChatModal.tsx -> src/features/bookings/components/booking_chat/ChatWindow.tsx -> src/features/profile/index.ts -> src/features/profile/components/InstructorWorkspace.tsx -> src/features/bookings/index.ts -> src/features/bookings/components/BookingChatModal.tsx`
- 5-file cycle: `src/features/notifications/NotificationsPanel.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx -> src/features/notifications/NotificationsPanel.tsx`
- 5-file cycle: `src/features/profile/OnboardingFlow.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx -> src/features/profile/OnboardingFlow.tsx`

## Communities (131 total, 21 thin omitted)

### Community 0 - "useBookingActions.ts"
Cohesion: 0.15
Nodes (34): AdminPanel, useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService() (+26 more)

### Community 1 - "bookingTransactions.test.ts"
Cohesion: 0.23
Nodes (20): seedBookings(), seedCourse(), seedCourse(), seedProdUser(), clearIntegrationFirestore(), INSTRUCTOR_ID, INSTRUCTOR_USER_ID, integrationTestEnv() (+12 more)

### Community 2 - "courseLevelStyles.ts"
Cohesion: 0.08
Nodes (32): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+24 more)

### Community 3 - "slotOverlap.ts"
Cohesion: 0.23
Nodes (9): AVAILABILITY_MIGRATION_SETTING, AVAILABILITY_SLOTS_COLLECTION, addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), buildHourLockIds(), hasOverlappingAvailabilitySlot(), SlotInterval (+1 more)

### Community 4 - "Booking"
Cohesion: 0.11
Nodes (19): BookingsState, NotificationHubModalProps, EnrichedBooking, InstructorWorkspaceInput, StatusFilter, InstructorWorkspaceProps, PersonalCabinetModalsProps, ReviewModal() (+11 more)

### Community 5 - "studentCabinetUtils.ts"
Cohesion: 0.09
Nodes (27): StudentCoursesPanel(), StudentInstructorsPanel(), Achievement, formatActivityTimestamp(), getAvailableCourses(), getEnrolledCourses(), getInstructorPickerGroups(), getInstructorsForStudent() (+19 more)

### Community 6 - "profile/index.ts"
Cohesion: 0.12
Nodes (24): PersonalCabinet, InstructorWorkspace, InstructorReviewsModal(), AchievementGrid(), EQUAL_MARKER_STOPS, JOURNEY_BG, LEVEL_MARKER_X, LEVEL_MARKER_Y (+16 more)

### Community 7 - "useBookingModal.ts"
Cohesion: 0.15
Nodes (22): createGuestBookingService(), getInstructorAvailabilitySlots(), AuthBookingForm(), AuthBookingFormProps, AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps (+14 more)

### Community 8 - "toYMD"
Cohesion: 0.13
Nodes (26): isBookingOnDate(), parseBookingStartTime(), StudentCabinetHome(), getFirstName(), getGreeting(), getLevelName(), LEVEL_LABEL_EN, LEVEL_LABEL_RU (+18 more)

### Community 9 - "parseCourseDates"
Cohesion: 0.19
Nodes (24): ScheduleCalendar(), LessonDetailsModal(), LessonRecommendationsList(), LessonRecommendationsListProps, getHistoryEvents(), getLegacyHistoryEvents(), getRecentLessons(), formatBookingDayMonth() (+16 more)

### Community 10 - "ResortSliderSection.tsx"
Cohesion: 0.35
Nodes (7): ResortDataSection(), ResortSliderSection(), saveResortConfig(), subscribeResortConfig(), FormSkeleton(), ToggleSwitch(), ToggleSwitchProps

### Community 11 - "ModalHost.tsx"
Cohesion: 0.08
Nodes (47): AppShell(), Navbar(), FeaturePageShell(), FeaturePageShellProps, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), HomeRouteContainer() (+39 more)

### Community 12 - "AppBootstrap.tsx"
Cohesion: 0.14
Nodes (23): AppBootstrap(), AppBootstrapProps, useAchievementsSync(), saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled() (+15 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.15
Nodes (28): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+20 more)

### Community 14 - "ErrorLogsPanel.tsx"
Cohesion: 0.30
Nodes (9): deleteErrorLog(), deleteErrorLogs(), subscribeErrorLogs(), ErrorLogsPanel(), ErrorLogsPanelProps, ErrorLogsPanel, ErrorLog, StateCard() (+1 more)

### Community 15 - "useBookingChatUnread.ts"
Cohesion: 0.22
Nodes (15): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), CourseChatBooking, getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId(), buildWatchPlanKey() (+7 more)

### Community 16 - "callableTestEnv.ts"
Cohesion: 0.10
Nodes (37): CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser(), getCallableAuth() (+29 more)

### Community 17 - "journeyUtils.ts"
Cohesion: 0.18
Nodes (20): CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, JOURNEY_LEVELS, JourneyPath(), buildWavyPath(), createPathSampler(), getFirstUnlockedJourneyLevelId(), getJourneyLevelUpZones(), getJourneyPathProgress() (+12 more)

### Community 18 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 19 - "StudentCabinetShell.tsx"
Cohesion: 0.12
Nodes (25): isProfileTab(), PROFILE_TABS, resolveStudentBottomNavTab(), StudentCalendarPanel(), StudentTrainingPanel(), getSwipeNeighborSequence(), StudentCabinetTabBar(), buildStudentHistory() (+17 more)

### Community 20 - "studentBookingSchedule.ts"
Cohesion: 0.35
Nodes (10): BookingTime, buildLocalDateTime(), getCourseSchedule(), isBookingCurrentBySchedule(), isBookingPastBySchedule(), isBookingUpcomingBySchedule(), parseBookingEndTime(), resolveBookingEndDateTime() (+2 more)

### Community 21 - "skillData.ts"
Cohesion: 0.16
Nodes (21): SkillConfigManager(), SkillConfigManagerProps, RadarDimension, getSectionProgress(), StudentSkillEvaluationModal(), StudentSkillEvaluationModalProps, calculateStudentLevel(), classifySkillItemToRadarDimension() (+13 more)

### Community 22 - "Course"
Cohesion: 0.11
Nodes (20): CoursesTableProps, CourseTableRow(), CourseTableRowProps, ScheduleInstructorCellProps, AvailableMoveTimesOptions, BookingOverlapWarningsProps, CourseEnrollActionProps, GroupCourseCardProps (+12 more)

### Community 23 - "StudentCabinetUI.tsx"
Cohesion: 0.09
Nodes (26): StudentBookNextFab(), StudentBookNextFabProps, SC_TINT_CARD, SC_TINT_VALUE, ScSectionTitle(), ScStatGrid(), ScTint, ScTintCard() (+18 more)

### Community 24 - "todayChecklist.ts"
Cohesion: 0.21
Nodes (15): getTodayTasks(), buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate(), buildRemoveTodayTaskUpdate(), buildToggleSkillTodayUpdate(), buildToggleTodayCompleteUpdate(), createCustomTodayTaskId(), customTodayTaskId() (+7 more)

### Community 25 - "ClientBookingsList.tsx"
Cohesion: 0.15
Nodes (21): ChatWindow(), ChatWindowProps, ChatUnreadIndicator(), ClientBookingsList(), LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, RecommendationIndicator(), RecommendationIndicatorProps (+13 more)

### Community 26 - "walletStore.ts"
Cohesion: 0.15
Nodes (12): WalletCurrency, WalletLedgerEntry, WalletLedgerType, WalletState, TODO: реализовать применение кредита в Firestore, BalanceOptimisticImpl, balanceOptimisticMiddleware(), BalanceOptimisticState (+4 more)

### Community 27 - "ChatMessage"
Cohesion: 0.43
Nodes (4): buildHomeworkForUserIds(), isHomeworkVisibleToStudent(), ChatMessage, GROUP_UIDS

### Community 28 - "courseEnrollmentRegression.test.ts"
Cohesion: 0.27
Nodes (10): buildCourseEnrollmentBooking(), buildProdCourseSeed(), PROD_COURSE_ID, PROD_USER_ID, prodBookingId(), prodInstructorId(), RulesBookingSeed, bookingId (+2 more)

### Community 29 - "ScheduleCalendar.tsx"
Cohesion: 0.11
Nodes (24): ActiveSlotDetails(), ActiveSlotDetailsProps, ActiveSlotMoveForm(), ActiveSlotMoveFormProps, ScheduleCalendarProps, AvailableDurationsOptions, getAvailableMoveTimeSlots(), getAvailableScheduleDurations() (+16 more)

### Community 30 - "formatDurationLabel"
Cohesion: 0.27
Nodes (10): BookingOverlapWarnings(), NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain() (+2 more)

### Community 31 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 32 - "firebase.ts"
Cohesion: 0.13
Nodes (21): getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService(), saveUserProfileService(), signInWithEmailService(), signInWithGoogleService(), signUpWithEmailService(), Auth() (+13 more)

### Community 33 - "TranslationKey"
Cohesion: 0.17
Nodes (12): CoursesManagerToolbar(), CoursesManagerToolbarProps, LocalizedCompressionError, BookingModalHeaderProps, BookingSelectorsProps, InstructorNotLinked(), InstructorNotLinkedProps, HistoryEventCta (+4 more)

### Community 34 - "InstructorBookingCard.tsx"
Cohesion: 0.13
Nodes (17): saveBookingRecommendationsService(), ChatUnreadIndicatorProps, InstructorBookingCard(), InstructorBookingCardProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, StudentAssessButton(), StudentAssessButtonProps (+9 more)

### Community 35 - "notifications/index.ts"
Cohesion: 0.22
Nodes (8): App(), Notification, NotificationContext, NotificationContextType, NotificationHubModal(), NotificationProvider(), ActionButton(), ActionButtonProps

### Community 36 - "useInstructorWorkspace"
Cohesion: 0.16
Nodes (12): InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews(), InstructorReviewsProps, InstructorStudents(), InstructorStudentsProps (+4 more)

### Community 37 - "bookingsStore.ts"
Cohesion: 0.19
Nodes (11): useBookingStore, clearNotificationsService(), deleteNotificationService(), markNotificationsAsReadService(), NotificationsPanel(), useDbNotifications(), useNotificationsStore, NotificationsState (+3 more)

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

### Community 42 - "src/types.ts"
Cohesion: 0.10
Nodes (17): CoursesTable(), CoursesManager(), buildClonedCourse(), bookings, courses, userProfile, instructor, mockAddNotification (+9 more)

### Community 43 - "BookingCallCoachButton.tsx"
Cohesion: 0.33
Nodes (6): BookingCallCoachButton(), BookingCallCoachButtonProps, normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 44 - "CourseDetailsModal.tsx"
Cohesion: 0.18
Nodes (14): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseFAQ(), CourseFAQProps, CourseGallery() (+6 more)

### Community 45 - "useCourseActions.ts"
Cohesion: 0.29
Nodes (12): getCurrentAuthenticatedUser(), addCourseService(), deleteCourseService(), enrollInCourseService(), notifyCourseModifiedService(), updateCourseService(), useCourseActions(), stripUndefinedFields() (+4 more)

### Community 46 - "StudentCabinetHome.tsx"
Cohesion: 0.13
Nodes (31): AchievementsManagerProps, SystemSettingsProps, AdminPanelProps, BookingsPanel(), BookingsPanelProps, PersonalCabinetModals(), StudentCabinetContext, StudentCabinetHomeProps (+23 more)

### Community 47 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 48 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 49 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 50 - "useNotifications"
Cohesion: 0.25
Nodes (10): AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), useNotifications(), PersonalCabinet(), useReviewFlow(), canManageAdminRoles(), isSystemOwner() (+2 more)

### Community 51 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.14
Nodes (15): CoachesManager(), CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary (+7 more)

### Community 52 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (8): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, logErrorBoundaryFailure(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 53 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 55 - "firestoreMappers.ts"
Cohesion: 0.11
Nodes (31): signOutService(), AuthState, useAuthStore, useSessionSync(), useBookingsSync(), useCourseStore, useCoursesSync(), useNotificationsSync() (+23 more)

### Community 56 - "GroupCourseCard.tsx"
Cohesion: 0.26
Nodes (15): formatCourseCardDate(), GroupCourseCard(), getCourseLevelCardBadgeClass(), enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), translateCourse(), formatCourseCardDuration() (+7 more)

### Community 57 - "OnboardingModal.tsx"
Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 58 - "BodyScrollLock.tsx"
Cohesion: 0.14
Nodes (14): AuthModal(), AuthModalProps, ConfirmActionModal(), ConfirmActionModalProps, LevelUpModal(), LevelUpModalProps, RescheduleModal(), RescheduleModalProps (+6 more)

### Community 59 - "HeroCarousel.tsx"
Cohesion: 0.26
Nodes (9): buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps, resolveSlideBackground(), shuffleSlides(), FALLBACK_SLIDES, Theme (+1 more)

### Community 60 - "BookingChatModal.tsx"
Cohesion: 0.15
Nodes (20): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+12 more)

### Community 61 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 62 - "LanguageContext.tsx"
Cohesion: 0.44
Nodes (6): isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageContext, LanguageProvider()

### Community 63 - "src/index.ts"
Cohesion: 0.35
Nodes (8): getAdminFirestore(), getOrInitApp(), createBooking, createGuestCourseEnrollment, enrollInCourse, scheduledAutoCompleteBookings, scheduledPurgeExpiredNotifications, purgeExpiredNotifications()

### Community 64 - "createBookingWithPayment"
Cohesion: 0.31
Nodes (9): createBookingWithPayment(), EnrollCourseInput, enrollInCourseHandler(), parseInput(), recordWalletLedgerEntryInTransaction(), WALLET_LEDGER_COLLECTION, WalletLedgerEntry, walletLedgerEntryId() (+1 more)

### Community 65 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 66 - "lib/walletLedger.ts"
Cohesion: 0.10
Nodes (31): PaymentGateway(), PaymentGatewayProps, StudentWalletHistoryList(), isCourseBooking(), formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt() (+23 more)

### Community 67 - "useProfileStore"
Cohesion: 0.32
Nodes (10): useAvailabilityMigrationSync(), CourseGalleryProps, addUserService(), deleteUserService(), dismissReviewService(), updateUserDataWithLedgerService(), updateUserProfileService(), updateUserRoleService() (+2 more)

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

### Community 73 - "Navbar.tsx"
Cohesion: 0.24
Nodes (7): Logo(), LogoProps, NavbarProps, StudentCabinetShell(), CABINET_TABS, cabinetPathForTab(), parseCabinetTabParam()

### Community 74 - "SkillRadarChart.tsx"
Cohesion: 0.15
Nodes (19): ClientSkillProgressView(), ClientSkillProgressViewProps, APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimensionFilter, SkillRadarChart(), getLevelLabel() (+11 more)

### Community 75 - "settings/index.ts"
Cohesion: 0.33
Nodes (7): getResortWeatherCache(), resortCacheRef, resortConfigRef, ResortWeatherCache, saveResortWeatherCache(), DEFAULT_CONFIG, useResortStats()

### Community 76 - "createGuestCourseEnrollment.ts"
Cohesion: 0.43
Nodes (6): CourseRecord, createGuestCourseEnrollmentHandler(), GuestCourseEnrollmentInput, optionalText(), parseInput(), requireText()

### Community 77 - "courseDates.ts"
Cohesion: 0.33
Nodes (8): getHourSuffix(), STATUS_LABELS, MONTHS_EN, MONTHS_RU, MONTHS_SHORT_EN, MONTHS_SHORT_RU, WEEKDAYS_EN, WEEKDAYS_RU

### Community 78 - "walletCredit.ts"
Cohesion: 0.30
Nodes (13): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_KZT (+5 more)

### Community 79 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 80 - "StudentTodaySection.tsx"
Cohesion: 0.16
Nodes (18): isTimestampOnLocalDate(), ScDivider(), getNextStepAction(), getTodayAchievements(), MiniCalendarDay, NextSessionItem, TodaySessionCountdown, TodayTask (+10 more)

### Community 81 - "achievementConfig.ts"
Cohesion: 0.06
Nodes (65): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, AdminCollapsibleSection(), AdminCollapsibleSectionProps, SystemSettings(), EnrichedCourseBooking, getAchievements() (+57 more)

### Community 83 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 86 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 88 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 93 - "StatusBadge.tsx"
Cohesion: 0.32
Nodes (7): getBookingStatusLabel(), BookingStatus, BadgeVariant, StatusBadge(), StatusBadgeProps, StyleConfig, VARIANT_MAP

### Community 95 - "ResortConditionsSidebar.tsx"
Cohesion: 0.33
Nodes (6): ResortConditionsSidebar(), ResortConditionsSidebarProps, getWeatherConditionKey(), ResortConfig, AnimatedNumber(), AnimatedNumberProps

### Community 96 - "useTheme"
Cohesion: 0.83
Nodes (3): applyThemeToDOM(), getInitialTheme(), useTheme()

### Community 99 - "bookingEndsAt.ts"
Cohesion: 0.42
Nodes (7): BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), parseCourseEndDateTime(), baseLesson

### Community 103 - "bookingService.ts"
Cohesion: 0.16
Nodes (28): createBookingForUser(), toggleRecommendationService(), updateBookingStatusService(), migrateAvailabilitySlots(), blocksInstructorAvailability(), toAvailabilitySlot(), addBookingWithPayment(), assertNoSlotOverlap() (+20 more)

### Community 106 - "UserProfile"
Cohesion: 0.09
Nodes (29): BookingsLogProps, ClientsManagerProps, CoursesManagerProps, LinkGuestBookingModal(), LinkGuestBookingModalProps, ActiveSlotCreateForm(), ActiveSlotCreateFormProps, ActiveSlotDialogProps (+21 more)

### Community 107 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 109 - "instructor.ts"
Cohesion: 0.16
Nodes (12): CoachesManagerProps, CourseInstructorSelection(), CourseInstructorSelectionProps, ScheduleInstructorCell(), getSpecialtyLabel(), AdminPanel(), AdminRoleManager, ClientsManager (+4 more)

### Community 136 - "useLanguage"
Cohesion: 0.12
Nodes (24): saveUsdToKztRate(), BookingsLog(), shortenBookingId(), FinancialOverview(), FinancialOverviewProps, FinancialOverview, CourseEnrollAction(), CourseEnrollmentModal() (+16 more)

## Knowledge Gaps
- **408 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+403 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `courseLevelStyles.ts`, `Booking`, `studentCabinetUtils.ts`, `profile/index.ts`, `useBookingModal.ts`, `toYMD`, `parseCourseDates`, `ResortSliderSection.tsx`, `ModalHost.tsx`, `AppBootstrap.tsx`, `StudentCoachPanel.tsx`, `ErrorLogsPanel.tsx`, `journeyUtils.ts`, `StudentCabinetShell.tsx`, `skillData.ts`, `Course`, `StudentCabinetUI.tsx`, `ClientBookingsList.tsx`, `ScheduleCalendar.tsx`, `formatDurationLabel`, `firebase.ts`, `InstructorBookingCard.tsx`, `notifications/index.ts`, `useInstructorWorkspace`, `src/types.ts`, `BookingCallCoachButton.tsx`, `CourseDetailsModal.tsx`, `StudentCabinetHome.tsx`, `useNotifications`, `StudentProfilePersonalSection.tsx`, `GroupCourseCard.tsx`, `OnboardingModal.tsx`, `BodyScrollLock.tsx`, `HeroCarousel.tsx`, `BookingChatModal.tsx`, `LanguageContext.tsx`, `lib/walletLedger.ts`, `useProfileStore`, `chatSenderRole.ts`, `Navbar.tsx`, `SkillRadarChart.tsx`, `StudentTodaySection.tsx`, `achievementConfig.ts`, `StatusBadge.tsx`, `ResortConditionsSidebar.tsx`, `UserProfile`, `instructor.ts`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `useBookingActions.ts`, `bookingTransactions.test.ts`, `slotOverlap.ts`, `studentCabinetUtils.ts`, `useBookingModal.ts`, `toYMD`, `parseCourseDates`, `AppBootstrap.tsx`, `StudentCoachPanel.tsx`, `useBookingChatUnread.ts`, `callableTestEnv.ts`, `StudentCabinetShell.tsx`, `studentBookingSchedule.ts`, `Course`, `StudentCabinetUI.tsx`, `ClientBookingsList.tsx`, `ScheduleCalendar.tsx`, `InstructorBookingCard.tsx`, `notifications/index.ts`, `bookingsStore.ts`, `src/types.ts`, `BookingCallCoachButton.tsx`, `useCourseActions.ts`, `StudentCabinetHome.tsx`, `firestoreMappers.ts`, `GroupCourseCard.tsx`, `BookingChatModal.tsx`, `lib/walletLedger.ts`, `chatSenderRole.ts`, `StudentTodaySection.tsx`, `achievementConfig.ts`, `adminSelectors.ts`, `bookingEndsAt.ts`, `bookingService.ts`, `UserProfile`, `instructor.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `Booking`, `studentCabinetUtils.ts`, `profile/index.ts`, `useBookingModal.ts`, `useLanguage`, `ModalHost.tsx`, `AppBootstrap.tsx`, `StudentCoachPanel.tsx`, `journeyUtils.ts`, `StudentCabinetShell.tsx`, `Course`, `StudentCabinetUI.tsx`, `todayChecklist.ts`, `ClientBookingsList.tsx`, `ScheduleCalendar.tsx`, `firebase.ts`, `InstructorBookingCard.tsx`, `notifications/index.ts`, `src/types.ts`, `BookingCallCoachButton.tsx`, `CourseDetailsModal.tsx`, `useCourseActions.ts`, `StudentCabinetHome.tsx`, `useNotifications`, `StudentProfilePersonalSection.tsx`, `firestoreMappers.ts`, `GroupCourseCard.tsx`, `BodyScrollLock.tsx`, `BookingChatModal.tsx`, `lib/walletLedger.ts`, `useProfileStore`, `chatSenderRole.ts`, `Navbar.tsx`, `SkillRadarChart.tsx`, `walletCredit.ts`, `StudentTodaySection.tsx`, `achievementConfig.ts`, `adminSelectors.ts`, `profileSelectors.ts`, `bookingService.ts`, `instructor.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _408 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useBookingActions.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14518002322880372 - nodes in this community are weakly interconnected._
- **Should `courseLevelStyles.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08478513356562137 - nodes in this community are weakly interconnected._
- **Should `Booking` be split into smaller, more focused modules?**
  _Cohesion score 0.11174242424242424 - nodes in this community are weakly interconnected._