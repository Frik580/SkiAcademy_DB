import { useCallback, useEffect, useRef, useState } from 'react';
import {
  compareCanonicalTimestamps,
  type AdminBookingChangeRequestDetailReadModel,
  type AdminBookingChangeRequestInboxItem,
  type BookingChangeRequestId,
} from '@ski-academy/shared-domain';
import { queryBookingChangeRequestReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import {
  classifyAdminIssueReadError,
  type AdminIssueReadErrorCode,
} from './useAdminIssueReadModels';

interface AttentionChangeRequestListState {
  readonly items: readonly AdminBookingChangeRequestInboxItem[];
  readonly loading: boolean;
  readonly error?: AdminIssueReadErrorCode;
}

interface AttentionChangeRequestDetailState {
  readonly item?: AdminBookingChangeRequestDetailReadModel;
  readonly loading: boolean;
  readonly error?: AdminIssueReadErrorCode;
}

const INITIAL_LIST_STATE: AttentionChangeRequestListState = {
  items: [],
  loading: true,
};

const INITIAL_DETAIL_STATE: AttentionChangeRequestDetailState = {
  loading: false,
};

export function mergeAdminChangeRequestInboxItems(
  cached: readonly AdminBookingChangeRequestInboxItem[],
  incoming: readonly AdminBookingChangeRequestInboxItem[]
): AdminBookingChangeRequestInboxItem[] {
  const byId = new Map(cached.map((item) => [item.requestId, item]));
  for (const item of incoming) {
    const existing = byId.get(item.requestId);
    if (!existing || item.revision >= existing.revision) {
      byId.set(item.requestId, item);
    }
  }
  return [...byId.values()].sort((left, right) => {
    const created = compareCanonicalTimestamps(left.createdAt, right.createdAt);
    return created === 0 ? left.requestId.localeCompare(right.requestId) : -created;
  });
}

export function useAdminAttentionChangeRequests(
  input: Readonly<{
    enabled: boolean;
    selectedRequestId?: BookingChangeRequestId;
  }>
) {
  const { enabled, selectedRequestId } = input;
  const listRequestGeneration = useRef(0);
  const detailRequestGeneration = useRef(0);
  const [list, setList] = useState<AttentionChangeRequestListState>(INITIAL_LIST_STATE);
  const [detail, setDetail] = useState<AttentionChangeRequestDetailState>(INITIAL_DETAIL_STATE);

  const loadList = useCallback(async () => {
    const generation = ++listRequestGeneration.current;
    if (!enabled) return;
    setList((current) => ({
      ...INITIAL_LIST_STATE,
      items: current.items,
      loading: true,
      error: undefined,
    }));
    try {
      const result = await queryBookingChangeRequestReadModels({ scope: 'admin_open' });
      if (listRequestGeneration.current !== generation || result.scope !== 'admin_open') {
        return;
      }
      setList({
        items: result.items,
        loading: false,
      });
    } catch (error) {
      if (listRequestGeneration.current !== generation) return;
      setList((current) => ({
        ...current,
        loading: false,
        error: classifyAdminIssueReadError(error),
      }));
    }
  }, [enabled]);

  const loadDetail = useCallback(async () => {
    const generation = ++detailRequestGeneration.current;
    if (!enabled || !selectedRequestId) {
      setDetail(INITIAL_DETAIL_STATE);
      return;
    }
    setDetail({ loading: true });
    try {
      const result = await queryBookingChangeRequestReadModels({
        scope: 'admin_detail',
        requestId: selectedRequestId,
      });
      if (detailRequestGeneration.current !== generation || result.scope !== 'admin_detail') {
        return;
      }
      setDetail({ item: result.item, loading: false });
    } catch (error) {
      if (detailRequestGeneration.current !== generation) return;
      setDetail({
        loading: false,
        error: classifyAdminIssueReadError(error),
      });
    }
  }, [enabled, selectedRequestId]);

  useEffect(() => {
    if (!enabled) {
      listRequestGeneration.current += 1;
      setList({ ...INITIAL_LIST_STATE, loading: false });
      return;
    }
    void loadList();
    return () => {
      listRequestGeneration.current += 1;
    };
  }, [enabled, loadList]);

  useEffect(() => {
    void loadDetail();
    return () => {
      detailRequestGeneration.current += 1;
    };
  }, [loadDetail]);

  return {
    list,
    detail,
    retryList: loadList,
    retryDetail: loadDetail,
  };
}
