import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookingId, LessonBookingReadModel } from '@ski-academy/shared-domain';
import { queryLessonBookingReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { toFunctionsClientError } from '../../../lib/functions/functionsClient';
import type {
  AdminLessonBookingDetailState,
  AdminLessonBookingListState,
  AdminLessonBookingReadError,
  AdminLessonBookingView,
} from './lessonBookingAdminContracts';
import { mergeAdminLessonBookingItems } from './lessonBookingAdminUtils';

const INITIAL_LIST: AdminLessonBookingListState = {
  items: [],
  loading: true,
  loadingMore: false,
  hasMore: false,
};

const INITIAL_DETAIL: AdminLessonBookingDetailState = { loading: false };

export function classifyAdminLessonBookingReadError(error: unknown): AdminLessonBookingReadError {
  return toFunctionsClientError(error).code === 'functions/permission-denied'
    ? 'permission-denied'
    : 'read-failed';
}

function replaceWithRevisionGuard(
  current: readonly LessonBookingReadModel[],
  incoming: readonly LessonBookingReadModel[]
): LessonBookingReadModel[] {
  const incomingIds = new Set(incoming.map((item) => item.bookingId));
  return mergeAdminLessonBookingItems(current, incoming).filter((item) =>
    incomingIds.has(item.bookingId)
  );
}

export function useAdminLessonBookingReadModels(input: {
  readonly enabled: boolean;
  readonly view: AdminLessonBookingView;
  readonly selectedBookingId?: BookingId;
}) {
  const { enabled, view, selectedBookingId } = input;
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const selectedBookingRef = useRef(selectedBookingId);
  selectedBookingRef.current = selectedBookingId;
  const [list, setList] = useState<AdminLessonBookingListState>(INITIAL_LIST);
  const [detail, setDetail] = useState<AdminLessonBookingDetailState>(INITIAL_DETAIL);

  const loadList = useCallback(
    async (cursor?: string, append = false) => {
      const generation = ++listGeneration.current;
      if (!enabled) return;
      setList((current) => ({
        ...(append ? current : INITIAL_LIST),
        loading: !append,
        loadingMore: append,
        error: undefined,
      }));
      try {
        const expectedScope = view === 'history' ? 'admin_history' : 'admin_hot';
        const result = await queryLessonBookingReadModels({
          scope: expectedScope,
          ...(cursor ? { cursor } : {}),
        });
        if (listGeneration.current !== generation || result.scope !== expectedScope) return;
        setList((current) => ({
          items: append
            ? mergeAdminLessonBookingItems(current.items, result.items)
            : replaceWithRevisionGuard(current.items, result.items),
          loading: false,
          loadingMore: false,
          hasMore: result.hasMore,
          ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
        }));
      } catch (error) {
        if (listGeneration.current !== generation) return;
        setList((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          error: classifyAdminLessonBookingReadError(error),
        }));
      }
    },
    [enabled, view]
  );

  const loadDetail = useCallback(
    async (bookingId = selectedBookingRef.current) => {
      const generation = ++detailGeneration.current;
      if (!enabled || !bookingId) {
        setDetail(INITIAL_DETAIL);
        return;
      }
      setDetail({ loading: true });
      try {
        const result = await queryLessonBookingReadModels({
          scope: 'admin_detail',
          bookingId,
        });
        if (
          detailGeneration.current !== generation ||
          selectedBookingRef.current !== bookingId ||
          result.scope !== 'admin_detail'
        ) {
          return;
        }
        const incoming = result.items[0];
        setDetail((current) => ({
          item:
            incoming && current.item?.bookingId === incoming.bookingId
              ? mergeAdminLessonBookingItems([current.item], [incoming])[0]
              : incoming,
          loading: false,
        }));
      } catch (error) {
        if (detailGeneration.current !== generation || selectedBookingRef.current !== bookingId) {
          return;
        }
        setDetail({
          loading: false,
          error: classifyAdminLessonBookingReadError(error),
        });
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) {
      listGeneration.current += 1;
      setList({ ...INITIAL_LIST, loading: false });
      return;
    }
    void loadList();
    return () => {
      listGeneration.current += 1;
    };
  }, [enabled, loadList]);

  useEffect(() => {
    void loadDetail(selectedBookingId);
    return () => {
      detailGeneration.current += 1;
    };
  }, [loadDetail, selectedBookingId]);

  const refreshBooking = useCallback(
    async (bookingId: BookingId) => {
      await Promise.all([
        loadList(),
        selectedBookingRef.current === bookingId ? loadDetail(bookingId) : Promise.resolve(),
      ]);
    },
    [loadDetail, loadList]
  );

  return {
    list,
    detail,
    retryList: () => loadList(),
    retryDetail: () => loadDetail(),
    loadMore: () =>
      list.hasMore && list.cursor && !list.loadingMore
        ? loadList(list.cursor, true)
        : Promise.resolve(),
    refreshBooking,
  };
}
