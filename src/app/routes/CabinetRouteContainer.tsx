import React, { useCallback, useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AuthRoute } from '../../features/shell';
import { useLanguage } from '../../app/providers/LanguageContext';
import { CABINET_TABS } from '../../lib/workspaceRoutes';
import { LazyLoad } from '../../ui/LazyLoad';
import { CardSkeleton, Skeleton } from '../../ui/Skeleton';
import { loadPersonalCabinet } from '../../features/profile';
import { useProfileStore } from '../../features/profile/profileStore';
import { useBookingActions } from '../../features/bookings/useBookingActions';
import { useBookingsStore } from '../../features/bookings/bookingsStore';
import { useCourseActions } from '../../features/courses/useCourseActions';
import { useCoursesStore } from '../../features/courses/coursesStore';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { useWalletStore } from '../../features/wallet/walletStore';
import { useUiStore } from '../../features/shell/uiStore';
import type { AppRoutesProps } from './routeTypes';
import {
  mergeCabinetLessonAndCourseBookings,
  selectLessonBookingItems,
  useLessonBookingCommands,
  useLessonBookingStore,
  deriveCancellationIdempotencyKey,
  presentCanonicalCommandErrorWithContext,
} from '../../features/lesson-bookings';
import { useNotifications } from '../../features/notifications';

const PersonalCabinet = React.lazy(loadPersonalCabinet);

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
  const { addNotification } = useNotifications();
  const userProfile = useProfileStore((state) => state.userProfile);
  const usersList = useProfileStore((state) => state.usersList);
  const dismissedReviewIds = useProfileStore((state) => state.dismissedReviewIds);
  const activityLogs = useProfileStore((state) => state.activityLogs);
  const legacyBookings = useBookingsStore((state) => state.bookings);
  const lessonBookings = useLessonBookingStore(selectLessonBookingItems);
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
  const { handleAddReview, handleToggleRecommendation } = useBookingActions();
  const { requestCancellation, refetchAccountHotBookings } = useLessonBookingCommands(
    userProfile?.uid
  );
  const { handleBookCourse } = useCourseActions();
  const setSelectedCourseForDetails = useUiStore((state) => state.setSelectedCourseForDetails);
  const setSelectedCourseForAuth = useUiStore((state) => state.setSelectedCourseForAuth);
  const setSelectedInstructor = useUiStore((state) => state.setSelectedInstructor);
  const setReviewsInstructor = useUiStore((state) => state.setReviewsInstructor);

  const bookings = useMemo(
    () => mergeCabinetLessonAndCourseBookings(lessonBookings, legacyBookings),
    [lessonBookings, legacyBookings]
  );

  const handleCanonicalCancel = useCallback(
    async (bookingId: string, _reason?: string) => {
      const booking = bookings.find((item) => item.bookingId === bookingId);
      if (!booking) return;
      if (!booking.isLessonBooking) {
        throw new Error('Course cancellation remains on the legacy path until T31.');
      }
      const exercisedCapability =
        booking.partyKind === 'family_group' ? 'parent_guardian' : 'account_owner';
      try {
        await requestCancellation({
          bookingId: booking.bookingId,
          expectedRevision: booking.revision,
          idempotencyKey: deriveCancellationIdempotencyKey(booking.bookingId, booking.revision),
          exercisedCapability,
        });
      } catch (error) {
        const presented = presentCanonicalCommandErrorWithContext(error, {
          t: t as (key: string) => string,
        });
        if (presented.shouldRefresh) {
          await refetchAccountHotBookings?.();
          addNotification('warning', t('requestFailed'), presented.message);
          return;
        }
        throw error;
      }
    },
    [addNotification, bookings, refetchAccountHotBookings, requestCancellation, t]
  );

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
              onCancel={handleCanonicalCancel}
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
