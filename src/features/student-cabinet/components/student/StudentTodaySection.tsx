import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Award, Sparkles, Trophy, Zap } from 'lucide-react';
import {
  ActivityLog,
  Booking,
  Course,
  Instructor,
  Review,
  UserProfile,
} from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { AchievementsConfig } from '../../../../lib/achievementConfig';
import { DEFAULT_SKILL_CONFIG, SkillConfig, getSkillItemTitle } from '../../../../lib/skillData';
import {
  formatCountdownRemaining,
  formatCourseDateRangeLabel,
  formatSessionDayLabel,
  formatSessionTimeRange,
  getDifficultyShort,
  getNextStepAction,
  getRecentLessonInstructorLabel,
  getRecentLessonTitle,
  getTodayAchievements,
  getTodaySessionCountdown,
  isTimestampOnLocalDate,
  MiniCalendarDay,
  resolveBookingStartDate,
  StudentCabinetTab,
  TodayTask,
  type NextSessionItem,
  type TodaySessionCountdown,
} from './studentCabinetUtils';
import { ScDivider, ScSectionTitle, ScTextButton, ScTintCard } from './StudentCabinetUI';
import { TodayChecklist } from '../../../../features/profile/components/TodayChecklist';
import { BookingCallCoachButton } from './BookingCallCoachButton';
import { StudentNextStepCard } from './StudentNextStepCard';
import { RecommendationIndicator } from '../RecommendationIndicator';
import { ChatUnreadIndicator } from '../../../../features/chat';
import {
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../../../lib/lessonRecommendations';

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
  onRemoveTodayTask?: (task: import('../../../../lib/todayChecklist').TodayTaskRef) => void;
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

const CountdownDigits = memo<{
  startsAtMs: number;
  lang: 'en' | 'ru';
  onExpire: () => void;
}>(function CountdownDigits({ startsAtMs, lang, onExpire }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const ms = startsAtMs - Date.now();
      if (ms <= 0) {
        onExpireRef.current();
        return false;
      }
      if (ref.current) {
        ref.current.textContent = formatCountdownRemaining(ms, lang);
      }
      return true;
    };

    if (!tick()) return;

    const id = window.setInterval(() => {
      if (!tick()) window.clearInterval(id);
    }, 1000);

    return () => window.clearInterval(id);
  }, [startsAtMs, lang]);

  const initialMs = Math.max(0, startsAtMs - Date.now());

  return (
    <p
      ref={ref}
      className="text-3xl sm:text-4xl font-serif font-light tabular-nums text-[#64D2FF]"
      aria-live="polite"
    >
      {formatCountdownRemaining(initialMs, lang)}
    </p>
  );
});

const SessionCountdownBlock = memo<{
  countdown: TodaySessionCountdown;
  courses: Course[];
  instructors: Instructor[];
  usersList: UserProfile[];
}>(function SessionCountdownBlock({ countdown, courses, instructors, usersList }) {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const [visible, setVisible] = useState(() => countdown.startsAt.getTime() > Date.now());

  if (!visible) return null;

  const { booking } = countdown;
  const isCourse = booking.instructorId.startsWith('course_');

  return (
    <>
      <div className="pt-5 pb-5 space-y-2">
        <p className={SUBSECTION_LABEL}>{t('scCountdownToSession')}</p>
        <ScTintCard tint="accent" className="px-4 py-4 space-y-2">
          <CountdownDigits
            startsAtMs={countdown.startsAt.getTime()}
            lang={lang}
            onExpire={() => setVisible(false)}
          />
          <p className="text-base font-medium text-[var(--ink)]">
            {isCourse
              ? getRecentLessonTitle(booking, courses, lang)
              : getDifficultyShort(booking.difficulty)}
          </p>
          <p className="text-sm text-[var(--ink-dim)]">
            {formatSessionTimeRange(booking)}
            {' · '}
            {isCourse
              ? formatCourseDateRangeLabel(booking, courses, lang)
              : getRecentLessonInstructorLabel(booking, lang)}
          </p>
          <div className="flex flex-wrap gap-4 pt-1">
            <BookingCallCoachButton
              booking={booking}
              courses={courses}
              instructors={instructors}
              usersList={usersList}
            />
          </div>
        </ScTintCard>
      </div>
      <ScDivider />
    </>
  );
});

