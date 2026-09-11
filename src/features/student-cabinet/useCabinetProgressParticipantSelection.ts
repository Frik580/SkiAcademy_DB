import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';
import { nextCabinetProgressParticipantId } from './cabinetProgressParticipantSelection';

function participantSetSignature(
  participants: readonly Pick<ManagedParticipantOption, 'participantId'>[]
): string {
  return participants.map((participant) => participant.participantId).join('|');
}

/**
 * Cabinet progress Participant selection.
 * Initialization runs once on the first non-empty managed set.
 * User selection stays authoritative across refetch/rerender.
 */
export function useCabinetProgressParticipantSelection(input: {
  readonly accountId: string | undefined;
  readonly participants: readonly ManagedParticipantOption[];
  readonly loading: boolean;
}) {
  const { accountId, participants, loading } = input;
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | undefined>();
  const initializedRef = useRef(false);
  const accountIdRef = useRef(accountId);
  const signature = useMemo(() => participantSetSignature(participants), [participants]);

  useEffect(() => {
    if (accountIdRef.current !== accountId) {
      accountIdRef.current = accountId;
      initializedRef.current = false;
      if (!accountId) {
        setSelectedParticipantId(undefined);
        return;
      }
    }
    if (!accountId || loading || participants.length === 0) {
      return;
    }
    setSelectedParticipantId((current) => {
      const next = nextCabinetProgressParticipantId({
        participants,
        selectedParticipantId: current,
        initialized: initializedRef.current,
      });
      initializedRef.current = next.initialized;
      return next.selectedParticipantId;
    });
  }, [accountId, loading, participants, signature]);

  const selectParticipant = useCallback(
    (participantId: string) => {
      if (!participants.some((participant) => participant.participantId === participantId)) {
        return;
      }
      initializedRef.current = true;
      setSelectedParticipantId(participantId);
    },
    [participants]
  );

  return {
    selectedParticipantId,
    selectParticipant,
  };
}
