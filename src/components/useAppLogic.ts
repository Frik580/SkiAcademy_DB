import { useState, useEffect } from 'react';
import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  OperationType,
  handleFirestoreError
} from '../lib/firebase';
import { UserProfile, Instructor, Booking, Review, Course } from '../types';
import { INITIAL_INSTRUCTORS, INITIAL_REVIEWS, INITIAL_COURSES } from '../data';
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

  // Load Instructors, Reviews, and initial settings
  useEffect(() => {
    const loadInitialData = async () => {
      // Load Settings
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'instructor_filters'));
        setFiltersEnabled(settingsSnap.exists() ? (settingsSnap.data().enabled ?? true) : true);
      } catch (e) {
        setFiltersEnabled(true);
      }

      // Fetch Instructors
      try {
        const q = query(collection(db, 'instructors'));
        const snap = await getDocs(q);
        if (snap && !snap.empty) {
          setInstructors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Instructor)));
        } else {
          setInstructors(INITIAL_INSTRUCTORS);
          INITIAL_INSTRUCTORS.forEach(async (ins) => {
            try { await setDoc(doc(db, 'instructors', ins.id), ins); } catch (e) { /* Ignore seed failures */ }
          });
        }
      } catch (e) {
        setInstructors(INITIAL_INSTRUCTORS);
      }

      // Fetch Reviews
      try {
        const q = query(collection(db, 'reviews'));
        const snap = await getDocs(q);
        if (snap && !snap.empty) {
          setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review)));
        } else {
          setReviews(INITIAL_REVIEWS);
          INITIAL_REVIEWS.forEach(async (rev) => {
            try { await setDoc(doc(db, 'reviews', rev.id), rev); } catch (e) { /* Ignore */ }
          });
        }
      } catch (e) {
        setReviews(INITIAL_REVIEWS);
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
      if (snap && !snap.empty) {
        setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
      } else {
        setCourses(INITIAL_COURSES);
        INITIAL_COURSES.forEach(async (course) => {
          try { await setDoc(doc(db, 'courses', course.id), course); } catch (e) { /* Ignore */ }
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses')));

    if (firebaseUser) {
      const isAdminUser = userProfile?.role === 'admin';

      // Bookings
      const bookingsQuery = isAdminUser
        ? query(collection(db, 'bookings'))
        : query(collection(db, 'bookings'), where('userId', '==', firebaseUser.uid));
      unsubscribers.push(onSnapshot(bookingsQuery, (snap) => {
        const list: Booking[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
        setBookings(list.sort((a, b) => b.date.localeCompare(a.date)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')));

      // Users List (Admin only)
      if (isAdminUser) {
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
    const newBal = userProfile.balanceUSD - totalCost;
    await setDoc(doc(db, 'bookings', booking.id), booking);
    await updateDoc(doc(db, 'users', firebaseUser.uid), { balanceUSD: newBal });
    setUserProfile({ ...userProfile, balanceUSD: newBal });
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const handleReschedule = async (id: string, newDate: string, newTime: string) => {
    await updateDoc(doc(db, 'bookings', id), { date: newDate, time: newTime });
    const booking = bookings.find(b => b.id === id);
    if (booking && userProfile?.role === 'admin') {
      await createNotificationForUser(booking.userId, 'Lesson Rescheduled', `Your lesson with ${booking.instructorName} was rescheduled to ${newDate} at ${newTime}.`);
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
        if (oldCourse.title !== course.title) changeDetails += `• Title changed to "${course.title}".\n`;
        if (oldCourse.dates !== course.dates) changeDetails += `• New dates: ${course.dates}.\n`;
      }
      const message = `An administrator has updated details for the course "${course.title}":\n${changeDetails || 'Course details have been updated.'}`;
      for (const booking of courseBookings) {
        await createNotificationForUser(booking.userId, 'Course Modified', message, 'warning');
      }
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    await deleteDoc(doc(db, 'courses', courseId));
  };

  const handleBookCourse = async (courseId: string) => {
    if (!userProfile) {
      addNotification('warning', 'Sign In Required', 'Sign in to enroll in courses.');
      return;
    }
    const course = courses.find(c => c.id === courseId);
    if (!course || course.availableSeats <= 0 || userProfile.balanceUSD < course.price) {
      addNotification('error', 'Booking Failed', 'Course is full or you have insufficient balance.');
      return;
    }
    if (bookings.some(b => b.userId === userProfile.uid && b.instructorId === `course_${courseId}` && b.status !== 'cancelled')) {
      addNotification('warning', 'Already Enrolled', 'You are already registered for this course.');
      return;
    }

    await handleUpdateProfile({ balanceUSD: userProfile.balanceUSD - course.price });
    await updateDoc(doc(db, 'courses', courseId), { availableSeats: course.availableSeats - 1 });

    const { datePart, timePart } = splitCourseDates(course.dates);
    const newBooking: Booking = {
      id: `booking_course_${Date.now()}`,
      userId: userProfile.uid,
      instructorId: `course_${courseId}`,
      instructorName: `${course.title} (Group Course)`,
      instructorAvatar: course.bgImageUrl,
      date: datePart || course.dates,
      time: timePart || 'Group Schedule',
      durationHours: parseDurationHours(course.duration, 10),
      totalPrice: course.price,
      status: 'confirmed',
      difficulty: 'intermediate',
      notes: `Group Course enrollment: ${course.description}`
    };
    await setDoc(doc(db, 'bookings', newBooking.id), newBooking);
    addNotification('success', 'Enrollment Confirmed!', `You have successfully enrolled in ${course.title}.`);
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
  };

  const handleCancel = async (id: string, refundAmount?: number) => {
    if (!firebaseUser) return;
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;

    const refund = booking.status === 'completed' ? 0 : (refundAmount ?? booking.totalPrice ?? 0);
    const bookingOwnerId = booking.userId;
    const isSystemBlock = bookingOwnerId.startsWith('system_block_');

    if (!isSystemBlock) {
      const clientProfile = usersList.find((u) => u.uid === bookingOwnerId) || (bookingOwnerId === firebaseUser.uid ? userProfile : null);
      if (clientProfile) {
        const newBal = clientProfile.balanceUSD + refund;
        await updateDoc(doc(db, 'users', bookingOwnerId), { balanceUSD: newBal });
      }
    }
    await updateDoc(doc(db, 'bookings', id), { status: 'cancelled' });

    if (booking.instructorId.startsWith('course_') && booking.status !== 'cancelled') {
      const courseId = booking.instructorId.substring('course_'.length);
      const courseObj = courses.find((c) => c.id === courseId);
      if (courseObj) {
        const newAvailableSeats = Math.min(courseObj.totalSeats, courseObj.availableSeats + 1);
        await updateDoc(doc(db, 'courses', courseId), { availableSeats: newAvailableSeats });
      }
    }

    if (userProfile?.role === 'admin' && !isSystemBlock) {
      await createNotificationForUser(bookingOwnerId, 'Lesson Cancelled', `Your lesson with ${booking.instructorName} was cancelled.`, 'warning');
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
    if (!booking.userId.startsWith('system_block_')) {
      const client = usersList.find((u) => u.uid === booking.userId);
      if (client) {
        const newBal = client.balanceUSD - booking.totalPrice;
        await updateDoc(doc(db, 'users', booking.userId), { balanceUSD: newBal });
      }
    }
    await setDoc(doc(db, 'bookings', booking.id), booking);
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
      addNotification('error', 'Access Denied', 'Only the main administrator can manage roles.');
      return;
    }
    await updateDoc(doc(db, 'users', targetUid), { role: newRole });
    addNotification('success', 'Role Updated', `Role changed to ${newRole}.`);
  };
  const isSuperAdmin = (email?: string | null) => email?.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';

  const handleAddUser = async (newUser: UserProfile) => await setDoc(doc(db, 'users', newUser.uid), newUser);
  const handleUpdateUser = async (updatedUser: UserProfile) => await updateDoc(doc(db, 'users', updatedUser.uid), {
    displayName: updatedUser.displayName,
    email: updatedUser.email,
    phoneNumber: updatedUser.phoneNumber || '',
    balanceUSD: updatedUser.balanceUSD,
    role: updatedUser.role,
    isInstructor: !!updatedUser.isInstructor,
    instructorId: updatedUser.instructorId || ''
  });
  const handleDeleteUser = async (targetUid: string) => await deleteDoc(doc(db, 'users', targetUid));

  const handleConfirmBooking = async (id: string) => {
    await updateDoc(doc(db, 'bookings', id), { status: 'confirmed' });
    const booking = bookings.find((b) => b.id === id);
    if (booking) await createNotificationForUser(booking.userId, 'Lesson Confirmed', `Your lesson with ${booking.instructorName} has been confirmed.`, 'success');
  };

  const handleCompleteBooking = async (id: string) => {
    await updateDoc(doc(db, 'bookings', id), { status: 'completed' });
    const booking = bookings.find((b) => b.id === id);
    if (booking) await createNotificationForUser(booking.userId, 'Lesson Completed', `Your lesson with ${booking.instructorName} has been completed.`, 'success');
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