import React from 'react';
import { AnimatePresence } from 'motion/react';
import { Navigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { YourJourneySection } from '../../features/journey';
import { GroupCoursesSection } from '../../features/courses';
import { HeroCarousel } from '../../app/components/HeroCarousel';
import { InstructorCard } from '../../features/profile';
import { LessonFilters } from '../../features/courses';
import { ResortConditionsSidebar } from '../../app/components/ResortConditionsSidebar';
import { useLanguage } from '../../app/providers/LanguageContext';
import { useTheme } from '../../hooks/useTheme';
import { getDefaultWorkspacePath } from '../../lib/workspaceRoutes';
import { useInstructorFilters } from '../../hooks/useInstructorFilters';
import { useProfileStore } from '../../features/profile';
import { useBookingsStore } from '../../features/bookings';
import { useCoursesStore } from '../../features/courses';
import { useCourseActions } from '../../features/courses';
import { useSettingsStore } from '../../features/settings';
import { useUiStore } from '../../features/shell';
import { useAuthStore } from '../../features/auth';
import type { AppRoutesProps } from './routeTypes';

/** Connects the public home screen to catalogue data and UI actions. */
export const HomeRouteContainer: React.FC<AppRoutesProps> = ({ resortData, setIsFahrenheit }) => {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const authLoading = useAuthStore((state) => state.authLoading);
  const userProfile = useProfileStore((state) => state.userProfile);
  const courses = useCoursesStore((state) => state.courses);
  const bookings = useBookingsStore((state) => state.bookings);
  const filtersEnabled = useSettingsStore((state) => state.filtersEnabled);
  const designTheme = useSettingsStore((state) => state.designTheme);
  const skillConfig = useSettingsStore((state) => state.skillConfig);
  const { handleBookCourse } = useCourseActions();
  const setSelectedInstructor = useUiStore((state) => state.setSelectedInstructor);
  const setSelectedCourseForAuth = useUiStore((state) => state.setSelectedCourseForAuth);
  const setSelectedCourseForDetails = useUiStore((state) => state.setSelectedCourseForDetails);
  const setReviewsInstructor = useUiStore((state) => state.setReviewsInstructor);
  const {
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
  } = useInstructorFilters(language);

  const handleScrollToSection = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Defer workspace redirect until auth resolves so guests can paint LCP immediately.
  if (!authLoading && userProfile && userProfile.role !== 'admin') {
    return <Navigate to={getDefaultWorkspacePath(userProfile)} replace />;
  }

  return (
    <>
      <HeroCarousel
        data={{
          slides: resortData.resortConfig.slides,
          configReady: resortData.isResortConfigReady,
          language,
          theme,
          designTheme,
          slideIntervalSeconds: resortData.resortConfig.slideIntervalSeconds,
          slidesRandomOrder: resortData.resortConfig.slidesRandomOrder,
          isAuthenticated: Boolean(userProfile),
        }}
        actions={{ onScrollToSection: handleScrollToSection }}
      />

      <YourJourneySection skillConfig={skillConfig} userProfile={null} />

      <div className="flex flex-col lg:grid gap-0 lg:gap-12 theme-air:lg:gap-16 lg:grid-cols-[minmax(140px,200px)_1fr]">
        <ResortConditionsSidebar
          data={{
            language,
            resortConfig: resortData.resortConfig,
            tempC: resortData.tempC,
            snowDepthCm: resortData.snowDepthCm,
            windKmh: resortData.windKmh,
            weatherCode: resortData.weatherCode,
            isFahrenheit: resortData.isFahrenheit,
          }}
          actions={{ onToggleTemperatureUnit: () => setIsFahrenheit(!resortData.isFahrenheit) }}
        />

        <div className="flex flex-col">
          <div
            id="main-content-pane"
            className="p-4 sm:p-8 md:p-10 lg:p-12 space-y-10 sm:space-y-12 theme-air:space-y-16 flex flex-col justify-start min-w-0"
          >
            <GroupCoursesSection
              data={{ courses, bookings, userProfile, language }}
              actions={{
                onViewDetails: setSelectedCourseForDetails,
                onRequireAuth: setSelectedCourseForAuth,
                onBookCourse: handleBookCourse,
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
                  <AnimatePresence initial={false}>
                    {filteredInstructors.map((instructor) => (
                      <InstructorCard
                        key={instructor.id}
                        instructor={instructor}
                        onBook={setSelectedInstructor}
                        onViewReviews={setReviewsInstructor}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
