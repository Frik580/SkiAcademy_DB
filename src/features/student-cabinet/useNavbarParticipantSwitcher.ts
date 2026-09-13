import { useMemo } from 'react';
import { useManagedParticipants } from '../lesson-bookings/useManagedParticipants';
import { toCabinetParticipantAvatarItems } from './cabinetParticipantAvatarSwitcherContract';
import { useCabinetProgressParticipantSelection } from './useCabinetProgressParticipantSelection';

export function useNavbarParticipantSwitcher(input: {
  readonly accountId: string | undefined;
  readonly legacySelfAvatarUrl?: string;
}) {
  const { accountId, legacySelfAvatarUrl } = input;
  const { participants, loading, error } = useManagedParticipants(accountId);
  const { selectedParticipantId, selectParticipant } = useCabinetProgressParticipantSelection({
    accountId,
    participants,
    loading,
  });
  const items = useMemo(
    () => toCabinetParticipantAvatarItems(participants, legacySelfAvatarUrl),
    [legacySelfAvatarUrl, participants]
  );

  return {
    items,
    selectedParticipantId,
    selectParticipant,
    loading,
    error,
  };
}
