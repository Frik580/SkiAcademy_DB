import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import type { AdminLessonAttendanceDraft } from './useAdminLessonAttendanceDraft';
import type { AdminLessonBookingMutationDraft } from './lessonBookingAdminContracts';

export function buildAdminLessonAttendanceAttempt(
  detail: LessonBookingReadModel,
  draft: AdminLessonAttendanceDraft,
  reason: string
): AdminLessonBookingMutationDraft | undefined {
  const admin = detail.admin;
  if (!admin || !reason.trim()) return;
  const ids = detail.serviceParticipantIds ?? detail.participantIds;
  if (!ids.length) return;
  const attendance = ids.map((participantId) => {
    const record = admin.attendance?.find((entry) => entry.participantId === participantId);
    return { participantId, record, status: draft[participantId] };
  });
  const changed = attendance.filter(({ record, status }) => status !== record?.attendanceStatus);
  if (!changed.length) return;
  const terminal = detail.lifecycle.status === 'completed' || detail.lifecycle.status === 'no_show';
  if (terminal) {
    if (detail.partyKind !== 'individual' || ids.length !== 1 || changed.length !== 1) return;
    const { participantId, record, status } = changed[0];
    if (
      !record ||
      record.revision === undefined ||
      record.attendanceStatus !==
        (detail.lifecycle.status === 'completed' ? 'present' : 'absent') ||
      (status !== 'present' && status !== 'absent') ||
      !record.authorizedActions[status === 'present' ? 'canRecordPresent' : 'canRecordAbsent']
    )
      return;
    return {
      kind: 'record_booking_attendance',
      participantId,
      attendanceStatus: status,
      expectedAttendanceRevision: record.revision,
      reasonExplanation: reason.trim(),
    };
  }
  if (
    (detail.lifecycle.status !== 'confirmed' &&
      detail.lifecycle.status !== 'pending_cancellation') ||
    !admin.authorizedActions.canFinalizeAttendance ||
    attendance.some(({ status }) => status !== 'present' && status !== 'absent')
  )
    return;
  return {
    kind: 'finalize_booking_attendance',
    reasonExplanation: reason.trim(),
    attendance: attendance.map(({ participantId, record, status }) => ({
      participantId,
      attendanceStatus: status as 'present' | 'absent',
      ...(record?.revision === undefined ? {} : { expectedAttendanceRevision: record.revision }),
    })),
  };
}
