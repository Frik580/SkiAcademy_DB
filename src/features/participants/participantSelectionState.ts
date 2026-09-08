import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';
import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';
import { deriveExercisedCapabilityFromParticipants } from '../lesson-bookings/useLessonBookingCommands';

export function requiresExplicitParticipantSelection(
  participants: readonly ManagedParticipantOption[]
): boolean {
  return participants.length > 1;
}

export function resolveSingleManagedParticipant<T extends { readonly participantId: string }>(
  participants: readonly T[]
): T | null {
  return participants.length === 1 ? participants[0]! : null;
}

/**
 * Derived participant id for submit/validation. A sole managed participant is
 * used automatically; otherwise the explicit picker selection is used.
 */
export function resolveEffectiveParticipantId(
  participants: readonly { readonly participantId: string }[],
  selectedParticipantId: string | undefined
): string | undefined {
  return resolveEffectiveParticipantIds(
    participants,
    selectedParticipantId ? [selectedParticipantId] : []
  )[0];
}

/**
 * Multi-select counterpart used by lesson booking and course enrollment.
 * Stale ids that are no longer in the current read model are dropped.
 */
export function resolveEffectiveParticipantIds(
  participants: readonly { readonly participantId: string }[],
  selectedParticipantIds: readonly string[]
): readonly string[] {
  const singleParticipant = resolveSingleManagedParticipant(participants);
  if (singleParticipant) {
    return [singleParticipant.participantId];
  }
  const availableIds = new Set(participants.map((participant) => participant.participantId));
  return selectedParticipantIds.filter((id) => availableIds.has(id));
}

/** Show loading/error or the 2+ picker. Zero participants is not a user-facing empty list. */
export function shouldShowParticipantPicker(input: {
  readonly participants: readonly unknown[];
  readonly loading?: boolean;
  readonly error?: string;
}): boolean {
  if (input.loading || Boolean(input.error)) {
    return true;
  }
  return input.participants.length > 1;
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
  maxCount: number
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
