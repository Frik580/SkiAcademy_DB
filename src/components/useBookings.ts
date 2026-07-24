import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { User } from 'firebase/auth';
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  handleFirestoreError,
  onSnapshot,
  OperationType,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '../lib/firebase';
import {
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  isCourseBooking,
  toAvailabilitySlot,
} from '../lib/availabilitySlots';
import {
  cancelBookingWithRefund,
  createBookingWithPayment,
  InsufficientFundsError,
} from '../lib/bookingTransactions';
import { createNotificationForUser } from '../lib/notifications';
import { useLanguage } from '../lib/LanguageContext';
import { Booking, UserProfile } from '../types';
import { useNotifications as useNotificationHub } from './PushNotificationHub';
import { logger } from '../lib/logger';

type SetUserProfile = (profile: UserProfile | null) => void;

export const useBookings = (
  firebaseUser: User | null,
  userProfile: UserProfile | null,
  setUserProfile: SetUserProfile
) => {
  const { addNotification } = useNotificationHub();
  const { language, t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoaded, setBookingsLoaded] = useState(false);
  const [deletedCompletedStats, setDeletedCompletedStats] = useState({ revenue: 0, count: 0 });

  useEffect(() => {
    if (userProfile?.role !== 'admin' || !firebaseUser) {
      setDeletedCompletedStats({ revenue: 0, count: 0 });
      return;
    }

    const loadDeletedCompletedStats = async () => {
      try {
        const statsDoc = await getDoc(doc(db, 'users', 'school_global_stats'));
        if (statsDoc.exists()) {
          const data = statsDoc.data();
          setDeletedCompletedStats({
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

  useEffect(() => {
    if (!firebaseUser) {
      setBookings([]);
      setBookingsLoaded(false);
      return;
    }

    setBookingsLoaded(false);
    const bookingsQuery = userProfile?.role === 'admin'
      ? query(collection(db, 'bookings'))
      : userProfile?.instructorId
        ? query(collection(db, 'bookings'), where('instructorId', '==', userProfile.instructorId))
        : query(collection(db, 'bookings'), where('userId', '==', firebaseUser.uid));

    return onSnapshot(bookingsQuery, (snapshot) => {
      const list = snapshot.docs.map((bookingDoc) => ({
        id: bookingDoc.id,
        ...bookingDoc.data(),
      } as Booking));
      setBookings(list.sort((a, b) => b.date.localeCompare(a.date)));
      setBookingsLoaded(true);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bookings'));
  }, [firebaseUser, userProfile?.instructorId, userProfile?.role]);

  useEffect(() => {
    if (!firebaseUser || bookings.length === 0) return;

    const checkAndCompleteLessons = async () => {
      const now = new Date();
      for (const booking of bookings) {
        if (booking.status !== 'confirmed' && booking.status !== 'pending_cancellation') continue;

        const [year, month, day] = booking.date.split('-').map(Number);
        const [hour, minute] = booking.time.split(':').map(Number);
        const startsAt = new Date(year, month - 1, day, hour, minute, 0);
        const endsAt = new Date(startsAt.getTime() + booking.durationHours * 60 * 60 * 1000);
        if (now < endsAt) continue;

        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'bookings', booking.id), { status: 'completed' });
          if (!isCourseBooking(booking)) {
            batch.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id));
          }
          await batch.commit();
          addNotification(
            'success',
            t('lessonAutoCompleted'),
            `${t('lessonAutoCompletedDesc')} ${booking.instructorName} ${t('lessonAutoCompletedSuffix')}`
          );
        } catch (error) {
          logger.error(`Failed to auto-complete booking ${booking.id}:`, error);
        }
      }
    };

    const interval = window.setInterval(checkAndCompleteLessons, 10000);
    return () => window.clearInterval(interval);
  }, [addNotification, bookings, firebaseUser, language, t]);

  const handleBookingSuccess = async (booking: Booking, totalCost: number) => {
    if (!userProfile || !firebaseUser) return;

    try {
      const newBalance = await createBookingWithPayment(
        db,
        firebaseUser.uid,
        booking,
        totalCost
      );
      setUserProfile({ ...userProfile, balanceUSD: newBalance });
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        throw new Error(t('insufficientFunds'));
      }
      handleFirestoreError(error, OperationType.WRITE, `bookings/${booking.id} (transaction)`);
      throw error;
    }
  };

  const handleReschedule = async (id: string, newDate: string, newTime: string) => {
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    const batch = writeBatch(db);
    batch.update(doc(db, 'bookings', id), { date: newDate, time: newTime });
    if (blocksInstructorAvailability(booking)) {
      batch.set(
        doc(db, AVAILABILITY_SLOTS_COLLECTION, id),
        toAvailabilitySlot({ ...booking, date: newDate, time: newTime })
      );
    }
    await batch.commit();

    if (userProfile?.role === 'admin') {
      await createNotificationForUser(
        booking.userId,
        t('lessonRescheduled'),
        `${t('lessonRescheduledAdminPrefix')} ${booking.instructorName} ${t('lessonRescheduledAdminMiddle')} ${newDate} ${t('lessonRescheduledAdminAt')} ${newTime}.`
      );
    }
  };

  const handleCancel = async (id: string, refundAmount?: number) => {
    if (!firebaseUser) return;
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    const bookingOwnerId = booking.userId;
    const isSystemBlock = bookingOwnerId.startsWith('system_block_');

    try {
      const { refunded } = await cancelBookingWithRefund(db, id, refundAmount);

      if (bookingOwnerId === firebaseUser.uid && userProfile) {
        setUserProfile({ ...userProfile, balanceUSD: userProfile.balanceUSD + refunded });
      }

      if (userProfile?.role === 'admin' && !isSystemBlock) {
        await createNotificationForUser(
          bookingOwnerId,
          t('lessonCancelled'),
          `${t('lessonCancelledDescPrefix')} ${booking.instructorName} ${t('lessonCancelledDescSuffix')}`,
          'warning'
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bookings/${id}/cancel`);
    }
  };

  const handleRequestCancel = async (id: string, reason?: string) => {
    await updateDoc(doc(db, 'bookings', id), {
      status: 'pending_cancellation',
      cancellationReason: reason || '',
    });
  };

  const handleAddBooking = async (booking: Booking) => {
    const isSystemBlock = booking.userId.startsWith('system_block_');
    const userRef = doc(db, 'users', booking.userId);

    try {
      await runTransaction(db, async (transaction) => {
        if (!isSystemBlock) {
          const userSnap = await transaction.get(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data() as UserProfile;
            transaction.update(userRef, {
              balanceUSD: (userData.balanceUSD ?? 0) - booking.totalPrice,
            });
          }
        }

        transaction.set(doc(db, 'bookings', booking.id), booking);
        if (blocksInstructorAvailability(booking)) {
          transaction.set(
            doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id),
            toAvailabilitySlot(booking)
          );
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bookings/${booking.id}/add`);
    }
  };

  const handleDeleteBooking = async (id: string) => {
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    if (booking.status === 'completed') {
      const newStats = {
        revenue: deletedCompletedStats.revenue + (booking.totalPrice || 0),
        count: deletedCompletedStats.count + 1,
      };
      await setDoc(doc(db, 'users', 'school_global_stats'), {
        deletedCompletedRevenue: newStats.revenue,
        deletedCompletedCount: newStats.count,
      }, { merge: true });
      await updateDoc(doc(db, 'bookings', id), { isDeleted: true });
      setDeletedCompletedStats(newStats);
      return;
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, 'bookings', id));
    if (!isCourseBooking(booking)) {
      batch.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, id));
    }
    await batch.commit();
  };

  const handleConfirmBooking = async (id: string) => {
    await updateDoc(doc(db, 'bookings', id), { status: 'confirmed' });
    const booking = bookings.find((item) => item.id === id);
    if (booking) {
      await createNotificationForUser(
        booking.userId,
        t('lessonConfirmedAdmin'),
        `${t('lessonConfirmedDescPrefix')} ${booking.instructorName} ${t('lessonConfirmedDescSuffix')}`,
        'success'
      );
    }
  };

  const handleCompleteBooking = async (id: string) => {
    const booking = bookings.find((item) => item.id === id);
    const batch = writeBatch(db);
    batch.update(doc(db, 'bookings', id), { status: 'completed' });
    if (booking && !isCourseBooking(booking)) {
      batch.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, id));
    }
    await batch.commit();

    if (booking) {
      await createNotificationForUser(
        booking.userId,
        t('lessonCompletedAdmin'),
        `${t('lessonCompletedDescPrefix')} ${booking.instructorName} ${t('lessonCompletedDescSuffix')}`,
        'success'
      );
    }
  };

  const handleLinkGuestBooking = async (bookingId: string, targetUserId: string) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    const oldUserId = booking.userId;
    const isConfirmed = booking.status === 'confirmed';

    let lessonCost = booking.totalPrice || 0;
    let updatedTargetBalance: number | null = null;

    // 1. Check client balance and update booking + user balance in an atomic transaction
    await runTransaction(db, async (transaction) => {
      // If price was 0 on booking, attempt to lookup instructor rate
      if (lessonCost === 0 && booking.instructorId) {
        const instRef = doc(db, 'instructors', booking.instructorId);
        const instSnap = await transaction.get(instRef);
        if (instSnap.exists()) {
          const instData = instSnap.data();
          if (instData.pricePerHour) {
            lessonCost = instData.pricePerHour * (booking.durationHours || 1);
          }
        }
      }

      const targetUserRef = doc(db, 'users', targetUserId);
      const targetUserSnap = await transaction.get(targetUserRef);

      let currentBalance = 0;
      if (targetUserSnap.exists()) {
        const userData = targetUserSnap.data() as UserProfile;
        currentBalance = userData.balanceUSD ?? 0;
      }

      // If booking is confirmed, enforce sufficient funds check
      if (isConfirmed && lessonCost > 0) {
        if (currentBalance < lessonCost) {
          const errMsg = `${t('insufficientFundsForLink') || 'Недостаточно средств на счету клиента для привязки этого занятия.'} (${t('balance') || 'Баланс'}: $${currentBalance}, ${t('costLabel') || 'стоимость'}: $${lessonCost})`;
          throw new Error(errMsg);
        }
        updatedTargetBalance = currentBalance - lessonCost;
        if (targetUserSnap.exists()) {
          transaction.update(targetUserRef, {
            balanceUSD: updatedTargetBalance,
          });
        }
      }

      const bookingRef = doc(db, 'bookings', bookingId);
      transaction.update(bookingRef, {
        userId: targetUserId,
        isGuest: false,
      });
    });

    if (updatedTargetBalance !== null && userProfile && userProfile.uid === targetUserId) {
      setUserProfile({ ...userProfile, balanceUSD: updatedTargetBalance });
    }

    // 2. If guest had a profile record or skill scores, merge scores and reviews
    if (oldUserId && (oldUserId.startsWith('guest_') || booking.isGuest)) {
      try {
        const oldUserDoc = await getDoc(doc(db, 'users', oldUserId));
        if (oldUserDoc.exists()) {
          const oldUserData = oldUserDoc.data();
          if (oldUserData.skillScores && Object.keys(oldUserData.skillScores).length > 0) {
            const targetUserDoc = await getDoc(doc(db, 'users', targetUserId));
            const targetUserData = targetUserDoc.exists() ? targetUserDoc.data() : {};
            const mergedScores = {
              ...(targetUserData.skillScores || {}),
              ...oldUserData.skillScores
            };
            await updateDoc(doc(db, 'users', targetUserId), {
              skillScores: mergedScores
            });
          }
        }

        // Update reviews linked to guest
        const rQuery = query(collection(db, 'reviews'), where('userId', '==', oldUserId));
        const rSnap = await getDocs(rQuery);
        for (const rDoc of rSnap.docs) {
          await updateDoc(doc(db, 'reviews', rDoc.id), {
            userId: targetUserId,
          });
        }
      } catch (err) {
        logger.error('Error linking guest data:', err);
      }
    }

    // 3. Send notification to target user
    await createNotificationForUser(
      targetUserId,
      t('bookingLinkedTitle') || 'Урок добавлен в ваш личный кабинет',
      `${t('bookingLinkedDesc') || 'Администратор привязал урок'} ${booking.instructorName} (${booking.date} @ ${booking.time}) к вашему аккаунту.`,
      'success'
    );
  };

  return {
    bookings,
    bookingsLoaded,
    deletedCompletedStats,
    handleBookingSuccess,
    handleReschedule,
    handleCancel,
    handleRequestCancel,
    handleAddBooking,
    handleDeleteBooking,
    handleConfirmBooking,
    handleCompleteBooking,
    handleLinkGuestBooking,
  };
};
