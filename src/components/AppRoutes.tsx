import React from 'react';
import { AnimatePresence } from 'motion/react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Compass } from 'lucide-react';

import { AdminRoute } from './AdminRoute';
import { AuthRoute } from './AuthRoute';
import { InstructorRoute } from './InstructorRoute';
import { YourJourneySection } from './YourJourneySection';
import { GroupCoursesSection } from './GroupCoursesSection';
import { HeroCarousel } from './HeroCarousel';
import { InstructorCard } from './InstructorCard';
import { LessonFilters } from './LessonFilters';
import { ResortConditionsSidebar } from './ResortConditionsSidebar';
import { ResortConfig } from '../types';
import { useLanguage } from '../lib/LanguageContext';
import { useTheme } from './useTheme';
import { CABINET_TABS, getDefaultWorkspacePath } from '../lib/workspaceRoutes';
import { useInstructorFilters } from './useInstructorFilters';
import { LazyLoad } from './LazyLoad';
import { CardSkeleton, Skeleton } from './ui/Skeleton';

import { useAuthStore } from '../store/authStore';
import { useBookingStore } from '../store/bookingStore';
import { useCourseStore } from '../store/courseStore';
import { useUiStore } from '../store/uiStore';

const AdminPanel = React.lazy(() =>
  import('./AdminPanel').then(({ AdminPanel }) => ({ default: AdminPanel }))
);
const PersonalCabinet = React.lazy(() =>
  import('./PersonalCabinet').then(({ PersonalCabinet }) => ({ default: PersonalCabinet }))
);

const SectionLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="max-w-7xl mx-auto p-6 space-y-6">
    <div className="flex items-center justify-between">
      <Skeleton className="h-6 w-48" />
      <span className="ui-section-eyebrow text-xs">{label}</span>
    </div>
    <CardSkeleton count={3} />
  </div>
);

interface ResortData {
  resortConfig: ResortConfig;
  tempC: number;
  snowDepthCm: number;
  newSnow24h: number;
  windKmh: number;
  weatherCode: number;
  openLifts: number;
  isFahrenheit: boolean;
  isResortLoading: boolean;
  lastUpdated: string;
}

interface AppRoutesProps {
  resortData: ResortData;
  setIsFahrenheit: (value: boolean) => void;
  onRefreshResortStats: () => void;
  onSignOut: () => void;
}

