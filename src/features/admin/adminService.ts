import {
  collection,
  db,
  functions,
  onSnapshot,
  limit,
  orderBy,
  query,
} from '../../infrastructure/firebase';
import { httpsCallable } from 'firebase/functions';
import { type ErrorLog } from '../../types';
import { QUERY_LIMITS } from '../../shared';
import { withAdministratorStepUp } from '../../lib/functions/administratorStepUp';

const ERROR_LOGS_COLLECTION = 'error_logs';

export async function revokeOwnAdministratorSessions(expectedUid: string): Promise<void> {
  const revoke = httpsCallable<{ expectedUid: string }, { revoked: boolean }>(
    functions,
    'revokeOwnAdministratorSessions'
  );
  const { data } = await withAdministratorStepUp(() => revoke({ expectedUid }));
  if (data.revoked !== true) throw new Error('Session revocation was not confirmed.');
}

export function subscribeErrorLogs(
  onLogs: (logs: ErrorLog[], hasMore: boolean) => void,
  onError: (error: Error) => void,
  pageSize: number = QUERY_LIMITS.errorLogs
): () => void {
  return onSnapshot(
    query(collection(db, ERROR_LOGS_COLLECTION), orderBy('timestamp', 'desc'), limit(pageSize + 1)),
    (snapshot) =>
      onLogs(
        snapshot.docs.slice(0, pageSize).map(
          (logDocument) =>
            ({
              ...logDocument.data(),
              id: logDocument.id,
            }) as ErrorLog
        ),
        snapshot.docs.length > pageSize
      ),
    (error) => {
      // Reporting failures of the log viewer back into error_logs can create a loop.
      onError(error);
    }
  );
}

export async function deleteErrorLog(logId: string): Promise<void> {
  const remove = httpsCallable<{ id: string; expectedAdministratorUid?: string }, { deleted: boolean }>(
    functions,
    'deleteErrorLog'
  );
  const result = await withAdministratorStepUp((expectedAdministratorUid) =>
    remove({ id: logId, ...(expectedAdministratorUid ? { expectedAdministratorUid } : {}) })
  );
  if (result.data.deleted !== true) throw new Error('Error log deletion was not confirmed.');
}

export interface ErrorLogCleanupResult {
  deleted: number;
  done: boolean;
  cursor: string | null;
}

export async function clearErrorLogs(cursor?: string): Promise<ErrorLogCleanupResult> {
  const clear = httpsCallable<{ cursor?: string; expectedAdministratorUid?: string }, ErrorLogCleanupResult>(
    functions,
    'clearErrorLogs'
  );
  const result = await withAdministratorStepUp((expectedAdministratorUid) =>
    clear({
      ...(cursor ? { cursor } : {}),
      ...(expectedAdministratorUid ? { expectedAdministratorUid } : {}),
    })
  );
  const data = result.data;
  if (
    !Number.isInteger(data.deleted) ||
    data.deleted < 0 ||
    typeof data.done !== 'boolean' ||
    (data.done ? data.cursor !== null : typeof data.cursor !== 'string' || !data.cursor)
  ) {
    throw new Error('Error log cleanup was not confirmed.');
  }
  return data;
}
