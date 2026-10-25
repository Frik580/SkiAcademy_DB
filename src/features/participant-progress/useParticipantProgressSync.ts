import { useEffect } from 'react';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import {
  selectInstructorLessonBookings,
  useBookingCollaborationStore,
} from '../booking-collaboration/bookingCollaborationStore';
import { useLocation } from 'react-router-dom';
import { logger } from '../../shared';
import {
  refreshInstructorParticipantProgress,
  refreshManagedParticipantProgress,
} from './participantProgressService';
import { useParticipantProgressStore } from './participantProgressStore';
import { instructorProgressParticipantIds } from './instructorProgressParticipantIds';
import { useLessonStartClock } from '../booking-collaboration/useLessonStartClock';

export function useParticipantProgressSync() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useProfileStore((state) => state.userProfile);
  const location = useLocation();
  const lessonBookings = useBookingCollaborationStore(selectInstructorLessonBookings);
  const participantAccess = useBookingCollaborationStore((state) => state.participantAccess);
  const nowMs = useLessonStartClock(lessonBookings);
  const accountId = firebaseUser?.uid;
  const profileAccountId = userProfile?.uid;
  const canonicalReadyAccountId = useProfileStore((state) => state.canonicalReadyAccountId);
  const instructorId = userProfile?.instructorId;
  const isInstructorRoute = location.pathname === '/instructor';
  const isCabinetOrHome = location.pathname === '/' || location.pathname.startsWith('/cabinet');

  useEffect(() => {
    if (!accountId) {
      useParticipantProgressStore.getState().clear();
      return;
    }
    // Firebase Auth can resolve before the Account document exists (e.g. while
    // email verification is pending). Never request managed progress for an
    // absent profile or one belonging to a previous signed-in principal.
    if (profileAccountId !== accountId || canonicalReadyAccountId !== accountId) return;
    void refreshManagedParticipantProgress().catch((error) => {
      logger.warn('Failed to load managed participant progress', error);
    });
  }, [accountId, profileAccountId, canonicalReadyAccountId, isCabinetOrHome]);

  useEffect(() => {
    if (!accountId || !isInstructorRoute || !instructorId) return;
    const participantIds = instructorProgressParticipantIds(
      lessonBookings,
      participantAccess,
      instructorId,
      nowMs
    );
    if (participantIds.length === 0) return;
    void refreshInstructorParticipantProgress(participantIds).catch((error) => {
      logger.warn('Failed to load instructor participant progress', error);
    });
  }, [accountId, instructorId, isInstructorRoute, lessonBookings, participantAccess, nowMs]);
}
