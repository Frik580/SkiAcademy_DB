import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { AccountIdSchema, type ReadModelAdministratorActor } from '@ski-academy/shared-domain';
import { isAdministratorProfile } from '../commands/resolveCallableAccountContext';
import { readCallableAccountProfile } from './resolveCallableInstructorId';

export async function resolveCallableAdministratorActor(
  firestore: Firestore,
  authUid: string | undefined
): Promise<ReadModelAdministratorActor> {
  if (!authUid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const accountId = AccountIdSchema.safeParse(authUid);
  if (!accountId.success) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const profileSnapshot = await firestore.collection('users').doc(authUid).get();
  const profile = readCallableAccountProfile(
    profileSnapshot.data() as Record<string, unknown> | undefined
  );
  if (!isAdministratorProfile(profile)) {
    throw new HttpsError('permission-denied', 'This action is not permitted.');
  }

  return {
    kind: 'administrator',
    accountId: accountId.data,
  };
}
