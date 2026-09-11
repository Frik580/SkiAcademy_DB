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

export function useParticipantProgressSync() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useProfileStore((state) => state.userProfile);
  const location = useLocation();
  const lessonBookings = useBookingCollaborationStore(selectInstructorLessonBookings);
  const accountId = firebaseUser?.uid;
  const instructorId = userProfile?.instructorId;
  const isInstructorRoute = location.pathname === '/instructor';
  const isCabinetOrHome = location.pathname === '/' || location.pathname.startsWith('/cabinet');

  useEffect(() => {
    if (!accountId) {
      useParticipantProgressStore.getState().clear();
      return;
    }
    void refreshManagedParticipantProgress().catch((error) => {
      logger.warn('Failed to load managed participant progress', error);
    });
  }, [accountId, isCabinetOrHome]);

  useEffect(() => {
    if (!accountId || !isInstructorRoute || !instructorId) return;
    const participantIds = [
      ...new Set(
        lessonBookings.flatMap((booking) =>
          booking.participants.map((participant) => participant.participantId)
        )
      ),
    ];
    if (participantIds.length === 0) return;
    void refreshInstructorParticipantProgress(participantIds).catch((error) => {
      logger.warn('Failed to load instructor participant progress', error);
    });
  }, [accountId, instructorId, isInstructorRoute, lessonBookings]);
}
