# Code Audit — PUBLIC / GUEST + STUDENT (Client Cabinet) Surface

Project: `D:\SkiAcademy_DB` — "Carve Academy" ski/snowboard school (React 18 + Vite + Firebase 12 + Zustand + react-router-dom 7, Tailwind v4, `motion` for animation, KZT currency, RU/EN UI).
Audit mode: **read-only static source review**. No dev server, no build, no deploy, no browser verification.

---

## A. ROUTE / SCREEN TABLE

Route table source: `src/app/routes/AppRoutes.tsx`.

| Path | Container | Role | Purpose | Sections / Tabs |
|---|---|---|---|---|
| `/` | `HomeRouteContainer` (`src/app/routes/HomeRouteContainer.tsx`) | guest + admin | Public landing: hero, journey teaser, resort conditions, group courses, instructor list | `HeroCarousel` → `YourJourneySection` → `ResortConditionsSidebar` + `#main-content-pane` (`GroupCoursesSection` at `#courses-grid`, `#coaches-grid` instructor list + `LessonFilters`) |
| `/cabinet` | `CabinetRouteContainer` (lazy) | student (`role !== 'admin'`) | Student personal cabinet, default tab `home` | Wrapped in `AuthRoute` → `PersonalCabinet` → `StudentCabinet` → `StudentCabinetShell`; tab `home` |
| `/cabinet/:tab` | same | student | Deep-linked cabinet tab | 19 valid tab ids (see A.1); anything else → `<Navigate to="/cabinet" replace />` (`CabinetRouteContainer.tsx:258-260`) |
| `/admin` | `AdminRouteContainer` (lazy) | admin | Out of scope (admin surface) | — |
| `/instructor` | `InstructorRouteContainer` (lazy) | instructor / admin | Out of scope (instructor surface) | — |
| `/__dev/t31b-course-pilot` | `dev/t31b-pilot/T31bCoursePilotPage` (lazy, **DEV only**) | dev | Out of scope; only registered when `import.meta.env.DEV` | — |
| `*` | — | any | Catch-all redirect to `/` (`<Navigate to="/" replace />`) | — |

Cross-route redirects (important preservation notes):
- `HomeRouteContainer.tsx:101-103` — any signed-in non-admin user landing on `/` is redirected to `getDefaultWorkspacePath(userProfile)` → `/cabinet` (or `/instructor` for instructor/admin).
- `src/lib/workspaceRoutes.ts:26-30` — `isInstructorWorkspaceUser` = `role === 'admin' || isInstructor`; default workspace = `/instructor` for those, else `/cabinet`.
- `RouteGate` (`src/features/shell/RouteGate.tsx`): while `authLoading || profileLoading` → `AppInitSkeleton label={t('checkingCredentials')}`; no profile → `Navigate` to fallback `/`; `gateType==='instructor'` and not instructor → `Navigate` to `/cabinet`.

Suspense fallback: `RouteLoadingFallback` = `<div className="min-h-[16rem]" aria-busy="true" />` (`AppRoutes.tsx:34`).

### A.1 Cabinet tab ids (exhaustive)

Declared in `src/features/student-cabinet/components/student/studentCabinetNavigation.ts` and validated by `CABINET_TABS` in `src/lib/workspaceRoutes.ts:4-24`. Panel dispatch is in `StudentCabinetShell.tsx:508-604`.

| Tab id | Rendered component | What it renders |
|---|---|---|
| `home` | `StudentCabinetHome` | `YourJourneySection` (fillViewport, animateSequence=false) → greeting (`getGreeting`) → `StudentTodaySection` (current sessions, countdown, today tasks, next step card, next sessions + mini calendar, today progress) → compact `LazySkillRadarChart` (hidden if `hideProgressTracking`) → `StudentNeedsAttention` → `StudentLatestRecommendationSection` → `StudentCabinetWeatherSection` (only when a session is today) |
| `training` | `StudentTrainingPanel` | Hub list (`ScEditorialHubList`) of 3 deep links: `development` (`scNavDevelopment`/`scDevelopmentDetail`), `calendar` (`scNavCalendar`/`scFullCalendar`), `courses` (`scNavCourses`/`scCourses`) |
| `coach` | `StudentCoachPanel` | Coach hub: list of my instructors + available instructors; sub-views `chat`, `videos`, `comments`, `homework`, `recommendations` (`COACH_HUB_ITEMS`), `ParticipantLessonFeedbackList`, `CoachParticipantAccessPanel` |
| `development` | `StudentDevelopmentPanel` | Level + points-to-next-level progress bar, `LazySkillRadarChart` (full, with pin/toggle), last score update from `activityLogs`, priority exercises with add/remove-to-today toggle (`scAddToToday`/`scRemoveFromToday`) |
| `calendar` | `StudentCalendarPanel` → `BookingsPanel` → `ClientBookingsList` | Month calendar, scope filters (upcoming/current/past/all), hide-cancelled toggle, session list (lessons + course days) with all actions, proposal inbox, `ApplePagination` |
| `courses` | `StudentCoursesPanel` | "My courses" grid + "Available courses" grid of `GroupCourseCard`, participant-scoped |
| `instructors` | `StudentCoachPanel` (same component as `coach`) | Same as `coach` — `instructors` is an alias deep-link of the coach tab |
| `settings` | `StudentProfileHubPanel` | Hub list of 10 profile sub-sections: `profile_participants`, `profile_wallet`, `profile_journey`, `profile_skills`, `profile_certificates`, `profile_achievements`, `profile_season`, `profile_videos`, `profile_preferences` |
| `profile_personal` | `StudentProfilePersonalPanel` | **Compatibility alias** → renders `StudentProfileParticipantsPanel` (`StudentProfilePanels.tsx:171-173`) |
| `profile_participants` | `StudentProfileParticipantsPanel` → `ParticipantManagementPanel` | Self + dependent participant list, create dependent, edit profile, avatar upload, self phone edit |
| `profile_wallet` | `StudentProfileWalletPanel` → `WalletPanel` → `StudentWalletHistoryList` | Wallet operation history, 15/page `ApplePagination`, "Load more transactions" for canonical ledger |
| `profile_journey` | `StudentProfileJourneyPanel` | `buildStudentHistory(...)` merged timeline preview (limit 5) + "show all" → `history` |
| `profile_skills` | `StudentProfileSkillsPanel` | Full `LazySkillRadarChart` + "continue development" → `development` |
| `profile_certificates` | `StudentProfileCertificatesPanel` | **Placeholder only** — `t('scProfileCertificatesEmpty')` (`StudentProfilePanels.tsx:317-325`) |
| `profile_achievements` | `StudentProfileAchievementsPanel` | Achievement chips from `usePresentedParticipantAchievements`, empty → `scProfileAchievementsEmpty` |
| `profile_season` | `StudentProfileSeasonPanel` | Season year + stat grid (lessons, hours, exercises mastered, points) from `useSelectedParticipantLessonStats` |
| `profile_videos` | `StudentProfileVideosPanel` | **Placeholder only** — `t('scProfileVideosEmpty')` (`StudentProfilePanels.tsx:411-419`) |
| `profile_preferences` | `StudentProfilePreferencesPanel` | `ToggleSwitch` "hide progress tracking" (`scHideProgressTracking`) + sign-out button (`signOutAccount`) |
| `history` | `StudentHistoryPanel` | Full merged history timeline with filters, month grouping, expanded training cards, "Load more history" (activity logs + lesson history pages) |

Bottom navigation (`StudentCabinetUI.tsx:17-29`): `STUDENT_BOTTOM_TABS` = `home` (`scNavHome`), `training` (`scNavTraining`), `coach` (`scNavCoach`), `settings` (`scNavProfile`), rendered in a portal `<nav data-student-tab-bar>` with an `aria-current="page"` active rail, plus a floating green "book" FAB (`t('bookNow')` / `CalendarPlus`) that opens `BookInstructorPickerModal`. Deep-link mapping: `resolveStudentBottomNavTab` maps `development|calendar|courses → training`, `instructors → coach`, any `profile_* → settings`.

---

## B. GUEST SURFACE

### B.1 Chrome / navigation

| Element | File | User action → behaviour |
|---|---|---|
| Logo link | `src/app/components/Navbar.tsx:142-151` | Click → `/` if guest/admin, else `getDefaultWorkspacePath(userProfile)` |
| Theme toggle | `Navbar.tsx:156-167` (guest desktop), `251-261` (auth), `435-444` (mobile) | Click → `useTheme().toggleTheme`; `title` = `t('switchToDark')` / `t('switchToLight')` |
| **Language switcher** | `Navbar.tsx:168-174` (guest), `263-269` (auth), `445-453` (mobile) | Click → `setLanguage(language === 'en' ? 'ru' : 'en')`; label renders `EN` when current is `en` else `RU`; `title={t('switchLanguage')}` |
| Sign in button | `Navbar.tsx:176-183` | Click → `onSignInClick` → `setIsAuthModalOpen(true)` (AppShell wiring) → `AuthModal` |
| Workspace dropdown | `Navbar.tsx:189-207`, `319-349` | Authenticated only. Items: `/cabinet` (`clientCabinet`, if `showClientNav`) and `/instructor` (`instructorWorkspaceTab`, if `showInstructorNav`). `aria-expanded`, `aria-haspopup="menu"`, `role="menu"`/`menuitem` |
| Balance display | `Navbar.tsx:209-216` (desktop, `data-testid="navbar-balance"`), `406-411` (mobile, `navbar-balance-mobile`) | Read-only `useEffectiveBalance()` formatted by `CurrencyContext.formatPrice` |
| Notification bell | `Navbar.tsx:230-249` | Click → `onOpenNotifications` → `setIsNotifHistoryOpen(true)` + `handleMarkNotificationsAsRead()`. Badge = `unreadNotificationCount + unreviewedCompletedCount`, `9+` cap, ping animation |
| Participant avatar switcher | `Navbar.tsx:218-228` (desktop, `showName`), `298-308` (mobile) | See section D |
| Admin toggle | `Navbar.tsx:271-283`, `390-404` | Only when `userProfile.role === 'admin'`; navigates `/admin` ↔ `/`; labels `manageResort` / `browseSlopes` |
| Sign out | `Navbar.tsx:285-291`, `465-475` | `AppShell.onSignOut` → `useAuthStore.handleSignOut()` → navigate `/` + toast `loggedOut` / `loggedOutDesc` |
| Mobile hamburger | `Navbar.tsx:309-314`, `351-478` | Toggles `isMenuOpen`; `AnimatePresence` panel with cabinet/instructor links, balance, notifications, theme, language, sign-in/sign-out. Navbar height published to CSS var `--app-navbar-height` via `ResizeObserver` |
| Footer | `src/app/FeaturePageShell.tsx:46-61` | Static: `© {year} Carve Academy` + "Ski & Snowboard Instruction" (hardcoded English, no links). Hidden below 1200px on non-home routes (`max-[1199px]:hidden`) |
| DB status banner | `FeaturePageShell.tsx:28-41` | Amber banner when `uiStore.dbStatusWarning` set (from `registerFirestoreErrorListener` in `AppBootstrap.tsx:41-47`); `×` button → `setDbStatusWarning(null)` |

