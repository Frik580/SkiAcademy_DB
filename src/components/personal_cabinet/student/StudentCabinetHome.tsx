import React, { useMemo, useState } from 'react';
import { Booking, Course, Instructor, Review, UserProfile, ActivityLog } from '../../../types';
import { SkillConfig } from '../../../lib/skillData';
import { AchievementsConfig } from '../../../lib/achievementConfig';
import { useLanguage } from '../../../lib/LanguageContext';
import { YourJourneySection } from '../../YourJourneySection';
import {
  getFirstName,
  getGreeting,
  getNextStepAction,
  getMiniCalendarDays,
  getNextSessionsNext7Days,
  getTodayTasks,
  getCurrentSessions,
  hasTrainingToday,
  StudentCabinetTab,
} from './studentCabinetUtils';
import { StudentBookNextFab } from './StudentBookNextFab';
import { BookInstructorPickerModal } from './BookInstructorPickerModal';
import { ScDivider, ScTextButton } from './StudentCabinetUI';
import { StudentNeedsAttention } from './StudentNeedsAttention';
import { StudentTodaySection } from './StudentTodaySection';
import { SkillRadarChart } from './SkillRadarChart';
import { StudentNextStepCard } from './StudentNextStepCard';
import {
  StudentCabinetResortSnapshot,
  StudentCabinetWeatherSection,
  StudentLatestRecommendationSection,
} from './StudentHomeBottomSections';

export interface StudentCabinetContext {
  userProfile: UserProfile;
  bookings: Booking[];
  courses: Course[];
  instructors: Instructor[];
  usersList?: UserProfile[];
  reviews: Review[];
  activityLogs?: ActivityLog[];
  dismissedReviewIds?: string[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  onOpenSession: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
  onDismissReview?: (bookingId: string) => void;
  onGoToTab: (tab: StudentCabinetTab) => void;
  onOpenDevelopmentSection: (sectionId: string) => void;
  onContinueDevelopment: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onPinSkillsToday?: (skillItemIds: string[]) => void | Promise<void>;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: import('../../../lib/todayChecklist').TodayTaskRef) => void;
  onViewCourseDetails: (course: Course) => void;
  onRequireCourseAuth: (course: Course) => void;
  onBookCourse: (courseId: string) => void;
  onBookInstructor: (instructor: Instructor) => void;
  onViewInstructorReviews: (instructor: Instructor) => void;
  resortSnapshot?: StudentCabinetResortSnapshot;
  onToggleTemperatureUnit?: () => void;
}

type StudentCabinetHomeProps = StudentCabinetContext;

