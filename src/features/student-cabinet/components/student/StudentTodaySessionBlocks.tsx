import { StudentDashboardTileHeader, StudentDashboardTileBody } from './StudentDashboardTile';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CabinetSessionItem } from '../../../../features/course-enrollments';
import {
  formatCabinetSessionTimeRange,
  formatCourseDayDateLabel,
  getCabinetSessionSubtitle,
  getCabinetSessionTitle,
  sessionItemKey,
} from '../../../../features/course-enrollments/sessionScheduleHelpers';
import { formatCountdownRemaining, formatSessionDayLabel } from './studentCabinetUtils';
import { ScDivider, ScTextButton, ScTintCard } from './StudentCabinetUI';
import { BookingCallCoachButton } from './BookingCallCoachButton';
import { LessonFeedbackIndicator } from '../LessonFeedbackIndicator';
import { ChatUnreadIndicator } from '../../../../features/chat';
import type {
  CurrentSessionsBlockInput,
  NextSessionBlockInput,
  SessionCountdownBlockInput,
  SessionParticipantInput,
} from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import { SessionParticipants } from './SessionParticipants';
import { cabinetItemToLegacyPresentation } from '../../../../features/lesson-bookings/mergeCabinetBookings';
import { StudentDashboardTile } from './StudentDashboardTile';
import { STUDENT_DASHBOARD_TILES } from '../../../settings/studentDashboardLayout';
import './studentCurrentSessions.css';
import './studentCountdown.css';

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
    participants = [],
    courses,
    instructors,
    usersList,
  }) {
    const { t, lang } = useStudentCabinetTranslations();
    const [visible, setVisible] = useState(() => countdown.startsAt.getTime() > Date.now());

    if (!visible) return null;

    const { session } = countdown;
    const isCourseDay = session.kind === 'course_day';

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
              <div className="sc-countdown-meta">
                <p className="sc-countdown-title">{getCabinetSessionTitle(session, lang)}</p>
                <p className="sc-countdown-time">{formatCabinetSessionTimeRange(session)}</p>
              </div>
              <p className="sc-countdown-subtitle">
                {isCourseDay
                  ? formatCourseDayDateLabel(session, lang)
                  : getCabinetSessionSubtitle(session, lang)}
              </p>
              <SessionParticipants participants={participants} />
              {session.kind === 'lesson' && (
                <div className="sc-countdown-actions">
                  <BookingCallCoachButton
                    booking={cabinetItemToLegacyPresentation(
                      session.session,
                      usersList[0]?.uid ?? ''
                    )}
                    courses={courses}
                    instructors={instructors}
                    usersList={usersList}
                    variant="outline"
                    className="sc-countdown-contact"
                  />
                </div>
              )}
            </div>
          </StudentDashboardTileBody>
        </section>
        {!dashboardSize && <ScDivider />}
      </StudentDashboardTile>
    );
  }
);

const SessionCard = memo<
  Omit<CurrentSessionsBlockInput, 'sessions' | 'participantsBySessionKey'> & {
    session: CabinetSessionItem;
    participants: readonly SessionParticipantInput[];
  }
