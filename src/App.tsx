import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { 
  registerFirestoreErrorListener
} from './lib/firebase';
import { Instructor } from './types';
import { LanguageProvider, useLanguage, translateInstructor, translateCourse } from './lib/LanguageContext';
import { FALLBACK_SLIDES } from './components/admin/resortConfigDefaults';

// Custom Hooks
import { useTheme } from './components/useTheme';
import { useAuth } from './components/useAuth';
import { useResortStats } from './components/useResortStats';
import { useAppLogic } from './components/useAppLogic';

// Components
import { NotificationProvider, useNotifications, NotificationHubModal } from './components/PushNotificationHub';
import { Navbar } from './components/Navbar';
import { Auth } from './components/Auth';
import { LessonFilters } from './components/LessonFilters';
import { InstructorCard } from './components/InstructorCard';
import { ResortConditionsSidebar } from './components/ResortConditionsSidebar';
import { HeroCarousel } from './components/HeroCarousel';
import { GroupCoursesSection } from './components/GroupCoursesSection';
import logoLight from './assets/images/logo2.png';
import logoDark from './assets/images/logo1.png';

import { Compass, AlertCircle, RefreshCw, Mountain } from 'lucide-react';

const AdminPanel = React.lazy(() =>
  import('./components/AdminPanel').then(({ AdminPanel }) => ({ default: AdminPanel }))
);
const PersonalCabinet = React.lazy(() =>
  import('./components/PersonalCabinet').then(({ PersonalCabinet }) => ({ default: PersonalCabinet }))
);
const BookingModal = React.lazy(() =>
  import('./components/BookingModal').then(({ BookingModal }) => ({ default: BookingModal }))
);
const CourseEnrollmentModal = React.lazy(() =>
  import('./components/CourseEnrollmentModal').then(({ CourseEnrollmentModal }) => ({ default: CourseEnrollmentModal }))
);
const CourseDetailsModal = React.lazy(() =>
  import('./components/CourseDetailsModal').then(({ CourseDetailsModal }) => ({ default: CourseDetailsModal }))
);
const InstructorReviewsModal = React.lazy(() =>
  import('./components/InstructorReviewsModal').then(({ InstructorReviewsModal }) => ({ default: InstructorReviewsModal }))
);
const PaymentGateway = React.lazy(() =>
  import('./components/PaymentGateway').then(({ PaymentGateway }) => ({ default: PaymentGateway }))
);

const SectionLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex min-h-40 items-center justify-center gap-2 border border-[var(--border)] text-[var(--ink-dim)]">
    <RefreshCw className="h-4 w-4 animate-spin" />
    <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
  </div>
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
  
  // --- Custom Hooks ---
  const { theme, toggleTheme } = useTheme();
  const { firebaseUser, userProfile, authLoading, setUserProfile, handleSignOut: signOutHandler } = useAuth();
  const {
    resortConfig,
    tempC, snowDepthCm, newSnow24h, windKmh, openLifts,
    isFahrenheit, setIsFahrenheit,
    isResortLoading, lastUpdated,
    handleRefreshResortStats
  } = useResortStats();
  const {
    instructors, reviews, bookings, usersList, courses, dbNotifications, deletedCompletedStats, filtersEnabled,
    skillConfig, handleUpdateSkillConfig,
    dismissedReviewIds, handleDismissReview,
    handlePaymentSuccess, handleBookingSuccess, handleReschedule, handleAddCourse, handleUpdateCourse, handleDeleteCourse,
    handleBookCourse, handleCancel, handleRequestCancel, handleAddReview, handleAddInstructor, handleUpdateInstructor,
    handleDeleteInstructor, handleAddBooking, handleDeleteBooking, handleUpdateUserRole, handleAddUser, handleUpdateUser,
    handleDeleteUser, handleConfirmBooking, handleCompleteBooking, handleClearNotifications, handleUpdateProfile,
    handleToggleFilters
  } = useAppLogic(firebaseUser, userProfile, setUserProfile);

  // --- UI State (remains in component) ---
  const [currentSlide, setCurrentSlide] = useState(0);

  const activeSlides = useMemo(() => {
    return resortConfig.slides && resortConfig.slides.length > 0 ? resortConfig.slides : FALLBACK_SLIDES;
  }, [resortConfig.slides]);

  const slideInterval = resortConfig.slideIntervalSeconds || 6;

  useEffect(() => {
    if (currentSlide >= activeSlides.length) {
      setCurrentSlide(0);
    }
  }, [activeSlides.length, currentSlide]);

  useEffect(() => {
    if (activeSlides.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % activeSlides.length);
    }, slideInterval * 1000);

    return () => clearInterval(interval);
  }, [activeSlides.length, slideInterval]);
  const [dbStatusWarning, setDbStatusWarning] = useState<string | null>(null);
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState<boolean>(false);
  const [isNotifHistoryOpen, setIsNotifHistoryOpen] = useState<boolean>(false);
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
  const [selectedCourseForAuth, setSelectedCourseForAuth] = useState<any | null>(null);
  const [selectedCourseForDetails, setSelectedCourseForDetails] = useState<any | null>(null);
  const [reviewsInstructor, setReviewsInstructor] = useState<Instructor | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<'all' | 'ski' | 'snowboard' | 'both'>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'rating' | 'priceAsc' | 'priceDesc' | 'experience'>('rating');

  // Register a global error listener to warn users about Firestore permission restrictions
  useEffect(() => {
    registerFirestoreErrorListener((_err, op, path) => {
      console.warn(`[Firestore Safe Fallback Triggered] Error during ${op} on ${path}`);
      setDbStatusWarning(`${t('dbRestricted')} (${t('operationLabel')}: ${op}, ${t('pathLabel')}: ${path})`);
    });
  }, [t]);

  const handleSignOut = async () => {
    try {
      await signOutHandler();
      setIsAdminView(false);
      addNotification(
        'info',
        t('loggedOut'),
        t('loggedOutDesc')
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Translate instructors based on selected language
  const translatedInstructors = useMemo<Instructor[]>(() => {
    return instructors.map((ins: Instructor) => translateInstructor(ins, language));
  }, [instructors, language]);

  // Filter & Sort computation
  const filteredInstructors = translatedInstructors
    .filter((ins: Instructor) => {
      if (!ins.isAvailable) return false; // Не показывать недоступных инструкторов
      if (!filtersEnabled) return true; // Если фильтры отключены, показывать всех доступных
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
        <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
        <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('checkingCredentials')}</span>
      </div>
    );
  }

  const handleScrollToAuth = () => {
    const el = document.getElementById('auth-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = el.querySelector('input');
      if (input) {
        input.focus();
      }
    }
  };

  const handleScrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] transition-colors duration-300">
      {/* Global Navbar */}
      <Navbar
        userProfile={userProfile}
        onOpenTopUp={() => setIsTopUpOpen(true)}
        onOpenNotifications={() => setIsNotifHistoryOpen(true)}
        onToggleAdminView={() => setIsAdminView(!isAdminView)}
        isAdminView={isAdminView}
        onSignOut={handleSignOut} // Use the wrapped sign out
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignInClick={handleScrollToAuth}
      />

      {/* Main Body */}
      <main className={`flex-1 w-full mx-auto ${
        isAdminView && userProfile && userProfile.role === 'admin'
          ? 'p-6 overflow-y-auto'
          : 'flex flex-col'
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
          <React.Suspense fallback={<SectionLoadingFallback label={t('loading')} />}>
            <AdminPanel
              instructors={translatedInstructors}
              bookings={bookings}
              usersList={usersList}
              courses={courses}
              deletedCompletedStats={deletedCompletedStats}
              currentUserProfile={userProfile}
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
              skillConfig={skillConfig}
              onUpdateSkillConfig={handleUpdateSkillConfig}
            />
          </React.Suspense>
        ) : (
          /* USER/CLIENT VIEW (Authenticated or Guest/Logged-out) */
          <>
            <HeroCarousel
              data={{
                slides: activeSlides,
                currentSlide,
                language,
                theme
              }}
              actions={{
                onSelectSlide: setCurrentSlide,
                onScrollToSection: handleScrollToSection
              }}
            />

            <div className={`flex flex-col lg:grid ${
              userProfile
                ? 'lg:grid-cols-[minmax(140px,200px)_1fr]'
                : 'lg:grid-cols-[minmax(140px,200px)_minmax(450px,1fr)_minmax(250px,320px)]'
            }`}>
              <ResortConditionsSidebar
                data={{
                  language,
                  resortConfig,
                  tempC,
                  snowDepthCm,
                  newSnow24h,
                  windKmh,
                  openLifts,
                  isFahrenheit,
                  isResortLoading,
                  lastUpdated
                }}
                actions={{
                  onToggleTemperatureUnit: () => setIsFahrenheit(!isFahrenheit),
                  onRefresh: handleRefreshResortStats
                }}
              />

              <div className="flex flex-col">
                <div id="main-content-pane" className="p-6 md:p-8 space-y-8 flex flex-col justify-start">
                {/* Middle Section: Personal Cabinet Tracker / History of bookings */}
                {userProfile && (
                  <div id="personal-cabinet-section" className="space-y-4">
                    <div className="border-b border-[var(--border)] pb-3 mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 bg-[var(--accent)] rounded-none"></span>
                      <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--ink)] font-bold">{t('activeCabinet')}</h3>
                    </div>
                    <React.Suspense fallback={<SectionLoadingFallback label={t('loading')} />}>
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
                        instructors={instructors}
                        usersList={usersList}
                        skillConfig={skillConfig}
                      />
                    </React.Suspense>
                  </div>
                )}

                {/* Group Courses section */}
                <GroupCoursesSection
                  data={{
                    courses,
                    bookings,
                    userProfile,
                    language
                  }}
                  actions={{
                    onViewDetails: setSelectedCourseForDetails,
                    onRequireAuth: setSelectedCourseForAuth,
                    onBookCourse: handleBookCourse
                  }}
                />

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
                        className="text-xs font-mono uppercase tracking-widest text-accent text-accent-hover mt-2 hover:underline transition cursor-pointer"
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

              {!userProfile && (
                <aside className="border-t lg:border-t-0 lg:border-l border-[var(--border)] p-6 bg-[var(--profile-bg)] space-y-6 flex flex-col justify-start shrink-0">
                  <div id="auth-section" className="space-y-6">
                    <div className="text-center space-y-4 py-2">
                      <img
                        src={theme === 'light' ? logoLight : logoDark}
                        alt={t('academyLogoAlt')}
                        className="h-10 w-auto mx-auto object-contain transition-opacity duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider leading-relaxed">
                        {t('bookingSignInDesc')}
                      </p>
                    </div>
                    <div className="border border-[var(--border)] p-4 bg-black/5 dark:bg-black/10">
                      <Auth onSuccess={(profile) => setUserProfile(profile)} />
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </main>

      {/* Global Modals */}
      {selectedInstructor && (
        <React.Suspense fallback={<ModalLoadingFallback label={t('loading')} />}>
          <BookingModal
            isOpen
            onClose={() => setSelectedInstructor(null)}
            instructor={translateInstructor(selectedInstructor, language)}
            userProfile={userProfile}
            onBookingSuccess={handleBookingSuccess}
            onOpenTopUp={() => setIsTopUpOpen(true)}
            courses={courses}
            onAuthSuccess={(profile) => setUserProfile(profile)}
          />
        </React.Suspense>
      )}

      {selectedCourseForAuth && (
        <React.Suspense fallback={<ModalLoadingFallback label={t('loading')} />}>
          <CourseEnrollmentModal
            isOpen
            onClose={() => setSelectedCourseForAuth(null)}
            course={translateCourse(selectedCourseForAuth, language)}
            onAuthSuccess={(profile) => setUserProfile(profile)}
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
            isEnrolled={bookings.some(b => b.userId === userProfile?.uid && b.instructorId === `course_${selectedCourseForDetails.id}` && b.status !== 'cancelled')}
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
            instructor={translateInstructor(reviewsInstructor, language)}
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

      {/* Status Footer */}
      <footer className="bg-black/95 border-t border-[var(--border)] py-3 px-6 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
          <div className="flex items-center gap-2 text-[var(--ink)] font-bold">
            <Mountain className="w-3.5 h-3.5 text-[var(--accent)] stroke-[2.5]" />
            <span>CARVE ACADEMY DIGITAL INTERFACE v4.4</span>
          </div>
          <div className="text-center md:text-left">
            {t('simulationEnvironment')}
          </div>
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


