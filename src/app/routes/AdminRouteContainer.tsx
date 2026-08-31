import React from 'react';
import { AdminRoute } from '../../features/shell';
import { useLanguage } from '../../app/providers/LanguageContext';
import { useInstructorFilters } from '../../hooks/useInstructorFilters';
import { LazyLoad } from '../../ui/LazyLoad';
import { CardSkeleton, Skeleton } from '../../ui/Skeleton';
import { useProfileStore } from '../../features/profile/profileStore';
import { useBookingsStore } from '../../features/bookings/bookingsStore';
import { useCoursesStore } from '../../features/courses/coursesStore';
import { useCourseActions } from '../../features/courses/useCourseActions';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { useAdminActions } from '../../features/admin/useAdminActions';
import { loadAdminPanel } from '../../features/admin';

const AdminPanel = React.lazy(loadAdminPanel);

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
  const courses = useCoursesStore((state) => state.courses);
  const filtersEnabled = useSettingsStore((state) => state.filtersEnabled);
  const notificationRetentionDays = useSettingsStore((state) => state.notificationRetentionDays);
  const starterCreditUsd = useSettingsStore((state) => state.starterCreditUsd);
  const skillConfig = useSettingsStore((state) => state.skillConfig);
  const achievementsConfig = useSettingsStore((state) => state.achievementsConfig);
  const { translatedInstructors } = useInstructorFilters(language);
  const { handleAddCourse, handleUpdateCourse, handleDeleteCourse } = useCourseActions();
  const { handleAddInstructor, handleUpdateInstructor, handleDeleteInstructor } = useAdminActions();
  const handleToggleFilters = useSettingsStore((state) => state.handleToggleFilters);
  const handleSetNotificationRetentionDays = useSettingsStore(
    (state) => state.handleSetNotificationRetentionDays
  );
  const handleSetStarterCreditUsd = useSettingsStore((state) => state.handleSetStarterCreditUsd);
  const handleUpdateSkillConfig = useSettingsStore((state) => state.handleUpdateSkillConfig);
  const handleUpdateAchievementsConfig = useSettingsStore(
    (state) => state.handleUpdateAchievementsConfig
  );
  const handleUpdateUserRole = useProfileStore((state) => state.handleUpdateUserRole);
  const handleAddUser = useProfileStore((state) => state.handleAddUser);
  const handleUpdateUser = useProfileStore((state) => state.handleUpdateUser);

  return (
    <AdminRoute userProfile={userProfile}>
      <LazyLoad fallback={<AdminLoadingFallback label={t('loading')} />}>
        <AdminPanel
          instructors={translatedInstructors}
          bookings={bookings}
          usersList={usersList}
          courses={courses}
          currentUserProfile={userProfile!}
          onUpdateUserRole={handleUpdateUserRole}
          onAddInstructor={handleAddInstructor}
          onUpdateInstructor={handleUpdateInstructor}
          onDeleteInstructor={handleDeleteInstructor}
          onAddUser={handleAddUser}
          onUpdateUser={handleUpdateUser}
          onAddCourse={handleAddCourse}
          onUpdateCourse={handleUpdateCourse}
          onDeleteCourse={handleDeleteCourse}
          filtersEnabled={filtersEnabled}
          onToggleFilters={handleToggleFilters}
          notificationRetentionDays={notificationRetentionDays}
          onSetNotificationRetentionDays={handleSetNotificationRetentionDays}
          starterCreditUsd={starterCreditUsd}
          onSetStarterCreditUsd={handleSetStarterCreditUsd}
          skillConfig={skillConfig}
          onUpdateSkillConfig={handleUpdateSkillConfig}
          achievementsConfig={achievementsConfig}
          onUpdateAchievementsConfig={handleUpdateAchievementsConfig}
        />
      </LazyLoad>
    </AdminRoute>
  );
};
