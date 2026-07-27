import React from 'react';
import { Booking, Course, Instructor, UserProfile } from '../../../types';
import { calculateSkillProgress } from '../../../lib/skillData';
import { useLanguage, translateInstructor } from '../../../lib/LanguageContext';
import { ClientBookingsList } from '../ClientBookingsList';
import { GroupCourseCard, sortVisibleCourses } from '../../GroupCourseCard';
import { InstructorCard } from '../../InstructorCard';
import { StudentSettingsCompact } from './StudentSettingsCompact';
import { StudentCabinetContext } from './StudentCabinetHome';
import { StudentDevelopmentPanel } from './StudentDevelopmentPanel';

export { StudentDevelopmentPanel };

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
  unreviewedCompletedBookings,
  onDismissReview,
  onReschedule,
  onCancel,
  onChat,
  onWriteReview,
}) => {
  const { t } = useLanguage();
  const userBookings = bookings.filter((b) => b.userId === userProfile.uid && !b.isDeleted);

  return (
    <div className="space-y-6 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-serif font-light text-[var(--ink)] pt-6">
        {t('scFullCalendar')}
      </h1>
      <ClientBookingsList
        userBookings={userBookings}
        unreviewedCompletedBookings={unreviewedCompletedBookings}
        showWorkoutCalendar
        onDismissReview={onDismissReview}
        onWriteReview={onWriteReview}
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
}) => {
  const { t, language } = useLanguage();
  const visibleCourses = sortVisibleCourses(courses);

  return (
    <div className="pb-24 max-w-7xl mx-auto pt-6 px-1 space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">
          {t('intensiveGroupCourses')}
        </h1>
        <p className="text-sm text-[var(--ink-dim)] mt-2">{t('intensiveGroupCoursesSub')}</p>
      </div>

      <div
        className="grid gap-6 theme-air:gap-8"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
      >
        {visibleCourses.map((rawCourse) => (
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

      {visibleCourses.length === 0 && (
        <div className="ui-empty-state">{t('noIntensiveCoursesAvailable')}</div>
      )}
    </div>
  );
};

export const StudentInstructorsPanel: React.FC<
  PanelProps & {
    onBookInstructor: (instructor: Instructor) => void;
    onViewInstructorReviews: (instructor: Instructor) => void;
  }
> = ({ instructors, onBookInstructor, onViewInstructorReviews }) => {
  const { t, language } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const availableInstructors = instructors
    .filter((ins) => ins.isAvailable)
    .map((ins) => translateInstructor(ins, lang));

  return (
    <div className="space-y-6 pb-24 max-w-2xl mx-auto pt-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">{t('scInstructors')}</h1>
        <p className="text-sm text-[var(--ink-dim)]">{t('meetGuidesSub')}</p>
      </div>
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
      {availableInstructors.length === 0 && (
        <p className="text-sm text-[var(--ink-dim)]">{t('noCoachesMatch')}</p>
      )}
    </div>
  );
};

export const StudentSettingsPanel: React.FC<
  PanelProps & {
    onInvalidFile: () => void;
    onUploadSuccess: () => void;
    onUploadError: () => void;
  }
> = ({
  userProfile,
  onSignOut,
  onUpdateProfile,
  onInvalidFile,
  onUploadSuccess,
  onUploadError,
}) => {
  const { t } = useLanguage();

  return (
    <div className="pb-24 max-w-2xl mx-auto pt-6">
      <h1 className="text-2xl font-serif font-light text-[var(--ink)] mb-6">
        {t('scNavSettings')}
      </h1>
      <StudentSettingsCompact
        userProfile={userProfile}
        onSignOut={onSignOut}
        onUpdateProfile={onUpdateProfile}
        onInvalidFile={onInvalidFile}
        onUploadSuccess={onUploadSuccess}
        onUploadError={onUploadError}
      />
    </div>
  );
};
