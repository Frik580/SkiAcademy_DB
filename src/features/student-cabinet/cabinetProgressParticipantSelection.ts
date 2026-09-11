export interface CabinetProgressParticipant {
  readonly participantId: string;
  readonly authority: 'self' | 'parent_guardian' | string;
}

export function findSelfCabinetParticipantId(
  participants: readonly CabinetProgressParticipant[]
): string | undefined {
  return participants.find((participant) => participant.authority === 'self')?.participantId;
}

/**
 * First valid managed set only. SELF is the default for 2+, never participants[0].
 */
export function resolveInitialCabinetProgressParticipantId(
  participants: readonly CabinetProgressParticipant[]
): string | undefined {
  if (participants.length === 0) {
    return undefined;
  }
  if (participants.length === 1) {
    return participants[0]!.participantId;
  }
  return findSelfCabinetParticipantId(participants);
}

/**
 * After initialization: keep a still-valid user selection.
 * Invalid id falls back to self when present, otherwise empty.
 * Empty selection is not forced back to self on refetch.
 */
export function reconcileCabinetProgressParticipantId(
  selectedParticipantId: string | undefined,
  participants: readonly CabinetProgressParticipant[]
): string | undefined {
  if (participants.length === 0) {
    return undefined;
  }
  if (
    selectedParticipantId &&
    participants.some((participant) => participant.participantId === selectedParticipantId)
  ) {
    return selectedParticipantId;
  }
  if (participants.length === 1) {
    return participants[0]!.participantId;
  }
  if (selectedParticipantId) {
    return findSelfCabinetParticipantId(participants);
  }
  return undefined;
}

export function nextCabinetProgressParticipantId(input: {
  readonly participants: readonly CabinetProgressParticipant[];
  readonly selectedParticipantId: string | undefined;
  readonly initialized: boolean;
}): {
  readonly selectedParticipantId: string | undefined;
  readonly initialized: boolean;
} {
  const { participants, selectedParticipantId, initialized } = input;
  if (participants.length === 0) {
    return {
      selectedParticipantId: initialized ? selectedParticipantId : undefined,
      initialized,
    };
  }
  if (!initialized) {
    return {
      selectedParticipantId: resolveInitialCabinetProgressParticipantId(participants),
      initialized: true,
    };
  }
  return {
    selectedParticipantId: reconcileCabinetProgressParticipantId(
      selectedParticipantId,
      participants
    ),
    initialized: true,
  };
}
