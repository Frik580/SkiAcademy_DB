import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { 
  auth, 
  db, 
  registerFirestoreErrorListener, 
  handleFirestoreError,
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
  OperationType
} from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { UserProfile, Instructor, Booking, Review, Course } from './types';
import { INITIAL_INSTRUCTORS, INITIAL_REVIEWS, INITIAL_COURSES } from './data';
import { LanguageProvider, useLanguage, translateInstructor, translateCourse, translateInstructorName, parseCourseDates, parseDurationHours, splitCourseDates } from './lib/LanguageContext';

// Components
import { NotificationProvider, useNotifications, NotificationHubModal } from './components/PushNotificationHub';
import { Navbar } from './components/Navbar';
import { Auth } from './components/Auth';
import { LessonFilters } from './components/LessonFilters';
import { InstructorCard } from './components/InstructorCard';
import { BookingModal } from './components/BookingModal';
import { InstructorReviewsModal } from './components/InstructorReviewsModal';
import { PaymentGateway } from './components/PaymentGateway';
import { PersonalCabinet } from './components/PersonalCabinet';
import { AdminPanel } from './components/AdminPanel';
import logoLight from './assets/images/logo2.png';
import logoDark from './assets/images/logo1.png';

import { Compass, AlertCircle, RefreshCw, Mountain } from 'lucide-react';
import confetti from 'canvas-confetti';