const SessionCard = memo<{
  session: Booking;
  courses: Course[];
  instructors: Instructor[];
  usersList: UserProfile[];
  onOpenLesson: (booking: Booking) => void;
  onOpenSession: (booking: Booking) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
}>(function SessionCard({
  session,
  courses,
  instructors,
  usersList,
  onOpenLesson,
  onOpenSession,
  hasUnreadChat,
}) {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const isCourse = session.instructorId.startsWith('course_');

  return (
    <ScTintCard tint="green" className="px-4 py-3.5 space-y-2">
      <p className="text-sm text-[var(--ink-dim)]">{t('scToday')}</p>
      <p className="text-2xl font-serif font-light text-[var(--ink)]">
        {formatSessionTimeRange(session)}
      </p>
      <p className="flex items-center gap-2 flex-wrap text-base font-medium text-[var(--ink)]">
        <span>
          {isCourse
            ? getRecentLessonTitle(session, courses, lang)
            : getDifficultyShort(session.difficulty)}
        </span>
        {hasBookingRecommendations(session) && (
          <RecommendationIndicator pending={hasPendingRecommendations(session)} />
        )}
      </p>
      <p className="text-sm text-[var(--ink-dim)]">
        {isCourse
          ? formatCourseDateRangeLabel(session, courses, lang)
          : getRecentLessonInstructorLabel(session, lang)}
      </p>
      <div className="flex flex-wrap gap-4 pt-2">
        <ScTextButton onClick={() => onOpenLesson(session)}>{t('scMoreDetails')}</ScTextButton>
        <ScTextButton
          onClick={() => onOpenSession(session)}
          title={hasUnreadChat?.(session.id) ? t('chatNewMessages') : t('chat')}
        >
          {t('chat')}
          <ChatUnreadIndicator show={hasUnreadChat?.(session.id) ?? false} />
        </ScTextButton>
        <BookingCallCoachButton
          booking={session}
          courses={courses}
          instructors={instructors}
          usersList={usersList}
        />
      </div>
    </ScTintCard>
  );
});

const CurrentSessionsBlock = memo<{
  sessions: Booking[];
  courses: Course[];
  instructors: Instructor[];
  usersList: UserProfile[];
  onOpenLesson: (booking: Booking) => void;
  onOpenSession: (booking: Booking) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
}>(function CurrentSessionsBlock({
  sessions,
  courses,
  instructors,
  usersList,
  onOpenLesson,
  onOpenSession,
  hasUnreadChat,
}) {
  const { t } = useLanguage();

  return (
    <>
      <div className="pt-5 pb-5 space-y-2">
        <p className={SUBSECTION_LABEL}>{t('scCurrentSessions')}</p>
        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              courses={courses}
              instructors={instructors}
              usersList={usersList}
              onOpenLesson={onOpenLesson}
              onOpenSession={onOpenSession}
              hasUnreadChat={hasUnreadChat}
            />
          ))}
        </div>
      </div>
      <ScDivider />
    </>
  );
});

