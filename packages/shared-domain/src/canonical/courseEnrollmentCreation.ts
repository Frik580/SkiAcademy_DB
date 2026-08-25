import type { Course, CourseDay } from './courseEnrollmentAttendanceAdminIssue';
import {
  addMillisecondsToCanonicalTimestamp,
  minCanonicalTimestamp,
} from './guestBooking';
import type { CommandId, CourseEnrollmentId, OccurrenceId, ParticipantId } from './identifiers';
import {
  courseEnrollmentIdFromCommandParticipant,
  initialCourseDayOccurrenceId,
} from './deterministicIdentity';
import {
  ResourceClaimIdentityInputSchema,
  RESOURCE_CLAIM_STRATEGY_VERSION,
  resourceClaimIdFromIdentity,
} from './resourceClaims';
import {
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
  type TimeInterval,
} from './primitives';

/** Maximum guest Course enrollment reservation hold before course start. */
export const GUEST_COURSE_RESERVATION_TTL_MS = 24 * 60 * 60 * 1_000;

export function resolveGuestCourseReservationExpiresAt(input: {
  readonly createdAt: CanonicalTimestamp;
  readonly courseStartsAt: CanonicalTimestamp;
}): CanonicalTimestamp {
  const ttlExpiresAt = addMillisecondsToCanonicalTimestamp(
    input.createdAt,
    GUEST_COURSE_RESERVATION_TTL_MS
  );
  return minCanonicalTimestamp(ttlExpiresAt, input.courseStartsAt);
}

export function isCourseEnrollmentAllowedBeforeStart(input: {
  readonly now: CanonicalTimestamp;
  readonly courseStartsAt: CanonicalTimestamp;
}): boolean {
  return compareCanonicalTimestamps(input.now, input.courseStartsAt) < 0;
}

export function assertUniqueEnrollmentParticipantIds(
  participantIds: readonly ParticipantId[]
): void {
  const seen = new Set<string>();
  for (const participantId of participantIds) {
    const key = participantId as string;
    if (seen.has(key)) {
      throw new Error('Duplicate participantIds in enrollment command');
    }
    seen.add(key);
  }
}

export function resolveEnrollmentIdsForCommand(input: {
  readonly commandId: CommandId;
  readonly participantIds: readonly ParticipantId[];
}): readonly CourseEnrollmentId[] {
  return input.participantIds.map((participantId) =>
    courseEnrollmentIdFromCommandParticipant({ commandId: input.commandId, participantId })
  );
}

export function courseSeatClaimInterval(input: {
  readonly decidedAt: CanonicalTimestamp;
  readonly course: Course;
}): TimeInterval {
  return {
    startsAt: input.decidedAt,
    endsAt: input.course.scheduleProjection.finalCourseDayEndsAt,
  };
}

export function buildCourseSeatClaimIdentity(input: {
  readonly courseId: Course['courseId'];
  readonly enrollmentId: CourseEnrollmentId;
  readonly occurrenceId: OccurrenceId;
}) {
  const identity = ResourceClaimIdentityInputSchema.parse({
    strategyVersion: RESOURCE_CLAIM_STRATEGY_VERSION,
    claimKind: 'course_seat_pre_start',
    resourceKind: 'course',
    resourceId: input.courseId,
    ownerKind: 'course_enrollment',
    ownerId: input.enrollmentId,
    occurrenceId: input.occurrenceId,
  });
  return {
    identity,
    claimId: resourceClaimIdFromIdentity(identity),
  };
}

export function buildParticipantCourseDayEnrollmentClaimIdentity(input: {
  readonly participantId: ParticipantId;
  readonly enrollmentId: CourseEnrollmentId;
  readonly courseDay: CourseDay;
}) {
  const occurrenceId = initialCourseDayOccurrenceId(input.courseDay.courseDayId);
  const identity = ResourceClaimIdentityInputSchema.parse({
    strategyVersion: RESOURCE_CLAIM_STRATEGY_VERSION,
    claimKind: 'participant_course_day_enrollment',
    resourceKind: 'participant',
    resourceId: input.participantId,
    ownerKind: 'course_enrollment',
    ownerId: input.enrollmentId,
    occurrenceId,
  });
  return {
    identity,
    claimId: resourceClaimIdFromIdentity(identity),
    occurrenceId,
  };
}

export function sortedCourseDays(courseDays: readonly CourseDay[]): CourseDay[] {
  return [...courseDays].sort((left, right) => left.dayOrder - right.dayOrder);
}

export function courseScheduleIsComplete(
  course: Course,
  courseDays: readonly CourseDay[]
): boolean {
  if (courseDays.length === 0) {
    return false;
  }
  if (course.scheduleProjection.courseDayCount !== courseDays.length) {
    return false;
  }
  return courseDays.every((courseDay) => courseDay.courseId === course.courseId);
}
