import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { AccountIdSchema, type ReadModelAdministratorActor } from '@ski-academy/shared-domain';
import { isAdministratorProfile } from '../commands/resolveCallableAccountContext';
import { readCallableAccountProfile } from './resolveCallableInstructorId';
import { parseAccount } from '../participantAccess/participantAccessStore';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';

export async function resolveCallableAdministratorActor(
  firestore: Firestore,
  authUid: string | undefined,
  readContext: ReadModelRequestContext = createReadModelRequestContext(firestore)
): Promise<ReadModelAdministratorActor> {
  if (!authUid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const accountId = AccountIdSchema.safeParse(authUid);
  if (!accountId.success) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const profileSnapshot = await readContext.account(accountId.data);
  const profileData = profileSnapshot.data() as Record<string, unknown> | undefined;
  const profile = readCallableAccountProfile(profileData);
  const account = parseAccount(profileData);
  if (
    !isAdministratorProfile(profile) ||
    !account ||
    account.lifecycle.status !== 'active'
  ) {
    throw new HttpsError('permission-denied', 'This action is not permitted.');
  }

  return {
    kind: 'administrator',
    accountId: accountId.data,
  };
}
