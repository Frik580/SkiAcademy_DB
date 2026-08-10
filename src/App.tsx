import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { registerFirestoreErrorListener, db, doc, updateDoc } from './lib/firebase';
import { LanguageProvider, useLanguage, translateCourse } from './lib/LanguageContext';
import { CurrencyProvider } from './lib/CurrencyContext';

import { useTheme } from './components/useTheme';
import { useResortStats } from './components/useResortStats';
import { useInstructorFilters } from './components/useInstructorFilters';
import { AppRoutes } from './components/AppRoutes';
import { OnboardingModal } from './components/OnboardingModal';
import { AuthModal } from './components/AuthModal';

import { logger } from './lib/logger';
import { applyDesignThemeToDOM } from './lib/designTheme';
import {
  NotificationProvider,
  useNotifications,
  NotificationHubModal,
} from './components/PushNotificationHub';
import { Navbar } from './components/Navbar';
import { LazyLoad } from './components/LazyLoad';
import { AlertCircle } from 'lucide-react';
import { AppInitSkeleton, ModalSkeleton } from './components/ui/Skeleton';
import { BodyScrollLock } from './components/ui/BodyScrollLock';

import { setStoreContext } from './store/storeContext';
import { useAuthStore, selectUnreadNotificationCount } from './store/authStore';
import { useBookingStore } from './store/bookingStore';
import { useCourseStore } from './store/courseStore';
import { useUiStore } from './store/uiStore';
import { useStoreSync } from './store/useStoreSync';

const BookingModal = React.lazy(() =>
  import('./components/BookingModal').then(({ BookingModal }) => ({ default: BookingModal }))
);
const CourseEnrollmentModal = React.lazy(() =>
  import('./components/CourseEnrollmentModal').then(({ CourseEnrollmentModal }) => ({
    default: CourseEnrollmentModal,
  }))
);
const CourseDetailsModal = React.lazy(() =>
  import('./components/CourseDetailsModal').then(({ CourseDetailsModal }) => ({
    default: CourseDetailsModal,
  }))
);
const InstructorReviewsModal = React.lazy(() =>
  import('./components/InstructorReviewsModal').then(({ InstructorReviewsModal }) => ({
    default: InstructorReviewsModal,
  }))
);
const PaymentGateway = React.lazy(() =>
  import('./components/PaymentGateway').then(({ PaymentGateway }) => ({ default: PaymentGateway }))
);

const ModalLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
    <BodyScrollLock />
    <ModalSkeleton title={label} />
  </div>
);

