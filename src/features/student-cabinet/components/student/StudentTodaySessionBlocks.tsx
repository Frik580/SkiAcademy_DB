import { StudentDashboardTileHeader, StudentDashboardTileBody } from './StudentDashboardTile';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CabinetSessionItem } from '../../../../features/course-enrollments';
import {
  formatCabinetSessionTimeRange,
  sessionDisplayDate,
  getCabinetSessionTitle,
  sessionItemKey,
} from '../../../../features/course-enrollments/sessionScheduleHelpers';
import { formatCountdownRemaining, formatSessionDayLabel } from './studentCabinetUtils';
import { ScDivider, ScTextButton } from './StudentCabinetUI';
import { StudentSessionCard } from './StudentSessionCard';
import { normalizeTelHref, resolveBookingCoachPhone } from './coachUtils';
import { translateCourse } from '../../../../lib/i18n/contentTranslation';
import type {
  CurrentSessionsBlockInput,
  NextSessionBlockInput,
  SessionCountdownBlockInput,
  SessionParticipantInput,
} from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import { cabinetItemToLegacyPresentation } from '../../../../features/lesson-bookings/mergeCabinetBookings';
import { StudentDashboardTile } from './StudentDashboardTile';
import { STUDENT_DASHBOARD_TILES } from '../../../settings/studentDashboardLayout';
import './studentCurrentSessions.css';
import './studentCountdown.css';
import './studentNextSession.css';

// Only numeric values and fixed localized units from the shared formatter enter this markup.
function countdownMarkup(ms: number, lang: 'en' | 'ru') {
  return formatCountdownRemaining(ms, lang)
    .split(/(\d+)/)
    .map(
      (text) =>
        `<span class="${/^\d+$/.test(text) ? 'sc-countdown-value' : 'sc-countdown-unit'}">${text}</span>`
    )
    .join('');
}

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
        ref.current.innerHTML = countdownMarkup(ms, lang);
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
      className="sc-countdown-digits"
      aria-live="polite"
      dangerouslySetInnerHTML={{ __html: countdownMarkup(initialMs, lang) }}
    />
  );
});

export const SessionCountdownBlock = memo<SessionCountdownBlockInput>(
  function SessionCountdownBlock({
    dashboardSize,
    onExpire,
    countdown,
    countdowns,
    participants = [],
    participantsBySessionKey,
    courses,
    instructors,
    usersList,
  }) {
    const { t, lang } = useStudentCabinetTranslations();
    const [visible, setVisible] = useState(() => countdown.startsAt.getTime() > Date.now());

    if (!visible) return null;

    const sessions = countdowns ?? [countdown];
    const courseParticipants = new Map<string, Map<string, SessionParticipantInput>>();
    for (const { session } of sessions) {
      if (session.kind !== 'course_day') continue;
      const byId =
        courseParticipants.get(session.courseId) ?? new Map<string, SessionParticipantInput>();
      for (const participant of participantsBySessionKey?.[sessionItemKey(session)] ??
        participants) {
        byId.set(participant.participantId, participant);
      }
      courseParticipants.set(session.courseId, byId);
    }
    const seenCourseDays = new Set<string>();
    const visibleSessions = sessions.filter(({ session }) => {
      if (session.kind !== 'course_day') return true;
      const key = JSON.stringify([
        session.courseId,
        session.courseDayId,
        session.date,
        session.time,
        session.endTime,
        session.timeZone,
      ]);
      if (seenCourseDays.has(key)) return false;
      seenCourseDays.add(key);
      return true;
    });

    return (
      <StudentDashboardTile tileKey={STUDENT_DASHBOARD_TILES.countdown.key} size={dashboardSize}>
        <section className="sc-countdown">
          <StudentDashboardTileHeader title={t('scCountdownToSession')} />
          <StudentDashboardTileBody>
            <div className="sc-countdown-content">
              <CountdownDigits
                startsAtMs={countdown.startsAt.getTime()}
                lang={lang}
                onExpire={() => {
                  setVisible(false);
                  onExpire?.();
                }}
              />
              {visibleSessions.map(({ session }) => (
                <SessionCard
                  key={sessionItemKey(session)}
                  session={session}
                  participants={
                    session.kind === 'course_day'
                      ? [...(courseParticipants.get(session.courseId)?.values() ?? [])]
                      : (participantsBySessionKey?.[sessionItemKey(session)] ?? participants)
                  }
                  courses={courses}
                  instructors={instructors}
                  usersList={usersList}
                />
              ))}
            </div>
          </StudentDashboardTileBody>
        </section>
        {!dashboardSize && <ScDivider />}
      </StudentDashboardTile>
    );
  }
);

