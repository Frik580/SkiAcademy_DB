import {
  AccountIdSchema,
  ParticipantManagementSchema,
  emptyParticipantAchievementsReadModel,
  evaluateParticipantManagementAccess,
  type AccountId,
  type ParticipantId,
  type ParticipantAchievementsReadModel,
  type QueryParticipantAchievementsReadModelsInput,
  type QueryParticipantAchievementsReadModelsResult,
  ParticipantAchievementsReadModelSchema,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import {
  parseAccount,
  parseParticipant,
  parseParticipantManagement,
} from '../participantAccess/participantAccessStore';
import { parseParticipantAchievements } from '../achievements/participantAchievementsStore';

const MANAGED_PARTICIPANTS_LIMIT = 50;

function toReadModel(
  participantId: ParticipantId,
  data: Record<string, unknown> | undefined
): ParticipantAchievementsReadModel {
  const achievements = parseParticipantAchievements(data);
  if (!achievements || achievements.participantId !== participantId) {
    return emptyParticipantAchievementsReadModel(participantId);
  }
  return ParticipantAchievementsReadModelSchema.parse({
    participantId: achievements.participantId,
    earned: achievements.earned,
    revision: achievements.revision,
    updatedAt: achievements.updatedAt,
    ...(achievements.updatedBy ? { updatedBy: achievements.updatedBy } : {}),
  });
}

async function loadAchievementDocs(
  firestore: Firestore,
  participantIds: readonly ParticipantId[]
): Promise<Map<string, Record<string, unknown> | undefined>> {
  const byId = new Map<string, Record<string, unknown> | undefined>();
  if (participantIds.length === 0) return byId;
  const snapshots = await firestore.getAll(
    ...participantIds.map((participantId) =>
      firestore.collection('participant_achievements').doc(participantId)
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

export class ParticipantAchievementsReadDeniedError extends Error {
  constructor() {
    super('This action is not permitted.');
    this.name = 'ParticipantAchievementsReadDeniedError';
  }
}

export async function queryParticipantAchievementsReadModels(
  firestore: Firestore,
  input: QueryParticipantAchievementsReadModelsInput,
  options: Readonly<{ accountId: AccountId }>
): Promise<QueryParticipantAchievementsReadModelsResult> {
  const managedIds = await loadManagedParticipantIds(firestore, options.accountId);
  const requested = input.participantIds ?? [...managedIds];
  const uniqueRequested = [...new Set(requested)];
  const managedSet = new Set(managedIds);
  if (uniqueRequested.some((participantId) => !managedSet.has(participantId))) {
    throw new ParticipantAchievementsReadDeniedError();
  }
  await assertManagedAccess(firestore, options.accountId, uniqueRequested);
  const docs = await loadAchievementDocs(firestore, uniqueRequested);
  return {
    scope: 'managed',
    items: uniqueRequested.map((participantId) =>
      toReadModel(participantId, docs.get(participantId))
    ),
  };
}

export function parseAchievementsReadAccountId(authUid: string | undefined): AccountId | undefined {
  const parsed = AccountIdSchema.safeParse(authUid);
  return parsed.success ? parsed.data : undefined;
}