const PersonalCabinetPage: React.FC<{
  forcedMode: 'client' | 'instructor';
  resortData: ResortData;
  setIsFahrenheit: (value: boolean) => void;
  onSignOut: () => void;
}> = ({ forcedMode, resortData, setIsFahrenheit, onSignOut }) => {
  const { t } = useLanguage();
  const userProfile = useAuthStore((s) => s.userProfile);
  const bookings = useBookingStore((s) => s.bookings);
  const reviews = useBookingStore((s) => s.reviews);
  const instructors = useBookingStore((s) => s.instructors);
  const usersList = useAuthStore((s) => s.usersList);
  const dismissedReviewIds = useAuthStore((s) => s.dismissedReviewIds);
  const activityLogs = useAuthStore((s) => s.activityLogs);
  const courses = useCourseStore((s) => s.courses);
  const skillConfig = useUiStore((s) => s.skillConfig);
  const achievementsConfig = useUiStore((s) => s.achievementsConfig);

  const handleDismissReview = useAuthStore((s) => s.handleDismissReview);
  const handleReschedule = useBookingStore((s) => s.handleReschedule);
  const handleRequestCancel = useBookingStore((s) => s.handleRequestCancel);
  const handleAddReview = useBookingStore((s) => s.handleAddReview);
  const handleToggleRecommendation = useBookingStore((s) => s.handleToggleRecommendation);
  const handleToggleSkillToday = useAuthStore((s) => s.handleToggleSkillToday);
  const handlePinSkillsToday = useAuthStore((s) => s.handlePinSkillsToday);
  const handleToggleTodayTaskComplete = useAuthStore((s) => s.handleToggleTodayTaskComplete);
  const handleAddCustomTodayTask = useAuthStore((s) => s.handleAddCustomTodayTask);
  const handleRemoveTodayTask = useAuthStore((s) => s.handleRemoveTodayTask);
  const handleUpdateProfile = useAuthStore((s) => s.handleUpdateProfile);
  const handleBookCourse = useCourseStore((s) => s.handleBookCourse);
  const setSelectedCourseForDetails = useUiStore((s) => s.setSelectedCourseForDetails);
  const setSelectedCourseForAuth = useUiStore((s) => s.setSelectedCourseForAuth);
  const setSelectedInstructor = useUiStore((s) => s.setSelectedInstructor);
  const setReviewsInstructor = useUiStore((s) => s.setReviewsInstructor);
  const setIsOnboardingOpen = useUiStore((s) => s.setIsOnboardingOpen);

  if (!userProfile) return null;

  return (
    <LazyLoad fallback={<SectionLoadingFallback label={t('loading')} />}>
      <PersonalCabinet
        userProfile={userProfile}
        bookings={bookings}
        reviews={reviews}
        dismissedReviewIds={dismissedReviewIds}
        onDismissReview={handleDismissReview}
        onReschedule={handleReschedule}
        onCancel={handleRequestCancel}
        onAddReview={handleAddReview}
        onToggleRecommendation={handleToggleRecommendation}
        onToggleSkillToday={handleToggleSkillToday}
        onPinSkillsToday={handlePinSkillsToday}
        onToggleTodayTaskComplete={handleToggleTodayTaskComplete}
        onAddCustomTodayTask={handleAddCustomTodayTask}
        onRemoveTodayTask={handleRemoveTodayTask}
        onSignOut={onSignOut}
        onUpdateProfile={handleUpdateProfile}
        courses={courses}
        instructors={instructors}
        usersList={usersList}
        skillConfig={skillConfig}
        achievementsConfig={achievementsConfig}
        activityLogs={activityLogs}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onViewCourseDetails={setSelectedCourseForDetails}
        onRequireCourseAuth={setSelectedCourseForAuth}
        onBookCourse={handleBookCourse}
        onBookInstructor={setSelectedInstructor}
        onViewInstructorReviews={setReviewsInstructor}
        forcedMode={forcedMode}
        resortSnapshot={{
          resortConfig: resortData.resortConfig,
          tempC: resortData.tempC,
          snowDepthCm: resortData.snowDepthCm,
          windKmh: resortData.windKmh,
          weatherCode: resortData.weatherCode,
          isFahrenheit: resortData.isFahrenheit,
        }}
        onToggleTemperatureUnit={() => setIsFahrenheit(!resortData.isFahrenheit)}
      />
    </LazyLoad>
  );
};

const CabinetRouteWrapper: React.FC<AppRoutesProps> = (props) => {
  const { tab } = useParams<{ tab?: string }>();
  const userProfile = useAuthStore((s) => s.userProfile);

  if (tab && !CABINET_TABS.includes(tab as (typeof CABINET_TABS)[number])) {
    return <Navigate to="/cabinet" replace />;
  }

  return (
    <AuthRoute userProfile={userProfile}>
      <div className="w-full min-w-0">
        <PersonalCabinetPage
          forcedMode="client"
          resortData={props.resortData}
          setIsFahrenheit={props.setIsFahrenheit}
          onSignOut={props.onSignOut}
        />
      </div>
    </AuthRoute>
  );
};

const InstructorRouteWrapper: React.FC<AppRoutesProps> = (props) => {
  const userProfile = useAuthStore((s) => s.userProfile);

  return (
    <InstructorRoute userProfile={userProfile}>
      <div className="w-full max-w-7xl mx-auto min-w-0">
        <PersonalCabinetPage
          forcedMode="instructor"
          resortData={props.resortData}
          setIsFahrenheit={props.setIsFahrenheit}
          onSignOut={props.onSignOut}
        />
      </div>
    </InstructorRoute>
  );
};

