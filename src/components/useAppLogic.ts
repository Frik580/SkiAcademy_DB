import { useState, useEffect } from 'react';
import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  OperationType,
  handleFirestoreError,
  runTransaction
} from '../lib/firebase';
import { UserProfile, Instructor, Booking, Review, Course } from '../types';
import { useNotifications } from '../components/PushNotificationHub';
import { useLanguage, parseDurationHours, splitCourseDates } from '../lib/LanguageContext';
import confetti from 'canvas-confetti';
import { User } from 'firebase/auth';

export const useAppLogic = (firebaseUser: User | null, userProfile: UserProfile | null, setUserProfile: (profile: UserProfile | null) => void) => {
  const { addNotification } = useNotifications();
  const { language } = useLanguage();

  // App Domain State
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [dbNotifications, setDbNotifications] = useState<any[]>([]);
  const [deletedCompletedStats, setDeletedCompletedStats] = useState<{ revenue: number; count: number }>({ revenue: 0, count: 0 });
  const [filtersEnabled, setFiltersEnabled] = useState<boolean>(true);

  // Load initial settings and stats
  useEffect(() => {
    const loadInitialData = async () => {
      // Load Settings
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'instructor_filters'));
        setFiltersEnabled(settingsSnap.exists() ? (settingsSnap.data().enabled ?? true) : true);
      } catch (e) {
        setFiltersEnabled(true);
      }

      // Fetch admin stats
      if (userProfile?.role === 'admin' && firebaseUser) {
        try {
          const statsDoc = await getDoc(doc(db, 'users', 'school_global_stats'));
          if (statsDoc.exists()) {
            const data = statsDoc.data();
            setDeletedCompletedStats({ revenue: data.deletedCompletedRevenue || 0, count: data.deletedCompletedCount || 0 });
          }
        } catch (err) {
          console.error("Error fetching stats:", err);
        }
      }
    };

    loadInitialData();
  }, [firebaseUser, userProfile]);

  // Real-time Firestore sync
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Courses
    const coursesQuery = query(collection(db, 'courses'));
    unsubscribers.push(onSnapshot(coursesQuery, (snap) => {
      const courseList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Course));
      setCourses(courseList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses')));

    // Instructors
    const instructorsQuery = query(collection(db, 'instructors'));
    unsubscribers.push(onSnapshot(instructorsQuery, (snap) => {
      const instructorList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Instructor));
      setInstructors(instructorList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'instructors')));

    // Reviews
    const reviewsQuery = query(collection(db, 'reviews'));
    unsubscribers.push(onSnapshot(reviewsQuery, (snap) => {
      const reviewList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Review));
      setReviews(reviewList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')));

    if (firebaseUser) {
      const isAdminUser = userProfile?.role === 'admin';
      const isInstructorUser = !!userProfile?.instructorId;

      // Bookings
      const bookingsQuery = (isAdminUser || isInstructorUser)
        ? query(collection(db, 'bookings'))
        : query(collection(db, 'bookings'), where('userId', '==', firebaseUser.uid));
      unsubscribers.push(onSnapshot(bookingsQuery, (snap) => {
        const list: Booking[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
        setBookings(list.sort((a, b) => b.date.localeCompare(a.date)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')));

      // Users List (Admin and Instructor)
      if (isAdminUser || isInstructorUser) {
        const usersQuery = query(collection(db, 'users'));
        unsubscribers.push(onSnapshot(usersQuery, (snap) => {
          const ulist: UserProfile[] = snap.docs
            .filter(d => d.id !== 'school_global_stats')
            .map(d => d.data() as UserProfile);
          setUsersList(ulist);
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'users')));
      } else {
        setUsersList([]);
      }

      // Notifications
      const notificationsQuery = query(collection(db, 'notifications'), where('userId', '==', firebaseUser.uid));
      unsubscribers.push(onSnapshot(notificationsQuery, (snap) => {
        const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setDbNotifications(list);

        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (Date.now() - new Date(data.timestamp).getTime() < 15000) {
              addNotification(data.type || 'info', data.title, data.message);
            }
          }
        });
      }, (err) => console.error('Notifications sync error:', err)));
    } else {
      setBookings([]);
      setUsersList([]);
      setDbNotifications([]);
    }

    return () => unsubscribers.forEach(unsub => unsub());
  }, [firebaseUser, userProfile, addNotification]);

  // Auto-sync course seats
  const bookingsDeps = bookings.map((b) => `${b.id}:${b.status}:${b.isDeleted}`).join(',');
  const coursesDeps = courses.map((c) => `${c.id}:${c.totalSeats}:${c.availableSeats}`).join(',');
  useEffect(() => {
    if (userProfile?.role !== 'admin' || courses.length === 0) return;
    const syncCourseSeats = async () => {
      for (const course of courses) {
        const activeBookingsCount = bookings.filter(b => b.instructorId === `course_${course.id}` && b.status !== 'cancelled' && !b.isDeleted).length;
        const realAvailableSeats = Math.max(0, course.totalSeats - activeBookingsCount);
        if (course.availableSeats !== realAvailableSeats) {
          console.log(`[Auto-Sync] Correcting seats for ${course.title}: local=${course.availableSeats}, real=${realAvailableSeats}`);
          try {
            await updateDoc(doc(db, 'courses', course.id), { availableSeats: realAvailableSeats });
          } catch (err) {
            console.error(`Failed to auto-sync seats for course ${course.id}:`, err);
          }
        }
      }
    };
    syncCourseSeats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.role, bookingsDeps, coursesDeps]);

  // Auto-complete past lessons
  useEffect(() => {
    if (!firebaseUser || bookings.length === 0) return;
    const checkAndCompleteLessons = async () => {
      const now = new Date();
      for (const b of bookings) {
        if (b.status === 'confirmed' || b.status === 'pending_cancellation') {
          const [year, month, day] = b.date.split('-').map(Number);
          const [hour, minute] = b.time.split(':').map(Number);
          const endDate = new Date(new Date(year, month - 1, day, hour, minute, 0).getTime() + b.durationHours * 60 * 60 * 1000);
          if (now >= endDate) {
            try {
              await updateDoc(doc(db, 'bookings', b.id), { status: 'completed' });
              addNotification(
                'success',
                language === 'en' ? 'Lesson Auto-Completed' : 'Урок автоматически завершен',
                language === 'en' ? `Lesson with ${b.instructorName} has ended.` : `Занятие с ${b.instructorName} завершилось.`
              );
            } catch (e) {
              console.error(`Failed to auto-complete booking ${b.id}:`, e);
            }
          }
        }
      }
    };
    const interval = setInterval(checkAndCompleteLessons, 10000);
    return () => clearInterval(interval);
  }, [bookings, firebaseUser, language, addNotification]);

  // Dismissed review notification IDs
  const [dismissedReviewIds, setDismissedReviewIds] = useState<string[]>([]);
  useEffect(() => {
    if (userProfile?.uid) {
      const saved = localStorage.getItem(`alpine_glide_dismissed_reviews_${userProfile.uid}`);
      setDismissedReviewIds(saved ? JSON.parse(saved) : []);
    } else {
      setDismissedReviewIds([]);
    }
  }, [userProfile?.uid]);

  const handleDismissReview = (bookingId: string) => {
    if (userProfile?.uid) {
      const updated = [...dismissedReviewIds, bookingId];
      setDismissedReviewIds(updated);
      localStorage.setItem(`alpine_glide_dismissed_reviews_${userProfile.uid}`, JSON.stringify(updated));
    }
  };

  const createNotificationForUser = async (userId: string, title: string, message: string, type: 'info' | 'warning' | 'success' = 'info') => {
    if (userId.startsWith('system_block_')) return;
    const notification = { userId, title, message, type, timestamp: new Date().toISOString(), isRead: false };
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    try {
      await setDoc(doc(db, 'notifications', notifId), notification);
    } catch (e) {
      console.error("Failed to create notification:", e);
    }
  };

  const handlePaymentSuccess = async (amount: number) => {
    if (!userProfile || !firebaseUser) return;
    const newBal = userProfile.balanceUSD + amount;
    await updateDoc(doc(db, 'users', firebaseUser.uid), { balanceUSD: newBal });
    setUserProfile({ ...userProfile, balanceUSD: newBal });
  };

  const handleBookingSuccess = async (booking: Booking, totalCost: number) => {
    if (!userProfile || !firebaseUser) return;
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
          throw new Error('User profile does not exist.');
        }
        const currentBalance = userSnap.data().balanceUSD ?? 0;
        if (currentBalance < totalCost) {
          throw new Error(language === 'en' ? 'Insufficient funds.' : 'Недостаточно средств на балансе.');
        }
        const newBal = currentBalance - totalCost;
        const bookingRef = doc(db, 'bookings', booking.id);
        transaction.set(bookingRef, booking);
        transaction.update(userRef, { balanceUSD: newBal });
      });
      const newBal = userProfile.balanceUSD - totalCost;
      setUserProfile({ ...userProfile, balanceUSD: newBal });
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `bookings/${booking.id} (transaction)`);
      throw err;
    }
  };

  const handleReschedule = async (id: string, newDate: string, newTime: string) => {
    await updateDoc(doc(db, 'bookings', id), { date: newDate, time: newTime });
    const booking = bookings.find(b => b.id === id);
    if (booking && userProfile?.role === 'admin') {
      await createNotificationForUser(
        booking.userId,
        language === 'en' ? 'Lesson Rescheduled' : 'Урок перенесен',
        language === 'en'
          ? `Your lesson with ${booking.instructorName} was rescheduled to ${newDate} at ${newTime}.`
          : `Ваш урок с ${booking.instructorName} перенесен на ${newDate} в ${newTime}.`
      );
    }
  };

  const handleAddCourse = async (course: Course) => {
    await setDoc(doc(db, 'courses', course.id), course);
  };

  const handleUpdateCourse = async (course: Course) => {
    await updateDoc(doc(db, 'courses', course.id), course as any);
    if (userProfile?.role === 'admin') {
      const oldCourse = courses.find((c) => c.id === course.id);
      const courseBookings = bookings.filter(b => b.instructorId === `course_${course.id}` && b.status !== 'cancelled');
      let changeDetails = '';
      if (oldCourse) {
        if (oldCourse.title !== course.title) {
          changeDetails += language === 'en'
            ? `• Title changed to "${course.title}".\n`
            : `• Название изменено на «${course.title}».\n`;
        }
        if (oldCourse.dates !== course.dates) {
          changeDetails += language === 'en'
            ? `• New dates: ${course.dates}.\n`
            : `• Новые даты: ${course.dates}.\n`;
        }
      }
      const message = language === 'en'
        ? `An administrator has updated details for the course "${course.title}":\n${changeDetails || 'Course details have been updated.'}`
        : `Администратор обновил информацию курса «${course.title}»:\n${changeDetails || 'Детали курса были обновлены.'}`;
      for (const booking of courseBookings) {
        await createNotificationForUser(
          booking.userId,
          language === 'en' ? 'Course Modified' : 'Курс изменен',
          message,
          'warning'
        );
      }
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    await deleteDoc(doc(db, 'courses', courseId));
  };

  const handleBookCourse = async (courseId: string) => {
    if (!userProfile || !firebaseUser) {
      addNotification(
        'warning',
        language === 'en' ? 'Sign In Required' : 'Требуется войти',
        language === 'en' ? 'Sign in to enroll in courses.' : 'Войдите, чтобы записаться на курсы.'
      );
      return;
    }
    if (userProfile.isClientActive === false) {
      addNotification(
        'error',
        language === 'en' ? 'Booking Restricted' : 'Запись ограничена',
        language === 'en'
          ? 'Your student account is suspended. You cannot register for courses.'
          : 'Ваш аккаунт ученика приостановлен. Вы не можете записываться на курсы.'
      );
      return;
    }

    const courseDocRef = doc(db, 'courses', courseId);
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const bookingId = `booking_course_${firebaseUser.uid}_${courseId}`;
    const bookingDocRef = doc(db, 'bookings', bookingId);

    try {
      let courseTitle = '';
      await runTransaction(db, async (transaction) => {
        const courseSnap = await transaction.get(courseDocRef);
        const userSnap = await transaction.get(userDocRef);
        const bookingSnap = await transaction.get(bookingDocRef);

        if (!courseSnap.exists()) {
          throw new Error('Course does not exist.');
        }
        if (!userSnap.exists()) {
          throw new Error('User profile does not exist.');
        }

        const courseData = courseSnap.data() as Course;
        const userData = userSnap.data() as UserProfile;
        courseTitle = courseData.title;

        // Check if user is already enrolled
        if (bookingSnap.exists()) {
          const bookingData = bookingSnap.data();
          if (bookingData.status !== 'cancelled' && !bookingData.isDeleted) {
            throw new Error('ALREADY_ENROLLED');
          }
        }

        // Check active seats
        if (courseData.availableSeats <= 0) {
          throw new Error('COURSE_FULL');
        }

        // Check balance
        if (userData.balanceUSD < courseData.price) {
          throw new Error('INSUFFICIENT_FUNDS');
        }

        const newBal = userData.balanceUSD - courseData.price;
        const newSeats = courseData.availableSeats - 1;

        const { datePart, timePart } = splitCourseDates(courseData.dates);
        const newBooking: Booking = {
          id: bookingId,
          userId: userData.uid,
          instructorId: `course_${courseId}`,
          instructorName: `${courseData.title} (Group Course)`,
          instructorAvatar: courseData.bgImageUrl,
          date: datePart || courseData.dates,
          time: timePart || 'Group Schedule',
          durationHours: parseDurationHours(courseData.duration, 10),
          totalPrice: courseData.price,
          status: 'confirmed',
          difficulty: 'intermediate',
          notes: `Group Course enrollment: ${courseData.description}`
        };

        // Write updates
        transaction.update(userDocRef, { balanceUSD: newBal });
        transaction.update(courseDocRef, { availableSeats: newSeats });
        transaction.set(bookingDocRef, newBooking);
      });

      // Update local state after transaction succeeds
      const courseObj = courses.find(c => c.id === courseId);
      if (courseObj) {
        setUserProfile({ ...userProfile, balanceUSD: userProfile.balanceUSD - courseObj.price });
      }

      addNotification(
        'success',
        language === 'en' ? 'Enrollment Confirmed!' : 'Запись подтверждена!',
        language === 'en' ? `You have successfully enrolled in ${courseTitle}.` : `Вы успешно записались на курс «${courseTitle}».`
      );
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    } catch (err: any) {
      if (err.message === 'ALREADY_ENROLLED') {
        addNotification(
          'warning',
          language === 'en' ? 'Already Enrolled' : 'Вы уже записаны',
          language === 'en' ? 'You are already registered for this course.' : 'Вы уже зарегистрированы на этот курс.'
        );
      } else if (err.message === 'COURSE_FULL' || err.message === 'INSUFFICIENT_FUNDS') {
        addNotification(
          'error',
          language === 'en' ? 'Booking Failed' : 'Ошибка бронирования',
          language === 'en' ? 'Course is full or you have insufficient balance.' : 'На курсе нет свободных мест или у вас недостаточно средств.'
        );
      } else {
        handleFirestoreError(err, OperationType.WRITE, `courses/${courseId}/enroll`);
      }
    }
  };

  const handleCancel = async (id: string, refundAmount?: number) => {
    if (!firebaseUser) return;
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;

    const bookingRef = doc(db, 'bookings', id);
    const bookingOwnerId = booking.userId;
    const isSystemBlock = bookingOwnerId.startsWith('system_block_');
    const userRef = doc(db, 'users', bookingOwnerId);

    try {
      await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(bookingRef);
        if (!bookingSnap.exists()) {
          throw new Error('Booking does not exist.');
        }

        const bookingData = bookingSnap.data() as Booking;
        if (bookingData.status === 'cancelled') {
          return;
        }

        const refund = bookingData.status === 'completed' ? 0 : (refundAmount ?? bookingData.totalPrice ?? 0);

        if (!isSystemBlock) {
          const userSnap = await transaction.get(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data() as UserProfile;
            const newBal = (userData.balanceUSD ?? 0) + refund;
            transaction.update(userRef, { balanceUSD: newBal });
          }
        }

        transaction.update(bookingRef, { status: 'cancelled' });

        if (bookingData.instructorId.startsWith('course_')) {
          const courseId = bookingData.instructorId.substring('course_'.length);
          const courseRef = doc(db, 'courses', courseId);
          const courseSnap = await transaction.get(courseRef);
          if (courseSnap.exists()) {
            const courseData = courseSnap.data() as Course;
            const newAvailableSeats = Math.min(courseData.totalSeats, courseData.availableSeats + 1);
            transaction.update(courseRef, { availableSeats: newAvailableSeats });
          }
        }
      });

      if (bookingOwnerId === firebaseUser.uid && userProfile) {
        const refund = booking.status === 'completed' ? 0 : (refundAmount ?? booking.totalPrice ?? 0);
        setUserProfile({ ...userProfile, balanceUSD: userProfile.balanceUSD + refund });
      }

      if (userProfile?.role === 'admin' && !isSystemBlock) {
        await createNotificationForUser(
          bookingOwnerId,
          language === 'en' ? 'Lesson Cancelled' : 'Урок отменен',
          language === 'en'
            ? `Your lesson with ${booking.instructorName} was cancelled.`
            : `Ваш урок с ${booking.instructorName} был отменен.`,
          'warning'
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `bookings/${id}/cancel`);
    }
  };

  const handleRequestCancel = async (id: string, reason?: string) => {
    await updateDoc(doc(db, 'bookings', id), { status: 'pending_cancellation', cancellationReason: reason || '' });
  };

  const handleAddReview = async (newReviewInput: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>) => {
    if (!userProfile) return;
    const newRev: Review = {
      id: `rev_${Date.now()}`,
      userId: userProfile.uid,
      userName: userProfile.displayName,
      userAvatar: userProfile.avatarUrl,
      date: new Date().toISOString().split('T')[0],
      ...newReviewInput
    };
    await setDoc(doc(db, 'reviews', newRev.id), newRev);
    const updatedReviews = [newRev, ...reviews];
    const insReviews = updatedReviews.filter((r) => r.instructorId === newRev.instructorId);
    const avgRating = insReviews.reduce((sum, r) => sum + r.rating, 0) / insReviews.length;
    await updateDoc(doc(db, 'instructors', newRev.instructorId), { rating: Number(avgRating.toFixed(1)), reviewsCount: insReviews.length });
  };

  const handleAddInstructor = async (newIns: Instructor) => await setDoc(doc(db, 'instructors', newIns.id), newIns);
  const handleUpdateInstructor = async (updatedIns: Instructor) => {
    await setDoc(doc(db, 'instructors', updatedIns.id), updatedIns);
    const bookingsToUpdate = bookings.filter((b) => b.instructorId === updatedIns.id);
    for (const b of bookingsToUpdate) {
      await updateDoc(doc(db, 'bookings', b.id), { instructorName: updatedIns.name, instructorAvatar: updatedIns.avatarUrl });
    }
  };
  const handleDeleteInstructor = async (id: string) => await deleteDoc(doc(db, 'instructors', id));

  const handleAddBooking = async (booking: Booking) => {
    const isSystemBlock = booking.userId.startsWith('system_block_');
    const userRef = doc(db, 'users', booking.userId);
    const bookingRef = doc(db, 'bookings', booking.id);

    try {
      await runTransaction(db, async (transaction) => {
        if (!isSystemBlock) {
          const userSnap = await transaction.get(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data() as UserProfile;
            const newBal = (userData.balanceUSD ?? 0) - booking.totalPrice;
            transaction.update(userRef, { balanceUSD: newBal });
          }
        }
        transaction.set(bookingRef, booking);
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `bookings/${booking.id}/add`);
    }
  };

  const handleDeleteBooking = async (id: string) => {
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;

    if (booking.status === 'completed') {
      const newStats = { revenue: deletedCompletedStats.revenue + (booking.totalPrice || 0), count: deletedCompletedStats.count + 1 };
      await setDoc(doc(db, 'users', 'school_global_stats'), { deletedCompletedRevenue: newStats.revenue, deletedCompletedCount: newStats.count }, { merge: true });
      await updateDoc(doc(db, 'bookings', id), { isDeleted: true });
    } else {
      await deleteDoc(doc(db, 'bookings', id));
    }
  };

  const handleUpdateUserRole = async (targetUid: string, newRole: 'admin' | 'user') => {
    if (userProfile?.role !== 'admin' || !isSuperAdmin(firebaseUser?.email)) {
      addNotification(
        'error',
        language === 'en' ? 'Access Denied' : 'Доступ ограничен',
        language === 'en' ? 'Only the main administrator can manage roles.' : 'Только главный администратор может управлять ролями.'
      );
      return;
    }
    await updateDoc(doc(db, 'users', targetUid), { role: newRole });
    addNotification(
      'success',
      language === 'en' ? 'Role Updated' : 'Роль обновлена',
      language === 'en' ? `Role changed to ${newRole}.` : `Роль успешно изменена на «${newRole}».`
    );
  };
  const isSuperAdmin = (email?: string | null) => email?.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';

  const handleAddUser = async (newUser: UserProfile) => await setDoc(doc(db, 'users', newUser.uid), newUser);
  const handleUpdateUser = async (updatedUser: UserProfile) => {
    const userRef = doc(db, 'users', updatedUser.uid);
    // Create a copy to avoid passing undefined values which Firestore rejects.
    await updateDoc(userRef, { ...updatedUser });
  };
  const handleDeleteUser = async (targetUid: string) => await deleteDoc(doc(db, 'users', targetUid));

  const handleConfirmBooking = async (id: string) => {
    await updateDoc(doc(db, 'bookings', id), { status: 'confirmed' });
    const booking = bookings.find((b) => b.id === id);
    if (booking) {
      await createNotificationForUser(
        booking.userId,
        language === 'en' ? 'Lesson Confirmed' : 'Урок подтвержден',
        language === 'en'
          ? `Your lesson with ${booking.instructorName} has been confirmed.`
          : `Ваш урок с ${booking.instructorName} был успешно подтвержден.`,
        'success'
      );
    }
  };

  const handleCompleteBooking = async (id: string) => {
    await updateDoc(doc(db, 'bookings', id), { status: 'completed' });
    const booking = bookings.find((b) => b.id === id);
    if (booking) {
      await createNotificationForUser(
        booking.userId,
        language === 'en' ? 'Lesson Completed' : 'Урок завершен',
        language === 'en'
          ? `Your lesson with ${booking.instructorName} has been completed.`
          : `Ваш урок с ${booking.instructorName} был успешно завершен.`,
        'success'
      );
    }
  };

  const handleClearNotifications = async () => {
    if (!firebaseUser || dbNotifications.length === 0) return;
    for (const notif of dbNotifications) {
      await deleteDoc(doc(db, 'notifications', notif.id));
    }
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

  return {
    instructors, reviews, bookings, usersList, courses, dbNotifications, deletedCompletedStats, filtersEnabled,
    dismissedReviewIds, handleDismissReview,
    handlePaymentSuccess, handleBookingSuccess, handleReschedule, handleAddCourse, handleUpdateCourse, handleDeleteCourse,
    handleBookCourse, handleCancel, handleRequestCancel, handleAddReview, handleAddInstructor, handleUpdateInstructor,
    handleDeleteInstructor, handleAddBooking, handleDeleteBooking, handleUpdateUserRole, handleAddUser, handleUpdateUser,
    handleDeleteUser, handleConfirmBooking, handleCompleteBooking, handleClearNotifications, handleUpdateProfile,
    handleToggleFilters
  };
};