export const StudentCabinetHome: React.FC<StudentCabinetHomeProps> = (props) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const {
    userProfile,
    bookings,
    courses,
    instructors,
    reviews,
    usersList = [],
    dismissedReviewIds = [],
    skillConfig,
    onOpenSession,
    onOpenLesson,
    onWriteReview,
    onDismissReview,
    onGoToTab,
    onContinueDevelopment,
    onToggleSkillToday,
    onToggleRecommendation,
    onToggleTodayTaskComplete,
    onAddCustomTodayTask,
    onRemoveTodayTask,
    onBookInstructor,
    resortSnapshot,
    onToggleTemperatureUnit,
  } = props;

  const hideProgress = Boolean(userProfile.hideProgressTracking);

  const nextStepAction = useMemo(
    () => getNextStepAction(userProfile, bookings, skillConfig, lang),
    [userProfile, bookings, skillConfig, lang]
  );

  const nextSessions = useMemo(
    () => getNextSessionsNext7Days(bookings, courses, new Date(), userProfile.uid),
    [bookings, courses, userProfile.uid]
  );
  const nextSession = nextSessions[0]?.booking ?? null;
  const currentSessions = useMemo(
    () => getCurrentSessions(bookings, courses, new Date(), userProfile.uid),
    [bookings, courses, userProfile.uid]
  );
  const todayTasks = useMemo(
    () => getTodayTasks(userProfile, bookings, courses, lang, skillConfig),
    [userProfile, bookings, courses, lang, skillConfig]
  );
  const miniDays = useMemo(
    () => getMiniCalendarDays(bookings, courses, lang),
    [bookings, courses, lang]
  );
  const showWeather =
    Boolean(resortSnapshot) &&
    (currentSessions.length > 0 || hasTrainingToday(bookings, courses, userProfile.uid));

  const [instructorPickerOpen, setInstructorPickerOpen] = useState(false);

  return (
    <div className="space-y-0 pb-24 w-full min-w-0">
      {/* Путь к мастерству (Your Journey) for authorized client — full width, no frames or card margins */}
      <div className="w-full shrink-0">
        <YourJourneySection
          skillConfig={skillConfig}
          userProfile={userProfile}
          animateSequence={false}
          fillViewport
          onOpenDevelopment={onContinueDevelopment}
        />
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 min-w-0">
        {/* Hero — greeting, level, progress, skill radar */}
        <section className="py-6 space-y-2.5 min-w-0">
          <p className="text-base sm:text-lg font-medium text-[var(--ink)] leading-snug break-words">
            {getGreeting(lang, getFirstName(userProfile.displayName))}
          </p>

          <StudentTodaySection
            currentSessions={currentSessions}
            nextSession={nextSession}
            nextSessions={nextSessions}
            miniDays={miniDays}
            courses={courses}
            instructors={instructors}
            usersList={usersList}
            todayTasks={todayTasks}
            bookings={bookings}
            userProfile={userProfile}
            activityLogs={props.activityLogs}
            achievementsConfig={props.achievementsConfig}
            skillConfig={props.skillConfig}
            onOpenSession={onOpenSession}
            onOpenLesson={onOpenLesson}
            onGoToTab={onGoToTab}
            onContinueDevelopment={onContinueDevelopment}
            onToggleRecommendation={onToggleRecommendation}
            onToggleTodayTaskComplete={onToggleTodayTaskComplete}
            onAddCustomTodayTask={onAddCustomTodayTask}
            onRemoveTodayTask={onRemoveTodayTask}
          />

          {!hideProgress && (
            <div className="pt-3 min-w-0 w-full">
              <p className="text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)] mb-2.5">
                {t('scRadarTitle')}
              </p>
              <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 lg:gap-4">
                {nextStepAction && (
                  <div className="order-1 lg:order-2 min-w-0 flex-1 flex">
                    <StudentNextStepCard
                      className="flex-1 w-full"
                      action={nextStepAction}
                      onStartExercise={(exerciseId) => {
                        const pinned = userProfile.todaySkillItemIds?.includes(exerciseId);
                        if (!pinned) {
                          void onToggleSkillToday?.(exerciseId, true);
                        }
                      }}
                      onOpenRecommendation={(bookingId) => {
                        const booking = bookings.find((b) => b.id === bookingId);
                        if (booking) onOpenLesson(booking);
                      }}
                      onContinueDevelopment={onContinueDevelopment}
                    />
                  </div>
                )}
                <div className="order-2 lg:order-1 shrink-0 min-w-0 w-full lg:w-auto">
                  <SkillRadarChart
                    userProfile={userProfile}
                    skillConfig={skillConfig}
                    onToggleSkillToday={props.onToggleSkillToday}
                    compact
                    embed
                  />
                </div>
              </div>
              <div className="pt-2">
                <ScTextButton arrow onClick={onContinueDevelopment}>
                  {t('scContinueDevelopment')}
                </ScTextButton>
              </div>
            </div>
          )}
        </section>

        {/* Needs attention — unreviewed lessons and open recommendations */}
        <StudentNeedsAttention
          bookings={bookings}
          reviews={reviews}
          userId={userProfile.uid}
          dismissedReviewIds={dismissedReviewIds}
          onOpenLesson={onOpenLesson}
          onWriteReview={onWriteReview}
          onDismissReview={onDismissReview}
        />

        <ScDivider />

        <StudentLatestRecommendationSection
          bookings={bookings}
          courses={courses}
          userId={userProfile.uid}
          onOpenLesson={onOpenLesson}
        />

        {showWeather && resortSnapshot && (
          <>
            <ScDivider />
            <StudentCabinetWeatherSection
              resort={resortSnapshot}
              onToggleTemperatureUnit={onToggleTemperatureUnit}
            />
          </>
        )}
      </div>

      <StudentBookNextFab onClick={() => setInstructorPickerOpen(true)} />
      <BookInstructorPickerModal
        open={instructorPickerOpen}
        onClose={() => setInstructorPickerOpen(false)}
        userProfile={userProfile}
        bookings={bookings}
        instructors={instructors}
        onSelectInstructor={onBookInstructor}
        onBrowseCourses={() => onGoToTab('courses')}
      />
    </div>
  );
};
