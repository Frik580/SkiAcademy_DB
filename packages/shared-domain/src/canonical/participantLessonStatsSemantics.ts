import type { Attendance } from './courseEnrollmentAttendanceAdminIssue';
import type { BookingLifecycleStatus } from './bookingOccurrenceProposalChange';
import type { BookingId, InstructorId, ParticipantId } from './identifiers';
import type { CanonicalTimestamp, IanaTimeZone } from './primitives';
import type {
  LessonBookingManagedParticipantAttendance,
  LessonBookingReadModel,
} from './readModels/lessonBookingReadModel';

/**
 * Canonical participant-level lesson stats semantics (individual / family lesson bookings).
 *
 * Participant learning credit requires Attendance.present for that participantId.
 * Booking lifecycle `completed` alone is insufficient for participant metrics.
 * Instructor slot occupancy uses booking lifecycle only (completed | no_show).
 *
 * Course enrollment / course_day attendance is out of scope (9C).
 */

export type ParticipantBookingAttendanceResolution =
  | { readonly kind: 'not_in_service_party' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'present' }
  | { readonly kind: 'absent' };

export type ParticipantLessonStatsInput = {
  readonly participantId: ParticipantId;
  readonly servicePartyParticipantIds: readonly ParticipantId[];
  readonly attendancesByParticipantId: ReadonlyMap<
    ParticipantId,
    Pick<Attendance, 'attendanceStatus'>
  >;
  readonly lessonDurationHours: number;
};

export function attendancesByParticipantIdFromRows(
  attendances: readonly Pick<Attendance, 'subject' | 'attendanceStatus'>[]
): Map<ParticipantId, Pick<Attendance, 'attendanceStatus'>> {
  const map = new Map<ParticipantId, Pick<Attendance, 'attendanceStatus'>>();
  for (const row of attendances) {
    if (row.subject.subjectKind !== 'booking') continue;
    map.set(row.subject.participantId, { attendanceStatus: row.attendanceStatus });
  }
  return map;
}

export function resolveParticipantBookingAttendance(input: {
  readonly participantId: ParticipantId;
  readonly servicePartyParticipantIds: readonly ParticipantId[];
  readonly attendancesByParticipantId: ReadonlyMap<
    ParticipantId,
    Pick<Attendance, 'attendanceStatus'>
  >;
}): ParticipantBookingAttendanceResolution {
  if (!input.servicePartyParticipantIds.includes(input.participantId)) {
    return { kind: 'not_in_service_party' };
  }
  const row = input.attendancesByParticipantId.get(input.participantId);
  if (!row) {
    return { kind: 'missing' };
  }
  if (row.attendanceStatus === 'present') {
    return { kind: 'present' };
  }
  if (row.attendanceStatus === 'absent') {
    return { kind: 'absent' };
  }
  return { kind: 'missing' };
}

/** Participant received completed training credit for this lesson occurrence. */
export function participantAttendedLesson(input: {
  readonly participantId: ParticipantId;
  readonly servicePartyParticipantIds: readonly ParticipantId[];
  readonly attendancesByParticipantId: ReadonlyMap<
    ParticipantId,
    Pick<Attendance, 'attendanceStatus'>
  >;
}): boolean {
  return resolveParticipantBookingAttendance(input).kind === 'present';
}

/** Participant-specific absence / no-show learning outcome (Attendance.absent only). */
export function participantWasAbsentFromLesson(input: {
  readonly participantId: ParticipantId;
  readonly servicePartyParticipantIds: readonly ParticipantId[];
  readonly attendancesByParticipantId: ReadonlyMap<
    ParticipantId,
    Pick<Attendance, 'attendanceStatus'>
  >;
}): boolean {
  return resolveParticipantBookingAttendance(input).kind === 'absent';
}

/** Learning hours credited to the participant (present only). */
export function participantLearningDurationHours(input: ParticipantLessonStatsInput): number {
  return participantAttendedLesson(input) ? input.lessonDurationHours : 0;
}

/** Business metric: instructor slot was consumed (delivered or whole-booking no_show). */
export function bookingOccupiesInstructorSlot(lifecycleStatus: BookingLifecycleStatus): boolean {
  return lifecycleStatus === 'completed' || lifecycleStatus === 'no_show';
}

/** Booking lifecycle marks the lesson service as completed (booking-level, not participant learning). */
export function bookingIsCompletedService(lifecycleStatus: BookingLifecycleStatus): boolean {
  return lifecycleStatus === 'completed';
}

export function bookingIsNoShowOutcome(lifecycleStatus: BookingLifecycleStatus): boolean {
  return lifecycleStatus === 'no_show';
}

