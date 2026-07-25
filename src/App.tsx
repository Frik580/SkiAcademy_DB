import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { registerFirestoreErrorListener } from './lib/firebase';
import { Instructor, Course } from './types';
import { LanguageProvider, useLanguage, translateCourse } from './lib/LanguageContext';

import { useTheme } from './components/useTheme';
import { useAuth } from './components/useAuth';
import { useResortStats } from './components/useResortStats';
import { useAppLogic } from './components/useAppLogic';
import { useInstructorFilters } from './components/useInstructorFilters';
import { AppRoutes } from './components/AppRoutes';

import { logger } from './lib/logger';
import {
  NotificationProvider,
  useNotifications,
  NotificationHubModal,
} from './components/PushNotificationHub';
import { Navbar } from './components/Navbar';
import { AlertCircle, RefreshCw, Mountain } from 'lucide-react';

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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md">
    <div className="flex items-center gap-2 border border-[var(--border)] bg-[var(--bg)] px-6 py-4 text-[var(--ink-dim)]">
      <RefreshCw className="h-4 w-4 animate-spin" />
      <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
    </div>
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
    skillConfig,
    handleUpdateSkillConfig,
    dismissedReviewIds,
    handleDismissReview,
    handlePaymentSuccess,
    handleBookingSuccess,
    handleReschedule,
    handleAddCourse,
    handleUpdateCourse,
    handleDeleteCourse,
    handleBookCourse,
    handleRequestCancel,
    handleAddReview,
    handleAddInstructor,
    handleUpdateInstructor,
    handleDeleteInstructor,
    handleAddBooking,
    handleDeleteBooking,
    handleUpdateUserRole,
    handleAddUser,
    handleUpdateUser,
    handleDeleteUser,
    handleConfirmBooking,
    handleCompleteBooking,
    handleLinkGuestBooking,
    handleClearNotifications,
    handleUpdateProfile,
    handleToggleFilters,
  } = appLogic;

  const filterState = useInstructorFilters(instructors, language, filtersEnabled);

  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname === '/admin';

  const [dbStatusWarning, setDbStatusWarning] = useState<string | null>(null);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isNotifHistoryOpen, setIsNotifHistoryOpen] = useState(false);
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
  const [selectedCourseForAuth, setSelectedCourseForAuth] = useState<Course | null>(null);
  const [selectedCourseForDetails, setSelectedCourseForDetails] = useState<Course | null>(null);
  const [reviewsInstructor, setReviewsInstructor] = useState<Instructor | null>(null);

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

  const handleScrollToAuth = () => {
    const el = document.getElementById('auth-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = el.querySelector('input');
      if (input) input.focus();
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 gap-3">
        <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
        <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
          {t('checkingCredentials')}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] transition-colors duration-300">
      <Navbar
        userProfile={userProfile}
        onOpenTopUp={() => setIsTopUpOpen(true)}
        onOpenNotifications={() => setIsNotifHistoryOpen(true)}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignInClick={handleScrollToAuth}
      />

      <main
        className={`flex-1 w-full mx-auto ${
          isAdminRoute && userProfile && userProfile.role === 'admin'
            ? 'p-6 overflow-y-auto'
            : 'flex flex-col'
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
          skillConfig={skillConfig}
          resortData={{
            resortConfig,
            tempC,
            snowDepthCm,
            newSnow24h,
            windKmh,
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
          onToggleFilters={handleToggleFilters}
          onUpdateSkillConfig={handleUpdateSkillConfig}
          onBookCourse={handleBookCourse}
          onReschedule={handleReschedule}
          onCancel={handleRequestCancel}
          onAddReview={handleAddReview}
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
          setIsFahrenheit={setIsFahrenheit}
          onRefreshResortStats={handleRefreshResortStats}
        />
      </main>

      {selectedInstructor && (
        <React.Suspense fallback={<ModalLoadingFallback label={t('loading')} />}>
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
        </React.Suspense>
      )}

      {selectedCourseForAuth && (
        <React.Suspense fallback={<ModalLoadingFallback label={t('loading')} />}>
          <CourseEnrollmentModal
            isOpen
            onClose={() => setSelectedCourseForAuth(null)}
            course={translateCourse(selectedCourseForAuth, language)}
            onAuthSuccess={setUserProfile}
            onEnroll={handleBookCourse}
          />
        </React.Suspense>
      )}

      {selectedCourseForDetails && (
        <React.Suspense fallback={<ModalLoadingFallback label={t('loading')} />}>
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
        </React.Suspense>
      )}

      {reviewsInstructor && (
        <React.Suspense fallback={<ModalLoadingFallback label={t('loading')} />}>
          <InstructorReviewsModal
            isOpen
            onClose={() => setReviewsInstructor(null)}
            instructor={reviewsInstructor}
            reviews={reviews}
          />
        </React.Suspense>
      )}

      {isTopUpOpen && (
        <React.Suspense fallback={<ModalLoadingFallback label={t('loading')} />}>
          <PaymentGateway
            isOpen
            onClose={() => setIsTopUpOpen(false)}
            currentBalance={userProfile?.balanceUSD || 0}
            onPaymentSuccess={handlePaymentSuccess}
          />
        </React.Suspense>
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
      />

      <footer className="bg-black/95 border-t border-[var(--border)] py-3 px-6 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
          <div className="flex items-center gap-2 text-[var(--ink)] font-bold">
            <Mountain className="w-3.5 h-3.5 text-[var(--accent)] stroke-[2.5]" />
            <span>CARVE ACADEMY DIGITAL INTERFACE v4.4</span>
          </div>
          <div className="text-center md:text-left">{t('simulationEnvironment')}</div>
          <div className="flex gap-4">
            <span>{t('fisStandard')}</span>
            <span>{t('slopeSafetyPresets')}</span>
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
