import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  collection,
  db,
  doc,
  getDoc,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  orderBy,
  query,
  where,
} from '../lib/firebase';
import { UserProfile, Instructor, Review, Booking } from '../types';
import { DEFAULT_SKILL_CONFIG } from '../lib/skillData';
import { DEFAULT_ACHIEVEMENTS_CONFIG, normalizeAchievementsConfig } from '../lib/achievementConfig';
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from '../lib/notificationConfig';
import {
  isNotificationExpired,
  purgeExpiredNotificationsForUser,
} from '../lib/notificationCleanup';
import { parseDesignTheme } from '../lib/designTheme';
import { QUERY_LIMITS } from '../lib/queryLimits';
import { logger } from '../lib/logger';
import { resolveNotificationText, type DbNotification } from '../lib/notificationText';
import { ActivityLog } from '../types';
import { Course } from '../types';
import { syncAchievementActivityLogs } from '../lib/achievements';
import { migrateAvailabilitySlots } from '../lib/availabilityMigration';
import { useAuthStore } from './authStore';
import { useBookingStore } from './bookingStore';
import { useCourseStore } from './courseStore';
import { useUiStore } from './uiStore';
import { useDataSyncScope } from './useDataSyncScope';
import { notify, getLanguage } from './storeContext';

export const useStoreSync = () => {
  const { shouldSyncUsersList, shouldSyncActivityLogs, shouldSyncReviews } = useDataSyncScope();
  const profileUnsubscribeRef = useRef<(() => void) | null>(null);
  const migrationRunningRef = useRef(false);

  // Auth listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      profileUnsubscribeRef.current?.();
      profileUnsubscribeRef.current = null;

      if (user) {
        useAuthStore.getState().setFirebaseUser(user);
        const userRef = doc(db, 'users', user.uid);

        profileUnsubscribeRef.current = onSnapshot(
          userRef,
          (userSnap) => {
            if (userSnap.exists()) {
              const data = userSnap.data() as UserProfile;
              useAuthStore.getState().syncUserProfileFromSnapshot(data);

              if (data.dismissedReviewIds && Array.isArray(data.dismissedReviewIds)) {
                useAuthStore.getState().setDismissedReviewIds(data.dismissedReviewIds);
                localStorage.setItem(
                  `alpine_glide_dismissed_reviews_${user.uid}`,
                  JSON.stringify(data.dismissedReviewIds)
                );
              } else {
                const saved = localStorage.getItem(`alpine_glide_dismissed_reviews_${user.uid}`);
                useAuthStore.getState().setDismissedReviewIds(saved ? JSON.parse(saved) : []);
              }
            } else {
              useAuthStore.getState().syncUserProfileFromSnapshot(null);
            }
            useAuthStore.getState().setAuthLoading(false);
          },
          (error) => {
            logger.error('Auth profile snapshot error:', error);
            useAuthStore.getState().setAuthLoading(false);
          }
        );
      } else {
        useAuthStore.getState().syncUserProfileFromSnapshot(null);
        useAuthStore.getState().setFirebaseUser(null);
        useAuthStore.getState().setDismissedReviewIds([]);
        useAuthStore.getState().setAuthLoading(false);
      }
    });

    return () => {
      profileUnsubscribeRef.current?.();
      profileUnsubscribeRef.current = null;
      unsubscribeAuth();
    };
  }, []);

  // Settings initial load
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsSnapshot = await getDoc(doc(db, 'settings', 'instructor_filters'));
        useUiStore
          .getState()
          .setFiltersEnabled(
            settingsSnapshot.exists() ? (settingsSnapshot.data().enabled ?? true) : true
          );
      } catch {
        useUiStore.getState().setFiltersEnabled(true);
      }

      try {
        const onboardingSnapshot = await getDoc(doc(db, 'settings', 'onboarding'));
        useUiStore
          .getState()
          .setOnboardingEnabled(
            onboardingSnapshot.exists() ? (onboardingSnapshot.data().enabled ?? true) : true
          );
      } catch {
        useUiStore.getState().setOnboardingEnabled(true);
      }

      try {
        const designSnapshot = await getDoc(doc(db, 'settings', 'design_theme'));
        useUiStore
          .getState()
          .setDesignTheme(
            designSnapshot.exists() ? parseDesignTheme(designSnapshot.data().theme) : 'air'
          );
      } catch {
        useUiStore.getState().setDesignTheme('air');
      }

      try {
        const retentionSnapshot = await getDoc(doc(db, 'settings', 'notification_retention'));
        useUiStore
          .getState()
          .setNotificationRetentionDays(
            retentionSnapshot.exists()
              ? (retentionSnapshot.data().days ?? DEFAULT_NOTIFICATION_RETENTION_DAYS)
              : DEFAULT_NOTIFICATION_RETENTION_DAYS
          );
      } catch {
        useUiStore.getState().setNotificationRetentionDays(DEFAULT_NOTIFICATION_RETENTION_DAYS);
      }
    };

    loadSettings();
  }, []);

  // Instructors + settings listeners (always on)
  useEffect(() => {
    const unsubscribers = [
      onSnapshot(
        query(collection(db, 'instructors'), limit(QUERY_LIMITS.instructors)),
        (snapshot) => {
          useBookingStore
            .getState()
            .setInstructors(
              snapshot.docs.map(
                (instructorDoc) => ({ id: instructorDoc.id, ...instructorDoc.data() }) as Instructor
              )
            );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'instructors')
      ),

      onSnapshot(
        doc(db, 'settings', 'skill_config'),
        (snapshot) => {
          if (!snapshot.exists()) return;
          const data = snapshot.data();
          useUiStore.getState().setSkillConfig({
            passPercentage: data.passPercentage ?? 80,
            items:
              Array.isArray(data.items) && data.items.length > 0
                ? data.items
                : DEFAULT_SKILL_CONFIG.items,
          });
        },
        (error) => logger.error('Skill config listener error:', error)
      ),

      onSnapshot(
        doc(db, 'settings', 'achievements_config'),
        (snapshot) => {
          if (!snapshot.exists()) {
            useUiStore.getState().setAchievementsConfig(DEFAULT_ACHIEVEMENTS_CONFIG);
            return;
          }
          useUiStore.getState().setAchievementsConfig(normalizeAchievementsConfig(snapshot.data()));
        },
        (error) => logger.error('Achievements config listener error:', error)
      ),

      onSnapshot(
        doc(db, 'settings', 'design_theme'),
        (snapshot) => {
          if (!snapshot.exists()) {
            useUiStore.getState().setDesignTheme('air');
            return;
          }
          useUiStore.getState().setDesignTheme(parseDesignTheme(snapshot.data().theme));
        },
        (error) => logger.error('Design theme listener error:', error)
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  // Reviews — cabinet, instructor workspace, or instructor reviews modal
  useEffect(() => {
    if (!shouldSyncReviews) {
      useBookingStore.getState().setReviews([]);
      return;
    }

    return onSnapshot(
      query(collection(db, 'reviews'), limit(QUERY_LIMITS.reviews)),
      (snapshot) => {
        useBookingStore
          .getState()
          .setReviews(
            snapshot.docs.map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() }) as Review)
          );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'reviews')
    );
  }, [shouldSyncReviews]);

  // Users list (admin/instructor routes only)
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useAuthStore((s) => s.userProfile);

  useEffect(() => {
    const canReadUsers =
      (userProfile?.role === 'admin' || Boolean(userProfile?.instructorId)) && shouldSyncUsersList;
    if (!firebaseUser || !canReadUsers) {
      useAuthStore.getState().setUsersList([]);
      return;
    }

    return onSnapshot(
      query(collection(db, 'users'), limit(QUERY_LIMITS.users)),
      (snapshot) => {
        useAuthStore
          .getState()
          .setUsersList(
            snapshot.docs
              .filter((userDoc) => userDoc.id !== 'school_global_stats')
              .map((userDoc) => userDoc.data() as UserProfile)
          );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );
  }, [firebaseUser, userProfile?.instructorId, userProfile?.role, shouldSyncUsersList]);

  // Bookings listener
  useEffect(() => {
    if (!firebaseUser) {
      useBookingStore.getState().setBookings([]);
      useBookingStore.getState().setBookingsLoaded(false);
      return;
    }

    useBookingStore.getState().setBookingsLoaded(false);
    const bookingsBase = collection(db, 'bookings');
    const bookingsQuery =
      userProfile?.role === 'admin'
        ? query(bookingsBase, orderBy('date', 'desc'), limit(QUERY_LIMITS.bookings))
        : userProfile?.instructorId
          ? query(
              bookingsBase,
              where('instructorId', '==', userProfile.instructorId),
              orderBy('date', 'desc'),
              limit(QUERY_LIMITS.bookings)
            )
          : query(
              bookingsBase,
              where('userId', '==', firebaseUser.uid),
              orderBy('date', 'desc'),
              limit(QUERY_LIMITS.bookings)
            );

    return onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const list = snapshot.docs.map(
          (bookingDoc) => ({ id: bookingDoc.id, ...bookingDoc.data() }) as Booking
        );
        useBookingStore.getState().setBookings(list.sort((a, b) => b.date.localeCompare(a.date)));
        useBookingStore.getState().setBookingsLoaded(true);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'bookings')
    );
  }, [firebaseUser, userProfile?.instructorId, userProfile?.role]);

  // Deleted completed stats (admin)
  useEffect(() => {
    if (userProfile?.role !== 'admin' || !firebaseUser) {
      useBookingStore.getState().setDeletedCompletedStats({ revenue: 0, count: 0 });
      return;
    }

    const loadDeletedCompletedStats = async () => {
      try {
        const statsDoc = await getDoc(doc(db, 'users', 'school_global_stats'));
        if (statsDoc.exists()) {
          const data = statsDoc.data();
          useBookingStore.getState().setDeletedCompletedStats({
            revenue: data.deletedCompletedRevenue || 0,
            count: data.deletedCompletedCount || 0,
          });
        }
      } catch (error) {
        logger.error('Error fetching stats:', error);
      }
    };

    loadDeletedCompletedStats();
  }, [firebaseUser, userProfile?.role]);

  // Courses listener
  useEffect(() => {
    const coursesQuery = query(collection(db, 'courses'), limit(QUERY_LIMITS.courses));
    return onSnapshot(
      coursesQuery,
      (snapshot) => {
        useCourseStore
          .getState()
          .setCourses(
            snapshot.docs.map((courseDoc) => ({ id: courseDoc.id, ...courseDoc.data() }) as Course)
          );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'courses')
    );
  }, []);

  // Course seat sync
  const bookings = useBookingStore((s) => s.bookings);
  const courses = useCourseStore((s) => s.courses);

  useEffect(() => {
    void useCourseStore.getState().syncCourseSeats();
  }, [
    bookings.map((b) => `${b.id}:${b.status}:${b.isDeleted}`).join(','),
    courses.map((c) => `${c.id}:${c.totalSeats}:${c.availableSeats}`).join(','),
    userProfile?.role,
  ]);

  // Notifications listener
  const notificationRetentionDays = useUiStore((s) => s.notificationRetentionDays);

  useEffect(() => {
    if (!firebaseUser) return;

    void purgeExpiredNotificationsForUser(db, firebaseUser.uid, notificationRetentionDays).catch(
      (error) => logger.error('Notification retention cleanup error:', error)
    );
  }, [firebaseUser, notificationRetentionDays]);

  useEffect(() => {
    if (!firebaseUser) {
      useAuthStore.getState().setDbNotifications([]);
      return;
    }

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', firebaseUser.uid),
      orderBy('timestamp', 'desc'),
      limit(QUERY_LIMITS.notifications)
    );

    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const validNotifications = snapshot.docs
          .map(
            (notificationDoc) =>
              ({ id: notificationDoc.id, ...notificationDoc.data() }) as DbNotification
          )
          .filter(
            (notification) =>
              !isNotificationExpired(notification.timestamp, notificationRetentionDays)
          );

        useAuthStore.getState().setDbNotifications(validNotifications);

        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const notification = change.doc.data() as Omit<DbNotification, 'id'>;
          if (Date.now() - new Date(notification.timestamp).getTime() < 15000) {
            const { title, message } = resolveNotificationText(notification, getLanguage());
            notify(notification.type || 'info', title, message);
          }
        });
      },
      (error) => logger.error('Notifications sync error:', error)
    );
  }, [firebaseUser, notificationRetentionDays]);

  // Activity logs — lazy: admin, instructor workspace, or student cabinet
  useEffect(() => {
    if (!firebaseUser || !shouldSyncActivityLogs) {
      useAuthStore.getState().setActivityLogs([]);
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
        useAuthStore.getState().setActivityLogs(logs);
      },
      (error) => logger.error('Activity log sync error:', error)
    );
  }, [firebaseUser, shouldSyncActivityLogs]);

  // Wallet ledger — student cabinet profile history
  useEffect(() => {
    if (!firebaseUser || !shouldSyncActivityLogs) {
      useAuthStore.getState().setWalletLedgerEntries([]);
      return;
    }

    const ledgerQuery = query(
      collection(db, 'wallet_ledger'),
      where('userId', '==', firebaseUser.uid)
    );

    return onSnapshot(
      ledgerQuery,
      (snapshot) => {
        const entries = snapshot.docs
          .map(
            (ledgerDoc) =>
              ({ id: ledgerDoc.id, ...ledgerDoc.data() }) as import('../types').WalletLedgerEntry
          )
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, QUERY_LIMITS.walletLedger);
        useAuthStore.getState().setWalletLedgerEntries(entries);
      },
      (error) => logger.error('Wallet ledger sync error:', error)
    );
  }, [firebaseUser, shouldSyncActivityLogs]);

  // Availability migration
  const bookingsLoaded = useBookingStore((s) => s.bookingsLoaded);

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
  const reviews = useBookingStore((s) => s.reviews);
  const activityLogs = useAuthStore((s) => s.activityLogs);
  const skillConfig = useUiStore((s) => s.skillConfig);
  const achievementsConfig = useUiStore((s) => s.achievementsConfig);

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
