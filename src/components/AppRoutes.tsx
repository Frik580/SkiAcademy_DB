import React from 'react';
import { AnimatePresence } from 'motion/react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { User } from 'firebase/auth';
import { Compass, RefreshCw } from 'lucide-react';

import { AdminRoute } from './AdminRoute';
import { Auth } from './Auth';
import { GroupCoursesSection } from './GroupCoursesSection';
import { HeroCarousel } from './HeroCarousel';
import { InstructorCard } from './InstructorCard';
import { LessonFilters } from './LessonFilters';
import { ResortConditionsSidebar } from './ResortConditionsSidebar';
import { Instructor, Course, Booking, Review, UserProfile, ResortConfig } from '../types';
import { Language } from '../lib/LanguageContext';
import { SkillConfig } from '../lib/skillData';
import { useLanguage } from '../lib/LanguageContext';
import { InstructorSpecialty, InstructorSortBy } from './useInstructorFilters';
import { LazyLoad } from './LazyLoad';

import logoLight from '../assets/images/logo2.png';
import logoDark from '../assets/images/logo1.png';

const AdminPanel = React.lazy(() =>
  import('./AdminPanel').then(({ AdminPanel }) => ({ default: AdminPanel }))
);
const PersonalCabinet = React.lazy(() =>
  import('./PersonalCabinet').then(({ PersonalCabinet }) => ({ default: PersonalCabinet }))
);

const SectionLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex min-h-40 items-center justify-center gap-2 border border-[var(--border)] text-[var(--ink-dim)]">
    <RefreshCw className="h-4 w-4 animate-spin" />
    <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
  </div>
);

interface ResortData {
  resortConfig: ResortConfig;
  tempC: number;
  snowDepthCm: number;
  newSnow24h: number;
  windKmh: number;
  openLifts: number;
  isFahrenheit: boolean;
  isResortLoading: boolean;
  lastUpdated: string;
}

interface DeletedCompletedStats {
  revenue: number;
  count: number;
}

interface AppRoutesProps {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  language: Language;
  theme: 'light' | 'dark';
  filtersEnabled: boolean;
  skillConfig: SkillConfig;
  resortData: ResortData;
  instructors: Instructor[];
  translatedInstructors: Instructor[];
  filteredInstructors: Instructor[];
  courses: Course[];
  bookings: Booking[];
  reviews: Review[];
  usersList: UserProfile[];
  deletedCompletedStats: DeletedCompletedStats;
  dismissedReviewIds: string[];
  // Filter state
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedSpecialty: InstructorSpecialty;
  setSelectedSpecialty: (s: InstructorSpecialty) => void;
  selectedLanguage: string;
  setSelectedLanguage: (l: string) => void;
  sortBy: InstructorSortBy;
  setSortBy: (s: InstructorSortBy) => void;
  resetFilters: () => void;
  // Modal setters
  setSelectedInstructor: (ins: Instructor | null) => void;
  setSelectedCourseForAuth: (course: Course | null) => void;
  setSelectedCourseForDetails: (course: Course | null) => void;
  setReviewsInstructor: (ins: Instructor | null) => void;
  // Actions
  onToggleFilters: (enabled: boolean) => Promise<void>;
  onUpdateSkillConfig: (config: SkillConfig) => Promise<void>;
  onBookCourse: (courseId: string) => Promise<void>;
  onReschedule: (id: string, newDate: string, newTime: string) => Promise<void>;
  onCancel: (id: string, reason?: string) => Promise<void>;
  onAddReview: (
    review: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>
  ) => Promise<void>;
  onDismissReview: (reviewId: string) => void;
  onSignOut: () => void;
  onUpdateProfile: (data: Partial<UserProfile>) => Promise<void>;
  setUserProfile: (profile: UserProfile | null) => void;
  // Admin actions
  onConfirmBooking: (id: string) => Promise<void>;
  onCompleteBooking: (id: string) => Promise<void>;
  onLinkGuestBooking: (bookingId: string, targetUserId: string) => Promise<void>;
  onDeleteBooking: (id: string) => Promise<void>;
  onAddBooking: (booking: Booking) => Promise<void>;
  onAddCourse: (course: Course) => Promise<void>;
  onUpdateCourse: (course: Course) => Promise<void>;
  onDeleteCourse: (courseId: string) => Promise<void>;
  onAddInstructor: (instructor: Instructor) => Promise<void>;
  onUpdateInstructor: (instructor: Instructor) => Promise<void>;
  onDeleteInstructor: (instructorId: string) => Promise<void>;
  onUpdateUserRole: (uid: string, role: 'admin' | 'user') => Promise<void>;
  onAddUser: (user: UserProfile) => Promise<void>;
  onUpdateUser: (user: UserProfile) => Promise<void>;
  onDeleteUser: (uid: string) => Promise<void>;
  // Resort actions
  setIsFahrenheit: (value: boolean) => void;
  onRefreshResortStats: () => void;
}

