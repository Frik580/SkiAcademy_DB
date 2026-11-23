import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import {
  useCourseCatalogReadSync,
  useCourseEnrollmentReadSync,
} from '../../src/features/course-enrollments/useCourseEnrollmentReadSync';

const queryCourseCatalogReadModelsMock = vi.fn();
const queryCourseEnrollmentReadModelsMock = vi.fn();
const catalogPage = { scopeKey: 'live', next: null, revisions: [null, null] };

vi.mock('../../src/infrastructure/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/infrastructure/firebase')>()),
  onSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseCatalogReadModels: (...args: unknown[]) => queryCourseCatalogReadModelsMock(...args),
  queryCourseEnrollmentReadModels: (...args: unknown[]) =>
    queryCourseEnrollmentReadModelsMock(...args),
}));

describe('cabinet public course catalog single owner', () => {
  beforeEach(() => {
    useAuthStore.setState({ firebaseUser: null, authLoading: false, authGeneration: 0 });
    useCourseEnrollmentStore.getState().reset();
    queryCourseCatalogReadModelsMock.mockReset();
    queryCourseEnrollmentReadModelsMock.mockReset();
    queryCourseCatalogReadModelsMock.mockResolvedValue({ scope: 'public', items: [], page: catalogPage });
    queryCourseEnrollmentReadModelsMock.mockImplementation(async (input: { scope: string }) => ({
      scope: input.scope,
      items: [],
      hasMore: false,
    }));
  });

  it('issues exactly one public catalog callable on cabinet-like dual sync mount', async () => {
    renderHook(() => {
      useCourseEnrollmentReadSync(true, 'account_cabinet_fixture');
      useCourseCatalogReadSync(true);
    });

    await waitFor(() => {
      expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledTimes(1);
    });

    expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledWith({ scope: 'public', page: {} });
  });

  it('uses the product catalogue for an authenticated principal and does not keep the public list', async () => {
    useAuthStore.setState({
      firebaseUser: { uid: 'account_test_actor' } as never,
      authLoading: false,
      authGeneration: 1,
    });
    queryCourseCatalogReadModelsMock.mockResolvedValue({ scope: 'product', items: [], page: catalogPage });

    renderHook(() => useCourseCatalogReadSync(true));

    await waitFor(() => {
      expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledWith({ scope: 'product', page: {} });
    });
    expect(queryCourseCatalogReadModelsMock).not.toHaveBeenCalledWith({ scope: 'public', page: {} });
  });

  it('reloadCatalog from enrollment sync issues one catalog request', async () => {
    const { result } = renderHook(() => {
      useCourseCatalogReadSync(true);
      return useCourseEnrollmentReadSync(true, 'account_cabinet_fixture');
    });

    await waitFor(() => {
      expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledTimes(1);
    });

    queryCourseCatalogReadModelsMock.mockClear();
    await result.current.reloadCatalog();
    expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledTimes(1);
    expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledWith({ scope: 'public', page: {} });
  });

  it.each([null, { uid: 'account_test_actor' }])(
    'separates failure and retry from enrollment errors (%j)',
    async (firebaseUser) => {
      useAuthStore.setState({ firebaseUser: firebaseUser as never });
      queryCourseCatalogReadModelsMock.mockRejectedValueOnce(new Error('permission-denied'));
      const { result } = renderHook(() => useCourseCatalogReadSync(true));
      await waitFor(() => expect(useCourseEnrollmentStore.getState().catalogStatus).toBe('error'));
      expect(useCourseEnrollmentStore.getState().error).toBeUndefined();
      let resolve!: (value: unknown) => void;
      queryCourseCatalogReadModelsMock.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      let retry!: Promise<void>;
      act(() => {
        retry = result.current.reloadCatalog();
        void result.current.reloadCatalog();
        void result.current.reloadCatalog();
      });
      expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledTimes(2);
      expect(useCourseEnrollmentStore.getState().catalogStatus).toBe('loading');
      await act(async () => {
        resolve({ items: [], page: catalogPage });
        await retry;
      });
      expect(useCourseEnrollmentStore.getState().catalogStatus).toBe('ready');
      expect(useCourseEnrollmentStore.getState().catalogLoading).toBe(false);
    }
  );

  it.each(['resolve', 'reject'])(
    'ignores a late public %s after the product read starts',
    async (outcome) => {
      let resolveOld!: (value: unknown) => void;
      let rejectOld!: (error: Error) => void;
      queryCourseCatalogReadModelsMock.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveOld = resolve;
            rejectOld = reject;
          })
      );
      renderHook(() => useCourseCatalogReadSync(true));
      expect(useCourseEnrollmentStore.getState().catalogStatus).toBe('loading');
      let resolveNew!: (value: unknown) => void;
      queryCourseCatalogReadModelsMock.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveNew = done;
          })
      );
      act(() =>
        useAuthStore.setState({ firebaseUser: { uid: 'account_new' } as never, authGeneration: 1 })
      );
      await act(async () => {
        if (outcome === 'resolve') resolveOld({ items: [], page: catalogPage });
        else rejectOld(new Error('old request failed'));
      });
      expect(useCourseEnrollmentStore.getState().catalogStatus).toBe('loading');
      expect(useCourseEnrollmentStore.getState().catalogLoading).toBe(true);
      await act(async () => resolveNew({ items: [], page: catalogPage }));
      expect(useCourseEnrollmentStore.getState().catalogStatus).toBe('ready');
    }
  );

  it('loads account enrollments with selectedParticipantId and skips account-wide reads', async () => {
    renderHook(() => {
      useCourseEnrollmentReadSync(true, 'account_cabinet_fixture', 'participant_child_a');
    });

    await waitFor(() => {
      expect(queryCourseEnrollmentReadModelsMock).toHaveBeenCalled();
    });

    expect(queryCourseEnrollmentReadModelsMock).toHaveBeenCalledWith({
      scope: 'account_hot',
      selectedParticipantId: 'participant_child_a',
    });
    expect(
      queryCourseEnrollmentReadModelsMock.mock.calls.every(
        (call) => call[0]?.selectedParticipantId === 'participant_child_a'
      )
    ).toBe(true);
  });

  it('does not issue account-wide enrollment reads without a selected participant', async () => {
    renderHook(() => {
      useCourseEnrollmentReadSync(true, 'account_cabinet_fixture');
    });

    await waitFor(() => {
      expect(useCourseEnrollmentStore.getState().scopedParticipantId).toBeUndefined();
    });
    expect(queryCourseEnrollmentReadModelsMock).not.toHaveBeenCalled();
  });
});
