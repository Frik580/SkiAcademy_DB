import { useCallback, useEffect, useRef, useState } from 'react';
import {
  compareCanonicalTimestamps,
  type AdminIssueDetailReadModel,
  type AdminIssueId,
  type AdminIssueInboxItem,
  type AdminIssueReadScope,
  type AdminIssueSeverity,
} from '@ski-academy/shared-domain';
import { queryAdminIssueReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { toFunctionsClientError } from '../../../lib/functions/functionsClient';

export type AdminIssueReadErrorCode = 'permission-denied' | 'read-failed';

interface AdminIssueListState {
  readonly items: readonly AdminIssueInboxItem[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly error?: AdminIssueReadErrorCode;
}

interface AdminIssueDetailState {
  readonly item?: AdminIssueDetailReadModel;
  readonly loading: boolean;
  readonly error?: AdminIssueReadErrorCode;
}

const INITIAL_LIST_STATE: AdminIssueListState = {
  items: [],
  loading: true,
  loadingMore: false,
  hasMore: false,
};

const INITIAL_DETAIL_STATE: AdminIssueDetailState = {
  loading: false,
};

export function classifyAdminIssueReadError(error: unknown): AdminIssueReadErrorCode {
  return toFunctionsClientError(error).code === 'functions/permission-denied'
    ? 'permission-denied'
    : 'read-failed';
}

export function mergeAdminIssueInboxItems(
  cached: readonly AdminIssueInboxItem[],
  incoming: readonly AdminIssueInboxItem[]
): AdminIssueInboxItem[] {
  const byId = new Map(cached.map((item) => [item.issueId, item]));
  for (const item of incoming) {
    const existing = byId.get(item.issueId);
    if (!existing || item.revision >= existing.revision) {
      byId.set(item.issueId, item);
    }
  }
  return [...byId.values()].sort((left, right) => {
    const updated = compareCanonicalTimestamps(left.updatedAt, right.updatedAt);
    return updated === 0 ? left.issueId.localeCompare(right.issueId) : -updated;
  });
}

export function useAdminIssueReadModels(
  input: Readonly<{
    enabled: boolean;
    scope: Extract<AdminIssueReadScope, 'admin_open' | 'admin_history'>;
    severity?: AdminIssueSeverity;
    selectedIssueId?: AdminIssueId;
  }>
) {
  const { enabled, scope, severity, selectedIssueId } = input;
  const listRequestGeneration = useRef(0);
  const detailRequestGeneration = useRef(0);
  const [list, setList] = useState<AdminIssueListState>(INITIAL_LIST_STATE);
  const [detail, setDetail] = useState<AdminIssueDetailState>(INITIAL_DETAIL_STATE);

  const loadList = useCallback(
    async (cursor?: string, append = false) => {
      const generation = ++listRequestGeneration.current;
      if (!enabled) return;
      setList((current) => ({
        ...(append ? current : INITIAL_LIST_STATE),
        loading: !append,
        loadingMore: append,
        error: undefined,
      }));
      try {
        const result = await queryAdminIssueReadModels({
          scope,
          ...(severity === undefined ? {} : { severity }),
          ...(cursor ? { cursor } : {}),
        });
        if (listRequestGeneration.current !== generation || result.scope === 'admin_detail') {
          return;
        }
        setList((current) => ({
          items: append ? mergeAdminIssueInboxItems(current.items, result.items) : result.items,
          loading: false,
          loadingMore: false,
          hasMore: result.hasMore,
          ...(result.nextCursor === undefined ? {} : { cursor: result.nextCursor }),
        }));
      } catch (error) {
        if (listRequestGeneration.current !== generation) return;
        setList((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          error: classifyAdminIssueReadError(error),
        }));
      }
    },
    [enabled, scope, severity]
  );

  const loadDetail = useCallback(async () => {
    const generation = ++detailRequestGeneration.current;
    if (!enabled || !selectedIssueId) {
      setDetail(INITIAL_DETAIL_STATE);
      return;
    }
    setDetail({ loading: true });
    try {
      const result = await queryAdminIssueReadModels({
        scope: 'admin_detail',
        issueId: selectedIssueId,
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
  }, [enabled, selectedIssueId]);

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
    retryList: () => loadList(),
    retryDetail: loadDetail,
    loadMore: () =>
      list.hasMore && !list.loadingMore ? loadList(list.cursor, true) : Promise.resolve(),
  };
}
