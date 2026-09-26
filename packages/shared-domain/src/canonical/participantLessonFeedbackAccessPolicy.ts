import type { Booking } from './bookingOccurrenceProposalChange';
import type { AttendanceStatus } from './courseEnrollmentAttendanceAdminIssue';
import type { InstructorId, ParticipantId } from './identifiers';
import { bookingProvidesInstructorProgressEvidence } from './participantProgressAccessPolicy';
import type { CanonicalTimestamp } from './primitives';

export type InstructorLessonFeedbackAttendanceFact = AttendanceStatus | undefined;

/**
 * Per-lesson feedback still requires factual present Attendance. Active
 * InstructorRelationship does not bypass this lesson-specific gate.
 */
export function bookingProvidesInstructorLessonFeedbackEvidence(input: {
  readonly booking: Booking;
  readonly instructorId: InstructorId;
  readonly participantId: ParticipantId;
  readonly at: CanonicalTimestamp;
  readonly attendanceStatus?: InstructorLessonFeedbackAttendanceFact;
}): boolean {
  return input.attendanceStatus === 'present' && bookingProvidesInstructorProgressEvidence(input);
}
