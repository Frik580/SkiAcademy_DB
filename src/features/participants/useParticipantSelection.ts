import { useCallback, useEffect, useState } from 'react';
import { useManagedParticipants } from '../lesson-bookings/useManagedParticipants';
import {
  resolveAuthenticatedParticipantSelection,
  resolveDefaultParticipantSelection,
  toggleParticipantSelection,
} from './participantSelectionState';

export function useParticipantSelection(accountId: string | undefined) {
  const { participants, loading, error, reload } = useManagedParticipants(accountId);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  useEffect(() => {
    if (participants.length === 0) {
      setSelectedParticipantIds([]);
      return;
    }
    setSelectedParticipantIds((current) =>
      resolveAuthenticatedParticipantSelection(
        current,
        participants.map((participant) => participant.participantId)
      )
    );
  }, [participants]);

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
    setSelectedParticipantIds([...resolveDefaultParticipantSelection(participants)]);
  }, [participants]);

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
