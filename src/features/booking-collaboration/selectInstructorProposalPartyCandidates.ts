import { instructorMayCreateBookingProposal } from '@ski-academy/shared-domain';
import type { InstructorProposalPartyCandidate } from './bookingCollaborationContracts';

export interface InstructorProposalPartyBookingView {
  readonly instructorId: string;
  readonly participantIds: readonly string[];
  readonly lifecycleStatus: string;
  readonly participants: readonly {
    readonly participantId: string;
    readonly label: string;
    readonly accountId?: string;
  }[];
}

export function selectInstructorProposalPartyCandidates(input: {
  readonly instructorId: string;
  readonly seedParticipantIds: readonly string[];
  readonly seedAccountId?: string;
  readonly bookings: readonly InstructorProposalPartyBookingView[];
  readonly relationshipStatusByParticipantId: ReadonlyMap<
    string,
    'active' | 'revoked' | 'expired' | undefined
  >;
}): readonly InstructorProposalPartyCandidate[] {
  const evidenceBookings = input.bookings.map((booking) => ({
    instructorId: booking.instructorId,
    participantIds: booking.participantIds,
    lifecycleStatus: booking.lifecycleStatus,
  }));

  const known = new Map<string, { label: string; accountId?: string; seeded: boolean }>();
  const seedSet = new Set(input.seedParticipantIds);

  for (const booking of input.bookings) {
    for (const participant of booking.participants) {
      const existing = known.get(participant.participantId);
      known.set(participant.participantId, {
        label: participant.label,
        accountId: participant.accountId ?? existing?.accountId,
        seeded: existing?.seeded === true || seedSet.has(participant.participantId),
      });
    }
  }

  for (const participantId of input.seedParticipantIds) {
    if (!known.has(participantId)) {
      known.set(participantId, {
        label: participantId,
        accountId: input.seedAccountId,
        seeded: true,
      });
    }
  }

  const accountId =
    input.seedAccountId ??
    [...known.values()].find((entry) => entry.seeded && entry.accountId)?.accountId;

  const candidates: InstructorProposalPartyCandidate[] = [];
  for (const [participantId, entry] of known) {
    const sameAccount =
      accountId !== undefined && entry.accountId !== undefined
        ? entry.accountId === accountId
        : entry.seeded;
    if (!sameAccount) continue;

    const selectable = instructorMayCreateBookingProposal({
      instructorId: input.instructorId,
      participantId,
      relationshipStatus: input.relationshipStatusByParticipantId.get(participantId),
      bookings: evidenceBookings,
    });
    if (!selectable && !entry.seeded) continue;
    candidates.push({
      participantId,
      label: entry.label,
      selectable,
      ...(selectable ? {} : { disabledReason: 'no_authority' as const }),
    });
  }

  return candidates.sort((left, right) => left.label.localeCompare(right.label));
}
