import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { User } from 'firebase/auth';
import {
  db,
  collection,
  doc,
  getDoc,
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
import { createNotificationForUser } from '../lib/notifications';
import { useLanguage } from '../lib/LanguageContext';
import { Booking, Course, UserProfile } from '../types';
import { useNotifications as useNotificationHub } from './PushNotificationHub';

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
        console.error('Error fetching stats:', error);
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
          console.error(`Failed to auto-complete booking ${booking.id}:`, error);
        }
      }
    };

    const interval = window.setInterval(checkAndCompleteLessons, 10000);
    return () => window.clearInterval(interval);
  }, [addNotification, bookings, firebaseUser, language, t]);

  const handleBookingSuccess = async (booking: Booking, totalCost: number) => {
    if (!userProfile || !firebaseUser) return;

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('User profile does not exist.');

        const currentBalance = userSnap.data().balanceUSD ?? 0;
        if (currentBalance < totalCost) throw new Error(t('insufficientFunds'));

        transaction.set(doc(db, 'bookings', booking.id), booking);
        if (blocksInstructorAvailability(booking)) {
          transaction.set(
            doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id),
            toAvailabilitySlot(booking)
          );
        }
        transaction.update(userRef, { balanceUSD: currentBalance - totalCost });
      });

      setUserProfile({ ...userProfile, balanceUSD: userProfile.balanceUSD - totalCost });
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (error) {
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

    const bookingRef = doc(db, 'bookings', id);
    const bookingOwnerId = booking.userId;
    const isSystemBlock = bookingOwnerId.startsWith('system_block_');
    const userRef = doc(db, 'users', bookingOwnerId);

    try {
      await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(bookingRef);
        if (!bookingSnap.exists()) throw new Error('Booking does not exist.');

        const bookingData = bookingSnap.data() as Booking;
        if (bookingData.status === 'cancelled') return;

        const userSnap = isSystemBlock ? null : await transaction.get(userRef);
        const courseId = isCourseBooking(bookingData)
          ? bookingData.instructorId.substring('course_'.length)
          : null;
        const courseRef = courseId ? doc(db, 'courses', courseId) : null;
        const courseSnap = courseRef ? await transaction.get(courseRef) : null;
        const refund = bookingData.status === 'completed'
          ? 0
          : (refundAmount ?? bookingData.totalPrice ?? 0);

        if (userSnap?.exists()) {
          const userData = userSnap.data() as UserProfile;
          transaction.update(userRef, { balanceUSD: (userData.balanceUSD ?? 0) + refund });
        }

        transaction.update(bookingRef, { status: 'cancelled' });
        if (!isCourseBooking(bookingData)) {
          transaction.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, id));
        }

        if (courseRef && courseSnap?.exists()) {
          const courseData = courseSnap.data() as Course;
          transaction.update(courseRef, {
            availableSeats: Math.min(courseData.totalSeats, courseData.availableSeats + 1),
          });
        }
      });

      if (bookingOwnerId === firebaseUser.uid && userProfile) {
        const refund = booking.status === 'completed'
          ? 0
          : (refundAmount ?? booking.totalPrice ?? 0);
        setUserProfile({ ...userProfile, balanceUSD: userProfile.balanceUSD + refund });
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
  };
};
