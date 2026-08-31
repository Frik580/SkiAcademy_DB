import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourseEnrollmentId, CourseId } from '@ski-academy/shared-domain';
import { queryAdminCourseEnrollmentReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import type {
  AdminCourseEnrollmentDetailState,
  AdminCourseEnrollmentListState,
  AdminCourseEnrollmentReadError,
  AdminCourseEnrollmentView,
} from './adminCourseEnrollmentContracts';
import { mergeAdminCourseEnrollmentItems } from './adminCourseEnrollmentUtils';

const EMPTY_LIST: AdminCourseEnrollmentListState = {
  items: [],
  loading: true,
  loadingMore: false,
  hasMore: false,
};

function readError(error: unknown): AdminCourseEnrollmentReadError {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  return code.includes('permission-denied') ? 'permission-denied' : 'read-failed';
}

function scopeForView(view: AdminCourseEnrollmentView) {
  if (view === 'pending_guest') return 'admin_pending_guest' as const;
  if (view === 'history') return 'admin_history' as const;
  return 'admin_course_roster' as const;
}

export function useAdminCourseEnrollmentReadModels(input: {
  readonly view: AdminCourseEnrollmentView;
  readonly courseId?: CourseId;
  readonly selectedEnrollmentId?: CourseEnrollmentId;
}) {
  const { view, courseId, selectedEnrollmentId } = input;
  const [list, setList] = useState<AdminCourseEnrollmentListState>(EMPTY_LIST);
  const [detail, setDetail] = useState<AdminCourseEnrollmentDetailState>({ loading: false });
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);

  const loadList = useCallback(
    async (cursor?: string, append = false) => {
      const generation = ++listGeneration.current;
      setList((current) => ({
        ...(append ? current : { ...EMPTY_LIST, items: [] }),
        loading: !append,
        loadingMore: append,
        error: undefined,
      }));
      try {
        const result = await queryAdminCourseEnrollmentReadModels({
          scope: scopeForView(view),
          ...(courseId ? { courseId } : {}),
          ...(cursor ? { cursor } : {}),
        });
        if (generation !== listGeneration.current) return;
        if (result.scope === 'admin_enrollment_detail') throw new Error('Unexpected detail result');
        setList((current) => ({
          items: append
            ? mergeAdminCourseEnrollmentItems(current.items, result.items)
            : result.items,
          loading: false,
          loadingMore: false,
          hasMore: result.hasMore,
          ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
        }));
      } catch (error) {
        if (generation !== listGeneration.current) return;
        setList((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          error: readError(error),
        }));
      }
    },
    [courseId, view]
  );

  const loadDetail = useCallback(async (enrollmentId: CourseEnrollmentId) => {
    const generation = ++detailGeneration.current;
    setDetail({ loading: true });
    try {
      const result = await queryAdminCourseEnrollmentReadModels({
        scope: 'admin_enrollment_detail',
        enrollmentId,
      });
      if (generation !== detailGeneration.current) return;
      if (result.scope !== 'admin_enrollment_detail') throw new Error('Unexpected list result');
      setDetail({ loading: false, ...(result.item ? { item: result.item } : {}) });
    } catch (error) {
      if (generation !== detailGeneration.current) return;
      setDetail({ loading: false, error: readError(error) });
    }
  }, []);

  useEffect(() => {
    void loadList();
    return () => {
      listGeneration.current += 1;
    };
  }, [loadList]);

  useEffect(() => {
    if (!selectedEnrollmentId) {
      detailGeneration.current += 1;
      setDetail({ loading: false });
      return;
    }
    void loadDetail(selectedEnrollmentId);
    return () => {
      detailGeneration.current += 1;
    };
  }, [loadDetail, selectedEnrollmentId]);

  const refreshEnrollment = useCallback(
    async (enrollmentId: CourseEnrollmentId) => {
      const result = await queryAdminCourseEnrollmentReadModels({
        scope: 'admin_enrollment_detail',
        enrollmentId,
      });
      if (result.scope !== 'admin_enrollment_detail') throw new Error('Unexpected list result');
      if (result.item) {
        if (selectedEnrollmentId === enrollmentId) {
          setDetail({ loading: false, item: result.item });
        }
      }
    },
    [selectedEnrollmentId]
  );

  return {
    list,
    detail,
    retryList: () => loadList(),
    retryDetail: selectedEnrollmentId ? () => loadDetail(selectedEnrollmentId) : undefined,
    loadMore: list.cursor ? () => loadList(list.cursor, true) : undefined,
    refreshList: () => loadList(),
    refreshEnrollment,
  };
}
