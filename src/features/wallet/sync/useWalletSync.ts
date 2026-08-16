import { useEffect } from 'react';
import { collection, db, limit, onSnapshot, query, where } from '../../../lib/firebase';
import { WalletLedgerEntry } from '../types';
import { QUERY_LIMITS } from '../../../lib/queryLimits';
import { logger } from '../../../lib/logger';
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

  // Wallet ledger synchronization
  useEffect(() => {
    if (!firebaseUser || !shouldSyncActivityLogs) {
      useWalletStore.getState().setWalletLedgerEntries([]);
      return;
    }

    const ledgerQuery = query(
      collection(db, 'wallet_ledger'),
      where('userId', '==', firebaseUser.uid),
      limit(QUERY_LIMITS.walletLedger)
    );

    return onSnapshot(
      ledgerQuery,
      (snapshot) => {
        const entries = snapshot.docs
          .map((ledgerDoc) => ({ id: ledgerDoc.id, ...ledgerDoc.data() }) as WalletLedgerEntry)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        useWalletStore.getState().setWalletLedgerEntries(entries);
      },
      (error) => logger.error('Wallet ledger sync error:', error)
    );
  }, [firebaseUser, shouldSyncActivityLogs]);
};