/** Streak foundation: only participant Attendance.present qualifies (9B.4C/E for legacy paths). */
export function participantPresentQualifiesStreakWeek(input: {
  readonly participantId: ParticipantId;
  readonly servicePartyParticipantIds: readonly ParticipantId[];
  readonly attendancesByParticipantId: ReadonlyMap<
    ParticipantId,
    Pick<Attendance, 'attendanceStatus'>
  >;
}): boolean {
  return participantAttendedLesson(input);
}

export type ParticipantStreakWeekEvidence =
  | {
      readonly kind: 'participant_attendance_present';
      readonly participantId: ParticipantId;
      readonly servicePartyParticipantIds: readonly ParticipantId[];
      readonly attendancesByParticipantId: ReadonlyMap<
        ParticipantId,
        Pick<Attendance, 'attendanceStatus'>
      >;
    }
  | { readonly kind: 'legacy_booking_completed_activity_log' }
  | { readonly kind: 'legacy_booking_lifecycle_completed' };

/**
 * Canonical streak week evidence is participant Attendance.present only.
 * Legacy booking_completed logs and booking lifecycle completed are not sufficient alone.
 */
export function participantPresentQualifiesStreakWeekFromEvidence(
  evidence: ParticipantStreakWeekEvidence
): boolean {
  if (evidence.kind === 'participant_attendance_present') {
    return participantAttendedLesson(evidence);
  }
  return false;
}

/** Presentation/evidence only — not a new aggregate authority. */
export type ParticipantLessonStatsEvidence = {
  readonly bookingId: BookingId;
  readonly participantId: ParticipantId;
  readonly attendanceStatus: ParticipantBookingAttendanceResolution['kind'];
  readonly durationHours: number;
  readonly startsAt: CanonicalTimestamp;
  readonly timeZone: IanaTimeZone;
  readonly lifecycleStatus: BookingLifecycleStatus;
  readonly instructorId?: InstructorId;
  readonly servicePartyParticipantIds: readonly ParticipantId[];
};

export type ParticipantLessonStatsTotals = {
  readonly completedCount: number;
  readonly trainingHours: number;
  readonly absenceCount: number;
};

function attendancesByParticipantIdFromManagedProjection(
  rows: readonly LessonBookingManagedParticipantAttendance[] | undefined
): Map<ParticipantId, Pick<Attendance, 'attendanceStatus'>> {
  const map = new Map<ParticipantId, Pick<Attendance, 'attendanceStatus'>>();
  for (const row of rows ?? []) {
    if (row.attendanceStatus === 'present' || row.attendanceStatus === 'absent') {
      map.set(row.participantId, { attendanceStatus: row.attendanceStatus });
    }
  }
  return map;
}

/**
 * Build stats evidence for one managed participant from an account-facing read model.
 * Returns undefined when the participant is not in the frozen service party, or when
 * the Account projection omitted them (unmanaged / privacy-filtered).
 */
export function participantLessonStatsEvidenceFromAccountReadModel(
  readModel: LessonBookingReadModel,
  participantId: ParticipantId
): ParticipantLessonStatsEvidence | undefined {
  const servicePartyParticipantIds =
    readModel.serviceParticipantIds ?? readModel.participantIds;
  if (!servicePartyParticipantIds.includes(participantId)) {
    return undefined;
  }
  const managedRows = readModel.managedParticipantAttendance;
  if (!managedRows?.some((row) => row.participantId === participantId)) {
    return undefined;
  }
  const attendancesByParticipantId = attendancesByParticipantIdFromManagedProjection(managedRows);
  const resolution = resolveParticipantBookingAttendance({
    participantId,
    servicePartyParticipantIds,
    attendancesByParticipantId,
  });
  return {
    bookingId: readModel.bookingId,
    participantId,
    attendanceStatus: resolution.kind,
    durationHours: readModel.occurrence.durationMinutes / 60,
    startsAt: readModel.occurrence.startsAt,
    timeZone: readModel.occurrence.timeZone,
    lifecycleStatus: readModel.lifecycle.status,
    instructorId: readModel.instructor.instructorId,
    servicePartyParticipantIds,
  };
}

export function mergeLessonBookingReadModelsByRevision(
  items: readonly LessonBookingReadModel[]
): LessonBookingReadModel[] {
  const merged = new Map<LessonBookingReadModel['bookingId'], LessonBookingReadModel>();
  for (const item of items) {
    const cached = merged.get(item.bookingId);
    if (!cached || item.revision >= cached.revision) {
      merged.set(item.bookingId, item);
    }
  }
  return [...merged.values()];
}