### B.2 Hero carousel

`src/app/components/HeroCarousel.tsx`, mounted from `HomeRouteContainer.tsx:107-118`.

- Slides: `resortData.resortConfig.slides` (`CustomHeroSlide[]`); `FALLBACK_SLIDES` from `src/features/admin` when config not ready/empty; `hidden` slides filtered out.
- Per-slide text: `line1En`/`line1Ru` (eyebrow) and `line2En`/`line2Ru` (h2) selected by `language === 'en'`. **`line3*` is NOT rendered** by the public hero.
- Background: `BannerMedia` with image or video (`backgroundMediaMode`), `RESORT_SLIDE_RANDOM_IMAGE_KEY` resolved deterministically by slide-id hash, `heroBackgroundSrcSet`, LCP preload for slide 0, next-slide preloading.
- Autoplay: `resortConfig.slideIntervalSeconds` (default 6; `useResortStats` default config = 8). Image-only carousels use a continuous interval; video carousels start the timer only after `onVideoReady`. Crossfade `HERO_CROSSFADE_MS = 1400`.
- Random order: `resortConfig.slidesRandomOrder` → `shuffleSlides`.
- Mobile pagination indicator: `hero-pagination-shell md:hidden` — button advances to next slide, `aria-label={`${t('goToSlide')} ${i+1} / ${n}`}`.
- CTAs (always present, both languages):
  - Primary `t('startYourJourney')` → `onScrollToSection('coaches-grid')` (smooth scroll).
  - Secondary `t('chooseCourse')` → `onScrollToSection('courses-grid')`.
- Empty state: if `slides.length === 0` only the scrim background renders (no CTAs).
- Touch: `onTouchStart`/`onTouchEnd` swipe (min 40px, horizontal-dominant) changes slide. No keyboard navigation for slides.

### B.3 Your Journey (guest variant)

`src/features/journey/components/YourJourneySection.tsx`, rendered on `/` with `userProfile={null}` (`HomeRouteContainer.tsx:120`).

- Guest sees: eyebrow `journeyEyebrow`, title `journeyTitle`, `journeyDesc1` + `journeyDesc2`, wavy level path strip with 4 levels, `MobileSkillCards` / `DesktopSkillCards` per level, and `AchievementGrid` (only when `!userProfile`).
- No user marker, no XP, no streak for guests (`showUserPosition = Boolean(userProfile && !hideProgressTracking)`).
- `onOpenDevelopment` is not passed on the home route → skill cards show no "continue" affordance for guests.
- Breakpoint hook `useBreakpoint`; `IntersectionObserver`-driven ~5s draw sequence unless `prefers-reduced-motion`.

### B.4 Resort conditions sidebar

`src/app/components/ResortConditionsSidebar.tsx`.

- Resort name from `resortConfig.nameRu` / `nameEn`.
- Temperature: `AnimatedNumber` + `°`; button toggles °C/°F via `onToggleTemperatureUnit` → `setIsFahrenheit(!isFahrenheit)`; `aria-label={t('mountainTemp')}`.
- Weather label: `t(getWeatherConditionKey(weatherCode))` (`src/shared/weatherCondition.ts`).
- Snow cover: `t('snowCover')` + value + `t('centimetersShort')`; wind: `t('windSpeed')` + value + `t('kilometersPerHourShort')`.
- Lifts status: `resortConfig.showLifts !== false` gate; `liftsStatusRu || 'ОТКРЫТО'` / `liftsStatusEn || 'OPEN'` (hardcoded RU fallback); closed detection by substring `CLOSE` / `ЗАКР` / `OFF`; label `t('closedToday')` (rose) or `t('openToday')`.
- Two layouts: mobile/tablet row (`lg:hidden`) and desktop column (`hidden lg:flex`, `lg:max-w-[180px]`).
- **No refresh button, no `lastUpdated` timestamp, and no loading/error state is rendered on this widget** — `isResortLoading` and `lastUpdated` are supplied by `useResortStats` but the sidebar does not consume them. On fetch failure `useResortStats` silently substitutes defaults (`-5 °C`, 175 cm, 15 km/h, 12 lifts) — the guest sees plausible-looking fallback data with no error signal.

### B.5 Group courses (public)

`src/features/courses/components/GroupCoursesSection.tsx` → `GroupCourseCard.tsx`.

- Section header: `t('intensiveGroupCourses')` / `t('intensiveGroupCoursesSub')`; anchor id `courses-grid`.
- Grid: `repeat(auto-fill, minmax(260px, 1fr))`, `whileInView` staggered entry.
- Empty state: `<div className="ui-empty-state">{t('noIntensiveCoursesAvailable')}</div>`.
- `sortVisibleCourses`: filters `!c.isHidden`, sorts by `order` then title.
- Card contents: badge (image or text), `bgImageUrl` (Unsplash fallback), title, level badge (`courseLevelBadgeLabel`), date chip (`formatCourseCatalogCardDate` from `resolveCourseCatalogDisplaySchedule`), duration chip (`formatCourseCardDuration`), description, price (`catalogOperational?.priceMinorUnits ?? rawCourse.priceKZT`) + `t('perCourse')`, primary CTA + `t('courseDetails')` button, and `StudentCourseProgressSummary` when an enrollment is found.
- CTA derivation (`src/features/courses/groupCourseEnrollmentCta.ts`): labels are exactly `enrolled | awaitingPayment | accessSuspended | soldOut | unavailable | enroll`. `enrollDisabled` when enrolled, `isClientActive === false`, full, capacity frozen, or not enrollment-eligible. For guests with an active guest enrollment the button becomes clickable "check status" (`t('guestCheckStatus')`).
- Primary CTA click → `onRequireAuth(rawCourse)` → `setSelectedCourseForAuth` → `CourseEnrollmentModal`. Details click → `onViewDetails(rawCourse, enrollmentId)` → `setSelectedCourseForDetails` → `CourseDetailsModal`.

### B.6 Course details modal

`src/features/courses/components/CourseDetailsModal.tsx` (+ `course_details/*`).

Sections: `CourseHeader` (title + close), `CourseProgram` (benefits/program), `CourseGallery` (photos + `videoUrl`), instructors block (`t('courseYourInstructors')`, specialty, experience, rating), static student reviews block (`t('courseStudentReviews')` — enriched placeholder data from `courseEnrichedData.ts`, not real Firestore reviews), `CourseFAQ` (accordion, `t('courseFaqTitle')`, `expandedFaq` single-open state), and right rail with `StudentCourseProgressSummary` + `CourseEnrollAction` (seats %, catalog operational state, enroll CTA). Seats bar: `Math.round(availableSeats / totalSeats * 100)`.

### B.7 Instructor list (public)

`src/app/routes/HomeRouteContainer.tsx:156-202` + `src/features/profile/components/InstructorCard.tsx`.

- Header: `t('meetGuides')` / `t('meetGuidesSub')`, container id `coaches-grid`.
- `LessonFilters` is rendered only when `settingsStore.filtersEnabled` (admin-controlled feature flag).
- Empty state: `.ui-empty-state` with `Compass` icon, `t('noCoachesMatch')`, and a `t('resetFilters')` button → `resetFilters()` (clears `searchQuery`, `selectedSpecialty`, `selectedLanguage` in `useUiStore`; **does not reset `sortBy`**).
- `useInstructorFilters` (`src/hooks/useInstructorFilters.ts`): **unavailable instructors are always excluded** (`if (!ins.isAvailable) return false;` line 46). Search matches name or bio (case-insensitive). Filters are skipped entirely when `filtersEnabled === false`.
- Filter controls (`LessonFilters.tsx`): search text (`searchCoach`/`searchPlaceholder`), discipline chips `all|ski|snowboard|both` (`allFilter`, `specialtySki`, `filterSnowboardShort`, `specialtyBoth`), coach-language `<select>` with `all,en,de,fr,ru,it,es` (`allLanguages`, `languageEnglish`, `languageGerman`, `languageFrench`, `languageRussian`, `languageItalian`, `languageSpanish`), sort `<select>` `rating|priceAsc|priceDesc|experience` (`ratingHighToLow`, `priceLowToHigh`, `priceHighToLow`, `experienceYears`).
- Row actions: rating control (button when `onViewReviews` present → `InstructorReviewsModal`, `title={t('readReviews')}`); `t('bookNow')` button → `setSelectedInstructor(instructor)` → `BookingModal`. Offline instructors still render (with `t('instructorOffline')` badge and `t('instructorFull')` disabled button) if reached through the cabinet coach panel, but the public home list filters them out.
- Price: `resolveInstructorHourlyRateKztForDisplay(instructor)` → `formatPrice(...)` + `/ t('hr')`, `—` when undefined.

### B.8 Booking entry point & guest reservation flow (lesson)

`BookingModal` → `useBookingModal` (`src/features/bookings/components/booking_modal/useBookingModal.ts`), shell split by `!userProfile` → `BookingAuthShell` vs `AuthBookingForm`.

**Structure**
- `AuthModeSliderSwitch` (guest only) toggles `unauthTab: 'guest' | 'auth'` — labels `t('guestBookingTab')` / `t('authTab')`; `role="tablist"` with a hardcoded `aria-label="Режим записи"`.
- Guest tab = `GuestBookingForm`; auth tab = inline `<Auth />` with `t('bookingSignInPrompt')` above it. **Login is optional** — the guest path never requires an account.
- Once `guestCreatedBookingId` is set, the modal swaps to `GuestReservationStatus` (`kind="lesson"`) and the slider is hidden.

