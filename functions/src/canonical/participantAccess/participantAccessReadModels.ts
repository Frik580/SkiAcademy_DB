import {
  evaluateInstructorParticipantAccess,
  evaluateParticipantManagementAccess,
  sanitizeParticipantProfileForInstructor,
  type AccountId,
  type BookingScopedParticipantAccessEvidence,
  type CanonicalTimestamp,
  type InstructorId,
  type Participant,
  type ParticipantAccessTopology,
} from '@ski-academy/shared-domain';

export function buildAccountParticipantReadModel(input: {
  readonly topology: ParticipantAccessTopology;
  readonly accountId: AccountId;
  readonly participant: Participant;
}) {
  const access = evaluateParticipantManagementAccess(input.topology, {
    accountId: input.accountId,
    participantId: input.participant.participantId,
  });

  if (!access.allowed) {
    return { allowed: false as const, reason: access.reason };
  }

  return {
    allowed: true as const,
    access,
    participant: input.participant,
  };
}

export function buildInstructorParticipantReadModel(input: {
  readonly topology: ParticipantAccessTopology;
  readonly instructorId: InstructorId;
  readonly participant: Participant;
  readonly at: CanonicalTimestamp;
  readonly bookingScopedEvidence?: readonly BookingScopedParticipantAccessEvidence[];
}) {
  const access = evaluateInstructorParticipantAccess(input.topology, {
    instructorId: input.instructorId,
    participantId: input.participant.participantId,
    at: input.at,
    bookingScopedEvidence: input.bookingScopedEvidence ?? [],
  });

  if (!access.allowed) {
    return { allowed: false as const, reason: access.reason };
  }

  return {
    allowed: true as const,
    access,
    participant: sanitizeParticipantProfileForInstructor(input.participant),
  };
}