export function evidenceListFromAccountReadModels(
  items: readonly LessonBookingReadModel[],
  participantId: ParticipantId
): ParticipantLessonStatsEvidence[] {
  const evidence: ParticipantLessonStatsEvidence[] = [];
  for (const item of mergeLessonBookingReadModelsByRevision(items)) {
    const row = participantLessonStatsEvidenceFromAccountReadModel(item, participantId);
    if (row) {
      evidence.push(row);
    }
  }
  return evidence;
}

function evidenceSelectorInput(row: ParticipantLessonStatsEvidence): ParticipantLessonStatsInput {
  const attendancesByParticipantId = new Map<
    ParticipantId,
    Pick<Attendance, 'attendanceStatus'>
  >();
  if (row.attendanceStatus === 'present' || row.attendanceStatus === 'absent') {
    attendancesByParticipantId.set(row.participantId, {
      attendanceStatus: row.attendanceStatus,
    });
  }
  return {
    participantId: row.participantId,
    servicePartyParticipantIds: row.servicePartyParticipantIds,
    attendancesByParticipantId,
    lessonDurationHours: row.durationHours,
  };
}

export function participantAttendedLessonFromEvidence(
  row: ParticipantLessonStatsEvidence
): boolean {
  return participantAttendedLesson(evidenceSelectorInput(row));
}

export function participantWasAbsentFromLessonFromEvidence(
  row: ParticipantLessonStatsEvidence
): boolean {
  return participantWasAbsentFromLesson(evidenceSelectorInput(row));
}

export function participantLearningDurationHoursFromEvidence(
  row: ParticipantLessonStatsEvidence
): number {
  return participantLearningDurationHours(evidenceSelectorInput(row));
}

function instantFromCanonicalTimestamp(startsAt: CanonicalTimestamp): Date {
  return new Date(startsAt.seconds * 1000 + startsAt.nanoseconds / 1_000_000);
}

/** Local calendar date (YYYY-MM-DD) of startsAt in the lesson time zone. */
export function lessonStartsAtLocalCalendarDate(
  startsAt: CanonicalTimestamp,
  timeZone: IanaTimeZone
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instantFromCanonicalTimestamp(startsAt));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/** Local calendar year of startsAt in the lesson time zone. */
export function lessonStartsAtLocalCalendarYear(
  startsAt: CanonicalTimestamp,
  timeZone: IanaTimeZone
): number {
  return Number(lessonStartsAtLocalCalendarDate(startsAt, timeZone).slice(0, 4));
}

export function participantLessonStatsEvidenceInCalendarYear(
  row: ParticipantLessonStatsEvidence,
  calendarYear: number
): boolean {
  return lessonStartsAtLocalCalendarYear(row.startsAt, row.timeZone) === calendarYear;
}

export function aggregateParticipantLessonStats(
  evidence: readonly ParticipantLessonStatsEvidence[],
  options: {
    readonly calendarYear?: number;
    readonly instructorId?: InstructorId;
  } = {}
): ParticipantLessonStatsTotals {
  let completedCount = 0;
  let trainingHours = 0;
  let absenceCount = 0;
  for (const row of evidence) {
    if (
      options.calendarYear !== undefined &&
      !participantLessonStatsEvidenceInCalendarYear(row, options.calendarYear)
    ) {
      continue;
    }
    if (options.instructorId !== undefined && row.instructorId !== options.instructorId) {
      continue;
    }
    const input = evidenceSelectorInput(row);
    if (participantAttendedLesson(input)) {
      completedCount += 1;
      trainingHours += participantLearningDurationHours(input);
    }
    if (participantWasAbsentFromLesson(input)) {
      absenceCount += 1;
    }
  }
  return { completedCount, trainingHours, absenceCount };
}

export function selectRecentParticipantAttendedEvidence(
  evidence: readonly ParticipantLessonStatsEvidence[],
  limit = 4
): ParticipantLessonStatsEvidence[] {
  return evidence
    .filter((row) => participantAttendedLessonFromEvidence(row))
    .sort((left, right) => {
      const bySeconds = right.startsAt.seconds - left.startsAt.seconds;
      if (bySeconds !== 0) return bySeconds;
      return right.startsAt.nanoseconds - left.startsAt.nanoseconds;
    })
    .slice(0, limit);
}

export function selectLatestParticipantAttendedEvidenceForInstructor(
  evidence: readonly ParticipantLessonStatsEvidence[],
  instructorId: InstructorId
): ParticipantLessonStatsEvidence | undefined {
  return selectRecentParticipantAttendedEvidence(
    evidence.filter((row) => row.instructorId === instructorId),
    1
  )[0];
}
