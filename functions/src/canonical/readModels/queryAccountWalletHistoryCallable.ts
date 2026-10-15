import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { AccountIdSchema } from '@ski-academy/shared-domain';
import { AccountWalletHistoryInputSchema } from '@ski-academy/shared-domain';
import { parseAccount } from '../finance/financeStore';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';
import { queryAccountWalletHistory } from './accountWalletHistoryReadModel';

export function createQueryAccountWalletHistoryHandler(firestore: Firestore) {
  return async (request: CallableRequest<Record<string, unknown>>) => {
    const identity = AccountIdSchema.safeParse(request.auth?.uid);
    if (!identity.success) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      AccountWalletHistoryInputSchema,
      request.data
    );
    const accountId = identity.data;
    const snapshot = await firestore.collection('users').doc(accountId).get();
    const account = parseAccount(snapshot.data());
    if (!account || account.lifecycle.status !== 'active') {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }
    try {
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          accountId,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
          requestedTestSessionId,
        }
      );
      return await queryAccountWalletHistory(firestore, accountId, readScope, input.cursor);
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
