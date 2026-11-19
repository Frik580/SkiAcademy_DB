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
  const accountId = useAuthStore((s) => s.firebaseUser?.uid);
  const authGeneration = useAuthStore((s) => s.authGeneration);
  const refreshNonce = useWalletStore((s) => s.canonicalWalletRefreshNonce);

  // Canonical wallet balance — source of truth for Header / spendable balance UI.
  useEffect(() => {
    if (useWalletStore.getState().canonicalWalletAccountId !== (accountId ?? null)) {
      useWalletStore.getState().resetCanonicalWallet();
    }
    if (!accountId) return;

    const walletRef = doc(db, 'users', accountId, 'wallet', 'state');
    let active = true;
    const isCurrentSession = () =>
      active &&
      useAuthStore.getState().authGeneration === authGeneration &&
      useAuthStore.getState().firebaseUser?.uid === accountId &&
      useWalletStore.getState().canonicalWalletRefreshNonce === refreshNonce;
    const fail = () => {
      useWalletStore.setState({
        canonicalWalletAccountId: accountId,
        canonicalWalletTrusted: false,
        canonicalWalletError: true,
      });
    };
    const unsubscribe = onSnapshot(
      walletRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!isCurrentSession()) return;
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          useWalletStore.setState({ canonicalWalletTrusted: false });
          return;
        }
        if (!snapshot.exists()) {
          useWalletStore.getState().syncCanonicalWalletFromSnapshot({
            exists: false,
            accountId,
            trusted: true,
            balanceKzt: 0,
          });
          return;
        }

        const wallet = parseCanonicalWallet(snapshot.data() as Record<string, unknown>);
        if (!wallet) {
          logger.error('Canonical wallet document failed schema validation', {
            accountId,
          });
          fail();
          return;
        }

        if (wallet.accountId !== accountId) {
          logger.error('Canonical wallet accountId mismatch; ignoring snapshot', {
            accountId,
            walletAccountId: wallet.accountId,
          });
          fail();
          return;
        }

        useWalletStore.getState().syncCanonicalWalletFromSnapshot({
          accountId,
          trusted: true,
          exists: true,
          balanceKzt: wallet.balance,
          eventRevision: wallet.eventRevision,
        });
      },
      (error) => {
        if (!isCurrentSession()) return;
        logger.error('Canonical wallet sync error:', error);
        fail();
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountId, authGeneration, refreshNonce]);
};
