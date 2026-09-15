import { describe, expect, it } from 'vitest';
import { canonicalBookingCollaborationFixtures } from '../../testing/bookingOccurrenceProposalChange';
import { canonicalCourseDeliveryFixtures } from '../../testing/courseEnrollmentAttendanceAdminIssue';
import {
  adminIssueInboxEnrichmentWaveCount,
  collectAdminIssueInboxFollowOnIds,
  collectAdminIssueInboxSubjectIds,
  projectAdminIssueInboxPresentation,
} from './adminIssueInboxProjection';

const participantName = 'Maya Snow';

describe('admin issue inbox presentation projection', () => {
  it('projects participant name, course title, and course-day time from existing read-model data', () => {
    const issue = canonicalCourseDeliveryFixtures.openAdminIssue;
    const enrollment = canonicalCourseDeliveryFixtures.confirmedEnrollment;
    const course = canonicalCourseDeliveryFixtures.course;
    const courseDay = canonicalCourseDeliveryFixtures.courseDays[1];

    expect(
      projectAdminIssueInboxPresentation({
        issue,
        enrollment,
        course,
        courseDay,
        participants: new Map([[enrollment.participantId, { displayName: participantName }]]),
      })
    ).toEqual({
      subjectDisplayName: participantName,
      lessonStartsAt: courseDay.interval.startsAt,
      lessonEndsAt: courseDay.interval.endsAt,
      lessonTimeZone: courseDay.timeZone,
      courseTitle: course.title,
    });
  });

  it('projects booking lesson time and omits invented fields when related docs are missing', () => {
    const booking = canonicalBookingCollaborationFixtures.individualBooking;
    const issue = {
      participantId: booking.party.participantIds[0],
      subjectRef: { subjectKind: 'booking' as const, bookingId: booking.bookingId },
    };

    expect(
      projectAdminIssueInboxPresentation({
        issue,
        booking,
        participants: new Map([
          [booking.party.participantIds[0]!, { displayName: participantName }],
        ]),
      })
    ).toEqual({
      subjectDisplayName: participantName,
      lessonStartsAt: booking.occurrence.interval.startsAt,
      lessonEndsAt: booking.occurrence.interval.endsAt,
      lessonTimeZone: booking.occurrence.timeZone,
    });

    expect(
      projectAdminIssueInboxPresentation({
        issue: canonicalCourseDeliveryFixtures.openAdminIssue,
        participants: new Map(),
      })
    ).toEqual({});
  });

  it('marks guest presentation only from existing reconciliation or booking origin', () => {
    const enrollment = canonicalCourseDeliveryFixtures.guestPendingEnrollment;
    expect(
      projectAdminIssueInboxPresentation({
        issue: {
          participantId: enrollment.participantId,
          reconciliationScope: 'guest_confirmation_lifecycle',
          subjectRef: { subjectKind: 'course_enrollment', enrollmentId: enrollment.enrollmentId },
        },
        participants: new Map(),
      }).presentationOrigin
    ).toBe('guest');

    expect(
      projectAdminIssueInboxPresentation({
        issue: {
          participantId: enrollment.participantId,
          subjectRef: { subjectKind: 'course_enrollment', enrollmentId: enrollment.enrollmentId },
        },
        enrollment,
        participants: new Map(),
      }).presentationOrigin
    ).toBe('guest');

    expect(
      projectAdminIssueInboxPresentation({
        issue: canonicalCourseDeliveryFixtures.openAdminIssue,
        enrollment: canonicalCourseDeliveryFixtures.confirmedEnrollment,
        participants: new Map(),
      }).presentationOrigin
    ).toBeUndefined();
  });

  it('plans two bounded getAll waves for a page and unique subject ids', () => {
    const issue = canonicalCourseDeliveryFixtures.openAdminIssue;
    const duplicates = [issue, issue, { ...issue, issueId: `${issue.issueId}_dup` }];
    expect(adminIssueInboxEnrichmentWaveCount(0)).toBe(0);
    expect(adminIssueInboxEnrichmentWaveCount(duplicates.length)).toBe(2);
    expect(collectAdminIssueInboxSubjectIds(duplicates)).toEqual({
      bookingIds: [],
      enrollmentIds: [issue.subjectRef.subjectKind === 'course_enrollment' ? issue.subjectRef.enrollmentId : ''],
      participantIds: [issue.participantId],
    });

    const followOn = collectAdminIssueInboxFollowOnIds({
      issues: duplicates,
      bookings: new Map(),
      enrollments: new Map([
        [
          canonicalCourseDeliveryFixtures.confirmedEnrollment.enrollmentId,
          canonicalCourseDeliveryFixtures.confirmedEnrollment,
        ],
      ]),
    });
    expect(followOn.courseIds).toEqual([canonicalCourseDeliveryFixtures.course.courseId]);
    expect(followOn.courseDays).toEqual([
      {
        courseId: canonicalCourseDeliveryFixtures.course.courseId,
        courseDayId: issue.courseDayId,
      },
    ]);
  });
});
