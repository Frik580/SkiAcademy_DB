import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import type { AdminLessonBookingMutationDraft } from '../lesson-bookings/lessonBookingAdminContracts';
import type { TranslationKey } from '../../../lib/i18n/translations';

export const BULK_ATTENDANCE_REASON =
  'Массовая отметка присутствия администратором из Центра внимания';

export interface AdminIssueAttendanceParticipantInput {
  readonly id: string;
  readonly displayName: string;
  readonly status: 'present' | 'absent' | undefined;
}

export interface AdminIssueAttendanceInput {
  readonly lessonTime: string;
  readonly participants: readonly AdminIssueAttendanceParticipantInput[];
  readonly missingCount: number;
  readonly unavailableReason?: TranslationKey;
}

export function prepareAdminIssueAttendance(
  model: LessonBookingReadModel,
  locale: string
): {
  readonly panel: AdminIssueAttendanceInput;
  readonly draft?: Extract<
    AdminLessonBookingMutationDraft,
    { kind: 'finalize_booking_attendance' }
  >;
} {
  const ids = model.serviceParticipantIds ?? model.participantIds;
  const admin = model.admin;
  const participants = ids.map((id) => ({
    id,
    displayName:
      admin?.participants.find((person) => person.participantId === id)?.displayName ?? id,
    status: admin?.attendance.find((record) => record.participantId === id)?.attendanceStatus,
  }));
  const missingCount = participants.filter((person) => person.status === undefined).length;
  const sameSet = (values: readonly string[]) =>
    values.length === ids.length &&
    new Set(values).size === ids.length &&
    values.every((id) => ids.includes(id as (typeof ids)[number]));
  const consistent = Boolean(
    admin &&
    ids.length > 0 &&
    new Set(ids).size === ids.length &&
    sameSet(admin.serviceParticipantIds) &&
    sameSet(admin.attendance.map((record) => record.participantId)) &&
    ids.every((id) => admin.participants.some((person) => person.participantId === id)) &&
    admin.attendance.every((record) =>
      record.attendanceStatus === undefined
        ? record.revision === undefined
        : record.revision !== undefined
    )
  );
  const allowed = Boolean(
    consistent &&
    admin?.authorizedActions.canFinalizeAttendance &&
    (model.lifecycle.status === 'confirmed' || model.lifecycle.status === 'pending_cancellation') &&
    admin.attendance.every(
      (record) => record.attendanceStatus !== undefined || record.authorizedActions.canRecordPresent
    )
  );
  const unavailableReason = !consistent
    ? 'adminIssueAttendanceInconsistent'
    : !allowed
      ? 'adminIssueAttendanceUnavailable'
      : missingCount === 0
        ? 'adminIssueAttendanceComplete'
        : undefined;
  return {
    panel: {
      lessonTime: new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: model.occurrence.timeZone,
      }).format(new Date(model.occurrence.startsAt.seconds * 1_000)),
      participants,
      missingCount,
      ...(unavailableReason ? { unavailableReason } : {}),
    },
    ...(!unavailableReason && admin
      ? {
          draft: {
            kind: 'finalize_booking_attendance' as const,
            reasonExplanation: BULK_ATTENDANCE_REASON,
            attendance: ids.map((participantId) => {
              const record = admin.attendance.find(
                (entry) => entry.participantId === participantId
              )!;
              return {
                participantId,
                attendanceStatus: record.attendanceStatus ?? 'present',
                ...(record.revision === undefined
                  ? {}
                  : { expectedAttendanceRevision: record.revision }),
              };
            }),
          },
        }
      : {}),
  };
}
