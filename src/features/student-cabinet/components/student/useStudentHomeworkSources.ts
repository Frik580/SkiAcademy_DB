import { useEffect, useMemo, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { db, doc, getDoc } from '../../../../infrastructure/firebase';
import { useAuthStore } from '../../../auth/authStore';
import type { CabinetSessionItem } from '../../../course-enrollments';
import type { InstructorHomeworkSourceInput } from '../../../instructor-workspace/instructorLessonContextContracts';
import type { LessonBookingCabinetItem } from '../../../lesson-bookings/lessonBookingContracts';
import { getStudentHomeworkSources } from './studentHomeworkSources';

export function getLegacyHomeworkCandidates(
  sessions: readonly CabinetSessionItem[],
  participantId: string | undefined
) {
  return [
    ...new Map(
      sessions.flatMap((entry) =>
        entry.kind === 'course_day' &&
        participantId &&
        entry.participantId === participantId &&
        entry.lifecycleStatus !== 'cancelled' &&
        entry.enrollmentId !== entry.courseId
          ? [
              [
                entry.enrollmentId,
                {
                  threadId: entry.enrollmentId,
                  courseId: entry.courseId,
                  participantIds: [participantId],
                  label: entry.courseTitle,
                },
              ] as const,
            ]
          : []
      )
    ).values(),
  ];
}

/** Exact candidate gets only. Existence and Rules authorization precede message reads. */
export async function confirmLegacyHomeworkSources(
  candidates: ReturnType<typeof getLegacyHomeworkCandidates>,
  accountId: string,
  firestore: Firestore = db,
  isActive = () => true
) {
  const sources: InstructorHomeworkSourceInput[] = [];
  const denied: string[] = [];
  let error = false;
  for (let offset = 0; offset < candidates.length && isActive(); offset += 4) {
    await Promise.all(
      candidates.slice(offset, offset + 4).map(async (candidate) => {
        try {
          const snapshot = await getDoc(doc(firestore, 'bookings', candidate.threadId));
          if (!isActive() || !snapshot.exists()) return;
          const booking = snapshot.data();
          if (
            'party' in booking ||
            'occurrence' in booking ||
            booking.userId !== accountId ||
            (booking.courseId !== candidate.courseId &&
              booking.instructorId !== `course_${candidate.courseId}`) ||
            (booking.participantId && !candidate.participantIds.includes(booking.participantId)) ||
            booking.status === 'cancelled' ||
            booking.isDeleted === true ||
            (booking.dataScope !== undefined && booking.dataScope !== 'live') ||
            booking.testSessionId
          )
            return;
          sources.push(candidate);
        } catch (failure) {
          const code = (failure as { code?: string }).code;
          if (code === 'permission-denied' || code === 'unauthenticated')
            denied.push(candidate.threadId);
          else error = true;
        }
      })
    );
  }
  return { sources: sources.sort((a, b) => a.threadId.localeCompare(b.threadId)), denied, error };
}

export function useStudentHomeworkSources(
  sessions: readonly CabinetSessionItem[],
  participantId: string | undefined,
  history: readonly LessonBookingCabinetItem[],
  accountId: string
) {
  const generation = useAuthStore((state) => state.authGeneration);
  const signedIn = useAuthStore((state) => Boolean(state.firebaseUser));
  const base = useMemo(
    () => getStudentHomeworkSources(sessions, participantId, history),
    [sessions, participantId, history]
  );
  const candidates = getLegacyHomeworkCandidates(sessions, participantId);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([accountId, participantId, generation, signedIn, candidates, attempt]);
  const [state, setState] = useState<{
    key: string;
    sources: InstructorHomeworkSourceInput[];
    denied: string[];
    error: boolean;
  }>();
  useEffect(() => {
    let active = true;
    const current = () =>
      active &&
      signedIn &&
      useAuthStore.getState().authGeneration === generation &&
      Boolean(useAuthStore.getState().firebaseUser);
    if (current())
      void confirmLegacyHomeworkSources(candidates, accountId, db, current).then((result) => {
        if (current()) setState({ key, ...result });
      });
    return () => {
      active = false;
    };
    // key includes all confirmation inputs, including the candidate list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const visible = state?.key === key && signedIn ? state : undefined;
  return {
    sources: [...base, ...(visible?.sources ?? [])],
    feedback: {
      loading: signedIn && candidates.length > 0 && !visible,
      denied: visible?.denied ?? [],
      error: visible?.error ?? false,
      retry: () => setAttempt((value) => value + 1),
    },
  };
}
