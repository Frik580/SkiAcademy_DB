import type { UserProfile } from '../../types';
import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';
import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';
import { deriveExercisedCapabilityFromParticipants } from '../lesson-bookings/useLessonBookingCommands';

export function resolveEnrollmentParticipantsForProfile(
  managedParticipants: readonly ManagedParticipantOption[],
  customProfile?: UserProfile
): { readonly participantIds: readonly string[]; readonly exercisedCapability: ClientCallableCapability } {
  if (managedParticipants.length === 0) {
    throw new Error('No managed participants are available for enrollment.');
  }

  if (customProfile) {
    const displayName = customProfile.displayName?.trim();
    const matched = displayName
      ? managedParticipants.find(
          (participant) =>
            participant.displayName.trim().toLowerCase() === displayName.toLowerCase()
        )
      : undefined;
    const guardianManaged = managedParticipants.filter(
      (participant) => participant.authority === 'parent_guardian'
    );
    const participantIds = matched
      ? [matched.participantId]
      : guardianManaged.length > 0
        ? [guardianManaged[0]!.participantId]
        : [managedParticipants[0]!.participantId];
    const authorities = participantIds.map((participantId) => {
      const participant = managedParticipants.find((item) => item.participantId === participantId);
      return participant?.authority ?? 'parent_guardian';
    });
    return {
      participantIds,
      exercisedCapability: deriveExercisedCapabilityFromParticipants(authorities),
    };
  }

  const selfParticipant =
    managedParticipants.find((participant) => participant.authority === 'self') ??
    managedParticipants[0]!;
  return {
    participantIds: [selfParticipant.participantId],
    exercisedCapability: 'account_owner',
  };
}