**Guest fields (`GuestBookingForm.tsx`)**
| Field | Translation keys | Required |
|---|---|---|
| Name | `guestNameLabel`, `guestNamePlaceholder` | **Yes** (`required` + submit guard `missingDetails`/`guestNameLabel`) |
| Phone | `guestPhoneLabel`, `guestPhonePlaceholder` | **Yes** |
| Email | `guestEmailLabel`, `guestEmailPlaceholder` | No (sent as `undefined` when blank) |
| Date / Time / Duration / Lesson stage | `selectDate`, `timeSlot`, `durationHours`, `lessonStage` via `BookingSelectors` | Date required |
| Goals/notes | `personalGoalsNotes`, `personalGoalsPlaceholder` | No |
| Total fee | `totalLessonFee` = `hourlyRate × duration` (`—` when rate undefined) | read-only |

Duration options `[1,2,3,4,6]` h; difficulty options `beginner|intermediate|advanced|freeride|freestyle`.

**Submit (`handleSubmitGuest`)**
- Guards, in order: name → phone → date → `instructor.isAvailable` (`instructorUnavailable`/`instructorNotAccepting`) → slot free (`slotUnavailable`/`instructorAlreadyBooked`).
- Generates a logical booking attempt id (`createLogicalBookingAttemptId`), derives guest participant id (`deriveGuestParticipantIdForBooking`) and idempotency key (`deriveGuestCreateIdempotencyKey`).
- Sends `guestDiscipline: 'ski'`, `guestAgeYears: 25`, `guestSkillLevel: difficulty`.
- Command: `useLessonBookingCommands.createGuestBooking` → canonical kind `create_guest_booking_request` via `executeGuestCanonicalCommand`.
- On success: `rememberGuestReservation('lesson', instructorId, credential.bookingId)` (localStorage credential), then `loadGuestSingleLessonBooking(bookingId)`; a failed post-create read sets `guestRefreshError`.
- Errors: `guest_reservation_limit` → `GuestReservationLimitAlert` (`guestReservationLimitTitle`/`guestReservationLimit`, `role="alert"`, rose styling) and resets the attempt id; otherwise a toast `bookingError` + presented message. `presented.shouldRefresh` bumps the occupancy refresh nonce and clears the selected time.
- Submit button disabled while `isTimeSlotOccupied || !isAvailable || hourlyRateKzt === undefined`; label `t('submitGuestApplication')`, pending `t('submitting')`.

**Previous-reservation lookup**
- If a remembered reservation exists for this instructor, a `t('guestCheckPreviousStatus')` button appears at the top → `loadGuestSingleLessonBooking`. `isUnusableGuestReservationError` → `forgetGuestReservation` + `guestLookupError='stale'` → message `guestPreviousUnavailable`; other errors → `'recoverable'` → `guestStatusRefreshFailed` (rendered with `role="status"`).

**Guest reservation status screen (`GuestReservationStatus.tsx`, `role="status"`)**
- Titles by state: `guestLessonConfirmedTitle` / `guestLessonExpiredTitle` (status `cancelled` + `reasonCode === 'reservation_expired'`) / `guestCancelledTitle` / `postCreateRefreshFailedLessonTitle` (created but status details not hydrated) / `guestPendingTitle`.
- Pending body: hold deadline (`guestLessonHoldUntil` with `{deadline}`), price (`guestBookingPrice` `{amount}`), `guestOutstandingAmount`, `guestPaymentReceivedPendingConfirmation` when paid, else `guestAdminContactPayment` + `guestLessonAfterFullPayment`.
- Amount format: `Intl.NumberFormat(locale)` + `₸` (RU) or `KZT` (EN) — **hardcoded symbol, not `CurrencyContext`**.
- Actions: `t('guestCancelPending')` (only when `statusHydrated && status==='pending' && payment.unpaidCancellationEligible && deadline not passed && onCancelPending`) → inline two-step confirm (`guestCancelConfirm` + confirm/cancel); `t('guestNewBooking')` when cancelled; otherwise `t('guestCheckStatus')` (`t('processing')` while refreshing); `t('closeBtn')`.
- Refresh error: `t('guestStatusRefreshFailed')` in rose.
- Guest cancel calls `requestCancellation` with `guestCredential` → canonical `request_booking_cancellation` with `guestActionNonce`/`guestActionSignature`, `exercisedCapability: 'account_owner'`, then optimistically patches local lifecycle and verifies revision advanced, else shows `cabinetCancellationRefreshWarning`.

### B.9 Booking entry point (authenticated)

`AuthBookingForm.tsx` — same `BookingSelectors`, plus `BookingOverlapWarnings` and `ParticipantPicker`.

- `ParticipantPicker` shown when `shouldShowParticipantPicker` (loading, error, or >1 participant). A sole participant is auto-selected; stale selections are dropped (`resolveEffectiveParticipantIds`).
- Pricing read model: `queryLessonPricingSettingsReadModel({ scope: 'lesson_pricing_settings' })` supplies `additionalParticipantSurchargePerHourKzt` and `maxParticipantsPerLesson`. If either is `undefined`, `lessonSettingsUnavailable` → submit blocked with a **hardcoded RU/EN message** ("Канонические настройки урока не заданы; отправка недоступна.").
- Price: `baseLessonCost = pricePerHourKZT × duration`; `totalCost = base + round(surcharge × max(0, participants−1) × duration)`. Shown via `BookingPriceAccordion` (hourly rate, duration, total) + `t('payConfirmLesson')` with `{amount}` replaced.
- Surcharge line rendered as a hardcoded RU/EN string when >1 participant.
- Submit guards: not signed in (`signInRequired`), `isClientActive === false` (`accessSuspended`/`bookingSuspendedDesc`), date, zero participants (`bookingSelectParticipant`), settings unavailable, over max participants, instructor unavailable, slot occupied.
- Command: `createAuthenticatedBooking` → canonical kind `create_confirmed_booking` with `participantIds[]` and `exercisedCapability` derived by `deriveExercisedCapabilityFromParticipants` (`parent_guardian` if any dependent, else `account_owner`).
- Success: toast `lessonBooked` + composed message; `refreshFailed` → `postCreateRefreshFailedTitle`/`postCreateRefreshFailedBody`; `canvas-confetti` burst; modal closes.
- Occupancy read model: `queryInstructorOccupancyReadModels({ scope: 'public_instructor_day', instructorId, localDate, timeZone })` for the selected day **and the next day** in parallel, version-guarded by `occupancyFetchVersionRef`; on error `occupancyLoadFailed = true` (time picker disabled with `instructorOccupancyLoadFailed`).

### B.10 Guest course enrollment

`src/features/courses/components/CourseEnrollmentModal.tsx` (sheet-style, `data-course-enrollment-modal`, `role="dialog"`, `aria-modal`, `aria-labelledby="course-enrollment-modal-title"`).

- Same `AuthModeSliderSwitch` guest/auth split; `Auth` inline on the auth tab with `t('courseEnrollmentAuthPrompt')`.
- Guest fields: name*, phone*, email (optional), notes (`guestCourseNotes`), total tuition (`courseTotalTuition` + `course.priceKZT`) and course dates.
- Submit → `createGuestEnrollment` → canonical kind `create_course_enrollments` (guest variant) → guest participant `resolveGuestCourseSessionParticipantId()`, `guestSkillLevel: 'beginner'`, `guestDiscipline: 'ski'`, `guestAgeYears: 25`; credential persisted; then `loadGuestSingleCourseEnrollment`.
- Errors: `duplicate_active_enrollment` → `alreadyEnrolled`/`alreadyEnrolledDesc` + close; `guest_reservation_limit` → `GuestReservationLimitAlert`.
- Authenticated path: `ParticipantPicker` (max `COURSE_ENROLLMENT_SELECTION_MAX = 8`), `t('courseEnrollmentParticipantPrompt')` when explicit selection is required, "already enrolled" state (`isAnySelectedParticipantEnrolledInCourse`) renders `t('courseEnrolled')`, then `onEnroll` → `useCourseActions.handleBookCourse` → `createAuthenticatedEnrollment` (`create_course_enrollments`) with optimistic wallet debit `withOptimisticBalance(-estimatedPrice, …)` that is **rolled back when the server returns `already_exists`**. Confetti on success.
- Post-create: same `GuestReservationStatus` component with `kind="course"` and `request_course_enrollment_cancellation` for guest cancel.

### B.11 Auth dialogs

`src/features/auth/components/AuthModal.tsx` → `src/features/auth/components/Auth.tsx` (also embedded inline in booking/course modals and as `variant="sidebar"`).

- `AuthModal`: overlay `ui-modal-overlay` z-50, click-outside close, `BodyScrollLock`, close button `aria-label={t('cancel')}`, `AnimatePresence` fade/scale.
- **Sign in** (`welcomeTitle`, `welcomeSub`, `welcomeSub2`): email (`emailAddress`), password (`password`), "forgot password" (`authForgotPassword`), submit `signInBtn`, Google button `googleSignIn`.
- **Sign up** (`signUpTitle`, `signUpSub`): full name* (`fullName`), phone optional (`phoneOptional`), avatar picker — 6 presets `['Felix','Aneka','Jack','Buster','Bella','Luna']` + 🎲 randomize (`authChooseAvatar`, `authRandomize`) + free-text seed (`authAvatarSeedPlaceholder`) — email, password, submit `signUpBtn`.
  - Client validation: display name required (`authDisplayNameRequired`); regex `/^[a-zA-Zа-яА-ЯёЁ\s\-'\u00C0-\u017F]+$/` (`authNameCharactersOnly`).
  - `signUpWithEmailService` → `migrateExistingProfileService` → if none, creates profile with DiceBear avatar `https://api.dicebear.com/7.x/adventurer/svg?seed=…`, `role: 'user'`, `isClientActive: true`, optional `phoneNumber`; toasts `authWelcomeAcademy`/`authRegisteredCredits` or `authWelcomeBack`/`authLinkedProfileName`.