const AppContent: React.FC = () => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();
  
  // Selected random background wall on load
  const [randomWall] = useState<string>(() => {
    const walls = ['wall', 'wall2', 'wall3', 'wall4', 'wall5', 'wall6', 'wall7'];
    const randomIndex = Math.floor(Math.random() * walls.length);
    return walls[randomIndex];
  });
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Auth & Profile State
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // App Domain State
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [dbNotifications, setDbNotifications] = useState<any[]>([]);
  const [deletedCompletedStats, setDeletedCompletedStats] = useState<{ revenue: number; count: number }>({ revenue: 0, count: 0 });
  
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

  // UI States
  const [dbStatusWarning, setDbStatusWarning] = useState<string | null>(null);
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState<boolean>(false);
  const [isNotifHistoryOpen, setIsNotifHistoryOpen] = useState<boolean>(false);
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
  const [reviewsInstructor, setReviewsInstructor] = useState<Instructor | null>(null);

  // Resort stats simulation state
  const [tempC, setTempC] = useState<number>(-5);
  const [snowDepthCm, setSnowDepthCm] = useState<number>(185);
  const [newSnow24h, setNewSnow24h] = useState<number>(25);
  const [windKmh, setWindKmh] = useState<number>(14);
  const [openLifts, setOpenLifts] = useState<number>(12);
  const [isFahrenheit, setIsFahrenheit] = useState<boolean>(false);
  const [isResortLoading, setIsResortLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const handleRefreshResortStats = () => {
    setIsResortLoading(true);
    setTimeout(() => {
      setTempC((prev) => Math.max(-12, Math.min(2, prev + (Math.random() > 0.5 ? 1 : -1))));
      setSnowDepthCm((prev) => prev + Math.floor(Math.random() * 3));
      setNewSnow24h((prev) => Math.max(0, prev + Math.floor(Math.random() * 5 - 2)));
      setWindKmh((prev) => Math.max(5, Math.min(45, prev + Math.floor(Math.random() * 10 - 5))));
      setOpenLifts((prev) => Math.max(10, Math.min(14, prev + (Math.random() > 0.7 ? 1 : Math.random() > 0.7 ? -1 : 0))));
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsResortLoading(false);
    }, 1000);
  };

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<'all' | 'ski' | 'snowboard' | 'both'>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'rating' | 'priceAsc' | 'priceDesc' | 'experience'>('rating');
  const [filtersEnabled, setFiltersEnabled] = useState<boolean>(true);

  // Register a global error listener to warn users about Firestore permission restrictions
  useEffect(() => {
    registerFirestoreErrorListener((_err, op, path) => {
      console.warn(`[Firestore Safe Fallback Triggered] Error during ${op} on ${path}`);
      setDbStatusWarning(
        `Database sync restricted (Operation: ${op}, Path: ${path}). Using active sandboxed state.`
      );
    });
  }, []);

  // 1. Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        const userPath = `users/${user.uid}`;
        try {
          const userRef = doc(db, 'users', user.uid);
          let userSnap;
          try {
            userSnap = await getDoc(userRef);
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, userPath);
          }

          if (userSnap && userSnap.exists()) {
            const data = userSnap.data() as UserProfile;
            const isAdminEmail = user.email?.toLowerCase() === 'admin@alpineglide.com' || user.email?.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';
            if (isAdminEmail && data.role !== 'admin') {
              try {
                await updateDoc(userRef, { role: 'admin' });
                data.role = 'admin';
              } catch (updateErr) {
                console.error("Failed to promote user to admin in Firestore", updateErr);
              }
            }
            setUserProfile(data);
          } else {
            // To prevent race conditions and ensure custom sign-up names or Google sign-in profiles
            // are properly initialized and migrated with their input data, we let Auth.tsx handle 
            // all initial profile creations and migrations.
            setUserProfile(null);
          }
        } catch (e) {
          console.error("Auth initialization failed", e);
        }
      } else {
   // No user is signed in
        setUserProfile(null);
        setFirebaseUser(null);
        setIsAdminView(false);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Load Instructors & Reviews with fallback
  useEffect(() => {
    const loadData = async () => {
      // Load Settings
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'instructor_filters'));
        if (settingsSnap.exists()) {
          setFiltersEnabled(settingsSnap.data().enabled ?? true);
        } else {
          setFiltersEnabled(true);
          try {
            await setDoc(doc(db, 'settings', 'instructor_filters'), { enabled: true });
          } catch (err) {
            // Ignore
          }
        }
      } catch (e) {
        setFiltersEnabled(true); // Fallback to enabled
      }

      // Fetch Instructors
      try {
        const q = query(collection(db, 'instructors'));
        let snap;
        try {
          snap = await getDocs(q);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'instructors');
        }

        if (snap && !snap.empty) {
          const list: Instructor[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Instructor));
          setInstructors(list);
        } else {
          // Empty or denied. Seed local
          setInstructors(INITIAL_INSTRUCTORS);
          // Try seeding DB asynchronously
          INITIAL_INSTRUCTORS.forEach(async (ins) => {
            try {
              await setDoc(doc(db, 'instructors', ins.id), ins);
            } catch (e) {
              // Ignore seed failures
            }
          });
        }
      } catch (e) {
        setInstructors(INITIAL_INSTRUCTORS);
      }

      // Fetch Reviews
      try {
        const q = query(collection(db, 'reviews'));
        let snap;
        try {
          snap = await getDocs(q);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'reviews');
        }

        if (snap && !snap.empty) {
          const list: Review[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Review));
          setReviews(list);
        } else {
          setReviews(INITIAL_REVIEWS);
          INITIAL_REVIEWS.forEach(async (rev) => {
            try {
              await setDoc(doc(db, 'reviews', rev.id), rev);
            } catch (e) {
              // Ignore
            }
          });
        }
      } catch (e) {
        setReviews(INITIAL_REVIEWS);
      }

      // Fetch deleted completed stats for Admin in production
      const isAdminUser = userProfile?.role === 'admin';
      if (isAdminUser && firebaseUser) {
        try {
          const statsDoc = await getDoc(doc(db, 'users', 'school_global_stats'));
          if (statsDoc.exists()) {
            const data = statsDoc.data();
            setDeletedCompletedStats({
              revenue: data.deletedCompletedRevenue || 0,
              count: data.deletedCompletedCount || 0
            });
          } else {
            setDeletedCompletedStats({ revenue: 0, count: 0 });
          }
        } catch (err) {
          console.error("Error fetching stats:", err);
          setDeletedCompletedStats({ revenue: 0, count: 0 });
        }
      }
    };

    loadData();
  }, [firebaseUser, userProfile]);

  // Real-time Firestore sync (Courses, Bookings, Users List, Notifications)
  useEffect(() => {
    // 1. Real-time Courses
    const coursesQuery = query(collection(db, 'courses'));
    const unsubscribeCourses = onSnapshot(coursesQuery, (snap) => {
      if (snap && !snap.empty) {
        const list: Course[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Course));
        setCourses(list);
      } else {
        setCourses(INITIAL_COURSES);
        // Seed database asynchronously
        INITIAL_COURSES.forEach(async (course) => {
          try {
            await setDoc(doc(db, 'courses', course.id), course);
          } catch (e) {
            // Ignore seed failures
          }
        });
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'courses');
    });

    if (!firebaseUser) {
      setBookings([]);
      setUsersList([]);
      setDbNotifications([]);
      return () => {
        unsubscribeCourses();
      };
    }

    const isAdminUser = userProfile?.role === 'admin';

    // 2. Real-time Bookings
    const bookingsQuery = isAdminUser 
      ? query(collection(db, 'bookings'))
      : query(collection(db, 'bookings'), where('userId', '==', firebaseUser.uid));

    const unsubscribeBookings = onSnapshot(bookingsQuery, (snap) => {
      const list: Booking[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Booking));
      setBookings(list.sort((a, b) => b.date.localeCompare(a.date)));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'bookings');
    });

    // 3. Real-time Users List (Admin only)
    let unsubscribeUsers = () => {};
    if (isAdminUser) {
      const usersQuery = query(collection(db, 'users'));
      unsubscribeUsers = onSnapshot(usersQuery, (snap) => {
        const ulist: UserProfile[] = [];
        snap.forEach((d) => {
          if (d.id !== 'school_global_stats') {
            ulist.push(d.data() as UserProfile);
          }
        });
        setUsersList(ulist);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
      });
    } else {
      setUsersList([]);
    }

    // 4. Real-time Notifications & Toasts
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', firebaseUser.uid)
    );

    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      // Sort descending by timestamp
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setDbNotifications(list);

      // Trigger standard toast alert for any newly added notification in real-time
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const notifTime = new Date(data.timestamp).getTime();
          const now = Date.now();
          // If the notification was created within the last 15 seconds, show a toast
          if (now - notifTime < 15000) {
            addNotification(data.type || 'info', data.title, data.message);
          }
        }
      });
    }, (err) => {
      console.error('Notifications sync error:', err);
    });

    return () => {
      unsubscribeCourses();
      unsubscribeBookings();
      unsubscribeUsers();
      unsubscribeNotifications();
    };
  }, [firebaseUser, userProfile, addNotification]);

  // Auto-sync / healing of available seats for group courses
  const bookingsDeps = bookings.map((b) => `${b.id}:${b.status}:${b.isDeleted}`).join(',');
  const coursesDeps = courses.map((c) => `${c.id}:${c.totalSeats}:${c.availableSeats}`).join(',');

  useEffect(() => {
    if (userProfile?.role !== 'admin' || courses.length === 0) return;

    const syncCourseSeats = async () => {
      let changed = false;
      const updatedCourses = [...courses];

      for (let i = 0; i < updatedCourses.length; i++) {
        const course = updatedCourses[i];
        const courseBookingId = `course_${course.id}`;
        // Count active bookings for this course
        const activeBookings = bookings.filter(
          (b) => b.instructorId === courseBookingId && b.status !== 'cancelled' && !b.isDeleted
        );
        const realAvailableSeats = Math.max(0, course.totalSeats - activeBookings.length);

        if (course.availableSeats !== realAvailableSeats) {
          console.log(`[Auto-Sync] Correcting seats for ${course.title}: local=${course.availableSeats}, real=${realAvailableSeats}`);
          
          updatedCourses[i] = { ...course, availableSeats: realAvailableSeats };
          changed = true;

          // If current user is Admin, also heal the database document so others get correct data
          try {
            await updateDoc(doc(db, 'courses', course.id), { availableSeats: realAvailableSeats });
          } catch (err) {
            console.error(`Failed to auto-sync seats for course ${course.id}:`, err);
          }
        }
      }

      if (changed) {
        setCourses(updatedCourses);
      }
    };

    syncCourseSeats();
  }, [userProfile?.role, bookingsDeps, coursesDeps]);

  // 3. Auto-complete past lessons
  useEffect(() => {
    if (!firebaseUser || bookings.length === 0) return;

    const checkAndCompleteLessons = async () => {
      const now = new Date();
      const updatedBookings = [...bookings];
      let changed = false;

      for (let i = 0; i < updatedBookings.length; i++) {
        const b = updatedBookings[i];
        if (b.status === 'confirmed' || b.status === 'pending_cancellation') {
          const [year, month, day] = b.date.split('-').map(Number);
          const [hour, minute] = b.time.split(':').map(Number);
          const startDate = new Date(year, month - 1, day, hour, minute, 0);
          const endDate = new Date(startDate.getTime() + b.durationHours * 60 * 60 * 1000);

          if (now >= endDate) {
            changed = true;
            const updatedBooking = { ...b, status: 'completed' as const };
            updatedBookings[i] = updatedBooking;

            try {
              await updateDoc(doc(db, 'bookings', b.id), { status: 'completed' });
            } catch (e) {
              console.error(`Failed to auto-complete booking ${b.id}:`, e);
            }

            addNotification(
              'success',
              language === 'en' ? 'Lesson Auto-Completed' : 'Урок автоматически завершен',
              language === 'en'
                ? `Lesson with ${b.instructorName} has ended and was completed.`
                : `Занятие с инструктором ${b.instructorName} завершилось и было автоматически отмечено как выполненное.`
            );
          }
        }
      }

      if (changed) {
        setBookings(updatedBookings);
      }
    };

    checkAndCompleteLessons();

    const interval = setInterval(checkAndCompleteLessons, 10000);
    return () => clearInterval(interval);
  }, [bookings, firebaseUser, language, db]);

  // Balance top-up success callback
  const handlePaymentSuccess = async (amount: number) => {
    if (!userProfile || !firebaseUser) return;
    const newBal = userProfile.balanceUSD + amount;
    
    // 1. Sync database
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), { balanceUSD: newBal });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${firebaseUser.uid}`);
    }

    // 2. Sync state
    setUserProfile((prev) => prev ? { ...prev, balanceUSD: newBal } : null);
  };

  // Lesson Booking Callback
  const handleBookingSuccess = async (booking: Booking, totalCost: number) => {
    if (!userProfile || !firebaseUser) return;
    const newBal = userProfile.balanceUSD - totalCost;

    // 1. Save booking to Firestore
    try {
      await setDoc(doc(db, 'bookings', booking.id), booking);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bookings/${booking.id}`);
    }

    // 2. Debit balance in Firestore
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), { balanceUSD: newBal });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${firebaseUser.uid}`);
    }

    // 3. Update local states
    setUserProfile((prev) => prev ? { ...prev, balanceUSD: newBal } : null);
    setBookings((prev) => [booking, ...prev]);

    // Play visual celebration!
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  // Reschedule booking callback
  const handleReschedule = async (id: string, newDate: string, newTime: string) => {
    try {
      await updateDoc(doc(db, 'bookings', id), { date: newDate, time: newTime });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`);
    }

    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, date: newDate, time: newTime } : b));

    // Notify the user
    const booking = bookings.find(b => b.id === id);
    if (booking && userProfile?.role === 'admin') {
      await createNotificationForUser(
        booking.userId,
        language === 'ru' ? 'Занятие перенесено' : 'Lesson Rescheduled',
        language === 'ru'
          ? `Ваше занятие с инструктором ${booking.instructorName} было перенесено администратором на ${newDate} в ${newTime}.`
          : `Your lesson with ${booking.instructorName} was rescheduled by an administrator to ${newDate} at ${newTime}.`
      );
    }
  };

  // Course administration and user booking handlers
  const handleAddCourse = async (course: Course) => {
    try {
      await setDoc(doc(db, 'courses', course.id), course);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `courses/${course.id}`);
      throw e;
    }
    setCourses((prev) => [...prev, course]);
  };

  const handleUpdateCourse = async (course: Course) => {
    try {
      await updateDoc(doc(db, 'courses', course.id), course as any);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `courses/${course.id}`);
      throw e;
    }

    // Notify all enrolled users about the course update with detailed differences
    if (userProfile?.role === 'admin') {
      const oldCourse = courses.find((c) => c.id === course.id);
      const courseBookings = bookings.filter(b => b.instructorId === `course_${course.id}` && b.status !== 'cancelled');
      const title = language === 'ru' ? 'Изменение курса' : 'Course Modified';
      
      let changeDetailsRu = '';
      let changeDetailsEn = '';

      if (oldCourse) {
        if (oldCourse.title !== course.title) {
          changeDetailsRu += `• Название курса изменено с «${oldCourse.title}» на «${course.title}».\n`;
          changeDetailsEn += `• Course title changed from "${oldCourse.title}" to "${course.title}".\n`;
        }
        if (oldCourse.dates !== course.dates) {
          changeDetailsRu += `• Даты и время проведения: ${course.dates} (было: ${oldCourse.dates}).\n`;
          changeDetailsEn += `• New dates and times: ${course.dates} (was: ${oldCourse.dates}).\n`;
        }
        if (oldCourse.duration !== course.duration) {
          changeDetailsRu += `• Продолжительность: ${course.duration} (было: ${oldCourse.duration}).\n`;
          changeDetailsEn += `• Duration: ${course.duration} (was: ${oldCourse.duration}).\n`;
        }
        if (oldCourse.price !== course.price) {
          changeDetailsRu += `• Стоимость: $${course.price} (было: $${oldCourse.price}).\n`;
          changeDetailsEn += `• Price: $${course.price} (was: $${oldCourse.price}).\n`;
        }
        if (oldCourse.description !== course.description) {
          changeDetailsRu += `• Описание курса обновлено.\n`;
          changeDetailsEn += `• Course description has been updated.\n`;
        }
      }

      const message = language === 'ru' 
        ? `Администратор внес изменения в курс «${course.title}»:\n${changeDetailsRu || 'Информация по курсу была обновлена.'}`
        : `An administrator has updated details for the course "${course.title}":\n${changeDetailsEn || 'Course details have been updated.'}`;

      for (const booking of courseBookings) {
        await createNotificationForUser(booking.userId, title, message, 'warning');
      }
    }

    setCourses((prev) => prev.map((c) => c.id === course.id ? course : c));
  };

  const handleDeleteCourse = async (courseId: string) => {
    try {
      await deleteDoc(doc(db, 'courses', courseId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `courses/${courseId}`);
      throw e;
    }
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
  };

  const createNotificationForUser = async (userId: string, title: string, message: string, type: 'info' | 'warning' | 'success' = 'info') => {
    if (userId.startsWith('system_block_')) return; // Don't notify system blocks
    const notification = {
      userId,
      title,
      message,
      type,
      timestamp: new Date().toISOString(),
      isRead: false,
    };
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    try {
      await setDoc(doc(db, 'notifications', notifId), notification);
    } catch (e) {
      console.error("Failed to create notification:", e);
      // Don't bubble up Firestore errors for notifications
    }
  };

  const handleBookCourse = async (courseId: string) => {
    if (!userProfile) {
      addNotification(
        'warning',
        language === 'en' ? 'Sign In Required' : 'Требуется войти',
        language === 'en'
          ? 'Sign in to schedule elite instructors, manage wallets, and track training sessions.'
          : 'Войдите, чтобы бронировать инструкторов, пополнять кошелек и видеть расписание.'
      );
      return;
    }

    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    if (course.availableSeats <= 0) {
      addNotification(
        'error',
        language === 'en' ? 'No Seats Left' : 'Мест нет',
        language === 'en' ? 'Sorry, this course is fully booked.' : 'Извините, на этом курсе больше нет свободных мест.'
      );
      return;
    }

    // Check if already booked
    const isAlreadyBooked = bookings.some(b => b.userId === userProfile.uid && b.instructorId === `course_${courseId}` && b.status !== 'cancelled');
    if (isAlreadyBooked) {
      addNotification(
        'warning',
        language === 'en' ? 'Already Enrolled' : 'Вы уже записаны',
        language === 'en' ? 'You are already registered for this group course.' : 'Вы уже зарегистрированы на этот групповой курс.'
      );
      return;
    }

    if (userProfile.balanceUSD < course.price) {
      addNotification(
        'error',
        language === 'en' ? 'Insufficient Balance' : 'Недостаточно средств',
        language === 'en' ? `The course costs $${course.price}, but your balance is $${userProfile.balanceUSD}. Please top up.` : `Курс стоит $${course.price}, а ваш баланс — $${userProfile.balanceUSD}. Пожалуйста, пополните счет.`
      );
      setIsTopUpOpen(true);
      return;
    }

    // Deduct user balance
    const updatedBalance = userProfile.balanceUSD - course.price;
    await handleUpdateProfile({ balanceUSD: updatedBalance });

    // Update availableSeats
    const updatedCourse = { ...course, availableSeats: course.availableSeats - 1 };
    
    try {
      await updateDoc(doc(db, 'courses', courseId), { availableSeats: course.availableSeats - 1 });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `courses/${courseId}`);
    }

    setCourses(prev => prev.map(c => c.id === courseId ? updatedCourse : c));

    // Create a new booking object
    const newBookingId = `booking_course_${Date.now()}`;
    const { datePart, timePart } = splitCourseDates(course.dates);

    const newBooking: Booking = {
      id: newBookingId,
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

    try {
      await setDoc(doc(db, 'bookings', newBookingId), newBooking);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `bookings/${newBookingId}`);
    }

    setBookings(prev => [newBooking, ...prev]);

    // Success notification
    addNotification(
      'success',
      language === 'en' ? 'Course Enrollment Confirmed!' : 'Запись на курс подтверждена!',
      language === 'en' ? `You have successfully enrolled in ${course.title}.` : `Вы успешно записались на курс «${course.title}».`
    );

    // Show beautiful custom confetti
    try {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    } catch (e) {
      // Ignore
    }
  };

  // Cancel booking callback (full refund)
  const handleCancel = async (id: string, refundAmount?: number) => {
    if (!firebaseUser) return;
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;

    const refund = booking.status === 'completed' ? 0 : (refundAmount !== undefined ? refundAmount : (booking.totalPrice || 0));

    const bookingOwnerId = booking.userId;
    const isSystemBlock = bookingOwnerId.startsWith('system_block_');

    if (!isSystemBlock) {
      const clientProfile = usersList.find((u) => u.uid === bookingOwnerId);
      // Fallback to userProfile if clientProfile is not loaded yet or matches current user
      const actualBalanceUSD = clientProfile ? clientProfile.balanceUSD : (bookingOwnerId === firebaseUser.uid && userProfile ? userProfile.balanceUSD : 0);
      const newBal = actualBalanceUSD + refund;

      try {
        await updateDoc(doc(db, 'bookings', id), { status: 'cancelled' });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`);
      }

      try {
        await updateDoc(doc(db, 'users', bookingOwnerId), { balanceUSD: newBal });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `users/${bookingOwnerId}`);
      }

      setUsersList((prev) => prev.map((u) => u.uid === bookingOwnerId ? { ...u, balanceUSD: newBal } : u));
      if (bookingOwnerId === firebaseUser.uid && userProfile) {
        setUserProfile((prev) => prev ? { ...prev, balanceUSD: newBal } : null);
      }
    } else {
      // System blocks have no client profile to refund
      try {
        await updateDoc(doc(db, 'bookings', id), { status: 'cancelled' });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`);
      }
    }

    // Release course seat if active course booking is cancelled
    if (booking.instructorId.startsWith('course_') && booking.status !== 'cancelled') {
      const courseId = booking.instructorId.substring('course_'.length);
      const courseObj = courses.find((c) => c.id === courseId);
      if (courseObj) {
        const newAvailableSeats = Math.min(courseObj.totalSeats, courseObj.availableSeats + 1);
        try {
          await updateDoc(doc(db, 'courses', courseId), { availableSeats: newAvailableSeats });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `courses/${courseId}`);
        }
        setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, availableSeats: newAvailableSeats } : c));
      }
    }

