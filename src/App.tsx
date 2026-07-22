import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { 
  registerFirestoreErrorListener
} from './lib/firebase';
import { Instructor, CustomHeroSlide } from './types';
import { LanguageProvider, useLanguage, translateInstructor, translateCourse, splitCourseDates } from './lib/LanguageContext';

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
import { BookingModal } from './components/BookingModal';
import { CourseEnrollmentModal } from './components/CourseEnrollmentModal';
import { CourseDetailsModal } from './components/CourseDetailsModal';
import { InstructorReviewsModal } from './components/InstructorReviewsModal';
import { PaymentGateway } from './components/PaymentGateway';
import { PersonalCabinet } from './components/PersonalCabinet';
import { AdminPanel } from './components/AdminPanel';
import logoLight from './assets/images/logo2.png';
import logoDark from './assets/images/logo1.png';

import { Compass, AlertCircle, RefreshCw, Mountain, ArrowRight } from 'lucide-react';

const FALLBACK_SLIDES: CustomHeroSlide[] = [
  {
    id: '1',
    line1En: 'Curated Experiences',
    line1Ru: 'Эксклюзивный сервис',
    line2En: 'Perfect your technique with our elite guides.',
    line2Ru: 'Совершенствуйте технику с лучшими гидами.',
    line3En: 'PROFESSIONAL TRAINING: ski and snowboard, from foundations to competitive mastery.',
    line3Ru: 'ПРОФЕССИОНАЛЬНОЕ ОБУЧЕНИЕ: лыжи и сноуборд, от азов до соревновательного мастерства.',
    backgroundImage: 'wall'
  },
  {
    id: '2',
    line1En: 'Premium Coaching',
    line1Ru: 'Индивидуальный подход',
    line2En: 'Confidence on alpine skis — without fear and chaos, starting from the very first lesson.',
    line2Ru: 'Уверенное катание на горных лыжах — без страха и хаоса уже с первого занятия.',
    line3En: 'TAILORED SESSIONS: Step-by-step guidance designed specifically for rapid confidence.',
    line3Ru: 'ПЕРСОНАЛЬНЫЙ ФОРМАТ: Пошаговая методика, разработанная для быстрого преодоления барьеров.',
    backgroundImage: 'wall2'
  },
  {
    id: '3',
    line1En: 'Alpine Mastery',
    line1Ru: 'Свобода движения',
    line2En: 'Learn to enjoy skiing regardless of your current experience level.',
    line2Ru: 'Научим получать удовольствие от катания независимо от вашего уровня.',
    line3En: 'EXPERT GUIDES: Discover the joy of fluid movement across all types of slopes.',
    line3Ru: 'ЭКСПЕРТНЫЙ КОНТРОЛЬ: Раскройте легкость скольжения на любых склонах курорта.',
    backgroundImage: 'wall3'
  }
];

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
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % activeSlides.length);
    }, slideInterval * 1000);
    return () => clearInterval(interval);
  }, [activeSlides.length, slideInterval, currentSlide]);
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
      setDbStatusWarning(
        `Database sync restricted (Operation: ${op}, Path: ${path}). Using active sandboxed state.`
      );
    });
  }, []);

  const handleSignOut = async () => {
    try {
      await signOutHandler();
      setIsAdminView(false);
      addNotification(
        'info',
        language === 'en' ? 'Logged Out' : 'Выход выполнен',
        language === 'en' ? 'You have been securely signed out.' : 'Вы успешно вышли из системы.'
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
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
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
          : userProfile
            ? 'flex flex-col lg:grid lg:grid-cols-[minmax(140px,200px)_1fr] lg:h-[calc(100vh-62px)] lg:overflow-hidden'
            : 'flex flex-col lg:grid lg:grid-cols-[minmax(140px,200px)_minmax(450px,1fr)_minmax(250px,320px)] lg:h-[calc(100vh-62px)] lg:overflow-hidden'
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
            skillConfig={skillConfig}
            onUpdateSkillConfig={handleUpdateSkillConfig}
          />
        ) : (
          /* USER/CLIENT VIEW (Authenticated or Guest/Logged-out) */
          <>
            {/* 1. Left Sidebar: Resort Conditions (placed in the first flexible column) */}
            <aside className="lg:col-start-1 border-b lg:border-b-0 lg:border-r border-[var(--border)] p-6 space-y-6 flex flex-col justify-start shrink-0 lg:h-full lg:overflow-y-auto bg-transparent">
              <div className="border-b border-[var(--border)] pb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                  {language === 'ru' ? resortConfig.nameRu : resortConfig.nameEn}
                </span>
                <span className="text-[9px] text-[var(--ink-dim)] font-mono block mt-0.5">
                  {language === 'ru' ? resortConfig.subNameRu : resortConfig.subNameEn}
                </span>
              </div>

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

              {resortConfig.showLifts !== false && (
                <div className="border-b border-[var(--border)] pb-4">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
                    {language === 'en' ? 'Operating Lifts' : 'Подъемники'}
                  </span>
                  <span className="font-serif text-4xl font-light text-[var(--ink)] block mt-1">
                    {resortConfig.openLifts !== undefined ? resortConfig.openLifts : openLifts}/{resortConfig.totalLifts !== undefined ? resortConfig.totalLifts : 14}
                  </span>
                  {(() => {
                    const statusText = language === 'ru'
                      ? (resortConfig.liftsStatusRu || 'ОТКРЫТО')
                      : (resortConfig.liftsStatusEn || 'OPEN');
                    const isClosed = statusText.toUpperCase().includes('CLOSE') || 
                                     statusText.toUpperCase().includes('ЗАКР') || 
                                     statusText.toUpperCase().includes('OFF');
                    const colorClass = isClosed ? 'text-rose-500' : 'text-emerald-500';
                    const bgClass = isClosed ? 'bg-rose-500' : 'bg-emerald-500';
                    return (
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${colorClass} font-bold block mt-2.5 flex items-center gap-1.5`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${bgClass} animate-pulse`}></span>
                        {language === 'en' ? `STATUS: ${statusText}` : `СТАТУС: ${statusText}`}
                      </span>
                    );
                  })()}
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2 font-mono">
                <div className="flex justify-between items-center text-[10px]">
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
                <div className="text-[9px] text-[var(--ink-dim)] font-mono text-center pt-2 border-t border-[var(--border)]/40 mt-1">
                  {language === 'en' ? 'Weather: Open-Meteo' : 'Погода: Open-Meteo'}
                </div>
              </div>
            </aside>

            {/* 2. Center Scroll Pane: Hero, Active Cabinet Lists & Browsing (placed in the fixed-width center column) */}
            <div className="lg:col-start-2 flex-1 lg:h-full lg:overflow-y-auto flex flex-col justify-start">
              
              {/* Elegant welcoming Hero block with auto-rotating multi-slide panels */}
              <section 
                className="relative p-8 md:p-10 border-b border-[var(--border)] overflow-hidden flex flex-col justify-end min-h-[340px] bg-transparent"
              >
                {/* Background crossfader */}
                <AnimatePresence mode="popLayout">
                  {(() => {
                    const activeSlide = activeSlides[currentSlide] || activeSlides[0];
                    let bg = activeSlide?.backgroundImage || 'wall';
                    if (bg === 'random') {
                      const walls = ['wall', 'wall2', 'wall3', 'wall4', 'wall5', 'wall6', 'wall7'];
                      const slideId = activeSlide?.id || String(currentSlide);
                      const hash = Array.from(slideId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
                      bg = walls[hash % walls.length];
                    }
                    const bgUrl = bg.startsWith('http://') || bg.startsWith('https://')
                      ? bg
                      : `https://storage.yandexcloud.net/carve/${bg}.webp`;
                    return (
                      <motion.div
                        key={currentSlide}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.0 }}
                        className="absolute inset-0 bg-cover bg-center z-0"
                        style={{ 
                          backgroundImage: theme === 'light'
                            ? `linear-gradient(to right, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.5) 100%), url('${bgUrl}')`
                            : `linear-gradient(to right, rgba(15, 15, 18, 0.9) 0%, rgba(15, 15, 18, 0.4) 100%), url('${bgUrl}')`
                        }}
                      />
                    );
                  })()}
                </AnimatePresence>
 
                {/* Active Slide Content */}
                <div className="relative z-10 space-y-3 flex flex-col justify-end h-full">
                  <AnimatePresence mode="wait">
                    {(() => {
                      const activeSlide = activeSlides[currentSlide] || activeSlides[0];
                      if (!activeSlide) return null;
                      return (
                        <motion.div
                          key={currentSlide}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -12 }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className="flex flex-col md:flex-row md:items-end justify-between gap-6"
                        >
                          {/* Text content on the left */}
                          <div className="space-y-3 flex-1 min-w-0">
                            <span className={`text-[9px] font-mono uppercase tracking-widest block ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                              {language === 'en' ? activeSlide.line1En : activeSlide.line1Ru}
                            </span>
                            <h2 className={`text-2xl md:text-3xl lg:text-4xl font-serif font-light leading-[1.1] tracking-tight max-w-xl ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                              {language === 'en' ? activeSlide.line2En : activeSlide.line2Ru}
                            </h2>
                            <p className={`text-xs font-mono max-w-lg tracking-wider leading-relaxed pt-1 ${theme === 'light' ? 'text-slate-700' : 'text-slate-400'}`}>
                              {language === 'en' ? activeSlide.line3En : activeSlide.line3Ru}
                            </p>
                          </div>

                          {/* Action Buttons on the right border */}
                          <div className="flex flex-col gap-2.5 shrink-0 w-full md:w-auto md:min-w-[240px] self-start md:self-end z-20">
                            <button
                              onClick={() => handleScrollToSection('coaches-grid')}
                              className="w-full px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-mono text-[10px] uppercase tracking-widest transition-all duration-300 shadow-lg shadow-blue-500/20 active:translate-y-[1px] cursor-pointer inline-flex items-center justify-center gap-2 font-bold border border-blue-600 hover:border-blue-700 rounded-none"
                            >
                              <span>{language === 'en' ? 'Book First Lesson' : 'Записаться на первое занятие'}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleScrollToSection('courses-grid')}
                              className={`w-full px-5 py-3 font-mono text-[10px] uppercase tracking-widest transition-all duration-300 active:translate-y-[1px] cursor-pointer inline-flex items-center justify-center gap-2 border rounded-none ${
                                theme === 'light'
                                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 hover:border-slate-300 text-slate-800'
                                  : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20 text-white'
                              }`}
                            >
                              <span>{language === 'en' ? 'Choose Course' : 'Подобрать курс'}</span>
                            </button>
                          </div>
                        </motion.div>
                      );
                    })()}
                  </AnimatePresence>
 
                  {/* Elegant dots indicators */}
                  <div className="flex gap-2 pt-4">
                    {activeSlides.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSlide(idx)}
                        className={`h-1 transition-all duration-300 rounded-none cursor-pointer ${
                          currentSlide === idx 
                            ? 'w-8 bg-[var(--ink)]' 
                            : 'w-2 bg-[var(--ink)]/30 hover:bg-[var(--ink)]/60'
                        }`}
                        aria-label={`Go to slide ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <div id="main-content-pane" className="p-6 md:p-8 space-y-8 flex flex-col justify-start">
                {/* Middle Section: Personal Cabinet Tracker / History of bookings */}
                {userProfile && (
                  <div id="personal-cabinet-section" className="space-y-4">
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
                      onAddReview={handleAddReview} // Pass handler
                      onSignOut={handleSignOut}
                      onUpdateProfile={handleUpdateProfile}
                      courses={courses}
                      instructors={instructors}
                      usersList={usersList}
                      skillConfig={skillConfig}
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

                  <div 
                    className="grid gap-6"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
                  >
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
                          className="border border-[var(--border)] bg-black/5 dark:bg-black/40 flex flex-col h-full relative overflow-hidden group min-w-[260px]"
                        >
                          <div className="h-55 relative overflow-hidden shrink-0 border-b border-[var(--border)]">
                            {course.badge && (
                              <div className="absolute top-3 left-3 z-10">
                                {/^(https?:\/\/|\/|data:image\/)/.test(course.badge) || /\.(png|jpg|jpeg|svg|gif|webp)/i.test(course.badge) ? (
                                  <img 
                                    src={course.badge} 
                                    referrerPolicy="no-referrer" 
                                    alt="badge" 
                                    className="h-7 w-auto object-contain max-w-[80px]" 
                                  />
                                ) : (
                                  <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-white border border-white/50 bg-transparent backdrop-blur-[2px] px-2 py-0.5 shadow-md">
                                    {course.badge}
                                  </span>
                                )}
                              </div>
                            )}
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
                              {course.levelLabel && (
                                <div className={`text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1 mt-1 ${
                                  course.level === 'beginner' ? 'text-emerald-600 dark:text-emerald-400' :
                                  course.level === 'intermediate' ? 'text-amber-600 dark:text-amber-400' :
                                  course.level === 'advanced' ? 'text-rose-600 dark:text-rose-400' :
                                  course.level === 'expert' ? 'text-stone-500 dark:text-stone-400' : 'text-[var(--ink-dim)]'
                                }`}>
                                  {course.levelLabel}
                                </div>
                              )}
                              <p className="text-xs text-[var(--ink)] leading-relaxed font-mono">
                                {course.shortDescription || course.description}
                              </p>


                            </div>

                            <div className="space-y-4 pt-2">
                              {(() => {
                                const { datePart, timePart } = splitCourseDates(course.dates);
                                return (
                                  <div className="space-y-2 text-xs border-t border-[var(--border)]/40 pt-4">
                                    <div className="flex items-center gap-2 text-[var(--ink-dim)] font-sans font-light">
                                      <span className="text-sm">📅</span>
                                      <span className="font-mono text-[11px] tracking-wide">{datePart}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[var(--ink-dim)] font-sans font-light">
                                      <span className="text-sm">🕘</span>
                                      <span className="font-mono text-[11px] tracking-wide">{timePart}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[var(--ink)] font-sans font-light">
                                      {course.availableSeats === 0 ? (
                                        <>
                                          <span className="text-sm">🔴</span>
                                          <span className="font-mono text-[11px] tracking-wide text-rose-500 font-bold">
                                            {language === 'en' ? 'No seats left' : 'Мест нет'}
                                          </span>
                                        </>
                                      ) : course.availableSeats <= 3 ? (
                                        <>
                                          <span className="text-sm">🟠</span>
                                          <span className="font-mono text-[11px] tracking-wide text-amber-500 font-semibold">
                                            {language === 'en' ? `Only ${course.availableSeats} seats left!` : `Осталось всего ${course.availableSeats} мест!`}
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-sm">🟢</span>
                                          <span className="font-mono text-[11px] tracking-wide text-emerald-500">
                                            {language === 'en' ? `${course.availableSeats} of ${course.totalSeats} seats available` : `${course.availableSeats} из ${course.totalSeats} мест свободно`}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                    
                                    <div className="border-t border-[var(--border)]/30 my-3 pt-3 flex justify-between items-baseline">
                                      <span className="text-2xl font-serif text-[var(--ink)] font-light">${course.price}</span>
                                      <span className="text-[9px] font-mono tracking-wider text-[var(--ink-dim)]">
                                        {language === 'en' ? 'per course' : 'за полный курс'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}

                              <div className="grid grid-cols-[2fr_3fr] gap-2">
                                <button
                                  onClick={() => setSelectedCourseForDetails(rawCourse)}
                                  className="w-full py-2 border border-[var(--border)] bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 font-mono text-[10px] uppercase tracking-wider transition rounded-none cursor-pointer text-center text-[var(--ink)]"
                                >
                                  {language === 'en' ? 'Details' : 'Подробнее'}
                                </button>
                                <button
                                  onClick={() => {
                                    if (!userProfile) {
                                      setSelectedCourseForAuth(rawCourse);
                                    } else {
                                      handleBookCourse(course.id);
                                    }
                                  }}
                                  disabled={(course.availableSeats === 0 && !isEnrolled) || userProfile?.isClientActive === false}
                                  className={`w-full py-2 border font-mono text-[10px] uppercase tracking-wider transition rounded-none ${
                                    isEnrolled 
                                      ? 'bg-black/0 dark:bg-black/0 border-[var(--border)]/60 text-[var(--ink-dim)] cursor-default' 
                                      : userProfile?.isClientActive === false
                                        ? 'border-rose-900/40 text-rose-500 cursor-not-allowed bg-rose-950/10 font-bold'
                                        : course.availableSeats === 0 
                                          ? 'border-[var(--border)] text-[var(--ink-dim)] cursor-not-allowed bg-black/5' 
                                          : 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:bg-transparent hover:text-[var(--ink)] cursor-pointer'
                                  }`}
                                >
                                  {isEnrolled 
                                    ? (
                                      <span className="flex items-center justify-center gap-1 normal-case font-sans">
                                        <span className="text-emerald-500 font-bold text-xs">✔</span>{' '}
                                        {language === 'en' ? 'Enrolled' : 'Вы записаны'}
                                      </span>
                                    ) 
                                    : userProfile?.isClientActive === false
                                      ? (language === 'en' ? 'Access Suspended' : 'Доступ приостановлен')
                                      : course.availableSeats === 0 
                                        ? (language === 'en' ? 'Sold Out' : 'Мест нет') 
                                        : (language === 'en' ? `Enroll →` : `Записаться →`)}
                                </button>
                              </div>
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

            {/* 3. Right Sidebar */}
            {!userProfile && (
              <aside className="lg:col-start-3 border-t lg:border-t-0 lg:border-l border-[var(--border)] p-6 bg-[var(--profile-bg)] space-y-6 flex flex-col justify-start lg:h-full lg:overflow-y-auto shrink-0">
                {/* Logged-out state: show Auth component inside Right Sidebar! */}
                <div id="auth-section" className="space-y-6">
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
              </aside>
            )}
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
        onAuthSuccess={(profile) => setUserProfile(profile)}
      />

      <CourseEnrollmentModal
        isOpen={selectedCourseForAuth !== null}
        onClose={() => setSelectedCourseForAuth(null)}
        course={selectedCourseForAuth ? translateCourse(selectedCourseForAuth, language) : null}
        onAuthSuccess={(profile) => setUserProfile(profile)}
        onEnroll={handleBookCourse}
      />

      <CourseDetailsModal
        isOpen={selectedCourseForDetails !== null}
        onClose={() => setSelectedCourseForDetails(null)}
        rawCourse={selectedCourseForDetails}
        course={selectedCourseForDetails ? translateCourse(selectedCourseForDetails, language) : null}
        instructors={instructors}
        userProfile={userProfile}
        isEnrolled={selectedCourseForDetails ? bookings.some(b => b.userId === userProfile?.uid && b.instructorId === `course_${selectedCourseForDetails.id}` && b.status !== 'cancelled') : false}
        onEnroll={(courseId) => {
          if (!userProfile) {
            setSelectedCourseForAuth(selectedCourseForDetails);
          } else {
            handleBookCourse(courseId);
          }
        }}
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


