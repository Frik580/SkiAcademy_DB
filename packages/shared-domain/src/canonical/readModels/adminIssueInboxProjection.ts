import type { Participant } from '../accountParticipantAccess';
import type { Booking } from '../bookingOccurrenceProposalChange';
import type {
  AdminIssue,
  Course,
  CourseDay,
  CourseEnrollment,
} from '../courseEnrollmentAttendanceAdminIssue';
import type { CanonicalTimestamp, IanaTimeZone } from '../primitives';
import type { AdminIssueInboxItem } from './adminIssueReadModel';

export const ADMIN_ISSUE_GUEST_PRESENTATION_ORIGIN = 'guest' as const;
export const ADMIN_ISSUE_GUEST_RECONCILIATION_SCOPE = 'guest_confirmation_lifecycle' as const;
export const ADMIN_ISSUE_INBOX_ENRICHMENT_GETALL_WAVES = 2;
export const ADMIN_ISSUE_INBOX_GETALL_CHUNK_SIZE = 100;

export type AdminIssueInboxPresentation = Pick<
  AdminIssueInboxItem,
  | 'subjectDisplayName'
  | 'lessonStartsAt'
  | 'lessonEndsAt'
  | 'lessonTimeZone'
  | 'courseTitle'
  | 'presentationOrigin'
>;

function isGuestOrigin(input: {
  readonly reconciliationScope?: string;
  readonly bookingOrigin?: string;
  readonly enrollmentOrigin?: string;
}): boolean {
  return (
    input.reconciliationScope === ADMIN_ISSUE_GUEST_RECONCILIATION_SCOPE ||
    input.bookingOrigin === 'guest' ||
    input.enrollmentOrigin === 'guest'
  );
}

function joinDisplayNames(names: readonly string[]): string | undefined {
  const joined = names
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .join(', ');
  if (!joined) return undefined;
  return joined.length <= 400 ? joined : joined.slice(0, 400).trim();
}

export function participantIdsForInboxPresentation(input: {
  readonly issue: Pick<AdminIssue, 'participantId'>;
  readonly booking?: Pick<Booking, 'party'>;
  readonly enrollment?: Pick<CourseEnrollment, 'participantId'>;
}): string[] {
  if (input.issue.participantId) return [input.issue.participantId];
  if (input.enrollment?.participantId) return [input.enrollment.participantId];
  return [...(input.booking?.party.participantIds ?? [])];
}

export function collectAdminIssueInboxSubjectIds(
  issues: readonly Pick<AdminIssue, 'subjectRef' | 'participantId'>[]
): {
  readonly bookingIds: readonly string[];
  readonly enrollmentIds: readonly string[];
  readonly participantIds: readonly string[];
} {
  const bookingIds = new Set<string>();
  const enrollmentIds = new Set<string>();
  const participantIds = new Set<string>();
  for (const issue of issues) {
    if (issue.participantId) participantIds.add(issue.participantId);
    if (issue.subjectRef.subjectKind === 'booking') {
      bookingIds.add(issue.subjectRef.bookingId);
    } else {
      enrollmentIds.add(issue.subjectRef.enrollmentId);
    }
  }
  return {
    bookingIds: [...bookingIds],
    enrollmentIds: [...enrollmentIds],
    participantIds: [...participantIds],
  };
}