- **Password recovery** (`authResetPassword`, `authResetPasswordSub`): email only, submit `authSendRecoveryLink` → `requestPasswordResetService`; success `authResetEmailSent` + `authResetEmailPrefix/Suffix`; missing email → `authEnterEmail`; `auth/user-not-found` → `authUserNotFound`. Back link `authBackToLogin`.
- **Google** `handleGoogleLogin` → `signInWithGoogleService`; error mapping `auth/popup-blocked` → `authPopupBlocked`/`authPopupBlockedDesc`, network → `authNetworkError`, otherwise `authGoogleInterrupted`; `auth/popup-closed-by-user` is silently ignored.
- Sign-in error mapping: `auth/email-already-in-use` → `authEmailInUse`, `auth/weak-password` → `authWeakPassword`, `auth/invalid-credential|wrong-password|user-not-found` → `authInvalidCredential`, `auth/operation-not-allowed` → `authOperationNotAllowed`, `auth/network-request-failed` → `authNetworkError`, fallback `authErrorPrefix` + raw message. Errors are shown inline **and** as a toast.
- Sign-in profile resolution: authoritative `getUserProfileService(uid)` → else legacy email-claim `migrateExistingProfileService` → else a fallback profile with displayName `user.displayName || 'Alpine Glider'` and toast `authProfileSetup`/`authProfileCreated`.
- Toggle between modes: `noAccount` / `haveAccount`.
- Post-auth: the modal closes; there is **no explicit redirect** from `AuthModal` — routing is driven by the `HomeRouteContainer` redirect (guest on `/` is bounced to `/cabinet` once `userProfile` exists).

### B.12 Language system

- `src/lib/i18n/translations.ts:2` — `export const UI_LANGUAGES = ['en', 'ru'] as const`. **Exactly two supported UI languages: English and Russian.**
- Resolution: `resolveUiLanguage(localStorage.getItem('alpine_glide_lang'))` — persisted key is **`alpine_glide_lang`**; falls back to `navigator.language.startsWith('ru') ? 'ru' : 'en'` (`LanguageContext.tsx:31-39`).
- `t(key)` returns `translations[language][key] || translations.en[key] || String(key)` — missing keys silently degrade to the key string.
- Separate, non-UI vocabularies: instructor spoken languages (`src/lib/i18n/instructorLanguages.ts`, codes en/de/fr/ru/it/es via `normalizeInstructorSpokenLanguage`), course dates (`courseDates.ts`), booking labels, content translation.

### B.13 Announcements / FAQ / footer links / cookie-consent

- **Announcements / news / newsletter / push opt-in: not present** on the public surface. `BroadcastChannel`/push code does not exist for guests; `PushNotificationHub.tsx` is not mounted from any route in this scope (UNVERIFIED whether mounted at root — `AppRoutes`/`AppShell` do not render it).
- **FAQ**: exists, but only per-course inside `CourseDetailsModal` (`CourseFAQ`, `t('courseFaqTitle')`). There is no site-wide public FAQ page or nav entry.
- **Footer links**: none. `FeaturePageShell` footer contains only the copyright line and one non-interactive span.
- **Cookie/consent notice**: **none found** anywhere in `src/`. There is no consent store, no banner, no cookie gate.

### B.14 Public empty / loading / error states

| State | Where | Appearance |
|---|---|---|
| App init loading | `RouteGate` / `HomeRouteContainer` | `AppInitSkeleton label={t('checkingCredentials')}` |
| Route chunk loading | `AppRoutes` | `RouteLoadingFallback` (`aria-busy="true"`, `min-h-[16rem]`) |
| Modal chunk loading | `ModalHost` | `ModalLoadingFallback` = `ui-modal-overlay` + `ModalSkeleton` |
| No courses | `GroupCoursesSection` | `.ui-empty-state` + `noIntensiveCoursesAvailable` |
| No instructors after filtering | `HomeRouteContainer` | `.ui-empty-state` + `noCoachesMatch` + `resetFilters` |
| No hero slides | `HeroCarousel` | scrim-only background, no CTAs |
| Booking occupancy loading | `BookingSelectors` | Time picker placeholder `t('loading')...`, disabled |
| Booking occupancy failed | `BookingSelectors` / `BookingOverlapWarnings` | Placeholder `instructorOccupancyLoadFailed`, submit disabled |
| Guest quota exceeded | `GuestBookingForm` | `GuestReservationLimitAlert` (`role="alert"`) |
| Guest reservation status unreadable | `GuestBookingForm` / `CourseEnrollmentModal` | `role="status"` + `guestStatusRefreshFailed` / `guestPreviousUnavailable` |
| Global crash | `src/app/components/ErrorBoundary.tsx` | Red panel "Something went wrong" + raw error message + "Try again" (**hardcoded English, not translated**). Chunk-load errors auto-reload via `reloadForStaleChunk()` |
| Firestore permission failure | `FeaturePageShell` + `AppBootstrap` | Amber `dbStatusWarning` banner with `dbRestricted` + operation + path, dismissible |

---

## C. STUDENT SURFACE

Entry: `/cabinet` and `/cabinet/:tab` → `CabinetRouteContainer` → `AuthRoute` → `LazyLoad` (`CabinetLoadingFallback` = `Skeleton` + `CardSkeleton`) → `PersonalCabinet` → `StudentCabinet` → `StudentCabinetShell`.

Gate: `PersonalCabinet.tsx:244-262` — when `userProfile.isClientActive === false` the whole cabinet is replaced by a lock card (`t('accessSuspended')`, `t('accessSuspendedDesc')`, plus `t('instructorWorkspaceAvailable')` for instructor accounts). **No cabinet functionality is reachable while suspended.**

### C.1 Dashboard (`/cabinet` home)

| Section | File | Controls |
|---|---|---|
| Journey strip | `YourJourneySection` (fillViewport) | Level hover/select, `ScTextButton` → `onContinueDevelopment` → `development` tab; skill cards can open development |
| Greeting | `StudentCabinetHome.tsx:138` | `getGreeting(lang, getFirstName(displayName))` — read-only |
| Today | `StudentTodaySection` | `CurrentSessionsBlock` (open session/lesson/course details, unread-chat dot), `SessionCountdownBlock`, `TodayTasksBlock` (checkbox complete via `handleToggleTodayTaskComplete`, add custom task via `handleAddCustomTodayTask`, remove via `handleRemoveTodayTask`, open lesson, continue development), `StudentNextStepCard` (start exercise auto-pins skill to today, open recommendation, continue development), `NextSessionBlock` (mini calendar day select, open lesson, chat, course details), `TodayProgressBlock` (activity rings, XP, achievements, trainer score deltas) |
| Skill radar (compact) | `LazySkillRadarChart` | Skill pin/unpin today; hidden when `hideProgressTracking` |
| Needs attention | `StudentNeedsAttention` | Up to 5 rows; `writeReviewBtn` → opens `ReviewModal`; `scDismissReviewPrompt` → `handleDismissReview`; `scHistoryOpenRecommendations` → opens the lesson |
| Latest recommendation | `StudentLatestRecommendationSection` | Opens the source lesson |
| Weather | `StudentCabinetWeatherSection` | °C/°F toggle; only rendered when there is a session today |

### C.2 Calendar / sessions (`/cabinet/calendar`)

`BookingsPanel` → `CustomerProposalInbox` (if proposals exist) → `ClientBookingsList`.

- Month calendar: `useAccountLessonBookingCalendarMonth({ enabled, year, monthIndex })`; prev/next via `shiftVisibleAccountCalendarMonth`; day cells highlight course days (violet) and lessons (accent) with a dot; clicking a day filters the list, `showingLessonsFor` + `showAll` to clear.
- Scope filter chips: `upcoming` (`scCalendarUpcoming`), `current` (`scCalendarCurrent`), `past` (`scCalendarPast`), `all` (`scHistoryFilterAll`).
- `hideCancelled` `ToggleSwitch` (`t('hideCancelled')`), persisted in `localStorage['alpine_glide_hide_cancelled_bookings']`, shown only when at least one cancelled/withdrawn session exists.
- Calendar month states: `status === 'loading'` → `t('loading')`; `calendarMonth.error` → message + `t('retry')` button.
- Session list states: `sessionItems.length === 0` → `StateCard` `noSessionsScheduledYet` + `browseInstructorsHint`; filtered to empty → `noSessionsOnDate` (clear filter) or `allSessionsHidden` (show cancelled); pagination 5/page via `ApplePagination`.
- **Lesson row controls**: status `StatusBadge`; `t('chat')` (opens `BookingChatModal`, title `chatNewMessages`/`chatAboutLesson`, unread dot); `BookingCallCoachButton`; `t('scMoreDetails')` → `LessonDetailsModal`; `t('writeReviewBtn')` when `status === 'completed'` and the booking is unreviewed; `BookingCollaborationActions` (withdraw cancellation, reschedule, cancel) gated by `booking.authorizedActions`; pending-cancellation reason row (`t('reason')`).
- **Course-day row controls**: status badge derived from `lifecycleStatus`; `scMoreDetails` → `onViewCourseDetails(courseId, enrollmentId)`; `t('collabWithdrawCancellation')` when `authorizedActions.canWithdraw`; `t('requestCourseCancellation')` when `authorizedActions.canRequestCancellation`.
- Row chrome: instructor avatar, name, `LessonFeedbackIndicator`, difficulty + duration (`hrSession`), participant line (`formatLessonBookingParticipantLine` with `bookingParticipantLabel`/`bookingParticipantsLabel`), date/time chips, total fee via `resolveLessonBookingPaymentDisplay` + `lessonBookingPaymentDisplayLabel`, `StudentOpenChangeRequestNotice` when a change request is open.
- Hardcoded label: course rows use `language === 'ru' ? 'Групповой курс' : 'Group course'` (`ClientBookingsList.tsx:534`).

### C.3 Cancellation flow

- **Lesson**: `handleCancelClick` (`PersonalCabinet.tsx:224-232`) → `ConfirmActionModal` with `t('cancelConfirmMessage')` + instructor name + `t('cancelConfirmSuffix')` → `onCancel(booking.id)` → `handleCanonicalCancel` (`CabinetRouteContainer.tsx:144-183`).
  - Re-reads the booking, derives `exercisedCapability` via `resolveLessonBookingClientExercisedCapability(booking)`, idempotency key `deriveCancellationIdempotencyKey(bookingId, revision)`.
  - Command: `requestCancellation` → canonical `request_booking_cancellation` with `expectedRevision`.
  - Outcome: `presentCabinetCancellationNotifications('lesson', outcome)` → 0..n toasts; error → `presentCancellationError`; `shouldRefresh` → `refetchAccountHotBookings()` + `warning` toast, else `error` toast; the error is re-thrown so `PersonalCabinetModals` keeps the confirm dialog open.
  - `ConfirmActionModal` supports an optional required reason textarea (`cancelReasonRequired`, `cancelReasonPlaceholder`) — but the lesson path does **not** enable `showReasonInput`, so no reason is collected for cancellations from this screen.
