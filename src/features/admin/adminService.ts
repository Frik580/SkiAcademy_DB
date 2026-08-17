import {
  collection,
  db,
  deleteDoc,
  doc,
  handleFirestoreError,
  onSnapshot,
  limit,
  orderBy,
  query,
  setDoc,
} from '../../infrastructure/firebase';
import { OperationType, type ErrorLog } from '../../types';
import { QUERY_LIMITS } from '../../shared';

const RESORT_CONFIG_COLLECTION = 'resort_data';
const RESORT_CONFIG_ID = 'config';
const ERROR_LOGS_COLLECTION = 'error_logs';

export function saveUsdToKztRate(rate: number): Promise<void> {
  return setDoc(
    doc(db, RESORT_CONFIG_COLLECTION, RESORT_CONFIG_ID),
    { usdToKztRate: rate },
    { merge: true }
  );
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
        snapshot.docs.slice(0, pageSize).map((logDocument) => logDocument.data() as ErrorLog),
        snapshot.docs.length > pageSize
      ),
    (error) => {
      handleFirestoreError(error, OperationType.LIST, ERROR_LOGS_COLLECTION);
      onError(error);
    }
  );
}

export async function deleteErrorLog(logId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, ERROR_LOGS_COLLECTION, logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${ERROR_LOGS_COLLECTION}/${logId}`);
    throw error;
  }
}

export function deleteErrorLogs(logIds: readonly string[]): Promise<void[]> {
  return Promise.all(logIds.map(deleteErrorLog));
}
