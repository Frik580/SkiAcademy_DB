import type {
  LessonBookingAdminProjection,
  LessonBookingReadModel,
  ParticipantId,
} from '@ski-academy/shared-domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AdminLessonAttendanceDraftStatus = 'present' | 'absent';

export type AdminLessonAttendanceDraft = Partial<
  Record<ParticipantId, AdminLessonAttendanceDraftStatus>
>;

function resolveTargetParticipantIds(detail: LessonBookingReadModel): readonly ParticipantId[] {
  return detail.serviceParticipantIds ?? detail.participantIds;
}

function draftFromServerAttendance(
  admin: LessonBookingAdminProjection,
  targetParticipantIds: readonly ParticipantId[]
): AdminLessonAttendanceDraft {
  const draft: AdminLessonAttendanceDraft = {};
  for (const participantId of targetParticipantIds) {
    const record = (admin.attendance ?? []).find(
      (candidate) => candidate.participantId === participantId
    );
    if (record?.attendanceStatus === 'present' || record?.attendanceStatus === 'absent') {
      draft[participantId] = record.attendanceStatus;
    }
  }
  return draft;
}

function serverAttendanceSeedKey(
  admin: LessonBookingAdminProjection,
  targetParticipantIds: readonly ParticipantId[]
): string {
  return targetParticipantIds
    .map((participantId) => {
      const record = (admin.attendance ?? []).find(
        (candidate) => candidate.participantId === participantId
      );
      return [participantId, record?.attendanceStatus ?? '', record?.revision ?? ''].join(':');
    })
    .join('|');
}

export function useAdminLessonAttendanceDraft(input: {
  readonly detail: LessonBookingReadModel;
  readonly admin: LessonBookingAdminProjection;
}) {
  const { detail, admin } = input;
  const targetParticipantIds = useMemo(
    () => resolveTargetParticipantIds(detail),
    [detail.bookingId, detail.participantIds, detail.serviceParticipantIds]
  );
  const serverSeedKey = useMemo(
    () => serverAttendanceSeedKey(admin, targetParticipantIds),
    [admin.attendance, targetParticipantIds]
  );

  const [draft, setDraft] = useState<AdminLessonAttendanceDraft>(() =>
    draftFromServerAttendance(admin, targetParticipantIds)
  );
  const dirtyRef = useRef(false);
  const bookingIdRef = useRef(detail.bookingId);

  useEffect(() => {
    if (bookingIdRef.current !== detail.bookingId) {
      bookingIdRef.current = detail.bookingId;
      dirtyRef.current = false;
      setDraft(draftFromServerAttendance(admin, targetParticipantIds));
      return;
    }
    if (dirtyRef.current) return;
    setDraft(draftFromServerAttendance(admin, targetParticipantIds));
  }, [admin, detail.bookingId, serverSeedKey, targetParticipantIds]);

  const setParticipantStatus = useCallback(
    (participantId: ParticipantId, status: AdminLessonAttendanceDraftStatus) => {
      dirtyRef.current = true;
      setDraft((current) => ({ ...current, [participantId]: status }));
    },
    []
  );

  const allTargetParticipantsDrafted = useMemo(
    () =>
      targetParticipantIds.every((participantId) => {
        const status = draft[participantId];
        return status === 'present' || status === 'absent';
      }),
    [draft, targetParticipantIds]
  );

  const clearDraftAfterSuccess = useCallback(() => {
    dirtyRef.current = false;
    setDraft(draftFromServerAttendance(admin, targetParticipantIds));
  }, [admin, targetParticipantIds]);

  const presentCount = useMemo(
    () => targetParticipantIds.filter((participantId) => draft[participantId] === 'present').length,
    [draft, targetParticipantIds]
  );
  const absentCount = useMemo(
    () => targetParticipantIds.filter((participantId) => draft[participantId] === 'absent').length,
    [draft, targetParticipantIds]
  );

  return {
    targetParticipantIds,
    draft,
    setParticipantStatus,
    allTargetParticipantsDrafted,
    clearDraftAfterSuccess,
    presentCount,
    absentCount,
  };
}
