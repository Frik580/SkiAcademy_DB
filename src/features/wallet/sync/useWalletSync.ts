import { useEffect } from 'react';
import { WalletSchema, normalizeFirestoreDocument, type Wallet } from '@ski-academy/shared-domain';
import {
  collection,
  db,
  doc,
  limit,
  onSnapshot,
  query,
  where,
} from '../../../infrastructure/firebase';
import { toWalletLedgerEntry } from '../../../infrastructure/firebase';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useWalletStore } from '../walletStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';

function parseCanonicalWallet(data: Record<string, unknown> | undefined): Wallet | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = WalletSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Synchronizes:
 * 1) Canonical Account Wallet balance from `/users/{accountId}/wallet/state`
 * 2) Legacy `wallet_ledger` history (still used by cabinet history UI)
 */
export const useWalletSync = () => {
  const { shouldSyncActivityLogs } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const walletLedgerPageSize = useWalletStore((s) => s.walletLedgerPageSize);

  useEffect(() => {
    useWalletStore.getState().resetWalletLedgerPagination();
  }, [firebaseUser?.uid, shouldSyncActivityLogs]);

  // Canonical wallet balance — source of truth for Header / spendable balance UI.
  useEffect(() => {
    if (!firebaseUser) {
      useWalletStore.getState().resetCanonicalWallet();
      return;
    }

    const walletRef = doc(db, 'users', firebaseUser.uid, 'wallet', 'state');
    return onSnapshot(
      walletRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          useWalletStore.getState().syncCanonicalWalletFromSnapshot({
            exists: false,
            balanceKzt: 0,
          });
          return;
        }

        const wallet = parseCanonicalWallet(snapshot.data() as Record<string, unknown>);
        if (!wallet) {
          logger.error('Canonical wallet document failed schema validation', {
            accountId: firebaseUser.uid,
          });
          useWalletStore.getState().syncCanonicalWalletFromSnapshot({
            exists: false,
            balanceKzt: 0,
          });
          return;
        }

        if (wallet.accountId !== firebaseUser.uid) {
          logger.error('Canonical wallet accountId mismatch; ignoring snapshot', {
            accountId: firebaseUser.uid,
            walletAccountId: wallet.accountId,
          });
          useWalletStore.getState().syncCanonicalWalletFromSnapshot({
            exists: false,
            balanceKzt: 0,
          });
          return;
        }

        useWalletStore.getState().syncCanonicalWalletFromSnapshot({
          exists: true,
          balanceKzt: wallet.balance,
        });
      },
      (error) => {
        logger.error('Canonical wallet sync error:', error);
        useWalletStore.getState().syncCanonicalWalletFromSnapshot({
          exists: false,
          balanceKzt: 0,
        });
      }
    );
  }, [firebaseUser]);

  // Wallet ledger synchronization (legacy history UI)
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
