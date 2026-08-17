import React from 'react';
import { AdminRoute } from '../../features/shell';
import { useLanguage } from '../../lib/LanguageContext';
import { useInstructorFilters } from '../../hooks/useInstructorFilters';
import { LazyLoad } from '../../ui/LazyLoad';
import { CardSkeleton, Skeleton } from '../../ui/Skeleton';
import { useProfileStore } from '../../features/profile';
import { useBookingsStore } from '../../features/bookings';
import { useCoursesStore } from '../../features/courses';
import { useCourseActions } from '../../features/courses';
import { useSettingsStore } from '../../features/settings';
import { useAdminActions } from '../../features/admin';

const AdminPanel = React.lazy(() =>
  import('../../features/admin').then(({ AdminPanel }) => ({ default: AdminPanel }))
);

const AdminLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="max-w-7xl mx-auto p-6 space-y-6">
    <div className="flex items-center justify-between">
      <Skeleton className="h-6 w-48" />
      <span className="ui-section-eyebrow text-xs">{label}</span>
    </div>
    <CardSkeleton count={3} />
  </div>
);

/** Connects the admin screen to its feature actions and domain state. */
export const AdminRouteContainer: React.FC = () => {
  const { t, language } = useLanguage();
  const userProfile = useProfileStore((state) => state.userProfile);
  const usersList = useProfileStore((state) => state.usersList);
  const bookings = useBookingsStore((state) => state.bookings);
  const bookingsHasMore = useBookingsStore((state) => state.bookingsHasMore);
  const loadMoreBookings = useBookingsStore((state) => state.loadMoreBookings);
  const deletedCompletedStats = useBookingsStore((state) => state.deletedCompletedStats);
  const courses = useCoursesStore((state) => state.courses);
  const filtersEnabled = useSettingsStore((state) => state.filtersEnabled);
  const onboardingEnabled = useSettingsStore((state) => state.onboardingEnabled);
  const notificationRetentionDays = useSettingsStore((state) => state.notificationRetentionDays);
  const skillConfig = useSettingsStore((state) => state.skillConfig);
  const achievementsConfig = useSettingsStore((state) => state.achievementsConfig);
  const { translatedInstructors } = useInstructorFilters(language);
  const { handleAddCourse, handleUpdateCourse, handleDeleteCourse } = useCourseActions();
  const {
    handleAddInstructor,
    handleUpdateInstructor,
    handleDeleteInstructor,
    handleConfirmBooking,
    handleCompleteBooking,
    handleLinkGuestBooking,
    handleCancelBooking,
    handleRescheduleBooking,
    handleReassignInstructor,
    handleDeleteBooking,
    handleAddBooking,
    handleClearStudentBookings,
    handleClearCancelledBookings,
  } = useAdminActions();
  const handleToggleFilters = useSettingsStore((state) => state.handleToggleFilters);
  const handleToggleOnboarding = useSettingsStore((state) => state.handleToggleOnboarding);
  const handleSetNotificationRetentionDays = useSettingsStore(
    (state) => state.handleSetNotificationRetentionDays
  );
  const handleUpdateSkillConfig = useSettingsStore((state) => state.handleUpdateSkillConfig);
  const handleUpdateAchievementsConfig = useSettingsStore(
    (state) => state.handleUpdateAchievementsConfig
  );
  const handleUpdateUserRole = useProfileStore((state) => state.handleUpdateUserRole);
  const handleAddUser = useProfileStore((state) => state.handleAddUser);
  const handleUpdateUser = useProfileStore((state) => state.handleUpdateUser);
  const handleDeleteUser = useProfileStore((state) => state.handleDeleteUser);

  return (
    <AdminRoute userProfile={userProfile}>
      <LazyLoad fallback={<AdminLoadingFallback label={t('loading')} />}>
        <AdminPanel
          instructors={translatedInstructors}
          bookings={bookings}
          bookingsHasMore={bookingsHasMore}
          onLoadMoreBookings={loadMoreBookings}
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
          onCancelBooking={handleCancelBooking}
          onAddUser={handleAddUser}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
          onRescheduleBooking={handleRescheduleBooking}
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