const AppContent: React.FC = () => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();

  useEffect(() => {
    setStoreContext({
      notify: (type, title, message) => addNotification(type as 'error' | 'success' | 'info' | 'warning', title, message),
      t: (key) => t(key as Parameters<typeof t>[0]),
      language: () => language,
    });
  }, [addNotification, t, language]);

  useStoreSync();

  const { theme, toggleTheme } = useTheme();
  const userProfile = useAuthStore((s) => s.userProfile);
  const authLoading = useAuthStore((s) => s.authLoading);
  const handleSignOut = useAuthStore((s) => s.handleSignOut);
  const setUserProfile = useAuthStore((s) => s.setUserProfile);
  const dismissedReviewIds = useAuthStore((s) => s.dismissedReviewIds);
  const dbNotifications = useAuthStore((s) => s.dbNotifications);
  const handleDismissReview = useAuthStore((s) => s.handleDismissReview);
  const handlePaymentSuccess = useAuthStore((s) => s.handlePaymentSuccess);
  const handleClearNotifications = useAuthStore((s) => s.handleClearNotifications);
  const handleDeleteNotification = useAuthStore((s) => s.handleDeleteNotification);
  const handleMarkNotificationsAsRead = useAuthStore((s) => s.handleMarkNotificationsAsRead);
  const unreadNotificationCount = useAuthStore(selectUnreadNotificationCount);

  const bookings = useBookingStore((s) => s.bookings);
  const reviews = useBookingStore((s) => s.reviews);
  const instructors = useBookingStore((s) => s.instructors);
  const handleBookingSuccess = useBookingStore((s) => s.handleBookingSuccess);
  const courses = useCourseStore((s) => s.courses);
  const handleBookCourse = useCourseStore((s) => s.handleBookCourse);

  const designTheme = useUiStore((s) => s.designTheme);
  const onboardingEnabled = useUiStore((s) => s.onboardingEnabled);
  const dbStatusWarning = useUiStore((s) => s.dbStatusWarning);
  const setDbStatusWarning = useUiStore((s) => s.setDbStatusWarning);
  const isTopUpOpen = useUiStore((s) => s.isTopUpOpen);
  const setIsTopUpOpen = useUiStore((s) => s.setIsTopUpOpen);
  const isNotifHistoryOpen = useUiStore((s) => s.isNotifHistoryOpen);
  const setIsNotifHistoryOpen = useUiStore((s) => s.setIsNotifHistoryOpen);
  const isOnboardingOpen = useUiStore((s) => s.isOnboardingOpen);
  const setIsOnboardingOpen = useUiStore((s) => s.setIsOnboardingOpen);
  const isAuthModalOpen = useUiStore((s) => s.isAuthModalOpen);
  const setIsAuthModalOpen = useUiStore((s) => s.setIsAuthModalOpen);
  const selectedInstructor = useUiStore((s) => s.selectedInstructor);
  const setSelectedInstructor = useUiStore((s) => s.setSelectedInstructor);
  const selectedCourseForAuth = useUiStore((s) => s.selectedCourseForAuth);
  const setSelectedCourseForAuth = useUiStore((s) => s.setSelectedCourseForAuth);
  const selectedCourseForDetails = useUiStore((s) => s.selectedCourseForDetails);
  const setSelectedCourseForDetails = useUiStore((s) => s.setSelectedCourseForDetails);
  const reviewsInstructor = useUiStore((s) => s.reviewsInstructor);
  const setReviewsInstructor = useUiStore((s) => s.setReviewsInstructor);

  const {
    resortConfig,
    tempC,
    snowDepthCm,
    newSnow24h,
    windKmh,
    weatherCode,
    openLifts,
    isFahrenheit,
    setIsFahrenheit,
    isResortLoading,
    lastUpdated,
    handleRefreshResortStats,
  } = useResortStats();

  useEffect(() => {
    applyDesignThemeToDOM(designTheme);
  }, [designTheme]);

  useInstructorFilters(language);

  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname === '/admin';
  const isPaddedWorkspaceRoute = isAdminRoute || location.pathname === '/instructor';
  const isHomeRoute = location.pathname === '/';

  const unreviewedCompletedCount = useMemo(() => {
    if (!userProfile?.uid) return 0;

    const userBookings = bookings.filter(
      (booking) => booking.userId === userProfile.uid && !booking.isDeleted
    );

    return userBookings.filter((booking) => {
      if (booking.status !== 'completed') return false;
      if (dismissedReviewIds.includes(booking.id)) return false;

      const alreadyReviewed = reviews.some(
        (review) =>
          review.bookingId === booking.id ||
          (review.userId === userProfile.uid &&
            review.instructorId === booking.instructorId &&
            review.date === booking.date)
      );

      return !alreadyReviewed;
    }).length;
  }, [bookings, reviews, userProfile?.uid, dismissedReviewIds]);

  const notificationBadgeCount = unreadNotificationCount + unreviewedCompletedCount;

  const handleOpenNotifications = () => {
    setIsNotifHistoryOpen(true);
    void handleMarkNotificationsAsRead();
  };

  useEffect(() => {
    if (onboardingEnabled && userProfile && userProfile.hasCompletedOnboarding === false) {
      const sessionKey = `onboarding_shown_${userProfile.uid}`;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, 'true');
        setIsOnboardingOpen(true);
      }
    }
  }, [userProfile, onboardingEnabled, setIsOnboardingOpen]);

  const handleCompleteOnboarding = async () => {
    setIsOnboardingOpen(false);
    if (userProfile) {
      try {
        await updateDoc(doc(db, 'users', userProfile.uid), {
          hasCompletedOnboarding: true,
        });
        setUserProfile({ ...userProfile, hasCompletedOnboarding: true });
      } catch (err) {
        logger.warn('Failed to save onboarding completion', err);
      }
    }
  };

  const handleScheduleFirstLessonFromOnboarding = () => {
    handleCompleteOnboarding();
    setTimeout(() => {
      const el =
        document.getElementById('coaches-grid') || document.getElementById('group-courses-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  useEffect(() => {
    registerFirestoreErrorListener((_err, op, path) => {
      logger.warn(`[Firestore Safe Fallback Triggered] Error during ${op} on ${path}`);
      setDbStatusWarning(
        `${t('dbRestricted')} (${t('operationLabel')}: ${op}, ${t('pathLabel')}: ${path})`
      );
    });
  }, [t, setDbStatusWarning]);

  const onSignOut = async () => {
    try {
      await handleSignOut();
      navigate('/', { replace: true });
      addNotification('info', t('loggedOut'), t('loggedOutDesc'));
    } catch (err) {
      logger.error(err);
    }
  };

  if (authLoading) {
    return <AppInitSkeleton label={t('checkingCredentials')} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] transition-colors duration-300">
      <Navbar
        userProfile={userProfile}
        onOpenTopUp={() => setIsTopUpOpen(true)}
        onOpenNotifications={handleOpenNotifications}
        unreadNotificationCount={notificationBadgeCount}
        onSignOut={onSignOut}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      <main
        className={`flex-1 w-full mx-auto ${
          isPaddedWorkspaceRoute && userProfile ? 'p-6 overflow-y-auto' : 'flex flex-col'
        }`}
      >
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

        <AppRoutes
          resortData={{
            resortConfig,
            tempC,
            snowDepthCm,
            newSnow24h,
            windKmh,
            weatherCode,
            openLifts,
            isFahrenheit,
            isResortLoading,
            lastUpdated,
          }}
          setIsFahrenheit={setIsFahrenheit}
          onRefreshResortStats={handleRefreshResortStats}
          onSignOut={onSignOut}
        />
      </main>

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={handleCompleteOnboarding}
        onScheduleFirstLesson={handleScheduleFirstLessonFromOnboarding}
      />

      {selectedInstructor && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <BookingModal
            isOpen
            onClose={() => setSelectedInstructor(null)}
            instructor={selectedInstructor}
            userProfile={userProfile}
            onBookingSuccess={handleBookingSuccess}
            onOpenTopUp={() => setIsTopUpOpen(true)}
            courses={courses}
            onAuthSuccess={setUserProfile}
          />
        </LazyLoad>
      )}

      {selectedCourseForAuth && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <CourseEnrollmentModal
            isOpen
            onClose={() => setSelectedCourseForAuth(null)}
            course={translateCourse(selectedCourseForAuth, language)}
            onAuthSuccess={setUserProfile}
            onEnroll={handleBookCourse}
          />
        </LazyLoad>
      )}

      {selectedCourseForDetails && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <CourseDetailsModal
            isOpen
            onClose={() => setSelectedCourseForDetails(null)}
            rawCourse={selectedCourseForDetails}
            course={translateCourse(selectedCourseForDetails, language)}
            instructors={instructors}
            userProfile={userProfile}
            isEnrolled={bookings.some(
              (b) =>
                b.userId === userProfile?.uid &&
                b.instructorId === `course_${selectedCourseForDetails.id}` &&
                b.status !== 'cancelled'
            )}
            onEnroll={(courseId) => {
              if (!userProfile) {
                setSelectedCourseForAuth(selectedCourseForDetails);
              } else {
                handleBookCourse(courseId);
              }
            }}
          />
        </LazyLoad>
      )}

      {reviewsInstructor && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <InstructorReviewsModal
            isOpen
            onClose={() => setReviewsInstructor(null)}
            instructor={reviewsInstructor}
            reviews={reviews}
          />
        </LazyLoad>
      )}

      {isTopUpOpen && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <PaymentGateway
            isOpen
            onClose={() => setIsTopUpOpen(false)}
            currentBalance={userProfile?.balanceUSD || 0}
            onPaymentSuccess={handlePaymentSuccess}
          />
        </LazyLoad>
      )}

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
        onDeleteNotification={handleDeleteNotification}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={setUserProfile}
      />

      <footer
        className={`ui-footer ui-site-footer border-t border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--profile-bg)]/40 ${
          isHomeRoute ? '' : 'max-[1199px]:hidden'
        }`}
      >
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--ink-dim)] font-mono">
            <div>© {new Date().getFullYear()} Carve Academy</div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="hover:text-[var(--ink)] transition-colors cursor-default">
                Ski & Snowboard Instruction
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <CurrencyProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </CurrencyProvider>
    </LanguageProvider>
  );
};
