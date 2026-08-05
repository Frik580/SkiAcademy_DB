import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  db,
  deleteDoc,
  doc,
  getDoc,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from '../lib/firebase';
import { canManageAdminRoles } from '../lib/accessControl';
import { useLanguage } from '../lib/LanguageContext';
import { DEFAULT_SKILL_CONFIG, SkillConfig } from '../lib/skillData';
import {
  AchievementsConfig,
  DEFAULT_ACHIEVEMENTS_CONFIG,
  normalizeAchievementsConfig,
} from '../lib/achievementConfig';
import { Instructor, Review, UserProfile } from '../types';
import { activityLogId, logActivityForUser } from '../lib/activityLog';
import { syncAchievementActivityLogs } from '../lib/achievements';
import { useAvailabilityMigration } from './useAvailabilityMigration';
import { useBookings } from './useBookings';
import { useCourses } from './useCourses';
import { useDismissedReviews } from './useDismissedReviews';
import { useNotifications as useDbNotifications } from './useNotifications';
import { useActivityLog } from './useActivityLog';
import { useNotifications as useNotificationHub } from './PushNotificationHub';
import { QUERY_LIMITS } from '../lib/queryLimits';
import { logger } from '../lib/logger';
import {
  buildAddCustomTodayTaskUpdate,
  buildPinSkillsTodayUpdate,
  buildRemoveTodayTaskUpdate,
  buildToggleSkillTodayUpdate,
  buildToggleTodayCompleteUpdate,
  getNewlyPinnedSkillTitles,
  type TodayTaskRef,
} from '../lib/todayChecklist';
import { grantAndApplyWalletCredit } from '../lib/walletCredit';
import { DesignTheme, parseDesignTheme } from '../lib/designTheme';
import {
  DEFAULT_NOTIFICATION_RETENTION_DAYS,
  MAX_NOTIFICATION_RETENTION_DAYS,
  MIN_NOTIFICATION_RETENTION_DAYS,
} from '../lib/notificationConfig';

type SetUserProfile = (profile: UserProfile | null) => void;

