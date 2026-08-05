import React from 'react';
import { Booking, Course, Instructor, UserProfile } from '../../../types';
import { calculateSkillProgress } from '../../../lib/skillData';
import { useLanguage, translateInstructor } from '../../../lib/LanguageContext';
import { ClientBookingsList } from '../ClientBookingsList';
import { GroupCourseCard, sortVisibleCourses } from '../../GroupCourseCard';
import { InstructorCard } from '../../InstructorCard';
import { StudentCabinetContext } from './StudentCabinetHome';
import { StudentDevelopmentPanel } from './StudentDevelopmentPanel';
import { ScDivider, ScSectionTitle, StudentPanelBackLink } from './StudentCabinetUI';
import {
  getAvailableCourses,
  getEnrolledCourses,
  getMyInstructors,
  getRecommendedCourses,
  getRecommendedInstructors,
  StudentCabinetTab,
} from './studentCabinetUtils';
import { Calendar, ChevronRight, LayoutGrid, TrendingUp } from 'lucide-react';

export { StudentDevelopmentPanel };

const TRAINING_HUB_ITEMS: {
  tab: StudentCabinetTab;
  labelKey: 'scNavDevelopment' | 'scNavCalendar' | 'scNavCourses';
  descKey: 'scDevelopmentDetail' | 'scFullCalendar' | 'scCourses';
  icon: typeof TrendingUp;
}[] = [
  {
    tab: 'development',
    labelKey: 'scNavDevelopment',
    descKey: 'scDevelopmentDetail',
    icon: TrendingUp,
  },
  { tab: 'calendar', labelKey: 'scNavCalendar', descKey: 'scFullCalendar', icon: Calendar },
  { tab: 'courses', labelKey: 'scNavCourses', descKey: 'scCourses', icon: LayoutGrid },
];

