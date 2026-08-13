# Graph Report - SkiAcademy_DB  (2026-08-13)

## Corpus Check
- 323 files · ~193,699 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1773 nodes · 5778 edges · 116 communities (87 shown, 29 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1c1698d4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ScheduleCalendar.tsx
- bookingLogic.ts
- your_journey/YourJourneySection.tsx
- studentCabinetUtils.ts
- ErrorBoundary.tsx
- UserProfile
- useBookingChatUnread.ts
- StudentTodaySection.tsx
- useStoreSync.ts
- bookingStore.ts
- bookingTransactions.test.ts
- firebase.ts
- achievementConfig.ts
- chatSenderRole.ts
- useLanguage
- StudentCoachPanel.tsx
- ScheduleSlotActionModal.tsx
- Course
- AdminPanel.tsx
- walletCredit.ts
- useCurrency
- useBookingModal.ts
- scripts
- Booking
- Language
- bookingTransactions.ts
- ClientsManager.tsx
- authStore.ts
- AppRoutes.tsx
- BookingCallCoachButton.tsx
- compilerOptions
- BookingChatModal.tsx
- todayChecklist.ts
- lib/walletLedger.ts
- HeroCarousel.tsx
- InstructorBookingCard.tsx
- extract-coaches-manager.mjs
- useInstructorWorkspace.ts
- TranslationKey
- global-setup.ts
- dependencies
- functions/package.json
- compilerOptions
- CourseDetailsModal.tsx
- activityLog.ts
- src/types.ts
- GroupCourseCard.tsx
- README.md
- StudentHistoryList.tsx
- extract-courses-manager.mjs
- courseTransactions.ts
- LanguageContext.tsx
- extract-admin-sections.mjs
- StudentHomeBottomSections.tsx
- useNotifications
- createBookingCallable.ts
- devDependencies
- package.json
- bookingEndsAt.ts
- Auth.test.tsx
- formatDurationLabel
- BookingsLog.tsx
- activityLogHistory.test.ts
- ChatMessage
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
- achievements.ts
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
- skillData.ts
- StatusBadge.tsx
- AchievementsManager.tsx
- bodyScrollLock.ts
- trainingStreak.ts
- phase2CabinetHelpers.test.ts
- eslint-plugin-react
- App.tsx
- eslint-plugin-jsx-a11y
- getAchievements
- eslint

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 220 edges
2. `Booking` - 151 edges
3. `UserProfile` - 130 edges
4. `Course` - 117 edges
5. `Instructor` - 85 edges
6. `TranslationKey` - 49 edges
7. `useNotifications()` - 42 edges
8. `Language` - 38 edges
9. `logger` - 38 edges
10. `SkillConfig` - 38 edges

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

## Communities (116 total, 29 thin omitted)

### Community 0 - "ScheduleCalendar.tsx"
Cohesion: 0.06
Nodes (49): CalendarDayCell, getDaysInMonth(), CourseDateRangePicker(), CourseDateRangePickerProps, CourseBasicInfoSection(), CourseBasicInfoSectionProps, CourseForm(), CourseFormProps (+41 more)

### Community 1 - "bookingLogic.ts"
Cohesion: 0.06
Nodes (55): getAdminFirestore(), getOrInitApp(), ADMIN_FIRESTORE_PATH, mockGetApp, mockGetFirestore, mockInitializeApp, autoCompletePastBookings(), BookingRecord (+47 more)

### Community 2 - "your_journey/YourJourneySection.tsx"
Cohesion: 0.11
Nodes (40): AchievementGrid(), CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX, EQUAL_MARKER_STOPS, JOURNEY_BG, JOURNEY_LEVELS, LEVEL_MARKER_X, LEVEL_MARKER_Y, LEVEL_PATH_BEND (+32 more)

### Community 3 - "studentCabinetUtils.ts"
Cohesion: 0.07
Nodes (56): StudentCabinetHome(), StudentCabinetHomeProps, Achievement, addMinutesToTime(), BookingListScope, buildLocalDateTime(), filterBookingsByScope(), getActiveCourseEnrollment() (+48 more)

### Community 4 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (8): App(), ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, isChunkLoadError(), registerChunkLoadRecovery(), reloadForStaleChunk(), logErrorToFirestore()

### Community 5 - "UserProfile"
Cohesion: 0.10
Nodes (15): LinkGuestBookingModalProps, AdminRoute(), AdminRouteProps, AuthModalProps, AuthRoute(), AuthRouteProps, CourseEnrollmentModalProps, GroupCourseCardProps (+7 more)

### Community 6 - "useBookingChatUnread.ts"
Cohesion: 0.21
Nodes (16): PersonalCabinet(), getChatLastReadAt(), markChatReadAt(), seedChatReadAt(), CourseChatBooking, getCourseChatThreadIds(), isCourseGroupBooking(), resolveChatId() (+8 more)

### Community 7 - "StudentTodaySection.tsx"
Cohesion: 0.11
Nodes (44): ChatUnreadIndicator(), ChatUnreadIndicatorProps, ClientBookingsList(), LIST_SCOPE_FILTERS, LIST_SCOPE_LABEL_KEYS, LessonDetailsModal(), LessonRecommendationsList(), LessonRecommendationsListProps (+36 more)

### Community 8 - "useStoreSync.ts"
Cohesion: 0.14
Nodes (22): useAvailabilityMigration(), InstructorSortBy, InstructorSpecialty, TWO_WEEKS_MS, useNotifications(), DEFAULT_ACHIEVEMENTS_CONFIG, normalizeAchievementsConfig(), migrateAvailabilitySlots() (+14 more)

### Community 9 - "bookingStore.ts"
Cohesion: 0.23
Nodes (16): useCourses(), buildClonedCourse(), stripUndefinedFields(), isActiveCourseEnrollment(), handleFirestoreError(), createNotificationForUser(), NotificationType, BilingualNotificationContent (+8 more)

### Community 10 - "bookingTransactions.test.ts"
Cohesion: 0.06
Nodes (66): CourseEnrollmentError, CALLABLE_INSTRUCTOR_ID, CALLABLE_PROJECT_ID, CALLABLE_USER_EMAIL, CALLABLE_USER_PASSWORD, callableUserProfile(), clearCallableFirestore(), ensureCallableSignedInUser() (+58 more)

### Community 11 - "firebase.ts"
Cohesion: 0.11
Nodes (22): FinancialOverviewProps, Auth(), AuthProps, PRESET_SEEDS, DEFAULT_CONFIG, Currency, CurrencyContext, CurrencyContextType (+14 more)

### Community 12 - "achievementConfig.ts"
Cohesion: 0.18
Nodes (24): applySkillDeltas(), bookingTimestamp(), countExercisesMastered(), findCourseGraduateTimestamp(), findExercisesMasteredTimestamp(), findFeedbackTimestamp(), findHomeworkDoneTimestamp(), findLevelUpTimestamp() (+16 more)

### Community 13 - "chatSenderRole.ts"
Cohesion: 0.18
Nodes (14): ChatMessageList(), ChatMessageRow, ChatSenderRole, getCourseInstructorIds(), getLessonInstructorId(), matchesInstructorProfiles(), namesMatch(), normalizeName() (+6 more)

### Community 14 - "useLanguage"
Cohesion: 0.06
Nodes (64): AuthModal(), InstructorCard, InstructorCardProps, InstructorReviewsModal(), BookInstructorPickerModal(), StudentBookNextFab(), StudentBookNextFabProps, StudentCalendarPanel() (+56 more)

### Community 15 - "StudentCoachPanel.tsx"
Cohesion: 0.15
Nodes (28): findBookingForMessage(), formatMessageTimestamp(), getInstructorEvaluatedSkillIds(), getInstructorHomeworkMessages(), getInstructorLastLessonDate(), getInstructorLessonCount(), getInstructorMessageThreadIds(), getInstructorRecommendations() (+20 more)

### Community 16 - "ScheduleSlotActionModal.tsx"
Cohesion: 0.17
Nodes (17): LinkGuestBookingModal(), AvailableDurationsOptions, AvailableMoveTimesOptions, getAvailableMoveTimeSlots(), getAvailableScheduleDurations(), hasScheduleOverlap(), SCHEDULE_CLOSING_TIME_MINUTES, SCHEDULE_DURATIONS (+9 more)

### Community 17 - "Course"
Cohesion: 0.08
Nodes (34): BookingModal, BookingsLogProps, ClientsManagerProps, CoachesManagerProps, CoursesTable(), CoursesTableProps, CourseTableRow(), CourseTableRowProps (+26 more)

### Community 18 - "AdminPanel.tsx"
Cohesion: 0.15
Nodes (17): AdminCollapsibleSection(), AdminCollapsibleSectionProps, AdminPanel(), CoursesManager, ErrorLogsPanel, FinancialOverview, SystemSettings, AdminPanel (+9 more)

### Community 19 - "walletCredit.ts"
Cohesion: 0.33
Nodes (11): adminBalanceAdjustmentDelta(), applyPendingWalletCredit(), applyWalletCreditInTransaction(), assertValidCreditAmount(), flushPendingWalletCreditInTransaction(), MAX_WALLET_CREDIT_USD, MAX_WALLET_TOPUP_USD, recordAdminBalanceAdjustmentInTransaction() (+3 more)

### Community 20 - "useCurrency"
Cohesion: 0.23
Nodes (9): FinancialOverview(), AuthBookingForm(), AuthBookingFormProps, BookingOverlapWarnings(), ApplePagination(), ApplePaginationProps, StudentWalletHistoryList(), useCurrency() (+1 more)

### Community 21 - "useBookingModal.ts"
Cohesion: 0.18
Nodes (19): AuthModeSliderSwitch(), AuthModeSliderSwitchProps, BookingAuthShell(), BookingAuthShellProps, GuestBookingForm(), GuestBookingFormProps, useBookingModal(), BookingModal() (+11 more)

### Community 22 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, build, build:functions, deploy:functions, deploy:rules, dev, emulators:firestore, format (+19 more)

### Community 23 - "Booking"
Cohesion: 0.12
Nodes (32): AchievementsManagerProps, SystemSettingsProps, AdminPanelProps, InstructorWorkspaceInput, InstructorWorkspaceProps, PersonalCabinetModalsProps, HistoryLessonCardProps, SkillRadarChartProps (+24 more)

### Community 24 - "Language"
Cohesion: 0.29
Nodes (10): BookingSelectorsProps, DifficultyLabelVariant, STATUS_LABELS, MONTHS_EN, MONTHS_RU, MONTHS_SHORT_EN, MONTHS_SHORT_RU, WEEKDAYS_EN (+2 more)

### Community 25 - "bookingTransactions.ts"
Cohesion: 0.31
Nodes (16): blocksInstructorAvailability(), isCourseBooking(), addBookingWithPayment(), assertNoSlotOverlap(), BookingScheduleUpdates, BookingSlotOverlapError, cancelBookingWithRefund(), createBookingWithPayment() (+8 more)

### Community 26 - "ClientsManager.tsx"
Cohesion: 0.20
Nodes (10): AdminRoleManager(), AdminRoleManagerProps, ClientsManager(), AdminRoleManager, ClientsManager, StudentProfilePreferencesSectionProps, ToggleSwitch(), ToggleSwitchProps (+2 more)

### Community 27 - "authStore.ts"
Cohesion: 0.11
Nodes (26): optimizeProfileImage(), ProfileSettings(), ProfileSettingsProps, SkillProgressSummary, StudentProfilePersonalSection(), StudentProfilePersonalSectionProps, useBookings(), grantAndApplyWalletCredit() (+18 more)

### Community 28 - "AppRoutes.tsx"
Cohesion: 0.12
Nodes (24): AdminRouteWrapper(), AppRoutes(), AppRoutesProps, CabinetRouteWrapper(), HomeRoute(), InstructorRouteWrapper(), PersonalCabinet, PersonalCabinetPage() (+16 more)

### Community 29 - "BookingCallCoachButton.tsx"
Cohesion: 0.33
Nodes (6): BookingCallCoachButton(), BookingCallCoachButtonProps, normalizeTelHref(), resolveBookingCoachPhone(), resolveInstructorPhone(), usersList

### Community 30 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 31 - "BookingChatModal.tsx"
Cohesion: 0.15
Nodes (17): AttachmentType, compressImage(), compressVideo(), formatCompressionError(), PendingAttachment, ChatInput(), ChatInputProps, ChatWindow() (+9 more)

### Community 32 - "todayChecklist.ts"
Cohesion: 0.18
Nodes (17): groupRecommendationTasks(), TodayChecklist(), TodayChecklistProps, toTaskRef(), buildAddCustomTodayTaskUpdate(), buildPinSkillsTodayUpdate(), buildRemoveTodayTaskUpdate(), buildToggleSkillTodayUpdate() (+9 more)

### Community 33 - "lib/walletLedger.ts"
Cohesion: 0.22
Nodes (13): buildSyntheticWalletOperations(), buildWalletOperationHistory(), enrichWalletOperationWithBooking(), formatWalletSessionDate(), formatWalletSessionDuration(), ledgerBookingIds(), ledgerEntryToView(), ledgerHasBookingAction() (+5 more)

### Community 34 - "HeroCarousel.tsx"
Cohesion: 0.31
Nodes (9): FALLBACK_SLIDES, buildBackgroundImage(), HERO_SCRIM, HeroCarousel(), HeroCarouselProps, resolveSlideBackground(), shuffleSlides(), Theme (+1 more)

### Community 35 - "InstructorBookingCard.tsx"
Cohesion: 0.15
Nodes (18): InstructorBookingCard(), InstructorBookingCardProps, InstructorRecommendationsEditor(), InstructorRecommendationsEditorProps, StudentAssessButton(), StudentAssessButtonProps, StudentLevelControls(), StudentLevelControlsProps (+10 more)

### Community 36 - "extract-coaches-manager.mjs"
Cohesion: 0.11
Nodes (18): adminLines, body, bookingsLogIdx, dragOverEndIdx, fileChangeIdx, gridStart, handleDeleteEnd, handlers (+10 more)

### Community 37 - "useInstructorWorkspace.ts"
Cohesion: 0.20
Nodes (14): InstructorBookingList(), InstructorBookingListProps, InstructorDashboardHeader(), InstructorDashboardHeaderProps, InstructorReviews(), InstructorReviewsProps, InstructorStudents(), InstructorStudentsProps (+6 more)

### Community 38 - "TranslationKey"
Cohesion: 0.16
Nodes (11): CoursesManagerToolbar(), CoursesManagerToolbarProps, LocalizedCompressionError, InstructorNotLinked(), InstructorNotLinkedProps, LessonFilters(), LessonFiltersProps, HistoryEventCta (+3 more)

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
Cohesion: 0.18
Nodes (13): CourseEnrichedData, CourseFaqItem, CourseProgramStep, CourseReview, getCourseEnrichedData(), CourseEnrollAction(), CourseEnrollActionProps, CourseFAQ() (+5 more)

### Community 44 - "activityLog.ts"
Cohesion: 0.31
Nodes (8): SystemSettings(), ACTIVITY_LOGS_COLLECTION, activityLogId, buildBookingCompletedMetadata(), logActivityForUser(), backfillCompletedBookingActivityLogs(), ActivityLogMetadata, ActivityLogType

### Community 45 - "src/types.ts"
Cohesion: 0.13
Nodes (14): ChatWindowProps, LazyLoad(), LazyLoadProps, ConfirmActionModal(), ConfirmActionModalProps, LevelUpModal(), LevelUpModalProps, PersonalCabinetModals() (+6 more)

### Community 46 - "GroupCourseCard.tsx"
Cohesion: 0.46
Nodes (6): formatCourseCardDate(), GroupCourseCard(), sortVisibleCourses(), GroupCoursesSection(), formatCourseCardDuration(), getCourseEnrollmentBooking()

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
Cohesion: 0.29
Nodes (12): CourseEnrollmentModal(), finalizeBookingCompletion(), enrollInCourse(), releaseCourseSeatInTransaction(), resolveCourseIdFromBooking(), getGroupCourseEnrollmentNote(), getGroupCourseLabel(), translateCourse() (+4 more)

### Community 51 - "LanguageContext.tsx"
Cohesion: 0.24
Nodes (10): CourseGallery(), CourseGalleryProps, isUiLanguage(), resolveUiLanguage(), translations, UI_LANGUAGES, LanguageContext, LanguageProvider() (+2 more)

### Community 52 - "extract-admin-sections.mjs"
Cohesion: 0.18
Nodes (9): bookingsJsx, bookingsLogic, clientsJsx, clientsState, lines, newAdmin, partAfterClients, partBeforeBookings (+1 more)

### Community 53 - "StudentHomeBottomSections.tsx"
Cohesion: 0.26
Nodes (9): AnimatedNumber(), AnimatedNumberProps, ScTintCard(), StudentCabinetWeatherSection(), StudentCabinetWeatherSectionProps, StudentLatestRecommendationSection(), ResortConditionsSidebar(), getLatestCoachRecommendation() (+1 more)

### Community 54 - "useNotifications"
Cohesion: 0.08
Nodes (28): PaymentGateway, CoachesManager(), CourseBackgroundImageField(), CourseBackgroundImageFieldProps, optimizeCourseImage(), CoursesManager(), ErrorLogsPanel(), ErrorLogsPanelProps (+20 more)

### Community 55 - "createBookingCallable.ts"
Cohesion: 0.23
Nodes (10): BookingPaymentResult, InsufficientFundsError, CreateBookingCallableInput, CreateBookingCallableResult, createBookingFn, createBookingViaCallable(), isCreateBookingCallableInfrastructureError(), mapCallableError() (+2 more)

### Community 56 - "devDependencies"
Cohesion: 0.22
Nodes (9): eslint-config-prettier, devDependencies, eslint-config-prettier, tailwindcss, @tailwindcss/vite, @types/canvas-confetti, tailwindcss, @tailwindcss/vite (+1 more)

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
Cohesion: 0.27
Nodes (10): BookingSelectors(), NextStepAction, StudentNextStepCard(), StudentNextStepCardProps, TrainingStreak(), formatDurationLabel(), formatPointsCount(), formatPointsGain() (+2 more)

### Community 61 - "BookingsLog.tsx"
Cohesion: 0.26
Nodes (10): BookingsLog(), shortenBookingId(), BookingsLog, formatBookingCreatedAt(), inferBookingCreatedAtFromId(), resolveBookingCreatedAt(), withBookingCreatedAt(), instructors (+2 more)

### Community 62 - "activityLogHistory.test.ts"
Cohesion: 0.40
Nodes (3): bookings, courses, userProfile

### Community 63 - "ChatMessage"
Cohesion: 0.43
Nodes (4): buildHomeworkForUserIds(), isHomeworkVisibleToStudent(), ChatMessage, GROUP_UIDS

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

### Community 76 - "achievements.ts"
Cohesion: 0.23
Nodes (8): AchievementRule, EvaluatedAchievement, evaluateEarnedAchievements(), getAchievementLabel(), pickAchievementTimestamp(), syncAchievementActivityLogs(), updateActivityLogTimestamp(), userProfile

### Community 105 - "skillData.ts"
Cohesion: 0.09
Nodes (43): ClientSkillProgressView(), ClientSkillProgressViewProps, APPLE, DIMENSION_CONFIGS, easeOutCubic(), RadarDimension, RadarDimensionFilter, SkillRadarChart() (+35 more)

### Community 106 - "StatusBadge.tsx"
Cohesion: 0.32
Nodes (7): BadgeVariant, StatusBadge(), StatusBadgeProps, StyleConfig, VARIANT_MAP, getBookingStatusLabel(), BookingStatus

### Community 107 - "AchievementsManager.tsx"
Cohesion: 0.38
Nodes (6): AchievementsManager(), createEmptyAchievement(), RULE_TYPE_OPTIONS, AchievementDefinition, AchievementRuleType, describeAchievementRule()

### Community 108 - "bodyScrollLock.ts"
Cohesion: 0.48
Nodes (5): applyBodyScrollLock(), BODY_SCROLL_LOCK_CLASS, lockBodyScroll(), releaseBodyScrollLock(), useBodyScrollLock()

### Community 109 - "trainingStreak.ts"
Cohesion: 0.80
Nodes (4): collectTrainingWeekTimestamps(), findStreakWeeksTimestamp(), getTrainingStreakWeeks(), toIsoWeekKey()

### Community 110 - "phase2CabinetHelpers.test.ts"
Cohesion: 0.50
Nodes (3): bookings, courses, instructors

### Community 113 - "App.tsx"
Cohesion: 0.20
Nodes (12): AppContent(), CourseDetailsModal, CourseEnrollmentModal, InstructorReviewsModal, useResortStats(), applyThemeToDOM(), getInitialTheme(), useTheme() (+4 more)

### Community 115 - "getAchievements"
Cohesion: 0.32
Nodes (8): formatActivityTimestamp(), getAchievements(), getTodayAchievements(), isTimestampOnLocalDate(), mapActivityLogToHistoryEvent(), parseActivityTimestamp(), TodayProgressBlock, formatAchievementLabel()

## Knowledge Gaps
- **386 isolated node(s):** `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD` (+381 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `useLanguage` to `ScheduleCalendar.tsx`, `your_journey/YourJourneySection.tsx`, `studentCabinetUtils.ts`, `useBookingChatUnread.ts`, `StudentTodaySection.tsx`, `useStoreSync.ts`, `bookingStore.ts`, `firebase.ts`, `chatSenderRole.ts`, `StudentCoachPanel.tsx`, `ScheduleSlotActionModal.tsx`, `Course`, `AdminPanel.tsx`, `useCurrency`, `useBookingModal.ts`, `Booking`, `ClientsManager.tsx`, `authStore.ts`, `AppRoutes.tsx`, `BookingCallCoachButton.tsx`, `BookingChatModal.tsx`, `todayChecklist.ts`, `HeroCarousel.tsx`, `useInstructorWorkspace.ts`, `TranslationKey`, `CourseDetailsModal.tsx`, `activityLog.ts`, `src/types.ts`, `GroupCourseCard.tsx`, `StudentHistoryList.tsx`, `courseTransactions.ts`, `LanguageContext.tsx`, `StudentHomeBottomSections.tsx`, `useNotifications`, `formatDurationLabel`, `BookingsLog.tsx`, `OnboardingModal.tsx`, `skillData.ts`, `StatusBadge.tsx`, `AchievementsManager.tsx`, `App.tsx`, `getAchievements`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `Booking` connect `Booking` to `ScheduleCalendar.tsx`, `studentCabinetUtils.ts`, `UserProfile`, `useBookingChatUnread.ts`, `StudentTodaySection.tsx`, `useStoreSync.ts`, `bookingStore.ts`, `bookingTransactions.test.ts`, `firebase.ts`, `achievementConfig.ts`, `chatSenderRole.ts`, `useLanguage`, `StudentCoachPanel.tsx`, `ScheduleSlotActionModal.tsx`, `Course`, `AdminPanel.tsx`, `useCurrency`, `useBookingModal.ts`, `bookingTransactions.ts`, `authStore.ts`, `BookingCallCoachButton.tsx`, `BookingChatModal.tsx`, `todayChecklist.ts`, `lib/walletLedger.ts`, `InstructorBookingCard.tsx`, `useInstructorWorkspace.ts`, `activityLog.ts`, `src/types.ts`, `GroupCourseCard.tsx`, `StudentHistoryList.tsx`, `courseTransactions.ts`, `StudentHomeBottomSections.tsx`, `useNotifications`, `createBookingCallable.ts`, `bookingEndsAt.ts`, `BookingsLog.tsx`, `activityLogHistory.test.ts`, `slotOverlap.ts`, `achievements.ts`, `trainingStreak.ts`, `phase2CabinetHelpers.test.ts`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `UserProfile` connect `UserProfile` to `ScheduleCalendar.tsx`, `your_journey/YourJourneySection.tsx`, `studentCabinetUtils.ts`, `StudentTodaySection.tsx`, `useStoreSync.ts`, `bookingStore.ts`, `firebase.ts`, `achievementConfig.ts`, `chatSenderRole.ts`, `useLanguage`, `StudentCoachPanel.tsx`, `ScheduleSlotActionModal.tsx`, `Course`, `AdminPanel.tsx`, `walletCredit.ts`, `useBookingModal.ts`, `Booking`, `ClientsManager.tsx`, `authStore.ts`, `AppRoutes.tsx`, `BookingCallCoachButton.tsx`, `BookingChatModal.tsx`, `todayChecklist.ts`, `InstructorBookingCard.tsx`, `useInstructorWorkspace.ts`, `CourseDetailsModal.tsx`, `src/types.ts`, `GroupCourseCard.tsx`, `courseTransactions.ts`, `useNotifications`, `BookingsLog.tsx`, `activityLogHistory.test.ts`, `achievements.ts`, `skillData.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `runtimeConfigPath`, `E2E_PROJECT_ID`, `AUTH_EMULATOR_HOST` to the rest of the system?**
  _386 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ScheduleCalendar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05721153846153846 - nodes in this community are weakly interconnected._
- **Should `bookingLogic.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05625 - nodes in this community are weakly interconnected._
- **Should `your_journey/YourJourneySection.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10558069381598793 - nodes in this community are weakly interconnected._