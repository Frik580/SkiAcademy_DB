import {
  evaluateParticipantInstructorAccessAuthorizedActions,
  evaluateParticipantManagementAccess,
  instructorRelationshipIdFromPair,
  participantBlockIdFromDirection,
  sanitizeParticipantBlockReasonForReadModel,
  type Account,
  type AccountId,
  type InstructorId,
  type Participant,
  type ParticipantBlock,
  type ParticipantInstructorAccessReadModel,
  type ParticipantManagement,
  type QueryParticipantInstructorAccessReadModelsInput,
  type QueryParticipantInstructorAccessReadModelsResult,
  timestampFromDate,
  type CanonicalTimestamp,
  type ReadModelAccountManagerActor,
  type ReadModelInstructorActor,
  LIVE_CANONICAL_READ_SCOPE,
  type CanonicalReadScope,
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
} from '../participantAccess/participantAccessStore';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';

/**
 * Preserved account_manager authorization semantics (T32.9R.A2):
 *
 * Previously via loadLessonBookingReadAuthorizationContext + evaluateParticipantManagementAccess:
 * - account must exist and be lifecycle-active (evaluator: account_inactive / unauthorized)
 * - target management must be status === 'active' for this accountId + participantId
 * - participant must exist, be lifecycle-active, management.kind === 'managed',
 *   and participant.management.participantManagementId must match the active management
 * - ended/history management rows never authorize (loader filtered status === 'active';
 *   evaluator also requires status === 'active')
 * - authority/role come from the matched active management document
 * - unauthorized / missing target returns { scope } with no item (optional item)
 *
 * Management has no expiresAt field; relationship expiry is handled in the builder projection.
 */

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

type PreloadedAccessEntities = Readonly<{
  account?: Account;
  participant?: Participant;
  management?: ParticipantManagement;
}>;

async function loadTargetedAccountManagerAuthorization(
  firestore: Firestore,
  accountId: AccountId,
  participantId: QueryParticipantInstructorAccessReadModelsInput['participantId'],
  readContext: ReadModelRequestContext
): Promise<
  | Readonly<{
      allowed: true;
      account: Account;
      participant: Participant;
      management: ParticipantManagement;
    }>
  | Readonly<{ allowed: false }>
