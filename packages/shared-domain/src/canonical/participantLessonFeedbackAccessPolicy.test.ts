import { describe, expect, it } from 'vitest';
import { canonicalBookingCollaborationFixtures } from '../testing/bookingOccurrenceProposalChange';
import { bookingProvidesInstructorLessonFeedbackEvidence } from './participantLessonFeedbackAccessPolicy';
import { timestampFromDate } from './primitives';

const family = canonicalBookingCollaborationFixtures.familyGroupBooking;
const instructorId = family.occurrence.instructorId;
const participantPresent = family.party.participantIds[0]!;
const participantSibling = family.party.participantIds[1]!;
const duringLesson = timestampFromDate(new Date('2026-01-15T04:30:00.000Z'));

describe('instructor lesson feedback booking-scoped evidence', () => {
  it('requires present attendance for the target participant only', () => {
    const completedFamily = {
      ...family,
      lifecycle: { status: 'completed' as const, completedAt: family.createdAt },
    };
    expect(
      bookingProvidesInstructorLessonFeedbackEvidence({
        booking: completedFamily,
        instructorId,
        participantId: participantPresent,
        at: duringLesson,
        attendanceStatus: 'present',
      })
    ).toBe(true);
    expect(
      bookingProvidesInstructorLessonFeedbackEvidence({
        booking: completedFamily,
        instructorId,
        participantId: participantSibling,
        at: duringLesson,
        attendanceStatus: 'present',
      })
    ).toBe(true);
    expect(
      bookingProvidesInstructorLessonFeedbackEvidence({
        booking: completedFamily,
        instructorId,
        participantId: participantSibling,
        at: duringLesson,
      })
    ).toBe(false);
  });

  it('K. overdue/missing Attendance does not grant review or feedback eligibility', () => {
    const completedFamily = {
      ...family,
      lifecycle: { status: 'completed' as const, completedAt: family.createdAt },
    };
    expect(
      bookingProvidesInstructorLessonFeedbackEvidence({
        booking: completedFamily,
        instructorId,
        participantId: participantPresent,
        at: duringLesson,
      })
    ).toBe(false);
    expect(
      bookingProvidesInstructorLessonFeedbackEvidence({
        booking: completedFamily,
        instructorId,
        participantId: participantPresent,
        at: duringLesson,
        attendanceStatus: 'absent',
      })
    ).toBe(false);
  });
});