const HomeRoute: React.FC<AppRoutesProps> = ({ resortData, setIsFahrenheit }) => {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const userProfile = useAuthStore((s) => s.userProfile);
  const courses = useCourseStore((s) => s.courses);
  const bookings = useBookingStore((s) => s.bookings);
  const filtersEnabled = useUiStore((s) => s.filtersEnabled);
  const designTheme = useUiStore((s) => s.designTheme);
  const skillConfig = useUiStore((s) => s.skillConfig);
  const handleBookCourse = useCourseStore((s) => s.handleBookCourse);
  const setSelectedInstructor = useUiStore((s) => s.setSelectedInstructor);
  const setSelectedCourseForAuth = useUiStore((s) => s.setSelectedCourseForAuth);
  const setSelectedCourseForDetails = useUiStore((s) => s.setSelectedCourseForDetails);
  const setReviewsInstructor = useUiStore((s) => s.setReviewsInstructor);

  const {
    filteredInstructors,
    searchQuery,
    setSearchQuery,
    selectedSpecialty,
    setSelectedSpecialty,
    selectedLanguage,
    setSelectedLanguage,
    sortBy,
    setSortBy,
    resetFilters,
  } = useInstructorFilters(language);

  const handleScrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (userProfile && userProfile.role !== 'admin') {
    return <Navigate to={getDefaultWorkspacePath(userProfile)} replace />;
  }

  return (
    <>
      <HeroCarousel
        data={{
          slides: resortData.resortConfig.slides,
          language,
          theme,
          designTheme,
          slideIntervalSeconds: resortData.resortConfig.slideIntervalSeconds,
          slidesRandomOrder: resortData.resortConfig.slidesRandomOrder,
          isAuthenticated: Boolean(userProfile),
        }}
        actions={{ onScrollToSection: handleScrollToSection }}
      />

      <YourJourneySection skillConfig={skillConfig} userProfile={null} />

      <div className="flex flex-col lg:grid gap-0 lg:gap-12 theme-air:lg:gap-16 lg:grid-cols-[minmax(140px,200px)_1fr]">
        <ResortConditionsSidebar
          data={{
            language,
            resortConfig: resortData.resortConfig,
            tempC: resortData.tempC,
            snowDepthCm: resortData.snowDepthCm,
            windKmh: resortData.windKmh,
            weatherCode: resortData.weatherCode,
            isFahrenheit: resortData.isFahrenheit,
          }}
          actions={{
            onToggleTemperatureUnit: () => setIsFahrenheit(!resortData.isFahrenheit),
          }}
        />

        <div className="flex flex-col">
          <div
            id="main-content-pane"
            className="p-4 sm:p-8 md:p-10 lg:p-12 space-y-10 sm:space-y-12 theme-air:space-y-16 flex flex-col justify-start min-w-0"
          >
            <GroupCoursesSection
              data={{
                courses,
                bookings,
                userProfile,
                language,
              }}
              actions={{
                onViewDetails: setSelectedCourseForDetails,
                onRequireAuth: setSelectedCourseForAuth,
                onBookCourse: handleBookCourse,
              }}
            />

            <div id="coaches-grid" className="space-y-8 theme-air:space-y-10">
              <div>
                <h3 className="ui-section-title">{t('meetGuides')}</h3>
                <p className="ui-section-eyebrow mt-2">{t('meetGuidesSub')}</p>
              </div>

              {filtersEnabled && (
                <LessonFilters
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  selectedSpecialty={selectedSpecialty}
                  setSelectedSpecialty={setSelectedSpecialty}
                  selectedLanguage={selectedLanguage}
                  setSelectedLanguage={setSelectedLanguage}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                />
              )}

              {filteredInstructors.length === 0 ? (
                <div className="ui-empty-state py-16">
                  <Compass className="w-10 h-10 text-[var(--ink-dim)] mx-auto mb-3" />
                  <p className="text-xs font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                    {t('noCoachesMatch')}
                  </p>
                  <button
                    onClick={resetFilters}
                    className="text-xs font-mono uppercase tracking-widest text-accent text-accent-hover mt-2 hover:underline transition cursor-pointer"
                  >
                    {t('resetFilters')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col">
                  <AnimatePresence initial={false}>
                    {filteredInstructors.map((ins) => (
                      <InstructorCard
                        key={ins.id}
                        instructor={ins}
                        onBook={(i) => setSelectedInstructor(i)}
                        onViewReviews={(i) => setReviewsInstructor(i)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const AdminRouteWrapper: React.FC = () => {
  const { t, language } = useLanguage();
  const userProfile = useAuthStore((s) => s.userProfile);
  const bookings = useBookingStore((s) => s.bookings);
  const usersList = useAuthStore((s) => s.usersList);
  const courses = useCourseStore((s) => s.courses);
  const deletedCompletedStats = useBookingStore((s) => s.deletedCompletedStats);
  const filtersEnabled = useUiStore((s) => s.filtersEnabled);
  const onboardingEnabled = useUiStore((s) => s.onboardingEnabled);
  const notificationRetentionDays = useUiStore((s) => s.notificationRetentionDays);
  const skillConfig = useUiStore((s) => s.skillConfig);
  const achievementsConfig = useUiStore((s) => s.achievementsConfig);

  const { translatedInstructors } = useInstructorFilters(language);

  const handleToggleFilters = useUiStore((s) => s.handleToggleFilters);
  const handleToggleOnboarding = useUiStore((s) => s.handleToggleOnboarding);
  const handleSetNotificationRetentionDays = useUiStore((s) => s.handleSetNotificationRetentionDays);
  const handleUpdateSkillConfig = useUiStore((s) => s.handleUpdateSkillConfig);
  const handleUpdateAchievementsConfig = useUiStore((s) => s.handleUpdateAchievementsConfig);
  const handleUpdateUserRole = useAuthStore((s) => s.handleUpdateUserRole);
  const handleAddInstructor = useBookingStore((s) => s.handleAddInstructor);
  const handleUpdateInstructor = useBookingStore((s) => s.handleUpdateInstructor);
  const handleDeleteInstructor = useBookingStore((s) => s.handleDeleteInstructor);
  const handleConfirmBooking = useBookingStore((s) => s.handleConfirmBooking);
  const handleCompleteBooking = useBookingStore((s) => s.handleCompleteBooking);
  const handleLinkGuestBooking = useBookingStore((s) => s.handleLinkGuestBooking);
  const handleCancel = useBookingStore((s) => s.handleCancel);
  const handleAddUser = useAuthStore((s) => s.handleAddUser);
  const handleUpdateUser = useAuthStore((s) => s.handleUpdateUser);
  const handleDeleteUser = useAuthStore((s) => s.handleDeleteUser);
  const handleReschedule = useBookingStore((s) => s.handleReschedule);
  const handleReassignInstructor = useBookingStore((s) => s.handleReassignInstructor);
  const handleDeleteBooking = useBookingStore((s) => s.handleDeleteBooking);
  const handleAddBooking = useBookingStore((s) => s.handleAddBooking);
  const handleAddCourse = useCourseStore((s) => s.handleAddCourse);
  const handleUpdateCourse = useCourseStore((s) => s.handleUpdateCourse);
  const handleDeleteCourse = useCourseStore((s) => s.handleDeleteCourse);
  const handleClearStudentBookings = useBookingStore((s) => s.handleClearStudentBookings);
  const handleClearCancelledBookings = useBookingStore((s) => s.handleClearCancelledBookings);

  return (
    <AdminRoute userProfile={userProfile}>
      <LazyLoad fallback={<SectionLoadingFallback label={t('loading')} />}>
        <AdminPanel
          instructors={translatedInstructors}
          bookings={bookings}
          usersList={usersList}
          courses={courses}
          deletedCompletedStats={deletedCompletedStats}
          currentUserProfile={userProfile!}
          onUpdateUserRole={handleUpdateUserRole}
          onAddInstructor={handleAddInstructor}
          onUpdateInstructor={handleUpdateInstructor}
          onDeleteInstructor={handleDeleteInstructor}
          onConfirmBooking={handleConfirmBooking}
          onCompleteBooking={handleCompleteBooking}
          onLinkGuestBooking={handleLinkGuestBooking}
          onCancelBooking={handleCancel}
          onAddUser={handleAddUser}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
          onRescheduleBooking={handleReschedule}
          onReassignInstructor={handleReassignInstructor}
          onDeleteBooking={handleDeleteBooking}
          onAddBooking={handleAddBooking}
          onAddCourse={handleAddCourse}
          onUpdateCourse={handleUpdateCourse}
          onDeleteCourse={handleDeleteCourse}
          filtersEnabled={filtersEnabled}
          onToggleFilters={handleToggleFilters}
          onboardingEnabled={onboardingEnabled}
          onToggleOnboarding={handleToggleOnboarding}
          notificationRetentionDays={notificationRetentionDays}
          onSetNotificationRetentionDays={handleSetNotificationRetentionDays}
          skillConfig={skillConfig}
          onUpdateSkillConfig={handleUpdateSkillConfig}
          achievementsConfig={achievementsConfig}
          onUpdateAchievementsConfig={handleUpdateAchievementsConfig}
          onClearStudentBookings={handleClearStudentBookings}
          onClearCancelledBookings={handleClearCancelledBookings}
        />
      </LazyLoad>
    </AdminRoute>
  );
};

export const AppRoutes: React.FC<AppRoutesProps> = (props) => {
  return (
    <Routes>
      <Route path="/admin" element={<AdminRouteWrapper />} />
      <Route path="/cabinet" element={<CabinetRouteWrapper {...props} />} />
      <Route path="/cabinet/:tab" element={<CabinetRouteWrapper {...props} />} />
      <Route path="/instructor" element={<InstructorRouteWrapper {...props} />} />
      <Route path="/" element={<HomeRoute {...props} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
