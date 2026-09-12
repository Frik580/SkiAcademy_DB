import {
  lessonStartsAtLocalCalendarDate,
  participantAttendedLessonFromEvidence,
  type ParticipantLessonStatsEvidence,
} from '@ski-academy/shared-domain';

export const toIsoWeekKey = (input: string | Date): string | null => {
  const d =
    input instanceof Date
      ? new Date(input)
      : new Date(input.includes('T') ? input : `${input}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

const countStreakFromWeekKeys = (weekKeys: ReadonlySet<string>, anchor = new Date()): number => {
  if (weekKeys.size === 0) return 0;

  let streak = 0;
  for (let offset = 0; offset < 104; offset++) {
    const check = new Date(anchor);
    check.setDate(anchor.getDate() - offset * 7);
    const key = toIsoWeekKey(check);
    if (!key) break;
    if (weekKeys.has(key)) {
      streak++;
      continue;
    }
    if (offset === 0) continue;
    break;
  }
  return streak;
};

const findStreakWeeksTimestampFromWeekMap = (
  weekTimestamps: ReadonlyMap<string, string>,
  requiredWeeks = 1,
  anchor = new Date()
): string | undefined => {
  if (weekTimestamps.size === 0) return undefined;

  let streak = 0;
  let latestWeekKeyInStreak: string | null = null;
  for (let offset = 0; offset < 104; offset++) {
    const check = new Date(anchor);
    check.setDate(anchor.getDate() - offset * 7);
    const key = toIsoWeekKey(check);
    if (!key) break;
    if (weekTimestamps.has(key)) {
      if (streak === 0) latestWeekKeyInStreak = key;
      streak++;
      if (streak === requiredWeeks) {
        return latestWeekKeyInStreak ? weekTimestamps.get(latestWeekKeyInStreak) : undefined;
      }
      continue;
    }
    if (offset === 0) continue;
    break;
  }
  return undefined;
};

function isoStringFromLessonStartsAt(row: ParticipantLessonStatsEvidence): string {
  return new Date(row.startsAt.seconds * 1000 + row.startsAt.nanoseconds / 1_000_000).toISOString();
}

function presentEvidenceWeekTimestamps(
  evidence: readonly ParticipantLessonStatsEvidence[]
): Map<string, string> {
  const weekTimestamps = new Map<string, string>();
  for (const row of evidence) {
    if (!participantAttendedLessonFromEvidence(row)) continue;
    const localDate = lessonStartsAtLocalCalendarDate(row.startsAt, row.timeZone);
    const key = toIsoWeekKey(localDate);
    if (!key) continue;
    const timestamp = isoStringFromLessonStartsAt(row);
    const existing = weekTimestamps.get(key);
    if (!existing || timestamp < existing) {
      weekTimestamps.set(key, timestamp);
    }
  }
  return weekTimestamps;
}

/** Canonical streak: Attendance.present of this participantId only. */
export const getTrainingStreakWeeksFromPresentEvidence = (
  evidence: readonly ParticipantLessonStatsEvidence[],
  anchor = new Date()
): number =>
  countStreakFromWeekKeys(new Set(presentEvidenceWeekTimestamps(evidence).keys()), anchor);

export const findStreakWeeksTimestampFromPresentEvidence = (
  evidence: readonly ParticipantLessonStatsEvidence[],
  requiredWeeks = 1,
  anchor = new Date()
): string | undefined =>
  findStreakWeeksTimestampFromWeekMap(
    presentEvidenceWeekTimestamps(evidence),
    requiredWeeks,
    anchor
  );
