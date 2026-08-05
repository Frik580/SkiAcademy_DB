import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { registerFirestoreErrorListener, db, doc, updateDoc } from './lib/firebase';
import { Instructor, Course } from './types';
import { LanguageProvider, useLanguage, translateCourse } from './lib/LanguageContext';

import { useTheme } from './components/useTheme';
import { useAuth } from './components/useAuth';
import { useResortStats } from './components/useResortStats';
import { useAppLogic } from './components/useAppLogic';
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

  const { theme, toggleTheme } = useTheme();
  const {
    firebaseUser,
    userProfile,
    authLoading,
    setUserProfile,
    handleSignOut: signOutHandler,
  } = useAuth();
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
  const appLogic = useAppLogic(firebaseUser, userProfile, setUserProfile);
  const {
    instructors,
    reviews,
    bookings,
    usersList,
    courses,
    dbNotifications,
    deletedCompletedStats,
    filtersEnabled,
    onboardingEnabled,
    notificationRetentionDays,
    designTheme,
    skillConfig,
    achievementsConfig,
    handleUpdateSkillConfig,
    handleUpdateAchievementsConfig,
    handleSetDesignTheme,
    dismissedReviewIds,
    handleDismissReview,
    handlePaymentSuccess,
    handleBookingSuccess,
    handleReschedule,
    handleReassignInstructor,
    handleAddCourse,
    handleUpdateCourse,
    handleDeleteCourse,
    handleBookCourse,
    handleCancel,
    handleRequestCancel,
    handleAddReview,
    handleAddInstructor,
    handleUpdateInstructor,
    handleDeleteInstructor,
    handleAddBooking,
    handleDeleteBooking,
    handleClearStudentBookings,
    handleClearCancelledBookings,
    handleUpdateUserRole,
    handleAddUser,
    handleUpdateUser,
    handleDeleteUser,
    handleConfirmBooking,
    handleCompleteBooking,
    handleLinkGuestBooking,
    handleToggleRecommendation,
    handleToggleSkillToday,
    handlePinSkillsToday,
    handleToggleTodayTaskComplete,
    handleAddCustomTodayTask,
    handleRemoveTodayTask,
    handleClearNotifications,
    handleDeleteNotification,
    handleMarkNotificationsAsRead,
    unreadNotificationCount,
    activityLogs,
    handleUpdateProfile,
    handleToggleFilters,
    handleToggleOnboarding,
    handleSetNotificationRetentionDays,
  } = appLogic;

  useEffect(() => {
    applyDesignThemeToDOM(designTheme);
  }, [designTheme]);

  const filterState = useInstructorFilters(instructors, language, filtersEnabled);

  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname === '/admin';
  const isPaddedWorkspaceRoute = isAdminRoute || location.pathname === '/instructor';
  const isHomeRoute = location.pathname === '/';

  const [dbStatusWarning, setDbStatusWarning] = useState<string | null>(null);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isNotifHistoryOpen, setIsNotifHistoryOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
  const [selectedCourseForAuth, setSelectedCourseForAuth] = useState<Course | null>(null);
  const [selectedCourseForDetails, setSelectedCourseForDetails] = useState<Course | null>(null);
  const [reviewsInstructor, setReviewsInstructor] = useState<Instructor | null>(null);

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
  }, [userProfile, onboardingEnabled]);

  const handleCompleteOnboarding = async () => {
    setIsOnboardingOpen(false);
    if (userProfile) {
      try {
        await updateDoc(doc(db, 'users', userProfile.uid), {
          hasCompletedOnboarding: true,
        });
        setUserProfile((prev) => (prev ? { ...prev, hasCompletedOnboarding: true } : prev));
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
  }, [t]);

  const handleSignOut = async () => {
    try {
      await signOutHandler();
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
        onSignOut={handleSignOut}
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
          firebaseUser={firebaseUser}
          userProfile={userProfile}
          language={language}
          theme={theme}
          filtersEnabled={filtersEnabled}
          designTheme={designTheme}
          skillConfig={skillConfig}
          achievementsConfig={achievementsConfig}
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
          instructors={instructors}
          translatedInstructors={filterState.translatedInstructors}
          filteredInstructors={filterState.filteredInstructors}
          courses={courses}
          bookings={bookings}
          reviews={reviews}
          usersList={usersList}
          activityLogs={activityLogs}
          deletedCompletedStats={deletedCompletedStats}
          dismissedReviewIds={dismissedReviewIds}
          searchQuery={filterState.searchQuery}
          setSearchQuery={filterState.setSearchQuery}
          selectedSpecialty={filterState.selectedSpecialty}
          setSelectedSpecialty={filterState.setSelectedSpecialty}
          selectedLanguage={filterState.selectedLanguage}
          setSelectedLanguage={filterState.setSelectedLanguage}
          sortBy={filterState.sortBy}
          setSortBy={filterState.setSortBy}
          resetFilters={filterState.resetFilters}
          setSelectedInstructor={setSelectedInstructor}
          setSelectedCourseForAuth={setSelectedCourseForAuth}
          setSelectedCourseForDetails={setSelectedCourseForDetails}
          setReviewsInstructor={setReviewsInstructor}
          onboardingEnabled={onboardingEnabled}
          notificationRetentionDays={notificationRetentionDays}
          onToggleFilters={handleToggleFilters}
          onToggleOnboarding={handleToggleOnboarding}
          onSetNotificationRetentionDays={handleSetNotificationRetentionDays}
          onSetDesignTheme={handleSetDesignTheme}
          onUpdateSkillConfig={handleUpdateSkillConfig}
          onUpdateAchievementsConfig={handleUpdateAchievementsConfig}
          onBookCourse={handleBookCourse}
          onReschedule={handleReschedule}
          onReassignInstructor={handleReassignInstructor}
          onCancel={handleRequestCancel}
          onCancelBooking={handleCancel}
          onAddReview={handleAddReview}
          onToggleRecommendation={handleToggleRecommendation}
          onToggleSkillToday={handleToggleSkillToday}
          onPinSkillsToday={handlePinSkillsToday}
          onToggleTodayTaskComplete={handleToggleTodayTaskComplete}
          onAddCustomTodayTask={handleAddCustomTodayTask}
          onRemoveTodayTask={handleRemoveTodayTask}
          onDismissReview={handleDismissReview}
          onSignOut={handleSignOut}
          onUpdateProfile={handleUpdateProfile}
          setUserProfile={setUserProfile}
          onConfirmBooking={handleConfirmBooking}
          onCompleteBooking={handleCompleteBooking}
          onLinkGuestBooking={handleLinkGuestBooking}
          onDeleteBooking={handleDeleteBooking}
          onAddBooking={handleAddBooking}
          onAddCourse={handleAddCourse}
          onUpdateCourse={handleUpdateCourse}
          onDeleteCourse={handleDeleteCourse}
          onAddInstructor={handleAddInstructor}
          onUpdateInstructor={handleUpdateInstructor}
          onDeleteInstructor={handleDeleteInstructor}
          onUpdateUserRole={handleUpdateUserRole}
          onAddUser={handleAddUser}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
          onClearStudentBookings={handleClearStudentBookings}
          onClearCancelledBookings={handleClearCancelledBookings}
          setIsFahrenheit={setIsFahrenheit}
          onRefreshResortStats={handleRefreshResortStats}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
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
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </LanguageProvider>
  );
};
