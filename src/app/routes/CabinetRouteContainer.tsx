import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AuthRoute } from '../../features/shell';
import { useLanguage } from '../../lib/LanguageContext';
import { CABINET_TABS } from '../../lib/workspaceRoutes';
import { LazyLoad } from '../../ui/LazyLoad';
import { CardSkeleton, Skeleton } from '../../ui/Skeleton';
import { useProfileStore } from '../../features/profile';
import { useBookingsStore } from '../../features/bookings';
import { useBookingActions } from '../../features/bookings';
import { useCoursesStore } from '../../features/courses';
import { useCourseActions } from '../../features/courses';
import { useSettingsStore } from '../../features/settings';
import { useWalletStore } from '../../features/wallet';
import { useUiStore } from '../../features/shell';
import type { AppRoutesProps } from './routeTypes';

const PersonalCabinet = React.lazy(() =>
  import('../../features/profile').then(({ PersonalCabinet }) => ({
    default: PersonalCabinet,
  }))
);

const CabinetLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="max-w-7xl mx-auto p-6 space-y-6">
    <div className="flex items-center justify-between">
      <Skeleton className="h-6 w-48" />
      <span className="ui-section-eyebrow text-xs">{label}</span>
    </div>
    <CardSkeleton count={3} />
  </div>
);

/** Connects personal cabinet UI to profile, bookings, courses, wallet and UI state. */
export const CabinetRouteContainer: React.FC<AppRoutesProps> = ({
  resortData,
  setIsFahrenheit,
  onSignOut,
}) => {
  const { tab } = useParams<{ tab?: string }>();
  const { t } = useLanguage();
  const userProfile = useProfileStore((state) => state.userProfile);
  const usersList = useProfileStore((state) => state.usersList);
  const dismissedReviewIds = useProfileStore((state) => state.dismissedReviewIds);
  const activityLogs = useProfileStore((state) => state.activityLogs);
  const bookings = useBookingsStore((state) => state.bookings);
  const reviews = useBookingsStore((state) => state.reviews);
  const instructors = useBookingsStore((state) => state.instructors);
  const courses = useCoursesStore((state) => state.courses);
  const walletLedgerEntries = useWalletStore((state) => state.walletLedgerEntries);
  const skillConfig = useSettingsStore((state) => state.skillConfig);
  const achievementsConfig = useSettingsStore((state) => state.achievementsConfig);
  const handleDismissReview = useProfileStore((state) => state.handleDismissReview);
  const handleToggleSkillToday = useProfileStore((state) => state.handleToggleSkillToday);
  const handlePinSkillsToday = useProfileStore((state) => state.handlePinSkillsToday);
  const handleToggleTodayTaskComplete = useProfileStore(
    (state) => state.handleToggleTodayTaskComplete
  );
  const handleAddCustomTodayTask = useProfileStore((state) => state.handleAddCustomTodayTask);
  const handleRemoveTodayTask = useProfileStore((state) => state.handleRemoveTodayTask);
  const handleUpdateProfile = useProfileStore((state) => state.handleUpdateProfile);
  const { handleReschedule, handleRequestCancel, handleAddReview, handleToggleRecommendation } =
    useBookingActions();
  const { handleBookCourse } = useCourseActions();
  const setSelectedCourseForDetails = useUiStore((state) => state.setSelectedCourseForDetails);
  const setSelectedCourseForAuth = useUiStore((state) => state.setSelectedCourseForAuth);
  const setSelectedInstructor = useUiStore((state) => state.setSelectedInstructor);
  const setReviewsInstructor = useUiStore((state) => state.setReviewsInstructor);
  const setIsOnboardingOpen = useUiStore((state) => state.setIsOnboardingOpen);

  if (tab && !CABINET_TABS.includes(tab as (typeof CABINET_TABS)[number])) {
    return <Navigate to="/cabinet" replace />;
  }

  return (
    <AuthRoute userProfile={userProfile}>
      <div className="w-full min-w-0">
        {userProfile && (
          <LazyLoad fallback={<CabinetLoadingFallback label={t('loading')} />}>
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
              onPinSkillsToday={(skillItemIds) =>
                handlePinSkillsToday(skillItemIds, skillConfig.items)
              }
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
              walletLedgerEntries={walletLedgerEntries}
              onOpenOnboarding={() => setIsOnboardingOpen(true)}
              onViewCourseDetails={setSelectedCourseForDetails}
              onRequireCourseAuth={setSelectedCourseForAuth}
              onBookCourse={handleBookCourse}
              onBookInstructor={setSelectedInstructor}
              onViewInstructorReviews={setReviewsInstructor}
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
        )}
      </div>
    </AuthRoute>
  );
};
