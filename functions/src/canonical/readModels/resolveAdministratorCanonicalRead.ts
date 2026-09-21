import type { Firestore } from 'firebase-admin/firestore';
import {
  type CanonicalReadScope,
  type ReadModelAdministratorActor,
} from '@ski-academy/shared-domain';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { createReadModelRequestContext, type ReadModelRequestContext } from './readModelRequestContext';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export async function resolveAdministratorCanonicalRead(
  firestore: Firestore,
  authUid: string | undefined,
  requestedTestSessionId?: unknown
): Promise<{
  readonly actor: ReadModelAdministratorActor;
  readonly readScope: CanonicalReadScope;
  readonly readContext: ReadModelRequestContext;
}> {
  const liveContext = createReadModelRequestContext(firestore);
  const actor = await resolveCallableAdministratorActor(firestore, authUid, liveContext);
  const readScope = await resolveCanonicalReadScope(
    createFirestoreCanonicalExecutionScopeStore(firestore),
    {
      accountId: actor.accountId,
      accountLifecycleStatus: 'active',
      isAdministrator: true,
      requestedTestSessionId,
    }
  );
  return {
    actor,
    readScope,
    readContext:
      readScope.dataScope === 'live'
        ? liveContext
        : createReadModelRequestContext(firestore, { readScope }),
  };
}
