# Graph Report - SkiAcademy_DB (2026-08-13)

## Corpus Check

- 323 files · ~192,848 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 1762 nodes · 5729 edges · 112 communities (82 shown, 30 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `d70e7c8f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- useCourseForm.ts
- bookingLogic.ts
- skillData.ts
- studentCabinetUtils.ts
- ErrorBoundary.tsx
- UserProfile
- StudentCabinetHome.tsx
- StudentTodaySection.tsx
- useStoreSync.ts
- PushNotificationHub.tsx
- bookingTransactions.test.ts
- firebase.ts
- achievementConfig.ts
- bookingScheduleScope.test.ts
- StudentCabinetShell.tsx
- StudentCoachPanel.tsx
- ScheduleCalendar.tsx
- CoursesManager.tsx
- clearStudentBookings.ts
- StudentProfilePersonalSection.tsx
- useLanguage
- useNotifications
- scripts
- SkillConfig
- ClientBookingsList.tsx
- bookingTransactions.ts
- AdminPanel.tsx
- App.tsx
- GroupCourseCard.tsx
- Booking
- compilerOptions
- BookingChatModal.tsx
- authStore.ts
- lib/walletLedger.ts
- HeroCarousel.tsx
- useInstructorWorkspace.ts
- extract-coaches-manager.mjs
- InstructorWorkspace.tsx
- TranslationKey
- global-setup.ts
- dependencies
- functions/package.json
- compilerOptions
- CourseDetailsModal.tsx
- BookingAuthShell.tsx
- BodyScrollLock.tsx
- PersonalCabinet.tsx
- README.md
- StudentHistoryList.tsx
- extract-courses-manager.mjs
- courseTransactions.ts
- LanguageContext.tsx
- extract-admin-sections.mjs
- StudentHomeBottomSections.tsx
- SystemSettings.tsx
- bookingStore.ts
- devDependencies
- package.json
- bookingEndsAt.ts
- Auth.test.tsx
- formatDurationLabel
- BookingsLog.tsx
- activityLogHistory.test.ts
- src/types.ts
- patch-admin-return.mjs
- StudentActivityRings.tsx
- declarations.d.ts
- firestoreRulesGuard.test.ts
- check-translations.mjs
- localize-admin-remaining.mjs
- localize-courses-manager.mjs
- rebuild-admin-panel.mjs
- slotOverlap.ts
- OnboardingModal.tsx
- @eslint/js
- eslint-plugin-prettier
- achievements.test.ts
- eslint-plugin-react-hooks
- eslint-plugin-react-refresh
- @firebase/rules-unit-testing
- firebase-tools
- globals
- jsdom
- @playwright/test
- prettier
- @testing-library/jest-dom
- @testing-library/react
- @testing-library/user-event
- @types/react
- @types/react-dom
- typescript
- typescript-eslint
- vite
- @vitejs/plugin-react
- vitest
- @vitest/coverage-v8
- vitest.config.ts
- StudentCabinetPanels.tsx
- eslint-config-prettier
- TodayChecklist.tsx
- Instructor
- eslint-plugin-jsx-a11y
- formatBookingDayMonth
- eslint

## God Nodes (most connected - your core abstractions)

1. `useLanguage()` - 220 edges
2. `Booking` - 151 edges
3. `UserProfile` - 129 edges
4. `Course` - 117 edges
5. `Instructor` - 85 edges
6. `TranslationKey` - 49 edges
7. `useNotifications()` - 42 edges
8. `Language` - 38 edges
9. `logger` - 38 edges
10. `SkillConfig` - 38 edges

## Surprising Connections (you probably didn't know these)

- `getTodaySessionCountdown()` --indirect_call--> `booking()` [INFERRED]
  src/components/personal_cabinet/student/studentCabinetUtils.ts → tests/unit/todayRecommendations.test.ts
- `findTwentyHoursTimestamp()` --indirect_call--> `booking()` [INFERRED]
  src/lib/achievementConfig.ts → tests/unit/todayRecommendations.test.ts
- `migrateAvailabilitySlots()` --indirect_call--> `booking()` [INFERRED]
  src/lib/availabilityMigration.ts → tests/unit/todayRecommendations.test.ts
- `backfillCompletedBookingActivityLogs()` --indirect_call--> `booking()` [INFERRED]
  src/lib/backfillActivityLog.ts → tests/unit/todayRecommendations.test.ts
- `buildSyntheticWalletOperations()` --indirect_call--> `booking()` [INFERRED]
  src/lib/walletLedger.ts → tests/unit/todayRecommendations.test.ts

## Import Cycles

- None detected.

## Communities (112 total, 30 thin omitted)

### Community 0 - "useCourseForm.ts"

Cohesion: 0.10
Nodes (27): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+19 more)

### Community 1 - "bookingLogic.ts"

Cohesion: 0.06
Nodes (55): getAdminFirestore(), getOrInitApp(), ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp, autoCompletePastBookings(), BookingRecord (+47 more)

### Community 2 - "skillData.ts"

Cohesion: 0.06
Nodes (72): ClientSkillProgressView(), ClientSkillProgressViewProps, APPLE, DIMENSION_CONFIGS, RadarDimension, RadarDimensionFilter, getSkillItemRingCategory(), matchesSkillRingFilter() (+64 more)

### Community 3 - "studentCabinetUtils.ts"

Cohesion: 0.07
Nodes (28): Achievement, getLessonAgeDays(), getNextCalendarSession(), getNextSession(), getSectionProgress(), getTodayTasks(), HistoryEventCta, HistoryMonthGroup (+20 more)

### Community 4 - "ErrorBoundary.tsx"

Cohesion: 0.20
Nodes (8): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 5 - "UserProfile"

Cohesion: 0.12
Nodes (16): LinkGuestBookingModalProps, ActiveSlotDialogProps, AdminRoute(), AdminRouteProps, AuthProps, AuthRoute(), AuthRouteProps, BookingChatModalProps (+8 more)

### Community 6 - "StudentCabinetHome.tsx"

Cohesion: 0.29
Nodes (15): StudentCabinetHome(), StudentCabinetHomeProps, getActiveCourseEnrollment(), getCurrentSessions(), getFirstName(), getGreeting(), getMiniCalendarDays(), getNextSessionsNext7Days() (+7 more)

### Community 7 - "StudentTodaySection.tsx"

Cohesion: 0.15
Nodes (31): ChatWindow(), ChatWindowProps, LessonDetailsModal(), LessonRecommendationsList(), LessonRecommendationsListProps, RecommendationIndicator(), RecommendationIndicatorProps, HistoryLessonCard() (+23 more)

### Community 8 - "useStoreSync.ts"

Cohesion: 0.23
Nodes (12): DEFAULT_ACHIEVEMENTS_CONFIG, normalizeAchievementsConfig(), syncAchievementActivityLogs(), parseDesignTheme(), getNotificationTimestampMs(), isNotificationExpired(), purgeExpiredNotificationsForUser(), getNotificationRetentionMs() (+4 more)

### Community 9 - "PushNotificationHub.tsx"

Cohesion: 0.23
Nodes (12): Notification, NotificationContext, NotificationContextType, NotificationHubModal(), useCourses(), useNotifications(), BilingualNotificationContent, buildNotification() (+4 more)

### Community 10 - "bookingTransactions.test.ts"

Cohesion: 0.06
Nodes (65): CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser(), getCallableAuth() (+57 more)

### Community 11 - "firebase.ts"

Cohesion: 0.10
Nodes (27): ErrorLogsPanel(), ErrorLogsPanelProps, FinancialOverviewProps, Auth(), PRESET_SEEDS, DEFAULT_CONFIG, Currency, CurrencyContext (+19 more)

### Community 12 - "achievementConfig.ts"

Cohesion: 0.11
Nodes (31): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, AchievementDefinition, AchievementRule, AchievementRuleType, bookingTimestamp(), countExercisesMastered() (+23 more)

### Community 13 - "bookingScheduleScope.test.ts"

Cohesion: 0.22
Nodes (13): addMinutesToTime(), buildLocalDateTime(), filterBookingsByScope(), formatCountdownRemaining(), getBookingDailyTimeWindow(), isBookingCurrentBySchedule(), isBookingPastBySchedule(), isBookingUpcomingBySchedule() (+5 more)

### Community 14 - "StudentCabinetShell.tsx"

Cohesion: 0.09
Nodes (29): StudentBookNextFab(), StudentBookNextFabProps, StudentCalendarPanel(), StudentTrainingPanel(), getSwipeNeighborSequence(), StudentCabinetShell(), SC_TINT_CARD, SC_TINT_VALUE (+21 more)

### Community 15 - "StudentCoachPanel.tsx"

Cohesion: 0.11
Nodes (35): InstructorCard, InstructorCardProps, BookingCallCoachButton(), findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate() (+27 more)

### Community 16 - "ScheduleCalendar.tsx"

Cohesion: 0.23
Nodes (15): ScheduleCalendar(), getAvailableMoveTimeSlots(), getAvailableScheduleDurations(), hasScheduleOverlap(), SCHEDULE_CLOSING_TIME_MINUTES, SCHEDULE_DURATIONS, SCHEDULE_TIME_SLOTS, ActiveSlotDialog() (+7 more)

### Community 17 - "CoursesManager.tsx"

Cohesion: 0.19
Nodes (10): CoursesTable(), CoursesTableProps, CourseTableRow(), CourseTableRowProps, CoursesManager(), CoursesManagerProps, getCourseLevelBadgeClass(), mockAddNotification (+2 more)

### Community 18 - "clearStudentBookings.ts"

Cohesion: 0.33
Nodes (9): clearCancelledBookings(), ClearCancelledBookingsResult, clearStudentBookings(), ClearStudentBookingsResult, commitBatchDeletes(), deleteBookingMessages(), isStudentBooking(), resetCourseSeats() (+1 more)

### Community 19 - "StudentProfilePersonalSection.tsx"

Cohesion: 0.15
Nodes (13): CoachesManager(), CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), CoachesManager, optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps (+5 more)

### Community 20 - "useLanguage"

Cohesion: 0.14
Nodes (21): CourseGallery(), CourseGalleryProps, buildStudentHistory(), getSeasonBookings(), getStudentStats(), StudentHistoryPanel(), PROFILE_HUB_ITEMS, ProfileHubTab (+13 more)

### Community 21 - "useNotifications"

Cohesion: 0.23
Nodes (19): useBookingModal(), BookingModal(), useRescheduleBooking(), PersonalCabinet(), useNotifications(), useAvailabilityMigration(), migrateAvailabilitySlots(), AVAILABILITY_MIGRATION_SETTING (+11 more)

### Community 22 - "scripts"

Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 23 - "SkillConfig"

Cohesion: 0.15
Nodes (24): AchievementsManagerProps, SystemSettingsProps, AdminPanelProps, InstructorWorkspaceInput, InstructorWorkspaceProps, SkillRadarChartProps, StudentCabinetContext, PanelProps (+16 more)

### Community 24 - "ClientBookingsList.tsx"

Cohesion: 0.12
Nodes (22): ChatUnreadIndicator(), ChatUnreadIndicatorProps, LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, BookingListScope, UpcomingSessionsStrip(), BadgeVariant, StatusBadge() (+14 more)

### Community 25 - "bookingTransactions.ts"

Cohesion: 0.17
Nodes (26): addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, BookingSlotOverlapError, cancelBookingWithRefund(), createBookingWithPayment(), createGuestBooking(), loadInstructorSlotRefs() (+18 more)

### Community 26 - "AdminPanel.tsx"

Cohesion: 0.12
Nodes (17): AdminCollapsibleSection(), AdminCollapsibleSectionProps, AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), AdminPanel(), AdminRoleManager, ClientsManager (+9 more)

### Community 27 - "App.tsx"

Cohesion: 0.13
Nodes (31): AppContent(), CourseEnrollmentModal, AdminRouteWrapper(), AppRoutes(), AppRoutesProps, CabinetRouteWrapper(), HomeRoute(), InstructorRouteWrapper() (+23 more)

### Community 28 - "GroupCourseCard.tsx"

Cohesion: 0.09
Nodes (28): CourseHeader(), CourseHeaderProps, formatCourseCardDate(), GroupCourseCard(), sortVisibleCourses(), GroupCoursesSection(), InstructorRoute(), InstructorRouteProps (+20 more)

### Community 29 - "Booking"

Cohesion: 0.14
Nodes (23): CoachesManagerProps, ScheduleCalendarProps, AvailableDurationsOptions, AvailableMoveTimesOptions, ScheduleOverlapOptions, GroupCoursesSectionProps, LessonDetailsModalProps, PersonalCabinetModalsProps (+15 more)

### Community 30 - "compilerOptions"

Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 31 - "BookingChatModal.tsx"

Cohesion: 0.07
Nodes (46): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatMessageList() (+38 more)

### Community 32 - "authStore.ts"

Cohesion: 0.19
Nodes (18): buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate(), buildRemoveTodayTaskUpdate(), buildToggleSkillTodayUpdate(), buildToggleTodayCompleteUpdate(), createCustomTodayTaskId(), getNewlyPinnedSkillTitles(), resolveCompletedTodayTaskIds() (+10 more)

### Community 33 - "lib/walletLedger.ts"

Cohesion: 0.18
Nodes (17): StudentWalletHistoryList(), isCourseBooking(), buildSyntheticWalletOperations(), buildWalletOperationHistory(), enrichWalletOperationWithBooking(), formatWalletOperationLabel(), formatWalletSessionDate(), formatWalletSessionDuration() (+9 more)

### Community 34 - "HeroCarousel.tsx"

Cohesion: 0.23
Nodes (12): FALLBACK_SLIDES, buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps, resolveSlideBackground(), shuffleSlides(), applyThemeToDOM() (+4 more)

### Community 35 - "useInstructorWorkspace.ts"

Cohesion: 0.18
Nodes (17): InstructorBookingCard(), InstructorBookingCardProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, StudentAssessButton(), StudentAssessButtonProps, CourseClient, DisplayBooking (+9 more)

### Community 36 - "extract-coaches-manager.mjs"

Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "InstructorWorkspace.tsx"

Cohesion: 0.19
Nodes (13): InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorNotLinked(), InstructorNotLinkedProps, InstructorReviews(), InstructorReviewsProps (+5 more)

### Community 38 - "TranslationKey"

Cohesion: 0.14
Nodes (17): CoursesManagerToolbar(), CoursesManagerToolbarProps, ScheduleInstructorCellProps, ScheduleToolbar(), ScheduleToolbarProps, ScheduleViewMode, LocalizedCompressionError, BookingOverlapWarningsProps (+9 more)

### Community 39 - "global-setup.ts"

Cohesion: 0.15
Nodes (15): fillBookingSelectors(), loadRuntimeConfig(), openGuestBookingModal(), runtimeConfigPath, signInStudent(), AUTH_EMULATOR_HOST, createAuthUser(), E2E_INSTRUCTOR_ID (+7 more)

### Community 40 - "dependencies"

Cohesion: 0.12
Nodes (17): canvas-confetti, firebase, lucide-react, motion, dependencies, canvas-confetti, firebase, lucide-react (+9 more)

### Community 41 - "functions/package.json"

Cohesion: 0.12
Nodes (16): firebase-admin, firebase-functions, dependencies, firebase-admin, firebase-functions, devDependencies, typescript, engines (+8 more)

### Community 42 - "compilerOptions"

Cohesion: 0.12
Nodes (16): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, rootDir (+8 more)

### Community 43 - "CourseDetailsModal.tsx"

Cohesion: 0.17
Nodes (14): CourseDetailsModal, CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseEnrollAction(), CourseEnrollActionProps (+6 more)

### Community 44 - "BookingAuthShell.tsx"

Cohesion: 0.24
Nodes (7): AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, BookingSelectors(), GuestBookingForm(), GuestBookingFormProps

### Community 45 - "BodyScrollLock.tsx"

Cohesion: 0.10
Nodes (19): PaymentGateway, AuthModal(), AuthModalProps, PaymentGateway(), PaymentGatewayProps, ConfirmActionModal(), ConfirmActionModalProps, LevelUpModal() (+11 more)

### Community 46 - "PersonalCabinet.tsx"

Cohesion: 0.31
Nodes (6): PersonalCabinet, LazyLoad(), LazyLoadProps, PersonalCabinetModals(), ReviewModal(), ReviewModalProps

### Community 47 - "README.md"

Cohesion: 0.13
Nodes (14): CI, Безопасность кошелька, Быстрый старт, Демо-аккаунты, Для администраторов, Для инструкторов, Для клиентов, Ключевые возможности (+6 more)

### Community 48 - "StudentHistoryList.tsx"

Cohesion: 0.27
Nodes (10): filterHistoryEvents(), getHistoryEventPrefix, groupHistoryByMonth(), HistoryEvent, HistoryEventAction, HistoryFilter, FILTER_LABEL_KEYS, HISTORY_FILTERS (+2 more)

### Community 49 - "extract-courses-manager.mjs"

Cohesion: 0.17
Nodes (11): adminLines, clientsEnd, handlers, helpers, indentedBody, indentedJsx, insertAt, jsx (+3 more)

### Community 50 - "courseTransactions.ts"

Cohesion: 0.27
Nodes (12): CourseEnrollmentModal(), ClientBookingsList(), CourseEnrollmentError, enrollInCourse(), resolveCourseIdFromBooking(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), translateCourse() (+4 more)

### Community 51 - "LanguageContext.tsx"

Cohesion: 0.24
Nodes (10): LessonFilters(), LessonFiltersProps, isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageContext, LanguageProvider() (+2 more)

### Community 52 - "extract-admin-sections.mjs"

Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 53 - "StudentHomeBottomSections.tsx"

Cohesion: 0.21
Nodes (12): AnimatedNumber(), AnimatedNumberProps, ResortData, ScTintCard(), StudentCabinetWeatherSection(), StudentCabinetWeatherSectionProps, StudentLatestRecommendationSection(), ResortConditionsSidebar() (+4 more)

### Community 54 - "SystemSettings.tsx"

Cohesion: 0.11
Nodes (18): ResortDataSection(), ResortSliderSection(), SystemSettings, AppInitSkeleton(), CardSkeleton(), FormSkeleton(), ModalSkeleton(), SkeletonProps (+10 more)

### Community 55 - "bookingStore.ts"

Cohesion: 0.11
Nodes (23): SystemSettings(), ACTIVITY_LOGS_COLLECTION, activityLogId, buildBookingCompletedMetadata(), logActivityForUser(), backfillCompletedBookingActivityLogs(), BookingPaymentResult, InsufficientFundsError (+15 more)

### Community 56 - "devDependencies"

Cohesion: 0.22
Nodes (9): eslint-plugin-react, devDependencies, eslint-plugin-react, tailwindcss, @tailwindcss/vite, @types/canvas-confetti, tailwindcss, @tailwindcss/vite (+1 more)

### Community 57 - "package.json"

Cohesion: 0.22
Nodes (8): engines, node, name, overrides, universal-analytics, private, type, version

### Community 58 - "bookingEndsAt.ts"

Cohesion: 0.42
Nodes (7): BookingSchedule, computeBookingEndsAt(), computeBookingEndsAtIso(), isBookingEligibleForAutoComplete(), withBookingEndsAt(), parseCourseEndDateTime(), baseLesson

### Community 59 - "Auth.test.tsx"

Cohesion: 0.22
Nodes (8): mockAddNotification, mockCreateUserWithEmailAndPassword, mockGetDoc, mockMigratePreExistingProfile, mockSendPasswordResetEmail, mockSetDoc, mockSignInWithEmailAndPassword, mockSignInWithPopup

### Community 60 - "formatDurationLabel"

Cohesion: 0.30
Nodes (9): NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain(), pointsWord() (+1 more)

### Community 61 - "BookingsLog.tsx"

Cohesion: 0.21
Nodes (13): BookingsLog(), shortenBookingId(), FinancialOverview(), LinkGuestBookingModal(), BookingsLog, AuthBookingForm(), AuthBookingFormProps, BookingOverlapWarnings() (+5 more)

### Community 62 - "activityLogHistory.test.ts"

Cohesion: 0.40
Nodes (3): bookings, courses, userProfile

### Community 63 - "src/types.ts"

Cohesion: 0.10
Nodes (13): isHomeworkVisibleToStudent(), ActivityLogType, ChatMessage, ErrorLog, SkillDeltaMeta, GROUP_UIDS, instructor, instructors (+5 more)

### Community 64 - "patch-admin-return.mjs"

Cohesion: 0.33
Nodes (5): coursesStart, instructorsSection, lines, newLines, start

### Community 65 - "StudentActivityRings.tsx"

Cohesion: 0.40
Nodes (5): ActivityRingMetric, clamp(), RingSpec, StudentActivityRings(), StudentActivityRingsProps

### Community 66 - "declarations.d.ts"

Cohesion: 0.50
Nodes (3): *.jpg, *.png, *.svg

### Community 67 - "firestoreRulesGuard.test.ts"

Cohesion: 0.50
Nodes (3): RULES_PATH, rulesSource, UNSUPPORTED_RULES_PATTERNS

### Community 72 - "slotOverlap.ts"

Cohesion: 0.29
Nodes (6): addHourLocksToBatch(), AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockId(), hasOverlappingAvailabilitySlot(), SlotInterval, slotsOverlap()

### Community 73 - "OnboardingModal.tsx"

Cohesion: 0.18
Nodes (11): BAR_ROWS, BAR_TRACK, Camera, cameraToStyle(), getLevelSrc(), IMG, LEVEL_BADGE, OnboardingModal() (+3 more)

### Community 105 - "StudentCabinetPanels.tsx"

Cohesion: 0.12
Nodes (25): easeOutCubic(), SkillRadarChart(), StudentCoursesPanel(), StudentInstructorsPanel(), TRAINING_HUB_ITEMS, ScDivider(), ScSectionTitle(), StudentPanelBackLink() (+17 more)

### Community 109 - "TodayChecklist.tsx"

Cohesion: 0.48
Nodes (6): TodayTask, groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), TodayTaskRef

### Community 113 - "Instructor"

Cohesion: 0.14
Nodes (15): BookingModal, InstructorReviewsModal, BookingsLogProps, ClientsManagerProps, ActiveScheduleSlot, ScheduleSlotActionModalProps, ChatMessageListProps, BookingModalHeader() (+7 more)

### Community 115 - "formatBookingDayMonth"

Cohesion: 0.25
Nodes (11): formatActivityTimestamp(), formatBookingDayMonth(), getAchievements(), getHistoryEvents(), getLegacyHistoryEvents(), mapActivityLogToHistoryEvent(), resolveBookingStartDate(), StudentTodaySection (+3 more)

## Knowledge Gaps

- **387 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+382 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `useCourseForm.ts`, `skillData.ts`, `StudentCabinetHome.tsx`, `StudentTodaySection.tsx`, `PushNotificationHub.tsx`, `firebase.ts`, `achievementConfig.ts`, `StudentCabinetShell.tsx`, `StudentCoachPanel.tsx`, `ScheduleCalendar.tsx`, `CoursesManager.tsx`, `StudentProfilePersonalSection.tsx`, `useNotifications`, `ClientBookingsList.tsx`, `AdminPanel.tsx`, `App.tsx`, `GroupCourseCard.tsx`, `Booking`, `BookingChatModal.tsx`, `lib/walletLedger.ts`, `HeroCarousel.tsx`, `useInstructorWorkspace.ts`, `InstructorWorkspace.tsx`, `CourseDetailsModal.tsx`, `BodyScrollLock.tsx`, `PersonalCabinet.tsx`, `StudentHistoryList.tsx`, `courseTransactions.ts`, `LanguageContext.tsx`, `StudentHomeBottomSections.tsx`, `SystemSettings.tsx`, `bookingStore.ts`, `formatDurationLabel`, `BookingsLog.tsx`, `OnboardingModal.tsx`, `StudentCabinetPanels.tsx`, `TodayChecklist.tsx`, `Instructor`, `formatBookingDayMonth`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `studentCabinetUtils.ts`, `UserProfile`, `StudentCabinetHome.tsx`, `StudentTodaySection.tsx`, `useStoreSync.ts`, `PushNotificationHub.tsx`, `bookingTransactions.test.ts`, `firebase.ts`, `achievementConfig.ts`, `bookingScheduleScope.test.ts`, `StudentCabinetShell.tsx`, `StudentCoachPanel.tsx`, `ScheduleCalendar.tsx`, `CoursesManager.tsx`, `clearStudentBookings.ts`, `StudentProfilePersonalSection.tsx`, `useNotifications`, `SkillConfig`, `ClientBookingsList.tsx`, `bookingTransactions.ts`, `AdminPanel.tsx`, `App.tsx`, `GroupCourseCard.tsx`, `BookingChatModal.tsx`, `lib/walletLedger.ts`, `useInstructorWorkspace.ts`, `InstructorWorkspace.tsx`, `BodyScrollLock.tsx`, `PersonalCabinet.tsx`, `StudentHistoryList.tsx`, `courseTransactions.ts`, `StudentHomeBottomSections.tsx`, `SystemSettings.tsx`, `bookingStore.ts`, `bookingEndsAt.ts`, `BookingsLog.tsx`, `activityLogHistory.test.ts`, `src/types.ts`, `slotOverlap.ts`, `achievements.test.ts`, `StudentCabinetPanels.tsx`, `TodayChecklist.tsx`, `Instructor`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `skillData.ts`, `studentCabinetUtils.ts`, `StudentCabinetHome.tsx`, `StudentTodaySection.tsx`, `useStoreSync.ts`, `PushNotificationHub.tsx`, `firebase.ts`, `achievementConfig.ts`, `StudentCabinetShell.tsx`, `StudentCoachPanel.tsx`, `ScheduleCalendar.tsx`, `CoursesManager.tsx`, `StudentProfilePersonalSection.tsx`, `useLanguage`, `useNotifications`, `SkillConfig`, `ClientBookingsList.tsx`, `AdminPanel.tsx`, `App.tsx`, `GroupCourseCard.tsx`, `Booking`, `BookingChatModal.tsx`, `authStore.ts`, `useInstructorWorkspace.ts`, `InstructorWorkspace.tsx`, `TranslationKey`, `CourseDetailsModal.tsx`, `BodyScrollLock.tsx`, `PersonalCabinet.tsx`, `courseTransactions.ts`, `BookingsLog.tsx`, `activityLogHistory.test.ts`, `src/types.ts`, `achievements.test.ts`, `StudentCabinetPanels.tsx`, `Instructor`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _387 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useCourseForm.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1036036036036036 - nodes in this community are weakly interconnected._
- **Should `bookingLogic.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05625 - nodes in this community are weakly interconnected._
- **Should `skillData.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05661729574773053 - nodes in this community are weakly interconnected._
