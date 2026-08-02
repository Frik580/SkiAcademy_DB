import React from 'react';
import { Booking, Course } from '../../../types';
import { useLanguage } from '../../../lib/LanguageContext';
import { translateCourse } from '../../../lib/i18n/contentTranslation';
import {
  ActiveCourseEnrollment,
  formatCourseDateRangeLabel,
  formatSessionDayLabel,
  formatSessionTimeRange,
  getDifficultyShort,
  getRecentLessonInstructorLabel,
  getRecentLessonTitle,
  MiniCalendarDay,
  resolveBookingStartDate,
  StudentCabinetTab,
  TodayTask,
} from './studentCabinetUtils';
import { ScDivider, ScSectionTitle, ScTextButton, ScTintCard } from './StudentCabinetUI';
import { TodayChecklist } from './TodayChecklist';
import { RecommendationIndicator } from '../RecommendationIndicator';
import {
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../../lib/lessonRecommendations';

interface StudentTodaySectionProps {
  activeCourse: ActiveCourseEnrollment | null;
  nextSession: Booking | null;
  miniDays: MiniCalendarDay[];
  courses: Course[];
  todayTasks: TodayTask[];
  bookings: Booking[];
  onOpenSession: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onGoToTab: (tab: StudentCabinetTab) => void;
  onContinueDevelopment: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: import('../../../lib/todayChecklist').TodayTaskRef) => void;
}

export const StudentTodaySection: React.FC<StudentTodaySectionProps> = ({
  activeCourse,
  nextSession,
  miniDays,
  courses,
  todayTasks,
  bookings,
  onOpenSession,
  onOpenLesson,
  onGoToTab,
  onContinueDevelopment,
  onToggleRecommendation,
  onToggleTodayTaskComplete,
  onAddCustomTodayTask,
  onRemoveTodayTask,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const subsectionLabel = 'text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]';
  const nextSessionDateStr = nextSession ? resolveBookingStartDate(nextSession, courses) : null;
  const isNextCourse = Boolean(nextSession?.instructorId.startsWith('course_'));

  return (
    <section className="py-5 space-y-0">
      <ScSectionTitle>{t('scTodaySection')}</ScSectionTitle>

      {activeCourse && (
        <>
          <div className="pt-5 pb-5 space-y-2">
            <p className={subsectionLabel}>{t('scActiveCourse')}</p>
            <ScTintCard tint="green" className="px-4 py-3.5 space-y-2">
              <p className="text-base font-medium text-[var(--ink)] leading-snug">
                {translateCourse(activeCourse.course, lang).title}
              </p>
              <p className="text-sm text-[var(--ink-dim)]">
                {formatCourseDateRangeLabel(activeCourse.booking, courses, lang)}
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <ScTextButton onClick={() => onOpenLesson(activeCourse.booking)}>
                  {t('scMoreDetails')}
                </ScTextButton>
                <ScTextButton onClick={() => onOpenSession(activeCourse.booking)}>
                  {t('chat')}
                </ScTextButton>
              </div>
            </ScTintCard>
          </div>
          <ScDivider />
        </>
      )}

      <div className="py-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className={subsectionLabel}>{t('scNextSessionOrCourse')}</p>
          <ScTextButton onClick={() => onGoToTab('calendar')}>{t('scFullCalendar')}</ScTextButton>
        </div>

        <ScTintCard tint="purple" className="px-4 py-4 sm:px-5 space-y-4">
          <div className="flex justify-between gap-1 text-center text-sm overflow-x-auto no-scrollbar pb-1">
            {miniDays.map(({ day, dateStr, hasSession, isToday, weekdayLabel }) => {
              const isNextDay = nextSessionDateStr === dateStr;
              return (
                <div key={dateStr} className="flex flex-col items-center gap-1 min-w-[2rem] flex-1">
                  <span
                    className={`text-[10px] uppercase ${
                      isToday || isNextDay ? 'text-[#BF5AF2]' : 'text-[var(--ink-dim)]'
                    }`}
                  >
                    {weekdayLabel}
                  </span>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink)] ${
                      isToday || isNextDay
                        ? 'font-bold bg-[#BF5AF2]/20 text-[#BF5AF2]'
                        : ''
                    } ${isNextDay && !isToday ? 'ring-2 ring-[#BF5AF2]/40' : ''}`}
                  >
                    {day}
                  </span>
                  <span
                    className={`text-[10px] ${hasSession ? 'text-[#30D158]' : 'text-[var(--border)]'}`}
                    title={hasSession ? t('bookedLesson') : t('noLessons')}
                  >
                    {hasSession ? '●' : '○'}
                  </span>
                </div>
              );
            })}
          </div>

          {nextSession ? (
            <div className="space-y-1 pt-1 border-t border-[#BF5AF2]/15">
              <p className="text-sm text-[var(--ink-dim)]">
                {formatSessionDayLabel(nextSessionDateStr!, lang, t)}
              </p>
              <p className="text-2xl font-serif font-light text-[var(--ink)]">
                {formatSessionTimeRange(nextSession)}
              </p>
              <p className="flex items-center gap-2 flex-wrap text-base font-medium text-[var(--ink)]">
                <span>
                  {isNextCourse
                    ? getRecentLessonTitle(nextSession, courses, lang)
                    : getDifficultyShort(nextSession.difficulty)}
                </span>
                {hasBookingRecommendations(nextSession) && (
                  <RecommendationIndicator pending={hasPendingRecommendations(nextSession)} />
                )}
              </p>
              <p className="text-sm text-[var(--ink-dim)]">
                {isNextCourse
                  ? formatCourseDateRangeLabel(nextSession, courses, lang)
                  : getRecentLessonInstructorLabel(nextSession, lang)}
              </p>
              <div className="flex flex-wrap gap-4 pt-2">
                <ScTextButton onClick={() => onOpenLesson(nextSession)}>
                  {t('scMoreDetails')}
                </ScTextButton>
                <ScTextButton onClick={() => onOpenSession(nextSession)}>{t('chat')}</ScTextButton>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-dim)] pt-1 border-t border-[#BF5AF2]/15">
              {t('scNoUpcomingSession')}
            </p>
          )}
        </ScTintCard>
      </div>

      <ScDivider />

      <div className="pt-5 space-y-2">
        <p className={subsectionLabel}>{t('scQuickActions')}</p>
        <TodayChecklist
          tasks={todayTasks}
          bookings={bookings}
          onToggleRecommendation={onToggleRecommendation}
          onToggleTaskComplete={onToggleTodayTaskComplete}
          onAddTask={onAddCustomTodayTask}
          onRemoveTask={onRemoveTodayTask}
          onOpenLesson={onOpenLesson}
          onOpenDevelopment={onContinueDevelopment}
        />
      </div>
    </section>
  );
};
