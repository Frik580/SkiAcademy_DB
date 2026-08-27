import React from 'react';
import { Course, Instructor } from '../../../../types';
import type { Booking } from '../../../../types';
import { translateInstructor } from '../../../../app/providers/LanguageContext';
import { BookingsPanel } from '../../../../features/profile';
import { GroupCourseCard, sortVisibleCourses } from '../../../../features/courses';
import { InstructorCard } from '../../../../features/profile';
import { StudentDevelopmentPanel } from './StudentDevelopmentPanel';
import { ScDivider, ScEditorialHubList, ScPageIntro, ScSectionTitle } from './StudentCabinetUI';
import {
  getAvailableCourses,
  getEnrolledCourses,
  getMyInstructors,
  getRecommendedInstructors,
  StudentCabinetTab,
} from './studentCabinetUtils';
import { Calendar, LayoutGrid, TrendingUp } from 'lucide-react';
import type {
  StudentCabinetPanelInput,
  StudentTrainingPanelInput,
} from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

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

export const StudentTrainingPanel: React.FC<StudentTrainingPanelInput> = ({ onGoToTab }) => {
  const { t } = useStudentCabinetTranslations();

  return (
    <div className="space-y-8 pb-24 max-w-3xl mx-auto pt-6 px-4 sm:px-6 w-full min-w-0">
      <ScPageIntro
        onBack={() => onGoToTab('home')}
        title={t('scNavTraining')}
        subtitle={t('scTrainingHubSub')}
      />
      <ScEditorialHubList
        items={TRAINING_HUB_ITEMS.map(({ tab, labelKey, descKey, icon }) => ({
          id: tab,
          label: t(labelKey),
          description: t(descKey),
          icon,
          onClick: () => onGoToTab(tab),
        }))}
      />
    </div>
  );
};

type PanelProps = StudentCabinetPanelInput;

export const StudentCalendarPanel: React.FC<
  PanelProps & {
    unreviewedCompletedBookings: import('./studentCabinetContracts').StudentBooking[];
    onDismissReview?: (id: string) => void;
  }
> = ({
  userProfile,
  bookings,
  courses,
  instructors,
  usersList = [],
  unreviewedCompletedBookings,
  onDismissReview,
  onCancel,
  onChat,
  hasUnreadChat,
  onWriteReview,
  onOpenLesson,
  onGoToTab,
}) => {
  return (
    <BookingsPanel
      userProfile={userProfile}
      bookings={bookings}
      courses={courses}
      instructors={instructors}
      usersList={usersList}
      unreviewedCompletedBookings={unreviewedCompletedBookings}
      showWorkoutCalendar
      onDismissReview={onDismissReview}
      onWriteReview={onWriteReview}
      onOpenLesson={onOpenLesson}
      onCancel={onCancel}
      onChat={onChat}
      hasUnreadChat={hasUnreadChat}
      onGoToTab={onGoToTab}
      showBackLink
    />
  );
};

export const StudentCoursesPanel: React.FC<
  PanelProps & {
    onViewCourseDetails: (course: Course) => void;
    onRequireCourseAuth: (course: Course) => void;
    onBookCourse: (courseId: string) => void;
    courseBookings?: Booking[];
  }
> = ({
  bookings,
  courseBookings,
  courses,
  userProfile,
  onViewCourseDetails,
  onRequireCourseAuth,
  onBookCourse,
  onGoToTab,
}) => {
  const { t, language } = useStudentCabinetTranslations();
  const enrollmentBookings = courseBookings ?? (bookings as unknown as Booking[]);
  const myCourses = getEnrolledCourses(enrollmentBookings, courses, userProfile.uid);
  const availableCourses = sortVisibleCourses(
    getAvailableCourses(enrollmentBookings, courses, userProfile.uid)
  );

  const renderCourseGrid = (items: Course[]) => (
    <div
      className="grid gap-6 gap-8"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
    >
      {items.map((rawCourse) => (
        <GroupCourseCard
          key={rawCourse.id}
          rawCourse={rawCourse}
          bookings={enrollmentBookings}
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
      <ScPageIntro
        onBack={() => onGoToTab('training')}
        backLabelKey="scNavTraining"
        title={t('intensiveGroupCourses')}
        subtitle={t('intensiveGroupCoursesSub')}
      />

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
  const { t, language } = useStudentCabinetTranslations();
  const lang = language === 'ru' ? 'ru' : 'en';
  const instructorBookings = bookings as unknown as Booking[];
  const myInstructors = getMyInstructors(instructorBookings, instructors, userProfile.uid).map(
    (ins) => translateInstructor(ins, lang)
  );
  const recommendedInstructors = getRecommendedInstructors(
    userProfile,
    instructors,
    instructorBookings,
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
      <ScPageIntro
        onBack={() => onGoToTab('home')}
        title={t('scNavCoach')}
        subtitle={t('meetGuidesSub')}
      />

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
