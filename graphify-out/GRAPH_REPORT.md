# Graph Report - SkiAcademy_DB  (2026-08-17)

## Corpus Check
- 418 files · ~201,969 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2070 nodes · 7185 edges · 133 communities (110 shown, 23 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aba23286`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- bookingService.ts
- bookingTransactions.test.ts
- src/types.ts
- firestoreMappers.ts
- bookingSelectors.ts
- studentCabinetUtils.ts
- YourJourneySection.tsx
- useNotifications
- studentCabinetPresentation.ts
- studentLessonPresentation.ts
- ResortSliderSection.tsx
- useProfileStore
- settingsStore.ts
- StudentCoachPanel.tsx
- ErrorLogsPanel.tsx
- useBookingChatUnread.ts
- callableTestEnv.ts
- journeyUtils.ts
- scripts
- useLanguage
- parseCourseDates
- skillData.ts
- GroupCourseCard.tsx
- StudentHistoryList.tsx
- todayChecklist.ts
- StudentTodaySection.tsx
- StudentProfilePersonalSection.tsx
- ChatMessage
- firestore.rules.test.ts
- ScheduleCalendar.tsx
- pluralize.ts
- compilerOptions
- firebase.ts
- LanguageContext.tsx
- InstructorBookingCard.tsx
- notifications/index.ts
- useInstructorWorkspace.ts
- notificationsStore.ts
- extract-coaches-manager.mjs
- Auth.test.tsx
- global-setup.ts
- bookingLogic.ts
- phase2CabinetHelpers.test.ts
- coachPhone.test.ts
- CourseDetailsModal.tsx
- useCourseActions.ts
- StudentCabinetHome.tsx
- dependencies
- createBooking.ts
- compilerOptions
- course.ts
- ModalHost.tsx
- ErrorBoundary.tsx
- devDependencies
- eslint
- profileStore.ts
- courseTransactions.ts
- OnboardingModal.tsx
- booking.ts
- HeroCarousel.tsx
- BookingChatModal.tsx
- extract-courses-manager.mjs
- profile/index.ts
- src/index.ts
- createBookingWithPayment
- extract-admin-sections.mjs
- lib/walletLedger.ts
- chatService.ts
- README.md
- chatSenderRole.ts
- functions/package.json
- autoComplete.ts
- package.json
- Navbar.tsx
- SkillRadarChart.tsx
- bookings/index.ts
- createGuestCourseEnrollment.ts
- createBookingCallable.ts
- walletCredit.ts
- patch-admin-return.mjs
- TodayChecklist.tsx
- achievementConfig.ts
- uiSelectors.ts
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
- cancelBookingWithRefund
- ResortConditionsSidebar.tsx
- CourseEnrollmentModal.tsx
- @firebase/rules-unit-testing
- bookingEndsAt.ts
- jsdom
- @playwright/test
- prettier
- bookingTransactions.ts
- @testing-library/jest-dom
- @testing-library/react
- Booking
- StudentActivityRings.tsx
- typescript-eslint
- CoachesManager.tsx
- @vitejs/plugin-react
- vitest
- notificationService.ts
- vitest.config.ts
- achievements.test.ts
- eslint-plugin-react-refresh
- AGENTS.md
- tailwindcss
- CurrencyContext.tsx

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 236 edges
2. `Booking` - 171 edges
3. `UserProfile` - 135 edges
4. `Course` - 133 edges
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
- 5-file cycle: `src/features/notifications/NotificationsPanel.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx -> src/features/notifications/NotificationsPanel.tsx`
- 5-file cycle: `src/features/profile/OnboardingFlow.tsx -> src/features/shell/uiStore.ts -> src/hooks/useInstructorFilters.ts -> src/features/shell/index.ts -> src/features/shell/ModalHost.tsx -> src/features/profile/OnboardingFlow.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetPanels.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/bookings/components/BookingChatModal.tsx -> src/features/bookings/components/booking_chat/ChatWindow.tsx -> src/features/profile/index.ts -> src/features/profile/components/InstructorWorkspace.tsx -> src/features/bookings/index.ts -> src/features/bookings/components/BookingChatModal.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetHome.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentCoachPanel.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`
- 5-file cycle: `src/features/profile/components/PersonalCabinet.tsx -> src/features/profile/components/StudentCabinet.tsx -> src/features/profile/components/personal_cabinet/student/StudentCabinetShell.tsx -> src/features/profile/components/personal_cabinet/student/StudentHistoryPanel.tsx -> src/features/profile/index.ts -> src/features/profile/components/PersonalCabinet.tsx`

## Communities (133 total, 23 thin omitted)

### Community 0 - "bookingService.ts"
Cohesion: 0.12
Nodes (40): SystemSettings(), useAdminActions(), addBookingDirect(), addInstructorService(), addReviewService(), cancelBookingService(), completeBookingService(), confirmBookingService() (+32 more)

### Community 1 - "bookingTransactions.test.ts"
Cohesion: 0.18
Nodes (24): CourseEnrollmentError, seedBookings(), seedCourse(), seedCourse(), bookingId, seedLegacyCancelledBooking(), seedProdCourse(), seedProdUser() (+16 more)

### Community 2 - "src/types.ts"
Cohesion: 0.11
Nodes (22): CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps, CourseInstructorSelection(), CourseInstructorSelectionProps, CourseRichDetailsSection(), CourseRichDetailsSectionProps (+14 more)

### Community 3 - "firestoreMappers.ts"
Cohesion: 0.17
Nodes (16): useBookingStore, useBookingsSync(), useCoursesSync(), DomainModel, FirestoreModel, toActivityLog(), toBooking(), toCourse() (+8 more)

### Community 5 - "studentCabinetUtils.ts"
Cohesion: 0.10
Nodes (23): isProfileTab(), PROFILE_TABS, resolveStudentBottomNavTab(), getSwipeNeighborSequence(), Achievement, BookingListScope, formatActivityTimestamp(), getMiniCalendarDays() (+15 more)

### Community 6 - "YourJourneySection.tsx"
Cohesion: 0.14
Nodes (22): AchievementGrid(), EQUAL_MARKER_STOPS, JOURNEY_BG, JOURNEY_LEVELS, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND, SUMMARY_STATS (+14 more)

### Community 7 - "useNotifications"
Cohesion: 0.15
Nodes (25): useAvailabilityMigrationSync(), createGuestBookingService(), getInstructorAvailabilitySlots(), BookingAuthShell(), BookingAuthShellProps, BookingModalHeader(), GuestBookingForm(), GuestBookingFormProps (+17 more)

### Community 8 - "studentCabinetPresentation.ts"
Cohesion: 0.18
Nodes (13): StudentCabinetHome(), getFirstName(), getGreeting(), getLevelName(), isTimestampOnLocalDate(), LEVEL_LABEL_EN, LEVEL_LABEL_RU, LEVEL_NAMES_EN (+5 more)

### Community 9 - "studentLessonPresentation.ts"
Cohesion: 0.23
Nodes (15): BookingSelectors(), LessonDetailsModal(), getHistoryEvents(), getLegacyHistoryEvents(), formatBookingDayMonth(), formatCourseDateRangeLabel(), formatRecentLessonDateLabel(), getCourse() (+7 more)

### Community 10 - "ResortSliderSection.tsx"
Cohesion: 0.20
Nodes (14): ResortDataSection(), ResortSliderSection(), getResortWeatherCache(), resortCacheRef, resortConfigRef, ResortWeatherCache, saveResortConfig(), saveResortWeatherCache() (+6 more)

### Community 11 - "useProfileStore"
Cohesion: 0.22
Nodes (22): AppShell(), FeaturePageShell(), FeaturePageShellProps, AdminRouteContainer(), AppRoutes(), CabinetRouteContainer(), HomeRouteContainer(), InstructorRouteContainer() (+14 more)

### Community 12 - "settingsStore.ts"
Cohesion: 0.13
Nodes (22): useNotificationsSync(), saveAchievementsConfig(), saveDesignTheme(), saveFiltersEnabled(), saveNotificationRetentionDays(), saveOnboardingEnabled(), saveSkillConfig(), useSettingsSync() (+14 more)

### Community 13 - "StudentCoachPanel.tsx"
Cohesion: 0.15
Nodes (27): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+19 more)

### Community 14 - "ErrorLogsPanel.tsx"
Cohesion: 0.27
Nodes (10): deleteErrorLog(), deleteErrorLogs(), subscribeErrorLogs(), ErrorLogsPanel(), ErrorLogsPanelProps, ErrorLogsPanel, ErrorLog, ActionButton() (+2 more)

### Community 15 - "useBookingChatUnread.ts"
Cohesion: 0.25
Nodes (13): getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), getCourseChatThreadIds(), resolveChatId(), buildWatchPlanKey(), collectMessagesForPlan(), hasUnreadMessages() (+5 more)

### Community 16 - "callableTestEnv.ts"
Cohesion: 0.10
Nodes (37): CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser(), getCallableAuth() (+29 more)

### Community 17 - "journeyUtils.ts"
Cohesion: 0.21
Nodes (18): CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, JourneyPath(), buildWavyPath(), createPathSampler(), getFirstUnlockedJourneyLevelId(), getJourneyLevelUpZones(), getJourneyPathProgress(), getLevelUpZoneStartRatio() (+10 more)

### Community 18 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 19 - "useLanguage"
Cohesion: 0.07
Nodes (54): BookingsPanel(), InstructorReviewsModal(), StudentBookNextFab(), StudentBookNextFabProps, StudentCabinetTab, StudentCalendarPanel(), StudentCoursesPanel(), StudentTrainingPanel() (+46 more)

### Community 20 - "parseCourseDates"
Cohesion: 0.20
Nodes (24): BookingTime, buildLocalDateTime(), getCourseSchedule(), isBookingCurrentBySchedule(), isBookingOnDate(), isBookingPastBySchedule(), isBookingUpcomingBySchedule(), parseBookingEndTime() (+16 more)

### Community 21 - "skillData.ts"
Cohesion: 0.15
Nodes (21): SkillConfigManager(), SkillConfigManagerProps, RadarDimension, getSectionProgress(), StudentSkillEvaluationModal(), StudentSkillEvaluationModalProps, calculateStudentLevel(), classifySkillItemToRadarDimension() (+13 more)

### Community 22 - "GroupCourseCard.tsx"
Cohesion: 0.11
Nodes (24): CoursesTable(), CourseTableRow(), CourseHeader(), CourseHeaderProps, formatCourseCardDate(), GroupCourseCard(), adminBadgeClass, cardTextClass (+16 more)

### Community 23 - "StudentHistoryList.tsx"
Cohesion: 0.19
Nodes (12): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS, StudentHistoryList() (+4 more)

### Community 24 - "todayChecklist.ts"
Cohesion: 0.21
Nodes (15): getTodayTasks(), buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate(), buildRemoveTodayTaskUpdate(), buildToggleSkillTodayUpdate(), buildToggleTodayCompleteUpdate(), createCustomTodayTaskId(), customTodayTaskId() (+7 more)

### Community 25 - "StudentTodaySection.tsx"
Cohesion: 0.13
Nodes (33): ClientBookingsList(), LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, RecommendationIndicator(), RecommendationIndicatorProps, HistoryLessonCard(), ScDivider(), ScTextButton() (+25 more)

### Community 26 - "StudentProfilePersonalSection.tsx"
Cohesion: 0.09
Nodes (22): CoachesManager(), CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary (+14 more)

### Community 27 - "ChatMessage"
Cohesion: 0.43
Nodes (4): buildHomeworkForUserIds(), isHomeworkVisibleToStudent(), ChatMessage, GROUP_UIDS

### Community 28 - "firestore.rules.test.ts"
Cohesion: 0.26
Nodes (8): addHourLocksToBatch(), buildCourseEnrollmentBooking(), buildProdCourseSeed(), PROD_COURSE_ID, PROD_USER_ID, prodBookingId(), prodInstructorId(), RulesBookingSeed

### Community 29 - "ScheduleCalendar.tsx"
Cohesion: 0.14
Nodes (21): ActiveSlotCreateForm(), ActiveSlotDetails(), ActiveSlotMoveForm(), ScheduleCalendar(), getAvailableMoveTimeSlots(), getAvailableScheduleDurations(), hasScheduleOverlap(), SCHEDULE_CLOSING_TIME_MINUTES (+13 more)

### Community 30 - "pluralize.ts"
Cohesion: 0.31
Nodes (8): NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatPointsCount(), formatPointsGain(), pointsWord(), russianPlural()

### Community 31 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 32 - "firebase.ts"
Cohesion: 0.14
Nodes (23): getUserProfileService(), migrateExistingProfileService(), requestPasswordResetService(), saveUserProfileService(), signInWithEmailService(), signInWithGoogleService(), signOutService(), signUpWithEmailService() (+15 more)

### Community 33 - "LanguageContext.tsx"
Cohesion: 0.14
Nodes (21): CoursesManagerToolbar(), CoursesManagerToolbarProps, ScheduleInstructorCellProps, ScheduleToolbarProps, LocalizedCompressionError, BookingModalHeaderProps, BookingOverlapWarningsProps, BookingSelectorsProps (+13 more)

### Community 34 - "InstructorBookingCard.tsx"
Cohesion: 0.13
Nodes (18): ChatUnreadIndicator(), ChatUnreadIndicatorProps, InstructorBookingCard(), InstructorBookingCardProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, StudentAssessButton(), StudentAssessButtonProps (+10 more)

### Community 35 - "notifications/index.ts"
Cohesion: 0.22
Nodes (8): App(), Notification, NotificationContext, NotificationContextType, NotificationHubModal(), NotificationProvider(), StateCard(), StateCardProps

### Community 36 - "useInstructorWorkspace.ts"
Cohesion: 0.15
Nodes (19): ActiveSlotCreateFormProps, saveBookingRecommendationsService(), updateBookingStatusService(), InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews() (+11 more)

### Community 37 - "notificationsStore.ts"
Cohesion: 0.26
Nodes (6): useDbNotifications(), useUnreadNotificationCount(), useNotificationsStore, NotificationsState, DbNotification, StoredNotificationFields

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

### Community 42 - "phase2CabinetHelpers.test.ts"
Cohesion: 0.21
Nodes (11): BookInstructorPickerModal(), StudentInstructorsPanel(), getInstructorPickerGroups(), getInstructorsForStudent(), getMyInstructors(), getRecommendedCourses(), getRecommendedInstructors(), resolveNextLessonBookingTarget() (+3 more)

### Community 43 - "coachPhone.test.ts"
Cohesion: 0.38
Nodes (5): BookingCallCoachButton(), normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 44 - "CourseDetailsModal.tsx"
Cohesion: 0.23
Nodes (11): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseFAQ(), CourseFAQProps, CourseGallery() (+3 more)

### Community 45 - "useCourseActions.ts"
Cohesion: 0.15
Nodes (16): getCurrentAuthenticatedUser(), addCourseService(), deleteCourseService(), enrollInCourseService(), notifyCourseModifiedService(), updateCourseService(), buildClonedCourse(), stripUndefinedFields() (+8 more)

### Community 46 - "StudentCabinetHome.tsx"
Cohesion: 0.15
Nodes (29): AchievementsManagerProps, SystemSettingsProps, InstructorReviewsModalProps, SkillRadarChartProps, StudentCabinetContext, StudentCabinetHomeProps, StudentCabinetShellProps, ScTintCard() (+21 more)

### Community 47 - "dependencies"
Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 48 - "createBooking.ts"
Cohesion: 0.17
Nodes (14): BookingSlotOverlapError, BookingStatus, InsufficientFundsError, LessonDifficulty, CreateBookingInput, CreateBookingResult, createCreateBookingHandler(), handleCreateBooking() (+6 more)

### Community 49 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 50 - "course.ts"
Cohesion: 0.12
Nodes (16): AdminCollapsibleSection(), AdminCollapsibleSectionProps, AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), AdminRoleManager, ClientsManager, SystemSettings (+8 more)

### Community 51 - "ModalHost.tsx"
Cohesion: 0.14
Nodes (12): sortVisibleCourses(), GroupCoursesSection(), LessonFilters(), LessonFiltersProps, CoursesState, useCourseStore, OnboardingFlow(), OnboardingFlowProps (+4 more)

### Community 52 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (8): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, logErrorBoundaryFailure(), isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 53 - "devDependencies"
Cohesion: 0.06
Nodes (31): eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-prettier, eslint-plugin-react, firebase-tools, globals, devDependencies (+23 more)

### Community 55 - "profileStore.ts"
Cohesion: 0.10
Nodes (31): AppBootstrap(), AppBootstrapProps, AuthState, useAuthStore, useSessionSync(), CourseGalleryProps, addUserService(), deleteUserService() (+23 more)

### Community 56 - "courseTransactions.ts"
Cohesion: 0.23
Nodes (17): enrollInCourse(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), STATUS_LABELS, getGroupScheduleLabel(), MONTHS_EN, MONTHS_RU, MONTHS_SHORT_EN (+9 more)

### Community 57 - "OnboardingModal.tsx"
Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 58 - "booking.ts"
Cohesion: 0.08
Nodes (27): AuthModal(), AuthModalProps, ChatWindow(), ChatWindowProps, ConfirmActionModal(), ConfirmActionModalProps, LessonRecommendationsList(), LessonRecommendationsListProps (+19 more)

### Community 59 - "HeroCarousel.tsx"
Cohesion: 0.20
Nodes (12): buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps, resolveSlideBackground(), shuffleSlides(), AdminPanel, FALLBACK_SLIDES (+4 more)

### Community 60 - "BookingChatModal.tsx"
Cohesion: 0.16
Nodes (16): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageRow (+8 more)

### Community 61 - "extract-courses-manager.mjs"
Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 62 - "profile/index.ts"
Cohesion: 0.19
Nodes (9): PersonalCabinet, InstructorWorkspace, InstructorCard, InstructorReviewsModal, LazyLoad(), LazyLoadProps, CardSkeleton(), Skeleton() (+1 more)

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
Cohesion: 0.08
Nodes (34): BookingsLog(), shortenBookingId(), LinkGuestBookingModal(), BookingsLog, PaymentGatewayProps, formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt() (+26 more)

### Community 67 - "chatService.ts"
Cohesion: 0.44
Nodes (6): createChatMessage(), messagesPath(), setChatMessageHomework(), subscribeToChatMessages(), InstructorMessage, useInstructorBookingMessages()

### Community 68 - "README.md"
Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 69 - "chatSenderRole.ts"
Cohesion: 0.17
Nodes (15): ChatMessageList(), ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName(), resolveChatSenderRole() (+7 more)

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
Cohesion: 0.16
Nodes (16): Logo(), LogoProps, Navbar(), NavbarProps, StudentCabinetShell(), AdminRoute(), AuthRoute(), InstructorRoute() (+8 more)

### Community 74 - "SkillRadarChart.tsx"
Cohesion: 0.16
Nodes (18): ClientSkillProgressView(), ClientSkillProgressViewProps, APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimensionFilter, SkillRadarChart(), getLevelLabel() (+10 more)

### Community 75 - "bookings/index.ts"
Cohesion: 0.32
Nodes (5): AuthModeSliderSwitch(), AuthModeSliderSwitchProps, PaymentGateway(), BookingChatModal, BookingModal

### Community 76 - "createGuestCourseEnrollment.ts"
Cohesion: 0.43
Nodes (6): CourseRecord, createGuestCourseEnrollmentHandler(), GuestCourseEnrollmentInput, optionalText(), parseInput(), requireText()

### Community 77 - "createBookingCallable.ts"
Cohesion: 0.36
Nodes (7): BookingPaymentResult, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable(), mapCallableError(), toCallableInput()

### Community 78 - "walletCredit.ts"
Cohesion: 0.30
Nodes (13): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), grantAndApplyWalletCredit(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_KZT (+5 more)

### Community 79 - "patch-admin-return.mjs"
Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 80 - "TodayChecklist.tsx"
Cohesion: 0.39
Nodes (7): TodayTask, TodayTaskBookingContext, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), TodayTaskRef

### Community 81 - "achievementConfig.ts"
Cohesion: 0.09
Nodes (47): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, getAchievements(), AchievementDefinition, AchievementRule, AchievementRuleType, applySkillDeltas() (+39 more)

### Community 82 - "uiSelectors.ts"
Cohesion: 0.19
Nodes (3): UiState, InstructorSortBy, InstructorSpecialty

### Community 83 - "adminFirestore.test.ts"
Cohesion: 0.40
Nodes (4): ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp

### Community 86 - "declarations.d.ts"
Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 88 - "firestoreRulesGuard.test.ts"
Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 93 - "cancelBookingWithRefund"
Cohesion: 0.39
Nodes (5): cancelBookingWithRefund(), finalizeBookingCompletion(), isActiveCourseEnrollment(), releaseCourseSeatInTransaction(), resolveCourseIdFromBooking()

### Community 95 - "ResortConditionsSidebar.tsx"
Cohesion: 0.33
Nodes (6): ResortConditionsSidebar(), ResortConditionsSidebarProps, getWeatherConditionKey(), ResortConfig, AnimatedNumber(), AnimatedNumberProps

### Community 96 - "CourseEnrollmentModal.tsx"
Cohesion: 0.43
Nodes (5): CourseEnrollmentModal(), createGuestCourseEnrollment, createGuestCourseEnrollmentViaCallable(), GuestCourseEnrollmentInput, GuestCourseEnrollmentResult

### Community 99 - "bookingEndsAt.ts"
Cohesion: 0.42
Nodes (7): BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), parseCourseEndDateTime(), baseLesson

### Community 103 - "bookingTransactions.ts"
Cohesion: 0.23
Nodes (18): addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, createBookingWithPayment(), createGuestBooking(), loadInstructorSlotRefs(), rescheduleBooking(), resolveBookingTotalPrice() (+10 more)

### Community 106 - "Booking"
Cohesion: 0.10
Nodes (50): BookingsLogProps, ClientsManagerProps, CoachesManagerProps, CoursesTableProps, CourseTableRowProps, CoursesManagerProps, LinkGuestBookingModalProps, ActiveSlotDetailsProps (+42 more)

### Community 107 - "StudentActivityRings.tsx"
Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 109 - "CoachesManager.tsx"
Cohesion: 0.21
Nodes (11): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, ScheduleInstructorCell(), formatDateLocalYMD(), getSpecialtyLabel(), CourseDateRangeState (+3 more)

### Community 112 - "notificationService.ts"
Cohesion: 0.80
Nodes (4): clearNotificationsService(), deleteNotificationService(), markNotificationsAsReadService(), useNotificationActions()

### Community 136 - "CurrencyContext.tsx"
Cohesion: 0.16
Nodes (14): saveUsdToKztRate(), FinancialOverview(), FinancialOverviewProps, FinancialOverview, AuthBookingForm(), AuthBookingFormProps, BookingOverlapWarnings(), CourseEnrollAction() (+6 more)

## Knowledge Gaps
- **408 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+403 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `bookingService.ts`, `src/types.ts`, `YourJourneySection.tsx`, `useNotifications`, `CurrencyContext.tsx`, `studentLessonPresentation.ts`, `ResortSliderSection.tsx`, `useProfileStore`, `studentCabinetPresentation.ts`, `StudentCoachPanel.tsx`, `ErrorLogsPanel.tsx`, `journeyUtils.ts`, `skillData.ts`, `GroupCourseCard.tsx`, `StudentHistoryList.tsx`, `StudentTodaySection.tsx`, `StudentProfilePersonalSection.tsx`, `ScheduleCalendar.tsx`, `pluralize.ts`, `firebase.ts`, `LanguageContext.tsx`, `InstructorBookingCard.tsx`, `notifications/index.ts`, `useInstructorWorkspace.ts`, `phase2CabinetHelpers.test.ts`, `coachPhone.test.ts`, `CourseDetailsModal.tsx`, `StudentCabinetHome.tsx`, `course.ts`, `ModalHost.tsx`, `profileStore.ts`, `OnboardingModal.tsx`, `booking.ts`, `HeroCarousel.tsx`, `BookingChatModal.tsx`, `profile/index.ts`, `lib/walletLedger.ts`, `chatSenderRole.ts`, `Navbar.tsx`, `SkillRadarChart.tsx`, `bookings/index.ts`, `TodayChecklist.tsx`, `achievementConfig.ts`, `ResortConditionsSidebar.tsx`, `CourseEnrollmentModal.tsx`, `Booking`, `CoachesManager.tsx`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `bookingService.ts`, `bookingTransactions.test.ts`, `src/types.ts`, `firestoreMappers.ts`, `bookingSelectors.ts`, `studentCabinetUtils.ts`, `useNotifications`, `studentLessonPresentation.ts`, `StudentCoachPanel.tsx`, `useBookingChatUnread.ts`, `callableTestEnv.ts`, `useLanguage`, `parseCourseDates`, `GroupCourseCard.tsx`, `StudentHistoryList.tsx`, `StudentTodaySection.tsx`, `ScheduleCalendar.tsx`, `InstructorBookingCard.tsx`, `notifications/index.ts`, `useInstructorWorkspace.ts`, `phase2CabinetHelpers.test.ts`, `coachPhone.test.ts`, `useCourseActions.ts`, `StudentCabinetHome.tsx`, `course.ts`, `profileStore.ts`, `courseTransactions.ts`, `booking.ts`, `BookingChatModal.tsx`, `lib/walletLedger.ts`, `chatSenderRole.ts`, `createBookingCallable.ts`, `TodayChecklist.tsx`, `achievementConfig.ts`, `adminSelectors.ts`, `cancelBookingWithRefund`, `bookingEndsAt.ts`, `bookingTransactions.ts`, `CoachesManager.tsx`, `achievements.test.ts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `Course` connect `Booking` to `bookingService.ts`, `src/types.ts`, `firestoreMappers.ts`, `studentCabinetUtils.ts`, `useNotifications`, `studentLessonPresentation.ts`, `StudentCoachPanel.tsx`, `useLanguage`, `parseCourseDates`, `GroupCourseCard.tsx`, `StudentHistoryList.tsx`, `StudentTodaySection.tsx`, `ScheduleCalendar.tsx`, `LanguageContext.tsx`, `useInstructorWorkspace.ts`, `phase2CabinetHelpers.test.ts`, `coachPhone.test.ts`, `CourseDetailsModal.tsx`, `useCourseActions.ts`, `StudentCabinetHome.tsx`, `course.ts`, `ModalHost.tsx`, `courseTransactions.ts`, `booking.ts`, `BookingChatModal.tsx`, `lib/walletLedger.ts`, `chatSenderRole.ts`, `achievementConfig.ts`, `uiSelectors.ts`, `adminSelectors.ts`, `CourseEnrollmentModal.tsx`, `bookingTransactions.ts`, `achievements.test.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _408 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bookingService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12470588235294118 - nodes in this community are weakly interconnected._
- **Should `src/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11260504201680673 - nodes in this community are weakly interconnected._
- **Should `studentCabinetUtils.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._