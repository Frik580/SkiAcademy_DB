import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { TranslationKey } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import { CoursesManager } from '../../src/features/admin';

const queryAdminCourseReadModels = vi.fn();
const queryAdminCourseEnrollmentReadModels = vi.fn();

vi.mock('../../src/app/providers/LanguageContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/providers/LanguageContext')>();
  return {
    ...actual,
    useLanguage: () => ({
      t: (key: TranslationKey) => translations.en[key] ?? key,
      language: 'en' as const,
    }),
  };
});

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminCourseReadModels: (...args: unknown[]) => queryAdminCourseReadModels(...args),
  queryAdminCourseEnrollmentReadModels: (...args: unknown[]) =>
    queryAdminCourseEnrollmentReadModels(...args),
}));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: vi.fn(),
}));

const timestamp = { seconds: 1_800_000_000, nanoseconds: 0 };
const course = {
  courseId: 'course_admin_pagination_01',
  title: 'Pagination Camp',
  lifecycle: 'active',
  price: 100_000,
  capacity: { totalSeats: 8, availableSeats: 8, occupiedConfirmedSeats: 0 },
  revision: 1,
  scheduleRevision: 1,
  instructorRosterIds: [],
  instructors: [],
  courseDays: [],
  activeEnrollmentCount: 0,
  totalEnrollmentCount: 0,
  provisioning: { status: 'complete', fingerprint: 'a'.repeat(64) },
  catalogContent: { status: 'missing' },
  authorizedActions: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('CanonicalCoursesManager first-page budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryAdminCourseReadModels.mockResolvedValue({
      scope: 'admin_course_list',
      items: [course],
    });
    queryAdminCourseEnrollmentReadModels.mockResolvedValue({
      scope: 'admin_course_roster',
      items: [],
      hasMore: true,
      nextCursor: 'should-not-be-used',
    });
  });

  it('loads one course list page and does not auto-drain roster pages on mount', async () => {
    render(
      <CoursesManager
        currentAccountId="account_admin_pagination_01"
        instructors={[]}
        onRequestConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(queryAdminCourseReadModels).toHaveBeenCalledTimes(1);
    });
    expect(queryAdminCourseReadModels).toHaveBeenCalledWith({
      scope: 'admin_course_list',
      pageSize: 50,
    });
    expect(queryAdminCourseEnrollmentReadModels).not.toHaveBeenCalled();
  });
});