// Container adapter: domain entities and legacy modal conversion stay outside the card.
function SessionCard({
  session,
  participants,
  courses,
  instructors,
  usersList,
  onOpenLesson,
  onOpenSession,
  onViewCourseDetails,
  hasUnreadChat,
  dayLabel,
  accountCourse = false,
}: Omit<
  CurrentSessionsBlockInput,
  'sessions' | 'participantsBySessionKey' | 'onOpenLesson' | 'onOpenSession'
> & {
  session: CabinetSessionItem;
  participants: readonly SessionParticipantInput[];
  onOpenLesson?: CurrentSessionsBlockInput['onOpenLesson'];
  onOpenSession?: CurrentSessionsBlockInput['onOpenSession'];
  dayLabel?: string;
  accountCourse?: boolean;
}) {
  const { t, lang } = useStudentCabinetTranslations();
  const booking =
    session.kind === 'lesson'
      ? cabinetItemToLegacyPresentation(session.session, usersList[0]?.uid ?? '')
      : undefined;
  const course =
    session.kind === 'course_day'
      ? courses.find((entry) => entry.id === session.courseId)
      : undefined;
  const discipline = session.kind === 'lesson' ? session.session.discipline : course?.discipline;
  const coaches =
    session.kind === 'lesson'
      ? [{ name: session.session.instructorName, avatarUrl: session.session.instructorAvatar }]
      : (course?.instructorIds ?? []).flatMap((id) => {
          const coach = instructors.find((entry) => entry.id === id);
          return coach ? [{ name: coach.name, avatarUrl: coach.avatarUrl }] : [];
        });
  const phone = booking
    ? resolveBookingCoachPhone(booking, courses, usersList, instructors)
    : undefined;
  return (
    <StudentSessionCard
      sessionId={
        session.kind === 'lesson'
          ? `lesson:${session.session.id}`
          : `course_day:${session.courseId}:${session.courseDayId}`
      }
      levelId={session.kind === 'lesson' ? session.session.difficulty : undefined}
      title={course ? translateCourse(course, lang).title : getCabinetSessionTitle(session, lang)}
      dayLabel={dayLabel ?? formatSessionDayLabel(sessionDisplayDate(session), lang, t, undefined)}
      timeRange={formatCabinetSessionTimeRange(session)}
      disciplineLabel={
        discipline
          ? t(
              discipline === 'ski' ? 'participantsDisciplineSki' : 'participantsDisciplineSnowboard'
            )
          : undefined
      }
      coaches={coaches}
      participants={participants}
      feedbackLessonId={booking && onOpenLesson ? booking.id : undefined}
      onDetails={
        booking && onOpenLesson
          ? () => onOpenLesson(booking)
          : session.kind === 'course_day' && onViewCourseDetails
            ? () =>
                accountCourse
                  ? onViewCourseDetails(session.courseId)
                  : onViewCourseDetails(session.courseId, session.enrollmentId)
            : undefined
      }
      onChat={booking && onOpenSession ? () => onOpenSession(booking) : undefined}
      unreadChat={booking ? (hasUnreadChat?.(booking.id) ?? false) : false}
      phoneHref={phone ? normalizeTelHref(phone) : undefined}
    />
  );
}