- **Course**: `handleCourseCancelClick` → confirm `t('courseCancelConfirmMessage')` → `requestCourseCancellation` → `requestCourseCancellation` canonical kind `request_course_enrollment_cancellation`, `exercisedCapability: 'account_owner'`; success/failure toasts from the same outcome presenter. The confirm dialog stays open on failure.
- **Course withdraw** (`onCourseWithdraw`): runs without a confirm dialog; on success `courseCancellationWithdrawn` / `courseCancellationWithdrawnDesc`; on `shouldRefresh` it refetches and shows a warning.

### C.4 Rescheduling / collaboration

- `RescheduleBookingModal` (`src/features/booking-collaboration/components/RescheduleBookingModal.tsx`) opened from `BookingCollaborationActions` → reschedule. Plain centered dialog (no `role="dialog"`, no overlay class), date `BookingAppleDatePicker` (`selectDate`) + time `BookingAppleWheelPicker` (`collabSelectTime`) with availability from `useRescheduleBookingAvailability` (excludes the current booking), confirm `copy.rescheduleConfirm`, cancel. Submit → canonical kind `reschedule_booking`.
- `CustomerProposalInbox` — accept (`copy.acceptProposal`, canonical `accept_booking_proposal`) / decline (`copy.declineProposal`, `cancel_booking_proposal`); rendered only when at least one proposal has `lifecycleStatus === 'open'`.
- Withdraw cancellation → canonical `withdraw_booking_cancellation_request`.

### C.5 Course enrollment (student)

`/cabinet/courses` → `StudentCoursesPanel`: "My courses" (participant-scoped via `getEnrolledCourseIdsForParticipant`) and "Available courses"; empty states `noIntensiveCoursesAvailable` / `scNoAvailableCourses`. Cards reuse `GroupCourseCard` with the same CTA derivation; "details" → `CourseDetailsModal` with the resolved `enrollmentId`; CTA → `onRequireCourseAuth` → `CourseEnrollmentModal` (authenticated path). Cancelling/withdrawing a course is done from the calendar rows (C.2), not from this panel.

### C.6 Wallet

- Balance: `useEffectiveBalance()` = `canonicalBalanceKzt + optimisticBalanceDelta` (`src/features/wallet/walletSelectors.ts`) — displayed in the navbar, both desktop and mobile.
- History: `/cabinet/profile_wallet` → `WalletPanel` → `StudentWalletHistoryList`. Rows come from `buildWalletOperationHistory(userId, bookings, courses, ledgerEntries, lang)`; credit/debit arrows and colours; `scProfileWalletBalanceAfter`; date formatted with `Intl` (`ru-RU`/`en-US`); pagination 15/page; empty → `StateCard scProfileWalletHistoryEmpty`; "Load more transactions" when `walletLedgerHasMore`.
- **Top-up**: `PaymentGateway.tsx` exists with presets `10 000 / 25 000 / 50 000 / 100 000 ₸`, default 25 000, sandbox card fields (`cardHolder`, `paymentCardNumber`, `expiry`, `cvv`), `authorizeTopUp`, simulated 1.8 s payment and a success screen — **but it is only exported from `src/features/bookings/index.ts` and is not rendered by any route, container, or component in this scope.** There is no reachable student wallet top-up. `walletService.applyWalletCredit` is an explicit TODO stub that only `console.warn`s.
- Money UX note: the student booking form states "Payment is confirmed server-side when you submit." as a **hardcoded English string** (`AuthBookingForm.tsx:188`).
- Insufficient funds on enrollment surfaces as `bookingFailed`/`bookingFailedDesc` (`useCourseActions.ts:187-188`).

### C.7 Reviews / feedback

- Entry points: calendar completed-lesson button, `StudentNeedsAttention`, `LessonDetailsModal` footer, notification hub "review" action, history cards.
- `ReviewModal` (`src/features/student-cabinet/components/ReviewModal.tsx`): 1–5 star buttons (`rateInstructor`), comment textarea (`yourFeedback`, `reviewDetailPlaceholder`, `maxLength = INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH`), submit `postInstructorReview` (`submitting` pending), title `reviewAbout` + instructor name. Default rating 5, comment reset on open.
- Submit path: `useReviewFlow.handleSubmitReview` → `CabinetRouteContainer.handleAddReview` → requires `bookingId`, finds the lesson booking, resolves `exercisedCapability` via `resolveLessonBookingClientExercisedCapability`; if unresolvable it throws `"Review is not authorized for this booking."` → toast `reviewFailed`/`reviewFailedDesc`. On success: `createCanonicalInstructorReview({ accountId, bookingId, rating, comment, exercisedCapability })`, toast `reviewShared`/`reviewSharedDesc`.
- Dismiss: `handleDismissReview` adds the id to `dismissedReviewIds` optimistically, persists to `localStorage['alpine_glide_dismissed_reviews_' + uid]`, then `dismissReviewService`.
- Unreviewed prompt visibility is driven by `reviewBookingStates` (`AccountReviewBookingState.eligible/reviewed`) plus `dismissedReviewIds`; the navbar badge count (`unreviewedCompletedCount`) and the notification hub both consume the same signal.
- Lesson feedback (trainer recommendations / homework): `ParticipantLessonFeedbackList` + `LessonFeedbackIndicator` + `RecommendationIndicator`; toggles call `togglePresentedParticipantLessonFeedbackItem({ accountId, lessonBookingId, itemId, completed })` — **failures are silently swallowed** (`PersonalCabinet.tsx:116-128`, `StudentCabinetShell.tsx:229-239`).

### C.8 Profile editing, participants, preferences

- `/cabinet/profile_participants` (and the `profile_personal` alias) → `ParticipantManagementPanel`:
  - Lists self first, then dependents (`authority === 'parent_guardian'`), each with avatar, name, authority + discipline + skill level, `participantsManagedByYou`; `participantsSelfMissing` warning if no self participant; `participantsNoDependents` when there are none.
  - **Create dependent**: inline form (not a modal) — `participantsDisplayNameLabel`*, age (`participantsAgeLabel`, number 0–125) / birth date (`participantsBirthDateLabel`), skill level, discipline (`participantsDisciplineSki|Snowboard`), instructor comment. Submit → `createDependentParticipant` = two canonical commands: `create_participant` (`exercisedCapability: 'account_owner'`) then `assign_participant_management` with `authority: 'parent_guardian'` (`exercisedCapability: 'parent_guardian'`). Errors shown inline via `presentCanonicalCommandErrorWithContext`.
  - **Edit participant**: same form plus avatar upload (`changeProfilePhoto`, hidden `input[type=file]`, `optimizeProfileImage` → `uploadImage` → `participantAvatarStoragePath(participantId)` → `update_participant_profile` with `avatarUrl`). Self-only field: phone (`t('phone')`), written through `onUpdateProfile({ phoneNumber })` → `profileStore.handleUpdateProfile` → `updateUserProfileService`.
  - `updateManagedParticipantProfile` sends `expectedRevision` and capability by authority (`account_owner` / `parent_guardian`).
  - There is **no delete-participant control** in this scope.
- `/cabinet/profile_preferences`: `ToggleSwitch` `scHideProgressTracking` (`onUpdateProfile({ hideProgressTracking })`, optimistic with revert on error) + sign-out.
- **Wallet/journey/skills/certificates/achievements/season/videos**: see A.1 table. `profile_certificates` and `profile_videos` are empty placeholders.

### C.9 Achievements / progress / skills

- `usePresentedParticipantAchievements({ selectedParticipantId, language, accountReviews, achievementsConfig, skillConfig })` (hardcoded `'ru'` language in `StudentCabinetShell.tsx:217`) drives `/cabinet/profile_achievements` and the today-progress block.
- `useSelectedParticipantAchievementsRecorder` writes earned achievements back per `(accountId, selectedParticipantId)`.
- `useParticipantProgressStore.byId` + `overlaySelfParticipantProgress` / `applyParticipantProgressToProfile` overlay canonical participant progress onto `UserProfile`; `selectCabinetProgressView(byId, participantId)` is the read.
- `LazySkillRadarChart` (→ `SkillRadarChart`, 740 lines) is used in three places: compact (home), full (`development`), full (`profile_skills`); supports pin-to-today and multi-pin via `onPinSkillsToday`.
- Level-up: when the self participant's level changes, `PersonalCabinet` opens `LevelUpModal` (badge image from `https://storage.yandexcloud.net/carve/level/{light|dark}/{b|w}/{level}.png`, `newLevelUnlocked`, `levelUpCongrats`) and auto-closes after 15 s. Also re-openable via `onLevelBadgeClick`.

### C.10 Chat

- `src/features/chat/chatService.ts` (`createChatMessage`, `setChatMessageHomework`, `subscribeToChatMessages`) + `src/features/bookings/components/BookingChatModal.tsx` + `booking_chat/*` (`ChatWindow`, `ChatMessageList`, `ChatInput`, `HomeworkPanel`, `MediaUploader`, `chatCompression`).
- Entry: the per-lesson `t('chat')` button in the calendar list and "open session" from the Today block → `PersonalCabinet` sets `selectedChatBookingId` → `BookingChatModal` (lazy, `ui-modal-overlay` fallback = `t('loading')`).
- Unread: `useBookingChatUnread(uid, bookings)` (`hasUnreadChat`, `markBookingChatRead`) feeds both the button dot and the Today "open session" flow.
- Coach hub chat: `useInstructorBookingMessages(threadIds)` aggregates messages across all bookings/courses with an instructor, feeding the `chat` sub-view of `/cabinet/coach`.
- Thread id resolution helpers live in `src/domain/chat/resolveChatId.ts` (shared + per-enrollment legacy ids).
- **Not reachable by guests.** There is no standalone chat route.

### C.11 Notifications (student)

