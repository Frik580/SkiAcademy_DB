import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountWalletOperation } from '@ski-academy/shared-domain';
import { queryAccountWalletHistory } from '../../lib/canonical/canonicalReadModelClient';
import { useAuthStore } from '../auth/session';
import { useWalletStore } from './walletStore';

/** Mounted only on the wallet panel. Participant selection is deliberately absent. */
export function useAccountWalletHistory() {
  const accountId = useAuthStore((s) => s.firebaseUser?.uid);
  const eventRevision = useWalletStore((s) => s.canonicalWalletEventRevision);
  const generation = useRef(0);
  const busy = useRef(false);
  const [state, setState] = useState<{
    accountId?: string;
    operations: AccountWalletOperation[];
    cursor?: string;
    loading: boolean;
    error: boolean;
  }>({ operations: [], loading: true, error: false });

  const read = useCallback(
    async (cursor?: string) => {
      if (!accountId || busy.current) return;
      busy.current = true;
      const requestGeneration = generation.current;
      setState((s) => ({ ...s, loading: true, error: false }));
      try {
        const page = await queryAccountWalletHistory(cursor);
        if (requestGeneration !== generation.current) return;
        setState((s) => ({
          accountId,
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
          setState((s) => ({ ...s, loading: false, error: true }));
        }
      } finally {
        if (requestGeneration === generation.current) busy.current = false;
      }
    },
    [accountId]
  );

  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setState({ accountId, operations: [], loading: !!accountId, error: false });
    void read();
    return () => {
      generation.current += 1;
    };
  }, [accountId, eventRevision, read]);

  // Never expose a previous account's rows while the auth-change effect is pending.
  const visible =
    state.accountId === accountId
      ? state
      : {
          operations: [],
          loading: !!accountId,
          error: false,
          cursor: undefined,
        };
  return {
    ...visible,
    hasMore: !!visible.cursor,
    loadMore: () => void read(visible.cursor),
    retry: () => void read(visible.cursor),
  };
}
