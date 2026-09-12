import type { BookingStatus } from '../../types';
import { BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS } from '@ski-academy/shared-domain';

export type InstructorLessonAttendanceRow = {
  readonly participantId: string;
  readonly attendanceStatus?: 'present' | 'absent';
};

export type InstructorLessonAttendanceFollowUp =
  | 'none'
  | 'missing_in_window'
  | 'overdue_admin_required';

export function instructorLessonMissingAttendanceParticipantIds(
  attendance: readonly InstructorLessonAttendanceRow[] | undefined
): readonly string[] {
  return (attendance ?? [])
    .filter((row) => row.attendanceStatus !== 'present' && row.attendanceStatus !== 'absent')
    .map((row) => row.participantId);
}

export function instructorLessonAttendanceFollowUp(input: {
  readonly status: BookingStatus;
  readonly startsAtEpochMs: number;
  readonly endsAtEpochMs: number;
  readonly attendance: readonly InstructorLessonAttendanceRow[] | undefined;
  readonly nowMs?: number;
}): InstructorLessonAttendanceFollowUp {
  if (input.status !== 'confirmed' && input.status !== 'completed' && input.status !== 'no_show') {
    return 'none';
  }
  if (instructorLessonMissingAttendanceParticipantIds(input.attendance).length === 0) {
    return 'none';
  }
  const nowMs = input.nowMs ?? Date.now();
  if (nowMs >= input.endsAtEpochMs + BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS) {
    return 'overdue_admin_required';
  }
  if (nowMs < input.startsAtEpochMs) {
    return 'none';
  }
  return 'missing_in_window';
}

export function instructorLessonAttendanceIsOverdue(input: {
  readonly status: BookingStatus;
  readonly endsAtEpochMs: number;
  readonly attendance: readonly InstructorLessonAttendanceRow[] | undefined;
  readonly nowMs?: number;
}): boolean {
  return (
    instructorLessonAttendanceFollowUp({
      ...input,
      startsAtEpochMs: Number.NEGATIVE_INFINITY,
    }) === 'overdue_admin_required'
  );
}

export function instructorAttendanceAttentionAction(
  followUp: InstructorLessonAttendanceFollowUp
): 'record' | 'admin_required' | 'none' {
  if (followUp === 'missing_in_window') return 'record';
  if (followUp === 'overdue_admin_required') return 'admin_required';
  return 'none';
}
