import { useEffect } from 'react';
import { collection, db, limit, onSnapshot, query, where } from '../../../infrastructure/firebase';
import { toWalletLedgerEntry } from '../../../infrastructure/firebase';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useWalletStore } from '../walletStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';

/**
 * Synchronizes wallet ledger entries (transaction history) from Firestore.
 * This hook subscribes to wallet_ledger collection for the current user.
 */
export const useWalletSync = () => {
  const { shouldSyncActivityLogs } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const walletLedgerPageSize = useWalletStore((s) => s.walletLedgerPageSize);

  useEffect(() => {
    useWalletStore.getState().resetWalletLedgerPagination();
  }, [firebaseUser?.uid, shouldSyncActivityLogs]);

  // Wallet ledger synchronization
  useEffect(() => {
    if (!firebaseUser || !shouldSyncActivityLogs) {
      useWalletStore.getState().setWalletLedgerEntries([]);
      return;
    }

    const ledgerQuery = query(
      collection(db, 'wallet_ledger'),
      where('userId', '==', firebaseUser.uid),
      limit(walletLedgerPageSize + 1)
    );

    return onSnapshot(
      ledgerQuery,
      (snapshot) => {
        const entries = snapshot.docs
          .slice(0, walletLedgerPageSize)
          .map((ledgerDoc) => toWalletLedgerEntry(ledgerDoc.id, ledgerDoc.data()))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        useWalletStore.getState().setWalletLedgerEntries(entries);
        useWalletStore
          .getState()
          .setWalletLedgerHasMore(snapshot.docs.length > walletLedgerPageSize);
      },
      (error) => logger.error('Wallet ledger sync error:', error)
    );
  }, [firebaseUser, shouldSyncActivityLogs, walletLedgerPageSize]);
};
