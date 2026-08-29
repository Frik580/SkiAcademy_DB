import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';
import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';
import { deriveExercisedCapabilityFromParticipants } from '../lesson-bookings/useLessonBookingCommands';

export const MAX_MULTI_PARTICIPANT_SELECTION = 8;

export function requiresExplicitParticipantSelection(
  participants: readonly ManagedParticipantOption[]
): boolean {
  return participants.length > 1;
}

export function resolveDefaultParticipantSelection(
  participants: readonly ManagedParticipantOption[]
): readonly string[] {
  if (participants.length === 1) {
    return [participants[0]!.participantId];
  }
  return [];
}

export function resolveAuthenticatedParticipantSelection(
  selectedParticipantIds: readonly string[],
  managedParticipantIds: readonly string[]
): string[] {
  if (selectedParticipantIds.length > 0 || managedParticipantIds.length === 0) {
    return [...selectedParticipantIds];
  }
  if (managedParticipantIds.length === 1) {
    return [managedParticipantIds[0]!];
  }
  return [];
}

export function toggleParticipantSelection(
  selectedParticipantIds: readonly string[],
  participantId: string,
  managedParticipantIds: readonly string[],
  maxCount = MAX_MULTI_PARTICIPANT_SELECTION
): string[] {
  if (!managedParticipantIds.includes(participantId)) {
    return [...selectedParticipantIds];
  }
  if (selectedParticipantIds.includes(participantId)) {
    return selectedParticipantIds.filter((id) => id !== participantId);
  }
  if (selectedParticipantIds.length >= maxCount) {
    return [...selectedParticipantIds];
  }
  return [...selectedParticipantIds, participantId];
}

export function resolveSelectedParticipantCommand(
  participants: readonly ManagedParticipantOption[],
  selectedParticipantIds: readonly string[]
): {
  readonly participantIds: readonly string[];
  readonly exercisedCapability: ClientCallableCapability;
} {
  if (selectedParticipantIds.length === 0) {
    throw new Error('Select at least one participant.');
  }

  const authorities = selectedParticipantIds.map((participantId) => {
    const participant = participants.find((item) => item.participantId === participantId);
    if (!participant) {
      throw new Error('Selected participant is not managed by this account.');
    }
    return participant.authority;
  });

  return {
    participantIds: selectedParticipantIds,
    exercisedCapability: deriveExercisedCapabilityFromParticipants(authorities),
  };
}