const NextSessionBlock = memo<{
  nextSessions: NextSessionItem[];
  miniDays: MiniCalendarDay[];
  courses: Course[];
  instructors: Instructor[];
  usersList: UserProfile[];
  onGoToTab: (tab: StudentCabinetTab) => void;
  onOpenLesson: (booking: Booking) => void;
  onOpenSession: (booking: Booking) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
}>(function NextSessionBlock({
  nextSessions,
  miniDays,
  courses,
  instructors,
  usersList,
  onGoToTab,
  onOpenLesson,
  onOpenSession,
  hasUnreadChat,
}) {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const upcomingDatesSet = useMemo(
    () => new Set(nextSessions.map((s) => s.dateStr)),
    [nextSessions]
  );

  return (
    <div className="py-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className={SUBSECTION_LABEL}>{t('scNextSessionOrCourse')}</p>
        <ScTextButton onClick={() => onGoToTab('calendar')}>{t('scFullCalendar')}</ScTextButton>
      </div>

      <ScTintCard tint="purple" className="px-4 py-4 sm:px-5 space-y-4">
        <div className="flex justify-between gap-1 text-center text-sm overflow-x-auto no-scrollbar pb-1">
          {miniDays.map(({ day, dateStr, hasSession, isToday, weekdayLabel }) => {
            const isUpcomingDay = upcomingDatesSet.has(dateStr);
            return (
              <div key={dateStr} className="flex flex-col items-center gap-1 min-w-[2rem] flex-1">
                <span
                  className={`text-[10px] uppercase ${
                    isToday || isUpcomingDay ? 'text-[#BF5AF2]' : 'text-[var(--ink-dim)]'
                  }`}
                >
                  {weekdayLabel}
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink)] ${
                    isToday || isUpcomingDay ? 'font-bold bg-[#BF5AF2]/20 text-[#BF5AF2]' : ''
                  } ${isUpcomingDay && !isToday ? 'ring-2 ring-[#BF5AF2]/40' : ''}`}
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

        {nextSessions.length > 0 ? (
          <div className="space-y-4 pt-1 border-t border-[#BF5AF2]/15 divide-y divide-[#BF5AF2]/15">
            {nextSessions.map(({ booking, dateStr }, index) => {
              const isNextCourse = Boolean(booking.instructorId.startsWith('course_'));
              return (
                <div
                  key={`${booking.id}_${dateStr}_${index}`}
                  className={index > 0 ? 'pt-3 space-y-1' : 'space-y-1'}
                >
                  <p className="text-sm font-medium text-[var(--ink-dim)]">
                    {formatSessionDayLabel(dateStr, lang, t)}
                  </p>
                  <p className="text-2xl font-serif font-light text-[var(--ink)]">
                    {formatSessionTimeRange(booking)}
                  </p>
                  <p className="flex items-center gap-2 flex-wrap text-base font-medium text-[var(--ink)]">
                    <span>
                      {isNextCourse
                        ? getRecentLessonTitle(booking, courses, lang)
                        : getDifficultyShort(booking.difficulty)}
                    </span>
                    {hasBookingRecommendations(booking) && (
                      <RecommendationIndicator pending={hasPendingRecommendations(booking)} />
                    )}
                  </p>
                  <p className="text-sm text-[var(--ink-dim)]">
                    {isNextCourse
                      ? formatCourseDateRangeLabel(booking, courses, lang)
                      : getRecentLessonInstructorLabel(booking, lang)}
                  </p>
                  <div className="flex flex-wrap gap-4 pt-2">
                    <ScTextButton onClick={() => onOpenLesson(booking)}>
                      {t('scMoreDetails')}
                    </ScTextButton>
                    <ScTextButton
                      onClick={() => onOpenSession(booking)}
                      title={hasUnreadChat?.(booking.id) ? t('chatNewMessages') : t('chat')}
                    >
                      {t('chat')}
                      <ChatUnreadIndicator show={hasUnreadChat?.(booking.id) ?? false} />
                    </ScTextButton>
                    <BookingCallCoachButton
                      booking={booking}
                      courses={courses}
                      instructors={instructors}
                      usersList={usersList}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--ink-dim)] pt-1 border-t border-[#BF5AF2]/15">
            {t('scNoUpcomingSession')}
          </p>
        )}
      </ScTintCard>
    </div>
  );
});

const TodayTasksBlock = memo<{
  todayTasks: TodayTask[];
  bookings: Booking[];
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: import('../../../../lib/todayChecklist').TodayTaskRef) => void;
  onOpenLesson: (booking: Booking) => void;
  onContinueDevelopment: () => void;
}>(function TodayTasksBlock({
  todayTasks,
  bookings,
  onToggleRecommendation,
  onToggleTodayTaskComplete,
  onAddCustomTodayTask,
  onRemoveTodayTask,
  onOpenLesson,
  onContinueDevelopment,
}) {
  const { t } = useLanguage();

  return (
    <div className="pt-5 space-y-2">
      <p className={SUBSECTION_LABEL}>{t('scQuickActions')}</p>
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
  );
});

const TodayProgressBlock = memo<{
  userProfile?: UserProfile;
  bookings: Booking[];
  courses: Course[];
  reviews: Review[];
  activityLogs?: ActivityLog[];
  achievementsConfig?: AchievementsConfig;
  skillConfig?: SkillConfig;
  todayTasks: TodayTask[];
}>(function TodayProgressBlock({
  userProfile,
  bookings,
  courses,
  reviews,
  activityLogs = [],
  achievementsConfig,
  skillConfig,
}) {
  const { language } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const todayLogs = useMemo(() => {
    const logs = activityLogs.filter(
      (log) => log.timestamp && isTimestampOnLocalDate(log.timestamp)
    );
    // Sort oldest first so logs replay in chronological order
    return [...logs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [activityLogs]);

  const todayExerciseItems = useMemo(() => {
    const exerciseMap = new Map<
      string,
      {
        itemId: string;
        title: string;
        logDeltasSum: number;
        firstOldScore: number;
        lastNewScore: number;
        maxPoints: number;
      }
    >();

    const skillItems = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;

    for (const log of todayLogs) {
      if (
        (log.type === 'skill_scores_updated' || log.type === 'level_up') &&
        Array.isArray(log.metadata?.skillDeltas)
      ) {
        for (const item of log.metadata.skillDeltas) {
          if (!item.itemId) continue;
          const deltaVal = typeof item.delta === 'number' ? item.delta : 0;
          const newScoreVal = typeof item.newScore === 'number' ? item.newScore : 0;
          const oldScoreVal =
            typeof item.oldScore === 'number' ? item.oldScore : Math.max(0, newScoreVal - deltaVal);

          const foundItem = skillItems.find((i) => i.id === item.itemId);
          const maxPoints = item.maxPoints ?? foundItem?.maxPoints ?? 20;
          const title = foundItem ? getSkillItemTitle(foundItem, lang) : item.title || item.itemId;

          const existing = exerciseMap.get(item.itemId);
          if (existing) {
            existing.lastNewScore = newScoreVal;
            existing.logDeltasSum += deltaVal;
          } else {
            exerciseMap.set(item.itemId, {
              itemId: item.itemId,
              title,
              logDeltasSum: deltaVal,
              firstOldScore: Math.max(0, oldScoreVal),
              lastNewScore: newScoreVal,
              maxPoints,
            });
          }
        }
      }
    }

    return Array.from(exerciseMap.values())
      .map((item) => {
        const liveScore = userProfile?.skillScores?.[item.itemId];
        const currentScoreRaw = typeof liveScore === 'number' ? liveScore : item.lastNewScore;
        const currentScore = Math.min(item.maxPoints, Math.max(0, currentScoreRaw));

        // Calculate positive gain today relative to the score before today's changes
        const netIncrease = currentScore - item.firstOldScore;
        const earnedToday = netIncrease > 0 ? Math.min(item.maxPoints, netIncrease) : 0;

        return {
          itemId: item.itemId,
          title: item.title,
          delta: earnedToday,
          newScore: currentScore,
          maxPoints: item.maxPoints,
        };
      })
      .filter((item) => item.delta > 0);
  }, [todayLogs, skillConfig, userProfile?.skillScores, lang]);

  const todayXP = useMemo(() => {
    return Math.max(
      0,
      todayExerciseItems.reduce((acc, item) => acc + item.delta, 0)
    );
  }, [todayExerciseItems]);

  const todayLevelUp = useMemo(() => {
    const levelLog = todayLogs.find((l) => l.type === 'level_up');
    if (levelLog && levelLog.metadata?.newLevel) {
      return Number(levelLog.metadata.newLevel);
    }
    return null;
  }, [todayLogs]);

  const todayAchievements = useMemo(() => {
    if (!userProfile) return [];
    return getTodayAchievements(
      userProfile,
      bookings,
      skillConfig,
      lang,
      activityLogs,
      reviews,
      courses,
      achievementsConfig
    ).map((item) => ({ id: item.id, label: item.label }));
  }, [
    userProfile,
    bookings,
    skillConfig,
    lang,
    activityLogs,
    reviews,
    courses,
    achievementsConfig,
  ]);

  const motivationalPhrase = useMemo(() => {
    if (lang === 'en') {
      if (todayXP > 0 || todayLevelUp || todayAchievements.length > 0) {
        return 'Fantastic progress today! Keep pushing your limits on the slope! ⛷️';
      }
      return 'Ready for today’s challenges? Conquer your tasks and reach new heights! 🏔️';
    }

    const phrases = [
      'Отличная работа сегодня! Каждый спуск и поворот приближают тебя к мастерству. 🏔️',
      'Потрясающий прогресс за сегодня! Горы покоряются тем, кто уверенно идет вперед. ⛷️',
      'Ты сегодня на высоте! Скорость и техника под контролем — продолжай в том же духе! 🏂',
      'Мощный день! Твои усилия и усердные тренировки приносят отличные результаты. 🚀',
      'Прекрасный результат сегодня! Гордимся твоими успехами и целеустремленностью. ✨',
    ];

    const index = (new Date().getDate() + todayXP) % phrases.length;
    return phrases[index];
  }, [lang, todayXP, todayLevelUp, todayAchievements.length]);

  if (
    todayXP === 0 &&
    !todayLevelUp &&
    todayAchievements.length === 0 &&
    todayExerciseItems.length === 0
  ) {
    return null;
  }

  return (
    <div className="pt-5 space-y-2">
      <p className={SUBSECTION_LABEL}>
        {lang === 'ru' ? 'Достижения за сегодня' : 'Today’s Progress'}
      </p>
      <ScTintCard tint="accent" className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--divider)] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#30D158]/15 text-[#30D158] flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-[var(--ink-dim)]">
                {lang === 'ru' ? 'Заработанное за сегодня XP' : 'Today’s Earned XP'}
              </p>
              <p className="text-lg font-bold text-[var(--ink)] tabular-nums">
                +{todayXP} <span className="text-xs font-semibold text-[#30D158]">XP</span>
              </p>
            </div>
          </div>

          {todayLevelUp && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFD60A]/15 border border-[#FFD60A]/30 text-[#FFD60A]">
              <Trophy className="w-3.5 h-3.5" />
              <span className="text-xs font-bold uppercase tracking-wide">
                {lang === 'ru' ? `Новый уровень: ${todayLevelUp}` : `New Level: ${todayLevelUp}`}
              </span>
            </div>
          )}

          {userProfile?.level && !todayLevelUp && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-tint)] text-[var(--ink-dim)] text-xs font-medium">
              <span>
                {lang === 'ru' ? `Уровень ${userProfile.level}` : `Level ${userProfile.level}`}
              </span>
            </div>
          )}
        </div>

        {/* Exercises evaluated today by instructor */}
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[#30D158]" />
            {lang === 'ru'
              ? 'Оценки за упражнения от тренера:'
              : 'Exercise scores from instructor:'}
          </p>

          {todayExerciseItems.length > 0 ? (
            <div className="space-y-1.5">
              {todayExerciseItems.map((item) => (
                <div
                  key={item.itemId}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-xs gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--ink)] truncate">{item.title}</p>
                    <p className="text-[11px] text-[var(--ink-dim)] mt-0.5">
                      {lang === 'ru'
                        ? `Текущий балл: ${item.newScore} / ${item.maxPoints} XP (макс. ${item.maxPoints} XP)`
                        : `Current score: ${item.newScore} / ${item.maxPoints} XP (max ${item.maxPoints} XP)`}
                    </p>
                  </div>
                  <div className="shrink-0 font-bold text-[#30D158] bg-[#30D158]/10 px-2.5 py-1 rounded-md border border-[#30D158]/20 text-xs tabular-nums">
                    {item.delta >= 0 ? `+${item.delta}` : item.delta} XP
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-dim)] italic py-0.5">
              {lang === 'ru'
                ? 'За сегодня тренер еще не выставлял баллы за упражнения.'
                : 'No exercise XP assigned by instructor today yet.'}
            </p>
          )}
        </div>

        {todayAchievements.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-[var(--divider)]">
            <p className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#FFD60A]" />
              {lang === 'ru' ? 'Новые достижения сегодня:' : 'New achievements today:'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {todayAchievements.map((ach, idx) => (
                <span
                  key={ach.id || idx}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-[#FFD60A]/15 text-[#FFD60A] font-medium border border-[#FFD60A]/30"
                >
                  <Sparkles className="w-3 h-3" />
                  {ach.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="pt-1 flex items-start gap-2 text-xs text-[var(--ink-dim)] leading-relaxed italic bg-[var(--surface-card)]/50 p-2.5 rounded-lg border border-[var(--border-subtle)]">
          <Sparkles className="w-4 h-4 text-[#64D2FF] shrink-0 mt-0.5" />
          <p>{motivationalPhrase}</p>
        </div>
      </ScTintCard>
    </div>
  );
});