export const useAppLogic = (
  firebaseUser: User | null,
  userProfile: UserProfile | null,
  setUserProfile: SetUserProfile
) => {
  const { addNotification } = useNotificationHub();
  const { t } = useLanguage();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [filtersEnabled, setFiltersEnabled] = useState(true);
  const [onboardingEnabled, setOnboardingEnabled] = useState(true);
  const [designTheme, setDesignTheme] = useState<DesignTheme>('classic');
  const [skillConfig, setSkillConfig] = useState<SkillConfig>(DEFAULT_SKILL_CONFIG);
  const [achievementsConfig, setAchievementsConfig] = useState<AchievementsConfig>(
    DEFAULT_ACHIEVEMENTS_CONFIG
  );
  const [notificationRetentionDays, setNotificationRetentionDays] = useState(
    DEFAULT_NOTIFICATION_RETENTION_DAYS
  );

  const bookingLogic = useBookings(firebaseUser, userProfile, setUserProfile);
  const courseLogic = useCourses(firebaseUser, userProfile, setUserProfile, bookingLogic.bookings);
  const notificationLogic = useDbNotifications(firebaseUser, notificationRetentionDays);
  const activityLogLogic = useActivityLog(firebaseUser);

  useAvailabilityMigration(userProfile?.role, bookingLogic.bookingsLoaded, bookingLogic.bookings);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsSnapshot = await getDoc(doc(db, 'settings', 'instructor_filters'));
        setFiltersEnabled(
          settingsSnapshot.exists() ? (settingsSnapshot.data().enabled ?? true) : true
        );
      } catch {
        setFiltersEnabled(true);
      }

      try {
        const onboardingSnapshot = await getDoc(doc(db, 'settings', 'onboarding'));
        setOnboardingEnabled(
          onboardingSnapshot.exists() ? (onboardingSnapshot.data().enabled ?? true) : true
        );
      } catch {
        setOnboardingEnabled(true);
      }

      try {
        const designSnapshot = await getDoc(doc(db, 'settings', 'design_theme'));
        setDesignTheme(
          designSnapshot.exists() ? parseDesignTheme(designSnapshot.data().theme) : 'classic'
        );
      } catch {
        setDesignTheme('classic');
      }

      try {
        const retentionSnapshot = await getDoc(doc(db, 'settings', 'notification_retention'));
        setNotificationRetentionDays(
          retentionSnapshot.exists()
            ? (retentionSnapshot.data().days ?? DEFAULT_NOTIFICATION_RETENTION_DAYS)
            : DEFAULT_NOTIFICATION_RETENTION_DAYS
        );
      } catch {
        setNotificationRetentionDays(DEFAULT_NOTIFICATION_RETENTION_DAYS);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(
        query(collection(db, 'instructors'), limit(QUERY_LIMITS.instructors)),
        (snapshot) => {
          setInstructors(
            snapshot.docs.map(
              (instructorDoc) =>
                ({
                  id: instructorDoc.id,
                  ...instructorDoc.data(),
                }) as Instructor
            )
          );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'instructors')
      ),

      onSnapshot(
        query(collection(db, 'reviews'), limit(QUERY_LIMITS.reviews)),
        (snapshot) => {
          setReviews(
            snapshot.docs.map(
              (reviewDoc) =>
                ({
                  id: reviewDoc.id,
                  ...reviewDoc.data(),
                }) as Review
            )
          );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'reviews')
      ),

      onSnapshot(
        doc(db, 'settings', 'skill_config'),
        (snapshot) => {
          if (!snapshot.exists()) return;
          const data = snapshot.data();
          setSkillConfig({
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
            setAchievementsConfig(DEFAULT_ACHIEVEMENTS_CONFIG);
            return;
          }
          setAchievementsConfig(normalizeAchievementsConfig(snapshot.data() as AchievementsConfig));
        },
        (error) => logger.error('Achievements config listener error:', error)
      ),

      onSnapshot(
        doc(db, 'settings', 'design_theme'),
        (snapshot) => {
          if (!snapshot.exists()) {
            setDesignTheme('classic');
            return;
          }
          setDesignTheme(parseDesignTheme(snapshot.data().theme));
        },
        (error) => logger.error('Design theme listener error:', error)
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    const canReadUsers = userProfile?.role === 'admin' || Boolean(userProfile?.instructorId);
    if (!firebaseUser || !canReadUsers) {
      setUsersList([]);
      return;
    }

    return onSnapshot(
      query(collection(db, 'users'), limit(QUERY_LIMITS.users)),
      (snapshot) => {
        setUsersList(
          snapshot.docs
            .filter((userDoc) => userDoc.id !== 'school_global_stats')
            .map((userDoc) => userDoc.data() as UserProfile)
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );
  }, [firebaseUser, userProfile?.instructorId, userProfile?.role]);

  const { dismissedReviewIds, handleDismissReview } = useDismissedReviews(userProfile?.uid);

  const handlePaymentSuccess = async (amount: number) => {
    if (!userProfile || !firebaseUser) return;
    const balanceUSD = await grantAndApplyWalletCredit(db, firebaseUser.uid, amount);
    setUserProfile({ ...userProfile, balanceUSD });
  };

  const handleAddReview = async (
    newReviewInput: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>
  ) => {
    if (!userProfile) return;

    const newReview: Review = {
      id: `rev_${Date.now()}`,
      userId: userProfile.uid,
      userName: userProfile.displayName,
      userAvatar: userProfile.avatarUrl,
      date: new Date().toISOString().split('T')[0],
      ...newReviewInput,
    };
    await setDoc(doc(db, 'reviews', newReview.id), newReview);

    const booking = bookingLogic.bookings.find((item) => item.id === newReviewInput.bookingId);
    await logActivityForUser(
      userProfile.uid,
      userProfile.uid,
      'review_created',
      {
        reviewId: newReview.id,
        bookingId: newReviewInput.bookingId,
        instructorId: newReview.instructorId,
        instructorName: booking?.instructorName,
        rating: newReview.rating,
      },
      activityLogId.reviewCreated(newReview.id)
    );

    const instructorReviews = [newReview, ...reviews].filter(
      (review) => review.instructorId === newReview.instructorId
    );
    const averageRating =
      instructorReviews.reduce((sum, review) => sum + review.rating, 0) / instructorReviews.length;
    await updateDoc(doc(db, 'instructors', newReview.instructorId), {
      rating: Number(averageRating.toFixed(1)),
      reviewsCount: instructorReviews.length,
    });
  };

  const handleAddInstructor = async (instructor: Instructor) => {
    await setDoc(doc(db, 'instructors', instructor.id), instructor);
  };

  const handleUpdateInstructor = async (instructor: Instructor) => {
    await setDoc(doc(db, 'instructors', instructor.id), instructor);
    const affectedBookings = bookingLogic.bookings.filter(
      (booking) => booking.instructorId === instructor.id
    );
    if (affectedBookings.length === 0) return;

    const BATCH_SIZE = 400;
    for (let i = 0; i < affectedBookings.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const booking of affectedBookings.slice(i, i + BATCH_SIZE)) {
        batch.update(doc(db, 'bookings', booking.id), {
          instructorName: instructor.name,
          instructorAvatar: instructor.avatarUrl,
        });
      }
      await batch.commit();
    }
  };

  const handleDeleteInstructor = async (id: string) => {
    await deleteDoc(doc(db, 'instructors', id));
  };

  const handleUpdateUserRole = async (targetUid: string, newRole: 'admin' | 'user') => {
    if (!canManageAdminRoles(userProfile)) {
      addNotification('error', t('accessDenied'), t('accessDeniedDesc'));
      return;
    }

    await updateDoc(doc(db, 'users', targetUid), { role: newRole });
    addNotification('success', t('roleUpdated'), `${t('roleUpdatedDescPrefix')} ${newRole}.`);
  };

  const handleAddUser = async (newUser: UserProfile) => {
    await setDoc(doc(db, 'users', newUser.uid), newUser);
  };

  const handleUpdateUser = async (updatedUser: UserProfile) => {
    await updateDoc(doc(db, 'users', updatedUser.uid), { ...updatedUser });
  };

  const handleDeleteUser = async (targetUid: string) => {
    await deleteDoc(doc(db, 'users', targetUid));
  };

  const handleUpdateProfile = async (updatedData: Partial<UserProfile>) => {
    if (!firebaseUser || !userProfile) return;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), updatedData);
      setUserProfile({ ...userProfile, ...updatedData });

      // Keep public instructor card in sync so students can call the coach.
      if (
        userProfile.instructorId &&
        Object.prototype.hasOwnProperty.call(updatedData, 'phoneNumber')
      ) {
        const phoneNumber = (updatedData.phoneNumber || '').trim();
        await updateDoc(doc(db, 'instructors', userProfile.instructorId), {
          phoneNumber,
        });
      }
    } catch (err) {
      logger.error('Profile update failed:', err);
      throw err;
    }
  };

  const handleToggleSkillToday = async (skillItemId: string, pinned: boolean) => {
    if (!firebaseUser || !userProfile) return;
    const updated = buildToggleSkillTodayUpdate(userProfile, skillItemId, pinned);
    await handleUpdateProfile(updated);
  };

  const handlePinSkillsToday = async (skillItemIds: string[]) => {
    if (!firebaseUser || !userProfile || skillItemIds.length === 0) return;
    const addedTitles = getNewlyPinnedSkillTitles(userProfile, skillItemIds, skillConfig.items);
    const updated = buildPinSkillsTodayUpdate(userProfile, skillItemIds);
    await handleUpdateProfile(updated);
    if (addedTitles.length === 0) return;
    addNotification(
      'success',
      t('scRadarTasksAddedTitle'),
      addedTitles.map((title) => `• ${title}`).join('\n')
    );
  };

  const handleToggleTodayTaskComplete = async (taskId: string, done: boolean) => {
    if (!firebaseUser || !userProfile) return;
    const updated = buildToggleTodayCompleteUpdate(userProfile, taskId, done);
    await handleUpdateProfile(updated);
  };

  const handleAddCustomTodayTask = async (text: string) => {
    if (!firebaseUser || !userProfile) return;
    const updated = buildAddCustomTodayTaskUpdate(userProfile, text);
    if (!updated) return;
    await handleUpdateProfile(updated);
  };

  const handleRemoveTodayTask = async (task: TodayTaskRef) => {
    if (!firebaseUser || !userProfile) return;
    const updated = buildRemoveTodayTaskUpdate(userProfile, task);
    await handleUpdateProfile(updated);
  };

  const handleToggleFilters = async (enabled: boolean) => {
    setFiltersEnabled(enabled);
    await setDoc(doc(db, 'settings', 'instructor_filters'), { enabled });
  };

  const handleToggleOnboarding = async (enabled: boolean) => {
    setOnboardingEnabled(enabled);
    await setDoc(doc(db, 'settings', 'onboarding'), { enabled });
  };

  const handleSetDesignTheme = async (theme: DesignTheme) => {
    setDesignTheme(theme);
    await setDoc(doc(db, 'settings', 'design_theme'), { theme });
    addNotification('info', t('designThemeUpdated'), t('designThemeUpdatedDesc'));
  };

  const handleSetNotificationRetentionDays = async (days: number) => {
    const clamped = Math.min(
      MAX_NOTIFICATION_RETENTION_DAYS,
      Math.max(MIN_NOTIFICATION_RETENTION_DAYS, Math.round(days))
    );
    setNotificationRetentionDays(clamped);
    await setDoc(doc(db, 'settings', 'notification_retention'), { days: clamped });
    addNotification(
      'info',
      t('notificationRetentionUpdated'),
      t('notificationRetentionUpdatedDesc')
    );
  };

  const handleUpdateAchievementsConfig = async (config: AchievementsConfig) => {
    const normalized = normalizeAchievementsConfig(config);
    setAchievementsConfig(normalized);
    await setDoc(doc(db, 'settings', 'achievements_config'), normalized);
    addNotification('info', t('achievementsSaved'), t('achievementsSavedDesc'));
  };

  const handleUpdateSkillConfig = async (newConfig: SkillConfig) => {
    setSkillConfig(newConfig);
    await setDoc(doc(db, 'settings', 'skill_config'), newConfig);
    addNotification('info', t('skillTableUpdated'), t('skillTableUpdatedDesc'));
  };

  useEffect(() => {
    if (!firebaseUser || !userProfile || userProfile.role !== 'user') return;
    if (!bookingLogic.bookingsLoaded) return;

    syncAchievementActivityLogs(firebaseUser.uid, {
      userProfile,
      bookings: bookingLogic.bookings,
      courses: courseLogic.courses,
      reviews: reviews.filter((review) => review.userId === firebaseUser.uid),
      skillConfig,
      activityLogs: activityLogLogic.activityLogs,
      achievementsConfig,
    }).catch((error) => logger.error('Achievement sync failed:', error));
  }, [
    firebaseUser,
    userProfile,
    bookingLogic.bookings,
    bookingLogic.bookingsLoaded,
    courseLogic.courses,
    reviews,
    skillConfig,
    achievementsConfig,
    activityLogLogic.activityLogs,
  ]);

  return {
    instructors,
    reviews,
    usersList,
    filtersEnabled,
    onboardingEnabled,
    designTheme,
    notificationRetentionDays,
    skillConfig,
    achievementsConfig,
    dismissedReviewIds,
    handleDismissReview,
    handlePaymentSuccess,
    handleAddReview,
    handleAddInstructor,
    handleUpdateInstructor,
    handleDeleteInstructor,
    handleUpdateUserRole,
    handleAddUser,
    handleUpdateUser,
    handleDeleteUser,
    handleUpdateProfile,
    handleToggleSkillToday,
    handlePinSkillsToday,
    handleToggleTodayTaskComplete,
    handleAddCustomTodayTask,
    handleRemoveTodayTask,
    handleToggleFilters,
    handleToggleOnboarding,
    handleSetDesignTheme,
    handleSetNotificationRetentionDays,
    handleUpdateSkillConfig,
    handleUpdateAchievementsConfig,
    ...bookingLogic,
    ...courseLogic,
    ...notificationLogic,
    ...activityLogLogic,
  };
};