export function collectAdminIssueInboxFollowOnIds(input: {
  readonly issues: readonly Pick<AdminIssue, 'participantId' | 'courseDayId' | 'subjectRef'>[];
  readonly bookings: ReadonlyMap<string, Pick<Booking, 'party'>>;
  readonly enrollments: ReadonlyMap<string, Pick<CourseEnrollment, 'participantId' | 'courseId'>>;
}): {
  readonly participantIds: readonly string[];
  readonly courseIds: readonly string[];
  readonly courseDays: readonly { readonly courseId: string; readonly courseDayId: string }[];
} {
  const participantIds = new Set<string>();
  const courseIds = new Set<string>();
  const courseDays: { readonly courseId: string; readonly courseDayId: string }[] = [];
  const courseDayKeys = new Set<string>();

  for (const issue of input.issues) {
    if (issue.participantId) participantIds.add(issue.participantId);
    if (issue.subjectRef.subjectKind === 'booking') {
      const booking = input.bookings.get(issue.subjectRef.bookingId);
      for (const participantId of booking?.party.participantIds ?? []) {
        participantIds.add(participantId);
      }
      continue;
    }
    const enrollment = input.enrollments.get(issue.subjectRef.enrollmentId);
    if (!enrollment) continue;
    participantIds.add(enrollment.participantId);
    courseIds.add(enrollment.courseId);
    if (issue.courseDayId) {
      const key = `${enrollment.courseId}/${issue.courseDayId}`;
      if (!courseDayKeys.has(key)) {
        courseDayKeys.add(key);
        courseDays.push({ courseId: enrollment.courseId, courseDayId: issue.courseDayId });
      }
    }
  }

  return {
    participantIds: [...participantIds],
    courseIds: [...courseIds],
    courseDays,
  };
}

export function adminIssueInboxEnrichmentWaveCount(issueCount: number): 0 | 2 {
  return issueCount === 0 ? 0 : ADMIN_ISSUE_INBOX_ENRICHMENT_GETALL_WAVES;
}

export function projectAdminIssueInboxPresentation(input: {
  readonly issue: Pick<AdminIssue, 'participantId' | 'reconciliationScope' | 'subjectRef'>;
  readonly booking?: Pick<Booking, 'attribution' | 'occurrence' | 'party'>;
  readonly enrollment?: Pick<CourseEnrollment, 'participantId' | 'attribution'>;
  readonly course?: Pick<Course, 'title' | 'startAt'>;
  readonly courseDay?: Pick<CourseDay, 'interval' | 'timeZone'>;
  readonly participants: ReadonlyMap<string, Pick<Participant, 'displayName'>>;
}): AdminIssueInboxPresentation {
  const participantIds = participantIdsForInboxPresentation(input);
  const subjectDisplayName = joinDisplayNames(
    participantIds.flatMap((participantId) => {
      const name = input.participants.get(participantId)?.displayName;
      return name ? [name] : [];
    })
  );
  const presentationOrigin = isGuestOrigin({
    reconciliationScope: input.issue.reconciliationScope,
    bookingOrigin: input.booking?.attribution.bookingOrigin,
    enrollmentOrigin: input.enrollment?.attribution.bookingOrigin,
  })
    ? ADMIN_ISSUE_GUEST_PRESENTATION_ORIGIN
    : undefined;

  let lessonStartsAt: CanonicalTimestamp | undefined;
  let lessonEndsAt: CanonicalTimestamp | undefined;
  let lessonTimeZone: IanaTimeZone | undefined;
  if (input.booking) {
    lessonStartsAt = input.booking.occurrence.interval.startsAt;
    lessonEndsAt = input.booking.occurrence.interval.endsAt;
    lessonTimeZone = input.booking.occurrence.timeZone;
  } else if (input.courseDay) {
    lessonStartsAt = input.courseDay.interval.startsAt;
    lessonEndsAt = input.courseDay.interval.endsAt;
    lessonTimeZone = input.courseDay.timeZone;
  } else if (input.course) {
    lessonStartsAt = input.course.startAt;
  }

  const courseTitle =
    input.issue.subjectRef.subjectKind === 'course_enrollment' ? input.course?.title : undefined;

  return {
    ...(subjectDisplayName === undefined ? {} : { subjectDisplayName }),
    ...(lessonStartsAt === undefined ? {} : { lessonStartsAt }),
    ...(lessonEndsAt === undefined ? {} : { lessonEndsAt }),
    ...(lessonTimeZone === undefined ? {} : { lessonTimeZone }),
    ...(courseTitle === undefined ? {} : { courseTitle }),
    ...(presentationOrigin === undefined ? {} : { presentationOrigin }),
  };
}
