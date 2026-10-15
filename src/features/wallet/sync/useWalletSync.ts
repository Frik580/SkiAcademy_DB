import { useEffect } from 'react';
import { WalletSchema } from '@ski-academy/shared-domain/canonical/paymentWallet';
import { normalizeFirestoreDocument } from '@ski-academy/shared-domain/canonical/firestoreSerialization';
import { type Wallet } from '@ski-academy/shared-domain';
import { db, doc, onSnapshot } from '../../../infrastructure/firebase';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useWalletStore } from '../walletStore';

function parseCanonicalWallet(data: Record<string, unknown> | undefined): Wallet | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = WalletSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Synchronizes canonical Account Wallet balance. History is read lazily by the
 * wallet panel through the owner-scoped server read model.
 */
export const useWalletSync = () => {
  const firebaseUser = useAuthStore((s) => s.firebaseUser);

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
          eventRevision: wallet.eventRevision,
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
};
