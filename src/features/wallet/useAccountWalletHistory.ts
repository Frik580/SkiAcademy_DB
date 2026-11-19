import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountWalletOperation } from '@ski-academy/shared-domain';
import { queryAccountWalletHistory } from '../../lib/canonical/canonicalReadModelClient';
import { useAuthStore } from '../auth/session';
import { useWalletStore } from './walletStore';

/** Mounted only on the wallet panel. Participant selection is deliberately absent. */
export function useAccountWalletHistory() {
  const accountId = useAuthStore((s) => s.firebaseUser?.uid);
  const authGeneration = useAuthStore((s) => s.authGeneration);
  const eventRevision = useWalletStore((s) => s.canonicalWalletEventRevision);
  const generation = useRef(0);
  const busy = useRef(false);
  const [state, setState] = useState<{
    accountId?: string;
    authGeneration: number;
    operations: AccountWalletOperation[];
    cursor?: string;
    loading: boolean;
    error: boolean;
    failedCursor?: string;
  }>({ authGeneration, operations: [], loading: Boolean(accountId), error: false });

  const read = useCallback(
    async (cursor?: string) => {
      if (!accountId || busy.current) return;
      busy.current = true;
      const requestGeneration = generation.current;
      setState((s) =>
        s.accountId === accountId && s.authGeneration === authGeneration
          ? { ...s, loading: true, error: false, failedCursor: undefined }
          : { accountId, authGeneration, operations: [], loading: true, error: false }
      );
      try {
        const page = await queryAccountWalletHistory(cursor);
        if (requestGeneration !== generation.current) return;
        setState((s) => ({
          accountId,
          authGeneration,
          operations: [
            ...new Map(
              [...(cursor ? s.operations : []), ...page.operations].map((item) => [item.id, item])
            ).values(),
          ],
          cursor: page.nextCursor,
          loading: false,
          error: false,
        }));
      } catch {
        if (requestGeneration === generation.current) {
          setState((s) => ({ ...s, loading: false, error: true, failedCursor: cursor }));
        }
      } finally {
        if (requestGeneration === generation.current) busy.current = false;
      }
    },
    [accountId, authGeneration]
  );

  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    void read();
    return () => {
      generation.current += 1;
    };
  }, [accountId, eventRevision, read]);

  // Never expose a previous account's rows while the auth-change effect is pending.
  const visible =
    state.accountId === accountId && state.authGeneration === authGeneration
      ? state
      : {
          operations: [],
          loading: !!accountId,
          error: false,
          cursor: undefined,
          failedCursor: undefined,
        };
  return {
    ...visible,
    hasMore: !!visible.cursor,
    loadMore: () => {
      if (visible.cursor) void read(visible.cursor);
    },
    retry: () => void read(visible.failedCursor),
  };
}
