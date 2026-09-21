import {
  TestSessionSchema,
  parsePersistedCanonicalScope,
  type CanonicalExecutionScope,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';

/** Resolves only trusted persisted scope. Inactive TEST sessions are not worker-eligible. */
export async function resolveWorkerExecutionScope(
  firestore: Firestore,
  source: unknown
): Promise<CanonicalExecutionScope | undefined> {
  const scope = parsePersistedCanonicalScope(source, { allowLegacyLive: true });
  if (scope.dataScope === 'live') return scope;

  const snapshot = await firestore.collection('test_sessions').doc(scope.testSessionId).get();
  if (!snapshot.exists) return undefined;
  const parsed = TestSessionSchema.safeParse(snapshot.data());
  if (!parsed.success || parsed.data.testSessionId !== scope.testSessionId) return undefined;
  return parsed.data.status === 'active' ? scope : undefined;
}
