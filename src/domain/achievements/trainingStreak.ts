import {
  lessonStartsAtLocalCalendarDate,
  participantAttendedLessonFromEvidence,
} from '@ski-academy/shared-domain/canonical/participantLessonStatsSemantics';
import { timestampFromDate, type ParticipantLessonStatsEvidence } from '@ski-academy/shared-domain';

function calendarDate(input: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === input ? date : null;
}

/** Calendar strings are dates; Date inputs are instants and require an explicit timezone. */
export function toIsoWeekKey(input: string): string | null;
export function toIsoWeekKey(input: Date, timeZone: string): string | null;
export function toIsoWeekKey(input: string | Date, timeZone?: string): string | null {
  if (input instanceof Date && (!timeZone || !Number.isFinite(input.getTime()))) return null;
  const date = calendarDate(
    input instanceof Date
      ? lessonStartsAtLocalCalendarDate(timestampFromDate(input), timeZone!)
      : input
  );
  if (!date) return null;
  // Thursday determines the ISO week-year. All arithmetic is on UTC calendar dates.
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const year = date.getUTCFullYear();
  const week1 = calendarDate(`${String(year).padStart(4, '0')}-01-04`)!;
  const week =
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7
    );
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function presentEvidenceWeekTimestamps(
  evidence: readonly ParticipantLessonStatsEvidence[],
  anchor: Date
): Map<string, string> {
  const weeks = new Map<string, string>();
  for (const row of evidence) {
    if (!participantAttendedLessonFromEvidence(row)) continue;
    const instant = row.startsAt.seconds * 1000 + row.startsAt.nanoseconds / 1_000_000;
    if (instant > anchor.getTime()) continue;
    const key = toIsoWeekKey(lessonStartsAtLocalCalendarDate(row.startsAt, row.timeZone));
    if (!key) continue;
    const timestamp = new Date(instant).toISOString();
    const existing = weeks.get(key);
    if (!existing || timestamp < existing) weeks.set(key, timestamp);
  }
  return weeks;
}

/** Shared traversal keeps the threshold and earnedAt on exactly the same weeks. */
function streakTimestamps(
  evidence: readonly ParticipantLessonStatsEvidence[],
  anchor: Date,
  timeZone: string
): string[] {
  if (!Number.isFinite(anchor.getTime())) return [];
  const weeks = presentEvidenceWeekTimestamps(evidence, anchor);
  const check = calendarDate(lessonStartsAtLocalCalendarDate(timestampFromDate(anchor), timeZone))!;
  const streak: string[] = [];
  for (let offset = 0; offset < 104; offset++) {
    const timestamp = weeks.get(toIsoWeekKey(check.toISOString().slice(0, 10))!);
    if (timestamp) streak.push(timestamp);
    else if (offset !== 0) break;
    check.setUTCDate(check.getUTCDate() - 7);
  }
  return streak;
}

/** Evidence must be scoped to the selected Participant by the evaluation context. */
export const getTrainingStreakWeeksFromPresentEvidence = (
  evidence: readonly ParticipantLessonStatsEvidence[],
  anchor: Date,
  timeZone: string
): number => streakTimestamps(evidence, anchor, timeZone).length;

export const findStreakWeeksTimestampFromPresentEvidence = (
  evidence: readonly ParticipantLessonStatsEvidence[],
  requiredWeeks: number,
  anchor: Date,
  timeZone: string
): string | undefined => {
  const streak = streakTimestamps(evidence, anchor, timeZone);
  return streak.length >= requiredWeeks ? streak[0] : undefined;
};
