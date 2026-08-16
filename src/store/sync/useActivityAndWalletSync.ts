import { useEffect, useRef } from 'react';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';
import { ActivityLog } from '../../types';
import { QUERY_LIMITS } from '../../lib/queryLimits';
import { logger } from '../../lib/logger';
import { syncAchievementActivityLogs } from '../../lib/achievements';
import { migrateAvailabilitySlots } from '../../lib/availabilityMigration';
import { useAuthStore } from '../../features/auth/authStore';
import { useProfileStore } from '../../features/profile/profileStore';
import { useBookingsStore as useBookingStore } from '../../features/bookings/bookingsStore';
import { useCoursesStore as useCourseStore } from '../../features/courses/coursesStore';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { useDataSyncScope } from '../useDataSyncScope';

export const useActivityAndWalletSync = () => {
  const { shouldSyncActivityLogs, shouldSyncReviews } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);
  const activityLogs = useProfileStore((s) => s.activityLogs);
  const bookings = useBookingStore((s) => s.bookings);
  const bookingsLoaded = useBookingStore((s) => s.bookingsLoaded);
  const reviews = useBookingStore((s) => s.reviews);
  const courses = useCourseStore((s) => s.courses);
  const skillConfig = useSettingsStore((s) => s.skillConfig);
  const achievementsConfig = useSettingsStore((s) => s.achievementsConfig);
  const migrationRunningRef = useRef(false);

  // Activity logs — lazy: admin, instructor workspace, or student cabinet
  useEffect(() => {
    if (!firebaseUser || !shouldSyncActivityLogs) {
      useProfileStore.getState().setActivityLogs([]);
      return;
    }

    const activityQuery = query(
      collection(db, 'activity_logs'),
      where('userId', '==', firebaseUser.uid),
      orderBy('timestamp', 'desc'),
      limit(QUERY_LIMITS.activityLogs)
    );

    return onSnapshot(
      activityQuery,
      (snapshot) => {
        const logs = snapshot.docs.map(
          (activityDoc) => ({ id: activityDoc.id, ...activityDoc.data() }) as ActivityLog
        );
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        useProfileStore.getState().setActivityLogs(logs);
      },
      (error) => logger.error('Activity log sync error:', error)
    );
  }, [firebaseUser, shouldSyncActivityLogs]);

  // Availability slot migration (admin)
  useEffect(() => {
    if (userProfile?.role !== 'admin' || !bookingsLoaded || migrationRunningRef.current) {
      return;
    }

    migrationRunningRef.current = true;

    const runMigration = async () => {
      try {
        await migrateAvailabilitySlots(bookings);
      } catch (error) {
        logger.error('Availability slot migration failed:', error);
      } finally {
        migrationRunningRef.current = false;
      }
    };

    runMigration();
  }, [userProfile?.role, bookingsLoaded, bookings]);

  // Achievement sync
  useEffect(() => {
    if (!firebaseUser || !userProfile || userProfile.role !== 'user') return;
    if (!bookingsLoaded) return;
    if (!shouldSyncReviews) return;

    syncAchievementActivityLogs(firebaseUser.uid, {
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