> {
  const accountSnap = await readContext.account(accountId);
  const account = parseAccount(accountSnap.data() as Record<string, unknown> | undefined);
  if (!account) {
    return { allowed: false };
  }

  // Narrowest safe lookup matching evaluator: only active rows authorize.
  // Filtering status in the query avoids the prior limit(50) starvation risk where
  // ended/history rows could crowd out the active target management.
  const managementSnap = await firestore
    .collection('participant_management')
    .where('accountId', '==', accountId)
    .where('participantId', '==', participantId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  // The query is bound to the authenticated Account and requested Participant;
  // the topology evaluator below checks the active management pointer.
  const management = parseParticipantManagement(managementSnap.docs[0]?.data());
  if (
    !management ||
    management.status !== 'active' ||
    management.accountId !== accountId ||
    management.participantId !== participantId
  ) {
    return { allowed: false };
  }

  const participantSnap = await readContext.participant(participantId);
  const participant = parseParticipant(
    participantSnap.data() as Record<string, unknown> | undefined
  );
  if (!participant) {
    return { allowed: false };
  }

  const topology = buildParticipantAccessTopology({
    account,
    participant,
    management,
  });
  const access = evaluateParticipantManagementAccess(topology, {
    accountId,
    participantId,
  });
  if (!access.allowed) {
    return { allowed: false };
  }

  return { allowed: true, account, participant, management };
}

async function buildParticipantInstructorAccessReadModel(input: Readonly<{
  firestore: Firestore;
  actor: ReadModelAccountManagerActor | ReadModelInstructorActor;
  participantId: QueryParticipantInstructorAccessReadModelsInput['participantId'];
  instructorId: InstructorId;
  now: CanonicalTimestamp;
  readContext: ReadModelRequestContext;
  preloaded?: PreloadedAccessEntities;
}>): Promise<ParticipantInstructorAccessReadModel | undefined> {
  const participant =
    input.preloaded?.participant ??
    parseParticipant(
      (await input.readContext.participant(input.participantId)).data() as
        | Record<string, unknown>
        | undefined
    );
  if (!participant) {
    return undefined;
  }

  const instructorSnap = await input.readContext.instructor(input.instructorId);
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

  // Relationship + both block docs remain required for authorizedActions / projection.
  // Parallelize only after instructor existence is confirmed so missing-instructor
  // still early-exits without extra pair reads.
  const [relationshipSnap, managerBlockSnap, instructorBlockSnap] = await Promise.all([
    input.firestore.doc(instructorRelationshipPath(relationshipId)).get(),
    input.readContext.participantBlock(managerBlockId),
    input.readContext.participantBlock(instructorBlockId),
  ]);
  // This relationship is intentionally unscoped. Its deterministic pair and
  // the scoped Participant/Instructor above establish the read boundary.
  const parsedRelationship = parseInstructorRelationship(relationshipSnap.data());
  const relationship =
    parsedRelationship?.participantId === input.participantId &&
    parsedRelationship.instructorId === input.instructorId
      ? parsedRelationship
      : undefined;
  const parsedManagerBlock = parseParticipantBlock(
    managerBlockSnap.data() as Record<string, unknown> | undefined
  );
  const managerBlock =
    parsedManagerBlock?.participantBlockId === managerBlockId &&
    parsedManagerBlock.participantId === input.participantId &&
    parsedManagerBlock.instructorId === input.instructorId
      ? parsedManagerBlock
      : undefined;
  const parsedInstructorBlock = parseParticipantBlock(
    instructorBlockSnap.data() as Record<string, unknown> | undefined
  );
  const instructorBlock =
    parsedInstructorBlock?.participantBlockId === instructorBlockId &&
    parsedInstructorBlock.participantId === input.participantId &&
    parsedInstructorBlock.instructorId === input.instructorId
      ? parsedInstructorBlock
      : undefined;

  let account = input.preloaded?.account;
  let management = input.preloaded?.management;
  if (input.actor.kind === 'account_manager') {
    if (!account) {
      const accountSnap = await input.readContext.account(input.actor.accountId);
      account = parseAccount(accountSnap.data() as Record<string, unknown> | undefined);
    }
    if (!management) {
      const managementSnap = await input.readContext.participantManagement(
        input.actor.participantManagementId
      );
      management = parseParticipantManagement(
        managementSnap.data() as Record<string, unknown> | undefined
      );
    }
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
            validFrom: relationship.validFrom,
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
    readonly readContext?: ReadModelRequestContext;
    readonly readScope?: CanonicalReadScope;
  }
): Promise<QueryParticipantInstructorAccessReadModelsResult> {
  const now = timestampFromDate(options.now ?? new Date());
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const readContext = options.readContext ?? createReadModelRequestContext(firestore, { readScope });

  if (input.scope === 'account_manager') {
    const auth = await loadTargetedAccountManagerAuthorization(
      firestore,
      options.accountId,
      input.participantId,
      readContext
    );
    if (!auth.allowed) {
      return { scope: input.scope };
    }

    const item = await buildParticipantInstructorAccessReadModel({
      firestore,
      actor: {
        kind: 'account_manager',
        accountId: options.accountId,
        participantManagementId: auth.management.participantManagementId,
        authority: auth.management.authority,
      },
      participantId: input.participantId,
      instructorId: input.instructorId,
      now,
      readContext,
      preloaded: {
        account: auth.account,
        participant: auth.participant,
        management: auth.management,
      },
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
    readContext,
  });
  return { scope: input.scope, ...(item ? { item } : {}) };
}
