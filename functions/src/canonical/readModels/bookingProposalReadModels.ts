import {
  evaluateBookingProposalAuthorizedActions,
  type AccountId,
  type BookingProposal,
  type BookingProposalReadModel,
  type InstructorId,
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

async function buildAccountProposalReadModel(
  firestore: Firestore,
  accountId: AccountId,
  proposal: BookingProposal,
  authContext: LessonBookingReadAuthorizationContext,
  now: CanonicalTimestamp,
  readContext: ReadModelRequestContext
): Promise<BookingProposalReadModel | undefined> {
  const management = authContext.participantManagement.find(
    (record) => record.participantId === proposal.participantId
  );
  const participant = authContext.participants.find(
    (record) => record.participantId === proposal.participantId
  );
  if (!management || !participant || !authContext.account) {
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

  const blocks = await loadActiveParticipantBlocksForPair(
    firestore,
    proposal.participantId,
    proposal.instructorId,
    readContext
  );
  const topology = buildParticipantAccessTopology({
    account: authContext.account,
    participant,
    management,
    additionalBlocks: blocks,
  });

  const authorizedActions = evaluateBookingProposalAuthorizedActions({
    actor: {
      kind: 'account_manager',
      accountId,
      participantManagementId: management.participantManagementId,
      authority: management.authority,
    },
    proposal,
    account: authContext.account,
    participant,
    management,
    topology,
    now,
  });

  return {
    proposalId: proposal.proposalId,
    revision: proposal.revision,
    participantId: proposal.participantId,
    instructorId: proposal.instructorId,
    participantDisplayName: participant.displayName,
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

async function buildInstructorProposalReadModel(
  firestore: Firestore,
  instructorId: InstructorId,
  accountId: AccountId,
  proposal: BookingProposal,
  now: CanonicalTimestamp,
  readContext: ReadModelRequestContext
): Promise<BookingProposalReadModel | undefined> {
  if (proposal.instructorId !== instructorId) {
    return undefined;
  }

  const participantSnap = await readContext.participant(proposal.participantId);
  const participant = parseParticipant(
    participantSnap.data() as Record<string, unknown> | undefined
  );
  if (!participant) {
    return undefined;
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
    participantId: proposal.participantId,
    instructorId: proposal.instructorId,
    participantDisplayName: participant.displayName,
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
    const items: BookingProposalReadModel[] = [];

    for (const participantId of participantIds) {
      const snapshot = await firestore
        .collection('booking_proposals')
        .where('participantId', '==', participantId)
        .limit(50)
        .get();

      for (const doc of snapshot.docs) {
        const proposal = parseBookingProposal(doc.data() as Record<string, unknown>);
        if (!proposal || !isOpenProposal(proposal)) {
          continue;
        }
        const readModel = await buildAccountProposalReadModel(
          firestore,
          options.accountId,
          proposal,
          authContext,
          now,
          readContext
        );
        if (readModel) {
          items.push(readModel);
        }
      }
    }

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
      firestore,
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
