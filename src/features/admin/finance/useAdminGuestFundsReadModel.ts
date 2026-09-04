import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AdminGuestFundsDiscoveryFilter,
  type AdminGuestFundsReadModel,
} from '@ski-academy/shared-domain';
import { queryAdminFinanceReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import {
  classifyAdminFinanceReadError,
  type AdminFinanceReadErrorCode,
} from '../components/finance/useAdminFinanceReadModels';

interface GuestFundsState {
  readonly item?: AdminGuestFundsReadModel;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error?: AdminFinanceReadErrorCode;
}

function mergeGuestFundsPages(
  current: AdminGuestFundsReadModel,
  incoming: AdminGuestFundsReadModel
): AdminGuestFundsReadModel {
  const seen = new Set(current.items.map((row) => row.rowId));
  const appended = incoming.items.filter((row) => !seen.has(row.rowId));
  return {
    filter: incoming.filter,
    items: [...current.items, ...appended],
    hasMore: incoming.hasMore,
    ...(incoming.nextCursor ? { nextCursor: incoming.nextCursor } : {}),
  };
}

export function useAdminGuestFundsReadModel(filter: AdminGuestFundsDiscoveryFilter) {
  const generationRef = useRef(0);
  const [state, setState] = useState<GuestFundsState>({
    loading: true,
    loadingMore: false,
  });

  const load = useCallback(
    async (cursor?: string, append = false) => {
      const generation = ++generationRef.current;
      setState((current) => ({
        ...(append ? current : {}),
        loading: !append,
        loadingMore: append,
        ...(append ? {} : { item: undefined, error: undefined }),
      }));
      try {
        const result = await queryAdminFinanceReadModels({
          scope: 'admin_guest_funds',
          filter,
          ...(cursor ? { cursor } : {}),
        });
        if (generationRef.current !== generation || result.scope !== 'admin_guest_funds') return;
        setState((current) => ({
          item:
            append && current.item
              ? mergeGuestFundsPages(current.item, result.item)
              : result.item,
          loading: false,
          loadingMore: false,
        }));
      } catch (error) {
        if (generationRef.current !== generation) return;
        setState((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          error: classifyAdminFinanceReadError(error),
        }));
      }
    },
    [filter]
  );

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  return {
    ...state,
    refetch: () => load(),
    loadMore: () =>
      state.item?.hasMore && state.item.nextCursor && !state.loadingMore
        ? load(state.item.nextCursor, true)
        : Promise.resolve(),
  };
}