>(function SessionCard({
  session,
  participants,
  courses,
  instructors,
  usersList,
  onOpenLesson,
  onOpenSession,
  onViewCourseDetails,
  hasUnreadChat,
}) {
  const { t, lang } = useStudentCabinetTranslations();
  const isCourseDay = session.kind === 'course_day';

  return (
    <article className="sc-current-session">
      <h3 className="sc-current-session-title">
        <span>{getCabinetSessionTitle(session, lang)}</span>
        {session.kind === 'lesson' && (
          <LessonFeedbackIndicator lessonBookingId={session.session.id} />
        )}
      </h3>
      <div className="sc-current-session-meta">
        <p className="sc-current-session-time">{formatCabinetSessionTimeRange(session)}</p>
        <p className="sc-current-session-subtitle">
          {isCourseDay
            ? formatCourseDayDateLabel(session, lang)
            : getCabinetSessionSubtitle(session, lang)}
        </p>
      </div>
      <SessionParticipants participants={participants} />
      <div className="sc-current-session-actions">
        {session.kind === 'lesson' ? (
          <>
            <ScTextButton
              onClick={() =>
                onOpenLesson(
                  cabinetItemToLegacyPresentation(session.session, usersList[0]?.uid ?? '')
                )
              }
            >
              {t('scMoreDetails')}
            </ScTextButton>
            <ScTextButton
              onClick={() =>
                onOpenSession(
                  cabinetItemToLegacyPresentation(session.session, usersList[0]?.uid ?? '')
                )
              }
              title={hasUnreadChat?.(session.session.id) ? t('chatNewMessages') : t('chat')}
            >
              {t('chat')}
              <ChatUnreadIndicator show={hasUnreadChat?.(session.session.id) ?? false} />
            </ScTextButton>
            <BookingCallCoachButton
              booking={cabinetItemToLegacyPresentation(session.session, usersList[0]?.uid ?? '')}
              courses={courses}
              instructors={instructors}
              usersList={usersList}
              className="sc-current-session-contact"
            />
          </>
        ) : (
          onViewCourseDetails && (
            <ScTextButton
              onClick={() => onViewCourseDetails(session.courseId, session.enrollmentId)}
            >
              {t('scMoreDetails')}
            </ScTextButton>
          )
        )}
      </div>
    </article>
  );
});

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

  return (
    <section>
      <StudentDashboardTileHeader
        title={t('scNextSessionOrCourse')}
        actions={
          <ScTextButton onClick={() => onGoToTab('calendar')}>{t('scFullCalendar')}</ScTextButton>
        }
      />
      <StudentDashboardTileBody>
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
              {nextSessions.map(({ session, dateStr }, index) => {
                const isCourseDay = session.kind === 'course_day';
                return (
                  <div
                    key={`${sessionItemKey(session)}_${dateStr}_${index}`}
                    className={index > 0 ? 'pt-3 space-y-1' : 'space-y-1'}
                  >
                    <p className="text-sm font-medium text-[var(--ink-dim)]">
                      {formatSessionDayLabel(dateStr, lang, t)}
                    </p>
                    <p className="text-2xl font-serif font-light text-[var(--ink)]">
                      {formatCabinetSessionTimeRange(session)}
                    </p>
                    <p className="flex items-center gap-2 flex-wrap text-base font-medium text-[var(--ink)]">
                      <span>{getCabinetSessionTitle(session, lang)}</span>
                      {session.kind === 'lesson' && (
                        <LessonFeedbackIndicator lessonBookingId={session.session.id} />
                      )}
                    </p>
                    <p className="text-sm text-[var(--ink-dim)]">
                      {isCourseDay
                        ? formatCourseDayDateLabel(session, lang)
                        : getCabinetSessionSubtitle(session, lang)}
                    </p>
                    <SessionParticipants
                      participants={participantsBySessionKey[sessionItemKey(session)] ?? []}
                    />
                    <div className="flex flex-wrap gap-4 pt-2">
                      {session.kind === 'lesson' ? (
                        <>
                          <ScTextButton
                            onClick={() =>
                              onOpenLesson(
                                cabinetItemToLegacyPresentation(
                                  session.session,
                                  usersList[0]?.uid ?? ''
                                )
                              )
                            }
                          >
                            {t('scMoreDetails')}
                          </ScTextButton>
                          <ScTextButton
                            onClick={() =>
                              onOpenSession(
                                cabinetItemToLegacyPresentation(
                                  session.session,
                                  usersList[0]?.uid ?? ''
                                )
                              )
                            }
                            title={
                              hasUnreadChat?.(session.session.id) ? t('chatNewMessages') : t('chat')
                            }
                          >
                            {t('chat')}
                            <ChatUnreadIndicator
                              show={hasUnreadChat?.(session.session.id) ?? false}
                            />
                          </ScTextButton>
                          <BookingCallCoachButton
                            booking={cabinetItemToLegacyPresentation(
                              session.session,
                              usersList[0]?.uid ?? ''
                            )}
                            courses={courses}
                            instructors={instructors}
                            usersList={usersList}
                          />
                        </>
                      ) : (
                        onViewCourseDetails && (
                          <ScTextButton
                            // Account-level course card: let details resolve the selected participant.
                            onClick={() => onViewCourseDetails(session.courseId)}
                          >
                            {t('scMoreDetails')}
                          </ScTextButton>
                        )
                      )}
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
      </StudentDashboardTileBody>
    </section>
  );
});
