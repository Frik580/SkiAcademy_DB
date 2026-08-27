import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatCountdownRemaining,
  formatCourseDateRangeLabel,
  formatSessionDayLabel,
  formatSessionTimeRange,
  getDifficultyShort,
  getRecentLessonInstructorLabel,
  getRecentLessonTitle,
} from './studentCabinetUtils';
import { ScDivider, ScTextButton, ScTintCard } from './StudentCabinetUI';
import { BookingCallCoachButton } from './BookingCallCoachButton';
import { RecommendationIndicator } from '../RecommendationIndicator';
import { ChatUnreadIndicator } from '../../../../features/chat';
import { hasBookingRecommendations, hasPendingRecommendations } from '../../lessonRecommendations';
import type {
  CurrentSessionsBlockInput,
  NextSessionBlockInput,
  SessionCountdownBlockInput,
} from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

const SUBSECTION_LABEL = 'text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]';

type SessionBooking = CurrentSessionsBlockInput['sessions'][number];

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

export const SessionCountdownBlock = memo<SessionCountdownBlockInput>(
  function SessionCountdownBlock({ countdown, courses, instructors, usersList }) {
    const { t, lang } = useStudentCabinetTranslations();
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
  }
);

const SessionCard = memo<
  Omit<CurrentSessionsBlockInput, 'sessions'> & {
    session: SessionBooking;
  }
>(function SessionCard({
  session,
  courses,
  instructors,
  usersList,
  onOpenLesson,
  onOpenSession,
  hasUnreadChat,
}) {
  const { t, lang } = useStudentCabinetTranslations();
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

export const CurrentSessionsBlock = memo<CurrentSessionsBlockInput>(function CurrentSessionsBlock({
  sessions,
  courses,
  instructors,
  usersList,
  onOpenLesson,
  onOpenSession,
  hasUnreadChat,
}) {
  const { t } = useStudentCabinetTranslations();

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

export const NextSessionBlock = memo<NextSessionBlockInput>(function NextSessionBlock({
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
  const { t, lang } = useStudentCabinetTranslations();

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
