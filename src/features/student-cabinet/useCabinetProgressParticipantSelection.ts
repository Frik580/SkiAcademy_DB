import { useCallback, useEffect, useMemo } from 'react';
import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';
import { useCabinetProgressParticipantSelectionStore } from './cabinetProgressParticipantSelectionStore';

function participantSetSignature(
  participants: readonly Pick<ManagedParticipantOption, 'participantId'>[]
): string {
  return participants.map((participant) => participant.participantId).join('|');
}

/**
 * Cabinet progress Participant selection.
 * Initialization runs once on the first non-empty managed set.
 * User selection stays authoritative across refetch/rerender and is shared
 * with the header avatar switcher.
 */
export function useCabinetProgressParticipantSelection(input: {
  readonly accountId: string | undefined;
  readonly participants: readonly ManagedParticipantOption[];
  readonly loading: boolean;
}) {
  const { accountId, participants, loading } = input;
  const selectedParticipantId = useCabinetProgressParticipantSelectionStore(
    (state) => state.selectedParticipantId
  );
  const selectionAccountId = useCabinetProgressParticipantSelectionStore(
    (state) => state.accountId
  );
  const syncManagedSet = useCabinetProgressParticipantSelectionStore(
    (state) => state.syncManagedSet
  );
  const selectParticipantInStore = useCabinetProgressParticipantSelectionStore(
    (state) => state.selectParticipant
  );
  const signature = useMemo(() => participantSetSignature(participants), [participants]);

  useEffect(() => {
    syncManagedSet({ accountId, participants, loading });
  }, [accountId, loading, participants, signature, syncManagedSet]);

  const selectParticipant = useCallback(
    (participantId: string) => {
      selectParticipantInStore(participantId, participants);
    },
    [participants, selectParticipantInStore]
  );

  return {
    // Reconcile before effects run: stale account/removed participant selections
    // must never supply a presentation scope, even for one render.
    selectedParticipantId:
      selectionAccountId === accountId &&
      participants.some((participant) => participant.participantId === selectedParticipantId)
        ? selectedParticipantId
        : undefined,
    selectParticipant,
  };
}
