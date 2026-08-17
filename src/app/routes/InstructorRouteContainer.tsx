import React from 'react';
import { InstructorRoute } from '../../features/shell';
import { useLanguage } from '../../app/providers/LanguageContext';
import { LazyLoad } from '../../ui/LazyLoad';
import { CardSkeleton, Skeleton } from '../../ui/Skeleton';
import { useProfileStore } from '../../features/profile/profileStore';
import { useBookingsStore } from '../../features/bookings/bookingsStore';
import { useCoursesStore } from '../../features/courses/coursesStore';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { loadInstructorWorkspace } from '../../features/instructor-workspace';

const InstructorWorkspace = React.lazy(loadInstructorWorkspace);

const InstructorLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="max-w-7xl mx-auto p-6 space-y-6">
    <div className="flex items-center justify-between">
      <Skeleton className="h-6 w-48" />
      <span className="ui-section-eyebrow text-xs">{label}</span>
    </div>
    <CardSkeleton count={3} />
  </div>
);

/** Connects the instructor workspace to instructor-scoped data. */
export const InstructorRouteContainer: React.FC = () => {
  const { t } = useLanguage();
  const userProfile = useProfileStore((state) => state.userProfile);
  const usersList = useProfileStore((state) => state.usersList);
  const instructors = useBookingsStore((state) => state.instructors);
  const allBookings = useBookingsStore((state) => state.bookings);
  const reviews = useBookingsStore((state) => state.reviews);
  const courses = useCoursesStore((state) => state.courses);
  const skillConfig = useSettingsStore((state) => state.skillConfig);

  return (
    <InstructorRoute userProfile={userProfile}>
      <div className="w-full max-w-7xl mx-auto min-w-0">
        {userProfile && (
          <LazyLoad fallback={<InstructorLoadingFallback label={t('loading')} />}>
            <InstructorWorkspace
              userProfile={userProfile}
              instructors={instructors}
              allBookings={allBookings}
              reviews={reviews}
              courses={courses}
              usersList={usersList}
              skillConfig={skillConfig}
            />
          </LazyLoad>
        )}
      </div>
    </InstructorRoute>
  );
};
