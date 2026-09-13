import {
  evaluateParticipantManagementAccess,
  ManagedParticipantPickerItemSchema,
  type AccountId,
  type ManagedParticipantPickerItem,
  type Participant,
  type ParticipantManagement,
  type QueryManagedParticipantPickerReadModelsResult,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import {
  parseAccount,
  parseParticipant,
  parseParticipantManagement,
} from '../participantAccess/participantAccessStore';
import { createReadModelRequestContext } from './readModelRequestContext';

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
    ...(input.participant.avatarUrl === undefined ? {} : { avatarUrl: input.participant.avatarUrl }),
  });
  return parsed.success ? parsed.data : undefined;
}

/**
 * Managed-participant picker for the current Account.
 *
 * Active management is loaded with the shared request-context helper:
 * accountId + status == active, ordered by participantManagementId, paged to
 * completeness. PAGE_SIZE is a physical transport bound, not a domain maximum.
 * Visible picker order remains displayName localeCompare after retrieval.
 *
 * One malformed/stale management or Participant row is skipped; it does not
 * fail the request or hide unrelated valid rows.
 */
export async function queryManagedParticipantPickerReadModels(
  firestore: Firestore,
  accountId: AccountId
): Promise<QueryManagedParticipantPickerReadModelsResult> {
  const readContext = createReadModelRequestContext(firestore);
  const accountSnap = await readContext.account(accountId);
  const account = parseAccount(accountSnap.data() as Record<string, unknown> | undefined);
  if (!account || account.lifecycle.status !== 'active') {
    return { items: [] };
  }

  const managementDocs = await readContext.allActiveManagementForAccount(accountId);
  const managements: ParticipantManagement[] = [];
  for (const doc of managementDocs) {
    const parsed = parseParticipantManagement(doc.data() as Record<string, unknown> | undefined);
    if (parsed && parsed.status === 'active' && parsed.accountId === accountId) {
      managements.push(parsed);
    }
  }

  const participantSnaps = await readContext.loadParticipants(
    managements.map((management) => management.participantId)
  );
  const participantSnapById = new Map(
    participantSnaps.map((snapshot) => [snapshot.id, snapshot] as const)
  );

  const items: ManagedParticipantPickerItem[] = [];
  for (const management of managements) {
    const participantSnap = participantSnapById.get(management.participantId);
    if (!participantSnap) {
      continue;
    }
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
