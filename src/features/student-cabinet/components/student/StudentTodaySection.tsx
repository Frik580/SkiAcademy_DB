import { memo, useMemo } from 'react';
import type { ActivityLog, Booking, Course, Instructor, Review, UserProfile } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import type { AchievementsConfig, SkillConfig } from '../../../../domain/achievements';
import {
  getNextStepAction,
  getTodaySessionCountdown,
  resolveBookingStartDate,
  type MiniCalendarDay,
  type NextSessionItem,
  type StudentCabinetTab,
  type TodayTask,
} from './studentCabinetUtils';
import type { TodayTaskRef } from '../..';
import { ScDivider, ScSectionTitle } from './StudentCabinetUI';
import { StudentNextStepCard } from './StudentNextStepCard';
import {
  CurrentSessionsBlock,
  NextSessionBlock,
  SessionCountdownBlock,
} from './StudentTodaySessionBlocks';
import { TodayTasksBlock } from './StudentTodayTasksBlock';
import { TodayProgressBlock } from './StudentTodayProgressBlock';

const SUBSECTION_LABEL = 'text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]';

interface StudentTodaySectionProps {
  currentSessions: Booking[];
  nextSession?: Booking | null;
  nextSessions?: NextSessionItem[];
  miniDays: MiniCalendarDay[];
  courses: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  todayTasks: TodayTask[];
  bookings: Booking[];
  reviews?: Review[];
  userProfile?: UserProfile;
  activityLogs?: ActivityLog[];
  achievementsConfig?: AchievementsConfig;
  skillConfig?: SkillConfig;
  onOpenSession: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onGoToTab: (tab: StudentCabinetTab) => void;
  onContinueDevelopment: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: TodayTaskRef) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
}

export const StudentTodaySection = memo<StudentTodaySectionProps>(function StudentTodaySection({
  currentSessions,
  nextSession = null,
  nextSessions,
  miniDays,
  courses,
  instructors = [],
  usersList = [],
  todayTasks,
  bookings,
  reviews = [],
  userProfile,
  activityLogs = [],
  achievementsConfig,
  skillConfig,
  onOpenSession,
  onOpenLesson,
  onGoToTab,
  onContinueDevelopment,
  onToggleRecommendation,
  onToggleSkillToday,
  onToggleTodayTaskComplete,
  onAddCustomTodayTask,
  onRemoveTodayTask,
  hasUnreadChat,
}) {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const effectiveNextSessions = useMemo(() => {
    if (nextSessions) return nextSessions;
    if (!nextSession) return [];
    return [{ booking: nextSession, dateStr: resolveBookingStartDate(nextSession, courses) }];
  }, [nextSessions, nextSession, courses]);

  const todayCountdown = useMemo(
    () => getTodaySessionCountdown(bookings, courses),
    [bookings, courses]
  );

  const nextStepAction = useMemo(() => {
    if (!userProfile) return null;
    return getNextStepAction(userProfile, bookings, skillConfig, lang);
  }, [userProfile, bookings, skillConfig, lang]);

  return (
    <section className="py-5 space-y-0">
      <ScSectionTitle>{t('scTodaySection')}</ScSectionTitle>

      {/* 1. Обратный отсчёт и текущие занятия */}
      {todayCountdown && (
        <SessionCountdownBlock
          countdown={todayCountdown}
          courses={courses}
          instructors={instructors}
          usersList={usersList}
        />
      )}

      {currentSessions.length > 0 && (
        <CurrentSessionsBlock
          sessions={currentSessions}
          courses={courses}
          instructors={instructors}
          usersList={usersList}
          onOpenLesson={onOpenLesson}
          onOpenSession={onOpenSession}
          hasUnreadChat={hasUnreadChat}
        />
      )}

      {/* 2. Задачи на сегодня */}
      <TodayTasksBlock
        todayTasks={todayTasks}
        bookings={bookings}
        onToggleRecommendation={onToggleRecommendation}
        onToggleTodayTaskComplete={onToggleTodayTaskComplete}
        onAddCustomTodayTask={onAddCustomTodayTask}
        onRemoveTodayTask={onRemoveTodayTask}
        onOpenLesson={onOpenLesson}
        onContinueDevelopment={onContinueDevelopment}
      />

      <ScDivider />

      {/* 3. Следующий шаг */}
      {nextStepAction && (
        <>
          <div className="py-5 space-y-2">
            <p className={SUBSECTION_LABEL}>{t('scNextStepTitle')}</p>
            <StudentNextStepCard
              action={nextStepAction}
              onStartExercise={(exerciseId) => {
                const pinned = userProfile?.todaySkillItemIds?.includes(exerciseId);
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
          <ScDivider />
        </>
      )}

      {/* 4. Ближайшее занятие и мини-календарь */}
      <NextSessionBlock
        nextSessions={effectiveNextSessions}
        miniDays={miniDays}
        courses={courses}
        instructors={instructors}
        usersList={usersList}
        onGoToTab={onGoToTab}
        onOpenLesson={onOpenLesson}
        onOpenSession={onOpenSession}
        hasUnreadChat={hasUnreadChat}
      />

      <ScDivider />

      {/* 5. Прогресс и достижения за сегодня */}
      <TodayProgressBlock
        userProfile={userProfile}
        bookings={bookings}
        courses={courses}
        reviews={reviews}
        activityLogs={activityLogs}
        achievementsConfig={achievementsConfig}
        skillConfig={skillConfig}
        todayTasks={todayTasks}
      />
    </section>
  );
});
