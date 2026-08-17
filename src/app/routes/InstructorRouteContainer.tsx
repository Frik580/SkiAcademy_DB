import React from 'react';
import { InstructorRoute } from '../../features/shell';
import { useLanguage } from '../../lib/LanguageContext';
import { LazyLoad } from '../../ui/LazyLoad';
import { CardSkeleton, Skeleton } from '../../ui/Skeleton';
import { useProfileStore } from '../../features/profile';
import { useBookingsStore } from '../../features/bookings';
import { useCoursesStore } from '../../features/courses';
import { useSettingsStore } from '../../features/settings';

const InstructorWorkspace = React.lazy(() =>
  import('../../features/profile').then(({ InstructorWorkspace }) => ({
    default: InstructorWorkspace,
  }))
);

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
