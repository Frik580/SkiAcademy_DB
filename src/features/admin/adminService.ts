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
  toWalletLedgerEntry,
} from '../../infrastructure/firebase';
import {
  adjustSchoolGuestWallet,
  GUEST_WALLET_SETTINGS_COLLECTION,
  GUEST_WALLET_SETTINGS_DOC_ID,
  type GuestWalletAdjustDirection,
  WALLET_LEDGER_COLLECTION,
} from '../../domain/wallet';
import { OperationType, type ErrorLog, type WalletLedgerEntry } from '../../types';
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

export function subscribeWalletLedger(
  onEntries: (entries: WalletLedgerEntry[], hasMore: boolean) => void,
  onError: (error: Error) => void,
  pageSize: number = QUERY_LIMITS.walletLedger
): () => void {
  return onSnapshot(
    query(
      collection(db, WALLET_LEDGER_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(pageSize + 1)
    ),
    (snapshot) =>
      onEntries(
        snapshot.docs
          .slice(0, pageSize)
          .map((ledgerDoc) => toWalletLedgerEntry(ledgerDoc.id, ledgerDoc.data())),
        snapshot.docs.length > pageSize
      ),
    (error) => {
      handleFirestoreError(error, OperationType.LIST, WALLET_LEDGER_COLLECTION);
      onError(error);
    }
  );
}

export function subscribeGuestWalletBalance(
  onBalance: (balanceUsd: number) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(db, GUEST_WALLET_SETTINGS_COLLECTION, GUEST_WALLET_SETTINGS_DOC_ID),
    (snapshot) => {
      const balance = snapshot.exists() ? snapshot.data()?.balanceUSD : 0;
      onBalance(typeof balance === 'number' && Number.isFinite(balance) ? Math.max(0, balance) : 0);
    },
    (error) => {
      handleFirestoreError(
        error,
        OperationType.LIST,
        `${GUEST_WALLET_SETTINGS_COLLECTION}/${GUEST_WALLET_SETTINGS_DOC_ID}`
      );
      onError(error);
    }
  );
}

export async function adjustGuestWalletBalance(
  amount: number,
  direction: GuestWalletAdjustDirection,
  note?: string
): Promise<{ balanceAfter: number; delta: number }> {
  try {
    return await adjustSchoolGuestWallet(db, amount, direction, { note });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `${GUEST_WALLET_SETTINGS_COLLECTION}/${GUEST_WALLET_SETTINGS_DOC_ID}`
    );
    throw error;
  }
}
