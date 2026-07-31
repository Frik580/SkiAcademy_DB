import React from 'react';
import { AnimatePresence } from 'motion/react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { User } from 'firebase/auth';
import { Compass, RefreshCw } from 'lucide-react';

import { AdminRoute } from './AdminRoute';
import { AuthRoute } from './AuthRoute';
import { InstructorRoute } from './InstructorRoute';
import { Auth } from './Auth';
import { GroupCoursesSection } from './GroupCoursesSection';
import { HeroCarousel } from './HeroCarousel';
import { InstructorCard } from './InstructorCard';
import { LessonFilters } from './LessonFilters';
import { ResortConditionsSidebar } from './ResortConditionsSidebar';
import { Instructor, Course, Booking, Review, UserProfile, ResortConfig, ActivityLog } from '../types';
import { Language } from '../lib/LanguageContext';
import { SkillConfig } from '../lib/skillData';
import { AchievementsConfig } from '../lib/achievementConfig';
import { useLanguage } from '../lib/LanguageContext';
import { DesignTheme } from '../lib/designTheme';
import { CABINET_TABS, getDefaultWorkspacePath } from '../lib/workspaceRoutes';
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
  <div className="ui-empty-state flex min-h-40 items-center justify-center gap-2">
    <RefreshCw className="h-4 w-4 animate-spin" />
    <span className="ui-section-eyebrow">{label}</span>
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
  onboardingEnabled?: boolean;
  designTheme: DesignTheme;
  skillConfig: SkillConfig;
  achievementsConfig: AchievementsConfig;
  resortData: ResortData;
  instructors: Instructor[];
  translatedInstructors: Instructor[];
  filteredInstructors: Instructor[];
  courses: Course[];
  bookings: Booking[];
  reviews: Review[];
  usersList: UserProfile[];
  activityLogs: ActivityLog[];
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
  onToggleOnboarding?: (enabled: boolean) => Promise<void>;
  onSetDesignTheme: (theme: DesignTheme) => Promise<void>;
  onUpdateSkillConfig: (config: SkillConfig) => Promise<void>;
  onUpdateAchievementsConfig: (config: AchievementsConfig) => Promise<void>;
  onBookCourse: (courseId: string) => Promise<void>;
  onReschedule: (id: string, newDate: string, newTime: string) => Promise<void>;
  onReassignInstructor: (
    id: string,
    newInstructor: Instructor,
    newDate?: string,
    newTime?: string
  ) => Promise<void>;
  onCancel: (id: string, reason?: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onAddReview: (
    review: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>
  ) => Promise<void>;
  onToggleRecommendation?: (
    bookingId: string,
    recommendationId: string,
    checked: boolean
  ) => Promise<void>;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => Promise<void>;
  onPinSkillsToday?: (skillItemIds: string[]) => Promise<void>;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => Promise<void>;
  onAddCustomTodayTask?: (text: string) => Promise<void>;
  onRemoveTodayTask?: (task: import('../lib/todayChecklist').TodayTaskRef) => Promise<void>;
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
  onOpenOnboarding?: () => void;
}

const PersonalCabinetPage: React.FC<AppRoutesProps & { forcedMode: 'client' | 'instructor' }> = (
  props
) => {
  const { t } = useLanguage();
  const {
    userProfile,
    bookings,
    reviews,
    dismissedReviewIds,
    courses,
    instructors,
    usersList,
    skillConfig,
    achievementsConfig,
    activityLogs,
    onDismissReview,
    onReschedule,
    onCancel,
    onAddReview,
    onToggleRecommendation,
    onToggleSkillToday,
    onPinSkillsToday,
    onToggleTodayTaskComplete,
    onAddCustomTodayTask,
    onRemoveTodayTask,
    onSignOut,
    onUpdateProfile,
    onOpenOnboarding,
    setSelectedCourseForDetails,
    setSelectedCourseForAuth,
    onBookCourse,
    setSelectedInstructor,
    setReviewsInstructor,
    forcedMode,
  } = props;

  if (!userProfile) return null;

  return (
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
        onToggleRecommendation={onToggleRecommendation}
        onToggleSkillToday={onToggleSkillToday}
        onPinSkillsToday={onPinSkillsToday}
        onToggleTodayTaskComplete={onToggleTodayTaskComplete}
        onAddCustomTodayTask={onAddCustomTodayTask}
        onRemoveTodayTask={onRemoveTodayTask}
        onSignOut={onSignOut}
        onUpdateProfile={onUpdateProfile}
        courses={courses}
        instructors={instructors}
        usersList={usersList}
        skillConfig={skillConfig}
        achievementsConfig={achievementsConfig}
        activityLogs={activityLogs}
        onOpenOnboarding={onOpenOnboarding}
        onViewCourseDetails={setSelectedCourseForDetails}
        onRequireCourseAuth={setSelectedCourseForAuth}
        onBookCourse={onBookCourse}
        onBookInstructor={setSelectedInstructor}
        onViewInstructorReviews={setReviewsInstructor}
        forcedMode={forcedMode}
      />
    </LazyLoad>
  );
};