- Badge: `unreadNotificationCount` (Firestore) + `unreviewedCompletedCount`, `9+` cap, pulse + ping animation.
- `NotificationHubModal` (`src/features/notifications/service.tsx`): "Rate completed lessons" section (`rateCompletedLessons`) with `reviewAction` (closes modal, scrolls `#notify-review-btn-{id}` into view and clicks it) and a dismiss `×` (`hide`); system history (`systemHistory`) with per-item delete (`delete-notif-{id}`) and `newBadge`; footer `clearHistory` (danger); empty → `StateCard noActiveNotifications`; "Load more notifications" when `notificationsHasMore`.
- Opening the hub immediately calls `handleMarkNotificationsAsRead()`.
- Sync: `useNotificationsSync` — `onSnapshot` on `notifications` where `userId == uid`, ordered by `timestamp desc`, paged by `notificationsPageSize`; expired docs filtered (`notificationRetentionDays`); new docs younger than 15 s also fire a toast.
- Toasts (`NotificationProvider`): max 10 kept, 4 visible, auto-dismiss after 6 s, manual close, types `success|warning|info|error` with distinct icons/colours, `role` not set (visual only).

---

## D. PARTICIPANT MODEL

### D.1 Source of truth and read model

- Canonical person identity = `Participant`. Account → Participants via participant-management records.
- Read model: `useManagedParticipants(accountId)` (`src/features/lesson-bookings/useManagedParticipants.ts`) →
  1. waits for `auth.firebaseUser.uid` and `profile.userProfile.uid` to agree with `accountId` (`bootstrapReady`),
  2. `ensureCanonicalSelfParticipant(accountId)` (self Participant is created on demand),
  3. `queryManagedParticipantPickerReadModels({})` → `ManagedParticipantOption[]` with `participantId`, `participantManagementId`, `displayName`, `discipline`, `skillLevel`, `age`, `authority`, `revision`, optional `instructorComment`, optional `avatarUrl`.
- Stale-response protection: every await re-checks `auth.authGeneration`, `firebaseUser.uid`, and `userProfile.uid`; mismatched responses are dropped.
- Exposes `{ participants, loading, error, reload }`. On error, `participants` is set to `[]` and the raw error message is kept in `error`.
- `authority` is `'self' | 'parent_guardian'` (contract allows any string: `readonly authority: 'self' | 'parent_guardian' | string`).

### D.2 How many participants are supported

There is **no hard-coded cap on the number of managed participants** in the read model or in `ParticipantManagementPanel`:
- Creation is repeatable; each dependent gets a fresh `deriveDependentParticipantId(accountId, attemptId)` and its own management record.
- Caps exist only at the *command* level, per operation:
  - Lesson booking: `maxParticipantsPerLesson` from `queryLessonPricingSettingsReadModel` (admin-configured). `toggleParticipantSelection` refuses to add beyond it.
  - Course enrollment: `COURSE_ENROLLMENT_SELECTION_MAX = 8` (client constant, `CourseEnrollmentModal.tsx:56`).
- The UI degrades to a single avatar / no picker for 1 participant; to a multi-chip picker for 2+.

### D.3 Selection store and persistence

- Store: `useCabinetProgressParticipantSelectionStore` (`src/features/student-cabinet/cabinetProgressParticipantSelectionStore.ts`), Zustand, **in-memory only — no `persist` middleware, no `localStorage`, no Firestore**. State = `{ accountId?, selectedParticipantId?, initialized }`. It resets entirely on sign-out/account switch (`accountId !== current → EMPTY_STATE`).
- Shared by the navbar avatar switcher and the cabinet (same store instance), so header and cabinet selection are always consistent.
- Hook: `useCabinetProgressParticipantSelection({ accountId, participants, loading })` → `syncManagedSet` effect + `selectParticipant(participantId)`.
- Pure resolution logic in `cabinetProgressParticipantSelection.ts`:
  - `resolveInitialCabinetProgressParticipantId` — 0 participants → `undefined`; 1 participant → that one; 2+ → the `authority === 'self'` participant (never `participants[0]`).
  - `reconcileCabinetProgressParticipantId` — keeps a still-valid id; if the id is stale and there is exactly 1 participant, falls back to it; if stale with 2+, falls back to `self`; if nothing was selected, stays `undefined` (deliberately **not** forced back to self).
  - `selectParticipant` rejects ids not present in the current set (no-op).
- **Persistence caveat**: because the store is not persisted, a page reload re-derives the selection from the read model — for 2+ participants this always lands back on `self`. Dependent selection is session-only.
- Other per-surface persisted keys: `alpine_glide_lang` (language), `alpine_glide_hide_cancelled_bookings` (calendar filter), `alpine_glide_dismissed_reviews_{uid}` (dismissed review prompts), guest reservation/credential records (`guestReservationLookup.ts`, `guestCredentialStorage.ts`, `guestCourseEnrollmentCredentialStorage.ts`).

### D.4 Which surfaces are participant-scoped

| Surface | Scoping | Evidence |
|---|---|---|
| Avatar / identity shown in cabinet | selected participant | `applyParticipantProgressToProfile(userProfile, selectedProgress)` in `StudentCabinetShell.tsx:267` |
| Progress / level / radar / season stats | selected participant | `selectCabinetProgressView(progressById, selectedProgressParticipantId)`; `useSelectedParticipantLessonStats(selectedParticipantId)` |
| Achievements | selected participant | `usePresentedParticipantAchievements({ selectedParticipantId, … })` |
| Lesson feedback | selected participant + lesson | `useSelectedParticipantLessonFeedback`, `participantLessonFeedbackItemKey(participantId, lessonBookingId, itemId)` |
| Course enrollments in the calendar | selected participant | `filterCabinetCourseDaysForParticipant(sessionItems, selectedProgressParticipantId)` |
| Enrollments in the courses panel | selected participant | `filterEnrollmentsForParticipant(courseEnrollments, selectedProgressParticipantId)` |
| Course CTA state on public cards | selected participant | `selectedParticipantId` → `resolveParticipantScopedCourseEnrollment` / `selectEnrollmentForCourseParticipant` |
| Booking history rows | **not** participant-filtered | `props.bookings` is passed whole to `StudentHistoryPanel`/`StudentCoachPanel`; participant names are shown per row instead |
| Lesson booking creation | multi-participant | `participantIds[]` + `deriveExercisedCapabilityFromParticipants` |
| Navbar avatar switcher | selected participant | `useNavbarParticipantSwitcher` → same store |

### D.5 Behaviour with exactly 1 participant

- Selection auto-resolves to that participant (`resolveInitialCabinetProgressParticipantId` length-1 branch).
- `shouldShowParticipantPicker` returns `false` → `ParticipantPicker` renders `null` (it also early-returns for `participants.length < 2`).
- `CabinetParticipantAvatarSwitcher` sets `interactive = items.length > 1` → renders a single non-interactive `AvatarCircle` with no `role="group"`, no `aria-label`, and no buttons.
- `resolveEffectiveParticipantIds` returns `[soleParticipant.participantId]` regardless of any user selection.
- `CabinetParticipantAvatarSwitcher` falls back to a synthetic `participantId: 'fallback'` item using `userProfile.displayName`/`avatarUrl` when `items` is empty (e.g. participants still loading) — the header therefore never renders empty.
- `requiresExplicitParticipantSelection` → `false`, so booking/enrollment submits without a prompt.

### D.6 Incomplete / invalid participant states present in code

| State | Where | Behaviour |
|---|---|---|
| Loading | `useManagedParticipants.loading` | `ParticipantPicker` renders `t('loading')`; cabinet renders a single-mode picker at the top only on error |
| Read-model error | `useManagedParticipants.error` (`'Failed to load participants.'` fallback) | `StudentCabinetShell` renders a single-mode `ParticipantPicker` with a Retry button; bookings/enrollments are filtered to `[]` |
| Stale selected id | `reconcileCabinetProgressParticipantId` | Falls back to `self` (2+) or the sole participant (1); a `undefined` selection is not auto-restored |
| Empty participant list | `participants = []` | `selectedParticipantId` stays `undefined`; `progressReady` false when >1 expected; `applyParticipantProgressToProfile` gets `undefined` progress; switcher shows the `'fallback'` avatar |
| Account switch / sign-out | store `accountId` mismatch | Whole store reset to `EMPTY_STATE` |
| Self participant missing | `ParticipantManagementPanel` | Amber `participantsSelfMissing` warning; `ensureCanonicalSelfParticipant` is called on every `useManagedParticipants` load to repair it |
| Participants enabled but nothing selected | `requiresProgressSelection && !selectedProgressParticipantId` | `progressReady === false` → `selectCabinetProgressView(byId, undefined)` (no progress view). **Lesson bookings, course days, and the calendar are still rendered unfiltered** — only enrollments and progress views are isolated |
| `authority` unknown string | `CabinetProgressParticipant.authority` allows any string | `findSelfCabinetParticipantId` matches only `'self'`; `orderCabinetParticipantAvatarItems` buckets everything non-`self` as a dependent; `deriveExercisedCapabilityFromParticipants` treats only `'parent_guardian'` as guardian capability (anything else → `account_owner`) |
| `ParticipantPicker.onCreateDependent` | prop exists, never passed | Dependents cannot be created from the booking/enrollment picker — only from the Participants tab |

---

## E. DIALOGS / OVERLAYS

No third-party dialog library is used. `package.json` dependencies: `react`, `react-dom`, `react-router-dom`, `firebase`, `zustand`, `motion`, `lucide-react`, `zod`, `canvas-confetti`, `@ski-academy/shared-domain`. Dialogs are hand-rolled with `motion`/`AnimatePresence` + `createPortal` + `BodyScrollLock` (`src/ui/BodyScrollLock.tsx`).

Modal registry: `src/features/shell/modalRegistry.ts` declares `ModalType = 'booking' | 'courseEnrollment' | 'courseDetails' | 'instructorReviews' | 'notifications' | 'auth'`, but **`ModalHost` does not use `activeModal`** — it renders from independent `useUiStore` flags/entities. The `activeModal`/`ModalState` interface is effectively legacy/dead.

