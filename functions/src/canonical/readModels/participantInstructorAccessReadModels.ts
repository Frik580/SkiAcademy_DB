import {
  evaluateParticipantInstructorAccessAuthorizedActions,
  evaluateParticipantManagementAccess,
  instructorRelationshipIdFromPair,
  participantBlockIdFromDirection,
  sanitizeParticipantBlockReasonForReadModel,
  type AccountId,
  type InstructorId,
  type ParticipantBlock,
  type ParticipantInstructorAccessReadModel,
  type QueryParticipantInstructorAccessReadModelsInput,
  type QueryParticipantInstructorAccessReadModelsResult,
  timestampFromDate,
  type CanonicalTimestamp,
  type ReadModelAccountManagerActor,
  type ReadModelInstructorActor,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { parseInstructorCatalog } from '../bookings/bookingStore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import {
  instructorRelationshipPath,
  parseAccount,
  parseInstructorRelationship,
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
} from '../participantAccess/participantAccessStore';
import { loadLessonBookingReadAuthorizationContext } from './lessonBookingReadModels';

function buildBlockProjection(
  block: ParticipantBlock | undefined,
  actor: ReadModelAccountManagerActor | ReadModelInstructorActor
) {
  if (!block) {
    return undefined;
  }
  const reason = sanitizeParticipantBlockReasonForReadModel({ actor, block });
  return {
    participantBlockId: block.participantBlockId,
    revision: block.revision,
    status: block.status,
    ...(reason ? { reason } : {}),
  };
}

async function buildParticipantInstructorAccessReadModel(input: Readonly<{
  firestore: Firestore;
  actor: ReadModelAccountManagerActor | ReadModelInstructorActor;
  participantId: QueryParticipantInstructorAccessReadModelsInput['participantId'];
  instructorId: InstructorId;
  now: CanonicalTimestamp;
}>): Promise<ParticipantInstructorAccessReadModel | undefined> {
  const participantSnap = await input.firestore.collection('participants').doc(input.participantId).get();
  const participant = parseParticipant(participantSnap.data() as Record<string, unknown> | undefined);
  if (!participant) {
    return undefined;
  }

  const instructorSnap = await input.firestore.collection('instructors').doc(input.instructorId).get();
  const instructorCatalog = parseInstructorCatalog(
    input.instructorId,
    instructorSnap.data() as Record<string, unknown> | undefined
  );
  if (!instructorCatalog) {
    return undefined;
  }

  const relationshipId = instructorRelationshipIdFromPair({
    participantId: input.participantId,
    instructorId: input.instructorId,
  });
  const relationshipSnap = await input.firestore.doc(instructorRelationshipPath(relationshipId)).get();
  const relationship = parseInstructorRelationship(
    relationshipSnap.data() as Record<string, unknown> | undefined
  );

  const managerBlockId = participantBlockIdFromDirection({
    participantId: input.participantId,
    instructorId: input.instructorId,
    createdByKind: 'participant_manager',
  });
  const instructorBlockId = participantBlockIdFromDirection({
    participantId: input.participantId,
    instructorId: input.instructorId,
    createdByKind: 'instructor',
  });

  const managerBlockSnap = await input.firestore.doc(participantBlockPath(managerBlockId)).get();
  const instructorBlockSnap = await input.firestore.doc(participantBlockPath(instructorBlockId)).get();
  const managerBlock = parseParticipantBlock(
    managerBlockSnap.data() as Record<string, unknown> | undefined
  );
  const instructorBlock = parseParticipantBlock(
    instructorBlockSnap.data() as Record<string, unknown> | undefined
  );

  let account;
  let management;
  if (input.actor.kind === 'account_manager') {
    const accountSnap = await input.firestore.collection('users').doc(input.actor.accountId).get();
    account = parseAccount(accountSnap.data() as Record<string, unknown> | undefined);
    const managementSnap = await input.firestore
      .collection('participant_management')
      .doc(input.actor.participantManagementId)
      .get();
    management = parseParticipantManagement(
      managementSnap.data() as Record<string, unknown> | undefined
    );
  }

  const authorizedActions = evaluateParticipantInstructorAccessAuthorizedActions({
    actor: input.actor,
    account,
    participant,
    management,
    relationship,
    managerBlock,
    instructorBlock,
    instructorId: input.instructorId,
    now: input.now,
  });

  return {
    participantId: input.participantId,
    instructorId: input.instructorId,
    participantDisplayName: participant.displayName,
    instructorDisplayName: instructorCatalog.name,
    ...(relationship
      ? {
          relationship: {
            instructorRelationshipId: relationship.instructorRelationshipId,
            revision: relationship.revision,
            status: relationship.status,
            ...(relationship.expiresAt ? { expiresAt: relationship.expiresAt } : {}),
          },
        }
      : {}),
    managerBlock: buildBlockProjection(managerBlock, input.actor),
    instructorBlock: buildBlockProjection(instructorBlock, input.actor),
    authorizedActions,
  };
}

export async function queryParticipantInstructorAccessReadModels(
  firestore: Firestore,
  input: QueryParticipantInstructorAccessReadModelsInput,
  options: {
    readonly accountId: AccountId;
    readonly instructorId?: InstructorId;
    readonly now?: Date;
  }
): Promise<QueryParticipantInstructorAccessReadModelsResult> {
  const now = timestampFromDate(options.now ?? new Date());

  if (input.scope === 'account_manager') {
    const authContext = await loadLessonBookingReadAuthorizationContext(firestore, options.accountId);
    const management = authContext.participantManagement.find(
      (record) => record.participantId === input.participantId
    );
    const participant = authContext.participants.find(
      (record) => record.participantId === input.participantId
    );
    if (!management || !participant || !authContext.account) {
      return { scope: input.scope };
    }

    const topology = buildParticipantAccessTopology({
      account: authContext.account,
      participant,
      management,
    });
    const access = evaluateParticipantManagementAccess(topology, {
      accountId: options.accountId,
      participantId: input.participantId,
    });
    if (!access.allowed) {
      return { scope: input.scope };
    }

    const item = await buildParticipantInstructorAccessReadModel({
      firestore,
      actor: {
        kind: 'account_manager',
        accountId: options.accountId,
        participantManagementId: management.participantManagementId,
        authority: management.authority,
      },
      participantId: input.participantId,
      instructorId: input.instructorId,
      now,
    });
    return { scope: input.scope, ...(item ? { item } : {}) };
  }

  const instructorId = options.instructorId;
  if (!instructorId || instructorId !== input.instructorId) {
    return { scope: input.scope };
  }

  const item = await buildParticipantInstructorAccessReadModel({
    firestore,
    actor: {
      kind: 'instructor',
      accountId: options.accountId,
      instructorId,
    },
    participantId: input.participantId,
    instructorId: input.instructorId,
    now,
  });
  return { scope: input.scope, ...(item ? { item } : {}) };
}
