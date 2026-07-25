import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  db,
  deleteDoc,
  doc,
  getDoc,
  handleFirestoreError,
  onSnapshot,
  OperationType,
  query,
  setDoc,
  updateDoc,
} from '../lib/firebase';
import { canManageAdminRoles } from '../lib/accessControl';
import { useLanguage } from '../lib/LanguageContext';
import { DEFAULT_SKILL_CONFIG, SkillConfig } from '../lib/skillData';
import { Instructor, Review, UserProfile } from '../types';
import { useAvailabilityMigration } from './useAvailabilityMigration';
import { useBookings } from './useBookings';
import { useCourses } from './useCourses';
import { useDismissedReviews } from './useDismissedReviews';
import { useNotifications as useDbNotifications } from './useNotifications';
import { useNotifications as useNotificationHub } from './PushNotificationHub';
import { logger } from '../lib/logger';

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
  const [skillConfig, setSkillConfig] = useState<SkillConfig>(DEFAULT_SKILL_CONFIG);

  const bookingLogic = useBookings(firebaseUser, userProfile, setUserProfile);
  const courseLogic = useCourses(firebaseUser, userProfile, setUserProfile, bookingLogic.bookings);
  const notificationLogic = useDbNotifications(firebaseUser);

  useAvailabilityMigration(userProfile?.role, bookingLogic.bookingsLoaded, bookingLogic.bookings);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const settingsSnapshot = await getDoc(doc(db, 'settings', 'instructor_filters'));
        setFiltersEnabled(
          settingsSnapshot.exists() ? (settingsSnapshot.data().enabled ?? true) : true
        );
      } catch {
        setFiltersEnabled(true);
      }
    };

    loadFilters();
  }, []);

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(
        query(collection(db, 'instructors')),
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
        query(collection(db, 'reviews')),
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
      query(collection(db, 'users')),
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
    const balanceUSD = userProfile.balanceUSD + amount;
    await updateDoc(doc(db, 'users', firebaseUser.uid), { balanceUSD });
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
    await Promise.all(
      affectedBookings.map((booking) =>
        updateDoc(doc(db, 'bookings', booking.id), {
          instructorName: instructor.name,
          instructorAvatar: instructor.avatarUrl,
        })
      )
    );
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
    await updateDoc(doc(db, 'users', firebaseUser.uid), updatedData);
    setUserProfile({ ...userProfile, ...updatedData });
  };

  const handleToggleFilters = async (enabled: boolean) => {
    setFiltersEnabled(enabled);
    await setDoc(doc(db, 'settings', 'instructor_filters'), { enabled });
  };

  const handleUpdateSkillConfig = async (newConfig: SkillConfig) => {
    setSkillConfig(newConfig);
    await setDoc(doc(db, 'settings', 'skill_config'), newConfig);
    addNotification('info', t('skillTableUpdated'), t('skillTableUpdatedDesc'));
  };

  return {
    instructors,
    reviews,
    usersList,
    filtersEnabled,
    skillConfig,
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
    handleToggleFilters,
    handleUpdateSkillConfig,
    ...bookingLogic,
    ...courseLogic,
    ...notificationLogic,
  };
};
