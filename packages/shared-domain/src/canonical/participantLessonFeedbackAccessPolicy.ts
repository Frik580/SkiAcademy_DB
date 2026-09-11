import type { Booking } from './bookingOccurrenceProposalChange';
import type { AttendanceStatus } from './courseEnrollmentAttendanceAdminIssue';
import type { InstructorId, ParticipantId } from './identifiers';
import { bookingProvidesInstructorProgressEvidence } from './participantProgressAccessPolicy';
import type { CanonicalTimestamp } from './primitives';

export type InstructorLessonFeedbackAttendanceFact = AttendanceStatus | undefined;

/**
 * Per-lesson feedback write authority follows the same booking attendance gate as
 * lesson-context progress assessment. Active InstructorRelationship does **not**
 * bypass this gate (unlike global participant progress).
 */
export function bookingProvidesInstructorLessonFeedbackEvidence(input: {
  readonly booking: Booking;
  readonly instructorId: InstructorId;
  readonly participantId: ParticipantId;
  readonly at: CanonicalTimestamp;
  readonly attendanceStatus?: InstructorLessonFeedbackAttendanceFact;
}): boolean {
  return bookingProvidesInstructorProgressEvidence(input);
}
