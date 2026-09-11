import {
  AccountIdSchema,
  InstructorIdSchema,
  ParticipantManagementSchema,
  emptyParticipantProgressReadModel,
  evaluateInstructorParticipantAccess,
  evaluateParticipantManagementAccess,
  instructorRelationshipIdFromPair,
  participantBlockIdFromDirection,
  timestampFromDate,
  type AccountId,
  type InstructorId,
  type Participant,
  type ParticipantBlock,
  type ParticipantId,
  type ParticipantProgressReadModel,
  type QueryParticipantProgressReadModelsInput,
  type QueryParticipantProgressReadModelsResult,
  ParticipantProgressReadModelSchema,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { loadInstructorProgressBookingScopedEvidence } from '../progress/participantProgressAuthorization';
import {
  buildParticipantAccessTopology,
} from '../participantAccess/participantAccessAuthorization';
import {
  instructorRelationshipPath,
  parseAccount,
  parseInstructorRelationship,
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
} from '../participantAccess/participantAccessStore';
import { parseParticipantProgress } from '../progress/participantProgressStore';

const MANAGED_PARTICIPANTS_LIMIT = 50;

function toReadModel(
  participantId: ParticipantId,
  data: Record<string, unknown> | undefined
): ParticipantProgressReadModel {
  const progress = parseParticipantProgress(data);
  if (!progress || progress.participantId !== participantId) {
    return emptyParticipantProgressReadModel(participantId);
  }
  return ParticipantProgressReadModelSchema.parse({
    participantId: progress.participantId,
    level: progress.level,
    skillScores: progress.skillScores,
    skillComments: progress.skillComments,
    revision: progress.revision,
    updatedAt: progress.updatedAt,
    ...(progress.updatedBy ? { updatedBy: progress.updatedBy } : {}),
  });
}

async function loadProgressDocs(
  firestore: Firestore,
  participantIds: readonly ParticipantId[]
): Promise<Map<string, Record<string, unknown> | undefined>> {
  const byId = new Map<string, Record<string, unknown> | undefined>();
  if (participantIds.length === 0) return byId;
  const snapshots = await firestore.getAll(
    ...participantIds.map((participantId) =>
      firestore.collection('participant_progress').doc(participantId)
    )
  );
  snapshots.forEach((snapshot, index) => {
    const participantId = participantIds[index]!;
    byId.set(
      participantId,
      snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined
    );
  });
  return byId;
}

async function loadManagedParticipantIds(
  firestore: Firestore,
  accountId: AccountId
): Promise<readonly ParticipantId[]> {
  const accountSnap = await firestore.collection('users').doc(accountId).get();
  const account = parseAccount(accountSnap.data() as Record<string, unknown> | undefined);
  if (!account || account.lifecycle.status !== 'active') {
    return [];
  }

  const managementSnap = await firestore
    .collection('participant_management')
    .where('accountId', '==', accountId)
    .limit(MANAGED_PARTICIPANTS_LIMIT)
    .get();

  const ids: ParticipantId[] = [];
  for (const doc of managementSnap.docs) {
    const parsed = ParticipantManagementSchema.safeParse(doc.data());
    if (!parsed.success || parsed.data.status !== 'active') continue;
    if (parsed.data.accountId !== accountId) continue;
    ids.push(parsed.data.participantId);
  }
  return ids;
}

async function assertManagedAccess(
  firestore: Firestore,
  accountId: AccountId,
  participantIds: readonly ParticipantId[]
): Promise<void> {
  if (participantIds.length === 0) return;
  const accountSnap = await firestore.collection('users').doc(accountId).get();
  const account = parseAccount(accountSnap.data() as Record<string, unknown> | undefined);
  if (!account || account.lifecycle.status !== 'active') {
    throw Object.assign(new Error('This action is not permitted.'), { code: 'permission-denied' });
  }

  const participantSnaps = await firestore.getAll(
    ...participantIds.map((participantId) => firestore.collection('participants').doc(participantId))
  );

  for (let index = 0; index < participantIds.length; index += 1) {
    const participant = parseParticipant(
      participantSnaps[index]?.data() as Record<string, unknown> | undefined
    );
    if (!participant || participant.management.kind !== 'managed') {
      throw Object.assign(new Error('This action is not permitted.'), { code: 'permission-denied' });
    }
    const managementSnap = await firestore
      .collection('participant_management')
      .doc(participant.management.participantManagementId)
      .get();
    const management = parseParticipantManagement(
      managementSnap.data() as Record<string, unknown> | undefined
    );
    if (!management || management.status !== 'active') {
      throw Object.assign(new Error('This action is not permitted.'), { code: 'permission-denied' });
    }
    const topology = buildParticipantAccessTopology({
      account,
      participant,
      management,
    });
    const access = evaluateParticipantManagementAccess(topology, {
      accountId,
      participantId: participant.participantId,
    });
    if (!access.allowed) {
      throw Object.assign(new Error('This action is not permitted.'), { code: 'permission-denied' });
    }
  }
}

async function instructorHasProgressAccess(
  firestore: Firestore,
  instructorId: InstructorId,
  participant: Participant,
  at: ReturnType<typeof timestampFromDate>
): Promise<boolean> {
  const relationshipId = instructorRelationshipIdFromPair({
    participantId: participant.participantId,
    instructorId,
  });
  const relationshipSnap = await firestore.doc(instructorRelationshipPath(relationshipId)).get();
  const instructorRelationship = parseInstructorRelationship(
    relationshipSnap.data() as Record<string, unknown> | undefined
  );
  const managerBlockId = participantBlockIdFromDirection({
    participantId: participant.participantId,
    instructorId,
    createdByKind: 'participant_manager',
  });
  const instructorBlockId = participantBlockIdFromDirection({
    participantId: participant.participantId,
    instructorId,
    createdByKind: 'instructor',
  });
  const [managerBlockSnap, instructorBlockSnap] = await Promise.all([
    firestore.doc(participantBlockPath(managerBlockId)).get(),
    firestore.doc(participantBlockPath(instructorBlockId)).get(),
  ]);
  const participantBlocks = [
    parseParticipantBlock(managerBlockSnap.data() as Record<string, unknown> | undefined),
    parseParticipantBlock(instructorBlockSnap.data() as Record<string, unknown> | undefined),
  ].filter((block): block is ParticipantBlock => block !== undefined);

  let management;
  if (participant.management.kind === 'managed') {
    management = parseParticipantManagement(
      (
        await firestore
          .collection('participant_management')
          .doc(participant.management.participantManagementId)
          .get()
      ).data() as Record<string, unknown> | undefined
    );
  }

  const topology = buildParticipantAccessTopology({
    participant,
    management,
    instructorRelationship,
    additionalBlocks: participantBlocks,
  });
  const relationshipAccess = evaluateInstructorParticipantAccess(topology, {
    instructorId,
    participantId: participant.participantId,
    at,
    bookingScopedEvidence: [],
  });
  if (relationshipAccess.allowed) return true;

  const bookingScopedEvidence = await loadInstructorProgressBookingScopedEvidence(firestore, {
    instructorId,
    participantId: participant.participantId,
    at,
  });
  const access = evaluateInstructorParticipantAccess(topology, {
    instructorId,
    participantId: participant.participantId,
    at,
    bookingScopedEvidence,
  });
  return access.allowed;
}

export class ParticipantProgressReadDeniedError extends Error {
  constructor() {
    super('This action is not permitted.');
    this.name = 'ParticipantProgressReadDeniedError';
  }
}

export async function queryParticipantProgressReadModels(
  firestore: Firestore,
  input: QueryParticipantProgressReadModelsInput,
  options: Readonly<{
    accountId: AccountId;
    instructorId?: InstructorId;
  }>
): Promise<QueryParticipantProgressReadModelsResult> {
  if (input.scope === 'managed') {
    const managedIds = await loadManagedParticipantIds(firestore, options.accountId);
    const requested = input.participantIds ?? [...managedIds];
    const uniqueRequested = [...new Set(requested)];
    const managedSet = new Set(managedIds);
    if (uniqueRequested.some((participantId) => !managedSet.has(participantId))) {
      throw new ParticipantProgressReadDeniedError();
    }
    await assertManagedAccess(firestore, options.accountId, uniqueRequested);
    const docs = await loadProgressDocs(firestore, uniqueRequested);
    return {
      scope: 'managed',
      items: uniqueRequested.map((participantId) =>
        toReadModel(participantId, docs.get(participantId))
      ),
    };
  }

  const instructorId = options.instructorId;
  if (!instructorId) {
    throw new ParticipantProgressReadDeniedError();
  }
  const uniqueRequested = [...new Set(input.participantIds)];
  const participantSnaps = await firestore.getAll(
    ...uniqueRequested.map((participantId) => firestore.collection('participants').doc(participantId))
  );
  const at = timestampFromDate(new Date());
  const authorized: ParticipantId[] = [];
  for (let index = 0; index < uniqueRequested.length; index += 1) {
    const participant = parseParticipant(
      participantSnaps[index]?.data() as Record<string, unknown> | undefined
    );
    if (!participant || participant.lifecycle.status !== 'active') continue;
    if (await instructorHasProgressAccess(firestore, instructorId, participant, at)) {
      authorized.push(participant.participantId);
    }
  }
  if (authorized.length === 0) {
    throw new ParticipantProgressReadDeniedError();
  }
  const docs = await loadProgressDocs(firestore, authorized);
  return {
    scope: 'instructor',
    items: authorized.map((participantId) => toReadModel(participantId, docs.get(participantId))),
  };
}

export function parseProgressReadAccountId(authUid: string | undefined): AccountId | undefined {
  const parsed = AccountIdSchema.safeParse(authUid);
  return parsed.success ? parsed.data : undefined;
}

export function parseProgressReadInstructorId(value: string | undefined): InstructorId | undefined {
  const parsed = InstructorIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
