import { useCallback, useEffect, useRef, useState } from 'react';
import { queryAdminFinanceReadModels } from '../../../../lib/canonical/canonicalReadModelClient';
import { toFunctionsClientError } from '../../../../lib/functions/functionsClient';
import type {
  AdminFinanceAccountId,
  AdminFinancePaymentId,
  AdminPaymentView,
  AdminWalletView,
} from './financeContracts';
import type {
  AdminFinancialOverviewPeriod,
  AdminFinancialOverviewReadModel,
} from '@ski-academy/shared-domain';

export type AdminFinanceReadErrorCode = 'permission-denied' | 'read-failed';

export function classifyAdminFinanceReadError(error: unknown): AdminFinanceReadErrorCode {
  return toFunctionsClientError(error).code === 'functions/permission-denied'
    ? 'permission-denied'
    : 'read-failed';
}

interface ReadState<T> {
  readonly item?: T;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error?: AdminFinanceReadErrorCode;
}

function mergeWalletEvents(current: AdminWalletView, incoming: AdminWalletView): AdminWalletView {
  const byId = new Map(current.events.map((event) => [event.eventId, event]));
  for (const event of incoming.events) byId.set(event.eventId, event);
  return { ...incoming, events: [...byId.values()] };
}

export function mergeAdminPaymentEventPage(
  current: AdminPaymentView,
  incoming: AdminPaymentView
): AdminPaymentView {
  const byId = new Map(current.events.map((event) => [event.eventId, event]));
  for (const event of incoming.events) byId.set(event.eventId, event);
  return {
    ...incoming,
    providerState: current.providerState ?? incoming.providerState,
    events: [...byId.values()],
  };
}

export function useAdminWalletReadModel(accountId: AdminFinanceAccountId | undefined) {
  const generationRef = useRef(0);
  const [state, setState] = useState<ReadState<AdminWalletView>>({
    loading: false,
    loadingMore: false,
  });

  const load = useCallback(
    async (cursor?: string, append = false) => {
      const generation = ++generationRef.current;
      if (!accountId) {
        setState({ loading: false, loadingMore: false });
        return;
      }
      setState((current) => ({
        ...(append ? current : {}),
        loading: !append,
        loadingMore: append,
      }));
      try {
        const result = await queryAdminFinanceReadModels({
          scope: 'admin_wallet',
          accountId,
          ...(cursor ? { cursor } : {}),
        });
        if (generationRef.current !== generation || result.scope !== 'admin_wallet') return;
        setState((current) => ({
          item: append && current.item ? mergeWalletEvents(current.item, result.item) : result.item,
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
    [accountId]
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

export function useAdminPaymentReadModel(paymentId: AdminFinancePaymentId | undefined) {
  const generationRef = useRef(0);
  const [state, setState] = useState<ReadState<AdminPaymentView>>({
    loading: false,
    loadingMore: false,
  });

  const load = useCallback(
    async (cursor?: string, append = false) => {
      const generation = ++generationRef.current;
      if (!paymentId) {
        setState({ loading: false, loadingMore: false });
        return;
      }
      setState((current) => ({
        ...(append ? current : {}),
        loading: !append,
        loadingMore: append,
      }));
      try {
        const result = await queryAdminFinanceReadModels({
          scope: 'admin_payment_detail',
          paymentId,
          ...(cursor ? { cursor } : {}),
        });
        if (generationRef.current !== generation || result.scope !== 'admin_payment_detail') return;
        setState((current) => ({
          item:
            append && current.item && result.item
              ? mergeAdminPaymentEventPage(current.item, result.item)
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
    [paymentId]
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

export function useAdminFinancialOverviewReadModel(input: {
  readonly period: AdminFinancialOverviewPeriod;
  readonly localDate: string;
  readonly timeZone: string;
}) {
  const generationRef = useRef(0);
  const [state, setState] = useState<ReadState<AdminFinancialOverviewReadModel>>({
    loading: false,
    loadingMore: false,
  });

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setState({ loading: true, loadingMore: false });
    try {
      const result = await queryAdminFinanceReadModels({
        scope: 'admin_financial_overview',
        period: input.period,
        localDate: input.localDate,
        timeZone: input.timeZone,
      });
      if (generationRef.current !== generation || result.scope !== 'admin_financial_overview') {
        return;
      }
      setState({ item: result.item, loading: false, loadingMore: false });
    } catch (error) {
      if (generationRef.current !== generation) return;
      setState({
        loading: false,
        loadingMore: false,
        error: classifyAdminFinanceReadError(error),
      });
    }
  }, [input.localDate, input.period, input.timeZone]);

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  return { ...state, refetch: () => load() };
}
