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
  const projectionKey = `${detail.bookingId}:${detail.revision}:${detail.lifecycle.status}:${serverSeedKey}`;
  const draftProjectionRef = useRef(projectionKey);
  const stale = dirtyRef.current && draftProjectionRef.current !== projectionKey;
  const bookingIdRef = useRef(detail.bookingId);

  useEffect(() => {
    if (bookingIdRef.current !== detail.bookingId) {
      bookingIdRef.current = detail.bookingId;
      draftProjectionRef.current = projectionKey;
      dirtyRef.current = false;
      setDraft(draftFromServerAttendance(admin, targetParticipantIds));
      return;
    }
    if (dirtyRef.current) return;
    draftProjectionRef.current = projectionKey;
    setDraft(draftFromServerAttendance(admin, targetParticipantIds));
  }, [admin, detail.bookingId, serverSeedKey, targetParticipantIds, projectionKey]);

  const setParticipantStatus = useCallback(
    (participantId: ParticipantId, status: AdminLessonAttendanceDraftStatus) => {
      const seed =
        draftProjectionRef.current !== projectionKey
          ? draftFromServerAttendance(admin, targetParticipantIds)
          : undefined;
      draftProjectionRef.current = projectionKey;
      dirtyRef.current = true;
      setDraft((current) => ({ ...(seed ?? current), [participantId]: status }));
    },
    [admin, targetParticipantIds, projectionKey]
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
    draftProjectionRef.current = projectionKey;
    setDraft(draftFromServerAttendance(admin, targetParticipantIds));
  }, [admin, targetParticipantIds, projectionKey]);

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
    stale,
    projectionKey,
    draft,
    setParticipantStatus,
    allTargetParticipantsDrafted,
    clearDraftAfterSuccess,
    presentCount,
    absentCount,
  };
}
