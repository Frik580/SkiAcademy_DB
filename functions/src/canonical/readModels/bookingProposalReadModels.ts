import {
  evaluateBookingProposalAuthorizedActions,
  proposalParticipantIds,
  resolveClientCallableCapabilityFromPartyAuthorities,
  type AccountId,
  type BookingProposal,
  type BookingProposalReadModel,
  type InstructorId,
  type Participant,
  type ParticipantId,
  type ParticipantManagement,
  type QueryBookingProposalReadModelsInput,
  type QueryBookingProposalReadModelsResult,
  timestampFromDate,
  type CanonicalTimestamp,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { parseBookingProposal } from '../bookings/bookingProposalStore';
import { parseInstructorCatalog } from '../bookings/bookingStore';
import {
  loadLessonBookingReadAuthorizationContext,
  type LessonBookingReadAuthorizationContext,
} from './lessonBookingReadModels';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import { loadActiveParticipantBlocksForPair } from './participantBlockReadSupport';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';

function durationMinutesFromInterval(start: CanonicalTimestamp, end: CanonicalTimestamp): number {
  const startMs = start.seconds * 1_000 + start.nanoseconds / 1_000_000;
  const endMs = end.seconds * 1_000 + end.nanoseconds / 1_000_000;
  return Math.max(1, Math.round((endMs - startMs) / 60_000));
}

function isOpenProposal(proposal: BookingProposal): boolean {
  return proposal.lifecycle.status === 'open';
}

async function collectOpenProposalsForParticipant(
  firestore: Firestore,
  participantId: ParticipantId
): Promise<BookingProposal[]> {
  const [legacySnapshot, partySnapshot] = await Promise.all([
    firestore.collection('booking_proposals').where('participantId', '==', participantId).limit(50).get(),
    firestore
      .collection('booking_proposals')
      .where('participantIds', 'array-contains', participantId)
      .limit(50)
      .get(),
  ]);
  const byId = new Map<string, BookingProposal>();
  for (const doc of [...legacySnapshot.docs, ...partySnapshot.docs]) {
    const proposal = parseBookingProposal(doc.data() as Record<string, unknown>);
    if (!proposal || !isOpenProposal(proposal)) continue;
    if (!proposalParticipantIds(proposal).includes(participantId)) continue;
    byId.set(proposal.proposalId, proposal);
  }
  return [...byId.values()];
}

async function buildAccountProposalReadModel(
  firestore: Firestore,
  accountId: AccountId,
  proposal: BookingProposal,
  authContext: LessonBookingReadAuthorizationContext,
  now: CanonicalTimestamp,
  readContext: ReadModelRequestContext
): Promise<BookingProposalReadModel | undefined> {
  const partyIds = proposalParticipantIds(proposal);
  const managements: ParticipantManagement[] = [];
  const participants: Participant[] = [];
  const authorities: ('self' | 'parent_guardian')[] = [];

  for (const participantId of partyIds) {
    const management = authContext.participantManagement.find(
      (record) => record.participantId === participantId
    );
    const participant = authContext.participants.find(
      (record) => record.participantId === participantId
    );
    if (!management || !participant || !authContext.account) {
      return undefined;
    }
    managements.push(management);
    participants.push(participant);
    authorities.push(management.authority);
  }
  if (!authContext.account || managements.length === 0) {
    return undefined;
  }

  const instructorSnap = await readContext.instructor(proposal.instructorId);
  const instructorCatalog = parseInstructorCatalog(
    proposal.instructorId,
    instructorSnap.data() as Record<string, unknown> | undefined
  );
  if (!instructorCatalog) {
    return undefined;
  }

  const blocks = [];
  for (const participantId of partyIds) {
    blocks.push(
      ...(await loadActiveParticipantBlocksForPair(
        firestore,
        participantId,
        proposal.instructorId,
        readContext
      ))
    );
  }
  const topology = buildParticipantAccessTopology({
    account: authContext.account,
    participant: participants[0],
    management: managements[0],
    additionalParticipants: participants.slice(1),
    additionalManagement: managements.slice(1),
    additionalBlocks: blocks,
  });

  const authorizedActions = evaluateBookingProposalAuthorizedActions({
    actor: {
      kind: 'account_manager',
      accountId,
      participantManagementId: managements[0]!.participantManagementId,
      authority: managements[0]!.authority,
    },
    proposal,
    account: authContext.account,
    participant: participants[0],
    management: managements[0],
    topology,
    now,
  });

  const participantDisplayNames = participants.map((participant) => participant.displayName);
  return {
    proposalId: proposal.proposalId,
    revision: proposal.revision,
    participantIds: [...partyIds],
    instructorId: proposal.instructorId,
    participantDisplayNames,
    instructorDisplayName: instructorCatalog.name,
    proposedService: {
      startsAt: proposal.proposedService.interval.startsAt,
      endsAt: proposal.proposedService.interval.endsAt,
      timeZone: proposal.proposedService.timeZone,
      durationMinutes: durationMinutesFromInterval(
        proposal.proposedService.interval.startsAt,
        proposal.proposedService.interval.endsAt
      ),
    },
    lifecycle: proposal.lifecycle,
    authorizedActions,
    clientExercisedCapability: resolveClientCallableCapabilityFromPartyAuthorities(authorities),
    updatedAt: proposal.updatedAt,
  };
}

async function buildInstructorProposalReadModel(
  instructorId: InstructorId,
  accountId: AccountId,
  proposal: BookingProposal,
  now: CanonicalTimestamp,
  readContext: ReadModelRequestContext
): Promise<BookingProposalReadModel | undefined> {
  if (proposal.instructorId !== instructorId) {
    return undefined;
  }

  const partyIds = proposalParticipantIds(proposal);
  const participantDisplayNames: string[] = [];
  for (const participantId of partyIds) {
    const participantSnap = await readContext.participant(participantId);
    const participant = parseParticipant(
      participantSnap.data() as Record<string, unknown> | undefined
    );
    if (!participant) {
      return undefined;
    }
    participantDisplayNames.push(participant.displayName);
  }

  const instructorSnap = await readContext.instructor(instructorId);
  const instructorCatalog = parseInstructorCatalog(
    instructorId,
    instructorSnap.data() as Record<string, unknown> | undefined
  );
  if (!instructorCatalog) {
    return undefined;
  }

  const authorizedActions = evaluateBookingProposalAuthorizedActions({
    actor: {
      kind: 'instructor',
      accountId,
      instructorId,
    },
    proposal,
    now,
  });

  return {
    proposalId: proposal.proposalId,
    revision: proposal.revision,
    participantIds: [...partyIds],
    instructorId: proposal.instructorId,
    participantDisplayNames,
    instructorDisplayName: instructorCatalog.name,
    proposedService: {
      startsAt: proposal.proposedService.interval.startsAt,
      endsAt: proposal.proposedService.interval.endsAt,
      timeZone: proposal.proposedService.timeZone,
      durationMinutes: durationMinutesFromInterval(
        proposal.proposedService.interval.startsAt,
        proposal.proposedService.interval.endsAt
      ),
    },
    lifecycle: proposal.lifecycle,
    authorizedActions,
    updatedAt: proposal.updatedAt,
  };
}

export async function queryBookingProposalReadModels(
  firestore: Firestore,
  input: QueryBookingProposalReadModelsInput,
  options: {
    readonly accountId: AccountId;
    readonly instructorId?: InstructorId;
    readonly now?: Date;
    readonly readContext?: ReadModelRequestContext;
  }
): Promise<QueryBookingProposalReadModelsResult> {
  const readContext = options.readContext ?? createReadModelRequestContext(firestore);
  const now = timestampFromDate(options.now ?? new Date());

  if (input.scope === 'account_open') {
    const authContext = await loadLessonBookingReadAuthorizationContext(
      firestore,
      options.accountId,
      readContext
    );
    const participantIds = authContext.participantManagement.map(
      (management) => management.participantId
    );
    const itemsById = new Map<string, BookingProposalReadModel>();

    for (const participantId of participantIds) {
      const proposals = await collectOpenProposalsForParticipant(firestore, participantId);
      for (const proposal of proposals) {
        if (itemsById.has(proposal.proposalId)) continue;
        const readModel = await buildAccountProposalReadModel(
          firestore,
          options.accountId,
          proposal,
          authContext,
          now,
          readContext
        );
        if (readModel) {
          itemsById.set(readModel.proposalId, readModel);
        }
      }
    }

    const items = [...itemsById.values()];
    items.sort((left, right) => right.updatedAt.seconds - left.updatedAt.seconds);
    return { scope: input.scope, items };
  }

  const instructorId = options.instructorId;
  if (!instructorId) {
    return { scope: input.scope, items: [] };
  }

  const snapshot = await firestore
    .collection('booking_proposals')
    .where('instructorId', '==', instructorId)
    .limit(100)
    .get();

  const items: BookingProposalReadModel[] = [];
  for (const doc of snapshot.docs) {
    const proposal = parseBookingProposal(doc.data() as Record<string, unknown>);
    if (!proposal || !isOpenProposal(proposal)) {
      continue;
    }
    const readModel = await buildInstructorProposalReadModel(
      instructorId,
      options.accountId,
      proposal,
      now,
      readContext
    );
    if (readModel) {
      items.push(readModel);
    }
  }

  items.sort((left, right) => right.updatedAt.seconds - left.updatedAt.seconds);
  return { scope: input.scope, items };
}