export const CurrentSessionsBlock = memo<CurrentSessionsBlockInput>(function CurrentSessionsBlock({
  sessions,
  participantsBySessionKey = {},
  courses,
  instructors,
  usersList,
  onOpenLesson,
  onOpenSession,
  onViewCourseDetails,
  hasUnreadChat,
}) {
  const { t } = useStudentCabinetTranslations();

  return (
    <>
      <section className="sc-current-sessions">
        <StudentDashboardTileHeader title={t('scCurrentSessions')} />
        <StudentDashboardTileBody>
          <div className="sc-current-sessions-list">
            {sessions.map((session) => (
              <SessionCard
                key={sessionItemKey(session)}
                session={session}
                participants={participantsBySessionKey[sessionItemKey(session)] ?? []}
                courses={courses}
                instructors={instructors}
                usersList={usersList}
                onOpenLesson={onOpenLesson}
                onOpenSession={onOpenSession}
                onViewCourseDetails={onViewCourseDetails}
                hasUnreadChat={hasUnreadChat}
              />
            ))}
          </div>
        </StudentDashboardTileBody>
      </section>
    </>
  );
});

export const NextSessionBlock = memo<NextSessionBlockInput>(function NextSessionBlock({
  nextSessions,
  participantsBySessionKey = {},
  miniDays,
  courses,
  instructors,
  usersList,
  onGoToTab,
  onOpenLesson,
  onOpenSession,
  onViewCourseDetails,
  hasUnreadChat,
}) {
  const { t, lang } = useStudentCabinetTranslations();

  const upcomingDatesSet = useMemo(
    () => new Set(nextSessions.map((entry) => entry.dateStr)),
    [nextSessions]
  );

  const calendarLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const labels = miniDays.map(({ dateStr }) =>
      formatter.format(new Date(`${dateStr}T12:00:00Z`))
    );
    return [...new Set(labels)].join(' · ');
  }, [miniDays, lang]);

  return (
    <section className="sc-next-session">
      <StudentDashboardTileHeader
        title={t('scNextSessionOrCourse')}
        actions={
          <ScTextButton
            onClick={() => onGoToTab('calendar')}
            className="sc-next-session-calendar-link"
          >
            {t('scFullCalendar')}
          </ScTextButton>
        }
      />
      <StudentDashboardTileBody>
        <div className="sc-next-session-layout">
          <div className="sc-next-session-calendar">
            {calendarLabel && <p className="sc-next-session-month">{calendarLabel}</p>}
            <div className="sc-next-session-days">
              {miniDays.map(({ day, dateStr, hasSession, isToday, weekdayLabel }) => {
                const isUpcomingDay = upcomingDatesSet.has(dateStr);
                return (
                  <div
                    key={dateStr}
                    className="sc-next-session-day"
                    data-today={isToday || undefined}
                    data-upcoming={isUpcomingDay || undefined}
                  >
                    <span className="sc-next-session-weekday">{weekdayLabel}</span>
                    <span
                      className="sc-next-session-date"
                      aria-current={isToday ? 'date' : undefined}
                    >
                      {day}
                    </span>
                    <span
                      className="sc-next-session-dot"
                      data-booked={hasSession || undefined}
                      title={hasSession ? t('bookedLesson') : t('noLessons')}
                    >
                      {hasSession ? '●' : '○'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {nextSessions.length > 0 ? (
            <div className="sc-next-session-list">
              {nextSessions.map(({ session, dateStr }, index) => (
                <SessionCard
                  key={`${sessionItemKey(session)}_${dateStr}_${index}`}
                  session={session}
                  participants={participantsBySessionKey[sessionItemKey(session)] ?? []}
                  courses={courses}
                  instructors={instructors}
                  usersList={usersList}
                  onOpenLesson={onOpenLesson}
                  onOpenSession={onOpenSession}
                  onViewCourseDetails={onViewCourseDetails}
                  hasUnreadChat={hasUnreadChat}
                  dayLabel={formatSessionDayLabel(
                    sessionDisplayDate(session),
                    lang,
                    t,
                    miniDays[0]?.dateStr
                  )}
                  accountCourse
                />
              ))}
            </div>
          ) : (
            <p className="sc-next-session-empty">{t('scNoUpcomingSession')}</p>
          )}
        </div>
      </StudentDashboardTileBody>
    </section>
  );
});
