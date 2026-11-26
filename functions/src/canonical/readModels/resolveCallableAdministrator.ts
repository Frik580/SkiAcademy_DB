import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { AccountIdSchema, type ReadModelAdministratorActor } from '@ski-academy/shared-domain';
import { isAdministratorProfile } from '../commands/resolveCallableAccountContext';
import { readCallableAccountProfile } from './resolveCallableInstructorId';
import { requireActiveAccount } from '../../security/activeAccount';
import { requireAdministratorAccountSessionPolicy } from '../../security/administratorSession';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';

export async function resolveCallableAdministratorActor(
  firestore: Firestore,
  authUid: string | undefined,
  readContext: ReadModelRequestContext = createReadModelRequestContext(firestore),
  liveToken?: DecodedIdToken | null
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
  requireActiveAccount(accountId.data, profileData);
  if (!isAdministratorProfile(profile)) {
    throw new HttpsError('permission-denied', 'This action is not permitted.');
  }
  if (liveToken !== undefined && readContext.readScope.dataScope === 'live') {
    requireAdministratorAccountSessionPolicy(profileData, liveToken ?? undefined);
  }
  // LIVE administrative surfaces must not ignore a registered TEST identity.
  if (
    readContext.readScope.dataScope === 'live' &&
    (await firestore.collection('test_actors').doc(accountId.data).get()).exists
  ) {
    throw new HttpsError('permission-denied', 'TEST actors cannot enter LIVE administration.', {
      code: 'TEST_ACTOR_REQUEST_FORBIDDEN',
    });
  }

  return {
    kind: 'administrator',
    accountId: accountId.data,
  };
}