const HomeRoute: React.FC<AppRoutesProps> = (props) => {
  const { t } = useLanguage();
  const {
    userProfile,
    language,
    theme,
    filtersEnabled,
    resortData,
    courses,
    bookings,
    instructors,
    filteredInstructors,
    reviews,
    usersList,
    dismissedReviewIds,
    skillConfig,
    searchQuery,
    setSearchQuery,
    selectedSpecialty,
    setSelectedSpecialty,
    selectedLanguage,
    setSelectedLanguage,
    sortBy,
    setSortBy,
    resetFilters,
    setSelectedInstructor,
    setSelectedCourseForAuth,
    setSelectedCourseForDetails,
    setReviewsInstructor,
    onBookCourse,
    onReschedule,
    onCancel,
    onAddReview,
    onDismissReview,
    onSignOut,
    onUpdateProfile,
    setUserProfile,
  } = props;

  const handleScrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <HeroCarousel
        data={{
          slides: resortData.resortConfig.slides,
          language,
          theme,
          slideIntervalSeconds: resortData.resortConfig.slideIntervalSeconds,
        }}
        actions={{ onScrollToSection: handleScrollToSection }}
      />

      <div
        className={`flex flex-col lg:grid ${
          userProfile
            ? 'lg:grid-cols-[minmax(140px,200px)_1fr]'
            : 'lg:grid-cols-[minmax(140px,200px)_minmax(450px,1fr)_minmax(250px,320px)]'
        }`}
      >
        <ResortConditionsSidebar
          data={{
            language,
            resortConfig: resortData.resortConfig,
            tempC: resortData.tempC,
            snowDepthCm: resortData.snowDepthCm,
            newSnow24h: resortData.newSnow24h,
            windKmh: resortData.windKmh,
            openLifts: resortData.openLifts,
            isFahrenheit: resortData.isFahrenheit,
            isResortLoading: resortData.isResortLoading,
            lastUpdated: resortData.lastUpdated,
          }}
          actions={{
            onToggleTemperatureUnit: () => props.setIsFahrenheit(!resortData.isFahrenheit),
            onRefresh: props.onRefreshResortStats,
          }}
        />

        <div className="flex flex-col">
          <div id="main-content-pane" className="p-6 md:p-8 space-y-8 flex flex-col justify-start">
            {userProfile && (
              <div id="personal-cabinet-section" className="space-y-4">
                <div className="border-b border-[var(--border)] pb-3 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-[var(--accent)] rounded-none"></span>
                  <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--ink)] font-bold">
                    {t('activeCabinet')}
                  </h3>
                </div>
                <LazyLoad fallback={<SectionLoadingFallback label={t('loading')} />}>
                  <PersonalCabinet
                    userProfile={userProfile}
                    bookings={bookings}
                    reviews={reviews}
                    dismissedReviewIds={dismissedReviewIds}
                    onDismissReview={onDismissReview}
                    onReschedule={onReschedule}
                    onCancel={onCancel}
                    onAddReview={onAddReview}
                    onSignOut={onSignOut}
                    onUpdateProfile={onUpdateProfile}
                    courses={courses}
                    instructors={instructors}
                    usersList={usersList}
                    skillConfig={skillConfig}
                  />
                </LazyLoad>
              </div>
            )}

            <GroupCoursesSection
              data={{
                courses,
                bookings,
                userProfile,
                language,
              }}
              actions={{
                onViewDetails: setSelectedCourseForDetails,
                onRequireAuth: setSelectedCourseForAuth,
                onBookCourse: onBookCourse,
              }}
            />

            <div id="coaches-grid" className="space-y-6">
              <div>
                <h3 className="text-2xl font-serif text-[var(--ink)] tracking-tight font-light">
                  {t('meetGuides')}
                </h3>
                <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider mt-1">
                  {t('meetGuidesSub')}
                </p>
              </div>

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

              {filteredInstructors.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-[var(--border)]">
                  <Compass className="w-10 h-10 text-[var(--ink-dim)] mx-auto mb-3" />
                  <p className="text-xs font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                    {t('noCoachesMatch')}
                  </p>
                  <button
                    onClick={resetFilters}
                    className="text-xs font-mono uppercase tracking-widest text-accent text-accent-hover mt-2 hover:underline transition cursor-pointer"
                  >
                    {t('resetFilters')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col">
                  <AnimatePresence mode="popLayout">
                    {filteredInstructors.map((ins) => (
                      <InstructorCard
                        key={ins.id}
                        instructor={ins}
                        onBook={(i) => setSelectedInstructor(i)}
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
  );
};

const AdminRouteWrapper: React.FC<AppRoutesProps> = (props) => {
  const {
    userProfile,
    translatedInstructors,
    bookings,
    usersList,
    courses,
    deletedCompletedStats,
    filtersEnabled,
    skillConfig,
    onToggleFilters,
    onUpdateSkillConfig,
    onUpdateUserRole,
    onAddInstructor,
    onUpdateInstructor,
    onDeleteInstructor,
    onConfirmBooking,
    onCompleteBooking,
    onLinkGuestBooking,
    onCancel,
    onAddUser,
    onUpdateUser,
    onDeleteUser,
    onReschedule,
    onDeleteBooking,
    onAddBooking,
    onAddCourse,
    onUpdateCourse,
    onDeleteCourse,
  } = props;

  const { t } = useLanguage();

  return (
    <AdminRoute userProfile={userProfile}>
      <LazyLoad fallback={<SectionLoadingFallback label={t('loading')} />}>
        <AdminPanel
          instructors={translatedInstructors}
          bookings={bookings}
          usersList={usersList}
          courses={courses}
          deletedCompletedStats={deletedCompletedStats}
          currentUserProfile={userProfile!}
          onUpdateUserRole={onUpdateUserRole}
          onAddInstructor={onAddInstructor}
          onUpdateInstructor={onUpdateInstructor}
          onDeleteInstructor={onDeleteInstructor}
          onConfirmBooking={onConfirmBooking}
          onCompleteBooking={onCompleteBooking}
          onLinkGuestBooking={onLinkGuestBooking}
          onCancelBooking={onCancel}
          onAddUser={onAddUser}
          onUpdateUser={onUpdateUser}
          onDeleteUser={onDeleteUser}
          onRescheduleBooking={onReschedule}
          onDeleteBooking={onDeleteBooking}
          onAddBooking={onAddBooking}
          onAddCourse={onAddCourse}
          onUpdateCourse={onUpdateCourse}
          onDeleteCourse={onDeleteCourse}
          filtersEnabled={filtersEnabled}
          onToggleFilters={onToggleFilters}
          skillConfig={skillConfig}
          onUpdateSkillConfig={onUpdateSkillConfig}
        />
      </LazyLoad>
    </AdminRoute>
  );
};

export const AppRoutes: React.FC<AppRoutesProps> = (props) => {
  return (
    <Routes>
      <Route path="/admin" element={<AdminRouteWrapper {...props} />} />
      <Route path="/" element={<HomeRoute {...props} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
