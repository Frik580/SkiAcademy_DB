import {
  BookingProposalSchema,
  nextAggregateRevision,
  proposalParticipantIds,
  type BookingProposal,
  type BookingProposalId,
  type CanonicalTimestamp,
  type InstructorId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  bookingProposalPath,
  parseBookingProposal,
  toFirestoreWritePayload,
  BOOKING_PROPOSAL_PLANNING_ESTIMATES,
} from './bookingProposalStore';
import {
  commitRemoveOpenProposalsFromIndex,
  planOpenProposalIndexMutationsForParty,
  readBookingProposalOpenIndex,
  readBookingProposalOpenIndexesForParty,
  type BookingProposalOpenIndex,
} from './bookingProposalOpenIndex';

export interface BlockCancelledOpenProposalPlan {
  readonly proposal: BookingProposal;
  readonly nextRevision: ReturnType<typeof nextAggregateRevision>;
}

export async function planBlockCancellationOfOpenProposals(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
  }
): Promise<{
  readonly plans: readonly BlockCancelledOpenProposalPlan[];
  readonly indexes: ReadonlyMap<ParticipantId, BookingProposalOpenIndex | undefined>;
}> {
  const existingIndex = await readBookingProposalOpenIndex(session, input);
  if (!existingIndex || existingIndex.openProposalIds.length === 0) {
    return { plans: [], indexes: new Map([[input.participantId, existingIndex]]) };
  }

  const plans: BlockCancelledOpenProposalPlan[] = [];
  const extraParticipantIds = new Set<ParticipantId>([input.participantId]);
  for (const proposalId of existingIndex.openProposalIds) {
    const proposalPath = bookingProposalPath(proposalId);
    const proposalRead = await session.tx.get({ path: proposalPath });
    session.plan.planRead({ path: proposalPath, category: 'aggregate' });
    const proposal = parseBookingProposal(proposalRead.exists ? proposalRead.data : undefined);
    if (
      !proposal ||
      proposal.lifecycle.status !== 'open' ||
      !proposalParticipantIds(proposal).includes(input.participantId) ||
      proposal.instructorId !== input.instructorId
    ) {
      continue;
    }

    plans.push({
      proposal,
      nextRevision: nextAggregateRevision(proposal.revision),
    });
    session.plan.planMutation({
      path: proposalPath,
      kind: 'update',
      category: 'aggregate',
      estimatedPayloadBytes: BOOKING_PROPOSAL_PLANNING_ESTIMATES.proposalBytes,
    });
    for (const participantId of proposalParticipantIds(proposal)) {
      extraParticipantIds.add(participantId);
    }
  }

  const indexes = await readBookingProposalOpenIndexesForParty(session, {
    participantIds: [...extraParticipantIds],
    instructorId: input.instructorId,
  });
  if (plans.length > 0) {
    planOpenProposalIndexMutationsForParty(session, {
      participantIds: [...extraParticipantIds],
      instructorId: input.instructorId,
      indexes,
    });
  }

  return { plans, indexes };
}

export function commitBlockCancellationOfOpenProposals(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
    readonly plans: readonly BlockCancelledOpenProposalPlan[];
    readonly indexes: ReadonlyMap<ParticipantId, BookingProposalOpenIndex | undefined>;
    readonly decidedAt: CanonicalTimestamp;
    readonly commandId: string;
    readonly correlationId: string;
  }
): void {
  const cancelledIds = input.plans.map((plan) => plan.proposal.proposalId);
  const partyIds = new Set<ParticipantId>();
  for (const plan of input.plans) {
    const cancelledProposal = BookingProposalSchema.parse({
      ...plan.proposal,
      lifecycle: {
        status: 'cancelled',
        cancelledAt: input.decidedAt,
        reasonCode: 'instructor_blocked_by_owner',
      },
      revision: plan.nextRevision,
      updatedAt: input.decidedAt,
      audit: {
        ...plan.proposal.audit,
        lastChangedByCommandId: input.commandId,
        correlationId: input.correlationId,
      },
    });
    session.tx.update(
      { path: bookingProposalPath(plan.proposal.proposalId) },
      toFirestoreWritePayload(cancelledProposal as Record<string, unknown>)
    );
    for (const participantId of proposalParticipantIds(plan.proposal)) {
      partyIds.add(participantId);
    }
  }

  for (const participantId of partyIds) {
    commitRemoveOpenProposalsFromIndex(session, {
      participantId,
      instructorId: input.instructorId,
      proposalIds: cancelledIds,
      existingIndex: input.indexes.get(participantId),
      decidedAt: input.decidedAt,
    });
  }
}

export function cancelledProposalIds(
  plans: readonly BlockCancelledOpenProposalPlan[]
): readonly BookingProposalId[] {
  return plans.map((plan) => plan.proposal.proposalId);
}