export const StudentTrainingPanel: React.FC<Pick<StudentCabinetContext, 'onGoToTab'>> = ({
  onGoToTab,
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 pb-24 max-w-3xl mx-auto pt-6 px-4 sm:px-6 w-full min-w-0">
      <StudentPanelBackLink onClick={() => onGoToTab('home')} />
      <div className="space-y-1">
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">{t('scNavTraining')}</h1>
        <p className="text-sm text-[var(--ink-dim)]">{t('scTrainingHubSub')}</p>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] overflow-hidden divide-y divide-[var(--border-subtle)]">
        {TRAINING_HUB_ITEMS.map(({ tab, labelKey, descKey, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => onGoToTab(tab)}
            className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-[var(--border-subtle)]/40 transition-colors"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)]/22 bg-[var(--accent-muted)]/45 text-[var(--accent)]">
              <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-[var(--ink)]">{t(labelKey)}</span>
              <span className="block text-xs text-[var(--ink-dim)] mt-0.5 truncate">
                {t(descKey)}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-dim)]" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
};

interface PanelProps extends StudentCabinetContext {
  onReschedule: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onChat: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
  onSignOut: () => void;
  onUpdateProfile?: (data: Partial<UserProfile>) => Promise<void>;
  onLevelBadgeClick: () => void;
  skillProgress: ReturnType<typeof calculateSkillProgress>;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
}

export const StudentCalendarPanel: React.FC<
  PanelProps & { unreviewedCompletedBookings: Booking[]; onDismissReview?: (id: string) => void }
> = ({
  userProfile,
  bookings,
  courses,
  instructors,
  usersList = [],
  unreviewedCompletedBookings,
  onDismissReview,
  onReschedule,
  onCancel,
  onChat,
  onWriteReview,
  onOpenLesson,
  onGoToTab,
}) => {
  const { t } = useLanguage();
  const userBookings = bookings.filter((b) => b.userId === userProfile.uid && !b.isDeleted);

  return (
    <div className="space-y-6 pb-24 max-w-3xl mx-auto px-4 sm:px-6 w-full min-w-0">
      <div className="pt-6 space-y-4">
        <StudentPanelBackLink onClick={() => onGoToTab('training')} labelKey="scNavTraining" />
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">{t('scFullCalendar')}</h1>
      </div>
      <ClientBookingsList
        userBookings={userBookings}
        courses={courses}
        instructors={instructors}
        usersList={usersList}
        unreviewedCompletedBookings={unreviewedCompletedBookings}
        showWorkoutCalendar
        onDismissReview={onDismissReview}
        onWriteReview={onWriteReview}
        onOpenLesson={onOpenLesson}
        onReschedule={onReschedule}
        onCancel={onCancel}
        onChat={onChat}
      />
    </div>
  );
};

export const StudentCoursesPanel: React.FC<
  PanelProps & {
    onViewCourseDetails: (course: Course) => void;
    onRequireCourseAuth: (course: Course) => void;
    onBookCourse: (courseId: string) => void;
  }
> = ({
  bookings,
  courses,
  userProfile,
  onViewCourseDetails,
  onRequireCourseAuth,
  onBookCourse,
  onGoToTab,
}) => {
  const { t, language } = useLanguage();
  const myCourses = getEnrolledCourses(bookings, courses, userProfile.uid);
  const recommendedCourses = getRecommendedCourses(userProfile, courses, bookings, 2);
  const availableCourses = sortVisibleCourses(
    getAvailableCourses(bookings, courses, userProfile.uid)
  );

  const renderCourseGrid = (items: Course[]) => (
    <div
      className="grid gap-6 theme-air:gap-8"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
    >
      {items.map((rawCourse) => (
        <GroupCourseCard
          key={rawCourse.id}
          rawCourse={rawCourse}
          bookings={bookings}
          userProfile={userProfile}
          language={language}
          onViewDetails={onViewCourseDetails}
          onRequireAuth={onRequireCourseAuth}
          onBookCourse={onBookCourse}
          className="h-full"
        />
      ))}
    </div>
  );

  return (
    <div className="pb-24 max-w-3xl mx-auto pt-6 px-4 sm:px-6 space-y-6 w-full min-w-0">
      <StudentPanelBackLink onClick={() => onGoToTab('training')} labelKey="scNavTraining" />
      <div>
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">
          {t('intensiveGroupCourses')}
        </h1>
        <p className="text-sm text-[var(--ink-dim)] mt-2">{t('intensiveGroupCoursesSub')}</p>
      </div>

      {recommendedCourses.length > 0 && myCourses.length === 0 && (
        <section className="space-y-4">
          <div className="space-y-1">
            <ScSectionTitle>{t('scRecommendedCourses')}</ScSectionTitle>
            <p className="text-sm text-[var(--ink-dim)]">{t('scRecommendedCoursesSub')}</p>
          </div>
          {renderCourseGrid(recommendedCourses)}
        </section>
      )}

      {recommendedCourses.length > 0 && myCourses.length === 0 && availableCourses.length > 0 && (
        <ScDivider />
      )}

      {myCourses.length > 0 && (
        <section className="space-y-4">
          <div className="space-y-1">
            <ScSectionTitle>{t('scMyCourses')}</ScSectionTitle>
            <p className="text-sm text-[var(--ink-dim)]">{t('scMyCoursesSub')}</p>
          </div>
          {renderCourseGrid(myCourses)}
        </section>
      )}

      {myCourses.length > 0 && availableCourses.length > 0 && <ScDivider />}

      <section className="space-y-4">
        <div className="space-y-1">
          <ScSectionTitle>
            {myCourses.length > 0 ? t('scAvailableCourses') : t('intensiveGroupCourses')}
          </ScSectionTitle>
          {myCourses.length > 0 && (
            <p className="text-sm text-[var(--ink-dim)]">{t('scAvailableCoursesSub')}</p>
          )}
        </div>
        {availableCourses.length > 0 ? (
          renderCourseGrid(availableCourses)
        ) : myCourses.length === 0 ? (
          <div className="ui-empty-state">{t('noIntensiveCoursesAvailable')}</div>
        ) : (
          <p className="text-sm text-[var(--ink-dim)]">{t('scNoAvailableCourses')}</p>
        )}
      </section>
    </div>
  );
};

export const StudentInstructorsPanel: React.FC<
  PanelProps & {
    onBookInstructor: (instructor: Instructor) => void;
    onViewInstructorReviews: (instructor: Instructor) => void;
  }
> = ({
  bookings,
  instructors,
  userProfile,
  onBookInstructor,
  onViewInstructorReviews,
  onGoToTab,
}) => {
  const { t, language } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const myInstructors = getMyInstructors(bookings, instructors, userProfile.uid).map((ins) =>
    translateInstructor(ins, lang)
  );
  const recommendedInstructors = getRecommendedInstructors(
    userProfile,
    instructors,
    bookings,
    2
  ).map((ins) => translateInstructor(ins, lang));
  const myInstructorIds = new Set([
    ...myInstructors.map((i) => i.id),
    ...recommendedInstructors.map((i) => i.id),
  ]);
  const availableInstructors = instructors
    .filter((ins) => ins.isAvailable && !myInstructorIds.has(ins.id))
    .map((ins) => translateInstructor(ins, lang));

  return (
    <div className="space-y-6 pb-24 max-w-3xl mx-auto pt-6 px-4 sm:px-6 w-full min-w-0">
      <StudentPanelBackLink onClick={() => onGoToTab('home')} />
      <div className="space-y-1">
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">{t('scNavCoach')}</h1>
        <p className="text-sm text-[var(--ink-dim)]">{t('meetGuidesSub')}</p>
      </div>

      {recommendedInstructors.length > 0 && myInstructors.length === 0 && (
        <section className="space-y-4">
          <div className="space-y-1">
            <ScSectionTitle>{t('scRecommendedInstructors')}</ScSectionTitle>
            <p className="text-sm text-[var(--ink-dim)]">{t('scRecommendedInstructorsSub')}</p>
          </div>
          <div className="flex flex-col gap-8">
            {recommendedInstructors.map((ins) => (
              <InstructorCard
                key={ins.id}
                instructor={ins}
                onBook={onBookInstructor}
                onViewReviews={onViewInstructorReviews}
              />
            ))}
          </div>
        </section>
      )}

      {recommendedInstructors.length > 0 &&
        myInstructors.length === 0 &&
        availableInstructors.length > 0 && <ScDivider />}

      {myInstructors.length > 0 && (
        <section className="space-y-4">
          <div className="space-y-1">
            <ScSectionTitle>{t('scMyInstructors')}</ScSectionTitle>
            <p className="text-sm text-[var(--ink-dim)]">{t('scMyInstructorsSub')}</p>
          </div>
          <div className="flex flex-col gap-8">
            {myInstructors.map((ins) => (
              <InstructorCard
                key={ins.id}
                instructor={ins}
                onBook={onBookInstructor}
                onViewReviews={onViewInstructorReviews}
                bookLabel={t('scBookAgain')}
              />
            ))}
          </div>
        </section>
      )}

      {myInstructors.length > 0 && availableInstructors.length > 0 && <ScDivider />}

      <section className="space-y-4">
        <div className="space-y-1">
          <ScSectionTitle>
            {myInstructors.length > 0 ? t('scAvailableInstructors') : t('scInstructors')}
          </ScSectionTitle>
          {myInstructors.length > 0 && (
            <p className="text-sm text-[var(--ink-dim)]">{t('meetGuidesSub')}</p>
          )}
        </div>
        {availableInstructors.length > 0 ? (
          <div className="flex flex-col gap-8">
            {availableInstructors.map((ins) => (
              <InstructorCard
                key={ins.id}
                instructor={ins}
                onBook={onBookInstructor}
                onViewReviews={onViewInstructorReviews}
              />
            ))}
          </div>
        ) : myInstructors.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('noCoachesMatch')}</p>
        ) : (
          <p className="text-sm text-[var(--ink-dim)]">{t('scNoAvailableInstructors')}</p>
        )}
      </section>
    </div>
  );
};
