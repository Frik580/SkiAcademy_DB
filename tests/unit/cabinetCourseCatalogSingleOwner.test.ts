import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
