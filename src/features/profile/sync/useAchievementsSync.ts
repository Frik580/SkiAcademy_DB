import { useEffect } from 'react';
import { syncAchievementActivityLogs } from '../../../domain/achievements';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useBookingsStore } from '../../bookings/bookingsStore';
import { useCoursesStore } from '../../courses/coursesStore';
import { useSettingsStore } from '../../settings/settingsStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { useProfileStore } from '../profileStore';

/** Persists derived achievements after the data needed to evaluate them is loaded. */
export const useAchievementsSync = () => {
  const { shouldSyncReviews } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);
  const activityLogs = useProfileStore((s) => s.activityLogs);
  const bookings = useBookingsStore((s) => s.bookings);
  const bookingsLoaded = useBookingsStore((s) => s.bookingsLoaded);
  const reviews = useBookingsStore((s) => s.reviews);
  const courses = useCoursesStore((s) => s.courses);
  const skillConfig = useSettingsStore((s) => s.skillConfig);
  const achievementsConfig = useSettingsStore((s) => s.achievementsConfig);

  useEffect(() => {
    if (!firebaseUser || !userProfile || userProfile.role !== 'user') return;
    if (!bookingsLoaded || !shouldSyncReviews) return;

    void syncAchievementActivityLogs(firebaseUser.uid, {
      userProfile,
      bookings,
      courses,
      reviews: reviews.filter((review) => review.userId === firebaseUser.uid),
      skillConfig,
      activityLogs,
      achievementsConfig,
    }).catch((error) => logger.error('Achievement sync failed:', error));
  }, [
    firebaseUser,
    userProfile,
    bookings,
    bookingsLoaded,
    courses,
    reviews,
    skillConfig,
    achievementsConfig,
    activityLogs,
    shouldSyncReviews,
  ]);
};
