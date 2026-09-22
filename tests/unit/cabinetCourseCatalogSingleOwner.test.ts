import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import {
  useCourseCatalogReadSync,
  useCourseEnrollmentReadSync,
} from '../../src/features/course-enrollments/useCourseEnrollmentReadSync';

const queryCourseCatalogReadModelsMock = vi.fn();
const queryCourseEnrollmentReadModelsMock = vi.fn();

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
    queryCourseCatalogReadModelsMock.mockResolvedValue({ scope: 'public', items: [] });
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

    expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledWith({ scope: 'public' });
  });

  it('uses the product catalogue for an authenticated principal and does not keep the public list', async () => {
    useAuthStore.setState({
      firebaseUser: { uid: 'account_test_actor' } as never,
      authLoading: false,
      authGeneration: 1,
    });
    queryCourseCatalogReadModelsMock.mockResolvedValue({ scope: 'product', items: [] });

    renderHook(() => useCourseCatalogReadSync(true));

    await waitFor(() => {
      expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledWith({ scope: 'product' });
    });
    expect(queryCourseCatalogReadModelsMock).not.toHaveBeenCalledWith({ scope: 'public' });
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
    expect(queryCourseCatalogReadModelsMock).toHaveBeenCalledWith({ scope: 'public' });
  });

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
