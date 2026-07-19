import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { 
  registerFirestoreErrorListener
} from './lib/firebase';
import { Instructor } from './types';
import { LanguageProvider, useLanguage, translateInstructor, translateCourse, splitCourseDates, parseCourseDates, parseDurationHours, translateInstructorName } from './lib/LanguageContext';

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
import { InstructorReviewsModal } from './components/InstructorReviewsModal';
import { PaymentGateway } from './components/PaymentGateway';
import { PersonalCabinet } from './components/PersonalCabinet';
import { AdminPanel } from './components/AdminPanel';
import logoLight from './assets/images/logo2.png';
import logoDark from './assets/images/logo1.png';

import { Compass, AlertCircle, RefreshCw, Mountain } from 'lucide-react';

const AppContent: React.FC = () => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();
  
  // --- Custom Hooks ---
  const { theme, toggleTheme } = useTheme();
  const { firebaseUser, userProfile, authLoading, setUserProfile, handleSignOut: signOutHandler } = useAuth();
  const {
    tempC, snowDepthCm, newSnow24h, windKmh, openLifts,
    isFahrenheit, setIsFahrenheit,
    isResortLoading, lastUpdated,
    handleRefreshResortStats
  } = useResortStats();
  const {
    instructors, reviews, bookings, usersList, courses, dbNotifications, deletedCompletedStats, filtersEnabled,
    dismissedReviewIds, handleDismissReview,
    handlePaymentSuccess, handleBookingSuccess, handleReschedule, handleAddCourse, handleUpdateCourse, handleDeleteCourse,
    handleBookCourse, handleCancel, handleRequestCancel, handleAddReview, handleAddInstructor, handleUpdateInstructor,
    handleDeleteInstructor, handleAddBooking, handleDeleteBooking, handleUpdateUserRole, handleAddUser, handleUpdateUser,
    handleDeleteUser, handleConfirmBooking, handleCompleteBooking, handleClearNotifications, handleUpdateProfile,
    handleToggleFilters
  } = useAppLogic(firebaseUser, userProfile, setUserProfile);

  // --- UI State (remains in component) ---
  const [randomWall] = useState<string>(() => {
    const walls = ['wall', 'wall2', 'wall3', 'wall4', 'wall5', 'wall6', 'wall7'];
    const randomIndex = Math.floor(Math.random() * walls.length);
    return walls[randomIndex];
  });
  const [dbStatusWarning, setDbStatusWarning] = useState<string | null>(null);
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState<boolean>(false);
  const [isNotifHistoryOpen, setIsNotifHistoryOpen] = useState<boolean>(false);
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
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
          : 'flex flex-col lg:grid lg:grid-cols-[minmax(140px,200px)_minmax(700px,1.5fr)_minmax(180px,350px)] lg:h-[calc(100vh-62px)] lg:overflow-hidden'
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
                className="relative space-y-3 p-8 md:p-10 border-b border-[var(--border)] overflow-hidden bg-cover bg-center flex flex-col justify-end min-h-[400px]"
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
                      onAddReview={handleAddReview} // Pass handler
                      onSignOut={handleSignOut}
                      onUpdateProfile={handleUpdateProfile}
                      courses={courses}
                      instructors={instructors}
                      usersList={usersList}
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
                                disabled={(course.availableSeats === 0 && !isEnrolled) || userProfile?.isClientActive === false}
                                className={`w-full py-2 border font-mono text-[10px] uppercase tracking-wider transition rounded-none ${
                                  isEnrolled 
                                    ? 'bg-emerald-950/20 border-emerald-500 text-emerald-400 cursor-default font-bold' 
                                    : userProfile?.isClientActive === false
                                      ? 'border-rose-900/40 text-rose-500 cursor-not-allowed bg-rose-950/10 font-bold'
                                      : course.availableSeats === 0 
                                        ? 'border-[var(--border)] text-[var(--ink-dim)] cursor-not-allowed bg-black/5' 
                                        : 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:bg-transparent hover:text-[var(--ink)] cursor-pointer'
                                }`}
                              >
                                {isEnrolled 
                                  ? (language === 'en' ? '✓ Registered' : '✓ Записан(а)') 
                                  : userProfile?.isClientActive === false
                                    ? (language === 'en' ? 'Access Suspended' : 'Доступ приостановлен')
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


