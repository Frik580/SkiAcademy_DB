import {
  evaluateParticipantManagementAccess,
  ManagedParticipantPickerItemSchema,
  ParticipantManagementSchema,
  type AccountId,
  type ManagedParticipantPickerItem,
  type Participant,
  type ParticipantManagement,
  type QueryManagedParticipantPickerReadModelsResult,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import { parseAccount, parseParticipant } from '../participantAccess/participantAccessStore';

function toManagedParticipantPickerItem(input: {
  readonly participant: Participant;
  readonly management: ParticipantManagement;
}): ManagedParticipantPickerItem | undefined {
  if (input.participant.lifecycle.status !== 'active') {
    return undefined;
  }
  if (input.participant.management.kind !== 'managed') {
    return undefined;
  }
  if (input.management.status !== 'active') {
    return undefined;
  }

  const parsed = ManagedParticipantPickerItemSchema.safeParse({
    participantId: input.participant.participantId,
    participantManagementId: input.management.participantManagementId,
    displayName: input.participant.displayName,
    discipline: input.participant.discipline,
    skillLevel: input.participant.skillLevel,
    age: input.participant.age,
    authority: input.management.authority,
    revision: input.participant.revision,
    ...(input.participant.instructorComment === undefined
      ? {}
      : { instructorComment: input.participant.instructorComment }),
  });
  return parsed.success ? parsed.data : undefined;
}

export async function queryManagedParticipantPickerReadModels(
  firestore: Firestore,
  accountId: AccountId
): Promise<QueryManagedParticipantPickerReadModelsResult> {
  const accountSnap = await firestore.collection('users').doc(accountId).get();
  const account = parseAccount(accountSnap.data() as Record<string, unknown> | undefined);
  if (!account || account.lifecycle.status !== 'active') {
    return { items: [] };
  }

  const managementSnap = await firestore
    .collection('participant_management')
    .where('accountId', '==', accountId)
    .limit(50)
    .get();

  const items: ManagedParticipantPickerItem[] = [];
  for (const doc of managementSnap.docs) {
    const parsedManagement = ParticipantManagementSchema.safeParse(doc.data());
    if (!parsedManagement.success || parsedManagement.data.status !== 'active') {
      continue;
    }
    const management = parsedManagement.data;

    const participantSnap = await firestore
      .collection('participants')
      .doc(management.participantId)
      .get();
    const participant = parseParticipant(
      participantSnap.data() as Record<string, unknown> | undefined
    );
    if (!participant) {
      continue;
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
      continue;
    }

    const item = toManagedParticipantPickerItem({ participant, management });
    if (item) {
      items.push(item);
    }
  }

  items.sort((left, right) => left.displayName.localeCompare(right.displayName));
  return { items };
}