| # | Dialog / overlay | File | Trigger | Purpose | Actions |
|---|---|---|---|---|---|
| 1 | `AuthModal` | `src/features/auth/components/AuthModal.tsx` | Navbar "Sign in" (`setIsAuthModalOpen(true)`) | Login / register / password reset | Close (overlay click, `×`), submit, Google, mode toggle |
| 2 | `BookingModal` (guest/auth shell) | `src/features/bookings/components/BookingModal.tsx` | `InstructorCard` book button → `setSelectedInstructor` | Book a lesson | `AuthModeSliderSwitch`, guest form, inline `Auth`, selectors, submit, close |
| 3 | `GuestReservationStatus` (inline panel, not a portal) | `src/features/guest-reservations/GuestReservationStatus.tsx` | After guest create, or previous-reservation lookup | Track/cancel a guest reservation | Check status, cancel pending (2-step), new booking, close |
| 4 | `CourseEnrollmentModal` (bottom sheet) | `src/features/courses/components/CourseEnrollmentModal.tsx` | Course card CTA / details "Enroll" | Enroll in a group course | Guest/auth switch, picker, submit, close; drag-handle styling on mobile |
| 5 | `CourseDetailsModal` | `src/features/courses/components/CourseDetailsModal.tsx` | Course card "Details" / calendar "More details" | Course info | Close, enroll CTA, FAQ accordion |
| 6 | `InstructorReviewsModal` | `src/features/profile/components/InstructorReviewsModal.tsx` | Instructor rating control | Read public reviews | Close, "load more" → `loadMoreCanonicalInstructorReviews` |
| 7 | `NotificationHubModal` | `src/features/notifications/service.tsx` | Navbar bell | Notification history + review prompts | Close, mark read, delete one, clear all, load more, review action, dismiss prompt |
| 8 | Toast stack | `src/features/notifications/service.tsx:74-116` | `addNotification(...)` anywhere | Transient feedback | Close per toast; auto-dismiss 6 s |
| 9 | `LessonDetailsModal` | `src/features/student-cabinet/components/LessonDetailsModal.tsx` | `scMoreDetails` / open lesson | Lesson detail + recommendations + write review | Close (`aria-label={t('closeBtn')}`), toggle feedback items, write review |
| 10 | `ConfirmActionModal` | `src/features/student-cabinet/components/ConfirmActionModal.tsx` | Cancel lesson / cancel course | Destructive confirm | Confirm (`t('confirm')`), cancel (`t('cancel')`), optional required reason textarea |
| 11 | `ReviewModal` | `src/features/student-cabinet/components/ReviewModal.tsx` | Write-review entry points | Rate + comment on an instructor | 5 stars, comment, submit, close |
| 12 | `LevelUpModal` | `src/features/student-cabinet/components/LevelUpModal.tsx` | Level change or level badge click | Level-up celebration | Close (overlay or `×`); auto-closes after 15 s |
| 13 | `BookingChatModal` | `src/features/bookings/components/BookingChatModal.tsx` | Per-lesson `t('chat')` button | Per-booking chat + homework + media | Send message, homework, upload media, close |
| 14 | `BookInstructorPickerModal` | `src/features/student-cabinet/components/student/BookInstructorPickerModal.tsx` | Bottom FAB "Book" / swipe | Grouped instructor picker | Pick instructor (→ `BookingModal`), "browse courses" → `courses` tab, close |
| 15 | `RescheduleBookingModal` | `src/features/booking-collaboration/components/RescheduleBookingModal.tsx` | `BookingCollaborationActions` reschedule | Pick a new slot | Date, time, confirm, cancel |
| 16 | `Navbar` mobile menu | `src/app/components/Navbar.tsx:351-478` | Hamburger | Mobile nav | Nav links, notifications, theme, language, sign in/out |
| 17 | `Navbar` workspace dropdown | `src/app/components/Navbar.tsx:319-349` | Workspace pill | Switch workspace | Cabinet / instructor links, outside-pointerdown close |
| 18 | `InstructorReviewsModal` load-more | — | — | — | (counted above) |

**Not mounted (dead in this scope)** — verified by full-tree grep, only definition + barrel export:
- `PaymentGateway` (wallet top-up modal) — `src/features/bookings/index.ts:3`
- `UpcomingSessionsStrip`, `UnreviewedCompletedBookingsNotice`, `StudentBookNextFab` (`src/features/student-cabinet/components/…`) — no importers
- `ClientSkillProgressView` (`src/features/profile/index.ts:1`) — no importers
- `StudentSkillEvaluationModal` — instructor-only (`src/features/instructor-workspace/InstructorWorkspace.tsx`)

**Shared UI primitives used** (`src/ui`): `ActionButton` (pending/pendingLabel/size/variant), `BodyScrollLock`, `LazyLoad` (+ `ModalSkeleton`, `CardSkeleton`, `Skeleton`, `AppInitSkeleton`), `StateCard`, `StatusBadge`, `ToggleSwitch`, `ApplePagination`, `AnimatedNumber`, `BannerMedia`, `GuestReservationLimitAlert`, `BannerBackgroundModeControl`. `src/shared`: `logger`, `weatherCondition` (`getWeatherConditionKey`), `queryLimits`, `index`.

---

## F. STATES IN THIS SCOPE

**Empty**
- `noIntensiveCoursesAvailable` (home + cabinet courses), `noCoachesMatch` (+ `resetFilters`), `scNoAvailableCourses`, `scNoAvailableInstructors`, `scNoRecommendations`, `scProfileWalletHistoryEmpty`, `scProfileCertificatesEmpty`, `scProfileVideosEmpty`, `scProfileAchievementsEmpty`, `noActiveNotifications`, `noSessionsScheduledYet`, `noSessionsOnDate`, `allSessionsHidden`, `participantsNoDependents`, `scNoRecommendations`.
- Shared look: `.ui-empty-state` (home instructor list, course sections) or `StateCard` (calendar, wallet, notifications).

**Loading**
- `AppInitSkeleton checkingCredentials` (auth/profile gate, `HomeRouteContainer`, `RouteGate`).
- `RouteLoadingFallback` `aria-busy="true"` (route chunk).
- `CabinetLoadingFallback` = `Skeleton` header + `CardSkeleton count={3}`.
- `ModalLoadingFallback` = overlay + `ModalSkeleton` (BookingModal, CourseEnrollmentModal, CourseDetailsModal, InstructorReviewsModal).
- BookingChatModal lazy fallback: overlay with `t('loading')`.
- Inline: `ParticipantPicker` → `t('loading')`; `StudentWalletHistoryList`/`ParticipantManagementPanel` → `t('loading')`; calendar month → `t('loading')`; time pickers → `t('loading')...`; action buttons use `ActionButton pending` + `t('submitting')` / `t('processing')` / `t('saving')`.

**Error**
- Per-surface: `presentCanonicalCommandErrorWithContext` / `presentCancellationError` messages inside toasts; `calendarMonth.error` inline + `t('retry')`; `ParticipantPicker` error block + Retry; `ParticipantManagementPanel` error + Retry; `occupancyLoadFailed` → `instructorOccupancyLoadFailed` and disabled submit.
- Global: Firestore permission errors → amber `dbStatusWarning` banner (`dbRestricted`, operation, path) with dismiss; `ErrorBoundary` red fallback with "Try again" (hardcoded English) and auto-reload on chunk errors.

**Offline / network**
- No `navigator.onLine` handling and no offline queue anywhere in this scope.
- Indirect handling only: Firebase auth errors mapped to `authNetworkError`; Firestore permission failures surfaced as the amber banner. Resort weather failures fall back to hardcoded defaults with no user-visible error.

**Stale**
- Chunk-load staleness: `isChunkLoadError` → `reloadForStaleChunk()` (`ErrorBoundary`).
- Guest reservation staleness: `isUnusableGuestReservationError` → forget the remembered reservation and show `guestPreviousUnavailable`; recoverable errors show `guestStatusRefreshFailed`.
- Guest cancellation read-model lag: revision must advance, else `cabinetCancellationRefreshWarning`/`cabinetCancellationRefreshWarningDesc`.
- Command/refresh races: `exercisedCapability`/booking no longer available → `cancelStatusChanged` warning; `postCreateRefreshFailedTitle`/`postCreateRefreshFailedBody`; `shouldRefresh` paths refetch `account_hot` before showing a warning.
- Participant selection reconciliation (D.6).
- Occupancy fetch versioning (`occupancyFetchVersionRef`) discards out-of-order responses.
- Resort weather cache is honoured for < 1 h with matching coordinates; `lastUpdated` is computed but **not displayed** in this scope.

**Success**
- Toasts: `lessonBooked`, `enrollmentConfirmed`, `authLoggedIn`, `authWelcomeAcademy`, `reviewShared`, `guestCancelledTitle`, `simulatedPaymentCompleted`, `profilePhotoChanged`, `cabinetCancellationWithdrawn`, `refreshedWallet`, `loggedOut`, `scRadarTasksAddedTitle`.
- Confetti: `canvas-confetti` on confirmed lesson booking (100 particles) and course enrollment (150).
- Level-up modal; guest "confirmed" status body; notification hub unread→read styling; "✔" prefixes on `courseEnrolled` / `courseAwaitingPayment`.

---

## G. L10N / A11Y / RESPONSIVE