const CabinetRouteWrapper: React.FC<AppRoutesProps> = (props) => {
  const { tab } = useParams<{ tab?: string }>();

  if (tab && !CABINET_TABS.includes(tab as (typeof CABINET_TABS)[number])) {
    return <Navigate to="/cabinet" replace />;
  }

  return (
    <AuthRoute userProfile={props.userProfile}>
      <div className="w-full max-w-7xl mx-auto min-w-0">
        <PersonalCabinetPage {...props} forcedMode="client" />
      </div>
    </AuthRoute>
  );
};

const InstructorRouteWrapper: React.FC<AppRoutesProps> = (props) => (
  <InstructorRoute userProfile={props.userProfile}>
    <div className="w-full max-w-7xl mx-auto min-w-0">
      <PersonalCabinetPage {...props} forcedMode="instructor" />
    </div>
  </InstructorRoute>
);

const HomeRoute: React.FC<AppRoutesProps> = (props) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const {
    userProfile,
    language,
    theme,
    filtersEnabled,
    resortData,
    courses,
    bookings,
    filteredInstructors,
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
          designTheme: props.designTheme,
          slideIntervalSeconds: resortData.resortConfig.slideIntervalSeconds,
          slidesRandomOrder: resortData.resortConfig.slidesRandomOrder,
        }}
        actions={{ onScrollToSection: handleScrollToSection }}
      />

      <div
        className={`flex flex-col lg:grid gap-0 lg:gap-12 theme-air:lg:gap-16 ${
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
          <div
            id="main-content-pane"
            className="p-4 sm:p-8 md:p-10 lg:p-12 space-y-10 sm:space-y-12 theme-air:space-y-16 flex flex-col justify-start min-w-0"
          >
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

            <div id="coaches-grid" className="space-y-8 theme-air:space-y-10">
              <div>
                <h3 className="ui-section-title">{t('meetGuides')}</h3>
                <p className="ui-section-eyebrow mt-2">{t('meetGuidesSub')}</p>
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
                <div className="ui-empty-state py-16">
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
          <aside className="border-t lg:border-t-0 lg:border-l border-[var(--layout-divider)] p-6 lg:p-8 bg-[var(--profile-bg)] space-y-6 flex flex-col justify-start shrink-0 theme-air:bg-transparent">
            <div id="auth-section" className="space-y-6">
              <div className="text-center space-y-4 py-2">
                <img
                  src={theme === 'light' ? logoLight : logoDark}
                  alt={t('academyLogoAlt')}
                  className="h-10 w-auto mx-auto object-contain transition-opacity duration-300"
                  referrerPolicy="no-referrer"
                />
                <p className="ui-section-eyebrow leading-relaxed max-w-xs mx-auto">
                  {t('bookingSignInDesc')}
                </p>
              </div>
              <div className="ui-panel p-4 lg:p-6">
                <Auth
                  onSuccess={(profile) => {
                    setUserProfile(profile);
                    navigate(getDefaultWorkspacePath(profile));
                  }}
                />
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
    onboardingEnabled,
    designTheme,
    skillConfig,
    achievementsConfig,
    onToggleFilters,
    onToggleOnboarding,
    onSetDesignTheme,
    onUpdateSkillConfig,
    onUpdateAchievementsConfig,
    onUpdateUserRole,
    onAddInstructor,
    onUpdateInstructor,
    onDeleteInstructor,
    onConfirmBooking,
    onCompleteBooking,
    onLinkGuestBooking,
    onCancelBooking,
    onAddUser,
    onUpdateUser,
    onDeleteUser,
    onReschedule,
    onReassignInstructor,
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
          onCancelBooking={onCancelBooking}
          onAddUser={onAddUser}
          onUpdateUser={onUpdateUser}
          onDeleteUser={onDeleteUser}
          onRescheduleBooking={onReschedule}
          onReassignInstructor={onReassignInstructor}
          onDeleteBooking={onDeleteBooking}
          onAddBooking={onAddBooking}
          onAddCourse={onAddCourse}
          onUpdateCourse={onUpdateCourse}
          onDeleteCourse={onDeleteCourse}
          filtersEnabled={filtersEnabled}
          onToggleFilters={onToggleFilters}
          onboardingEnabled={onboardingEnabled}
          onToggleOnboarding={onToggleOnboarding}
          designTheme={designTheme}
          onSetDesignTheme={onSetDesignTheme}
          skillConfig={skillConfig}
          onUpdateSkillConfig={onUpdateSkillConfig}
          achievementsConfig={achievementsConfig}
          onUpdateAchievementsConfig={onUpdateAchievementsConfig}
        />
      </LazyLoad>
    </AdminRoute>
  );
};

export const AppRoutes: React.FC<AppRoutesProps> = (props) => {
  return (
    <Routes>
      <Route path="/admin" element={<AdminRouteWrapper {...props} />} />
      <Route path="/cabinet" element={<CabinetRouteWrapper {...props} />} />
      <Route path="/cabinet/:tab" element={<CabinetRouteWrapper {...props} />} />
      <Route path="/instructor" element={<InstructorRouteWrapper {...props} />} />
      <Route path="/" element={<HomeRoute {...props} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
