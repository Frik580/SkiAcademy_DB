import type { CabinetSessionItem } from '../../../course-enrollments';
import {
  getNextSessionsNext7DaysFromSessions,
  isActiveSessionItem,
  sessionItemKey,
  type NextSessionItem,
} from '../../../course-enrollments/sessionScheduleHelpers';
import type { SessionParticipantInput } from './studentCabinetContracts';

/** Membership comes from the occurrence, never from the header selection or courseId. */
export function buildSessionParticipants(
  sessions: readonly CabinetSessionItem[],
  profiles: readonly SessionParticipantInput[]
): Readonly<Record<string, readonly SessionParticipantInput[]>> {
  const profilesById = new Map(profiles.map((profile) => [profile.participantId, profile]));
  return Object.fromEntries(
    sessions.map((session) => {
      const ids =
        session.kind === 'lesson'
          ? (session.session.participantIds ?? [])
          : [session.participantId];
      const participants = ids.map((participantId) => {
        const profile = profilesById.get(participantId);
        const projectedName =
          session.kind === 'lesson'
            ? session.session.participantDisplayNames?.[participantId]
            : session.participantName;
        return {
          participantId,
          displayName: profile?.displayName.trim() || projectedName?.trim() || participantId,
          ...(profile?.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
        };
      });
      return [sessionItemKey(session), participants];
    })
  );
}

/** One upcoming course-day card across account enrollments; lessons keep booking membership. */
export function buildNextSessionCards(
  accountSessions: readonly CabinetSessionItem[],
  profiles: readonly SessionParticipantInput[],
  fromDate = new Date()
): {
  nextSessions: NextSessionItem[];
  participantsBySessionKey: Readonly<Record<string, readonly SessionParticipantInput[]>>;
} {
  const activeSessions = accountSessions.filter(isActiveSessionItem);
  const participantsBySessionKey = buildSessionParticipants(activeSessions, profiles);
  const participantsByCourse = new Map<string, Map<string, SessionParticipantInput>>();
  for (const session of activeSessions) {
    if (session.kind !== 'course_day') continue;
    let participants = participantsByCourse.get(session.courseId);
    if (!participants) {
      participants = new Map();
      participantsByCourse.set(session.courseId, participants);
    }
    for (const participant of participantsBySessionKey[sessionItemKey(session)] ?? []) {
      participants.set(participant.participantId, participant);
    }
  }

  const seenCourseDays = new Set<string>();
  const nextSessions = getNextSessionsNext7DaysFromSessions(activeSessions, fromDate).filter(
    ({ session, dateStr }) => {
      if (session.kind === 'lesson') return true;
      const key = JSON.stringify([
        session.courseId,
        session.courseDayId,
        dateStr,
        session.time,
        session.endTime,
        session.timeZone,
      ]);
      if (seenCourseDays.has(key)) return false;
      seenCourseDays.add(key);
      return true;
    }
  );
  const nextParticipantsBySessionKey = Object.fromEntries(
    nextSessions.map(({ session }) => [
      sessionItemKey(session),
      session.kind === 'lesson'
        ? (participantsBySessionKey[sessionItemKey(session)] ?? [])
        : [...(participantsByCourse.get(session.courseId)?.values() ?? [])],
    ])
  );
  return { nextSessions, participantsBySessionKey: nextParticipantsBySessionKey };
}
