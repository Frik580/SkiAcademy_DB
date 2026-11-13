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

const ERROR_LOGS_COLLECTION = 'error_logs';

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
  const result = await httpsCallable<{ id: string }, { deleted: boolean }>(
    functions,
    'deleteErrorLog'
  )({ id: logId });
  if (result.data.deleted !== true) throw new Error('Error log deletion was not confirmed.');
}

export interface ErrorLogCleanupResult {
  deleted: number;
  done: boolean;
  cursor: string | null;
}

export async function clearErrorLogs(cursor?: string): Promise<ErrorLogCleanupResult> {
  const result = await httpsCallable<{ cursor?: string }, ErrorLogCleanupResult>(
    functions,
    'clearErrorLogs'
  )(cursor ? { cursor } : {});
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