// Notify the user about cancellation
    if (userProfile?.role === 'admin' && !isSystemBlock) {
      const title = language === 'ru' ? 'Занятие отменено' : 'Lesson Cancelled';
      const message = language === 'ru' ? `Ваше занятие с инструктором ${booking.instructorName} (${booking.date} в ${booking.time}) было отменено администратором. Средства возвращены на ваш баланс.` : `Your lesson with ${booking.instructorName} (${booking.date} at ${booking.time}) was cancelled by an administrator. Funds have been returned to your wallet.`;
      await createNotificationForUser(bookingOwnerId, title, message, 'warning');
    }

    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: 'cancelled' } : b));
  };

  // Submit cancellation request to admin (status -> 'pending_cancellation')
  const handleRequestCancel = async (id: string, reason?: string) => {
    if (!firebaseUser) return;
    try {
      await updateDoc(doc(db, 'bookings', id), { 
        status: 'pending_cancellation',
        cancellationReason: reason || ''
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`);
    }

    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: 'pending_cancellation', cancellationReason: reason || '' } : b));
  };

  // Instructor Review submission
  const handleAddReview = async (newReviewInput: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>) => {
    if (!userProfile) return;

    const newRev: Review = {
      id: `rev_${Math.random().toString(36).substring(2, 9)}`,
      userId: userProfile.uid,
      userName: userProfile.displayName,
      userAvatar: userProfile.avatarUrl,
      date: new Date().toISOString().split('T')[0],
      ...newReviewInput
    };

    // Save to reviews collection
    try {
      await setDoc(doc(db, 'reviews', newRev.id), newRev);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `reviews/${newRev.id}`);
    }

    const updatedReviews = [newRev, ...reviews];
    setReviews(updatedReviews);

    // Calculate new instructor stats
    const insReviews = updatedReviews.filter((r) => r.instructorId === newRev.instructorId);
    const avgRating = insReviews.reduce((sum, r) => sum + r.rating, 0) / insReviews.length;

    // Save to instructors collection
    setInstructors((prev) => prev.map((ins) => {
      if (ins.id === newRev.instructorId) {
        const updated = {
          ...ins,
          rating: Number(avgRating.toFixed(1)),
          reviewsCount: insReviews.length
        };
        updateDoc(doc(db, 'instructors', ins.id), {
          rating: updated.rating,
          reviewsCount: updated.reviewsCount
        }).catch((e) => {
          handleFirestoreError(e, OperationType.UPDATE, `instructors/${ins.id}`);
        });
        return updated;
      }
      return ins;
    }));
  };

  // Admin controls
  const handleAddInstructor = async (newIns: Instructor) => {
    try {
      await setDoc(doc(db, 'instructors', newIns.id), newIns);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `instructors/${newIns.id}`);
    }
    setInstructors((prev) => [...prev, newIns]);
  };

  const handleUpdateInstructor = async (updatedIns: Instructor) => {
    try {
      await setDoc(doc(db, 'instructors', updatedIns.id), updatedIns);
      // Also update any bookings with this instructor in Firestore
      const bookingsToUpdate = bookings.filter((b) => b.instructorId === updatedIns.id);
      for (const b of bookingsToUpdate) {
        await updateDoc(doc(db, 'bookings', b.id), {
          instructorName: updatedIns.name,
          instructorAvatar: updatedIns.avatarUrl
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `instructors/${updatedIns.id}`);
    }
    setInstructors((prev) => prev.map((ins) => ins.id === updatedIns.id ? updatedIns : ins));
    setBookings((prev) => prev.map((b) => b.instructorId === updatedIns.id ? {
      ...b,
      instructorName: updatedIns.name,
      instructorAvatar: updatedIns.avatarUrl
    } : b));
  };

  const handleDeleteInstructor = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'instructors', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `instructors/${id}`);
    }
    setInstructors((prev) => prev.filter((ins) => ins.id !== id));
  };

  const handleAddBooking = async (booking: Booking) => {
    const isSystemBlock = booking.userId.startsWith('system_block_');

    if (!isSystemBlock) {
      const client = usersList.find((u) => u.uid === booking.userId);
      if (client) {
        const newBal = client.balanceUSD - booking.totalPrice;

        try {
          await updateDoc(doc(db, 'users', booking.userId), { balanceUSD: newBal });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `users/${booking.userId}`);
        }

        setUsersList((prev) => prev.map((u) => u.uid === booking.userId ? { ...u, balanceUSD: newBal } : u));
        if (booking.userId === firebaseUser?.uid) {
          setUserProfile((prev) => prev ? { ...prev, balanceUSD: newBal } : null);
        }
      }
    }

    try {
      await setDoc(doc(db, 'bookings', booking.id), booking);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bookings/${booking.id}`);
    }
    setBookings((prev) => [booking, ...prev]);
  };

  const handleDeleteBooking = async (id: string) => {
    const booking = bookings.find((b) => b.id === id);

    if (booking) {
      const isSystemBlock = booking.userId.startsWith('system_block_');
      if (!isSystemBlock && booking.status !== 'cancelled' && booking.status !== 'completed') {
        const client = usersList.find((u) => u.uid === booking.userId);
        if (client) {
          const newBal = client.balanceUSD + booking.totalPrice;

          try {
            await updateDoc(doc(db, 'users', booking.userId), { balanceUSD: newBal });
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `users/${booking.userId}`);
          }

          setUsersList((prev) => prev.map((u) => u.uid === booking.userId ? { ...u, balanceUSD: newBal } : u));
          if (booking.userId === firebaseUser?.uid) {
            setUserProfile((prev) => prev ? { ...prev, balanceUSD: newBal } : null);
          }
        }
      }

      // Preserve stats on deleting completed lessons
      if (booking.status === 'completed') {
        const addedRevenue = booking.totalPrice || 0;
        const newStats = {
          revenue: deletedCompletedStats.revenue + addedRevenue,
          count: deletedCompletedStats.count + 1
        };

        try {
          await setDoc(doc(db, 'users', 'school_global_stats'), {
            deletedCompletedRevenue: newStats.revenue,
            deletedCompletedCount: newStats.count
          }, { merge: true });
        } catch (e) {
          console.error("Failed to update school stats in Firestore:", e);
        }

        setDeletedCompletedStats(newStats);
      }

      // Release course seat if active course booking is deleted
      if (booking.instructorId.startsWith('course_') && booking.status !== 'cancelled' && booking.status !== 'completed') {
        const courseId = booking.instructorId.substring('course_'.length);
        const courseObj = courses.find((c) => c.id === courseId);
        if (courseObj) {
          const newAvailableSeats = Math.min(courseObj.totalSeats, courseObj.availableSeats + 1);
          try {
            await updateDoc(doc(db, 'courses', courseId), { availableSeats: newAvailableSeats });
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `courses/${courseId}`);
          }
          setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, availableSeats: newAvailableSeats } : c));
        }
      }
    }

    const isCompleted = booking && booking.status === 'completed';

    if (isCompleted) {
      try {
        await updateDoc(doc(db, 'bookings', id), { isDeleted: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`);
      }
      setBookings((prev) => prev.map((b) => b.id === id ? { ...b, isDeleted: true } : b));
    } else {
      try {
        await deleteDoc(doc(db, 'bookings', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `bookings/${id}`);
      }
      setBookings((prev) => prev.filter((b) => b.id !== id));
    }
  };

  const handleUpdateUserRole = async (targetUid: string, newRole: 'admin' | 'user') => {
    if (!firebaseUser || !userProfile || userProfile.role !== 'admin') return;

    const isSandbox = userProfile?.uid?.startsWith('local_') || false;
    const isSuperAdmin = firebaseUser.email?.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';
    if (!isSuperAdmin) {
      addNotification(
        'error',
        language === 'en' ? 'Access Denied' : 'В доступе отказано',
        language === 'en' ? 'Only the main administrator can manage other admin roles.' : 'Только главный администратор может управлять ролями администраторов.'
      );
      return;
    }

    if (targetUid === firebaseUser.uid) {
      addNotification(
        'warning', 
        language === 'en' ? 'Cannot Demote Yourself' : 'Нельзя понизить самого себя', 
        language === 'en' ? 'You cannot remove your own admin status.' : 'Вы не можете снять с себя статус администратора.'
      );
      return;
    }

    try {
      await updateDoc(doc(db, 'users', targetUid), { role: newRole });
      addNotification(
        'success',
        language === 'en' ? 'Role Updated' : 'Роль обновлена',
        language === 'en' ? `Role successfully changed to ${newRole === 'admin' ? 'Administrator' : 'User'}.` : `Роль успешно изменена на ${newRole === 'admin' ? 'Администратор' : 'Пользователь'}.`
      );
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${targetUid}`);
    }

    // Refresh users list
    if (!isSandbox) {
      try {
        const uq = query(collection(db, 'users'));
        const usnap = await getDocs(uq);
        if (usnap && !usnap.empty) {
          const ulist: UserProfile[] = [];
          usnap.forEach((d) => {
            if (d.id !== 'school_global_stats') {
              ulist.push(d.data() as UserProfile);
            }
          });
          setUsersList(ulist);
        }
      } catch (err) {
        console.error("Failed to reload users:", err);
      }
    }
  };

  const handleAddUser = async (newUser: UserProfile) => {
    if (!firebaseUser || !userProfile || userProfile.role !== 'admin') return;

    try {
      await setDoc(doc(db, 'users', newUser.uid), newUser);
      setUsersList((prev) => [...prev, newUser]);
      addNotification(
        'success',
        language === 'en' ? 'Client Added' : 'Клиент добавлен',
        language === 'en' ? `Profile for ${newUser.displayName} created successfully.` : `Профиль ${newUser.displayName} успешно создан.`
      );
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${newUser.uid}`);
    }
  };

  const handleUpdateUser = async (updatedUser: UserProfile) => {
    if (!firebaseUser || !userProfile || userProfile.role !== 'admin') return;

    const isSuperAdmin = firebaseUser.email?.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';
    const oldUser = usersList.find(u => u.uid === updatedUser.uid);
    if (oldUser && oldUser.role !== updatedUser.role && !isSuperAdmin) {
      addNotification(
        'error',
        language === 'en' ? 'Access Denied' : 'В доступе отказано',
        language === 'en' ? 'Only the main administrator can change roles.' : 'Только главный администратор может менять роли.'
      );
      return;
    }

    try {
      await updateDoc(doc(db, 'users', updatedUser.uid), {
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber || '',
        balanceUSD: updatedUser.balanceUSD,
        role: updatedUser.role
      });
      setUsersList((prev) => prev.map(u => u.uid === updatedUser.uid ? updatedUser : u));
      if (updatedUser.uid === firebaseUser.uid) {
        setUserProfile(updatedUser);
      }
      addNotification(
        'success',
        language === 'en' ? 'Client Updated' : 'Профиль обновлен',
        language === 'en' ? `${updatedUser.displayName}'s profile has been updated.` : `Профиль ${updatedUser.displayName} успешно обновлен.`
      );
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${updatedUser.uid}`);
    }
  };

  const handleDeleteUser = async (targetUid: string) => {
    if (!firebaseUser || !userProfile || userProfile.role !== 'admin') return;

    if (targetUid === firebaseUser.uid) {
      addNotification(
        'warning',
        language === 'en' ? 'Action Forbidden' : 'Действие запрещено',
        language === 'en' ? 'You cannot delete your own profile.' : 'Вы не можете удалить свой собственный профиль.'
      );
      return;
    }

    const targetUser = usersList.find(u => u.uid === targetUid);
    const isSuperAdmin = firebaseUser.email?.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';
    if (targetUser && targetUser.role === 'admin' && !isSuperAdmin) {
      addNotification(
        'error',
        language === 'en' ? 'Access Denied' : 'В доступе отказано',
        language === 'en' ? 'Only the main administrator can delete other administrators.' : 'Только главный администратор может удалять других администраторов.'
      );
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', targetUid));
      setUsersList((prev) => prev.filter(u => u.uid !== targetUid));
      addNotification(
        'success',
        language === 'en' ? 'Client Deleted' : 'Клиент удален',
        language === 'en' ? 'Client record has been removed from Firestore.' : 'Запись клиента была удалена из базы данных.'
      );
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${targetUid}`);
    }
  };

  const handleConfirmBooking = async (id: string) => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status: 'confirmed' });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`);
    }
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: 'confirmed' } : b));
    addNotification('info', 'Booking Confirmed', 'Instructor lesson has been set to Confirmed.');

    // Notify the client
    const booking = bookings.find((b) => b.id === id);
    if (booking && userProfile?.role === 'admin') {
      const title = language === 'ru' ? 'Занятие подтверждено' : 'Lesson Confirmed';
      const message = language === 'ru' 
        ? `Ваше занятие с инструктором ${booking.instructorName} (${booking.date} в ${booking.time}) было подтверждено администратором.`
        : `Your lesson with ${booking.instructorName} (${booking.date} at ${booking.time}) has been confirmed by an administrator.`;
      await createNotificationForUser(booking.userId, title, message, 'success');
    }
  };

  const handleCompleteBooking = async (id: string) => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status: 'completed' });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`);
    }
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: 'completed' } : b));
    addNotification('success', language === 'en' ? 'Lesson Completed' : 'Занятие завершено', language === 'en' ? 'Instructor lesson has been marked as completed.' : 'Урок с инструктором отмечен как завершенный.');

    // Notify the client
    const booking = bookings.find((b) => b.id === id);
    if (booking && userProfile?.role === 'admin') {
      const title = language === 'ru' ? 'Занятие завершено' : 'Lesson Completed';
      const message = language === 'ru' 
        ? `Ваше занятие с инструктором ${booking.instructorName} (${booking.date} в ${booking.time}) было успешно завершено. Спасибо за тренировку!`
        : `Your lesson with ${booking.instructorName} (${booking.date} at ${booking.time}) has been marked as completed. Thank you for training with us!`;
      await createNotificationForUser(booking.userId, title, message, 'success');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      setFirebaseUser(null);
      setIsAdminView(false);
      addNotification('info', 'Logged Out', 'You have been securely signed out.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearNotifications = async () => {
    if (!firebaseUser || dbNotifications.length === 0) return;
    for (const notif of dbNotifications) {
      try {
        await deleteDoc(doc(db, 'notifications', notif.id));
      } catch (err) {
        console.error('Failed to delete notification:', err);
      }
    }
    setDbNotifications([]);
  };

  const handleUpdateProfile = async (updatedData: Partial<UserProfile>) => {
    if (!firebaseUser || !userProfile) return;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), updatedData);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      throw e;
    }

    setUserProfile((prev) => prev ? { ...prev, ...updatedData } : null);
  };

  const handleToggleFilters = async (enabled: boolean) => {
    setFiltersEnabled(enabled);
    
    try {
      await setDoc(doc(db, 'settings', 'instructor_filters'), { enabled });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'settings/instructor_filters');
    }
  };

  // Translate instructors based on selected language
  const translatedInstructors = useMemo<Instructor[]>(() => {
    return instructors.map((ins: Instructor) => translateInstructor(ins, language));
  }, [instructors, language]);

  // Filter & Sort computation
  const filteredInstructors = translatedInstructors
    .filter((ins: Instructor) => {
      if (!filtersEnabled) return true;
      const matchSearch = ins.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          ins.bio.toLowerCase().includes(searchQuery.toLowerCase());
      const matchSpec = selectedSpecialty === 'all' || ins.specialty === selectedSpecialty;
      const matchLang = selectedLanguage === 'all' || ins.languages.includes(selectedLanguage);
      return matchSearch && matchSpec && matchLang;
    })
    .sort((a: Instructor, b: Instructor) => {
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'experience') return b.experienceYears - a.experienceYears;
      if (sortBy === 'priceAsc') return a.pricePerHour - b.pricePerHour;
      if (sortBy === 'priceDesc') return b.pricePerHour - a.pricePerHour;
      return 0;
    });

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 gap-3">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
        <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('checkingCredentials')}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] transition-colors duration-300">
      {/* Global Navbar */}
      <Navbar
        userProfile={userProfile}
        onOpenTopUp={() => setIsTopUpOpen(true)}
        onOpenNotifications={() => setIsNotifHistoryOpen(true)}
        onToggleAdminView={() => setIsAdminView(!isAdminView)}
        isAdminView={isAdminView}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Body */}
      <main className={`flex-1 w-full mx-auto ${
        isAdminView && userProfile && userProfile.role === 'admin'
          ? 'p-6 overflow-y-auto'
          : 'flex flex-col lg:grid lg:grid-cols-[minmax(140px,250px)_minmax(700px,1.5fr)_minmax(180px,350px)] lg:h-[calc(100vh-62px)] lg:overflow-hidden'
      }`}>
        
        {/* Firestore Permission warning notice block */}
        {dbStatusWarning && (
          <div className="lg:col-span-3 bg-amber-950/40 border border-amber-900/60 text-amber-200 p-4 rounded-none text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in shrink-0 m-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{dbStatusWarning}</span>
            </div>
            <button
              onClick={() => setDbStatusWarning(null)}
              className="text-amber-500 hover:text-amber-200 font-black text-sm"
            >
              ×
            </button>
          </div>
        )}

        {isAdminView && userProfile && userProfile.role === 'admin' ? (
          /* ADMIN VIEW */
          <AdminPanel
            instructors={translatedInstructors}
            bookings={bookings}
            usersList={usersList}
            courses={courses}
            deletedCompletedStats={deletedCompletedStats}
            currentUserEmail={firebaseUser?.email || ''}
            onUpdateUserRole={handleUpdateUserRole}
            onAddInstructor={handleAddInstructor}
            onUpdateInstructor={handleUpdateInstructor}
            onDeleteInstructor={handleDeleteInstructor}
            onConfirmBooking={handleConfirmBooking}
            onCompleteBooking={handleCompleteBooking}
            onCancelBooking={handleCancel}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onRescheduleBooking={handleReschedule}
            onDeleteBooking={handleDeleteBooking}
            onAddBooking={handleAddBooking}
            onAddCourse={handleAddCourse}
            onUpdateCourse={handleUpdateCourse}
            onDeleteCourse={handleDeleteCourse}
            filtersEnabled={filtersEnabled}
            onToggleFilters={handleToggleFilters}
          />
        ) : (
          /* USER/CLIENT VIEW (Authenticated or Guest/Logged-out) */
          <>
            {/* 1. Left Sidebar: Resort Conditions (placed in the first flexible column) */}
            <aside className="lg:col-start-1 border-b lg:border-b-0 lg:border-r border-[var(--border)] p-6 space-y-6 flex flex-col justify-start shrink-0 lg:h-full lg:overflow-y-auto bg-transparent">
              <div className="border-b border-[var(--border)] pb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
                  {language === 'en' ? 'Mountain Temp' : 'Температура'}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-serif text-4xl font-light text-[var(--ink)] leading-none">
                    {isFahrenheit ? Math.round((tempC * 9) / 5 + 32) : tempC}°
                  </span>
                  <span className="text-xs font-mono text-[var(--ink-dim)]">
                    {isFahrenheit ? 'F' : 'C'}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                    {language === 'en' ? `Fresh: +${newSnow24h}cm` : `Свежий: +${newSnow24h}см`}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                    {language === 'en' ? `${windKmh} km/h` : `${windKmh} км/ч`}
                  </span>
                  <button
                    onClick={() => setIsFahrenheit(!isFahrenheit)}
                    className="text-[9px] font-mono border border-[var(--border)] px-1 hover:border-[var(--ink)] text-[var(--ink)] transition bg-transparent cursor-pointer"
                  >
                    °{isFahrenheit ? 'C' : 'F'}
                  </button>
                </div>
              </div>

              <div className="border-b border-[var(--border)] pb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
                  {language === 'en' ? 'Snow Cover' : 'Снежный покров'}
                </span>
                <span className="font-serif text-4xl font-light text-[var(--ink)] block mt-1">
                  {snowDepthCm}<small className="text-sm font-sans font-normal ml-0.5">cm</small>
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block mt-2">
                  {language === 'en' ? 'Safety Level: FIS-1' : 'Безопасность: FIS-1'}
                </span>
              </div>

              <div className="border-b border-[var(--border)] pb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
                  {language === 'en' ? 'Operating Lifts' : 'Подъемники'}
                </span>
                <span className="font-serif text-4xl font-light text-[var(--ink)] block mt-1">
                  {openLifts}/14
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-500 font-bold block mt-2.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {language === 'en' ? 'STATUS: OPEN' : 'СТАТУС: ОТКРЫТО'}
                </span>
              </div>

              <div className="pt-2 flex justify-between items-center text-[10px] font-mono">
                <span className="text-[9px] text-[var(--ink-dim)]">
                  {language === 'en' ? 'Update' : 'Обновлено'}: {lastUpdated}
                </span>
                <button
                  onClick={handleRefreshResortStats}
                  disabled={isResortLoading}
                  className="text-[9px] font-mono uppercase border border-[var(--border)] px-2 py-0.5 hover:border-[var(--ink)] text-[var(--ink)] transition disabled:opacity-50 bg-transparent cursor-pointer"
                >
                  {isResortLoading ? '...' : (language === 'en' ? 'Refresh' : 'Обновить')}
                </button>
              </div>
            </aside>

            {/* 2. Center Scroll Pane: Hero, Active Cabinet Lists & Browsing (placed in the fixed-width center column) */}
            <div className="lg:col-start-2 flex-1 lg:h-full lg:overflow-y-auto flex flex-col justify-start">
              
              {/* Elegant welcoming Hero block */}
              <section 
                className="relative space-y-3 p-8 md:p-10 border-b border-[var(--border)] overflow-hidden bg-cover bg-center flex flex-col justify-end min-h-[220px]"
                style={{ 
                  backgroundImage: theme === 'light'
                    ? `linear-gradient(to right, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.4) 100%), url('https://storage.yandexcloud.net/carve/${randomWall}.webp')`
                    : `linear-gradient(to right, rgba(15, 15, 18, 0.85) 0%, rgba(15, 15, 18, 0.3) 100%), url('https://storage.yandexcloud.net/carve/${randomWall}.webp')`
                    // : `linear-gradient(to right, rgba(15, 15, 18, 0.85) 50%, rgba(15, 15, 18, 0.3) 100%), url('/src/assets/images/alpine_mountains_bg_1783860006336.jpg')`
                }}
              >
                <div className="relative z-10 space-y-3">
                  <span className={`text-[9px] font-mono uppercase tracking-widest block ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                    {language === 'en' ? 'Curated Experiences' : 'Эксклюзивный сервис'}
                  </span>
                  <h2 className={`text-3xl md:text-4xl lg:text-5xl font-serif font-light leading-[1.1] tracking-tight max-w-2xl ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                    {language === 'en' ? 'Perfect your technique with our elite guides.' : 'Совершенствуйте технику с лучшими гидами.'}
                  </h2>
                  <p className={`text-xs font-mono max-w-lg tracking-wider leading-relaxed pt-1 ${theme === 'light' ? 'text-slate-700' : 'text-slate-400'}`}>
                    {language === 'en' 
                      ? 'PROFESSIONAL TRAINING: ski and snowboard, from foundations to competitive mastery.' 
                      : 'ПРОФЕССИОНАЛЬНОЕ ОБУЧЕНИЕ: лыжи и сноуборд, от азов до соревновательного мастерства.'}
                  </p>
                </div>
              </section>

              <div className="p-6 md:p-8 space-y-8 flex flex-col justify-start">
                {/* Middle Section: Personal Cabinet Tracker / History of bookings */}
                {userProfile && (
                  <div className="border border-[var(--border)] p-6 space-y-4">
                    <div className="border-b border-[var(--border)] pb-3 mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 bg-indigo-500 rounded-none"></span>
                      <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--ink)] font-bold">{t('activeCabinet')}</h3>
                    </div>
                    <PersonalCabinet
                      userProfile={userProfile}
                      bookings={bookings}
                      reviews={reviews}
                      dismissedReviewIds={dismissedReviewIds}
                      onDismissReview={handleDismissReview}
                      onReschedule={handleReschedule}
                      onCancel={handleRequestCancel}
                      onAddReview={handleAddReview}
                      onSignOut={handleSignOut}
                      onUpdateProfile={handleUpdateProfile}
                      courses={courses}
                    />
                  </div>
                )}

                {/* Group Courses section */}
                <div id="courses-grid" className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-serif text-[var(--ink)] tracking-tight font-light">
                      {language === 'en' ? 'Intensive Group Courses' : 'Интенсивные групповые курсы'}
                    </h3>
                    <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider mt-1 text-slate-400 dark:text-slate-500">
                      {language === 'en' 
                        ? 'Accelerate your progress in focused, small-group training cohorts led by team leads' 
                        : 'Ускорьте прогресс в мини-группах под руководством ведущих тренеров'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...courses].sort((a, b) => {
                      const orderA = a.order !== undefined ? a.order : 999;
                      const orderB = b.order !== undefined ? b.order : 999;
                      if (orderA !== orderB) return orderA - orderB;
                      return a.title.localeCompare(b.title);
                    }).filter(c => !c.isHidden).map((rawCourse) => {
                      const course = translateCourse(rawCourse, language);
                      const isEnrolled = bookings.some(b => b.userId === userProfile?.uid && b.instructorId === `course_${course.id}` && b.status !== 'cancelled');
                      return (
                        <div 
                          key={course.id} 
                          className="border border-[var(--border)] bg-black/10 dark:bg-black/40 flex flex-col h-full relative overflow-hidden group"
                        >
                          <div className="h-40 relative overflow-hidden shrink-0 border-b border-[var(--border)]">
                            <img 
                              src={course.bgImageUrl || 'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800'} 
                              referrerPolicy="no-referrer"
                              alt={course.title} 
                              className="w-full h-full object-cover transition-all duration-500 scale-100 group-hover:scale-105" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4">
                              <span className="font-mono text-[9px] uppercase tracking-widest text-sky-400 bg-sky-950/40 border border-sky-900/50 px-2 py-0.5 self-start">
                                {course.duration}
                              </span>
                            </div>
                          </div>
                          
                          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                            <div className="space-y-2">
                              <h4 className="font-serif text-lg font-light text-[var(--ink)] leading-tight">
                                {course.title}
                              </h4>
                              <p className="text-xs text-[var(--ink-dim)] leading-relaxed font-mono">
                                {course.description}
                              </p>

                              {rawCourse.instructorIds && rawCourse.instructorIds.length > 0 && (
                                <div className="space-y-1.5 pt-2">
                                  <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] block">
                                    {language === 'en' ? 'Course Leads' : 'Ведущие курса'}
                                  </span>
                                  <div className="flex gap-2">
                                    {rawCourse.instructorIds.map((insId) => {
                                      const ins = instructors.find(i => i.id === insId);
                                      if (!ins) return null;
                                      return (
                                        <div key={insId} className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 border border-[var(--border)] p-1.5 flex-1 min-w-0">
                                          <img 
                                            src={ins.avatarUrl} 
                                            referrerPolicy="no-referrer"
                                            alt={ins.name} 
                                            className="w-6 h-6 object-cover border border-[var(--border)] grayscale shrink-0" 
                                          />
                                          <div className="min-w-0 leading-none">
                                            <p className="text-[9px] font-bold text-[var(--ink)] truncate">
                                              {translateInstructorName(ins.name, language)}
                                            </p>
                                            <p className="text-[8px] text-[var(--ink-dim)] mt-1 truncate">
                                              {ins.specialty === 'both' ? (language === 'en' ? 'Ski/Snb' : 'Лыжи/Снб') : (ins.specialty === 'ski' ? (language === 'en' ? 'Ski' : 'Лыжи') : (language === 'en' ? 'Snb' : 'Сноуборд'))}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-3 pt-2">
                              {(() => {
                                const { datePart, timePart } = splitCourseDates(course.dates);
                                return (
                                  <>
                                    <div className="flex justify-between items-center text-[10px] font-mono text-[var(--ink-dim)] border-t border-[var(--border)]/40 pt-3">
                                      <span>{language === 'en' ? 'Dates' : 'Даты'}:</span>
                                      <span className="text-[var(--ink)] font-bold">{datePart}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-mono text-[var(--ink-dim)]">
                                      <span>{language === 'en' ? 'Time' : 'Время'}:</span>
                                      <span className="text-[var(--ink)] font-bold">{timePart}</span>
                                    </div>
                                  </>
                                );
                              })()}
                              <div className="flex justify-between items-center text-[10px] font-mono text-[var(--ink-dim)]">
                                <span>{language === 'en' ? 'Available Seats' : 'Свободные места'}:</span>
                                <span className={`font-bold ${course.availableSeats === 0 ? 'text-rose-500' : 'text-[var(--ink)]'}`}>
                                  {course.availableSeats} / {course.totalSeats}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-[10px] font-mono text-[var(--ink-dim)]">
                                <span>{language === 'en' ? 'Price' : 'Стоимость'}:</span>
                                <span className="text-[var(--ink)] font-bold text-sm">${course.price}</span>
                              </div>

                              <button
                                onClick={() => handleBookCourse(course.id)}
                                disabled={course.availableSeats === 0 && !isEnrolled}
                                className={`w-full py-2 border font-mono text-[10px] uppercase tracking-wider transition rounded-none ${
                                  isEnrolled 
                                    ? 'bg-emerald-950/20 border-emerald-500 text-emerald-400 cursor-default font-bold' 
                                    : course.availableSeats === 0 
                                      ? 'border-[var(--border)] text-[var(--ink-dim)] cursor-not-allowed bg-black/5' 
                                      : 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:bg-transparent hover:text-[var(--ink)] cursor-pointer'
                                }`}
                              >
                                {isEnrolled 
                                  ? (language === 'en' ? '✓ Registered' : '✓ Записан(а)') 
                                  : course.availableSeats === 0 
                                    ? (language === 'en' ? 'Sold Out' : 'Мест нет') 
                                    : (language === 'en' ? `Enroll Now` : `Записаться`)}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {courses.filter(c => !c.isHidden).length === 0 && (
                    <div className="text-center py-12 border border-dashed border-[var(--border)] bg-black/5 dark:bg-white/5 font-mono text-[11px] text-[var(--ink-dim)]">
                      {language === 'en' ? 'No intensive group courses are currently available.' : 'В данный момент нет доступных интенсивных групповых курсов.'}
                    </div>
                  )}
                </div>

                {/* Bottom Section: Instructors Browse Grid */}
                <div id="coaches-grid" className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-serif text-[var(--ink)] tracking-tight font-light">{t('meetGuides')}</h3>
                    <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider mt-1">{t('meetGuidesSub')}</p>
                  </div>

                  {/* Filters Panel */}
                  {filtersEnabled && (
                    <LessonFilters
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                      selectedSpecialty={selectedSpecialty}
                      setSelectedSpecialty={setSelectedSpecialty}
                      selectedLanguage={selectedLanguage}
                      setSelectedLanguage={setSelectedLanguage}
                      sortBy={sortBy}
                      setSortBy={setSortBy}
                    />
                  )}

                  {/* Grid roster */}
                  {filteredInstructors.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-[var(--border)]">
                      <Compass className="w-10 h-10 text-[var(--ink-dim)] mx-auto mb-3" />
                      <p className="text-xs font-mono text-[var(--ink-dim)] uppercase tracking-wider">{t('noCoachesMatch')}</p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedSpecialty('all');
                          setSelectedLanguage('all');
                        }}
                        className="text-xs font-mono uppercase tracking-widest text-indigo-400 hover:text-indigo-300 mt-2 hover:underline transition cursor-pointer"
                      >
                        {t('resetFilters')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <AnimatePresence mode="popLayout">
                        {filteredInstructors.map((ins: Instructor) => (
                          <InstructorCard
                            key={ins.id}
                            instructor={ins}
                            onBook={(i) => {
                              if (!userProfile) {
                                addNotification(
                                  'warning',
                                  language === 'en' ? 'Sign In Required' : 'Требуется войти',
                                  language === 'en'
                                    ? 'Sign in to schedule elite instructors, manage wallets, and track training sessions.'
                                    : 'Войдите, чтобы бронировать инструкторов, пополнять кошелек и видеть расписание.'
                                );
                                return;
                              }
                              setSelectedInstructor(i);
                            }}
                            onViewReviews={(i) => setReviewsInstructor(i)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* 3. Right Sidebar: Profile & Upcoming Active Sessions (placed in the third flexible column) */}
            <aside className="lg:col-start-3 border-t lg:border-t-0 lg:border-l border-[var(--border)] p-6 bg-[var(--profile-bg)] space-y-6 flex flex-col justify-start lg:h-full lg:overflow-y-auto shrink-0">
              {userProfile ? (
                <>
                  {/* Calendar Strip & Upcoming Sessions */}
                  {(() => {
                    const isBookingOnDate = (b: any, dateStr: string) => {
                      if (b.status === 'cancelled' || b.status === 'completed' || b.userId?.startsWith('system_block_')) {
                        return false;
                      }
                      if (b.instructorId.startsWith('course_')) {
                        const courseId = b.instructorId.substring('course_'.length);
                        const course = courses.find(c => c.id === courseId);
                        const datesToParse = course ? course.dates : b.date;
                        const parsed = parseCourseDates(datesToParse);
                        const startY = parsed.start.getFullYear();
                        const startM = String(parsed.start.getMonth() + 1).padStart(2, '0');
                        const startD = String(parsed.start.getDate()).padStart(2, '0');
                        const startDateStr = `${startY}-${startM}-${startD}`;

                        const endY = parsed.end.getFullYear();
                        const endM = String(parsed.end.getMonth() + 1).padStart(2, '0');
                        const endD = String(parsed.end.getDate()).padStart(2, '0');
                        const endDateStr = `${endY}-${endM}-${endD}`;

                        return dateStr >= startDateStr && dateStr <= endDateStr;
                      } else {
                        return b.date === dateStr;
                      }
                    };

                    const todayDate = new Date();
                    const upcomingSevenDays: string[] = [];
                    const upcomingDaysNumbers: { day: number; dateStr: string }[] = [];

                    for (let i = 0; i < 7; i++) {
                      const d = new Date();
                      d.setDate(todayDate.getDate() + i);
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, '0');
                      const dayVal = d.getDate();
                      const dateStr = `${y}-${m}-${String(dayVal).padStart(2, '0')}`;
                      upcomingSevenDays.push(dateStr);
                      upcomingDaysNumbers.push({ day: dayVal, dateStr });
                    }

                    const getMonthYearHeader = () => {
                      const monthName = todayDate.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'long' });
                      const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                      const year = todayDate.getFullYear();
                      return language === 'en' ? `Schedule • ${capitalizedMonth} ${year}` : `Расписание • ${capitalizedMonth} ${year}`;
                    };

                    return (
                      <>
                        <div className="space-y-3 pb-6 border-b border-[var(--border)]">
                          <div className="flex justify-between items-center text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                            <span>{getMonthYearHeader()}</span>
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {/* Generate 7 days starting dynamically from today */}
                            {upcomingDaysNumbers.map(({ day, dateStr }) => {
                              // Check if user has a booking on this date
                              const hasBooking = bookings.some(b => b.userId === userProfile?.uid && isBookingOnDate(b, dateStr));
                              return (
                                <div 
                                  key={dateStr} 
                                  className={`text-center py-2 text-[10px] border font-mono transition duration-300 ${
                                    hasBooking 
                                      ? 'bg-[var(--ink)] text-[var(--bg)] font-bold border-[var(--ink)]' 
                                      : 'border-[var(--border)] text-[var(--ink-dim)] hover:border-[var(--ink)]'
                                  }`}
                                  title={hasBooking ? (language === 'en' ? 'Booked lesson' : 'Забронировано занятие') : (language === 'en' ? 'No lessons' : 'Нет занятий')}
                                >
                                  {day}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Nearest lessons or courses within the next 7 days */}
                        <div className="p-4 border border-[var(--border)] bg-black/30 space-y-4">
                          <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--ink-dim)] block">
                            {language === 'en' ? 'Upcoming Sessions (7 Days)' : 'Ближайшие занятия (7 дней)'}
                          </span>
                          {(() => {
                            const rawActiveBookings = bookings.filter(b => 
                              b.userId === userProfile?.uid && 
                              (b.status === 'confirmed' || b.status === 'pending') && 
                              !b.userId?.startsWith('system_block_') &&
                              upcomingSevenDays.some(dayStr => isBookingOnDate(b, dayStr))
                            );

                            const activeBookings = rawActiveBookings.map((b) => {
                              const isCourse = b.instructorId.startsWith('course_');
                              if (isCourse) {
                                const courseId = b.instructorId.substring('course_'.length);
                                const liveCourse = courses.find(c => c.id === courseId);
                                if (liveCourse) {
                                  const translated = translateCourse(liveCourse, language);
                                  return {
                                    ...b,
                                    instructorName: language === 'ru' ? `${translated.title} (Групповой курс)` : `${translated.title} (Group Course)`,
                                    instructorAvatar: translated.bgImageUrl || b.instructorAvatar,
                                    durationHours: parseDurationHours(translated.duration, b.durationHours),
                                    totalPrice: liveCourse.price
                                  };
                                }
                              }
                              return {
                                ...b,
                                instructorName: translateInstructorName(b.instructorName, language)
                              };
                            });
                            
                            const sortedActiveBookings = [...activeBookings].sort((a, b) => {
                              let aDate = a.date;
                              let bDate = b.date;
                              if (a.instructorId.startsWith('course_')) {
                                const courseId = a.instructorId.substring('course_'.length);
                                const course = courses.find(c => c.id === courseId);
                                const parsed = parseCourseDates(course ? course.dates : a.date);
                                const startY = parsed.start.getFullYear();
                                const startM = String(parsed.start.getMonth() + 1).padStart(2, '0');
                                const startD = String(parsed.start.getDate()).padStart(2, '0');
                                aDate = `${startY}-${startM}-${startD}`;
                              }
                              if (b.instructorId.startsWith('course_')) {
                                const courseId = b.instructorId.substring('course_'.length);
                                const course = courses.find(c => c.id === courseId);
                                const parsed = parseCourseDates(course ? course.dates : b.date);
                                const startY = parsed.start.getFullYear();
                                const startM = String(parsed.start.getMonth() + 1).padStart(2, '0');
                                const startD = String(parsed.start.getDate()).padStart(2, '0');
                                bDate = `${startY}-${startM}-${startD}`;
                              }
                              
                              if (aDate !== bDate) {
                                return aDate.localeCompare(bDate);
                              }
                              return a.time.localeCompare(b.time);
                            });

                            const getDifficultyLabelShort = (diff: string) => {
                              if (language === 'ru') {
                                switch (diff.toLowerCase()) {
                                  case 'beginner': return 'Новичок';
                                  case 'intermediate': return 'Средний';
                                  case 'advanced': return 'Продвинутый';
                                  case 'freeride': return 'Фрирайд';
                                  case 'freestyle': return 'Фристайл';
                                  default: return diff;
                                }
                              }
                              return diff.charAt(0).toUpperCase() + diff.slice(1);
                            };

                            const formatBookingDate = (bObj: any) => {
                              if (bObj.instructorId.startsWith('course_')) {
                                const courseId = bObj.instructorId.substring('course_'.length);
                                const course = courses.find(c => c.id === courseId);
                                const rawDates = course ? course.dates : bObj.date;
                                const parsed = parseCourseDates(rawDates);
                                
                                const startDay = parsed.start.getDate();
                                const startMonth = parsed.start.getMonth() + 1;
                                const endDay = parsed.end.getDate();
                                const endMonth = parsed.end.getMonth() + 1;
                                
                                if (language === 'ru') {
                                  const monthsRu = [
                                    'янв', 'фев', 'мар', 'апр', 'май', 'июн', 
                                    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
                                  ];
                                  const startMonthName = monthsRu[startMonth - 1] || 'июл';
                                  const endMonthName = monthsRu[endMonth - 1] || 'июл';
                                  if (startMonth === endMonth) {
                                    return `${startDay}-${endDay} ${startMonthName}`;
                                  } else {
                                    return `${startDay} ${startMonthName} - ${endDay} ${endMonthName}`;
                                  }
                                } else {
                                  const monthsEn = [
                                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                                  ];
                                  const startMonthName = monthsEn[startMonth - 1] || 'Jul';
                                  const endMonthName = monthsEn[endMonth - 1] || 'Jul';
                                  if (startMonth === endMonth) {
                                    return `${startMonthName} ${startDay}-${endDay}`;
                                  } else {
                                    return `${startMonthName} ${startDay} - ${endMonthName} ${endDay}`;
                                  }
                                }
                              } else {
                                const [, monthStr, dayStr] = bObj.date.split('-');
                                const day = parseInt(dayStr, 10);
                                const month = parseInt(monthStr, 10);
                                if (language === 'ru') {
                                  const monthsRu = [
                                    'янв', 'фев', 'мар', 'апр', 'май', 'июн', 
                                    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
                                  ];
                                  const monthName = monthsRu[month - 1] || 'июл';
                                  return `${day} ${monthName} в ${bObj.time}`;
                                } else {
                                  const monthsEn = [
                                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                                  ];
                                  const monthName = monthsEn[month - 1] || 'Jul';
                                  return `${monthName} ${day} at ${bObj.time}`;
                                }
                              }
                            };

                            if (sortedActiveBookings.length > 0) {
                              return (
                                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                                  {sortedActiveBookings.map((b) => {
                                    const displayInstructorName = b.instructorName;

                                    return (
                                      <div key={b.id} className="space-y-3 pb-3 border-b border-[var(--border)] last:pb-0 last:border-b-0">
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-none overflow-hidden bg-slate-900 border border-[var(--border)] shrink-0">
                                            <img src={b.instructorAvatar} alt={displayInstructorName} className="w-full h-full object-cover filter grayscale" />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <h3 className="font-serif text-sm text-[var(--ink)] leading-none truncate">{displayInstructorName}</h3>
                                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1">
                                              <p className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                                                {getDifficultyLabelShort(b.difficulty)} • {b.durationHours}{language === 'en' ? 'h' : 'ч'}
                                              </p>
                                              <span className="text-[9px] font-mono text-[var(--ink-dim)]">•</span>
                                              <p className="text-[9px] font-mono text-indigo-400 font-medium">
                                                {formatBookingDate(b)}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex justify-between items-center pt-1 border-t border-[var(--border)]/30">
                                          <span className="font-mono text-[9px] text-[var(--ink)]">
                                            {language === 'en' ? `Paid $${b.totalPrice}` : `Оплачено $${b.totalPrice}`}
                                          </span>
                                          <span className={`font-mono text-[7px] px-1.5 py-0.5 uppercase font-bold tracking-widest border ${
                                            b.status === 'confirmed' 
                                              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/30' 
                                              : 'border-amber-500/40 text-amber-400 bg-amber-950/30'
                                          }`}>
                                            {b.status === 'confirmed' 
                                              ? (language === 'en' ? 'Confirmed' : 'Подтверждено')
                                              : (language === 'en' ? 'Pending' : 'Ожидает')}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            } else {
                              return (
                                <p className="text-[10px] text-[var(--ink-dim)] text-center py-4">
                                  {language === 'en' ? 'No sessions scheduled for this week.' : 'Нет занятий, запланированных на эту неделю.'}
                                </p>
                              );
                            }
                          })()}
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                /* Logged-out state: show Auth component inside Right Sidebar! */
                <div className="space-y-6">
                  <div className="text-center space-y-4 py-4">
                    <img
                      src={theme === 'light' ? logoLight : logoDark}
                      alt="Carve Academy Logo"
                      className="h-12 w-auto mx-auto object-contain transition-opacity duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider leading-relaxed">
                      {language === 'en' 
                        ? 'Sign in to schedule elite instructors, manage wallets, and track training sessions.' 
                        : 'Войдите, чтобы бронировать инструкторов, пополнять кошелек и видеть расписание.'}
                    </p>
                  </div>
                  <div className="border border-[var(--border)] p-4 bg-black/10">
                    <Auth onSuccess={(profile) => setUserProfile(profile)} />
                  </div>
                </div>
              )}
            </aside>
          </>
        )}
      </main>

      {/* Global Modals */}
      <BookingModal
        isOpen={selectedInstructor !== null}
        onClose={() => setSelectedInstructor(null)}
        instructor={selectedInstructor ? translateInstructor(selectedInstructor, language) : null}
        userProfile={userProfile}
        onBookingSuccess={handleBookingSuccess}
        onOpenTopUp={() => setIsTopUpOpen(true)}
        courses={courses}
      />

      <InstructorReviewsModal
        isOpen={reviewsInstructor !== null}
        onClose={() => setReviewsInstructor(null)}
        instructor={reviewsInstructor ? translateInstructor(reviewsInstructor, language) : null}
        reviews={reviews}
      />

      <PaymentGateway
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalance={userProfile?.balanceUSD || 0}
        onPaymentSuccess={handlePaymentSuccess}
      />

      <NotificationHubModal
        isOpen={isNotifHistoryOpen}
        onClose={() => setIsNotifHistoryOpen(false)}
        bookings={bookings}
        reviews={reviews}
        userProfile={userProfile}
        dismissedReviewIds={dismissedReviewIds}
        onDismissReview={handleDismissReview}
        dbNotifications={dbNotifications}
        onClearNotifications={handleClearNotifications}
      />

      {/* Status Footer */}
      <footer className="bg-black/95 border-t border-[var(--border)] py-3 px-6 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
          <div className="flex items-center gap-2 text-[var(--ink)] font-bold">
            <Mountain className="w-3.5 h-3.5 text-sky-400 stroke-[2.5]" />
            <span>CARVE ACADEMY DIGITAL INTERFACE v4.4</span>
          </div>
          <div className="text-center md:text-left">
            {language === 'en' 
              ? 'SIMULATION ENVIRONMENT • TOTAL SECURE LOCAL STATE' 
              : 'СРЕДА СИМУЛЯЦИИ • БЕЗОПАСНЫЙ САНДБОКС'}
          </div>
          <div className="flex gap-4">
            <span>FIS-2026 STANDARD</span>
            <span>SLOPE SAFETY PRESETS</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </LanguageProvider>
  );
};