### G.1 Localization
- Single dictionary: `src/lib/i18n/translations.ts` (4 728 lines, `translations.en` and `translations.ru` object literals, `TranslationKey` derived from the EN key set). Access via `useLanguage()` → `{ t, language, setLanguage }` (`src/app/providers/LanguageContext.tsx`).
- Key naming conventions in use: `scNav*` (cabinet nav), `scProfile*` (profile hub), `scCalendar*`, `scHistory*`, `guest*`, `auth*`, `course*`, `booking*`, `participants*`, `instructor*`, `collab*`, `journey*`, `notification*`, plus feature-level accessors `getDifficultyLabel`, `getGroupCourseLabel`, `translateCourse`, `translateInstructor`, `translateInstructorName`, `parseCourseDates`, `formatCourseCardDuration`, `formatShortBookingDate`, `getWeatherConditionKey`, `formatPointsCount`, `formatDurationLabel`.
- Interpolation is manual: `t('x').replace('{amount}', …)` / `{deadline}`, `{year}`, `{name}`, `{count}`, `{pointsLabel}`, `{skills}`, `{achievements}`.
- Feature-level translation hooks exist to avoid importing `useLanguage()` in leaf components: `useStudentCabinetTranslations`, `useBookingCollaborationTranslations`.
- `npm run i18n:check` → `scripts/check-translations.mjs` validates key parity.
- **Hardcoded non-`t()` strings present in this scope** (preservation/l10n risk):
  - `src/features/student-cabinet/components/ClientBookingsList.tsx:534` `'Групповой курс' / 'Group course'`; `:594` `'занятий' / 'sessions'`.
  - `src/features/student-cabinet/components/student/StudentWalletHistoryList.tsx:121` `'операций' / 'transactions'`; `:126` button label `"Load more transactions"` (English only).
  - `src/features/student-cabinet/components/student/StudentTodayProgressBlock.tsx:140-144` five hardcoded RU celebratory strings (RU only, never shown in EN); `:163,173,185,193,204,219,232,242` RU/EN inline ternaries.
  - `src/features/student-cabinet/components/student/StudentHomeBottomSections.tsx:81` RU lift-status fallback `'ОТКРЫТО'`.
  - `src/features/bookings/components/booking_modal/useBookingModal.ts:648,658` and `AuthBookingForm.tsx:161,169,176` RU/EN inline ternaries.
  - `src/features/bookings/components/booking_modal/AuthModeSliderSwitch.tsx:27` `aria-label="Режим записи"` (RU only, on a guest-facing control).
  - `src/features/student-cabinet/components/student/StudentHistoryPanel.tsx:123` `"Load more history"` (English only).
  - `src/features/notifications/service.tsx:356` `"Load more notifications"` (English only).
  - `src/features/guest-reservations/GuestReservationStatus.tsx:79` currency symbol chosen by `language === 'ru' ? '₸' : 'KZT'`, bypassing `CurrencyContext`.
  - `src/app/components/ErrorBoundary.tsx:51-61` "Something went wrong" / "Try again" (English only).
  - `src/app/FeaturePageShell.tsx:56` "Ski & Snowboard Instruction" (English only, no key).
  - `src/features/courses/components/course_details/courseEnrichedData.ts` — large RU placeholder program/FAQ/review corpus used when a course has no authored content (RU data leaks into the RU locale even for unrelated courses).
  - `src/features/auth/components/Auth.tsx:22,138,229` fallback display name `'Alpine Glider'` (English).

### G.2 Accessibility
- `aria-label`: nav workspace trigger (`aria-haspopup="menu"`, `aria-expanded`), notification bell (`aria-label` + `title` with count), temperature toggle (`t('mountainTemp')`), close buttons (`t('cancel')` / `t('closeBtn')`), hero pagination, booking date/time/duration/stage pickers, participant switcher buttons (`aria-label` = "Switch to participant {name}" via `formatSwitchToParticipantLabel`, `aria-pressed`, `aria-current`, `data-participant-id`), tab bar buttons (`aria-current="page"`), `AuthModeSliderSwitch` (`role="tablist"`/`tab`/`aria-selected`), `ScProgressBar` (`role="progressbar"` + `aria-valuenow/min/max`), `GuestReservationLimitAlert` (`role="alert"`), `GuestReservationStatus` and guest lookup messages (`role="status"`), `RouteLoadingFallback` (`aria-busy`).
- `role="dialog"` + `aria-modal="true"` on: `BookingAuthShell`, `AuthBookingForm` wrapper, `CourseEnrollmentModal` (+ `aria-labelledby`), `BookInstructorPickerModal` (+ `aria-labelledby`), `LessonDetailsModal`. **Missing** on `AuthModal`, `CourseDetailsModal`, `ConfirmActionModal`, `ReviewModal`, `LevelUpModal`, `RescheduleBookingModal`, `NotificationHubModal`, `PaymentGateway`.
- **Keyboard support is thin.** There is no `Escape`-to-close handler on any dialog in this scope, no focus trap, and no focus restoration on close (closing is always click-overlay or click-button). `LessonDetailsModal`, `BookInstructorPickerModal` and `LevelUpModal` import from `framer-motion` while the rest of the app uses `motion/react` — both are aliased and resolve to the same package in the current build, but the inconsistency is a preservation risk if the dependency is ever swapped.
- Positive: the tab bar, participant switcher, hub lists, calendar days, filters, and modals are all real `<button>` elements (tab-focusable, Enter/Space activatable). Decorative icons are `aria-hidden`. `eslint-plugin-jsx-a11y` is enabled.
- Modal stacking: `LevelUpModal` is `z-[99999]`, `BookingModal`/`CourseEnrollmentModal`/`BookInstructorPickerModal` are `z-[70]`, most others `z-50`; `ConfirmActionModal` uses a non-standard `z-55`.

### G.3 Responsive
- Tailwind v4 (`@tailwindcss/vite`), design tokens as CSS variables in `src/index.css` (`--bg`, `--ink`, `--ink-dim`, `--accent`, `--accent-muted`, `--border`, `--border-subtle`, `--card-bg`, `--profile-bg`, `--surface`, `--radius`, `--layout-divider`, `--hero-ink`, `--app-navbar-height`).
- Shared component classes (defined in `src/index.css`, used as `ui-*`): `ui-navbar`, `ui-navbar-panel`, `ui-card`, `ui-list-row`, `ui-avatar`, `ui-modal`, `ui-modal-overlay`, `ui-empty-state`, `ui-field-plain`, `ui-select`, `ui-chip`, `ui-chip-active`, `ui-label`, `ui-icon-btn`, `ui-section-title`, `ui-section-eyebrow`, `ui-footer`, `ui-site-footer`, `ui-hero`, `hero-*` (`hero-layout`, `hero-stage`, `hero-copy*`, `hero-actions*`, `hero-pagination*`, `hero-banner-media`).
- Breakpoints in use: `sm` (640), `md` (768), `lg` (1024), `xl` (1280), `2xl` (1536), plus arbitrary `max-[1199px]:hidden` (footer) and `max-w-[calc(100vw-2rem)]` (toasts).
- Notable responsive behaviour: navbar collapses to a hamburger `< lg`; hero becomes an edge-to-edge single column with a mobile slide indicator `< md` and a different scrim gradient; resort sidebar becomes a horizontal metric row `< lg`; booking/course modals become bottom sheets `< sm` (drag-handle pill, `rounded-b-none`); the cabinet tab bar is a fixed portal nav with `env(safe-area-inset-bottom)` padding; `YourJourneySection` swaps `DesktopSkillCards`/`MobileSkillCards` via `useBreakpoint`; `GroupCoursesSection` and the cabinet course grids use `gridTemplateColumns: repeat(auto-fill, minmax(260px, 1fr))`.
- Motion: `motion` + `useReducedMotion()` respected in `HeroCarousel`, `GroupCoursesSection`, `InstructorCard`, `YourJourneySection`; `prefers-reduced-motion` also checked manually in the journey draw sequence. `tailwindcss-motion-reduce` utilities used on `GroupCourseCard`.

---

## H. UNKNOWN / UNVERIFIED

1. **Runtime behaviour unverified** — no dev server, no browser, no emulator, no build was run. All findings are from static source. Rendered DOM, focus order, animation timing and Firestore data shapes are inferred, not observed.
2. **`PushNotificationHub.tsx` reachability** — defined in `src/features/notifications/` and not referenced by `AppShell`, `AppRoutes`, `AppBootstrap`, or `ModalHost`; whether it is mounted by `main.tsx`/`index.html` outside this scope was not verified.
3. **Chat media upload / compression** — `MediaUploader` and `chatCompression` were read only by name; storage path, size limits and moderation rules are UNVERIFIED.
4. **`studentHistory.ts` / `studentCabinetUtils.ts` merge rules** — `buildStudentHistory`, `getNeedsAttentionBookings`, `getTodayTasks`, `getInstructorPickerGroups` and the history event taxonomy were located but not fully read; the exact event kinds and filter semantics in `StudentHistoryList` are partially inferred.
5. **`StudentTodayProgressBlock`, `StudentTodaySessionBlocks`, `TodayProgressBlock`, `StudentHomeBottomSections`, `StudentNextStepCard`, `TodayChecklist`** — read only at summary level (their controls are listed from prop names and the parent composition), not line by line.
6. **`StudentCoachPanel` sub-views** (lines 201–676) not read; the `chat/videos/comments/homework/recommendations` panels and `CoachParticipantAccessPanel` internals are inferred from `COACH_HUB_ITEMS` and imports.
7. **Firestore Rules / indexes** — whether `queryManagedParticipantPickerReadModels`, `public_instructor_day` occupancy, `public`/`product` course catalog, or `lesson_pricing_settings` are actually readable by a guest was not checked (out of scope: `firestore.rules`).
8. **Cloud Functions** — guest reservation quotas (`guest_reservation_limit`), the guest credential signing secret, the real reason codes returned for `reservation_expired`, and cancellation policy windows are named in client code but their server semantics are UNVERIFIED.
9. **Copy quality / product intent** — the hardcoded Russian strings listed in G.1 may be intentional or may be drift; the intent is UNVERIFIED. The same applies to the placeholder `profile_certificates` and `profile_videos` panels and to the unsorted `scProfileJourney` preview.
10. **Admin-controlled flags** — `settingsStore.filtersEnabled`, `skillConfig`, `achievementsConfig`, `notificationRetentionDays`, `maxParticipantsPerLesson`, and `additionalParticipantSurchargePerHourKzt` come from Firestore; their real values in production are UNVERIFIED.
11. **`useStoreSync`** (`src/store/useStoreSync.ts`) was not read; which stores subscribe for guests vs authenticated users, and their exact lifecycle, is UNVERIFIED.
12. **Instructor spoken-language set** — `normalizeInstructorSpokenLanguage` / `INSTRUCTOR_SPOKEN_LANGUAGE_KEYS` are in `@ski-academy/shared-domain`; the exact normalised code set behind the 7 filter options is UNVERIFIED.
13. **`/cabinet/instructors` vs `/cabinet/coach`** — they render the same component, but whether `instructors` is a legacy deep link or an intended second entry is a product question (code comment says "Maps deep-link tabs to the bottom navigation item"). UNVERIFIED intent.
14. **`index.html` / `main.tsx` provider tree** — the exact mounting order of `ErrorBoundary`, `LanguageProvider`, `CurrencyProvider`, `NotificationProvider` and `AppBootstrap` was not read (only `AppBootstrap`'s own body).
