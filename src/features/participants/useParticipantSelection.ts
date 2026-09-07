import { useCallback, useState } from 'react';
import { useManagedParticipants } from '../lesson-bookings/useManagedParticipants';
import { toggleParticipantSelection } from './participantSelectionState';

export function useParticipantSelection(accountId: string | undefined) {
  const { participants, loading, error, reload } = useManagedParticipants(accountId);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const toggleParticipant = useCallback(
    (participantId: string) => {
      setSelectedParticipantIds((current) =>
        toggleParticipantSelection(
          current,
          participantId,
          participants.map((participant) => participant.participantId)
        )
      );
    },
    [participants]
  );

  const resetSelection = useCallback(() => {
    setSelectedParticipantIds([]);
  }, []);

  return {
    participants,
    loading,
    error,
    reload,
    selectedParticipantIds,
    toggleParticipant,
    resetSelection,
  };
}
